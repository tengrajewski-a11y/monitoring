// Item icons, 34x34 pixel art. Most come from two public-domain (CC0) packs
// baked into an atlas by tools/build-icons.py (see CREDITS.md); the rest are
// drawn here. Every drawn icon is a few parts (blade,
// guard, grip...) drawn as smooth vector paths, rasterised 4x supersampled
// into crisp pixel masks, then shaded one part at a time: a rounded bevel
// (from the distance to the part's edge) lit from the top-left, a hue-shifted
// colour ramp per material (metal glints, wood grain, chain links, scales,
// cloth dithering), dark separation lines between parts and a tinted outline.
// Shapes are authored freely and fitted to the frame. All art is generated
// here; results are cached per item id.

import { ITEMS } from '/shared/items.js';

const S = 34;           // output size (a slot shows it 1:1)
const SS = 4;           // supersampling of the masks
const TONES = 7;        // shading ramp length (plus a glint tone)
const cache = new Map();

// ---------------------------------------------------------------- colours
function hex(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// dark tones lean cool and saturated, light tones warm, the last one is a glint
function ramp(base) {
  const out = [];
  for (let k = 0; k < TONES; k++) {
    const t = k / (TONES - 1);
    const f = 0.3 + t * 0.88;
    let c = base.map((v) => clamp(v * f, 0, 255));
    if (t < 0.5) c = mix(c, [38, 26, 64], (0.5 - t) * 0.42);
    if (t > 0.6) c = mix(c, [255, 246, 214], (t - 0.6) * 0.75);
    out.push(c.map(Math.round));
  }
  out.push(mix(base, [255, 255, 250], 0.85));
  return out;
}

const MAT = {
  metal: { amb: 0.1, dif: 0.85, spec: 0.95, shin: 16, bevel: 2.2, glint: true },
  gold: { amb: 0.2, dif: 0.85, spec: 0.75, shin: 12, bevel: 2.2, glint: true },
  wood: { amb: 0.36, dif: 0.75, spec: 0.06, shin: 4, bevel: 1.6, dither: true, grain: true },
  leather: { amb: 0.34, dif: 0.78, spec: 0.22, shin: 6, bevel: 2.4, dither: true },
  cloth: { amb: 0.4, dif: 0.7, spec: 0, bevel: 2.8, dither: true },
  chain: { amb: 0.3, dif: 0.85, spec: 0.45, shin: 8, bevel: 2.6, pattern: 'chain' },
  scales: { amb: 0.3, dif: 0.85, spec: 0.55, shin: 10, bevel: 2.6, pattern: 'scales' },
  gem: { amb: 0.36, dif: 0.7, spec: 1.3, shin: 22, bevel: 3.5, linear: true, glint: true },
  glass: { amb: 0.42, dif: 0.5, spec: 1.2, shin: 26, bevel: 2.5, glint: true },
  liquid: { amb: 0.36, dif: 0.75, spec: 0.9, shin: 18, bevel: 4, glint: true },
  bone: { amb: 0.4, dif: 0.72, spec: 0.25, shin: 8, bevel: 2.2, dither: true },
  organic: { amb: 0.36, dif: 0.75, spec: 0.35, shin: 10, bevel: 3.2, dither: true },
  fur: { amb: 0.36, dif: 0.74, spec: 0, bevel: 2.6, dither: true, pattern: 'fur' },
  gel: { amb: 0.42, dif: 0.6, spec: 1.2, shin: 16, bevel: 4.5, glint: true },
  paint: { amb: 0.32, dif: 0.82, spec: 0.3, shin: 10, bevel: 1.6 },
  fire: { emissive: true, bevel: 3 },
  flat: { amb: 0.85, dif: 0.25, spec: 0, bevel: 1 },
};
const LIGHT = (() => { const v = [-0.55, -0.75, 0.95]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
const HALF = (() => { const v = [LIGHT[0], LIGHT[1], LIGHT[2] + 1]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
const BAYER = [0, 0.5, 0.75, 0.25];

// a metal-looking colour (grey, light) unless asked otherwise
function autoMat(c) {
  const [r, g, b] = hex(c), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx > 110 && mx - mn < 45) return 'metal';
  if (r > 180 && g > 140 && b < 90) return 'gold';
  return 'paint';
}

// ---------------------------------------------------------------- authoring
// Shapes are canvas path callbacks in free local units (about one pixel each);
// rot() turns the following shapes, e.g. 45 degrees for diagonal weapons.
class Icon {
  constructor() { this.ops = []; this.m = [1, 0, 0, 1, 0, 0]; this.target = 30; this.maxScale = 1.4; }
  rot(deg, tx = 0, ty = 0) {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    this.m = [c, s, -s, c, tx, ty];
    return this;
  }
  size(px, maxScale = this.maxScale) { this.target = px; this.maxScale = maxScale; return this; }
  // a solid part: path, colour (0xRRGGBB), material, { stroke: width, evenodd, sep: false }
  part(path, col, mat = autoMat(col), opts = {}) {
    this.ops.push({ kind: 'part', path, col, mat: MAT[mat] ? mat : 'paint', opts, m: this.m });
    return this;
  }
  // a detail painted onto the part below it: tone shift (-3..+3) or { stroke }
  mark(path, tone, opts = {}) {
    this.ops.push({ kind: 'mark', path, tone, opts, m: this.m });
    return this;
  }
}

// path helpers
const rr = (x, y, w, h, r) => (g) => g.roundRect(x, y, w, h, r);
const circ = (x, y, r) => (g) => g.arc(x, y, r, 0, Math.PI * 2);
const ell = (x, y, rx, ry, a = 0) => (g) => g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2);
const poly = (...pts) => (g) => { g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); };
const line = (...pts) => (g) => { g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); };
const quad = (x0, y0, cx, cy, x1, y1) => (g) => { g.moveTo(x0, y0); g.quadraticCurveTo(cx, cy, x1, y1); };
const many = (...fns) => (g) => { for (const f of fns) { f(g); g.moveTo(0, 0); } };

// ---------------------------------------------------------------- rasterising
let scratch = null;
function canvas(n) {
  if (!scratch) scratch = document.createElement('canvas');
  if (scratch.width !== n) { scratch.width = n; scratch.height = n; }
  return scratch.getContext('2d', { willReadFrequently: true });
}

// mask of one op on an n x n pixel grid, with the fit transform [k, ox, oy]
function rasterOp(op, n, fit) {
  const N = n * SS, g = canvas(N);
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, N, N);
  const [k, ox, oy] = fit, [a, b, c, d, e, f] = op.m;
  g.setTransform(SS * k * a, SS * k * b, SS * k * c, SS * k * d, SS * (k * e + ox), SS * (k * f + oy));
  g.beginPath();
  op.path(g);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  const w = op.opts.stroke;
  if (w) { g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; g.stroke(); } else g.fill(op.opts.evenodd ? 'evenodd' : 'nonzero');
  const data = g.getImageData(0, 0, N, N).data;
  const mask = new Uint8Array(n * n);
  const need = SS * SS * 255 * (op.kind === 'mark' ? 0.35 : 0.45);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    let sum = 0;
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) sum += data[((y * SS + j) * N + x * SS + i) * 4 + 3];
    if (sum >= need) mask[y * n + x] = 1;
  }
  return mask;
}

// scale and offset that fit the union of the parts into the frame
function fitOf(icon) {
  const n = 96, union = new Uint8Array(n * n);
  for (const op of icon.ops) if (op.kind === 'part') rasterOp(op, n, [1, 48, 48]).forEach((v, i) => { if (v) union[i] = 1; });
  let x0 = n, y0 = n, x1 = -1, y1 = -1;
  union.forEach((v, i) => { if (v) { const x = i % n, y = (i / n) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
  if (x1 < 0) return [1, S / 2, S / 2];
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const k = Math.min(icon.maxScale, icon.target / Math.max(w, h));
  const cx = (x0 + x1 + 1) / 2 - 48, cy = (y0 + y1 + 1) / 2 - 48;
  return [k, Math.round(S / 2 - cx * k), Math.round(S / 2 - cy * k)];
}

// chamfer distance (in pixels) to the outside of the mask
function distance(mask) {
  const d = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) d[i] = mask[i] ? 1e9 : 0;
  const at = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? 0 : d[y * S + x]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    if (!mask[i]) continue;
    d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.41, at(x + 1, y - 1) + 1.41);
  }
  for (let y = S - 1; y >= 0; y--) for (let x = S - 1; x >= 0; x--) {
    const i = y * S + x;
    if (!mask[i]) continue;
    d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.41, at(x - 1, y + 1) + 1.41);
  }
  return d;
}

function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }

// continuous tone (0..TONES-1, more = glint) of every pixel of a part
function shadePart(mask, mat) {
  const M = MAT[mat], d = distance(mask), tone = new Float32Array(S * S);
  const bevel = M.bevel;
  const h = (x, y) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return 0;
    const t = Math.min(1, d[y * S + x] / bevel);
    return (M.linear ? t : Math.sqrt(1 - (1 - t) * (1 - t))) * bevel;
  };
  let best = -1, bestI = -1;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x;
    if (!mask[i]) continue;
    let I;
    if (M.emissive) I = 0.75 + 0.55 * Math.min(1, d[i] / bevel);
    else {
      let nx = (h(x - 1, y) - h(x + 1, y)) / 2, ny = (h(x, y - 1) - h(x, y + 1)) / 2, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const dif = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      const spec = M.spec ? Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]) ** M.shin * M.spec : 0;
      // a soft top-left to bottom-right gradient so wide flat areas are not flat
      I = M.amb + M.dif * dif + spec + 0.14 * (0.5 - (x + y) / (2 * S));
    }
    let v = ((I - 0.2) / 1.05) * (TONES - 1);
    if (M.grain) v -= ((x + 2 * y + Math.floor(hash(x - y, 3) * 3)) % 5 === 0 ? 0.9 : 0);
    if (M.pattern === 'chain') v += ((x + (y % 2)) % 2 === 0 ? 0.6 : -0.6) - (y % 2 === 0 ? 0.25 : 0);
    if (M.pattern === 'scales') {
      const row = Math.floor(y / 3), u = (x + (row % 2) * 2) % 4, w = y % 3;
      v += w === 2 ? -1.1 : u === 0 ? -0.5 : w === 0 ? 0.5 : 0;
    }
    if (M.pattern === 'fur') v += hash(x, y) < 0.22 ? -0.8 : hash(y, x) < 0.12 ? 0.6 : 0;
    v = clamp(v, 0, TONES - 1);
    tone[i] = M.dither ? Math.floor(v + BAYER[(y % 2) * 2 + (x % 2)]) : Math.round(v);
    tone[i] = clamp(tone[i], 0, TONES - 1);
    if (M.glint && I > bestI) { bestI = I; best = i; }
  }
  if (best >= 0) tone[best] = TONES;   // one bright glint on shiny parts
  return tone;
}

function render(icon) {
  const fit = fitOf(icon);
  const owner = new Int16Array(S * S).fill(-1), tone = new Float32Array(S * S);
  const parts = [];
  for (const op of icon.ops) {
    const mask = rasterOp(op, S, fit);
    if (op.kind === 'part') {
      const idx = parts.length;
      parts.push({ ramp: ramp(hex(op.col)), sep: op.opts.sep !== false });
      const t = shadePart(mask, op.mat);
      for (let i = 0; i < S * S; i++) if (mask[i]) { owner[i] = idx; tone[i] = t[i]; }
    } else {
      // marks change the tone of the pixels of the part(s) they touch
      const on = op.opts.on ?? parts.length - 1;
      for (let i = 0; i < S * S; i++) {
        if (!mask[i] || owner[i] < 0 || (on !== 'any' && owner[i] !== on)) continue;
        tone[i] = op.tone === 'glint' ? TONES : clamp(tone[i] + op.tone, 0, TONES - 1);
      }
    }
  }
  const out = new Array(S * S).fill(null);
  const own = (x, y) => (x < 0 || y < 0 || x >= S || y >= S ? -1 : owner[y * S + x]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = y * S + x, o = owner[i];
    if (o >= 0) {
      let t = tone[i];
      // a dark line where a part lies under a later one
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = own(x + dx, y + dy);
        if (n > o && parts[n].sep && parts[o].sep) { t = Math.min(t, 0); break; }
      }
      out[i] = parts[o].ramp[t];
      continue;
    }
    // tinted outline around the whole icon (4-neighbours keep the corners round)
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = own(x + dx, y + dy);
      if (n >= 0) { out[i] = mix(parts[n].ramp[0], [12, 8, 6], 0.62); break; }
    }
  }
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  out.forEach((v, i) => {
    if (!v) return;
    img.data[i * 4] = v[0]; img.data[i * 4 + 1] = v[1]; img.data[i * 4 + 2] = v[2]; img.data[i * 4 + 3] = 255;
  });
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ---------------------------------------------------------------- drawings
// (I, [a, b, c]) with the item's three colours; diagonal weapons are drawn
// pointing up and turned 45 degrees.

function blade(I, [a, b, c], len, o = {}) {
  const w = o.w ?? 2.4, gw = o.guard ?? 7.5;
  I.rot(45);
  I.part((g) => { g.moveTo(-w, 5); g.lineTo(-w, -len + 5); g.lineTo(0, -len); g.lineTo(w, -len + 5); g.lineTo(w, 5); g.closePath(); }, a, o.bladeMat || 'metal');
  I.mark(line(0, -len + 4.5, 0, 3), -1, { stroke: 1 });
  if (o.runes) for (let y = -len + 7; y < 2; y += 3.5) I.mark(line(-0.8, y, 0.8, y - 1), 3, { stroke: 0.9 });
  I.part(rr(-1.5, 7.5, 3, o.grip ?? 7.5, 0.8), b, 'leather');
  for (let y = 9; y < 7.5 + (o.grip ?? 7.5); y += 2) I.mark(line(-1.6, y, 1.6, y - 0.8), -2, { stroke: 0.7 });
  I.part((g) => { g.moveTo(-gw, 5.6); g.quadraticCurveTo(-gw - 1.3, 4.2, -gw - 0.5, 3.6); g.lineTo(-gw + 1, 5); g.lineTo(gw - 1, 5); g.lineTo(gw + 0.5, 3.6); g.quadraticCurveTo(gw + 1.3, 4.2, gw, 5.6); g.quadraticCurveTo(gw, 7.8, gw - 2, 7.8); g.lineTo(-gw + 2, 7.8); g.quadraticCurveTo(-gw, 7.8, -gw, 5.6); g.closePath(); }, c);
  I.part(circ(0, 7.5 + (o.grip ?? 7.5) + 2, 2.4), c);
}

function headOnShaft(I, [a, b, c], shaftTop, shaftBottom, shaftW = 2.8) {
  I.rot(45);
  I.part(rr(-shaftW / 2, shaftTop, shaftW, shaftBottom - shaftTop, shaftW / 2), b, 'wood');
}

const DRAW = {
  dagger: (I, [a, b, c]) => {
    I.rot(45);
    I.part((g) => { g.moveTo(-2.3, 3); g.lineTo(-2.3, -5); g.quadraticCurveTo(-1.8, -10.5, 0.6, -13); g.quadraticCurveTo(2.6, -8, 2.3, 3); g.closePath(); }, a, 'metal');
    I.mark(line(0.2, -10, 0.2, 2), -1, { stroke: 0.9 });
    I.part(rr(-1.3, 5, 2.6, 6, 0.7), b, 'leather');
    I.mark(line(-1.4, 7, 1.4, 6.3), -2, { stroke: 0.7 });
    I.mark(line(-1.4, 9, 1.4, 8.3), -2, { stroke: 0.7 });
    I.part(rr(-5.2, 3, 10.4, 2.4, 1.2), c);
    I.part(circ(0, 12.2, 1.9), c);
  },
  sword: (I, col) => blade(I, col, 19),
  longsword: (I, col, it) => blade(I, col, 23, { guard: 8.6, grip: 8.5, runes: it.key === 'runed_sword', bladeMat: it.key === 'runed_sword' ? 'gem' : 'metal' }),
  axe: (I, [a, b, c]) => {
    headOnShaft(I, [a, b, c], -13, 20);
    I.part((g) => { g.moveTo(2, -10.5); g.lineTo(-3, -10); g.quadraticCurveTo(-6.5, -11, -9.5, -16.5); g.quadraticCurveTo(-15, -7.5, -9.5, 1.5); g.quadraticCurveTo(-6.5, -3.5, -3, -4.5); g.lineTo(2, -4.5); g.closePath(); }, a, 'metal');
    I.mark(quad(-9.8, -15.8, -14.6, -7.5, -9.8, 0.8), 3, { stroke: 1 });
    I.mark(quad(-7.5, -13, -11, -7.5, -7.5, -2), -1, { stroke: 0.8 });
    I.part(rr(1.3, -11.5, 3.4, 8, 1.2), c, 'metal');
    I.mark(circ(-0.6, -7.5, 0.8), -2);
  },
  bigaxe: (I, [a, b, c], it) => {
    if (it.key === 'orc_cleaver') {
      headOnShaft(I, [a, b, c], -8, 21, 3.2);
      for (let y = 12; y < 20; y += 2) I.mark(line(-1.7, y, 1.7, y - 1), -2, { stroke: 0.8 });
      I.part((g) => { g.moveTo(1.8, -18); g.lineTo(-10, -20); g.quadraticCurveTo(-15, -11, -11.5, -1); g.lineTo(-6, -2.5); g.lineTo(-7, 0.5); g.lineTo(1.8, -2); g.closePath(); }, a, 'metal');
      I.mark(quad(-10, -19.5, -15, -11, -11.5, -1.5), 2, { stroke: 1.1 });
      for (const [x, y] of [[-6, -14], [-3, -8], [-8, -6]]) I.mark(circ(x, y, 1.1), -2);
      I.mark(circ(-2, -15, 1.4), -3);
      I.part(rr(1.4, -17, 2.6, 13, 1), c, 'metal');
      return;
    }
    headOnShaft(I, [a, b, c], -17, 21, 3);
    const bit = (s) => (g) => { g.moveTo(0, -11.5); g.lineTo(s * 3.5, -11); g.quadraticCurveTo(s * 7.5, -12, s * 11, -18); g.quadraticCurveTo(s * 17, -8.5, s * 11, 1); g.quadraticCurveTo(s * 7.5, -4.5, s * 3.5, -5.5); g.lineTo(0, -5.5); g.closePath(); };
    I.part(bit(-1), a, 'metal');
    I.mark(quad(-11.3, -17.2, -16.6, -8.5, -11.3, 0.2), 3, { stroke: 1 });
    I.part(bit(1), a, 'metal');
    I.mark(quad(11.3, -17.2, 16.6, -8.5, 11.3, 0.2), 1, { stroke: 1 });
    I.part(rr(-2.6, -15.5, 5.2, 14, 1.2), c, 'metal');
    I.part(poly(0, -21, -2, -15.5, 2, -15.5), c, 'metal');
  },
  club: (I, [a, b, c], it) => {
    I.rot(45);
    if (it.key === 'bone_club') {
      I.part(rr(-1.8, -9, 3.6, 27, 1.6), a, 'bone');
      I.part(many(circ(-2.6, -11.5, 3.5), circ(2.6, -11.5, 3.5), circ(0, -14.5, 3.4)), a, 'bone');
      I.mark(line(-1, -12, 0.5, -9.5), -2, { stroke: 0.8 });
      I.part(many(circ(-1.9, 18.5, 2.3), circ(1.9, 18.5, 2.3)), b, 'bone');
      I.mark(line(-0.4, 2, 0.6, 6), -1, { stroke: 0.7 });
      return;
    }
    I.part((g) => { g.moveTo(-1.6, 19); g.lineTo(1.6, 19); g.lineTo(3.6, -5); g.quadraticCurveTo(5.6, -16, 0, -18.5); g.quadraticCurveTo(-5.6, -16, -3.6, -5); g.closePath(); }, a, 'wood');
    for (const [x, y] of [[1.4, -11], [-1.8, -4], [1, 2.5]]) I.mark(ell(x, y, 1.2, 0.8), -2);
    I.part(rr(-2, 11.5, 4, 8, 1), c, 'leather');
    for (let y = 13; y < 19; y += 2) I.mark(line(-2.1, y, 2.1, y - 1), -2, { stroke: 0.7 });
  },
  mace: (I, [a, b, c], it) => {
    I.rot(45);
    I.part(rr(-1.5, -6, 3, 26, 1.2), b, 'wood');
    for (let y = 12; y < 19; y += 2) I.mark(line(-1.6, y, 1.6, y - 1), -2, { stroke: 0.7 });
    I.part(circ(0, 21, 1.9), c, 'metal');
    if (it.key === 'morning_star') {
      const spikes = (g) => {
        for (let k = 0; k < 8; k++) {
          const t = (k / 8) * Math.PI * 2, cx = Math.cos(t), cy = Math.sin(t);
          g.moveTo(cx * 9.5, -11 + cy * 9.5); g.lineTo(cx * 4 - cy * 1.5, -11 + cy * 4 + cx * 1.5); g.lineTo(cx * 4 + cy * 1.5, -11 + cy * 4 - cx * 1.5); g.closePath();
        }
      };
      I.part(spikes, c, 'metal');
      I.part(circ(0, -11, 5.8), a, 'metal');
      I.mark(circ(-2, -13, 1), 2);
    } else {
      I.part(many(...[0, 1, 2, 3, 4, 5].map((k) => { const t = (k / 6) * Math.PI * 2 + 0.3; return ell(Math.cos(t) * 5, -11 + Math.sin(t) * 5, 2.4, 2.4); })), c, 'metal');
      I.part(circ(0, -11, 4.8), a, 'metal');
      I.part(poly(0, -19, -1.6, -15, 1.6, -15), c, 'metal');
    }
    I.part(rr(-2.6, -6.5, 5.2, 2.6, 1), c, 'metal');
  },
  bow: (I, [a, b, c]) => {
    // crossbow: stock, steel or wooden prod and the string pulled back to the nut
    I.rot(45);
    I.part(many(line(-13.5, -7, 0, 2), line(13.5, -7, 0, 2)), b, 'flat', { stroke: 0.8, sep: false });
    I.part(quad(-13.5, -6, 0, -16.5, 13.5, -6), c, 'wood', { stroke: 2.6 });
    I.part((g) => { g.moveTo(-1.7, -15); g.lineTo(1.7, -15); g.lineTo(2.4, 8); g.quadraticCurveTo(4.2, 13, 3.6, 20); g.lineTo(-3.6, 20); g.quadraticCurveTo(-4.2, 13, -2.4, 8); g.closePath(); }, a, 'wood');
    I.mark(line(0, -14, 0, 2), -2, { stroke: 0.8 });
    I.part(rr(1.6, 5, 2.4, 4.5, 0.8), 0x707078, 'metal');
    I.part(quad(-3, -15, 0, -19.5, 3, -15), 0x8a8a92, 'metal', { stroke: 1.2 });
  },
  arrow: (I, [a, b, c]) => {
    I.rot(45);
    I.part(rr(-0.9, -12, 1.8, 26, 0.9), a, 'wood');
    I.part(poly(0, -19, -2.7, -12.5, 0, -13.6, 2.7, -12.5), b, 'metal');
    I.part(poly(-0.6, 8, -3.6, 11, -3.6, 15.5, -0.6, 12.5), c, 'cloth');
    I.part(poly(0.6, 8, 3.6, 11, 3.6, 15.5, 0.6, 12.5), c, 'cloth');
  },
  spear: (I, [a, b, c]) => {
    I.rot(45);
    I.part(rr(-1.2, -12, 2.4, 34, 1.2), a, 'wood');
    I.part((g) => { g.moveTo(0, -23); g.quadraticCurveTo(3.8, -17, 2.3, -11.5); g.lineTo(-2.3, -11.5); g.quadraticCurveTo(-3.8, -17, 0, -23); g.closePath(); }, b, 'metal');
    I.mark(line(0, -21, 0, -12.5), -1, { stroke: 0.8 });
    I.part(rr(-1.9, -12, 3.8, 2.6, 0.8), c, 'leather');
  },
  wand: (I, [a, b, c]) => {
    I.rot(45);
    I.part((g) => { g.moveTo(-1.7, 17); g.lineTo(1.7, 17); g.lineTo(1.1, -7); g.lineTo(-1.1, -7); g.closePath(); }, a, 'wood');
    for (const y of [4, 10]) I.part(rr(-2, y, 4, 1.8, 0.6), 0xd0a040, 'gold');
    I.part(many(line(-1, -7, -3.2, -12), line(1, -7, 3.2, -12), line(0, -7, 0, -9)), 0xd0a040, 'gold', { stroke: 1.1 });
    I.part(circ(0, -11.5, 3.6), b, 'gem');
    for (const [x, y] of [[-5.5, -16], [5, -17], [-6.5, -8]]) I.part(many(line(x - 1.2, y, x + 1.2, y), line(x, y - 1.2, x, y + 1.2)), c, 'flat', { stroke: 0.8, sep: false });
  },
  rod: (I, [a, b, c], it) => {
    I.rot(45);
    I.part(rr(-1.4, -9, 2.8, 30, 1.3), a, 'wood');
    I.part(quad(-1, -9, -6.5, -13, -3.5, -19), a, 'wood', { stroke: 2.2 });
    I.part(quad(1, -9, 6.5, -13, 3.5, -19), a, 'wood', { stroke: 2.2 });
    I.part(poly(0, -21.5, 3.6, -15, 0, -9.5, -3.6, -15), b, 'gem');
    if (it.key === 'rod_moss') I.part(many(ell(-4, -9, 2.6, 1.4, -0.5), ell(4, -10, 2.6, 1.4, 0.5)), c, 'organic');
    else I.part(many(line(-5.5, -21, -3.8, -17.5), line(5.5, -21, 3.8, -17.5)), c, 'glass', { stroke: 1.1 });
    I.part(rr(-2, 4, 4, 2, 0.7), c, 'paint');
  },
  shield_round: (I, [a, b, c], it) => {
    I.part(circ(0, 0, 14), a, it.key === 'bone_shield' ? 'bone' : 'wood');
    if (it.key === 'bone_shield') {
      for (const r of [5, 9.5]) I.mark((g) => g.arc(0, 0, r, 0, Math.PI * 2), -2, { stroke: 0.8 });
    } else for (const x of [-7, -2.4, 2.4, 7]) I.mark(line(x, -14, x, 14), -2, { stroke: 0.8 });
    I.part((g) => { g.arc(0, 0, 14, 0, Math.PI * 2); g.moveTo(11.8, 0); g.arc(0, 0, 11.8, 0, Math.PI * 2, true); }, it.key === 'bone_shield' ? b : c, it.key === 'bone_shield' ? 'bone' : 'metal', { evenodd: true });
    for (let k = 0; k < 8; k++) { const t = (k / 8) * Math.PI * 2; I.mark(circ(Math.cos(t) * 12.9, Math.sin(t) * 12.9, 0.7), 2); }
    I.part(circ(0, 0, 4), c, it.key === 'bone_shield' ? 'leather' : 'metal');
    I.mark(circ(-1.2, -1.2, 1), 2);
  },
  shield: (I, [a, b, c], it) => {
    const knight = it.key === 'knight_shield';
    const rim = knight ? b : b, face = a, emblem = knight ? c : c;
    const heater = (s) => (g) => { g.moveTo(-12 * s, -13 * s); g.quadraticCurveTo(0, -15 * s, 12 * s, -13 * s); g.quadraticCurveTo(13 * s, 3 * s, 0, 15.5 * s); g.quadraticCurveTo(-13 * s, 3 * s, -12 * s, -13 * s); g.closePath(); };
    I.part(heater(1), rim, 'metal');
    I.part(heater(0.83), face, knight ? 'paint' : 'metal');
    I.part(many(rr(-1.6, -10, 3.2, 20, 1), rr(-8, -5, 16, 3.2, 1)), emblem, knight ? 'gold' : 'metal');
    if (!knight) I.mark(circ(0, -3.4, 1.3), 2, { on: 'any' });
    for (const [x, y] of [[-10.5, -11.5], [10.5, -11.5], [0, 13.5]]) I.mark(circ(x, y, 0.7), 2, { on: 0 });
  },
  book: (I, [a, b, c]) => {
    I.part(rr(-10, -12.5, 21.5, 25.5, 1), c, 'cloth');
    for (const y of [-9, -5, -1, 3, 7]) I.mark(line(9.5, y, 11.5, y), -2, { stroke: 0.6 });
    I.part(rr(-11.5, -13.5, 21, 26, 2), a, 'leather');
    I.part(rr(-11.5, -13.5, 4.4, 26, 1.6), a, 'leather');
    I.part((g) => { g.arc(0.5, -0.5, 5, 0, Math.PI * 2); g.moveTo(3.7, -0.5); g.arc(0.5, -0.5, 3.2, 0, Math.PI * 2, true); }, b, 'gold', { evenodd: true });
    I.part(poly(0.5, -3.2, 1.3, -1.2, 3.2, -0.5, 1.3, 0.2, 0.5, 2.2, -0.3, 0.2, -2.2, -0.5, -0.3, -1.2), b, 'gold');
    for (const [x, y] of [[9.5, -11.5], [9.5, 10.5]]) I.part(poly(x - 3, y + (y < 0 ? -2 : 2), x + 1, y + (y < 0 ? -2 : 2), x + 1, y + (y < 0 ? 2 : -2)), b, 'gold');
  },
  armor: (I, [a, b, c], it) => {
    const torso = (g) => {
      g.moveTo(-5, -13); g.quadraticCurveTo(-8.5, -13.5, -12, -11.5); g.quadraticCurveTo(-14.8, -10, -14.3, -5.5);
      g.lineTo(-13, -0.5); g.lineTo(-10.2, -1.5); g.lineTo(-10.6, 12); g.quadraticCurveTo(0, 15, 10.6, 12); g.lineTo(10.2, -1.5);
      g.lineTo(13, -0.5); g.lineTo(14.3, -5.5); g.quadraticCurveTo(14.8, -10, 12, -11.5); g.quadraticCurveTo(8.5, -13.5, 5, -13);
      g.quadraticCurveTo(0, -8.5, -5, -13); g.closePath();
    };
    const k = it.key;
    if (k === 'chain_armor') {
      I.part(torso, a, 'chain');
      I.part((g) => { g.moveTo(-5.5, -13.2); g.quadraticCurveTo(0, -7.5, 5.5, -13.2); g.lineTo(7, -12.4); g.quadraticCurveTo(0, -5, -7, -12.4); g.closePath(); }, b, 'leather');
      I.part(rr(-10.6, 9.5, 21.2, 3.4, 1.4), b, 'leather');
      I.mark(line(0, -7, 0, 9), -1, { stroke: 0.8, on: 0 });
    } else if (k === 'plate_armor') {
      I.part(torso, b, 'metal');
      I.part((g) => { g.moveTo(-9.5, -9); g.quadraticCurveTo(0, -6.5, 9.5, -9); g.lineTo(9.6, 5); g.quadraticCurveTo(0, 8.5, -9.6, 5); g.closePath(); }, a, 'metal');
      I.mark(line(0, -7.5, 0, 6.5), 1, { stroke: 1 });
      I.mark(line(1, -7.5, 1, 6.5), -1, { stroke: 0.7 });
      for (const y of [7.5, 10.2]) I.part(rr(-10, y, 20, 2.6, 1.1), b, 'metal');
      I.part(many(ell(-11.2, -8.5, 5, 4.2, -0.35), ell(11.2, -8.5, 5, 4.2, 0.35)), c, 'metal');
      for (const x of [-11.5, 11.5]) I.mark(quad(x - 3.5, -8, x, -5, x + 3.5, -8), -2, { stroke: 0.7 });
      for (const [x, y] of [[-7.5, -6.5], [7.5, -6.5], [-8, 3], [8, 3]]) I.mark(circ(x, y, 0.65), 3, { on: 'any' });
    } else if (k === 'dragon_mail') {
      I.part(torso, a, 'scales');
      I.part((g) => { g.moveTo(-5.5, -13.2); g.quadraticCurveTo(0, -7.5, 5.5, -13.2); g.lineTo(7, -12.4); g.quadraticCurveTo(0, -5, -7, -12.4); g.closePath(); }, c, 'gold');
      I.part(rr(-10.6, 9.6, 21.2, 3, 1.3), c, 'gold');
      I.part(many(ell(-11.2, -8.5, 4.6, 3.8, -0.35), ell(11.2, -8.5, 4.6, 3.8, 0.35)), b, 'scales');
      I.part(circ(0, -1, 2.2), 0xe03030, 'gem');
    } else {
      // leather jerkin with pauldrons, laces and a belt
      I.part(torso, a, 'leather');
      I.mark(line(0, -8, 0, 6), -2, { stroke: 0.8 });
      for (let y = -7; y < 5; y += 2.4) I.mark(line(-1.4, y, 1.4, y + 1.2), 2, { stroke: 0.6 });
      for (const x of [-7, 7]) I.mark(quad(x, -6, x * 1.12, 1, x, 7), -1, { stroke: 0.7 });
      I.part(many(ell(-11.2, -8.5, 4.6, 3.8, -0.35), ell(11.2, -8.5, 4.6, 3.8, 0.35)), c, 'leather');
      I.part(rr(-10.5, 6, 21, 3.2, 1.2), b, 'leather');
      I.part(rr(-1.9, 5.5, 3.8, 4.2, 0.8), 0xd0b050, 'gold');
    }
  },
  robe: (I, [a, b, c]) => {
    const body = (g) => {
      g.moveTo(-4.5, -14); g.quadraticCurveTo(-8, -14, -10.5, -12); g.lineTo(-15, -4); g.lineTo(-11.5, -2); g.lineTo(-9.5, -5);
      g.quadraticCurveTo(-11, 6, -13.5, 15); g.quadraticCurveTo(0, 17, 13.5, 15); g.quadraticCurveTo(11, 6, 9.5, -5);
      g.lineTo(11.5, -2); g.lineTo(15, -4); g.lineTo(10.5, -12); g.quadraticCurveTo(8, -14, 4.5, -14); g.quadraticCurveTo(0, -10, -4.5, -14); g.closePath();
    };
    I.part(body, a, 'cloth');
    for (const x of [-5.5, 5.5]) I.mark(quad(x, 0, x * 1.25, 8, x * 1.35, 15), -2, { stroke: 0.8 });
    I.part((g) => { g.moveTo(-1.6, -11.5); g.lineTo(1.6, -11.5); g.lineTo(2.3, 15.8); g.lineTo(-2.3, 15.8); g.closePath(); }, b, 'gold');
    I.part(rr(-9.6, -3, 19.2, 3, 1.2), c, 'cloth');
    I.part((g) => { g.moveTo(-5, -14.3); g.quadraticCurveTo(0, -8.5, 5, -14.3); g.lineTo(6.5, -13.2); g.quadraticCurveTo(0, -6, -6.5, -13.2); g.closePath(); }, b, 'gold');
    for (const [x, y] of [[-7, 7], [6, 3], [8, 11]]) I.mark(many(line(x - 1, y, x + 1, y), line(x, y - 1, x, y + 1)), 3, { stroke: 0.6, on: 0 });
  },
  helmet: (I, [a, b, c], it) => {
    const k = it.key;
    if (k === 'steel_helmet') {
      I.part((g) => { g.moveTo(-10.5, 12); g.lineTo(-11.2, -3); g.quadraticCurveTo(-11.2, -14, 0, -14.5); g.quadraticCurveTo(11.2, -14, 11.2, -3); g.lineTo(10.5, 12); g.quadraticCurveTo(0, 14.5, -10.5, 12); g.closePath(); }, a, 'metal');
      I.mark(line(0, -14, 0, -3), 1, { stroke: 1.1 });
      I.part(rr(-8.5, -2, 17, 2.4, 1.1), 0x24222a, 'flat');
      I.part(rr(-1.2, -1.6, 2.4, 9, 0.8), 0x24222a, 'flat');
      for (const [x, y] of [[-4.5, 5], [-4.5, 8], [4.5, 5], [4.5, 8]]) I.mark(circ(x, y, 0.6), -3, { on: 0 });
      I.part(rr(-11.6, -4.5, 23.2, 2.2, 1), b, 'metal');
      return;
    }
    if (k === 'iron_helmet') {
      // pointed helm with a nasal guard and cheek plates around a dark face
      I.part((g) => { g.moveTo(-11, 11); g.lineTo(-11.5, -1); g.quadraticCurveTo(-11, -11, 0, -15.5); g.quadraticCurveTo(11, -11, 11.5, -1); g.lineTo(11, 11); g.quadraticCurveTo(8, 12.5, 6, 10); g.lineTo(5.5, 3); g.lineTo(-5.5, 3); g.lineTo(-6, 10); g.quadraticCurveTo(-8, 12.5, -11, 11); g.closePath(); }, a, 'metal');
      I.mark(quad(0, -15, 0.5, -8, 0, -2), -1, { stroke: 0.9 });
      I.mark(quad(-5, -11, -8.5, -7, -9, -1), 2, { stroke: 0.9 });
      I.part(rr(-5.5, 1, 11, 9, 2.5), 0x1c1a20, 'flat');
      I.part(rr(-1.3, -2, 2.6, 10, 1), c, 'metal');
      I.part(rr(-12, -2.5, 24, 3.6, 1.4), b, 'metal');
      for (const x of [-9, -5, 5, 9]) I.mark(circ(x, -0.7, 0.6), 3);
      return;
    }
    // leather cap with ear flaps, seams and a stitched brim
    I.part((g) => { g.moveTo(-11.5, 10); g.lineTo(-12, 0); g.quadraticCurveTo(-12.5, -13.5, 0, -14); g.quadraticCurveTo(12.5, -13.5, 12, 0); g.lineTo(11.5, 10); g.quadraticCurveTo(9, 12, 6.5, 10); g.lineTo(6, 3.5); g.lineTo(-6, 3.5); g.lineTo(-6.5, 10); g.quadraticCurveTo(-9, 12, -11.5, 10); g.closePath(); }, a, 'leather');
    for (const x of [-5, 5]) I.mark(quad(x * 0.3, -13.5, x * 1.3, -7, x * 1.5, 0), -2, { stroke: 0.7 });
    I.part(rr(-6, 1.5, 12, 8, 2.5), 0x1c1a20, 'flat');
    I.part(rr(-12.6, -1, 25.2, 3.6, 1.6), c, 'leather');
    for (let x = -10.5; x <= 10.5; x += 3) I.mark(line(x, 0.8, x + 1.2, 0.8), 2, { stroke: 0.6 });
  },
  hat: (I, [a, b, c]) => {
    I.part(ell(0, 10.5, 15.5, 4), a, 'cloth');
    I.part((g) => { g.moveTo(-9, 10); g.quadraticCurveTo(-5, 3, -3, -4); g.quadraticCurveTo(0, -12, 9, -15.5); g.quadraticCurveTo(4.5, -9, 4.5, -3); g.quadraticCurveTo(5.5, 4, 9, 10); g.closePath(); }, a, 'cloth');
    I.part((g) => { g.moveTo(-8.2, 6.5); g.quadraticCurveTo(0, 8.5, 7.6, 6.5); g.lineTo(8.6, 9.5); g.quadraticCurveTo(0, 11.5, -8.8, 9.5); g.closePath(); }, b, 'gold');
    for (const [x, y] of [[-1, -2], [2.5, -9], [-3.5, 3.5]]) I.mark(many(line(x - 1, y, x + 1, y), line(x, y - 1, x, y + 1)), 3, { stroke: 0.6, on: 1 });
  },
  legs: (I, [a, b, c], it) => {
    const k = it.key, mat = k === 'chain_legs' ? 'chain' : k === 'plate_legs' ? 'metal' : 'leather';
    I.part((g) => { g.moveTo(-9.5, -11); g.lineTo(9.5, -11); g.quadraticCurveTo(10.8, 2, 9.8, 14.5); g.lineTo(2, 14.5); g.quadraticCurveTo(1.4, 4, 0, -1); g.quadraticCurveTo(-1.4, 4, -2, 14.5); g.lineTo(-9.8, 14.5); g.quadraticCurveTo(-10.8, 2, -9.5, -11); g.closePath(); }, a, mat);
    I.mark(line(-5.8, -6, -6, 13), -1, { stroke: 0.7 });
    I.mark(line(5.8, -6, 6, 13), -1, { stroke: 0.7 });
    if (k === 'plate_legs') {
      I.part(many(circ(-5.9, 3, 3.3), circ(5.9, 3, 3.3)), c, 'metal');
      for (const y of [9, 12]) I.mark(line(-9.5, y, -2.5, y), -2, { stroke: 0.7, on: 0 });
      for (const y of [9, 12]) I.mark(line(2.5, y, 9.5, y), -2, { stroke: 0.7, on: 0 });
    }
    if (k === 'leather_legs') I.part(many(rr(-9, 1, 6, 4.5, 1.6), rr(3, 1, 6, 4.5, 1.6)), c, 'leather');
    I.part(rr(-10, -13.5, 20, 4, 1.4), b, k === 'plate_legs' ? 'metal' : 'leather');
    I.part(rr(-2, -13.8, 4, 4.6, 0.8), 0xd0b050, 'gold');
  },
  boots: (I, [a, b, c], it) => {
    const boot = (dx, dy, col) => {
      I.part((g) => { g.moveTo(-3.5 + dx, -12 + dy); g.lineTo(4 + dx, -12 + dy); g.lineTo(4.2 + dx, 2 + dy); g.quadraticCurveTo(5 + dx, 5 + dy, 9 + dx, 6.5 + dy); g.quadraticCurveTo(12.5 + dx, 7.5 + dy, 12.3 + dx, 11 + dy); g.lineTo(12.3 + dx, 12 + dy); g.lineTo(-4.2 + dx, 12 + dy); g.quadraticCurveTo(-5 + dx, 3 + dy, -3.5 + dx, -12 + dy); g.closePath(); }, col, 'leather');
      I.part(rr(-4.5 + dx, 11 + dy, 17.2, 2.4, 1), b, 'leather');
      I.part(rr(-4.3 + dx, -13 + dy, 8.8, 3.6, 1.4), c, 'leather');
      if (it.key === 'swift_boots') I.part((g) => { g.moveTo(-4 + dx, -9 + dy); g.quadraticCurveTo(-10 + dx, -13 + dy, -11 + dx, -7 + dy); g.quadraticCurveTo(-8 + dx, -7 + dy, -4 + dx, -5 + dy); g.closePath(); }, 0xf0f0f0, 'cloth');
    };
    const dark = ((a >> 16 & 255) * 0.78) << 16 | ((a >> 8 & 255) * 0.78) << 8 | (a & 255) * 0.78;
    boot(-5.5, -1.5, dark);
    boot(1.5, 1.5, a);
  },
  amulet: (I, [a, b, c], it) => {
    I.part((g) => { g.moveTo(-9.5, -14); g.quadraticCurveTo(-12, 0, 0, 2.5); g.quadraticCurveTo(12, 0, 9.5, -14); }, b, it.key === 'bone_amulet' ? 'leather' : 'gold', { stroke: 1.4 });
    if (it.key === 'bone_amulet') {
      I.part((g) => { g.moveTo(-4.5, 2); g.quadraticCurveTo(0, 0.5, 4.5, 2); g.quadraticCurveTo(4, 9, 0, 15); g.quadraticCurveTo(-4, 9, -4.5, 2); g.closePath(); }, a, 'bone');
      I.part(circ(0, 5.5, 1.9), c, 'gem');
      for (const x of [-7.5, 7.5]) I.part(poly(x, 0, x - 1.5, 4, x + 1.5, 4), a, 'bone');
    } else {
      I.part(circ(0, 8, 6.5), a, 'gold');
      I.part(circ(0, 8, 3.8), c, 'gem');
      for (let k = 0; k < 6; k++) { const t = (k / 6) * Math.PI * 2; I.mark(circ(Math.cos(t) * 5.3, 8 + Math.sin(t) * 5.3, 0.6), 2, { on: 1 }); }
    }
  },
  ring: (I, [a, b, c]) => {
    I.size(25);
    I.part((g) => { g.ellipse(0, 4, 10.5, 7.5, 0, 0, Math.PI * 2); g.moveTo(7.5, 4.8); g.ellipse(0, 4.8, 7.5, 4.6, 0, 0, Math.PI * 2, true); }, a, 'gold', { evenodd: true });
    I.part(rr(-3.6, -6.5, 7.2, 5, 1.3), b, 'gold');
    I.part(circ(0, -7.5, 3.6), c, 'gem');
  },
  apple: (I, [a, b, c]) => {
    I.part((g) => { g.moveTo(0, -8); g.quadraticCurveTo(-6, -12.5, -11, -6.5); g.quadraticCurveTo(-14, 2, -8, 10); g.quadraticCurveTo(-4, 14, 0, 11.5); g.quadraticCurveTo(4, 14, 8, 10); g.quadraticCurveTo(14, 2, 11, -6.5); g.quadraticCurveTo(6, -12.5, 0, -8); g.closePath(); }, a, 'organic');
    I.part(quad(0, -8, 0.5, -11, 2, -14), c, 'wood', { stroke: 1.6 });
    I.part(ell(6, -12, 4.5, 2.2, -0.4), b, 'organic');
  },
  bread: (I, [a, b, c]) => {
    I.part(ell(0, 2, 14.5, 8.5), b, 'organic');
    I.part(ell(0, 0.5, 13.5, 7.2), a, 'organic');
    for (const x of [-7, -1.5, 4]) I.mark(quad(x, 3, x + 2, 0, x + 3.5, -3.5), 3, { stroke: 1.1 });
  },
  cheese: (I, [a, b, c]) => {
    I.part(poly(-14, 4, 13, -4, 13, 6, -14, 11), b, 'organic');
    I.part(poly(-14, 4, 4, -11, 13, -4), a, 'organic');
    for (const [x, y, r] of [[-3, 7, 1.4], [6, 3.5, 1.1], [7.5, -4.5, 1.2], [-1, -3, 1]]) I.mark(ell(x, y, r * 1.2, r), -3, { on: 'any' });
  },
  meat: (I, [a, b, c]) => {
    I.part(quad(2, 2, 6, 6, 10, 10), b, 'bone', { stroke: 3.4 });
    I.part(many(circ(12, 9.8, 2.4), circ(9.8, 12, 2.4)), b, 'bone');
    I.part(ell(-3, -3, 10, 8.5, 0.75), a, 'organic');
    I.mark(ell(-5, -5, 3.5, 2, 0.75), 2);
  },
  ham: (I, [a, b, c]) => {
    I.part(many(circ(11.5, 9, 2.4), circ(9, 11.5, 2.4)), b, 'bone');
    I.part(ell(-2, -1.5, 12, 10, 0.6), a, 'organic');
    I.part(ell(-5, -4.5, 5.5, 4.2, 0.6), b, 'organic');
    I.part(ell(-5.5, -5, 2.6, 1.8, 0.6), a, 'organic');
  },
  fish: (I, [a, b, c]) => {
    I.part(poly(9, 0, 15.5, -7, 13.5, 0, 15.5, 7), b, 'paint');
    I.part(poly(-2, -6, 3, -10.5, 5, -5), b, 'paint');
    I.part((g) => { g.moveTo(-14, 0); g.quadraticCurveTo(-7, -9, 4, -6); g.quadraticCurveTo(9, -3.5, 10.5, 0); g.quadraticCurveTo(9, 3.5, 4, 6); g.quadraticCurveTo(-7, 9, -14, 0); g.closePath(); }, a, 'scales');
    I.mark(quad(-8, -5, -6, 0, -8, 5), -2, { stroke: 0.8 });
    I.part(circ(-10.5, -1.5, 1.4), 0x181818, 'flat');
    I.mark(circ(-10.8, -1.9, 0.4), 'glint');
  },
  potion: (I, [a, b, c]) => {
    I.size(27);
    I.part(rr(-3, -11.5, 6, 4, 1.2), 0x9a6a3a, 'wood');
    I.part(rr(-2.6, -8, 5.2, 6, 1), b, 'glass');
    I.part(circ(0, 4.5, 9.2), b, 'glass');
    I.part(circ(0, 5.2, 7.8), a, 'liquid', { sep: false });
    I.mark(quad(-6, 1, -5.5, -1.5, -3, -2.8), 3, { stroke: 1, on: 'any' });
  },
  potion_big: (I, [a, b, c]) => {
    I.part(rr(-3.4, -14, 6.8, 4.5, 1.4), 0x9a6a3a, 'wood');
    I.part(rr(-3, -10, 6, 7, 1.2), b, 'glass');
    I.part((g) => { g.moveTo(-4, -4); g.quadraticCurveTo(-13, -1, -12, 7); g.quadraticCurveTo(-11, 15, 0, 15); g.quadraticCurveTo(11, 15, 12, 7); g.quadraticCurveTo(13, -1, 4, -4); g.closePath(); }, b, 'glass');
    I.part((g) => { g.moveTo(-10, 1); g.quadraticCurveTo(0, -1, 10, 1); g.quadraticCurveTo(11.5, 13.5, 0, 13.5); g.quadraticCurveTo(-11.5, 13.5, -10, 1); g.closePath(); }, a, 'liquid', { sep: false });
    I.mark(quad(-8, 2, -8.5, 7, -6.5, 11), 3, { stroke: 1, on: 'any' });
  },
  tail: (I, [a, b, c]) => {
    const pts = [];
    for (let t = 0; t <= 1.0001; t += 0.04) pts.push([-11 + 22 * t, 9 - 20 * t + Math.sin(t * 7) * 3.5, 2.2 - 1.6 * t]);
    I.part((g) => { for (const [x, y, r] of pts) { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); } }, a, 'organic');
    for (let k = 2; k < pts.length - 2; k += 3) I.mark(line(pts[k][0] - 1, pts[k][1] - 1, pts[k][0] + 1, pts[k][1] + 1), -1, { stroke: 0.6 });
    I.part(ell(-11.5, 9.5, 3.4, 2.8), b, 'fur');
  },
  pelt: (I, [a, b, c], it) => {
    if (it.key === 'snake_skin') {
      I.rot(-35);
      I.part((g) => { g.moveTo(-15, 2.5); for (let x = -15; x <= 15; x += 1) g.lineTo(x, Math.sin(x * 0.42) * 3 - 3); for (let x = 15; x >= -15; x -= 1) g.lineTo(x, Math.sin(x * 0.42) * 3 + 3); g.closePath(); }, a, 'scales');
      for (let x = -12; x <= 12; x += 4.5) I.mark(poly(x, Math.sin(x * 0.42) * 3 - 1.6, x + 1.6, Math.sin(x * 0.42) * 3, x, Math.sin(x * 0.42) * 3 + 1.6, x - 1.6, Math.sin(x * 0.42) * 3), 2);
      return;
    }
    I.part((g) => {
      g.moveTo(-6, -10); g.quadraticCurveTo(0, -13, 6, -10); g.lineTo(12, -14); g.lineTo(13, -9); g.quadraticCurveTo(9, -5, 9, 0); g.quadraticCurveTo(9, 6, 12, 10);
      g.lineTo(10, 14); g.lineTo(5.5, 9.5); g.quadraticCurveTo(2, 12, 0, 16); g.quadraticCurveTo(-2, 12, -5.5, 9.5); g.lineTo(-10, 14); g.lineTo(-12, 10);
      g.quadraticCurveTo(-9, 6, -9, 0); g.quadraticCurveTo(-9, -5, -13, -9); g.lineTo(-12, -14); g.closePath();
    }, a, 'fur');
    I.part(ell(0, 0, 3.5, 9), b, 'fur');
    I.part(many(poly(-4, -10.5, -6.5, -15, -2, -11.5), poly(4, -10.5, 6.5, -15, 2, -11.5)), b, 'fur');
  },
  paw: (I, [a, b, c]) => {
    for (const [x, y] of [[-8.5, -5], [-3.5, -9.5], [3, -9.5], [8, -5]]) I.part(poly(x - 1.2, y - 2.5, x, y - 6.5, x + 1.2, y - 2.5), c, 'bone');
    I.part(many(ell(-8, -3.5, 3, 3.6, -0.4), ell(-3, -7, 3, 3.6, -0.15), ell(3, -7, 3, 3.6, 0.15), ell(8, -3.5, 3, 3.6, 0.4)), a, 'fur');
    I.part(ell(0, 5, 10, 8.5), a, 'fur');
    I.mark(ell(0, 7, 4.5, 3.4), -3);
  },
  silk: (I, [a, b, c], it) => {
    if (it.key === 'troll_hair') {
      for (let k = -3; k <= 3; k++) I.part(quad(k * 1.6, 13, k * 3.5 + 2, 0, k * 2.6 - 3, -13), k % 2 ? a : b, 'fur', { stroke: 2.3, sep: false });
      I.part(rr(-6.5, 9, 13, 4, 1.5), 0x6a4a2a, 'leather');
      return;
    }
    I.part(quad(6, 6, 12, 12, 15, 9), b, 'cloth', { stroke: 1, sep: false });
    I.part(circ(-1, -1, 10.5), a, 'cloth');
    for (const t of [-0.6, 0.2, 1.0]) I.mark((g) => g.ellipse(-1, -1, 10, 4.5, t, 0, Math.PI * 2), -1, { stroke: 0.7 });
    I.mark(quad(-8, -6, -5, -9, 0, -10), 2, { stroke: 0.8 });
  },
  tooth: (I, [a, b, c]) => {
    I.part((g) => { g.moveTo(-6, -12); g.quadraticCurveTo(6, -15, 7.5, -8); g.quadraticCurveTo(7.5, 5, -2, 15); g.quadraticCurveTo(1, 1, -6, -12); g.closePath(); }, a, 'bone');
    I.part((g) => { g.moveTo(-6, -12); g.quadraticCurveTo(6, -15, 7.5, -8); g.lineTo(6.5, -5.5); g.quadraticCurveTo(0, -8, -4.5, -8); g.closePath(); }, b, 'bone');
    I.mark(quad(3, -3, 3, 4, -0.5, 10), -1, { stroke: 0.7, on: 0 });
  },
  bone: (I, [a, b, c]) => {
    I.rot(45);
    I.part(many(rr(-1.9, -11, 3.8, 22, 1.6), circ(-2.5, -12, 2.9), circ(2.5, -12, 2.9), circ(-2.5, 12, 2.9), circ(2.5, 12, 2.9)), a, 'bone');
    I.mark(line(-0.8, -6, -0.8, 6), 1, { stroke: 0.7 });
  },
  skull: (I, [a, b, c]) => {
    I.part(rr(-6.5, 3, 13, 9, 3), a, 'bone');
    I.part(ell(0, -3, 11, 10.5), a, 'bone');
    I.part(many(ell(-4.6, -1, 3, 3.4), ell(4.6, -1, 3, 3.4)), b, 'flat');
    I.part(poly(0, 3, -1.6, 6.2, 1.6, 6.2), b, 'flat');
    for (const x of [-3.6, -1.2, 1.2, 3.6]) I.mark(line(x, 8.5, x, 11.5), -3, { stroke: 0.7, on: 1 });
    I.mark(quad(-8, -9, -5, -12, -1, -13), 2, { stroke: 0.9, on: 1 });
  },
  gel: (I, [a, b, c]) => {
    I.part((g) => { g.moveTo(-13, 9); g.quadraticCurveTo(-15, 0, -8.5, -3.5); g.quadraticCurveTo(-7, -12, 1, -11.5); g.quadraticCurveTo(9, -11, 9.5, -3.5); g.quadraticCurveTo(15, 0.5, 13, 9); g.quadraticCurveTo(0, 12.5, -13, 9); g.closePath(); }, a, 'gel');
    for (const [x, y, r] of [[-4, 3, 1.6], [4, 5, 1.1], [1, -4, 0.9]]) I.mark(circ(x, y, r), 2);
  },
  scale: (I, [a, b, c]) => {
    const sc = (dx, dy) => (g) => { g.moveTo(-6.5 + dx, -6 + dy); g.quadraticCurveTo(dx, -9.5 + dy, 6.5 + dx, -6 + dy); g.quadraticCurveTo(6.5 + dx, 4 + dy, dx, 9 + dy); g.quadraticCurveTo(-6.5 + dx, 4 + dy, -6.5 + dx, -6 + dy); g.closePath(); };
    for (const [dx, dy] of [[0, -5], [-5.5, 4], [5.5, 4]]) {
      I.part(sc(dx, dy), a, 'gem');
      I.mark(line(dx, -5 + dy, dx, 5 + dy), 1, { stroke: 0.8 });
    }
  },
  crown: (I, [a, b, c]) => {
    I.part(poly(-13, 2, -12.5, -10, -7.5, -3, -3.5, -13, 0, -4, 3.5, -13, 7.5, -3, 12.5, -10, 13, 2), b, 'gold');
    I.part(rr(-13.5, 0, 27, 8.5, 1.6), b, 'gold');
    for (const x of [-8, 0, 8]) I.part(circ(x, 4.2, 2.1), x ? a : c, 'gem');
    for (const [x, y] of [[-12.5, -10], [-3.5, -13], [3.5, -13], [12.5, -10]]) I.part(circ(x, y, 1.6), c, 'gem');
  },
  gem: (I, [a, b, c]) => {
    I.size(26);
    I.part(poly(-7, -9.5, 7, -9.5, 12.5, -3, 0, 13.5, -12.5, -3), a, 'gem');
    I.mark(line(-12.5, -3, 12.5, -3), 2, { stroke: 0.8 });
    I.mark(many(line(-7, -9.5, -3.5, -3), line(7, -9.5, 3.5, -3), line(-3.5, -3, 0, 13.5), line(3.5, -3, 0, 13.5)), -1, { stroke: 0.7 });
    I.mark(poly(-6, -8.5, -1, -8.5, -3.5, -4), 2);
  },
  torch: (I, [a, b, c]) => {
    I.rot(45);
    I.part((g) => { g.moveTo(-1.5, 19); g.lineTo(1.5, 19); g.lineTo(2.3, -4); g.lineTo(-2.3, -4); g.closePath(); }, a, 'wood');
    I.part(rr(-2.9, -7, 5.8, 4.5, 1.2), 0x5a4a30, 'cloth');
    I.part((g) => { g.moveTo(0, -21); g.quadraticCurveTo(5.5, -13, 3.6, -8.5); g.quadraticCurveTo(0, -5, -3.6, -8.5); g.quadraticCurveTo(-5.5, -13, 0, -21); g.closePath(); }, b, 'fire');
    I.part((g) => { g.moveTo(0, -15); g.quadraticCurveTo(2.8, -11, 1.8, -8.8); g.quadraticCurveTo(0, -7.4, -1.8, -8.8); g.quadraticCurveTo(-2.8, -11, 0, -15); g.closePath(); }, c, 'fire', { sep: false });
  },
  gold: (I, [a, b, c]) => {
    const coin = (x, y) => {
      I.part(rr(x - 6, y - 1, 12, 3.5, 1.6), b, 'gold');
      I.part(ell(x, y - 1.2, 6, 3.4), a, 'gold');
      I.mark((g) => g.ellipse(x, y - 1.2, 3.8, 2, 0, 0, Math.PI * 2), -2, { stroke: 0.7 });
    };
    coin(-5.5, 7); coin(6, 7.5); coin(0.5, 2.5); coin(-3, -3); coin(3.5, -8);
  },
};

// ---------------------------------------------------------------- atlas
let atlas = null;   // { img, cell, cols, icons: { itemKey: index } }

// Loads client/assets/icons/items.{png,json}; without it every icon is drawn.
export async function loadIconAtlas() {
  try {
    const meta = await fetch('/assets/icons/items.json').then((r) => (r.ok ? r.json() : null));
    if (!meta) return;
    const img = new Image();
    img.src = '/assets/icons/items.png';
    await img.decode();
    atlas = { img, ...meta };
    cache.clear();
  } catch (e) { console.warn('Brak atlasu ikon, rysuję ikony.', e); }
}

function fromAtlas(i) {
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const { cell, cols, img } = atlas;
  cv.getContext('2d').drawImage(img, (i % cols) * cell, Math.floor(i / cols) * cell, cell, cell, (S - cell) / 2, (S - cell) / 2, cell, cell);
  return cv;
}

function draw(def) {
  if (atlas && atlas.icons[def.key] !== undefined) return fromAtlas(atlas.icons[def.key]);
  const I = new Icon();
  const col = (def.col || [0x888888, 0x666666, 0xaaaaaa]);
  (DRAW[def.icon] || DRAW.gem)(I, col, def);
  return render(I);
}

export function iconCanvas(id) {
  let cv = cache.get(id);
  if (!cv) {
    const def = ITEMS[id];
    if (!def) return null;
    cv = draw(def);
    cache.set(id, cv);
  }
  return cv;
}

// Returns a fresh canvas element (scaled with CSS) showing the icon.
export function iconElement(id) {
  const src = iconCanvas(id);
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  if (src) cv.getContext('2d').drawImage(src, 0, 0);
  return cv;
}
