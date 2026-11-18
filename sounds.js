(function (root) {
  'use strict';
  const templates = new Map();
  const active = new Set();
  const history = [];
  let files = {}, base = '', master = .45;

  function load(manifest, directory) {
    files = manifest?.sounds || {};
    base = directory;
  }

  function template(name) {
    if (!Object.hasOwn(files, name)) return null;
    if (!templates.has(name)) {
      const sound = new Audio();
      sound.preload = 'none';
      sound.src = base + files[name];
      templates.set(name, sound);
    }
    return templates.get(name);
  }

  function warmup(names) {
    for (const name of names) {
      const sound = template(name);
      if (sound && sound.preload !== 'auto') { sound.preload = 'auto'; sound.load(); }
    }
  }

  function stop(channel) {
    for (const sound of active) {
      if (channel && sound._channel !== channel) continue;
      sound.pause();
      active.delete(sound);
    }
  }

  function play(name, options = {}) {
    const source = template(name);
    if (!source) return null;
    if (options.channel) stop(options.channel);
    const sound = source.cloneNode();
    sound.preload = 'auto';
    sound._relative = options.volume ?? 1;
    sound._channel = options.channel || '';
    sound.volume = Math.max(0, Math.min(1, master * sound._relative));
    sound.loop = !!options.loop;
    active.add(sound);
    const discard = () => active.delete(sound);
    sound.addEventListener('ended', discard, {once:true});
    sound.addEventListener('error', discard, {once:true});
    history.push({name, volume:sound.volume, loop:sound.loop, channel:sound._channel, at:performance.now()});
    if (history.length > 96) history.shift();
    sound.play().catch(() => { if (!sound._suspended) discard(); });
    return sound;
  }

  function setVolume(value) {
    master = Math.max(0, Math.min(1, value));
    for (const sound of active) sound.volume = Math.max(0, Math.min(1, master * sound._relative));
  }
  function pauseAll() {
    for (const sound of active) if (!sound.paused) { sound._suspended = true; sound.pause(); }
  }
  function resumeAll() {
    for (const sound of active) if (sound._suspended) {
      sound._suspended = false;
      sound.play().catch(() => active.delete(sound));
    }
  }
  root.CourtSounds = {load, warmup, play, stop, setVolume, pauseAll, resumeAll,
    get ready() { return !!Object.keys(files).length; },
    snapshot() {
      return {ready:this.ready, loaded:[...templates].filter(([,s])=>s.readyState>=1).map(([name])=>name),
        active:[...active].map(s=>({name:s.currentSrc.split('/').pop(),paused:s.paused,loop:s.loop,channel:s._channel})),
        history:history.map(h=>({...h}))};
    }
  };
})(window);
