// The authoritative game world: creatures, ground items, visibility,
// networking glue and the main tick loop.

import {
  MAP_W, MAP_H, Z_MIN, VIEW_RANGE, BEAT_MS, BAG_SIZE, SLOTS, G, O, OBJ, GROUND, DIR, DIR_DX,
  DIR_DY, VOCATIONS, OUTFIT_COLORS, SKIN_COLORS, PROTOCOL_VERSION, GAME_NAME,
} from '../shared/constants.js';
import { chebyshev, stepDuration, expForLevel } from '../shared/formulas.js';
import { ITEMS, ITEM_BY_KEY, GOLD_ID, describeItem, itemName } from '../shared/items.js';
import { generateWorld } from './mapgen.js';
import { MONSTERS } from './data/monsters.js';
import { NPCS } from './data/npcs.js';
import { spellsFor } from './data/spells.js';
import { Player } from './player.js';
import { Monster } from './monster.js';
import { NPC } from './npc.js';
import { Storage, normalizeName } from './storage.js';
import { tryCastSpell } from './spells.js';
import { applyDamage, rand } from './combat.js';

const HEAR_RANGE = 12;
const MAX_TILE_ITEMS = 12;
const VOC_NAME = { knight: 'rycerz', paladin: 'paladyn', sorcerer: 'czarnoksiężnik', druid: 'druid' };

function int(v, min, max) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max) return null;
  return v;
}

class Spawn {
  constructor(world, def) {
    this.world = world;
    this.def = def;
    this.alive = new Set();
    this.queue = [];
  }

  init() {
    for (let i = 0; i < this.def.count; i++) if (!this.spawnOne()) this.queue.push(this.world.now + 5000);
  }

  spawnOne() {
    const w = this.world, d = this.def, mdef = MONSTERS[d.type];
    for (let tries = 0; tries < 40; tries++) {
      const x = d.x + rand(-d.radius, d.radius), y = d.y + rand(-d.radius, d.radius);
      if (!w.map.walkable(x, y, d.z) || w.map.isPZ(x, y, d.z) || w.map.portalAt(x, y, d.z)) continue;
      if (GROUND[w.map.ground(x, y, d.z)].damage) continue;
      if (w.creaturesAt(x, y, d.z).length) continue;
      if (w.nearestPlayer(x, y, d.z, 3)) continue;
      const m = new Monster(w, mdef, this, x, y, d.z);
      w.addCreature(m);
      this.alive.add(m.id);
      return true;
    }
    return false;
  }

  onDeath(m) {
    this.alive.delete(m.id);
    this.queue.push(this.world.now + (this.def.respawn * 1000) / Math.max(0.1, this.world.config.rateSpawn));
  }

  tick(now) {
    if (!this.queue.length) return;
    this.queue.sort((a, b) => a - b);
    while (this.queue.length && this.queue[0] <= now) {
      this.queue.shift();
      if (!this.spawnOne()) this.queue.push(now + 5000);
    }
  }
}

export class World {
  constructor(config) {
    this.config = config;
    this.storage = new Storage(config.dataDir);
    this.now = Date.now();
    this.startedAt = this.now;
    this.nextId = 1;
    this.nextUid = 1;
    const gen = generateWorld(config.seed);
    this.map = gen.map;
    this.temple = gen.temple;
    this.mapBuffer = this.map.encode();
    this.questChests = new Map(gen.questChests.map((q) => [`${q.x},${q.y},${q.z}`, q]));
    this.creatures = new Map();
    this.players = new Map();
    this.byName = new Map();
    this.cells = new Map();
    this.ground = new Map();       // tileKey -> items[]
    this.groundCells = new Map();  // cellKey -> Set(tileKey)
    this.uidIndex = new Map();     // uid -> tileKey
    this.peak = 0;
    this.dayLen = config.dayLengthMin * 60000;
    this.dayStart = this.now - Math.floor(this.dayLen * 0.3);
    for (const def of NPCS) {
      const spot = gen.npcSpots[def.key];
      if (spot) this.addCreature(new NPC(this, def, spot));
    }
    this.spawns = gen.spawns.filter((s) => MONSTERS[s.type]).map((s) => new Spawn(this, s));
    for (const s of this.spawns) s.init();
    this.nextSecond = 0;
    this.nextSave = this.now + config.autosaveSec * 1000;
    this.nextTimeSync = this.now + 60000;
  }

  // -- spatial index ------------------------------------------------------------------
  cellKey(x, y, z) { return (z - Z_MIN) * 10000 + (y >> 3) * 100 + (x >> 3); }
  tileKey(x, y, z) { return ((z - Z_MIN) * MAP_H + y) * MAP_W + x; }
  tilePos(k) {
    const x = k % MAP_W, r = (k - x) / MAP_W, y = r % MAP_H;
    return { x, y, z: (r - y) / MAP_H + Z_MIN };
  }

  addToCell(c) {
    const k = this.cellKey(c.x, c.y, c.z);
    let s = this.cells.get(k);
    if (!s) this.cells.set(k, (s = new Set()));
    s.add(c);
    c.cell = k;
  }

  removeFromCell(c) {
    const s = this.cells.get(c.cell);
    if (s) { s.delete(c); if (!s.size) this.cells.delete(c.cell); }
    c.cell = -1;
  }

  *creaturesNear(x, y, z, r) {
    const x0 = Math.max(0, x - r) >> 3, x1 = Math.min(MAP_W - 1, x + r) >> 3;
    const y0 = Math.max(0, y - r) >> 3, y1 = Math.min(MAP_H - 1, y + r) >> 3;
    const zb = (z - Z_MIN) * 10000;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const s = this.cells.get(zb + cy * 100 + cx);
      if (!s) continue;
      for (const c of s) if (Math.abs(c.x - x) <= r && Math.abs(c.y - y) <= r) yield c;
    }
  }

  creaturesAt(x, y, z) {
    const s = this.cells.get(this.cellKey(x, y, z));
    if (!s) return [];
    const out = [];
    for (const c of s) if (c.x === x && c.y === y && c.z === z) out.push(c);
    return out;
  }

  nearestPlayer(x, y, z, r, filter) {
    let best = null, bd = Infinity;
    for (const p of this.players.values()) {
      if (p.z !== z || p.dead) continue;
      const d = chebyshev(x, y, p.x, p.y);
      if (d > r || d >= bd) continue;
      if (filter && !filter(p)) continue;
      best = p; bd = d;
    }
    return best;
  }

  *playersNear(x, y, z, r) {
    for (const p of this.players.values()) {
      if (p.z === z && Math.abs(p.x - x) <= r && Math.abs(p.y - y) <= r) yield p;
    }
  }

  // -- movement --------------------------------------------------------------------
  canEnter(c, x, y, z) {
    const m = this.map;
    if (!m.walkable(x, y, z)) return false;
    const pz = m.isPZ(x, y, z);
    if (c.kind === 'monster') {
      if (pz || m.portalAt(x, y, z)) return false;
      const g = GROUND[m.ground(x, y, z)];
      if (g.damage && !c.immune.includes(g.damage)) return false;
    } else if (c.kind === 'npc' && m.portalAt(x, y, z)) return false;
    for (const o of this.creaturesAt(x, y, z)) {
      if (o === c || o.dead) continue;
      if (c.kind === 'player' && o.kind === 'player' && pz) continue;
      return false;
    }
    return true;
  }

  passableForPath(c, x, y, z) { return this.canEnter(c, x, y, z); }

  moveCreature(c, dir, now) {
    const nx = c.x + DIR_DX[dir], ny = c.y + DIR_DY[dir], z = c.z;
    if (!c.canStepTo(nx, ny, z)) {
      if (dir < 4 && c.dir !== dir && c.kind === 'player') { c.dir = dir; this.broadcastCreature(c, { t: 'turn', id: c.id, d: dir }); }
      return false;
    }
    const diagonal = dir >= 4;
    const dur = stepDuration(this.map.groundCost(nx, ny, z), c.speed, diagonal, BEAT_MS);
    const fx = c.x, fy = c.y;
    this.removeFromCell(c);
    c.x = nx; c.y = ny;
    this.addToCell(c);
    c.dir = dir < 4 ? dir : (DIR_DX[dir] > 0 ? DIR.E : DIR.W);
    c.step = { fx, fy, start: now, dur };
    c.nextWalkAt = now + dur;
    this.broadcastCreature(c, { t: 'mv', id: c.id, x: nx, y: ny, z, d: c.dir, dur });
    c.onMoved();
    const portal = this.map.portalAt(nx, ny, z);
    if (portal) { c.portalAt = now + dur; c.portalDest = portal; }
    const g = GROUND[this.map.ground(nx, ny, z)];
    if (g.damage === 'fire' && c.kind === 'player') {
      applyDamage(this, c, null, rand(20, 40), 'fire', { periodic: true });
      if (!c.dead) c.addCondition('burn', { ticks: 3, dmg: 10, src: 0 });
    }
    return true;
  }

  teleport(c, x, y, z, effect) {
    const free = this.findFreeTile(c, x, y, z);
    if (free) ({ x, y, z } = free);
    if (effect) this.effect(c.x, c.y, c.z, 'poff');
    this.removeFromCell(c);
    c.x = x; c.y = y; c.z = z;
    this.addToCell(c);
    c.step = null;
    c.walkQueue = [];
    if (c.goal && !c.goal.creatureId) c.goal = null;
    c.nextWalkAt = this.now + 150;
    this.broadcastCreature(c, { t: 'tp', id: c.id, x, y, z, d: c.dir });
    if (effect) this.effect(x, y, z, effect);
    c.onMoved();
  }

  findFreeTile(c, x, y, z) {
    if (this.canEnter(c, x, y, z)) return { x, y, z };
    for (let r = 1; r <= 3; r++) {
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (this.canEnter(c, x + dx, y + dy, z) && !this.map.portalAt(x + dx, y + dy, z)) return { x: x + dx, y: y + dy, z };
      }
    }
    return null;
  }

  // -- broadcasting ----------------------------------------------------------------
  broadcastCreature(c, msg) {
    if (c.kind === 'player') c.send(msg);
    for (const p of this.playersNear(c.x, c.y, c.z, VIEW_RANGE + 2)) if (p !== c && p.known.has(c.id)) p.send(msg);
  }

  broadcastNear(x, y, z, msg, r = VIEW_RANGE + 1) {
    for (const p of this.playersNear(x, y, z, r)) p.send(msg);
  }

  broadcastWorld(text, kind = 'event') {
    for (const p of this.players.values()) p.message(text, kind);
  }

  effect(x, y, z, e) { this.broadcastNear(x, y, z, { t: 'fx', x, y, z, e }); }
  missile(a, b, m) { this.broadcastNear(a.x, a.y, a.z, { t: 'mis', fx: a.x, fy: a.y, tx: b.x, ty: b.y, z: a.z, m }); }
  floatText(x, y, z, text, kind) { this.broadcastNear(x, y, z, { t: 'num', x, y, z, v: text, k: kind }); }

  say(c, text, mode = 'say', to = 0) {
    const msg = { t: 'say', id: c.id, name: c.name, text, mode, x: c.x, y: c.y, z: c.z };
    if (to) msg.to = to;
    if (c.kind === 'player') msg.lvl = c.level;
    this.broadcastNear(c.x, c.y, c.z, msg, HEAR_RANGE);
  }

  // -- lifecycle -------------------------------------------------------------------
  addCreature(c) {
    this.creatures.set(c.id, c);
    this.addToCell(c);
    if (c.kind === 'player') {
      this.players.set(c.id, c);
      this.byName.set(c.name.toLowerCase(), c);
      this.peak = Math.max(this.peak, this.players.size);
    }
  }

  removeCreature(c) {
    this.creatures.delete(c.id);
    this.removeFromCell(c);
    if (c.kind === 'player') {
      this.players.delete(c.id);
      if (this.byName.get(c.name.toLowerCase()) === c) this.byName.delete(c.name.toLowerCase());
    }
  }

  summonMonster(type, master) {
    const def = MONSTERS[type];
    if (!def) return null;
    const probe = { kind: 'monster', immune: def.immune };
    for (let d = 0; d < 8; d++) {
      const x = master.x + DIR_DX[d], y = master.y + DIR_DY[d];
      if (!this.canEnter(probe, x, y, master.z)) continue;
      const m = new Monster(this, def, null, x, y, master.z, master.id || 0);
      this.addCreature(m);
      this.effect(x, y, master.z, 'teleport');
      return m;
    }
    return null;
  }

  canPvp(a, t) {
    const cfg = this.config;
    if (!cfg.pvp) return { ok: false, reason: 'Na tym świecie walka między graczami jest wyłączona.' };
    if (a.level < cfg.protectionLevel) return { ok: false, reason: `Musisz mieć co najmniej poziom ${cfg.protectionLevel}, by atakować graczy.` };
    if (t.level < cfg.protectionLevel) return { ok: false, reason: `Ten gracz jest chroniony do poziomu ${cfg.protectionLevel}.` };
    if (this.map.isPZ(a.x, a.y, a.z) || this.map.isPZ(t.x, t.y, t.z)) return { ok: false, reason: 'Nie możesz walczyć w strefie ochronnej.' };
    return { ok: true };
  }

  // -- ground items ----------------------------------------------------------------
  tileItems(x, y, z) { return this.ground.get(this.tileKey(x, y, z)) || []; }

  addGroundItem(x, y, z, item) {
    const k = this.tileKey(x, y, z);
    let list = this.ground.get(k);
    if (!list) {
      this.ground.set(k, (list = []));
      const ck = this.cellKey(x, y, z);
      let s = this.groundCells.get(ck);
      if (!s) this.groundCells.set(ck, (s = new Set()));
      s.add(k);
    }
    // merge stackables
    if (!item.corpse && ITEMS[item.id].stack) {
      const top = list[list.length - 1];
      if (top && !top.corpse && top.id === item.id && top.n + item.n <= 100) { top.n += item.n; top.at = this.now; this.tileChanged(x, y, z); return top; }
    }
    item.uid = this.nextUid++;
    item.at = this.now;
    list.push(item);
    this.uidIndex.set(item.uid, k);
    while (list.length > MAX_TILE_ITEMS) this.dropGroundItem(k, list[0]);
    this.tileChanged(x, y, z);
    return item;
  }

  dropGroundItem(k, item) {
    const list = this.ground.get(k);
    if (!list) return;
    const i = list.indexOf(item);
    if (i < 0) return;
    list.splice(i, 1);
    this.uidIndex.delete(item.uid);
    if (item.corpse) for (const p of this.players.values()) if (p.openContainers.delete(item.uid)) p.send({ t: 'contClose', uid: item.uid });
    if (!list.length) {
      this.ground.delete(k);
      const pos = this.tilePos(k);
      const ck = this.cellKey(pos.x, pos.y, pos.z);
      const s = this.groundCells.get(ck);
      if (s) { s.delete(k); if (!s.size) this.groundCells.delete(ck); }
    }
    const pos = this.tilePos(k);
    this.tileChanged(pos.x, pos.y, pos.z);
  }

  findByUid(uid) {
    const k = this.uidIndex.get(uid);
    if (k === undefined) return null;
    const item = (this.ground.get(k) || []).find((i) => i.uid === uid);
    return item ? { item, key: k, pos: this.tilePos(k) } : null;
  }

  serializeItems(list) {
    return list.map((it) => it.corpse
      ? { u: it.uid, c: it.ctype, name: it.name, look: it.look, e: it.items.length === 0 ? 1 : 0 }
      : { u: it.uid, id: it.id, n: it.n });
  }

  tileChanged(x, y, z) {
    const ck = this.cellKey(x, y, z);
    const msg = { t: 'tile', x, y, z, items: this.serializeItems(this.tileItems(x, y, z)) };
    for (const p of this.players.values()) if (p.knownChunks.has(ck)) p.send(msg);
  }

  createCorpse(c, items, ownerId) {
    const corpse = {
      corpse: true, ctype: c.kind === 'player' ? 'human' : c.def.key, name: c.name,
      look: c.kind === 'player' ? c.look() : (c.def?.human ? { ...c.def.human, sex: 'm' } : undefined),
      items, ownerId, ownerUntil: this.now + 10000,
      decayAt: this.now + (c.def?.boss ? 300 : c.kind === 'player' ? 180 : 100) * 1000,
    };
    this.addGroundItem(c.x, c.y, c.z, corpse);
  }

  decayGround(now) {
    for (const [k, list] of this.ground) {
      for (const it of [...list]) {
        if (it.corpse ? it.decayAt <= now : now - it.at > 15 * 60000) this.dropGroundItem(k, it);
      }
    }
  }

  refreshContainer(item) {
    for (const p of this.players.values()) {
      if (p.openContainers.has(item.uid)) p.send({ t: 'cont', uid: item.uid, name: `Zwłoki: ${item.name}`, items: item.items });
    }
  }

  // -- visibility -------------------------------------------------------------------
  updateView(p) {
    if (!p.session) return;
    const seen = new Set();
    for (const c of this.creaturesNear(p.x, p.y, p.z, VIEW_RANGE)) {
      if (c.dead) continue;
      seen.add(c.id);
      if (!p.known.has(c.id)) { p.known.add(c.id); p.send({ t: 'cr+', c: c.describe() }); }
    }
    for (const id of p.known) if (!seen.has(id)) { p.known.delete(id); p.send({ t: 'cr-', id }); }
    const r = VIEW_RANGE + 3;
    const need = new Set();
    const x0 = Math.max(0, p.x - r) >> 3, x1 = Math.min(MAP_W - 1, p.x + r) >> 3;
    const y0 = Math.max(0, p.y - r) >> 3, y1 = Math.min(MAP_H - 1, p.y + r) >> 3;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      const ck = (p.z - Z_MIN) * 10000 + cy * 100 + cx;
      need.add(ck);
      if (p.knownChunks.has(ck)) continue;
      const tiles = [];
      for (const k of this.groundCells.get(ck) || []) {
        const pos = this.tilePos(k);
        tiles.push([pos.x, pos.y, this.serializeItems(this.ground.get(k))]);
      }
      p.send({ t: 'gi', z: p.z, cx, cy, tiles });
    }
    p.knownChunks = need;
  }

  // -- networking -------------------------------------------------------------------
  welcome(p) {
    p.known.clear();
    p.knownChunks.clear();
    p.send({
      t: 'welcome', id: p.id, proto: PROTOCOL_VERSION, game: GAME_NAME, world: this.config.worldName,
      motd: this.config.motd, time: { start: this.dayStart, len: this.dayLen, now: Date.now() },
      spells: spellsFor(p.voc), gm: p.gm, temple: this.temple,
    });
    p.dirtyStats = true;
    p.dirtyInv = true;
    p.message(this.config.motd, 'event');
    if (this.config.gms.includes(p.name)) p.gm = true;
  }

  login(session, msg) {
    const name = normalizeName(msg.name);
    if (!name || typeof msg.pass !== 'string') return session.sendNow({ t: 'err', text: 'Podaj poprawną nazwę postaci i hasło.' });
    const rec = this.storage.load(name);
    if (!rec || !Storage.verifyPassword(msg.pass, rec.salt, rec.hash)) {
      return session.sendNow({ t: 'err', text: 'Nieprawidłowa nazwa postaci lub hasło.' });
    }
    const existing = this.byName.get(name.toLowerCase());
    if (existing) {
      if (existing.session) existing.session.kick('Zalogowano się na tę postać z innego miejsca.');
      existing.session = session;
      session.player = existing;
      existing.out = [];
      this.welcome(existing);
      return;
    }
    if (this.players.size >= this.config.maxPlayers) return session.sendNow({ t: 'err', text: 'Świat jest pełny. Spróbuj później.' });
    const p = new Player(this, rec, session);
    session.player = p;
    let pos = rec.pos && this.map.inBounds(rec.pos.x, rec.pos.y, rec.pos.z) ? rec.pos : this.temple;
    const free = this.findFreeTile(p, pos.x, pos.y, pos.z) || this.findFreeTile(p, this.temple.x, this.temple.y, this.temple.z) || this.temple;
    p.x = free.x; p.y = free.y; p.z = free.z;
    this.addCreature(p);
    this.welcome(p);
    this.effect(p.x, p.y, p.z, 'teleport');
    console.log(`[login] ${p.name} (${this.players.size} online)`);
  }

  create(session, msg) {
    const name = normalizeName(msg.name);
    if (!name) return session.sendNow({ t: 'err', text: 'Nazwa musi mieć 3-20 liter (dozwolone spacje, max. 3 słowa).' });
    if (typeof msg.pass !== 'string' || msg.pass.length < 4 || msg.pass.length > 64) return session.sendNow({ t: 'err', text: 'Hasło musi mieć od 4 do 64 znaków.' });
    if (!VOCATIONS[msg.voc]) return session.sendNow({ t: 'err', text: 'Wybierz profesję.' });
    const lower = name.toLowerCase();
    const reserved = NPCS.some((n) => n.name.toLowerCase() === lower || n.name.toLowerCase().split(' ').includes(lower))
      || Object.values(MONSTERS).some((m) => m.name.toLowerCase() === lower) || /^(gm|admin|god|cm) /i.test(name);
    if (reserved || this.storage.exists(name)) return session.sendNow({ t: 'err', text: 'Ta nazwa jest już zajęta.' });
    const o = msg.outfit || {};
    const col = (v, d) => (int(v, 0, OUTFIT_COLORS.length - 1) ?? d);
    const outfit = { skin: int(o.skin, 0, SKIN_COLORS.length - 1) ?? 0, head: col(o.head, 6), body: col(o.body, 9), legs: col(o.legs, 17), feet: col(o.feet, 7) };
    const { salt, hash } = Storage.hashPassword(msg.pass);
    const kit = starterKit(msg.voc);
    const rec = {
      name, salt, hash, voc: msg.voc, sex: msg.sex === 'f' ? 'f' : 'm', outfit, created: Date.now(),
      exp: 0, manaSpent: 0, skillTries: {}, pos: this.temple, gold: 30, fed: 600,
      equip: kit.equip, bag: kit.bag, quests: {}, stats: {}, gm: this.config.gms.includes(name),
    };
    this.storage.saveSync(rec);
    console.log(`[create] ${name} (${msg.voc})`);
    this.login(session, { name, pass: msg.pass });
  }

  logout(p, force = false) {
    if (!force && p.inFight()) { p.message('Nie możesz się wylogować w trakcie walki.', 'warn'); return false; }
    this.storage.save(p.serialize());
    this.effect(p.x, p.y, p.z, 'poff');
    this.removeCreature(p);
    p.dead = true;
    if (p.session) {
      p.send({ t: 'logout' });
      p.flush();
      p.session.player = null;
      p.session = null;
    }
    console.log(`[logout] ${p.name} (${this.players.size} online)`);
    return true;
  }

  disconnected(session) {
    const p = session.player;
    if (!p || p.session !== session) return;
    p.session = null;
    session.player = null;
    if (!p.inFight()) this.logout(p, true);
  }

  handle(session, msg) {
    if (!msg || typeof msg.t !== 'string') return;
    if (msg.t === 'ping') { session.sendNow({ t: 'pong', ts: msg.ts }); return; }
    const p = session.player;
    if (!p) {
      if (msg.t === 'login') this.login(session, msg);
      else if (msg.t === 'create') this.create(session, msg);
      return;
    }
    if (p.dead) return;
    const now = this.now;
    switch (msg.t) {
      case 'step': {
        const d = int(msg.d, 0, 7);
        if (d === null) return;
        p.goal = null; p.pending = null;
        p.manualUntil = now + 1500;
        if (p.walkQueue.length < 2) p.walkQueue.push(d);
        break;
      }
      case 'turn': {
        const d = int(msg.d, 0, 3);
        if (d === null || p.dir === d) return;
        p.dir = d;
        this.broadcastCreature(p, { t: 'turn', id: p.id, d });
        break;
      }
      case 'goto': {
        const x = int(msg.x, 0, MAP_W - 1), y = int(msg.y, 0, MAP_H - 1);
        if (x === null || y === null) return;
        p.pending = null;
        p.walkTo(x, y, !this.map.walkable(x, y, p.z));
        break;
      }
      case 'stop': p.stopWalking(); p.pending = null; break;
      case 'attack': {
        const id = int(msg.id, 0, 2 ** 31);
        if (id === null) return;
        if (id === 0) { p.setTarget(0); return; }
        const t = this.creatures.get(id);
        if (!t || t === p || t.kind === 'npc' || t.z !== p.z || chebyshev(p.x, p.y, t.x, t.y) > VIEW_RANGE) return;
        if (t.kind === 'player') { const ok = this.canPvp(p, t); if (!ok.ok) { p.message(ok.reason, 'warn'); p.send({ t: 'target', id: 0 }); return; } }
        if (this.map.isPZ(p.x, p.y, p.z)) { p.message('Nie możesz walczyć w strefie ochronnej.', 'warn'); p.send({ t: 'target', id: 0 }); return; }
        p.setTarget(id);
        if (p.chase) p.follow(t);
        break;
      }
      case 'follow': {
        const t = this.creatures.get(int(msg.id, 1, 2 ** 31));
        if (t && t !== p && t.z === p.z) { p.setTarget(0); p.follow(t); }
        break;
      }
      case 'mode': {
        const f = int(msg.fight, 1, 3);
        if (f !== null) p.fightMode = f;
        if (typeof msg.chase === 'boolean') p.chase = msg.chase;
        p.dirtyStats = true;
        break;
      }
      case 'say': {
        if (typeof msg.text !== 'string') return;
        this.handleSay(p, msg.text.slice(0, 255), msg.ch === 'world' ? 'world' : 'local');
        break;
      }
      case 'use': case 'open': case 'pickup': {
        const x = int(msg.x, 0, MAP_W - 1), y = int(msg.y, 0, MAP_H - 1), z = int(msg.z, Z_MIN, 0);
        if (x === null || y === null || z === null || z !== p.z) return;
        const act = { type: msg.t, x, y, z };
        if (chebyshev(p.x, p.y, x, y) <= 1) this.doInteraction(p, act);
        else { p.pending = act; p.walkTo(x, y, true); }
        break;
      }
      case 'take': {
        const uid = int(msg.uid, 1, 2 ** 40), idx = int(msg.idx, -1, 64);
        if (uid === null || idx === null) return;
        this.takeFromCorpse(p, uid, idx);
        break;
      }
      case 'closeCont': {
        const uid = int(msg.uid, 1, 2 ** 40);
        if (uid !== null) p.openContainers.delete(uid);
        break;
      }
      case 'useItem': {
        const i = int(msg.slot, 0, BAG_SIZE - 1);
        if (i !== null) p.useBag(i);
        break;
      }
      case 'unequip':
        if (SLOTS.includes(msg.slot)) p.unequip(msg.slot);
        break;
      case 'drop': {
        const i = int(msg.slot, 0, BAG_SIZE - 1);
        if (i === null || !p.bag[i]) return;
        const s = p.bag[i];
        const n = Math.min(s.n, int(msg.n, 1, 100) ?? s.n);
        p.consumeBag(i, n);
        this.addGroundItem(p.x, p.y, p.z, { id: s.id, n });
        p.message(`Wyrzucasz: ${itemName(s.id, n)}.`, 'info');
        break;
      }
      case 'buy': case 'sell': this.trade(p, msg); break;
      case 'look': this.look(p, msg); break;
      case 'logout': this.logout(p); break;
      default: break;
    }
  }

  doInteraction(p, act) {
    const { x, y, z } = act;
    const items = this.tileItems(x, y, z);
    if (act.type === 'pickup') {
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        if (it.corpse) continue;
        if (!p.addItem(it.id, it.n)) { p.message('Nie masz miejsca w plecaku.', 'warn'); return; }
        this.dropGroundItem(this.tileKey(x, y, z), it);
        p.message(`Podnosisz: ${itemName(it.id, it.n)}.`, 'loot');
        return;
      }
      p.message('Nie ma tu nic do podniesienia.', 'info');
      return;
    }
    // open the top corpse
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it.corpse) continue;
      if (it.ownerId && it.ownerId !== p.id && this.now < it.ownerUntil && this.creatures.has(it.ownerId)) {
        p.message('Nie jesteś jeszcze właścicielem tego łupu.', 'warn');
        return;
      }
      p.openContainers.set(it.uid, { x, y, z });
      p.send({ t: 'cont', uid: it.uid, name: `Zwłoki: ${it.name}`, items: it.items });
      return;
    }
    if (act.type === 'open') { if (items.length) this.doInteraction(p, { ...act, type: 'pickup' }); return; }
    const o = this.map.obj(x, y, z);
    if (o === O.QUEST_CHEST) { this.openQuestChest(p, x, y, z); return; }
    if (o === O.SIGN) { p.message(`Napis: „${this.map.signs.get(`${x},${y},${z}`) || '...'}”`, 'look'); return; }
    if (o === O.WELL) { p.message('Woda w studni jest zimna i czysta.', 'look'); return; }
    if (o === O.CHEST || o === O.CRATE || o === O.BARREL) { p.message('Jest pusta.', 'look'); return; }
    if (items.length) { this.doInteraction(p, { ...act, type: 'pickup' }); return; }
    p.message(`Widzisz: ${OBJ[o]?.name || GROUND[this.map.ground(x, y, z)].name}.`, 'look');
  }

  openQuestChest(p, x, y, z) {
    const q = this.questChests.get(`${x},${y},${z}`);
    if (!q) return;
    if (p.quests[q.quest]) { p.message('Kufer jest pusty.', 'look'); return; }
    if (p.level < q.need) { p.message(`Kufer ani drgnie. (wymagany poziom ${q.need})`, 'warn'); return; }
    const it = ITEM_BY_KEY[q.reward.id];
    if (!p.addItem(it.id, q.reward.n)) { p.message('Nie masz miejsca w plecaku.', 'warn'); return; }
    p.quests[q.quest] = Date.now();
    p.message(q.text, 'event');
    p.message(`Otrzymujesz: ${it.name}.`, 'loot');
    this.effect(x, y, z, 'sparkle');
    this.storage.save(p.serialize());
  }

  takeFromCorpse(p, uid, idx) {
    const found = this.findByUid(uid);
    if (!found || !found.item.corpse || !p.openContainers.has(uid)) return;
    const { item, pos } = found;
    if (pos.z !== p.z || chebyshev(p.x, p.y, pos.x, pos.y) > 1) return;
    const take = idx === -1 ? [...item.items.keys()].reverse() : [idx];
    let got = 0, full = false;
    for (const i of take) {
      const it = item.items[i];
      if (!it) continue;
      if (!p.addItem(it.id, it.n)) { full = true; continue; }
      item.items.splice(i, 1);
      p.message(`Zbierasz: ${itemName(it.id, it.n)}.`, 'loot');
      got++;
    }
    if (full) p.message('Nie masz miejsca w plecaku.', 'warn');
    if (got) { this.refreshContainer(item); this.tileChanged(pos.x, pos.y, pos.z); }
  }

  trade(p, msg) {
    const npc = this.creatures.get(int(msg.npc, 1, 2 ** 31));
    if (!npc || npc.kind !== 'npc' || !npc.inTradeRange(p)) { p.message('Jesteś za daleko od handlarza.', 'warn'); return; }
    const id = int(msg.id, 1, ITEMS.length - 1);
    const n = int(msg.n, 1, 100);
    if (id === null || n === null) return;
    const def = ITEMS[id];
    if (msg.t === 'buy') {
      const e = npc.buy.find((b) => b.id === id);
      if (!e) return;
      const cost = e.price * n;
      if (p.gold < cost) { p.message(`Potrzebujesz ${cost} złota.`, 'warn'); return; }
      if (!p.canAdd(id, n)) { p.message('Nie masz miejsca w plecaku.', 'warn'); return; }
      p.gold -= cost;
      p.addItem(id, n);
      p.message(`Kupujesz ${itemName(id, n)} za ${cost} złota.`, 'loot');
    } else {
      const e = npc.sell.find((b) => b.id === id);
      if (!e) return;
      if (p.countItem(id) < n) { p.message(`Nie masz tylu: ${def.name}.`, 'warn'); return; }
      p.removeItems(id, n);
      p.gold += e.price * n;
      p.message(`Sprzedajesz ${itemName(id, n)} za ${e.price * n} złota.`, 'loot');
    }
    p.dirtyInv = true;
  }

  look(p, msg) {
    if (msg.id) {
      const c = this.creatures.get(int(msg.id, 1, 2 ** 31));
      if (!c || c.z !== p.z || chebyshev(c.x, c.y, p.x, p.y) > VIEW_RANGE) return;
      if (c.kind === 'player') {
        const sk = c.skull();
        p.message(`Widzisz ${c === p ? 'siebie' : c.name} (poziom ${c.level}, ${VOC_NAME[c.voc]}).${sk ? ` [czaszka: ${sk === 'red' ? 'czerwona' : 'biała'}]` : ''}`, 'look');
      } else p.message(`Widzisz: ${c.name}.`, 'look');
      return;
    }
    const x = int(msg.x, 0, MAP_W - 1), y = int(msg.y, 0, MAP_H - 1), z = int(msg.z, Z_MIN, 0);
    if (x === null || y === null || z === null) return;
    const items = this.tileItems(x, y, z);
    const top = items[items.length - 1];
    if (top) {
      if (top.corpse) p.message(`Widzisz zwłoki: ${top.name}.${top.items.length ? '' : ' Są puste.'}`, 'look');
      else p.message(`Widzisz: ${describeItem(top.id, top.n)}`, 'look');
      return;
    }
    const o = this.map.obj(x, y, z);
    if (o === O.SIGN) { p.message(`Napis: „${this.map.signs.get(`${x},${y},${z}`) || '...'}”`, 'look'); return; }
    if (o) { p.message(`Widzisz: ${OBJ[o].name}.`, 'look'); return; }
    p.message(`Widzisz: ${GROUND[this.map.ground(x, y, z)].name}.`, 'look');
  }

  // -- chat ---------------------------------------------------------------------------
  handleSay(p, raw, ch) {
    const text = raw.replace(/[\u0000-\u001f]/g, '').trim();
    if (!text) return;
    const now = this.now;
    if (now < p.mutedUntil) { p.message('Mówisz za szybko. Odczekaj chwilę.', 'warn'); return; }
    p.chatTimes.push(now);
    p.chatTimes = p.chatTimes.filter((t) => now - t < 4000);
    if (p.chatTimes.length > 6) { p.mutedUntil = now + 10000; p.message('Mówisz za szybko. Zostałeś wyciszony na 10 sekund.', 'warn'); return; }
    if (text.startsWith('/')) { this.command(p, text); return; }
    if (ch === 'world') {
      if (p.level < 2 && !p.gm) { p.message('Na kanale Świat mogą pisać postacie od poziomu 2.', 'warn'); return; }
      for (const o of this.players.values()) o.send({ t: 'say', ch: 'world', id: p.id, name: p.name, lvl: p.level, text, mode: 'world' });
      return;
    }
    if (tryCastSpell(this, p, text)) return;
    this.say(p, text, 'say');
    for (const c of this.creaturesNear(p.x, p.y, p.z, 5)) if (c.kind === 'npc') c.hear(p, text);
  }

  command(p, text) {
    const [cmd, ...rest] = text.slice(1).split(' ');
    const arg = rest.join(' ').trim();
    const c = cmd.toLowerCase();
    if (c === 'pomoc' || c === 'help') {
      p.message('Komendy: /online, /w <imię>, <tekst> (prywatna wiadomość), /czas, /wyloguj. Zaklęcia: wpisz słowa zaklęcia (np. "sana"). Rozmowa z NPC: "witaj".', 'info');
      if (p.gm) p.message('GM: /tp x y z, /idz <imię>, /m <potwór> [n], /i <przedmiot> [n], /lvl <n>, /lecz, /ogloszenie <tekst>, /kick <imię>, /god', 'info');
      return;
    }
    if (c === 'online' || c === 'kto') {
      const list = [...this.players.values()].map((o) => `${o.name} (${o.level})`).join(', ');
      p.message(`Graczy online: ${this.players.size}. ${list}`, 'info');
      return;
    }
    if (c === 'czas') {
      const phase = (((Date.now() - this.dayStart) % this.dayLen) + this.dayLen) % this.dayLen / this.dayLen;
      const mins = Math.floor(phase * 1440);
      p.message(`Na Fibuli jest godzina ${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}.`, 'info');
      return;
    }
    if (c === 'wyloguj' || c === 'logout') { this.logout(p); return; }
    if (c === 'w' || c === 'pw' || c === 'msg') {
      const i = arg.indexOf(',');
      if (i < 1) { p.message('Użycie: /w Imię, wiadomość', 'warn'); return; }
      const target = this.byName.get(arg.slice(0, i).trim().toLowerCase());
      const body = arg.slice(i + 1).trim();
      if (!target || !target.session) { p.message('Ten gracz nie jest zalogowany.', 'warn'); return; }
      if (!body) return;
      target.send({ t: 'say', ch: 'pm', id: p.id, name: p.name, lvl: p.level, text: body, mode: 'pm' });
      p.send({ t: 'say', ch: 'pm', id: p.id, name: `do ${target.name}`, text: body, mode: 'pm' });
      return;
    }
    if (!p.gm) { p.message('Nieznana komenda. Wpisz /pomoc.', 'warn'); return; }
    const nums = arg.split(/\s+/).map(Number);
    switch (c) {
      case 'tp': {
        const [x, y, z = p.z] = nums;
        if (this.map.inBounds(x, y, z)) this.teleport(p, x, y, z, 'teleport');
        break;
      }
      case 'idz': {
        const t = this.byName.get(arg.toLowerCase());
        if (t) this.teleport(p, t.x, t.y + 1, t.z, 'teleport');
        break;
      }
      case 'm': {
        const [type, n = '1'] = arg.split(/\s+/);
        if (!MONSTERS[type]) { p.message(`Potwory: ${Object.keys(MONSTERS).join(', ')}`, 'info'); break; }
        for (let i = 0; i < Math.min(10, Number(n) || 1); i++) this.summonMonster(type, { id: 0, x: p.x, y: p.y, z: p.z });
        break;
      }
      case 'i': {
        const [key, n = '1'] = arg.split(/\s+/);
        const it = ITEM_BY_KEY[key];
        if (!it) { p.message('Nie ma takiego przedmiotu.', 'warn'); break; }
        if (!p.addItem(it.id, Math.min(100, Number(n) || 1))) p.message('Brak miejsca.', 'warn');
        break;
      }
      case 'lvl': {
        const lvl = Math.max(1, Math.min(200, nums[0] || 1));
        const was = p.gm; p.gm = false;
        p.exp = 0; p.recalc(); p.addExp(Math.max(1, expForLevel(lvl)));
        p.gm = was;
        p.hp = p.maxHp; p.mana = p.maxMana; p.onHpChanged();
        break;
      }
      case 'lecz': p.hp = p.maxHp; p.mana = p.maxMana; p.removeCondition('poison'); p.onHpChanged(); p.dirtyStats = true; break;
      case 'god': p.invulnerable = !p.invulnerable; p.message(`Nieśmiertelność: ${p.invulnerable ? 'wł.' : 'wył.'}`, 'info'); break;
      case 'ogloszenie': this.broadcastWorld(`[${p.name}] ${arg}`, 'event'); break;
      case 'kick': {
        const t = this.byName.get(arg.toLowerCase());
        if (t && t !== p) { t.session?.kick('Zostałeś wyrzucony przez GM.'); this.logout(t, true); }
        break;
      }
      default: p.message('Nieznana komenda GM.', 'warn');
    }
  }

  // -- main loop ------------------------------------------------------------------------
  tick() {
    const now = (this.now = Date.now());
    for (const c of this.creatures.values()) {
      try { c.tick(now); } catch (e) { console.error('[tick]', c.name, e); }
    }
    if (now >= this.nextSecond) {
      this.nextSecond = now + 1000;
      for (const s of this.spawns) s.tick(now);
      this.decayGround(now);
    }
    if (now >= this.nextTimeSync) {
      this.nextTimeSync = now + 60000;
      for (const p of this.players.values()) p.send({ t: 'time', start: this.dayStart, len: this.dayLen, now: Date.now() });
    }
    if (now >= this.nextSave) {
      this.nextSave = now + this.config.autosaveSec * 1000;
      this.saveAll();
    }
    for (const p of this.players.values()) {
      this.updateView(p);
      p.flush();
    }
  }

  saveAll(sync = false) {
    for (const p of this.players.values()) {
      if (sync) this.storage.saveSync(p.serialize());
      else this.storage.save(p.serialize());
    }
  }

  status() {
    return {
      game: GAME_NAME, world: this.config.worldName, online: this.players.size, peak: this.peak,
      uptime: Math.floor((Date.now() - this.startedAt) / 1000), monsters: [...this.creatures.values()].filter((c) => c.kind === 'monster').length,
      players: [...this.players.values()].map((p) => ({ name: p.name, level: p.level, voc: p.voc })),
      rates: { exp: this.config.rateExp, skill: this.config.rateSkill, magic: this.config.rateMagic, loot: this.config.rateLoot },
    };
  }
}

function starterKit(voc) {
  const k = (key, n = 1) => ({ k: key, n });
  const equip = { armor: k('leather_armor'), legs: k('leather_legs'), boots: k('leather_boots'), head: k('leather_helmet') };
  const bag = [k('health_potion', 3), k('apple', 5), k('torch')];
  if (voc === 'knight') { equip.weapon = k('short_sword'); equip.shield = k('wooden_shield'); bag.push(k('hand_axe'), k('club')); }
  if (voc === 'paladin') { equip.weapon = k('bow'); bag.push(k('arrow', 100), k('spear', 3), k('wooden_shield')); }
  if (voc === 'sorcerer') { equip.weapon = k('wand_sparks'); equip.shield = k('spellbook'); bag.push(k('mana_potion', 3), k('knife')); }
  if (voc === 'druid') { equip.weapon = k('rod_moss'); equip.shield = k('spellbook'); bag.push(k('mana_potion', 3), k('knife')); }
  while (bag.length < BAG_SIZE) bag.push(null);
  return { equip, bag };
}
