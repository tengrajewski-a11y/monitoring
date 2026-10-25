// Retro sound effects in the spirit of sfxr / bfxr (DrPetter's classic
// parameter model: one oscillator with pitch slide, vibrato and arpeggio, a
// punchy envelope, low/high pass filters, a phaser and a repeat), written for
// Fibula 3D's offline audio build. Presets give a starting point and mutate()
// makes slightly different takes, so repeated sounds do not all sound alike.
//
//   import { sfxr, PRESETS, mutate } from './sfxr.mjs';
//   const samples = sfxr(mutate(PRESETS.hit(rnd), rnd, 0.1));   // Float32Array, 44.1 kHz, -1..1

import { SR } from './synth.mjs';

export const WAVE = { square: 0, saw: 1, sine: 2, noise: 3 };

const DEFAULTS = {
  wave: WAVE.square,
  freq: 0.3, freqLimit: 0, slide: 0, deltaSlide: 0,
  duty: 0, dutySweep: 0,
  vibDepth: 0, vibSpeed: 0,
  attack: 0, sustain: 0.3, punch: 0, decay: 0.4,
  lpf: 1, lpfSweep: 0, lpfResonance: 0, hpf: 0, hpfSweep: 0,
  phaserOffset: 0, phaserSweep: 0,
  repeatSpeed: 0, arpSpeed: 0, arpMod: 0,
  volume: 0.5,
};

// Renders the parameters (all roughly 0..1, slides -1..1) to mono samples.
export function sfxr(params, rand = Math.random) {
  const p = { ...DEFAULTS, ...params };
  const rate = SR / 44100;              // the model counts in 44.1 kHz samples
  let period, fperiod, fmaxperiod, fslide, fdslide, squareDuty, squareSlide, arpMod, arpTime, arpLimit;
  const restart = () => {
    fperiod = 100 / (p.freq * p.freq + 0.001);
    fmaxperiod = 100 / (p.freqLimit * p.freqLimit + 0.001);
    fslide = 1 - p.slide ** 3 * 0.01;
    fdslide = -(p.deltaSlide ** 3) * 0.000001;
    squareDuty = 0.5 - p.duty * 0.5;
    squareSlide = -p.dutySweep * 0.00005;
    arpMod = p.arpMod >= 0 ? 1 - p.arpMod ** 2 * 0.9 : 1 + p.arpMod ** 2 * 10;
    arpTime = 0;
    arpLimit = p.arpSpeed === 1 ? 0 : Math.floor((1 - p.arpSpeed) ** 2 * 20000 + 32);
  };
  restart();
  // filters
  let fltp = 0, fltdp = 0, fltw = p.lpf ** 3 * 0.1;
  const fltwD = 1 + p.lpfSweep * 0.0001;
  const fltdmp = Math.min(0.8, (5 / (1 + p.lpfResonance ** 2 * 20)) * (0.01 + fltw));
  let fltphp = 0, flthp = p.hpf ** 2 * 0.1;
  const flthpD = 1 + p.hpfSweep * 0.0003;
  // vibrato, envelope, phaser, repeat
  let vibPhase = 0;
  const vibSpeed = p.vibSpeed ** 2 * 0.01, vibAmp = p.vibDepth * 0.5;
  const envLen = [p.attack ** 2 * 100000, p.sustain ** 2 * 100000, p.decay ** 2 * 100000].map((x) => Math.max(1, x));
  let envStage = 0, envTime = 0;
  let fphase = Math.sign(p.phaserOffset) * p.phaserOffset ** 2 * 1020;
  const fdphase = Math.sign(p.phaserSweep) * p.phaserSweep ** 2;
  const phaser = new Float32Array(1024);
  let ipp = 0;
  const noiseBuf = new Float32Array(32).map(() => rand() * 2 - 1);
  let repTime = 0;
  const repLimit = p.repeatSpeed === 0 ? 0 : Math.floor((1 - p.repeatSpeed) ** 2 * 20000 + 32);

  const total = Math.ceil((envLen[0] + envLen[1] + envLen[2]) * rate);
  const out = new Float32Array(total);
  let phase = 0, playing = true, n = 0;
  // one model sample per output sample at 44.1 kHz (8x supersampled inside)
  for (let i = 0; i < total && playing; i++) {
    repTime++;
    if (repLimit && repTime >= repLimit) { repTime = 0; restart(); }
    arpTime++;
    if (arpLimit && arpTime >= arpLimit) { arpLimit = 0; fperiod *= arpMod; }
    fslide += fdslide;
    fperiod *= fslide;
    if (fperiod > fmaxperiod) { fperiod = fmaxperiod; if (p.freqLimit > 0) playing = false; }
    let rfperiod = fperiod;
    if (vibAmp > 0) { vibPhase += vibSpeed; rfperiod = fperiod * (1 + Math.sin(vibPhase) * vibAmp); }
    period = Math.max(8, Math.floor(rfperiod));
    squareDuty = Math.min(0.5, Math.max(0, squareDuty + squareSlide));
    envTime++;
    if (envTime > envLen[envStage]) { envTime = 0; envStage++; if (envStage === 3) break; }
    const k = envTime / envLen[envStage];
    const env = envStage === 0 ? k : envStage === 1 ? 1 + (1 - k) * 2 * p.punch : 1 - k;
    fphase += fdphase;
    const iphase = Math.min(1023, Math.abs(Math.floor(fphase)));
    if (flthpD !== 1) flthp = Math.min(0.1, Math.max(0.00001, flthp * flthpD));
    let acc = 0;
    for (let s = 0; s < 8; s++) {
      phase++;
      if (phase >= period) {
        phase %= period;
        if (p.wave === WAVE.noise) for (let j = 0; j < 32; j++) noiseBuf[j] = rand() * 2 - 1;
      }
      const fp = phase / period;
      let x;
      if (p.wave === WAVE.square) x = fp < squareDuty ? 0.5 : -0.5;
      else if (p.wave === WAVE.saw) x = 1 - fp * 2;
      else if (p.wave === WAVE.sine) x = Math.sin(fp * 2 * Math.PI);
      else x = noiseBuf[Math.floor((phase * 32) / period) % 32];
      // low pass with resonance, then high pass
      const pp = fltp;
      fltw = Math.min(0.1, Math.max(0, fltw * fltwD));
      if (p.lpf !== 1) { fltdp += (x - fltp) * fltw; fltdp -= fltdp * fltdmp; } else { fltp = x; fltdp = 0; }
      fltp += fltdp;
      fltphp += fltp - pp;
      fltphp -= fltphp * flthp;
      x = fltphp;
      // phaser
      phaser[ipp & 1023] = x;
      x += phaser[(ipp - iphase + 1024) & 1023];
      ipp = (ipp + 1) & 1023;
      acc += x * env;
    }
    out[n++] = Math.max(-1, Math.min(1, (acc / 8) * p.volume * 2));
  }
  return out.subarray(0, n);
}

const r = (rand, a, b) => a + (b - a) * rand();

// Preset generators, after the buttons of the original tool.
export const PRESETS = {
  coin: (rand) => ({
    wave: WAVE.square, freq: r(rand, 0.4, 0.9), sustain: r(rand, 0, 0.1), decay: r(rand, 0.1, 0.5), punch: r(rand, 0.3, 0.6),
    arpSpeed: rand() < 0.5 ? r(rand, 0.5, 0.7) : 0, arpMod: r(rand, 0.2, 0.6),
  }),
  laser: (rand) => ({
    wave: rand() < 0.5 ? WAVE.saw : WAVE.square, freq: r(rand, 0.5, 1), freqLimit: r(rand, 0, 0.2), slide: r(rand, -0.35, -0.15),
    duty: r(rand, 0, 0.5), dutySweep: r(rand, -0.2, 0.2), sustain: r(rand, 0.1, 0.3), decay: r(rand, 0.1, 0.5), punch: r(rand, 0, 0.3),
    phaserOffset: rand() < 0.3 ? r(rand, 0, 0.3) : 0, phaserSweep: rand() < 0.3 ? -r(rand, 0, 0.3) : 0, hpf: rand() < 0.5 ? r(rand, 0, 0.3) : 0,
  }),
  explosion: (rand) => ({
    wave: WAVE.noise, freq: r(rand, 0.1, 0.45) ** 2 + 0.05, slide: r(rand, -0.1, 0.3), sustain: r(rand, 0.1, 0.4), decay: r(rand, 0.3, 0.6),
    punch: r(rand, 0.2, 0.8), repeatSpeed: rand() < 0.5 ? r(rand, 0.3, 0.8) : 0, vibDepth: rand() < 0.5 ? r(rand, 0, 0.5) : 0, vibSpeed: r(rand, 0, 0.6),
  }),
  powerup: (rand) => ({
    wave: rand() < 0.5 ? WAVE.saw : WAVE.square, duty: r(rand, 0, 0.6), freq: r(rand, 0.2, 0.5), slide: r(rand, 0.05, 0.25),
    repeatSpeed: rand() < 0.5 ? r(rand, 0.4, 0.8) : 0, vibDepth: rand() < 0.5 ? r(rand, 0, 0.5) : 0, vibSpeed: r(rand, 0, 0.6),
    sustain: r(rand, 0, 0.4), decay: r(rand, 0.1, 0.5),
  }),
  hit: (rand) => ({
    wave: rand() < 0.6 ? WAVE.noise : WAVE.square, duty: r(rand, 0, 0.6), freq: r(rand, 0.2, 0.8), slide: r(rand, -0.7, -0.3),
    sustain: r(rand, 0, 0.1), decay: r(rand, 0.1, 0.3), hpf: rand() < 0.5 ? r(rand, 0, 0.3) : 0,
  }),
  jump: (rand) => ({
    wave: WAVE.square, duty: r(rand, 0, 0.6), freq: r(rand, 0.3, 0.6), slide: r(rand, 0.1, 0.3), sustain: r(rand, 0.1, 0.4), decay: r(rand, 0.1, 0.3),
  }),
  blip: (rand) => ({
    wave: rand() < 0.5 ? WAVE.square : WAVE.saw, duty: r(rand, 0, 0.6), freq: r(rand, 0.2, 0.6), sustain: r(rand, 0.1, 0.2), decay: r(rand, 0, 0.2), hpf: 0.1,
  }),
};

// A slightly different take on the same sound.
export function mutate(params, rand, amount = 0.05) {
  const out = { ...DEFAULTS, ...params };
  for (const k of Object.keys(out)) {
    if (k === 'wave' || k === 'volume') continue;
    if (rand() < 0.5) continue;
    const lo = ['slide', 'deltaSlide', 'dutySweep', 'lpfSweep', 'hpfSweep', 'phaserOffset', 'phaserSweep', 'arpMod'].includes(k) ? -1 : 0;
    out[k] = Math.min(1, Math.max(lo, out[k] + (rand() * 2 - 1) * amount));
  }
  return out;
}
