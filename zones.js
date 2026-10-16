// 땅 위 구역: 화염구 불 자리(burn), 불길 조각(trail), 빙판(ice). 원(a = b) 또는 캡슐(선분 a–b, 반지름 r)
// 말이 들어오면 불은 겁주고(불길은 그 말의 속도에 비례), 빙판은 controlHorse가 미끄러지게 한다
// 원소 반응: 불 + 빙판 = 김(둘 다 사라짐). 설계 5.4
import { SPELLS } from './config.js';
import { clamp, fwdOf, rightOf } from './rng.js';
import { tag } from './fighter.js';

export function addZone(m, z) { const zone = { id: m.nextObjId++, t: 0, ...z }; m.zones.push(zone); return zone; }
// 점 p와 구역 z 사이의 수평 거리 − r (안이면 0 이하)
export function zoneGap(z, p) {
  const ax = z.a.x, az = z.a.z, bx = z.b.x - ax, bz = z.b.z - az, l2 = bx * bx + bz * bz;
  const u = l2 > 1e-9 ? clamp(((p.x - ax) * bx + (p.z - az) * bz) / l2, 0, 1) : 0;
  return Math.hypot(p.x - (ax + bx * u), p.z - (az + bz * u)) - z.r;
}
export const isFire = (z) => z.kind === 'burn' || z.kind === 'trail';
const mid = (z) => ({ x: (z.a.x + z.b.x) / 2, z: (z.a.z + z.b.z) / 2 });
const touches = (a, b) => [b.a, b.b, mid(b)].some((p) => zoneGap(a, p) < b.r);

export function stepZones(m, dt) {
  for (const z of m.zones) z.t += dt;
  if (m.reactions) {
    for (const ice of m.zones) {
      if (ice.kind !== 'ice' || ice.dead) continue;
      for (const fz of m.zones) {
        if (!isFire(fz) || fz.dead || !touches(ice, fz)) continue;
        ice.dead = fz.dead = true;
        const c = mid(fz); m.emit({ type: 'steam', pos: { x: c.x, y: 0.4, z: c.z } });
        break;
      }
    }
  }
  m.zones = m.zones.filter((z) => !z.dead && z.t < z.life);
  for (const h of m.horses) {
    h.onIce = false;
    const p = h.body.translation();
    for (const z of m.zones) {
      if (zoneGap(z, p) > 0.3) continue;
      if (h.rider === z.owner || (h.rider < 0 && h.owner === z.owner)) continue;   // 내 말은 내 불을 무서워하지 않고 내 빙판에서 미끄러지지 않는다
      if (z.kind === 'ice') { h.onIce = true; h.iceBy = z.owner; continue; }
      const key = (z.kind === 'burn' ? 'zb' + z.id : 'zt' + z.owner) + '_' + h.k, last = m.cds.get(key);
      if (last !== undefined && (z.kind === 'burn' || m.t - last < 0.5)) continue;
      m.cds.set(key, m.t);
      const add = z.kind === 'burn' ? SPELLS.fireball.burnFear : SPELLS.firetrail.fearK * clamp(h.speed / SPELLS.firetrail.vRef, 0, 1.5);
      h.fear = Math.min(100, h.fear + add * h.def.fearGain);
      if (h.rider >= 0) tag(m, m.fighters[h.rider], z.owner, z.kind === 'burn' ? 'fireball' : 'firetrail');
      m.emit({ type: 'zoneFear', k: h.k, kind: z.kind, add, pos: p });
    }
  }
}
// AI: 앞 3·6m가 불이면 반대쪽으로 꺾는다 (요가 늘면 왼쪽으로 돈다)
export function avoidZones(m, h, yaw) {
  const p = h.body.translation(), fw = fwdOf(yaw), rt = rightOf(yaw);
  for (const z of m.zones) {
    if (!isFire(z) || h.rider === z.owner) continue;
    for (const ahead of [3, 6]) {
      if (zoneGap(z, { x: p.x + fw.x * ahead, z: p.z + fw.z * ahead }) > 0.8) continue;
      const c = mid(z), right = (c.x - p.x) * rt.x + (c.z - p.z) * rt.z;
      return yaw + (right > 0 ? 0.9 : -0.9);
    }
  }
  return yaw;
}
