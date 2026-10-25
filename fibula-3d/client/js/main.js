// Fibula 3D client entry point.

import * as THREE from 'three';
import { DIR_DX, DIR_DY, dirFromDelta, O } from '/shared/constants.js';
import { GameMap } from '/shared/map.js';
import { ITEMS } from '/shared/items.js';
import { Net } from './net.js';
import { Renderer } from './render.js';
import { WorldView } from './worldview.js';
import { assets, loadAssets, cloneGear } from './assets.js';
import { CreatureView, makeCorpse } from './creatures.js';
import { Effects } from './effects.js';
import { Overlay } from './overlay.js';
import { UI } from './ui.js';
import { AudioEngine } from './audio.js';
import { iconCanvas } from './icons.js';

const SETTINGS_KEY = 'fibula.settings';
const DEFAULTS = { pixelScale: 3, retro: 'normal', showLevels: '1', music: 0.55, sfx: 0.8, ambience: 0.6, view: 'top', sens: 0.5 };
const FPP_MOVE = { KeyW: [1, 0], ArrowUp: [1, 0], Numpad8: [1, 0], KeyS: [-1, 0], ArrowDown: [-1, 0], Numpad2: [-1, 0], KeyA: [0, -1], Numpad4: [0, -1], KeyD: [0, 1], Numpad6: [0, 1] };
const FPP_TURN = { ArrowLeft: 1, KeyQ: 1, ArrowRight: -1, KeyE: -1 };
const KEY_DIRS = {
  ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3,
  Numpad8: 0, Numpad6: 1, Numpad2: 2, Numpad4: 3, Numpad7: 6, Numpad9: 7, Numpad1: 4, Numpad3: 5,
  Home: 6, PageUp: 7, End: 4, PageDown: 5,
};
const ITEM_PROP = {
  health_potion: 'bottle_red', great_health_potion: 'bottle_red', mana_potion: 'bottle_b', antidote: 'bottle_green',
  ham: 'food_ham', cheese: 'food_cheese', meat: 'food_steak', apple: 'food_tomato', bread: 'food_bun',
};
const ITEM_GEAR = {
  knife: 'dagger', short_sword: 'sword_1h', iron_sword: 'sword_1h', long_sword: 'sword_2h', runed_sword: 'sword_2h_color',
  hand_axe: 'axe_1h', battle_axe: 'axe_2h', orc_cleaver: 'skel_axe', bow: 'crossbow_1h', elven_bow: 'crossbow_2h',
  wand_sparks: 'wand', wand_embers: 'wand', rod_moss: 'staff', rod_frost: 'staff', wooden_shield: 'shield_round',
  steel_shield: 'shield_square', knight_shield: 'shield_badge', bone_shield: 'skel_shield', spellbook: 'spellbook', arrow: 'arrow_bundle',
};
const FX_SOUND = {
  blood: 'hit', green_blood: 'hit', bone: 'hit_bone', slime: 'hit', block: 'block', poff: 'poff', fire: 'fire', energy: 'energy',
  earth: 'earth', ice: 'ice', poison: 'poison', death: 'dark', holy: 'holy', drain: 'dark', heal: 'heal', mana: 'heal',
  levelup: 'levelup', teleport: 'teleport', explosion: 'explosion', sparkle: 'sparkle', haste: 'haste', shield: 'shield',
};

class Game {
  constructor() {
    this.settings = { ...DEFAULTS };
    try { Object.assign(this.settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch { /* ignore */ }
    this.ui = new UI(this);
    this.renderer = new Renderer(document.getElementById('gl'));
    this.renderer.setPixelScale(Number(this.settings.pixelScale));
    this.renderer.setRetro(this.settings.retro);
    this.overlay = new Overlay(document.getElementById('overlay'));
    this.audio = new AudioEngine();
    for (const k of ['music', 'sfx', 'ambience']) this.audio.setVolume(k, Number(this.settings[k]));
    this.net = new Net((m) => this.onMessage(m), () => this.onDisconnect());
    this.views = new Map();
    this.ground = new Map();       // "x,y,z" -> items
    this.groundVis = new Map();    // "x,y,z" -> [objects]
    this.keys = new Set();
    this.selfId = 0;
    this.self = null;
    this.z = 0;
    this.targetId = 0;
    this.inGame = false;
    this.lastStepSent = 0;
    this.timeSync = { start: Date.now(), len: 40 * 60000, offset: 0 };
    this.clock = new THREE.Clock();
    this.cursor = this.makeCursor(0xffffff, 0.5);
    this.targetMark = this.makeCursor(0xff3030, 0.9);
    this.mouse = { x: 0, y: 0, over: false };
    this.spriteTex = new Map();
    this.fpp = false;
    this.viewmodel = null;
    this.vmSwing = 0;
    this.lastTurnSent = 0;
  }

  // ---------------------------------------------------------------- first person
  setView(fpp) {
    this.fpp = fpp && this.inGame;
    this.renderer.setView(this.fpp);
    const me = this.views.get(this.selfId);
    if (me) me.root.visible = !this.fpp;
    if (this.fpp && me) {
      const d = me.data.d ?? 2;
      this.renderer.lookYaw = Math.atan2(-DIR_DX[d], -DIR_DY[d]);
      this.renderer.lookPitch = -0.12;
    }
    if (!this.fpp && document.pointerLockElement) document.exitPointerLock();
    this.buildViewmodel();
    this.ui.setViewMode(this.fpp);
  }

  toggleView() {
    this.setSetting('view', this.fpp ? 'top' : 'fpp');
  }

  buildViewmodel() {
    const cam = this.renderer.camera;
    if (this.viewmodel) { cam.remove(this.viewmodel); this.viewmodel = null; }
    if (!this.fpp) return;
    const g = new THREE.Group();
    const eq = this.ui.inv?.equip || {};
    const add = (key, x, rot) => {
      const m = key && cloneGear(key);
      if (!m) return;
      m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
      const holder = new THREE.Group();
      holder.add(m);
      holder.position.set(x, -0.34, -0.55);
      holder.rotation.set(rot[0], rot[1], rot[2]);
      holder.scale.setScalar(0.3);
      g.add(holder);
      return holder;
    };
    const w = eq.weapon && ITEMS[eq.weapon.id];
    const s = eq.shield && ITEMS[eq.shield.id];
    this.vmWeapon = add(w ? ITEM_GEAR[w.key] : null, 0.3, [0.35, -0.3, -0.25]);
    this.vmShield = add(s ? ITEM_GEAR[s.key] : null, -0.32, [0.1, 0.4, 0.1]);
    cam.add(g);
    this.viewmodel = g;
  }

  updateViewmodel(dt, me) {
    if (!this.viewmodel) return;
    const t = performance.now() / 1000;
    const walking = me && me.walking;
    this.renderer.bob = walking ? Math.abs(Math.sin(t * 9)) * 0.035 : this.renderer.bob * 0.9;
    this.viewmodel.position.set(walking ? Math.sin(t * 4.5) * 0.012 : 0, walking ? -Math.abs(Math.sin(t * 9)) * 0.015 : Math.sin(t * 1.5) * 0.004, 0);
    if (this.vmWeapon) {
      this.vmSwing = Math.max(0, this.vmSwing - dt * 3.5);
      const k = Math.sin(this.vmSwing * Math.PI);
      this.vmWeapon.rotation.x = 0.35 - k * 1.3;
      this.vmWeapon.position.z = -0.55 - k * 0.12;
    }
  }

  fppMoveDir() {
    let f = 0, r = 0;
    for (const k of this.keys) if (FPP_MOVE[k]) { f += FPP_MOVE[k][0]; r += FPP_MOVE[k][1]; }
    if (!f && !r) return -1;
    const fw = this.renderer.viewForward, rt = this.renderer.viewRight;
    const vx = fw.x * f + rt.x * r, vy = fw.y * f + rt.y * r;
    const a = Math.round(Math.atan2(vy, vx) / (Math.PI / 4)) * (Math.PI / 4);
    return dirFromDelta(Math.round(Math.cos(a)), Math.round(Math.sin(a)));
  }

  syncFacing(now) {
    if (!this.fpp || now - this.lastTurnSent < 300) return;
    const me = this.views.get(this.selfId);
    if (!me || me.walking) return;
    const fw = this.renderer.viewForward;
    const d = Math.abs(fw.x) > Math.abs(fw.y) ? (fw.x > 0 ? 1 : 3) : (fw.y > 0 ? 2 : 0);
    if (d !== me.data.d) { this.lastTurnSent = now; this.send({ t: 'turn', d }); }
  }

  // screen point used for picking: the crosshair in first person
  aim(e) {
    if (this.fpp && document.pointerLockElement) return { x: innerWidth / 2, y: innerHeight / 2 };
    return { x: e.clientX, y: e.clientY };
  }

  async boot() {
    const loading = document.getElementById('loading');
    const [buf] = await Promise.all([
      fetch('/api/map').then((r) => { if (!r.ok) throw new Error('map'); return r.arrayBuffer(); }),
      loadAssets((p) => { loading.textContent = `Wczytywanie świata… ${Math.round(p * 100)}%`; }),
      this.audio.init(),
    ]);
    this.map = GameMap.decode(new Uint8Array(buf));
    loading.textContent = 'Budowanie świata…';
    await new Promise((r) => setTimeout(r, 20));
    this.world = new WorldView(this.renderer.scene, this.map);
    this.world.build();
    this.world.setFloor(0);
    this.effects = new Effects(this.renderer.scene, this.renderer);
    this.renderer.scene.add(this.cursor, this.targetMark);
    this.ui.buildMinimap(this.map);
    loading.remove();
    this.bindInput();
    this.resize();
    addEventListener('resize', () => this.resize());
    fetch('/api/status').then((r) => r.json()).then((s) => this.ui.setServerStatus(`Świat ${s.world}: ${s.online} graczy online · tempo doświadczenia x${s.rates.exp}`)).catch(() => {});
    this.audio.playMusic('title');
    requestAnimationFrame(() => this.frame());
  }

  resize() {
    this.renderer.resize();
    this.overlay.resize(innerWidth, innerHeight);
  }

  makeCursor(color, opacity) {
    const g = new THREE.EdgesGeometry(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2));
    const m = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthTest: false }));
    m.renderOrder = 10;
    m.visible = false;
    return m;
  }

  // ---------------------------------------------------------------- network
  async login(msg) {
    this.audio.unlock();
    this.ui.loginError('');
    try {
      if (!this.net.open) await this.net.connect();
      this.pendingName = msg.name;
      this.net.send(msg);
    } catch (e) { this.ui.loginError(e.message); }
  }

  send(msg) { this.net.send(msg); }

  say(text, ch = 'local', tab) {
    if (tab === 'pm' && !text.startsWith('/')) { this.ui.addLine('pm', 'warn', 'Użyj: /w Imię, wiadomość'); return; }
    this.net.send({ t: 'say', text, ch });
  }

  castHotkey(i) {
    const s = this.ui.spells[i];
    if (s) this.say(s.words);
  }

  stopAttack() { this.targetId = 0; this.send({ t: 'attack', id: 0 }); this.send({ t: 'stop' }); }

  setSetting(key, value) {
    this.settings[key] = value;
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ }
    if (key === 'pixelScale') { this.renderer.setPixelScale(Number(value)); }
    if (key === 'retro') this.renderer.setRetro(value);
    if (['music', 'sfx', 'ambience'].includes(key)) this.audio.setVolume(key, Number(value));
    if (key === 'view') this.setView(value === 'fpp');
  }

  onDisconnect() {
    if (this.inGame) this.ui.loginError('Utracono połączenie z serwerem.');
    this.leaveGame();
  }

  leaveGame() {
    this.inGame = false;
    this.setView(false);
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    for (const k of [...this.groundVis.keys()]) this.clearTileVis(k);
    this.ground.clear();
    this.ui.showLogin(true);
    this.world?.setFloor(0);
    this.z = 0;
    this.audio.playMusic('title');
    this.audio.setAmbience({});
  }

  onMessage(m) {
    const name = m.t === 'cr+' ? 'on_cr_add' : m.t === 'cr-' ? 'on_cr_remove' : `on_${m.t}`;
    const h = this[name];
    if (typeof h === 'function') h.call(this, m);
  }

  on_hello() {}
  on_err(m) { this.ui.loginError(m.text); }
  on_kicked(m) { this.ui.loginError(m.text); this.leaveGame(); }
  on_logout() { this.leaveGame(); }

  on_welcome(m) {
    this.selfId = m.id;
    this.renderer.distTarget = 19;
    this.renderer.yawTarget = Math.round(this.renderer.yaw / (Math.PI / 2)) * (Math.PI / 2);
    this.inGame = true;
    this.timeSync = { start: m.time.start, len: m.time.len, offset: m.time.now - Date.now() };
    this.ui.setSpells(m.spells);
    this.ui.showLogin(false);
    this.ui.setChannel('local');
    try { if (this.pendingName) localStorage.setItem('fibula.lastName', this.pendingName); } catch { /* ignore */ }
    for (const v of this.views.values()) v.dispose();
    this.views.clear();
    this.ui.addLine('server', 'event', `Witaj w świecie ${m.world}! Wpisz /pomoc, aby zobaczyć komendy. Klawisz V przełącza widok pierwszej osoby.`);
    setTimeout(() => this.setView(this.settings.view === 'fpp'), 0);
  }

  on_time(m) { this.timeSync = { start: m.start, len: m.len, offset: m.now - Date.now() }; }

  on_self(m) {
    const prev = this.self;
    this.self = m;
    this.ui.updateSelf(m);
    if (prev && m.level > prev.level) this.audio.sfx('levelup');
  }

  on_inv(m) {
    const before = JSON.stringify([this.ui.inv?.equip?.weapon, this.ui.inv?.equip?.shield]);
    this.ui.updateInv(m);
    if (this.fpp && before !== JSON.stringify([m.equip.weapon, m.equip.shield])) this.buildViewmodel();
  }

  on_cr_remove(m) {
    const v = this.views.get(m.id);
    if (v) { v.dispose(); this.views.delete(m.id); }
  }

  on_cr_add(m) {
    const c = m.c;
    this.views.get(c.id)?.dispose();
    const v = new CreatureView(c, this.renderer.scene);
    this.views.set(c.id, v);
    if (c.id === this.selfId) { this.z = c.z; this.world.setFloor(c.z); v.root.visible = !this.fpp; }
  }

  on_mv(m) {
    const v = this.views.get(m.id);
    if (!v) return;
    v.moveTo(m.x, m.y, m.d, m.dur);
    if (m.id === this.selfId) { this.myMoveEnd = performance.now() + m.dur; this.audio.sfx('step', null, { volume: 0.35, gap: 120 }); }
  }

  on_tp(m) {
    const v = this.views.get(m.id);
    if (!v) return;
    v.teleport(m.x, m.y, m.d);
    v.data.z = m.z;
    if (m.id === this.selfId && m.z !== this.z) {
      this.z = m.z;
      this.world.setFloor(m.z);
      for (const [id, o] of this.views) if (id !== this.selfId) { o.dispose(); this.views.delete(id); }
      for (const k of [...this.groundVis.keys()]) this.clearTileVis(k);
      this.ground.clear();
      this.renderer.target.set(m.x + 0.5, 0, m.y + 0.5);
    }
  }

  on_turn(m) { this.views.get(m.id)?.setDir(m.d); }

  on_hp(m) {
    const v = this.views.get(m.id);
    if (!v) return;
    if (m.hp < v.data.hp) v.hit();
    v.data.hp = m.hp;
  }

  on_cu(m) {
    const v = this.views.get(m.id);
    if (!v) return;
    if (m.look) v.setLook(m.look);
    if (m.sp !== undefined) v.data.sp = m.sp;
    if ('skull' in m) v.data.skull = m.skull;
    if (m.light !== undefined) v.data.light = m.light;
  }

  on_target(m) { this.targetId = m.id; }

  on_atk(m) {
    const a = this.views.get(m.id), t = this.views.get(m.tid);
    if (!a) return;
    const kind = m.w === 'bow' ? 'bow' : m.w === 'wand' ? 'wand' : m.w === 'throw' ? 'throw' : m.w === 'spin' ? 'spin' : m.w === 'strike' ? undefined : undefined;
    a.attack(kind, t);
    if (m.id === this.selfId && this.fpp) this.vmSwing = 1;
    this.audio.sfx(m.w === 'bow' ? 'crossbow' : m.w === 'wand' ? 'wand' : 'swing', { x: a.pos.x, y: a.pos.z }, { volume: 0.7 });
  }

  on_fx(m) {
    if (m.z !== this.z) return;
    this.effects.spawn(m.e === 'death' ? 'death_puff' : m.e, m.x + 0.5, m.y + 0.5);
    const s = FX_SOUND[m.e];
    if (s) this.audio.sfx(s, { x: m.x + 0.5, y: m.y + 0.5 });
    if (m.e === 'explosion') this.renderer.shake = 0.6;
  }

  on_mis(m) {
    if (m.z !== this.z) return;
    this.effects.missile(m.m, m.fx, m.fy, m.tx, m.ty);
  }

  on_num(m) {
    if (m.z !== this.z) return;
    this.overlay.number(m.x, m.y, m.v, m.k);
    if (m.k !== 'exp' && m.k !== 'heal' && m.k !== 'mana' && this.views.get(this.selfId)) {
      const me = this.views.get(this.selfId);
      if (Math.abs(me.data.x - m.x) < 1 && Math.abs(me.data.y - m.y) < 1) this.renderer.screenFlash(0xff2020, 0.6);
    }
  }

  on_say(m) {
    const chat = m.mode === 'world' ? 'world' : m.mode === 'pm' ? 'pm' : 'local';
    const name = m.lvl && m.mode !== 'monster' ? `${m.name} [${m.lvl}]` : m.name;
    if (chat === 'local') {
      if (m.z === this.z) this.overlay.say(m.id, m.name, m.text, m.mode, { x: m.x, y: m.y });
      const kind = m.mode === 'say' ? 'say' : m.mode;
      if (m.mode === 'monster' || m.mode === 'emote' || m.mode === 'spell') this.ui.addLine('local', kind, m.text, m.name);
      else this.ui.addLine('local', kind, m.text, name);
      if (m.mode === 'npc') this.audio.sfx('npc', { x: m.x + 0.5, y: m.y + 0.5 }, { volume: 0.5, gap: 300 });
    } else {
      this.ui.addLine(chat, chat, m.text, name);
      if (chat === 'pm') this.audio.sfx('pm');
    }
  }

  on_msg(m) {
    const kind = m.kind || 'info';
    this.ui.addLine('server', kind, m.text);
    if (['warn', 'adv', 'event', 'look', 'info', 'loot'].includes(kind)) this.ui.status(m.text, kind);
    if (kind === 'loot') this.audio.sfx(/złot/.test(m.text) ? 'coin' : 'pickup');
    if (kind === 'adv' && /umiejętności|magii/.test(m.text)) this.audio.sfx('skillup');
  }

  on_death(m) {
    this.ui.showDeath(m);
    this.audio.sfx('death_jingle');
    this.renderer.screenFlash(0x800000, 2);
  }

  on_cont(m) { this.ui.openContainer(m); this.audio.sfx('open'); }
  on_contClose(m) { this.ui.closeContainer(m.uid); }
  on_trade(m) { this.ui.openTrade(m); }
  on_tradeClose(m) { this.ui.closeTrade(m.npc); }

  // ---------------------------------------------------------------- ground items
  tileKey(x, y, z) { return `${x},${y},${z}`; }

  on_gi(m) {
    const keep = new Set();
    for (const [x, y, items] of m.tiles) { const k = this.tileKey(x, y, m.z); keep.add(k); this.setTile(x, y, m.z, items); }
    for (const k of [...this.ground.keys()]) {
      const [x, y, z] = k.split(',').map(Number);
      if (z === m.z && (x >> 3) === m.cx && (y >> 3) === m.cy && !keep.has(k)) this.setTile(x, y, z, []);
    }
  }

  on_tile(m) { this.setTile(m.x, m.y, m.z, m.items); }

  clearTileVis(k) {
    for (const o of this.groundVis.get(k) || []) {
      if (o.dispose) o.dispose(); else this.renderer.scene.remove(o);
    }
    this.groundVis.delete(k);
  }

  setTile(x, y, z, items) {
    const k = this.tileKey(x, y, z);
    this.clearTileVis(k);
    if (!items.length) { this.ground.delete(k); return; }
    this.ground.set(k, items);
    if (z !== this.z) return;
    const vis = [];
    const corpse = [...items].reverse().find((i) => i.c);
    if (corpse) { const v = makeCorpse({ ...corpse, x, y }, this.renderer.scene); vis.push(v); }
    const loose = items.filter((i) => !i.c).slice(-3);
    loose.forEach((it, i) => {
      const o = this.itemObject(it, x, y, i);
      if (o) { this.renderer.scene.add(o); vis.push(o); }
    });
    this.groundVis.set(k, vis);
  }

  itemObject(it, x, y, i) {
    const def = ITEMS[it.id];
    if (!def) return null;
    const jx = ((it.u * 37) % 7) / 20 - 0.15, jz = ((it.u * 53) % 7) / 20 - 0.15;
    const px = x + 0.5 + jx + i * 0.12, pz = y + 0.5 + jz;
    let key = ITEM_PROP[def.key];
    if (def.key === 'gold') key = it.n >= 50 ? 'coins_l' : it.n >= 10 ? 'coins_m' : 'coins_s';
    const prop = key && assets.props.get(key);
    if (prop) {
      const g = new THREE.Group();
      for (const p of prop.parts) { const m = new THREE.Mesh(p.geometry, p.material); m.applyMatrix4(p.matrix); m.castShadow = true; g.add(m); }
      const s = def.key === 'gold' ? 0.28 : def.kind === 'potion' ? 0.32 : 0.26;
      g.scale.setScalar(s);
      g.position.set(px, -prop.box.min.y * s, pz);
      g.rotation.y = (it.u % 6);
      return g;
    }
    const gk = ITEM_GEAR[def.key];
    const gear = gk && cloneGear(gk);
    if (gear) {
      const g = new THREE.Group();
      gear.rotation.set(-Math.PI / 2, 0, (it.u % 6));
      g.add(gear);
      g.scale.setScalar(0.42);
      g.position.set(px, 0.06, pz);
      return g;
    }
    let tex = this.spriteTex.get(it.id);
    if (!tex) {
      tex = new THREE.CanvasTexture(iconCanvas(it.id));
      tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
      this.spriteTex.set(it.id, tex);
    }
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5 }));
    sp.scale.set(0.45, 0.45, 0.45);
    sp.position.set(px, 0.24, pz);
    return sp;
  }

  topItems(x, y) { return this.ground.get(this.tileKey(x, y, this.z)) || []; }

  // ---------------------------------------------------------------- input
  bindInput() {
    const canvas = document.getElementById('gl');
    const unlock = () => this.audio.unlock();
    addEventListener('pointerdown', unlock);
    addEventListener('keydown', unlock);
    addEventListener('keydown', (e) => this.keyDown(e));
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('pointermove', (e) => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.over = true; });
    addEventListener('mousemove', (e) => {
      if (!this.fpp || document.pointerLockElement !== canvas) return;
      const k = 0.0012 + Number(this.settings.sens) * 0.004;
      this.renderer.look(e.movementX * k, e.movementY * k);
    });
    canvas.addEventListener('pointerleave', () => { this.mouse.over = false; });
    canvas.addEventListener('click', (e) => {
      if (this.fpp && document.pointerLockElement !== canvas) { canvas.requestPointerLock?.(); return; }
      this.click(e);
    });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const p = this.aim(e);
      if (document.pointerLockElement) document.exitPointerLock();
      this.contextMenu({ ...e, clientX: p.x, clientY: p.y, shiftKey: e.shiftKey });
    });
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (!this.fpp) this.renderer.zoom(Math.sign(e.deltaY) * 1.5); }, { passive: false });
  }

  keyDown(e) {
    if (!this.inGame) return;
    const chat = this.ui.chatFocused;
    if (e.code === 'Escape') {
      if (chat) document.getElementById('chat-input').blur();
      else if (this.ui.windows.size) for (const k of [...this.ui.windows.keys()]) this.ui.closeWindow(k);
      else this.stopAttack();
      this.ui.hideMenu();
      return;
    }
    if (e.code === 'Enter' && !chat) { e.preventDefault(); this.ui.focusChat(); return; }
    if (/^F[1-9]$/.test(e.key)) { e.preventDefault(); this.castHotkey(Number(e.key.slice(1)) - 1); return; }
    const input = document.getElementById('chat-input');
    const arrow = e.code.startsWith('Arrow');
    if (chat && !(arrow && !input.value)) return;
    if (!chat && e.code === 'KeyV') { this.toggleView(); return; }
    if (this.fpp) {
      if (FPP_MOVE[e.code] || FPP_TURN[e.code]) {
        e.preventDefault();
        if (e.ctrlKey) return;
        if (!this.keys.has(e.code)) {
          this.keys.add(e.code);
          const d = this.fppMoveDir();
          if (FPP_MOVE[e.code] && d >= 0) this.stepNow(d);
        }
      }
      return;
    }
    if (!chat && (e.code === 'KeyQ' || e.code === 'KeyE')) { this.renderer.rotate(e.code === 'KeyQ' ? -1 : 1); return; }
    if (e.code in KEY_DIRS) {
      e.preventDefault();
      if (e.ctrlKey && KEY_DIRS[e.code] < 4) { this.send({ t: 'turn', d: this.rotateDir(KEY_DIRS[e.code]) }); return; }
      if (!this.keys.has(e.code)) { this.keys.add(e.code); this.stepNow(this.rotateDir(KEY_DIRS[e.code])); }
    }
  }

  rotateDir(d) {
    let dx = DIR_DX[d], dy = DIR_DY[d];
    for (let i = 0; i < this.renderer.quadrant; i++) [dx, dy] = [dy, -dx];
    return dirFromDelta(dx, dy);
  }

  stepNow(d) {
    this.send({ t: 'step', d });
    this.lastStepSent = performance.now();
  }

  processHeldKeys(now, dt = 0) {
    if (!this.inGame || this.ui.chatFocused && document.getElementById('chat-input').value) return;
    if (this.fpp) {
      let turn = 0;
      for (const k of this.keys) if (FPP_TURN[k]) turn += FPP_TURN[k];
      if (turn) this.renderer.turnView(turn * dt * 2.4);
      const d = this.fppMoveDir();
      if (d >= 0 && now - this.lastStepSent > 90 && now > (this.myMoveEnd || 0) - 140) this.stepNow(d);
      this.syncFacing(now);
      return;
    }
    let held = null;
    for (const k of this.keys) if (k in KEY_DIRS) held = k;
    if (!held) return;
    const end = this.myMoveEnd || 0;
    if (now - this.lastStepSent > 90 && now > end - 140) this.stepNow(this.rotateDir(KEY_DIRS[held]));
  }

  pickCreature(sx, sy) {
    let best = null, bd = Infinity;
    for (const v of this.views.values()) {
      if (v.data.z !== undefined && v.data.z !== this.z) continue;
      if (this.fpp && v.id === this.selfId) continue;
      const top = this.renderer.project(new THREE.Vector3(v.pos.x, v.headY, v.pos.z));
      const bot = this.renderer.project(new THREE.Vector3(v.pos.x, 0, v.pos.z));
      if (top.behind) continue;
      const hw = Math.max(14, (bot.y - top.y) * 0.45);
      if (sx < bot.x - hw || sx > bot.x + hw || sy < top.y - 6 || sy > bot.y + 6) continue;
      const d = Math.abs(sx - bot.x) + Math.abs(sy - (top.y + bot.y) / 2) * 0.5;
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  pickTile(sx, sy) {
    const g = this.renderer.pickGround(sx, sy);
    return g ? { x: Math.floor(g.x), y: Math.floor(g.z) } : null;
  }

  click(e) {
    if (!this.inGame) return;
    this.ui.hideMenu();
    const p = this.aim(e);
    const c = this.pickCreature(p.x, p.y);
    const t = this.pickTile(p.x, p.y);
    if (e.shiftKey) {
      if (c) this.send({ t: 'look', id: c.id });
      else if (t) this.send({ t: 'look', x: t.x, y: t.y, z: this.z });
      return;
    }
    if (c && c.id !== this.selfId) {
      if (c.data.k === 'n') {
        const me = this.views.get(this.selfId);
        if (me && Math.max(Math.abs(me.data.x - c.data.x), Math.abs(me.data.y - c.data.y)) <= 3) this.say('witaj');
        else this.send({ t: 'follow', id: c.id });
        return;
      }
      this.targetId = this.targetId === c.id ? 0 : c.id;
      this.send({ t: 'attack', id: this.targetId });
      return;
    }
    if (!t) return;
    const items = this.topItems(t.x, t.y);
    const obj = this.map.obj(t.x, t.y, this.z);
    if (items.some((i) => i.c)) this.send({ t: 'open', x: t.x, y: t.y, z: this.z });
    else if (obj === O.QUEST_CHEST || obj === O.SIGN) this.send({ t: 'use', x: t.x, y: t.y, z: this.z });
    else this.send({ t: 'goto', x: t.x, y: t.y });
  }

  contextMenu(e) {
    if (!this.inGame) return;
    const c = this.pickCreature(e.clientX, e.clientY);
    const t = this.pickTile(e.clientX, e.clientY);
    const entries = [];
    if (c && c.id !== this.selfId) {
      if (c.data.k === 'n') {
        entries.push(['Rozmawiaj', () => this.say('witaj')], ['Handel', () => this.say('handel')], ['Podążaj', () => this.send({ t: 'follow', id: c.id })]);
      } else {
        entries.push([this.targetId === c.id ? 'Przestań atakować' : 'Atakuj', () => { this.targetId = this.targetId === c.id ? 0 : c.id; this.send({ t: 'attack', id: this.targetId }); }]);
        entries.push(['Podążaj', () => this.send({ t: 'follow', id: c.id })]);
        if (c.data.k === 'p') entries.push(['Wiadomość prywatna', () => { this.ui.setChannel('pm'); const i = document.getElementById('chat-input'); i.value = `/w ${c.data.name}, `; i.focus(); }]);
      }
      entries.push(['Zobacz', () => this.send({ t: 'look', id: c.id })]);
    }
    if (t) {
      const items = this.topItems(t.x, t.y);
      if (items.some((i) => i.c)) entries.push(['Otwórz zwłoki', () => this.send({ t: 'open', x: t.x, y: t.y, z: this.z })]);
      if (items.some((i) => !i.c)) entries.push(['Podnieś', () => this.send({ t: 'pickup', x: t.x, y: t.y, z: this.z })]);
      const obj = this.map.obj(t.x, t.y, this.z);
      if (obj === O.QUEST_CHEST || obj === O.SIGN || obj === O.WELL) entries.push(['Użyj', () => this.send({ t: 'use', x: t.x, y: t.y, z: this.z })]);
      entries.push(['Idź tutaj', () => this.send({ t: 'goto', x: t.x, y: t.y })]);
      entries.push(['Zobacz', () => this.send({ t: 'look', x: t.x, y: t.y, z: this.z })]);
    }
    if (entries.length) this.ui.showMenu(e.clientX, e.clientY, entries);
  }

  // ---------------------------------------------------------------- frame
  dayPhase() {
    const now = Date.now() + this.timeSync.offset;
    return ((((now - this.timeSync.start) % this.timeSync.len) + this.timeSync.len) % this.timeSync.len) / this.timeSync.len;
  }

  regionName(x, y, z) {
    let best = null, bd = Infinity;
    for (const r of this.map.meta.regions || []) {
      if (r.z !== z) continue;
      const d = Math.hypot(r.x - x, r.y - y);
      if (d < bd) { bd = d; best = r; }
    }
    return best && bd < 40 ? best.name : 'Fibula';
  }

  updateAudio(me, phase) {
    if (!me) return;
    const x = me.pos.x, y = me.pos.z;
    this.audio.setListener(x, y);
    const region = this.regionName(x, y, this.z);
    const night = Math.sin((phase - 0.25) * Math.PI * 2) < -0.05;
    let music, amb;
    if (this.z < 0) {
      music = region === 'Krypta' ? 'crypt' : this.z <= -2 ? 'lair' : 'cave';
      amb = { cave: 1 };
    } else {
      const town = this.map.isPZ(Math.floor(x), Math.floor(y), 0) || region === 'Patella';
      music = night ? 'night' : town ? 'town' : region === 'Bagna Kulszowe' ? 'swamp' : 'wild';
      if (night) amb = { night: 1, wind: 0.35 };
      else if (town) amb = { day: 0.8, birds: 0.35 };
      else amb = { birds: 0.9, wind: 0.5 };
      if (region === 'Bagna Kulszowe') { amb.swamp = 1; amb.birds = 0.3; }
    }
    if (this.audio.manifest.music?.[music]) this.audio.playMusic(music);
    else if (this.audio.manifest.music?.wild) this.audio.playMusic(this.z < 0 ? 'cave' : 'wild');
    this.audio.setAmbience(amb);
    const fl = this.z === 0 ? 'parter' : `poziom ${this.z}`;
    this.ui.setRegion(region, fl);
  }

  frame() {
    requestAnimationFrame(() => this.frame());
    const dt = Math.min(0.1, this.clock.getDelta());
    const now = performance.now();
    this.processHeldKeys(now, dt);
    const me = this.views.get(this.selfId);
    let focus;
    if (this.inGame && me) focus = new THREE.Vector3(me.pos.x, 0, me.pos.z);
    else {
      // title screen: slow orbit over Patella
      this.renderer.yawTarget += dt * 0.04;
      this.renderer.yaw = this.renderer.yawTarget;
      this.renderer.distTarget = 27;
      focus = new THREE.Vector3(81, 0, 83);
    }
    for (const v of this.views.values()) v.update(dt, now);
    for (const list of this.groundVis.values()) for (const o of list) if (o.update && o.mixer) o.update(dt, now);
    this.effects.update(dt);
    this.world.update(dt, focus.x, focus.z, this.z, this.fpp);
    if (this.fpp) this.updateViewmodel(dt, me);
    this.renderer.updateCamera(focus, dt);
    const phase = this.inGame ? this.dayPhase() : 0.31;
    const lights = this.world.floorLights(this.z);
    this.renderer.updateLighting(phase, this.z < 0, focus, lights, this.self?.light || 0, dt);
    // cursors
    if (this.inGame && (this.mouse.over || this.fpp)) {
      const a = this.fpp ? { x: innerWidth / 2, y: innerHeight / 2 } : this.mouse;
      const t = this.pickTile(a.x, a.y);
      this.cursor.visible = !!t;
      if (t) this.cursor.position.set(t.x + 0.5, 0.03, t.y + 0.5);
    } else this.cursor.visible = false;
    const tv = this.targetId && this.views.get(this.targetId);
    this.targetMark.visible = !!tv;
    if (tv) this.targetMark.position.set(tv.pos.x, 0.04, tv.pos.z);
    this.renderer.render();
    if (this.inGame) {
      const shown = this.fpp ? [...this.views.values()].filter((v) => v.id !== this.selfId) : this.views.values();
      this.overlay.draw(this.renderer.camera, shown, { targetId: this.targetId, showLevels: this.settings.showLevels === '1', crosshair: this.fpp });
      if (!this.lastMini || now - this.lastMini > 150) {
        this.lastMini = now;
        if (me) this.ui.drawMinimap(me.pos.x - 0.5, me.pos.z - 0.5, this.z, this.views.values(), this.selfId);
        const mins = Math.floor(phase * 1440);
        this.ui.setClock(`${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`);
      }
      if (!this.lastAudio || now - this.lastAudio > 1000) { this.lastAudio = now; this.updateAudio(me, phase); }
    } else this.overlay.ctx.clearRect(0, 0, this.overlay.w, this.overlay.h);
  }
}

const game = new Game();
window.fibula = game;
game.boot().catch((e) => {
  console.error(e);
  const l = document.getElementById('loading');
  if (l) l.textContent = 'Nie udało się uruchomić gry: ' + e.message;
});
