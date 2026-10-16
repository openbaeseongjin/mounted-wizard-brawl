// 상점·마구간의 스탯 4개 (시뮬 값에서 계산한 보이기용 정수, 마지와 고집이 기준). 설계 9장
//  ⚔ 타격 = 10 × 지팡이 무게 × 길이 × 끝 배율 × 전직   ✨ 마법 = 지팡이 마법 배율 × 100 × 전직
//  🔋 마력통 = ½ × (말 + 기수 무게) × (질주 속도)² / 1000 (kJ)   🛡 버티기 = 100 × 균형 ÷ 평균 피해 배율
import { ITEMS, HORSES, CHARS, JOBS } from './config.js';

export function statsFor(loadout, job) {
  const st = ITEMS[loadout.staff], hat = ITEMS[loadout.hat], robe = ITEMS[loadout.robe], gear = ITEMS[loadout.gear];
  const b = job && JOBS[job] ? JOBS[job].bonus : {}, horse = HORSES[CHARS.maji.horse], rider = CHARS.maji;
  const hit0 = 10 * st.mass * st.len * (st.tipMul || 1), magic0 = (st.spellMul || 0) * 100;
  const top = horse.gallop * (gear.speedMul || 1), mana0 = 0.5 * (horse.mass + rider.mass) * top * top / 1000;
  const avgDmg = ((hat.headMul || 1) + (robe.torsoMul || 1)) / 2, bal0 = rider.balance * (robe.balance || 1) * (gear.balance || 1);
  const hold0 = 100 * bal0 / avgDmg;
  const v = { hit: hit0 * (b.hitMul || 1), magic: magic0 * (b.spellMul || 1), mana: mana0 * (b.speedMul || 1) ** 2, hold: hold0 * (b.balance || 1) };
  const r = Math.round;
  return { hit: r(v.hit), magic: r(v.magic), mana: r(v.mana), hold: r(v.hold),
    bonus: { hit: r(v.hit) - r(hit0), magic: r(v.magic) - r(magic0), mana: r(v.mana) - r(mana0), hold: r(v.hold) - r(hold0) } };
}
