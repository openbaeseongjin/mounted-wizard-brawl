// 주문: 마력 = 운동에너지. 쏘면 그만큼 느려지고, 지팡이로 후려치면 되돌아간다
import { CFG } from './config.js';
import { v3, add, sub, scale, dot, len, norm, clamp, qRotate } from './rng.js';
import { kineticEnergy, hurt, staffTip, weaponTip, footImpact } from './fighter.js';

const Y = { x: 0, y: 1, z: 0 };

export function releaseCharge(m, f) {
  const SP = CFG.spell, frac = clamp(f.charge, 0, SP.fMax);
  const E = kineticEnergy(m, f), Es = frac * E * (f.staff.item.spellMul || 0);
  // 반동: E ∝ v² 이므로 속도는 √(1−f)
  const k = Math.sqrt(1 - frac);
  const slow = (body) => { const v = body.linvel(); body.setLinvel({ x: v.x * k, y: v.y, z: v.z * k }, true); };
  if (f.horse >= 0) {   // 말·기수·지팡이를 같이 늦춰야 기수의 운동량이 말을 다시 끌지 않는다
    const h = m.horses[f.horse];
    slow(h.body); h.cruise *= k;
    h.fear = Math.min(100, h.fear + frac * SP.castFear * h.def.fearGain);
  }
  slow(f.rider.body); slow(f.staff.body);
  const tb = f.rider.body;
  tb.applyImpulseAtPoint(scale(f.aimDir, -SP.recoil * frac * 3), add(tb.translation(), { x: 0, y: 0.9, z: 0 }), true);
  const tip = staffTip(f), start = add(tip, scale(f.aimDir, 0.25));
  const carrier = f.horse >= 0 ? m.horses[f.horse].body.linvel() : f.rider.body.linvel();
  // 수렴 조준: 눈에서 조준선으로 광선을 쏴 맞는 점(없으면 60m)을 구하고, 지팡이 끝에서 그 점으로 날린다
  // (지팡이 끝은 눈보다 낮아서 조준선과 나란히 날리면 상대 말 머리에 맞는다)
  const eye = add(tb.translation(), qRotate(tb.rotation(), { x: 0, y: CFG.rider.headY + 0.04, z: 0.06 }));
  const ray = new m.R.Ray(eye, f.aimDir);
  const hit = m.world.castRay(ray, 60, true, undefined, undefined, undefined, undefined, (col) => {
    const inf = m.info.get(col.handle);
    if (!inf) return true;
    if (inf.kind === 'limb') return false;
    if (inf.kind === 'staff') return m.weapons[inf.w].holder !== f.i;
    if (inf.kind === 'horse') return inf.k !== f.horse;
    return inf.i !== f.i;
  });
  const dist = hit ? Math.max(4, hit.timeOfImpact ?? hit.toi ?? 60) : 60;
  const aimPoint = add(eye, scale(f.aimDir, dist));
  const dir = norm(sub(aimPoint, start));
  // 달리는 속도는 조준 방향 성분만 더한다 (조준점이 옆으로 밀리지 않게, 정면 돌진은 더 빠르게)
  const vel = scale(dir, SP.speed + Math.max(0, carrier.x * dir.x + carrier.z * dir.z));
  const s = Math.sqrt(Es / SP.eRef);
  const spell = { id: m.nextSpellId++, owner: f.i, pos: start, vel, r: SP.r0 + SP.rK * s, E: Es, age: 0, deflects: 0, grace: 0, frac, lastDeflector: -1 };
  m.spells.push(spell);
  f.stats.casts++; f.stats.chargeSum += frac;
  m.emit({ type: 'cast', i: f.i, frac, E: Es, pos: spell.pos, id: spell.id });
  return spell;
}

// 충돌체 → 그 몸의 주인 (무기는 지금 쥔 사람, 떨어진 무기는 -1)
const ownerOf = (m, inf) => (inf.kind === 'staff' ? m.weapons[inf.w].holder : inf.i);

export function stepSpells(m, dt) {
  const SP = CFG.spell, R = m.R;
  const keep = [];
  for (const sp of m.spells) {
    sp.age += dt; sp.grace = Math.max(0, sp.grace - dt);
    sp.vel.y -= SP.gravity * dt;
    const shape = new R.Ball(sp.r * 0.6);   // 맞는 판정은 보이는 크기보다 작게 (큰 주문이 앞의 말 머리를 스치지 않게). 폭발 반경은 그대로
    const ownerHorse = m.fighters[sp.owner].horse;
    const hit = m.world.castShape(sp.pos, { x: 0, y: 0, z: 0, w: 1 }, sp.vel, shape, 0, dt, true, undefined, undefined, undefined, undefined,
      (col) => {
        const inf = m.info.get(col.handle);
        if (!inf) return true;
        if (inf.kind === 'limb') return false;   // 팔다리 래그돌은 보기용
        const who = ownerOf(m, inf);
        if (inf.kind !== 'horse' && who === sp.owner && who !== undefined && who >= 0) return false;
        if (inf.kind === 'horse' && inf.k === ownerHorse && sp.age < 0.3) return false;
        if (sp.grace > 0 && who === sp.lastDeflector) return false;
        return true;
      });
    if (hit) {
      const toi = hit.time_of_impact ?? hit.toi ?? 0;
      const pos = add(sp.pos, scale(sp.vel, toi));
      const inf = m.info.get(hit.collider.handle) || { kind: 'world' };
      if (inf.kind === 'staff') {
        const w = m.weapons[inf.w], gi = w.holder;
        if (gi >= 0) {
          const g = m.fighters[gi];
          if (w.tipSpeed >= SP.deflectSpeed && !g.out) { deflect(m, sp, g, w, pos); keep.push(sp); continue; }
          explode(m, pos, sp, { i: gi, kind: 'staff', part: 'block' }); continue;
        }
        explode(m, pos, sp, { kind: 'world' }); continue;
      }
      explode(m, pos, sp, inf); continue;
    }
    sp.pos = add(sp.pos, scale(sp.vel, dt));
    if (sp.age > SP.life || sp.pos.y < -1) { m.emit({ type: 'fizzle', id: sp.id, pos: sp.pos }); continue; }
    keep.push(sp);
  }
  m.spells = keep;
}

function deflect(m, sp, g, w, pos) {
  const SP = CFG.spell, sb = w.body, tip = weaponTip(w);
  const wv = sb.angvel(), c = sb.translation();
  const r = sub(tip, c), vTip = add(sb.linvel(), { x: wv.y * r.z - wv.z * r.y, y: wv.z * r.x - wv.x * r.z, z: wv.x * r.y - wv.y * r.x });
  const swing = sub(vTip, g.rider.body.linvel());
  const dir = norm(add(norm(swing), scale(g.aimDir, 0.6)));
  const speed = Math.max(SP.speed, len(sp.vel)) * SP.deflectBoost;
  sp.vel = scale(dir, speed); sp.pos = add(pos, scale(dir, 0.2));
  sp.owner = g.i; sp.lastDeflector = g.i; sp.grace = 0.12; sp.deflects++;
  m.emit({ type: 'deflect', i: g.i, id: sp.id, pos });
}

// 폭발: 반경 안 몸통에 방사형 충격량, 의식 피해, 말 공포. 소품·떨어진 무기도 날린다
export function explode(m, pos, sp, direct) {
  const SP = CFG.spell, s = Math.sqrt(sp.E / SP.eRef), R = SP.blastR0 + SP.blastRK * s;
  const J0 = SP.jK * Math.sqrt(sp.E);
  const hitList = [];
  for (const f of m.fighters) {
    const tb = f.rider.body, t = tb.translation(), q = tb.rotation();
    const top = add(t, qRotate(q, { x: 0, y: CFG.rider.headY, z: 0 }));
    const seg = sub(top, t), u = clamp(dot(sub(pos, t), seg) / dot(seg, seg), 0, 1);
    const P = add(t, scale(seg, u)), d = len(sub(P, pos));
    const isDirect = direct && direct.i === f.i && direct.kind !== 'horse';
    const reach = R + 0.3;
    if (!isDirect && d > reach) continue;
    let k = isDirect ? 1 : 1 - d / reach;
    if (direct && direct.part === 'block' && direct.i === f.i) k *= SP.blockMul;
    const J = J0 * k * (isDirect && direct.kind === 'head' ? 1.2 : 1);
    const dir = norm(add(d > 0.05 ? sub(P, pos) : sp.vel, { x: 0, y: 0.25 * len(sub(P, pos)) + 0.1, z: 0 }));
    const at = add(t, qRotate(q, { x: 0, y: 0.75, z: 0 }));
    tb.applyImpulseAtPoint(scale(dir, J), at, true);
    const part = isDirect && direct.kind === 'head' ? 'head' : 'torso';
    const dmg = J * SP.dmgK * (part === 'head' ? SP.headMul : 1);
    hurt(m, f, dmg, part, sp.owner === f.i ? -1 : sp.owner, 'spell');
    footImpact(m, f, J, sp.owner);
    if (sp.deflects > 0 && sp.owner !== f.i) m.fighters[sp.owner].stats.deflectHits++;
    hitList.push({ i: f.i, J, dmg });
  }
  for (const h of m.horses) {
    const p = h.body.translation(), d = len(sub(p, pos)), range = R * SP.fearRange;
    if (d < range) h.fear = Math.min(100, h.fear + SP.fearBlast * (1 - d / range));
    if (d < R + 1) {
      const k = 1 - d / (R + 1), J = J0 * k * 1.5;
      if (J > CFG.horse.staggerJ) h.stagger = Math.max(h.stagger, CFG.horse.staggerT);
      h.body.applyImpulse(scale(norm(sub(p, pos)), J * 0.6), true);
    }
  }
  const push = (body, mass) => {
    const p = body.translation(), d = len(sub(p, pos));
    if (d > R + 0.8) return;
    const k = 1 - d / (R + 0.8);
    body.applyImpulse(scale(norm(add(sub(p, pos), { x: 0, y: 0.6, z: 0 })), Math.min(J0 * k * 0.5, mass * 9)), true);
  };
  for (const pr of m.props) push(pr.body, pr.body.mass());
  for (const w of m.weapons) if (w.holder < 0 && !w.isFist) push(w.body, w.mass);
  m.emit({ type: 'explode', id: sp.id, owner: sp.owner, pos, r: R, E: sp.E, direct: direct ? direct.kind : 'world', hits: hitList, deflected: sp.deflects > 0 });
}
