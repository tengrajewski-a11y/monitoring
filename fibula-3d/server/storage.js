// JSON file persistence for characters (one file per character).

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const NAME_RE = /^[A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+( [A-Za-zĄĆĘŁŃÓŚŹŻąćęłńóśźż]+){0,2}$/;

export function normalizeName(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().replace(/\s+/g, ' ');
  if (s.length < 3 || s.length > 20 || !NAME_RE.test(s)) return null;
  return s.split(' ').map((w) => w[0].toLocaleUpperCase('pl') + w.slice(1).toLocaleLowerCase('pl')).join(' ');
}

const FOLD = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
export function nameKey(name) {
  return name.toLocaleLowerCase('pl').replace(/[ąćęłńóśźż]/g, (c) => FOLD[c]).replace(/ /g, '_');
}

export class Storage {
  constructor(dir) {
    this.dir = dir;
    this.playersDir = path.join(dir, 'players');
    fs.mkdirSync(this.playersDir, { recursive: true });
    this.writing = new Map();
  }

  file(name) {
    const key = nameKey(name);
    if (!/^[a-z_]+$/.test(key)) throw new Error('bad name');
    return path.join(this.playersDir, key + '.json');
  }

  exists(name) { return fs.existsSync(this.file(name)); }

  load(name) {
    try { return JSON.parse(fs.readFileSync(this.file(name), 'utf8')); } catch { return null; }
  }

  // Atomic write (temp file + rename). Serialises writes per character.
  save(rec) {
    const file = this.file(rec.name);
    const data = JSON.stringify(rec);
    const prev = this.writing.get(file) || Promise.resolve();
    const next = prev.then(async () => {
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, data);
      await fs.promises.rename(tmp, file);
    }).catch((e) => console.error('[storage] save failed', rec.name, e.message));
    this.writing.set(file, next);
    next.finally(() => { if (this.writing.get(file) === next) this.writing.delete(file); });
    return next;
  }

  saveSync(rec) {
    const file = this.file(rec.name);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(rec));
    fs.renameSync(tmp, file);
  }

  count() {
    try { return fs.readdirSync(this.playersDir).filter((f) => f.endsWith('.json')).length; } catch { return 0; }
  }

  static hashPassword(pass) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(pass, salt, 32).toString('hex');
    return { salt, hash };
  }

  static verifyPassword(pass, salt, hash) {
    try {
      const h = crypto.scryptSync(pass, salt, 32);
      const ref = Buffer.from(hash, 'hex');
      return ref.length === h.length && crypto.timingSafeEqual(h, ref);
    } catch { return false; }
  }
}
