import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, run, input, speedOf } from './helpers.mjs';
import { hurt } from '../fighter.js';

const duo = (spawns) => makeMatch({ roster: [{ char: 'maji', isPlayer: true }, { char: 'dummy', isPlayer: true }], spawns });

test('달리며 지팡이를 옆으로 내밀면 지나가는 상대를 친다 (머리·몸통 타격, 의식 감소)', async () => {
  const m = await duo([{ x: 0, z: -30, heading: 0 }, { x: -1.75, z: 0, heading: 0 }]);
  const ev = run(m, 5, () => ({ 0: input({ move: [0, 1], swing: true, hand: [1, 0.05] }) }));
  const hits = ev.filter((e) => e.type === 'hit' && e.i === 0 && e.j === 1);
  assert.ok(hits.length >= 1, 'hits ' + hits.length);
  assert.ok(m.fighters[1].rider.conscious < 100);
});

test('큰 충격 → 날아감 → 일어나기 → 도보 (4.5초 안)', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 0, z: 30, heading: Math.PI }]);
  run(m, 0.5);
  const tb = m.fighters[0].rider.body, p = tb.translation();
  tb.applyImpulseAtPoint({ x: 260, y: 40, z: 0 }, { x: p.x, y: p.y + 1.0, z: p.z }, true);
  const ev = run(m, 4.5);
  assert.ok(ev.some((e) => e.type === 'unhorse' && e.i === 0), 'unhorse');
  assert.equal(m.fighters[0].rider.state, 'foot');
  assert.ok(Math.abs(tb.translation().y - 0.92) < 0.2, 'standing hip ' + tb.translation().y);
});

test('도보로 걸을 수 있고, 멈춘 빈 말에 E로 다시 탄다', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 0, z: 30, heading: Math.PI }]);
  run(m, 0.5);
  const tb = m.fighters[0].rider.body;
  tb.applyImpulseAtPoint({ x: 260, y: 40, z: 0 }, { ...tb.translation(), y: tb.translation().y + 1 }, true);
  run(m, 4.5);
  assert.equal(m.fighters[0].rider.state, 'foot');
  const p0 = tb.translation();
  run(m, 1.5, () => ({ 0: input({ move: [0, 1], look: [0, 0] }) }));
  assert.ok(tb.translation().z - p0.z > 2, 'walked ' + (tb.translation().z - p0.z));
  run(m, 6);   // 말 공포 질주가 끝나기를 기다린다
  const h = m.horses[0];
  assert.ok(speedOf(m, 0) < 3, 'horse calm ' + speedOf(m, 0));
  const hp = h.body.translation();
  tb.setTranslation({ x: hp.x + 1.2, y: 0.95, z: hp.z }, true); tb.setLinvel({ x: 0, y: 0, z: 0 }, true);
  run(m, 0.3);
  const ev = run(m, 1.2, (mm, s) => ({ 0: input({ mount: s < 3, look: [0, 0] }) }));
  assert.ok(ev.some((e) => e.type === 'mount' && e.i === 0), 'mounted event');
  assert.equal(m.fighters[0].rider.state, 'mounted');
  assert.equal(m.fighters[0].horse, 0);
});

test('의식이 0이면 기절 → 탈락, 플레이어면 시합이 끝난다', async () => {
  const m = await duo();
  run(m, 0.2);
  hurt(m, m.fighters[0], 500, 'head', 1, 'test');
  const ev = run(m, 0.1);
  assert.equal(m.fighters[0].rider.state, 'ko');
  assert.ok(m.fighters[0].out);
  assert.ok(m.over);
  assert.equal(m.result.playerWon, false);
  assert.ok(ev.some((e) => e.type === 'over') || m.result.reason === 'ko');
});

test('어지러울 때(의식 35 미만) 서서히 회복한다', async () => {
  const m = await duo();
  run(m, 0.2);
  hurt(m, m.fighters[0], 70, 'torso', 1, 'test');
  const c0 = m.fighters[0].rider.conscious;
  run(m, 10);   // 4초 쉰 뒤 초당 0.5
  assert.ok(m.fighters[0].rider.conscious > c0 + 2);
});
