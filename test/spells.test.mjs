import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, run, input, speedOf } from './helpers.mjs';
import { kineticEnergy } from '../fighter.js';
import { CFG } from '../config.js';

const duo = (spawns, extra = {}) => makeMatch({ roster: [{ char: 'maji', isPlayer: true }, { char: 'dummy', isPlayer: true }], spawns, ...extra });

for (const [f, want] of [[0.25, 0.866], [0.5, 0.707], [0.75, 0.5]]) {
  test(`마력 ${f * 100}% 방출 → 속도 ×${want}`, async () => {
    const m = await duo([{ x: -12, z: -36, heading: 0 }, { x: 25, z: 30, heading: Math.PI }]);
    run(m, 3, () => ({ 0: input({ move: [0, 1] }) }));
    run(m, f / CFG.spell.chargeRate + 0.02, () => ({ 0: input({ charge: true, look: [0, 0.2] }) }));
    assert.ok(Math.abs(m.fighters[0].charge - f) < 0.02, 'charge ' + m.fighters[0].charge);
    const before = speedOf(m, 0);
    run(m, 1 / 60, () => ({ 0: input({ charge: false, look: [0, 0.2] }) }));
    const ratio = speedOf(m, 0) / before;
    assert.ok(Math.abs(ratio - want) < 0.03, `ratio ${ratio.toFixed(3)}`);
    assert.equal(m.spells.length, 1);
  });
}

test('걸으며 쏘는 마력은 질주 마력의 3% 미만', async () => {
  const m = await duo([{ x: 0, z: -36, heading: 0 }, { x: 25, z: 30, heading: Math.PI }]);
  run(m, 4.5, () => ({ 0: input({ move: [0, 1], gallop: true }) }));
  const mounted = kineticEnergy(m, m.fighters[0]);
  const f = m.fighters[0];
  // 걷는 기수의 최대 에너지 (달리기 5.2 m/s)
  const foot = 0.5 * f.mass * CFG.rider.run ** 2;
  assert.ok(foot / mounted < 0.03, `${foot} / ${mounted}`);
});

// 같은 주문: 질주하며 쏘면 낙마, 걸으며 쏘면 버틴다
async function shootAt(gallopSecs) {
  const m = await duo([{ x: 0, z: -40, heading: 0 }, { x: 3, z: 30, heading: Math.PI }]);
  const aim = (mm) => {
    const p = mm.fighters[0].rider.body.translation(), t = mm.fighters[1].rider.body.translation();
    const head = { x: p.x, y: p.y + 1.0, z: p.z }, tgt = { x: t.x, y: t.y + 0.9, z: t.z };   // 조준점 = 상대 머리 아래(목)
    const yaw = Math.atan2(tgt.x - head.x, tgt.z - head.z) - mm.horses[0].heading;
    const pitch = Math.atan2(tgt.y - head.y, Math.hypot(tgt.x - head.x, tgt.z - head.z));
    return [yaw, pitch];
  };
  run(m, gallopSecs, (mm) => ({ 0: input({ move: [0, 1], gallop: true, look: aim(mm) }) }));
  run(m, 1.3, (mm) => ({ 0: input({ move: [0, gallopSecs > 1 ? 1 : 0], gallop: gallopSecs > 1, charge: true, look: aim(mm) }) }));
  const ev = run(m, 2.5, (mm) => ({ 0: input({ look: aim(mm) }) }));
  return { m, ev };
}
test('질주 중 75% 주문은 상대를 낙마시킨다', async () => {
  const { ev } = await shootAt(4.2);
  assert.ok(ev.some((e) => e.type === 'explode' && e.hits.some((h) => h.i === 1)), 'hit');
  assert.ok(ev.some((e) => e.type === 'unhorse' && e.i === 1), 'unhorsed');
});
test('천천히 가며 쏜 75% 주문으로는 낙마하지 않는다', async () => {
  const { m, ev } = await shootAt(0.5);
  assert.ok(ev.some((e) => e.type === 'explode'), 'exploded');
  assert.ok(!ev.some((e) => e.type === 'unhorse' && e.i === 1), 'not unhorsed');
  assert.equal(m.fighters[1].rider.state, 'mounted');
});

test('빠르게 휘두르는 지팡이는 주문을 되받아친다(주인이 바뀜)', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 0, z: 30, heading: Math.PI }]);
  let deflects = 0, s0 = 0;
  for (let k = 0; k < 16; k++) {
    // 앞 6m에서 가슴 앞을 향해 날아오는 주문
    const tb = m.fighters[0].rider.body.translation();
    m.spells.push({ id: 1000 + k, owner: 1, pos: { x: tb.x - 0.35 + (k % 4) * 0.12, y: tb.y + 0.75, z: tb.z + 7 }, vel: { x: 0, y: 0, z: -30 }, r: 0.25, E: 20000, age: 0, deflects: 0, grace: 0, frac: 0.5, lastDeflector: -1 });
    const ev = run(m, 0.5, (mm, s) => ({ 0: input({ swing: true, hand: [Math.sin((s0 + s) * 0.55) > 0 ? 1 : -1, 0.2] }) }));
    s0 += 30;
    deflects += ev.filter((e) => e.type === 'deflect' && e.i === 0).length;
  }
  assert.ok(deflects >= 1, 'deflects ' + deflects);
});

test('가까운 폭발은 말을 겁먹게 한다', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 0, z: 30, heading: Math.PI }]);
  m.spells.push({ id: 7, owner: 1, pos: { x: 2.5, y: 0.6, z: 3 }, vel: { x: 0, y: -20, z: 0 }, r: 0.3, E: 30000, age: 0, deflects: 0, grace: 0, frac: 0.5, lastDeflector: -1 });
  run(m, 0.3);
  assert.ok(m.horses[0].fear > 10, 'fear ' + m.horses[0].fear);
});
