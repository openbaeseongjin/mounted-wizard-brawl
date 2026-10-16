// 원소 이펙트가 쓰는 시뮬 이벤트: 프레임에 같이 담아 두면 다시 보기가 순간 효과를 다시 낸다 (import 없음, Node 시험 가능)
export const VFX_EVENTS = ['cast', 'explode', 'gust', 'wallUp', 'wallDown', 'wallCrash', 'whip', 'whipMiss', 'whipCut', 'iceUp', 'slip', 'tornado', 'fireTornado', 'swallow', 'fissure', 'trip', 'trail', 'zoneFear', 'steam', 'iceBreak'];
export const VFX_IGNORE = ['tornadoEnd'];   // 그림 없이 지나가는 이벤트 (회오리는 프레임에서 사라지면 끝)
const FIRE_ONLY = new Set(['cast', 'explode']);   // 구슬(견습 마력탄)의 시전·폭발은 fx.js가 그린다
const pt = (p) => ({ x: p.x, y: p.y || 0, z: p.z });

// 시뮬 객체를 붙잡지 않게 얕게 복사한다. 원소 이벤트가 없으면 null
export function pickVfxEvents(evs) {
  let out = null;
  for (const e of evs) {
    if (!VFX_EVENTS.includes(e.type) || (FIRE_ONLY.has(e.type) && e.kind !== 'fireball')) continue;
    const c = { ...e };
    if (e.pos) c.pos = pt(e.pos);
    if (e.dir) c.dir = pt(e.dir);
    if (e.hits) c.hits = e.hits.map((h) => ({ i: h.i }));
    (out || (out = [])).push(c);
  }
  return out;
}
