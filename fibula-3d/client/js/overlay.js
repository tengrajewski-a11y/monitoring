// 2D overlay drawn at full resolution on top of the pixelated 3D view:
// names, health bars, skulls, speech bubbles and floating numbers.

import * as THREE from 'three';

const FONT = "600 13px 'Pixelify Sans', 'VT323', monospace";
const FONT_SMALL = "600 12px 'Pixelify Sans', 'VT323', monospace";
const FONT_NUM = "700 15px 'Pixelify Sans', 'VT323', monospace";

export const NUM_COLORS = {
  physical: '#ff3a2a', fire: '#ff8a1a', energy: '#c070ff', earth: '#7ad040', ice: '#9ae0ff', poison: '#7ae04a',
  death: '#b060c0', holy: '#ffe070', lifedrain: '#ff4060', heal: '#5cff5c', mana: '#5a8cff', exp: '#ffffff',
};
const SPEECH_COLORS = { say: '#f3e28a', npc: '#7fd0ff', spell: '#ff9b3d', monster: '#ff9b3d', emote: '#ff9b3d', pm: '#9ef0a0', world: '#f3e28a' };

export function hpColor(p) {
  if (p > 75) return '#18c818';
  if (p > 50) return '#8cd818';
  if (p > 25) return '#f0d020';
  if (p > 10) return '#f05028';
  return '#c01818';
}

export class Overlay {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.speech = [];
    this.numbers = [];
    this.v = new THREE.Vector3();
  }

  resize(w, h) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.w = w; this.h = h;
  }

  say(id, name, text, mode, pos) {
    const dur = 2800 + text.length * 55;
    this.speech = this.speech.filter((s) => !(s.id === id && s.mode === mode && performance.now() - s.start > 600));
    this.speech.push({ id, name, text, mode, start: performance.now(), dur, pos });
    if (this.speech.length > 30) this.speech.shift();
  }

  number(x, y, text, kind) {
    this.numbers.push({ x: x + 0.5, z: y + 0.5, text, color: NUM_COLORS[kind] || '#ffffff', start: performance.now(), dur: 1100, off: (Math.random() - 0.5) * 16 });
  }

  outlined(text, x, y, color) {
    const c = this.ctx;
    c.lineWidth = 3;
    c.strokeStyle = '#000';
    c.strokeText(text, x, y);
    c.fillStyle = color;
    c.fillText(text, x, y);
  }

  wrap(text, max) {
    const c = this.ctx;
    const words = text.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (c.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t;
    }
    if (cur) lines.push(cur);
    return lines;
  }

  project(camera, x, y, z) {
    this.v.set(x, y, z).project(camera);
    return { x: (this.v.x * 0.5 + 0.5) * this.w, y: (-this.v.y * 0.5 + 0.5) * this.h, ok: this.v.z < 1 && this.v.z > -1 };
  }

  draw(camera, views, opts) {
    const c = this.ctx;
    c.clearRect(0, 0, this.w, this.h);
    const now = performance.now();
    c.textAlign = 'center';
    c.textBaseline = 'alphabetic';
    // names and health bars
    c.font = FONT;
    const anchors = new Map();
    for (const v of views) {
      const p = this.project(camera, v.pos.x, v.headY + 0.28, v.pos.z);
      if (!p.ok) continue;
      anchors.set(v.id, p);
      const d = v.data;
      const color = hpColor(d.hp);
      const isTarget = v.id === opts.targetId;
      let name = d.name;
      if (d.k === 'p' && opts.showLevels && d.lvl) name += ` [${d.lvl}]`;
      if (d.k !== 'n' || true) this.outlined(name, p.x, p.y - 8, d.k === 'n' ? '#9ad8ff' : color);
      if (d.k !== 'n') {
        const bw = 30, bx = Math.round(p.x - bw / 2), by = Math.round(p.y - 4);
        c.fillStyle = '#000';
        c.fillRect(bx - 1, by - 1, bw + 2, 6);
        c.fillStyle = color;
        c.fillRect(bx, by, Math.round((bw * d.hp) / 100), 4);
        if (isTarget) { c.strokeStyle = '#ff2a2a'; c.lineWidth = 2; c.strokeRect(bx - 4, by - 22, bw + 8, 30); }
      }
      if (d.skull) {
        c.fillStyle = d.skull === 'red' ? '#e01818' : '#f0f0f0';
        c.beginPath(); c.arc(p.x + c.measureText(name).width / 2 + 9, p.y - 12, 5, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#000';
        c.fillRect(p.x + c.measureText(name).width / 2 + 6, p.y - 13, 2, 2);
        c.fillRect(p.x + c.measureText(name).width / 2 + 10, p.y - 13, 2, 2);
      }
    }
    // speech
    c.font = FONT_SMALL;
    this.speech = this.speech.filter((s) => now - s.start < s.dur);
    const stacked = new Map();
    for (let i = this.speech.length - 1; i >= 0; i--) {
      const s = this.speech[i];
      const a = anchors.get(s.id) || (s.pos ? this.project(camera, s.pos.x + 0.5, 1.4, s.pos.y + 0.5) : null);
      if (!a || a.ok === false) continue;
      const lines = this.wrap(s.mode === 'npc' || s.mode === 'say' ? `${s.name}: ${s.text}` : s.text, 260);
      const off = (stacked.get(s.id) || 0);
      const y0 = a.y - 26 - off - lines.length * 14;
      const col = SPEECH_COLORS[s.mode] || '#f3e28a';
      lines.forEach((ln, k) => this.outlined(ln, a.x, y0 + k * 14 + 12, col));
      stacked.set(s.id, off + lines.length * 14 + 4);
    }
    if (opts.crosshair) {
      const cx = Math.round(this.w / 2), cy = Math.round(this.h / 2);
      c.fillStyle = '#000';
      c.fillRect(cx - 7, cy - 2, 14, 4); c.fillRect(cx - 2, cy - 7, 4, 14);
      c.fillStyle = '#f0e6cc';
      c.fillRect(cx - 6, cy - 1, 12, 2); c.fillRect(cx - 1, cy - 6, 2, 12);
    }
    // floating numbers
    c.font = FONT_NUM;
    this.numbers = this.numbers.filter((n) => now - n.start < n.dur);
    for (const n of this.numbers) {
      const t = (now - n.start) / n.dur;
      const p = this.project(camera, n.x, 1.1, n.z);
      if (!p.ok) continue;
      c.globalAlpha = Math.min(1, (1 - t) * 2);
      this.outlined(n.text, p.x + n.off, p.y - t * 38, n.color);
      c.globalAlpha = 1;
    }
  }
}
