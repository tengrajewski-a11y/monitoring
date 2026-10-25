// Shared constants used by both the server and the browser client.
// Everything here is plain data so it can be imported from Node and from the
// browser (served as /shared/constants.js) without a bundler.

export const GAME_NAME = 'Fibula 3D';
export const PROTOCOL_VERSION = 1;

// World geometry --------------------------------------------------------------
export const MAP_W = 160;
export const MAP_H = 160;
export const Z_MIN = -2;          // deepest floor
export const Z_MAX = 0;           // surface
export const FLOOR_COUNT = Z_MAX - Z_MIN + 1;
export const FLOOR_HEIGHT = 4;    // world units between floors (client only)

// Server heartbeat, the classic engine used a 50 ms "Beat" for quantising
// movement and actions.
export const BEAT_MS = 50;

// Directions follow the original engine ordering.
export const DIR = { N: 0, E: 1, S: 2, W: 3, SW: 4, SE: 5, NW: 6, NE: 7 };
export const DIR_DX = [0, 1, 0, -1, -1, 1, -1, 1];
export const DIR_DY = [-1, 0, 1, 0, 1, 1, -1, -1];

export function dirFromDelta(dx, dy) {
  dx = Math.sign(dx); dy = Math.sign(dy);
  for (let d = 0; d < 8; d++) if (DIR_DX[d] === dx && DIR_DY[d] === dy) return d;
  return -1;
}

// Faces only the four cardinal directions (used for turning creatures).
export function facingFromDelta(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? DIR.E : DIR.W;
  if (dy !== 0) return dy > 0 ? DIR.S : DIR.N;
  return DIR.S;
}

// Ground types -----------------------------------------------------------------
// cost = "waypoints" of the tile. Step time = cost * 1000 / speed (engine rule).
export const G = {
  NONE: 0, GRASS: 1, DIRT: 2, SAND: 3, WATER: 4, SHALLOW: 5, COBBLE: 6,
  WOOD: 7, CAVE: 8, SWAMP: 9, MARBLE: 10, LAVA: 11, FOREST: 12, ROCK: 13,
  BRIDGE: 14, CARPET: 15, CRYPT: 16, DEEPWATER: 17,
};

export const GROUND = [];
function ground(id, key, name, walk, cost, color, color2, extra = {}) {
  GROUND[id] = { id, key, name, walk, cost, color, color2, ...extra };
}
ground(G.NONE, 'none', 'Pustka', false, 0, 0x000000, 0x000000);
ground(G.GRASS, 'grass', 'Trawa', true, 140, 0x5a9a3a, 0x4d8a32);
ground(G.DIRT, 'dirt', 'Ziemia', true, 120, 0x8a6a42, 0x7a5c38);
ground(G.SAND, 'sand', 'Piasek', true, 160, 0xd8c47c, 0xccb46c);
ground(G.WATER, 'water', 'Woda', false, 0, 0x2f6fb0, 0x2a64a0, { liquid: true, depth: 0.35 });
ground(G.SHALLOW, 'shallow', 'Płycizna', true, 220, 0x4f8fc0, 0x4888b8, { liquid: true, depth: 0.12 });
ground(G.COBBLE, 'cobble', 'Bruk', true, 100, 0x8c8c94, 0x7c7c86);
ground(G.WOOD, 'wood', 'Deski', true, 100, 0x9a6a3a, 0x8a5c30);
ground(G.CAVE, 'cave', 'Skała jaskini', true, 140, 0x5c5248, 0x544a40);
ground(G.SWAMP, 'swamp', 'Bagno', true, 200, 0x4c5a2c, 0x445226);
ground(G.MARBLE, 'marble', 'Marmur', true, 100, 0xd8d4cc, 0xc8c4bc);
ground(G.LAVA, 'lava', 'Lawa', true, 160, 0xff6a10, 0xe85008, { liquid: true, depth: 0.1, glow: true, damage: 'fire' });
ground(G.FOREST, 'forest', 'Ściółka', true, 150, 0x3f7a2c, 0x376e26);
ground(G.ROCK, 'rock', 'Kamienisty grunt', true, 150, 0x7a7468, 0x6e685c);
ground(G.BRIDGE, 'bridge', 'Most', true, 100, 0xa07448, 0x8c6438, { bridge: true });
ground(G.CARPET, 'carpet', 'Dywan', true, 100, 0xa02828, 0x902020);
ground(G.CRYPT, 'crypt', 'Płyty krypty', true, 120, 0x56566a, 0x4c4c60);
ground(G.DEEPWATER, 'deepwater', 'Głęboka woda', false, 0, 0x1f4f90, 0x1c4884, { liquid: true, depth: 0.45 });

// Map objects (one per tile) -----------------------------------------------------
// block: blocks movement, sight: blocks projectiles/line of sight,
// light: [radius, colour] for light sources, portal: tile changes floor.
export const O = {
  NONE: 0, PINE: 1, OAK: 2, DEAD_TREE: 3, BUSH: 4, BOULDER: 5, PEBBLES: 6,
  FLOWERS: 7, TALL_GRASS: 8, MUSHROOMS: 9, WALL_STONE: 10, WALL_WOOD: 11,
  WALL_CAVE: 12, MOUNTAIN: 13, DOOR: 14, FENCE: 15, PALISADE: 16,
  STAIRS_DOWN: 17, STAIRS_UP: 18, HOLE: 19, LADDER: 20, TOMBSTONE: 21,
  LAMP_POST: 22, BRAZIER: 23, TABLE: 24, COUNTER: 25, BARREL: 26, CRATE: 27,
  CHEST: 28, FOUNTAIN: 29, ALTAR: 30, STATUE: 31, TENT: 32, BED: 33,
  CRYSTAL: 34, BONES: 35, WEB: 36, STALAGMITE: 37, REEDS: 38, SIGN: 39,
  WELL: 40, CAMPFIRE: 41, ANVIL: 42, BOOKSHELF: 43, PILLAR: 44, WALL_CRYPT: 45,
  LILYPAD: 46, BIRCH: 47, WALL_TORCH: 48, SARCOPHAGUS: 49, COFFIN: 50,
  QUEST_CHEST: 51, BENCH: 52, CART: 53, LOG_PILE: 54, ROCK_SMALL: 55,
};

export const OBJ = [];
function obj(id, key, name, props = {}) {
  OBJ[id] = { id, key, name, block: false, sight: false, ...props };
}
obj(O.NONE, 'none', '');
obj(O.PINE, 'pine', 'Sosna', { block: true, sight: true, tall: true });
obj(O.OAK, 'oak', 'Dąb', { block: true, sight: true, tall: true });
obj(O.BIRCH, 'birch', 'Brzoza', { block: true, sight: true, tall: true });
obj(O.DEAD_TREE, 'dead_tree', 'Martwe drzewo', { block: true, sight: false, tall: true });
obj(O.BUSH, 'bush', 'Krzak', { block: true });
obj(O.BOULDER, 'boulder', 'Głaz', { block: true, sight: true });
obj(O.ROCK_SMALL, 'rock_small', 'Kamień', { block: true });
obj(O.PEBBLES, 'pebbles', 'Kamyki');
obj(O.FLOWERS, 'flowers', 'Kwiaty');
obj(O.TALL_GRASS, 'tall_grass', 'Wysoka trawa');
obj(O.MUSHROOMS, 'mushrooms', 'Grzyby');
obj(O.WALL_STONE, 'wall_stone', 'Kamienny mur', { block: true, sight: true, wall: true });
obj(O.WALL_WOOD, 'wall_wood', 'Drewniana ściana', { block: true, sight: true, wall: true });
obj(O.WALL_CAVE, 'wall_cave', 'Ściana jaskini', { block: true, sight: true, wall: true });
obj(O.WALL_CRYPT, 'wall_crypt', 'Mur krypty', { block: true, sight: true, wall: true });
obj(O.WALL_TORCH, 'wall_torch', 'Mur z pochodnią', { block: true, sight: true, wall: true, light: [5, 0xffa040] });
obj(O.MOUNTAIN, 'mountain', 'Skała', { block: true, sight: true, wall: true, tall: true });
obj(O.DOOR, 'door', 'Drzwi', { door: true });
obj(O.FENCE, 'fence', 'Płot', { block: true });
obj(O.PALISADE, 'palisade', 'Palisada', { block: true, sight: true, wall: true });
obj(O.STAIRS_DOWN, 'stairs_down', 'Schody w dół', { portal: true });
obj(O.STAIRS_UP, 'stairs_up', 'Schody w górę', { portal: true });
obj(O.HOLE, 'hole', 'Dziura', { portal: true });
obj(O.LADDER, 'ladder', 'Drabina', { portal: true });
obj(O.TOMBSTONE, 'tombstone', 'Nagrobek', { block: true });
obj(O.LAMP_POST, 'lamp_post', 'Latarnia', { block: true, light: [6, 0xffd080] });
obj(O.BRAZIER, 'brazier', 'Kosz ogniowy', { block: true, light: [6, 0xff9030] });
obj(O.TABLE, 'table', 'Stół', { block: true });
obj(O.COUNTER, 'counter', 'Lada', { block: true, counter: true });
obj(O.BARREL, 'barrel', 'Beczka', { block: true });
obj(O.CRATE, 'crate', 'Skrzynia', { block: true });
obj(O.CHEST, 'chest', 'Kufer', { block: true });
obj(O.QUEST_CHEST, 'quest_chest', 'Stary kufer', { block: true, usable: true });
obj(O.FOUNTAIN, 'fountain', 'Fontanna', { block: true });
obj(O.ALTAR, 'altar', 'Ołtarz', { block: true, light: [4, 0xfff0c0] });
obj(O.STATUE, 'statue', 'Posąg', { block: true, sight: true });
obj(O.TENT, 'tent', 'Namiot', { block: true, sight: true });
obj(O.BED, 'bed', 'Łóżko', { block: true });
obj(O.CRYSTAL, 'crystal', 'Kryształ', { block: true, light: [5, 0x60c0ff] });
obj(O.BONES, 'bones', 'Kości');
obj(O.WEB, 'web', 'Pajęczyna', { slow: 2 });
obj(O.STALAGMITE, 'stalagmite', 'Stalagmit', { block: true, sight: true });
obj(O.REEDS, 'reeds', 'Trzcina');
obj(O.LILYPAD, 'lilypad', 'Lilia wodna');
obj(O.SIGN, 'sign', 'Drogowskaz', { block: true, readable: true });
obj(O.WELL, 'well', 'Studnia', { block: true });
obj(O.CAMPFIRE, 'campfire', 'Ognisko', { block: true, light: [6, 0xff8020] });
obj(O.ANVIL, 'anvil', 'Kowadło', { block: true });
obj(O.BOOKSHELF, 'bookshelf', 'Regał z księgami', { block: true, sight: true });
obj(O.PILLAR, 'pillar', 'Kolumna', { block: true, sight: true });
obj(O.SARCOPHAGUS, 'sarcophagus', 'Sarkofag', { block: true });
obj(O.COFFIN, 'coffin', 'Trumna', { block: true });
obj(O.BENCH, 'bench', 'Ławka', { block: true });
obj(O.CART, 'cart', 'Wóz', { block: true });
obj(O.LOG_PILE, 'log_pile', 'Stos drewna', { block: true });

// Tile flags
export const F = {
  PZ: 1,        // protection zone: no combat, monsters cannot enter
  INDOOR: 2,    // under a roof
  NOLOGOUT: 4,
  ROAD: 8,
};

// Vocations ------------------------------------------------------------------
// Values reproduce the progression table of the 7.72 engine
// (TPlayer::SetProfession / TSkillFed::Event). Skill factors are
// FactorPercent/1000, delta is the number of tries for the first level.
export const VOCATIONS = {
  knight: {
    key: 'knight', name: 'Rycerz', hpPerLevel: 15, manaPerLevel: 5,
    secsPerHp: 6, secsPerMana: 6,
    factors: { magic: 3.0, shield: 1.1, dist: 1.4, sword: 1.1, club: 1.1, axe: 1.1, fist: 1.1 },
  },
  paladin: {
    key: 'paladin', name: 'Paladyn', hpPerLevel: 10, manaPerLevel: 15,
    secsPerHp: 8, secsPerMana: 4,
    factors: { magic: 1.4, shield: 1.1, dist: 1.1, sword: 1.2, club: 1.2, axe: 1.2, fist: 1.2 },
  },
  sorcerer: {
    key: 'sorcerer', name: 'Czarnoksiężnik', hpPerLevel: 5, manaPerLevel: 30,
    secsPerHp: 12, secsPerMana: 3,
    factors: { magic: 1.1, shield: 1.5, dist: 2.0, sword: 2.0, club: 2.0, axe: 2.0, fist: 1.5 },
  },
  druid: {
    key: 'druid', name: 'Druid', hpPerLevel: 5, manaPerLevel: 30,
    secsPerHp: 12, secsPerMana: 3,
    factors: { magic: 1.1, shield: 1.5, dist: 1.8, sword: 1.8, club: 1.8, axe: 1.8, fist: 1.5 },
  },
};

export const SKILLS = ['fist', 'club', 'sword', 'axe', 'dist', 'shield'];
export const SKILL_NAMES = {
  fist: 'Walka wręcz', club: 'Walka obuchem', sword: 'Walka mieczem', axe: 'Walka toporem',
  dist: 'Walka dystansowa', shield: 'Obrona tarczą', magic: 'Poziom magii',
};
// Tries needed for the first skill advance ("Delta" in the engine).
export const SKILL_DELTA = { fist: 50, club: 50, sword: 50, axe: 50, dist: 30, shield: 100, magic: 1600 };
export const SKILL_MIN = { fist: 10, club: 10, sword: 10, axe: 10, dist: 10, shield: 10, magic: 0 };

// Equipment slots
export const SLOTS = ['head', 'amulet', 'armor', 'weapon', 'shield', 'legs', 'ring', 'boots'];
export const SLOT_NAMES = {
  head: 'Głowa', amulet: 'Amulet', armor: 'Zbroja', weapon: 'Broń', shield: 'Tarcza',
  legs: 'Nogi', ring: 'Pierścień', boots: 'Buty',
};
export const BAG_SIZE = 20;
export const STACK_MAX = 100;

// Outfit palette (head/body/legs/feet are indices into this table).
export const OUTFIT_COLORS = [
  0xf0f0f0, 0xb0b0b0, 0x606060, 0x202020, 0xe0c090, 0xa07040, 0x603818, 0x301808,
  0xf04040, 0xa01818, 0xf0a030, 0xc06010, 0xf0e050, 0x70d040, 0x2f8f2f, 0x184818,
  0x40d0d0, 0x2080c0, 0x3040c0, 0x182070, 0xa050e0, 0x602090, 0xf070c0, 0x902060,
];
export const SKIN_COLORS = [0xf2c8a0, 0xd9a878, 0xb07a50, 0x7a5030];

// Fight modes (engine ATTACK_MODE_*)
export const FIGHT = { OFFENSIVE: 1, BALANCED: 2, DEFENSIVE: 3 };

// World clock: one in-game day lasts this many real minutes.
export const DAY_LENGTH_MIN = 40;

// Visibility range for creatures/items (tiles).
export const VIEW_RANGE = 15;
export const CHUNK = 8;
