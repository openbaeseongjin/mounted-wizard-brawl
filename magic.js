// 4원소 마법: 슬롯·누르는 법(castStep), 시전(releaseSpell), 매 틱 갱신(stepMagic)
// 설계: superpowers/specs/2026-10-16-mw-job-advancement-design.md 5장. 모든 마법은 spendKE로 말의 운동에너지를 쓴다
//  🔥 화염구(spells.js 구슬) · 불길   💧 물채찍 · 빙판   💨 돌풍 · 회오리   🪨 흙벽 · 땅가르기
import { CFG, SPELLS } from './config.js';
import { add, sub, scale, dot, len, norm, clamp, clampLen, hdist, fwdOf, yawQ } from './rng.js';
import { drain, tag, footImpact, releaseGrab, unhorse, staffTip, shoulderWorld, groups, riderBit, horseBit } from './fighter.js';
import { addZone, zoneGap } from './zones.js';
import { releaseCharge, spendKE, explode } from './spells.js';

const KEY = { main: 'charge', big: 'big' };   // 슬롯 → 입력 이름 (마법 버튼 · 큰 마법 버튼)
const fracOf = (frac, minF, maxF = CFG.spell.fMax) => clamp((frac - minF) / (maxF - minF), 0, 1);   // 모은 정도 0~1

export function castStep(m, f, dt, canCast) {
  if (!f.charging) f.chargeSlot = null;
  // 누르고 있기 마법 (물채찍·불길): 누르는 순간 시작, 누르는 동안 계속, 떼면 끝. 모으는 중에는 못 쓴다
  let holding = false;
  for (const slot of ['main', 'big']) {
    const id = f.slots[slot];
    if (!id || SPELLS[id].press !== 'hold') continue;
    const down = !!f.input[KEY[slot]] && canCast && !f.charging, was = !!f.holdOn[id];
    if (down && !was) holdStart(m, f, id);
    if (down) { holdTick(m, f, id, dt); holding = true; } else if (was) holdEnd(m, f, id);
    f.holdOn[id] = down;
  }
  if (f.charging) {
    const slot = f.chargeSlot, id = f.slots[slot], S = SPELLS[id];
    if (f.input[KEY[slot]] && canCast) f.charge = Math.min(S.maxF || CFG.spell.fMax, f.charge + CFG.spell.chargeRate * dt);
    else {
      if (canCast && f.charge >= (S.minF || CFG.spell.minF)) { drain(f, f.charge * CFG.stamina.cast); releaseSpell(m, f, id, f.charge); }
      f.charging = false; f.charge = 0; f.chargeSlot = null;
    }
  } else if (canCast && !holding) {
    for (const slot of ['main', 'big']) {
      const id = f.slots[slot];
      if (!id || SPELLS[id].press !== 'charge' || !f.input[KEY[slot]]) continue;
      f.charging = true; f.chargeSlot = slot; f.charge = Math.min(SPELLS[id].maxF || CFG.spell.fMax, CFG.spell.chargeRate * dt);
      break;
    }
  }
}

export function releaseSpell(m, f, id, frac) {
  f.stats.spells[id] = (f.stats.spells[id] || 0) + 1;
  if (id === 'orb' || id === 'fireball') return releaseCharge(m, f, id, frac);
  if (id === 'gust') return castGust(m, f, frac);
  if (id === 'wall') return castWall(m, f, frac);
  if (id === 'fissure') return castFissure(m, f, frac);
  if (id === 'tornado') return castTornado(m, f, frac);
  if (id === 'ice') return castIce(m, f, frac);
}

// ---------- 💨 돌풍: 나를 중심으로 둥근 바람. 붙은 상대를 날리고, 구슬을 튕긴다(화염구는 그 자리에서 터진다) ----------
function castGust(m, f, frac) {
  const S = SPELLS.gust, Es = spendKE(m, f, frac);
  const R = S.r0 + (S.r1 - S.r0) * fracOf(frac, S.minF), c = f.rider.body.translation(), reach = R + 0.3, J0 = S.jK * Math.sqrt(Es);
  for (const g of m.fighters) {
    if (g === f || g.rider.state === 'ko') continue;
    const tb = g.rider.body, p = tb.translation(), d = hdist(c, p);
    if (d > reach) continue;
    const k = 1 - d / reach, out = norm({ x: p.x - c.x, y: 0, z: p.z - c.z }), dir = norm(add(out, { x: 0, y: S.up, z: 0 })), J = J0 * k;
    tag(m, g, f.i, 'gust');
    if (g.horse >= 0 && J > S.knockJ) { unhorse(m, g, 'gust'); tb.applyImpulse(scale(dir, J), true); }   // 말에서 뽑혀 바깥으로 날아간다
    else tb.applyImpulseAtPoint(scale(dir, J), add(p, { x: 0, y: 0.75, z: 0 }), true);
    footImpact(m, g, J, f.i);
    if (g.grab && g.grab.kind === 'rider' && g.grab.i === f.i) releaseGrab(m, g);
    if (g.whip && g.whip.j === f.i) cutWhip(m, g, 'gust');
  }
  for (const h of m.horses) {
    if (h.k === f.horse) continue;
    const p = h.body.translation(), d = hdist(c, p), r2 = reach + 0.5;
    if (d > r2) continue;
    h.body.applyImpulse(scale(norm({ x: p.x - c.x, y: 0.1, z: p.z - c.z }), J0 * (1 - d / r2) * S.horseK), true);
    h.stagger = Math.max(h.stagger, CFG.horse.staggerT);
  }
  for (const sp of [...m.spells]) {
    if (hdist(c, sp.pos) > R + 1) continue;
    if (sp.kind === 'fireball' && m.reactions) { m.spells = m.spells.filter((x) => x !== sp); explode(m, sp.pos, sp, { kind: 'world' }); continue; }   // 바람이 불을 키운다
    const out = norm({ x: sp.pos.x - c.x, y: 0.15, z: sp.pos.z - c.z });
    sp.vel = scale(out, Math.max(CFG.spell.speed, len(sp.vel))); sp.owner = f.i; sp.lastDeflector = f.i; sp.grace = 0.12; sp.deflects++;
  }
  m.emit({ type: 'gust', i: f.i, pos: c, r: R, frac });
}

const speedOf = (m, g) => { const v = g.horse >= 0 ? m.horses[g.horse].body.linvel() : g.rider.body.linvel(); return Math.hypot(v.x, v.z); };
function holdStart(m, f, id) {
  f.stats.spells[id] = (f.stats.spells[id] || 0) + 1;
  if (id === 'whip') startWhip(m, f);
  if (id === 'firetrail') { f.trailLast = null; f.trailT = 0; m.emit({ type: 'trail', i: f.i, on: true, pos: f.rider.body.translation() }); }
}
function holdTick(m, f, id, dt) {
  if (id === 'whip') updateWhip(m, f, dt);
  if (id === 'firetrail') trailTick(m, f, dt);
}
function holdEnd(m, f, id) {
  if (id === 'whip') cutWhip(m, f, 'release');
  if (id === 'firetrail') { f.trailLast = null; m.emit({ type: 'trail', i: f.i, on: false, pos: f.rider.body.translation() }); }
}

// ---------- 💧 물채찍: 14m 안의 상대를 묶는다. 둘의 속도 차이가 끄는 힘 — 느린 쪽이 줄을 다 받는다 ----------
function startWhip(m, f) {
  const S = SPELLS.whip;
  spendKE(m, f, S.cost);
  const eye = add(f.rider.body.translation(), { x: 0, y: CFG.rider.headY, z: 0 });
  let best = null, bd = S.range;
  for (const g of m.fighters) {
    if (g === f || g.rider.state === 'ko') continue;
    const c = add(g.rider.body.translation(), { x: 0, y: 0.55, z: 0 }), rel = sub(c, eye), d = len(rel);
    if (d > bd || d < 0.5) continue;
    if (Math.acos(clamp(dot(rel, f.aimDir) / d, -1, 1)) > S.aimTol + 0.6 / d) continue;   // 가까울수록 각도를 넉넉히
    if (wallBetween(m, eye, c)) continue;
    bd = d; best = g;
  }
  if (!best) { m.emit({ type: 'whipMiss', i: f.i, pos: staffTip(f) }); return; }
  f.whip = { j: best.i, rest: Math.max(1.5, bd), t: 0, chk: 0 };
  tag(m, best, f.i, 'whip');
  m.emit({ type: 'whip', i: f.i, j: best.i, pos: staffTip(f) });
}
// 다른 기수가 빠르게 휘두른 지팡이 끝이 줄 0.3m 안을 지나면 끊긴다
function staffCuts(m, f, a, b) {
  const seg = { a, b, r: 0 };
  for (const x of m.fighters) {
    if (x === f || x.weapon < 0 || !x.staff || x.staff.tipSpeed < 6) continue;
    if (zoneGap(seg, staffTip(x)) < 0.3) return true;
  }
  return false;
}
function updateWhip(m, f, dt) {
  const W = f.whip; if (!W) return;
  const S = SPELLS.whip, g = m.fighters[W.j];
  W.t += dt;
  spendKE(m, f, S.costPerS * dt);
  const tip = staffTip(f), body = g.rider.body, P = add(body.translation(), { x: 0, y: 0.55, z: 0 });
  const d = sub(tip, P), dl = len(d);
  if (g.rider.state === 'ko' || W.t > S.maxT || dl > 20) { cutWhip(m, f, 'end'); return; }
  W.chk -= dt;
  if (W.chk <= 0) {
    W.chk = 0.1;
    if (wallBetween(m, tip, P)) { cutWhip(m, f, 'wall'); return; }
    if (staffCuts(m, f, tip, P)) { cutWhip(m, f, 'staff'); return; }
  }
  tag(m, g, f.i, 'whip');
  // 속도 차이가 끄는 힘: 느린 쪽을 빠른 쪽으로 끌어당긴다 (빠른 쪽은 반작용 slowShare만)
  const dv = speedOf(m, f) - speedOf(m, g);
  if (Math.abs(dv) < 0.3 || dl < 0.5) return;
  const F = Math.min(S.fMax, S.pullK * Math.abs(dv)), dir = scale(d, 1 / dl);   // dir: 상대 → 나
  const onHer = dv > 0 ? 1 : S.slowShare, onMe = dv > 0 ? S.slowShare : 1;
  body.applyImpulseAtPoint(scale(dir, F * dt * onHer), P, true);
  f.rider.body.applyImpulseAtPoint(scale(dir, -F * dt * onMe), shoulderWorld(f), true);
}
// ---------- 🔥 불길: 누르고 있는 동안 내 말 뒤로 불이 깔린다. 같은 마력이라도 빨리 달릴수록 길다 ----------
function trailTick(m, f, dt) {
  const S = SPELLS.firetrail;
  spendKE(m, f, S.costPerS * dt);
  f.trailT -= dt;
  if (f.trailT > 0) return;
  f.trailT = S.every;
  const hz = f.horse >= 0 ? m.horses[f.horse] : null, p = (hz ? hz.body : f.rider.body).translation(), fw = fwdOf(hz ? hz.heading : f.aimYaw);
  const rear = { x: p.x - fw.x * 1.2, y: 0, z: p.z - fw.z * 1.2 };
  if (f.trailLast) addZone(m, { kind: 'trail', a: f.trailLast, b: rear, r: S.r, life: S.life, owner: f.i });
  f.trailLast = rear;
}
function cutWhip(m, f, why) {
  if (!f.whip) return;
  m.emit({ type: 'whipCut', i: f.i, j: f.whip.j, why });
  f.whip = null;
}

// ---------- 공통: 조준선이 땅에 닿는 점(내 앞 near~far로 자름), 흙벽이 가로막는가 ----------
export function groundPoint(f, near, far) {
  const t = f.rider.body.translation(), d = f.aimDir, h = Math.hypot(d.x, d.z) || 1;
  const eyeY = t.y + CFG.rider.headY;
  const dist = clamp(d.y < -0.02 ? eyeY / -d.y * h : far, near, far);
  return { x: t.x + d.x / h * dist, y: 0, z: t.z + d.z / h * dist };
}
// 흙벽이 둘 사이에 서 있는가: 높이와 상관없이 땅 위 0.8m에서 수평으로 본다 (말 탄 기수의 지팡이 끝은 벽보다 높다)
export function wallBetween(m, a0, b0) {
  if (!m.walls.length) return false;
  const a = { x: a0.x, y: 0.8, z: a0.z }, b = { x: b0.x, y: 0.8, z: b0.z };
  const d = sub(b, a), l = len(d);
  if (l < 1e-3) return false;
  const ray = new m.R.Ray(a, scale(d, 1 / l));
  return !!m.world.castRay(ray, l, true, undefined, undefined, undefined, undefined, (col) => { const inf = m.info.get(col.handle); return !!inf && inf.kind === 'wall'; });
}

// ---------- 🧊 빙판: 조준한 곳에 얼음. 그 위의 말은 하던 속도로 미끄러지고(controlHorse), 빠르게 급히 틀면 넘어진다 ----------
function castIce(m, f, frac) {
  const S = SPELLS.ice;
  spendKE(m, f, frac);
  const c = groundPoint(f, S.near, S.far), r = S.r0 + (S.r1 - S.r0) * fracOf(frac, S.minF);
  addZone(m, { kind: 'ice', a: c, b: c, r, life: S.life, owner: f.i });
  m.emit({ type: 'iceUp', i: f.i, pos: c, r });
}

// ---------- 🧱 흙벽: 조준한 곳에 솟는다. 달려와 박은 말은 서고, 기수는 하던 속도로 날아간다 ----------
function castWall(m, f, frac) {
  const S = SPELLS.wall, R = m.R;
  spendKE(m, f, frac);
  const P = groundPoint(f, S.near, S.far), yaw = f.aimYaw, fw = fwdOf(yaw);
  const h = S.h0 + (S.h1 - S.h0) * fracOf(frac, S.minF), w = f.wallW || S.w;
  // 솟을 자리의 말·걷는 기수를 벽 앞뒤로 밀어낸다 (벽 안에 끼지 않게)
  const clearOut = (body, half) => {
    const p = body.translation(), rx = p.x - P.x, rz = p.z - P.z, along = rx * fw.x + rz * fw.z, side = Math.abs(-rx * fw.z + rz * fw.x);
    const need = S.thick / 2 + half;
    if (Math.abs(along) >= need || side >= w / 2 + 0.6) return;
    const sgn = along >= 0 ? 1 : -1, push = need - Math.abs(along);
    body.setTranslation({ x: p.x + fw.x * push * sgn, y: p.y, z: p.z + fw.z * push * sgn }, true);
  };
  for (const hz of m.horses) if (hz.k !== f.horse) clearOut(hz.body, 1.2);
  for (const g of m.fighters) if (g.horse < 0 && g !== f) clearOut(g.rider.body, 0.5);
  // 내 몸과 내 말은 내 벽을 지나간다 (질주하다 세운 벽에 내가 박지 않게)
  const mine = (1 << riderBit(f.i)) | (f.horse >= 0 ? 1 << horseBit(f.horse) : 0);
  const body = m.world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(P.x, -h / 2, P.z).setRotation(yawQ(yaw)));
  const col = m.world.createCollider(R.ColliderDesc.cuboid(w / 2, h / 2, S.thick / 2).setFriction(0.6).setCollisionGroups(groups(1 << 1, 0xffff & ~mine)), body);
  const wall = { id: m.nextObjId++, owner: f.i, body, col, h, w, t: 0, pos: P, yaw };
  m.info.set(col.handle, { kind: 'wall', id: wall.id });
  m.walls.push(wall);
  m.emit({ type: 'wallUp', i: f.i, id: wall.id, pos: { x: P.x, y: 0, z: P.z }, h, w, yaw });
}
function stepWalls(m, dt) {
  const S = SPELLS.wall;
  for (const wl of m.walls) {
    wl.t += dt;
    const up = wl.t < S.rise ? wl.t / S.rise : wl.t < S.life ? 1 : Math.max(0, 1 - (wl.t - S.life) / S.sink);
    wl.body.setNextKinematicTranslation({ x: wl.pos.x, y: -wl.h / 2 + wl.h * up, z: wl.pos.z });
    if (wl.t >= S.life + S.sink) {
      wl.dead = true; m.info.delete(wl.col.handle); m.world.removeRigidBody(wl.body);
      m.emit({ type: 'wallDown', id: wl.id, pos: { x: wl.pos.x, y: 0, z: wl.pos.z } });
    }
  }
  m.walls = m.walls.filter((w) => !w.dead);
}
// 말–벽 충돌 (match.collide가 부른다): pre = 충돌 직전 말 상태
export function wallCrash(m, h, wl, pre) {
  if (!wl || !pre || (h.crashT || -1) > m.t) return;
  const v = pre.v, sp = Math.hypot(v.x, v.z);
  if (sp < SPELLS.wall.crashV || (h.rider >= 0 && h.rider === wl.owner)) return;   // 내 말은 내 벽에 막히기만 한다
  h.crashT = m.t + 0.5;
  h.fear = Math.min(100, h.fear + 50 * h.def.fearGain); h.stagger = Math.max(h.stagger, 0.6); h.cruise = 0;
  h.body.setLinvel({ x: v.x * 0.1, y: v.y, z: v.z * 0.1 }, true);
  const rider = h.rider >= 0 ? m.fighters[h.rider] : null;
  m.emit({ type: 'wallCrash', k: h.k, i: rider ? rider.i : -1, s: sp, pos: h.body.translation() });
  if (!rider) return;
  tag(m, rider, wl.owner, 'wall');
  unhorse(m, rider, 'wall');
  rider.rider.body.setLinvel({ x: v.x, y: Math.max(2.5, v.y + 2.5), z: v.z }, true);
}

// ---------- ⛰️ 땅가르기: 내 앞으로 직선 균열이 달려 나간다. 밟은 말은 그 말의 속도만큼 휘청이고, 질주하던 말은 고꾸라진다 ----------
function castFissure(m, f, frac) {
  const S = SPELLS.fissure;
  spendKE(m, f, frac);
  const p = f.rider.body.translation(), dir = norm({ x: f.aimDir.x, y: 0, z: f.aimDir.z });
  const L = S.len0 + (S.len1 - S.len0) * fracOf(frac, S.minF, S.maxF);
  const o = { x: p.x + dir.x * 1.5, y: 0, z: p.z + dir.z * 1.5 };
  const fs = { id: m.nextObjId++, owner: f.i, o, dir, len: L, front: 0, t: 0, hit: new Set() };
  m.fissures.push(fs);
  m.emit({ type: 'fissure', i: f.i, id: fs.id, pos: o, dir, len: L });
}
function stepFissures(m, dt) {
  const S = SPELLS.fissure;
  for (const fs of m.fissures) {
    fs.t += dt; fs.front = Math.min(fs.len, fs.front + S.speed * dt);
    for (const h of m.horses) {
      if (fs.hit.has(h.k) || h.rider === fs.owner || (h.rider < 0 && h.owner === fs.owner)) continue;
      const p = h.body.translation(), rx = p.x - fs.o.x, rz = p.z - fs.o.z;
      const along = rx * fs.dir.x + rz * fs.dir.z, side = Math.abs(-rx * fs.dir.z + rz * fs.dir.x);
      if (along < 0 || along > fs.front || side > S.w / 2 + 0.45) continue;
      fs.hit.add(h.k);
      const v = h.body.linvel(), sp = Math.hypot(v.x, v.z), rider = h.rider >= 0 ? m.fighters[h.rider] : null;
      h.fear = Math.min(100, h.fear + S.fearK * clamp(sp / S.vRef, 0, 1) * h.def.fearGain);
      h.stagger = Math.max(h.stagger, 0.8);
      if (rider) tag(m, rider, fs.owner, 'fissure');
      if (sp > S.tripV) {
        h.body.setLinvel({ x: v.x * 0.2, y: v.y, z: v.z * 0.2 }, true); h.cruise = 0;
        m.emit({ type: 'trip', k: h.k, i: rider ? rider.i : -1, s: sp, pos: p });
        if (rider) { unhorse(m, rider, 'fissure'); rider.rider.body.setLinvel({ x: v.x, y: 3, z: v.z }, true); }
      }
    }
    if (m.reactions) {   // 땅이 흔들리면 얼음이 깨진다
      const seg = { a: fs.o, b: { x: fs.o.x + fs.dir.x * fs.front, y: 0, z: fs.o.z + fs.dir.z * fs.front }, r: S.w / 2 };
      for (const z of m.zones) if (z.kind === 'ice' && !z.dead && zoneGap(seg, z.a) < z.r) { z.dead = true; m.emit({ type: 'iceBreak', pos: { x: z.a.x, y: 0.1, z: z.a.z } }); }
    }
    if (fs.front >= fs.len && fs.t > fs.len / S.speed + 1.5) fs.dead = true;   // 다 뻗은 뒤 1.5초 남는다
  }
  m.fissures = m.fissures.filter((x) => !x.dead);
}

// ---------- 🌪️ 회오리: 내 말의 속도로 앞으로 간다. 둘레를 빨아들이고, 축에 든 기수는 들어 올려 떨어뜨린다 ----------
function castTornado(m, f, frac) {
  const S = SPELLS.tornado, base = f.horse >= 0 ? m.horses[f.horse].body : f.rider.body, v0 = base.linvel();
  const dh = norm({ x: f.aimDir.x, y: 0, z: f.aimDir.z }), sp = clamp(v0.x * dh.x + v0.z * dh.z, S.vMin, S.vMax);
  const Es = spendKE(m, f, frac), p = f.rider.body.translation();
  const tor = { id: m.nextObjId++, owner: f.i, pos: { x: p.x + dh.x * 4, y: 0, z: p.z + dh.z * 4 }, vel: { x: dh.x * sp, y: 0, z: dh.z * sp }, t: 0, life: S.life, E: Es, fire: false };
  m.tornados.push(tor);
  m.emit({ type: 'tornado', i: f.i, id: tor.id, pos: { ...tor.pos } });
}
function stepTornados(m, dt) {
  const S = SPELLS.tornado;
  for (const tor of m.tornados) {
    tor.t += dt;
    tor.pos = { x: tor.pos.x + tor.vel.x * dt, y: 0, z: tor.pos.z + tor.vel.z * dt };
    if (m.reactions && !tor.fire && m.zones.some((z) => (z.kind === 'burn' || z.kind === 'trail') && zoneGap(z, tor.pos) < 1)) {   // 바람이 불을 빨아들인다
      tor.fire = true; m.emit({ type: 'fireTornado', id: tor.id, pos: { ...tor.pos } });
    }
    const J = S.pullK * Math.sqrt(tor.E) * dt;
    for (const g of m.fighters) {
      if (g.i === tor.owner || g.rider.state === 'ko') continue;
      const tb = g.rider.body, p = tb.translation(), dx = tor.pos.x - p.x, dz = tor.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > S.rPull) continue;
      const k = 1 - d / S.rPull, ix = d > 1e-3 ? dx / d : 0, iz = d > 1e-3 ? dz / d : 0;
      const imp = clampLen({ x: (ix - iz * 0.6) * J * k, y: d < S.rCore ? S.liftK * Math.sqrt(tor.E) * dt : 0, z: (iz + ix * 0.6) * J * k }, g.mass * 0.5);   // 틱당 0.5 m/s 넘게 바꾸지 않는다
      tb.applyImpulse(imp, true);
      tag(m, g, tor.owner, 'tornado');
      if (d < S.rCore && g.horse >= 0) unhorse(m, g, 'tornado');
    }
    for (const h of m.horses) {
      if (h.rider === tor.owner) continue;
      const p = h.body.translation(), dx = tor.pos.x - p.x, dz = tor.pos.z - p.z, d = Math.hypot(dx, dz);
      if (d > S.rPull || d < 1e-3) continue;
      const k = (1 - d / S.rPull) * 0.3;
      h.body.applyImpulse(clampLen({ x: dx / d * J * k, y: 0, z: dz / d * J * k }, h.def.mass * 0.15), true);
      if (tor.fire) h.fear = Math.min(100, h.fear + S.fireFear * dt * h.def.fearGain);
    }
    m.spells = m.spells.filter((sp) => {
      const eat = sp.owner !== tor.owner && hdist(sp.pos, tor.pos) < S.rPull;
      if (eat) m.emit({ type: 'swallow', id: sp.id, pos: sp.pos });
      return !eat;
    });
    if (tor.t >= tor.life) { tor.dead = true; m.emit({ type: 'tornadoEnd', id: tor.id, pos: { ...tor.pos } }); }
  }
  m.tornados = m.tornados.filter((t) => !t.dead);
}

export function stepMagic(m, dt) {
  stepWalls(m, dt);
  stepFissures(m, dt);
  stepTornados(m, dt);
}
