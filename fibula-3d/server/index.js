// Fibula 3D server entry point: static HTTP server for the client, the
// binary map endpoint and the WebSocket game protocol (JSON messages).

import http from 'node:http';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { loadConfig, ROOT } from './config.js';
import { World } from './world.js';
import { BEAT_MS, GAME_NAME } from '../shared/constants.js';

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.glb': 'model/gltf-binary', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

const STATIC = [
  ['/shared/', path.join(ROOT, 'shared')],
  ['/vendor/three/', path.join(ROOT, 'node_modules', 'three', 'build')],
  ['/vendor/three-addons/', path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm')],
  ['/', path.join(ROOT, 'client')],
];

function serveStatic(req, res, urlPath) {
  for (const [prefix, dir] of STATIC) {
    if (!urlPath.startsWith(prefix)) continue;
    let rel;
    try { rel = decodeURIComponent(urlPath.slice(prefix.length)); } catch { return false; }
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = path.resolve(dir, rel);
    if (!file.startsWith(dir + path.sep) && file !== dir) break;
    let stat;
    try { stat = fs.statSync(file); } catch { continue; }
    if (!stat.isFile()) continue;
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    const headers = { 'Content-Type': type, 'Cache-Control': prefix.startsWith('/vendor/') || rel.startsWith('assets/') ? 'public, max-age=3600' : 'no-cache', 'X-Content-Type-Options': 'nosniff' };
    const accept = req.headers['accept-encoding'] || '';
    if (/\bgzip\b/.test(accept) && /text|javascript|json|svg/.test(type) && stat.size > 1024) {
      headers['Content-Encoding'] = 'gzip';
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end(), true;
      fs.createReadStream(file).pipe(zlib.createGzip()).pipe(res);
    } else {
      headers['Content-Length'] = stat.size;
      res.writeHead(200, headers);
      if (req.method === 'HEAD') return res.end(), true;
      fs.createReadStream(file).pipe(res);
    }
    return true;
  }
  return false;
}

export function startServer(overrides = {}) {
  const config = loadConfig(overrides);
  const world = new World(config);
  const mapGz = zlib.gzipSync(world.mapBuffer, { level: 9 });

  const server = http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end(); return; }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/map') {
      res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'gzip', 'Cache-Control': 'no-cache', 'Content-Length': mapGz.length });
      res.end(req.method === 'HEAD' ? undefined : mapGz);
      return;
    }
    if (url.pathname === '/api/status') {
      const body = JSON.stringify(world.status());
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'Access-Control-Allow-Origin': '*' });
      res.end(body);
      return;
    }
    if (!serveStatic(req, res, url.pathname)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('Not found'); }
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024, perMessageDeflate: { threshold: 512 } });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws, req) => {
    const session = {
      ws, player: null,
      ip: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress,
      tokens: 60, last: Date.now(),
      sendRaw(str) { if (ws.readyState === ws.OPEN) ws.send(str); },
      sendNow(obj) { this.sendRaw(JSON.stringify([obj])); },
      kick(reason) { this.sendNow({ t: 'kicked', text: reason }); this.player = null; setTimeout(() => ws.close(), 50); },
    };
    ws.on('message', (data, isBinary) => {
      if (isBinary) return;
      // token bucket: ~30 messages/s sustained
      const now = Date.now();
      session.tokens = Math.min(60, session.tokens + ((now - session.last) / 1000) * 30);
      session.last = now;
      if (session.tokens < 1) return;
      session.tokens -= 1;
      let msg;
      try { msg = JSON.parse(data.toString()); } catch { return; }
      try { world.handle(session, msg); } catch (e) { console.error('[handle]', e); }
    });
    ws.on('close', () => world.disconnected(session));
    ws.on('error', () => {});
    session.sendNow({ t: 'hello', game: GAME_NAME, world: config.worldName });
  });

  const timer = setInterval(() => world.tick(), BEAT_MS);

  const shutdown = () => {
    console.log('\n[server] zapisywanie postaci...');
    clearInterval(timer);
    world.shutdown();
    for (const c of wss.clients) c.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  };

  return new Promise((resolve, reject) => {
    const failed = (e) => { clearInterval(timer); reject(e); };
    server.once('error', failed);
    server.listen(config.port, config.host, () => {
      server.off('error', failed);
      const addr = server.address();
      resolve({ server, wss, world, config, port: addr.port, stop: () => new Promise((r) => { clearInterval(timer); world.shutdown(); for (const c of wss.clients) c.terminate(); wss.close(); server.close(() => r()); }), shutdown });
    });
  });
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['explorer.exe', [url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref(); } catch { /* no browser */ }
}

function lanAddresses() {
  return Object.values(os.networkInterfaces()).flat().filter((a) => a && a.family === 'IPv4' && !a.internal).map((a) => a.address);
}

// fileURLToPath + realpath: works on Windows (C:\...) and in folders with spaces
const isMain = process.argv[1] && (() => {
  try { return fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
})();
// First free port from `from` on (0 = let the system pick).
async function freePort(host, from) {
  for (let port = from; port < from + 100; port++) {
    const ok = await new Promise((resolve) => {
      const probe = net.createServer().once('error', () => resolve(false));
      probe.listen(port, host, () => probe.close(() => resolve(true)));
    });
    if (ok) return port;
  }
  return 0;
}

async function main() {
  const open = process.argv.includes('--open');
  const { port: wanted, host } = loadConfig();
  let srv;
  try {
    srv = await startServer();
  } catch (e) {
    if (e.code === 'EADDRINUSE') {
      console.error(`Port ${wanted} jest zajęty – gra prawdopodobnie już działa w innym oknie.`);
      if (open) openBrowser(`http://localhost:${wanted}`);
      process.exitCode = 1;
      return;
    }
    if (e.code !== 'EACCES') throw e;
    // Windows reserves port ranges for Hyper-V / WSL / Docker: take another port
    const port = await freePort(host, wanted + 1);
    console.log(`Port ${wanted} jest zablokowany przez system, używam innego.`);
    srv = await startServer({ port });
  }
  const { port, config, shutdown } = srv;
  const url = `http://localhost:${port}`;
  console.log(`${GAME_NAME} — świat "${config.worldName}" działa na ${url}`);
  if (config.host === '0.0.0.0' || config.host === '::') {
    for (const ip of lanAddresses()) console.log(`  dla innych komputerów w sieci: http://${ip}:${port}`);
  }
  console.log('  Ctrl+C lub zamknięcie okna zapisuje postacie i wyłącza serwer.');
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  process.on('SIGHUP', shutdown); // Windows: console window closed
  if (open) openBrowser(url);
}

if (isMain) {
  main().catch((e) => {
    console.error('Nie udało się uruchomić serwera:', e.message);
    process.exitCode = 1;
  });
}
