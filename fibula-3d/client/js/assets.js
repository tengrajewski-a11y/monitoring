// Loading of the CC0 KayKit model bundles (see CREDITS.md) and helpers to
// instance props, clone rigged characters and recolour textures.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const BASE = '/assets/models/';
export const CHARACTERS = ['Knight', 'Barbarian', 'Mage', 'Rogue', 'Rogue_Hooded',
  'Skeleton_Minion', 'Skeleton_Warrior', 'Skeleton_Mage', 'Skeleton_Rogue'];

// Character-pack meshes that are props (weapons, shields...) – hidden by
// default, equipment is attached from gear.glb instead.
const PROP_MESH = /(Sword|Shield|Axe|Mug|Crossbow|Knife|Dagger|Spellbook|Wand|Staff|Blade|Quiver|Arrow|Throwable|Bow)/i;

export const assets = {
  ready: false,
  props: new Map(),   // key -> { parts: [{geometry, material, matrix}], box }
  gear: new Map(),    // key -> Object3D template
  chars: new Map(),   // name -> Object3D template
  clips: new Map(),   // name -> AnimationClip
  custom: new Map(),  // creature type -> { scene, animations, cfg } (e.g. Meshy AI models)
                      // entries marked "prop" also become props named "prop:<key>" (statues, wells...)
  failed: false,
};

const matCache = new Map();

export function toLambert(m) {
  if (!m) return m;
  if (Array.isArray(m)) return m.map(toLambert);
  let out = matCache.get(m.uuid);
  if (out) return out;
  if (m.map) { m.map.magFilter = THREE.NearestFilter; m.map.minFilter = THREE.NearestMipmapLinearFilter; m.map.anisotropy = 1; }
  out = new THREE.MeshLambertMaterial({
    name: m.name, map: m.map || null, color: m.color ? m.color.clone() : new THREE.Color(0xffffff),
    emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0), emissiveMap: m.emissiveMap || null,
    transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, vertexColors: m.vertexColors,
    flatShading: m.flatShading, // GLTFLoader sets it for meshes without normals (e.g. TripoSR output)
  });
  if (m.emissive && m.emissive.getHex() !== 0) out.emissiveIntensity = Math.max(1, m.emissiveIntensity || 1);
  matCache.set(m.uuid, out);
  return out;
}

function prepare(root) {
  root.traverse((o) => {
    if (o.isMesh) {
      o.material = toLambert(o.material);
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
}

function extractParts(wrapper) {
  wrapper.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(wrapper.matrixWorld).invert();
  const parts = [];
  wrapper.traverse((o) => {
    if (!o.isMesh) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    parts.push({ geometry: o.geometry, material: o.material, matrix: m });
  });
  const box = new THREE.Box3();
  for (const p of parts) {
    if (!p.geometry.boundingBox) p.geometry.computeBoundingBox();
    box.union(p.geometry.boundingBox.clone().applyMatrix4(p.matrix));
  }
  return { parts, box };
}

export async function loadAssets(onProgress = () => {}) {
  const loader = new GLTFLoader();
  const total = 3 + CHARACTERS.length;
  let done = 0;
  const step = () => onProgress(++done / total);
  try {
    const [props, gear, anims] = await Promise.all([
      loader.loadAsync(BASE + 'props.glb').then((g) => (step(), g)),
      loader.loadAsync(BASE + 'gear.glb').then((g) => (step(), g)),
      loader.loadAsync(BASE + 'anims.glb').then((g) => (step(), g)),
    ]);
    for (const w of props.scene.children) { prepare(w); assets.props.set(w.name, extractParts(w)); }
    for (const w of gear.scene.children) { prepare(w); w.position.set(0, 0, 0); assets.gear.set(w.name, w); }
    for (const c of anims.animations) assets.clips.set(c.name, c);
    await Promise.all(CHARACTERS.map(async (name) => {
      const g = await loader.loadAsync(`${BASE}chars/${name}.glb`);
      prepare(g.scene);
      g.scene.traverse((o) => { if (o.isMesh && PROP_MESH.test(o.name)) o.userData.prop = true; });
      assets.chars.set(name, g.scene);
      step();
    }));
    await loadCustom(loader);
    assets.ready = true;
  } catch (e) {
    console.warn('Nie udało się wczytać modeli 3D, używam modeli zastępczych.', e);
    assets.failed = true;
  }
  return assets;
}

// Optional user models (tools/meshy_generate.py writes models/custom/manifest.json).
// Zero-length normals (e.g. back to back faces sharing vertices) light as NaN.
function fixNormals(root) {
  root.traverse((o) => {
    const n = o.isMesh && o.geometry.attributes.normal;
    if (!n) return;
    for (let i = 0; i < n.count; i++) {
      if (!(Math.abs(n.getX(i)) + Math.abs(n.getY(i)) + Math.abs(n.getZ(i)) > 1e-6)) n.setXYZ(i, 0, 1, 0);
    }
    n.needsUpdate = true;
  });
}

async function loadCustom(loader) {
  let manifest;
  try {
    const r = await fetch(BASE + 'custom/manifest.json');
    if (!r.ok) return;
    manifest = await r.json();
  } catch { return; }
  await Promise.all(Object.entries(manifest).map(async ([key, cfg]) => {
    try {
      const g = await loader.loadAsync(BASE + 'custom/' + cfg.file);
      fixNormals(g.scene);
      prepare(g.scene);
      assets.custom.set(key, { scene: g.scene, animations: g.animations, cfg });
      if (cfg.prop) assets.props.set(`prop:${key}`, propParts(g.scene, cfg));
    } catch (e) { console.warn('Nie udało się wczytać modelu', key, e); }
  }));
}

// world object from a custom model: turned by rotX/rotY, scaled to its height
// in tiles, centred and standing on y = 0, like the KayKit props
function propParts(scene, cfg) {
  const inner = scene.clone();
  inner.rotation.x = ((cfg.rotX || 0) * Math.PI) / 180;
  const mid = new THREE.Group();
  mid.rotation.y = ((cfg.rotY || 0) * Math.PI) / 180;
  mid.add(inner);
  const wrap = new THREE.Group();
  wrap.add(mid);
  wrap.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mid);
  const size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3());
  const s = (cfg.height || 1) / Math.max(0.001, size.y);
  mid.scale.setScalar(s);
  mid.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  return extractParts(wrap);
}

export function cloneCustom(key) {
  const c = assets.custom.get(key);
  if (!c) return null;
  const inner = cloneSkinned(c.scene);
  inner.rotation.x = ((c.cfg.rotX || 0) * Math.PI) / 180;
  const root = new THREE.Group();
  root.add(inner);
  // normalise: requested height in tiles, centred, standing on y = 0
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const s = (c.cfg.height || 1) / Math.max(0.001, size.y);
  root.scale.setScalar(s);
  const center = box.getCenter(new THREE.Vector3());
  root.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  const wrap = new THREE.Group();
  wrap.rotation.y = ((c.cfg.rotY || 0) * Math.PI) / 180;
  wrap.add(root);
  return { root: wrap, animations: c.animations, height: c.cfg.height || 1, cfg: c.cfg };
}

export function cloneCharacter(name) {
  const tpl = assets.chars.get(name);
  if (!tpl) return null;
  const root = cloneSkinned(tpl);
  const meshes = {};
  root.traverse((o) => {
    if (o.isMesh) {
      meshes[o.name] = o;
      if (o.userData.prop) o.visible = false;
      o.frustumCulled = false;
    }
  });
  return {
    root, meshes,
    handR: root.getObjectByName('handslot.r'),
    handL: root.getObjectByName('handslot.l'),
    head: root.getObjectByName('head'),
  };
}

export function cloneGear(key) {
  const t = assets.gear.get(key);
  return t ? t.clone(true) : null;
}

// ---- texture recolouring --------------------------------------------------------
const recolorCache = new Map();

function hsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

function rgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

// Recolour rules: each rule maps a hue range to a new hue/saturation.
export const RECOLORS = {
  orc: [{ from: [0.02, 0.11], minL: 0.45, minS: 0.25, hue: 0.27, sat: 0.45, lmul: 0.85 }],
  troll: [{ from: [0.02, 0.11], minL: 0.45, minS: 0.25, hue: 0.2, sat: 0.3, lmul: 0.8 }],
  swamp: [{ from: [0.02, 0.11], minL: 0.45, minS: 0.25, hue: 0.42, sat: 0.35, lmul: 0.8 }],
  dark: [{ from: [0.25, 0.5], hue: 0.0, sat: 0.05, lmul: 0.55 }],
  white: [{ from: [0.6, 0.85], hue: 0.12, sat: 0.15, lmul: 1.6 }],
  green: [{ from: [0.6, 0.85], hue: 0.3, sat: 0.45, lmul: 0.9 }],
  red: [{ from: [0.25, 0.5], hue: 0.0, sat: 0.55, lmul: 0.9 }],
  purple: [{ from: [0.9, 1.0], hue: 0.78, sat: 0.5, lmul: 0.9 }, { from: [0.0, 0.05], hue: 0.78, sat: 0.5, lmul: 0.9 }],
  ghoul: [{ from: [0.05, 0.2], minL: 0.55, hue: 0.25, sat: 0.18, lmul: 0.75 }],
  blue: [{ from: [0.25, 0.5], hue: 0.6, sat: 0.5, lmul: 0.9 }],
};

function recolorTexture(tex, ruleName) {
  const key = `${tex.uuid}:${ruleName}`;
  let out = recolorCache.get(key);
  if (out) return out;
  const img = tex.image;
  const w = img.width, h = img.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const rules = RECOLORS[ruleName] || [];
  for (let i = 0; i < px.length; i += 4) {
    const [hh, ss, ll] = hsl(px[i], px[i + 1], px[i + 2]);
    for (const r of rules) {
      if (hh < r.from[0] || hh > r.from[1]) continue;
      if (r.minL && ll < r.minL) continue;
      if (r.minS && ss < r.minS) continue;
      const [nr, ng, nb] = rgb(r.hue, Math.min(1, r.sat ?? ss), Math.min(0.95, ll * (r.lmul ?? 1)));
      px[i] = nr; px[i + 1] = ng; px[i + 2] = nb;
      break;
    }
  }
  ctx.putImageData(data, 0, 0);
  out = new THREE.CanvasTexture(cv);
  out.flipY = tex.flipY;
  out.colorSpace = tex.colorSpace;
  out.magFilter = THREE.NearestFilter;
  out.minFilter = THREE.NearestMipmapLinearFilter;
  out.wrapS = tex.wrapS; out.wrapT = tex.wrapT;
  recolorCache.set(key, out);
  return out;
}

const recolorMatCache = new Map();
export function recolorObject(root, ruleName) {
  if (!ruleName) return;
  root.traverse((o) => {
    if (!o.isMesh || !o.material || !o.material.map) return;
    const key = `${o.material.uuid}:${ruleName}`;
    let m = recolorMatCache.get(key);
    if (!m) {
      m = o.material.clone();
      m.map = recolorTexture(o.material.map, ruleName);
      recolorMatCache.set(key, m);
    }
    o.material = m;
  });
}
