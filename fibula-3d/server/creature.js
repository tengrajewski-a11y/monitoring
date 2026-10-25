// Base class for every creature in the world (players, monsters, NPCs).
// Handles walking (queued directions and goal based path finding),
// timed conditions and the basic attack loop.

import { DIR, DIR_DX, DIR_DY, dirFromDelta } from '../shared/constants.js';
import { chebyshev } from '../shared/formulas.js';
import { findPath } from '../shared/path.js';
import { attack, applyDamage } from './combat.js';

export class Creature {
  constructor(world, kind, name) {
    this.world = world;
    this.id = world.nextId++;
    this.kind = kind;            // 'player' | 'monster' | 'npc'
    this.name = name;
    this.x = 0; this.y = 0; this.z = 0;
    this.dir = DIR.S;
    this.hp = 100; this.maxHp = 100;
    this.mana = 0; this.maxMana = 0;
    this.baseSpeed = 220;
    this.walkQueue = [];
    this.goal = null;            // {x, y, adjacent, creatureId}
    this.nextWalkAt = 0;
    this.step = null;            // {fx, fy, start, dur} of the step in progress
    this.portalAt = 0;
    this.targetId = 0;
    this.nextAttackAt = 0;
    this.nextDefendAt = 0;
    this.conditions = {};        // poison, burn, energy, haste, light, manashield
    this.damageLog = new Map();  // attackerId -> damage
    this.dead = false;
    this.nextSecondAt = 0;
    this.blood = 'red';
    this.immune = [];
    this.elements = {};
  }

  get speed() {
    let s = this.baseSpeed;
    if (this.conditions.haste) s += this.conditions.haste.amount;
    return s;
  }

  get attackInterval() { return this.world.config.attackInterval; }
  lightRadius() { return this.conditions.light ? this.conditions.light.radius : 0; }
  isWalking(now) { return this.step && now < this.step.start + this.step.dur; }

  // -- movement -------------------------------------------------------------
  canStepTo(x, y, z) { return this.world.canEnter(this, x, y, z); }

  walkTo(x, y, adjacent = false) {
    this.goal = { x, y, adjacent, creatureId: 0, lastPath: 0 };
    this.walkQueue = [];
  }

  follow(creature) {
    this.goal = { x: creature.x, y: creature.y, adjacent: true, creatureId: creature.id, lastPath: 0 };
    this.walkQueue = [];
  }

  stopWalking() { this.goal = null; this.walkQueue = []; }

  computePath(now) {
    const g = this.goal;
    if (!g) return;
    if (g.creatureId) {
      const t = this.world.creatures.get(g.creatureId);
      if (!t || t.dead || t.z !== this.z) { this.goal = null; return; }
      g.x = t.x; g.y = t.y;
    }
    if (chebyshev(this.x, this.y, g.x, g.y) <= (g.adjacent ? 1 : 0)) { this.walkQueue = []; if (!g.creatureId) this.goal = null; return; }
    const path = findPath(this.world.map, this.x, this.y, g.x, g.y, this.z,
      (x, y) => this.world.passableForPath(this, x, y, this.z), { adjacent: g.adjacent, maxNodes: this.kind === 'player' ? 4000 : 800, maxDist: this.kind === 'player' ? 60 : 16 });
    g.lastPath = now;
    g.px = g.x; g.py = g.y;
    if (!path || path.length === 0) {
      this.walkQueue = [];
      if (!path && !g.creatureId) { this.goal = null; this.onNoPath(); }
      return;
    }
    this.walkQueue = path;
  }

  onNoPath() {}

  processWalk(now) {
    if (now < this.nextWalkAt || this.portalAt) return;
    const g = this.goal;
    if (g) {
      if (g.creatureId) {
        const t = this.world.creatures.get(g.creatureId);
        if (!t || t.dead) this.goal = null;
        else if (now - g.lastPath > 250 && (t.x !== g.px || t.y !== g.py || this.walkQueue.length === 0)) this.computePath(now);
      } else if (this.walkQueue.length === 0) this.computePath(now);
    }
    if (this.walkQueue.length === 0) return;
    const d = this.walkQueue.shift();
    if (!this.world.moveCreature(this, d, now)) {
      this.walkQueue = [];
      if (this.goal) { this.goal.lastPath = 0; this.nextWalkAt = now + 200; }
      else this.onBlocked();
    }
  }

  onBlocked() {}

  // Step in a direction regardless of goal (used by AI).
  tryStep(d, now) { return this.world.moveCreature(this, d, now); }

  turnTo(x, y) {
    const dx = x - this.x, dy = y - this.y;
    let d;
    if (Math.abs(dx) > Math.abs(dy)) d = dx > 0 ? DIR.E : DIR.W;
    else if (dy !== 0) d = dy > 0 ? DIR.S : DIR.N;
    else return;
    if (d !== this.dir) { this.dir = d; this.world.broadcastCreature(this, { t: 'turn', id: this.id, d }); }
  }

  // -- combat -----------------------------------------------------------------
  get target() { return this.targetId ? this.world.creatures.get(this.targetId) : null; }

  processAttack(now) {
    if (!this.targetId) return;
    const t = this.target;
    if (!t || t.dead || t.z !== this.z || chebyshev(this.x, this.y, t.x, t.y) > 14) { this.setTarget(0); return; }
    if (now < this.nextAttackAt) return;
    if (attack(this.world, this, t, now)) this.nextAttackAt = now + this.attackInterval;
  }

  setTarget(id) { this.targetId = id; }

  // -- conditions -------------------------------------------------------------
  addCondition(type, data) {
    const now = this.world.now;
    if (type === 'poison') {
      const cur = this.conditions.poison;
      if (!cur || cur.amount < data.amount) this.conditions.poison = { amount: data.amount, next: now + 3000, src: data.src };
    } else if (type === 'burn') {
      this.conditions.burn = { ticks: data.ticks, dmg: data.dmg, next: now + 3000, src: data.src };
    } else if (type === 'energy') {
      this.conditions.energy = { ticks: data.ticks, dmg: data.dmg, next: now + 2000, src: data.src };
    } else {
      this.conditions[type] = data;
    }
    this.onConditionsChanged();
  }

  removeCondition(type) {
    if (this.conditions[type]) { delete this.conditions[type]; this.onConditionsChanged(); }
  }

  onConditionsChanged() {}

  processConditions(now) {
    const c = this.conditions;
    const src = (s) => (s ? this.world.creatures.get(s) || null : null);
    if (c.poison && now >= c.poison.next) {
      const dmg = Math.max(1, Math.ceil(c.poison.amount));
      applyDamage(this.world, this, src(c.poison.src), dmg, 'poison', { periodic: true });
      if (this.dead) return;
      c.poison.amount = Math.floor(c.poison.amount * 0.8);
      c.poison.next = now + 3000;
      if (c.poison.amount <= 0) this.removeCondition('poison');
    }
    if (c.burn && now >= c.burn.next) {
      applyDamage(this.world, this, src(c.burn.src), c.burn.dmg, 'fire', { periodic: true });
      if (this.dead) return;
      c.burn.next = now + 3000;
      if (--c.burn.ticks <= 0) this.removeCondition('burn');
    }
    if (c.energy && now >= c.energy.next) {
      applyDamage(this.world, this, src(c.energy.src), c.energy.dmg, 'energy', { periodic: true });
      if (this.dead) return;
      c.energy.next = now + 2000;
      if (--c.energy.ticks <= 0) this.removeCondition('energy');
    }
    for (const k of ['haste', 'light', 'manashield']) {
      if (c[k] && now >= c[k].until) {
        this.removeCondition(k);
        if (k === 'haste') this.world.broadcastCreature(this, { t: 'cu', id: this.id, sp: this.speed });
        if (k === 'light') this.world.broadcastCreature(this, { t: 'cu', id: this.id, light: this.lightRadius() });
      }
    }
  }

  // -- hooks ------------------------------------------------------------------
  tick(now) {
    if (this.dead) return;
    if (this.portalAt && now >= this.portalAt) {
      const dest = this.portalDest;
      this.portalAt = 0; this.portalDest = null;
      if (dest) this.world.teleport(this, dest.x, dest.y, dest.z, 'teleport');
    }
    this.processWalk(now);
    this.processAttack(now);
    if (now >= this.nextSecondAt) {
      this.nextSecondAt = now + 1000;
      this.processConditions(now);
      if (!this.dead) this.everySecond(now);
    }
  }

  everySecond() {}
  onDamaged() {}
  onMoved() {}

  heal(amount, showText = true) {
    if (this.dead || amount <= 0) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const done = this.hp - before;
    if (done > 0) {
      this.onHpChanged();
      if (showText) this.world.floatText(this.x, this.y, this.z, `+${done}`, 'heal');
    }
    return done;
  }

  onHpChanged() {
    this.world.broadcastCreature(this, { t: 'hp', id: this.id, hp: this.hpPercent() });
  }

  hpPercent() { return Math.max(0, Math.min(100, Math.ceil((this.hp / this.maxHp) * 100))); }

  describe() {
    const d = {
      id: this.id, k: this.kind[0], name: this.name, x: this.x, y: this.y, z: this.z, d: this.dir,
      hp: this.hpPercent(), sp: this.speed, light: this.lightRadius(),
    };
    const now = this.world.now;
    if (this.step && now < this.step.start + this.step.dur) {
      d.walk = { fx: this.step.fx, fy: this.step.fy, dur: this.step.dur, left: this.step.start + this.step.dur - now };
    }
    return d;
  }
}

export function stepDir(fromX, fromY, toX, toY) { return dirFromDelta(toX - fromX, toY - fromY); }
export { DIR_DX, DIR_DY };
