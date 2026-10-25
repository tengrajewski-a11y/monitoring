// Combat rules. Follows the structure of the classic engine's TCombat:
// melee = attack probe - defense probe - armor, distance = hit probe then
// attack - armor, wands = fixed damage range with mana cost.

import {
  probeValue, attackModeFactor, defenseModeFactor, armorReduction, distanceHit, chebyshev,
} from '../shared/formulas.js';
import { ITEM_BY_KEY } from '../shared/items.js';

export function rand(min, max) { return min + Math.floor(Math.random() * (max - min + 1)); }

export function hitEffect(target, element) {
  if (element === 'physical') {
    return { red: 'blood', green: 'green_blood', bone: 'bone', slime: 'slime' }[target.blood] || 'blood';
  }
  return { lifedrain: 'drain', manadrain: 'mana' }[element] || element;
}

export function attack(w, a, t, now) {
  if (a.kind === 'player') return playerAttack(w, a, t, now);
  if (a.kind === 'monster') return monsterAttack(w, a, t, now);
  return false;
}

function playerAttack(w, p, t, now) {
  if (t.kind === 'npc') { p.setTarget(0); return false; }
  const map = w.map;
  if (map.isPZ(p.x, p.y, p.z) || map.isPZ(t.x, t.y, t.z)) {
    p.message('Nie możesz walczyć w strefie ochronnej.', 'warn');
    p.setTarget(0);
    return false;
  }
  if (t.kind === 'player') {
    const ok = w.canPvp(p, t);
    if (!ok.ok) { p.message(ok.reason, 'warn'); p.setTarget(0); return false; }
  }
  const wp = p.weaponInfo();
  const dist = chebyshev(p.x, p.y, t.x, t.y);
  if (wp.kind === 'melee') {
    if (dist > 1) return false;
    const atk = probeValue(attackModeFactor(p.fightMode, wp.atk), p.skillLevel(wp.skill));
    const def = t.defend(now);
    p.addSkillTry(wp.skill, 1);
    w.broadcastCreature(p, { t: 'atk', id: p.id, tid: t.id, w: wp.type });
    applyDamage(w, t, p, Math.max(0, atk - def), 'physical');
    return true;
  }
  if (dist > wp.range || !map.lineOfSight(p.x, p.y, t.x, t.y, p.z)) return false;
  if (wp.kind === 'bow') {
    const slot = p.findBag('arrow');
    if (slot < 0) { p.message('Nie masz bełtów.', 'warn'); return true; }
    p.consumeBag(slot, 1);
    const arrow = ITEM_BY_KEY.arrow;
    w.missile(p, t, 'arrow');
    w.broadcastCreature(p, { t: 'atk', id: p.id, tid: t.id, w: 'bow' });
    p.addSkillTry('dist', 1);
    if (distanceHit(p.skillLevel('dist'), dist, 90)) {
      const atk = probeValue(attackModeFactor(p.fightMode, arrow.atk + wp.atk), p.skillLevel('dist'));
      applyDamage(w, t, p, atk, 'physical');
    } else w.effect(t.x, t.y, t.z, 'poff');
    return true;
  }
  if (wp.kind === 'throw') {
    w.missile(p, t, 'spear');
    w.broadcastCreature(p, { t: 'atk', id: p.id, tid: t.id, w: 'throw' });
    p.addSkillTry('dist', 1);
    if (Math.random() < 0.15) p.consumeEquip('weapon', 1);
    if (distanceHit(p.skillLevel('dist'), dist, 75)) {
      const atk = probeValue(attackModeFactor(p.fightMode, wp.atk), p.skillLevel('dist'));
      applyDamage(w, t, p, atk, 'physical');
    } else w.effect(t.x, t.y, t.z, 'poff');
    return true;
  }
  if (wp.kind === 'wand') {
    const wand = wp.item.wand;
    if (p.mana < wand.mana) { p.message('Masz za mało many.', 'warn'); return true; }
    p.spendMana(wand.mana);
    w.missile(p, t, wand.element);
    w.broadcastCreature(p, { t: 'atk', id: p.id, tid: t.id, w: 'wand' });
    applyDamage(w, t, p, rand(wand.min, wand.max), wand.element);
    return true;
  }
  return false;
}

function monsterAttack(w, m, t, now) {
  const def = m.def;
  if (t.kind === 'player' && w.map.isPZ(t.x, t.y, t.z)) { m.setTarget(0); return false; }
  const dist = chebyshev(m.x, m.y, t.x, t.y);
  if (def.ranged && dist >= 2 && dist <= def.ranged.range && w.map.lineOfSight(m.x, m.y, t.x, t.y, m.z)) {
    const r = def.ranged;
    w.missile(m, t, r.missile);
    if (distanceHit(r.skill, dist, r.hit)) applyDamage(w, t, m, probeValue(r.attack, r.skill), 'physical');
    else w.effect(t.x, t.y, t.z, 'poff');
    return true;
  }
  if (dist > 1 || !def.attack) return false;
  const atk = probeValue(def.attack, def.skill);
  const defense = t.defend(now);
  w.broadcastCreature(m, { t: 'atk', id: m.id, tid: t.id });
  const done = applyDamage(w, t, m, Math.max(0, atk - defense), 'physical');
  if (def.poison && !t.dead && (done > 0 || (atk > defense && Math.random() < 0.2))) {
    const amount = rand(Math.floor(def.poison / 2), def.poison);
    if (amount > 0 && !t.immune.includes('poison')) {
      t.addCondition('poison', { amount, src: m.id });
      if (t.kind === 'player') t.message('Zostałeś zatruty.', 'warn');
    }
  }
  return true;
}

/**
 * Applies damage of an element to a creature. Returns the damage dealt.
 * opts.periodic: damage over time (no PvP halving, no armor).
 */
export function applyDamage(w, t, a, dmg, element, opts = {}) {
  if (!t || t.dead || t.kind === 'npc') return 0;
  const now = w.now;
  let responsible = a || null;
  if (a && a.masterId) responsible = w.creatures.get(a.masterId) || a;

  if (t.kind === 'player') {
    if (responsible && responsible.kind === 'player' && responsible !== t) {
      const ok = w.canPvp(responsible, t);
      if (!ok.ok) return 0;
      if (!opts.periodic) dmg = Math.floor((dmg + 1) / 2);
      if (!t.skull(now) && !opts.periodic) responsible.setSkull('white', now);
    }
    if (t.invulnerable) dmg = 0;
    dmg = t.applyProtection(dmg, element);
    t.markFight(now);
  }
  if (responsible && responsible.kind === 'player') responsible.markFight(now);

  if (dmg <= 0) {
    if (!opts.periodic) w.effect(t.x, t.y, t.z, element === 'physical' ? 'poff' : 'block');
    if (a && !opts.periodic) t.onDamaged(a, 0, element);
    return 0;
  }
  if (t.immune.includes(element)) { w.effect(t.x, t.y, t.z, 'block'); return 0; }
  if (element === 'physical' && !opts.periodic && !opts.ignoreArmor) {
    dmg -= armorReduction(t.armorValue());
    if (dmg <= 0) { w.effect(t.x, t.y, t.z, 'block'); t.onDamaged(a, 0, element); return 0; }
  }
  const mult = t.elements[element] ?? 1;
  dmg = Math.floor(dmg * mult);
  if (dmg <= 0) { w.effect(t.x, t.y, t.z, 'block'); return 0; }

  t.onDamaged(a, dmg, element);

  if (t.conditions.manashield && t.mana > 0) {
    const absorbed = Math.min(t.mana, dmg);
    t.mana -= absorbed; dmg -= absorbed;
    t.onManaChanged?.();
    w.floatText(t.x, t.y, t.z, String(absorbed), 'mana');
    w.effect(t.x, t.y, t.z, 'mana');
    if (t.kind === 'player') t.message(`Tracisz ${absorbed} many${a ? ` przez atak: ${a.name}` : ''}.`, 'dmg');
  }
  if (dmg <= 0) return 0;

  t.hp -= dmg;
  const key = responsible ? responsible.id : 0;
  if (key) t.damageLog.set(key, (t.damageLog.get(key) || 0) + dmg);
  if (!opts.noEffect) w.effect(t.x, t.y, t.z, hitEffect(t, element));
  w.floatText(t.x, t.y, t.z, String(dmg), element);
  if (t.kind === 'player') {
    t.message(`Tracisz ${dmg} ${dmg === 1 ? 'punkt' : 'punktów'} życia${a ? ` przez atak: ${a.name}` : ''}.`, 'dmg');
  }
  if (t.hp <= 0) {
    t.hp = 0;
    t.onHpChanged();
    t.die(responsible || a);
  } else t.onHpChanged();
  return dmg;
}

// Splits experience between attackers by damage share
// (TCombat::DistributeExperiencePoints).
export function distributeExp(w, victim, total) {
  let sum = 0;
  for (const v of victim.damageLog.values()) sum += v;
  if (sum <= 0 || total <= 0) return;
  for (const [id, dmg] of victim.damageLog) {
    const p = w.creatures.get(id);
    if (!p || p.dead || p.kind !== 'player') continue;
    const amount = Math.floor((total * Math.min(dmg, victim.maxHp)) / Math.max(sum, victim.maxHp));
    if (amount > 0) p.addExp(amount);
  }
}

export function rollLoot(def, rateLoot = 1) {
  const items = [];
  let gold = 0;
  for (const [key, chance, min, max] of def.loot || []) {
    if (Math.random() >= Math.min(1, chance * rateLoot)) continue;
    const n = rand(min, max);
    if (key === 'gold') { gold += n; continue; }
    const it = ITEM_BY_KEY[key];
    if (!it) continue;
    if (it.stack) items.push({ id: it.id, n });
    else for (let i = 0; i < n; i++) items.push({ id: it.id, n: 1 });
  }
  if (gold > 0) {
    const g = ITEM_BY_KEY.gold.id;
    while (gold > 0) { const n = Math.min(100, gold); items.unshift({ id: g, n }); gold -= n; }
  }
  return items;
}
