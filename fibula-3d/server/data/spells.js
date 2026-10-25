// Spells are cast by saying their words in the local chat. Damage/heal values
// use the engine's ComputeDamage: (base +- var) * (level*2 + mlvl*3) / 100.
// skill: 'melee' | 'dist' uses that skill instead of magic level.

const ALL = ['knight', 'paladin', 'sorcerer', 'druid'];
const MAGES = ['sorcerer', 'druid'];

export const SPELLS = [
  { words: 'sana', name: 'Leczenie', level: 2, mana: 20, voc: ALL, type: 'heal', base: 20, var: 10, floor: true },
  { words: 'sana magna', name: 'Silne leczenie', level: 8, mana: 40, voc: ['paladin', ...MAGES], type: 'heal', base: 40, var: 20, floor: true },
  { words: 'sana vita', name: 'Pełne leczenie', level: 20, mana: 160, voc: MAGES, type: 'heal', base: 250, var: 50, floor: true },
  { words: 'lux', name: 'Światło', level: 1, mana: 20, voc: ALL, type: 'light', radius: 6, duration: 300 },
  { words: 'lux magna', name: 'Wielkie światło', level: 13, mana: 60, voc: ALL, type: 'light', radius: 9, duration: 600 },
  { words: 'celer', name: 'Przyspieszenie', level: 14, mana: 60, voc: ALL, type: 'haste', amount: 70, duration: 30 },
  { words: 'purga', name: 'Oczyszczenie', level: 10, mana: 30, voc: ALL, type: 'cure' },
  { words: 'cibus', name: 'Stwórz jedzenie', level: 14, mana: 120, voc: ['paladin', 'druid'], type: 'food' },
  { words: 'scutum', name: 'Magiczna tarcza', level: 14, mana: 50, voc: MAGES, type: 'manashield', duration: 180 },
  // sorcerer
  { words: 'ignis', name: 'Ognisty pocisk', level: 8, mana: 25, voc: ['sorcerer'], type: 'missile', element: 'fire', base: 45, var: 15, range: 6, missile: 'fire', effect: 'fire', aggressive: true },
  { words: 'fulmen', name: 'Promień energii', level: 15, mana: 40, voc: ['sorcerer'], type: 'beam', element: 'energy', base: 60, var: 20, len: 5, effect: 'energy', aggressive: true },
  { words: 'ignis unda', name: 'Fala ognia', level: 18, mana: 25, voc: MAGES, type: 'wave', element: 'fire', base: 30, var: 10, len: 4, spread: 1, effect: 'fire', aggressive: true },
  { words: 'ignis orbis', name: 'Ognista eksplozja', level: 30, mana: 250, voc: ['sorcerer'], type: 'area', element: 'fire', base: 150, var: 50, radius: 3, effect: 'explosion', aggressive: true },
  // druid
  { words: 'terra', name: 'Pocisk ziemi', level: 8, mana: 25, voc: ['druid'], type: 'missile', element: 'earth', base: 40, var: 15, range: 6, missile: 'earth', effect: 'earth', aggressive: true },
  { words: 'glacies', name: 'Lodowy pocisk', level: 15, mana: 40, voc: ['druid'], type: 'missile', element: 'ice', base: 70, var: 20, range: 6, missile: 'ice', effect: 'ice', aggressive: true },
  { words: 'gelu orbis', name: 'Lodowa burza', level: 30, mana: 250, voc: ['druid'], type: 'area', element: 'ice', base: 140, var: 50, radius: 3, effect: 'ice', aggressive: true },
  // knight
  { words: 'gladius', name: 'Cios mocy', level: 8, mana: 20, voc: ['knight'], type: 'strike', element: 'physical', base: 35, var: 10, skill: 'melee', aggressive: true },
  { words: 'gladius orbis', name: 'Wir ostrzy', level: 15, mana: 50, voc: ['knight'], type: 'area', element: 'physical', base: 40, var: 15, radius: 1, skill: 'melee', effect: 'slash', aggressive: true },
  // paladin
  { words: 'sagitta', name: 'Święta strzała', level: 10, mana: 30, voc: ['paladin'], type: 'missile', element: 'holy', base: 40, var: 10, range: 6, skill: 'dist', missile: 'holy', effect: 'holy', aggressive: true },
  { words: 'sagitta orbis', name: 'Deszcz strzał', level: 25, mana: 100, voc: ['paladin'], type: 'targetArea', element: 'physical', base: 55, var: 20, radius: 1, range: 6, skill: 'dist', missile: 'arrow', effect: 'blood', aggressive: true },
];

export const SPELL_BY_WORDS = new Map(SPELLS.map((s) => [s.words, s]));

export function spellsFor(voc) {
  return SPELLS.filter((s) => s.voc.includes(voc)).map((s) => ({
    words: s.words, name: s.name, level: s.level, mana: s.mana, aggressive: !!s.aggressive, type: s.type,
  }));
}
