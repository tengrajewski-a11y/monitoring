// Procedural walk cycles for static (unrigged) custom models: the vertex shader
// swings legs and arms around the hip and shoulders, spider legs ripple and
// dragon wings flap. Parameters come from the model's bounding box and the
// direction it faces (rotY), so any biped or quadruped mesh works.

import * as THREE from 'three';

const GAIT_GLSL = `
uniform float uPhase;
uniform float uAmt;
uniform float uTime;
uniform vec2 uFwd;
uniform vec2 uCen;
uniform vec4 uBox; // minY, height, half length, half width
#if defined(GAIT_RIG)
// limbs: joints (feet on 0, height 1) hipL, kneeL, shoulderL, elbowL, hipR, kneeR, shoulderR, elbowR
uniform vec3 uJ[8];
uniform float uAng[8];
int gaitPart() {
#ifdef USE_COLOR_ALPHA
  return int(color.a * 16.0);
#else
  return 0;
#endif
}
vec3 rotX(vec3 q, vec3 pivot, float a) {
  vec3 d = q - pivot;
  float c = cos(a), s = sin(a);
  return pivot + vec3(d.x, d.y * c - d.z * s, d.y * s + d.z * c);
}
// the same rotations as gaitOffset, for normals (no pivots)
vec3 gaitNormal(vec3 n) {
  int part = gaitPart();
  if (part == 2) n = rotX(n, vec3(0.0), uAng[1]);
  if (part == 1 || part == 2) n = rotX(n, vec3(0.0), uAng[0]);
  if (part == 6) n = rotX(n, vec3(0.0), uAng[3]);
  if (part == 5 || part == 6) n = rotX(n, vec3(0.0), uAng[2]);
  if (part == 4) n = rotX(n, vec3(0.0), uAng[5]);
  if (part == 3 || part == 4) n = rotX(n, vec3(0.0), uAng[4]);
  if (part == 8) n = rotX(n, vec3(0.0), uAng[7]);
  if (part == 7 || part == 8) n = rotX(n, vec3(0.0), uAng[6]);
  return n;
}
#endif
vec3 gaitOffset(vec3 p) {
#if defined(GAIT_RIG)
  int part = gaitPart();
  vec3 n = vec3((p.x - uCen.x) / uBox.y, (p.y - uBox.x) / uBox.y, (p.z - uCen.y) / uBox.y);
  vec3 q = n;
  if (part == 2) q = rotX(q, uJ[1], uAng[1]);
  if (part == 1 || part == 2) q = rotX(q, uJ[0], uAng[0]);
  if (part == 6) q = rotX(q, uJ[3], uAng[3]);
  if (part == 5 || part == 6) q = rotX(q, uJ[2], uAng[2]);
  if (part == 4) q = rotX(q, uJ[5], uAng[5]);
  if (part == 3 || part == 4) q = rotX(q, uJ[4], uAng[4]);
  if (part == 8) q = rotX(q, uJ[7], uAng[7]);
  if (part == 7 || part == 8) q = rotX(q, uJ[6], uAng[6]);
  return (q - n) * uBox.y;
#endif
  vec2 d = p.xz - uCen;
  float fw = dot(d, uFwd);                      // + towards the front
  float sd = dot(d, vec2(uFwd.y, -uFwd.x));     // lateral
  float h = (p.y - uBox.x) / uBox.y;            // 0 at the feet, 1 on top
  float along = 0.0, up = 0.0, lat = 0.0;
#if defined(GAIT_BIPED)
  float side = smoothstep(-0.12, 0.12, sd / uBox.w) * 2.0 - 1.0;
  float hip = 0.46;
  float leg = clamp((hip - h) / hip, 0.0, 1.0);
  along += sin(uPhase) * side * leg * uBox.y * 0.16 * uAmt;
  up += max(0.0, sin(uPhase) * side) * leg * uBox.y * 0.05 * uAmt;
  float arm = smoothstep(0.5, 0.68, abs(sd) / uBox.w) * clamp((0.72 - h) / 0.5, 0.0, 1.0);
  along -= sin(uPhase) * side * arm * uBox.y * 0.1 * uAmt;
  up += sin(uTime * 2.0) * smoothstep(0.45, 0.9, h) * uBox.y * 0.006;   // breathing
#elif defined(GAIT_QUAD) || defined(GAIT_DRAGON)
  float front = smoothstep(-0.12, 0.12, fw / uBox.z) * 2.0 - 1.0;
  float side = smoothstep(-0.12, 0.12, sd / uBox.w) * 2.0 - 1.0;
  float hip = 0.42;
  float leg = clamp((hip - h) / hip, 0.0, 1.0);
  float pair = front * side;                    // diagonal pairs move together
  along += sin(uPhase) * pair * leg * uBox.y * 0.22 * uAmt;
  up += max(0.0, sin(uPhase) * pair) * leg * uBox.y * 0.06 * uAmt;
#if defined(GAIT_DRAGON)
  float wing = smoothstep(0.45, 0.8, abs(sd) / uBox.w) * smoothstep(0.35, 0.6, h);
  up += sin(uTime * (2.0 + 4.0 * uAmt)) * wing * (abs(sd) - 0.45 * uBox.w) * 0.55;
#endif
#elif defined(GAIT_SPIDER)
  float r = length(d) / max(uBox.z, uBox.w);
  float legs = smoothstep(0.35, 0.7, r) * clamp((0.6 - h) / 0.6, 0.0, 1.0);
  float a = atan(d.y, d.x);
  up += sin(uPhase * 1.5 + a * 4.0) * legs * uBox.y * 0.18 * (0.25 + uAmt);
#endif
  return vec3(uFwd.x * along + uFwd.y * lat, up, uFwd.y * along - uFwd.x * lat);
}`;

const SHADER_GAITS = { biped: 'GAIT_BIPED', quad: 'GAIT_QUAD', dragon: 'GAIT_DRAGON', spider: 'GAIT_SPIDER', rig: 'GAIT_RIG' };

// Patches every mesh under root; returns the per-instance uniforms (or null
// for gaits animated on the whole object, like 'hop' and 'blob').
export function applyGait(root, gait, box, rotYDeg, cfg = {}) {
  const def = SHADER_GAITS[gait];
  if (!def || (gait === 'rig' && !cfg.joints)) return null;
  const th = (rotYDeg * Math.PI) / 180;
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const u = {
    uPhase: { value: 0 }, uAmt: { value: 0 }, uTime: { value: 0 },
    uFwd: { value: new THREE.Vector2(-Math.sin(th), Math.cos(th)) },
    uCen: { value: new THREE.Vector2(c.x, c.z) },
  };
  // half length along the facing direction and half width across it
  const f = u.uFwd.value;
  const hl = Math.abs(f.x) * size.x / 2 + Math.abs(f.y) * size.z / 2;
  const hw = Math.abs(f.y) * size.x / 2 + Math.abs(f.x) * size.z / 2;
  u.uBox = { value: new THREE.Vector4(box.min.y, Math.max(1e-3, size.y), Math.max(1e-3, hl), Math.max(1e-3, hw)) };
  if (gait === 'rig') {
    u.uJ = { value: cfg.joints.map((j) => new THREE.Vector3(...j)) };
    u.uAng = { value: new Array(8).fill(0) };
  }
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material.clone();
    m.defines = { ...(m.defines || {}), [def]: '' };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      let vs = sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += gaitOffset(position);');
      if (gait === 'rig') vs = vs.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = gaitNormal(objectNormal);');
      // after the common chunk so that "color" is declared before the gait functions use it
      sh.vertexShader = vs.replace('#include <common>', '#include <common>\n' + GAIT_GLSL);
    };
    m.customProgramCacheKey = () => `gait-${gait}`;
    o.material = m;
  });
  return u;
}
