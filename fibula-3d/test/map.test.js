import test from 'node:test';
import assert from 'node:assert/strict';
import { generateWorld } from '../server/mapgen.js';
import { GameMap } from '../shared/map.js';
import { findPath } from '../shared/path.js';
import { DIR_DX, DIR_DY, O } from '../shared/constants.js';
import { MONSTERS } from '../server/data/monsters.js';
import { NPCS } from '../server/data/npcs.js';

const world = generateWorld();
const { map } = world;

// Flood fill over walkable tiles, following portals between floors.
function reachable(start) {
  const seen = new Set();
  const key = (x, y, z) => `${x},${y},${z}`;
  const queue = [start];
  seen.add(key(start.x, start.y, start.z));
  while (queue.length) {
    const p = queue.pop();
    const portal = map.portalAt(p.x, p.y, p.z);
    const next = [];
    if (portal) next.push(portal);
    for (let d = 0; d < 4; d++) next.push({ x: p.x + DIR_DX[d], y: p.y + DIR_DY[d], z: p.z });
    for (const n of next) {
      const k = key(n.x, n.y, n.z);
      if (seen.has(k) || !map.walkable(n.x, n.y, n.z)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return seen;
}

const fromTemple = reachable(world.temple);
const near = (x, y, z, r = 1) => {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (fromTemple.has(`${x + dx},${y + dy},${z}`)) return true;
  return false;
};

test('map generation is deterministic and round-trips through the binary format', () => {
  const again = generateWorld();
  assert.deepEqual(again.map.encode(), map.encode());
  const decoded = GameMap.decode(map.encode());
  assert.equal(decoded.w, map.w);
  assert.deepEqual(decoded.floor(0).obj, map.floor(0).obj);
  assert.equal(decoded.portals.size, map.portals.size);
  assert.equal(decoded.roofs.length, map.roofs.length);
});

test('temple is a walkable protection zone', () => {
  const t = world.temple;
  assert.ok(map.walkable(t.x, t.y, t.z));
  assert.ok(map.isPZ(t.x, t.y, t.z));
});

test('every spawn, NPC and quest chest can be reached from the temple', () => {
  for (const s of world.spawns) {
    assert.ok(MONSTERS[s.type], `unknown monster ${s.type}`);
    let ok = false;
    for (let dy = -s.radius; dy <= s.radius && !ok; dy++) for (let dx = -s.radius; dx <= s.radius && !ok; dx++) {
      if (fromTemple.has(`${s.x + dx},${s.y + dy},${s.z}`)) ok = true;
    }
    assert.ok(ok, `spawn ${s.type} at ${s.x},${s.y},${s.z} unreachable`);
  }
  for (const n of NPCS) {
    const p = world.npcSpots[n.key];
    assert.ok(p, `missing spot for ${n.key}`);
    assert.ok(near(p.x, p.y, p.z, 2), `NPC ${n.name} unreachable`);
  }
  for (const q of world.questChests) {
    assert.equal(map.obj(q.x, q.y, q.z), O.QUEST_CHEST);
    assert.ok(near(q.x, q.y, q.z), `quest chest ${q.quest} unreachable`);
  }
});

test('portals land on walkable tiles and come in pairs', () => {
  for (const [k, t] of map.portals) {
    assert.ok(map.walkable(t.x, t.y, t.z), `portal ${k} lands on a blocked tile`);
    const [x, y, z] = k.split(',').map(Number);
    assert.ok([O.STAIRS_DOWN, O.STAIRS_UP, O.HOLE, O.LADDER].includes(map.obj(x, y, z)), `portal ${k} has no stairs object`);
  }
});

test('path finding walks from the temple to the east gate', () => {
  const t = world.temple;
  const path = findPath(map, t.x, t.y, 97, 83, 0, () => true, { maxNodes: 20000, maxDist: 60 });
  assert.ok(path && path.length > 10);
  let x = t.x, y = t.y;
  for (const d of path) { x += DIR_DX[d]; y += DIR_DY[d]; assert.ok(map.walkable(x, y, 0)); }
  assert.deepEqual([x, y], [97, 83]);
});
