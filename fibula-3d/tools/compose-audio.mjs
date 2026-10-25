// Renders Fibula's original soundtrack, ambience loops and sound effects with
// tools/synth.mjs, adds CC0 sounds from Kenney's starter kits, encodes
// everything to Ogg Vorbis (ffmpeg) and writes client/assets/audio/manifest.json.
//
//   KENNEY_DIR=/path/to/kenney node tools/compose-audio.mjs
//
// KENNEY_DIR should contain clones of KenneyNL/Starter-Kit-3D-Platformer,
// Starter-Kit-FPS and Starter-Kit-City-Builder (CC0 sound effects). Without
// it only the generated audio is produced.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SR, Mix, INSTR, freq, midi, srand, rnd, noise, Biquad, reverb } from './synth.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'client', 'assets', 'audio');
const KENNEY = process.env.KENNEY_DIR || path.join(ROOT, '..', '..', 'kenney');
const ONLY = process.argv[2] || null;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fibula-audio-'));

function encode(name, data, channels, quality) {
  const raw = path.join(TMP, `${path.basename(name)}.raw`);
  fs.writeFileSync(raw, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  const out = path.join(OUT, name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', String(channels), '-i', raw,
    '-c:a', 'libvorbis', '-q:a', String(quality), out]);
  fs.rmSync(raw);
  console.log(`  ${name} ${(fs.statSync(out).size / 1024).toFixed(0)} KB`);
}

const beatsToSec = (bpm) => (b) => (b * 60) / bpm;

// chord helpers -------------------------------------------------------------------
const CH = {
  Dm: ['D', 'F', 'A'], Bb: ['Bb', 'D', 'F'], F: ['F', 'A', 'C'], C: ['C', 'E', 'G'], Gm: ['G', 'Bb', 'D'], A: ['A', 'C#', 'E'],
  Am: ['A', 'C', 'E'], G: ['G', 'B', 'D'], Em: ['E', 'G', 'B'], E: ['E', 'G#', 'B'], D: ['D', 'F#', 'A'], B: ['B', 'D#', 'F#'],
  Eb: ['Eb', 'G', 'Bb'], Db: ['Db', 'F', 'Ab'], Cm: ['C', 'Eb', 'G'], Bbm: ['Bb', 'Db', 'F'], Asus: ['A', 'D', 'E'], Cmaj7: ['C', 'E', 'G', 'B'],
};
const n = (pc, oct) => `${pc}${oct}`;
function chord(mix, inst, name, oct, at, dur, o = {}) {
  CH[name].forEach((pc, i) => {
    const octv = oct + (i > 0 && midi(n(pc, oct)) < midi(n(CH[name][0], oct)) ? 1 : 0);
    mix.note(inst, n(pc, octv), at, dur, { pan: (i - 1) * 0.35, ...o });
  });
}
function melody(mix, inst, notes, at, B, o = {}) {
  let t = 0;
  for (const [note, len] of notes) {
    if (note) mix.note(inst, note, at + B(t), B(len) * 0.95, o);
    t += len;
  }
  return t;
}

// ---------------------------------------------------------------- music
function title() {
  srand(11);
  const bpm = 84, B = beatsToSec(bpm), bars = 24;
  const mix = new Mix(B(bars * 4) + 6);
  const bar = (k) => B((k - 1) * 4);
  // intro
  mix.note('drone', 'D2', 0, bar(5), { gain: 0.35, send: 0.4 });
  chord(mix, 'choir', 'Dm', 4, bar(2), B(12), { gain: 0.16, send: 0.6 });
  for (let i = 0; i < 32; i++) mix.note('timpani', i % 2 ? 'A1' : 'D2', bar(3) + B(i * 0.25), 0.2, { v: 0.2 + (i / 32) * 0.7, gain: 0.35, send: 0.3 });
  mix.note('cymbal', 'C4', bar(4) - 0.2, B(4), { gain: 0.25, send: 0.5 });
  const prog = ['Dm', 'Bb', 'F', 'C', 'Dm', 'Gm', 'Bb', 'A', 'Bb', 'F', 'Gm', 'Dm', 'Bb', 'C', 'A', 'A'];
  // ostinato, bass, pads, drums for bars 5..20
  prog.forEach((c, k) => {
    const at = bar(5 + k);
    const [r, , fifth] = CH[c];
    const pat = [n(r, 3), n(fifth, 3), n(r, 4), n(fifth, 3)];
    for (let i = 0; i < 8; i++) mix.note('stacc', pat[i % 4], at + B(i * 0.5), B(0.4), { v: i % 2 ? 0.55 : 0.8, gain: 0.16, pan: -0.3, send: 0.25 });
    mix.note('strings', n(r, 2), at, B(4), { gain: 0.22, send: 0.3 });
    mix.note('bass', n(r, 2), at, B(1.8), { gain: 0.3, send: 0.1 });
    mix.note('bass', n(r, 2), at + B(2), B(1.8), { gain: 0.25, send: 0.1 });
    chord(mix, 'pad', c, 3, at, B(4), { gain: 0.1, send: 0.5 });
    mix.note('taiko', 'C2', at, 0.3, { v: 0.9, gain: 0.5, send: 0.2 });
    mix.note('taiko', 'C2', at + B(2), 0.3, { v: 0.7, gain: 0.45, send: 0.2 });
    if (k >= 8) {
      mix.note('taiko', 'C2', at + B(2.5), 0.3, { v: 0.5, gain: 0.4, send: 0.2 });
      mix.note('snare', 'C3', at + B(1), 0.2, { v: 0.5, gain: 0.25, send: 0.3 });
      mix.note('snare', 'C3', at + B(3), 0.2, { v: 0.6, gain: 0.25, send: 0.3 });
    }
    if (k % 4 === 0) mix.note('timpani', n(r, 2), at, 0.5, { v: 0.8, gain: 0.35 });
  });
  // A theme – brass
  melody(mix, 'brass', [['D4', 2], ['A4', 1], ['G4', 1], ['F4', 1.5], ['E4', 0.5], ['D4', 1], ['F4', 1], ['C5', 2], ['A4', 1], ['F4', 1],
    ['G4', 3], ['E4', 1], ['D4', 2], ['A4', 1], ['C5', 1], ['Bb4', 1.5], ['A4', 0.5], ['G4', 2], ['F4', 1], ['G4', 1], ['A4', 1], ['Bb4', 1], ['A4', 4]],
  bar(5), B, { gain: 0.24, send: 0.35, pan: 0.15 });
  // B theme – choir + brass an octave lower
  const themeB = [['F5', 2], ['D5', 1], ['Bb4', 1], ['C5', 2], ['A4', 1], ['F4', 1], ['G4', 1], ['A4', 1], ['Bb4', 1], ['D5', 1], ['A4', 4],
    ['F5', 1.5], ['E5', 0.5], ['D5', 1], ['Bb4', 1], ['C5', 1], ['D5', 1], ['E5', 2], ['E5', 2], ['C#5', 2], ['D5', 1], ['C#5', 1], ['E5', 2]];
  melody(mix, 'choir', themeB, bar(13), B, { gain: 0.2, send: 0.55 });
  melody(mix, 'brass', themeB.map(([nn, l]) => [nn.replace(/\d/, (d) => String(Number(d) - 1)), l]), bar(13), B, { gain: 0.2, send: 0.35, pan: -0.15 });
  mix.note('cymbal', 'C4', bar(13) - 0.6, 0.6, { gain: 0.3 });
  mix.note('cymbal', 'C4', bar(17) - 0.6, 0.6, { gain: 0.25 });
  mix.note('cymbal', 'C4', bar(21) - 1.2, 1.2, { gain: 0.35 });
  // outro
  chord(mix, 'brass', 'Dm', 3, bar(21), B(8), { gain: 0.2, send: 0.5 });
  chord(mix, 'choir', 'Dm', 4, bar(21), B(14), { gain: 0.2, send: 0.7 });
  mix.note('strings', 'D2', bar(21), B(14), { gain: 0.25 });
  mix.note('drone', 'D2', bar(21), B(14), { gain: 0.3 });
  for (let i = 0; i < 16; i++) mix.note('timpani', 'D2', bar(21) + B(i * 0.25), 0.2, { v: 0.9 - i * 0.04, gain: 0.3 });
  mix.note('taiko', 'C2', bar(21), 0.4, { gain: 0.6 });
  return mix.master({ room: 0.88, wet: 1.0, loopAt: bar(bars + 1) });
}

function town() {
  srand(22);
  const bpm = 92, B = beatsToSec(bpm);
  const A = ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C'];
  const Bs = ['Dm', 'Am', 'Bb', 'F', 'Gm', 'C', 'F', 'F'];
  const form = [[A, false], [A, true], [Bs, true], [A, true]];
  const mix = new Mix(B(32 * 4) + 6);
  const melA = [['A4', 1], ['C5', 1], ['F5', 2], ['E5', 1], ['D5', 1], ['C5', 2], ['D5', 1.5], ['C5', 0.5], ['A4', 2], ['Bb4', 1], ['C5', 1], ['D5', 2],
    ['C5', 1], ['A4', 1], ['F4', 1], ['A4', 1], ['G4', 3], ['E4', 1], ['F4', 1], ['G4', 1], ['A4', 1], ['Bb4', 1], ['C5', 4]];
  const melB = [['D5', 2], ['F5', 2], ['E5', 2], ['C5', 2], ['D5', 1], ['C5', 1], ['Bb4', 1], ['A4', 1], ['A4', 2], ['C5', 2],
    ['Bb4', 2], ['D5', 2], ['C5', 1], ['Bb4', 1], ['A4', 1], ['G4', 1], ['A4', 4], ['F4', 4]];
  form.forEach(([prog, withMel], s) => {
    const at0 = B(s * 32);
    prog.forEach((c, k) => {
      const at = at0 + B(k * 4);
      const tones = CH[c];
      const arp = [n(tones[0], 3), n(tones[1], 3), n(tones[2], 3), n(tones[0], 4), n(tones[1], 4), n(tones[2], 4), n(tones[0], 4), n(tones[2], 3)];
      for (let i = 0; i < 8; i++) mix.note('pluck', arp[i], at + B(i * 0.5), B(0.5), { v: 0.6 + (i === 0 ? 0.2 : 0), gain: 0.22, pan: -0.25 + i * 0.06, send: 0.35, opts: { bright: 0.45, ring: 1.8 } });
      mix.note('bass', n(tones[0], 2), at, B(1.6), { gain: 0.24, send: 0.1 });
      mix.note('bass', n(tones[2], 2), at + B(2), B(1.6), { gain: 0.2, send: 0.1 });
      chord(mix, 'pad', c, 4, at, B(4), { gain: 0.05, send: 0.5 });
      if (s === 3) chord(mix, 'strings', c, 3, at, B(4), { gain: 0.06, send: 0.4 });
      if (rnd() < 0.3) mix.note('bell', n(tones[1], 6), at + B(3), 0.5, { gain: 0.05, send: 0.6, opts: { decay: 2.5 } });
    });
    if (withMel) melody(mix, 'flute', prog === Bs ? melB : melA, at0, B, { gain: 0.2, send: 0.45, pan: 0.2 });
  });
  return mix.master({ room: 0.8, wet: 0.8, loopAt: B(128) });
}

function wild() {
  srand(33);
  const bpm = 72, B = beatsToSec(bpm);
  const prog = ['Am', 'Am', 'F', 'F', 'C', 'C', 'G', 'G', 'Am', 'Am', 'Em', 'Em', 'F', 'F', 'G', 'G', 'Am', 'Am', 'F', 'F', 'Dm', 'Dm', 'E', 'E'];
  const mix = new Mix(B(prog.length * 4) + 7);
  const pent = ['A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'E4', 'G4'];
  prog.forEach((c, k) => {
    const at = B(k * 4);
    if (k % 2 === 0) {
      chord(mix, 'pad', c, 3, at, B(8), { gain: 0.11, send: 0.6 });
      mix.note('strings', n(CH[c][0], 2), at, B(8), { gain: 0.12, send: 0.4 });
      mix.note('taiko', 'C2', at, 0.3, { v: 0.35, gain: 0.25, send: 0.4 });
    }
    for (let i = 0; i < 8; i++) {
      if (rnd() < 0.32) mix.note('pluck', pent[Math.floor(rnd() * pent.length)], at + B(i * 0.5), B(0.5), { v: 0.5, gain: 0.16, pan: rnd() - 0.5, send: 0.55, opts: { bright: 0.35, ring: 2.5 } });
    }
  });
  const phrases = {
    2: [['E5', 1], ['G5', 1], ['A5', 2], ['G5', 1], ['E5', 1], ['D5', 2]],
    6: [['C5', 1], ['D5', 1], ['E5', 1.5], ['D5', 0.5], ['C5', 2], ['A4', 2]],
    10: [['E5', 2], ['D5', 1], ['C5', 1], ['B4', 2], ['G4', 2]],
    14: [['A4', 1], ['C5', 1], ['E5', 2], ['D5', 4]],
    18: [['F5', 2], ['E5', 1], ['D5', 1], ['E5', 4]],
    22: [['C5', 1], ['B4', 1], ['A4', 2], ['G#4', 2], ['B4', 2]],
  };
  for (const [k, ph] of Object.entries(phrases)) melody(mix, 'flute', ph, B(Number(k) * 4), B, { gain: 0.18, send: 0.55, pan: 0.15 });
  return mix.master({ room: 0.9, wet: 1.0, loopAt: B(prog.length * 4) });
}

function night() {
  srand(44);
  const bpm = 60, B = beatsToSec(bpm);
  const prog = ['Em', 'Cmaj7', 'Am', 'B', 'Em', 'C', 'G', 'D', 'Em', 'Am', 'C', 'B', 'Em', 'Cmaj7', 'Am', 'Em'];
  const mix = new Mix(B(prog.length * 4) + 8);
  const notes = ['E5', 'G5', 'B5', 'D6', 'E6', 'A5', 'B4'];
  prog.forEach((c, k) => {
    const at = B(k * 4);
    chord(mix, 'pad', c, 3, at, B(4), { gain: 0.1, send: 0.7 });
    mix.note('drone', n(CH[c][0], 2), at, B(4), { gain: 0.08, send: 0.3 });
    const cnt = 1 + Math.floor(rnd() * 2);
    for (let i = 0; i < cnt; i++) mix.note('bell', notes[Math.floor(rnd() * notes.length)], at + B(rnd() * 3.5), 1, { v: 0.5, gain: 0.07, pan: rnd() - 0.5, send: 0.8, opts: { decay: 5, ratio: 2.0, index: 1.5 } });
    if (k >= 8) chord(mix, 'choir', c, 4, at, B(4), { gain: 0.05, send: 0.8 });
  });
  return mix.master({ room: 0.93, damp: 0.25, wet: 1.2, loopAt: B(prog.length * 4) });
}

function cave() {
  srand(55);
  const bpm = 50, B = beatsToSec(bpm), bars = 14;
  const mix = new Mix(B(bars * 4) + 8);
  mix.note('drone', 'C2', 0, B(bars * 4), { gain: 0.3, send: 0.3 });
  mix.note('drone', 'C1', 0, B(bars * 4), { gain: 0.25, send: 0.2 });
  const swells = ['Cm', 'Db', 'Cm', 'Bbm', 'Cm', 'Db', 'Bbm'];
  swells.forEach((c, i) => chord(mix, 'pad', c, 3, B(i * 8), B(8), { gain: 0.09, send: 0.7 }));
  for (let i = 0; i < bars; i++) {
    if (i % 4 === 0) mix.note('timpani', 'C2', B(i * 4), 0.5, { v: 0.4, gain: 0.3, send: 0.5 });
    if (rnd() < 0.6) mix.note('bell', ['C4', 'G3', 'Db4', 'Eb4'][Math.floor(rnd() * 4)], B(i * 4 + rnd() * 3), 1, { gain: 0.07, send: 0.8, opts: { decay: 6, ratio: 1.41, index: 2 } });
    for (let k = 0; k < 2; k++) if (rnd() < 0.7) mix.note('pluck', ['C6', 'G5', 'Db6', 'Ab5'][Math.floor(rnd() * 4)], B(i * 4 + rnd() * 4), 0.2, { v: 0.4, gain: 0.08, pan: rnd() * 1.6 - 0.8, send: 0.9, opts: { bright: 0.9, fb: 0.985, ring: 1 } });
  }
  return mix.master({ room: 0.95, damp: 0.2, wet: 1.3, loopAt: B(bars * 4) });
}

function crypt() {
  srand(66);
  const bpm = 54, B = beatsToSec(bpm);
  const prog = ['Dm', 'Bb', 'Gm', 'A', 'Dm', 'Eb', 'Gm', 'A'];
  const mix = new Mix(B(prog.length * 8) + 8);
  prog.forEach((c, k) => {
    const at = B(k * 8);
    chord(mix, 'choir', c, 3, at, B(8), { gain: 0.14, send: 0.7 });
    mix.note('drone', n(CH[c][0], 1), at, B(8), { gain: 0.18 });
    mix.note('bell', 'D3', at, 1, { gain: 0.16, send: 0.7, opts: { decay: 6, ratio: 2.76, index: 2.5 } });
    mix.note('bell', 'D3', at + B(4), 1, { gain: 0.1, send: 0.7, opts: { decay: 6, ratio: 2.76, index: 2.5 } });
    mix.note('strings', n(CH[c][2], 4), at + B(2), B(5), { gain: 0.05, send: 0.6 });
  });
  return mix.master({ room: 0.94, damp: 0.3, wet: 1.2, loopAt: B(prog.length * 8) });
}

function lair() {
  srand(77);
  const bpm = 88, B = beatsToSec(bpm);
  const prog = ['Dm', 'Dm', 'Eb', 'Dm', 'Dm', 'Dm', 'Bb', 'A'];
  const mix = new Mix(B(prog.length * 4) + 6);
  prog.forEach((c, k) => {
    const at = B(k * 4);
    for (let i = 0; i < 8; i++) mix.note('taiko', 'C2', at + B(i * 0.5), 0.3, { v: i % 4 === 0 ? 0.9 : i % 2 ? 0.35 : 0.6, gain: 0.4, send: 0.25 });
    for (let i = 0; i < 16; i++) mix.note('stacc', n(CH[c][0], 3), at + B(i * 0.25), B(0.2), { v: 0.4 + (i % 4 === 0 ? 0.3 : 0), gain: 0.12, send: 0.3 });
    chord(mix, 'brass', c, 3, at, B(1.5), { gain: 0.16, send: 0.4 });
    if (k % 2 === 1) chord(mix, 'brass', c, 3, at + B(2.5), B(1), { gain: 0.12, send: 0.4 });
    mix.note('drone', 'D1', at, B(4), { gain: 0.2 });
  });
  mix.note('cymbal', 'C4', B(28) - 1, 1, { gain: 0.25 });
  return mix.master({ room: 0.85, wet: 0.9, loopAt: B(32) });
}

function levelup() {
  srand(88);
  const B = beatsToSec(120);
  const mix = new Mix(4.5);
  melody(mix, 'brass', [['C4', 0.33], ['E4', 0.33], ['G4', 0.34], ['C5', 3]], 0, B, { gain: 0.35, send: 0.35 });
  chord(mix, 'brass', 'C', 4, B(1), B(3), { gain: 0.2, send: 0.4 });
  mix.note('timpani', 'C2', B(1), 0.5, { gain: 0.4 });
  mix.note('cymbal', 'C4', B(1) - 0.3, 0.3, { gain: 0.3 });
  for (let i = 0; i < 5; i++) mix.note('bell', ['C6', 'E6', 'G6', 'C7', 'E7'][i], B(1) + i * 0.08, 0.5, { gain: 0.06, send: 0.6, opts: { decay: 1.5 } });
  return mix.master({ room: 0.8, wet: 0.8, fadeOut: 0.6 });
}

function deathJingle() {
  srand(99);
  const B = beatsToSec(70);
  const mix = new Mix(7);
  ['Dm', 'Bb', 'Gm', 'A'].forEach((c, i) => chord(mix, 'choir', c, 3, B(i * 1.5), B(1.6), { gain: 0.2, send: 0.7 }));
  melody(mix, 'strings', [['A4', 1.5], ['F4', 1.5], ['D4', 1.5], ['C#4', 2]], 0, B, { gain: 0.2, send: 0.6 });
  mix.note('timpani', 'D2', 0, 0.5, { gain: 0.4 });
  mix.note('bell', 'D3', B(4.5), 1, { gain: 0.2, send: 0.8, opts: { decay: 4, ratio: 2.76 } });
  return mix.master({ room: 0.9, wet: 1.1, fadeOut: 1.2 });
}

// ---------------------------------------------------------------- ambience
function loopBuffer(seconds, fn, revOpts = { room: 0.85, wet: 0.6 }) {
  const extra = 4;
  const mix = new Mix(seconds + extra);
  fn(mix, seconds);
  return mix.master({ ...revOpts, loopAt: seconds, peak: 0.6 });
}

function windNoise(mix, secs, level = 1) {
  for (const [pan, sd] of [[-0.7, 1], [0.7, 2]]) {
    const len = Math.ceil((secs + 4) * SR);
    const buf = new Float32Array(len);
    const lp = new Biquad(), lp2 = new Biquad();
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      if (i % 64 === 0) { const c = 260 + 420 * (0.5 + 0.5 * Math.sin(t * 0.37 * sd + sd) * Math.sin(t * 0.13 + sd * 2)); lp.set('lp', c, 0.9); lp2.set('lp', c * 1.2, 0.7); }
      const amp = 0.55 + 0.45 * Math.sin(t * 0.21 * sd + sd) * Math.sin(t * 0.07 + 1);
      buf[i] = lp2.run(lp.run(noise())) * amp * 2.2 * level;
    }
    mix.add(buf, 0, 1, pan, 0.1);
  }
}

function chirp(mix, at, f0, f1, dur, pan, gain) {
  const len = Math.ceil(dur * SR), b = new Float32Array(len);
  let ph = 0;
  for (let i = 0; i < len; i++) {
    const t = i / len;
    ph += (f0 + (f1 - f0) * t) / SR;
    b[i] = Math.sin(2 * Math.PI * ph + 0.8 * Math.sin(2 * Math.PI * ph * 0.5)) * Math.sin(Math.PI * t);
  }
  mix.add(b, at, gain, pan, 0.4);
}

const AMB = {
  wind: () => loopBuffer(40, (mix, s) => windNoise(mix, s, 1)),
  birds: () => loopBuffer(40, (mix, s) => {
    srand(5);
    windNoise(mix, s, 0.25);
    let t = 0.5;
    while (t < s) {
      const pan = rnd() * 1.6 - 0.8, base = 2600 + rnd() * 2400, k = 2 + Math.floor(rnd() * 5);
      for (let i = 0; i < k; i++) chirp(mix, t + i * (0.09 + rnd() * 0.05), base * (1 + (rnd() - 0.3) * 0.3), base * (1.1 + rnd() * 0.4), 0.06 + rnd() * 0.05, pan, 0.12);
      t += 0.8 + rnd() * 2.5;
    }
  }),
  night: () => loopBuffer(40, (mix, s) => {
    srand(6);
    windNoise(mix, s, 0.2);
    for (let c = 0; c < 4; c++) {
      const f = 4200 + c * 320, pan = -0.7 + c * 0.45;
      let t = rnd();
      while (t < s) {
        const len = Math.ceil(0.32 * SR), b = new Float32Array(len);
        let ph = 0;
        for (let i = 0; i < len; i++) { ph += f / SR; const gate = Math.sin(Math.PI * ((i / SR) * 32 % 1)) > 0.2 ? 1 : 0; b[i] = Math.sin(2 * Math.PI * ph) * gate * Math.sin(Math.PI * i / len); }
        mix.add(b, t, 0.05, pan, 0.2);
        t += 0.7 + rnd() * 0.5;
      }
    }
    for (const at of [7, 9.5, 26]) {
      for (const [d, f] of [[0, 380], [0.45, 360]]) {
        const len = Math.ceil(0.35 * SR), b = new Float32Array(len);
        for (let i = 0; i < len; i++) b[i] = Math.sin(2 * Math.PI * f * i / SR) * Math.sin(Math.PI * i / len) ** 2;
        mix.add(b, at + d, 0.12, 0.4, 0.6);
      }
    }
  }, { room: 0.9, wet: 0.9 }),
  cave: () => loopBuffer(40, (mix, s) => {
    srand(7);
    const len = Math.ceil((s + 4) * SR), b = new Float32Array(len);
    const lp = new Biquad(); lp.set('lp', 110, 0.8);
    for (let i = 0; i < len; i++) b[i] = lp.run(noise()) * 3.5 * (0.7 + 0.3 * Math.sin(i / SR * 0.2));
    mix.add(b, 0, 1, 0, 0.2);
    let t = 0.3;
    while (t < s) {
      mix.add(INSTR.pluck(1400 + rnd() * 1800, 0.1, 0.5, { bright: 0.95, fb: 0.97, ring: 0.4 }), t, 0.18, rnd() * 1.6 - 0.8, 1.2);
      t += 0.8 + rnd() * 2.6;
    }
  }, { room: 0.95, damp: 0.2, wet: 1.4 }),
  swamp: () => loopBuffer(40, (mix, s) => {
    srand(8);
    windNoise(mix, s, 0.15);
    let t = 0.4;
    while (t < s) {
      const f = 180 + rnd() * 160, reps = 2 + Math.floor(rnd() * 3), pan = rnd() * 1.6 - 0.8;
      for (let r = 0; r < reps; r++) {
        const len = Math.ceil(0.16 * SR), b = new Float32Array(len);
        const bp = new Biquad(); bp.set('bp', f * 3, 2);
        let ph = 0;
        for (let i = 0; i < len; i++) { ph += f / SR; const pulse = (ph * 0.08) % 1 < 0.5 ? 1 : -1; b[i] = bp.run(pulse + Math.sin(2 * Math.PI * ph)) * Math.sin(Math.PI * i / len); }
        mix.add(b, t + r * 0.22, 0.25, pan, 0.3);
      }
      t += 1.2 + rnd() * 2.5;
    }
  }),
};

// ---------------------------------------------------------------- sound effects
function sfxBuf(secs, fn) {
  const len = Math.ceil(secs * SR), b = new Float32Array(len);
  fn(b, len);
  let mx = 1e-9;
  for (const x of b) mx = Math.max(mx, Math.abs(x));
  for (let i = 0; i < len; i++) b[i] = (b[i] / mx) * 0.85;
  return b;
}
function withVerb(b, wet = 0.3) {
  const [l] = reverb(b, { room: 0.7, damp: 0.4 });
  const out = new Float32Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b[i] + l[i] * wet;
  return out;
}

const SFX = {
  swing: () => sfxBuf(0.28, (b, n) => { const bp = new Biquad(); for (let i = 0; i < n; i++) { const t = i / n; if (i % 32 === 0) bp.set('bp', 500 + 2400 * Math.sin(Math.PI * t), 1.2); b[i] = bp.run(noise()) * Math.sin(Math.PI * t) ** 1.5; } }),
  hit: () => sfxBuf(0.25, (b, n) => { const lp = new Biquad(); lp.set('lp', 1800, 0.7); let p = 0; for (let i = 0; i < n; i++) { const t = i / SR; p += (60 + 80 * Math.exp(-t * 40)) / SR; b[i] = Math.sin(2 * Math.PI * p) * Math.exp(-t * 18) + lp.run(noise()) * Math.exp(-t * 45) * 0.8; } }),
  hit_bone: () => sfxBuf(0.18, (b, n) => { const bp = new Biquad(); bp.set('bp', 1600, 4); for (let i = 0; i < n; i++) { const t = i / SR; b[i] = bp.run(noise()) * Math.exp(-t * 35) * 2 + Math.sin(2 * Math.PI * 620 * t) * Math.exp(-t * 40) * 0.5; } }),
  block: () => withVerb(sfxBuf(0.5, (b, n) => { for (let i = 0; i < n; i++) { const t = i / SR; let x = 0; for (const [f, d] of [[2300, 9], [3170, 11], [4410, 14], [5830, 18]]) x += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * d); b[i] = x * 0.4 + noise() * Math.exp(-t * 80) * 0.6; } }), 0.2),
  crossbow: () => sfxBuf(0.35, (b) => { const p = INSTR.pluck(170, 0.1, 0.9, { bright: 0.9, fb: 0.985, ring: 0.3 }); for (let i = 0; i < b.length; i++) b[i] = (p[i] || 0) + noise() * Math.exp(-(i / SR) * 60) * 0.5; }),
  wand: () => withVerb(sfxBuf(0.4, (b, n) => { let p = 0; for (let i = 0; i < n; i++) { const t = i / n; p += (800 + 2200 * t * t) / SR; b[i] = Math.sin(2 * Math.PI * p) * (1 - t) * 0.6 + Math.sin(2 * Math.PI * p * 2.01) * (1 - t) * 0.3; } }), 0.4),
  fire: () => sfxBuf(0.8, (b, n) => { const lp = new Biquad(); lp.set('lp', 1100, 0.7); for (let i = 0; i < n; i++) { const t = i / n; const crack = rnd() < 0.002 ? 3 : 1; b[i] = lp.run(noise()) * Math.sin(Math.PI * Math.min(1, t * 3)) * (1 - t) * crack + Math.sin(2 * Math.PI * 70 * i / SR) * (1 - t) * 0.4; } }),
  energy: () => sfxBuf(0.45, (b, n) => { let p = 0; for (let i = 0; i < n; i++) { const t = i / n; p += (120 + 60 * Math.sin(t * 40)) / SR; const saw = 2 * (p % 1) - 1; b[i] = saw * Math.sin(2 * Math.PI * 1300 * i / SR * (1 + t)) * (1 - t) + noise() * 0.2 * (1 - t); } }),
  ice: () => withVerb(sfxBuf(0.7, (b, n) => { for (const [f, at] of [[2100, 0], [2650, 0.04], [3300, 0.09], [3950, 0.13]]) { const s = Math.floor(at * SR); for (let i = s; i < n; i++) { const t = (i - s) / SR; b[i] += Math.sin(2 * Math.PI * f * t + 2 * Math.sin(2 * Math.PI * f * 1.4 * t) * Math.exp(-t * 8)) * Math.exp(-t * 7); } } }), 0.5),
  earth: () => sfxBuf(0.6, (b, n) => { const lp = new Biquad(); lp.set('lp', 700, 0.7); let p = 0; for (let i = 0; i < n; i++) { const t = i / SR; p += (50 + 60 * Math.exp(-t * 20)) / SR; b[i] = Math.sin(2 * Math.PI * p) * Math.exp(-t * 7) + lp.run(noise()) * Math.exp(-t * 6) * (rnd() < 0.01 ? 2 : 0.7); } }),
  poison: () => sfxBuf(0.6, (b, n) => { for (let k = 0; k < 6; k++) { const s = Math.floor(rnd() * 0.45 * SR), len = Math.floor(0.07 * SR), f0 = 220 + rnd() * 200; let p = 0; for (let i = 0; i < len && s + i < n; i++) { const t = i / len; p += (f0 * (1 + t * 1.5)) / SR; b[s + i] += Math.sin(2 * Math.PI * p) * Math.sin(Math.PI * t); } } }),
  dark: () => withVerb(sfxBuf(0.9, (b, n) => { const lp = new Biquad(); let p = 0; for (let i = 0; i < n; i++) { const t = i / n; if (i % 32 === 0) lp.set('lp', 200 + 900 * t * (1 - t) * 4, 2); p += 65 / SR; b[i] = lp.run(2 * (p % 1) - 1 + noise() * 0.3) * Math.sin(Math.PI * t); } }), 0.5),
  holy: () => withVerb(sfxBuf(1.0, (b, n) => { for (const f of [freq('C6'), freq('E6'), freq('G6'), freq('C7')]) for (let i = 0; i < n; i++) { const t = i / SR; b[i] += Math.sin(2 * Math.PI * f * t) * Math.min(1, t * 20) * Math.exp(-t * 3) * (1 + 0.3 * Math.sin(t * 30)); } }), 0.6),
  heal: () => withVerb(sfxBuf(0.9, (b, n) => { ['C5', 'E5', 'G5', 'C6'].forEach((nn, k) => { const p = INSTR.pluck(freq(nn), 0.2, 0.8, { bright: 0.6, ring: 0.8 }); const s = Math.floor(k * 0.07 * SR); for (let i = 0; i < p.length && s + i < n; i++) b[s + i] += p[i]; }); }), 0.6),
  teleport: () => withVerb(sfxBuf(0.7, (b, n) => { const bp = new Biquad(); let p = 0; for (let i = 0; i < n; i++) { const t = i / n; if (i % 32 === 0) bp.set('bp', 300 + 4000 * t, 3); p += (300 + 1200 * t) / SR; b[i] = bp.run(noise()) * Math.sin(Math.PI * t) + Math.sin(2 * Math.PI * p) * 0.3 * Math.sin(Math.PI * t); } }), 0.5),
  explosion: () => sfxBuf(1.4, (b, n) => { const lp = new Biquad(); lp.set('lp', 900, 0.7); let p = 0; for (let i = 0; i < n; i++) { const t = i / SR; p += (40 + 50 * Math.exp(-t * 10)) / SR; b[i] = lp.run(noise()) * Math.exp(-t * 3) * 1.4 + Math.sin(2 * Math.PI * p) * Math.exp(-t * 4) + (rnd() < 0.003 ? noise() * 2 * Math.exp(-t * 2) : 0); } }),
  sparkle: () => withVerb(sfxBuf(0.7, (b, n) => { for (let k = 0; k < 7; k++) { const s = Math.floor(rnd() * 0.4 * SR), f = 2500 + rnd() * 3000; for (let i = s; i < n; i++) { const t = (i - s) / SR; b[i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 18); } } }), 0.5),
  haste: () => sfxBuf(0.45, (b, n) => { const bp = new Biquad(); for (let i = 0; i < n; i++) { const t = i / n; if (i % 32 === 0) bp.set('bp', 400 + 3000 * t, 2); b[i] = bp.run(noise()) * Math.sin(Math.PI * t); } }),
  shield: () => withVerb(sfxBuf(0.8, (b, n) => { for (let i = 0; i < n; i++) { const t = i / SR; const e = Math.min(1, t * 8) * Math.exp(-t * 3); b[i] = (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 330 * t) * 0.7 + Math.sin(2 * Math.PI * 440 * t) * 0.5) * e * (0.8 + 0.2 * Math.sin(t * 40)); } }), 0.4),
  poff: () => sfxBuf(0.25, (b, n) => { const lp = new Biquad(); lp.set('lp', 700, 0.7); for (let i = 0; i < n; i++) { const t = i / n; b[i] = lp.run(noise()) * Math.sin(Math.PI * t) ** 2; } }),
  skillup: () => withVerb(sfxBuf(0.9, (b, n) => { [['E6', 0], ['A6', 0.12]].forEach(([nn, at]) => { const f = freq(nn), s = Math.floor(at * SR); for (let i = s; i < n; i++) { const t = (i - s) / SR; b[i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 5); } }); }), 0.5),
  npc: () => sfxBuf(0.1, (b, n) => { let p = 0; for (let i = 0; i < n; i++) { const t = i / n; p += (520 + 180 * t) / SR; b[i] = (p % 1 < 0.5 ? 1 : -1) * 0.3 * Math.sin(Math.PI * t); } }),
  pm: () => withVerb(sfxBuf(0.5, (b, n) => { [['G5', 0], ['C6', 0.1]].forEach(([nn, at]) => { const p = INSTR.pluck(freq(nn), 0.1, 0.8, { bright: 0.7, ring: 0.4 }); const s = Math.floor(at * SR); for (let i = 0; i < p.length && s + i < n; i++) b[s + i] += p[i]; }); }), 0.3),
  open: () => sfxBuf(0.4, (b, n) => { const bp = new Biquad(); bp.set('bp', 700, 3); let p = 0; for (let i = 0; i < n; i++) { const t = i / n; p += (90 + 30 * Math.sin(t * 30)) / SR; b[i] = bp.run(2 * (p % 1) - 1) * Math.sin(Math.PI * t) + (i < 600 ? noise() * 0.5 : 0); } }),
};

// ---------------------------------------------------------------- Kenney CC0 sounds
function kenney(rel) { const p = path.join(KENNEY, rel); return fs.existsSync(p) ? p : null; }

function convert(src, name, opts = []) {
  const out = path.join(OUT, name);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, ...opts, '-ac', '1', '-c:a', 'libvorbis', '-q:a', '4', out]);
  console.log(`  ${name} (Kenney CC0)`);
}

function kenneySounds(manifest) {
  const add = (key, file) => { (manifest.sfx[key] = manifest.sfx[key] || []).push(file); };
  const coin = kenney('Starter-Kit-3D-Platformer/sounds/coin.ogg');
  if (coin) { convert(coin, 'sfx/coin.ogg'); add('coin', 'sfx/coin.ogg'); }
  for (const s of ['a', 'b', 'c', 'd']) {
    const p = kenney(`Starter-Kit-City-Builder/sounds/placement-${s}.ogg`);
    if (p) { convert(p, `sfx/pickup-${s}.ogg`); add('pickup', `sfx/pickup-${s}.ogg`); }
  }
  const tog = kenney('Starter-Kit-City-Builder/sounds/toggle.ogg');
  if (tog) { convert(tog, 'sfx/ui.ogg'); add('ui', 'sfx/ui.ogg'); }
  const imp = kenney('Starter-Kit-Racing/audio/impact.ogg');
  if (imp) { convert(imp, 'sfx/impact.ogg'); add('hit', 'sfx/impact.ogg'); }
  const brk = kenney('Starter-Kit-3D-Platformer/sounds/break.ogg');
  if (brk) { convert(brk, 'sfx/break.ogg'); add('hit_bone', 'sfx/break.ogg'); }
  // footsteps: split the FPS walking loop into single steps
  const walk = kenney('Starter-Kit-FPS/sounds/walking.ogg');
  if (walk) {
    const starts = [0.37, 0.74, 1.18, 1.61];
    starts.forEach((s, i) => {
      convert(walk, `sfx/step-${i + 1}.ogg`, ['-af', `atrim=start=${s}:duration=0.3,asetpts=PTS-STARTPTS,afade=t=out:st=0.22:d=0.08,volume=12dB`]);
      add('step', `sfx/step-${i + 1}.ogg`);
    });
  }
  const amb = kenney('Starter-Kit-City-Builder/sounds/ambience.ogg');
  if (amb) {
    const out = path.join(OUT, 'amb/town.ogg');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', amb, '-c:a', 'libvorbis', '-q:a', '1', out]);
    manifest.ambience.day = 'amb/town.ogg';
    console.log('  amb/town.ogg (Kenney CC0)');
  }
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = { music: {}, ambience: {}, sfx: {} };
  const music = { title, town, wild, night, cave, crypt, lair, levelup, death: deathJingle };
  console.log('Music');
  for (const [k, fn] of Object.entries(music)) {
    const file = `music/${k}.ogg`;
    if (!ONLY || ONLY === k) encode(file, fn(), 2, 2);
    manifest.music[k] = file;
  }
  console.log('Ambience');
  for (const [k, fn] of Object.entries(AMB)) {
    const file = `amb/${k}.ogg`;
    if (!ONLY || ONLY === k) encode(file, fn(), 2, 1);
    manifest.ambience[k] = file;
  }
  console.log('Sound effects');
  for (const [k, fn] of Object.entries(SFX)) {
    const file = `sfx/${k}.ogg`;
    if (!ONLY || ONLY === k) encode(file, fn(), 1, 4);
    manifest.sfx[k] = [file];
  }
  manifest.sfx.levelup = ['music/levelup.ogg'];
  manifest.sfx.death_jingle = ['music/death.ogg'];
  kenneySounds(manifest);
  manifest.music.swamp = manifest.music.wild;
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log('manifest.json written');
}

main();
