(function (root) {
  'use strict';

  // Rendering only. The caller owns audio time, input, judgement and score.
  const dirs = ['left', 'down', 'up', 'right'];
  const heads = ['purple0000', 'blue0000', 'green0000', 'red0000'];
  const idle = ['arrowLEFT0000', 'arrowDOWN0000', 'arrowUP0000', 'arrowRIGHT0000'];
  const pieces = ['purple_hold_piece0000', 'blue_hold_piece0000', 'green_hold_piece0000', 'red_hold_piece0000'];
  const ends = ['pruple_end_hold0000', 'blue_hold_end0000', 'green_hold_end0000', 'red_hold_end0000'];
  const keys = [...heads, ...idle, ...pieces, ...ends, 'icon-joucho', 'icon-sekai'];
  for (const dir of dirs) {
    keys.push(dir + '_press0000');
    for (let f = 0; f < 4; f++) keys.push(dir + '_confirm000' + f);
  }
  const images = Object.create(null);
  const extraImages = Object.create(null), splashColors = ['purple', 'blue', 'green', 'red'];
  const laneColors = ['#bd73e9', '#45d9fa', '#a7ef30', '#fc568e'];
  let extraManifest = null, extraBase = '', manifestPromise = null;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
  const defaults = {
    width: 1920, height: 1080, spriteScale: .75, scrollSpeed: 900,
    noteClipBottom: 800, lateNoteSeconds: .24, downscroll: false,
    barX: 390, barY: 958, barW: 1140, barH: 26,
    iconSize: 150, iconY: 935,
    colors: ['#69c9ef', '#b091df'], stroke: '#090c13',
    dangerThreshold: .30, advantageThreshold: .60,
    showHeader: false, showFooterShade: true,
    splashScale: 1.1, splashFps: 24, showCounters: true,
    // Measured on the full current chart at 60fps; display only, never scoring.
    autoVisualHealthGain: 1.4209100371420946
  };
  let settings = { ...defaults }, chart = {}, ready = false;

  function configure(options = {}) {
    if (options.chart) chart = options.chart;
    if (options.config) settings = { ...defaults, ...settings, ...options.config };
    return api;
  }

  async function load(base = 'assets/ui/') {
    base = base.replace(/\/+$/, '') + '/';
    extraBase = base.replace(/ui\/$/, 'extra/');
    if (!root.FNF_EXTRA_ASSETS) {
      if (!manifestPromise) manifestPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = extraBase + 'manifest.js'; script.onload = resolve;
        script.onerror = () => reject(new Error('Additional UI manifest failed to load'));
        document.head.appendChild(script);
      }).catch(error => { manifestPromise = null; throw error; });
      await manifestPromise;
    }
    extraManifest = root.FNF_EXTRA_ASSETS;
    if (!extraManifest) throw new Error('Additional UI manifest is missing');
    await WebArt.load('hud');
    for(const key of keys)images[key]=WebArt.surface('ui/'+key);
    const files=new Set(Object.values(extraManifest.images));
    for(const file of files)extraImages[file]=WebArt.surface('extra/'+file);
    ready = true;
    return api;
  }

  let splashLoad=null;
  function warmSplashes(){
    if(!splashLoad)splashLoad=WebArt.load('splashes').then(()=>{
      for(const {file} of extraManifest.splash_frames)extraImages[file]=WebArt.surface('extra/'+file);
    }).catch(()=>{splashLoad=null;});
    return splashLoad;
  }

  function text(ctx, value, x, y, font, color, align = 'left', outline = true) {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.textBaseline = settings.downscroll ? 'bottom' : 'top';
    ctx.lineJoin = 'round';
    if (outline) { ctx.lineWidth = 5; ctx.strokeStyle = '#090b13'; ctx.strokeText(String(value), x, y); }
    ctx.fillStyle = color;
    ctx.fillText(String(value), x, y);
  }

  function sprite(ctx, key, x, y, scale = settings.spriteScale) {
    const im = images[key];
    if (!im) return;
    ctx.drawImage(im, x - im.width * scale / 2, y - im.height * scale / 2, im.width * scale, im.height * scale);
  }

  const stageHeight = 1080;
  function screenY(y) { return settings.downscroll ? stageHeight - y : y; }

  function upscrollPosition(side, lane) {
    const im = images[idle[lane]];
    const w = im ? im.width : (lane === 0 || lane === 3 ? 152 : 168);
    const h = im ? im.height : (lane === 0 || lane === 3 ? 168 : 152);
    return { x: (92 + side * 640 + lane * 112 + w * .25) * 1.5, y: (50 + h * .25) * 1.5 };
  }
  function lanePosition(side, lane) {
    const pos = upscrollPosition(side, lane);
    pos.y = screenY(pos.y);
    return pos;
  }

  function getNoteState(state, note) {
    const table = state.noteStates;
    let ns = table && (typeof table.get === 'function' ? table.get(note.id) : table[note.id]);
    if (typeof ns === 'string') ns = { judgement: ns, judged: true };
    if (ns === true) ns = { judged: true, judgement: 'sick' };
    if (!ns && state.hitIds && state.hitIds.has && state.hitIds.has(note.id)) ns = { judged: true, judgement: 'sick' };
    return ns || {};
  }

  function isSuccess(ns) {
    return !!(ns.judged || ns.hit || ns.judgement) && !['miss', 'ghost', 'drop'].includes(ns.judgement);
  }

  const iconState = share => share <= settings.dangerThreshold ? 2 : share >= settings.advantageThreshold ? 1 : 0;

  function displayHealth(state = {}) {
    const sourceHealth = clamp(finite(state.health, .5), 0, 1);
    const health = state.auto === true
      ? clamp(.5 + (sourceHealth - .5) * settings.autoVisualHealthGain, .1, .9)
      : sourceHealth;
    const icons = state.auto === true ? [iconState(health), iconState(1-health)]
      : state.iconStates || [iconState(health), iconState(1-health)];
    return { health, sourceHealth, iconStates: icons,
      autoVisualHealthGain: state.auto === true ? settings.autoVisualHealthGain : 1 };
  }
  function extraSprite(ctx, name, x, y, scale) {
    const file = extraManifest && extraManifest.images[name], im = file && extraImages[file];
    if (!im) return false;
    ctx.drawImage(im, x - im.width * scale / 2, y - im.height * scale / 2, im.width * scale, im.height * scale);
    return true;
  }

  function comboSprites(ctx, value, x, y, scale = .25) {
    const digits = String(Math.max(0, Math.floor(value))).padStart(3, '0').split('');
    const sprites = digits.map(d => extraImages[extraManifest.images['num' + d]]);
    if (sprites.some(im => !im)) return;
    const widths = sprites.map(im => im.width * scale), total = widths.reduce((a,b) => a+b, 0) + (digits.length - 1) * 2;
    let left = x - total / 2;
    for (let i = 0; i < sprites.length; i++) {
      const im = sprites[i]; ctx.drawImage(im, left, y - im.height * scale / 2, widths[i], im.height * scale); left += widths[i] + 2;
    }
  }

  function stableVariant(id) {
    let hash = 2166136261;
    for (const ch of String(id)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
    return (hash >>> 0) % 2 + 1;
  }

  function holdGlow(ctx, pos, lane, strength, age = null) {
    ctx.save();
    const radius = age === null ? 48 : 22 + age * 210;
    if (age === null) {
      const glow = ctx.createRadialGradient(pos.x, pos.y, 8, pos.x, pos.y, radius);
      glow.addColorStop(0, laneColors[lane] + 'a0'); glow.addColorStop(1, laneColors[lane] + '00');
      ctx.globalAlpha = strength; ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI*2); ctx.fill();
    } else {
      ctx.globalAlpha = strength; ctx.strokeStyle = laneColors[lane]; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(pos.x, pos.y, radius, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawHud(ctx, t, state) {
    const c = settings, colors = c.colors, display = displayHealth(state);
    const health = display.health;
    const seam = c.barX + health * c.barW;
    const barY = c.downscroll ? screenY(c.barY + c.barH) : c.barY;
    if (c.showFooterShade && state.showFooterShade !== false) {
      const shade = ctx.createLinearGradient(0, screenY(880), 0, screenY(stageHeight));
      shade.addColorStop(0, '#080b1200'); shade.addColorStop(.46, '#080b1270'); shade.addColorStop(1, '#080b12d9');
      ctx.fillStyle = shade; ctx.fillRect(0, c.downscroll ? 0 : 880, 1920, 200);
    }
    ctx.fillStyle = c.stroke; ctx.fillRect(c.barX - 5, barY - 5, c.barW + 10, c.barH + 10);
    ctx.fillStyle = colors[0]; ctx.fillRect(c.barX, barY, seam - c.barX, c.barH);
    ctx.fillStyle = colors[1]; ctx.fillRect(seam, barY, c.barX + c.barW - seam, c.barH);
    ctx.fillStyle = '#ffffff41'; ctx.fillRect(c.barX, barY, c.barW, 4);
    ctx.fillStyle = '#121721'; ctx.fillRect(seam - 1.5, barY, 3, c.barH);
    const bpm = finite(state.bpm, finite(chart.bpm, 128));
    const origin = finite(state.beatOrigin, finite(chart.beatOrigin, 1.0625));
    const phase = (((t - origin) / (60 / bpm)) % 1 + 1) % 1;
    const bop = Math.exp(-phase * 11), size = c.iconSize * (1 + .065 * bop);
    const iy = screenY(c.iconY - 5 * bop);
    const icons = display.iconStates;
    for (let side = 0; side < 2; side++) {
      const im = images[side ? 'icon-sekai' : 'icon-joucho'];
      const cx = seam + (side ? 67 : -67), frame = clamp(Math.floor(finite(icons[side], 0)), 0, 2);
      if (im) ctx.drawImage(im, frame * 150, 0, 150, 150, cx - size / 2, iy - size / 2, size, size);
      const align = side ? 'right' : 'left', x = side ? c.barX + c.barW : c.barX;
      const combo = Math.floor(finite(state.combo && state.combo[side], 0));
      const score = Math.floor(finite(state.scores && state.scores[side], 0));
      const accuracy = finite(state.accuracy && state.accuracy[side], 100);
      const number = (score < 0 ? '-' : '') + String(Math.abs(score)).padStart(6, '0');
      if (c.showCounters && (side === 1 || state.auto || state.practice)) text(ctx, `SCORE ${number}   COMBO ${String(combo).padStart(3, '0')}   ACC ${accuracy.toFixed(2)}%`, x, screenY(1016), 'bold 18px Arial, sans-serif', '#c6d1df', align);
      const p = state.pop && state.pop[side];
      if (!p) continue;
      const age = finite(p.age, t - finite(p.t, -1000));
      const codes = ['', 'sick', 'good', 'bad', 'shit'];
      const kind = String(p.kind || p.judgement || codes[p.code] || '').toLowerCase().replace('!', '');
      if (age < 0 || age >= .34 || !['sick', 'good', 'bad', 'shit'].includes(kind)) continue;
      ctx.save();
      ctx.globalAlpha = clamp((.34 - age) / .10, 0, 1);
      const px = side ? 1440 : 480, rise = age * 26;
      const labelY = c.downscroll ? screenY(860 - rise) : 815 - rise;
      extraSprite(ctx, kind, px, labelY, .36 * (1 + .10 * Math.exp(-age * 22)));
      comboSprites(ctx, combo, px, labelY + 45);
      ctx.restore();
    }
    return display;
  }

  function draw(ctx, time, chartEvents, state = {}, width = ctx.canvas.width, height = ctx.canvas.height) {
    const t = Math.max(0, finite(time, 0));
    const events = Array.isArray(chartEvents) ? chartEvents : (chartEvents && chartEvents.events) || chart.events || [];
    if (!Array.isArray(chartEvents) && chartEvents && chartEvents.events) chart = chartEvents;
    const c = settings, speed = finite(state.scrollSpeed, c.scrollSpeed), scale = c.spriteScale;
    const autoSides = state.autoSides || [state.auto === true, state.auto === true];
    const lanes = [[], []];
    for (let side = 0; side < 2; side++) for (let lane = 0; lane < 4; lane++) {
      const fromCaller = (state.laneStates && state.laneStates[side] && state.laneStates[side][lane]) || {};
      lanes[side][lane] = {
        pressed: !!fromCaller.pressed, held: !!fromCaller.held,
        confirmAt: finite(fromCaller.confirmAt, finite(fromCaller.lastConfirmAt, -1000))
      };
    }
    // Automatic receptors are enabled explicitly by the caller per side.
    for (const n of events) if (autoSides[n.side]) {
      const dt = t - n.hit, lane = lanes[n.side] && lanes[n.side][n.lane];
      if (!lane || dt < 0) continue;
      if (dt < .19) lane.confirmAt = Math.max(lane.confirmAt, n.hit);
      if (n.hold > 0 && dt < n.hold) lane.held = true;
    }

    ctx.save();
    ctx.scale(width / 1920, height / 1080);
    ctx.imageSmoothingEnabled = true;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, c.downscroll ? stageHeight - c.noteClipBottom : 0, 1920, c.noteClipBottom); ctx.clip();
    for (let side = 0; side < 2; side++) for (let lane = 0; lane < 4; lane++) {
      const pos = lanePosition(side, lane);
      sprite(ctx, idle[lane], pos.x, pos.y);
    }

    let sustainDrawn = 0, notesDrawn = 0, splashesDrawn = 0, holdEndDrawn = 0, activeHoldGlows = 0;
    // Sustain graphics carry a direction: flip both the strip and its rounded tip.
    // Arrow glyphs, confirmation bursts and all HUD lettering stay upright.
    ctx.save();
    if (c.downscroll) { ctx.translate(0,stageHeight); ctx.scale(1,-1); }
    for (const n of events) {
      if (!(n.hold > 0) || !lanes[n.side] || !lanes[n.side][n.lane]) continue;
      const pos = upscrollPosition(n.side, n.lane), headY = pos.y + (n.hit - t) * speed;
      const tailY = pos.y + (n.hit + n.hold - t) * speed;
      if (tailY < -50 || headY > c.noteClipBottom + 50) continue;
      const ns = getNoteState(state, n);
      // A completed tail never re-enters the scrolling-note branch. This
      // includes the exact endpoint, before the next rendered frame.
      if (t >= n.hit + n.hold) continue;
      const dropped = !!ns.dropped || ns.judgement === 'miss' || (Number.isFinite(ns.releaseAt) && t >= ns.releaseAt);
      const active = !dropped && t >= n.hit && t < n.hit + n.hold && (autoSides[n.side] || ns.held || isSuccess(ns));
      const body = images[pieces[n.lane]], cap = images[ends[n.lane]];
      if (!body || !cap) continue;
      const top = active ? Math.max(headY, pos.y) : headY;
      const capTop = tailY - cap.height * scale, bottom = capTop + 1.5;
      ctx.save();
      if (dropped) ctx.globalAlpha = .45;
      // Body and cap share the same consumption boundary. Missed/dropped
      // trails remain dim below the receptor until their own source tail.
      if (t >= n.hit || active) { ctx.beginPath(); ctx.rect(0, pos.y, 1920, c.noteClipBottom - pos.y); ctx.clip(); }
      if (bottom > top) ctx.drawImage(body, 0, 0, body.width, body.height - 1, pos.x - body.width * scale / 2, top, body.width * scale, bottom - top);
      ctx.drawImage(cap, pos.x - cap.width * scale / 2, capTop, cap.width * scale, cap.height * scale);
      ctx.restore(); sustainDrawn++;
    }
    ctx.restore();

    for (const n of events) {
      if (!lanes[n.side] || !lanes[n.side][n.lane]) continue;
      const dt = n.hit - t;
      if (dt < -c.lateNoteSeconds) continue;
      const ns = getNoteState(state, n);
      if (ns.judgement === 'miss' || isSuccess(ns) || (autoSides[n.side] && dt < -.001)) continue;
      const pos = upscrollPosition(n.side, n.lane);
      // Keep a late, still-playable head on its receptor until the judge resolves it.
      const y = pos.y + Math.max(0, dt) * speed;
      if (y < -150 || y > c.noteClipBottom + 150) continue;
      sprite(ctx, heads[n.lane], pos.x, screenY(y));
      notesDrawn++;
    }

    for (let side = 0; side < 2; side++) for (let lane = 0; lane < 4; lane++) {
      const ls = lanes[side][lane], since = t - ls.confirmAt, pos = lanePosition(side, lane);
      if (ls.held) { holdGlow(ctx, pos, lane, .48 + .12 * Math.sin(t * 20)); activeHoldGlows++; }
      if (ls.held || (since >= 0 && since < .19)) {
        const f = ls.held ? Math.floor(t * 24) % 4 : Math.min(3, Math.floor(since * 24));
        sprite(ctx, dirs[lane] + '_confirm000' + f, pos.x, pos.y);
      } else if (ls.pressed) sprite(ctx, dirs[lane] + '_press0000', pos.x, pos.y);
    }
    for (const n of events) {
      const ns = getNoteState(state, n), pos = lanePosition(n.side, n.lane);
      if (n.hold > 0 && isSuccess(ns) && !ns.dropped && Number.isFinite(ns.completedAt)) {
        const age = t - ns.completedAt;
        if (age >= 0 && age < .14) { holdGlow(ctx, pos, n.lane, .52 * (1 - age / .14), age); holdEndDrawn++; }
      }
      // Only a player SICK head creates a splash. Its original hit timestamp
      // remains fixed through hold ticks, repeated draw() calls, and pauses.
      if (n.side !== 1 || ns.judgement !== 'sick' || !Number.isFinite(ns.hitAt)) continue;
      const age = t - ns.hitAt, group = `note splash ${splashColors[n.lane]} ${stableVariant(n.id)}`;
      const frames = extraManifest && extraManifest.splash_groups[group];
      if (!frames || age < 0 || age >= frames.length / c.splashFps) continue;
      const file = frames[Math.floor(age * c.splashFps)], im = extraImages[file];
      if (!im) continue;
      // PNGs already restore the XML's full canvas/trim offset; do not apply
      // the trim offset again or centre separately cropped bounds per frame.
      const meta = extraManifest.splash_frames.find(f => f.file === file), anchor = meta.center_anchor;
      ctx.save(); ctx.globalAlpha = .90;
      ctx.drawImage(im, pos.x - anchor[0] * c.splashScale, pos.y - anchor[1] * c.splashScale, im.width * c.splashScale, im.height * c.splashScale);
      ctx.restore(); splashesDrawn++;
    }
    ctx.restore();
    const hud = drawHud(ctx, t, state);
    ctx.restore();
    return { notesDrawn, sustainDrawn, splashesDrawn, holdEndDrawn, activeHoldGlows, ...hud };
  }

  const api = { load, configure, draw, lanePosition, iconState, displayHealth, warmSplashes, get ready() { return ready; }, assetKeys: keys.slice(),
    get extraManifest() { return extraManifest; }, get extraBase() { return extraBase; },
    getExtraImage(name) { const file = extraManifest && extraManifest.images[name]; return file ? extraImages[file] : null; }
  };
  root.FnfUI = api;
})(window);
