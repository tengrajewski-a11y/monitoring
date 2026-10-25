import test from 'node:test';
import assert from 'node:assert/strict';
import {
  expForLevel, levelForExp, triesForSkill, skillLevelForTries, stepDuration, spellDamage, probeValue, pvpExp, playerSpeed,
} from '../shared/formulas.js';

test('experience curve matches the classic table', () => {
  assert.equal(expForLevel(1), 0);
  assert.equal(expForLevel(2), 100);
  assert.equal(expForLevel(3), 200);
  assert.equal(expForLevel(8), 4200);
  assert.equal(expForLevel(10), 9300);
  assert.equal(expForLevel(20), 98800);
  assert.equal(levelForExp(0), 1);
  assert.equal(levelForExp(99), 1);
  assert.equal(levelForExp(100), 2);
  assert.equal(levelForExp(9300), 10);
});

test('skill tries grow geometrically with the vocation factor', () => {
  assert.equal(triesForSkill('sword', 10, 1.1), 0);
  assert.equal(triesForSkill('sword', 11, 1.1), 50);
  assert.equal(triesForSkill('sword', 12, 1.1), 105);
  assert.ok(triesForSkill('sword', 20, 2.0) > triesForSkill('sword', 20, 1.1));
  assert.equal(skillLevelForTries('sword', 104, 1.1), 11);
  assert.equal(skillLevelForTries('sword', 105, 1.1), 12);
  assert.equal(skillLevelForTries('magic', 1600, 1.1), 1);
});

test('speed and step duration', () => {
  assert.equal(playerSpeed(1), 220);
  assert.equal(stepDuration(100, 220, false), 500);
  assert.equal(stepDuration(100, 220, true), 1400);
  assert.ok(stepDuration(200, 220, false) > stepDuration(100, 220, false));
});

test('probe value stays within bounds', () => {
  for (let i = 0; i < 200; i++) {
    const v = probeValue(20, 25);
    assert.ok(v >= 0 && v <= 35, `value ${v}`);
  }
  assert.equal(probeValue(20, 25, () => 0), 0);
});

test('spell damage scales with level and magic level', () => {
  const r = () => 0.5;
  assert.equal(spellDamage(100, 0, 1, 0, {}, r), 2);
  assert.equal(spellDamage(100, 0, 1, 0, { floor: true }, r), 100);
  assert.equal(spellDamage(100, 0, 20, 10, {}, r), 70);
});

test('pvp experience falls off for higher level attackers', () => {
  assert.equal(pvpExp(1000, 50, 60), 0);
  assert.ok(pvpExp(1000, 50, 20) > pvpExp(1000, 50, 40));
});
