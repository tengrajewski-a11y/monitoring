// Game formulas. These reproduce the behaviour of the classic 7.72 engine as
// documented by its decompiled sources (TSkillLevel, TSkillProbe, TCombat,
// ComputeDamage, TCreature::GetSpeed ...). The code here is an independent
// JavaScript implementation of those rules.

import { VOCATIONS, SKILL_DELTA, SKILL_MIN } from './constants.js';

// Experience needed for a level: (((L - 6) * L + 17) * L - 12) / 6 * 100
export function expForLevel(level) {
  if (level <= 1) return 0;
  return Math.trunc((((level - 6) * level + 17) * level - 12) / 6) * 100;
}

export function levelForExp(exp) {
  let level = 1;
  while (expForLevel(level + 1) <= exp) level++;
  return level;
}

// Tries required to reach a skill level. Geometric series with base = factor:
// delta * (factor^(level - min) - 1) / (factor - 1)
export function triesForSkill(skill, level, factor) {
  const min = SKILL_MIN[skill];
  const delta = SKILL_DELTA[skill];
  if (level <= min) return 0;
  if (factor <= 1.0) return (level - min) * delta;
  return Math.floor(delta * ((Math.pow(factor, level - min) - 1) / (factor - 1)));
}

export function skillLevelForTries(skill, tries, factor) {
  let level = SKILL_MIN[skill];
  while (triesForSkill(skill, level + 1, factor) <= tries) level++;
  return level;
}

// Percent progress towards the next skill level.
export function skillPercent(skill, tries, factor) {
  const lvl = skillLevelForTries(skill, tries, factor);
  const a = triesForSkill(skill, lvl, factor);
  const b = triesForSkill(skill, lvl + 1, factor);
  return b > a ? Math.floor(((tries - a) / (b - a)) * 100) : 0;
}

export function maxHp(voc, level) {
  return 150 + VOCATIONS[voc].hpPerLevel * (level - 1);
}

export function maxMana(voc, level) {
  return 35 + VOCATIONS[voc].manaPerLevel * (level - 1);
}

// GetSpeed(): GoStrength * 2 + 80, players gain one GoStrength per level.
export function playerSpeed(level) {
  return (69 + level) * 2 + 80;
}

// Step duration in ms, quantised to the server beat (TCreature::NotifyGo).
export function stepDuration(groundCost, speed, diagonal, beat = 50) {
  let wp = groundCost;
  if (diagonal) wp *= 3;
  const delay = Math.floor((wp * 1000) / Math.max(1, speed));
  return Math.ceil(delay / beat) * beat;
}

// TSkillProbe::ProbeValue: average of two d100 rolls scaled by skill.
export function probeValue(max, skillLevel, rnd = Math.random) {
  const randomFactor = Math.floor((Math.floor(rnd() * 100) + Math.floor(rnd() * 100)) / 2);
  const maxValue = max * (skillLevel * 5 + 50);
  return Math.floor((randomFactor * maxValue) / 10000);
}

// Attack mode modifiers from TCombat::GetAttackDamage / GetDefendDamage.
export function attackModeFactor(mode, value) {
  if (mode === 1) return value + Math.floor((value * 2) / 10);
  if (mode === 3) return value - Math.floor((value * 4) / 10);
  return value;
}
export function defenseModeFactor(mode, value) {
  if (mode === 1) return value - Math.floor((value * 4) / 10);
  if (mode === 3) return value + Math.floor((value * 8) / 10);
  return value;
}

// TCombat::GetArmorStrength: armor/2 + random(armor/2)
export function armorReduction(armor, rnd = Math.random) {
  if (armor < 2) return armor;
  const half = Math.floor(armor / 2);
  return half + Math.floor(rnd() * half);
}

// TSkillProbe::Probe used for distance hit chance.
export function distanceHit(skill, distance, hitChance, rnd = Math.random) {
  const difficulty = (distance >= 2 ? distance : 5) * 15;
  if (skill < Math.floor(rnd() * difficulty)) return false;
  return Math.floor(rnd() * 100) <= hitChance;
}

// ComputeDamage for spells: (base +- variation) * (level*2 + mlvl*3) / 100.
// flags.capped: multiplier <= 100, flags.floor: multiplier >= 100.
export function spellDamage(base, variation, level, mlvl, flags = {}, rnd = Math.random) {
  let dmg = base;
  if (variation) dmg += Math.floor(rnd() * (variation * 2 + 1)) - variation;
  let mult = level * 2 + mlvl * 3;
  if (flags.capped && mult > 100) mult = 100;
  if (flags.floor && mult < 100) mult = 100;
  return Math.max(0, Math.floor((dmg * mult) / 100));
}

// Experience share for player kills (TCombat::DistributeExperiencePoints).
export function pvpExp(amount, victimLevel, attackerLevel) {
  const maxLevel = Math.floor((victimLevel * 11) / 10);
  if (attackerLevel >= maxLevel) return 0;
  return Math.floor(((maxLevel - attackerLevel) * amount) / victimLevel);
}

// Experience a player is worth when killed (used for PvP and death loss).
export function deathExpLoss(exp, percent) {
  return Math.floor((exp * percent) / 100);
}

export function chebyshev(ax, ay, bx, by) {
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}
