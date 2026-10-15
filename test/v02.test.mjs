// v0.2 하프소드식 추가 기능 시험: 무장 해제·던지기·줍기·찌르기·잡기·발차기·기운·말의 숨·래그돌·연습장
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, run, input, speedOf } from './helpers.mjs';
import { knockOut, knockDown, footImpact } from '../fighter.js';

const duo = (spawns, extra = {}) => makeMatch({ roster: [{ char: 'maji', isPlayer: true, ...(extra.p0 || {}) }, { char: 'dummy', isPlayer: true, ...(extra.p1 || {}) }], spawns, props: false, ...extra });
// 둘 다 말에서 내려 세우기
function dismount(m, i, at) {
  const f = m.fighters[i];
  knockDown(m, f, 'test');   // 걷는 상태가 아니면 아무 일 없음
  if (f.horse >= 0) {
    const h = m.horses[f.horse];
    m.world.removeImpulseJoint(f.rider.joint, true); f.rider.joint = null; h.rider = -1; f.horse = -1;
  }
  f.rider.state = 'foot'; f.rider.t = 0;
  f.rider.body.setTranslation({ x: at.x, y: 0.95, z: at.z }, true);
  f.rider.body.setRotation({ x: 0, y: Math.sin(at.yaw / 2), z: 0, w: Math.cos(at.yaw / 2) }, true);
  f.rider.body.setLinvel({ x: 0, y: 0, z: 0 }, true); f.rider.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  f.rider.cols.legs.setCollisionGroups(f.rider.cols.torso.collisionGroups());
}

test('휘두르는 중 E: 지팡이를 던진다 → 손은 주먹, 지팡이는 날아간다', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 0, z: 30, heading: Math.PI }]);
  run(m, 0.4, () => ({ 0: input({ swing: true, hand: [1, 0.3] }) }));
  const ev = run(m, 0.25, (mm, s) => ({ 0: input({ swing: true, hand: [1 - s / 7, 0.3], mount: s === 8 }) }));
  const p = m.fighters[0];
  assert.ok(ev.some((e) => e.type === 'throw' && e.i === 0), 'throw event');
  assert.equal(p.weapon, -1);
  assert.ok(p.staff.isFist, 'fist active');
  const w = m.weapons.find((x) => !x.isFist && x.lastHolder === 0);
  assert.equal(w.holder, -1);
  assert.equal(w.thrownBy, 0);
});

test('맨손으로 걸어가서 E: 떨어진 지팡이를 줍는다 (남의 것도)', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 10, z: 20, heading: Math.PI }]);
  dismount(m, 0, { x: 0, z: 0, yaw: 0 });
  run(m, 0.3);
  const other = m.weapons.find((x) => !x.isFist && x.holder === 1);
  // 상대 지팡이를 떨어뜨려 내 앞 1m에 둔다
  const g = m.fighters[1], p = m.fighters[0];
  const { dropWeapon } = await import('../fighter.js');
  // 내 지팡이는 멀리 버리고(맨손), 내 말도 멀리 둔다 → E가 말 타기 대신 줍기가 된다
  const mine = dropWeapon(m, p, 'test');
  mine.body.setTranslation({ x: 15, y: 0.3, z: 15 }, true);
  m.horses[0].body.setTranslation({ x: -12, y: m.horses[0].body.translation().y, z: -12 }, true);
  dropWeapon(m, g, 'test');
  other.body.setTranslation({ x: 0.3, y: 0.2, z: 1.0 }, true); other.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  run(m, 0.6);
  const ev = run(m, 0.2, (mm, s) => ({ 0: input({ mount: s === 2 }) }));
  assert.ok(ev.some((e) => e.type === 'pickup' && e.i === 0 && e.w === other.id), 'picked up');
  assert.equal(m.fighters[0].weapon >= 0, true);
  assert.equal(other.holder, 0);
});

test('무거운 지팡이로 세게 부딪치면 상대 손에서 지팡이가 날아간다 (무장 해제)', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 0, z: 30, heading: Math.PI }], { p0: { loadout: { staff: 'mace' } } });
  dismount(m, 0, { x: 0, z: 0, yaw: 0 }); dismount(m, 1, { x: 0, z: 1.5, yaw: Math.PI });
  m.horses[0].body.setTranslation({ x: 10, y: 1.3, z: 0 }, true); m.horses[1].body.setTranslation({ x: 10, y: 1.3, z: 4 }, true);
  const still = () => ({ 0: input({ look: [0, 0] }), 1: input({ look: [Math.PI, 0] }) });
  run(m, 0.8, still);
  let disarm = false;
  for (let k = 0; k < 8 && !disarm; k++) {
    // 오른쪽 → 왼쪽으로 크게 쓸기 (상대 지팡이는 내 왼쪽 앞에 있다)
    const ev = run(m, 0.5, (mm, s) => ({ 0: input({ swing: true, hand: [s < 8 ? 1 : Math.max(-1, 1 - (s - 8) / 4), 0.35], look: [0, 0] }), 1: input({ look: [Math.PI, 0] }) }));
    disarm = ev.some((e) => e.type === 'disarm' && e.i === 0 && e.j === 1);
    run(m, 0.3, still);
  }
  assert.ok(disarm, 'disarmed');
  assert.equal(m.fighters[1].weapon, -1);
});

test('가벼운 막대기로 같은 동작을 해도 쇠 지팡이는 안 날아간다', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 0, z: 30, heading: Math.PI }], { p1: { loadout: { staff: 'iron' } } });
  dismount(m, 0, { x: 0, z: 0, yaw: 0 }); dismount(m, 1, { x: 0, z: 1.5, yaw: Math.PI });
  m.horses[0].body.setTranslation({ x: 10, y: 1.3, z: 0 }, true); m.horses[1].body.setTranslation({ x: 10, y: 1.3, z: 4 }, true);
  const still = () => ({ 0: input({ look: [0, 0] }), 1: input({ look: [Math.PI, 0] }) });
  run(m, 0.8, still);
  let disarm = false;
  for (let k = 0; k < 6; k++) {
    const ev = run(m, 0.5, (mm, s) => ({ 0: input({ swing: true, hand: [s < 8 ? 1 : Math.max(-1, 1 - (s - 8) / 4), 0.35], look: [0, 0] }), 1: input({ look: [Math.PI, 0] }) }));
    if (ev.some((e) => e.type === 'disarm')) disarm = true;
    run(m, 0.3, still);
  }
  assert.ok(!disarm);
  assert.ok(m.fighters[1].weapon >= 0);
});

test('지팡이가 없으면 마법을 못 쓴다 (주먹으로는 못 쏜다)', async () => {
  const m = await duo([{ x: 0, z: -30, heading: 0 }, { x: 10, z: 30, heading: Math.PI }]);
  const { dropWeapon } = await import('../fighter.js');
  run(m, 2, () => ({ 0: input({ move: [0, 1] }) }));
  dropWeapon(m, m.fighters[0], 'test');
  const ev = run(m, 1.5, () => ({ 0: input({ move: [0, 1], charge: true }) }));
  run(m, 0.1, () => ({ 0: input({ move: [0, 1], charge: false }) }));
  assert.ok(!ev.some((e) => e.type === 'cast'));
  assert.equal(m.spells.length, 0);
});

test('찌르기 자세로 달려가 끝으로 맞히면 끝·찌르기 타격이 된다', async () => {
  const m = await duo([{ x: 0, z: -34, heading: 0 }, { x: -1.6, z: 0, heading: 0 }], { p0: { loadout: { staff: 'lance' } } });
  const aim = (mm) => {
    const p = mm.fighters[0].rider.body.translation(), t = mm.fighters[1].rider.body.translation();
    const yaw = Math.atan2(t.x - p.x, t.z - p.z) - mm.horses[0].heading;
    return [Math.max(-0.6, Math.min(0.6, yaw)), Math.atan2(t.y + 0.6 - (p.y + 0.66), Math.max(1, Math.hypot(t.x - p.x, t.z - p.z)))];
  };
  const ev = run(m, 4.5, (mm) => ({ 0: input({ move: [0, 1], thrust: true, reach: 0.4, look: aim(mm) }) }));
  const hits = ev.filter((e) => e.type === 'hit' && e.i === 0 && e.j === 1);
  assert.ok(hits.length >= 1, 'hit');
  assert.ok(hits.some((h) => h.tip && h.thrust), 'tip thrust');
});

test('잡기(Q): 옆 기수를 잡고 내 말이 멀어지면 상대가 끌려 떨어진다 (낙마 공은 잡은 사람)', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: -1.55, z: 0, heading: 0 }]);
  run(m, 0.5);
  // 내 오른쪽(-x)에 있는 상대를 잡으려고 오른쪽을 본다
  const ev1 = run(m, 0.1, () => ({ 0: input({ grab: true, look: [-1.3, -0.1] }) }));
  assert.ok(ev1.some((e) => e.type === 'grab' && e.i === 0 && e.kind === 'rider'), 'grabbed');
  // 왼쪽 앞으로 박차 → 상대가 끌려온다
  const ev2 = run(m, 2.0, () => ({ 0: input({ grab: true, move: [-1, 1], look: [-1.3, -0.1] }) }));
  const un = ev2.find((e) => e.type === 'unhorse' && e.i === 1);
  assert.ok(un, 'target unhorsed');
  assert.equal(un.by, 0);
});

test('걸을 때 Space 발차기: 앞의 상대가 넘어진다', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 0, z: 30, heading: Math.PI }]);
  dismount(m, 0, { x: 0, z: 0, yaw: 0 }); dismount(m, 1, { x: 0, z: 1.05, yaw: Math.PI });
  run(m, 0.8);
  const ev = run(m, 0.2, (mm, s) => ({ 0: input({ kick: s === 1 }) }));
  assert.ok(ev.some((e) => e.type === 'kick' && e.i === 0 && e.j === 1), 'kick hit');
  assert.ok(ev.some((e) => e.type === 'knockdown' && e.i === 1), 'knocked down');
});

test('걷는 사람은 큰 충격에 넘어지고, 작은 충격엔 비틀거리기만 한다', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 0, z: 30, heading: Math.PI }]);
  dismount(m, 1, { x: 5, z: 5, yaw: 0 });
  run(m, 0.6);
  const g = m.fighters[1];
  footImpact(m, g, 40, 0);
  assert.equal(g.rider.state, 'foot'); assert.ok(g.stagger > 0);
  footImpact(m, g, 120, 0);
  assert.equal(g.rider.state, 'flying');
});

test('기운: 계속 세게 휘두르면 줄고, 쉬면 찬다. 기운이 없으면 지팡이가 느리다', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 0, z: 30, heading: Math.PI }]);
  run(m, 0.4);
  const p = m.fighters[0];
  let maxFresh = 0;
  run(m, 0.6, (mm, s) => { maxFresh = Math.max(maxFresh, p.staff.tipSpeed); return { 0: input({ swing: true, hand: [Math.sin(s * 0.5) > 0 ? 1 : -1, 0.2] }) }; });
  run(m, 3.5, (mm, s) => ({ 0: input({ swing: true, hand: [Math.sin(s * 0.5) > 0 ? 1 : -1, 0.2] }) }));
  assert.ok(p.stam < 60, 'drained ' + p.stam);
  p.stam = 0;
  let maxTired = 0;
  run(m, 0.6, (mm, s) => { maxTired = Math.max(maxTired, p.staff.tipSpeed); p.stam = 0; return { 0: input({ swing: true, hand: [Math.sin(s * 0.5) > 0 ? 1 : -1, 0.2] }) }; });
  assert.ok(maxTired < maxFresh * 0.92, `tired ${maxTired.toFixed(1)} vs fresh ${maxFresh.toFixed(1)}`);
  run(m, 4);
  assert.ok(p.stam > 45, 'recovered ' + p.stam);
});

test('말의 숨: 계속 질주하면 숨이 차서 질주를 못 한다', async () => {
  // 오른쪽으로 계속 돌면 반지름 약 20m 원 → 울타리에 안 닿는다
  const m = await duo([{ x: 12, z: 0, heading: 0 }, { x: 30, z: 20, heading: Math.PI }]);
  const ev = run(m, 17, (mm, s) => ({ 0: input({ move: [1, 1], gallop: true }) }));
  assert.ok(ev.some((e) => e.type === 'winded' && e.k === 0), 'winded');
  assert.ok(m.horses[0].winded);
  run(m, 1.5, () => ({ 0: input({ move: [1, 1], gallop: true }) }));
  assert.ok(speedOf(m, 0) <= 11.2, 'no gallop ' + speedOf(m, 0));
});

test('래그돌: 낙마하면 팔다리 8마디가 생기고, 일어나면 없어지며, 다른 기수와는 부딪히지 않는다', async () => {
  const m = await duo([{ x: 0, z: 0, heading: 0 }, { x: 0, z: 30, heading: Math.PI }]);
  run(m, 0.4);
  const p = m.fighters[0], tb = p.rider.body, t = tb.translation();
  tb.applyImpulseAtPoint({ x: 260, y: 40, z: 0 }, { x: t.x, y: t.y + 1, z: t.z }, true);
  run(m, 0.3);
  assert.equal(p.rider.state, 'flying');
  assert.equal(p.ragdoll.length, 8);
  const grp = p.ragdoll[0].col.collisionGroups();
  assert.equal(grp >>> 16, 1 << 15);
  assert.equal(grp & 0xffff, 0b11);   // 바닥·울타리하고만
  run(m, 4.5);
  assert.equal(p.ragdoll, null);
  knockOut(m, m.fighters[1], 0);
  assert.equal(m.fighters[1].ragdoll.length, 8);
});

test('연습장: 시합이 끝나지 않고, 기절한 과녁은 5초 뒤 다시 일어나며, 과녁은 공격하지 않는다', async () => {
  const m = await makeMatch({ seed: 2, mode: 'practice', roster: [{ char: 'maji', isPlayer: true }, { char: 'dummy', persona: 'still' }, { char: 'beongae', persona: 'still' }],
    looseWeapons: [{ item: 'iron', x: 3, z: -20 }, { item: 'lance', x: 4, z: -20 }] });
  const spawn = m.horses[2].body.translation();
  run(m, 2);
  const now = m.horses[2].body.translation();
  assert.ok(Math.hypot(now.x - spawn.x, now.z - spawn.z) < 1, 'still target stays put');
  knockOut(m, m.fighters[1], 0);
  const ev = run(m, 6);
  assert.ok(!m.over);
  assert.ok(ev.some((e) => e.type === 'revive' && e.i === 1));
  assert.ok(!ev.some((e) => (e.type === 'cast' || e.type === 'hit') && e.i !== 0), 'targets passive');
  assert.equal(m.weapons.filter((w) => !w.isFist && w.holder < 0).length >= 2, true);
});
