import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, currentFights, applyResult, lootOptions, takeLoot, buy, equip, tierSum, rivalMimic, buildRoster, jobOffer, chooseJob, passTrial, failTrial, normalizeCareer, slotsFor } from '../gauntlet.js';
import { LADDER, ITEMS, JOBS } from '../config.js';

const stats = (o = {}) => ({ unhorsed: 0, kos: 0, deflectHits: 0, hits: 0, casts: 0, chargeSum: 0, swings: 0, fearSum: 0, fearN: 0, ...o });
function result({ won, reason = won ? 'last' : 'ko', me = {}, opp = [] }) {
  return {
    reason, playerWon: won, t: 60,
    fighters: [{ i: 0, char: 'maji', isPlayer: true, loadout: {}, state: won ? 'mounted' : 'ko', out: !won, surrendered: reason === 'surrender', stats: stats(me) },
      ...opp.map((o, k) => ({ i: k + 1, char: o.char, isPlayer: false, loadout: o.loadout, state: o.state || 'ko', out: true, surrendered: false, stats: stats() }))],
  };
}

test('새 경력: 랭크 0, 기본 장비(등급 0), 금화 0, 첫 시합은 튜토리얼', () => {
  const c = newCareer();
  assert.equal(c.rank, 0); assert.equal(c.gold, 0); assert.equal(tierSum(c.loadout), 0);
  const cf = currentFights(c);
  assert.equal(cf.next.id, 'f1'); assert.ok(cf.next.tutorial); assert.equal(cf.bossOpen, false);
});

test('기본 장비로 결투 승리 = 100×1.5 + 낙마 1번 30 = 180점, 금화 90', () => {
  const c = newCareer(), f1 = LADDER[0].fights[0];
  const { career, rewards } = applyResult(c, f1, result({ won: true, me: { unhorsed: 1 }, opp: [{ char: 'dummy', loadout: { staff: 'stick', hat: 'oldcone', robe: 'rags', gear: 'nogear' } }] }));
  assert.equal(rewards.points, 180); assert.equal(rewards.gold, 90);
  assert.equal(career.points, 180); assert.equal(career.fightIdx, 1);
  assert.equal(currentFights(career).bossOpen, false);
});

test('200점이면 결정전이 열리고, 결정전 승리 → 랭크 업(점수 0부터)', () => {
  let c = newCareer();
  c = applyResult(c, LADDER[0].fights[0], result({ won: true, me: { unhorsed: 2 } })).career;   // 150+60
  assert.ok(currentFights(c).bossOpen);
  const r = applyResult(c, LADDER[0].boss, result({ won: true }));
  assert.ok(r.rewards.rankUp); assert.equal(r.career.rank, 1); assert.equal(r.career.points, 0);
  assert.equal(currentFights(r.career).rank.name, '시골 기수');
});

test('기절 패배 → 가장 비싼 착용 장비 압수, 항복 → 잃는 것 없음', () => {
  const c = newCareer(); c.gold = 500;
  assert.ok(buy(c, 'iron')); assert.ok(buy(c, 'felt'));
  equip(c, 'iron'); equip(c, 'felt');
  const ko = applyResult(c, LADDER[0].fights[1], result({ won: false }));
  assert.equal(ko.rewards.confiscated, 'iron');
  assert.equal(ko.career.loadout.staff, 'stick');
  assert.ok(!ko.career.inventory.includes('iron'));
  const sur = applyResult(c, LADDER[0].fights[1], result({ won: false, reason: 'surrender' }));
  assert.equal(sur.rewards.confiscated, null);
  assert.equal(sur.career.loadout.staff, 'iron');
});

test('전리품: 기절시킨 상대의 등급 있는 지팡이·모자 + 금화 선택지', () => {
  const r = result({ won: true, opp: [{ char: 'mukjik', loadout: { staff: 'iron', hat: 'oldcone', robe: 'rags', gear: 'nogear' } }, { char: 'beongae', state: 'mounted', loadout: { staff: 'oak', hat: 'felt' } }] });
  r.fighters[2].state = 'mounted';
  const opts = lootOptions(LADDER[0].fights[1], r);
  assert.deepEqual(opts.map((o) => o.item || 'gold'), ['iron', 'gold']);
  const c = takeLoot(newCareer(), opts[0]);
  assert.ok(c.inventory.includes('iron'));
});

test('상점: 금화가 모자라면 못 산다, 산 장비는 착용 가능', () => {
  const c = newCareer(); c.gold = 50;
  assert.equal(buy(c, 'iron'), false);
  assert.ok(buy(c, 'felt')); assert.equal(c.gold, 0);
  assert.ok(equip(c, 'felt')); assert.equal(c.loadout.hat, 'felt');
  assert.equal(equip(c, 'brass'), false);
});

test('장비가 좋을수록 포인트 배율이 낮다 (하프소드 규칙)', () => {
  const c = newCareer(); c.gold = 999;
  for (const id of ['iron', 'brass', 'quilted', 'saddle']) { buy(c, id); equip(c, id); }
  assert.equal(tierSum(c.loadout), 6);
  const r = applyResult(c, LADDER[0].fights[0], result({ won: true }));
  assert.equal(r.rewards.points, 80);   // 100 × 0.8
});

test('결승 승리 → 엔딩: 공포 평균 낮으면 한 쌍, 높으면 빚 갚은 챔피언', () => {
  const c = newCareer(); c.rank = 1;
  const calm = applyResult(c, LADDER[1].boss, result({ won: true, me: { fearSum: 600, fearN: 60 } }));
  assert.equal(calm.career.ending, 'pair'); assert.ok(calm.career.champion);
  const scared = applyResult(c, LADDER[1].boss, result({ won: true, me: { fearSum: 3000, fearN: 60 } }));
  assert.equal(scared.career.ending, 'debt');
});

test('라이벌은 플레이어의 평균 충전 비율을 따라 한다', () => {
  const c = newCareer(); c.casts = 4; c.chargeSum = 2.4; c.swings = 30; c.time = 120;
  const mm = rivalMimic(c);
  assert.ok(Math.abs(mm.chargeGoal - 0.6) < 1e-9); assert.ok(mm.swing > 0.7);
  assert.equal(buildRoster(c, LADDER[1].boss)[1].char, 'rival');
});

test('전직: 첫 승리 뒤 1차 제안 → 고르고 통과 → 랭크업 뒤 2차 제안', () => {
  let c = newCareer();
  assert.equal(jobOffer(c), 0);
  c = applyResult(c, LADDER[0].fights[0], result({ won: true })).career;
  assert.equal(jobOffer(c), 1);
  assert.ok(chooseJob(c, 'earth')); assert.ok(chooseJob(c, 'wind'));   // 통과 전에는 다시 고를 수 있다
  assert.equal(failTrial(c, { id: 'wind1' }), 1);
  assert.ok(passTrial(c, { id: 'wind1', job: 'wind', tier: 1 }));
  assert.equal(c.jobTier, 1); assert.equal(chooseJob(c, 'fire'), false);
  assert.equal(jobOffer(c), 0);
  c.rank = 1; assert.equal(jobOffer(c), 2);
  assert.ok(passTrial(c, { id: 'wind2', job: 'wind', tier: 2 })); assert.equal(jobOffer(c), 0);
});

test('압수는 전직을 건드리지 않고, 옛 저장은 견습으로 이어 간다', () => {
  const c = newCareer(); c.gold = 500; buy(c, 'iron'); equip(c, 'iron'); c.job = 'fire'; c.jobTier = 1;
  const ko = applyResult(c, LADDER[0].fights[1], result({ won: false }));
  assert.equal(ko.career.job, 'fire'); assert.equal(ko.career.jobTier, 1);
  const old = { rank: 0, points: 0, gold: 0, loadout: { staff: 'stick', hat: 'oldcone', robe: 'rags', gear: 'nogear' }, inventory: [], fightIdx: 1, wins: 1, losses: 0, log: [] };
  const n = normalizeCareer(old);
  assert.equal(n.job, null); assert.equal(n.jobTier, 0); assert.deepEqual(n.trials, {}); assert.equal(jobOffer(n), 1);
});

test('명단: 내 슬롯, AI 원소, f4 번개 2차, 세린은 내 원소', () => {
  const c = newCareer(); c.job = 'water'; c.jobTier = 2; c.rank = 1;
  const r4 = buildRoster(c, LADDER[1].fights[1]);
  assert.deepEqual(r4[0].slots, { main: 'whip', big: 'ice' });
  const bg = r4.find((x) => x.char === 'beongae'); assert.deepEqual(bg.slots, { main: 'fireball', big: 'firetrail' });
  const fin = buildRoster(c, LADDER[1].boss); assert.equal(fin[1].job, 'water'); assert.deepEqual(fin[1].slots, { main: 'whip', big: 'ice' });
  assert.deepEqual(slotsFor('fire', 1), { main: 'fireball', big: null });
});

test('깨진 저장값은 그 칸만 기본으로 되돌린다 (마구간 화면이 안 열리던 것)', () => {
  const ok = (c) => { assert.ok(c.log instanceof Array); assert.ok(Number.isFinite(c.points) && Number.isFinite(c.gold) && c.rank >= 0 && c.rank <= 2); for (const [slot, id] of Object.entries(c.loadout)) assert.equal(ITEMS[id].slot, slot); assert.ok(c.inventory.every((id) => ITEMS[id])); assert.ok(c.inventory.includes(c.loadout.staff)); assert.ok(c.job === null || JOBS[c.job]); assert.ok(c.jobTier >= 0 && c.jobTier <= 2); assert.equal(typeof c.trials, 'object'); currentFights(c); };
  for (const bad of [null, undefined, 5, 'x', [], {}, { loadout: null, inventory: 5, log: null }, { loadout: { staff: 'zzz', hat: 'stick', robe: 3, gear: undefined }, rank: 'x', points: 'abc', gold: null, fightIdx: -3, job: 'zzz', jobTier: 7, trials: [] },
    { rank: 99, points: 1e15, gold: Infinity, fightIdx: 1e12, job: 'fire', jobTier: 9 }]) ok(normalizeCareer(bad));
  const good = newCareer(); good.gold = 77; good.job = 'water'; good.jobTier = 2; good.rank = 1; good.loadout.staff = 'crystal'; good.inventory = ['stick', 'crystal'];
  const g2 = normalizeCareer(JSON.parse(JSON.stringify(good)));
  assert.equal(g2.gold, 77); assert.equal(g2.job, 'water'); assert.equal(g2.jobTier, 2); assert.equal(g2.rank, 1); assert.equal(g2.loadout.staff, 'crystal');
});
