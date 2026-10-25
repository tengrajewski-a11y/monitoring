// Item catalogue. Original Fibula content: names, numbers and art are our own,
// balanced in the spirit of the 7.x era.
//
// icon: pixel pattern key used by the client to paint inventory icons and to
//       pick a 3D model when the item lies on the ground or is held.
// col:  palette for the icon/model (primary, secondary, accent).

export const ITEMS = [];
export const ITEM_BY_KEY = {};

let nextId = 1;
function item(key, name, props) {
  const def = { id: nextId++, key, name, stack: false, value: 0, ...props };
  ITEMS[def.id] = def;
  ITEM_BY_KEY[key] = def;
  return def;
}

// --- Melee weapons ----------------------------------------------------------
item('knife', 'Nóż', { kind: 'weapon', slot: 'weapon', weaponType: 'sword', atk: 5, def: 5, value: 2, price: 10, icon: 'dagger', col: [0xc8c8d0, 0x6a4a2a, 0x909098] });
item('short_sword', 'Krótki miecz', { kind: 'weapon', slot: 'weapon', weaponType: 'sword', atk: 11, def: 11, value: 15, price: 60, icon: 'sword', col: [0xd0d0d8, 0x6a4a2a, 0xa08030] });
item('iron_sword', 'Żelazny miecz', { kind: 'weapon', slot: 'weapon', weaponType: 'sword', atk: 16, def: 13, value: 50, price: 220, icon: 'sword', col: [0xa8a8b4, 0x40302a, 0x707080] });
item('long_sword', 'Długi miecz', { kind: 'weapon', slot: 'weapon', weaponType: 'sword', atk: 21, def: 15, value: 140, price: 650, level: 10, icon: 'longsword', col: [0xe0e0ea, 0x503020, 0xc0a040] });
item('runed_sword', 'Runiczny miecz', { kind: 'weapon', slot: 'weapon', weaponType: 'sword', atk: 32, def: 22, value: 1800, level: 25, icon: 'longsword', col: [0x80e0ff, 0x302040, 0x40a0ff] });
item('hand_axe', 'Toporek', { kind: 'weapon', slot: 'weapon', weaponType: 'axe', atk: 10, def: 5, value: 8, price: 40, icon: 'axe', col: [0xb0b0b8, 0x7a5432, 0x808088] });
item('battle_axe', 'Topór bojowy', { kind: 'weapon', slot: 'weapon', weaponType: 'axe', atk: 22, def: 10, value: 160, price: 700, level: 10, icon: 'bigaxe', col: [0xc0c0c8, 0x5a3c22, 0x8a8a92] });
item('orc_cleaver', 'Orkowy tasak', { kind: 'weapon', slot: 'weapon', weaponType: 'axe', atk: 27, def: 12, value: 420, level: 18, icon: 'bigaxe', col: [0x707060, 0x3a2a1a, 0xa04030] });
item('club', 'Pałka', { kind: 'weapon', slot: 'weapon', weaponType: 'club', atk: 7, def: 7, value: 3, price: 15, icon: 'club', col: [0x8a5a30, 0x5a3a1a, 0x6a4a2a] });
item('mace', 'Buzdygan', { kind: 'weapon', slot: 'weapon', weaponType: 'club', atk: 16, def: 11, value: 60, price: 250, icon: 'mace', col: [0x9898a0, 0x5a3a1a, 0x707078] });
item('morning_star', 'Morgensztern', { kind: 'weapon', slot: 'weapon', weaponType: 'club', atk: 25, def: 15, value: 300, level: 15, icon: 'mace', col: [0xb8b8c0, 0x3a2a1a, 0x606068] });
item('bone_club', 'Kościana maczuga', { kind: 'weapon', slot: 'weapon', weaponType: 'club', atk: 20, def: 10, value: 90, icon: 'club', col: [0xe8e0c8, 0xb0a888, 0xd0c8b0] });
// --- Distance -----------------------------------------------------------------
item('bow', 'Kusza', { kind: 'weapon', slot: 'weapon', weaponType: 'bow', range: 6, twoHanded: true, atk: 0, def: 0, value: 40, price: 200, icon: 'bow', col: [0x9a6a3a, 0xe0e0d0, 0x6a4a2a] });
item('elven_bow', 'Elficka kusza', { kind: 'weapon', slot: 'weapon', weaponType: 'bow', range: 7, twoHanded: true, atk: 4, def: 0, value: 700, level: 20, icon: 'bow', col: [0xd8c070, 0xf0f0e0, 0x60a040] });
item('arrow', 'Bełt', { kind: 'ammo', slot: 'ammo', ammo: 'arrow', atk: 25, stack: true, value: 1, price: 3, icon: 'arrow', col: [0x9a6a3a, 0xd0d0d8, 0xe04040] });
item('spear', 'Włócznia', { kind: 'weapon', slot: 'weapon', weaponType: 'throw', range: 5, atk: 25, def: 0, stack: true, value: 3, price: 10, icon: 'spear', col: [0x9a6a3a, 0xc0c0c8, 0x6a4a2a] });
// --- Wands & rods -----------------------------------------------------------------
item('wand_sparks', 'Różdżka iskier', { kind: 'weapon', slot: 'weapon', weaponType: 'wand', range: 5, wand: { min: 8, max: 18, mana: 2, element: 'energy' }, voc: ['sorcerer'], value: 100, price: 400, icon: 'wand', col: [0x6040a0, 0x40e0ff, 0xffffff] });
item('wand_embers', 'Różdżka żaru', { kind: 'weapon', slot: 'weapon', weaponType: 'wand', range: 5, wand: { min: 20, max: 34, mana: 5, element: 'fire' }, voc: ['sorcerer'], level: 15, value: 400, price: 1500, icon: 'wand', col: [0x803020, 0xff8020, 0xffe080] });
item('rod_moss', 'Kostur mchu', { kind: 'weapon', slot: 'weapon', weaponType: 'wand', range: 5, wand: { min: 8, max: 18, mana: 2, element: 'earth' }, voc: ['druid'], value: 100, price: 400, icon: 'rod', col: [0x6a4a2a, 0x60d040, 0xc0ff80] });
item('rod_frost', 'Kostur szronu', { kind: 'weapon', slot: 'weapon', weaponType: 'wand', range: 5, wand: { min: 20, max: 34, mana: 5, element: 'ice' }, voc: ['druid'], level: 15, value: 400, price: 1500, icon: 'rod', col: [0x405070, 0x80d0ff, 0xffffff] });
// --- Shields --------------------------------------------------------------------
item('wooden_shield', 'Drewniana tarcza', { kind: 'shield', slot: 'shield', def: 14, value: 5, price: 30, icon: 'shield_round', col: [0x9a6a3a, 0x6a4a2a, 0x808088] });
item('steel_shield', 'Stalowa tarcza', { kind: 'shield', slot: 'shield', def: 21, value: 80, price: 320, icon: 'shield', col: [0xa0a0aa, 0x707078, 0xd0d0d8] });
item('knight_shield', 'Tarcza rycerska', { kind: 'shield', slot: 'shield', def: 28, value: 500, level: 15, icon: 'shield', col: [0x2a4aa0, 0xd0d0d8, 0xe0c040] });
item('bone_shield', 'Kościana tarcza', { kind: 'shield', slot: 'shield', def: 24, value: 220, icon: 'shield_round', col: [0xe8e0c8, 0x9a9070, 0x504030] });
item('spellbook', 'Księga zaklęć', { kind: 'shield', slot: 'shield', def: 12, voc: ['sorcerer', 'druid'], value: 50, price: 150, icon: 'book', col: [0x7a2a2a, 0xe0c060, 0xf0e8d0] });
// --- Armor ----------------------------------------------------------------------
item('leather_armor', 'Skórzana zbroja', { kind: 'armor', slot: 'armor', arm: 4, value: 10, price: 40, icon: 'armor', col: [0x8a5a30, 0x6a4020, 0xa07040] });
item('chain_armor', 'Kolczuga', { kind: 'armor', slot: 'armor', arm: 8, value: 80, price: 300, icon: 'armor', col: [0x9898a0, 0x707078, 0xb0b0b8] });
item('plate_armor', 'Zbroja płytowa', { kind: 'armor', slot: 'armor', arm: 11, value: 380, price: 1500, level: 12, icon: 'armor', col: [0xc0c0c8, 0x808088, 0xe0e0e8] });
item('mage_robe', 'Szata maga', { kind: 'armor', slot: 'armor', arm: 5, voc: ['sorcerer', 'druid'], value: 200, price: 800, icon: 'robe', col: [0x3040a0, 0xe0c040, 0x202060] });
item('dragon_mail', 'Smocza łuska', { kind: 'armor', slot: 'armor', arm: 15, level: 30, value: 4000, icon: 'armor', col: [0x30a040, 0x206030, 0xd0c040] });
// --- Helmets ------------------------------------------------------------------------
item('leather_helmet', 'Skórzany hełm', { kind: 'head', slot: 'head', arm: 1, value: 4, price: 15, icon: 'helmet', col: [0x8a5a30, 0x6a4020, 0xa07040] });
item('iron_helmet', 'Żelazny hełm', { kind: 'head', slot: 'head', arm: 3, value: 40, price: 150, icon: 'helmet', col: [0x9898a0, 0x707078, 0xb0b0b8] });
item('steel_helmet', 'Stalowy hełm', { kind: 'head', slot: 'head', arm: 5, value: 180, price: 650, level: 10, icon: 'helmet', col: [0xc8c8d0, 0x808088, 0xe0e0e8] });
item('wizard_hat', 'Kapelusz czarodzieja', { kind: 'head', slot: 'head', arm: 1, voc: ['sorcerer', 'druid'], value: 60, price: 250, icon: 'hat', col: [0x3040a0, 0xe0c040, 0x202060] });
// --- Legs --------------------------------------------------------------------------
item('leather_legs', 'Skórzane spodnie', { kind: 'legs', slot: 'legs', arm: 1, value: 4, price: 15, icon: 'legs', col: [0x8a5a30, 0x6a4020, 0xa07040] });
item('chain_legs', 'Nogawice kolcze', { kind: 'legs', slot: 'legs', arm: 3, value: 40, price: 160, icon: 'legs', col: [0x9898a0, 0x707078, 0xb0b0b8] });
item('plate_legs', 'Nogawice płytowe', { kind: 'legs', slot: 'legs', arm: 6, value: 220, level: 12, icon: 'legs', col: [0xc0c0c8, 0x808088, 0xe0e0e8] });
// --- Boots -----------------------------------------------------------------------------
item('leather_boots', 'Skórzane buty', { kind: 'boots', slot: 'boots', arm: 1, value: 3, price: 12, icon: 'boots', col: [0x6a4020, 0x4a2a10, 0x8a5a30] });
item('swift_boots', 'Buty wędrowca', { kind: 'boots', slot: 'boots', arm: 1, speed: 40, value: 1500, icon: 'boots', col: [0x40a0d0, 0x206080, 0xf0e060] });
// --- Jewellery ---------------------------------------------------------------------
item('bone_amulet', 'Amulet z kości', { kind: 'amulet', slot: 'amulet', protect: { physical: 8 }, value: 150, icon: 'amulet', col: [0xe8e0c8, 0x8a6a3a, 0xc04040] });
item('ember_amulet', 'Amulet żaru', { kind: 'amulet', slot: 'amulet', protect: { fire: 30 }, value: 600, icon: 'amulet', col: [0xd0a030, 0x806020, 0xff6020] });
item('ring_vigor', 'Pierścień wigoru', { kind: 'ring', slot: 'ring', regen: 2, value: 800, icon: 'ring', col: [0xe0c040, 0x908020, 0x40e060] });
item('ring_light', 'Pierścień światła', { kind: 'ring', slot: 'ring', light: 5, value: 120, price: 300, icon: 'ring', col: [0xc0c0c8, 0x808088, 0xffffa0] });
// --- Food (seconds of "fed" regeneration, max 1200 s) -------------------------
item('apple', 'Jabłko', { kind: 'food', food: 90, stack: true, value: 1, price: 3, icon: 'apple', col: [0xd03030, 0x40a030, 0x6a4a2a] });
item('bread', 'Chleb', { kind: 'food', food: 180, stack: true, value: 2, price: 5, icon: 'bread', col: [0xc89040, 0xa07030, 0xe0b060] });
item('cheese', 'Ser', { kind: 'food', food: 140, stack: true, value: 2, price: 5, icon: 'cheese', col: [0xf0d040, 0xd0b030, 0xb09020] });
item('meat', 'Mięso', { kind: 'food', food: 240, stack: true, value: 2, price: 6, icon: 'meat', col: [0xc04848, 0xf0e0d0, 0x903030] });
item('ham', 'Szynka', { kind: 'food', food: 360, stack: true, value: 4, price: 10, icon: 'ham', col: [0xd06060, 0xf0e0d0, 0xa04040] });
item('fish', 'Ryba', { kind: 'food', food: 200, stack: true, value: 2, price: 5, icon: 'fish', col: [0x80a0c0, 0x506880, 0xf0f0f0] });
// --- Potions ---------------------------------------------------------------------
item('health_potion', 'Mikstura życia', { kind: 'potion', heal: [60, 90], stack: true, value: 10, price: 45, icon: 'potion', col: [0xe02828, 0xf0f0f8, 0xa01818] });
item('great_health_potion', 'Wielka mikstura życia', { kind: 'potion', heal: [150, 220], level: 25, stack: true, value: 40, price: 160, icon: 'potion_big', col: [0xc01080, 0xf0f0f8, 0x800860] });
item('mana_potion', 'Mikstura many', { kind: 'potion', mana: [70, 110], stack: true, value: 10, price: 50, icon: 'potion', col: [0x3050f0, 0xf0f0f8, 0x1830a0] });
item('antidote', 'Antidotum', { kind: 'potion', cure: 'poison', stack: true, value: 5, price: 25, icon: 'potion', col: [0x40d040, 0xf0f0f8, 0x208020] });
// --- Loot & crafting materials ---------------------------------------------------
item('rat_tail', 'Szczurzy ogon', { kind: 'loot', stack: true, value: 2, icon: 'tail', col: [0xd0a0a0, 0xa07070, 0x806060] });
item('wolf_pelt', 'Wilcza skóra', { kind: 'loot', stack: true, value: 10, icon: 'pelt', col: [0x808088, 0x606068, 0xa0a0a8] });
item('bear_paw', 'Niedźwiedzia łapa', { kind: 'loot', stack: true, value: 30, icon: 'paw', col: [0x6a4020, 0x4a2a10, 0xe0e0d0] });
item('snake_skin', 'Skóra węża', { kind: 'loot', stack: true, value: 15, icon: 'pelt', col: [0x60a040, 0x406020, 0xc0d060] });
item('spider_silk', 'Pajęczy jedwab', { kind: 'loot', stack: true, value: 25, icon: 'silk', col: [0xf0f0f0, 0xc0c0d0, 0xa0a0b0] });
item('orc_tooth', 'Kieł orka', { kind: 'loot', stack: true, value: 12, icon: 'tooth', col: [0xf0e8c8, 0xc0b890, 0x908860] });
item('troll_hair', 'Włosy trolla', { kind: 'loot', stack: true, value: 20, icon: 'silk', col: [0x6a7a3a, 0x4a5a2a, 0x8a9a4a] });
item('bone', 'Kość', { kind: 'loot', stack: true, value: 1, icon: 'bone', col: [0xf0e8d0, 0xc8c0a8, 0xa09880] });
item('skull', 'Czaszka', { kind: 'loot', stack: true, value: 8, icon: 'skull', col: [0xf0e8d0, 0x302820, 0xc8c0a8] });
item('slime_gel', 'Galaretowaty śluz', { kind: 'loot', stack: true, value: 18, icon: 'gel', col: [0x60e060, 0x30a030, 0xc0ffc0] });
item('dragon_scale', 'Smocza łuska (surowiec)', { kind: 'loot', stack: true, value: 120, icon: 'scale', col: [0x30a040, 0x206030, 0xd0c040] });
item('lich_crown', 'Korona Kościeja', { kind: 'loot', value: 2500, icon: 'crown', col: [0x9050d0, 0xe0c040, 0x40ff80] });
item('ruby', 'Rubin', { kind: 'loot', stack: true, value: 250, icon: 'gem', col: [0xe02040, 0xff8090, 0x801020] });
item('sapphire', 'Szafir', { kind: 'loot', stack: true, value: 250, icon: 'gem', col: [0x2050e0, 0x80a0ff, 0x102080] });
item('torch', 'Pochodnia', { kind: 'tool', slot: 'shield', light: 4, def: 0, value: 1, price: 5, icon: 'torch', col: [0x6a4a2a, 0xff9020, 0xffe060] });
// Gold is stored as a number on the player ("sakiewka"), this is only used for
// loot lists and corpses.
item('gold', 'Złote monety', { kind: 'gold', stack: true, value: 1, icon: 'gold', col: [0xf0c030, 0xc09020, 0xfff080] });

export const GOLD_ID = ITEM_BY_KEY.gold.id;

export function itemDef(id) { return ITEMS[id] || null; }

export function itemName(id, count = 1) {
  const d = ITEMS[id];
  if (!d) return '???';
  return d.stack && count > 1 ? `${count}x ${d.name}` : d.name;
}

// Short description used by "Zobacz" (look).
export function describeItem(id, count = 1) {
  const d = ITEMS[id];
  if (!d) return 'Nic ciekawego.';
  const parts = [];
  if (d.atk) parts.push(`atak ${d.atk}`);
  if (d.def) parts.push(`obrona ${d.def}`);
  if (d.arm) parts.push(`pancerz ${d.arm}`);
  if (d.range) parts.push(`zasięg ${d.range}`);
  if (d.wand) parts.push(`obrażenia ${d.wand.min}-${d.wand.max}, mana ${d.wand.mana}/strzał`);
  if (d.speed) parts.push(`szybkość +${d.speed}`);
  if (d.heal) parts.push(`leczy ${d.heal[0]}-${d.heal[1]} PŻ`);
  if (d.mana) parts.push(`odnawia ${d.mana[0]}-${d.mana[1]} many`);
  if (d.food) parts.push('jedzenie');
  if (d.protect) for (const [k, v] of Object.entries(d.protect)) parts.push(`ochrona ${elementName(k)} ${v}%`);
  if (d.regen) parts.push('przyspiesza regenerację');
  if (d.light) parts.push('świeci');
  if (d.level) parts.push(`wymaga poziomu ${d.level}`);
  if (d.voc) parts.push(`dla: ${d.voc.map(vocName).join(', ')}`);
  const head = d.stack && count > 1 ? `${count}x ${d.name}` : d.name;
  return parts.length ? `${head} (${parts.join(', ')}).` : `${head}.`;
}

export function elementName(e) {
  return { physical: 'fizyczna', fire: 'ogień', energy: 'energia', earth: 'ziemia', ice: 'lód', poison: 'trucizna', death: 'śmierć', holy: 'święta' }[e] || e;
}

function vocName(v) {
  return { knight: 'rycerz', paladin: 'paladyn', sorcerer: 'czarnoksiężnik', druid: 'druid' }[v] || v;
}
