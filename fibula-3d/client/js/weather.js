// Weather and ambient particles: rain showers (streaks, splashes, darker light),
// fireflies at night and low mist over swamps and on dewy mornings. Showers
// follow the server clock, so every player sees the same weather.

import * as THREE from 'three';
import { G } from '/shared/constants.js';
import { instanceAlpha } from './effects.js';

const DROPS = 1400, SPLASHES = 260, FLIES = 48, MISTS = 30;
const BOX = 13;              // half size of the rain box around the camera focus
const SLOT = 9 * 60000;      // weather slot length on the server clock (ms)
const FLY_GROUND = new Set([G.GRASS, G.FOREST, G.SWAMP]);
const DEW_GROUND = new Set([G.GRASS, G.FOREST]);

function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

// 0..1 rain strength at server time t (ms): about every fourth slot is a shower
// that builds up and dies down over a minute and a half
export function rainAt(t) {
  const i = Math.floor(t / SLOT), u = (t - i * SLOT) / SLOT;
  if (hash(i) >= 0.27) return 0;
  return (0.55 + hash(i + 0.5) * 0.45) * Math.min(1, u * 6, (1 - u) * 6);
}

function softDisc() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function pool(scene, geo, mat, n) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.count = 0;
  m.frustumCulled = false;
  m.renderOrder = 3;
  scene.add(m);
  return m;
}

export class Weather {
  constructor(scene, map) {
    this.map = map;
    this.rain = 0;           // current strength, eased towards the target
    this.enabled = true;
    this.mat = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.one = new THREE.Vector3(1, 1, 1);
    this.time = 0;

    this.drops = pool(scene, new THREE.BoxGeometry(0.024, 0.34, 0.024),
      new THREE.MeshBasicMaterial({ color: 0xc4d2e4, transparent: true, opacity: 0.42, depthWrite: false }), DROPS);
    this.dropP = new Float32Array(DROPS * 3);
    this.dropRoof = new Uint8Array(DROPS);
    this.dropsReady = false;

    this.splashMesh = pool(scene, new THREE.RingGeometry(0.55, 1, 12).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xe0eaf4, transparent: true, depthWrite: false, side: THREE.DoubleSide }), SPLASHES);
    this.splashAlpha = instanceAlpha(this.splashMesh, SPLASHES);
    this.splashes = [];

    this.flyMesh = pool(scene, new THREE.BoxGeometry(0.06, 0.06, 0.06), new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.4, 2.8, 0.9), toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), FLIES);
    this.flyAlpha = instanceAlpha(this.flyMesh, FLIES);
    this.flies = [];
    this.flyLevel = 0;

    this.mistMesh = pool(scene, new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({
      map: softDisc(), color: 0xd4dcd0, transparent: true, depthWrite: false, fog: true,
    }), MISTS);
    this.mistAlpha = instanceAlpha(this.mistMesh, MISTS);
    this.mists = [];
    this.mistSpots = { swamp: [], dew: [] };
    this.lastScan = -1e9;
  }

  // strength the renderer and audio use (0 when disabled or under ground)
  get level() { return this.enabled ? this.rain : 0; }

  // opts: { focus, z, now (server ms), night (0..1), dawn (0..1), indoors, fpp, force (null or 0..1) }
  update(dt, o) {
    this.time += dt;
    const outside = o.z === 0;
    const target = outside && this.enabled ? (o.force ?? rainAt(o.now)) : 0;
    // showers come and go over a few seconds; going down a floor clears them at once
    this.rain = outside ? this.rain + (target - this.rain) * Math.min(1, dt * 0.5) : 0;
    this.updateRain(dt, o.focus, o.indoors, o.fpp);
    this.updateSplashes(dt);
    this.updateFlies(dt, o, outside);
    this.updateMist(dt, o, outside);
  }

  respawnDrop(i, fx, fz, top) {
    const x = fx + (Math.random() * 2 - 1) * BOX, z = fz + (Math.random() * 2 - 1) * BOX;
    this.dropP[i * 3] = x;
    this.dropP[i * 3 + 1] = top ? 5 + Math.random() * 5 : Math.random() * 10;
    this.dropP[i * 3 + 2] = z;
    // no rain under roofs (seen from above the roof hides it anyway)
    this.dropRoof[i] = this.map.roof(Math.floor(x), Math.floor(z), 0) ? 1 : 0;
  }

  updateRain(dt, focus, indoors, fpp) {
    const n = Math.round(DROPS * this.rain);
    if (!n || indoors) { this.drops.count = 0; return; }
    if (!this.dropsReady) {
      for (let i = 0; i < DROPS; i++) this.respawnDrop(i, focus.x, focus.z, false);
      this.dropsReady = true;
    }
    const wind = 1.2, fall = 12;
    this.q.setFromAxisAngle(this.v.set(0, 0, 1), -Math.atan2(wind, fall));
    let k = 0;
    for (let i = 0; i < n; i++) {
      const p = this.dropP;
      p[i * 3] += wind * dt;
      p[i * 3 + 1] -= fall * dt;
      // keep the box around the focus while the player walks
      const dx = p[i * 3] - focus.x, dz = p[i * 3 + 2] - focus.z;
      if (Math.abs(dx) > BOX || Math.abs(dz) > BOX) { this.respawnDrop(i, focus.x, focus.z, false); continue; }
      if (p[i * 3 + 1] <= 0) {
        if (!this.dropRoof[i] && Math.random() < 0.35) this.splash(p[i * 3], p[i * 3 + 2]);
        this.respawnDrop(i, focus.x, focus.z, true);
        continue;
      }
      // in first person, drops right at the eye would be huge streaks
      if (this.dropRoof[i] || (fpp && dx * dx + dz * dz < 4)) continue;
      this.mat.compose(this.v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]), this.q, this.one);
      this.drops.setMatrixAt(k++, this.mat);
    }
    this.drops.count = k;
    this.drops.instanceMatrix.needsUpdate = true;
  }

  splash(x, z) {
    if (this.splashes.length >= SPLASHES) return;
    this.splashes.push({ x, z, t: 0, life: 0.22 + Math.random() * 0.12, s: 0.07 + Math.random() * 0.06 });
  }

  updateSplashes(dt) {
    let k = 0;
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i];
      s.t += dt;
      if (s.t >= s.life) { this.splashes[i] = this.splashes[this.splashes.length - 1]; this.splashes.pop(); continue; }
      const u = s.t / s.life, r = s.s * (0.3 + u);
      this.mat.makeScale(r, 1, r).setPosition(s.x, 0.03, s.z);
      this.splashMesh.setMatrixAt(k, this.mat);
      this.splashAlpha.array[k++] = 0.55 * (1 - u);
    }
    this.splashMesh.count = k;
    this.splashMesh.instanceMatrix.needsUpdate = true;
    this.splashAlpha.needsUpdate = true;
  }

  updateFlies(dt, o, outside) {
    const want = this.enabled && outside && !o.indoors ? Math.max(0, o.night - 0.4) / 0.6 * (1 - this.rain) : 0;
    this.flyLevel += (want - this.flyLevel) * Math.min(1, dt * 0.7);
    if (this.flyLevel < 0.01) { this.flyMesh.count = 0; this.flies.length = 0; return; }
    const f = o.focus;
    while (this.flies.length < FLIES) this.flies.push({ hx: 0, hz: 0, ph: Math.random() * 100, h: 0, live: false });
    let k = 0;
    for (const fl of this.flies) {
      if (!fl.live || Math.abs(fl.hx - f.x) > 11 || Math.abs(fl.hz - f.z) > 11) {
        // a few tries to find meadow, forest floor or swamp near the player
        fl.live = false;
        for (let t = 0; t < 4 && !fl.live; t++) {
          const x = f.x + (Math.random() * 2 - 1) * 10, z = f.z + (Math.random() * 2 - 1) * 10;
          const tx = Math.floor(x), tz = Math.floor(z);
          if (FLY_GROUND.has(this.map.ground(tx, tz, 0)) && !this.map.roof(tx, tz, 0) && !this.map.isPZ(tx, tz, 0)) {
            Object.assign(fl, { hx: x, hz: z, h: 0.25 + Math.random() * 1.1, live: true });
          }
        }
        if (!fl.live) continue;
      }
      const t = this.time * 0.6 + fl.ph;
      const x = fl.hx + Math.sin(t * 0.9) * 0.6 + Math.sin(t * 2.3) * 0.15;
      const z = fl.hz + Math.cos(t * 0.7) * 0.6 + Math.sin(t * 1.9) * 0.15;
      const y = fl.h + Math.sin(t * 1.3) * 0.15;
      this.mat.makeTranslation(x, y, z);
      this.flyMesh.setMatrixAt(k, this.mat);
      // slow blinking
      this.flyAlpha.array[k++] = this.flyLevel * Math.max(0, Math.sin(this.time * 1.7 + fl.ph * 3)) ** 3;
    }
    this.flyMesh.count = k;
    this.flyMesh.instanceMatrix.needsUpdate = true;
    this.flyAlpha.needsUpdate = true;
  }

  // swamp tiles (always misty) and meadows (misty at dawn) around the player
  scanMist(f) {
    const swamp = [], dew = [];
    const cx = Math.floor(f.x), cz = Math.floor(f.z);
    for (let z = cz - 11; z <= cz + 11; z++) {
      for (let x = cx - 11; x <= cx + 11; x++) {
        if (this.map.roof(x, z, 0)) continue;
        const g = this.map.ground(x, z, 0);
        if (g === G.SWAMP) swamp.push([x, z]);
        else if (DEW_GROUND.has(g) && (x * 7 + z * 13) % 5 === 0) dew.push([x, z]);
      }
    }
    this.mistSpots = { swamp, dew };
  }

  updateMist(dt, o, outside) {
    if (!this.enabled || !outside) { this.mistMesh.count = 0; this.mists.length = 0; return; }
    if (this.time - this.lastScan > 1) { this.lastScan = this.time; this.scanMist(o.focus); }
    const { swamp, dew } = this.mistSpots;
    const dewLevel = o.dawn * 0.8;
    const pickFrom = swamp.length + (dewLevel > 0.05 ? dew.length : 0);
    let k = 0;
    for (let i = 0; i < MISTS; i++) {
      let m = this.mists[i];
      if (!m || m.t >= m.life) {
        if (!pickFrom) { this.mists[i] = null; continue; }
        const r = Math.floor(Math.random() * pickFrom);
        const isSwamp = r < swamp.length;
        const [x, z] = isSwamp ? swamp[r] : dew[r - swamp.length];
        m = this.mists[i] = {
          x: x + Math.random(), z: z + Math.random(), vx: (Math.random() - 0.3) * 0.12, vz: (Math.random() - 0.5) * 0.08,
          s: 2.2 + Math.random() * 2.2, y: 0.12 + Math.random() * 0.25, t: 0, life: 9 + Math.random() * 8, swamp: isSwamp,
        };
      }
      m.t += dt;
      m.x += m.vx * dt;
      m.z += m.vz * dt;
      const u = m.t / m.life;
      const base = (m.swamp ? 0.3 + 0.15 * o.night : 0.32 * dewLevel) * (1 - 0.5 * this.rain);
      this.mat.makeScale(m.s, 1, m.s * 0.7).setPosition(m.x, m.y, m.z);
      this.mistMesh.setMatrixAt(k, this.mat);
      this.mistAlpha.array[k++] = base * Math.min(1, u * 4, (1 - u) * 4);
    }
    this.mistMesh.count = k;
    this.mistMesh.instanceMatrix.needsUpdate = true;
    this.mistAlpha.needsUpdate = true;
  }
}
