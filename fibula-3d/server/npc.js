// Keyword driven NPCs (shopkeepers, priest, guard...).

import { DIR_DX, DIR_DY } from '../shared/constants.js';
import { chebyshev } from '../shared/formulas.js';
import { ITEM_BY_KEY } from '../shared/items.js';
import { Creature } from './creature.js';
import { GREET_WORDS, BYE_WORDS, TRADE_WORDS } from './data/npcs.js';
import { spellsFor } from './data/spells.js';

const TALK_RANGE = 4;

function has(text, words) {
  return words.some((w) => text === w || text.startsWith(w + ' ') || text.endsWith(' ' + w) || text.includes(' ' + w + ' '));
}

export class NPC extends Creature {
  constructor(world, def, spot) {
    super(world, 'npc', def.name);
    this.def = def;
    this.x = spot.x; this.y = spot.y; this.z = spot.z;
    this.home = { ...spot };
    this.radius = def.radius ?? 1;
    this.focus = new Map();   // playerId -> last talk time
    this.nextIdle = 0;
    this.baseSpeed = 160;
    this.hp = this.maxHp = 100;
    this.buy = (def.trade?.buy || []).map((k) => ITEM_BY_KEY[k]).filter(Boolean).map((it) => ({ id: it.id, price: it.price || it.value * 4 || 5 }));
    this.sell = (def.trade?.sell || []).map((k) => ITEM_BY_KEY[k]).filter(Boolean).map((it) => ({ id: it.id, price: it.value }));
  }

  defend() { return 0; }
  armorValue() { return 0; }
  die() {}

  canStepTo(x, y, z) {
    return chebyshev(x, y, this.home.x, this.home.y) <= this.radius && this.world.canEnter(this, x, y, z);
  }

  everySecond(now) {
    for (const [id, last] of this.focus) {
      const p = this.world.creatures.get(id);
      if (!p || p.z !== this.z || chebyshev(p.x, p.y, this.x, this.y) > TALK_RANGE + 1 || now - last > 90000) {
        this.focus.delete(id);
        if (p && !p.dead) this.reply(p, 'Do zobaczenia!');
        if (p) p.send({ t: 'tradeClose', npc: this.id });
      }
    }
    if (this.focus.size) {
      const first = this.world.creatures.get(this.focus.keys().next().value);
      if (first) this.turnTo(first.x, first.y);
    } else if (now >= this.nextIdle) {
      this.nextIdle = now + 3000 + Math.random() * 6000;
      if (this.radius > 0 && Math.random() < 0.6) {
        const d = Math.floor(Math.random() * 4);
        const nx = this.x + DIR_DX[d], ny = this.y + DIR_DY[d];
        if (this.canStepTo(nx, ny, this.z)) this.tryStep(d, now);
      }
    }
  }

  format(p, text) {
    return text.replace(/\{name\}/g, p.name).replace('{spells}', () => {
      const list = spellsFor(p.voc);
      return `Zaklęcia dla twojej profesji: ${list.map((s) => `${s.words} (${s.name}, poz. ${s.level}, ${s.mana} many)`).join('; ')}.`;
    });
  }

  reply(p, text) {
    this.world.say(this, this.format(p, text), 'npc', p.id);
  }

  hear(p, raw) {
    if (p.z !== this.z || chebyshev(p.x, p.y, this.x, this.y) > TALK_RANGE) return;
    const text = raw.toLowerCase().trim().replace(/[!?.,]+$/g, '');
    const now = this.world.now;
    if (!this.focus.has(p.id)) {
      if (has(text, GREET_WORDS)) {
        this.focus.set(p.id, now);
        this.turnTo(p.x, p.y);
        this.reply(p, this.def.greet);
      }
      return;
    }
    this.focus.set(p.id, now);
    if (has(text, BYE_WORDS)) {
      this.focus.delete(p.id);
      this.reply(p, this.def.farewell);
      p.send({ t: 'tradeClose', npc: this.id });
      return;
    }
    if (this.def.trade && has(text, TRADE_WORDS)) {
      this.reply(p, 'Proszę, rzuć okiem na moje towary.');
      p.send({ t: 'trade', npc: this.id, name: this.name, buy: this.buy, sell: this.sell });
      return;
    }
    if (this.def.special === 'heal' && has(text, ['uleczyć', 'uleczyc', 'ulecz', 'uleczenie', 'heal', 'lecz', 'leczenie'])) {
      if (p.hp < Math.max(65, p.maxHp * 0.3) || p.conditions.poison) {
        p.heal(p.maxHp);
        p.removeCondition('poison');
        this.world.effect(p.x, p.y, p.z, 'heal');
        this.reply(p, 'Niech twoje rany się zasklepią.');
      } else this.reply(p, 'Nie jesteś aż tak ranny, by potrzebować mojej pomocy.');
      return;
    }
    for (const [keys, answer] of this.def.keywords || []) {
      if (has(text, keys)) { this.reply(p, answer); return; }
    }
    if (has(text, GREET_WORDS)) { this.reply(p, `Przecież rozmawiamy, ${p.name}.`); return; }
  }

  inTradeRange(p) { return p.z === this.z && chebyshev(p.x, p.y, this.x, this.y) <= TALK_RANGE + 1; }

  describe() {
    const d = super.describe();
    d.type = 'human';
    d.look = { sex: this.def.look.female ? 'f' : 'm', ...this.def.look };
    return d;
  }
}
