// 시합장 안 소품 (v0.5 맵 B안): 장소별 소품 목록, 나무 상자 더미·과녁. 설계 2026-10-19-mw-real-models-design.md 6장
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, run } from './helpers.mjs';
import { PROP_SETS } from '../match.js';
import { explode } from '../spells.js';

const FOUR = ['maji', 'mukjik', 'beongae', 'gihoe'];
const roster = FOUR.map((c) => ({ char: c }));
const count = (set) => set.reduce((n, p) => n + (p.stack || 1), 0);
const tilt = (b) => { const q = b.rotation(); return Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (q.x * q.x + q.z * q.z)))); };   // 위쪽 축이 수직에서 기운 각 (도는 것은 빼고)

test('venue 가 없으면 지금 소품 8개 그대로', async () => {
  const m = await makeMatch({ mode: 'brawl', roster });
  assert.equal(m.props.length, 8);
  assert.deepEqual([...new Set(m.props.map((p) => p.kind))].sort(), ['barrel', 'hay']);
});

test('장소마다 소품 목록이 있고, 봄 시합장에는 상자와 과녁이 있다', async () => {
  for (const v of ['stable', 'spring', 'rain', 'castle']) {
    const m = await makeMatch({ mode: 'brawl', roster, venue: v });
    assert.equal(m.props.length, count(PROP_SETS[v]), v);
  }
  const m = await makeMatch({ mode: 'brawl', roster, venue: 'spring' });
  const kinds = new Set(m.props.map((p) => p.kind));
  assert.ok(kinds.has('crate') && kinds.has('target'));
});

test('소품은 출발선 축을 비켜 있고 울타리 안에 있다', () => {
  for (const [v, set] of Object.entries(PROP_SETS)) for (const p of set) {
    const off = Math.min(...[0, 0.5, 1, 1.5, 2].map((a) => Math.abs(p.a - a)));
    assert.ok(off >= 0.08, `${v} ${p.kind} a=${p.a}`);
    assert.ok(p.r <= 39, `${v} ${p.kind} r=${p.r}`);
  }
});

test('가만히 두면 상자 더미·과녁은 서 있다', async () => {
  const m = await makeMatch({ mode: 'brawl', roster: [{ char: 'maji' }, { char: 'dummy', persona: 'still' }], venue: 'spring' });
  run(m, 2);
  for (const p of m.props) if (p.kind === 'target' || p.kind === 'crate') assert.ok(tilt(p.body) < 0.2, `${p.kind} 기울기 ${tilt(p.body).toFixed(2)}`);
});

test('과녁은 폭발에 넘어간다', async () => {
  const m = await makeMatch({ mode: 'brawl', roster: [{ char: 'maji' }, { char: 'dummy', persona: 'still' }], venue: 'spring' });
  run(m, 0.5);
  const t = m.props.find((p) => p.kind === 'target'), p = t.body.translation();
  explode(m, { x: p.x + 1.2, y: 1.0, z: p.z }, { kind: 'orb', E: 60000, owner: 0, id: 99 }, null);
  run(m, 2);
  assert.ok(tilt(t.body) > 0.6, `기울기 ${tilt(t.body).toFixed(2)}`);
});

test('무기 걸이: 장소마다 있고, 가만히 두면 서 있고, 폭발에 넘어간다', async () => {
  for (const v of ['stable', 'spring', 'rain', 'castle']) assert.ok(PROP_SETS[v].some((p) => p.kind === 'rack'), v);
  const m = await makeMatch({ mode: 'brawl', roster: [{ char: 'maji' }, { char: 'dummy', persona: 'still' }], venue: 'stable' });
  run(m, 1);
  const racks = m.props.filter((p) => p.kind === 'rack');
  for (const r of racks) assert.ok(tilt(r.body) < 0.2, `서 있기 ${tilt(r.body).toFixed(2)}`);
  const r = racks[0], p = r.body.translation();
  explode(m, { x: p.x * 0.96, y: 0.8, z: p.z * 0.96 }, { kind: 'orb', E: 60000, owner: 0, id: 98 }, null);   // 가운데 쪽에서 터진다
  run(m, 2);
  assert.ok(tilt(r.body) > 0.6, `기울기 ${tilt(r.body).toFixed(2)}`);
});

test('같은 시드 = 같은 소품 자리', async () => {
  const go = async () => { const m = await makeMatch({ seed: 5, mode: 'brawl', roster, venue: 'stable' }); run(m, 6); return m.props.map((p) => { const q = p.body.translation(); return [q.x.toFixed(4), q.z.toFixed(4)]; }); };
  assert.deepEqual(await go(), await go());
});
