// 전직 시험 8개 (설계 7장): 시합 한 판 + 통과 조건. 실패해도 잃는 것 없음, 2번 실패 뒤 힌트, 3번째부터 쉬운 조건
// 허수아비는 짐말(최고 9 m/s)이라 붙어 오거나 돌진하는 시험은 말 속도를 올려 준다(speedMul)
import { slotsFor } from './config.js';

const D = (persona, extra = {}) => ({ char: 'dummy', persona, ...extra });
const FAST = { speedMul: 1.45 };   // 짐말 질주 9 → 13 m/s
const ring = (n, r, off = 0) => Array.from({ length: n }, (_, k) => { const a = off + k * 2 * Math.PI / n; return { x: Math.sin(a) * r, z: Math.cos(a) * r, heading: a + Math.PI / 2 }; });

export const TRIALS = {
  fire1: { id: 'fire1', job: 'fire', tier: 1, title: '불붙은 과녁', goal: '화염구로 둘을 떨어뜨려라', spell: 'fireball', need: 2, easyNeed: 1, time: 40,
    hint: '말 바로 옆에 떨어뜨려라. 말은 불을 무서워한다', opp: [D('circle'), D('circle'), D('circle')], spawns: [{ x: 0, z: -30, heading: 0 }, ...ring(3, 18)] },
  fire2: { id: 'fire2', job: 'fire', tier: 2, title: '꼬리 자르기', goal: '쫓아오는 셋 중 둘을 불길로 떨어뜨려라', spell: 'firetrail', need: 2, easyNeed: 1, time: 40,
    hint: '쫓아올 때 앞으로 달리며 큰 마법을 누르고 있어라', opp: [D('rush', FAST), D('rush', FAST), D('rush', FAST)],
    spawns: [{ x: 0, z: -10, heading: 0 }, { x: -4, z: -32, heading: 0 }, { x: 0, z: -34, heading: 0 }, { x: 4, z: -32, heading: 0 }] },
  water1: { id: 'water1', job: 'water', tier: 1, title: '도망자 끌어내리기', goal: '도망가는 허수아비를 물채찍으로 끌어내려라', spell: 'whip', need: 1, easyNeed: 1, time: 40,
    hint: '나보다 느릴 때 묶어라. 묶고 나서 더 달려라', opp: [D('flee')], easyOpp: { speedMul: 0.7 }, spawns: [{ x: 0, z: -20, heading: 0 }, { x: 0, z: -6, heading: 0 }] },
  water2: { id: 'water2', job: 'water', tier: 2, title: '얼음 미끄럼', goal: '돌진해 오는 셋 중 둘을 빙판에서 넘어뜨려라', spell: 'ice', need: 2, easyNeed: 1, time: 40,
    hint: '달려오는 길 앞 10m쯤에 큰 마법으로 깔아라', opp: [D('rush', FAST), D('rush', FAST), D('rush', FAST)],
    spawns: [{ x: 0, z: -30, heading: 0 }, { x: -6, z: 30, heading: Math.PI }, { x: 0, z: 32, heading: Math.PI }, { x: 6, z: 30, heading: Math.PI }] },
  wind1: { id: 'wind1', job: 'wind', tier: 1, title: '포위 풀기', goal: '돌풍 한 번으로 둘을 떨어뜨려라', spell: 'gust', window: 1.5, need: 2, easyNeed: 1, time: 40,
    hint: '마력이 반은 차야 터진다. 셋이 3m 안에 붙으면 떼라', opp: [D('swarm', FAST), D('swarm', FAST), D('swarm', FAST)],
    spawns: [{ x: 0, z: -20, heading: 0 }, { x: -12, z: -8, heading: 0 }, { x: 12, z: -8, heading: 0 }, { x: 0, z: 10, heading: Math.PI }] },
  wind2: { id: 'wind2', job: 'wind', tier: 2, title: '회오리 사냥', goal: '회오리 한 번으로 둘을 떨어뜨려라', spell: 'tornado', window: 3, need: 2, easyNeed: 1, time: 40,
    hint: '빨리 달리다 쓰면 회오리도 빠르다', opp: [D('circle'), D('circle'), D('circle'), D('circle')], spawns: [{ x: 0, z: -34, heading: 0 }, ...ring(4, 14)] },
  earth1: { id: 'earth1', job: 'earth', tier: 1, title: '정면 돌진', goal: '돌진해 오는 묵직이를 흙벽으로 세워 날려라', spell: 'wall', need: 1, easyNeed: 1, time: 40,
    hint: '정면으로 오면 8~14m 앞에 세워라', opp: [{ char: 'mukjik', persona: 'rush', job: null, jobTier: 0 }], easyMe: { wallW: 6 },
    spawns: [{ x: 0, z: -30, heading: 0 }, { x: 0, z: 30, heading: Math.PI }] },
  earth2: { id: 'earth2', job: 'earth', tier: 2, title: '질주 경주', goal: '땅가르기 한 번으로 둘을 넘어뜨려라', spell: 'fissure', window: 2, need: 2, easyNeed: 1, time: 40,
    hint: '빨리 달려오는 말일수록 크게 넘어진다', opp: [D('rush', FAST), D('rush', FAST), D('rush', FAST), D('still')],
    spawns: [{ x: 0, z: -30, heading: 0 }, { x: -2, z: 30, heading: Math.PI }, { x: 0, z: 34, heading: Math.PI }, { x: 2, z: 30, heading: Math.PI }, { x: 10, z: -10, heading: 0 }] },
};
export const trialFor = (job, tier) => Object.values(TRIALS).find((t) => t.job === job && t.tier === tier) || null;

// 사건 → 플레이어가 쓴 마법 이름
const castOf = (e) => (e.type === 'cast' ? e.kind : e.type === 'iceUp' ? 'ice' : e.type === 'wallUp' ? 'wall' : e.type === 'trail' && e.on ? 'firetrail'
  : ['gust', 'tornado', 'fissure', 'whip'].includes(e.type) ? e.type : null);

// 판정: 그 마법으로(원인 기록) 플레이어가 떨어뜨린 수. window가 있으면 "한 번 쓰고 n초 안"만 센다
export function makeJudge(trial, easy) {
  const need = easy ? trial.easyNeed : trial.need, st = { downs: new Set(), castT: -99, burst: new Set(), progress: 0, need };
  const judge = (m, events) => {
    const pi = m.fighters.findIndex((f) => f.isPlayer);
    for (const e of events) if (e.i === pi && castOf(e) === trial.spell) { st.castT = e.t; st.burst = new Set(); }   // 같은 틱의 낙마보다 먼저 본다
    for (const e of events) {
      if (e.type !== 'unhorse' || e.i === pi || e.by !== pi || e.spell !== trial.spell) continue;
      if (trial.window) { if (e.t - st.castT <= trial.window) st.burst.add(e.i); } else st.downs.add(e.i);
    }
    st.progress = Math.max(st.progress, trial.window ? st.burst.size : st.downs.size);
    if (st.progress >= need) return 'pass';
    if (m.fighters[pi].out || m.t >= trial.time) return 'fail';
    return null;
  };
  judge.st = st;
  return judge;
}

// 시험 판 옵션: attempt = 지금까지 실패한 수 (2 이상이면 쉬운 조건)
export function trialMatchOpts(trial, career, attempt) {
  const easy = attempt >= 2;
  const me = { char: 'maji', isPlayer: true, loadout: { ...career.loadout }, job: trial.job, jobTier: trial.tier, slots: slotsFor(trial.job, trial.tier), ...(easy && trial.easyMe ? trial.easyMe : {}) };
  const roster = [me, ...trial.opp.map((o) => ({ ...o, ...(easy && trial.easyOpp ? trial.easyOpp : {}) }))];
  return { seed: 100 + Object.keys(TRIALS).indexOf(trial.id) * 13 + attempt, mode: 'trial', roster, spawns: trial.spawns, countdown: 3, time: trial.time, judge: makeJudge(trial, easy), props: false, easy };
}
