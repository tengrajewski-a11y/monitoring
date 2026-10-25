// Player characters.

import {
  VOCATIONS, SKILLS, SKILL_NAMES, SLOTS, BAG_SIZE, STACK_MAX, F,
} from '../shared/constants.js';
import {
  expForLevel, levelForExp, triesForSkill, skillLevelForTries, skillPercent, maxHp, maxMana,
  playerSpeed, probeValue, defenseModeFactor, chebyshev, pvpExp, deathExpLoss,
} from '../shared/formulas.js';
import { ITEMS, ITEM_BY_KEY, GOLD_ID, itemName, describeItem } from '../shared/items.js';
import { Creature } from './creature.js';
import { rand } from './combat.js';

const MELEE_SKILL = { sword: 'sword', axe: 'axe', club: 'club' };
export const MAX_FED = 1200;

export class Player extends Creature {
  constructor(world, rec, session) {
    super(world, 'player', rec.name);
    this.session = session;
    this.out = [];
    this.rec = rec;
    this.voc = rec.voc;
    this.sex = rec.sex;
    this.outfit = { ...rec.outfit };
    this.exp = rec.exp || 0;
    this.manaSpent = rec.manaSpent || 0;
    this.skillTries = { fist: 0, club: 0, sword: 0, axe: 0, dist: 0, shield: 0, ...(rec.skillTries || {}) };
    this.equip = {};
    for (const s of SLOTS) this.equip[s] = fromStored(rec.equip?.[s]);
    this.bag = [];
    for (let i = 0; i < BAG_SIZE; i++) this.bag.push(fromStored(rec.bag?.[i]));
    this.gold = rec.gold || 0;
    this.fed = rec.fed ?? 300;
    this.quests = { ...(rec.quests || {}) };
    this.frags = (rec.frags || []).filter((t) => Date.now() - t < 7 * 864e5);
    this.redSkullUntil = rec.redSkullUntil || 0;
    this.whiteSkullUntil = 0;
    this.gm = !!rec.gm;
    this.invulnerable = false;
    this.stats = { kills: 0, deaths: 0, ...(rec.stats || {}) };
    this.fightMode = 2;
    this.chase = false;
    this.fightUntil = 0;
    this.exhaustUntil = 0;
    this.potionUntil = 0;
    this.known = new Set();
    this.knownChunks = new Set();
    this.openContainers = new Map();
    this.pending = null;
    this.chatTimes = [];
    this.mutedUntil = 0;
    this.loginAt = Date.now();
    this.dirtyStats = true;
    this.dirtyInv = true;
    this.cachedLevels = {};
    this.recalc(true);
    this.hp = Math.min(this.maxHp, rec.hp ?? this.maxHp);
    this.mana = Math.min(this.maxMana, rec.mana ?? this.maxMana);
    if (this.hp <= 0) this.hp = this.maxHp;
  }

  get vocation() { return VOCATIONS[this.voc]; }

  // -- derived values -----------------------------------------------------------
  recalc(initial = false) {
    const oldMax = this.maxHp, oldMana = this.maxMana;
    this.level = levelForExp(this.exp);
    this.maxHp = maxHp(this.voc, this.level);
    this.maxMana = maxMana(this.voc, this.level);
    let speed = playerSpeed(this.level);
    for (const s of SLOTS) { const it = this.equip[s] && ITEMS[this.equip[s].id]; if (it && it.speed) speed += it.speed; }
    this.baseSpeed = speed;
    this.mlvl = skillLevelForTries('magic', this.manaSpent, this.vocation.factors.magic);
    for (const sk of SKILLS) this.cachedLevels[sk] = skillLevelForTries(sk, this.skillTries[sk], this.vocation.factors[sk]);
    if (!initial) {
      if (this.maxHp > oldMax) this.hp += this.maxHp - oldMax;
      if (this.maxMana > oldMana) this.mana += this.maxMana - oldMana;
      this.hp = Math.min(this.hp, this.maxHp);
      this.mana = Math.min(this.mana, this.maxMana);
    }
    this.dirtyStats = true;
  }

  skillLevel(sk) { return sk === 'magic' ? this.mlvl : this.cachedLevels[sk]; }
  bestMeleeSkill() { return Math.max(this.cachedLevels.sword, this.cachedLevels.axe, this.cachedLevels.club, this.cachedLevels.fist); }

  addSkillTry(sk, n) {
    const rate = this.world.config.rateSkill;
    this.skillTries[sk] += n * rate;
    const lvl = skillLevelForTries(sk, this.skillTries[sk], this.vocation.factors[sk]);
    if (lvl > this.cachedLevels[sk]) {
      this.cachedLevels[sk] = lvl;
      this.message(`Awansowałeś w umiejętności: ${SKILL_NAMES[sk]} (${lvl}).`, 'adv');
    }
    this.dirtyStats = true;
  }

  spendMana(n) {
    this.mana = Math.max(0, this.mana - n);
    if (this.gm) { this.dirtyStats = true; return; }
    this.manaSpent += n * this.world.config.rateMagic;
    const ml = skillLevelForTries('magic', this.manaSpent, this.vocation.factors.magic);
    if (ml > this.mlvl) {
      this.mlvl = ml;
      this.message(`Awansowałeś na poziom magii ${ml}.`, 'adv');
      this.world.effect(this.x, this.y, this.z, 'sparkle');
    }
    this.dirtyStats = true;
  }

  onManaChanged() { this.dirtyStats = true; }
  onHpChanged() { super.onHpChanged(); this.dirtyStats = true; }
  onConditionsChanged() { this.dirtyStats = true; }

  addExp(n) {
    if (this.gm) return;
    const before = this.level;
    this.exp += n;
    this.world.floatText(this.x, this.y, this.z, String(n), 'exp');
    this.message(`Zdobywasz ${n} ${n === 1 ? 'punkt' : 'punktów'} doświadczenia.`, 'exp');
    this.recalc();
    if (this.level > before) {
      this.message(`Awansowałeś z poziomu ${before} na poziom ${this.level}.`, 'adv');
      this.world.effect(this.x, this.y, this.z, 'levelup');
      this.world.broadcastCreature(this, { t: 'cu', id: this.id, sp: this.speed });
      this.world.storage.save(this.serialize());
    }
  }

  loseExp(n) {
    const before = this.level;
    this.exp = Math.max(0, this.exp - n);
    this.recalc();
    if (this.level < before) this.message(`Spadłeś z poziomu ${before} na poziom ${this.level}.`, 'warn');
  }

  // -- combat values -------------------------------------------------------------
  weaponInfo() {
    const w = this.equip.weapon && ITEMS[this.equip.weapon.id];
    if (!w) return { kind: 'melee', type: 'fist', skill: 'fist', atk: 7, range: 1 };
    switch (w.weaponType) {
      case 'sword': case 'axe': case 'club':
        return { kind: 'melee', type: w.weaponType, skill: MELEE_SKILL[w.weaponType], atk: w.atk, range: 1, item: w };
      case 'bow': return { kind: 'bow', type: 'bow', skill: 'dist', atk: w.atk || 0, range: w.range, item: w };
      case 'throw': return { kind: 'throw', type: 'throw', skill: 'dist', atk: w.atk, range: w.range, item: w };
      case 'wand': return { kind: 'wand', type: 'wand', skill: 'magic', atk: 0, range: w.range, item: w };
      default: return { kind: 'melee', type: 'fist', skill: 'fist', atk: 7, range: 1 };
    }
  }

  defend(now) {
    if (now < this.nextDefendAt) return 0;
    this.nextDefendAt = now + this.world.config.defenseInterval;
    const shield = this.equip.shield && ITEMS[this.equip.shield.id];
    const weapon = this.equip.weapon && ITEMS[this.equip.weapon.id];
    let def, skill;
    if (shield && shield.def) { def = shield.def; skill = 'shield'; }
    else if (weapon && weapon.def) { def = weapon.def; skill = MELEE_SKILL[weapon.weaponType] || 'fist'; }
    else { def = weapon ? 0 : 5; skill = 'fist'; }
    if (!def) return 0;
    const mode = (this.targetId === 0) ? 3 : this.fightMode;
    const res = probeValue(defenseModeFactor(mode, def), this.skillLevel(skill));
    if (skill === 'shield') this.addSkillTry('shield', 1);
    return res;
  }

  armorValue() {
    let a = 0;
    for (const s of SLOTS) { const it = this.equip[s] && ITEMS[this.equip[s].id]; if (it && it.arm) a += it.arm; }
    return a;
  }

  applyProtection(dmg, element) {
    for (const s of SLOTS) {
      const it = this.equip[s] && ITEMS[this.equip[s].id];
      const p = it && it.protect && it.protect[element];
      if (p) dmg = Math.floor((dmg * (100 - p)) / 100);
    }
    return dmg;
  }

  lightRadius() {
    let r = super.lightRadius();
    for (const s of ['shield', 'ring']) { const it = this.equip[s] && ITEMS[this.equip[s].id]; if (it && it.light) r = Math.max(r, it.light); }
    return r;
  }

  markFight(now) {
    const was = this.fightUntil > now;
    this.fightUntil = now + this.world.config.inFightSec * 1000;
    if (!was) this.dirtyStats = true;
  }
  inFight(now = this.world.now) { return this.fightUntil > now; }

  skull(now = this.world.now) {
    if (this.redSkullUntil > now) return 'red';
    if (this.whiteSkullUntil > now) return 'white';
    return null;
  }

  setSkull(kind, now) {
    const before = this.skull(now);
    if (kind === 'white') this.whiteSkullUntil = now + this.world.config.whiteSkullMin * 60000;
    if (kind === 'red') this.redSkullUntil = now + 24 * 3600000;
    const after = this.skull(now);
    if (before !== after) {
      this.world.broadcastCreature(this, { t: 'cu', id: this.id, skull: after });
      this.dirtyStats = true;
    }
  }

  setTarget(id) {
    if (this.targetId === id) return;
    this.targetId = id;
    this.send({ t: 'target', id });
    if (!id && this.goal && this.goal.creatureId) this.goal = null;
  }

  // -- inventory -------------------------------------------------------------
  freeSlots() { return this.bag.filter((s) => !s).length; }

  canAdd(id, n) {
    const def = ITEMS[id];
    if (!def) return false;
    if (id === GOLD_ID) return true;
    if (!def.stack) return this.freeSlots() >= n;
    let room = 0;
    for (const s of this.bag) {
      if (!s) room += STACK_MAX;
      else if (s.id === id) room += STACK_MAX - s.n;
    }
    return room >= n;
  }

  addItem(id, n = 1) {
    if (!this.canAdd(id, n)) return false;
    if (id === GOLD_ID) { this.gold += n; this.dirtyInv = true; return true; }
    const def = ITEMS[id];
    if (def.stack) {
      for (const s of this.bag) {
        if (n <= 0) break;
        if (s && s.id === id && s.n < STACK_MAX) { const k = Math.min(n, STACK_MAX - s.n); s.n += k; n -= k; }
      }
      for (let i = 0; i < BAG_SIZE && n > 0; i++) {
        if (!this.bag[i]) { const k = Math.min(n, STACK_MAX); this.bag[i] = { id, n: k }; n -= k; }
      }
    } else {
      for (let i = 0; i < BAG_SIZE && n > 0; i++) if (!this.bag[i]) { this.bag[i] = { id, n: 1 }; n--; }
    }
    this.dirtyInv = true;
    return true;
  }

  findBag(key) {
    const id = ITEM_BY_KEY[key]?.id;
    return this.bag.findIndex((s) => s && s.id === id);
  }

  countItem(id) { return this.bag.reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0); }

  removeItems(id, n) {
    if (this.countItem(id) < n) return false;
    for (let i = BAG_SIZE - 1; i >= 0 && n > 0; i--) {
      const s = this.bag[i];
      if (s && s.id === id) { const k = Math.min(n, s.n); s.n -= k; n -= k; if (s.n <= 0) this.bag[i] = null; }
    }
    this.dirtyInv = true;
    return true;
  }

  consumeBag(slot, n) {
    const s = this.bag[slot];
    if (!s) return;
    s.n -= n;
    if (s.n <= 0) this.bag[slot] = null;
    this.dirtyInv = true;
  }

  consumeEquip(slot, n) {
    const s = this.equip[slot];
    if (!s) return;
    s.n -= n;
    if (s.n <= 0) { this.equip[slot] = null; this.onLookChanged(); }
    this.dirtyInv = true;
  }

  useBag(i) {
    const s = this.bag[i];
    if (!s) return;
    const def = ITEMS[s.id];
    const now = this.world.now;
    if (def.kind === 'food') {
      if (this.fed + def.food > MAX_FED) { this.message('Jesteś najedzony.', 'info'); return; }
      this.fed += def.food;
      this.consumeBag(i, 1);
      this.world.say(this, 'Mniam.', 'emote');
      this.dirtyStats = true;
      return;
    }
    if (def.kind === 'potion') {
      if (now < this.potionUntil) { this.message('Jesteś wyczerpany.', 'warn'); return; }
      if (def.level && this.level < def.level) { this.message(`Potrzebujesz poziomu ${def.level}.`, 'warn'); return; }
      this.potionUntil = now + this.world.config.potionExhaust;
      if (def.heal) { this.heal(rand(def.heal[0], def.heal[1])); this.world.effect(this.x, this.y, this.z, 'heal'); }
      if (def.mana) {
        const before = this.mana;
        this.mana = Math.min(this.maxMana, this.mana + rand(def.mana[0], def.mana[1]));
        this.world.floatText(this.x, this.y, this.z, `+${this.mana - before}`, 'mana');
        this.world.effect(this.x, this.y, this.z, 'mana');
      }
      if (def.cure === 'poison') { this.removeCondition('poison'); this.world.effect(this.x, this.y, this.z, 'heal'); }
      this.consumeBag(i, 1);
      this.world.say(this, 'Aaah...', 'emote');
      this.dirtyStats = true;
      return;
    }
    if (def.slot && SLOTS.includes(def.slot)) { this.equipFromBag(i); return; }
    this.message(describeItem(s.id, s.n), 'look');
  }

  equipFromBag(i) {
    const s = this.bag[i];
    if (!s) return;
    const def = ITEMS[s.id];
    if (!def.slot || !SLOTS.includes(def.slot)) { this.message('Tego nie można założyć.', 'warn'); return; }
    if (def.level && this.level < def.level) { this.message(`Potrzebujesz poziomu ${def.level}, by tego używać.`, 'warn'); return; }
    if (def.voc && !def.voc.includes(this.voc)) { this.message('Twoja profesja nie może tego używać.', 'warn'); return; }
    const slot = def.slot;
    // two-handed weapons and shields exclude each other
    const extra = [];
    if (slot === 'weapon' && def.twoHanded && this.equip.shield) extra.push('shield');
    if (slot === 'shield' && this.equip.weapon && ITEMS[this.equip.weapon.id].twoHanded) extra.push('weapon');
    if (extra.length > this.freeSlots()) { this.message('Nie masz miejsca w plecaku.', 'warn'); return; }
    this.bag[i] = this.equip[slot];
    this.equip[slot] = s;
    for (const e of extra) {
      const free = this.bag.findIndex((b) => !b);
      this.bag[free] = this.equip[e];
      this.equip[e] = null;
    }
    this.afterEquipChange();
  }

  unequip(slot) {
    if (!SLOTS.includes(slot) || !this.equip[slot]) return;
    const it = this.equip[slot];
    if (ITEMS[it.id].stack) {
      if (!this.canAdd(it.id, it.n)) { this.message('Nie masz miejsca w plecaku.', 'warn'); return; }
      this.equip[slot] = null;
      this.addItem(it.id, it.n);
    } else {
      const free = this.bag.findIndex((b) => !b);
      if (free < 0) { this.message('Nie masz miejsca w plecaku.', 'warn'); return; }
      this.bag[free] = it;
      this.equip[slot] = null;
    }
    this.afterEquipChange();
  }

  afterEquipChange() {
    this.dirtyInv = true;
    const oldSpeed = this.baseSpeed;
    this.recalc();
    if (oldSpeed !== this.baseSpeed) this.world.broadcastCreature(this, { t: 'cu', id: this.id, sp: this.speed });
    this.onLookChanged();
  }

  onLookChanged() {
    this.world.broadcastCreature(this, { t: 'cu', id: this.id, look: this.look(), light: this.lightRadius() });
  }

  // -- messaging ---------------------------------------------------------------
  send(msg) { if (this.session) this.out.push(msg); }
  message(text, kind = 'info') { this.send({ t: 'msg', text, kind }); }

  flush() {
    if (this.dirtyStats) { this.out.push(this.selfState()); this.dirtyStats = false; }
    if (this.dirtyInv) { this.out.push(this.invState()); this.dirtyInv = false; }
    if (!this.session || this.out.length === 0) { this.out.length = 0; return; }
    this.session.sendRaw(JSON.stringify(this.out));
    this.out = [];
  }

  selfState() {
    const now = this.world.now;
    const skills = {};
    for (const sk of SKILLS) skills[sk] = [this.cachedLevels[sk], skillPercent(sk, this.skillTries[sk], this.vocation.factors[sk])];
    const c = this.conditions;
    return {
      t: 'self', hp: this.hp, maxHp: this.maxHp, mana: this.mana, maxMana: this.maxMana,
      level: this.level, exp: this.exp, expLvl: expForLevel(this.level), expNext: expForLevel(this.level + 1),
      mlvl: this.mlvl, mlvlPct: skillPercent('magic', this.manaSpent, this.vocation.factors.magic),
      skills, speed: this.speed, voc: this.voc, fed: this.fed,
      cond: { poison: !!c.poison, burn: !!c.burn, energy: !!c.energy, haste: !!c.haste, light: !!c.light, manashield: !!c.manashield },
      skull: this.skull(now), fight: this.inFight(now), pz: this.world.map.isPZ(this.x, this.y, this.z),
      fightMode: this.fightMode, chase: this.chase, armor: this.armorValue(), light: this.lightRadius(),
    };
  }

  invState() {
    const eq = {};
    for (const s of SLOTS) eq[s] = this.equip[s];
    return { t: 'inv', equip: eq, bag: this.bag, gold: this.gold };
  }

  look() {
    const eq = {};
    for (const s of ['weapon', 'shield', 'head', 'armor', 'legs', 'boots']) eq[s] = this.equip[s] ? ITEMS[this.equip[s].id].key : null;
    return { sex: this.sex, voc: this.voc, ...this.outfit, eq };
  }

  describe() {
    const d = super.describe();
    d.type = 'human';
    d.look = this.look();
    d.skull = this.skull();
    d.lvl = this.level;
    return d;
  }

  // -- periodic ------------------------------------------------------------------
  tick(now) {
    super.tick(now);
    if (this.dead) return;
    // chase the current target
    const t = this.target;
    if (t && this.chase && !this.portalAt) {
      const wp = this.weaponInfo();
      const dist = chebyshev(this.x, this.y, t.x, t.y);
      const inRange = wp.kind === 'melee' ? dist <= 1 : dist <= wp.range && this.world.map.lineOfSight(this.x, this.y, t.x, t.y, this.z);
      if (inRange) { if (this.goal && this.goal.creatureId === t.id) this.stopWalking(); }
      else if (!this.goal && now > (this.manualUntil || 0)) this.follow(t);
    }
    // finish a pending interaction once we are next to it
    if (this.pending && !this.goal && this.walkQueue.length === 0 && !this.isWalking(now)) {
      const p = this.pending;
      this.pending = null;
      if (chebyshev(this.x, this.y, p.x, p.y) <= 1 && this.z === p.z) this.world.doInteraction(this, p);
    }
  }

  onNoPath() { this.message('Nie ma tam drogi.', 'warn'); this.pending = null; }
  onBlocked() { this.message('Nie możesz tam przejść.', 'warn'); }

  onMoved() {
    this.dirtyStats = true;
    for (const [uid, pos] of this.openContainers) {
      if (pos.z !== this.z || chebyshev(this.x, this.y, pos.x, pos.y) > 1) {
        this.openContainers.delete(uid);
        this.send({ t: 'contClose', uid });
      }
    }
  }

  everySecond(now) {
    const voc = this.vocation;
    if (this.fed > 0) {
      this.fed--;
      const ring = this.equip.ring && ITEMS[this.equip.ring.id];
      const boost = ring && ring.regen ? ring.regen : 1;
      const cfg = this.world.config;
      let changed = false;
      if (this.fed % voc.secsPerHp === 0 && this.hp < this.maxHp) { this.hp = Math.min(this.maxHp, this.hp + cfg.rateHpRegen * boost); this.onHpChanged(); changed = true; }
      if (this.fed % voc.secsPerMana === 0 && this.mana < this.maxMana) { this.mana = Math.min(this.maxMana, this.mana + 2 * cfg.rateManaRegen * boost); changed = true; }
      if (changed || this.fed % 10 === 0) this.dirtyStats = true;
    }
    if (this.fightUntil && this.fightUntil <= now) {
      this.fightUntil = 0;
      this.dirtyStats = true;
      if (!this.session) this.world.logout(this, true);
    }
    if (this.whiteSkullUntil && this.whiteSkullUntil <= now) {
      this.whiteSkullUntil = 0;
      this.world.broadcastCreature(this, { t: 'cu', id: this.id, skull: this.skull(now) });
    }
  }

  // -- death ---------------------------------------------------------------------
  die(killer) {
    if (this.dead) return;
    const w = this.world, now = w.now;
    this.dead = true;
    const wasSkull = this.skull(now);
    w.effect(this.x, this.y, this.z, 'death');
    w.createCorpse(this, [], 0);
    // experience loss
    const pct = w.config.deathLossPercent * (wasSkull === 'red' ? 2 : 1);
    const loss = deathExpLoss(this.exp, pct);
    // PvP experience and frags
    let total = 0;
    for (const v of this.damageLog.values()) total += v;
    for (const [id, dmg] of this.damageLog) {
      const a = w.creatures.get(id);
      if (!a || a.kind !== 'player' || a === this) continue;
      const share = Math.floor((loss * dmg) / Math.max(1, total));
      const gain = pvpExp(share, this.level, a.level);
      if (gain > 0) a.addExp(gain);
    }
    const k = killer && killer.kind === 'player' && killer !== this ? killer : null;
    if (k) {
      if (!wasSkull) {
        k.frags.push(now);
        k.message(`Zabicie gracza ${this.name} było nieusprawiedliwione.`, 'warn');
        const day = k.frags.filter((t) => now - t < 864e5).length;
        if (day >= w.config.redSkullKills) k.setSkull('red', now);
      }
      w.broadcastWorld(`${this.name} (poz. ${this.level}) został zabity przez gracza ${k.name}.`);
    }
    this.stats.deaths++;
    this.loseExp(loss);
    this.send({ t: 'death', loss, by: killer ? killer.name : null });
    // respawn in the temple
    this.hp = this.maxHp; this.mana = this.maxMana;
    this.conditions = {};
    this.damageLog.clear();
    this.setTarget(0);
    this.stopWalking();
    this.pending = null;
    this.fightUntil = 0;
    this.whiteSkullUntil = 0;
    this.dead = false;
    const t = w.temple;
    w.teleport(this, t.x, t.y, t.z, 'teleport');
    this.onHpChanged();
    this.dirtyStats = true;
    w.storage.save(this.serialize());
  }

  serialize() {
    const eq = {};
    for (const s of SLOTS) eq[s] = toStored(this.equip[s]);
    return {
      ...this.rec,
      name: this.name, voc: this.voc, sex: this.sex, outfit: this.outfit,
      exp: this.exp, manaSpent: this.manaSpent, skillTries: this.skillTries,
      hp: this.hp, mana: this.mana, pos: { x: this.x, y: this.y, z: this.z },
      equip: eq, bag: this.bag.map(toStored), gold: this.gold, fed: this.fed,
      quests: this.quests, frags: this.frags, redSkullUntil: this.redSkullUntil, gm: this.gm,
      stats: this.stats, lastLogin: this.loginAt,
      playTime: (this.rec.playTime || 0) + Math.floor((Date.now() - this.loginAt) / 1000),
    };
  }
}

export function fromStored(s) {
  if (!s) return null;
  const def = ITEM_BY_KEY[s.k];
  if (!def) return null;
  return { id: def.id, n: Math.max(1, Math.min(STACK_MAX, s.n | 0)) };
}

export function toStored(s) {
  if (!s) return null;
  return { k: ITEMS[s.id].key, n: s.n };
}

export { itemName };
