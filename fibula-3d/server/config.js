// Server configuration. Values can be overridden with fibula-3d/config.json
// (same keys) and a few environment variables (PORT, HOST, DATA_DIR, GMS).
// Rates mirror the "TFS-style" options of the reference 7.72 server.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULTS = {
  port: 7172,
  host: '0.0.0.0',
  worldName: 'Fibula',
  seed: 7720,
  dataDir: path.join(ROOT, 'data'),
  motd: 'Witaj na Fibuli! Powiedz "witaj" do NPC, by zacząć rozmowę. Zaklęcia rzucasz, wpisując ich słowa na czacie.',
  maxPlayers: 200,
  // rates
  rateExp: 3,
  rateSkill: 3,
  rateMagic: 3,
  rateLoot: 1,
  rateSpawn: 1,
  rateHpRegen: 3,
  rateManaRegen: 3,
  // combat & timers (ms)
  attackInterval: 2000,
  defenseInterval: 2000,
  spellExhaust: 1000,
  potionExhaust: 1000,
  inFightSec: 60,
  // pvp
  pvp: true,
  protectionLevel: 8,
  whiteSkullMin: 15,
  redSkullKills: 3,
  deathLossPercent: 10,
  // misc
  dayLengthMin: 40,
  autosaveSec: 300,
  gms: [],
};

export function loadConfig(overrides = {}) {
  let file = {};
  const p = path.join(ROOT, 'config.json');
  if (fs.existsSync(p)) {
    try { file = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { console.error('[config] config.json is invalid:', e.message); }
  }
  const env = {};
  if (process.env.PORT) env.port = Number(process.env.PORT);
  if (process.env.HOST) env.host = process.env.HOST;
  if (process.env.DATA_DIR) env.dataDir = path.resolve(process.env.DATA_DIR);
  if (process.env.GMS) env.gms = process.env.GMS.split(',').map((s) => s.trim()).filter(Boolean);
  return { ...DEFAULTS, ...file, ...env, ...overrides };
}
