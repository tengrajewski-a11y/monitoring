// Deterministic world generator for the island of Fibula.
// Surface (z=0): town Patella, northern forest, western mountains, eastern
// plains with an orc camp, a cemetery and a southern swamp.
// z=-1: the Vertebra caves under the mountains and the crypt under the cemetery.
// z=-2: the dragon lair.

import { GameMap } from '../shared/map.js';
import { MAP_W, MAP_H, Z_MIN, Z_MAX, G, O, F, OBJ, GROUND } from '../shared/constants.js';

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNoise(seed) {
  const hash = (x, y) => {
    let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  const smooth = (t) => t * t * (3 - 2 * t);
  const value = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = smooth(x - xi), v = smooth(y - yi);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y, scale = 0.08, oct = 3) => {
    let amp = 1, f = scale, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += value(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return sum / norm;
  };
}

const TREES = [O.PINE, O.OAK, O.BIRCH];

class Generator {
  constructor(seed) {
    this.seed = seed;
    this.rnd = mulberry32(seed);
    this.noise = makeNoise(seed);
    this.noise2 = makeNoise(seed + 101);
    this.noise3 = makeNoise(seed + 202);
    this.map = new GameMap(MAP_W, MAP_H, Z_MIN, Z_MAX);
    this.spawns = [];
    this.npcSpots = {};
    this.questChests = [];
    this.regions = [];
    this.portalObjs = [];
  }

  r(a, b) { return a + Math.floor(this.rnd() * (b - a + 1)); }
  chance(p) { return this.rnd() < p; }

  set(x, y, z, g, o = O.NONE, variant) {
    this.map.setGround(x, y, z, g);
    this.map.setObj(x, y, z, o, variant);
  }

  rect(z, x0, y0, x1, y1, fn) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) fn(x, y);
  }

  fill(z, x0, y0, x1, y1, g, o = O.NONE) {
    this.rect(z, x0, y0, x1, y1, (x, y) => this.set(x, y, z, g, o));
  }

  // Walled building with a roof. Interior is flagged INDOOR (+PZ).
  building(z, x0, y0, x1, y1, opt = {}) {
    const wall = opt.wall ?? O.WALL_WOOD;
    const floor = opt.floor ?? G.WOOD;
    const id = this.map.roofs.length + 1;
    this.rect(z, x0, y0, x1, y1, (x, y) => {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      this.set(x, y, z, floor, edge ? wall : O.NONE);
      this.map.setRoof(x, y, z, id);
      if (!edge) this.map.addFlag(x, y, z, F.INDOOR | (opt.pz === false ? 0 : F.PZ));
    });
    for (const [dx, dy] of opt.doors || []) {
      const vertical = dx === x0 || dx === x1;
      this.set(dx, dy, z, floor, O.DOOR, vertical ? 1 : 0);
      this.map.addFlag(dx, dy, z, F.PZ);
    }
    if (opt.torches) {
      for (const [tx, ty] of opt.torches) this.map.setObj(tx, ty, z, O.WALL_TORCH);
    }
    this.map.roofs.push({
      id, x0, y0, x1, y1, z,
      color: opt.roofColor ?? 0x9a3a2a, style: opt.style ?? 'gable',
      wallH: opt.wallH ?? 1.5, name: opt.name || '',
    });
    return id;
  }

  // Draws a road polyline with a little wobble; clears blocking objects.
  road(points, width = 2, ground = G.DIRT) {
    for (let i = 0; i < points.length - 1; i++) {
      const [ax, ay] = points[i], [bx, by] = points[i + 1];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        let x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        const wob = (this.noise3(x, y, 0.15, 1) - 0.5) * 2.2;
        if (Math.abs(bx - ax) > Math.abs(by - ay)) y += wob; else x += wob;
        for (let oy = 0; oy < width; oy++) for (let ox = 0; ox < width; ox++) {
          const tx = Math.round(x) + ox - (width >> 1), ty = Math.round(y) + oy - (width >> 1);
          if (!this.map.inBounds(tx, ty, 0)) continue;
          const g = this.map.ground(tx, ty, 0);
          if (g === G.WATER || g === G.DEEPWATER) this.set(tx, ty, 0, G.BRIDGE);
          else if (g !== G.COBBLE && g !== G.BRIDGE) this.set(tx, ty, 0, ground);
          else this.map.setObj(tx, ty, 0, O.NONE);
          this.map.addFlag(tx, ty, 0, F.ROAD);
        }
        // keep the shoulders free of trees and rocks
        for (let oy = -1; oy <= width; oy++) for (let ox = -1; ox <= width; ox++) {
          const tx = Math.round(x) + ox - (width >> 1), ty = Math.round(y) + oy - (width >> 1);
          const o = this.map.obj(tx, ty, 0);
          if (o && OBJ[o].block && o !== O.WALL_STONE && o !== O.WALL_TORCH && o !== O.FENCE) this.map.setObj(tx, ty, 0, O.NONE);
        }
      }
    }
  }

  portalPair(x, y, zTop, kind = 'stairs') {
    // Surface/top tile leads down, the lower tile leads back up. Arrival is
    // one tile south of the portal on both floors.
    const zLow = zTop - 1;
    const down = kind === 'hole' ? O.HOLE : O.STAIRS_DOWN;
    const up = kind === 'hole' ? O.LADDER : O.STAIRS_UP;
    this.map.setObj(x, y, zTop, down);
    this.map.setObj(x, y, zLow, up);
    this.portalObjs.push([x, y, zTop, down], [x, y, zLow, up]);
    this.map.addPortal(x, y, zTop, x, y + 1, zLow);
    this.map.addPortal(x, y, zLow, x, y + 1, zTop);
    for (const z of [zTop, zLow]) {
      const g = this.map.ground(x, y + 1, z);
      if (!GROUND[g] || !GROUND[g].walk) this.map.setGround(x, y + 1, z, z === 0 ? G.ROCK : G.CAVE);
      this.map.setObj(x, y + 1, z, O.NONE);
      if (!GROUND[this.map.ground(x, y, z)]?.walk) this.map.setGround(x, y, z, z === 0 ? G.ROCK : G.CAVE);
    }
  }

  spawn(type, x, y, z, radius, count, respawn = 60) {
    this.spawns.push({ type, x, y, z, radius, count, respawn });
  }

  region(name, x, y, z = 0) { this.regions.push({ name, x, y, z }); }

  // ------------------------------------------------------------------------
  surface() {
    const z = 0, m = this.map;
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const dx = (x - 80) / 74, dy = (y - 80) / 74;
      const d = Math.sqrt(dx * dx + dy * dy);
      const n = this.noise(x, y, 0.05, 4);
      const land = d + (n - 0.5) * 0.45;
      let g, o = O.NONE;
      if (land > 1.02) g = land > 1.1 ? G.DEEPWATER : G.WATER;
      else if (land > 0.95) g = G.SAND;
      else {
        g = G.GRASS;
        const fl = this.noise2(x, y, 0.2, 2);
        if (fl > 0.72) o = O.FLOWERS;
        else if (fl < 0.2) o = O.TALL_GRASS;
        if (this.noise3(x, y, 0.09, 2) > 0.7) g = G.DIRT;
      }
      this.set(x, y, z, g, o, Math.floor(this.rnd() * 256));
    }

    // Biomes
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) {
      const g = m.ground(x, y, z);
      if (g !== G.GRASS && g !== G.DIRT) continue;
      const n = this.noise2(x, y, 0.07, 3);
      const v = Math.floor(this.rnd() * 256);
      // Western mountains (Góry Żebrowe)
      const mount = (56 - x) / 26 + (n - 0.5) * 0.9;
      if (mount > 0.62) { this.set(x, y, z, G.ROCK, O.MOUNTAIN, v); continue; }
      if (mount > 0.38) {
        this.set(x, y, z, G.ROCK, this.chance(0.06) ? O.BOULDER : this.chance(0.08) ? O.PEBBLES : this.chance(0.03) ? O.PINE : O.NONE, v);
        continue;
      }
      // Southern swamp (Bagna Kulszowe)
      const sw = (y - 106) / 18 + (this.noise3(x, y, 0.06, 3) - 0.5) * 0.9 - Math.max(0, x - 108) / 10;
      if (sw > 0.45) {
        const p = this.noise(x + 300, y, 0.14, 2);
        if (p > 0.66) this.set(x, y, z, G.SHALLOW, this.chance(0.12) ? O.LILYPAD : O.NONE, v);
        else this.set(x, y, z, G.SWAMP, this.chance(0.07) ? O.DEAD_TREE : this.chance(0.12) ? O.REEDS : this.chance(0.04) ? O.MUSHROOMS : O.NONE, v);
        continue;
      }
      // Northern forest (Las Strzałkowy)
      const fo = (64 - y) / 22 + (n - 0.5) * 0.8;
      if (fo > 0.35) {
        const dens = Math.min(0.62, 0.2 + fo * 0.35);
        const tree = this.chance(dens);
        const pick = this.noise3(x, y, 0.12, 1) > 0.5 ? O.PINE : (this.chance(0.5) ? O.OAK : O.BIRCH);
        this.set(x, y, z, fo > 0.6 ? G.FOREST : G.GRASS,
          tree ? pick : this.chance(0.05) ? O.BUSH : this.chance(0.06) ? O.MUSHROOMS : this.chance(0.1) ? O.TALL_GRASS : O.NONE, v);
        continue;
      }
      // Plains
      if (this.chance(0.025)) m.setObj(x, y, z, TREES[1 + (v & 1)], v);
      else if (this.chance(0.012)) m.setObj(x, y, z, O.BUSH, v);
      else if (this.chance(0.006)) m.setObj(x, y, z, O.ROCK_SMALL, v);
    }

    this.town();
    this.roads();
    this.orcCamp();
    this.cemetery();
    this.northRuins();
    this.caveEntrance();
    this.pier();
    this.surfaceSpawns();
    this.signs();
  }

  town() {
    const z = 0, m = this.map;
    // clear & base
    this.rect(z, 62, 64, 100, 100, (x, y) => {
      if (m.ground(x, y, z) === G.WATER || m.ground(x, y, z) === G.DEEPWATER) return;
      this.set(x, y, z, G.GRASS, O.NONE, Math.floor(this.rnd() * 256));
    });
    // town walls
    this.rect(z, 66, 68, 96, 96, (x, y) => {
      const edge = x === 66 || x === 96 || y === 68 || y === 96;
      if (edge) {
        const torch = ((x + y) % 7 === 0);
        this.set(x, y, z, G.COBBLE, torch ? O.WALL_TORCH : O.WALL_STONE);
      } else {
        m.addFlag(x, y, z, F.PZ);
        if (this.chance(0.05)) m.setObj(x, y, z, O.FLOWERS, Math.floor(this.rnd() * 256));
      }
    });
    // gates
    for (let i = 82; i <= 84; i++) { this.set(66, i, z, G.COBBLE); this.set(96, i, z, G.COBBLE); m.addFlag(66, i, z, F.PZ); m.addFlag(96, i, z, F.PZ); }
    for (let i = 88; i <= 90; i++) { this.set(i, 68, z, G.COBBLE); this.set(i, 96, z, G.COBBLE); m.addFlag(i, 68, z, F.PZ); m.addFlag(i, 96, z, F.PZ); }
    // gate towers
    for (const [x, y] of [[66, 81], [66, 85], [96, 81], [96, 85], [87, 68], [91, 68], [87, 96], [91, 96]]) m.setObj(x, y, z, O.WALL_TORCH);
    // streets
    this.fill(z, 67, 82, 95, 84, G.COBBLE);
    this.fill(z, 88, 69, 90, 95, G.COBBLE);
    // plaza
    this.fill(z, 72, 79, 86, 87, G.COBBLE);
    m.setObj(79, 83, z, O.FOUNTAIN);
    for (const [x, y] of [[72, 79], [86, 79], [72, 87], [86, 87]]) m.setObj(x, y, z, O.LAMP_POST);
    for (const [x, y] of [[77, 81], [81, 81], [77, 85], [81, 85]]) m.setObj(x, y, z, O.BENCH, (y === 81 ? 2 : 0));
    m.setObj(79, 86, z, O.STATUE);
    // lamp posts along streets
    for (const [x, y] of [[68, 81], [94, 81], [91, 79], [87, 88], [87, 80], [68, 85], [94, 85]]) m.setObj(x, y, z, O.LAMP_POST);

    // Temple (Świątynia Rzepki)
    this.building(z, 68, 70, 80, 78, {
      wall: O.WALL_STONE, floor: G.MARBLE, doors: [[73, 78], [74, 78], [75, 78]],
      roofColor: 0x5a6a8a, style: 'hip', wallH: 2.0, name: 'Świątynia',
      torches: [[68, 74], [80, 74]],
    });
    this.fill(z, 74, 71, 74, 77, G.CARPET);
    m.setObj(74, 71, z, O.ALTAR);
    for (const [x, y] of [[70, 72], [70, 76], [78, 72], [78, 76]]) m.setObj(x, y, z, O.PILLAR);
    m.setObj(69, 71, z, O.BRAZIER); m.setObj(79, 71, z, O.BRAZIER);
    m.setObj(71, 71, z, O.BOOKSHELF); m.setObj(77, 71, z, O.BOOKSHELF);
    m.setObj(71, 74, z, O.BENCH, 1); m.setObj(77, 74, z, O.BENCH, 3);
    this.npcSpots.priest = { x: 75, y: 72, z };
    this.temple = { x: 74, y: 75, z };

    // Blacksmith (Kuźnia)
    this.building(z, 81, 70, 87, 77, {
      wall: O.WALL_STONE, floor: G.COBBLE, doors: [[87, 75]], roofColor: 0x4a4a52, style: 'gable', name: 'Kuźnia',
    });
    for (let x = 83; x <= 86; x++) m.setObj(x, 73, z, O.COUNTER);
    m.setObj(82, 71, z, O.ANVIL); m.setObj(86, 71, z, O.BARREL); m.setObj(82, 73, z, O.BRAZIER);
    m.setObj(82, 76, z, O.CRATE);
    this.npcSpots.smith = { x: 84, y: 72, z };

    // Hunter's lodge
    this.building(z, 91, 70, 95, 77, { doors: [[91, 74]], roofColor: 0x6a4a2a, name: 'Chata myśliwego' });
    for (let y = 72; y <= 75; y++) m.setObj(93, y, z, O.COUNTER);
    m.setObj(94, 71, z, O.LOG_PILE); m.setObj(92, 76, z, O.BARREL);
    this.npcSpots.hunter = { x: 94, y: 73, z };

    // Magic shop (Ziołownia)
    this.building(z, 67, 88, 75, 95, { doors: [[71, 88]], roofColor: 0x40306a, style: 'hip', name: 'Ziołownia' });
    for (let x = 68; x <= 72; x++) m.setObj(x, 91, z, O.COUNTER);
    for (const [x, y] of [[68, 94], [69, 94], [74, 89], [74, 90]]) m.setObj(x, y, z, O.BOOKSHELF);
    m.setObj(74, 94, z, O.CRYSTAL); m.setObj(73, 94, z, O.TABLE);
    this.npcSpots.herbalist = { x: 70, y: 92, z };

    // Tavern (Karczma Pod Kością)
    this.building(z, 77, 89, 86, 95, { doors: [[81, 89]], roofColor: 0x8a3a1a, name: 'Karczma' });
    for (let x = 78; x <= 81; x++) m.setObj(x, 92, z, O.COUNTER);
    for (const [x, y] of [[78, 94], [79, 94], [85, 90]]) m.setObj(x, y, z, O.BARREL);
    for (const [x, y] of [[84, 92], [84, 94]]) m.setObj(x, y, z, O.TABLE);
    for (const [x, y] of [[83, 92], [85, 92], [83, 94], [85, 94]]) m.setObj(x, y, z, O.BENCH, 1);
    m.setObj(78, 90, z, O.BRAZIER);
    this.npcSpots.innkeeper = { x: 79, y: 93, z };

    // Two homes
    this.building(z, 91, 86, 95, 94, { doors: [[91, 90]], roofColor: 0xa04a2a, name: 'Dom' });
    m.setObj(94, 87, z, O.BED, 0); m.setObj(94, 92, z, O.TABLE); m.setObj(92, 93, z, O.CHEST);

    // Gardens, trees and the well
    m.setObj(84, 80, z, O.WELL);
    for (const [x, y] of [[69, 86], [93, 79], [93, 78], [83, 78], [71, 84 + 1]]) m.setObj(x, y, z, O.OAK, this.r(0, 255));
    // carts & crates near gates
    m.setObj(93, 85, z, O.CART, 1); m.setObj(69, 85, z, O.CRATE);

    this.npcSpots.guard = { x: 94, y: 83, z };
    this.region('Patella', 81, 82);
  }

  roads() {
    this.road([[65, 83], [56, 84], [48, 82], [40, 84]], 2);           // west → caves
    this.road([[97, 83], [108, 82], [118, 80], [122, 82]], 2);        // east → orcs
    this.road([[108, 83], [112, 96], [118, 108]], 2);                 // → cemetery
    this.road([[89, 67], [88, 56], [91, 44], [89, 33]], 2);           // north → ruins
    this.road([[89, 97], [88, 108], [86, 120], [88, 132], [89, 139]], 2); // south → pier
  }

  orcCamp() {
    const z = 0, m = this.map, cx = 132, cy = 81, r = 9;
    this.rect(z, cx - r - 2, cy - r - 2, cx + r + 2, cy + r + 2, (x, y) => {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (m.ground(x, y, z) === G.WATER || m.ground(x, y, z) === G.DEEPWATER || m.ground(x, y, z) === G.SAND) return;
      if (d <= r + 1.5) this.set(x, y, z, G.DIRT, O.NONE, this.r(0, 255));
      if (d > r - 0.5 && d <= r + 0.5) {
        const gate = x < cx - r + 3 && Math.abs(y - cy) <= 1;
        if (!gate) m.setObj(x, y, z, O.PALISADE, this.r(0, 255));
      }
    });
    m.setObj(cx, cy, z, O.CAMPFIRE);
    for (const [x, y] of [[cx + 4, cy - 4], [cx + 4, cy + 4], [cx - 2, cy - 5], [cx - 2, cy + 5], [cx + 6, cy]]) m.setObj(x, y, z, O.TENT, this.r(0, 3));
    for (const [x, y] of [[cx - 7, cy - 2], [cx - 7, cy + 2]]) m.setObj(x, y, z, O.BRAZIER);
    for (const [x, y] of [[cx + 2, cy + 2], [cx - 3, cy + 1], [cx + 1, cy - 3]]) m.setObj(x, y, z, O.BONES);
    m.setObj(cx + 7, cy - 3, z, O.LOG_PILE); m.setObj(cx + 7, cy + 3, z, O.CRATE);
    this.spawn('orc', cx, cy, z, 6, 5, 60);
    this.spawn('orc_warrior', cx + 3, cy, z, 4, 2, 90);
    this.spawn('orc_shaman', cx + 2, cy - 2, z, 3, 2, 120);
    this.spawn('orc_spearman', 124, 70, z, 5, 3, 70);
    this.spawn('orc', 122, 94, z, 5, 3, 60);
    this.region('Obóz Orków', cx, cy);
  }

  cemetery() {
    const z = 0, m = this.map, x0 = 110, y0 = 110, x1 = 127, y1 = 127;
    this.rect(z, x0, y0, x1, y1, (x, y) => {
      if (m.ground(x, y, z) === G.WATER || m.ground(x, y, z) === G.DEEPWATER) return;
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      this.set(x, y, z, this.noise3(x, y, 0.25, 2) > 0.68 ? G.DIRT : G.GRASS, edge ? O.FENCE : O.NONE, this.r(0, 255));
    });
    for (let x = 117; x <= 119; x++) this.set(x, y0, z, G.DIRT);
    for (let y = y0 + 3; y <= y1 - 7; y += 3) for (let x = x0 + 2; x <= x1 - 2; x += 3) {
      if (Math.abs(x - 118) <= 1) continue;
      m.setObj(x, y, z, O.TOMBSTONE, this.r(0, 255));
      m.setGround(x, y + 1, z, G.DIRT);
    }
    for (const [x, y] of [[x0 + 2, y1 - 2], [x1 - 2, y1 - 3], [x0 + 3, y0 + 2], [x1 - 3, y0 + 2]]) m.setObj(x, y, z, O.DEAD_TREE, this.r(0, 255));
    // mausoleum with the crypt stairs
    this.building(z, 115, 121, 121, 126, { wall: O.WALL_CRYPT, floor: G.CRYPT, doors: [[118, 121]], roofColor: 0x3a3a48, style: 'hip', name: 'Mauzoleum', pz: false, wallH: 1.8 });
    m.setObj(116, 122, z, O.BRAZIER); m.setObj(120, 122, z, O.BRAZIER);
    this.portalPair(118, 124, 0, 'stairs');
    this.map.setGround(118, 124, -1, G.CRYPT);
    this.spawn('skeleton', 118, 115, z, 6, 4, 60);
    this.spawn('ghoul', 113, 118, z, 3, 2, 90);
    this.region('Stary Cmentarz', 118, 116);
  }

  northRuins() {
    const z = 0, m = this.map, cx = 89, cy = 28;
    this.rect(z, cx - 6, cy - 5, cx + 6, cy + 5, (x, y) => this.set(x, y, z, this.chance(0.5) ? G.DIRT : G.GRASS, O.NONE, this.r(0, 255)));
    // broken tower walls
    this.rect(z, cx - 3, cy - 3, cx + 3, cy + 3, (x, y) => {
      const edge = x === cx - 3 || x === cx + 3 || y === cy - 3 || y === cy + 3;
      if (edge && this.chance(0.7) && !(y === cy + 3 && Math.abs(x - cx) <= 1)) m.setObj(x, y, z, O.WALL_STONE);
      if (!edge) m.setGround(x, y, z, G.COBBLE);
    });
    m.setObj(cx, cy, z, O.CAMPFIRE);
    m.setObj(cx - 1, cy - 2, z, O.QUEST_CHEST);
    this.questChests.push({ x: cx - 1, y: cy - 2, z, quest: 'ruins', reward: { id: 'swift_boots', n: 1 }, need: 8,
      text: 'Pod gruzami starej wieży znajdujesz zakurzony kufer.' });
    m.setObj(cx + 2, cy - 2, z, O.STATUE);
    this.spawn('wolf', 72, 40, z, 6, 4, 50);
    this.spawn('wolf', 106, 36, z, 6, 4, 50);
    this.spawn('wolf', 54, 50, z, 5, 3, 50);
    this.spawn('bear', 64, 22, z, 5, 2, 120);
    this.spawn('bear', 116, 22, z, 5, 2, 120);
    this.spawn('deer', 92, 50, z, 8, 3, 60);
    this.spawn('deer', 62, 58, z, 6, 2, 60);
    this.spawn('bandit', cx, cy, z, 4, 3, 90);
    this.region('Las Strzałkowy', 80, 40);
    this.region('Ruiny Strażnicy', cx, cy);
  }

  caveEntrance() {
    const z = 0, m = this.map, cx = 38, cy = 83;
    this.rect(z, cx - 4, cy - 4, cx + 4, cy + 4, (x, y) => {
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (d <= 4.2) this.set(x, y, z, G.ROCK, d > 3.4 && x < cx ? O.BOULDER : O.NONE, this.r(0, 255));
    });
    this.rect(z, cx - 1, cy - 2, cx + 1, cy - 2, (x, y) => m.setObj(x, y, z, O.MOUNTAIN));
    m.setObj(cx - 2, cy + 1, z, O.BRAZIER);
    m.setObj(cx + 2, cy + 1, z, O.BRAZIER);
    this.portalPair(cx, cy, 0, 'stairs');
    this.region('Góry Żebrowe', 30, 70);
  }

  pier() {
    const z = 0, m = this.map;
    // find the shore south of the road end and build a pier into the sea
    let y = 132;
    while (y < MAP_H - 3 && m.ground(89, y, z) !== G.WATER && m.ground(89, y, z) !== G.DEEPWATER) y++;
    for (let i = y - 1; i < Math.min(MAP_H - 2, y + 7); i++) for (let x = 88; x <= 90; x++) this.set(x, i, z, G.BRIDGE);
    const end = Math.min(MAP_H - 3, y + 6);
    m.setObj(88, end, z, O.BARREL); m.setObj(90, end, z, O.CRATE);
    m.setObj(88, y + 1, z, O.LAMP_POST);
    this.npcSpots.fisher = { x: 89, y: end - 1, z };
    // swamp spawns
    this.spawn('snake', 62, 120, z, 6, 4, 50);
    this.spawn('snake', 100, 124, z, 6, 3, 50);
    this.spawn('poison_spider', 50, 132, z, 5, 3, 60);
    this.spawn('slime', 72, 138, z, 5, 2, 90);
    this.spawn('swamp_troll', 58, 140, z, 5, 3, 70);
    this.region('Bagna Kulszowe', 66, 128);
  }

  surfaceSpawns() {
    this.spawn('rat', 102, 90, 0, 5, 4, 30);
    this.spawn('rat', 104, 72, 0, 5, 3, 30);
    this.spawn('rat', 58, 93, 0, 4, 3, 30);
    this.spawn('rabbit', 76, 58, 0, 6, 3, 40);
    this.spawn('rabbit', 110, 98, 0, 6, 3, 40);
    this.region('Równiny Rzepkowe', 110, 90);
  }

  signs() {
    const m = this.map;
    const sign = (x, y, text) => { m.setObj(x, y, 0, O.SIGN); m.signs.set(`${x},${y},0`, text); };
    sign(64, 81, 'Zachód: Góry Żebrowe i Jaskinie Kręgowe. Uważaj na trolle!');
    sign(98, 81, 'Wschód: Równiny Rzepkowe, Obóz Orków. Południowy wschód: Stary Cmentarz.');
    sign(87, 66, 'Północ: Las Strzałkowy i Ruiny Strażnicy.');
    sign(91, 98, 'Południe: Bagna Kulszowe i przystań rybacka.');
    sign(76, 79, 'Witaj w Patelli! Świątynia na północ, kuźnia obok. Ziołownia i karczma na południu.');
  }

  // ------------------------------------------------------------------------
  // Underground helpers
  carveDisk(z, cx, cy, r, ground = G.CAVE) {
    const R = Math.ceil(r + 2);
    for (let y = cy - R; y <= cy + R; y++) for (let x = cx - R; x <= cx + R; x++) {
      if (x < 2 || y < 2 || x >= MAP_W - 2 || y >= MAP_H - 2) continue;
      const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      const n = (this.noise(x * 1.7 + z * 50, y * 1.7, 0.3, 2) - 0.5) * 2.4;
      if (d <= r + n) this.set(x, y, z, ground, O.NONE, this.r(0, 255));
    }
  }

  tunnel(z, ax, ay, bx, by, width = 1.3) {
    let x = ax, y = ay, guard = 0;
    while ((Math.abs(x - bx) > 1 || Math.abs(y - by) > 1) && guard++ < 1000) {
      const dx = bx - x, dy = by - y, len = Math.sqrt(dx * dx + dy * dy);
      x += dx / len + (this.rnd() - 0.5) * 1.2;
      y += dy / len + (this.rnd() - 0.5) * 1.2;
      this.carveDisk(z, Math.round(x), Math.round(y), width);
    }
  }

  // Walls on every void tile that touches a carved tile.
  wallUp(z, wall = O.WALL_CAVE, x0 = 0, y0 = 0, x1 = MAP_W - 1, y1 = MAP_H - 1) {
    const m = this.map, mark = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (m.ground(x, y, z) !== G.NONE) continue;
      let near = false;
      for (let oy = -1; oy <= 1 && !near; oy++) for (let ox = -1; ox <= 1; ox++) {
        const g = m.ground(x + ox, y + oy, z);
        if (g !== G.NONE && m.obj(x + ox, y + oy, z) !== wall) { near = true; break; }
      }
      if (near) mark.push([x, y]);
    }
    for (const [x, y] of mark) this.set(x, y, z, G.ROCK, wall, this.r(0, 255));
  }

  decorateCave(z, x0, y0, x1, y1) {
    const m = this.map;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (m.ground(x, y, z) !== G.CAVE || m.obj(x, y, z) !== O.NONE || m.portalAt(x, y, z)) continue;
      let walls = 0;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) if (m.obj(x + ox, y + oy, z) === O.WALL_CAVE) walls++;
      const v = this.r(0, 255);
      if (walls >= 3 && this.chance(0.08)) m.setObj(x, y, z, O.STALAGMITE, v);
      else if (this.chance(0.04)) m.setObj(x, y, z, O.PEBBLES, v);
      else if (this.chance(0.015)) m.setObj(x, y, z, O.MUSHROOMS, v);
      else if (this.chance(0.01)) m.setObj(x, y, z, O.BONES, v);
    }
  }

  caves() {
    const z = -1;
    const rooms = {
      entry: [38, 86, 4], trolls: [24, 70, 6], hall: [52, 62, 5], spiders: [20, 101, 6],
      lake: [32, 118, 6], grotto: [50, 108, 5], deep: [14, 86, 4], bats: [44, 96, 3.5],
    };
    for (const [x, y, r] of Object.values(rooms)) this.carveDisk(z, x, y, r);
    const link = (a, b, w) => this.tunnel(z, rooms[a][0], rooms[a][1], rooms[b][0], rooms[b][1], w);
    link('entry', 'trolls'); link('entry', 'hall'); link('entry', 'bats'); link('bats', 'grotto');
    link('entry', 'spiders'); link('spiders', 'lake'); link('lake', 'grotto'); link('trolls', 'deep', 1.1);
    // underground lake
    const [lx, ly] = rooms.lake;
    this.rect(z, lx - 3, ly - 2, lx + 3, ly + 2, (x, y) => {
      if (Math.sqrt((x - lx) ** 2 + ((y - ly) * 1.4) ** 2) < 3) this.set(x, y, z, G.WATER);
    });
    this.wallUp(z, O.WALL_CAVE, 0, 30, 75, 140);
    this.decorateCave(z, 0, 30, 75, 140);
    const m = this.map;
    // crystal grotto & webs & the bone hall
    const [gx, gy] = rooms.grotto;
    for (const [dx, dy] of [[-3, -1], [2, -3], [3, 2], [-2, 3], [0, 0]]) { m.setObj(gx + dx, gy + dy, z, O.CRYSTAL, this.r(0, 255)); }
    const [sx, sy] = rooms.spiders;
    for (let i = 0; i < 18; i++) {
      const x = sx + this.r(-5, 5), y = sy + this.r(-5, 5);
      if (m.ground(x, y, z) === G.CAVE && m.obj(x, y, z) === O.NONE) m.setObj(x, y, z, O.WEB, this.r(0, 255));
    }
    const [hx, hy] = rooms.hall;
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3]]) { if (m.ground(hx + dx, hy + dy, z) === G.CAVE) m.setObj(hx + dx, hy + dy, z, O.BRAZIER); }
    for (let i = 0; i < 8; i++) {
      const x = hx + this.r(-4, 4), y = hy + this.r(-4, 4);
      if (m.ground(x, y, z) === G.CAVE && m.obj(x, y, z) === O.NONE) m.setObj(x, y, z, O.BONES, this.r(0, 255));
    }
    // entry decorations
    m.setObj(36, 88, z, O.BRAZIER); m.setObj(40, 88, z, O.BRAZIER);
    // hole to the dragon lair
    const [dx0, dy0] = rooms.deep;
    this.portalPair(dx0, dy0, -1, 'hole');

    this.spawn('troll', 24, 70, z, 5, 5, 50);
    this.spawn('troll_champion', 22, 68, z, 3, 1, 180);
    this.spawn('skeleton', 52, 62, z, 4, 4, 60);
    this.spawn('poison_spider', 20, 101, z, 5, 4, 60);
    this.spawn('giant_spider', 18, 103, z, 3, 1, 300);
    this.spawn('bat', 44, 96, z, 3, 3, 40);
    this.spawn('bat', 32, 114, z, 5, 3, 40);
    this.spawn('slime', 50, 108, z, 4, 2, 90);
    this.region('Jaskinie Kręgowe', 34, 90, -1);
  }

  crypt() {
    const z = -1, m = this.map;
    const room = (x0, y0, x1, y1) => this.fill(z, x0, y0, x1, y1, G.CRYPT);
    room(116, 123, 120, 128);        // stair room
    room(117, 129, 119, 132);        // corridor
    room(106, 133, 130, 139);        // great hall
    room(100, 135, 105, 137);        // west corridor
    room(96, 130, 103, 142);         // west chapel
    room(131, 135, 135, 137);        // east corridor
    room(134, 131, 141, 141);        // ossuary
    room(117, 140, 119, 143);        // corridor south
    room(110, 144, 126, 153);        // boss chamber
    this.wallUp(z, O.WALL_CRYPT, 90, 118, 150, 158);
    // torches on some walls
    for (let y = 118; y <= 158; y++) for (let x = 90; x <= 150; x++) {
      if (m.obj(x, y, z) === O.WALL_CRYPT && (x * 7 + y * 3) % 11 === 0 && m.ground(x, y + 1, z) === G.CRYPT) m.setObj(x, y, z, O.WALL_TORCH);
    }
    for (let x = 108; x <= 128; x += 4) { m.setObj(x, 134, z, O.SARCOPHAGUS); m.setObj(x, 138, z, O.SARCOPHAGUS); }
    for (let y = 132; y <= 140; y += 2) { m.setObj(97, y, z, O.COFFIN); m.setObj(140, y, z, O.BONES); }
    m.setObj(99, 131, z, O.ALTAR);
    for (const [x, y] of [[112, 146], [124, 146], [112, 151], [124, 151]]) m.setObj(x, y, z, O.PILLAR);
    for (const [x, y] of [[114, 145], [122, 145]]) m.setObj(x, y, z, O.BRAZIER);
    m.setObj(118, 152, z, O.QUEST_CHEST);
    this.questChests.push({ x: 118, y: 152, z, quest: 'crypt', reward: { id: 'bone_shield', n: 1 }, need: 20,
      text: 'Sarkofag Kościeja skrywał kufer z kościaną tarczą.' });
    this.spawn('skeleton', 118, 136, z, 8, 6, 60);
    this.spawn('ghoul', 100, 136, z, 3, 2, 90);
    this.spawn('ghoul', 137, 136, z, 3, 2, 90);
    this.spawn('lich', 118, 148, z, 2, 1, 1200);
    this.region('Krypta', 118, 140, -1);
  }

  lair() {
    const z = -2, m = this.map;
    this.carveDisk(z, 14, 87, 3);
    this.carveDisk(z, 26, 96, 9);
    this.carveDisk(z, 36, 108, 6);
    this.carveDisk(z, 18, 110, 5);
    this.tunnel(z, 14, 87, 26, 96, 1.5);
    this.tunnel(z, 26, 96, 36, 108, 1.6);
    this.tunnel(z, 26, 96, 18, 110, 1.4);
    // lava pools
    for (const [cx, cy, r] of [[30, 92, 2.2], [22, 100, 1.6], [38, 111, 1.8]]) {
      this.rect(z, cx - 3, cy - 3, cx + 3, cy + 3, (x, y) => {
        if (Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) < r && m.ground(x, y, z) === G.CAVE) this.set(x, y, z, G.LAVA);
      });
    }
    this.wallUp(z, O.WALL_CAVE, 0, 70, 60, 130);
    this.decorateCave(z, 0, 70, 60, 130);
    for (let i = 0; i < 14; i++) {
      const x = this.r(16, 40), y = this.r(88, 114);
      if (m.ground(x, y, z) === G.CAVE && m.obj(x, y, z) === O.NONE) m.setObj(x, y, z, O.BONES, this.r(0, 255));
    }
    m.setObj(18, 112, z, O.QUEST_CHEST);
    this.questChests.push({ x: 18, y: 112, z, quest: 'lair', reward: { id: 'dragon_mail', n: 1 }, need: 30,
      text: 'Ze smoczego skarbca wyciągasz lśniącą smoczą zbroję!' });
    m.setObj(16, 109, z, O.CRYSTAL); m.setObj(21, 108, z, O.CRYSTAL);
    this.spawn('dragon_hatchling', 26, 96, z, 6, 3, 120);
    this.spawn('dragon', 36, 108, z, 3, 2, 600);
    this.spawn('dragon', 22, 108, z, 3, 1, 600);
    this.region('Smocze Leże', 28, 100, -2);
  }

  validate() {
    const m = this.map;
    // Later carving may have overwritten portal objects, restore them.
    for (const [x, y, z, o] of this.portalObjs) {
      m.setObj(x, y, z, o);
      if (!GROUND[m.ground(x, y, z)]?.walk) m.setGround(x, y, z, z === 0 ? G.ROCK : G.CAVE);
    }
    // Every portal must land on a walkable tile.
    for (const [k, t] of m.portals) {
      if (!m.walkable(t.x, t.y, t.z)) {
        m.setObj(t.x, t.y, t.z, O.NONE);
        if (!GROUND[m.ground(t.x, t.y, t.z)]?.walk) m.setGround(t.x, t.y, t.z, t.z === 0 ? G.ROCK : G.CAVE);
      }
    }
  }

  build() {
    this.surface();
    this.caves();
    this.crypt();
    this.lair();
    this.validate();
    this.map.meta = {
      name: 'Fibula',
      temple: this.temple,
      regions: this.regions,
    };
    return {
      map: this.map,
      spawns: this.spawns,
      npcSpots: this.npcSpots,
      questChests: this.questChests,
      temple: this.temple,
    };
  }
}

export function generateWorld(seed = 7720) {
  return new Generator(seed).build();
}
