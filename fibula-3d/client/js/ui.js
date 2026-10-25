// HTML user interface: login, HUD panels, chat, windows, minimap.

import { VOCATIONS, SKILL_NAMES, SKILLS, SLOTS, SLOT_NAMES, OUTFIT_COLORS, SKIN_COLORS, G, O, GROUND, OBJ } from '/shared/constants.js';
import { ITEMS, describeItem, itemName } from '/shared/items.js';
import { iconElement } from './icons.js';

const $ = (s, el = document) => el.querySelector(s);
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;

const VOC_INFO = {
  knight: 'Mistrz walki wręcz. Najwięcej życia, ciężkie zbroje i tarcze.',
  paladin: 'Strzelec z kuszą i włócznią. Święte strzały i leczenie.',
  sorcerer: 'Władca ognia i energii. Potężne czary obszarowe.',
  druid: 'Siła natury, lodu i leczenia. Najlepszy uzdrowiciel.',
};
const EQUIP_LAYOUT = ['amulet', 'head', null, 'weapon', 'armor', 'shield', 'ring', 'legs', null, null, 'boots', null];
const COND_LABEL = {
  poison: 'Zatruty', burn: 'Płonie', energy: 'Porażony', haste: 'Szybkość', light: 'Światło', manashield: 'Tarcza many',
};
const MINI_COL = {};

export class UI {
  constructor(game) {
    this.game = game;
    this.channel = 'local';
    this.logs = { local: [], world: [], server: [], pm: [] };
    this.unread = new Set();
    this.windows = new Map();
    this.zoom = 3;
    this.outfit = { skin: 0, head: 6, body: 9, legs: 17, feet: 7 };
    this.voc = 'knight';
    this.sex = 'm';
    this.self = null;
    this.inv = null;
    this.spells = [];
    this.initLogin();
    this.initHud();
  }

  // ---------------------------------------------------------------- login
  initLogin() {
    const tabs = document.querySelectorAll('#login-panel .tab');
    tabs.forEach((t) => t.addEventListener('click', () => {
      tabs.forEach((x) => x.classList.toggle('active', x === t));
      $('#form-enter').classList.toggle('hidden', t.dataset.tab !== 'enter');
      $('#form-create').classList.toggle('hidden', t.dataset.tab !== 'create');
      this.loginError('');
    }));
    const grid = $('#voc-grid');
    for (const [key, v] of Object.entries(VOCATIONS)) {
      const b = el('button', 'voc' + (key === this.voc ? ' active' : ''));
      b.type = 'button';
      b.append(el('b', '', v.name), el('small', '', VOC_INFO[key]));
      b.addEventListener('click', () => {
        this.voc = key;
        grid.querySelectorAll('.voc').forEach((x) => x.classList.toggle('active', x === b));
        this.drawPreview();
      });
      grid.append(b);
    }
    const pickers = $('#outfit-pickers');
    const row = (label, key, palette) => {
      const r = el('div', 'pick-row');
      r.append(el('span', '', label));
      const sw = el('div', 'swatches');
      palette.forEach((c, i) => {
        const s = el('button', 'sw' + (this.outfit[key] === i ? ' active' : ''));
        s.type = 'button';
        s.style.background = hex(c);
        s.title = `${label} ${i + 1}`;
        s.addEventListener('click', () => {
          this.outfit[key] = i;
          sw.querySelectorAll('.sw').forEach((x) => x.classList.toggle('active', x === s));
          this.drawPreview();
        });
        sw.append(s);
      });
      r.append(sw);
      pickers.append(r);
    };
    row('Skóra', 'skin', SKIN_COLORS);
    row('Kaptur', 'head', OUTFIT_COLORS);
    row('Peleryna', 'body', OUTFIT_COLORS);
    row('Spodnie', 'legs', OUTFIT_COLORS);
    this.drawPreview();
    $('#form-enter').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      this.game.login({ t: 'login', name: f.get('name'), pass: f.get('pass') });
    });
    $('#form-create').addEventListener('submit', (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      this.game.login({ t: 'create', name: f.get('name'), pass: f.get('pass'), voc: this.voc, sex: this.sex, outfit: this.outfit });
    });
    try {
      const last = localStorage.getItem('fibula.lastName');
      if (last) $('#form-enter [name=name]').value = last;
    } catch { /* storage unavailable */ }
  }

  drawPreview() {
    const cv = $('#outfit-preview');
    const c = cv.getContext('2d');
    c.clearRect(0, 0, cv.width, cv.height);
    const P = 6;
    const px = (x, y, w, h, col) => { c.fillStyle = hex(col); c.fillRect(x * P, y * P, w * P, h * P); };
    const o = this.outfit;
    const skin = SKIN_COLORS[o.skin], head = OUTFIT_COLORS[o.head], body = OUTFIT_COLORS[o.body], legs = OUTFIT_COLORS[o.legs];
    px(2, 6, 12, 10, body);            // cape
    px(5, 2, 6, 6, skin);              // face
    if (this.voc === 'sorcerer' || this.voc === 'druid') { px(3, 1, 10, 2, head); px(5, -1, 6, 2, head); px(7, -3, 3, 2, head); }
    else if (this.voc === 'knight') { px(4, 1, 8, 3, 0xb0b4bc); px(4, 4, 1, 3, 0xb0b4bc); px(11, 4, 1, 3, 0xb0b4bc); }
    else { px(4, 1, 8, 3, head); px(4, 3, 1, 4, head); px(11, 3, 1, 4, head); }
    px(6, 4, 1, 1, 0x101010); px(9, 4, 1, 1, 0x101010);
    px(4, 8, 8, 6, this.voc === 'knight' ? 0xa8acb4 : this.voc === 'sorcerer' ? 0x4a4aa0 : this.voc === 'druid' ? 0x3a8a4a : 0x4a8a3a);
    px(4, 13, 8, 1, 0x7a4a2a);
    px(2, 9, 2, 5, skin); px(12, 9, 2, 5, skin);
    px(5, 14, 2, 4, legs); px(9, 14, 2, 4, legs);
    px(4, 18, 3, 2, 0x5a3a1e); px(9, 18, 3, 2, 0x5a3a1e);
  }

  loginError(text) { $('#login-error').textContent = text || ''; }
  setServerStatus(text) { $('#server-status').textContent = text; }

  showLogin(show) {
    $('#login').classList.toggle('hidden', !show);
    $('#hud').classList.toggle('hidden', show);
  }

  // ---------------------------------------------------------------- HUD
  initHud() {
    // equipment grid
    const eg = $('#equip-grid');
    this.equipSlots = {};
    for (const s of EQUIP_LAYOUT) {
      const d = el('div', 'slot' + (s ? '' : ' empty-cell'));
      if (s) {
        d.dataset.slot = s;
        d.title = SLOT_NAMES[s];
        d.append(el('div', 'ph', SLOT_NAMES[s]));
        d.addEventListener('click', () => this.game.send({ t: 'unequip', slot: s }));
        d.addEventListener('contextmenu', (e) => { e.preventDefault(); this.equipMenu(e, s); });
        this.hoverItem(d, () => this.inv?.equip?.[s]);
        this.equipSlots[s] = d;
      }
      eg.append(d);
    }
    // bag
    const bg = $('#bag-grid');
    this.bagSlots = [];
    for (let i = 0; i < 20; i++) {
      const d = el('div', 'slot');
      d.addEventListener('click', () => this.game.send({ t: 'useItem', slot: i }));
      d.addEventListener('contextmenu', (e) => { e.preventDefault(); this.bagMenu(e, i); });
      this.hoverItem(d, () => this.inv?.bag?.[i]);
      bg.append(d);
      this.bagSlots.push(d);
    }
    // combat buttons
    document.querySelectorAll('[data-fight]').forEach((b) => b.addEventListener('click', () => this.game.send({ t: 'mode', fight: Number(b.dataset.fight) })));
    $('#chase-btn').addEventListener('click', () => this.game.send({ t: 'mode', chase: !this.self?.chase }));
    $('#stop-btn').addEventListener('click', () => this.game.stopAttack());
    $('#btn-skills').addEventListener('click', () => this.toggleSkills());
    $('#btn-settings').addEventListener('click', () => this.toggleSettings());
    $('#btn-logout').addEventListener('click', () => this.game.send({ t: 'logout' }));
    $('#view-btn').addEventListener('click', () => this.game.toggleView());
    $('#sidebar-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
    document.querySelectorAll('[data-zoom]').forEach((b) => b.addEventListener('click', () => { this.zoom = Math.max(1, Math.min(6, this.zoom + Number(b.dataset.zoom))); }));
    $('#minimap').addEventListener('click', (e) => this.minimapClick(e));
    // chat
    const tabs = $('#chat-tabs');
    for (const [k, label] of [['local', 'Lokalny'], ['world', 'Świat'], ['server', 'Serwer'], ['pm', 'Prywatne']]) {
      const t = el('button', 'ctab' + (k === this.channel ? ' active' : ''), label);
      t.dataset.ch = k;
      t.addEventListener('click', () => this.setChannel(k));
      tabs.append(t);
    }
    $('#chat-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#chat-input');
      const text = input.value.trim();
      if (text) this.game.say(text, this.channel === 'world' ? 'world' : 'local', this.channel);
      input.value = '';
      input.blur();
    });
    $('#chat-log').addEventListener('click', (e) => {
      const kw = e.target.closest('.kw');
      if (kw) this.game.say(kw.dataset.kw, 'local');
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('#ctxmenu')) this.hideMenu(); });
  }

  setChannel(k) {
    this.channel = k;
    this.unread.delete(k);
    document.querySelectorAll('.ctab').forEach((t) => {
      t.classList.toggle('active', t.dataset.ch === k);
      t.classList.toggle('unread', this.unread.has(t.dataset.ch));
    });
    $('#chat-ch').textContent = { local: 'Lokalny', world: 'Świat', server: 'Serwer', pm: 'Prywatne' }[k];
    $('#chat-input').placeholder = k === 'pm' ? 'Wpisz: /w Imię, wiadomość' : k === 'server' ? 'Komendy: /pomoc' : 'Enter – pisz. Słowa zaklęć wpisuj tutaj.';
    this.renderLog();
  }

  hoverItem(node, getter) {
    const tip = $('#tooltip');
    node.addEventListener('mouseenter', () => {
      const it = getter();
      if (!it) return;
      tip.textContent = describeItem(it.id, it.n);
      tip.classList.remove('hidden');
      const r = node.getBoundingClientRect();
      tip.style.left = `${Math.max(4, r.left - 270)}px`;
      tip.style.top = `${r.top}px`;
    });
    node.addEventListener('mouseleave', () => tip.classList.add('hidden'));
  }

  fillSlot(node, item, placeholder) {
    node.replaceChildren();
    if (!item) { if (placeholder) node.append(el('div', 'ph', placeholder)); return; }
    node.append(iconElement(item.id));
    if (item.n > 1) node.append(el('span', 'n', String(item.n)));
  }

  updateInv(inv) {
    this.inv = inv;
    for (const s of SLOTS) if (this.equipSlots[s]) this.fillSlot(this.equipSlots[s], inv.equip[s], SLOT_NAMES[s]);
    inv.bag.forEach((it, i) => this.fillSlot(this.bagSlots[i], it));
    $('#gold').textContent = `${inv.gold} zł`;
    this.updateHotbar();
    for (const w of this.windows.values()) w.refresh?.();
  }

  updateSelf(s) {
    const prevLevel = this.self?.level;
    this.self = s;
    const bar = (sel, v, max, txt) => {
      $(`${sel} .fill`).style.width = `${max > 0 ? Math.max(0, Math.min(100, (v / max) * 100)) : 0}%`;
      $(`${sel} .txt`).textContent = txt;
    };
    bar('.bar.hp', s.hp, s.maxHp, `${s.hp} / ${s.maxHp}`);
    bar('.bar.mana', s.mana, s.maxMana, `${s.mana} / ${s.maxMana}`);
    bar('.bar.exp', s.exp - s.expLvl, s.expNext - s.expLvl, `Poziom ${s.level} · ${Math.floor(((s.exp - s.expLvl) / Math.max(1, s.expNext - s.expLvl)) * 100)}%`);
    const conds = $('#conditions');
    conds.replaceChildren();
    for (const [k, on] of Object.entries(s.cond)) if (on) conds.append(el('span', `cond ${k}`, COND_LABEL[k]));
    if (s.fight) conds.append(el('span', 'cond fight', 'Walka'));
    if (s.pz) conds.append(el('span', 'cond pz', 'Strefa ochr.'));
    if (s.fed <= 0) conds.append(el('span', 'cond hungry', 'Głodny'));
    if (s.skull) conds.append(el('span', `cond skull-${s.skull}`, s.skull === 'red' ? 'Czerwona czaszka' : 'Biała czaszka'));
    document.querySelectorAll('[data-fight]').forEach((b) => b.classList.toggle('on', Number(b.dataset.fight) === s.fightMode));
    $('#chase-btn').classList.toggle('on', !!s.chase);
    $('#armor-val').textContent = `pancerz ${s.armor}`;
    if (prevLevel !== undefined && prevLevel !== s.level) this.updateHotbar();
    this.windows.get('skills')?.refresh();
    this.updateHotbarMana();
  }

  setSpells(spells) {
    this.spells = spells;
    this.updateHotbar();
  }

  updateHotbar() {
    const bar = $('#hotbar');
    bar.replaceChildren();
    this.spells.slice(0, 9).forEach((s, i) => {
      const b = el('button', 'hk');
      b.title = `${s.name} – ${s.mana} many, poziom ${s.level}`;
      const k = el('b', '', `F${i + 1}`);
      b.append(k, document.createTextNode(s.words), el('small', '', `${s.name} · ${s.mana} mp`));
      b.addEventListener('click', () => this.game.castHotkey(i));
      b.dataset.level = s.level;
      b.dataset.mana = s.mana;
      bar.append(b);
    });
    this.updateHotbarMana();
  }

  updateHotbarMana() {
    if (!this.self) return;
    document.querySelectorAll('.hk').forEach((b) => {
      b.classList.toggle('locked', Number(b.dataset.level) > this.self.level || Number(b.dataset.mana) > this.self.mana);
    });
  }

  // ---------------------------------------------------------------- chat
  addLine(ch, kind, text, name = null) {
    const t = new Date();
    const line = { ts: `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`, kind, text, name };
    const log = this.logs[ch];
    log.push(line);
    if (log.length > 300) log.shift();
    if (ch === this.channel) this.appendLine(line);
    else if (ch !== 'server' || kind === 'warn') { this.unread.add(ch); document.querySelector(`.ctab[data-ch=${ch}]`)?.classList.add('unread'); }
  }

  appendLine(line) {
    const log = $('#chat-log');
    const d = el('div', `ln ${line.kind}`);
    d.append(el('span', 't', line.ts));
    if (line.name) d.append(document.createTextNode(`${line.name}: `));
    // NPC keywords in {braces} become clickable
    const parts = line.text.split(/(\{[^}]+\})/);
    for (const p of parts) {
      if (/^\{[^}]+\}$/.test(p)) {
        const w = p.slice(1, -1);
        const k = el('span', 'kw', w);
        k.dataset.kw = w;
        d.append(k);
      } else d.append(document.createTextNode(p));
    }
    const stick = log.scrollTop + log.clientHeight >= log.scrollHeight - 30;
    log.append(d);
    while (log.childElementCount > 300) log.firstChild.remove();
    if (stick) log.scrollTop = log.scrollHeight;
  }

  renderLog() {
    const log = $('#chat-log');
    log.replaceChildren();
    for (const l of this.logs[this.channel]) this.appendLine(l);
    log.scrollTop = log.scrollHeight;
  }

  status(text, kind = 'info') {
    const s = $('#status-msg');
    s.textContent = text;
    s.className = kind;
    clearTimeout(this.statusTimer);
    this.statusTimer = setTimeout(() => { s.textContent = ''; }, 3500);
  }

  focusChat() { $('#chat-input').focus(); }
  get chatFocused() { return document.activeElement === $('#chat-input'); }

  // ---------------------------------------------------------------- menus
  showMenu(x, y, entries) {
    const m = $('#ctxmenu');
    m.replaceChildren();
    for (const [label, fn] of entries) {
      const b = el('button', '', label);
      b.addEventListener('click', () => { this.hideMenu(); fn(); });
      m.append(b);
    }
    m.classList.remove('hidden');
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = `${Math.min(x, innerWidth - w - 4)}px`;
    m.style.top = `${Math.min(y, innerHeight - h - 4)}px`;
  }
  hideMenu() { $('#ctxmenu').classList.add('hidden'); }

  bagMenu(e, i) {
    const it = this.inv?.bag?.[i];
    if (!it) return;
    const def = ITEMS[it.id];
    const entries = [];
    if (def.kind === 'food') entries.push(['Zjedz', () => this.game.send({ t: 'useItem', slot: i })]);
    else if (def.kind === 'potion') entries.push(['Wypij', () => this.game.send({ t: 'useItem', slot: i })]);
    else if (def.slot && SLOTS.includes(def.slot)) entries.push(['Załóż', () => this.game.send({ t: 'useItem', slot: i })]);
    entries.push(['Zobacz', () => this.addLine('server', 'look', describeItem(it.id, it.n))]);
    entries.push(['Wyrzuć', () => this.game.send({ t: 'drop', slot: i, n: it.n })]);
    if (it.n > 1) entries.push(['Wyrzuć jedną', () => this.game.send({ t: 'drop', slot: i, n: 1 })]);
    this.showMenu(e.clientX, e.clientY, entries);
  }

  equipMenu(e, s) {
    const it = this.inv?.equip?.[s];
    if (!it) return;
    this.showMenu(e.clientX, e.clientY, [
      ['Zdejmij', () => this.game.send({ t: 'unequip', slot: s })],
      ['Zobacz', () => this.addLine('server', 'look', describeItem(it.id, it.n))],
    ]);
  }

  // ---------------------------------------------------------------- windows
  window(key, title, build, pos) {
    let w = this.windows.get(key);
    if (w) { w.node.remove(); this.windows.delete(key); }
    const node = el('div', 'win panel');
    const head = el('div', 'wtitle');
    head.append(el('span', '', title));
    const close = el('button', '', '✕');
    close.title = 'Zamknij';
    close.addEventListener('click', () => this.closeWindow(key));
    head.append(close);
    const body = el('div', 'wbody');
    node.append(head, body);
    $('#windows').append(node);
    w = { node, body, refresh: null, onClose: null };
    this.windows.set(key, w);
    build(body, w);
    const p = pos || { x: innerWidth - 520, y: 70 };
    node.style.left = `${Math.max(4, Math.min(p.x, innerWidth - node.offsetWidth - 4))}px`;
    node.style.top = `${Math.max(4, Math.min(p.y, innerHeight - node.offsetHeight - 4))}px`;
    this.dragify(node, head);
    return w;
  }

  closeWindow(key) {
    const w = this.windows.get(key);
    if (!w) return;
    w.onClose?.();
    w.node.remove();
    this.windows.delete(key);
  }

  dragify(node, handle) {
    handle.addEventListener('pointerdown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      const sx = e.clientX - node.offsetLeft, sy = e.clientY - node.offsetTop;
      const move = (ev) => { node.style.left = `${ev.clientX - sx}px`; node.style.top = `${ev.clientY - sy}px`; };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    });
  }

  openContainer(msg) {
    this.window(`cont`, msg.name, (body, w) => {
      w.uid = msg.uid;
      const grid = el('div', 'cont-grid');
      msg.items.forEach((it, i) => {
        const d = el('div', 'slot');
        this.fillSlot(d, it);
        d.title = itemName(it.id, it.n);
        d.addEventListener('click', () => this.game.send({ t: 'take', uid: msg.uid, idx: i }));
        this.hoverItem(d, () => it);
        grid.append(d);
      });
      if (!msg.items.length) body.append(el('div', 'muted', 'Pusto.'));
      body.append(grid);
      if (msg.items.length) {
        const all = el('button', 'btn small', 'Weź wszystko');
        all.style.marginTop = '6px';
        all.addEventListener('click', () => this.game.send({ t: 'take', uid: msg.uid, idx: -1 }));
        body.append(all);
      }
      w.onClose = () => this.game.send({ t: 'closeCont', uid: msg.uid });
    }, { x: innerWidth - 520, y: 80 });
  }

  closeContainer(uid) {
    const w = this.windows.get('cont');
    if (w && w.uid === uid) { w.node.remove(); this.windows.delete('cont'); }
  }

  openTrade(msg) {
    let tab = 'buy';
    this.window('trade', `Handel: ${msg.name}`, (body, w) => {
      w.npc = msg.npc;
      const render = () => {
        body.replaceChildren();
        const tabs = el('div', 'wtabs');
        for (const [k, label] of [['buy', 'Kup'], ['sell', 'Sprzedaj']]) {
          const b = el('button', 'tab' + (tab === k ? ' active' : ''), label);
          b.addEventListener('click', () => { tab = k; render(); });
          tabs.append(b);
        }
        body.append(tabs, el('div', 'muted', `Twoje złoto: ${this.inv?.gold ?? 0}`));
        const list = el('div', 'trade-list');
        const entries = tab === 'buy' ? msg.buy : msg.sell.filter((e) => this.countItem(e.id) > 0);
        if (!entries.length) list.append(el('div', 'muted', tab === 'buy' ? 'Brak towarów.' : 'Nie masz nic, co ten handlarz by kupił.'));
        for (const e of entries) {
          const row = el('div', 'trade-row');
          const s = el('div', 'slot');
          this.fillSlot(s, { id: e.id, n: 1 });
          this.hoverItem(s, () => ({ id: e.id, n: 1 }));
          const nm = el('div', 'nm', ITEMS[e.id].name + (tab === 'sell' ? ` (masz ${this.countItem(e.id)})` : ''));
          const pr = el('div', 'pr', `${e.price} zł`);
          const n = el('input');
          n.type = 'number'; n.min = 1; n.max = 100; n.value = 1;
          n.setAttribute('aria-label', 'Ilość');
          const b = el('button', 'btn small', tab === 'buy' ? 'Kup' : 'Sprzedaj');
          b.addEventListener('click', () => this.game.send({ t: tab, npc: msg.npc, id: e.id, n: Math.max(1, Math.min(100, Number(n.value) || 1)) }));
          row.append(s, nm, pr, n, b);
          list.append(row);
        }
        body.append(list);
      };
      w.refresh = render;
      render();
    }, { x: 20, y: 60 });
  }

  closeTrade(npc) { const w = this.windows.get('trade'); if (w && (!npc || w.npc === npc)) this.closeWindow('trade'); }

  countItem(id) { return (this.inv?.bag || []).reduce((a, s) => a + (s && s.id === id ? s.n : 0), 0); }

  toggleSkills() {
    if (this.windows.has('skills')) { this.closeWindow('skills'); return; }
    this.window('skills', 'Umiejętności', (body, w) => {
      w.refresh = () => {
        const s = this.self;
        if (!s) return;
        body.replaceChildren();
        const t = el('table', 'skills-table');
        const add = (label, val, pct) => {
          const tr = el('tr');
          const td = el('td', '', label);
          if (pct !== undefined) { const bar = el('div', 'pct'); const f = el('div'); f.style.width = `${pct}%`; bar.append(f); td.append(bar); }
          tr.append(td, el('td', '', String(val)));
          t.append(tr);
        };
        add('Profesja', VOCATIONS[s.voc].name);
        add('Poziom', s.level, Math.floor(((s.exp - s.expLvl) / Math.max(1, s.expNext - s.expLvl)) * 100));
        add('Doświadczenie', s.exp.toLocaleString('pl-PL'));
        add('Do następnego', (s.expNext - s.exp).toLocaleString('pl-PL'));
        add('Życie', `${s.hp}/${s.maxHp}`);
        add('Mana', `${s.mana}/${s.maxMana}`);
        add('Szybkość', s.speed);
        add('Najedzenie', s.fed > 0 ? `${Math.floor(s.fed / 60)} min ${s.fed % 60} s` : 'głodny');
        add(SKILL_NAMES.magic, s.mlvl, s.mlvlPct);
        for (const k of SKILLS) add(SKILL_NAMES[k], s.skills[k][0], s.skills[k][1]);
        body.append(t);
      };
      w.refresh();
    }, { x: innerWidth - 560, y: 260 });
  }

  toggleSettings() {
    if (this.windows.has('settings')) { this.closeWindow('settings'); return; }
    const st = this.game.settings;
    this.window('settings', 'Opcje', (body) => {
      const wrap = el('div', 'settings');
      const sel = (label, key, opts) => {
        const l = el('label', '', label);
        const s = el('select');
        for (const [v, t] of opts) { const o = el('option', '', t); o.value = v; if (String(st[key]) === String(v)) o.selected = true; s.append(o); }
        s.addEventListener('change', () => this.game.setSetting(key, s.value));
        l.append(s);
        wrap.append(l);
      };
      const range = (label, key) => {
        const l = el('label', '', label);
        const r = el('input');
        r.type = 'range'; r.min = 0; r.max = 1; r.step = 0.05; r.value = st[key];
        r.addEventListener('input', () => this.game.setSetting(key, Number(r.value)));
        l.append(r);
        wrap.append(l);
      };
      sel('Widok', 'view', [['top', 'z góry (klasyczny)'], ['fpp', 'pierwsza osoba']]);
      sel('Pikseloza', 'pixelScale', [[1, 'brak'], [2, 'lekka (2×)'], [3, 'retro (3×)'], [4, 'mocna (4×)']]);
      sel('Paleta', 'retro', [['off', 'pełna'], ['normal', 'retro'], ['strong', 'mocne retro']]);
      sel('Poziomy nad graczami', 'showLevels', [['1', 'pokaż'], ['0', 'ukryj']]);
      range('Czułość myszy (FPP)', 'sens');
      range('Muzyka', 'music');
      range('Efekty', 'sfx');
      range('Otoczenie', 'ambience');
      body.append(wrap);
      body.append(el('div', 'muted', 'Sterowanie: WASD/strzałki – ruch, V – widok pierwszej osoby (mysz rozgląda się, klik – atak/użycie na celowniku), Q/E – obrót kamery, kółko – zoom, Ctrl+strzałka – obrót postaci, numeryczna 7/9/1/3 – ukosy, Enter – czat, Esc – anuluj, F1–F9 – zaklęcia, klik – idź/atakuj, PPM – menu.'));
    }, { x: innerWidth / 2 - 160, y: 120 });
  }

  showDeath(msg) {
    const w = this.window('death', 'Nie żyjesz', (body) => {
      body.append(el('h2', '', 'Poległeś!'));
      body.append(el('p', '', msg.by ? `Zabójca: ${msg.by}.` : 'Twoja podróż dobiegła końca... na chwilę.'));
      body.append(el('p', 'muted', `Tracisz ${msg.loss} punktów doświadczenia. Budzisz się w świątyni Patelli.`));
      const ok = el('button', 'btn primary', 'Wstań');
      ok.addEventListener('click', () => this.closeWindow('death'));
      body.append(ok);
    });
    w.node.classList.add('death-win');
  }

  // ---------------------------------------------------------------- minimap
  buildMinimap(map) {
    this.map = map;
    this.miniImages = new Map();
    for (const f of map.floors) {
      const cv = document.createElement('canvas');
      cv.width = map.w; cv.height = map.h;
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(map.w, map.h);
      for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
        const i = y * map.w + x;
        const g = f.ground[i], o = f.obj[i];
        let c = 0x000000;
        if (g) c = ({ [G.GRASS]: 0x3f8a2a, [G.FOREST]: 0x2f6a20, [G.DIRT]: 0x8a6a3a, [G.SAND]: 0xd8c47c, [G.WATER]: 0x2a5ab0, [G.DEEPWATER]: 0x1a4090,
          [G.SHALLOW]: 0x4a7ac8, [G.COBBLE]: 0x9a9aa0, [G.WOOD]: 0x8a5a2a, [G.CAVE]: 0x6a5a48, [G.SWAMP]: 0x4a5a2a, [G.MARBLE]: 0xd8d8d0,
          [G.LAVA]: 0xff6010, [G.ROCK]: 0x7a7468, [G.BRIDGE]: 0x9a6a3a, [G.CARPET]: 0xa02828, [G.CRYPT]: 0x5a5a6a })[g] ?? 0x555555;
        if (o) {
          const od = OBJ[o];
          if (od.wall) c = o === O.MOUNTAIN ? 0x6a6a6a : o === O.WALL_CAVE ? 0x3a3028 : 0x4a4a4a;
          else if (od.tall) c = 0x1f5014;
          else if (od.portal) c = 0xf0e020;
          else if (od.block) c = (c & 0xfefefe) >> 1;
        }
        img.data[i * 4] = c >> 16; img.data[i * 4 + 1] = (c >> 8) & 255; img.data[i * 4 + 2] = c & 255; img.data[i * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      this.miniImages.set(f.z, cv);
    }
  }

  drawMinimap(px, py, pz, creatures, selfId) {
    const cv = $('#minimap');
    const c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.fillStyle = '#000';
    c.fillRect(0, 0, cv.width, cv.height);
    const img = this.miniImages?.get(pz);
    if (!img) return;
    const z = this.zoom;
    const ox = cv.width / 2 - px * z, oy = cv.height / 2 - py * z;
    c.drawImage(img, ox, oy, img.width * z, img.height * z);
    for (const v of creatures) {
      const d = v.data;
      c.fillStyle = v.id === selfId ? '#ffffff' : d.k === 'p' ? '#60c0ff' : d.k === 'n' ? '#f0e040' : '#ff4040';
      const s = v.id === selfId ? 3 : 2;
      c.fillRect(Math.round(ox + (v.pos.x - 0.5) * z + z / 2 - s / 2), Math.round(oy + (v.pos.z - 0.5) * z + z / 2 - s / 2), s, s);
    }
    c.strokeStyle = '#fff';
    c.strokeRect(cv.width / 2 - 1.5, cv.height / 2 - 1.5, 3 + z - 1, 3 + z - 1);
    this.miniOrigin = { ox, oy, z };
  }

  minimapClick(e) {
    if (!this.miniOrigin) return;
    const cv = $('#minimap');
    const r = cv.getBoundingClientRect();
    const sx = ((e.clientX - r.left) / r.width) * cv.width, sy = ((e.clientY - r.top) / r.height) * cv.height;
    const { ox, oy, z } = this.miniOrigin;
    this.game.send({ t: 'goto', x: Math.floor((sx - ox) / z), y: Math.floor((sy - oy) / z) });
  }

  setRegion(name, floorLabel) {
    $('#region-name').textContent = name;
    $('#floor-ind').textContent = floorLabel;
  }

  setClock(text) { $('#clock').textContent = text; }

  setViewMode(fpp) {
    const b = $('#view-btn');
    b.classList.toggle('on', fpp);
    b.textContent = fpp ? '1 os.' : '3D';
    b.title = fpp ? 'Widok pierwszej osoby (V) – kliknij, by wrócić do widoku z góry' : 'Widok z góry (V) – kliknij, by grać z perspektywy pierwszej osoby';
    $('#fpp-hint').classList.toggle('hidden', !fpp);
  }
}
