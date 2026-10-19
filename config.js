// 「마상 마법 난투」 데모 · 튜닝 값 한곳 모음 (설계: superpowers/specs/2026-10-15-mounted-wizard-demo-design.md)
export const TICK = 1 / 60;

export const CFG = {
  gravity: -9.81,
  arena: { r0: 42, rMin: 16, shrinkStart: 20, shrinkEnd: 90, timeLimit: 150, fenceSegs: 40, fenceH: 0.75, fenceThick: 0.18 },
  horse: {
    barrel: [0.42, 0.42, 1.0], legs: [0.3, 0.43, 0.78], legsY: -0.85, head: [0.16, 0.28, 0.3], headPos: [0, 0.5, 1.12],
    spawnY: 1.3, saddle: [0, 0.47, -0.12],
    grip: 8,              // 옆미끄럼을 초당 얼마나 지우나
    reverse: -2.5, brake: 2.2,   // S는 가속의 몇 배로 줄이나
    staggerT: 0.4, staggerJ: 160, // 이만큼 이상의 충격을 받으면 0.4초 비틀거림
    panicT: 6, panicSpeed: 12.5,
  },
  rider: {
    mass: 70, torso: [0.2, 0.22], torsoY: 0.4, headR: 0.16, headY: 0.98, legs: [0.28, 0.13], legsY: -0.45,
    shoulder: [-0.2, 0.66, 0.06],   // 오른쪽 어깨(몸 로컬: 오른쪽 = -x)
    upKp: 900, upKd: 58, upTauMax: 620, duckMul: 2.0, leanPerSpeed: 0.008, duckLean: 0.7,
    yawKp: 260, yawKd: 30, bodyYawMax: 1.6,
    tiltUnhorse: 55 * Math.PI / 180, tiltTime: 0.12,
    footKp: 1100, footKd: 70, footTauMax: 700, standK: 260, standC: 26, standY: 0.92,
    walk: 2.6, run: 5.2, footAccel: 18,
    flyMin: 1.6, flyMax: 3.6, getupT: 1.0,
    mountDist: 2.4, mountSpeed: 3.0, mountT: 0.6,
  },
  staff: { kp: 520, kd: 46, fMax: 760, rKp: 380, rKd: 34, tauMax: 220, rope: 0.78, reaction: 0.3, gripFrac: 0.25, radius: 0.045 },
  melee: { minSpeed: 4, k: 2.2, headDmg: 3.0, torsoDmg: 1.4, legsDmg: 0.8, horseFear: 3, cooldown: 0.3, maxJ: 260, tipFrac: 0.8, tipMul: 1.25, thrustMul: 1.6, forceThreshold: 260 },
  // v0.2 하프소드식 추가
  stamina: { swing: 14, thrust: 22, grab: 7, grabStrain: 3, run: 6, kick: 12, cast: 14, throw: 10, regen: 16, regenDelay: 0.5, minStrength: 0.45 },
  horseStam: { gallop: 8, regenCruise: 4, regenSlow: 10, recover: 40 },
  foot: { knockJ: 85, staggerJ: 30, staggerT: 0.35 },
  kick: { range: 1.45, J: 115, dmg: 6, cd: 0.8, horseFear: 30 },
  grab: { reach: 1.25, horseReach: 1.8, maxT: 3.0, mountedMaxT: 2.0, minStam: 10, k: 2600, c: 140, fMax: 2400, reaction: 0.25 },
  disarm: { base: 28, perStam: 14, perMass: 4 },
  throw: { boost: 1.25, lift: 2.5, grace: 0.35, hitMin: 6, flight: 2.0 },
  pickup: { foot: 1.8, mounted: 2.4, mountedSpeed: 5 },
  ragdoll: { damping: 2.0 },
  trample: { minSpeed: 5, k: 7, dmg: 3.5 },
  spell: {
    chargeRate: 0.6, fMax: 0.75, speed: 38, gravity: 2, life: 2.5, eRef: 62000,
    r0: 0.14, rK: 0.3, blastR0: 1.3, blastRK: 2.2, jK: 1.0, dmgK: 0.22, headMul: 1.3,
    fearBlast: 32, fearRange: 2.5, castFear: 25, recoil: 28,
    deflectSpeed: 6, deflectBoost: 1.1, blockMul: 0.5, minF: 0.05,
  },
  fear: { decay: 5, gallop: 4, hitRider: 10, buck: 80, buckEvery: 0.9, buckJ: 26, speedCut: 0.4, fence: 4 },
  mind: { max: 100, regen: 0.5, regenDelay: 4, dizzy: 35, fallMin: 4, fallDmg: 3.5 },
};

// 말: mass kg, cruise 최고 속도(Shift 없이), gallop(Shift), accel m/s², turn rad/s(저속), fearGain
export const HORSES = {
  gojip: { name: '고집이', mass: 480, cruise: 11, gallop: 15, accel: 4.6, turn: 2.0, fearGain: 1.3, coat: 0xbdb7ae, mane: 0xeeeae2, size: 1.0 },
  bigred: { name: '큰 밤색 말', mass: 620, cruise: 10, gallop: 13.5, accel: 3.6, turn: 1.45, fearGain: 0.7, coat: 0x7a3b22, mane: 0x2b160c, size: 1.15 },
  pony: { name: '조랑말', mass: 330, cruise: 12, gallop: 16.5, accel: 6.4, turn: 2.8, fearGain: 1.6, coat: 0xd9a34a, mane: 0xfff1c9, size: 0.85 },
  black: { name: '검은 말', mass: 470, cruise: 11.5, gallop: 15.5, accel: 5.0, turn: 2.2, fearGain: 0.9, coat: 0x26232a, mane: 0x0c0b0e, size: 1.0 },
  nag: { name: '짐말', mass: 450, cruise: 7, gallop: 9, accel: 3.0, turn: 1.2, fearGain: 0.5, coat: 0x9a8a6a, mane: 0x5a4a32, size: 0.95 },
  bay: { name: '갈색 말', mass: 480, cruise: 11, gallop: 15, accel: 5.0, turn: 2.1, fearGain: 1.0, coat: 0x5b3a26, mane: 0x1a120c, size: 1.0 },
};

// 장비: tier = 건틀릿 포인트 배율용 등급, price = 금화
export const ITEMS = {
  stick: { slot: 'staff', name: '나무 막대기', tier: 0, price: 0, mass: 1.2, len: 1.4, spellMul: 1.0, color: 0x8a6a44, tip: 0x9fe8ff },
  oak: { slot: 'staff', name: '참나무 지팡이', tier: 1, price: 60, mass: 1.8, len: 1.6, spellMul: 1.0, color: 0x6b4a2a, tip: 0xa8f0ff },
  iron: { slot: 'staff', name: '쇠 지팡이', tier: 2, price: 140, mass: 3.5, len: 1.5, spellMul: 0.9, color: 0x6f7681, tip: 0xffb37a },
  crystal: { slot: 'staff', name: '수정 지팡이', tier: 2, price: 150, mass: 1.6, len: 1.6, spellMul: 1.3, color: 0xd9d2f0, tip: 0xd58bff },
  lance: { slot: 'staff', name: '마상창 지팡이', tier: 2, price: 130, mass: 2.4, len: 2.2, spellMul: 0.9, thrustMul: 1.5, color: 0xb88a4a, tip: 0xfff0a0 },
  mace: { slot: 'staff', name: '철퇴 지팡이', tier: 2, price: 120, mass: 3.0, len: 1.35, spellMul: 0.85, tipMul: 1.45, color: 0x5a4a3a, tip: 0xff9a6a },
  fist: { slot: 'fist', name: '주먹', tier: 0, price: 0, mass: 0.8, len: 0.14, radius: 0.07, spellMul: 0 },
  oldcone: { slot: 'hat', name: '낡은 고깔', tier: 0, price: 0, headMul: 1.0 },
  felt: { slot: 'hat', name: '펠트 고깔', tier: 1, price: 50, headMul: 0.85 },
  brass: { slot: 'hat', name: '놋쇠 투구모자', tier: 2, price: 120, headMul: 0.6 },
  rags: { slot: 'robe', name: '누더기', tier: 0, price: 0, torsoMul: 1.0, balance: 1.0 },
  quilted: { slot: 'robe', name: '누빈 로브', tier: 1, price: 70, torsoMul: 0.8, balance: 1.1 },
  nogear: { slot: 'gear', name: '마구 없음', tier: 0, price: 0 },
  saddle: { slot: 'gear', name: '좋은 안장', tier: 1, price: 80, balance: 1.4, speedMul: 0.92 },
  spurs: { slot: 'gear', name: '박차', tier: 1, price: 60, accelMul: 1.3, fearMul: 1.3 },
};
export const STARTER = { staff: 'stick', hat: 'oldcone', robe: 'rags', gear: 'nogear' };

// 기수(사람 + 기본 말 + 기본 장비 + 성격)
export const CHARS = {
  maji: { name: '마지', color: 0x3d7bff, css: '#3d7bff', horse: 'gojip', mass: 66, balance: 1.0, persona: 'player', loadout: STARTER, robe: 0x3d6fe0, hatColor: 0x2a3f8f, skin: 0xf2c9a0, hair: 0x6b3b1e, job: null, jobTier: 0 },
  dummy: { name: '허수아비 마법사', color: 0xd9c27a, css: '#d9c27a', horse: 'nag', mass: 60, balance: 0.8, persona: 'dummy', loadout: STARTER, robe: 0xcdb46a, hatColor: 0x8a7440, skin: 0xe6d08a, hair: 0xe0c060, job: null, jobTier: 0 },
  mukjik: { name: '묵직이', color: 0xe8483b, css: '#e8483b', horse: 'bigred', mass: 95, balance: 1.3, persona: 'heavy', loadout: { staff: 'iron', hat: 'oldcone', robe: 'rags', gear: 'nogear' }, robe: 0xd63a2f, hatColor: 0x7d1c16, skin: 0xe8b48a, hair: 0x3a2414, job: 'wind', jobTier: 1 },
  boss1: { name: '마구간 대장 돌쇠', color: 0xb08850, css: '#b08850', horse: 'bigred', mass: 100, balance: 1.5, persona: 'heavy', loadout: { staff: 'mace', hat: 'brass', robe: 'quilted', gear: 'saddle' }, robe: 0x8a5a30, hatColor: 0x4a3018, skin: 0xe8b48a, hair: 0x9a948c, boss: true, job: 'earth', jobTier: 2 },
  beongae: { name: '번개', color: 0xf2c230, css: '#f2c230', horse: 'pony', mass: 58, balance: 0.85, persona: 'quick', loadout: { staff: 'oak', hat: 'felt', robe: 'rags', gear: 'spurs' }, robe: 0xf0b820, hatColor: 0x9c6b00, skin: 0xf5d0a8, hair: 0xd8892c, job: 'fire', jobTier: 1 },
  gihoe: { name: '기회주의자', color: 0x3cbf6a, css: '#3cbf6a', horse: 'black', mass: 68, balance: 1.0, persona: 'sneaky', loadout: { staff: 'crystal', hat: 'oldcone', robe: 'quilted', gear: 'nogear' }, robe: 0x2f9e57, hatColor: 0x1d4d2e, skin: 0xd9a87e, hair: 0x1a1a1a, job: 'water', jobTier: 1 },
  rival: { name: '라이벌 세린', color: 0xa060f0, css: '#a060f0', horse: 'bay', mass: 66, balance: 1.15, persona: 'rival', loadout: { staff: 'lance', hat: 'felt', robe: 'quilted', gear: 'saddle' }, robe: 0x8a4fe0, hatColor: 0x4a2380, skin: 0xf0c8a0, hair: 0xe8e0f0, boss: true, job: 'mimic', jobTier: 0 },
};

// AI 성격 값
// thrust: 찌르기 돌진을 하는가 · grab/throw/kick/parry: 기회가 오면 할 확률
export const PERSONAS = {
  dummy: { chargeGoal: 0.25, castEvery: 6, cone: 0.35, deflect: 0, swing: 0.2, gallop: false, passOffset: 3.0, react: 0.6, thrust: false, grab: 0, throw: 0, kick: 0.1, parry: 0 },
  heavy: { chargeGoal: 0.5, castEvery: 0, cone: 0.22, deflect: 0.2, swing: 0.7, gallop: true, passOffset: 1.4, react: 0.5, thrust: true, grab: 0.15, throw: 0, kick: 0.5, parry: 0.2 },
  quick: { chargeGoal: 0.2, castEvery: 0, cone: 0.4, deflect: 0.45, swing: 0.6, gallop: false, passOffset: 3.2, react: 0.3, orbit: 14, thrust: false, grab: 0, throw: 0.25, kick: 0.3, parry: 0.4 },
  sneaky: { chargeGoal: 0.45, castEvery: 0, cone: 0.3, deflect: 0.35, swing: 0.8, gallop: true, passOffset: 2.2, react: 0.35, thrust: false, grab: 0.5, throw: 0.05, kick: 0.4, parry: 0.35 },
  rival: { chargeGoal: 0.45, castEvery: 0, cone: 0.3, deflect: 0.5, swing: 0.85, gallop: true, passOffset: 2.0, react: 0.3, thrust: true, grab: 0.35, throw: 0.1, kick: 0.4, parry: 0.5 },
  still: { chargeGoal: 0, castEvery: 0, cone: 0, deflect: 0, swing: 0, gallop: false, passOffset: 0, react: 0.5, thrust: false, grab: 0, throw: 0, kick: 0, parry: 0, still: true },
  // 전직 시험용: 공격 없이 움직이기만 (circle 돌기 · rush 정면 질주 · swarm 옆에 붙기 · flee 달아나기)
  circle: { mode: 'circle', r: 18, r2: 0, speed: 0.75, chargeGoal: 0, castEvery: 0, cone: 0, deflect: 0, swing: 0, gallop: false, passOffset: 0, react: 0.5, thrust: false, grab: 0, throw: 0, kick: 0, parry: 0 },
  rush: { mode: 'rush', chargeGoal: 0, castEvery: 0, cone: 0, deflect: 0, swing: 0, gallop: true, passOffset: 0, react: 0.5, thrust: false, grab: 0, throw: 0, kick: 0, parry: 0 },
  swarm: { mode: 'swarm', chargeGoal: 0, castEvery: 0, cone: 0, deflect: 0, swing: 0, gallop: true, passOffset: 0, react: 0.5, thrust: false, grab: 0, throw: 0, kick: 0, parry: 0 },
  flee: { mode: 'flee', chargeGoal: 0, castEvery: 0, cone: 0, deflect: 0, swing: 0, gallop: true, passOffset: 0, react: 0.5, thrust: false, grab: 0, throw: 0, kick: 0, parry: 0 },
};

// 건틀릿 사다리 (데모: 랭크 2단계). venue = 배경 장소 (venues.js: stable 마구간 마당 · spring 봄 시합장 · rain 비 온 뒤 · castle 성 앞 결승)
export const LADDER = [
  {
    name: '마구간 견습', unlock: 200,
    fights: [
      { id: 'f1', venue: 'stable', title: '첫 시합: 허수아비 마법사', mode: 'duel', opp: ['dummy'], base: 100, seed: 11, tutorial: true,
        line: ['마지', '허수아비라도 시합은 시합이야. 고집아, 천천히 가자.'] },
      { id: 'f2', venue: 'stable', title: '3인 난투', mode: 'brawl', opp: ['mukjik', 'beongae'], base: 150, seed: 21,
        line: ['마지', '둘이 싸우게 두고… 느려진 쪽을 노리자.'] },
    ],
    boss: { id: 'b1', venue: 'stable', title: '랭크 결정전: 마구간 대장 돌쇠', mode: 'duel', opp: ['boss1'], base: 200, seed: 31,
      line: ['돌쇠', '견습 주제에 내 마구간을 넘봐? 땅이 너를 막을 거다.'] },
  },
  {
    name: '시골 기수', unlock: 450,
    fights: [
      { id: 'f3', venue: 'spring', title: '4인 난투: 봄 시합장', mode: 'brawl', opp: ['mukjik', 'beongae', 'gihoe'], base: 200, seed: 41,
        line: ['마지', '셋이 다 나만 보면 어쩌지… 아니, 서로 싸우겠지.'] },
      { id: 'f4', venue: 'rain', title: '4인 난투: 비 온 뒤', mode: 'brawl', opp: ['gihoe', 'beongae', 'mukjik'], base: 200, seed: 51,
        oppLoadout: { beongae: { staff: 'crystal', hat: 'felt', robe: 'quilted', gear: 'spurs' } },
        oppJob: { beongae: ['fire', 2] },
        line: ['고집이', '(푸르르… 오늘은 땅이 무르다)'] },
    ],
    boss: { id: 'b2', venue: 'castle', title: '결승: 라이벌 세린', mode: 'duel', opp: ['rival'], base: 250, seed: 61, final: true,
      line: ['세린', '네가 쏘는 버릇, 다 봤어. 그대로 돌려줄게.'] },
  },
];
export const RANK_NAMES = ['마구간 견습', '시골 기수', '봄 시합 챔피언'];

// ---------- 4원소 전직 (설계: superpowers/specs/2026-10-16-mw-job-advancement-design.md) ----------
export const JOB_ORDER = ['fire', 'water', 'wind', 'earth'];
export const JOBS = {
  fire: { name: '불 마법사', short: '불', icon: '🔥', color: 0xff7a50, css: '#ff7a50', spells: ['fireball', 'firetrail'], bonus: { spellMul: 1.15 }, bonusTxt: '✨ 마법 +15%', beats: 'wind', range: '8~20m', role: '말을 겁준다' },
  water: { name: '물 마법사', short: '물', icon: '💧', color: 0x4aa8ff, css: '#4aa8ff', spells: ['whip', 'ice'], bonus: { speedMul: 1.05 }, bonusTxt: '🔋 마력통 +10%', beats: 'fire', range: '8~14m', role: '당기고 미끄러뜨린다' },
  wind: { name: '바람 마법사', short: '바람', icon: '💨', color: 0x7fd8b0, css: '#7fd8b0', spells: ['gust', 'tornado'], bonus: { hitMul: 1.2 }, bonusTxt: '⚔ 타격 +20%', beats: 'earth', range: '3~5m', role: '밀고 빨아들인다' },
  earth: { name: '땅 마법사', short: '땅', icon: '🪨', color: 0xb08850, css: '#b08850', spells: ['wall', 'fissure'], bonus: { balance: 1.15 }, bonusTxt: '🛡 버티기 +15%', beats: 'water', range: '8~16m', role: '막고 넘어뜨린다' },
};
// press: charge(모았다 떼기) | hold(누르고 있는 동안)
export const SPELLS = {
  orb: { name: '마력탄', icon: '🔵', press: 'charge' },
  fireball: { name: '화염구', icon: '🔥', press: 'charge', speedMul: 0.8, blastMul: 1.3, fearMul: 2, burnR0: 2, burnR1: 3, burnT: 2.5, burnFear: 40 },
  firetrail: { name: '불길', icon: '🔥', press: 'hold', costPerS: 0.12, every: 0.1, life: 3, r: 0.7, fearK: 60, vRef: 13 },
  whip: { name: '물채찍', icon: '💧', press: 'hold', range: 14, aimTol: 0.06, cost: 0.20, costPerS: 0.10, maxT: 2.5, pullK: 600, fMax: 2400, slowShare: 0.3 },   // 끄는 힘 = pullK × 속도 차이(N), 느린 쪽이 다 받고 빠른 쪽은 slowShare
  ice: { name: '빙판', icon: '🧊', press: 'charge', minF: 0.25, near: 8, far: 16, r0: 3, r1: 6, life: 6, grip: 0.15, slipV: 9, slipTurn: 0.6, slipFear: 40 },
  gust: { name: '돌풍', icon: '💨', press: 'charge', minF: 0.5, r0: 3, r1: 5, jK: 1.6, knockJ: 70, horseK: 0.6, up: 0.35 },   // knockJ: 탄 기수가 이만큼 넘는 충격을 받으면 떨어진다 (말과 묶여 있어 밀기만으로는 안 떨어진다)
  tornado: { name: '회오리', icon: '🌪️', press: 'charge', minF: 0.4, life: 3, vMin: 4, vMax: 14, rPull: 5, rCore: 1.2, pullK: 0.9, liftK: 1.4, fireFear: 30 },
  wall: { name: '흙벽', icon: '🧱', press: 'charge', minF: 0.25, near: 8, far: 14, w: 4, thick: 0.6, h0: 1.0, h1: 2.2, rise: 0.25, life: 6, sink: 0.4, crashV: 5 },
  fissure: { name: '땅가르기', icon: '⛰️', press: 'charge', minF: 0.15, maxF: 0.6, len0: 6, len1: 16, speed: 25, w: 1.5, fearK: 100, vRef: 13, tripV: 9 },
};
export function slotsFor(job, tier) {
  if (!job || !JOBS[job] || !(tier > 0)) return { main: 'orb', big: null };
  const [a, b] = JOBS[job].spells;
  return { main: a, big: tier >= 2 ? b : null };
}
