// Tile map shared by the server (authoritative, generated at boot) and the
// client (decoded from /api/map). Each floor stores flat typed-array layers.

import { GROUND, OBJ, G, O, F } from './constants.js';

const MAGIC = 0x314d4246; // "FBM1"

export class GameMap {
  constructor(w, h, zMin, zMax) {
    this.w = w; this.h = h; this.zMin = zMin; this.zMax = zMax;
    this.floors = [];
    for (let z = zMin; z <= zMax; z++) {
      const n = w * h;
      this.floors.push({
        z,
        ground: new Uint8Array(n),
        obj: new Uint8Array(n),
        flags: new Uint8Array(n),
        variant: new Uint8Array(n),
        roof: new Uint16Array(n),
      });
    }
    this.portals = new Map();   // "x,y,z" -> {x,y,z}
    this.roofs = [];            // [{id, x0,y0,x1,y1, z, h, color, style}]
    this.signs = new Map();     // "x,y,z" -> text
    this.meta = {};             // towns, temple, region names...
  }

  floor(z) { return this.floors[z - this.zMin]; }
  inBounds(x, y, z) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h && z >= this.zMin && z <= this.zMax;
  }
  i(x, y) { return y * this.w + x; }

  ground(x, y, z) { return this.inBounds(x, y, z) ? this.floor(z).ground[this.i(x, y)] : G.NONE; }
  obj(x, y, z) { return this.inBounds(x, y, z) ? this.floor(z).obj[this.i(x, y)] : O.NONE; }
  flags(x, y, z) { return this.inBounds(x, y, z) ? this.floor(z).flags[this.i(x, y)] : 0; }
  variant(x, y, z) { return this.inBounds(x, y, z) ? this.floor(z).variant[this.i(x, y)] : 0; }
  roof(x, y, z) { return this.inBounds(x, y, z) ? this.floor(z).roof[this.i(x, y)] : 0; }

  setGround(x, y, z, g) { if (this.inBounds(x, y, z)) this.floor(z).ground[this.i(x, y)] = g; }
  setObj(x, y, z, o, variant) {
    if (!this.inBounds(x, y, z)) return;
    const f = this.floor(z), i = this.i(x, y);
    f.obj[i] = o;
    if (variant !== undefined) f.variant[i] = variant;
  }
  addFlag(x, y, z, flag) { if (this.inBounds(x, y, z)) this.floor(z).flags[this.i(x, y)] |= flag; }
  setRoof(x, y, z, id) { if (this.inBounds(x, y, z)) this.floor(z).roof[this.i(x, y)] = id; }

  isPZ(x, y, z) { return (this.flags(x, y, z) & F.PZ) !== 0; }

  // Static walkability (ignores creatures).
  walkable(x, y, z) {
    if (!this.inBounds(x, y, z)) return false;
    const f = this.floor(z), i = this.i(x, y);
    const g = GROUND[f.ground[i]];
    if (!g || !g.walk) return false;
    const o = OBJ[f.obj[i]];
    return !(o && o.block);
  }

  blocksSight(x, y, z) {
    if (!this.inBounds(x, y, z)) return true;
    const o = OBJ[this.floor(z).obj[this.i(x, y)]];
    return !!(o && o.sight);
  }

  groundCost(x, y, z) {
    const g = GROUND[this.ground(x, y, z)];
    let cost = g ? g.cost : 150;
    const o = OBJ[this.obj(x, y, z)];
    if (o && o.slow) cost *= o.slow;
    return cost;
  }

  portalAt(x, y, z) { return this.portals.get(`${x},${y},${z}`) || null; }
  addPortal(x, y, z, tx, ty, tz) { this.portals.set(`${x},${y},${z}`, { x: tx, y: ty, z: tz }); }

  // Bresenham line of sight between two tiles on one floor (the endpoints
  // themselves are not tested), like ThrowPossible in the original engine.
  lineOfSight(x0, y0, x1, y1, z) {
    let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (;;) {
      if (x === x1 && y === y1) return true;
      if (!(x === x0 && y === y0) && this.blocksSight(x, y, z)) return false;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  encode() {
    const meta = {
      w: this.w, h: this.h, zMin: this.zMin, zMax: this.zMax,
      portals: [...this.portals].map(([k, v]) => [k, v.x, v.y, v.z]),
      roofs: this.roofs,
      signs: [...this.signs],
      meta: this.meta,
    };
    const json = new TextEncoder().encode(JSON.stringify(meta));
    const n = this.w * this.h;
    const perFloor = n * 6; // 4 x u8 + 1 x u16
    const total = 8 + json.length + perFloor * this.floors.length;
    const buf = new Uint8Array(total);
    const dv = new DataView(buf.buffer);
    dv.setUint32(0, MAGIC, true);
    dv.setUint32(4, json.length, true);
    buf.set(json, 8);
    let off = 8 + json.length;
    for (const f of this.floors) {
      buf.set(f.ground, off); off += n;
      buf.set(f.obj, off); off += n;
      buf.set(f.flags, off); off += n;
      buf.set(f.variant, off); off += n;
      for (let i = 0; i < n; i++) { dv.setUint16(off, f.roof[i], true); off += 2; }
    }
    return buf;
  }

  static decode(input) {
    const buf = input instanceof Uint8Array ? input : new Uint8Array(input);
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    if (dv.getUint32(0, true) !== MAGIC) throw new Error('Bad map file');
    const len = dv.getUint32(4, true);
    const meta = JSON.parse(new TextDecoder().decode(buf.subarray(8, 8 + len)));
    const map = new GameMap(meta.w, meta.h, meta.zMin, meta.zMax);
    const n = map.w * map.h;
    let off = 8 + len;
    for (const f of map.floors) {
      f.ground.set(buf.subarray(off, off + n)); off += n;
      f.obj.set(buf.subarray(off, off + n)); off += n;
      f.flags.set(buf.subarray(off, off + n)); off += n;
      f.variant.set(buf.subarray(off, off + n)); off += n;
      for (let i = 0; i < n; i++) { f.roof[i] = dv.getUint16(off, true); off += 2; }
    }
    for (const [k, x, y, z] of meta.portals) map.portals.set(k, { x, y, z });
    map.roofs = meta.roofs;
    map.signs = new Map(meta.signs);
    map.meta = meta.meta || {};
    return map;
  }
}

// Deterministic per-tile hash (used for decoration variety on both sides).
export function tileHash(x, y, z = 0) {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
