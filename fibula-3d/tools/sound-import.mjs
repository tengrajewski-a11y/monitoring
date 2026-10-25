#!/usr/bin/env node
// Brings outside sounds into the game: Freesound (by sound id, with your API
// key), ElevenLabs sound effects (from a text prompt, with your API key) or any
// local file (MotionElements downloads, bfxr/sfxr exports, your recordings).
// Files are converted to Ogg Vorbis in client/assets/audio/extra/, listed in
// extra.json (which `npm run build:audio` keeps) and in the live manifest, and
// their source and licence are appended to extra/CREDITS.txt.
//
//   FREESOUND_KEY=...  node tools/sound-import.mjs freesound hit 123456 654321
//   ELEVENLABS_KEY=... node tools/sound-import.mjs elevenlabs voice_wolf "angry wolf growl, short" --seconds 1.2 --takes 3
//   node tools/sound-import.mjs file amb:rain ~/Downloads/rain-loop.wav
//
// The target is a sound name from client/assets/audio/manifest.json: "hit",
// "sfx:hit", "amb:rain" or "music:town". New files replace the generated ones;
// add --add to mix them in with the generated takes instead.
// Check every licence: Freesound CC0 and CC BY are accepted (CC BY needs the
// credit kept), non-commercial licences are refused unless you pass --allow-nc.
// ElevenLabs' free plan asks for attribution and allows no commercial use.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = path.join(ROOT, 'client/assets/audio');
const EXTRA = path.join(AUDIO, 'extra');
const CATS = { sfx: 'sfx', amb: 'ambience', ambience: 'ambience', music: 'music' };

function usage(msg) {
  if (msg) console.error(msg);
  console.error('usage: node tools/sound-import.mjs <freesound|elevenlabs|file> <target> <ids | prompt | files...> [--add] [--allow-nc] [--seconds n] [--takes n]');
  process.exit(1);
}

async function download(url, file, headers = {}) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
}

// extra.json: { sfx: { hit: { files: [...], add: false } }, ambience: {...}, music: {...} }
export function applyExtra(manifest, extra) {
  for (const [c, entries] of Object.entries(extra)) {
    manifest[c] = manifest[c] || {};
    for (const [k, e] of Object.entries(entries)) {
      const own = (manifest.sfx[k] || []).filter((f) => !f.startsWith('extra/'));
      if (c === 'sfx') manifest.sfx[k] = e.add ? [...own, ...e.files] : [...e.files];
      else manifest[c][k] = e.files[e.files.length - 1];
    }
  }
  return manifest;
}

async function main(tmp) {
  const args = process.argv.slice(2);
  const flag = (k) => { const i = args.indexOf(k); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const bool = (k) => { const i = args.indexOf(k); if (i < 0) return false; args.splice(i, 1); return true; };
  const add = bool('--add'), allowNc = bool('--allow-nc');
  const seconds = Number(flag('--seconds') || 0), takes = Number(flag('--takes') || 1);
  const [mode, target, ...rest] = args;
  if (!mode || !target || !rest.length) usage();
  const [catKey, name] = target.includes(':') ? target.split(':') : ['sfx', target];
  const cat = CATS[catKey];
  if (!cat || !/^[a-z0-9_]+$/.test(name)) usage(`bad target ${target}`);
  fs.mkdirSync(EXTRA, { recursive: true });
  let counter = 0;

  // any audio file -> extra/<name>-<tag>.ogg (mono for effects, stereo loops)
  const convert = (src, tag) => {
    const rel = `extra/${name}-${tag}.ogg`;
    const opts = cat === 'sfx'
      ? ['-ac', '1', '-af', 'silenceremove=start_periods=1:start_threshold=-55dB', '-q:a', '4']
      : ['-ac', '2', '-q:a', cat === 'music' ? '3' : '2'];
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, ...opts, '-c:a', 'libvorbis', path.join(AUDIO, rel)]);
    console.log(`  ${rel}`);
    return rel;
  };
  const credit = (line) => fs.appendFileSync(path.join(EXTRA, 'CREDITS.txt'), `${name} (${cat}): ${line}\n`);

  const files = [];
  if (mode === 'freesound') {
    const key = process.env.FREESOUND_KEY;
    if (!key) usage('Set FREESOUND_KEY (free at https://freesound.org/apiv2/apply).');
    for (const id of rest) {
      const r = await fetch(`https://freesound.org/apiv2/sounds/${encodeURIComponent(id)}/?fields=id,name,username,license,url,previews&token=${key}`);
      if (!r.ok) throw new Error(`Freesound ${id}: HTTP ${r.status}`);
      const snd = await r.json();
      const lic = snd.license || '';
      if (/-nc|noncommercial/i.test(lic) && !allowNc) { console.error(`  skipping ${id} "${snd.name}": non-commercial licence ${lic}`); continue; }
      const raw = path.join(tmp, `fs-${id}.ogg`);
      await download(snd.previews['preview-hq-ogg'], raw, { Authorization: `Token ${key}` });
      files.push(convert(raw, `fs${snd.id}`));
      credit(`"${snd.name}" by ${snd.username}, ${snd.url}, licence ${lic}`);
    }
  } else if (mode === 'elevenlabs') {
    const key = process.env.ELEVENLABS_KEY;
    if (!key) usage('Set ELEVENLABS_KEY (from your ElevenLabs profile).');
    const prompt = rest.join(' ');
    for (let i = 0; i < takes; i++) {
      const body = { text: prompt, prompt_influence: 0.4 };
      if (seconds) body.duration_seconds = Math.max(0.5, Math.min(22, seconds));
      const r = await fetch('https://api.elevenlabs.io/v1/sound-generation', {
        method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`ElevenLabs: HTTP ${r.status} ${await r.text()}`);
      const raw = path.join(tmp, `el-${i}.mp3`);
      fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
      files.push(convert(raw, `el${Date.now().toString(36)}${i}`));
    }
    credit(`ElevenLabs sound effects, prompt "${prompt}" (the free plan needs attribution and allows no commercial use)`);
  } else if (mode === 'file') {
    for (const f of rest) {
      files.push(convert(path.resolve(f), `f${Date.now().toString(36)}${counter++}`));
      credit(`file ${path.basename(f)} (add its author and licence here)`);
    }
  } else usage(`unknown source ${mode}`);
  if (!files.length) { console.error('Nothing imported.'); process.exit(1); }

  // more imports for the same sound add up; edit extra.json to start over
  const extraPath = path.join(AUDIO, 'extra.json');
  const extra = fs.existsSync(extraPath) ? JSON.parse(fs.readFileSync(extraPath, 'utf8')) : {};
  extra[cat] = extra[cat] || {};
  const prev = extra[cat][name];
  extra[cat][name] = { files: [...(prev?.files || []), ...files], add: add || !!prev?.add };
  fs.writeFileSync(extraPath, JSON.stringify(extra, null, 2) + '\n');
  const manPath = path.join(AUDIO, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manPath, 'utf8'));
  fs.writeFileSync(manPath, JSON.stringify(applyExtra(manifest, { [cat]: { [name]: extra[cat][name] } }), null, 2));
  console.log(`${cat}/${name} now uses ${extra[cat][name].files.length} imported file(s). Reload the game to hear them.`);
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fibula-snd-'));
  main(tmp).catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => fs.rmSync(tmp, { recursive: true, force: true }));
}
