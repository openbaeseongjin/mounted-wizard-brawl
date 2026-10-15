import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, run, input, speedOf } from './helpers.mjs';
import { staffTarget } from '../fighter.js';
import { len, sub } from '../rng.js';

const duo = (spawns) => makeMatch({ roster: [{ char: 'maji', isPlayer: true }, { char: 'dummy', isPlayer: true }], spawns });

test('W로 순항 속도까지, Shift로 질주', async () => {
  const m = await duo([{ x: 0, z: -36, heading: 0 }, { x: 20, z: 30, heading: Math.PI }]);
  run(m, 3, () => ({ 0: input({ move: [0, 1] }) }));
  assert.ok(speedOf(m, 0) >= 0.9 * 11, 'cruise ' + speedOf(m, 0));
  run(m, 1.2, () => ({ 0: input({ move: [0, 1], gallop: true }) }));
  assert.ok(speedOf(m, 0) > 12, 'gallop ' + speedOf(m, 0));
});

test('D는 오른쪽으로 돈다(요 감소), A는 왼쪽', async () => {
  const m = await duo([{ x: 0, z: -20, heading: 0 }, { x: 20, z: 30, heading: Math.PI }]);
  run(m, 1.5, () => ({ 0: input({ move: [0, 1] }) }));
  const h0 = m.horses[0].heading;
  run(m, 1, () => ({ 0: input({ move: [1, 1] }) }));
  assert.ok(m.horses[0].heading < h0 - 0.4, 'right turn');
  const h1 = m.horses[0].heading;
  run(m, 1, () => ({ 0: input({ move: [-1, 1] }) }));
  assert.ok(m.horses[0].heading > h1 + 0.4, 'left turn');
});

test('달리며 지그재그로 돌아도 말에서 안 떨어진다', async () => {
  const m = await duo([{ x: 0, z: -34, heading: 0 }, { x: 25, z: 30, heading: Math.PI }]);
  run(m, 5, (mm, s) => ({ 0: input({ move: [Math.sin(s / 25), 1], gallop: s > 120 }) }));
  assert.equal(m.fighters[0].rider.state, 'mounted');
});

test('지팡이는 손 목표를 따라온다', async () => {
  const m = await duo();
  run(m, 0.5);
  const st = staffTarget(m, m.fighters[0]);
  assert.ok(len(sub(m.fighters[0].staff.body.translation(), st.C)) < 0.12);
});

test('손을 빠르게 쓸면 지팡이 끝이 8 m/s를 넘는다', async () => {
  const m = await duo();
  run(m, 0.4, () => ({ 0: input({ swing: true, hand: [1, 0.3] }) }));
  let max = 0;
  run(m, 0.3, (mm, s) => { max = Math.max(max, mm.fighters[0].staff.tipSpeed); return { 0: input({ swing: true, hand: [Math.max(-1, 1 - s / 9 * 2), 0.3] }) }; });
  assert.ok(max > 8, 'tip ' + max);
});
