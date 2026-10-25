// Tiny offline synthesizer used to render Fibula's original music and sound
// effects. Everything here is generated from code (no samples), so the
// resulting audio is original work of this project.

export const SR = 44100;

export function midi(name) {
  if (typeof name === 'number') return name;
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]];
  return base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}
export const freq = (n) => 440 * Math.pow(2, (midi(n) - 69) / 12);

// deterministic random for reproducible renders
let seed = 1234567;
export function srand(s) { seed = s >>> 0 || 1; }
export function rnd() { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; }
const noise = () => rnd() * 2 - 1;

function polyblep(t, dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

class Biquad {
  constructor() { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set('lp', 1000, 0.7); }
  set(type, f, q) {
    const w = (2 * Math.PI * Math.min(f, SR * 0.45)) / SR, cs = Math.cos(w), sn = Math.sin(w), a = sn / (2 * q);
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; }
    else { b0 = a; b1 = 0; b2 = -a; } // band pass (0 dB peak)
    const a0 = 1 + a;
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = (-2 * cs) / a0; this.a2 = (1 - a) / a0;
  }
  run(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}

function adsr(t, dur, a, d, s, r) {
  if (t < a) return t / a;
  if (t < a + d) return 1 - ((t - a) / d) * (1 - s);
  if (t < dur) return s;
  const k = 1 - (t - dur) / r;
  return k > 0 ? s * k : 0;
}

// ---------------------------------------------------------------- instruments
// Each instrument returns a Float32Array (mono) for one note.

function supersaw(f, dur, opts) {
  const { voices = 3, detune = 0.006, a = 0.3, d = 0.3, s = 0.8, r = 1.0, cutoff = 1500, q = 0.7, vib = 0, sub = 0, env = null } = opts;
  const len = Math.ceil((dur + r) * SR);
  const out = new Float32Array(len);
  const ph = Array.from({ length: voices }, () => rnd());
  const lp = new Biquad(), lp2 = new Biquad();
  lp.set('lp', cutoff, q); lp2.set('lp', cutoff * 1.3, 0.6);
  let subPh = 0;
  for (let i = 0; i < len; i++) {
    const t = i / SR;
    if (env && i % 32 === 0) { const c = env(t); lp.set('lp', c, q); lp2.set('lp', c * 1.3, 0.6); }
    const v = vib ? 1 + Math.sin(t * 2 * Math.PI * 5.2) * vib * Math.min(1, t / 0.4) : 1;
    let x = 0;
    for (let k = 0; k < voices; k++) {
      const det = 1 + (voices === 1 ? 0 : (k / (voices - 1) - 0.5) * 2 * detune);
      const dt = (f * det * v) / SR;
      ph[k] += dt; if (ph[k] >= 1) ph[k] -= 1;
      x += 2 * ph[k] - 1 - polyblep(ph[k], dt);
    }
    x /= voices;
    if (sub) { subPh += f / 2 / SR; x += Math.sin(subPh * 2 * Math.PI) * sub; }
    out[i] = lp2.run(lp.run(x)) * adsr(t, dur, a, d, s, r);
  }
  return out;
}

export const INSTR = {
  pad: (f, dur, v) => supersaw(f, dur, { voices: 4, detune: 0.008, a: 1.4, d: 0.5, s: 0.85, r: 2.6, cutoff: 900 + v * 500, sub: 0.15 }),
  strings: (f, dur, v) => supersaw(f, dur, { voices: 3, detune: 0.005, a: 0.28, d: 0.3, s: 0.9, r: 0.8, cutoff: 2400 + v * 800, vib: 0.004 }),
  stacc: (f, dur, v) => supersaw(f, Math.min(dur, 0.18), { voices: 3, detune: 0.004, a: 0.008, d: 0.12, s: 0.35, r: 0.15, cutoff: 1800 + v * 1200 }),
  brass: (f, dur, v) => supersaw(f, dur, {
    voices: 2, detune: 0.003, a: 0.05, d: 0.2, s: 0.85, r: 0.35, q: 1.6, vib: 0.003,
    env: (t) => 500 + (2600 + v * 1500) * Math.min(1, t / 0.09) * (t < 0.09 ? 1 : 0.75 + 0.25 * Math.exp(-(t - 0.09) * 4)),
  }),
  bass: (f, dur) => {
    const r = 0.25, len = Math.ceil((dur + r) * SR), out = new Float32Array(len);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      ph += f / SR; if (ph >= 1) ph -= 1;
      const tri = 1 - 4 * Math.abs(ph - 0.5);
      out[i] = (tri * 0.7 + Math.sin(ph * 2 * Math.PI) * 0.5) * adsr(t, dur, 0.02, 0.2, 0.75, r);
    }
    return out;
  },
  choir: (f, dur, v) => {
    const raw = supersaw(f, dur, { voices: 3, detune: 0.007, a: 0.7, d: 0.4, s: 0.9, r: 1.6, cutoff: 3500, vib: 0.006 });
    const f1 = new Biquad(), f2 = new Biquad(), f3 = new Biquad();
    f1.set('bp', 750, 5); f2.set('bp', 1150, 6); f3.set('bp', 2700, 7);
    for (let i = 0; i < raw.length; i++) { const x = raw[i]; raw[i] = (f1.run(x) * 1.2 + f2.run(x) * 0.8 + f3.run(x) * 0.35) * 2.2 * (0.8 + v * 0.3); }
    return raw;
  },
  flute: (f, dur, v) => {
    const r = 0.25, len = Math.ceil((dur + r) * SR), out = new Float32Array(len);
    const bp = new Biquad(); bp.set('bp', f * 2, 3);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const vib = 1 + Math.sin(t * 2 * Math.PI * 5) * 0.006 * Math.min(1, Math.max(0, (t - 0.15) / 0.3));
      ph += (f * vib) / SR; if (ph >= 1) ph -= 1;
      const e = adsr(t, dur, 0.07, 0.1, 0.85, r);
      out[i] = (Math.sin(ph * 2 * Math.PI) + 0.12 * Math.sin(ph * 4 * Math.PI) + bp.run(noise()) * 0.25) * e * (0.6 + v * 0.4);
    }
    return out;
  },
  pluck: (f, dur, v, opts = {}) => {
    const len = Math.ceil(Math.min(4, dur + (opts.ring ?? 2.5)) * SR);
    const out = new Float32Array(len);
    const n = Math.max(2, Math.round(SR / f));
    const buf = new Float32Array(n);
    let last = 0;
    const bright = opts.bright ?? 0.5;
    for (let i = 0; i < n; i++) { const x = noise(); last = last + (x - last) * bright; buf[i] = last; }
    let idx = 0;
    const fb = opts.fb ?? 0.996;
    for (let i = 0; i < len; i++) {
      const a = buf[idx], b = buf[(idx + 1) % n];
      const y = (a + b) * 0.5 * fb;
      buf[idx] = y;
      out[i] = a * (0.7 + v * 0.5) * (i < 40 ? i / 40 : 1);
      idx = (idx + 1) % n;
    }
    return out;
  },
  bell: (f, dur, v, opts = {}) => {
    const decay = opts.decay ?? 3.5, len = Math.ceil(decay * 1.6 * SR), out = new Float32Array(len);
    const ratio = opts.ratio ?? 3.5;
    let pc = 0, pm = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      pm += (f * ratio) / SR; pc += f / SR;
      const idx = (opts.index ?? 3) * Math.exp(-t * 3);
      const e = Math.exp(-t * (4 / decay)) * (i < 30 ? i / 30 : 1);
      out[i] = Math.sin(2 * Math.PI * pc + idx * Math.sin(2 * Math.PI * pm)) * e * (0.6 + v * 0.4);
    }
    return out;
  },
  timpani: (f, dur, v) => {
    const len = Math.ceil(2.2 * SR), out = new Float32Array(len);
    const lp = new Biquad(); lp.set('lp', 500, 0.8);
    let p1 = 0, p2 = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const pf = f * (1 + 0.12 * Math.exp(-t * 40));
      p1 += pf / SR; p2 += (pf * 1.5) / SR;
      const e = Math.exp(-t * 2.4);
      out[i] = (Math.sin(2 * Math.PI * p1) * 0.9 + Math.sin(2 * Math.PI * p2) * 0.3 * Math.exp(-t * 5) + lp.run(noise()) * Math.exp(-t * 25) * 0.9) * e * v;
    }
    return out;
  },
  taiko: (f, dur, v) => {
    const len = Math.ceil(1.2 * SR), out = new Float32Array(len);
    const lp = new Biquad(); lp.set('lp', 300, 0.7);
    let p = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      p += (55 * (1 + Math.exp(-t * 30))) / SR;
      out[i] = (Math.sin(2 * Math.PI * p) * Math.exp(-t * 4) + lp.run(noise()) * Math.exp(-t * 18) * 1.2) * v;
    }
    return out;
  },
  snare: (f, dur, v) => {
    const len = Math.ceil(0.4 * SR), out = new Float32Array(len);
    const bp = new Biquad(); bp.set('bp', 1900, 0.8);
    let p = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      p += 190 / SR;
      out[i] = (bp.run(noise()) * Math.exp(-t * 16) * 1.6 + Math.sin(2 * Math.PI * p) * Math.exp(-t * 30) * 0.5) * v;
    }
    return out;
  },
  cymbal: (f, dur, v) => {
    const len = Math.ceil((dur + 2.5) * SR), out = new Float32Array(len);
    const hp = new Biquad(); hp.set('hp', 5500, 0.7);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const e = t < dur ? Math.pow(t / dur, 2.5) : Math.exp(-(t - dur) * 1.8);
      out[i] = hp.run(noise()) * e * v * 0.22;
    }
    return out;
  },
  drone: (f, dur, v) => {
    const r = 3, len = Math.ceil((dur + r) * SR), out = new Float32Array(len);
    const lp = new Biquad(); lp.set('lp', 220, 0.7);
    let a = 0, b = 0, c = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      a += f / SR; b += (f * 1.003) / SR; c += (f * 2.001) / SR;
      const e = adsr(t, dur, 2.5, 0.5, 0.9, r);
      out[i] = (Math.sin(2 * Math.PI * a) + Math.sin(2 * Math.PI * b) * 0.8 + Math.sin(2 * Math.PI * c) * 0.25 + lp.run(noise()) * 0.6) * e * v;
    }
    return out;
  },
};

// ---------------------------------------------------------------- mixing
class Comb {
  constructor(n) { this.buf = new Float32Array(n); this.i = 0; this.store = 0; }
  run(x, fb, damp) {
    const y = this.buf[this.i];
    this.store = y * (1 - damp) + this.store * damp;
    this.buf[this.i] = x + this.store * fb;
    if (++this.i >= this.buf.length) this.i = 0;
    return y;
  }
}
class Allpass {
  constructor(n) { this.buf = new Float32Array(n); this.i = 0; }
  run(x) {
    const b = this.buf[this.i];
    this.buf[this.i] = x + b * 0.5;
    if (++this.i >= this.buf.length) this.i = 0;
    return b - x;
  }
}

// Freeverb-style stereo reverb.
export function reverb(input, { room = 0.86, damp = 0.35, wet = 1 } = {}) {
  const combsT = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const apsT = [556, 441, 341, 225];
  const scale = SR / 44100;
  const mk = (spread) => ({
    combs: combsT.map((n) => new Comb(Math.round((n + spread) * scale))),
    aps: apsT.map((n) => new Allpass(Math.round((n + spread) * scale))),
  });
  const L = mk(0), R = mk(23);
  const outL = new Float32Array(input.length), outR = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const x = input[i] * 0.015;
    let l = 0, r = 0;
    for (let k = 0; k < 8; k++) { l += L.combs[k].run(x, room, damp); r += R.combs[k].run(x, room, damp); }
    for (let k = 0; k < 4; k++) { l = L.aps[k].run(l); r = R.aps[k].run(r); }
    outL[i] = l * wet; outR[i] = r * wet;
  }
  return [outL, outR];
}

export class Mix {
  constructor(seconds) {
    this.len = Math.ceil(seconds * SR);
    this.L = new Float32Array(this.len);
    this.R = new Float32Array(this.len);
    this.send = new Float32Array(this.len);
  }

  add(buf, at, gain = 1, pan = 0, send = 0.3) {
    const s = Math.round(at * SR);
    const gl = Math.cos((pan + 1) * Math.PI / 4) * gain * 1.414, gr = Math.sin((pan + 1) * Math.PI / 4) * gain * 1.414;
    for (let i = 0; i < buf.length; i++) {
      const j = s + i;
      if (j < 0) continue;
      if (j >= this.len) break;
      const x = buf[i];
      this.L[j] += x * gl; this.R[j] += x * gr;
      this.send[j] += x * gain * send;
    }
  }

  note(inst, n, at, dur, { v = 0.8, gain = 0.3, pan = 0, send = 0.3, opts } = {}) {
    const f = freq(n);
    const jitter = (rnd() - 0.5) * 0.012;
    const vel = Math.max(0.05, Math.min(1, v + (rnd() - 0.5) * 0.12));
    this.add(INSTR[inst](f, dur, vel, opts), at + Math.max(0, jitter), gain * vel, pan, send);
  }

  // Applies reverb, optional loop wrap (tail added to the start), soft clip
  // and normalisation. Returns interleaved stereo Float32Array.
  master({ room = 0.86, damp = 0.35, wet = 0.9, loopAt = null, fadeIn = 0, fadeOut = 0, peak = 0.89 } = {}) {
    const [rl, rr] = reverb(this.send, { room, damp, wet });
    for (let i = 0; i < this.len; i++) { this.L[i] += rl[i]; this.R[i] += rr[i]; }
    let L = this.L, R = this.R;
    if (loopAt) {
      const n = Math.round(loopAt * SR);
      const l2 = L.slice(0, n), r2 = R.slice(0, n);
      for (let i = n; i < this.len; i++) { l2[(i - n) % n] += L[i]; r2[(i - n) % n] += R[i]; }
      L = l2; R = r2;
    }
    let mx = 1e-9;
    for (let i = 0; i < L.length; i++) {
      L[i] = Math.tanh(L[i] * 1.1); R[i] = Math.tanh(R[i] * 1.1);
      mx = Math.max(mx, Math.abs(L[i]), Math.abs(R[i]));
    }
    const g = peak / mx;
    const out = new Float32Array(L.length * 2);
    const fi = fadeIn * SR, fo = fadeOut * SR;
    for (let i = 0; i < L.length; i++) {
      let e = 1;
      if (fi && i < fi) e = i / fi;
      if (fo && i > L.length - fo) e = Math.min(e, (L.length - i) / fo);
      out[i * 2] = L[i] * g * e; out[i * 2 + 1] = R[i] * g * e;
    }
    return out;
  }
}

export { noise, Biquad, adsr };
