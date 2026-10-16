// 4원소 마법 (설계: superpowers/specs/2026-10-16-mw-job-advancement-design.md 5장)
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, run, input, speedOf } from './helpers.mjs';
import { tag, unhorse } from '../fighter.js';
import { slotsFor } from '../config.js';

const duo = (extra = {}, specs = [{ char: 'maji', isPlayer: true }, { char: 'dummy', isPlayer: true }]) =>
  makeMatch({ roster: specs, spawns: [{ x: 0, z: -20, heading: 0 }, { x: 6, z: 20, heading: Math.PI }], ...extra });

test('슬롯·보너스: 바람 1차는 돌풍, 타격 ×1.2 / 땅은 균형 ×1.15 / 물은 말 속도 ×1.05', async () => {
  const m = await duo({}, [{ char: 'maji', isPlayer: true, job: 'wind', jobTier: 1, slots: slotsFor('wind', 1) }, { char: 'maji', isPlayer: true, job: 'earth', jobTier: 2 }]);
  assert.deepEqual(m.fighters[0].slots, { main: 'gust', big: null });
  assert.equal(m.fighters[0].hitMul, 1.2);
  assert.deepEqual(m.fighters[1].slots, { main: 'wall', big: 'fissure' });   // 슬롯을 안 주면 job/jobTier로 만든다
  assert.ok(Math.abs(m.fighters[1].balance - 1.0 * 1.15) < 1e-9);
  const w = await duo({}, [{ char: 'maji', isPlayer: true, job: 'water', jobTier: 1 }, { char: 'dummy', isPlayer: true }]);
  assert.equal(w.fighters[0].speedMul, 1.05);
});

test('AI 캐릭터는 자기 원소 슬롯을 가진다 (번개 = 화염구)', async () => {
  const m = await duo({}, [{ char: 'maji', isPlayer: true }, { char: 'beongae' }]);
  assert.deepEqual(m.fighters[1].slots, { main: 'fireball', big: null });
});

test('원인 기록: 3초 안의 tag가 낙마 사건에 spell로 실린다', async () => {
  const m = await duo();
  tag(m, m.fighters[1], 0, 'gust');
  unhorse(m, m.fighters[1], 'tilt');
  const e = m.events.find((x) => x.type === 'unhorse');
  assert.equal(e.by, 0); assert.equal(e.spell, 'gust');
});

test('물 마법사 말은 최고 속도가 5% 빠르다', async () => {
  const a = await duo({}, [{ char: 'maji', isPlayer: true }, { char: 'dummy', isPlayer: true }]);
  const b = await duo({}, [{ char: 'maji', isPlayer: true, job: 'water', jobTier: 1 }, { char: 'dummy', isPlayer: true }]);
  for (const m of [a, b]) run(m, 5, () => ({ 0: input({ move: [0, 1], gallop: true }) }));   // 울타리(42m)에 닿기 전
  const r = speedOf(b, 0) / speedOf(a, 0);
  assert.ok(r > 1.03 && r < 1.07, 'ratio ' + r);
});

import { spendKE } from '../spells.js';
import { kineticEnergy } from '../fighter.js';
const ride = (m, secs) => run(m, secs, () => ({ 0: input({ move: [0, 1], gallop: true }) }));

test('spendKE: 30% 쓰면 속도 ×√0.7, 쓴 에너지 = 0.3 × E × 지팡이 배율', async () => {
  const m = await duo();
  ride(m, 4);
  const f = m.fighters[0], E = kineticEnergy(m, f), v0 = speedOf(m, 0);
  const Es = spendKE(m, f, 0.3);
  assert.ok(Math.abs(Es - 0.3 * E * f.staff.item.spellMul) < 1);
  assert.ok(Math.abs(speedOf(m, 0) / v0 - Math.sqrt(0.7)) < 0.01);
});

test('화염구: 0.8배 느리고, 사건과 구슬에 kind', async () => {
  const shoot = async (job) => {
    const m = await duo({}, [{ char: 'maji', isPlayer: true, job, jobTier: job ? 1 : 0 }, { char: 'dummy', isPlayer: true }]);
    ride(m, 3);
    run(m, 0.6, () => ({ 0: input({ charge: true, look: [0, 0.05] }) }));
    const evs = run(m, 1 / 60, () => ({ 0: input({ charge: false, look: [0, 0.05] }) }));
    return { cast: evs.find((e) => e.type === 'cast'), sp: m.spells[0] };
  };
  const a = await shoot(null), b = await shoot('fire');
  assert.equal(a.cast.kind, 'orb'); assert.equal(b.cast.kind, 'fireball');
  assert.equal(b.sp.kind, 'fireball');
  const va = Math.hypot(a.sp.vel.x, a.sp.vel.z), vb = Math.hypot(b.sp.vel.x, b.sp.vel.z);
  assert.ok(vb < va * 0.9, `${vb} vs ${va}`);
});

// ---------- 돌풍 ----------
const trio = (job, tier, near) => makeMatch({ roster: [{ char: 'maji', isPlayer: true, job, jobTier: tier }, { char: 'dummy', persona: 'still' }, { char: 'dummy', persona: 'still' }],
  spawns: [{ x: 0, z: 0, heading: 0 }, { x: near, z: 1, heading: 0 }, { x: -near, z: 1, heading: 0 }] });
const hold = (m, key, secs, look = [0, 0]) => run(m, secs, () => ({ 0: input({ [key]: true, look }) }));
const letGo = (m, secs = 1.5) => run(m, secs, () => ({ 0: input({ look: [0, 0] }) }));

test('돌풍: 0.5 미만이면 안 나가고 비용도 없다', async () => {
  const m = await trio('wind', 1, 2.5);
  hold(m, 'charge', 0.5);   // 0.3
  const evs = letGo(m, 0.1);
  assert.ok(!evs.some((e) => e.type === 'gust'));
});

test('돌풍: 나란히 달리던 2.2m 옆 기수 둘이 떨어지고 원인이 gust, 6m 밖은 그대로', async () => {
  const m = await makeMatch({ roster: [{ char: 'maji', isPlayer: true, job: 'wind', jobTier: 1 }, { char: 'rival', isPlayer: true }, { char: 'rival', isPlayer: true }, { char: 'rival', isPlayer: true }],
    spawns: [{ x: 0, z: -30, heading: 0 }, { x: 2.2, z: -30, heading: 0 }, { x: -2.2, z: -30, heading: 0 }, { x: 6.5, z: -30, heading: 0 }] });
  const all = (extra) => ({ 0: input({ move: [0, 1], ...extra }), 1: input({ move: [0, 1] }), 2: input({ move: [0, 1] }), 3: input({ move: [0, 1] }) });
  run(m, 2.5, () => all({}));
  run(m, 1.3, () => all({ charge: true }));   // 0.75
  const evs = run(m, 1.5, () => all({}));
  assert.ok(evs.some((e) => e.type === 'gust'));
  const downs = evs.filter((e) => e.type === 'unhorse' && e.spell === 'gust').map((e) => e.i).sort();
  assert.deepEqual(downs, [1, 2]);
});

test('돌풍: 마력탄은 튕기고 화염구는 그 자리에서 터진다', async () => {
  for (const kind of ['orb', 'fireball']) {
    const m = await trio('wind', 1, 30);
    hold(m, 'charge', 0.9);
    m.spells.push({ id: 99, owner: 1, kind, pos: { x: 0, y: 1.5, z: 3 }, vel: { x: 0, y: 0, z: -2 }, r: 0.3, E: 20000, age: 0, deflects: 0, grace: 0, frac: 0.4, lastDeflector: -1 });
    const evs = letGo(m, 1 / 60);
    if (kind === 'orb') assert.equal(m.spells.find((s) => s.id === 99).owner, 0);
    else assert.ok(evs.some((e) => e.type === 'explode' && e.kind === 'fireball'));
  }
});

// ---------- 땅 위 구역 ----------
import { addZone, zoneGap } from '../zones.js';
test('구역: 캡슐 거리, 불 자리에 들어온 말이 한 번 놀라고 2.5초 뒤 사라진다', async () => {
  const z = { a: { x: 0, z: 0 }, b: { x: 10, z: 0 }, r: 1 };
  assert.ok(zoneGap(z, { x: 5, z: 0.5 }) < 0); assert.ok(Math.abs(zoneGap(z, { x: 5, z: 3 }) - 2) < 1e-9);
  const m = await duo({}, [{ char: 'maji', isPlayer: true }, { char: 'rival', isPlayer: true }]);
  const p = m.horses[1].body.translation();
  addZone(m, { kind: 'burn', a: { x: p.x, z: p.z }, b: { x: p.x, z: p.z }, r: 2, life: 2.5, owner: 0 });
  const f0 = m.horses[1].fear;
  const evs = run(m, 0.5);
  assert.equal(evs.filter((e) => e.type === 'zoneFear' && e.k === 1).length, 1);
  assert.ok(m.horses[1].fear > f0 + 30);
  run(m, 2.2);
  assert.equal(m.zones.length, 0);
});
test('반응: 불 자리와 빙판이 겹치면 둘 다 사라지고 김', async () => {
  const m = await duo();
  addZone(m, { kind: 'ice', a: { x: 0, z: 5 }, b: { x: 0, z: 5 }, r: 4, life: 6, owner: 0 });
  addZone(m, { kind: 'burn', a: { x: 1, z: 5 }, b: { x: 1, z: 5 }, r: 2, life: 2.5, owner: 1 });
  const evs = run(m, 1 / 60);
  assert.ok(evs.some((e) => e.type === 'steam')); assert.equal(m.zones.length, 0);
});

// ---------- 흙벽 ----------
test('흙벽: 정면으로 질주해 박은 말의 기수가 떨어지고 앞으로 날아간다, 6.4초 뒤 사라진다', async () => {
  const m = await makeMatch({ roster: [{ char: 'maji', isPlayer: true, job: 'earth', jobTier: 1 }, { char: 'rival', isPlayer: true }],
    spawns: [{ x: 0, z: -30, heading: 0 }, { x: 0, z: 30, heading: Math.PI }] });
  const opp = { 1: input({ move: [0, 1], gallop: true }) };
  run(m, 2.2, () => ({ 0: input({ move: [0, -1] }), ...opp }));
  run(m, 0.8, () => ({ 0: input({ charge: true, look: [0, 0] }), ...opp }));
  let evs = run(m, 1 / 60, () => ({ 0: input({ look: [0, 0] }), ...opp }));
  assert.ok(evs.some((e) => e.type === 'wallUp'));
  evs = run(m, 3, () => opp);
  const crash = evs.find((e) => e.type === 'wallCrash' && e.k === 1);
  assert.ok(crash, 'crash'); assert.ok(crash.s > 9, 'speed ' + (crash && crash.s));
  const down = evs.find((e) => e.type === 'unhorse' && e.i === 1);
  assert.ok(down); assert.equal(down.spell, 'wall');
  run(m, 4);
  assert.equal(m.walls.length, 0);
});
test('흙벽: 내 말은 내 벽에 막히기만 한다 (낙마·공포 없음)', async () => {
  const m = await makeMatch({ roster: [{ char: 'maji', isPlayer: true, job: 'earth', jobTier: 1 }, { char: 'dummy', persona: 'still' }],
    spawns: [{ x: 0, z: -30, heading: 0 }, { x: 30, z: 30, heading: 0 }] });
  ride(m, 2.5);
  run(m, 0.8, () => ({ 0: input({ move: [0, 1], gallop: true, charge: true, look: [0, 0] }) }));
  const evs = ride(m, 3);
  assert.ok(evs.some((e) => e.type === 'wallUp'));
  assert.ok(!evs.some((e) => e.type === 'wallCrash' && e.i === 0), 'no crash');
  assert.ok(!evs.some((e) => e.type === 'unhorse' && e.i === 0), 'no unhorse');
  assert.ok(m.horses[0].fear < 30, 'fear ' + m.horses[0].fear);
});
test('흙벽: 구슬이 벽에 맞으면 터진다', async () => {
  const m = await duo({}, [{ char: 'maji', isPlayer: true, job: 'earth', jobTier: 1 }, { char: 'dummy', isPlayer: true }]);
  run(m, 0.8, () => ({ 0: input({ charge: true, look: [0, 0] }) }));
  run(m, 0.5, () => ({ 0: input({ look: [0, 0] }) }));
  const p = m.walls[0].body.translation();
  m.spells.push({ id: 77, owner: 1, kind: 'orb', pos: { x: p.x, y: 1, z: p.z + 6 }, vel: { x: 0, y: 0, z: -30 }, r: 0.3, E: 20000, age: 0, deflects: 0, grace: 0, frac: 0.4, lastDeflector: -1 });
  const evs = run(m, 0.4);
  const ex = evs.find((e) => e.type === 'explode' && e.id === 77);
  assert.ok(ex && ex.direct === 'wall', JSON.stringify(ex && ex.direct));
});

// ---------- 물채찍 ----------
const chase = (job) => makeMatch({ roster: [{ char: 'maji', isPlayer: true, job, jobTier: 1 }, { char: 'rival', isPlayer: true }],
  spawns: [{ x: 0, z: -12, heading: 0 }, { x: 0, z: -2, heading: 0 }] });
test('물채찍: 내가 더 빠르면 앞의 상대가 뽑혀 떨어진다 (spell = whip)', async () => {
  const m = await chase('water');
  run(m, 2.5, () => ({ 0: input({ move: [0, 1], gallop: true }), 1: input({ move: [0, 0.4] }) }));
  const evs = run(m, 2.5, () => ({ 0: input({ move: [0, 1], gallop: true, charge: true, look: [0, 0.02] }), 1: input({ move: [0, 0.4] }) }));
  assert.ok(evs.some((e) => e.type === 'whip' && e.j === 1), 'whip');
  assert.ok(evs.some((e) => e.type === 'unhorse' && e.i === 1 && e.spell === 'whip'), 'unhorse');
});
test('물채찍: 흙벽이 가로막으면 끊긴다', async () => {
  const m = await chase('water');
  run(m, 0.3, () => ({ 0: input({ charge: true, look: [0, 0.02] }) }));
  assert.ok(m.fighters[0].whip, 'whip on');
  const a = m.fighters[0].rider.body.translation(), b = m.fighters[1].rider.body.translation();
  const body = m.world.createRigidBody(m.R.RigidBodyDesc.fixed().setTranslation((a.x + b.x) / 2, 1.2, (a.z + b.z) / 2));
  const col = m.world.createCollider(m.R.ColliderDesc.cuboid(3, 1.2, 0.3), body);
  m.info.set(col.handle, { kind: 'wall', id: 999 }); m.walls.push({ id: 999, body, col, h: 2.4, w: 6, t: 0, pos: { x: 0, z: 0 }, yaw: 0, owner: 1 });
  const evs = run(m, 0.3, () => ({ 0: input({ charge: true, look: [0, 0.02] }) }));
  assert.ok(evs.some((e) => e.type === 'whipCut' && e.why === 'wall'));
});

// ---------- 땅가르기 ----------
test('땅가르기: 13m/s로 달려오던 말은 고꾸라지고, 서 있던 말은 공포 10 이하', async () => {
  const m = await makeMatch({ roster: [{ char: 'maji', isPlayer: true, job: 'earth', jobTier: 2 }, { char: 'rival', isPlayer: true }, { char: 'dummy', isPlayer: true }],
    spawns: [{ x: 0, z: -20, heading: 0 }, { x: 0, z: 30, heading: Math.PI }, { x: 1.2, z: -12, heading: 0 }] });   // 셋째 말은 균열 가장자리에 가만히 (질주 길은 막지 않게)
  run(m, 2.5, () => ({ 1: input({ move: [0, 1], gallop: true }) }));
  run(m, 0.75, () => ({ 0: input({ big: true, look: [0, 0] }), 1: input({ move: [0, 1], gallop: true }) }));
  const evs = run(m, 2.5, () => ({ 1: input({ move: [0, 1], gallop: true }) }));
  assert.ok(evs.some((e) => e.type === 'fissure'), 'fissure');
  assert.ok(evs.some((e) => e.type === 'trip' && e.k === 1), 'trip');
  assert.ok(evs.some((e) => e.type === 'unhorse' && e.i === 1 && e.spell === 'fissure'), 'unhorse');
  assert.ok(m.horses[2].fear <= 10, 'still horse fear ' + m.horses[2].fear);
});

// ---------- 회오리 ----------
test('회오리: 빨리 달리다 쓴 것이 더 멀리 가고, 축 안의 기수는 떨어진다, 구슬을 삼킨다', async () => {
  const fly = async (gallopSecs) => {
    const m = await makeMatch({ roster: [{ char: 'maji', isPlayer: true, job: 'wind', jobTier: 2 }, { char: 'rival', isPlayer: true }],
      spawns: [{ x: 0, z: -40, heading: 0 }, { x: 0.5, z: 20, heading: 0 }] });   // 상대는 회오리 길 위, 플레이어와 부딪히지 않을 만큼 앞
    run(m, gallopSecs, () => ({ 0: input({ move: [0, 1], gallop: true }) }));
    run(m, 0.75, () => ({ 0: input({ big: true, look: [0, 0], move: [0, 1] }) }));
    run(m, 1 / 60, () => ({ 0: input({ look: [0, 0] }) }));
    const t0 = { ...m.tornados[0].pos };
    m.spells.push({ id: 55, owner: 1, kind: 'orb', pos: { x: t0.x, y: 1, z: t0.z + 2 }, vel: { x: 0, y: 0, z: -5 }, r: 0.3, E: 9000, age: 0, deflects: 0, grace: 0, frac: 0.3, lastDeflector: -1 });
    const evs = run(m, 3.2);
    const end = evs.find((x) => x.type === 'tornadoEnd');
    return { evs, travel: Math.hypot(end.pos.x - t0.x, end.pos.z - t0.z) };
  };
  const slow = await fly(0.5), fast = await fly(4);
  assert.ok(fast.evs.some((e) => e.type === 'swallow' && e.id === 55), 'swallow');
  assert.ok(fast.travel > slow.travel + 10, `${fast.travel} vs ${slow.travel}`);
  assert.ok(fast.evs.some((e) => e.type === 'unhorse' && e.i === 1 && e.spell === 'tornado'), 'unhorse');
});

// ---------- 불길 ----------
test('불길: 13m/s로 넘는 말 공포 ≥ 55, 3m/s 말 ≤ 20, 내 말은 불길 공포 없음', async () => {
  const m = await duo({}, [{ char: 'maji', isPlayer: true, job: 'fire', jobTier: 2 }, { char: 'rival', isPlayer: true }]);
  const evs = run(m, 2, () => ({ 0: input({ move: [0, 1], gallop: true, big: true }) }));
  const trail = m.zones.filter((z) => z.kind === 'trail');
  assert.ok(trail.length > 10, 'segments ' + trail.length);
  assert.ok(!evs.some((e) => e.type === 'zoneFear' && e.k === 0), 'own horse');
  const h = m.horses[1], z = trail[3], at = { x: (z.a.x + z.b.x) / 2, y: h.body.translation().y, z: (z.a.z + z.b.z) / 2 };
  const probe = (speed) => { h.fear = 0; h.body.setTranslation(at, true); h.body.setLinvel({ x: speed, y: 0, z: 0 }, true); h.speed = speed; m.cds.clear(); run(m, 1 / 60); return h.fear; };
  assert.ok(probe(13) >= 55 * h.def.fearGain - 1, 'fast');
  assert.ok(probe(3) <= 20 * h.def.fearGain + 1, 'slow');
});

// ---------- 빙판 ----------
test('빙판: 12m/s로 들어간 말은 브레이크를 밟아도 0.5초 뒤 10.5m/s 넘게 미끄러지고, 급히 틀면 넘어진다 (spell = ice)', async () => {
  const m = await makeMatch({ roster: [{ char: 'maji', isPlayer: true, job: 'water', jobTier: 2 }, { char: 'rival', isPlayer: true }],
    spawns: [{ x: 0, z: -40, heading: 0 }, { x: 0, z: 30, heading: Math.PI }] });
  run(m, 1.1, () => ({ 0: input({ big: true, look: [0, -0.12] }) }));   // 다 모아서 큰 빙판
  run(m, 1 / 60, () => ({ 0: input({ look: [0, -0.12] }) }));
  const ice = m.zones.find((z) => z.kind === 'ice'); assert.ok(ice, 'ice');
  // 상대를 빙판 바로 앞에서 12m/s로 들여보낸다 (브레이크를 밟아도 못 선다)
  const h = m.horses[1], y = h.body.translation().y, start = { x: ice.a.x, y, z: ice.a.z + ice.r - 0.5 };   // 빙판 가장자리 안쪽
  h.body.setTranslation(start, true); h.body.setLinvel({ x: 0, y: 0, z: -12 }, true); h.cruise = 12;
  const rb = m.fighters[1].rider.body, ry = rb.translation().y;
  rb.setTranslation({ x: start.x, y: ry, z: start.z }, true); rb.setLinvel({ x: 0, y: 0, z: -12 }, true);
  run(m, 0.5, () => ({ 1: input({ move: [0, -1] }) }));
  assert.ok(h.onIce, 'still on ice');
  assert.ok(h.speed > 10.5, 'speed ' + h.speed);
  const evs = run(m, 0.5, () => ({ 1: input({ move: [1, 1] }) }));
  assert.ok(evs.some((e) => e.type === 'unhorse' && e.i === 1 && e.spell === 'ice'));
});

test('빙판: 내 말은 내 빙판에서 미끄러지지 않는다', async () => {
  const m = await makeMatch({ roster: [{ char: 'maji', isPlayer: true, job: 'water', jobTier: 2 }, { char: 'dummy', persona: 'still' }],
    spawns: [{ x: 0, z: -40, heading: 0 }, { x: 30, z: 30, heading: Math.PI }] });
  run(m, 1.1, () => ({ 0: input({ big: true, look: [0, -0.12] }) }));
  run(m, 1 / 60, () => ({ 0: input({ look: [0, -0.12] }) }));
  const ice = m.zones.find((z) => z.kind === 'ice'); assert.ok(ice, 'ice');
  const h = m.horses[0], y = h.body.translation().y, start = { x: ice.a.x, y, z: ice.a.z - ice.r + 0.5 };
  h.body.setTranslation(start, true); h.body.setLinvel({ x: 0, y: 0, z: 12 }, true); h.cruise = 12;
  const rb = m.fighters[0].rider.body, ry = rb.translation().y;
  rb.setTranslation({ x: start.x, y: ry, z: start.z }, true); rb.setLinvel({ x: 0, y: 0, z: 12 }, true);
  const evs = run(m, 0.8, () => ({ 0: input({ move: [1, 1], gallop: true }) }));
  assert.ok(!h.onIce, 'own ice ignored');
  assert.ok(!evs.some((e) => e.type === 'slip' || (e.type === 'unhorse' && e.i === 0)));
});

// ---------- 원소 반응 ----------
test('반응 끄기(reactions:false): 불 자리와 빙판이 겹쳐도 그대로', async () => {
  const m = await duo({ reactions: false });
  addZone(m, { kind: 'ice', a: { x: 0, z: 5 }, b: { x: 0, z: 5 }, r: 4, life: 6, owner: 0 });
  addZone(m, { kind: 'burn', a: { x: 1, z: 5 }, b: { x: 1, z: 5 }, r: 2, life: 2.5, owner: 1 });
  run(m, 1 / 60);
  assert.equal(m.zones.length, 2);
});
test('반응: 회오리가 불 자리를 지나면 불 회오리, 땅가르기는 빙판을 깬다', async () => {
  const m = await makeMatch({ roster: [{ char: 'maji', isPlayer: true, job: 'wind', jobTier: 2 }, { char: 'dummy', isPlayer: true }], spawns: [{ x: 0, z: -30, heading: 0 }, { x: 20, z: 20, heading: 0 }] });
  addZone(m, { kind: 'burn', a: { x: 0, z: -20 }, b: { x: 0, z: -20 }, r: 2.5, life: 9, owner: 1 });
  run(m, 0.75, () => ({ 0: input({ big: true, look: [0, 0] }) }));
  const evs = run(m, 2);
  assert.ok(evs.some((e) => e.type === 'fireTornado'));
  const e = await makeMatch({ roster: [{ char: 'maji', isPlayer: true, job: 'earth', jobTier: 2 }, { char: 'dummy', isPlayer: true }], spawns: [{ x: 0, z: -30, heading: 0 }, { x: 20, z: 20, heading: 0 }] });
  addZone(e, { kind: 'ice', a: { x: 0, z: -22 }, b: { x: 0, z: -22 }, r: 3, life: 9, owner: 1 });
  run(e, 0.6, () => ({ 0: input({ big: true, look: [0, 0] }) }));
  const ev2 = run(e, 1);
  assert.ok(ev2.some((x) => x.type === 'iceBreak')); assert.equal(e.zones.filter((z) => z.kind === 'ice').length, 0);
});
