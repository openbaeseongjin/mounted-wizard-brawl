// 쉬운 조작(assist.js) 시험: 실제 Rapier 물리로 "금색에 떼면 맞는다"를 확인한다
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './helpers.mjs';
import { createAssist } from '../assist.js';
import { idleInput, dropWeapon } from '../fighter.js';

const duo = (spawns, p0 = {}) => makeMatch({ roster: [{ char: 'maji', isPlayer: true, ...p0 }, { char: 'dummy', isPlayer: true }], spawns, props: false });
const intent = (patch = {}) => ({ move: [0, 0], look: [0, -0.04], cast: false, swing: false, dodge: false, ...patch });
// 쉬운 조작으로 secs 동안 돌린다. fn(tick, ui) → intent
function drive(m, as, secs, fn) {
  const evs = [], n = Math.round(secs * 60);
  for (let s = 0; s < n; s++) {
    const inp = as.step(fn(s, as.ui), 1 / 60);
    for (const e of m.step({ 0: inp, 1: idleInput() })) evs.push({ ...e, tick: s });
  }
  return evs;
}

test('마법: 누르고 있으면 표적을 겨누고 금색이 된다 → 떼면 표적 쪽으로 날아간다', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 6, z: 32, heading: Math.PI }]);
  const as = createAssist(m, 0);
  drive(m, as, 1.5, () => intent({ move: [0, 1] }));   // 질주로 마력을 모은다
  let goldAt = -1;
  drive(m, as, 1.6, (s, ui) => { if (ui.gold && goldAt < 0) goldAt = s; return intent({ move: [0, 1], cast: true }); });
  assert.ok(goldAt >= 0, '금색이 됐다');
  assert.equal(as.ui.target, 1, '표적은 허수아비');
  const ev = drive(m, as, 0.1, () => intent({ move: [0, 1] }));
  const cast = ev.find((e) => e.type === 'cast' && e.i === 0);
  assert.ok(cast, '쏘았다');
  const sp = m.spells.find((x) => x.id === cast.id), me = m.fighters[0].rider.body.translation(), tp = m.fighters[1].rider.body.translation();
  const want = Math.atan2(tp.x - me.x, tp.z - me.z), got = Math.atan2(sp.vel.x, sp.vel.z);
  assert.ok(Math.abs(want - got) < 0.12, `표적 쪽으로 (오차 ${(want - got).toFixed(3)} rad)`);
});

test('휘두르기: 멀 때 누르고 있으면 상대를 오른쪽에 두고 스치게 몰고, 금색에 떼면 맞힌다', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 3, z: 30, heading: Math.PI }]);
  const as = createAssist(m, 0);
  let armed = false, released = -1;
  const ev = drive(m, as, 4.5, (s, ui) => {
    const holding = released < 0 && !(ui.gold && armed);
    if (ui.mode === 'arm') armed = true;
    if (!holding && released < 0) released = s;
    return intent({ move: [0, 0.6], swing: s > 30 && holding });
  });
  assert.ok(armed, '겨누는 상태를 거쳤다');
  assert.ok(released > 0, '금색이 되어 뗐다');
  const hit = ev.find((e) => e.type === 'hit' && e.i === 0 && e.j === 1 && e.tick >= released);
  assert.ok(hit, `맞혔다 (뗀 틱 ${released}, 맞힌 것들: ${ev.filter((e) => e.type === 'hit').map((e) => e.i + '>' + e.j + '@' + e.tick).join(',')})`);
  assert.ok(hit.tick - released < 40, '뗀 직후에 맞았다');
});

test('휘두르기: 닿는 거리에서 누르면 바로 친다', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: -1.1, z: 0.3, heading: 0 }]);   // 오른쪽(-x)에 나란히
  const as = createAssist(m, 0);
  drive(m, as, 0.4, () => intent({ move: [0, -0.3] }));
  const ev = drive(m, as, 0.8, (s) => intent({ move: [0, -0.3], swing: s < 3 }));
  assert.ok(ev.some((e) => e.type === 'hit' && e.i === 0 && e.j === 1), '맞혔다');
});

test('쳐내기: 마법이 날아오면 버튼 이름이 바뀌고, 누르면 되받아친다', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 0, z: 40, heading: Math.PI }]);
  const as = createAssist(m, 0);
  drive(m, as, 0.4, () => intent({ move: [0, -1] }));
  const me = m.fighters[0].rider.body.translation();
  m.spells.push({ id: m.nextSpellId++, owner: 1, pos: { x: me.x + 0.6, y: me.y + 1.0, z: me.z + 11 }, vel: { x: 0, y: 0, z: -30 }, r: 0.22, E: 3000, age: 0, deflects: 0, grace: 0, frac: 0.2, lastDeflector: -1 });
  let label = '', pressAt = -1;
  const ev = drive(m, as, 0.8, (s, ui) => {
    if (ui.swingLabel === '쳐내기' && pressAt < 0) { pressAt = s; label = ui.swingLabel; }
    return intent({ move: [0, -1], swing: pressAt >= 0 && s - pressAt < 4 });
  });
  assert.equal(label, '쳐내기');
  assert.ok(ev.some((e) => e.type === 'deflect' && e.i === 0), '되받아쳤다');
});

test('줍기: 맨손이면 버튼이 "줍기"가 되고, 누르고 있으면 말을 늦춰 가서 줍는다', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 30, z: 30, heading: Math.PI }]);
  const as = createAssist(m, 0);
  const p = m.fighters[0], w = m.weapons[p.weapon];
  dropWeapon(m, p, 'test');
  w.body.setTranslation({ x: 1.2, y: 0.1, z: 6 }, true); w.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  drive(m, as, 0.5, () => intent({ move: [0, -1] }));
  as.step(intent(), 1 / 60);
  assert.equal(as.ui.swingLabel, '줍기');
  const ev = drive(m, as, 5, () => intent({ swing: true }));
  assert.ok(ev.some((e) => e.type === 'pickup' && e.i === 0), '주웠다');
  assert.ok(p.weapon >= 0);
});

test('원소: 큰 마법(Q)은 big 입력, 돌풍 금색은 0.5 이상·3.5m 안, 버튼 글은 마법 이름', async () => {
  const m = await makeMatch({ roster: [{ char: 'maji', isPlayer: true, job: 'wind', jobTier: 2 }, { char: 'dummy', isPlayer: true }],
    spawns: [{ x: 0, z: 0, heading: 0 }, { x: 0, z: 3, heading: 0 }], props: false });
  const as = createAssist(m, 0);
  const step = (patch) => { const inp = as.step(intent(patch), 1 / 60); m.step({ 0: inp, 1: idleInput() }); return inp; };
  assert.equal(step({ big: true }).big, true);
  step({});
  for (let k = 0; k < 56; k++) step({ cast: true });   // 금색은 그 틱 시작의 모은 양으로 본다
  assert.ok(m.fighters[0].charge >= 0.5, 'charge ' + m.fighters[0].charge);
  assert.equal(as.ui.gold, true);
  assert.equal(as.ui.castLabel, '돌풍'); assert.equal(as.ui.bigLabel, '회오리'); assert.equal(as.ui.bigOk, true);
});
