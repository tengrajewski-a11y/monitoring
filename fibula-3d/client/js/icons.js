// Procedural 16x16 pixel-art item icons. Shapes are plotted with a few
// primitives, then an automatic outline and bevel give them a classic
// sprite look. Results are cached per item id.

import { ITEMS } from '/shared/items.js';

const S = 16;
const cache = new Map();

function hex(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }
function shade([r, g, b], f) {
  return f >= 1 ? [r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1)].map(Math.round)
    : [r * f, g * f, b * f].map(Math.round);
}

class Pix {
  constructor() { this.p = new Array(S * S).fill(null); }
  set(x, y, c) { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < S && y < S) this.p[y * S + x] = c; }
  get(x, y) { return x < 0 || y < 0 || x >= S || y >= S ? null : this.p[y * S + x]; }
  line(x0, y0, x1, y1, c, w = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 || 1;
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
      for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) this.set(x + a - (w > 1 ? 0.5 : 0), y + b - (w > 1 ? 0.5 : 0), c);
    }
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  ell(cx, cy, rx, ry, c) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.set(x, y, c);
    }
  }
  disc(cx, cy, r, c) { this.ell(cx, cy, r, r, c); }
  poly(pts, c) {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const px = x + 0.5, py = y + 0.5;
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside) this.set(x, y, c);
    }
  }
}

const DRAW = {
  dagger: (p, a, b, c) => { p.line(7, 8, 12, 3, a, 2); p.line(5, 7, 8, 10, c); p.line(3, 12, 6, 9, b, 2); },
  sword: (p, a, b, c) => { p.line(5, 10, 13, 2, a, 2); p.line(3, 8, 7, 12, c); p.line(2, 13, 4, 11, b, 2); p.set(1, 14, c); },
  longsword: (p, a, b, c) => { p.line(4, 11, 14, 1, a, 2); p.line(2, 9, 6, 13, c); p.line(1, 14, 3, 12, b, 2); },
  axe: (p, a, b, c) => { p.line(3, 14, 10, 4, b, 2); p.poly([[8, 1], [14, 3], [14, 9], [9, 6]], a); p.line(14, 3, 14, 9, c); },
  bigaxe: (p, a, b, c) => { p.line(2, 14, 11, 3, b, 2); p.poly([[9, 0], [15, 2], [15, 8], [11, 5]], a); p.poly([[6, 2], [9, 5], [6, 8], [3, 5]], a); p.line(15, 2, 15, 8, c); },
  club: (p, a, b, c) => { p.line(3, 13, 10, 5, a, 2); p.disc(11, 4.5, 3, a); p.set(11, 3, c); p.set(9, 5, b); },
  mace: (p, a, b, c) => { p.line(3, 13, 9, 7, b, 2); p.disc(10.5, 5.5, 3.3, a); for (const [x, y] of [[10, 1], [14, 5], [10, 9], [6, 5]]) p.set(x, y, c); },
  bow: (p, a, b, c) => {
    p.line(3, 13, 13, 3, c);
    for (let t = 0; t <= 30; t++) {
      const u = t / 30, x = 3 + 10 * u + 3.2 * Math.sin(Math.PI * u), y = 13 - 10 * u + 3.2 * Math.sin(Math.PI * u);
      p.set(x, y, a); p.set(x + 0.6, y, a);
    }
    p.rect(9, 9, 2, 2, b);
  },
  arrow: (p, a, b, c) => { p.line(2, 13, 12, 3, a); p.poly([[11, 2], [14, 1], [13, 4]], b); p.set(2, 12, c); p.set(3, 14, c); p.set(1, 13, c); },
  spear: (p, a, b, c) => { p.line(1, 14, 11, 4, a, 2); p.poly([[10, 3], [15, 0], [12, 6]], b); },
  wand: (p, a, b, c) => { p.line(3, 13, 10, 6, a, 2); p.disc(11.5, 4.5, 2, b); p.set(14, 2, c); p.set(9, 2, c); p.set(14, 7, c); },
  rod: (p, a, b, c) => { p.line(2, 14, 11, 5, a, 2); p.disc(12, 4, 2.5, b); p.set(9, 3, c); p.set(14, 7, c); },
  shield_round: (p, a, b, c) => { p.disc(8, 8, 6.5, b); p.disc(8, 8, 5, a); p.line(8, 3, 8, 13, b); p.line(3, 8, 13, 8, b); p.disc(8, 8, 1.6, c); },
  shield: (p, a, b, c) => { p.poly([[2, 2], [14, 2], [14, 8], [8, 15], [2, 8]], b); p.poly([[3.5, 3.5], [12.5, 3.5], [12.5, 8], [8, 13.3], [3.5, 8]], a); p.line(8, 4, 8, 11, c); p.line(5, 6, 11, 6, c); },
  book: (p, a, b, c) => { p.rect(3, 2, 10, 12, a); p.rect(3, 2, 2, 12, shade(a, 0.6)); p.line(12, 3, 12, 13, c); p.rect(7, 5, 3, 3, b); },
  armor: (p, a, b, c) => { p.rect(2, 3, 12, 4, a); p.rect(4, 6, 8, 8, a); p.rect(6, 3, 4, 2, null); p.rect(4, 11, 8, 1, b); p.line(8, 6, 8, 10, c); },
  robe: (p, a, b, c) => { p.poly([[5, 2], [11, 2], [14, 15], [2, 15]], a); p.rect(6, 2, 4, 2, c); p.rect(4, 8, 8, 1, b); p.line(8, 4, 8, 14, shade(a, 0.75)); },
  helmet: (p, a, b, c) => { p.ell(8, 8, 6, 6, a); p.rect(0, 9, 16, 7, null); p.rect(2, 9, 12, 2, b); p.rect(5, 11, 6, 3, a); p.line(6, 12, 10, 12, [20, 16, 12]); p.set(8, 2, c); },
  hat: (p, a, b, c) => { p.poly([[9, 0], [13, 11], [3, 11]], a); p.rect(1, 11, 14, 2, shade(a, 0.8)); p.rect(4, 9, 8, 1, b); p.set(8, 5, c); p.set(10, 7, c); },
  legs: (p, a, b, c) => { p.rect(4, 2, 8, 3, a); p.rect(4, 4, 3, 11, a); p.rect(9, 4, 3, 11, a); p.rect(4, 2, 8, 1, b); p.set(8, 3, c); },
  boots: (p, a, b, c) => { p.rect(3, 3, 4, 9, a); p.rect(3, 10, 6, 3, a); p.rect(3, 13, 6, 1, b); p.rect(9, 2, 4, 9, shade(a, 0.8)); p.rect(9, 9, 6, 3, shade(a, 0.8)); p.rect(9, 12, 6, 1, b); p.set(4, 4, c); },
  amulet: (p, a, b, c) => { for (let t = 0; t <= 16; t++) { const ang = Math.PI * (t / 16); p.set(8 - Math.cos(ang) * 5, 7 - Math.sin(ang) * 5, b); } p.disc(8, 10.5, 3, a); p.disc(8, 10.5, 1.2, c); },
  ring: (p, a, b, c) => { p.disc(8, 9, 5, a); p.disc(8, 9, 3, null); p.disc(8, 4, 2, c); },
  apple: (p, a, b, c) => { p.disc(8, 9.5, 5.5, a); p.line(8, 2, 8, 4, c); p.poly([[9, 3], [13, 1], [12, 4]], b); p.set(6, 7, shade(a, 1.5)); },
  bread: (p, a, b, c) => { p.ell(8, 9, 7, 4.5, a); p.line(5, 7, 6, 9, c); p.line(8, 6, 9, 9, c); p.line(11, 7, 12, 9, c); p.rect(2, 11, 12, 1, b); },
  cheese: (p, a, b, c) => { p.poly([[1, 13], [15, 13], [15, 4]], a); p.rect(1, 13, 14, 1, b); p.disc(10, 10, 1.2, c); p.disc(13, 8, 1, c); p.disc(6, 12, 0.8, c); },
  meat: (p, a, b, c) => { p.disc(6, 6, 4.8, a); p.line(9, 9, 13, 13, b, 2); p.disc(13.5, 13.5, 1.6, b); p.set(5, 4, shade(a, 1.4)); },
  ham: (p, a, b, c) => { p.ell(7, 7, 6, 5, a); p.ell(7, 7, 3, 2.5, shade(a, 1.3)); p.line(11, 10, 14, 13, b, 2); },
  fish: (p, a, b, c) => { p.ell(7, 8, 5.5, 3.2, a); p.poly([[11, 8], [15, 4], [15, 12]], b); p.set(4, 7, [20, 16, 12]); p.line(5, 10, 9, 10, c); },
  potion: (p, a, b, c) => { p.rect(7, 2, 2, 4, b); p.rect(6, 1, 4, 1, [120, 80, 40]); p.disc(8, 10.5, 4.5, a); p.ell(8, 8, 4, 1, c); p.set(6, 9, [255, 255, 255]); },
  potion_big: (p, a, b, c) => { p.rect(7, 1, 2, 4, b); p.rect(6, 0, 4, 1, [120, 80, 40]); p.disc(8, 10, 5.7, a); p.set(5, 8, [255, 255, 255]); },
  tail: (p, a, b, c) => { for (let t = 0; t <= 30; t++) { const u = t / 30; p.set(2 + 11 * u, 13 - 10 * u + Math.sin(u * 7) * 2, a); } p.disc(2.5, 12.5, 1.5, b); },
  pelt: (p, a, b, c) => { p.ell(8, 8, 6, 4.5, a); for (const [x, y] of [[2, 4], [14, 4], [2, 12], [14, 12]]) p.disc(x, y, 1.8, a); p.disc(6, 7, 1.2, b); p.disc(10, 9, 1.2, b); },
  paw: (p, a, b, c) => { p.disc(8, 10.5, 3.8, a); for (const [x, y] of [[3.5, 6], [6.5, 3.5], [10, 3.5], [13, 6]]) p.disc(x, y, 1.7, a); for (const [x, y] of [[3, 4], [6, 1.5], [10, 1.5], [13.5, 4]]) p.set(x, y, c); },
  silk: (p, a, b, c) => { p.disc(8, 8, 5.5, a); p.line(4, 6, 12, 10, b); p.line(4, 10, 12, 6, b); p.line(13, 12, 15, 15, c); },
  tooth: (p, a, b, c) => { p.poly([[5, 2], [12, 2], [9, 15]], a); p.rect(5, 2, 7, 2, b); },
  bone: (p, a, b, c) => { p.line(4, 12, 12, 4, a, 2); for (const [x, y] of [[2.5, 12], [4, 13.5], [12, 2.5], [13.5, 4]]) p.disc(x, y, 1.7, a); },
  skull: (p, a, b, c) => { p.disc(8, 7, 5.5, a); p.rect(5, 10, 6, 4, a); p.disc(6, 7.5, 1.4, b); p.disc(10, 7.5, 1.4, b); p.set(8, 10, b); p.line(6, 13, 10, 13, b); },
  gel: (p, a, b, c) => { p.ell(8, 10, 6.5, 4.5, a); p.ell(8, 7, 4, 4, a); p.set(6, 6, c); p.set(7, 5, c); },
  scale: (p, a, b, c) => { for (const [x, y] of [[5, 10], [11, 10], [8, 6], [8, 13]]) { p.disc(x, y, 3.2, b); p.disc(x, y - 0.6, 2.4, a); } },
  crown: (p, a, b, c) => { p.rect(2, 8, 12, 5, b); p.poly([[2, 8], [4, 2], [6, 8]], b); p.poly([[6, 8], [8, 1], [10, 8]], b); p.poly([[10, 8], [12, 2], [14, 8]], b); p.set(8, 10, c); p.set(4, 10, a); p.set(12, 10, a); },
  gem: (p, a, b, c) => { p.poly([[8, 1], [14, 6], [8, 15], [2, 6]], a); p.poly([[8, 1], [14, 6], [8, 6]], b); p.line(2, 6, 14, 6, c); },
  torch: (p, a, b, c) => { p.line(5, 15, 9, 7, a, 2); p.disc(10, 5, 3, b); p.disc(10.5, 4.5, 1.5, c); },
  gold: (p, a, b, c) => { for (const [x, y] of [[5, 11], [11, 11], [8, 7]]) { p.ell(x, y, 3.5, 2.2, b); p.ell(x, y - 0.6, 3, 1.6, a); p.set(x - 1, y - 1, c); } },
};

function render(def) {
  const p = new Pix();
  const [a, b, c] = def.col.map(hex);
  (DRAW[def.icon] || DRAW.gem)(p, a, b, c);
  // outline + bevel
  const out = new Pix();
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = p.get(x, y);
    if (v) {
      let col = v;
      if (!p.get(x - 1, y) || !p.get(x, y - 1)) col = shade(v, 1.25);
      else if (!p.get(x + 1, y) || !p.get(x, y + 1)) col = shade(v, 0.72);
      out.set(x, y, col);
    } else if (p.get(x - 1, y) || p.get(x + 1, y) || p.get(x, y - 1) || p.get(x, y + 1)) out.set(x, y, [24, 17, 11]);
  }
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(S, S);
  out.p.forEach((v, i) => {
    if (!v) return;
    img.data[i * 4] = v[0]; img.data[i * 4 + 1] = v[1]; img.data[i * 4 + 2] = v[2]; img.data[i * 4 + 3] = 255;
  });
  ctx.putImageData(img, 0, 0);
  return cv;
}

export function iconCanvas(id) {
  let cv = cache.get(id);
  if (!cv) {
    const def = ITEMS[id];
    if (!def) return null;
    cv = render(def);
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
