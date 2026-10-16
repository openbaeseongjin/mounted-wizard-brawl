// AI: 전직 시험용 성격과 원소 마법 쓰기 (설계 6장)
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, run, input } from './helpers.mjs';

const solo = (persona, spawn) => makeMatch({ roster: [{ char: 'maji', isPlayer: true }, { char: 'dummy', persona }], spawns: [{ x: 0, z: 0, heading: 0 }, spawn] });
const dist = (m) => { const a = m.fighters[0].rider.body.translation(), b = m.fighters[1].rider.body.translation(); return Math.hypot(a.x - b.x, a.z - b.z); };

test('시험용 성격: rush 다가온다 / flee 멀어진다 / swarm 붙는다 / circle 반경 18m 근처를 돈다, 공격은 안 한다', async () => {
  const r = await solo('rush', { x: 0, z: 30, heading: Math.PI });
  let closest = 99; for (let k = 0; k < 24; k++) { run(r, 0.25); closest = Math.min(closest, dist(r)); }   // 짐말은 느리다 (최고 9m/s)
  assert.ok(closest < 5, 'rush ' + closest);
  const f = await solo('flee', { x: 0, z: 8, heading: 0 }); run(f, 4); assert.ok(dist(f) > 20, 'flee ' + dist(f));
  const s = await solo('swarm', { x: 8, z: 0, heading: 0 }); run(s, 4); assert.ok(dist(s) < 4, 'swarm ' + dist(s));   // 시험에서는 말 속도를 올려 준다(trials.js)
  const c = await solo('circle', { x: 18, z: 0, heading: 0 }); run(c, 8);
  const p = c.fighters[1].rider.body.translation(); assert.ok(Math.abs(Math.hypot(p.x, p.z) - 18) < 6, 'circle r ' + Math.hypot(p.x, p.z));
  for (const m of [r, f, s, c]) assert.equal(m.fighters[1].stats.casts + m.fighters[1].stats.swings, 0);
});

test('원소 AI 4인 난투 60초: 각자 자기 마법을 한 번 이상 쓴다', async () => {
  const m = await makeMatch({ seed: 3, mode: 'brawl', roster: ['mukjik', 'beongae', 'gihoe', 'boss1'].map((c) => ({ char: c })) });
  run(m, 60);
  const used = (i, id) => (m.fighters[i].stats.spells[id] || 0) > 0;
  const tally = m.fighters.map((f) => JSON.stringify(f.stats.spells)).join(' ');
  assert.ok(used(1, 'fireball'), 'beongae fireball ' + tally);
  assert.ok(used(0, 'gust') || m.fighters[0].out, 'mukjik gust ' + tally);
  assert.ok(used(2, 'whip') || m.fighters[2].out, 'gihoe whip ' + tally);
  assert.ok(used(3, 'wall') || used(3, 'fissure') || m.fighters[3].out, 'dolsoe earth ' + tally);
});
