// 전직 시험 (설계 7장)
import test from 'node:test';
import assert from 'node:assert/strict';
import { TRIALS, trialFor, makeJudge, trialMatchOpts } from '../trials.js';
import { newCareer } from '../gauntlet.js';
import { makeMatch, run, input } from './helpers.mjs';

const fakeM = (t, out = false) => ({ t, fighters: [{ isPlayer: true, out }, { isPlayer: false }, { isPlayer: false }, { isPlayer: false }] });

test('시험 8개, 원소·단계마다 하나', () => {
  assert.equal(Object.keys(TRIALS).length, 8);
  for (const job of ['fire', 'water', 'wind', 'earth']) for (const tier of [1, 2]) assert.ok(trialFor(job, tier), job + tier);
});

test('판정: wind1은 돌풍 한 번 뒤 1.5초 안 낙마 둘 (쉬운 조건이면 하나)', () => {
  const j = makeJudge(TRIALS.wind1, false);
  assert.equal(j(fakeM(1), [{ type: 'gust', i: 0, t: 1 }]), null);
  assert.equal(j(fakeM(1.5), [{ type: 'unhorse', i: 1, by: 0, spell: 'gust', t: 1.5 }]), null);
  assert.equal(j(fakeM(3), [{ type: 'unhorse', i: 2, by: 0, spell: 'gust', t: 3 }]), null);   // 1.5초 지남
  assert.equal(j(fakeM(4), [{ type: 'gust', i: 0, t: 4 }, { type: 'unhorse', i: 1, by: 0, spell: 'gust', t: 4.2 }, { type: 'unhorse', i: 3, by: 0, spell: 'gust', t: 4.4 }]), 'pass');
  const e = makeJudge(TRIALS.wind1, true);
  assert.equal(e(fakeM(1), [{ type: 'gust', i: 0, t: 1 }, { type: 'unhorse', i: 2, by: 0, spell: 'gust', t: 1.2 }]), 'pass');
});

test('판정: 시간이 다 되거나 플레이어가 기절하면 실패, 다른 원인 낙마는 안 센다', () => {
  const j = makeJudge(TRIALS.fire1, false);
  assert.equal(j(fakeM(5), [{ type: 'unhorse', i: 1, by: 0, spell: 'orb', t: 5 }]), null);
  assert.equal(j(fakeM(41), []), 'fail');
  assert.equal(makeJudge(TRIALS.fire1, false)(fakeM(5, true), []), 'fail');
});

test('시험 판: 돌풍으로 나란히 달리던 허수아비 둘을 떨어뜨리면 pass로 끝난다', async () => {
  const o = trialMatchOpts(TRIALS.wind1, newCareer(), 0);
  o.spawns = [{ x: 0, z: -30, heading: 0 }, { x: 2.2, z: -30, heading: 0 }, { x: -2.2, z: -30, heading: 0 }, { x: 0, z: 25, heading: Math.PI }];
  o.roster = o.roster.map((s, k) => (k ? { char: 'rival', isPlayer: true } : s));   // 같이 달리게 입력을 직접 준다 (같은 말, 속도 보정 없음)
  o.countdown = 0;
  const m = await makeMatch(o);
  const all = (extra) => ({ 0: input({ move: [0, 1], ...extra }), 1: input({ move: [0, 1] }), 2: input({ move: [0, 1] }) });
  run(m, 2.5, () => all({}));
  run(m, 1.3, () => all({ charge: true }));
  run(m, 2, () => all({}));
  assert.ok(m.over, 'over'); assert.equal(m.result.reason, 'pass'); assert.ok(m.result.playerWon);
});

test('쉬운 조건: 세 번째 시도부터 (흙벽 폭 6m, 짐말 0.7배)', () => {
  const o0 = trialMatchOpts(TRIALS.earth1, newCareer(), 1), o2 = trialMatchOpts(TRIALS.earth1, newCareer(), 2);
  assert.equal(o0.roster[0].wallW, undefined); assert.equal(o2.roster[0].wallW, 6);
  assert.equal(trialMatchOpts(TRIALS.water1, newCareer(), 2).roster[1].speedMul, 0.7);
});
