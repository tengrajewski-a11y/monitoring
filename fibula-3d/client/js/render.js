// Renderer, camera rig, day/night lighting and the retro post-process
// (low internal resolution, depth outlines, ordered dithering, posterize).

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
void main() {
  vec2 px = 1.0 / uRes;
  vec3 col = texture2D(tColor, vUv).rgb;
  float d = linDepth(vUv);
  float dn = max(max(linDepth(vUv + vec2(px.x, 0.0)), linDepth(vUv - vec2(px.x, 0.0))),
                 max(linDepth(vUv + vec2(0.0, px.y)), linDepth(vUv - vec2(0.0, px.y))));
  float edge = smoothstep(0.035 * d, 0.11 * d, dn - d) * step(d, uFar * 0.98);
  col *= 1.0 - uOutline * edge;
  col = toSRGB(col);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSat);
  col += uFlash;
  vec2 cell = floor(vUv * uRes);
  float b = bayer4(cell) - 0.5;
  col = floor(col * uLevels + 0.5 + b * uDither) / uLevels;
  vec2 q = vUv - 0.5;
  col *= 1.0 - uVignette * dot(q, q) * 1.6;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

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
    // camera rig state
    this.yaw = 0; this.yawTarget = 0;
    this.pitch = 0.92;
    this.dist = 17; this.distTarget = 17;
    this.target = new THREE.Vector3(80, 0, 80);
    this.shake = 0;
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
    // post processing
    this.pixelScale = 3;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.rt.depthTexture = new THREE.DepthTexture(4, 4);
    this.post = new THREE.ShaderMaterial({
      vertexShader: POST_VERT, fragmentShader: POST_FRAG, depthTest: false, depthWrite: false,
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture }, uRes: { value: new THREE.Vector2(4, 4) },
        uNear: { value: this.camera.near }, uFar: { value: this.camera.far }, uLevels: { value: 28 }, uDither: { value: 0.9 },
        uOutline: { value: 0.45 }, uVignette: { value: 0.55 }, uSat: { value: 1.08 }, uFlash: { value: new THREE.Vector3() },
      },
    });
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    quad.frustumCulled = false;
    this.postScene.add(quad);
    this.underground = false;
    this.nightFactor = 0;
    this.flashColor = new THREE.Vector3();
    this.resize();
  }

  setPixelScale(s) { this.pixelScale = s; this.resize(); }
  setRetro(level) {
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
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w; this.height = h;
  }

  rotate(dir) { this.yawTarget += dir * Math.PI / 2; }
  zoom(delta) { this.distTarget = Math.max(9, Math.min(28, this.distTarget + delta)); }

  // index 0..3 of the camera quadrant (used to map arrow keys to directions)
  get quadrant() { return ((Math.round(this.yawTarget / (Math.PI / 2)) % 4) + 4) % 4; }

  updateCamera(focus, dt) {
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
    this.scene.fog.near = this.dist + 8;
    this.scene.fog.far = this.dist + 30;
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
    if (underground) {
      bg.copy(SKY.cave); fog.copy(SKY.cave);
      this.hemi.color.setHex(0x6a6a80); this.hemi.groundColor.setHex(0x2a2018); this.hemi.intensity = 0.55;
      this.sun.intensity = 0;
      this.sun.castShadow = false;
    } else {
      mixColor(bg, SKY.night, SKY.day, day);
      bg.lerp(SKY.dawn, dusk * 0.55);
      fog.copy(bg);
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

  render() {
    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.render(this.scene, this.camera);
    r.setRenderTarget(null);
    r.render(this.postScene, this.postCam);
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
