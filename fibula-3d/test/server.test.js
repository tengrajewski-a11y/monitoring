import test from 'node:test';
import assert from 'node:assert/strict';
import { boot, Client, sleep } from './helpers.js';
import { ITEM_BY_KEY } from '../shared/items.js';

let srv;
const clients = [];
async function client() { const c = new Client(srv.port); await c.connect(); clients.push(c); return c; }

test.before(async () => { srv = await boot({ gms: ['Mistrz'] }); });
test.after(async () => { for (const c of clients) c.close(); await srv.close(); });

async function create(name, voc = 'knight') {
  const c = await client();
  c.send({ t: 'create', name, pass: 'haslo123', voc, sex: 'm', outfit: { head: 1, body: 2, legs: 3, feet: 4 } });
  await c.wait((m) => m.t === 'welcome');
  await c.wait((m) => m.t === 'self');
  await c.wait((m) => m.t === 'inv');
  return c;
}

test('creating characters and validation', async () => {
  const bad = await client();
  bad.send({ t: 'create', name: 'x', pass: 'haslo123', voc: 'knight' });
  assert.equal((await bad.wait((m) => m.t === 'err')).t, 'err');
  bad.send({ t: 'create', name: 'Ojciec Ignacy', pass: 'haslo123', voc: 'knight' });
  assert.match((await bad.waitNew((m) => m.t === 'err')).text, /zajęta/);

  const bob = await create('bob');
  assert.equal(bob.self.level, 1);
  assert.equal(bob.self.voc, 'knight');
  assert.equal(bob.inv.equip.weapon.id, ITEM_BY_KEY.short_sword.id);
  assert.ok(bob.me, 'own creature visible');
  assert.equal(bob.me.name, 'Bob');
});

test('local chat and NPC dialogue', async () => {
  const gm = await create('Mistrz');
  const bob = srv.world.byName.get('bob');
  const bc = clients.find((c) => c.id === bob.id);
  bc.send({ t: 'say', text: 'witaj' });
  const heard = await gm.wait((m) => m.t === 'say' && m.name === 'Bob');
  assert.equal(heard.text, 'witaj');
  const npc = await bc.wait((m) => m.t === 'say' && m.mode === 'npc');
  assert.match(npc.text, /Bob/);
  bc.send({ t: 'say', text: 'zaklęcia' });
  const spells = await bc.waitNew((m) => m.t === 'say' && m.mode === 'npc');
  assert.match(spells.text, /sana/);
});

test('buying from a shopkeeper', async () => {
  const gm = clients.find((c) => c.me?.name === 'Mistrz');
  gm.send({ t: 'say', text: '/tp 85 75 0' });
  await gm.waitNew((m) => m.t === 'tp' && m.id === gm.id);
  gm.send({ t: 'say', text: 'witaj' });
  await gm.waitNew((m) => m.t === 'say' && m.name === 'Kowal Bogdan');
  gm.send({ t: 'say', text: 'handel' });
  const trade = await gm.waitNew((m) => m.t === 'trade');
  const knife = trade.buy.find((e) => e.id === ITEM_BY_KEY.knife.id);
  assert.ok(knife);
  const gold = gm.inv.gold;
  gm.send({ t: 'buy', npc: trade.npc, id: knife.id, n: 1 });
  const inv = await gm.waitNew((m) => m.t === 'inv');
  assert.equal(inv.gold, gold - knife.price);
  assert.ok(inv.bag.some((s) => s && s.id === knife.id));
});

test('combat, experience and loot', async () => {
  const w = srv.world;
  const bob = w.byName.get('bob');
  const bc = clients.find((c) => c.id === bob.id);
  w.teleport(bob, 100, 90, 0);
  await bc.waitNew((m) => m.t === 'tp' && m.id === bob.id);
  const rat = w.summonMonster('rat', { id: 0, x: 100, y: 90, z: 0 });
  assert.ok(rat, 'rat summoned');
  rat.hp = 2;
  await bc.wait((m) => m.t === 'cr+' && m.c.id === rat.id);
  bc.send({ t: 'attack', id: rat.id });
  await bc.wait((m) => m.t === 'cr-' && m.id === rat.id, 15000);
  const self = await bc.wait((m) => m.t === 'self' && m.exp > 0);
  assert.ok(self.exp > 0);
  const tile = await bc.wait((m) => m.t === 'tile' && m.items.some((i) => i.c === 'rat'));
  bc.send({ t: 'open', x: tile.x, y: tile.y, z: tile.z });
  const cont = await bc.waitNew((m) => m.t === 'cont');
  assert.match(cont.name, /Szczur/);
  if (cont.items.length) {
    bc.send({ t: 'take', uid: cont.uid, idx: -1 });
    await bc.waitNew((m) => m.t === 'inv');
  }
});

test('spells and PvP protection rules', async () => {
  const bob = srv.world.byName.get('bob');
  const bc = clients.find((c) => c.id === bob.id);
  bc.send({ t: 'say', text: 'sana' });
  assert.match((await bc.waitNew((m) => m.t === 'msg' && m.kind === 'warn')).text, /poziomu 2/);
  const gm = srv.world.byName.get('mistrz');
  srv.world.teleport(gm, bob.x + 1, bob.y, 0);
  await bc.waitNew((m) => (m.t === 'cr+' && m.c.id === gm.id) || (m.t === 'tp' && m.id === gm.id));
  bc.send({ t: 'attack', id: gm.id });
  assert.match((await bc.waitNew((m) => m.t === 'msg' && m.kind === 'warn')).text, /poziom 8/);
});

test('logout, persistence and relogin', async () => {
  const bob = srv.world.byName.get('bob');
  const bc = clients.find((c) => c.id === bob.id);
  bob.fightUntil = 0;
  const pos = { x: bob.x, y: bob.y, z: bob.z };
  const exp = bob.exp;
  assert.ok(exp > 0);
  bc.send({ t: 'logout' });
  await bc.waitNew((m) => m.t === 'logout');
  await sleep(100);
  assert.equal(srv.world.byName.get('bob'), undefined);
  const again = await client();
  again.send({ t: 'login', name: 'Bob', pass: 'zle' });
  assert.equal((await again.wait((m) => m.t === 'err')).t, 'err');
  again.send({ t: 'login', name: 'Bob', pass: 'haslo123' });
  await again.waitNew((m) => m.t === 'welcome');
  await again.wait((m) => m.t === 'cr+' && m.c.id === again.id);
  assert.deepEqual({ x: again.me.x, y: again.me.y, z: again.me.z }, pos);
  const self = await again.wait((m) => m.t === 'self');
  assert.equal(self.exp, exp, 'experience was saved');
});

test('second login takes over the session', async () => {
  const a = clients[clients.length - 1];
  const b = await client();
  b.send({ t: 'login', name: 'Bob', pass: 'haslo123' });
  await b.wait((m) => m.t === 'welcome');
  await a.wait((m) => m.t === 'kicked');
  assert.equal(srv.world.players.size, 2);
});

test('malformed messages are ignored', async () => {
  const c = clients[clients.length - 1];
  const junk = [{ t: 'step', d: 'x' }, { t: 'goto', x: -5, y: 1e9 }, { t: 'buy' }, { t: 'take', uid: 'a' }, { t: 'drop', slot: 99 },
    { t: 'say', text: 42 }, { t: 'mode', fight: 9 }, { t: 'unequip', slot: '__proto__' }, { t: 'use', x: 1, y: 1, z: 5 }, { foo: 1 }, null];
  for (const m of junk) c.send(m);
  c.ws.send('not json');
  c.send({ t: 'ping', ts: 1 });
  await sleep(300);
  assert.ok(srv.world.players.size >= 1);
  const status = await fetch(`http://127.0.0.1:${srv.port}/api/status`).then((r) => r.json());
  assert.equal(status.game, 'Fibula 3D');
  const map = await fetch(`http://127.0.0.1:${srv.port}/api/map`);
  assert.equal(map.status, 200);
  const traversal = await fetch(`http://127.0.0.1:${srv.port}/..%2f..%2fpackage.json`);
  assert.equal(traversal.status, 404);
});
