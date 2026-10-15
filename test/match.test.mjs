import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, run, input } from './helpers.mjs';
import { fenceRadius } from '../match.js';

test('울타리: 20초까지 42, 90초에 16', () => {
  assert.equal(fenceRadius(0), 42);
  assert.equal(fenceRadius(20), 42);
  assert.ok(Math.abs(fenceRadius(55) - 29) < 0.5);
  assert.equal(fenceRadius(90), 16);
  assert.equal(fenceRadius(140), 16);
});

const FOUR = ['mukjik', 'beongae', 'gihoe', 'dummy'];
async function brawl(seed) {
  const m = await makeMatch({ seed, mode: 'brawl', roster: FOUR.map((c) => ({ char: c })) });
  let maxOut = 0;
  while (!m.over && m.tick < 160 * 60) {
    m.step();
    if (m.tick % 30 === 0) for (const h of m.horses) { const p = h.body.translation(); maxOut = Math.max(maxOut, Math.hypot(p.x, p.z) - m.fenceR); }
  }
  return { m, maxOut };
}

test('AI 4인 난투: 150초 안에 끝나고, 대부분 마지막 한 명으로 끝나며, 승자가 다양하다', async () => {
  const winners = new Set(); let last = 0, maxOut = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const r = await brawl(seed);
    assert.ok(r.m.over, 'over ' + seed);
    assert.ok(r.m.t <= 150.05);
    winners.add(r.m.result.winner);
    if (r.m.result.reason === 'last') last++;
    maxOut = Math.max(maxOut, r.maxOut);
  }
  assert.ok(last >= 3, 'ended by last-standing ' + last);
  assert.ok(winners.size >= 2, 'distinct winners ' + winners.size);
  assert.ok(maxOut < 1.5, 'horse outside fence by ' + maxOut);
});

test('결정론: 같은 시드 → 같은 해시', async () => {
  const a = await makeMatch({ seed: 7, mode: 'brawl', roster: FOUR.map((c) => ({ char: c })) });
  const b = await makeMatch({ seed: 7, mode: 'brawl', roster: FOUR.map((c) => ({ char: c })) });
  run(a, 30); run(b, 30);
  assert.equal(a.hash(), b.hash());
  const c = await makeMatch({ seed: 8, mode: 'brawl', roster: FOUR.map((c) => ({ char: c })) });
  run(c, 30);
  assert.notEqual(a.hash(), c.hash());
});

test('항복(G): 플레이어가 지고 시합이 끝난다', async () => {
  const m = await makeMatch({ seed: 3, mode: 'duel', roster: [{ char: 'maji', isPlayer: true }, { char: 'mukjik' }] });
  run(m, 2, () => ({ 0: input({ move: [0, 1] }) }));
  run(m, 0.1, () => ({ 0: input({ surrender: true }) }));
  assert.ok(m.over);
  assert.equal(m.result.reason, 'surrender');
  assert.equal(m.result.playerWon, false);
});

test('카운트다운 동안 말은 움직이지 않는다', async () => {
  const m = await makeMatch({ seed: 3, mode: 'duel', countdown: 2, roster: [{ char: 'maji', isPlayer: true }, { char: 'mukjik' }] });
  run(m, 1.9, () => ({ 0: input({ move: [0, 1] }) }));
  const v = m.horses[0].body.linvel();
  assert.ok(Math.hypot(v.x, v.z) < 0.3);
  assert.ok(!m.over);
});
