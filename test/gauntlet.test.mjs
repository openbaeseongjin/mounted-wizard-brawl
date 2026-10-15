import test from 'node:test';
import assert from 'node:assert/strict';
import { newCareer, currentFights, applyResult, lootOptions, takeLoot, buy, equip, tierSum, rivalMimic, buildRoster } from '../gauntlet.js';
import { LADDER } from '../config.js';

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
