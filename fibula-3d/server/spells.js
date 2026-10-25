// Spell casting for players and monsters.

import { DIR, DIR_DX, DIR_DY } from '../shared/constants.js';
import { spellDamage, chebyshev } from '../shared/formulas.js';
import { ITEM_BY_KEY } from '../shared/items.js';
import { SPELL_BY_WORDS } from './data/spells.js';
import { applyDamage, rand } from './combat.js';

export function normalizeWords(text) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
}

export function findSpell(text) { return SPELL_BY_WORDS.get(normalizeWords(text)) || null; }

// Returns true if the text was a spell (whether or not the cast succeeded).
export function tryCastSpell(w, p, text) {
  const spell = findSpell(text);
  if (!spell) return false;
  const now = w.now;
  w.say(p, spell.words, 'spell');
  const fail = (msg) => { p.message(msg, 'warn'); w.effect(p.x, p.y, p.z, 'poff'); return true; };
  if (!spell.voc.includes(p.voc)) return fail('Twoja profesja nie zna tego zaklęcia.');
  if (p.level < spell.level) return fail(`Potrzebujesz poziomu ${spell.level}, by rzucić to zaklęcie.`);
  if (p.mana < spell.mana) return fail('Masz za mało many.');
  if (now < p.exhaustUntil) return fail('Jesteś wyczerpany.');
  if (spell.aggressive && w.map.isPZ(p.x, p.y, p.z)) return fail('W strefie ochronnej nie możesz używać zaklęć ofensywnych.');
  const err = castPlayerSpell(w, p, spell, now);
  if (err) return fail(err);
  p.spendMana(spell.mana);
  p.exhaustUntil = now + w.config.spellExhaust;
  return true;
}

function powerFor(p, spell) {
  let lvl = p.mlvl;
  if (spell.skill === 'melee') lvl = p.bestMeleeSkill();
  else if (spell.skill === 'dist') lvl = p.skillLevel('dist');
  return spellDamage(spell.base, spell.var || 0, p.level, lvl, { floor: spell.floor });
}

function castPlayerSpell(w, p, s, now) {
  switch (s.type) {
    case 'heal': {
      p.heal(powerFor(p, s));
      w.effect(p.x, p.y, p.z, 'heal');
      return null;
    }
    case 'light':
      p.addCondition('light', { radius: s.radius, until: now + s.duration * 1000 });
      w.broadcastCreature(p, { t: 'cu', id: p.id, light: p.lightRadius() });
      w.effect(p.x, p.y, p.z, 'sparkle');
      return null;
    case 'haste':
      p.addCondition('haste', { amount: s.amount, until: now + s.duration * 1000 });
      w.broadcastCreature(p, { t: 'cu', id: p.id, sp: p.speed });
      w.effect(p.x, p.y, p.z, 'haste');
      return null;
    case 'cure':
      p.removeCondition('poison');
      w.effect(p.x, p.y, p.z, 'heal');
      return null;
    case 'manashield':
      p.addCondition('manashield', { until: now + s.duration * 1000 });
      w.effect(p.x, p.y, p.z, 'shield');
      p.message('Otacza cię magiczna tarcza.', 'info');
      return null;
    case 'food': {
      const pick = ['bread', 'meat', 'ham', 'apple', 'cheese'][rand(0, 4)];
      if (!p.addItem(ITEM_BY_KEY[pick].id, 1)) return 'Nie masz miejsca w plecaku.';
      w.effect(p.x, p.y, p.z, 'sparkle');
      return null;
    }
    case 'missile':
    case 'strike':
    case 'targetArea': {
      const t = p.target;
      if (!t || t.dead || t.z !== p.z) return 'Najpierw wybierz cel.';
      const range = s.type === 'strike' ? 1 : s.range;
      if (chebyshev(p.x, p.y, t.x, t.y) > range) return 'Cel jest za daleko.';
      if (!w.map.lineOfSight(p.x, p.y, t.x, t.y, p.z)) return 'Nie widzisz celu.';
      if (t.kind === 'player') { const ok = w.canPvp(p, t); if (!ok.ok) return ok.reason; }
      const dmg = powerFor(p, s);
      if (s.missile) w.missile(p, t, s.missile);
      if (s.type === 'targetArea') {
        for (const [x, y] of circle(t.x, t.y, s.radius)) {
          if (w.map.lineOfSight(t.x, t.y, x, y, p.z)) damageTile(w, p, x, y, p.z, dmg, s.element, s.effect);
        }
      } else {
        if (s.type === 'strike') w.broadcastCreature(p, { t: 'atk', id: p.id, tid: t.id, w: 'strike' });
        w.effect(t.x, t.y, t.z, s.effect || 'slash');
        applyDamage(w, t, p, dmg, s.element, { noEffect: true });
      }
      return null;
    }
    case 'beam':
    case 'wave':
    case 'area': {
      const dmg = powerFor(p, s);
      const tiles = s.type === 'area' ? circle(p.x, p.y, s.radius).filter(([x, y]) => x !== p.x || y !== p.y)
        : s.type === 'beam' ? beam(w, p.x, p.y, p.z, p.dir, s.len) : wave(p.x, p.y, p.dir, s.len, s.spread);
      for (const [x, y] of tiles) {
        if (!w.map.lineOfSight(p.x, p.y, x, y, p.z)) continue;
        damageTile(w, p, x, y, p.z, dmg, s.element, s.effect);
      }
      if (s.skill === 'melee') w.broadcastCreature(p, { t: 'atk', id: p.id, tid: 0, w: 'spin' });
      return null;
    }
    default:
      return 'To zaklęcie jeszcze nie działa.';
  }
}

// Damages every valid victim standing on a tile and shows the spell effect.
export function damageTile(w, caster, x, y, z, dmg, element, effect) {
  if (!w.map.inBounds(x, y, z)) return;
  if (w.map.isPZ(x, y, z)) return;
  if (effect) w.effect(x, y, z, effect);
  for (const c of w.creaturesAt(x, y, z)) {
    if (c === caster || c.kind === 'npc' || c.dead) continue;
    if (caster.kind === 'monster') {
      if (c.kind === 'monster' && !c.masterId) continue;
    } else if (caster.kind === 'player' && c.kind === 'player') {
      if (!w.canPvp(caster, c).ok) continue;
    }
    applyDamage(w, c, caster, dmg, element, { noEffect: true });
  }
}

export function circle(cx, cy, r) {
  const out = [];
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r + r) out.push([x, y]);
  }
  return out;
}

function forward(dir) {
  const d = dir > 3 ? DIR.S : dir;
  return [DIR_DX[d], DIR_DY[d]];
}

export function beam(w, x0, y0, z, dir, len) {
  const [dx, dy] = forward(dir);
  const out = [];
  for (let i = 1; i <= len; i++) {
    const x = x0 + dx * i, y = y0 + dy * i;
    if (w.map.blocksSight(x, y, z)) break;
    out.push([x, y]);
  }
  return out;
}

export function wave(x0, y0, dir, len, spread) {
  const [dx, dy] = forward(dir);
  const lx = -dy, ly = dx;
  const out = [];
  for (let i = 1; i <= len; i++) {
    const half = Math.min(spread, Math.floor(i / 2));
    for (let j = -half; j <= half; j++) out.push([x0 + dx * i + lx * j, y0 + dy * i + ly * j]);
  }
  return out;
}

// Monster spell. Returns true if cast.
export function castMonsterSpell(w, m, s, t) {
  const dmg = () => rand(s.min, s.max);
  switch (s.type) {
    case 'heal':
      if (m.hp >= m.maxHp * 0.8) return false;
      m.heal(dmg());
      w.effect(m.x, m.y, m.z, 'heal');
      return true;
    case 'missile':
    case 'drain': {
      if (!t || chebyshev(m.x, m.y, t.x, t.y) > (s.range || 1)) return false;
      if (!w.map.lineOfSight(m.x, m.y, t.x, t.y, m.z)) return false;
      if (s.missile) w.missile(m, t, s.missile);
      w.effect(t.x, t.y, t.z, s.effect || s.element);
      const done = applyDamage(w, t, m, dmg(), s.element, { noEffect: true });
      if (s.type === 'drain' && done > 0) m.heal(Math.floor(done / 2), false);
      return true;
    }
    case 'area': {
      if (!t || chebyshev(m.x, m.y, t.x, t.y) > (s.range || 5)) return false;
      if (!w.map.lineOfSight(m.x, m.y, t.x, t.y, m.z)) return false;
      if (s.missile) w.missile(m, t, s.missile);
      const d = dmg();
      for (const [x, y] of circle(t.x, t.y, s.radius)) {
        if (w.map.lineOfSight(t.x, t.y, x, y, m.z)) damageTile(w, m, x, y, m.z, d, s.element, s.effect);
      }
      return true;
    }
    case 'wave': {
      if (!t || chebyshev(m.x, m.y, t.x, t.y) > s.len) return false;
      m.turnTo(t.x, t.y);
      const tiles = wave(m.x, m.y, m.dir, s.len, s.spread);
      if (!tiles.some(([x, y]) => x === t.x && y === t.y)) return false;
      const d = dmg();
      for (const [x, y] of tiles) {
        if (w.map.lineOfSight(m.x, m.y, x, y, m.z)) damageTile(w, m, x, y, m.z, d, s.element, s.effect);
      }
      return true;
    }
    case 'summon': {
      if ((m.summons?.size || 0) >= s.max) return false;
      const c = w.summonMonster(s.monster, m);
      if (c) { m.summons = m.summons || new Set(); m.summons.add(c.id); }
      return !!c;
    }
    default:
      return false;
  }
}
