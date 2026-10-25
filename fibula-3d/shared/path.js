// A* path finding on a single floor. Costs follow ground "waypoints" with the
// engine's 3x diagonal penalty, so paths prefer straight steps like in the
// original client/server.

import { DIR_DX, DIR_DY } from './constants.js';

class Heap {
  constructor() { this.a = []; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

/**
 * @param map GameMap
 * @param passable (x,y) => boolean, extra dynamic check (creatures etc.)
 * @param opts {maxNodes, adjacent: stop when next to goal, maxDist}
 * @returns array of directions or null
 */
export function findPath(map, sx, sy, tx, ty, z, passable, opts = {}) {
  const maxNodes = opts.maxNodes || 3000;
  const adjacent = !!opts.adjacent;
  const maxDist = opts.maxDist || 40;
  if (sx === tx && sy === ty) return [];
  if (adjacent && Math.max(Math.abs(sx - tx), Math.abs(sy - ty)) <= 1) return [];
  const w = map.w;
  const key = (x, y) => y * w + x;
  const open = new Heap();
  const nodes = new Map();
  const h = (x, y) => {
    const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
    return (dx + dy) * 100;
  };
  const start = { x: sx, y: sy, g: 0, f: h(sx, sy), parent: null, dir: -1, closed: false };
  nodes.set(key(sx, sy), start);
  open.push(start);
  let expanded = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur.closed) continue;
    cur.closed = true;
    const done = adjacent
      ? Math.max(Math.abs(cur.x - tx), Math.abs(cur.y - ty)) <= 1
      : (cur.x === tx && cur.y === ty);
    if (done) {
      const dirs = [];
      let n = cur;
      while (n.parent) { dirs.push(n.dir); n = n.parent; }
      return dirs.reverse();
    }
    if (++expanded > maxNodes) return null;
    for (let d = 0; d < 8; d++) {
      const nx = cur.x + DIR_DX[d], ny = cur.y + DIR_DY[d];
      if (Math.abs(nx - sx) > maxDist || Math.abs(ny - sy) > maxDist) continue;
      if (adjacent && nx === tx && ny === ty) continue;
      if (!map.walkable(nx, ny, z) || !passable(nx, ny)) continue;
      // no corner cutting through blocked tiles
      if (d >= 4 && (!map.walkable(cur.x + DIR_DX[d], cur.y, z) || !map.walkable(cur.x, cur.y + DIR_DY[d], z))) continue;
      const step = map.groundCost(nx, ny, z) * (d >= 4 ? 3 : 1);
      const g = cur.g + step;
      const k = key(nx, ny);
      let n = nodes.get(k);
      if (n && (n.closed || n.g <= g)) continue;
      if (!n) { n = { x: nx, y: ny, g, f: 0, parent: cur, dir: d, closed: false }; nodes.set(k, n); }
      n.g = g; n.parent = cur; n.dir = d; n.f = g + h(nx, ny);
      open.push(n);
    }
  }
  return null;
}
