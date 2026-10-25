// Audio: streamed music with crossfades, looping ambience layers and
// positional sound effects. Files are listed in /assets/audio/manifest.json
// so tracks can be swapped without touching code.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.manifest = { music: {}, ambience: {}, sfx: {} };
    this.buffers = new Map();
    this.vol = { music: 0.55, sfx: 0.8, ambience: 0.6 };
    this.music = null;       // { key, el, gain }
    this.amb = new Map();    // key -> { el, gain, target }
    this.listener = { x: 0, y: 0 };
    this.lastPlayed = new Map();
  }

  async init() {
    try {
      const r = await fetch('/assets/audio/manifest.json');
      if (r.ok) this.manifest = await r.json();
    } catch { /* no audio available */ }
  }

  // Must be called from a user gesture (browser autoplay policy).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.vol.sfx;
      this.sfxBus.connect(this.master);
      this.preload();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    if (this.pendingMusic) { const k = this.pendingMusic; this.pendingMusic = null; this.playMusic(k); }
  }

  async preload() {
    await Promise.all(Object.entries(this.manifest.sfx || {}).map(async ([k, files]) => {
      const list = Array.isArray(files) ? files : [files];
      const bufs = [];
      for (const f of list) {
        try {
          const ab = await (await fetch(`/assets/audio/${f}`)).arrayBuffer();
          bufs.push(await this.ctx.decodeAudioData(ab));
        } catch { /* missing file */ }
      }
      if (bufs.length) this.buffers.set(k, bufs);
    }));
  }

  setVolume(kind, v) {
    this.vol[kind] = v;
    if (kind === 'sfx' && this.sfxBus) this.sfxBus.gain.value = v;
    if (kind === 'music' && this.music) this.music.el.volume = v * this.music.level;
    if (kind === 'ambience') for (const a of this.amb.values()) a.el.volume = a.level * v;
  }

  makeEl(file, loop = true) {
    const el = new Audio(`/assets/audio/${file}`);
    el.loop = loop;
    el.preload = 'auto';
    el.crossOrigin = 'anonymous';
    return el;
  }

  playMusic(key) {
    const file = this.manifest.music?.[key];
    if (!file) return;
    if (this.music && this.music.key === key) return;
    if (!this.ctx || this.ctx.state !== 'running') { this.pendingMusic = key; }
    const old = this.music;
    const el = this.makeEl(file, key !== 'death' && key !== 'levelup');
    const m = { key, el, level: 0 };
    el.volume = 0;
    el.play().catch(() => { this.pendingMusic = key; if (this.music === m) this.music = old; });
    this.music = m;
    this.fade(m, 1, 2.5);
    if (old) this.fade(old, 0, 2.5, () => { old.el.pause(); old.el.src = ''; });
  }

  stopMusic() {
    const old = this.music;
    this.music = null;
    if (old) this.fade(old, 0, 1.5, () => { old.el.pause(); old.el.src = ''; });
  }

  fade(obj, to, secs, done, kind = 'music') {
    const from = obj.level, t0 = performance.now();
    clearInterval(obj.timer);
    obj.timer = setInterval(() => {
      const t = Math.min(1, (performance.now() - t0) / (secs * 1000));
      obj.level = from + (to - from) * t;
      obj.el.volume = Math.max(0, Math.min(1, obj.level * this.vol[kind]));
      if (t >= 1) { clearInterval(obj.timer); done?.(); }
    }, 50);
  }

  // Ambience: map of key -> level (0..1); missing keys fade out.
  setAmbience(levels) {
    for (const [key, lvl] of Object.entries(levels)) {
      const file = this.manifest.ambience?.[key];
      if (!file) continue;
      let a = this.amb.get(key);
      if (!a) {
        a = { el: this.makeEl(file), level: 0, target: 0 };
        a.el.volume = 0;
        this.amb.set(key, a);
      }
      if (a.target !== lvl) {
        a.target = lvl;
        if (lvl > 0 && a.el.paused) a.el.play().catch(() => {});
        this.fade(a, lvl, 2, lvl === 0 ? () => a.el.pause() : null, 'ambience');
      }
    }
    for (const [key, a] of this.amb) if (!(key in levels) && a.target !== 0) { a.target = 0; this.fade(a, 0, 2, () => a.el.pause(), 'ambience'); }
  }

  setListener(x, y) { this.listener.x = x; this.listener.y = y; }

  sfx(name, pos = null, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const bufs = this.buffers.get(name);
    if (!bufs) return;
    const now = performance.now();
    const minGap = opts.gap ?? 40;
    if (now - (this.lastPlayed.get(name) || 0) < minGap) return;
    this.lastPlayed.set(name, now);
    let vol = opts.volume ?? 1, pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x, dy = pos.y - this.listener.y;
      const d = Math.hypot(dx, dy);
      if (d > 16) return;
      vol *= Math.max(0, 1 - d / 16);
      pan = Math.max(-1, Math.min(1, dx / 10));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = bufs[(Math.random() * bufs.length) | 0];
    src.playbackRate.value = (opts.rate ?? 1) * (1 + (Math.random() - 0.5) * (opts.vary ?? 0.08));
    const g = this.ctx.createGain();
    g.gain.value = vol;
    let node = src.connect(g);
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      node = node.connect(p);
    }
    node.connect(this.sfxBus);
    src.start();
  }
}
