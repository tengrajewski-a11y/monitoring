// Monster races of Fibula. Numbers are original but follow the 7.x scale:
// "attack" and "defense" are the item-like values used by the engine's
// ProbeValue formula, "skill" is the creature's fighting skill.
//
// spells: [{type: missile|wave|area|heal|haste|summon|drain|beam, ...}]
// loot:   [[itemKey, chance 0..1, min, max]]

export const MONSTERS = {
  rat: {
    name: 'Szczur', hp: 20, exp: 5, speed: 134, attack: 8, skill: 15, defense: 5, armor: 1,
    blood: 'red', sounds: ['Piiisk!', 'Piii!'],
    loot: [['gold', 0.7, 1, 4], ['cheese', 0.25, 1, 1], ['rat_tail', 0.25, 1, 1]],
  },
  rabbit: {
    name: 'Królik', hp: 15, exp: 1, speed: 200, attack: 0, skill: 5, defense: 2, armor: 0,
    passive: true, blood: 'red',
    loot: [['meat', 0.5, 1, 2]],
  },
  deer: {
    name: 'Jeleń', hp: 25, exp: 2, speed: 196, attack: 0, skill: 5, defense: 3, armor: 1,
    passive: true, blood: 'red',
    loot: [['meat', 0.7, 1, 3], ['ham', 0.2, 1, 1]],
  },
  wolf: {
    name: 'Wilk', hp: 25, exp: 18, speed: 196, attack: 14, skill: 20, defense: 8, armor: 2,
    blood: 'red', sounds: ['Auuuuu!', 'Grrrr!'], runHp: 6,
    loot: [['meat', 0.4, 1, 2], ['wolf_pelt', 0.3, 1, 1]],
  },
  bear: {
    name: 'Niedźwiedź', hp: 80, exp: 25, speed: 156, attack: 25, skill: 30, defense: 10, armor: 6,
    blood: 'red', sounds: ['Grrroaaar!'],
    loot: [['meat', 0.6, 2, 4], ['ham', 0.3, 1, 2], ['bear_paw', 0.15, 1, 1]],
  },
  snake: {
    name: 'Żmija', hp: 22, exp: 10, speed: 120, attack: 8, skill: 15, defense: 3, armor: 1,
    poison: 4, blood: 'red', sounds: ['Ssssss!'], immune: ['poison', 'earth'],
    loot: [['snake_skin', 0.25, 1, 1]],
  },
  poison_spider: {
    name: 'Jadowity pająk', hp: 26, exp: 22, speed: 160, attack: 12, skill: 20, defense: 5, armor: 2,
    poison: 10, blood: 'green', immune: ['poison', 'earth'],
    loot: [['gold', 0.5, 1, 5], ['spider_silk', 0.1, 1, 1]],
  },
  giant_spider: {
    name: 'Królowa pająków', hp: 600, exp: 450, speed: 210, attack: 55, skill: 60, defense: 30, armor: 20,
    poison: 30, blood: 'green', immune: ['poison', 'earth'], elements: { fire: 1.2 },
    spells: [{ type: 'missile', element: 'poison', min: 40, max: 70, range: 5, chance: 0.2, cd: 3000, missile: 'poison', effect: 'poison' }],
    loot: [['gold', 1, 10, 60], ['spider_silk', 0.5, 1, 3], ['knight_shield', 0.03, 1, 1], ['plate_legs', 0.04, 1, 1], ['health_potion', 0.25, 1, 2]],
  },
  slime: {
    name: 'Galareta', hp: 150, exp: 160, speed: 100, attack: 20, skill: 25, defense: 5, armor: 6,
    poison: 12, blood: 'slime', immune: ['poison', 'earth'], elements: { fire: 1.1, ice: 0.8 },
    loot: [['gold', 0.6, 1, 15], ['slime_gel', 0.4, 1, 2]],
  },
  swamp_troll: {
    name: 'Troll bagienny', hp: 55, exp: 25, speed: 140, attack: 15, skill: 25, defense: 6, armor: 3,
    poison: 6, blood: 'red', sounds: ['Grrr, chlup!'], runHp: 10,
    loot: [['gold', 0.6, 1, 8], ['fish', 0.3, 1, 1], ['troll_hair', 0.2, 1, 1], ['rod_moss', 0.01, 1, 1]],
  },
  orc: {
    name: 'Ork', hp: 70, exp: 25, speed: 150, attack: 20, skill: 25, defense: 10, armor: 4,
    blood: 'red', sounds: ['Grak brrretz!', 'Ork ork!'],
    loot: [['gold', 0.7, 1, 15], ['meat', 0.2, 1, 1], ['orc_tooth', 0.15, 1, 1], ['hand_axe', 0.08, 1, 1], ['leather_armor', 0.05, 1, 1]],
  },
  orc_warrior: {
    name: 'Ork wojownik', hp: 125, exp: 50, speed: 160, attack: 32, skill: 40, defense: 16, armor: 8,
    blood: 'red', sounds: ['Krew dla Krwawego Kła!', 'Zginiesz, człeczyno!'],
    loot: [['gold', 0.8, 1, 25], ['orc_tooth', 0.2, 1, 1], ['chain_armor', 0.04, 1, 1], ['iron_helmet', 0.05, 1, 1], ['battle_axe', 0.02, 1, 1], ['orc_cleaver', 0.005, 1, 1]],
  },
  orc_spearman: {
    name: 'Ork oszczepnik', hp: 85, exp: 30, speed: 150, attack: 14, skill: 25, defense: 8, armor: 4,
    blood: 'red', sounds: ['Celuj w oko!'], keepDistance: 3,
    ranged: { attack: 25, skill: 30, range: 5, missile: 'spear', hit: 75 },
    loot: [['gold', 0.6, 1, 12], ['spear', 0.3, 1, 2], ['orc_tooth', 0.1, 1, 1]],
  },
  orc_shaman: {
    name: 'Ork szaman', hp: 110, exp: 90, speed: 140, attack: 10, skill: 15, defense: 10, armor: 4,
    blood: 'red', sounds: ['Duchy, spalcie go!'], keepDistance: 3, elements: { energy: 0.7 },
    spells: [
      { type: 'missile', element: 'energy', min: 15, max: 40, range: 5, chance: 0.3, cd: 2000, missile: 'energy', effect: 'energy' },
      { type: 'heal', min: 30, max: 50, chance: 0.2, cd: 4000 },
    ],
    loot: [['gold', 0.8, 1, 20], ['mana_potion', 0.05, 1, 1], ['spellbook', 0.02, 1, 1], ['wand_sparks', 0.01, 1, 1]],
  },
  bandit: {
    name: 'Rozbójnik', hp: 90, exp: 40, speed: 170, attack: 22, skill: 30, defense: 12, armor: 6,
    blood: 'red', sounds: ['Sakiewka albo życie!', 'Hej, ty! Stój!'], runHp: 15,
    human: { skin: 1, head: 6, body: 3, legs: 5, feet: 7, eq: { weapon: 'short_sword', head: 'leather_helmet' } },
    loot: [['gold', 1, 5, 30], ['knife', 0.2, 1, 1], ['short_sword', 0.1, 1, 1], ['leather_boots', 0.1, 1, 1], ['leather_helmet', 0.08, 1, 1], ['bread', 0.3, 1, 2]],
  },
  skeleton: {
    name: 'Szkielet', hp: 50, exp: 35, speed: 154, attack: 15, skill: 30, defense: 10, armor: 4,
    blood: 'bone', immune: ['poison', 'death'], elements: { holy: 1.25, fire: 1.1 },
    loot: [['gold', 0.6, 1, 10], ['bone', 0.4, 1, 2], ['skull', 0.08, 1, 1], ['mace', 0.03, 1, 1], ['bone_club', 0.02, 1, 1]],
  },
  ghoul: {
    name: 'Ghul', hp: 100, exp: 85, speed: 140, attack: 25, skill: 30, defense: 12, armor: 8,
    blood: 'red', immune: ['poison', 'death'], elements: { holy: 1.25, fire: 1.1 }, sounds: ['Mięęęso...'],
    spells: [{ type: 'drain', element: 'lifedrain', min: 15, max: 30, range: 1, chance: 0.25, cd: 3000, effect: 'death' }],
    loot: [['gold', 0.7, 1, 25], ['bone', 0.3, 1, 2], ['skull', 0.2, 1, 1], ['health_potion', 0.05, 1, 1], ['bone_amulet', 0.01, 1, 1]],
  },
  troll: {
    name: 'Troll', hp: 50, exp: 20, speed: 150, attack: 18, skill: 25, defense: 8, armor: 4,
    blood: 'red', sounds: ['Troll głodny!', 'Moje! Moje!'], runHp: 8,
    loot: [['gold', 0.7, 1, 12], ['meat', 0.2, 1, 1], ['troll_hair', 0.15, 1, 1], ['club', 0.1, 1, 1], ['hand_axe', 0.05, 1, 1], ['leather_legs', 0.05, 1, 1]],
  },
  troll_champion: {
    name: 'Trollowy czempion', hp: 160, exp: 90, speed: 160, attack: 40, skill: 45, defense: 18, armor: 10,
    blood: 'red', sounds: ['Ja najsilniejszy!'],
    loot: [['gold', 1, 10, 40], ['troll_hair', 0.5, 1, 2], ['mace', 0.1, 1, 1], ['steel_shield', 0.05, 1, 1], ['health_potion', 0.1, 1, 1]],
  },
  bat: {
    name: 'Nietoperz', hp: 30, exp: 10, speed: 210, attack: 10, skill: 20, defense: 5, armor: 1,
    blood: 'red', sounds: ['Piiip!'], loseTarget: 10,
    loot: [],
  },
  dragon_hatchling: {
    name: 'Smocze pisklę', hp: 300, exp: 185, speed: 170, attack: 45, skill: 45, defense: 15, armor: 15,
    blood: 'red', immune: ['fire'], elements: { ice: 1.15 }, sounds: ['Rooaar!'],
    spells: [
      { type: 'wave', element: 'fire', min: 30, max: 60, len: 3, spread: 1, chance: 0.15, cd: 4000, effect: 'fire' },
      { type: 'missile', element: 'fire', min: 20, max: 50, range: 5, chance: 0.15, cd: 3000, missile: 'fire', effect: 'fire' },
    ],
    loot: [['gold', 1, 10, 60], ['dragon_scale', 0.1, 1, 1], ['ham', 0.3, 1, 2], ['health_potion', 0.1, 1, 1]],
  },
  dragon: {
    name: 'Smok', hp: 1000, exp: 700, speed: 180, attack: 60, skill: 60, defense: 25, armor: 30,
    blood: 'red', immune: ['fire'], elements: { ice: 1.15, earth: 0.8 }, sounds: ['GROOOAAAR!', 'ZIEEEJ!'],
    spells: [
      { type: 'wave', element: 'fire', min: 80, max: 170, len: 5, spread: 2, chance: 0.15, cd: 4000, effect: 'fire' },
      { type: 'area', element: 'fire', min: 50, max: 110, radius: 2, range: 6, chance: 0.2, cd: 3000, missile: 'fire', effect: 'explosion' },
    ],
    loot: [['gold', 1, 30, 120], ['gold', 0.6, 10, 60], ['dragon_scale', 0.4, 1, 2], ['steel_shield', 0.1, 1, 1], ['long_sword', 0.05, 1, 1],
      ['ruby', 0.05, 1, 1], ['great_health_potion', 0.1, 1, 1], ['ember_amulet', 0.02, 1, 1]],
  },
  lich: {
    name: 'Kościej', hp: 2000, exp: 1800, speed: 190, attack: 50, skill: 60, defense: 30, armor: 25,
    blood: 'bone', immune: ['death', 'poison'], elements: { fire: 1.2, holy: 1.3 }, boss: true,
    sounds: ['Kościeja nie da się zabić!', 'Twoja dusza będzie moja!'], keepDistance: 2,
    spells: [
      { type: 'missile', element: 'death', min: 80, max: 160, range: 6, chance: 0.3, cd: 2000, missile: 'death', effect: 'death' },
      { type: 'wave', element: 'lifedrain', min: 60, max: 120, len: 5, spread: 1, chance: 0.15, cd: 5000, effect: 'death' },
      { type: 'summon', monster: 'skeleton', max: 3, chance: 0.1, cd: 8000 },
      { type: 'heal', min: 100, max: 200, chance: 0.1, cd: 6000 },
    ],
    loot: [['gold', 1, 100, 300], ['lich_crown', 1, 1, 1], ['sapphire', 0.3, 1, 2], ['great_health_potion', 0.5, 1, 3],
      ['runed_sword', 0.1, 1, 1], ['ring_vigor', 0.2, 1, 1], ['wand_embers', 0.15, 1, 1], ['rod_frost', 0.15, 1, 1]],
  },
};

for (const [key, m] of Object.entries(MONSTERS)) {
  m.key = key;
  m.immune = m.immune || [];
  m.elements = m.elements || {};
  m.spells = m.spells || [];
  m.loseTarget = m.loseTarget ?? 2;
}
