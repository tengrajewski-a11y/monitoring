// Monster AI: idle wandering around the spawn, target acquisition, chasing,
// keeping distance, fleeing at low health and casting spells.

import { DIR_DX, DIR_DY } from '../shared/constants.js';
import { probeValue, chebyshev } from '../shared/formulas.js';
import { Creature } from './creature.js';
import { distributeExp, rollLoot, rand } from './combat.js';
import { castMonsterSpell } from './spells.js';

export class Monster extends Creature {
  constructor(world, def, spawn, x, y, z, masterId = 0) {
    super(world, 'monster', def.name);
    this.def = def;
    this.spawn = spawn;
    this.masterId = masterId;
    this.hp = this.maxHp = def.hp;
    this.baseSpeed = def.speed;
    this.blood = def.blood;
    this.immune = def.immune;
    this.elements = def.elements;
    this.x = x; this.y = y; this.z = z;
    this.home = { x, y, z };
    this.radius = spawn ? spawn.def.radius : 3;
    this.thinkAt = 0;
    this.spellCd = def.spells.map(() => 0);
    this.fleeFrom = 0;
    this.fleeUntil = 0;
    this.summons = null;
  }

  armorValue() { return this.def.armor; }

  defend(now) {
    if (now < this.nextDefendAt) return 0;
    this.nextDefendAt = now + this.world.config.defenseInterval;
    return probeValue(this.def.defense, this.def.skill);
  }

  onDamaged(a) {
    if (!a || a === this) return;
    if (this.def.passive) { this.fleeFrom = a.id; this.fleeUntil = this.world.now + 6000; return; }
    if (!this.targetId && a.kind !== 'npc' && !(a.kind === 'monster' && !a.masterId)) this.setTarget(a.id);
  }

  tick(now) {
    if (this.dead) return;
    if (now >= this.thinkAt) {
      this.thinkAt = now + 350 + Math.floor(Math.random() * 250);
      this.think(now);
    }
    super.tick(now);
  }

  validTarget(t) {
    const w = this.world;
    if (!t || t.dead || t.z !== this.z) return false;
    if (chebyshev(this.x, this.y, t.x, t.y) > 10) return false;
    if (t.kind === 'player' && (w.map.isPZ(t.x, t.y, t.z) || t.invulnerable)) return false;
    if (t.kind === 'npc') return false;
    return true;
  }

  think(now) {
    const w = this.world, def = this.def;
    if (this.masterId) {
      const master = w.creatures.get(this.masterId);
      if (!master || master.dead || master.z !== this.z || chebyshev(this.x, this.y, master.x, master.y) > 20) { this.vanish(); return; }
    }
    // Sleep when nobody is around (saves CPU like the original's idle list).
    const near = w.nearestPlayer(this.x, this.y, this.z, 14);
    if (!near && !this.targetId) { if (Math.random() < 0.05) this.wander(now); return; }

    if (def.passive) {
      const threat = (this.fleeUntil > now && w.creatures.get(this.fleeFrom)) || w.nearestPlayer(this.x, this.y, this.z, 3);
      if (threat && !threat.dead) this.fleeStep(threat, now);
      else this.wander(now);
      return;
    }

    let t = this.target;
    if (t && (!this.validTarget(t) || (!this.masterId && Math.random() * 100 < def.loseTarget * 0.25))) { this.setTarget(0); t = null; this.stopWalking(); }
    if (t && !this.masterId && chebyshev(this.x, this.y, this.home.x, this.home.y) > this.radius + 14) {
      this.setTarget(0); t = null;
      this.walkTo(this.home.x, this.home.y);
      return;
    }
    if (!t) {
      const cand = w.nearestPlayer(this.x, this.y, this.z, 8, (p) => this.validTarget(p));
      if (cand) { this.setTarget(cand.id); t = cand; if (def.sounds && Math.random() < 0.4) this.shout(); }
    }
    if (!t) { this.wander(now); return; }

    if (def.sounds && Math.random() < 0.02) this.shout();
    const dist = chebyshev(this.x, this.y, t.x, t.y);
    // spells
    for (let i = 0; i < def.spells.length; i++) {
      const s = def.spells[i];
      if (now < this.spellCd[i] || Math.random() >= s.chance) continue;
      if (castMonsterSpell(w, this, s, t)) { this.spellCd[i] = now + (s.cd || 2000); break; }
    }
    if (this.dead) return;
    // flee
    if (def.runHp && this.hp <= def.runHp) { this.fleeStep(t, now); return; }
    // positioning
    const los = w.map.lineOfSight(this.x, this.y, t.x, t.y, this.z);
    if (def.keepDistance) {
      if (dist < def.keepDistance && los) { this.stopWalking(); this.fleeStep(t, now); }
      else if (dist > def.keepDistance + 1 || !los) { if (!this.goal || this.goal.creatureId !== t.id) this.follow(t); }
      else { this.stopWalking(); this.turnTo(t.x, t.y); }
    } else if (dist > 1) {
      if (!this.goal || this.goal.creatureId !== t.id) this.follow(t);
    } else {
      this.stopWalking();
      this.turnTo(t.x, t.y);
    }
  }

  wander(now) {
    if (this.goal || this.walkQueue.length || now < this.nextWalkAt) return;
    const d = chebyshev(this.x, this.y, this.home.x, this.home.y);
    if (d > this.radius + 2) { this.walkTo(this.home.x, this.home.y); return; }
    if (Math.random() < 0.35) {
      const dir = Math.floor(Math.random() * 4);
      const nx = this.x + DIR_DX[dir], ny = this.y + DIR_DY[dir];
      if (chebyshev(nx, ny, this.home.x, this.home.y) <= this.radius) this.tryStep(dir, now);
    }
  }

  fleeStep(from, now) {
    if (now < this.nextWalkAt) return;
    this.stopWalking();
    let best = -1, bestD = chebyshev(this.x, this.y, from.x, from.y);
    for (let d = 0; d < 8; d++) {
      const nx = this.x + DIR_DX[d], ny = this.y + DIR_DY[d];
      if (!this.world.canEnter(this, nx, ny, this.z)) continue;
      const nd = Math.max(Math.abs(nx - from.x), Math.abs(ny - from.y)) + (d < 4 ? 0.1 : 0);
      if (nd > bestD) { bestD = nd; best = d; }
    }
    if (best >= 0) this.tryStep(best, now);
  }

  shout() {
    const s = this.def.sounds;
    if (s && s.length) this.world.say(this, s[rand(0, s.length - 1)], 'monster');
  }

  vanish() {
    if (this.dead) return;
    this.dead = true;
    this.world.effect(this.x, this.y, this.z, 'poff');
    this.world.removeCreature(this);
  }

  die(killer) {
    if (this.dead) return;
    const w = this.world;
    this.dead = true;
    let owner = 0, best = 0;
    for (const [id, dmg] of this.damageLog) {
      const c = w.creatures.get(id);
      if (c && c.kind === 'player' && dmg > best) { best = dmg; owner = id; }
    }
    let loot = [];
    if (!this.masterId) {
      distributeExp(w, this, Math.floor(this.def.exp * w.config.rateExp));
      loot = rollLoot(this.def, w.config.rateLoot);
    }
    w.effect(this.x, this.y, this.z, 'death');
    w.createCorpse(this, loot, owner);
    const k = killer && w.creatures.get(killer.id);
    if (k && k.kind === 'player') k.stats.kills++;
    if (this.def.boss && k) w.broadcastWorld(`${k.name} pokonał bossa: ${this.def.name}!`);
    if (this.summons) for (const id of this.summons) { const s = w.creatures.get(id); if (s) s.vanish(); }
    w.removeCreature(this);
    if (this.spawn) this.spawn.onDeath(this);
  }

  describe() {
    const d = super.describe();
    d.type = this.def.key;
    if (this.def.human) d.look = { ...this.def.human, sex: 'm' };
    if (this.def.boss) d.boss = 1;
    return d;
  }
}
