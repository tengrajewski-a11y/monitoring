// Renderer, camera rig, day/night lighting and the retro post-process
// (low internal resolution, ambient occlusion from depth, HDR bloom, colour
// grading, depth outlines, ordered dithering, posterize).

import * as THREE from 'three';

const POST_VERT = `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const POST_FRAG = `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uNear;
uniform float uFar;
uniform float uLevels;
uniform float uDither;
uniform float uOutline;
uniform float uVignette;
uniform float uSat;
uniform vec3 uFlash;
uniform sampler2D tAO;
uniform vec2 uAORes;
uniform float uAO;
uniform sampler2D tBloom;
uniform float uBloom;
uniform vec3 uShadowTint;
uniform vec3 uHighTint;
uniform float uContrast;
uniform float uDebug;
varying vec2 vUv;

float linDepth(vec2 uv) {
  float z = texture2D(tDepth, uv).x * 2.0 - 1.0;
  return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear));
}
float bayer4(vec2 p) {
  vec2 q = mod(floor(p), 4.0);
  float x = q.x, y = q.y, v;
  if (y < 0.5) v = x < 0.5 ? 0.0 : x < 1.5 ? 8.0 : x < 2.5 ? 2.0 : 10.0;
  else if (y < 1.5) v = x < 0.5 ? 12.0 : x < 1.5 ? 4.0 : x < 2.5 ? 14.0 : 6.0;
  else if (y < 2.5) v = x < 0.5 ? 3.0 : x < 1.5 ? 11.0 : x < 2.5 ? 1.0 : 9.0;
  else v = x < 0.5 ? 15.0 : x < 1.5 ? 7.0 : x < 2.5 ? 13.0 : 5.0;
  return v / 16.0;
}
vec3 toSRGB(vec3 c) {
  c = max(c, 0.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
// 4x4 depth aware blur of the ambient occlusion (removes its 4x4 noise pattern)
float aoBlur(float d) {
  vec2 px = 1.0 / uAORes;
  float sum = 0.0, wsum = 0.0;
  for (int j = -2; j < 2; j++) for (int i = -2; i < 2; i++) {
    vec2 o = (vec2(float(i), float(j)) + 0.5) * px;
    float w = 1.0 / (0.02 + abs(linDepth(vUv + o) - d) / d * 40.0);
    sum += texture2D(tAO, vUv + o).r * w;
    wsum += w;
  }
  return sum / wsum;
}
void main() {
  vec2 px = 1.0 / uRes;
  vec3 col = texture2D(tColor, vUv).rgb;
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  float d = linDepth(vUv);
  if (uDebug > 0.5) { gl_FragColor = vec4(vec3(aoBlur(d)), 1.0); return; }
  if (uAO > 0.0 && d < uFar * 0.98) col *= mix(1.0, aoBlur(d), uAO);
  if (uBloom > 0.0) col += texture2D(tBloom, vUv).rgb * uBloom;
  float dn = max(max(linDepth(vUv + vec2(px.x, 0.0)), linDepth(vUv - vec2(px.x, 0.0))),
                 max(linDepth(vUv + vec2(0.0, px.y)), linDepth(vUv - vec2(0.0, px.y))));
  float edge = smoothstep(0.035 * d, 0.11 * d, dn - d) * step(d, uFar * 0.98);
  col *= 1.0 - uOutline * edge;
  col = toSRGB(col);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  // split toning: tint shadows and highlights separately, then contrast
  col *= mix(uShadowTint, uHighTint, smoothstep(0.15, 0.75, l));
  col = (col - 0.5) * uContrast + 0.5;
  l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  col += uFlash;
  vec2 cell = floor(vUv * uRes);
  float b = bayer4(cell) - 0.5;
  col = floor(col * uLevels + 0.5 + b * uDither) / uLevels;
  vec2 q = vUv - 0.5;
  col *= 1.0 - uVignette * dot(q, q) * 1.6;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

// Ambient occlusion from the depth buffer: view space position and normal are
// rebuilt from depth, then a hemisphere of samples is tested against it.
const AO_FRAG = `
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform mat4 uProj;
uniform mat4 uProjInv;
uniform float uRadius;
uniform vec3 uKernel[AO_SAMPLES];
varying vec2 vUv;
vec3 viewPos(vec2 uv) {
  vec4 v = uProjInv * vec4(uv * 2.0 - 1.0, texture2D(tDepth, uv).x * 2.0 - 1.0, 1.0);
  return v.xyz / v.w;
}
void main() {
  if (texture2D(tDepth, vUv).x >= 1.0) { gl_FragColor = vec4(1.0); return; }
  vec2 px = 1.0 / uRes;
  vec3 p = viewPos(vUv);
  vec3 pr = viewPos(vUv + vec2(px.x, 0.0)), pl = viewPos(vUv - vec2(px.x, 0.0));
  vec3 pu = viewPos(vUv + vec2(0.0, px.y)), pd = viewPos(vUv - vec2(0.0, px.y));
  vec3 dx = abs(pr.z - p.z) < abs(pl.z - p.z) ? pr - p : p - pl;
  vec3 dy = abs(pu.z - p.z) < abs(pd.z - p.z) ? pu - p : p - pd;
  vec3 n = normalize(cross(dx, dy));
  vec2 cell = mod(floor(vUv * uRes), 4.0);
  float ang = (cell.x * 4.0 + cell.y) * 0.3927 + cell.x * 1.7;
  vec3 rnd = vec3(cos(ang), sin(ang), 0.0);
  vec3 t = normalize(rnd - n * dot(rnd, n));
  mat3 tbn = mat3(t, cross(n, t), n);
  float occ = 0.0;
  for (int i = 0; i < AO_SAMPLES; i++) {
    vec3 sp = p + tbn * uKernel[i] * uRadius;
    vec4 q = uProj * vec4(sp, 1.0);
    vec2 suv = q.xy / q.w * 0.5 + 0.5;
    float sz = viewPos(suv).z;
    float range = smoothstep(0.0, 1.0, uRadius / max(1e-3, abs(p.z - sz)));
    occ += (sz >= sp.z + 0.03 ? 1.0 : 0.0) * range;
  }
  float ao = 1.0 - occ / float(AO_SAMPLES);
  gl_FragColor = vec4(vec3(ao * ao), 1.0);
}`;

// Bloom: keep what is brighter than the threshold (max channel, HDR), downsampled.
const BRIGHT_FRAG = `
uniform sampler2D tColor;
uniform vec2 uSrcPx;
uniform float uThreshold;
varying vec2 vUv;
void main() {
  vec3 c = (texture2D(tColor, vUv + vec2(-1.0, -1.0) * uSrcPx).rgb + texture2D(tColor, vUv + vec2(1.0, -1.0) * uSrcPx).rgb
          + texture2D(tColor, vUv + vec2(-1.0, 1.0) * uSrcPx).rgb + texture2D(tColor, vUv + vec2(1.0, 1.0) * uSrcPx).rgb) * 0.25;
  if (any(isnan(c)) || any(isinf(c))) c = vec3(0.0);   // never let a bad pixel spread through the blur
  float m = max(c.r, max(c.g, c.b));
  gl_FragColor = vec4(min(c, vec3(16.0)) * smoothstep(uThreshold, uThreshold * 1.6, m), 1.0);
}`;

const BLUR_FRAG = `
uniform sampler2D tSrc;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tSrc, vUv).rgb * 0.227;
  c += (texture2D(tSrc, vUv + uDir * 1.385).rgb + texture2D(tSrc, vUv - uDir * 1.385).rgb) * 0.316;
  c += (texture2D(tSrc, vUv + uDir * 3.231).rgb + texture2D(tSrc, vUv - uDir * 3.231).rgb) * 0.070;
  gl_FragColor = vec4(c, 1.0);
}`;

// Quality presets: ambient occlusion samples (0 = off), bloom passes, shadow softness.
const QUALITY = {
  low: { ao: 0, bloom: 0, shadowRadius: 1, shadowMap: 1024 },
  medium: { ao: 8, bloom: 1, shadowRadius: 2, shadowMap: 2048 },
  high: { ao: 14, bloom: 2, shadowRadius: 3, shadowMap: 2048 },
};

function aoKernel(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    // deterministic, denser near the centre, hemisphere around +z
    const a = i * 2.39996, r = Math.sqrt((i + 0.5) / n);
    const z = 0.15 + 0.85 * ((i * 0.618) % 1);
    const v = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, z).normalize();
    const s = 0.2 + 0.8 * ((i + 1) / n) ** 2;
    out.push(v.multiplyScalar(s));
  }
  return out;
}

function mixColor(out, a, b, t) { return out.copy(a).lerp(b, Math.max(0, Math.min(1, t))); }
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

const C = (h) => new THREE.Color(h);
const SKY = { night: C(0x0d1430), dawn: C(0xe89a6a), day: C(0x8ccaf2), cave: C(0x050404) };

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const r = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.NoToneMapping;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.background = SKY.day.clone();
    this.scene.fog = new THREE.Fog(SKY.day.clone(), 26, 46);
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.5, 90);
    this.camera.layers.set(0);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    // first person view state
    this.fpp = false;
    this.lookYaw = 0;
    this.lookPitch = -0.12;
    this.bob = 0;
    this.buildSky();
    // camera rig state
    this.yaw = 0; this.yawTarget = 0;
    this.pitch = 0.92;
    this.dist = 19; this.distTarget = 19;
    this.target = new THREE.Vector3(80, 0, 80);
    this.shake = 0;
    this.rain = 0;           // 0..1, set from the weather each frame
    this.rainSky = new THREE.Color();
    // lights
    this.hemi = new THREE.HemisphereLight(0xbfe0ff, 0x7a6a48, 1.2);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff4dd, 2.4);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -20; sc.right = 20; sc.top = 20; sc.bottom = -20; sc.near = 1; sc.far = 90;
    sc.layers.enable(1);
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;
    this.sun.shadow.radius = 3;
    this.scene.add(this.sun, this.sun.target);
    this.pool = [];
    for (let i = 0; i < 7; i++) {
      const l = new THREE.PointLight(0xffa040, 0, 6, 1.4);
      this.scene.add(l);
      this.pool.push(l);
    }
    this.playerLight = new THREE.PointLight(0xffe0b0, 0, 6, 1.2);
    this.scene.add(this.playerLight);
    this.flashLight = new THREE.PointLight(0xff8040, 0, 7, 1.5);
    this.scene.add(this.flashLight);
    this.flashT = 0;
    // post processing: the scene renders to a small HDR target when the GPU can
    this.pixelScale = 3;
    const ext = r.extensions;
    this.hdr = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
    const colorType = this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true, type: colorType });
    this.rt.depthTexture = new THREE.DepthTexture(4, 4);
    this.aoRT = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false });
    this.bloomA = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, type: colorType });
    this.bloomB = this.bloomA.clone();
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture }, uRes: { value: new THREE.Vector2(4, 4) },
        uNear: { value: this.camera.near }, uFar: { value: this.camera.far }, uLevels: { value: 28 }, uDither: { value: 0.9 },
        uOutline: { value: 0.45 }, uVignette: { value: 0.55 }, uSat: { value: 1.08 }, uFlash: { value: new THREE.Vector3() },
        tAO: { value: this.aoRT.texture }, uAORes: { value: new THREE.Vector2(4, 4) }, uAO: { value: 0 },
        tBloom: { value: this.bloomA.texture }, uBloom: { value: 0 },
        uShadowTint: { value: new THREE.Vector3(1, 1, 1) }, uHighTint: { value: new THREE.Vector3(1, 1, 1) }, uContrast: { value: 1.06 },
        uDebug: { value: 0 }, // 1 = show the ambient occlusion buffer
      },
    });
    this.aoMat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: AO_FRAG, depthTest: false, depthWrite: false, defines: { AO_SAMPLES: 8 },
      uniforms: {
        tDepth: { value: this.rt.depthTexture }, uRes: { value: new THREE.Vector2(4, 4) }, uProj: { value: new THREE.Matrix4() },
        uProjInv: { value: new THREE.Matrix4() }, uRadius: { value: 0.55 }, uKernel: { value: aoKernel(8) },
      },
    });
    this.brightMat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: BRIGHT_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: this.rt.texture }, uSrcPx: { value: new THREE.Vector2() }, uThreshold: { value: this.hdr ? 1.15 : 0.85 } },
    });
    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: BLUR_FRAG, depthTest: false, depthWrite: false,
      uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } },
    });
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    this.quad.frustumCulled = false;
    this.postScene.add(this.quad);
    this.setQuality('high');
    this.underground = false;
    this.nightFactor = 0;
    this.flashColor = new THREE.Vector3();
    this.resize();
  }

  buildSky() {
    const geo = new THREE.SphereGeometry(80, 24, 12);
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uTop: { value: new THREE.Color(0x4a7ac8) }, uBottom: { value: new THREE.Color(0x8ccaf2) } },
      vertexShader: 'varying float vH; void main() { vH = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uTop; uniform vec3 uBottom; varying float vH; void main() { gl_FragColor = vec4(mix(uBottom, uTop, smoothstep(0.0, 0.6, vH)), 1.0); }',
    });
    this.sky = new THREE.Mesh(geo, this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.sky.visible = false;
    const pts = [];
    for (let i = 0; i < 500; i++) {
      const a = Math.random() * Math.PI * 2, h = 0.08 + Math.random() * 0.92;
      const r = Math.sqrt(1 - h * h);
      pts.push(Math.cos(a) * r * 75, h * 75, Math.sin(a) * r * 75);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.sky.add(this.stars);
    this.scene.add(this.sky);
  }

  // Switches between the classic top-down camera and first person view.
  setView(fpp) {
    this.fpp = fpp;
    const c = this.camera;
    c.fov = fpp ? 72 : 30;
    c.near = fpp ? 0.05 : 0.5;
    c.far = 90;
    c.updateProjectionMatrix();
    this.post.uniforms.uNear.value = c.near;
    this.post.uniforms.uOutline.value = fpp ? 0.3 : (this.retro === 'strong' ? 0.6 : this.retro === 'off' ? 0.25 : 0.45);
    if (fpp) c.layers.enable(1); else c.layers.disable(1);
  }

  turnView(delta) { this.lookYaw += delta; }
  look(dx, dy) {
    this.lookYaw -= dx;
    this.lookPitch = Math.max(-1.35, Math.min(0.7, this.lookPitch - dy));
  }

  // Unit vectors (map coordinates) for the current first-person heading.
  get viewForward() { return { x: -Math.sin(this.lookYaw), y: -Math.cos(this.lookYaw) }; }
  get viewRight() { return { x: Math.cos(this.lookYaw), y: -Math.sin(this.lookYaw) }; }

  setPixelScale(s) { this.pixelScale = s; this.resize(); }

  // 'low' | 'medium' | 'high': ambient occlusion, bloom and shadow softness
  setQuality(level) {
    const q = QUALITY[level] || QUALITY.high;
    this.quality = q;
    if (q.ao) {
      this.aoMat.defines.AO_SAMPLES = q.ao;
      this.aoMat.uniforms.uKernel.value = aoKernel(q.ao);
      this.aoMat.needsUpdate = true;
    }
    this.post.uniforms.uAO.value = q.ao ? 0.75 : 0;
    this.post.uniforms.uBloom.value = q.bloom ? 0.9 : 0;
    this.sun.shadow.radius = q.shadowRadius;
    if (this.sun.shadow.mapSize.x !== q.shadowMap) {
      this.sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
    this.resize();
  }
  setRetro(level) {
    this.retro = level;
    const u = this.post.uniforms;
    if (level === 'off') { u.uLevels.value = 256; u.uDither.value = 0; u.uOutline.value = 0.25; }
    else if (level === 'strong') { u.uLevels.value = 10; u.uDither.value = 1.0; u.uOutline.value = 0.6; }
    else { u.uLevels.value = 28; u.uDither.value = 0.9; u.uOutline.value = 0.45; }
  }

  resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(w, h, false);
    const lw = Math.max(64, Math.round(w / this.pixelScale)), lh = Math.max(48, Math.round(h / this.pixelScale));
    this.rt.setSize(lw, lh);
    this.post.uniforms.uRes.value.set(lw, lh);
    // occlusion at most ~640 px wide, bloom at a quarter of the scene target
    const aoF = Math.min(1, 640 / lw);
    const aw = Math.max(32, Math.round(lw * aoF)), ah = Math.max(24, Math.round(lh * aoF));
    this.aoRT.setSize(aw, ah);
    this.aoMat.uniforms.uRes.value.set(aw, ah);
    this.post.uniforms.uAORes.value.set(aw, ah);
    const bw = Math.max(16, Math.round(lw / 4)), bh = Math.max(12, Math.round(lh / 4));
    this.bloomA.setSize(bw, bh);
    this.bloomB.setSize(bw, bh);
    this.brightMat.uniforms.uSrcPx.value.set(1 / lw, 1 / lh);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w; this.height = h;
  }

  rotate(dir) { this.yawTarget += dir * Math.PI / 2; }
  zoom(delta) { this.distTarget = Math.max(9, Math.min(28, this.distTarget + delta)); }

  // index 0..3 of the camera quadrant (used to map arrow keys to directions)
  get quadrant() { return ((Math.round(this.yawTarget / (Math.PI / 2)) % 4) + 4) % 4; }

  updateCamera(focus, dt) {
    if (this.fpp) {
      const c = this.camera;
      this.target.copy(focus);
      c.position.set(focus.x, focus.y + 0.86 + this.bob, focus.z);
      c.rotation.set(this.lookPitch, this.lookYaw, 0, 'YXZ');
      if (this.shake > 0) { c.rotation.z = (Math.random() - 0.5) * this.shake * 0.05; this.shake = Math.max(0, this.shake - dt * 3); }
      this.scene.fog.near = 9 - this.rain * 3;
      this.scene.fog.far = 30 - this.rain * 10;
      this.sky.position.copy(c.position);
      return;
    }
    this.target.lerp(focus, Math.min(1, dt * 10));
    this.yaw += (this.yawTarget - this.yaw) * Math.min(1, dt * 8);
    this.dist += (this.distTarget - this.dist) * Math.min(1, dt * 8);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const c = this.camera;
    c.position.set(this.target.x + Math.sin(this.yaw) * cp * this.dist, this.target.y + sp * this.dist, this.target.z + Math.cos(this.yaw) * cp * this.dist);
    if (this.shake > 0) {
      c.position.x += (Math.random() - 0.5) * this.shake * 0.3;
      c.position.y += (Math.random() - 0.5) * this.shake * 0.3;
      this.shake = Math.max(0, this.shake - dt * 3);
    }
    c.lookAt(this.target.x, this.target.y + 0.4, this.target.z);
    this.scene.fog.near = this.dist + 8 - this.rain * 5;
    this.scene.fog.far = this.dist + 30 - this.rain * 12;
  }

  // phase: 0 = midnight, 0.5 = noon
  updateLighting(phase, underground, focus, lights, playerLightRadius, dt) {
    this.underground = underground;
    const sunH = Math.sin((phase - 0.25) * Math.PI * 2);
    const day = smooth(-0.12, 0.3, sunH);
    const dusk = 1 - Math.min(1, Math.abs(sunH) / 0.28);
    const night = underground ? 1 : 1 - day;
    this.nightFactor = night;
    const bg = this.scene.background, fog = this.scene.fog.color;
    this.sky.visible = this.fpp && !underground;
    // colour grading: cool shadows and warm light by day, golden dusk, blue night,
    // warm torch light under ground
    const pu = this.post.uniforms;
    if (underground) { pu.uShadowTint.value.set(0.9, 0.93, 1.08); pu.uHighTint.value.set(1.1, 1.0, 0.86); }
    else {
      const sh = pu.uShadowTint.value.set(0.95, 0.98, 1.06), hi = pu.uHighTint.value.set(1.05, 1.0, 0.93);
      sh.lerp(new THREE.Vector3(0.95, 0.9, 1.05), dusk * 0.7).lerp(new THREE.Vector3(0.84, 0.92, 1.18), night);
      hi.lerp(new THREE.Vector3(1.14, 0.98, 0.84), dusk * 0.8).lerp(new THREE.Vector3(0.94, 0.98, 1.1), night);
    }
    if (underground) {
      bg.copy(SKY.cave); fog.copy(SKY.cave);
      this.hemi.color.setHex(0x6a6a80); this.hemi.groundColor.setHex(0x2a2018); this.hemi.intensity = 0.55;
      this.sun.intensity = 0;
      this.sun.castShadow = false;
    } else {
      mixColor(bg, SKY.night, SKY.day, day);
      bg.lerp(SKY.dawn, dusk * 0.55);
      // overcast while it rains
      bg.lerp(this.rainSky.setHex(0x6e7680).multiplyScalar(0.3 + 0.7 * day), 0.65 * this.rain);
      fog.copy(bg);
      this.skyMat.uniforms.uBottom.value.copy(bg);
      this.skyMat.uniforms.uTop.value.copy(SKY.night).lerp(new THREE.Color(0x3f78d8), day).lerp(new THREE.Color(0x6a4a8a), dusk * 0.3)
        .lerp(this.rainSky, 0.7 * this.rain);
      this.stars.material.opacity = Math.max(0, night - 0.35) * 1.4 * (1 - this.rain);
      this.hemi.color.copy(SKY.night).lerp(new THREE.Color(0xd8ecff), day);
      this.hemi.groundColor.setHex(0x5a4a32).lerp(new THREE.Color(0x8a7a50), day);
      this.hemi.intensity = 0.55 + day * 0.85;
      this.sun.castShadow = true;
      // sun during the day, moon at night
      const ang = (phase - 0.25) * Math.PI * 2;
      const isDay = sunH > -0.05;
      const dir = isDay ? new THREE.Vector3(Math.cos(ang) * 0.8, Math.max(0.25, Math.abs(sunH)), 0.45)
        : new THREE.Vector3(-Math.cos(ang) * 0.6, Math.max(0.35, -sunH), 0.6);
      dir.normalize();
      this.sun.position.copy(focus).addScaledVector(dir, 40);
      this.sun.target.position.copy(focus);
      if (isDay) {
        this.sun.color.setHex(0xffb878).lerp(new THREE.Color(0xfff6e4), smooth(0.05, 0.5, sunH));
        this.sun.intensity = 0.6 + 2.0 * day;
      } else {
        this.sun.color.setHex(0x8a9cff);
        this.sun.intensity = 0.45;
      }
      this.sun.intensity *= 1 - 0.65 * this.rain;
      this.hemi.intensity *= 1 - 0.3 * this.rain;
    }
    // point light pool: nearest light sources
    const lampF = underground ? 1 : 0.25 + night * 0.9;
    const sorted = lights
      .map((l) => ({ l, d: (l.x - focus.x) ** 2 + (l.y - focus.z) ** 2 }))
      .filter((e) => e.d < 22 * 22)
      .sort((a, b) => a.d - b.d);
    const t = performance.now() / 1000;
    this.pool.forEach((pl, i) => {
      const e = sorted[i];
      if (!e) { pl.intensity = 0; return; }
      pl.position.set(e.l.x, e.l.h, e.l.y);
      pl.color.setHex(e.l.color);
      pl.distance = e.l.r * 1.4;
      pl.intensity = (3.2 + Math.sin(t * 9 + i * 2) * 0.35 + Math.sin(t * 23 + i) * 0.2) * lampF;
    });
    const pr = Math.max(playerLightRadius, underground ? 4.5 : 2.5 + night * 2.5);
    this.playerLight.position.set(focus.x, focus.y + 1.6, focus.z);
    this.playerLight.distance = pr * 1.5;
    this.playerLight.intensity = (underground ? 2.6 : night * 2.4) + (playerLightRadius > 0 ? 1.5 : 0);
    // flashes from spells
    if (this.flashT > 0) {
      this.flashT = Math.max(0, this.flashT - dt * 4);
      this.flashLight.intensity = this.flashT * 10;
    } else this.flashLight.intensity = 0;
    this.post.uniforms.uFlash.value.copy(this.flashColor).multiplyScalar(this.flashT * 0.25);
  }

  flash(x, z, color) {
    this.flashLight.position.set(x, 1, z);
    this.flashLight.color.setHex(color);
    this.flashT = 1;
    const c = new THREE.Color(color);
    this.flashColor.set(c.r, c.g, c.b);
  }

  screenFlash(color, amount = 1) {
    const c = new THREE.Color(color);
    this.flashColor.set(c.r * amount, c.g * amount, c.b * amount);
    this.flashT = 1;
  }

  pass(material, target) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.postScene, this.postCam);
  }

  render() {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    const q = this.quality;
    if (q.ao) {
      const u = this.aoMat.uniforms;
      u.uProj.value.copy(this.camera.projectionMatrix);
      u.uProjInv.value.copy(this.camera.projectionMatrixInverse);
      this.pass(this.aoMat, this.aoRT);
    }
    if (q.bloom) {
      this.pass(this.brightMat, this.bloomA);
      const b = this.blurMat.uniforms;
      for (let i = 0; i < q.bloom; i++) {
        const k = 1 + i;
        b.tSrc.value = this.bloomA.texture; b.uDir.value.set(k / this.bloomA.width, 0);
        this.pass(this.blurMat, this.bloomB);
        b.tSrc.value = this.bloomB.texture; b.uDir.value.set(0, k / this.bloomA.height);
        this.pass(this.blurMat, this.bloomA);
      }
    }
    this.pass(this.post, null);
  }

  // Ray from screen point to the ground plane (y = 0). Returns {x, z} or null.
  pickGround(sx, sy) {
    const ndc = new THREE.Vector2((sx / this.width) * 2 - 1, -(sy / this.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    if (!(t > 0)) return null;
    const p = ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    return { x: p.x, z: p.z };
  }

  project(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.width, y: (-p.y * 0.5 + 0.5) * this.height, behind: p.z > 1 };
  }
}
