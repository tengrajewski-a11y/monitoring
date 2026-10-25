// Voxel particle effects and projectiles.

import * as THREE from 'three';
import { cloneGear } from './assets.js';

const MAX = 2400;

const FX = {
  blood: { n: 14, c: [0xc81a1a, 0x9a1010, 0xe8302a], sp: 1.8, up: 2.2, g: 9, s: 0.07, life: 0.6, y: 0.55 },
  green_blood: { n: 14, c: [0x5ac83a, 0x3a9a2a, 0x8ae05a], sp: 1.8, up: 2.2, g: 9, s: 0.07, life: 0.6, y: 0.4 },
  bone: { n: 10, c: [0xf0e8d0, 0xd8d0b8], sp: 1.6, up: 2.2, g: 9, s: 0.06, life: 0.6, y: 0.6 },
  slime: { n: 14, c: [0x6ae05a, 0x3ab83a], sp: 1.4, up: 2.0, g: 8, s: 0.09, life: 0.7, y: 0.3 },
  poff: { n: 9, c: [0xe8e8e8, 0xc8c8c8, 0xffffff], sp: 0.5, up: 0.7, g: -0.6, s: 0.14, grow: 1.6, life: 0.7, y: 0.4 },
  block: { n: 10, c: [0xffffa0, 0xffffff, 0xffd040], sp: 2.6, up: 1.5, g: 6, s: 0.045, life: 0.35, y: 0.6, glow: true },
  fire: { n: 22, c: [0xff7a1a, 0xffc030, 0xff3a0a], sp: 0.9, up: 1.8, g: -1.5, s: 0.1, life: 0.7, y: 0.2, glow: true, flash: 0xff7020 },
  energy: { n: 22, c: [0x9a60ff, 0x60e0ff, 0xffffff], sp: 2.4, up: 1.4, g: 0, s: 0.07, life: 0.5, y: 0.5, glow: true, flash: 0x8060ff },
  earth: { n: 16, c: [0x6ac83a, 0x8a6a3a, 0x4a8a2a], sp: 1.8, up: 2.6, g: 9, s: 0.09, life: 0.7, y: 0.3 },
  ice: { n: 18, c: [0xbfeaff, 0x7ac8ff, 0xffffff], sp: 2.0, up: 2.0, g: 7, s: 0.08, life: 0.7, y: 0.4, glow: true, flash: 0x80c0ff },
  poison: { n: 14, c: [0x7ae04a, 0x4ab82a, 0xb0ff70], sp: 0.5, up: 1.0, g: -1.2, s: 0.08, life: 0.9, y: 0.3, glow: true },
  death: { n: 18, c: [0x3a1a4a, 0x6a2a8a, 0x1a0a1a], sp: 0.8, up: 1.2, g: -1, s: 0.12, grow: 1.4, life: 0.9, y: 0.4, flash: 0x6a2a8a },
  holy: { n: 18, c: [0xfff0a0, 0xffd040, 0xffffff], sp: 0.8, up: 2.0, g: -1, s: 0.07, life: 0.8, y: 0.3, glow: true, flash: 0xffe080 },
  drain: { n: 16, c: [0xc01020, 0xff3040], sp: 0.6, up: 1.4, g: -1.5, s: 0.07, life: 0.8, y: 0.3, glow: true, spiral: true },
  heal: { n: 20, c: [0x80ff80, 0xffffff, 0x40e060], sp: 0.4, up: 1.6, g: -1.2, s: 0.06, life: 1.0, y: 0.1, glow: true, ring: 0.45 },
  mana: { n: 18, c: [0x6080ff, 0xa0c0ff, 0xffffff], sp: 0.4, up: 1.6, g: -1.2, s: 0.06, life: 1.0, y: 0.1, glow: true, ring: 0.45 },
  levelup: { n: 70, c: [0xffe060, 0xffffff, 0xffb020], sp: 0.3, up: 3.2, g: -0.5, s: 0.07, life: 1.6, y: 0.0, glow: true, ring: 0.55, flash: 0xffe060 },
  teleport: { n: 36, c: [0xa0e0ff, 0xffffff, 0x6080ff], sp: 0.3, up: 2.4, g: -0.5, s: 0.06, life: 1.0, y: 0.0, glow: true, ring: 0.4, spiral: true },
  explosion: { n: 40, c: [0xff7a1a, 0xffd040, 0xff3a0a, 0x6a6a6a], sp: 3.2, up: 2.8, g: 4, s: 0.12, life: 0.8, y: 0.3, glow: true, flash: 0xff6010 },
  sparkle: { n: 16, c: [0xffffff, 0xfff0a0], sp: 0.8, up: 1.2, g: -0.4, s: 0.05, life: 0.9, y: 0.5, glow: true },
  haste: { n: 20, c: [0x60f0ff, 0xffffff], sp: 1.2, up: 0.6, g: 0, s: 0.05, life: 0.6, y: 0.2, glow: true, ring: 0.5 },
  shield: { n: 30, c: [0x6080ff, 0xa0c0ff], sp: 0.1, up: 0.8, g: -0.2, s: 0.06, life: 1.0, y: 0.2, glow: true, ring: 0.55 },
  slash: { n: 16, c: [0xffffff, 0xdde4ff], sp: 0.2, up: 0.2, g: 0, s: 0.05, life: 0.3, y: 0.6, glow: true, arc: true },
  death_puff: { n: 20, c: [0xc8c0b8, 0x9a9088], sp: 0.8, up: 0.8, g: -0.4, s: 0.13, grow: 1.5, life: 1.0, y: 0.4 },
};

const MISSILE = {
  arrow: { gear: 'arrow', color: 0xd0d0d8, size: 0.05, arc: 0.6, trail: null },
  spear: { color: 0xb08050, size: 0.05, arc: 0.7, long: 0.7 },
  fire: { color: 0xff7a1a, size: 0.16, arc: 0.2, trail: 'fire', glow: true },
  energy: { color: 0x9a70ff, size: 0.14, arc: 0, trail: 'energy', glow: true },
  earth: { color: 0x6ab83a, size: 0.14, arc: 0.4, trail: 'earth' },
  ice: { color: 0xbfeaff, size: 0.13, arc: 0.1, trail: 'ice', glow: true },
  poison: { color: 0x7ae04a, size: 0.12, arc: 0.3, trail: 'poison', glow: true },
  death: { color: 0x6a2a8a, size: 0.15, arc: 0.1, trail: 'death', glow: true },
  holy: { color: 0xfff0a0, size: 0.13, arc: 0.1, trail: 'holy', glow: true },
  physical: { color: 0xc8c8c8, size: 0.08, arc: 0.5 },
};

export class Effects {
  constructor(scene, renderer) {
    this.scene = scene;
    this.renderer = renderer;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.lit = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), MAX);
    this.glow = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ toneMapped: false, color: new THREE.Color(2.2, 2.2, 2.2) }), MAX);
    for (const m of [this.lit, this.glow]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color());
      m.count = 0;
      m.frustumCulled = false;
      scene.add(m);
    }
    this.parts = [];
    this.missiles = [];
    this.tmp = new THREE.Matrix4();
    this.col = new THREE.Color();
    this.q = new THREE.Quaternion();
  }

  spawn(name, x, y, z0 = 0) {
    const f = FX[name];
    if (!f) return;
    for (let i = 0; i < f.n; i++) {
      if (this.parts.length >= MAX * 2) break;
      const a = Math.random() * Math.PI * 2;
      const r = f.ring ? f.ring : Math.random() * 0.15;
      const sp = f.sp * (0.4 + Math.random() * 0.8);
      const p = {
        x: x + Math.cos(a) * r, y: z0 + f.y + (f.ring ? Math.random() * 0.3 : Math.random() * 0.2), z: y + Math.sin(a) * r,
        vx: Math.cos(a) * sp * (f.ring ? 0.2 : 1), vy: f.up * (0.5 + Math.random() * 0.7), vz: Math.sin(a) * sp * (f.ring ? 0.2 : 1),
        life: f.life * (0.7 + Math.random() * 0.5), s: f.s * (0.7 + Math.random() * 0.7), g: f.g, grow: f.grow || 0,
        c: f.c[(Math.random() * f.c.length) | 0], glow: !!f.glow, spiral: f.spiral ? a : null, cx: x, cz: y,
      };
      if (f.arc) {
        const t = (i / f.n - 0.5) * 2.4;
        p.x = x + Math.sin(t) * 0.55; p.z = y + Math.cos(t) * 0.55; p.vx = p.vz = 0; p.vy = 0;
      }
      p.max = p.life;
      this.parts.push(p);
    }
    if (f.flash) this.renderer.flash(x, y, f.flash);
  }

  missile(type, fx, fy, tx, ty, onHit) {
    const m = MISSILE[type] || MISSILE.physical;
    const dist = Math.hypot(tx - fx, ty - fy);
    let mesh = null;
    if (m.gear) {
      mesh = cloneGear(m.gear);
      if (mesh) mesh.scale.setScalar(0.45);
    }
    if (!mesh) {
      const len = m.long || m.size;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(m.size, m.size, len),
        m.glow ? new THREE.MeshBasicMaterial({ color: new THREE.Color(m.color).multiplyScalar(2.4), toneMapped: false }) : new THREE.MeshLambertMaterial({ color: m.color }));
    }
    this.scene.add(mesh);
    this.missiles.push({
      mesh, m, fx: fx + 0.5, fy: fy + 0.5, tx: tx + 0.5, ty: ty + 0.5, start: performance.now(),
      dur: 120 + dist * 55, onHit, lastTrail: 0,
    });
  }

  update(dt) {
    const now = performance.now();
    // missiles
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const s = this.missiles[i];
      const t = Math.min(1, (now - s.start) / s.dur);
      const x = s.fx + (s.tx - s.fx) * t, z = s.fy + (s.ty - s.fy) * t;
      const y = 0.75 + Math.sin(t * Math.PI) * s.m.arc;
      const prev = s.mesh.position.clone();
      s.mesh.position.set(x, y, z);
      if (t > 0) {
        const dir = s.mesh.position.clone().sub(prev);
        if (dir.lengthSq() > 1e-6) {
          if (s.m.gear) s.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
          else s.mesh.lookAt(s.mesh.position.clone().add(dir));
        }
      }
      if (s.m.glow) s.mesh.rotation.z += dt * 12;
      if (s.m.trail && now - s.lastTrail > 30) {
        s.lastTrail = now;
        const f = FX[s.m.trail];
        this.parts.push({ x, y, z, vx: 0, vy: 0.2, vz: 0, life: 0.35, max: 0.35, s: f.s * 0.9, g: 0, grow: 0, c: f.c[0], glow: true });
      }
      if (t >= 1) {
        this.scene.remove(s.mesh);
        this.missiles.splice(i, 1);
        s.onHit?.();
      }
    }
    // particles
    let nl = 0, ng = 0;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      if (p.spiral !== null && p.spiral !== undefined) {
        p.spiral += dt * 5;
        const r = 0.35 * (p.life / p.max) + 0.1;
        p.x = p.cx + Math.cos(p.spiral) * r; p.z = p.cz + Math.sin(p.spiral) * r;
      } else { p.x += p.vx * dt; p.z += p.vz * dt; p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5; }
      p.vy -= p.g * dt;
      p.y += p.vy * dt;
      if (p.y < 0.02 && p.g > 0) { p.y = 0.02; p.vy = 0; p.vx = p.vz = 0; }
      const k = p.life / p.max;
      const s = p.s * (p.grow ? 1 + (1 - k) * p.grow : 0.4 + 0.6 * Math.min(1, k * 2));
      this.tmp.makeScale(s, s, s).setPosition(p.x, p.y, p.z);
      this.col.setHex(p.c);
      const target = p.glow ? this.glow : this.lit;
      const idx = p.glow ? ng++ : nl++;
      if (idx >= MAX) continue;
      target.setMatrixAt(idx, this.tmp);
      target.setColorAt(idx, this.col);
    }
    this.lit.count = Math.min(MAX, nl);
    this.glow.count = Math.min(MAX, ng);
    for (const m of [this.lit, this.glow]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }
}

export const EFFECT_NAMES = Object.keys(FX);
