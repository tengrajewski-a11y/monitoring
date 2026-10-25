// Small mesh builder for the procedural, flat shaded parts of the world.
// Produces non-indexed geometry with per-face normals and vertex colours,
// plus an optional "sway" attribute used by the wind shader and a "tex"
// attribute (ground type for the pixel-art detail shader, set via geo.tex).

import * as THREE from 'three';

const tmpColor = new THREE.Color();
const ico = new Map();

export function lin(hex, f = 1) {
  tmpColor.setHex(hex);
  return [tmpColor.r * f, tmpColor.g * f, tmpColor.b * f];
}

export class Geo {
  constructor() { this.p = []; this.n = []; this.c = []; this.s = []; this.t = []; this.tex = 0; }

  get count() { return this.p.length / 3; }

  // col: one [r, g, b] colour, or one colour per vertex ([ca, cb, cc])
  tri(a, b, c, col, sway = 0) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const per = Array.isArray(col[0]);
    [a, b, c].forEach((v, i) => {
      const k = per ? col[i] : col;
      this.p.push(v[0], v[1], v[2]);
      this.n.push(nx, ny, nz);
      this.c.push(k[0], k[1], k[2]);
      this.s.push(typeof sway === 'number' ? sway : sway(v));
      this.t.push(this.tex);
    });
  }

  // col: one colour, or four (one per corner a, b, c, d)
  quad(a, b, c, d, col, sway = 0) {
    if (Array.isArray(col[0])) { this.tri(a, b, c, [col[0], col[1], col[2]], sway); this.tri(a, c, d, [col[0], col[2], col[3]], sway); return; }
    this.tri(a, b, c, col, sway); this.tri(a, c, d, col, sway);
  }

  // Axis aligned box. opts: top (colour), side (factor), bottom (bool), skip {px,nx,pz,nz}
  box(x0, y0, z0, x1, y1, z1, col, opts = {}) {
    const top = opts.top || col;
    const sf = opts.side ?? 0.82;
    const side = [col[0] * sf, col[1] * sf, col[2] * sf];
    const sw = opts.sway || 0;
    const sk = opts.skip || {};
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], top, sw);
    if (!sk.px) this.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], side, sw);
    if (!sk.nx) this.quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], side, sw);
    if (!sk.pz) this.quad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], col, sw);
    if (!sk.nz) this.quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], side, sw);
    if (opts.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], side, sw);
  }

  // Box centred at (cx, cz) with size and a rotation around Y.
  boxR(cx, y0, cz, sx, sy, sz, rot, col, opts = {}) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (x, y, z) => [cx + x * c + z * s, y, cz - x * s + z * c];
    const hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
    const top = opts.top || col;
    const sf = opts.side ?? 0.82;
    const side = [col[0] * sf, col[1] * sf, col[2] * sf];
    const sw = opts.sway || 0;
    this.quad(P(-hx, y1, -hz), P(-hx, y1, hz), P(hx, y1, hz), P(hx, y1, -hz), top, sw);
    this.quad(P(hx, y0, -hz), P(hx, y1, -hz), P(hx, y1, hz), P(hx, y0, hz), side, sw);
    this.quad(P(-hx, y0, hz), P(-hx, y1, hz), P(-hx, y1, -hz), P(-hx, y0, -hz), side, sw);
    this.quad(P(hx, y0, hz), P(hx, y1, hz), P(-hx, y1, hz), P(-hx, y0, hz), col, sw);
    this.quad(P(-hx, y0, -hz), P(-hx, y1, -hz), P(hx, y1, -hz), P(hx, y0, -hz), side, sw);
  }

  // Cylinder / cone / prism. r1 = top radius (0 = cone).
  prism(cx, y0, cz, r0, h, segs, col, opts = {}) {
    const r1 = opts.r1 ?? r0;
    const rot = opts.rot || 0;
    const y1 = y0 + h;
    const top = opts.top || col;
    const sw = opts.sway || 0;
    const ring = (r, y, t) => [cx + Math.cos(t + rot) * r, y, cz + Math.sin(t + rot) * r];
    for (let i = 0; i < segs; i++) {
      const t0 = (i / segs) * Math.PI * 2, t1 = ((i + 1) / segs) * Math.PI * 2;
      const shadeF = 0.78 + 0.22 * (0.5 + 0.5 * Math.cos((t0 + t1) / 2 + 2.2));
      const sc = [col[0] * shadeF, col[1] * shadeF, col[2] * shadeF];
      if (r1 > 0) this.quad(ring(r0, y0, t0), ring(r1, y1, t0), ring(r1, y1, t1), ring(r0, y0, t1), sc, sw);
      else this.tri(ring(r0, y0, t0), [cx, y1, cz], ring(r0, y0, t1), sc, sw);
      if (r1 > 0 && opts.cap !== false) this.tri([cx, y1, cz], ring(r1, y1, t1), ring(r1, y1, t0), top, sw);
      if (opts.bottom) this.tri([cx, y0, cz], ring(r0, y0, t0), ring(r0, y0, t1), sc, sw);
    }
  }

  // Low poly sphere (icosahedron) with slight colour variation per face.
  blob(cx, cy, cz, r, col, opts = {}) {
    const detail = opts.detail ?? 0;
    let pos = ico.get(detail);
    if (!pos) { pos = new THREE.IcosahedronGeometry(1, detail).toNonIndexed().attributes.position.array; ico.set(detail, pos); }
    const sy = opts.sy ?? 1;
    const sw = opts.sway || 0;
    for (let i = 0; i < pos.length; i += 9) {
      const v = [0, 1, 2].map((k) => [cx + pos[i + k * 3] * r, cy + pos[i + k * 3 + 1] * r * sy, cz + pos[i + k * 3 + 2] * r]);
      const up = (pos[i + 1] + pos[i + 4] + pos[i + 7]) / 3;
      const f = 0.82 + 0.25 * up + (opts.jitter ? ((i * 7919) % 13) / 100 : 0);
      this.tri(v[0], v[1], v[2], [col[0] * f, col[1] * f, col[2] * f], sw);
    }
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('sway', new THREE.Float32BufferAttribute(this.s, 1));
    g.setAttribute('tex', new THREE.Float32BufferAttribute(this.t, 1));
    g.computeBoundingSphere();
    return g;
  }
}
