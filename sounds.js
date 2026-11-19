(function (root) {
  'use strict';

  const clips = new Map(), loading = new Map(), elements = new Map();
  const active = new Set(), history = [];
  let files = {}, base = '', master = .45, context = null, unavailable = false, music = null;
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function audioContext() {
    if (context && context.state !== 'closed') return context;
    if (unavailable) return null;
    const AudioEngine = root.AudioContext || root.webkitAudioContext;
    if (!AudioEngine) { unavailable = true; return null; }
    try { context = new AudioEngine({latencyHint:'interactive'}); }
    catch { try { context = new AudioEngine(); } catch { unavailable = true; } }
    return unavailable ? null : context;
  }

  function deadline(task, ms, message) {
    let timer;
    return Promise.race([
      Promise.resolve(task),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), ms); })
    ]).finally(() => clearTimeout(timer));
  }

  // Unlock within a real user gesture, before starting the countdown.
  function unlock() {
    const ctx = audioContext();
    if (!ctx) return Promise.resolve(false);
    if (ctx.state === 'running') return Promise.resolve(true);
    try { return Promise.resolve(ctx.resume()).then(() => ctx.state === 'running', () => false); }
    catch { return Promise.resolve(false); }
  }

  async function fetchBytes(url) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const task = (async () => {
      const response = await fetch(url, {credentials:'same-origin', ...(controller ? {signal:controller.signal} : {})});
      if (!response.ok) throw new Error('音频资源读取失败');
      return response.arrayBuffer();
    })();
    try { return await deadline(task, 20000, '音频下载超时'); }
    finally { controller?.abort(); }
  }

  function decode(ctx, bytes) {
    return deadline(new Promise((resolve, reject) => {
      try {
        const task = ctx.decodeAudioData(bytes, resolve, reject);
        if (task && typeof task.then === 'function') task.then(resolve, reject);
      } catch (error) { reject(error); }
    }), 18000, '音频解码超时');
  }

  // Prefer the audible output timestamp when a browser supplies a fresh one.
  // Never allow the estimate to run ahead of the rendered audio.
  function outputClock(ctx) {
    const current = ctx.currentTime;
    try {
      const stamp = ctx.getOutputTimestamp?.();
      if (stamp && stamp.performanceTime > 0) {
        const age = (performance.now() - stamp.performanceTime) / 1000;
        const output = stamp.contextTime + Math.max(0, age);
        if (Number.isFinite(output) && age >= -.035 && age < .25 && output >= current - .5) {
          return clamp(output, 0, current);
        }
      }
    } catch {}
    return current;
  }

  class MusicPlayer {
    constructor(element) {
      this.element = element;
      this.events = new EventTarget();
      this.mode = 'loading';
      this.prepared = false;
      this.preparation = null;
      this.buffer = null;
      this.fullFile = false;
      this.objectURL = null;
      this.nativeURL = '';
      this.nativeDuration = NaN;
      this.source = null;
      this.gain = null;
      this.playingContext = null;
      this.startAt = 0;
      this.offset = 0;
      this.position = 0;
      this.finished = false;
      this.request = 0;
      this.level = .85;
      for (const name of ['playing','waiting','seeking','seeked','pause','ended','error','stalled']) {
        element.addEventListener(name, () => { if (this.mode === 'native') this.emit(name); });
      }
    }

    addEventListener(name, listener) { this.events.addEventListener(name, listener); }
    emit(name) { this.events.dispatchEvent(new Event(name)); }

    get currentTime() {
      if (this.mode === 'native') {
        const time = this.element.currentTime;
        if (Number.isFinite(time) && !this.element.error) this.position = time;
        return this.position;
      }
      if (this.source && this.playingContext) {
        const played = Math.max(0, outputClock(this.playingContext) - this.startAt);
        this.position = clamp(Math.max(this.position, this.offset + played), 0, this.duration);
      }
      return this.position;
    }

    set currentTime(value) {
      const time = clamp(Number(value) || 0, 0, Number.isFinite(this.duration) ? this.duration : Infinity);
      if (this.mode === 'native') {
        this.position = time;
        if (this.element.readyState > 0) this.element.currentTime = time;
        return;
      }
      const ctx = this.playingContext, wasPlaying = !!this.source;
      this.stopBuffer();
      this.offset = this.position = time;
      this.finished = false;
      if (wasPlaying && ctx?.state === 'running' && time < this.duration) this.startBuffer(ctx);
    }

    get duration() { return this.mode === 'native' ? (Number.isFinite(this.element.duration) ? this.element.duration : this.nativeDuration) : this.buffer?.duration ?? NaN; }
    get paused() { return this.mode === 'native' ? this.element.paused : !this.source; }
    get ended() { return this.mode === 'native' ? this.element.ended : this.finished; }
    get seeking() { return this.mode === 'native' && this.element.seeking; }
    get readyState() { return this.mode === 'native' ? this.element.readyState : this.buffer ? 4 : 0; }
    get interrupted() { return this.mode === 'web-audio' && !!this.source && this.playingContext?.state !== 'running'; }
    get volume() { return this.level; }
    set volume(value) {
      this.level = clamp(Number(value) || 0, 0, 1);
      this.element.volume = this.level;
      if (this.gain) this.gain.gain.value = this.level;
    }

    async prepareNative(url) {
      this.mode = 'native';
      this.nativeURL = url;
      const el = this.element;
      el.preload = 'auto';
      await new Promise((resolve, reject) => {
        const clean = () => {
          clearTimeout(timer);
          el.removeEventListener('loadedmetadata', loaded);
          el.removeEventListener('error', failed);
        };
        const loaded = () => { clean(); resolve(); };
        const failed = () => { clean(); reject(new Error('无法读取乐曲')); };
        const timer = setTimeout(failed, 15000);
        el.addEventListener('loadedmetadata', loaded);
        el.addEventListener('error', failed);
        el.src = url;
        el.load();
      });
      if (Number.isFinite(el.duration)) this.nativeDuration = el.duration;
    }

    prepare() {
      if (this.prepared) return Promise.resolve();
      if (this.preparation) return this.preparation;
      this.preparation = (async () => {
        const url = this.element.dataset.src;
        const ctx = audioContext();
        // Download every byte before the round. Where available, a native
        // fallback also uses that complete local file.
        if (typeof fetch === 'function' && location.protocol !== 'file:') {
          const bytes = await fetchBytes(url);
          this.fullFile = true;
          if (ctx) {
            try {
              this.buffer = await decode(ctx, bytes.slice(0));
              if (!this.buffer || !(this.buffer.duration > 0)) throw new Error('空音频');
              this.mode = 'web-audio';
              this.prepared = true;
              return;
            } catch { this.buffer = null; }
          }
          if (typeof URL.createObjectURL === 'function') {
            this.objectURL = URL.createObjectURL(new Blob([bytes], {type:'audio/mp4'}));
            try {
              await this.prepareNative(this.objectURL);
              this.prepared = true;
              return;
            } catch {
              URL.revokeObjectURL(this.objectURL);
              this.objectURL = null;
              this.fullFile = false;
            }
          }
        }
        this.fullFile = false;
        await this.prepareNative(url);
        this.prepared = true;
      })().finally(() => { this.preparation = null; });
      return this.preparation;
    }

    stopBuffer() {
      const source = this.source, gain = this.gain;
      this.source = this.gain = null;
      if (source) {
        source.onended = null;
        try { source.stop(); } catch {}
        try { source.disconnect(); } catch {}
      }
      if (gain) { try { gain.disconnect(); } catch {} }
    }

    startBuffer(ctx) {
      const source = ctx.createBufferSource(), gain = ctx.createGain();
      source.buffer = this.buffer;
      gain.gain.value = this.level;
      source.connect(gain); gain.connect(ctx.destination);
      this.source = source; this.gain = gain; this.playingContext = ctx;
      this.startAt = ctx.currentTime;
      this.position = this.offset;
      this.finished = false;
      source.onended = () => {
        if (this.source !== source) return;
        this.source = this.gain = null;
        source.disconnect(); gain.disconnect();
        this.offset = this.position = this.duration;
        this.finished = true;
        this.emit('ended');
      };
      try { source.start(this.startAt, this.offset); }
      catch (error) { this.stopBuffer(); throw error; }
      this.emit('playing');
    }

    async play() {
      const request = ++this.request;
      await this.prepare();
      if (request !== this.request) return;
      if (this.mode === 'native') {
        if (this.element.error || this.element.readyState === 0 || (this.element.ended && this.position < this.duration-.25)) {
          const position = this.position;
          await this.prepareNative(this.nativeURL);
          if (request !== this.request) return;
          this.element.currentTime = clamp(position, 0, this.duration);
        }
        try { await deadline(this.element.play(), 6000, '乐曲播放等待超时'); }
        catch (error) { if (request === this.request) this.element.pause(); throw error; }
        return;
      }
      const ctx = audioContext();
      if (!ctx) throw new Error('浏览器音频引擎不可用');
      if (ctx.state !== 'running' && !await deadline(unlock(), 4000, '浏览器未能恢复音频')) {
        throw new Error('浏览器未能恢复音频');
      }
      if (request !== this.request || this.source) return;
      if (this.offset >= this.duration) this.offset = this.position = 0;
      this.startBuffer(ctx);
    }

    pause() {
      this.request++;
      if (this.mode === 'native') { this.position=this.currentTime;this.element.pause();return; }
      if (!this.source) return;
      this.offset = this.position = this.currentTime;
      this.stopBuffer();
      this.emit('pause');
    }

    status() {
      return {
        currentTime:this.currentTime, duration:this.duration, paused:this.paused, ended:this.ended,
        volume:this.volume, mode:this.mode, fullFile:this.fullFile, readyState:this.readyState,
        contextState:this.playingContext?.state || context?.state || null,
        decodedBytes:this.buffer ? this.buffer.length * this.buffer.numberOfChannels * 4 : 0
      };
    }
  }

  function nativeElement(name) {
    if (!Object.hasOwn(files, name)) return null;
    if (!elements.has(name)) {
      const audio = new Audio();
      audio.preload = 'none';
      audio.src = base + files[name];
      elements.set(name, audio);
    }
    return elements.get(name);
  }

  function clip(name) {
    if (clips.has(name)) return Promise.resolve(clips.get(name));
    if (loading.has(name)) return loading.get(name);
    const ctx = audioContext();
    if (!ctx || !Object.hasOwn(files, name)) return Promise.resolve(null);
    const task = fetchBytes(base + files[name]).then(bytes => decode(ctx, bytes))
      .then(buffer => { clips.set(name, buffer); return buffer; })
      .catch(() => null).finally(() => loading.delete(name));
    loading.set(name, task);
    return task;
  }

  function warmup(names) {
    if (audioContext() && typeof fetch === 'function' && location.protocol !== 'file:') return Promise.all(names.map(clip));
    for (const name of names) {
      const sound = nativeElement(name);
      if (sound && sound.preload !== 'auto') { sound.preload = 'auto'; sound.load(); }
    }
    return Promise.resolve();
  }

  function detach(voice) {
    const source = voice.source, gain = voice.gain;
    voice.source = voice.gain = null;
    if (source) {
      source.onended = null;
      try { source.stop(); } catch {}
      try { source.disconnect(); } catch {}
    }
    if (gain) { try { gain.disconnect(); } catch {} }
  }

  function remove(voice) {
    voice.generation++;
    detach(voice);
    if (voice.element) {
      voice.element.removeEventListener('ended', voice.discard);
      voice.element.removeEventListener('error', voice.discard);
      voice.element.pause();
    }
    active.delete(voice);
  }

  function startClip(voice, buffer, ctx) {
    if (!buffer || !(buffer.duration > 0) || !active.has(voice) || voice.paused) return remove(voice);
    const offset = voice.loop ? voice.offset % buffer.duration : voice.offset;
    if (offset >= buffer.duration) return remove(voice);
    const source = ctx.createBufferSource(), gain = ctx.createGain();
    source.buffer = buffer; source.loop = voice.loop;
    gain.gain.value = clamp(master * voice.relative, 0, 1);
    source.connect(gain); gain.connect(ctx.destination);
    voice.source = source; voice.gain = gain; voice.ctx = ctx;
    voice.offset = offset; voice.startedAt = ctx.currentTime;
    source.onended = () => { if (voice.source === source) remove(voice); };
    try { source.start(voice.startedAt, offset); }
    catch { remove(voice); }
  }

  function startNativeVoice(voice, generation) {
    const element = voice.element || nativeElement(voice.name);
    if (!element) return remove(voice);
    if (!voice.element) {
      for (const other of active) if (other !== voice && other.element === element) remove(other);
      voice.element = element;
      element.preload = 'auto'; element.loop = voice.loop;
      element.addEventListener('ended', voice.discard = () => remove(voice));
      element.addEventListener('error', voice.discard);
    }
    element.volume = clamp(master * voice.relative, 0, 1);
    try { element.currentTime = voice.offset; } catch {}
    try { Promise.resolve(element.play()).catch(() => { if (voice.generation === generation) remove(voice); }); }
    catch { remove(voice); }
  }

  function startVoice(voice) {
    const generation = ++voice.generation;
    const ctx = audioContext();
    if (ctx && !voice.element && typeof fetch === 'function' && location.protocol !== 'file:') {
      const buffer = clips.get(voice.name);
      if (buffer && ctx.state === 'running') { startClip(voice, buffer, ctx); return; }
      Promise.all([buffer || clip(voice.name), deadline(unlock(), 1800, '音效等待超时')])
        .then(([ready, unlocked]) => {
          if (!active.has(voice) || voice.paused || voice.generation !== generation) return;
          if (!unlocked || !ready) {
            if (music?.mode === 'native') startNativeVoice(voice, generation);
            else remove(voice);
            return;
          }
          startClip(voice, ready, ctx);
        }).catch(() => { if (voice.generation === generation) remove(voice); });
      return;
    }
    startNativeVoice(voice, generation);
  }

  function stop(channel) {
    for (const voice of active) if (!channel || voice.channel === channel) remove(voice);
  }

  function play(name, options = {}) {
    if (!Object.hasOwn(files, name)) return null;
    if (options.channel) stop(options.channel);
    const voice = {
      name, relative:options.volume ?? 1, channel:options.channel || '',
      loop:!!options.loop, paused:false, offset:0, generation:0, source:null, gain:null, element:null
    };
    active.add(voice);
    history.push({name, volume:clamp(master * voice.relative, 0, 1), loop:voice.loop, channel:voice.channel, at:performance.now()});
    if (history.length > 96) history.shift();
    try { startVoice(voice); } catch { remove(voice); }
    return voice;
  }

  function setVolume(value) {
    master = clamp(value, 0, 1);
    for (const voice of active) {
      const level = clamp(master * voice.relative, 0, 1);
      if (voice.element) voice.element.volume = level;
      if (voice.gain) voice.gain.gain.value = level;
    }
  }

  function pauseAll() {
    for (const voice of active) {
      if (voice.paused) continue;
      voice.paused = true; voice.generation++;
      if (voice.source) {
        voice.offset += Math.max(0, voice.ctx.currentTime - voice.startedAt);
        detach(voice);
      }
      if (voice.element) { voice.offset = voice.element.currentTime; voice.element.pause(); }
    }
  }

  function resumeAll() {
    for (const voice of active) if (voice.paused) {
      voice.paused = false;
      try { startVoice(voice); } catch { remove(voice); }
    }
  }

  root.CourtSounds = {
    load(manifest, directory) { files = manifest?.sounds || {}; base = directory; },
    createMusic(element) { music = new MusicPlayer(element); return music; },
    musicStatus() { return music?.status() || null; },
    unlock, warmup, play, stop, setVolume, pauseAll, resumeAll,
    get ready() { return !!Object.keys(files).length; },
    snapshot() {
      return {
        ready:this.ready, loaded:[...new Set([...clips.keys(), ...[...elements].filter(([,el])=>el.readyState>=1).map(([name])=>name)])],
        active:[...active].map(v=>({name:files[v.name],paused:v.paused,loop:v.loop,channel:v.channel})),
        history:history.map(h=>({...h})), music:this.musicStatus()
      };
    }
  };
})(window);
