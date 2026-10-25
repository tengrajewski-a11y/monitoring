// Test helpers: boot a server on a random port with a temp data dir and
// drive it with WebSocket clients.
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../server/index.js';

export async function boot(overrides = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fibula-test-'));
  const srv = await startServer({ port: 0, host: '127.0.0.1', dataDir, ...overrides });
  return { ...srv, dataDir, async close() { await srv.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); } };
}

export class Client {
  constructor(port) {
    this.port = port;
    this.msgs = [];
    this.waiters = [];
    this.creatures = new Map();
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://127.0.0.1:${this.port}/ws`);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (d) => {
        for (const m of JSON.parse(d.toString())) {
          this.msgs.push(m);
          if (m.t === 'welcome') this.id = m.id;
          if (m.t === 'self') this.self = m;
          if (m.t === 'inv') this.inv = m;
          if (m.t === 'cr+') this.creatures.set(m.c.id, m.c);
          if (m.t === 'cr-') this.creatures.delete(m.id);
          if ((m.t === 'mv' || m.t === 'tp') && this.creatures.has(m.id)) Object.assign(this.creatures.get(m.id), { x: m.x, y: m.y, z: m.z });
          for (const w of [...this.waiters]) if (w.pred(m)) { this.waiters.splice(this.waiters.indexOf(w), 1); w.resolve(m); }
        }
      });
    });
  }
  send(m) { this.ws.send(JSON.stringify(m)); }
  wait(pred, ms = 4000) {
    const found = this.msgs.find(pred);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      this.waiters.push(w);
      setTimeout(() => { const i = this.waiters.indexOf(w); if (i >= 0) { this.waiters.splice(i, 1); reject(new Error('timeout waiting for message')); } }, ms);
    });
  }
  waitNew(pred, ms) { const start = this.msgs.length; return this.wait((m) => this.msgs.indexOf(m) >= start && pred(m), ms); }
  get me() { return this.creatures.get(this.id); }
  close() { this.ws.close(); }
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
