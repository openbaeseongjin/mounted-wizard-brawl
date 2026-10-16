// 건틀릿 규칙 (순수 함수, 하프소드식 랭크 사다리를 우리 컨셉으로)
// 낮은 장비로 이길수록 포인트↑ · 랭크 결정전 · 전리품 · 기절 패배 = 장비 압수 · 항복 = 잃는 것 없음
import { LADDER, ITEMS, STARTER, RANK_NAMES, JOBS, CHARS, slotsFor } from './config.js';
export { slotsFor };

export function newCareer() {
  return {
    rank: 0, points: 0, gold: 0, loadout: { ...STARTER }, inventory: Object.values(STARTER), fightIdx: 0,
    wins: 0, losses: 0, fearSum: 0, fearN: 0, chargeSum: 0, casts: 0, swings: 0, time: 0, champion: false, ending: null, log: [],
    job: null, jobTier: 0, trials: {},   // 전직: 원소, 단계(0 견습 · 1 · 2), 시험별 시도 수
  };
}
// 옛 저장(v0.3b 이전): 전직 필드를 채운다
export function normalizeCareer(c) {
  if (!c) return newCareer();
  if (c.job === undefined) c.job = null;
  if (c.jobTier === undefined) c.jobTier = 0;
  if (!c.trials) c.trials = {};
  return c;
}
// 전직 제안: 첫 승리 뒤 1차, 랭크 결정전 승리 뒤 2차
export const jobOffer = (c) => (c.jobTier === 0 && c.wins >= 1 ? 1 : c.jobTier === 1 && c.rank >= 1 ? 2 : 0);
export function chooseJob(c, job) { if (c.jobTier !== 0 || !JOBS[job]) return false; c.job = job; return true; }
export function passTrial(c, trial) { if (c.job !== trial.job || c.jobTier !== trial.tier - 1) return false; c.jobTier = trial.tier; return true; }
export function failTrial(c, trial) { c.trials[trial.id] = (c.trials[trial.id] || 0) + 1; return c.trials[trial.id]; }

export const tierSum = (loadout) => Object.values(loadout).reduce((s, id) => s + (ITEMS[id] ? ITEMS[id].tier : 0), 0);
export const tierMul = (sum) => (sum <= 1 ? 1.5 : sum <= 3 ? 1.2 : sum <= 5 ? 1.0 : 0.8);
export const rankName = (r) => RANK_NAMES[Math.min(r, RANK_NAMES.length - 1)];

export function currentFights(c) {
  const R = LADDER[Math.min(c.rank, LADDER.length - 1)];
  return { rank: R, next: R.fights[c.fightIdx % R.fights.length], boss: R.boss, bossOpen: c.points >= R.unlock, done: c.champion };
}

export function buildRoster(c, fight) {
  const me = { char: 'maji', isPlayer: true, loadout: { ...c.loadout }, job: c.job, jobTier: c.jobTier, slots: slotsFor(c.job, c.jobTier) };
  return [me, ...fight.opp.map((id) => {
    const ch = CHARS[id], ov = fight.oppJob && fight.oppJob[id];
    let job = ov ? ov[0] : ch.job || null, tier = ov ? ov[1] : ch.jobTier || 0;
    if (job === 'mimic') { job = c.job; tier = c.jobTier; }   // 세린: 내 원소를 따라 한다
    return { char: id, loadout: fight.oppLoadout && fight.oppLoadout[id], job, jobTier: tier, slots: slotsFor(job, tier) };
  })];
}

export function pointsFor(fight, result, loadout) {
  const me = result.fighters.find((f) => f.isPlayer) || result.fighters[0];
  if (!result.playerWon) return 0;
  return Math.round(fight.base * tierMul(tierSum(loadout)) + me.stats.unhorsed * 30 + me.stats.deflectHits * 50);
}

export function lootOptions(fight, result) {
  const opts = [], seen = new Set();
  if (result.playerWon) {
    for (const f of result.fighters) {
      if (f.isPlayer || f.state !== 'ko' || f.surrendered) continue;
      for (const slot of ['staff', 'hat']) {
        const id = f.loadout[slot];
        if (!id || ITEMS[id].tier === 0 || seen.has(id)) continue;
        seen.add(id); opts.push({ item: id, from: f.char });
      }
    }
  }
  opts.push({ gold: 40 });
  return opts;
}

export function applyResult(c0, fight, result) {
  const c = JSON.parse(JSON.stringify(c0));
  const me = result.fighters.find((f) => f.isPlayer) || result.fighters[0];
  const won = !!result.playerWon, surrendered = result.reason === 'surrender';
  const rw = { won, surrendered, points: 0, gold: 0, confiscated: null, loot: [], rankUp: false, ending: null };
  // 라이벌이 따라 할 습관, 엔딩용 공포 평균
  c.fearSum += me.stats.fearSum; c.fearN += me.stats.fearN;
  c.chargeSum += me.stats.chargeSum; c.casts += me.stats.casts; c.swings += me.stats.swings; c.time += Math.max(0, result.t);
  if (won) {
    rw.points = pointsFor(fight, result, c.loadout);
    rw.gold = Math.round(rw.points / 2);
    c.points += rw.points; c.gold += rw.gold; c.wins++;
    rw.loot = lootOptions(fight, result);
    const R = LADDER[c.rank];
    if (R && fight.id === R.boss.id) {
      rw.rankUp = true; c.rank++; c.points = 0; c.fightIdx = 0;
      if (fight.final) { c.champion = true; c.ending = rw.ending = avgFear(c) < 35 ? 'pair' : 'debt'; }
    } else c.fightIdx++;
  } else {
    c.losses++;
    if (!surrendered) {   // 기절로 짐: 착용한 가장 비싼 장비를 압수당한다
      let worst = null;
      for (const [slot, id] of Object.entries(c.loadout)) if (ITEMS[id].price > 0 && (!worst || ITEMS[id].price > ITEMS[worst.id].price)) worst = { slot, id };
      if (worst) {
        c.loadout[worst.slot] = STARTER[worst.slot];
        c.inventory = c.inventory.filter((x) => x !== worst.id);
        rw.confiscated = worst.id;
      }
    }
  }
  c.log.push({ id: fight.id, won, reason: result.reason, points: rw.points });
  return { career: c, rewards: rw };
}
export const avgFear = (c) => (c.fearN > 0 ? c.fearSum / c.fearN : 0);

export function takeLoot(c, opt) {
  if (opt.gold) c.gold += opt.gold;
  else if (opt.item && !c.inventory.includes(opt.item)) c.inventory.push(opt.item);
  return c;
}
export function buy(c, id) {
  const it = ITEMS[id];
  if (!it || c.inventory.includes(id) || c.gold < it.price) return false;
  c.gold -= it.price; c.inventory.push(id);
  return true;
}
export function equip(c, id) {
  if (!c.inventory.includes(id)) return false;
  c.loadout[ITEMS[id].slot] = id;
  return true;
}
export function rivalMimic(c) {
  const spm = c.time > 0 ? c.swings / (c.time / 60) : 6;
  return { chargeGoal: c.casts ? c.chargeSum / c.casts : 0.45, swing: Math.min(1, Math.max(0.3, spm / 20)) };
}
export const SHOP = ['oak', 'iron', 'crystal', 'felt', 'brass', 'quilted', 'saddle', 'spurs'];
