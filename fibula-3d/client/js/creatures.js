// Visual representation of creatures: KayKit rigged characters (players,
// NPCs, humanoid monsters) and procedural low-poly animals and dragons.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { OUTFIT_COLORS } from '/shared/constants.js';
import { assets, cloneCharacter, cloneGear, cloneCustom, recolorObject } from './assets.js';
import { Geo, lin } from './geo.js';
import { applyGait } from './gait.js';

const CHAR_SCALE = 0.4;
const DIR_ANGLE = [Math.PI, Math.PI / 2, 0, -Math.PI / 2, -Math.PI / 4, Math.PI / 4, -3 * Math.PI / 4, 3 * Math.PI / 4];

export const MONSTER_LOOK = {
  rat: { proc: 'rat', h: 0.35 }, rabbit: { proc: 'rabbit', h: 0.4 }, deer: { proc: 'deer', h: 1.0 },
  wolf: { proc: 'wolf', h: 0.7 }, bear: { proc: 'bear', h: 1.0 }, snake: { proc: 'snake', h: 0.35 },
  poison_spider: { proc: 'spider', color: 0x3c6a2c, accent: 0xa0d040, h: 0.45 },
  giant_spider: { proc: 'spider', color: 0x2a1a22, accent: 0xd03030, scale: 1.9, h: 0.9 },
  slime: { proc: 'slime', h: 0.7 }, bat: { proc: 'bat', h: 1.0 },
  dragon_hatchling: { proc: 'dragon', color: 0x58a83c, belly: 0xd8d080, wing: 0x3a7a2a, scale: 0.75, h: 1.1 },
  dragon: { proc: 'dragon', color: 0xc0402c, belly: 0xe8b060, wing: 0x7a1e18, scale: 1.45, h: 2.0 },
  orc: { kk: 'Barbarian', recolor: 'orc', r: 'axe_1h' },
  orc_warrior: { kk: 'Barbarian', recolor: 'orc', r: 'axe_2h', scale: 1.12 },
  orc_spearman: { kk: 'Rogue', recolor: 'orc', r: 'spear' },
  orc_shaman: { kk: 'Mage', recolor: 'orc', r: 'skel_staff' },
  bandit: { kk: 'Rogue_Hooded', recolor: 'dark', r: 'dagger', l: 'dagger' },
  skeleton: { kk: ['Skeleton_Minion', 'Skeleton_Warrior'], r: 'skel_blade', l: 'skel_shield_small' },
  ghoul: { kk: 'Skeleton_Rogue', recolor: 'ghoul', r: 'skel_axe', scale: 1.05 },
  lich: { kk: 'Skeleton_Mage', recolor: 'purple', r: 'skel_staff', scale: 1.35 },
  troll: { kk: 'Barbarian', recolor: 'troll', r: 'club', scale: 1.15 },
  troll_champion: { kk: 'Barbarian', recolor: 'troll', r: 'axe_2h', l: 'shield_spikes', scale: 1.35 },
  swamp_troll: { kk: 'Barbarian', recolor: 'swamp', r: 'club', scale: 1.05 },
};

const VOC_MODEL = { knight: 'Knight', paladin: 'Rogue_Hooded', sorcerer: 'Mage', druid: 'Mage' };
const NPC_MODEL = {
  'Ojciec Ignacy': ['Mage', 'white'], 'Kowal Bogdan': ['Barbarian', null], 'Myśliwy Hubert': ['Rogue_Hooded', null],
  'Zielarka Wanda': ['Mage', 'green'], 'Karczmarz Zenon': ['Barbarian', 'red'], 'Strażnik Marek': ['Knight', 'blue'],
  'Rybak Józef': ['Rogue', 'blue'],
};
const WEAPON_GEAR = {
  knife: 'dagger', short_sword: 'sword_1h', iron_sword: 'sword_1h', long_sword: 'sword_2h', runed_sword: 'sword_2h_color',
  hand_axe: 'axe_1h', battle_axe: 'axe_2h', orc_cleaver: 'skel_axe', club: 'club', mace: 'mace', morning_star: 'mace',
  bone_club: 'club', bow: 'crossbow_1h', elven_bow: 'crossbow_2h', spear: 'spear', wand_sparks: 'wand', wand_embers: 'wand',
  rod_moss: 'staff', rod_frost: 'staff', torch: 'torch',
};
const SHIELD_GEAR = {
  wooden_shield: 'shield_round', steel_shield: 'shield_square', knight_shield: 'shield_badge', bone_shield: 'skel_shield',
  spellbook: 'spellbook', torch: 'torch',
};

// ---- shared helpers ----------------------------------------------------------------
const rbox = new RoundedBoxGeometry(1, 1, 1, 2, 0.18);
const box = new THREE.BoxGeometry(1, 1, 1);
const matCache = new Map();
function mat(hex, opts = {}) {
  const key = `${hex}:${opts.transparent ? 1 : 0}:${opts.emissive || 0}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex, transparent: !!opts.transparent, opacity: opts.opacity ?? 1, emissive: opts.emissive || 0 });
    matCache.set(key, m);
  }
  return m;
}
function part(parent, geo, hex, sx, sy, sz, x, y, z, opts) {
  const m = new THREE.Mesh(geo, mat(hex, opts));
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function pivot(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

// Procedural gear for items KayKit doesn't have (sizes in KayKit units).
function procGear(key) {
  const geo = new Geo();
  if (key === 'club') {
    geo.prism(0, -0.2, 0, 0.07, 0.5, 6, lin(0x6b4426));
    geo.prism(0, 0.3, 0, 0.1, 0.6, 7, lin(0x8a5a32), { r1: 0.17, top: lin(0x9a6a3a) });
  } else if (key === 'mace') {
    geo.prism(0, -0.2, 0, 0.05, 0.75, 6, lin(0x5a3a1e));
    geo.blob(0, 0.65, 0, 0.18, lin(0x9a9ea6));
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; geo.prism(Math.cos(a) * 0.16, 0.6, Math.sin(a) * 0.16, 0.05, 0.12, 4, lin(0xc8ccd2), { r1: 0 }); }
  } else if (key === 'spear') {
    geo.prism(0, -0.6, 0, 0.04, 1.9, 6, lin(0x8a5a32));
    geo.prism(0, 1.3, 0, 0.09, 0.35, 4, lin(0xc8ccd2), { r1: 0 });
  } else if (key === 'torch') {
    geo.prism(0, -0.2, 0, 0.05, 0.7, 6, lin(0x6b4426));
    geo.prism(0, 0.5, 0, 0.12, 0.3, 6, lin(0xff9020), { r1: 0 });
  } else return null;
  const m = new THREE.Mesh(geo.build(), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: key === 'torch' ? 0x552200 : 0 }));
  m.castShadow = true;
  return m;
}

function gearModel(key) { return cloneGear(key) || procGear(key); }

// Luminance-preserving tint used for outfit colours on capes and hats.
const tintCache = new Map();
function tinted(material, hex) {
  const key = `${material.uuid}:${hex}`;
  let m = tintCache.get(key);
  if (m) return m;
  m = material.clone();
  const tint = new THREE.Color(hex);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTint = { value: tint };
    sh.fragmentShader = 'uniform vec3 uTint;\n' + sh.fragmentShader.replace('#include <map_fragment>',
      '#include <map_fragment>\nfloat lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));\ndiffuseColor.rgb = mix(diffuseColor.rgb, uTint * (0.35 + lum * 1.6), 0.8);');
  };
  m.customProgramCacheKey = () => 'tint';
  tintCache.set(key, m);
  return m;
}

// ---- procedural animals ----------------------------------------------------------------
function buildQuadruped(o) {
  const g = new THREE.Group();
  const body = pivot(g, 0, o.legH + o.bodyH / 2, 0);
  part(body, rbox, o.color, o.bodyW, o.bodyH, o.bodyL, 0, 0, 0);
  if (o.belly) part(body, rbox, o.belly, o.bodyW * 0.8, o.bodyH * 0.4, o.bodyL * 0.8, 0, -o.bodyH * 0.35, 0);
  const head = pivot(body, 0, o.headY ?? o.bodyH * 0.35, o.bodyL / 2 + o.headS * 0.3);
  part(head, rbox, o.headColor || o.color, o.headS * 0.85, o.headS * 0.8, o.headS, 0, 0, o.headS * 0.3);
  if (o.snout) part(head, rbox, o.snoutColor || o.color, o.headS * 0.5, o.headS * 0.4, o.snout, 0, -o.headS * 0.12, o.headS * 0.7 + o.snout * 0.3);
  part(head, box, 0x101010, 0.04, 0.04, 0.02, -o.headS * 0.22, o.headS * 0.1, o.headS * 0.78);
  part(head, box, 0x101010, 0.04, 0.04, 0.02, o.headS * 0.22, o.headS * 0.1, o.headS * 0.78);
  if (o.ears) for (const s of [-1, 1]) part(head, rbox, o.earColor || o.color, o.ears[0], o.ears[1], o.ears[2], s * o.headS * 0.28, o.headS * 0.45 + o.ears[1] * 0.4, o.headS * 0.1);
  if (o.antlers) for (const s of [-1, 1]) {
    const a = pivot(head, s * 0.08, o.headS * 0.4, 0.02);
    a.rotation.z = -s * 0.5;
    part(a, box, 0xd8c8a0, 0.03, 0.28, 0.03, 0, 0.14, 0);
    part(a, box, 0xd8c8a0, 0.03, 0.12, 0.03, s * 0.05, 0.24, 0.04).rotation.z = -s * 0.7;
  }
  const legs = [];
  for (const [lx, lz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const leg = pivot(g, lx * o.bodyW * 0.32, o.legH, lz * o.bodyL * 0.33);
    part(leg, rbox, o.legColor || o.color, o.legW, o.legH + 0.04, o.legW, 0, -o.legH / 2, 0);
    legs.push(leg);
  }
  let tail = null;
  if (o.tail) {
    tail = pivot(body, 0, o.bodyH * 0.2, -o.bodyL / 2);
    tail.rotation.x = o.tailAngle ?? -0.6;
    part(tail, rbox, o.tailColor || o.color, o.tail[0], o.tail[1], o.tail[2], 0, 0, -o.tail[2] / 2);
  }
  return { group: g, body, head, legs, tail, kind: 'quad', hop: !!o.hop };
}

function buildSnake() {
  const g = new THREE.Group();
  const segs = [];
  for (let i = 0; i < 8; i++) {
    const s = pivot(g, 0, 0.06, 0.28 - i * 0.1);
    const w = i === 0 ? 0.13 : 0.1 - i * 0.006;
    part(s, rbox, i % 2 ? 0x4c8a2a : 0x6aa83a, w, 0.08, 0.12, 0, 0, 0);
    if (i === 0) {
      part(s, box, 0x101010, 0.025, 0.025, 0.02, -0.04, 0.03, 0.05);
      part(s, box, 0x101010, 0.025, 0.025, 0.02, 0.04, 0.03, 0.05);
      part(s, box, 0xd02020, 0.015, 0.01, 0.08, 0, -0.01, 0.1);
    }
    segs.push(s);
  }
  return { group: g, segs, kind: 'snake' };
}

function buildSpider(o) {
  const g = new THREE.Group();
  const body = pivot(g, 0, 0.22, 0);
  part(body, rbox, o.color, 0.34, 0.28, 0.38, 0, 0.04, -0.2);
  part(body, rbox, o.accent, 0.12, 0.05, 0.2, 0, 0.19, -0.22);
  part(body, rbox, o.color, 0.22, 0.16, 0.22, 0, 0, 0.08);
  part(body, box, 0xff3030, 0.04, 0.04, 0.02, -0.05, 0.04, 0.2, { emissive: 0x801010 });
  part(body, box, 0xff3030, 0.04, 0.04, 0.02, 0.05, 0.04, 0.2, { emissive: 0x801010 });
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1, k = i % 4;
    const leg = pivot(body, side * 0.1, 0, 0.12 - k * 0.07);
    const spread = (k - 1.5) * 0.5;
    leg.rotation.y = side > 0 ? -spread : Math.PI + spread;
    part(leg, box, o.color, 0.24, 0.035, 0.035, 0.1, 0.07, 0).rotation.z = 0.55;
    part(leg, box, o.color, 0.035, 0.32, 0.035, 0.23, -0.02, 0).rotation.z = 0.25;
    legs.push(leg);
  }
  g.scale.setScalar(o.scale || 1);
  return { group: g, body, legs, kind: 'spider' };
}

function buildSlime() {
  const g = new THREE.Group();
  const body = pivot(g, 0, 0, 0);
  part(body, rbox, 0x5ad04a, 0.6, 0.5, 0.6, 0, 0.25, 0, { transparent: true, opacity: 0.78 });
  part(body, rbox, 0x2a8a2a, 0.3, 0.22, 0.3, 0, 0.2, 0, { transparent: true, opacity: 0.9 });
  part(body, box, 0x101010, 0.07, 0.09, 0.02, -0.12, 0.34, 0.3);
  part(body, box, 0x101010, 0.07, 0.09, 0.02, 0.12, 0.34, 0.3);
  return { group: g, body, kind: 'slime' };
}

function buildBat() {
  const g = new THREE.Group();
  const body = pivot(g, 0, 0.7, 0);
  part(body, rbox, 0x3a2e3a, 0.16, 0.18, 0.2, 0, 0, 0);
  for (const s of [-1, 1]) part(body, box, 0x3a2e3a, 0.04, 0.08, 0.03, s * 0.05, 0.11, 0.04);
  part(body, box, 0xff5050, 0.03, 0.03, 0.02, -0.04, 0.03, 0.1, { emissive: 0x802020 });
  part(body, box, 0xff5050, 0.03, 0.03, 0.02, 0.04, 0.03, 0.1, { emissive: 0x802020 });
  const wings = [];
  for (const s of [-1, 1]) {
    const w = pivot(body, s * 0.08, 0.02, 0);
    part(w, box, 0x4a3a4a, 0.36, 0.02, 0.22, s * 0.18, 0, 0);
    wings.push(w);
  }
  return { group: g, body, wings, kind: 'bat' };
}

function buildDragon(o) {
  const g = new THREE.Group();
  const q = buildQuadruped({
    color: o.color, belly: o.belly, bodyW: 0.5, bodyH: 0.42, bodyL: 0.85, legH: 0.32, legW: 0.14, headS: 0.3, snout: 0.22,
    headY: 0.55, ears: [0.05, 0.16, 0.05], earColor: 0xe8e0c0, tail: [0.16, 0.14, 0.7], tailAngle: -0.25,
  });
  g.add(q.group);
  // neck
  part(q.body, rbox, o.color, 0.22, 0.38, 0.22, 0, 0.32, 0.42).rotation.x = 0.5;
  // wings
  const wings = [];
  for (const s of [-1, 1]) {
    const w = pivot(q.body, s * 0.2, 0.22, 0.05);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.25, s * 0.9, 0.25, 0.1, s * 0.75, 0, -0.45, 0, 0, 0.25, s * 0.75, 0, -0.45, 0, 0, -0.2], 3));
    geo.computeVertexNormals();
    const wm = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: o.wing, side: THREE.DoubleSide }));
    wm.castShadow = true;
    w.add(wm);
    part(w, box, o.color, 0.9, 0.05, 0.05, s * 0.45, 0.13, 0.17).rotation.z = s * 0.28;
    wings.push(w);
  }
  g.scale.setScalar(o.scale || 1);
  return { ...q, group: g, wings, kind: 'dragon' };
}

function buildProc(look) {
  switch (look.proc) {
    case 'rat': return buildQuadruped({ color: 0x8a7a6e, bodyW: 0.2, bodyH: 0.15, bodyL: 0.34, legH: 0.06, legW: 0.05, headS: 0.15, snout: 0.08, snoutColor: 0x9a8a7e, ears: [0.06, 0.06, 0.02], earColor: 0xe0a0a0, tail: [0.03, 0.03, 0.34], tailColor: 0xe0a0a0, tailAngle: 0.15 });
    case 'rabbit': return buildQuadruped({ color: 0xc8b8a0, bodyW: 0.2, bodyH: 0.18, bodyL: 0.26, legH: 0.07, legW: 0.06, headS: 0.16, ears: [0.04, 0.2, 0.04], earColor: 0xd8c8b0, tail: [0.08, 0.08, 0.06], tailColor: 0xffffff, hop: true });
    case 'deer': return buildQuadruped({ color: 0xa8743e, belly: 0xe8d8c0, bodyW: 0.26, bodyH: 0.3, bodyL: 0.62, legH: 0.48, legW: 0.07, headS: 0.2, snout: 0.12, headY: 0.32, ears: [0.05, 0.1, 0.03], antlers: true, tail: [0.07, 0.1, 0.06], tailColor: 0xffffff });
    case 'wolf': return buildQuadruped({ color: 0x8a8e96, belly: 0xc8c8cc, bodyW: 0.26, bodyH: 0.26, bodyL: 0.6, legH: 0.3, legW: 0.08, headS: 0.22, snout: 0.16, snoutColor: 0x9a9ea6, headY: 0.2, ears: [0.06, 0.11, 0.04], tail: [0.08, 0.08, 0.36], tailAngle: -0.8 });
    case 'bear': return buildQuadruped({ color: 0x6a4a30, belly: 0x8a6a48, bodyW: 0.5, bodyH: 0.46, bodyL: 0.82, legH: 0.32, legW: 0.16, headS: 0.32, snout: 0.14, snoutColor: 0x8a6a48, headY: 0.25, ears: [0.09, 0.08, 0.05], tail: [0.08, 0.08, 0.06] });
    case 'snake': return buildSnake();
    case 'spider': return buildSpider(look);
    case 'slime': return buildSlime();
    case 'bat': return buildBat();
    case 'dragon': return buildDragon(look);
    default: return buildQuadruped({ color: 0xff00ff, bodyW: 0.3, bodyH: 0.3, bodyL: 0.4, legH: 0.2, legW: 0.08, headS: 0.2 });
  }
}

// ---- creature view -------------------------------------------------------------------
export class CreatureView {
  constructor(data, scene) {
    this.id = data.id;
    this.data = data;
    this.scene = scene;
    this.root = new THREE.Group();
    this.root.name = `creature-${data.id}`;
    this.facing = DIR_ANGLE[data.d] ?? 0;
    this.pos = new THREE.Vector3(data.x + 0.5, 0, data.y + 0.5);
    this.from = this.pos.clone();
    this.to = this.pos.clone();
    this.moveStart = 0;
    this.moveDur = 0;
    this.headY = 1.05;
    this.time = Math.random() * 10;
    this.dead = false;
    this.build();
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.facing;
    scene.add(this.root);
    if (data.walk) this.startMove(data.walk.fx, data.walk.fy, data.x, data.y, data.walk.dur, data.walk.dur - data.walk.left);
  }

  build() {
    const d = this.data;
    let look = null;
    if (d.type === 'human') look = { human: true, ...(d.look || {}) };
    else look = MONSTER_LOOK[d.type] || { proc: 'other' };
    if (d.type !== 'human' && d.look) look = { ...look, human: true, ...d.look, kk: look.kk || 'Rogue_Hooded' };
    this.look = look;
    if (assets.custom.has(d.type)) this.buildCustom(d.type);
    else if ((look.human || look.kk) && assets.ready) this.buildCharacter(look);
    else if (look.proc) this.buildProcedural(look);
    else this.buildFallbackHuman(look);
  }

  buildCharacter(look) {
    const d = this.data;
    let base = look.kk;
    let recolor = look.recolor || null;
    if (Array.isArray(base)) base = base[d.id % base.length];
    if (!base) {
      if (d.k === 'n' && NPC_MODEL[d.name]) [base, recolor] = NPC_MODEL[d.name];
      else base = VOC_MODEL[look.voc] || 'Rogue';
      if (look.voc === 'druid') recolor = 'green';
      if (look.voc === 'paladin' && look.sex === 'f') base = 'Rogue';
    }
    const c = cloneCharacter(base);
    if (!c) { this.buildFallbackHuman(look); return; }
    this.char = c;
    if (recolor) recolorObject(c.root, recolor);
    // outfit tint for players: capes take the body colour, hats/hoods the head colour
    if (d.k === 'p' && look.body !== undefined) {
      for (const [name, mesh] of Object.entries(c.meshes)) {
        if (/Cape|Cloak/i.test(name)) mesh.material = tinted(mesh.material, OUTFIT_COLORS[look.body] ?? 0xffffff);
        else if (/Hat|Hood/i.test(name)) mesh.material = tinted(mesh.material, OUTFIT_COLORS[look.head] ?? 0xffffff);
      }
    }
    const s = CHAR_SCALE * (look.scale || 1);
    c.root.scale.setScalar(s);
    this.root.add(c.root);
    this.headY = 1.08 * (look.scale || 1) + (base === 'Mage' ? 0.15 : 0);
    this.mixer = new THREE.AnimationMixer(c.root);
    this.actions = {};
    this.equipGear(look);
    this.play(this.idleClip(), 0);
  }

  equipGear(look) {
    const c = this.char;
    if (!c) return;
    for (const g of this.gear || []) g.parent?.remove(g);
    this.gear = [];
    const eq = look.eq || {};
    const rKey = look.r || WEAPON_GEAR[eq.weapon];
    const lKey = look.l || SHIELD_GEAR[eq.shield];
    if (rKey && c.handR) { const m = gearModel(rKey); if (m) { c.handR.add(m); this.gear.push(m); } }
    if (lKey && c.handL) { const m = gearModel(lKey); if (m) { c.handL.add(m); this.gear.push(m); } }
    this.weaponKind = rKey && /crossbow/.test(rKey) ? 'bow' : rKey && /wand|staff/.test(rKey) ? 'wand' : rKey === 'spear' ? 'throw' : rKey && /2h/.test(rKey) ? '2h' : rKey ? '1h' : 'fist';
  }

  idleClip() {
    if (this.weaponKind === '2h') return '2H_Melee_Idle';
    if (this.weaponKind === 'fist') return 'Unarmed_Idle';
    return 'Idle';
  }

  play(name, fade = 0.2, once = false) {
    if (!this.mixer) return;
    const clip = assets.clips.get(name);
    if (!clip) return;
    let action = this.actions[name];
    if (!action) { action = this.mixer.clipAction(clip); this.actions[name] = action; }
    if (once) {
      action.reset();
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.fadeIn(0.08).play();
      this.oneShot = { action, name, until: performance.now() + clip.duration * 1000 / (action.timeScale || 1) - 120 };
      if (this.loop) this.loop.fadeOut(0.1);
      return;
    }
    if (this.loop === action) return;
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(fade).play();
    if (this.loop) this.loop.fadeOut(fade);
    this.loop = action;
    this.loopName = name;
  }

  buildCustom(type) {
    const c = cloneCustom(type);
    const cfg = c.cfg;
    this.custom = c;
    this.root.add(c.root);
    this.headY = c.height + 0.05;
    if (c.animations && c.animations.length) {
      this.customMixer = new THREE.AnimationMixer(c.root);
      const find = (re) => c.animations.find((a) => re.test(a.name));
      this.customClips = { idle: find(/idle/i) || c.animations[0], walk: find(/walk|run/i) || c.animations[0] };
      this.customAction = this.customMixer.clipAction(this.customClips.idle).play();
    } else {
      // static mesh: procedural walk cycle in the vertex shader
      const box = new THREE.Box3();
      c.root.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        box.union(o.geometry.boundingBox);
      });
      this.gait = cfg.gait || 'none';
      this.gaitU = applyGait(c.root, this.gait, box, cfg.rotY || 0);
      this.gaitPhase = Math.random() * 6.3;
      this.gaitAmt = 0;
    }
    // weapons in the hands of models that list hand positions (fractions of the height)
    const look = MONSTER_LOOK[type] || {};
    this.customGear = [];
    if (cfg.hands) {
      for (const [side, key] of [['r', look.r], ['l', look.l]]) {
        const p = cfg.hands[side];
        const m = key && p && gearModel(key);
        if (!m) continue;
        const h = c.height;
        m.scale.multiplyScalar((cfg.gearScale || 0.4) * h);
        m.position.set(p[0] * h, p[1] * h, p[2] * h);
        m.rotation.x = 0.45;
        if (side === 'l') { m.rotation.set(0, Math.PI / 2, 0); m.scale.multiplyScalar(0.8); }
        m.userData.base = m.position.clone();
        m.userData.side = side;
        c.root.add(m);
        this.customGear.push(m);
      }
    }
  }

  animateCustom(dt, walking, tps = 1) {
    const c = this.custom;
    if (this.customMixer) {
      const want = walking ? this.customClips.walk : this.customClips.idle;
      if (this.customAction.getClip() !== want) {
        const next = this.customMixer.clipAction(want);
        next.reset().fadeIn(0.2).play();
        this.customAction.fadeOut(0.2);
        this.customAction = next;
      }
      this.customMixer.update(dt);
    } else {
      // no rig: shader walk cycle, or whole-body hops and squashes
      const t = this.time;
      this.gaitAmt += ((walking ? 1 : 0) - this.gaitAmt) * Math.min(1, dt * 8);
      this.gaitPhase += dt * Math.max(4, tps * 5) * this.gaitAmt;
      const a = this.gaitAmt, ph = this.gaitPhase;
      if (this.gaitU) {
        this.gaitU.uPhase.value = ph;
        this.gaitU.uAmt.value = a;
        this.gaitU.uTime.value = t;
        c.root.position.y = Math.abs(Math.cos(ph)) * 0.025 * a * c.height;
        c.root.rotation.z = Math.sin(ph) * 0.02 * a;
      } else if (this.gait === 'hop') {
        c.root.position.y = Math.abs(Math.sin(ph * 0.5)) * 0.16 * a;
        c.root.rotation.z = 0;
      } else if (this.gait === 'blob') {
        const k = 1 + Math.sin(walking ? ph : t * 3) * (0.04 + 0.1 * a);
        c.root.scale.set(1 / Math.sqrt(k), k, 1 / Math.sqrt(k));
      } else {
        c.root.position.y = walking ? Math.abs(Math.sin(t * 9)) * 0.06 : Math.sin(t * 2) * 0.01;
        c.root.rotation.z = walking ? Math.sin(t * 9) * 0.05 : 0;
      }
      // held weapons swing with the arms (right arm forward when the left leg is)
      for (const m of this.customGear) {
        const swing = Math.sin(ph) * a * (m.userData.side === 'r' ? 1 : -1);
        m.position.z = m.userData.base.z + swing * 0.1 * c.height;
      }
    }
    if (this.lunge > 0) {
      this.lunge = Math.max(0, this.lunge - dt * 4);
      c.root.position.z = Math.sin(this.lunge * Math.PI) * 0.2;
    }
  }

  buildProcedural(look) {
    this.proc = buildProc(look);
    this.root.add(this.proc.group);
    this.headY = look.h ?? 0.8;
  }

  buildFallbackHuman(look) {
    const q = buildQuadruped({ color: OUTFIT_COLORS[look.body] ?? 0x8888cc, bodyW: 0.3, bodyH: 0.4, bodyL: 0.2, legH: 0.4, legW: 0.1, headS: 0.25, headColor: 0xf2c8a0 });
    q.group.rotation.x = 0;
    this.proc = q;
    this.root.add(q.group);
  }

  setLook(look) {
    this.data.look = look;
    if (this.char) { this.look = { ...this.look, ...look }; this.equipGear(this.look); if (!this.oneShot) this.play(this.idleClip(), 0.1); }
  }

  startMove(fx, fy, tx, ty, dur, elapsed = 0) {
    this.from.set(fx + 0.5, 0, fy + 0.5);
    this.to.set(tx + 0.5, 0, ty + 0.5);
    this.moveStart = performance.now() - elapsed;
    this.moveDur = Math.max(1, dur);
  }

  moveTo(x, y, dir, dur) {
    this.startMove(this.pos.x - 0.5, this.pos.z - 0.5, x, y, dur);
    this.from.copy(this.pos);
    this.data.x = x; this.data.y = y;
    this.setDir(dir);
  }

  teleport(x, y, dir) {
    this.data.x = x; this.data.y = y;
    this.pos.set(x + 0.5, 0, y + 0.5);
    this.from.copy(this.pos); this.to.copy(this.pos);
    this.moveDur = 0;
    if (dir !== undefined) { this.setDir(dir); this.root.rotation.y = this.facing; }
    this.root.position.copy(this.pos);
  }

  setDir(d) { if (DIR_ANGLE[d] !== undefined) this.facing = DIR_ANGLE[d]; this.data.d = d; }

  faceTowards(x, z) {
    const dx = x - this.pos.x, dz = z - this.pos.z;
    if (Math.abs(dx) + Math.abs(dz) > 0.01) this.facing = Math.atan2(dx, dz);
  }

  attack(kind, target) {
    if (target) this.faceTowards(target.pos.x, target.pos.z);
    if (this.mixer) {
      const k = kind || this.weaponKind;
      const clip = k === 'bow' ? '1H_Ranged_Shoot' : k === 'wand' ? 'Spellcast_Shoot' : k === 'throw' ? 'Throw'
        : k === 'spin' ? '2H_Melee_Attack_Spin' : k === '2h' ? '2H_Melee_Attack_Chop' : k === 'fist' ? 'Unarmed_Melee_Attack_Punch_A'
          : k === 'spell' ? 'Spellcast_Raise' : (this.id % 2 ? '1H_Melee_Attack_Chop' : '1H_Melee_Attack_Slice_Diagonal');
      this.play(clip, 0.05, true);
    } else this.lunge = 1;
  }

  hit() {
    if (this.mixer && !this.oneShot) this.play(this.id % 2 ? 'Hit_A' : 'Hit_B', 0.05, true);
    this.flash = 1;
  }

  get walking() { return this.moveDur > 0 && performance.now() - this.moveStart < this.moveDur + 60; }

  update(dt, now) {
    this.time += dt;
    // position interpolation
    if (this.moveDur > 0) {
      const t = Math.min(1, (now - this.moveStart) / this.moveDur);
      this.pos.lerpVectors(this.from, this.to, t);
      if (t >= 1 && now - this.moveStart > this.moveDur + 80) this.moveDur = 0;
    }
    this.root.position.copy(this.pos);
    // smooth turning
    let da = this.facing - this.root.rotation.y;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    this.root.rotation.y += da * Math.min(1, dt * 14);
    const walking = this.walking;
    const tps = this.moveDur > 0 ? 1000 / this.moveDur : 0;
    if (this.mixer) {
      if (this.oneShot && now > this.oneShot.until) { this.oneShot.action.fadeOut(0.15); this.oneShot = null; this.loop = null; }
      if (!this.oneShot) {
        if (walking) {
          const run = tps > 1.7;
          this.play(run ? 'Running_A' : 'Walking_A', 0.15);
          if (this.loop) this.loop.timeScale = Math.max(0.6, Math.min(1.8, run ? tps / 2.4 : tps / 1.3));
        } else {
          this.play(this.idleClip(), 0.25);
          if (this.loop) this.loop.timeScale = 1;
        }
      }
      this.mixer.update(dt);
    } else if (this.custom) this.animateCustom(dt, walking, tps);
    else if (this.proc) this.animateProc(dt, walking, tps);
  }

  animateProc(dt, walking, tps) {
    const p = this.proc, t = this.time;
    const sp = walking ? Math.max(4, tps * 5) : 0;
    this.phase = (this.phase || 0) + dt * sp;
    const sw = walking ? Math.sin(this.phase) : 0;
    if (p.kind === 'quad' || p.kind === 'dragon') {
      p.legs.forEach((l, i) => { l.rotation.x = (i === 0 || i === 3 ? sw : -sw) * 0.6; });
      p.body.position.y = p.body.userData.y0 ?? (p.body.userData.y0 = p.body.position.y);
      p.body.position.y = p.body.userData.y0 + (p.hop && walking ? Math.abs(Math.sin(this.phase)) * 0.12 : Math.sin(t * 2) * 0.01);
      if (p.tail) p.tail.rotation.y = Math.sin(t * 3) * 0.25;
      if (p.head) p.head.rotation.x = Math.sin(t * 1.3) * 0.05 + (this.lunge > 0 ? -0.4 * this.lunge : 0);
      if (p.wings) p.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (0.25 + Math.sin(t * (walking ? 6 : 2)) * 0.35); });
    } else if (p.kind === 'snake') {
      p.segs.forEach((s, i) => { s.position.x = Math.sin(t * (walking ? 9 : 2) - i * 0.9) * 0.05 * (i > 0 ? 1 : 0.4); });
    } else if (p.kind === 'spider') {
      p.legs.forEach((l, i) => { l.rotation.x = Math.sin(this.phase * 1.5 + i * 1.3) * (walking ? 0.35 : 0.05); });
      p.body.position.y = 0.22 + Math.sin(t * 6) * 0.01;
    } else if (p.kind === 'slime') {
      const sq = walking ? Math.sin(this.phase) : Math.sin(t * 2.5) * 0.4;
      p.body.scale.set(1 + sq * 0.08, 1 - sq * 0.12, 1 + sq * 0.08);
    } else if (p.kind === 'bat') {
      p.body.position.y = 0.7 + Math.sin(t * 3) * 0.08;
      p.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * Math.sin(t * 18) * 0.7; });
    }
    if (this.lunge > 0) {
      this.lunge = Math.max(0, this.lunge - dt * 4);
      p.group.position.z = Math.sin(this.lunge * Math.PI) * 0.2;
    }
  }

  // Corpse pose (used for ground corpses): lie down / last death frame.
  pose(deadPose) {
    if (this.mixer) {
      const clip = assets.clips.get(deadPose ? 'Death_A_Pose' : 'Idle');
      if (clip) { const a = this.mixer.clipAction(clip); a.play(); this.mixer.update(0.01); }
      this.mixer = null;
    } else if (this.custom) {
      this.custom.root.rotation.z = Math.PI / 2;
      this.custom.root.position.y = 0.15;
      this.customMixer = null;
    } else if (this.proc) {
      this.proc.group.rotation.z = Math.PI / 2;
      this.proc.group.position.y = 0.12;
      this.proc.group.traverse((o) => { if (o.isMesh) o.material = o.material.clone(), o.material.color.multiplyScalar(0.55); });
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.mixer?.stopAllAction();
  }
}

export function makeCorpse(item, scene) {
  const fake = { id: item.u, type: item.c, look: item.look, k: item.c === 'human' ? 'p' : 'm', x: item.x, y: item.y, d: 2 };
  const v = new CreatureView(fake, scene);
  v.pose(true);
  v.root.rotation.y = ((item.u * 37) % 360) * Math.PI / 180;
  return v;
}
