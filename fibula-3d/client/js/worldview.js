// Builds the 3D representation of the tile map: ground chunks, walls, rocks,
// procedural decorations, instanced KayKit props, liquids, roofs and clouds.

import * as THREE from 'three';
import { G, O, OBJ, GROUND } from '/shared/constants.js';
import { tileHash } from '/shared/map.js';
import { Geo, lin } from './geo.js';
import { assets } from './assets.js';

const CHUNK = 16;
const WALL_T = 0.44;

// Client-side palette (KayKit-like soft colours).
const GCOL = {
  [G.GRASS]: [0x86bf4e, 0x7cb446], [G.FOREST]: [0x5f9e3e, 0x58953a], [G.DIRT]: [0xb98856, 0xae7f4f],
  [G.SAND]: [0xebd59c, 0xe2ca8c], [G.COBBLE]: [0xb0b2b9, 0x9fa1a9], [G.WOOD]: [0xc28c57, 0xb6814e],
  [G.CAVE]: [0x7a6e60, 0x716557], [G.SWAMP]: [0x66733f, 0x5e6b3a], [G.MARBLE]: [0xf0ece4, 0xd8d2c6],
  [G.ROCK]: [0x9a958b, 0x908b81], [G.BRIDGE]: [0xbe8a58, 0xab7a4a], [G.CARPET]: [0xb83434, 0xaa2c2c],
  [G.CRYPT]: [0x74748a, 0x6a6a80], [G.WATER]: [0x3f95dc, 0x3b8ed4], [G.SHALLOW]: [0x66bde8, 0x5fb5e2],
  [G.DEEPWATER]: [0x2c72bd, 0x2a6cb5], [G.LAVA]: [0xff7a1a, 0xff5a0a],
};

const WALLISH = new Set([O.WALL_STONE, O.WALL_WOOD, O.WALL_CRYPT, O.WALL_TORCH, O.DOOR]);

function seeded(x, y, z, k) { return tileHash(x * 7 + k * 131, y * 13 + k * 17, z); }

// Shader patch: wind sway (geometry attribute or instanced height based),
// and a per-material "cut" height used to peek inside buildings.
function patchMaterial(mat, uniforms, { sway = false, instSway = false, cut = null } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    if (cut) sh.uniforms.uCut = cut;
    let decl = 'uniform float uTime;\n';
    if (sway) decl += 'attribute float sway;\n';
    if (cut) decl += 'uniform float uCut;\n';
    sh.vertexShader = decl + sh.vertexShader;
    let body = '#include <begin_vertex>\n';
    if (sway) body += 'transformed.x += sin(uTime * 1.7 + position.x * 0.7 + position.z * 0.5) * sway * 0.045;\ntransformed.z += cos(uTime * 1.3 + position.x * 0.4 + position.z * 0.8) * sway * 0.03;\n';
    if (instSway) body += '#ifdef USE_INSTANCING\n float hh = max(position.y, 0.0);\n transformed.x += sin(uTime * 1.6 + instanceMatrix[3].x * 0.8 + instanceMatrix[3].z * 0.6) * hh * 0.035;\n transformed.z += cos(uTime * 1.2 + instanceMatrix[3].z * 0.7) * hh * 0.025;\n#endif\n';
    if (cut) body += 'if (transformed.y > uCut) transformed.y = uCut;\n';
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', body);
  };
  mat.customProgramCacheKey = () => `${sway ? 's' : ''}${instSway ? 'i' : ''}${cut ? 'c' : ''}`;
  return mat;
}

export class WorldView {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    this.floors = new Map();
    this.uniforms = { uTime: { value: 0 } };
    this.current = null;
    this.hiddenRoof = 0;
    this.solidMat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), this.uniforms, { sway: true });
    // glowing parts are brighter than white so the HDR bloom picks them up
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(2.6, 2.6, 2.6) });
    this.waterMat = this.makeLiquidMaterial(false);
    this.lavaMat = this.makeLiquidMaterial(true);
    this.lights = new Map();
  }

  makeLiquidMaterial(lava) {
    const m = lava ? new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, color: new THREE.Color(1.15, 1.15, 1.15) })
      : new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.84 });
    const u = this.uniforms;
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = u.uTime;
      sh.vertexShader = 'uniform float uTime;\nvarying vec3 vWP;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed.y += sin(uTime * 1.4 + position.x * 1.3) * 0.025 + cos(uTime * 1.1 + position.z * 1.7) * 0.025;\nvWP = position;');
      sh.fragmentShader = 'uniform float uTime;\nvarying vec3 vWP;\n' + sh.fragmentShader.replace('#include <color_fragment>',
        `#include <color_fragment>
        float w = sin(vWP.x * 2.1 + uTime * 1.3) * cos(vWP.z * 1.7 - uTime * 0.9) + sin((vWP.x + vWP.z) * 3.3 + uTime * 2.0) * 0.5;
        ${lava ? 'diffuseColor.rgb *= 0.85 + 0.35 * w; diffuseColor.rgb += vec3(0.25, 0.08, 0.0) * smoothstep(0.6, 1.2, w);'
    : 'diffuseColor.rgb += vec3(0.10, 0.14, 0.16) * smoothstep(0.75, 1.3, w);'}`);
    };
    m.customProgramCacheKey = () => (lava ? 'lava' : 'water');
    return m;
  }

  build() {
    for (const f of this.map.floors) this.buildFloor(f.z);
    this.buildClouds();
  }

  // ------------------------------------------------------------------------
  buildFloor(z) {
    const map = this.map;
    const group = new THREE.Group();
    group.name = `floor${z}`;
    group.visible = false;
    const floor = { z, group, roofs: new Map(), lights: [], props: new Map() };
    this.floors.set(z, floor);
    this.scene.add(group);
    const liquid = new Geo(), lava = new Geo();
    const roofWalls = new Map();
    const wallGeo = (x, y) => {
      const r = map.roof(x, y, z);
      if (!r) return null;
      let g = roofWalls.get(r);
      if (!g) roofWalls.set(r, (g = new Geo()));
      return g;
    };

    for (let cy = 0; cy < map.h; cy += CHUNK) for (let cx = 0; cx < map.w; cx += CHUNK) {
      const geo = new Geo(), glow = new Geo();
      for (let y = cy; y < cy + CHUNK; y++) for (let x = cx; x < cx + CHUNK; x++) {
        const g = map.ground(x, y, z);
        if (g === G.NONE) continue;
        const gd = GROUND[g];
        if (gd.liquid) this.liquidTile(g === G.LAVA ? lava : liquid, x, y, z, g);
        else this.groundTile(geo, x, y, z, g);
        const o = map.obj(x, y, z);
        if (o) this.object(geo, glow, wallGeo(x, y) || geo, floor, x, y, z, o, map.variant(x, y, z));
        if (OBJ[o]?.light) floor.lights.push({ x: x + 0.5, y: y + 0.5, r: OBJ[o].light[0], color: OBJ[o].light[1], h: o === O.LAMP_POST ? 1.3 : 1.0 });
        if (g === G.LAVA && tileHash(x, y, z) < 0.25) floor.lights.push({ x: x + 0.5, y: y + 0.5, r: 4, color: 0xff6010, h: 0.4 });
      }
      if (geo.count) {
        const mesh = new THREE.Mesh(geo.build(), this.solidMat);
        mesh.castShadow = true; mesh.receiveShadow = true;
        group.add(mesh);
      }
      if (glow.count) group.add(new THREE.Mesh(glow.build(), this.glowMat));
    }
    if (liquid.count) { const m = new THREE.Mesh(liquid.build(), this.waterMat); m.receiveShadow = true; group.add(m); }
    if (lava.count) group.add(new THREE.Mesh(lava.build(), this.lavaMat));

    // buildings: walls (with cutaway uniform) and roofs
    for (const r of map.roofs) {
      if (r.z !== z) continue;
      const cut = { value: 99 };
      const entry = { cut, roof: null, walls: null };
      const wg = roofWalls.get(r.id);
      if (wg && wg.count) {
        const mat = patchMaterial(new THREE.MeshLambertMaterial({ vertexColors: true }), this.uniforms, { cut });
        entry.walls = new THREE.Mesh(wg.build(), mat);
        entry.walls.castShadow = true; entry.walls.receiveShadow = true;
        group.add(entry.walls);
      }
      entry.roof = this.buildRoof(r);
      group.add(entry.roof);
      floor.roofs.set(r.id, entry);
    }

    // instanced KayKit props
    for (const [key, list] of floor.props) {
      const prop = assets.props.get(key);
      if (!prop || !list.length) continue;
      for (const part of prop.parts) {
        let mat = part.material;
        if (list.sway) {
          mat = patchMaterial(part.material.clone(), this.uniforms, { instSway: true });
        }
        const inst = new THREE.InstancedMesh(part.geometry, mat, list.length);
        const m = new THREE.Matrix4();
        list.forEach((mx, i) => { m.multiplyMatrices(mx, part.matrix); inst.setMatrixAt(i, m); });
        inst.instanceMatrix.needsUpdate = true;
        inst.castShadow = !list.noShadow; inst.receiveShadow = true;
        inst.computeBoundingSphere();
        group.add(inst);
      }
    }
    floor.props = null;
  }

  // queue an instanced prop; returns false if the model is unavailable
  prop(floor, key, x, z, rot, scale, y = 0, opts = {}) {
    const p = assets.props.get(key);
    if (!p) return false;
    let list = floor.props.get(key);
    if (!list) { list = []; floor.props.set(key, list); }
    if (opts.sway) list.sway = true;
    if (opts.noShadow) list.noShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot);
    const yb = y - p.box.min.y * scale;
    m.compose(new THREE.Vector3(x, yb, z), q, new THREE.Vector3(scale, scale, scale));
    list.push(m);
    return true;
  }

  // ------------------------------------------------------------------------
  groundTile(geo, x, y, z, g) {
    const map = this.map;
    const h = tileHash(x, y, z);
    const pal = GCOL[g] || [0x888888, 0x808080];
    const jitter = 0.94 + h * 0.12;
    const base = lin(pal[h < 0.5 ? 0 : 1], jitter);
    const x0 = x, x1 = x + 1, z0 = y, z1 = y + 1;
    const top = (col, y0 = 0) => geo.quad([x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0], col);
    switch (g) {
      case G.COBBLE: {
        top(lin(0x6c6e75));
        for (let i = 0; i < 4; i++) {
          const sx = x0 + (i % 2) * 0.5, sz = z0 + (i >> 1) * 0.5;
          const hh = seeded(x, y, z, i);
          geo.box(sx + 0.04, 0, sz + 0.04, sx + 0.46, 0.035 + hh * 0.02, sz + 0.46, lin(pal[hh < 0.5 ? 0 : 1], 0.9 + hh * 0.2), { side: 0.7 });
        }
        break;
      }
      case G.WOOD: case G.BRIDGE: {
        const y0 = g === G.BRIDGE ? 0.06 : 0;
        top(lin(0x5a3c22), y0 - 0.01);
        const vertical = g === G.BRIDGE && this.isWaterish(x - 1, y, z) && this.isWaterish(x + 1, y, z);
        for (let i = 0; i < 3; i++) {
          const hh = seeded(x, y, z, i);
          const c = lin(pal[hh < 0.5 ? 0 : 1], 0.9 + hh * 0.2);
          if (vertical) geo.box(x0 + 0.02, y0, z0 + i / 3 + 0.02, x1 - 0.02, y0 + 0.04, z0 + (i + 1) / 3 - 0.02, c, { side: 0.7 });
          else geo.box(x0 + i / 3 + 0.02, y0, z0 + 0.02, x0 + (i + 1) / 3 - 0.02, y0 + 0.04, z1 - 0.02, c, { side: 0.7 });
        }
        if (g === G.BRIDGE) {
          for (const [px, pz] of [[x0 + 0.06, z0 + 0.06], [x1 - 0.06, z1 - 0.06]]) geo.box(px - 0.05, -0.5, pz - 0.05, px + 0.05, 0.06, pz + 0.05, lin(0x6b4a2b));
        }
        break;
      }
      case G.MARBLE: {
        const c = lin((x + y) % 2 ? 0xf2eee6 : 0xd2ccbf, 0.97 + h * 0.06);
        geo.box(x0 + 0.02, -0.02, z0 + 0.02, x1 - 0.02, 0.02, z1 - 0.02, c, { side: 0.8 });
        top(lin(0x9f998d), -0.01);
        break;
      }
      case G.CARPET: {
        top(lin(0xe0b040), 0);
        geo.box(x0 + 0.1, 0, z0 - 0.0, x1 - 0.1, 0.02, z1, lin(0xb83434, jitter), { side: 0.7 });
        break;
      }
      case G.CRYPT: {
        top(lin(0x45455a));
        for (let i = 0; i < 2; i++) {
          const hh = seeded(x, y, z, i);
          geo.box(x0 + 0.04, 0, z0 + i * 0.5 + 0.04, x1 - 0.04, 0.03, z0 + i * 0.5 + 0.46, lin(pal[hh < 0.5 ? 0 : 1], 0.88 + hh * 0.2), { side: 0.7 });
        }
        break;
      }
      default: {
        top(base);
        // tufts / pebbles for texture
        if ((g === G.GRASS || g === G.FOREST) && h > 0.55) {
          const c = lin(g === G.FOREST ? 0x4c8a32 : 0x6fa83c);
          for (let i = 0; i < 3; i++) {
            const px = x0 + 0.15 + seeded(x, y, z, i) * 0.7, pz = z0 + 0.15 + seeded(x, y, z, i + 5) * 0.7;
            geo.tri([px - 0.05, 0, pz], [px + 0.01, 0.14, pz], [px + 0.05, 0, pz + 0.01], c, (v) => (v[1] > 0.05 ? 0.5 : 0));
          }
        } else if ((g === G.DIRT || g === G.CAVE || g === G.ROCK) && h > 0.7) {
          const c = lin(g === G.DIRT ? 0x8a6a48 : 0x5e554a);
          const px = x0 + 0.2 + h * 0.5, pz = z0 + 0.3 + seeded(x, y, z, 2) * 0.4;
          geo.box(px, 0, pz, px + 0.1, 0.05, pz + 0.08, c);
        } else if (g === G.SAND && h > 0.8) {
          geo.quad([x0 + 0.1, 0.005, z0 + 0.4], [x0 + 0.1, 0.005, z0 + 0.46], [x1 - 0.1, 0.005, z0 + 0.46], [x1 - 0.1, 0.005, z0 + 0.4], lin(0xd8c084));
        } else if (g === G.SWAMP && h > 0.86) {
          const pc = lin(0x56663a);
          geo.quad([x0 + 0.2, 0.005, z0 + 0.35], [x0 + 0.35, 0.005, z0 + 0.72], [x0 + 0.62, 0.005, z0 + 0.66], [x0 + 0.5, 0.005, z0 + 0.3], pc);
          geo.tri([x0 + 0.5, 0.005, z0 + 0.3], [x0 + 0.62, 0.005, z0 + 0.66], [x0 + 0.78, 0.005, z0 + 0.42], pc);
        }
      }
    }
    // shore walls next to liquids
    const shore = lin(g === G.SAND ? 0xc9b077 : 0x8e6a45, 0.8);
    if (this.isWaterish(x, y - 1, z)) geo.quad([x1, -0.55, z0], [x1, 0, z0], [x0, 0, z0], [x0, -0.55, z0], shore);
    if (this.isWaterish(x, y + 1, z)) geo.quad([x0, -0.55, z1], [x0, 0, z1], [x1, 0, z1], [x1, -0.55, z1], shore);
    if (this.isWaterish(x - 1, y, z)) geo.quad([x0, -0.55, z0], [x0, 0, z0], [x0, 0, z1], [x0, -0.55, z1], shore);
    if (this.isWaterish(x + 1, y, z)) geo.quad([x1, -0.55, z1], [x1, 0, z1], [x1, 0, z0], [x1, -0.55, z0], shore);
  }

  isWaterish(x, y, z) { const g = GROUND[this.map.ground(x, y, z)]; return !!(g && g.liquid); }

  liquidTile(geo, x, y, z, g) {
    const pal = GCOL[g];
    const h = tileHash(x, y, z);
    const depth = g === G.SHALLOW ? -0.08 : g === G.LAVA ? -0.06 : g === G.DEEPWATER ? -0.18 : -0.13;
    const c = lin(pal[h < 0.5 ? 0 : 1], 0.97 + h * 0.06);
    geo.quad([x, depth, y], [x, depth, y + 1], [x + 1, depth, y + 1], [x + 1, depth, y], c);
  }

  // ------------------------------------------------------------------------
  object(geo, glow, wgeo, floor, x, y, z, o, v) {
    const map = this.map;
    const cx = x + 0.5, cz = y + 0.5;
    const h = tileHash(x, y, z), h2 = seeded(x, y, z, 3), h3 = seeded(x, y, z, 9);
    const rot = h2 * Math.PI * 2;
    const P = (key, s, opts, yy = 0, r = rot, ox = 0, oz = 0) => this.prop(floor, key, cx + ox, cz + oz, r, s, yy, opts || {});
    switch (o) {
      case O.PINE:
        if (h < 0.06 && P(h3 < 0.5 ? 'tree_pine_orange' : 'tree_pine_yellow', 0.36 + h2 * 0.08, { sway: true })) return;
        if (P(h3 < 0.55 ? 'tree_b' : 'tree_a', 1.75 + h * 0.6, { sway: true }, 0, rot, (h3 - 0.5) * 0.2, (h2 - 0.5) * 0.2)) return;
        this.procPine(geo, cx, cz, h);
        return;
      case O.OAK: this.procOak(geo, cx, cz, h, 0x5aa83a, 0x6b4a2a); return;
      case O.BIRCH: this.procOak(geo, cx, cz, h, 0x9fcf4f, 0xe8e4da, true); return;
      case O.DEAD_TREE:
        if (P(h < 0.5 ? 'tree_dead_s' : 'tree_dead_m', 0.36 + h3 * 0.1)) return;
        geo.prism(cx, 0, cz, 0.09, 1.4, 5, lin(0x5a4636), { r1: 0.04 });
        return;
      case O.BUSH: {
        const c = lin(0x4e8f34, 0.9 + h * 0.2);
        geo.blob(cx, 0.26, cz, 0.36, c, { sy: 0.75, sway: 0.4 });
        geo.blob(cx + 0.16, 0.22, cz + 0.08, 0.24, lin(0x5aa03c), { sy: 0.8, sway: 0.4 });
        if (h > 0.5) for (let i = 0; i < 3; i++) geo.box(cx - 0.2 + i * 0.15, 0.35 + i * 0.04, cz + 0.22, cx - 0.16 + i * 0.15, 0.39 + i * 0.04, cz + 0.27, lin(0xd23a3a));
        return;
      }
      case O.BOULDER:
        if (P(h < 0.5 ? 'rock_e' : 'rock_c', 2.3 + h3 * 0.7)) return;
        geo.blob(cx, 0.3, cz, 0.42, lin(0x9da2a8), { sy: 0.8 });
        return;
      case O.ROCK_SMALL:
        if (P(h < 0.5 ? 'rock_b' : 'rock_d', 2.0 + h3 * 0.5)) return;
        geo.blob(cx, 0.15, cz, 0.25, lin(0x9da2a8), { sy: 0.7 });
        return;
      case O.PEBBLES:
        for (let i = 0; i < 3; i++) P('rock_a', 1.2 + seeded(x, y, z, i) * 0.6, null, 0, rot + i, (seeded(x, y, z, i + 3) - 0.5) * 0.6, (seeded(x, y, z, i + 6) - 0.5) * 0.6);
        return;
      case O.FLOWERS: {
        const cols = [0xe84a4a, 0xf2d43c, 0xffffff, 0xb070e0, 0x5aa0f0, 0xf08cc0];
        for (let i = 0; i < 5; i++) {
          const px = x + 0.15 + seeded(x, y, z, i) * 0.7, pz = y + 0.15 + seeded(x, y, z, i + 7) * 0.7;
          geo.box(px - 0.01, 0, pz - 0.01, px + 0.01, 0.12, pz + 0.01, lin(0x4a8a2a), { sway: 0.3 });
          geo.box(px - 0.04, 0.12, pz - 0.04, px + 0.04, 0.17, pz + 0.04, lin(cols[Math.floor(seeded(x, y, z, i + 2) * cols.length)]), { sway: 0.4 });
        }
        return;
      }
      case O.TALL_GRASS: {
        const c = lin(0x7cbf48, 0.9 + h * 0.2), c2 = lin(0x5f9e34);
        for (let i = 0; i < 7; i++) {
          const px = x + 0.1 + seeded(x, y, z, i) * 0.8, pz = y + 0.1 + seeded(x, y, z, i + 9) * 0.8;
          const hh = 0.22 + seeded(x, y, z, i + 4) * 0.2;
          geo.tri([px - 0.05, 0, pz], [px + 0.02, hh, pz + 0.02], [px + 0.05, 0, pz + 0.02], i % 2 ? c : c2, (vv) => (vv[1] > 0.05 ? 1 : 0));
          geo.tri([px + 0.05, 0, pz + 0.02], [px + 0.02, hh, pz + 0.02], [px - 0.05, 0, pz], i % 2 ? c : c2, (vv) => (vv[1] > 0.05 ? 1 : 0));
        }
        return;
      }
      case O.MUSHROOMS:
        for (let i = 0; i < 3; i++) {
          const px = x + 0.2 + seeded(x, y, z, i) * 0.6, pz = y + 0.2 + seeded(x, y, z, i + 3) * 0.6, s = 0.6 + seeded(x, y, z, i + 6) * 0.6;
          geo.prism(px, 0, pz, 0.03 * s, 0.1 * s, 5, lin(0xf0e8d8));
          geo.prism(px, 0.1 * s, pz, 0.09 * s, 0.07 * s, 6, lin(h > 0.5 ? 0xd83a2a : 0xb8864a), { r1: 0 });
        }
        return;
      case O.WALL_STONE: case O.WALL_CRYPT: case O.WALL_TORCH: case O.WALL_WOOD:
        this.wall(wgeo, glow, floor, x, y, z, o);
        return;
      case O.DOOR: this.door(wgeo, x, y, z, v); return;
      case O.MOUNTAIN: this.rockMass(geo, x, y, z, true); return;
      case O.WALL_CAVE: this.rockMass(geo, x, y, z, false); return;
      case O.PALISADE: this.palisade(geo, x, y, z); return;
      case O.FENCE: this.fence(geo, floor, x, y, z); return;
      case O.STAIRS_DOWN: this.stairsDown(geo, x, y); return;
      case O.STAIRS_UP: this.stairsUp(geo, x, y); return;
      case O.HOLE: {
        geo.prism(cx, -0.01, cz, 0.45, 0.04, 8, lin(0x6a5f52), { top: lin(0x111111) });
        geo.prism(cx, 0.0, cz, 0.36, 0.035, 8, lin(0x050505), { top: lin(0x050505) });
        return;
      }
      case O.LADDER:
        if (!P('ladder', 1.7, null, 0, 0, 0, -0.35)) geo.box(cx - 0.2, 0, cz - 0.45, cx + 0.2, 1.4, cz - 0.4, lin(0x8a5a30));
        geo.prism(cx, 0.0, cz, 0.38, 0.02, 8, lin(0x222222), { top: lin(0x080808) });
        return;
      case O.TOMBSTONE: {
        const keys = ['grave_a', 'grave_b', 'gravestone', 'gravemarker'];
        if (P(keys[v % 4], v % 4 >= 2 ? 0.42 : 0.4, null, 0, (h2 - 0.5) * 0.3)) return;
        geo.box(cx - 0.25, 0, cz - 0.08, cx + 0.25, 0.6, cz + 0.08, lin(0x9a9aa2));
        return;
      }
      case O.LAMP_POST:
        if (!P('lantern_post', 0.43, null, 0, Math.PI / 2)) geo.box(cx - 0.04, 0, cz - 0.04, cx + 0.04, 1.3, cz + 0.04, lin(0x3a3a3a));
        glow.box(cx - 0.07 + 0.12, 1.05, cz - 0.07, cx + 0.07 + 0.12, 1.2, cz + 0.07, lin(0xffe8a0));
        return;
      case O.BRAZIER: this.brazier(geo, glow, cx, cz); return;
      case O.CAMPFIRE: this.campfire(geo, glow, cx, cz, h); return;
      case O.TABLE: if (!P('table', 0.42, null, 0, 0)) geo.box(cx - 0.4, 0.4, cz - 0.4, cx + 0.4, 0.46, cz + 0.4, lin(0x9a6a3a)); return;
      case O.COUNTER: this.counter(geo, floor, x, y, z, h); return;
      case O.BARREL: if (!P(h < 0.6 ? 'barrel' : 'keg', h < 0.6 ? 0.36 : 0.32)) geo.prism(cx, 0, cz, 0.3, 0.7, 8, lin(0x8a5a30)); return;
      case O.CRATE: if (!P(h < 0.6 ? 'box' : 'crates', h < 0.6 ? 0.46 : 0.36, null, 0, Math.round(h2 * 4) * Math.PI / 2)) geo.box(cx - 0.32, 0, cz - 0.32, cx + 0.32, 0.64, cz + 0.32, lin(0xa87a48)); return;
      case O.CHEST: if (!P('chest', 0.38, null, 0, 0)) geo.box(cx - 0.3, 0, cz - 0.22, cx + 0.3, 0.45, cz + 0.22, lin(0x8a5a30)); return;
      case O.QUEST_CHEST:
        if (!P('chest_gold', 0.44, null, 0, 0)) geo.box(cx - 0.3, 0, cz - 0.22, cx + 0.3, 0.45, cz + 0.22, lin(0xc89a30));
        glow.box(cx - 0.02, 0.62, cz - 0.02, cx + 0.02, 0.66, cz + 0.02, lin(0xfff0a0));
        return;
      case O.FOUNTAIN: this.fountain(geo, glow, cx, cz); return;
      case O.ALTAR: this.altar(geo, floor, glow, cx, cz); return;
      case O.STATUE: this.statue(geo, cx, cz); return;
      case O.TENT: if (!P('tent', 2.0, null, 0, (v & 3) * Math.PI / 2)) geo.prism(cx, 0, cz, 0.6, 1.1, 4, lin(0xc9b48a), { r1: 0, rot: Math.PI / 4 }); return;
      case O.BED: if (!P('bed_single', 0.42, null, 0, Math.PI)) geo.box(cx - 0.35, 0, cz - 0.45, cx + 0.35, 0.4, cz + 0.45, lin(0xe0e0e8)); return;
      case O.CRYSTAL: {
        const cols = [0x60d0ff, 0x80f0ff, 0xa080ff];
        for (let i = 0; i < 4; i++) {
          const px = cx + (seeded(x, y, z, i) - 0.5) * 0.5, pz = cz + (seeded(x, y, z, i + 4) - 0.5) * 0.5, s = 0.5 + seeded(x, y, z, i + 8) * 0.7;
          glow.prism(px, 0, pz, 0.1 * s, 0.5 * s, 4, lin(cols[i % 3]), { r1: 0, rot: i });
        }
        return;
      }
      case O.BONES: {
        const keys = ['bones_a', 'bones_b', 'ribcage', 'skull'];
        if (P(keys[Math.floor(h * 4)], h * 4 >= 2 ? 0.3 : 0.45)) return;
        geo.box(cx - 0.2, 0, cz - 0.03, cx + 0.2, 0.05, cz + 0.03, lin(0xf0e8d0));
        return;
      }
      case O.WEB: {
        const c = lin(0xe8e8f0, 0.9);
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * Math.PI;
          geo.boxR(cx, 0.02, cz, 0.9, 0.012, 0.02, a, c);
        }
        for (const r of [0.15, 0.3]) geo.prism(cx, 0.03, cz, r, 0.005, 8, c, { r1: r + 0.02, cap: false });
        return;
      }
      case O.STALAGMITE:
        geo.prism(cx, 0, cz, 0.22 + h * 0.1, 0.7 + h * 0.6, 6, lin(0x8a7e70), { r1: 0, rot });
        geo.prism(cx + 0.18, 0, cz + 0.1, 0.12, 0.4, 5, lin(0x7a6e60), { r1: 0 });
        return;
      case O.REEDS: if (!P(h < 0.5 ? 'waterplant' : 'waterplant_b', 2.6, { sway: true })) geo.box(cx - 0.02, 0, cz - 0.02, cx + 0.02, 0.6, cz + 0.02, lin(0x7a8a3a)); return;
      case O.LILYPAD: if (!P('waterlily', 3.0, { noShadow: true }, -0.1)) geo.prism(cx, -0.07, cz, 0.25, 0.01, 7, lin(0x4a9a3a)); return;
      case O.SIGN: {
        geo.box(cx - 0.04, 0, cz - 0.04, cx + 0.04, 0.85, cz + 0.04, lin(0x6b4a2b));
        geo.box(cx - 0.32, 0.5, cz - 0.03, cx + 0.32, 0.82, cz + 0.05, lin(0xb98656), { top: lin(0xc89660) });
        for (let i = 0; i < 3; i++) geo.box(cx - 0.22, 0.58 + i * 0.07, cz + 0.05, cx + 0.12 + i * 0.03, 0.6 + i * 0.07, cz + 0.06, lin(0x5a3a1a));
        return;
      }
      case O.WELL: this.well(geo, floor, cx, cz); return;
      case O.ANVIL:
        geo.box(cx - 0.12, 0, cz - 0.1, cx + 0.12, 0.35, cz + 0.1, lin(0x3a3a40));
        geo.box(cx - 0.3, 0.35, cz - 0.13, cx + 0.25, 0.48, cz + 0.13, lin(0x4a4a52), { top: lin(0x707078) });
        geo.prism(cx + 0.25, 0.37, cz, 0.1, 0.11, 4, lin(0x4a4a52), { r1: 0.02 });
        P('weaponrack', 1.6, null, 0, 0, 0.35, -0.3);
        return;
      case O.BOOKSHELF: if (!P('shelves', 0.45, null, 0, 0, 0, -0.2)) geo.box(cx - 0.45, 0, cz - 0.2, cx + 0.45, 1.2, cz + 0.2, lin(0x7a5030)); return;
      case O.PILLAR: if (!P('pillar', 0.42, null, 0, 0)) geo.prism(cx, 0, cz, 0.28, 1.8, 8, lin(0xd8d4cc)); return;
      case O.SARCOPHAGUS: if (!P('coffin_deco', 0.36, null, 0, Math.PI / 2)) geo.box(cx - 0.45, 0, cz - 0.3, cx + 0.45, 0.5, cz + 0.3, lin(0x8a8a98)); return;
      case O.COFFIN: if (!P('coffin', 0.32, null, 0, Math.PI / 2)) geo.box(cx - 0.4, 0, cz - 0.25, cx + 0.4, 0.4, cz + 0.25, lin(0x6a4a2a)); return;
      case O.BENCH: if (!P('bench', 0.42, null, 0, (v & 3) * Math.PI / 2)) geo.box(cx - 0.4, 0.25, cz - 0.15, cx + 0.4, 0.32, cz + 0.15, lin(0x9a6a3a)); return;
      case O.CART: if (!P('wheelbarrow', 2.0, null, 0, (v & 1) * Math.PI / 2)) geo.box(cx - 0.3, 0.2, cz - 0.4, cx + 0.3, 0.5, cz + 0.4, lin(0x9a6a3a)); return;
      case O.LOG_PILE: if (!P('lumber', 1.5, null, 0, 0)) geo.prism(cx, 0, cz, 0.3, 0.4, 8, lin(0x8a5a30)); return;
      default: break;
    }
  }

  procPine(geo, cx, cz, h) {
    geo.box(cx - 0.07, 0, cz - 0.07, cx + 0.07, 0.4, cz + 0.07, lin(0x6b4a2b));
    const c = lin(0x3f8a3a, 0.9 + h * 0.2);
    geo.prism(cx, 0.3, cz, 0.55, 0.8, 7, c, { r1: 0, sway: 0.5 });
    geo.prism(cx, 0.75, cz, 0.42, 0.7, 7, c, { r1: 0, sway: 1 });
    geo.prism(cx, 1.15, cz, 0.3, 0.6, 7, c, { r1: 0, sway: 1.4 });
  }

  procOak(geo, cx, cz, h, leaf, bark, birch = false) {
    const th = 0.75 + h * 0.3;
    geo.prism(cx, 0, cz, birch ? 0.07 : 0.1, th, 6, lin(bark), { r1: birch ? 0.05 : 0.08 });
    if (birch) for (let i = 0; i < 3; i++) geo.box(cx - 0.075, 0.15 + i * 0.22, cz + 0.05, cx + 0.02, 0.19 + i * 0.22, cz + 0.08, lin(0x333333));
    const c = lin(leaf, 0.88 + h * 0.2);
    const r = birch ? 0.38 : 0.5;
    geo.blob(cx, th + 0.25, cz, r, c, { sway: 1, detail: 0 });
    geo.blob(cx + 0.25, th + 0.05, cz + 0.1, r * 0.7, lin(leaf, 0.85), { sway: 0.8 });
    geo.blob(cx - 0.22, th + 0.1, cz - 0.12, r * 0.72, lin(leaf, 0.95), { sway: 0.8 });
    if (h > 0.6 && !birch) geo.blob(cx + 0.05, th + 0.6, cz - 0.05, r * 0.6, lin(leaf, 1.05), { sway: 1.3 });
  }

  wallAt(x, y, z) { return WALLISH.has(this.map.obj(x, y, z)); }

  wall(geo, glow, floor, x, y, z, o) {
    const map = this.map;
    const roofId = map.roof(x, y, z);
    const roof = roofId ? map.roofs[roofId - 1] : null;
    const H = roof ? roof.wallH : (o === O.WALL_CRYPT ? 1.8 : 1.55);
    const wood = o === O.WALL_WOOD;
    const crypt = o === O.WALL_CRYPT || (o === O.WALL_TORCH && z < 0);
    const base = lin(wood ? 0xb07a48 : crypt ? 0x7d7d90 : 0xa6abb3);
    const topc = lin(wood ? 0x8a5a32 : crypt ? 0x9a9aac : 0xc6cbd2);
    const cx = x + 0.5, cz = y + 0.5, t = WALL_T / 2;
    const n = this.wallAt(x, y - 1, z), s = this.wallAt(x, y + 1, z), w = this.wallAt(x - 1, y, z), e = this.wallAt(x + 1, y, z);
    const box = (x0, z0, x1, z1, col = base) => geo.box(x0, 0, z0, x1, H, z1, col, { top: topc, side: 0.84 });
    // centre post + arms toward connected walls
    const any = n || s || w || e;
    const pt = any ? t : 0.3;
    box(cx - pt, cz - pt, cx + pt, cz + pt);
    if (n) box(cx - t, y, cx + t, cz - pt);
    if (s) box(cx - t, cz + pt, cx + t, y + 1);
    if (w) box(x, cz - t, cx - pt, cz + t);
    if (e) box(cx + pt, cz - t, x + 1, cz + t);
    // texture: protruding bricks / planks
    const h = tileHash(x, y, z);
    if (wood) {
      const dark = lin(0x7a4e2a);
      if (e || w) for (let i = 0; i < 4; i++) geo.box(x + i * 0.25 + 0.11, 0.05, cz - t - 0.01, x + i * 0.25 + 0.13, H - 0.05, cz + t + 0.01, dark);
      if (n || s) for (let i = 0; i < 4; i++) geo.box(cx - t - 0.01, 0.05, y + i * 0.25 + 0.11, cx + t + 0.01, H - 0.05, y + i * 0.25 + 0.13, dark);
      geo.box(cx - t - 0.03, 0, cz - t - 0.03, cx + t + 0.03, H + 0.04, cz + t + 0.03, lin(0x6b4426));
    } else {
      const brick = lin(crypt ? 0x6a6a7c : 0x8e939b);
      for (let i = 0; i < 4; i++) {
        const bh = seeded(x, y, z, i);
        const yy = 0.15 + bh * (H - 0.4);
        if (e || w || !any) geo.box(x + 0.1 + bh * 0.6, yy, cz + t, x + 0.3 + bh * 0.6, yy + 0.14, cz + t + 0.03, brick);
        if (n || s) geo.box(cx + t, yy, y + 0.1 + bh * 0.6, cx + t + 0.03, yy + 0.14, y + 0.3 + bh * 0.6, brick);
      }
      // crenellations on the town walls
      if (!roof && !crypt && z === 0 && (x + y) % 2 === 0) geo.box(cx - t - 0.02, H, cz - t - 0.02, cx + t + 0.02, H + 0.28, cz + t + 0.02, base, { top: topc });
    }
    // windows on building walls
    if (roof && h < 0.35 && ((e && w && !n && !s) || (n && s && !e && !w))) {
      const glass = lin(0x2a3a5a), frame = lin(0x5a3a1e);
      if (e && w) {
        for (const zz of [cz - t - 0.01, cz + t + 0.01]) {
          geo.box(cx - 0.2, 0.7, zz - 0.012, cx + 0.2, 1.1, zz + 0.012, frame);
          geo.box(cx - 0.15, 0.75, zz - 0.02, cx + 0.15, 1.05, zz + 0.02, glass);
        }
      } else {
        for (const xx of [cx - t - 0.01, cx + t + 0.01]) {
          geo.box(xx - 0.012, 0.7, cz - 0.2, xx + 0.012, 1.1, cz + 0.2, frame);
          geo.box(xx - 0.02, 0.75, cz - 0.15, xx + 0.02, 1.05, cz + 0.15, glass);
        }
      }
    }
    // mounted torches face a walkable neighbour (prefer the camera side)
    if (o === O.WALL_TORCH) {
      const dirs = [[0, 1, 0], [1, 0, -Math.PI / 2], [-1, 0, Math.PI / 2], [0, -1, Math.PI]];
      for (const [dx, dy, r] of dirs) {
        if (!map.walkable(x + dx, y + dy, z)) continue;
        const px = cx + dx * (t + 0.08), pz = cz + dy * (t + 0.08);
        if (!this.prop(floor, 'torch_wall', px, pz, r, 0.42, 0.55)) geo.box(px - 0.04, 0.7, pz - 0.04, px + 0.04, 1.0, pz + 0.04, lin(0x6b4a2b));
        glow.prism(px + dx * 0.05, 1.02, pz + dy * 0.05, 0.07, 0.2, 5, lin(0xffa030), { r1: 0 });
        break;
      }
    }
  }

  door(geo, x, y, z, v) {
    const map = this.map;
    const roofId = map.roof(x, y, z);
    const H = roofId ? map.roofs[roofId - 1].wallH : 1.55;
    const frame = lin(0x6b4426), leaf = lin(0x9a6434);
    const cx = x + 0.5, cz = y + 0.5, t = WALL_T / 2;
    if (v === 1) { // vertical wall: passage along x
      geo.box(cx - t, 0, y, cx + t, H, y + 0.12, frame);
      geo.box(cx - t, 0, y + 0.88, cx + t, H, y + 1, frame);
      geo.box(cx - t, H - 0.3, y, cx + t, H, y + 1, frame);
      geo.box(cx + t, 0.02, y + 0.12, cx + t + 0.45, H - 0.35, y + 0.18, leaf);
    } else {
      geo.box(x, 0, cz - t, x + 0.12, H, cz + t, frame);
      geo.box(x + 0.88, 0, cz - t, x + 1, H, cz + t, frame);
      geo.box(x, H - 0.3, cz - t, x + 1, H, cz + t, frame);
      if (!this.wallAt(x - 1, y, z) || this.map.obj(x - 1, y, z) !== O.DOOR) geo.box(x + 0.12, 0.02, cz + t, x + 0.18, H - 0.35, cz + t + 0.45, leaf);
    }
  }

  rockMass(geo, x, y, z, surface) {
    const map = this.map;
    const h = tileHash(x, y, z), h2 = seeded(x, y, z, 1);
    const same = (dx, dy) => map.obj(x + dx, y + dy, z) === (surface ? O.MOUNTAIN : O.WALL_CAVE);
    let inner = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && same(dx, dy)) inner++;
    const cx = x + 0.5 + (h - 0.5) * 0.15, cz = y + 0.5 + (h2 - 0.5) * 0.15;
    const side = lin(surface ? 0x9ca1a8 : 0x7f7264, 0.9 + h * 0.15);
    const topCol = surface ? (h2 < 0.55 ? lin(0xb9c955, 0.95 + h * 0.1) : lin(0xb7bcc3)) : lin(0x5c5248);
    const h1 = (surface ? 0.9 : 1.4) + h * 0.7 + (inner >= 7 ? 0.9 : inner >= 5 ? 0.4 : 0);
    geo.prism(cx, -0.02, cz, 0.74, h1, 6, side, { top: topCol, rot: h * 3 });
    if (inner >= 5 || h2 > 0.5) {
      const h2h = 0.4 + h2 * 0.7;
      geo.prism(cx + (h2 - 0.5) * 0.3, h1, cz + (h - 0.5) * 0.3, 0.45 + h * 0.15, h2h, 6, lin(surface ? 0xa9aeb5 : 0x8a7c6c), { top: topCol, rot: h2 * 3 });
    }
  }

  palisade(geo, x, y, z) {
    const map = this.map;
    const pal = (dx, dy) => map.obj(x + dx, y + dy, z) === O.PALISADE;
    const horiz = pal(-1, 0) || pal(1, 0);
    const vert = pal(0, -1) || pal(0, 1);
    const logs = [];
    if (horiz || !vert) for (let i = 0; i < 3; i++) logs.push([x + 0.17 + i * 0.33, y + 0.5]);
    if (vert) for (let i = 0; i < 3; i++) logs.push([x + 0.5, y + 0.17 + i * 0.33]);
    logs.forEach(([lx, lz], i) => {
      const hh = 1.25 + seeded(x, y, z, i) * 0.35;
      geo.prism(lx, 0, lz, 0.15, hh, 6, lin(0x8a5f38, 0.9 + seeded(x, y, z, i + 3) * 0.2), { top: lin(0xc89a68) });
      geo.prism(lx, hh, lz, 0.15, 0.22, 6, lin(0x9a6f48), { r1: 0 });
    });
    geo.box(x, 0.85, y + 0.42, x + 1, 0.95, y + 0.58, lin(0x5a3a1e));
  }

  fence(geo, floor, x, y, z) {
    const map = this.map;
    const f = (dx, dy) => map.obj(x + dx, y + dy, z) === O.FENCE;
    const cx = x + 0.5, cz = y + 0.5;
    let used = false;
    if (f(1, 0)) used = this.prop(floor, 'fence', cx + 0.5, cz, 0, 0.25) || used;
    if (f(0, 1)) used = this.prop(floor, 'fence', cx, cz + 0.5, Math.PI / 2, 0.25) || used;
    this.prop(floor, 'fence_pillar', cx, cz, 0, 0.25);
    if (!used && !assets.props.get('fence')) {
      geo.box(cx - 0.05, 0, cz - 0.05, cx + 0.05, 0.7, cz + 0.05, lin(0x3a3a40));
      if (f(1, 0)) geo.box(cx, 0.4, cz - 0.02, cx + 1, 0.45, cz + 0.02, lin(0x3a3a40));
      if (f(0, 1)) geo.box(cx - 0.02, 0.4, cz, cx + 0.02, 0.45, cz + 1, lin(0x3a3a40));
    }
  }

  stairsDown(geo, x, y) {
    const rim = lin(0x8a8c94);
    geo.box(x, -0.02, y, x + 1, 0.06, y + 0.1, rim);
    geo.box(x, -0.02, y, x + 0.1, 0.06, y + 1, rim);
    geo.box(x + 0.9, -0.02, y, x + 1, 0.06, y + 1, rim);
    geo.quad([x + 0.1, 0.0, y + 0.1], [x + 0.1, 0.0, y + 1], [x + 0.9, 0.0, y + 1], [x + 0.9, 0.0, y + 0.1], lin(0x050505));
    for (let i = 0; i < 3; i++) {
      const yy = -0.0 + 0.001 - (i + 1) * 0.001;
      geo.box(x + 0.12, yy, y + 0.12 + i * 0.25, x + 0.88, yy + 0.003, y + 0.35 + i * 0.25, lin(0x50525a, 1 - i * 0.28));
    }
  }

  stairsUp(geo, x, y) {
    for (let i = 0; i < 4; i++) {
      geo.box(x + 0.08, 0, y + 0.75 - i * 0.22, x + 0.92, 0.18 + i * 0.18, y + 0.97 - i * 0.22, lin(0x9a9ca4, 0.85 + i * 0.05), { top: lin(0xb4b6bd) });
    }
    geo.box(x, 0, y, x + 0.08, 0.9, y + 1, lin(0x7a7c84));
    geo.box(x + 0.92, 0, y, x + 1, 0.9, y + 1, lin(0x7a7c84));
  }

  brazier(geo, glow, cx, cz) {
    const iron = lin(0x3a3a42);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      geo.boxR(cx + Math.cos(a) * 0.15, 0, cz + Math.sin(a) * 0.15, 0.05, 0.6, 0.05, a, iron);
    }
    geo.prism(cx, 0.55, cz, 0.16, 0.18, 8, iron, { r1: 0.28, top: lin(0x2a1a10) });
    glow.prism(cx, 0.7, cz, 0.2, 0.32, 6, lin(0xff8a20), { r1: 0 });
    glow.prism(cx + 0.03, 0.72, cz, 0.12, 0.42, 5, lin(0xffe060), { r1: 0 });
  }

  campfire(geo, glow, cx, cz, h) {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      geo.blob(cx + Math.cos(a) * 0.32, 0.05, cz + Math.sin(a) * 0.32, 0.09, lin(0x8a8c90), { sy: 0.7 });
    }
    for (let i = 0; i < 3; i++) geo.boxR(cx, 0.03 + i * 0.03, cz, 0.55, 0.07, 0.08, i + h, lin(0x5a3a1e));
    glow.prism(cx, 0.08, cz, 0.18, 0.45, 6, lin(0xff7a1a), { r1: 0 });
    glow.prism(cx, 0.1, cz, 0.1, 0.55, 5, lin(0xffe070), { r1: 0 });
  }

  counter(geo, floor, x, y, z, h) {
    const cx = x + 0.5, cz = y + 0.5;
    geo.box(x + 0.02, 0, y + 0.08, x + 0.98, 0.72, y + 0.92, lin(0x8a5a32), { top: lin(0xb07a48) });
    geo.box(x, 0.72, y + 0.04, x + 1, 0.78, y + 0.96, lin(0xa06a3a), { top: lin(0xc89060) });
    const goods = ['jar', 'bottle_red', 'bottle_green', 'plate_food', 'mug', 'book_set', 'candle'];
    if (h > 0.35) this.prop(floor, goods[Math.floor(h * 97) % goods.length], cx + (h - 0.5) * 0.4, cz, h * 6, 0.22, 0.78);
  }

  fountain(geo, glow, cx, cz) {
    const stone = lin(0xb4b8c0);
    geo.prism(cx, 0, cz, 0.5, 0.34, 8, stone, { top: lin(0xc8ccd2) });
    geo.prism(cx, 0.3, cz, 0.4, 0.02, 8, lin(0x4aa8e8), { top: lin(0x5ab8f0) });
    geo.prism(cx, 0, cz, 0.08, 0.85, 6, stone);
    geo.prism(cx, 0.75, cz, 0.08, 0.1, 8, stone, { r1: 0.22 });
    glow.prism(cx, 0.85, cz, 0.05, 0.3, 5, lin(0xbfe8ff), { r1: 0 });
  }

  altar(geo, floor, glow, cx, cz) {
    geo.box(cx - 0.45, 0, cz - 0.3, cx + 0.45, 0.62, cz + 0.3, lin(0xe8e4dc), { top: lin(0xf4f0e8) });
    geo.box(cx - 0.47, 0.62, cz - 0.32, cx + 0.47, 0.66, cz + 0.32, lin(0xe0b040));
    geo.box(cx - 0.12, 0.66, cz - 0.06, cx + 0.12, 0.7, cz + 0.06, lin(0xb83434));
    if (!this.prop(floor, 'candle_triple', cx - 0.3, cz, 0, 0.35, 0.66)) glow.box(cx - 0.32, 0.66, cz - 0.02, cx - 0.28, 0.8, cz + 0.02, lin(0xfff0c0));
    this.prop(floor, 'candle_triple', cx + 0.3, cz, 1, 0.35, 0.66);
  }

  statue(geo, cx, cz) {
    const s = lin(0xb8bcc4), d = lin(0x9ea2aa);
    geo.box(cx - 0.4, 0, cz - 0.4, cx + 0.4, 0.35, cz + 0.4, d, { top: s });
    geo.box(cx - 0.12, 0.35, cz - 0.08, cx - 0.02, 0.75, cz + 0.08, s);
    geo.box(cx + 0.02, 0.35, cz - 0.08, cx + 0.12, 0.75, cz + 0.08, s);
    geo.box(cx - 0.17, 0.75, cz - 0.1, cx + 0.17, 1.15, cz + 0.1, s);
    geo.box(cx - 0.26, 0.8, cz - 0.06, cx - 0.17, 1.15, cz + 0.06, d);
    geo.box(cx + 0.17, 0.8, cz - 0.06, cx + 0.26, 1.3, cz + 0.06, d);
    geo.box(cx + 0.2, 1.3, cz - 0.02, cx + 0.24, 1.75, cz + 0.02, lin(0xd0d4dc));
    geo.box(cx - 0.11, 1.15, cz - 0.1, cx + 0.11, 1.38, cz + 0.1, s);
  }

  well(geo, floor, cx, cz) {
    geo.prism(cx, 0, cz, 0.42, 0.45, 8, lin(0x9a9ea6), { top: lin(0x223344) });
    geo.box(cx - 0.4, 0, cz - 0.04, cx - 0.34, 1.1, cz + 0.04, lin(0x6b4426));
    geo.box(cx + 0.34, 0, cz - 0.04, cx + 0.4, 1.1, cz + 0.04, lin(0x6b4426));
    geo.prism(cx, 1.05, cz, 0.6, 0.4, 4, lin(0xa04a2a), { r1: 0, rot: Math.PI / 4 });
    this.prop(floor, 'bucket', cx + 0.15, cz + 0.42, 0, 2.0, 0);
  }

  buildRoof(r) {
    const geo = new Geo();
    const ov = 0.18;
    const x0 = r.x0 - ov, x1 = r.x1 + 1 + ov, z0 = r.y0 - ov, z1 = r.y1 + 1 + ov;
    const H = r.wallH;
    const wx = x1 - x0, wz = z1 - z0;
    const col = lin(r.color), dark = lin(r.color, 0.8), gable = lin(0xd8c9a8);
    const along = wx >= wz; // ridge along x
    const rise = Math.min(1.6, (along ? wz : wx) * 0.42);
    if (r.style === 'hip') {
      const inset = (along ? wz : wx) / 2;
      const rx0 = along ? x0 + inset : (x0 + x1) / 2, rx1 = along ? x1 - inset : (x0 + x1) / 2;
      const rz0 = along ? (z0 + z1) / 2 : z0 + inset, rz1 = along ? (z0 + z1) / 2 : z1 - inset;
      const top = H + rise;
      geo.quad([x0, H, z1], [x1, H, z1], [rx1, top, rz1], [rx0, top, rz1], col);
      geo.quad([x1, H, z0], [x0, H, z0], [rx0, top, rz0], [rx1, top, rz0], dark);
      geo.quad([x1, H, z1], [x1, H, z0], [rx1, top, rz0], [rx1, top, rz1], dark);
      geo.quad([x0, H, z0], [x0, H, z1], [rx0, top, rz1], [rx0, top, rz0], col);
    } else if (along) {
      const zm = (z0 + z1) / 2, top = H + rise;
      geo.quad([x0, H, z1], [x1, H, z1], [x1, top, zm], [x0, top, zm], col);
      geo.quad([x1, H, z0], [x0, H, z0], [x0, top, zm], [x1, top, zm], dark);
      geo.tri([x0 + ov, H, z0 + ov], [x0 + ov, H, z1 - ov], [x0 + ov, top - 0.05, zm], gable);
      geo.tri([x1 - ov, H, z1 - ov], [x1 - ov, H, z0 + ov], [x1 - ov, top - 0.05, zm], gable);
      // shingle rows
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        geo.quad([x0, H + rise * t, z1 - (z1 - zm) * t], [x1, H + rise * t, z1 - (z1 - zm) * t], [x1, H + rise * t + 0.04, z1 - (z1 - zm) * t - 0.02], [x0, H + rise * t + 0.04, z1 - (z1 - zm) * t - 0.02], dark);
      }
    } else {
      const xm = (x0 + x1) / 2, top = H + rise;
      geo.quad([x1, H, z1], [x1, H, z0], [xm, top, z0], [xm, top, z1], dark);
      geo.quad([x0, H, z0], [x0, H, z1], [xm, top, z1], [xm, top, z0], col);
      geo.tri([x1 - ov, H, z1 - ov], [x0 + ov, H, z1 - ov], [xm, top - 0.05, z1 - ov], gable);
      geo.tri([x0 + ov, H, z0 + ov], [x1 - ov, H, z0 + ov], [xm, top - 0.05, z0 + ov], gable);
    }
    // eaves underside so it reads as a solid roof from below
    geo.quad([x0, H - 0.02, z0], [x1, H - 0.02, z0], [x1, H - 0.02, z1], [x0, H - 0.02, z1], lin(0x3a2a1a));
    if (wx * wz > 30) {
      const ccx = x0 + wx * 0.72, ccz = z0 + wz * 0.35;
      geo.box(ccx - 0.15, H, ccz - 0.15, ccx + 0.15, H + rise + 0.3, ccz + 0.15, lin(0x8a6a5a), { top: lin(0x2a2a2a) });
    }
    const mesh = new THREE.Mesh(geo.build(), this.solidMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  buildClouds() {
    this.clouds = new THREE.Group();
    this.clouds.name = 'clouds';
    const big = assets.props.get('cloud_big'), small = assets.props.get('cloud_small');
    for (let i = 0; i < 26; i++) {
      const p = (i % 3 === 0 ? small : big);
      const g = new THREE.Group();
      if (p) {
        for (const part of p.parts) {
          const m = new THREE.Mesh(part.geometry, part.material);
          m.applyMatrix4(part.matrix);
          m.castShadow = true;
          m.layers.set(1);
          g.add(m);
        }
      } else {
        const m = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 0), new THREE.MeshBasicMaterial());
        m.castShadow = true; m.layers.set(1); g.add(m);
      }
      const s = 1.6 + tileHash(i, 3, 1) * 1.6;
      g.scale.setScalar(s);
      g.position.set(tileHash(i, 1, 1) * this.map.w, 11 + tileHash(i, 2, 1) * 3, tileHash(i, 5, 1) * this.map.h);
      g.rotation.y = tileHash(i, 7, 1) * 6;
      this.clouds.add(g);
    }
    this.scene.add(this.clouds);
  }

  // ------------------------------------------------------------------------
  setFloor(z) {
    if (this.current === z) return;
    for (const [fz, f] of this.floors) f.group.visible = fz === z;
    this.current = z;
    this.clouds.visible = z === 0;
    this.hiddenRoof = -1;
  }

  floorLights(z) { return this.floors.get(z)?.lights || []; }

  update(dt, px, py, pz, fpp = false) {
    this.uniforms.uTime.value += dt;
    const f = this.floors.get(pz);
    if (f) {
      const r = this.map.roof(Math.floor(px), Math.floor(py), pz);
      // in first person the roof stays as a ceiling and walls keep full height
      const inside = !fpp && r && (this.map.flags(Math.floor(px), Math.floor(py), pz) & 2) ? r : 0;
      if (inside !== this.hiddenRoof) {
        for (const [id, e] of f.roofs) {
          const hide = id === inside;
          e.roof.visible = !hide;
          e.cut.value = hide ? 0.55 : 99;
        }
        this.hiddenRoof = inside;
      }
    }
    if (this.clouds?.visible) {
      for (const c of this.clouds.children) {
        c.position.x += dt * 0.35;
        if (c.position.x > this.map.w + 10) c.position.x = -10;
      }
    }
  }
}
