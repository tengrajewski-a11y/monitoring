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
vec3 gaitOffset(vec3 p) {
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

const SHADER_GAITS = { biped: 'GAIT_BIPED', quad: 'GAIT_QUAD', dragon: 'GAIT_DRAGON', spider: 'GAIT_SPIDER' };

// Patches every mesh under root; returns the per-instance uniforms (or null
// for gaits animated on the whole object, like 'hop' and 'blob').
export function applyGait(root, gait, box, rotYDeg) {
  const def = SHADER_GAITS[gait];
  if (!def) return null;
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
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material.clone();
    m.defines = { ...(m.defines || {}), [def]: '' };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = GAIT_GLSL + '\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += gaitOffset(position);');
    };
    m.customProgramCacheKey = () => `gait-${gait}`;
    o.material = m;
  });
  return u;
}
