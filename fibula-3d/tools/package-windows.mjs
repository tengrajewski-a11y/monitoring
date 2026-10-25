// Builds the portable Windows package of Fibula 3D: the game, its runtime
// dependencies and a bundled Node.js, with double-click launchers.
//
//   node tools/package-windows.mjs --node <folder with node.exe and LICENSE> [--out dist/Fibula3D]
//
// .github/workflows/fibula-3d-windows.yml downloads the official Node.js build,
// runs this script, tests the result on Windows and publishes it zipped.

import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/config.js';

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const nodeDir = arg('--node');
const out = path.resolve(arg('--out', path.join(ROOT, 'dist', 'Fibula3D')));
if (!nodeDir || !fs.existsSync(path.join(nodeDir, 'node.exe'))) {
  console.error('usage: node tools/package-windows.mjs --node <folder with node.exe> [--out <folder>]');
  process.exit(1);
}

const APP_FILES = ['server', 'shared', 'client', 'package.json', 'README.md', 'CREDITS.md', 'config.example.json'];
// parts of dependencies the game never loads (the server only serves three's build/ and examples/jsm/)
const PRUNE = { three: ['src'] };

fs.rmSync(out, { recursive: true, force: true });
const app = path.join(out, 'app');
for (const f of APP_FILES) fs.cpSync(path.join(ROOT, f), path.join(app, f), { recursive: true });

// runtime dependencies, recursively (npm installs them flat in node_modules)
const seen = new Set();
(function copyDeps(pkgDir) {
  const pkg = JSON.parse(fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8'));
  for (const name of Object.keys(pkg.dependencies || {})) {
    if (seen.has(name)) continue;
    seen.add(name);
    const src = path.join(ROOT, 'node_modules', name);
    const skip = (PRUNE[name] || []).map((p) => path.join(src, p));
    fs.cpSync(src, path.join(app, 'node_modules', name), {
      recursive: true, filter: (f) => !skip.some((s) => f === s || f.startsWith(s + path.sep)),
    });
    copyDeps(src);
  }
})(ROOT);

fs.mkdirSync(path.join(out, 'node'));
fs.copyFileSync(path.join(nodeDir, 'node.exe'), path.join(out, 'node', 'node.exe'));
if (fs.existsSync(path.join(nodeDir, 'LICENSE'))) fs.copyFileSync(path.join(nodeDir, 'LICENSE'), path.join(out, 'node', 'LICENSE'));

// Windows text files: CRLF; the launchers stay ASCII, the readme gets a UTF-8 BOM for Notepad
const crlf = (s) => s.replace(/\r?\n/g, '\r\n');
const launcher = (title, host, note = '') => crlf(`@echo off
title ${title}
cd /d "%~dp0app"
set "HOST=${host}"
set "DATA_DIR=%~dp0dane"
${note}"%~dp0node\\node.exe" server\\index.js --open
if errorlevel 1 pause
`);
fs.writeFileSync(path.join(out, 'Fibula 3D.cmd'), launcher('Fibula 3D', '127.0.0.1'));
fs.writeFileSync(path.join(out, 'Fibula 3D - serwer LAN.cmd'), launcher('Fibula 3D - serwer LAN', '0.0.0.0',
  'echo Zapora Windows moze zapytac o dostep dla Node.js - zezwol w sieciach prywatnych.\n'));
fs.writeFileSync(path.join(out, 'CZYTAJ.txt'), '﻿' + crlf(`FIBULA 3D – wersja na Windows
=============================

Jak zagrać
1. Rozpakuj cały ZIP (prawy przycisk myszy → „Wyodrębnij wszystkie…”).
   Nie uruchamiaj gry z wnętrza archiwum.
2. Kliknij dwukrotnie „Fibula 3D.cmd”. Otworzy się czarne okno serwera, a po chwili
   przeglądarka z grą (http://localhost:7172).
   Jeśli Windows zapyta, czy uruchomić plik, wybierz „Uruchom” albo
   „Więcej informacji” → „Uruchom mimo to”.
3. Załóż postać (nazwa, hasło, profesja) i graj.
4. Żeby skończyć, zamknij czarne okno – postacie zapisują się automatycznie.

Gra ze znajomymi w tej samej sieci (LAN)
- Uruchom „Fibula 3D - serwer LAN.cmd”. Okno serwera pokaże adres w rodzaju
  http://192.168.1.23:7172 – znajomi wpisują go w swojej przeglądarce.
- Zapora Windows zapyta o dostęp dla „Node.js” – zezwól w sieciach prywatnych.

Zapisy postaci
- Folder „dane”. Przy przejściu na nowszą wersję gry skopiuj go do nowego folderu.

Ustawienia i komendy GM
- Skopiuj app\\config.example.json jako app\\config.json i zmień wartości
  (tempo doświadczenia, PvP, długość doby…).
- Wpisz nazwę swojej postaci w "gms": ["TwojaPostać"], żeby mieć komendy GM
  (/tp, /m, /i, /lvl, /czas, /god…). Zmiany działają po ponownym uruchomieniu.

Sterowanie (skrót)
  WASD / strzałki – ruch          V – widok z pierwszej osoby
  LPM – idź / atakuj / rozmawiaj  PPM – menu przedmiotu lub postaci
  Enter – czat (tu wpisuje się też zaklęcia), F1–F9 – zaklęcia z paska
  Pełny opis: app\\README.md

Wymagania: Windows 10 lub 11 (64-bit) i przeglądarka z WebGL 2 (Edge, Chrome, Firefox).
Node.js jest w zestawie (folder „node”), nic nie trzeba instalować.
Licencje: app\\CREDITS.md oraz node\\LICENSE.
`));

let bytes = 0;
(function size(p) { const st = fs.statSync(p); if (st.isDirectory()) fs.readdirSync(p).forEach((f) => size(path.join(p, f))); else bytes += st.size; })(out);
console.log(`Fibula 3D for Windows -> ${out} (${(bytes / 1048576).toFixed(1)} MB, deps: ${[...seen].join(', ')})`);
