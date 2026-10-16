// 말 · 기수 상체 · 무기: 물리 몸 만들기와 매 틱 제어 (하프소드식 능동 래그돌을 단순하게)
// 좌표: y 위, 요 h의 앞 = (sin h, 0, cos h). 몸 로컬에서 앞 = +z, 오른쪽 = -x
// v0.2: 무기는 따로 있는 물체(떨어뜨리고, 던지고, 줍는다) · 맨손 주먹 · 찌르기 자세 · 기운 · 잡기 · 발차기 · 넘어짐 · 래그돌 팔다리
import { CFG, HORSES, ITEMS, CHARS, JOBS, SPELLS, slotsFor } from './config.js';
import { v3, add, sub, scale, dot, cross, len, norm, clamp, clampLen, qRotate, qFromTo, yawQ, fwdOf, rightOf, yawOfQ, wrapAngle, hdist } from './rng.js';

const Y = { x: 0, y: 1, z: 0 };
const ALL = 0xffff;
const BIT = (b) => 1 << b;
export const riderBit = (i) => 2 + i;   // 기수 i의 몸과 손에 든 무기 (최대 6명)
export const horseBit = (k) => 8 + k;   // 말 k (최대 6마리)
export const LOOSE_BIT = 14, LIMB_BIT = 15;   // 떨어진 무기 · 래그돌 팔다리
export const groups = (member, filter) => (((member & 0xffff) << 16) | (filter & 0xffff)) >>> 0;
export const GROUND_GROUPS = groups(BIT(0), ALL);
export const FENCE_GROUPS = groups(BIT(1), ALL);
const NOLIMB = ALL & ~BIT(LIMB_BIT);
const conj = (q) => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function idleInput() {
  return { move: [0, 0], gallop: false, duck: false, look: [0, 0], swing: false, hand: [0, 0], charge: false, big: false, mount: false, surrender: false,
    thrust: false, reach: 0, grab: false, kick: false };
}
const SHOULDER_R = () => CFG.rider.shoulder;   // 오른쪽 어깨 (몸 로컬: 오른쪽 = -x)
const SHOULDER_L = () => [-CFG.rider.shoulder[0], CFG.rider.shoulder[1], CFG.rider.shoulder[2]];
const toV = (a) => ({ x: a[0], y: a[1], z: a[2] });
export function shoulderWorld(f, left = false) {
  const tb = f.rider.body;
  return add(tb.translation(), qRotate(tb.rotation(), toV(left ? SHOULDER_L() : SHOULDER_R())));
}
export const strength = (f) => CFG.stamina.minStrength + (1 - CFG.stamina.minStrength) * f.stam / 100;
export function drain(f, amt) { if (amt <= 0) return; f.stam = Math.max(0, f.stam - amt); f.stamIdle = 0; }

// ---------- 말 ----------
export function createHorse(m, k, defKey, pos, heading) {
  const R = m.R, H = CFG.horse, def = HORSES[defKey], s = def.size;
  const y = (-H.legsY + H.legs[1]) * s + 0.02;
  const body = m.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos.x, y, pos.z).setRotation(yawQ(heading))
    .enabledRotations(false, true, false).setLinearDamping(0.05).setAngularDamping(4).setCcdEnabled(true));
  const mk = (desc, mass, fr) => m.world.createCollider(desc.setMass(mass).setFriction(fr).setRestitution(0.05)
    .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), body);
  const barrel = mk(R.ColliderDesc.cuboid(H.barrel[0] * s, H.barrel[1] * s, H.barrel[2] * s), def.mass * 0.72, 0.3);
  const legs = mk(R.ColliderDesc.cuboid(H.legs[0] * s, H.legs[1] * s, H.legs[2] * s).setTranslation(0, H.legsY * s, 0)
    .setFrictionCombineRule(R.CoefficientCombineRule.Min), def.mass * 0.2, 0.0);   // 평균이면 바닥 마찰이 가속을 다 먹는다
  const head = mk(R.ColliderDesc.cuboid(H.head[0] * s, H.head[1] * s, H.head[2] * s).setTranslation(H.headPos[0] * s, H.headPos[1] * s, H.headPos[2] * s), def.mass * 0.08, 0.3);
  const h = { k, defKey, def, s, body, cols: { barrel, legs, head }, heading, fear: 0, rider: -1, reserved: -1, panicT: 0, cruise: 0, stagger: 0, speed: 0, buckT: 0, wanderYaw: heading, wanderT: 0, owner: -1,
    stam: 100, winded: false, held: -1, gait: 0 };
  for (const c of Object.values(h.cols)) m.info.set(c.handle, { kind: 'horse', k });
  setHorseGroups(h);
  return h;
}
export function setHorseGroups(h) {
  const filter = NOLIMB & ~(h.rider >= 0 ? BIT(riderBit(h.rider)) : 0);
  for (const c of Object.values(h.cols)) c.setCollisionGroups(groups(BIT(horseBit(h.k)), filter));
}
export function saddleWorld(h) {
  const S = CFG.horse.saddle, t = h.body.translation();
  return add(t, qRotate(h.body.rotation(), { x: S[0] * h.s, y: S[1] * h.s, z: S[2] * h.s }));
}
export function horseHeadWorld(h) {
  return add(h.body.translation(), qRotate(h.body.rotation(), { x: 0, y: 0.5 * h.s, z: 1.15 * h.s }));
}

// ---------- 무기 (지팡이·주먹) ----------
export function createWeapon(m, itemId, pos) {
  const R = m.R, it = ITEMS[itemId], SC = CFG.staff, isFist = itemId === 'fist';
  const body = m.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z)
    .setLinearDamping(0.3).setAngularDamping(1.5).setCcdEnabled(true));
  const desc = isFist ? R.ColliderDesc.ball(it.radius) : R.ColliderDesc.capsule(it.len / 2 - SC.radius, SC.radius);
  const col = m.world.createCollider(desc.setMass(it.mass).setFriction(0.5).setRestitution(0.1)
    .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS | R.ActiveEvents.CONTACT_FORCE_EVENTS)
    .setContactForceEventThreshold(CFG.melee.forceThreshold), body);
  const w = { id: m.weapons.length, itemId, item: it, isFist, body, col, len: it.len, mass: it.mass,
    gripY: isFist ? 0 : -it.len * SC.gripFrac, tipY: isFist ? 0 : it.len / 2,
    holder: -1, lastHolder: -1, rope: null, prevC: null, tipSpeed: 0, thrownBy: -1, flightT: 0, graceT: 0, looseT: 0 };
  m.info.set(col.handle, { kind: 'staff', w: w.id });
  m.weapons.push(w);
  setWeaponGroups(m, w);
  return w;
}
export function setWeaponGroups(m, w, holderF) {
  if (w.holder >= 0) {
    const f = holderF || m.fighters[w.holder];
    w.col.setCollisionGroups(groups(BIT(riderBit(f.i)), riderFilter(f)));
  } else {
    const grace = w.graceT > 0 && w.lastHolder >= 0 ? BIT(riderBit(w.lastHolder)) : 0;
    w.col.setCollisionGroups(groups(BIT(LOOSE_BIT), NOLIMB & ~grace));
  }
}
function riderFilter(f) {
  let filter = NOLIMB & ~BIT(riderBit(f.i));
  if (f.horse >= 0) filter &= ~BIT(horseBit(f.horse));
  if (f.rider.state === 'mounting' && f.rider.mountK >= 0) filter &= ~BIT(horseBit(f.rider.mountK));
  return filter;
}
// 손에 쥐기: 어깨와 손잡이를 밧줄 관절(팔 길이)로 잇는다
export function attachWeapon(m, f, w) {
  const R = m.R, SC = CFG.staff;
  if (w.rope) { m.world.removeImpulseJoint(w.rope, true); w.rope = null; }
  if (!w.isFist) {
    const fist = m.weapons[f.fist];
    if (fist.rope) { m.world.removeImpulseJoint(fist.rope, true); fist.rope = null; }
    fist.holder = -1; fist.body.setEnabled(false);
  } else w.body.setEnabled(true);
  const S = shoulderWorld(f), tb = f.rider.body;
  const p = add(S, { x: 0, y: -w.gripY + 0.05, z: 0 });
  w.body.setTranslation(p, true); w.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  w.body.setLinvel(tb.linvel(), true); w.body.setAngvel(v3(), true);
  w.rope = m.world.createImpulseJoint(R.JointData.rope(SC.rope, toV(SHOULDER_R()), { x: 0, y: w.gripY, z: 0 }), tb, w.body, true);
  w.holder = f.i; w.lastHolder = f.i; w.thrownBy = -1; w.prevC = null; w.graceT = 0;
  if (!w.isFist) f.weapon = w.id;
  f.staff = w;
  setWeaponGroups(m, w, f);
}
// 손에서 놓기 (떨어뜨림 · 무장 해제 · 던지기 · 기절). 손은 주먹으로 바뀐다
export function dropWeapon(m, f, cause) {
  if (f.weapon < 0) return null;
  const w = m.weapons[f.weapon];
  if (w.rope) { m.world.removeImpulseJoint(w.rope, true); w.rope = null; }
  w.holder = -1; w.lastHolder = f.i; w.graceT = CFG.throw.grace; w.looseT = 0; w.prevC = null;
  setWeaponGroups(m, w);
  f.weapon = -1;
  f.charging = false; f.charge = 0;
  attachWeapon(m, f, m.weapons[f.fist]);
  m.emit({ type: 'drop', i: f.i, w: w.id, cause, pos: w.body.translation() });
  return w;
}
function throwWeapon(m, f) {
  if (f.weapon < 0 || f.stam < 5) return;
  const w = m.weapons[f.weapon], v = w.body.linvel(), T = CFG.throw;
  dropWeapon(m, f, 'throw');
  w.body.setLinvel({ x: v.x * T.boost + f.aimDir.x * 4, y: v.y * T.boost + T.lift, z: v.z * T.boost + f.aimDir.z * 4 }, true);
  w.thrownBy = f.i; w.flightT = 0;
  drain(f, CFG.stamina.throw);
  m.emit({ type: 'throw', i: f.i, w: w.id, pos: w.body.translation() });
}
function tryPickup(m, f) {
  const P = CFG.pickup, hip = f.rider.body.translation(), mounted = f.horse >= 0;
  if (mounted && m.horses[f.horse].speed > P.mountedSpeed) return false;
  let best = null, bd = mounted ? P.mounted : P.foot;
  for (const w of m.weapons) {
    if (w.isFist || w.holder >= 0) continue;
    const p = w.body.translation();
    if (!mounted && p.y > 2.3) continue;
    const d = hdist(hip, p);
    if (d < bd) { bd = d; best = w; }
  }
  if (!best) return false;
  if (f.weapon >= 0) dropWeapon(m, f, 'swap');
  attachWeapon(m, f, best);
  m.emit({ type: 'pickup', i: f.i, w: best.id, pos: best.body.translation() });
  return true;
}
export function nearLooseWeapon(m, f, range) {
  const hip = f.rider.body.translation();
  let best = null, bd = range;
  for (const w of m.weapons) {
    if (w.isFist || w.holder >= 0) continue;
    const d = hdist(hip, w.body.translation());
    if (d < bd) { bd = d; best = w; }
  }
  return best ? { w: best, d: bd } : null;
}

// ---------- 기수 ----------
export function createFighter(m, i, spec, horseK) {
  const R = m.R, RC = CFG.rider, ch = CHARS[spec.char], M = ch.mass;
  const loadout = { ...ch.loadout, ...(spec.loadout || {}) };
  const h = m.horses[horseK];
  const hip = saddleWorld(h);
  const body = m.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(hip.x, hip.y, hip.z).setRotation(yawQ(h.heading))
    .setLinearDamping(0.05).setAngularDamping(1.0).setCcdEnabled(true));
  const mk = (desc, mass, fr) => m.world.createCollider(desc.setMass(mass).setFriction(fr).setRestitution(0.05)
    .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), body);
  const torso = mk(R.ColliderDesc.capsule(RC.torso[0], RC.torso[1]).setTranslation(0, RC.torsoY, 0), M * 0.62, 0.6);
  const head = mk(R.ColliderDesc.ball(RC.headR).setTranslation(0, RC.headY, 0), M * 0.09, 0.6);
  const legs = mk(R.ColliderDesc.capsule(RC.legs[0], RC.legs[1]).setTranslation(0, RC.legsY, 0), M * 0.29, 0.4);
  m.info.set(torso.handle, { kind: 'torso', i }); m.info.set(head.handle, { kind: 'head', i }); m.info.set(legs.handle, { kind: 'legs', i });

  const hat = ITEMS[loadout.hat], robe = ITEMS[loadout.robe], gear = ITEMS[loadout.gear];
  // 전직(원소): 명단이 주면 그것, 아니면 캐릭터 기본값(세린의 'mimic'은 명단이 정한다)
  const job0 = spec.job !== undefined ? spec.job : (ch.job === 'mimic' ? null : ch.job || null);
  const job = job0 && JOBS[job0] ? job0 : null;
  const jobTier = job ? (spec.jobTier !== undefined ? spec.jobTier : ch.jobTier || 0) : 0;
  const bonus = job ? JOBS[job].bonus : {};
  const f = {
    i, char: spec.char, ch, loadout, isPlayer: !!spec.isPlayer, color: ch.color, mass: M, persona: spec.persona || ch.persona,
    balance: ch.balance * (robe.balance || 1) * (gear.balance || 1) * (bonus.balance || 1), headMul: hat.headMul, torsoMul: robe.torsoMul,
    job, jobTier, slots: spec.slots || slotsFor(job, jobTier),
    spellMul: bonus.spellMul || 1, hitMul: bonus.hitMul || 1, speedMul: (bonus.speedMul || 1) * (spec.speedMul || 1), wallW: spec.wallW || 0,
    chargeSlot: null, holdOn: {}, whip: null, trailLast: null, trailT: 0, lastSpell: null,
    rider: { body, cols: { torso, head, legs }, state: 'mounted', t: 0, conscious: CFG.mind.max, lastHitT: -99, tiltT: 0, joint: null, mountK: -1, from: null },
    horse: -1, lastHorse: horseK, homeHorse: horseK,
    weapon: -1, fist: -1, staff: null,
    charge: 0, charging: false, look: [0, 0], hand: [0, 0], aimYaw: h.heading, aimPitch: 0, aimDir: fwdOf(h.heading),
    input: idleInput(), prevInput: idleInput(), mana: 0,
    stam: 100, stamIdle: 9, stagger: 0, kickCd: 0, kickT: 0, grab: null, ragdoll: null,
    stats: { unhorsed: 0, kos: 0, deflectHits: 0, hits: 0, casts: 0, chargeSum: 0, swings: 0, fearSum: 0, fearN: 0, thrusts: 0, grabs: 0, kicks: 0, disarms: 0, throws: 0, spells: {} },
    out: false, surrendered: false, lastHitBy: null, hitCd: new Map(), brain: null,
  };
  const S = add(hip, qRotate(yawQ(h.heading), toV(SHOULDER_R())));
  const fist = createWeapon(m, 'fist', S); f.fist = fist.id; fist.body.setEnabled(false);
  const staff = createWeapon(m, loadout.staff, add(S, { x: 0, y: 0.6, z: 0 }));
  mountFighter(m, f, horseK, true);
  attachWeapon(m, f, staff);
  return f;
}

export function setRiderGroups(f, m) {
  const me = BIT(riderBit(f.i)), filter = riderFilter(f);
  const c = f.rider.cols, mounted = f.rider.state === 'mounted' || f.rider.state === 'mounting';
  c.torso.setCollisionGroups(groups(me, filter));
  c.head.setCollisionGroups(groups(me, filter));
  c.legs.setCollisionGroups(groups(me, mounted ? 0 : filter));
  if (f.staff) f.staff.col.setCollisionGroups(groups(me, filter));
}

export function mountFighter(m, f, k, instant) {
  const R = m.R, h = m.horses[k], S = CFG.horse.saddle;
  removeRagdoll(m, f);
  if (!instant) {   // 안장 위치로 옮긴 다음 관절을 잇는다
    const p = saddleWorld(h); f.rider.body.setTranslation(p, true); f.rider.body.setRotation(yawQ(h.heading), true);
  }
  f.rider.body.setLinvel(h.body.linvel(), true); f.rider.body.setAngvel(v3(), true);
  f.rider.joint = m.world.createImpulseJoint(R.JointData.spherical({ x: S[0] * h.s, y: S[1] * h.s, z: S[2] * h.s }, v3()), h.body, f.rider.body, true);
  f.horse = k; f.lastHorse = k; h.rider = f.i; h.reserved = -1; h.panicT = 0; h.held = -1;
  const v = h.body.linvel(), fw = fwdOf(h.heading); h.cruise = Math.max(0, v.x * fw.x + v.z * fw.z);
  f.rider.state = 'mounted'; f.rider.t = 0; f.rider.tiltT = 0; f.rider.mountK = -1;
  setRiderGroups(f); setHorseGroups(h);
}

export function unhorse(m, f, cause) {
  if (f.horse < 0) return;
  const h = m.horses[f.horse];
  if (f.rider.joint) { m.world.removeImpulseJoint(f.rider.joint, true); f.rider.joint = null; }
  h.rider = -1; h.panicT = CFG.horse.panicT; h.wanderYaw = h.heading; h.wanderT = 0;
  f.horse = -1;
  f.rider.state = 'flying'; f.rider.t = 0; f.charging = false; f.charge = 0; f.chargeSlot = null; f.whip = null; f.trailLast = null;
  releaseGrab(m, f);
  setRiderGroups(f); setHorseGroups(h);
  // 살짝 튕겨 오르게 (코미디)
  f.rider.body.applyImpulse({ x: 0, y: f.mass * 1.6, z: 0 }, true);
  spawnRagdoll(m, f);
  const by = f.lastHitBy && m.t - f.lastHitBy.t < 2.5 ? f.lastHitBy.i : -1;
  if (by >= 0) m.fighters[by].stats.unhorsed++;
  const spell = f.lastSpell && m.t - f.lastSpell.t < 3 ? f.lastSpell.spell : null;
  m.emit({ type: 'unhorse', i: f.i, by, cause, spell, pos: f.rider.body.translation() });
}
// 걸어서 싸우다 크게 맞으면 넘어진다
export function knockDown(m, f, cause, by = -1) {
  if (f.rider.state !== 'foot' && f.rider.state !== 'getup') return;
  f.rider.state = 'flying'; f.rider.t = 0; f.charging = false; f.charge = 0;
  releaseGrab(m, f);
  setRiderGroups(f);
  spawnRagdoll(m, f);
  m.emit({ type: 'knockdown', i: f.i, by, cause, pos: f.rider.body.translation() });
}
// 걷는 사람이 받은 충격: 크면 넘어짐, 작으면 비틀거림
export function footImpact(m, f, J, by) {
  const st = f.rider.state;
  if (st !== 'foot' && st !== 'getup') return;
  if (J > CFG.foot.knockJ) knockDown(m, f, 'hit', by);
  else if (J > CFG.foot.staggerJ) f.stagger = Math.max(f.stagger, CFG.foot.staggerT);
}

export function knockOut(m, f, by) {
  if (f.rider.state === 'ko') return;
  if (f.horse >= 0) unhorse(m, f, 'ko');
  releaseGrab(m, f);
  if (f.weapon >= 0) dropWeapon(m, f, 'ko');
  f.rider.state = 'ko'; f.rider.t = 0; f.out = true; f.charging = false; f.charge = 0; f.chargeSlot = null; f.whip = null;
  setRiderGroups(f);
  spawnRagdoll(m, f);
  if (by >= 0 && by !== f.i) m.fighters[by].stats.kos++;
  m.emit({ type: 'ko', i: f.i, by, pos: f.rider.body.translation() });
}
// 연습장: 기절한 허수아비를 다시 세운다
export function revive(m, f) {
  if (f.rider.state !== 'ko') return;
  removeRagdoll(m, f);
  f.rider.conscious = 70; f.out = false; f.rider.state = 'getup'; f.rider.t = 0; f.stam = 100;
  setRiderGroups(f);
  m.emit({ type: 'revive', i: f.i });
}

// 마법 원인 기록: 누가 어떤 마법으로 밀거나 겁줬는지. 낙마 사건이 3초 안의 기록을 싣는다
export function tag(m, g, by, spell) {
  if (!g || by === undefined || by < 0 || by === g.i) return;
  g.lastSpell = { i: by, spell, t: m.t };
  g.lastHitBy = { i: by, t: m.t };
}

// 피해: part = head | torso | legs | blast
export function hurt(m, f, dmg, part, by, cause) {
  if (f.rider.state === 'ko' || dmg <= 0) return 0;
  const mul = part === 'head' ? f.headMul : part === 'legs' ? 1 : f.torsoMul;
  const d = dmg * mul;
  f.rider.conscious -= d; f.rider.lastHitT = m.t;
  if (by >= 0 && by !== f.i) f.lastHitBy = { i: by, t: m.t };
  if (f.horse >= 0) m.horses[f.horse].fear = Math.min(100, m.horses[f.horse].fear + CFG.fear.hitRider);
  m.emit({ type: 'hurt', i: f.i, d, part, by, cause });
  if (f.rider.conscious <= 0) { f.rider.conscious = 0; knockOut(m, f, f.lastHitBy && m.t - f.lastHitBy.t < 3 ? f.lastHitBy.i : by); }
  return d;
}

// 지금 타고 있는(또는 걷는) 몸의 운동에너지 = 마력
export function kineticEnergy(m, f) {
  if (f.horse >= 0) {
    const h = m.horses[f.horse], v = h.body.linvel();
    return 0.5 * (h.def.mass + f.mass) * (v.x * v.x + v.z * v.z);
  }
  if (f.rider.state === 'foot') { const v = f.rider.body.linvel(); return 0.5 * f.mass * (v.x * v.x + v.z * v.z); }
  return 0;
}

// ---------- 래그돌 팔다리 (날아갈 때·넘어질 때·기절했을 때만) ----------
// 몸통에 구면 관절로 매단 8마디. 바닥·울타리하고만 부딪혀서 승부에는 영향이 없고, 보기와 몸의 출렁임만 만든다
const LIMBS = [
  { n: 'uaR', parent: -1, a: [-0.2, 0.66, 0.06], hl: 0.15, r: 0.055, m: 2.0, dir: [-0.55, -0.8, 0.1] },
  { n: 'faR', parent: 0, hl: 0.15, r: 0.05, m: 1.4, dir: [-0.3, -0.9, 0.3] },
  { n: 'uaL', parent: -1, a: [0.2, 0.66, 0.06], hl: 0.15, r: 0.055, m: 2.0, dir: [0.55, -0.8, 0.1] },
  { n: 'faL', parent: 2, hl: 0.15, r: 0.05, m: 1.4, dir: [0.3, -0.9, 0.3] },
  { n: 'thR', parent: -1, a: [-0.12, -0.02, 0], hl: 0.21, r: 0.075, m: 5.0, dir: [-0.15, -1, 0.15] },
  { n: 'shR', parent: 4, hl: 0.21, r: 0.065, m: 3.2, dir: [-0.05, -1, -0.1] },
  { n: 'thL', parent: -1, a: [0.12, -0.02, 0], hl: 0.21, r: 0.075, m: 5.0, dir: [0.15, -1, 0.15] },
  { n: 'shL', parent: 6, hl: 0.21, r: 0.065, m: 3.2, dir: [0.05, -1, -0.1] },
];
export const LIMB_NAMES = LIMBS.map((l) => l.n);
export function spawnRagdoll(m, f) {
  if (f.ragdoll) return;
  const R = m.R, tb = f.rider.body, q = tb.rotation(), p = tb.translation(), v = tb.linvel();
  const parts = [];
  for (const L of LIMBS) {
    const dirW = norm(qRotate(q, toV(L.dir)));
    let start, parentBody, anchorParent;
    if (L.parent < 0) { start = add(p, qRotate(q, toV(L.a))); parentBody = tb; anchorParent = toV(L.a); }
    else {
      const P = parts[L.parent]; parentBody = P.body;
      start = add(P.body.translation(), qRotate(P.body.rotation(), { x: 0, y: -LIMBS[L.parent].hl, z: 0 }));
      anchorParent = { x: 0, y: -LIMBS[L.parent].hl, z: 0 };
    }
    const c = add(start, scale(dirW, L.hl));
    const rot = qFromTo({ x: 0, y: -1, z: 0 }, dirW);
    const body = m.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(c.x, c.y, c.z).setRotation(rot)
      .setLinvel(v.x, v.y, v.z).setLinearDamping(0.1).setAngularDamping(CFG.ragdoll.damping));
    const col = m.world.createCollider(R.ColliderDesc.capsule(Math.max(0.02, L.hl - L.r), L.r).setMass(L.m).setFriction(0.8).setRestitution(0.05)
      .setCollisionGroups(groups(BIT(LIMB_BIT), BIT(0) | BIT(1))), body);
    m.info.set(col.handle, { kind: 'limb', i: f.i });
    const joint = m.world.createImpulseJoint(R.JointData.spherical(anchorParent, { x: 0, y: L.hl, z: 0 }), parentBody, body, true);
    parts.push({ n: L.n, body, col, joint, hl: L.hl });
  }
  f.ragdoll = parts;
}
export function removeRagdoll(m, f) {
  if (!f.ragdoll) return;
  for (let k = f.ragdoll.length - 1; k >= 0; k--) {
    const P = f.ragdoll[k];
    m.info.delete(P.col.handle);
    m.world.removeImpulseJoint(P.joint, true);
    m.world.removeRigidBody(P.body);
  }
  f.ragdoll = null;
}

// ---------- 잡기 (Q) ----------
function tryGrab(m, f) {
  const G = CFG.grab;
  if (f.stam < G.minStam || f.grab) return;
  const SL = shoulderWorld(f, true), P = add(SL, scale(f.aimDir, 0.6));
  let best = null, bd = G.reach;
  for (const g of m.fighters) {
    if (g === f || g.rider.state === 'ko') continue;
    const tb = g.rider.body, c = add(tb.translation(), qRotate(tb.rotation(), { x: 0, y: 0.55, z: 0 }));
    const d = len(sub(c, P));
    if (d < bd) { bd = d; best = { kind: 'rider', i: g.i, body: tb, point: c }; }
  }
  if (f.horse < 0) {
    for (const h of m.horses) {
      if (h.rider >= 0) continue;
      const c = horseHeadWorld(h), d = len(sub(c, P));
      if (d < Math.max(bd, G.horseReach) && (!best || d < bd)) { bd = d; best = { kind: 'horse', k: h.k, body: h.body, point: c }; }
    }
  }
  if (!best) { if (f.isPlayer) m.emit({ type: 'grabMiss', i: f.i }); return; }
  const bq = best.body.rotation(), local = qRotate(conj(bq), sub(best.point, best.body.translation()));
  const rest = Math.max(0.5, len(sub(best.point, SL)));
  // 관절 대신 손아귀 용수철: 멀어질 때만 당기고, 반작용은 잡은 사람에게 조금만 (하프소드식 잡기: 잡은 쪽이 주도권)
  f.grab = { kind: best.kind, i: best.i, k: best.k, t: 0, local, rest };
  f.stats.grabs++;
  if (best.kind === 'rider') m.fighters[best.i].lastHitBy = { i: f.i, t: m.t };
  else { const h = m.horses[best.k]; h.held = f.i; h.panicT = 0; h.cruise = 0; }
  m.emit({ type: 'grab', i: f.i, kind: best.kind, j: best.i, k: best.k, pos: best.point });
}
export function releaseGrab(m, f) {
  const G = f.grab; if (!G) return;
  if (G.kind === 'horse') { const h = m.horses[G.k]; if (h.held === f.i) h.held = -1; }
  f.grab = null;
  m.emit({ type: 'release', i: f.i });
}
function updateGrab(m, f, dt) {
  const G = f.grab; if (!G) return;
  G.t += dt;
  let rel = 0, gone = false;
  if (G.kind === 'rider') {
    const g = m.fighters[G.i];
    gone = g.rider.state === 'ko';
    rel = len(sub(g.rider.body.linvel(), f.rider.body.linvel()));
    if (!gone) g.lastHitBy = { i: f.i, t: m.t };
  } else {
    const h = m.horses[G.k];
    gone = h.rider >= 0;
  }
  drain(f, (CFG.stamina.grab + CFG.stamina.grabStrain * rel) * dt);
  const maxT = f.horse >= 0 ? CFG.grab.mountedMaxT : CFG.grab.maxT;
  const st = f.rider.state;
  if (gone || !f.input.grab || f.stam <= 0 || G.t > maxT || (st !== 'mounted' && st !== 'foot')) { releaseGrab(m, f); return; }
  // 손아귀 용수철: 처음 잡은 거리보다 멀어지면 상대를 내 손 쪽으로 당긴다
  const GC = CFG.grab, SL = shoulderWorld(f, true), hand = add(SL, scale(f.aimDir, 0.35));
  const body = G.kind === 'rider' ? m.fighters[G.i].rider.body : m.horses[G.k].body;
  const P = add(body.translation(), qRotate(body.rotation(), G.local));
  const d = sub(hand, P), dl = len(d);
  if (dl > G.rest) {
    const dir = scale(d, 1 / dl), vr = dot(sub(body.linvel(), f.rider.body.linvel()), dir);
    let F = GC.k * (dl - G.rest) - GC.c * vr;
    F = clamp(F, 0, GC.fMax * strength(f));
    body.applyImpulseAtPoint(scale(dir, F * dt), P, true);
    f.rider.body.applyImpulseAtPoint(scale(dir, -F * dt * GC.reaction), SL, true);
  }
}
// 잡은 대상 좌표 (보기용)
export function grabPoint(m, f) {
  const G = f.grab; if (!G) return null;
  const body = G.kind === 'rider' ? m.fighters[G.i].rider.body : m.horses[G.k].body;
  return add(body.translation(), qRotate(body.rotation(), G.local));
}

// ---------- 발차기 (걸을 때 Space) ----------
function doKick(m, f) {
  const K = CFG.kick;
  if (f.kickCd > 0 || f.stam < 8) return;
  f.kickCd = K.cd; f.kickT = 0.3; f.stats.kicks++;
  drain(f, CFG.stamina.kick);
  const tb = f.rider.body, fw = fwdOf(f.aimYaw), P = add(add(tb.translation(), { x: 0, y: -0.15, z: 0 }), scale(fw, 0.75));
  let hit = null, bd = K.range;
  for (const g of m.fighters) {
    if (g === f || g.rider.state === 'ko') continue;
    const c = add(g.rider.body.translation(), { x: 0, y: g.horse >= 0 ? -0.2 : 0.1, z: 0 }), d = len(sub(c, P));
    if (d < bd) { bd = d; hit = { kind: 'rider', g, c }; }
  }
  for (const h of m.horses) {
    const c = h.body.translation(), d = hdist(c, P);
    if (d < Math.min(bd, 1.3)) { bd = d; hit = { kind: 'horse', h, c }; }
  }
  if (!hit) { m.emit({ type: 'kick', i: f.i, pos: P, miss: true }); return; }
  const J = K.J * strength(f), dir = norm(add(fw, { x: 0, y: 0.25, z: 0 }));
  if (hit.kind === 'rider') {
    const g = hit.g;
    g.rider.body.applyImpulseAtPoint(scale(dir, J), hit.c, true);
    hurt(m, g, K.dmg, 'torso', f.i, 'kick');
    footImpact(m, g, J, f.i);
    m.emit({ type: 'kick', i: f.i, j: g.i, pos: hit.c, J });
  } else {
    hit.h.fear = Math.min(100, hit.h.fear + K.horseFear);
    hit.h.body.applyImpulse(scale(dir, J * 0.5), true);
    m.emit({ type: 'kick', i: f.i, k: hit.h.k, pos: hit.c, J });
  }
}

// ---------- 매 틱 제어 ----------
function uprightTorque(body, up, want, kp, kd, tauMax, wRel, yawErr, yawKp, yawKd, dt) {
  const c = cross(up, want), s = len(c), ang = Math.atan2(s, dot(up, want));
  const axis = s > 1e-6 ? scale(c, 1 / s) : v3();
  const wYaw = dot(wRel, up), wPerp = sub(wRel, scale(up, wYaw));
  let tau = sub(scale(axis, kp * ang), scale(wPerp, kd));
  tau = add(tau, scale(up, yawKp * yawErr - yawKd * wYaw));
  body.applyTorqueImpulse(scale(clampLen(tau, tauMax), dt), true);
  return ang;
}

const bodyYaw = (q) => yawOfQ(q);

export function controlFighter(m, f, dt) {
  const RC = CFG.rider, rs = f.rider, tb = rs.body, inp = f.input, st = rs.state, SA = CFG.stamina;
  rs.t += dt;
  f.kickCd = Math.max(0, f.kickCd - dt); f.kickT = Math.max(0, f.kickT - dt); f.stagger = Math.max(0, f.stagger - dt);
  const dizzy = rs.conscious < CFG.mind.dizzy;
  const frozen = m.t < 0;
  const edge = (k) => inp[k] && !f.prevInput[k];
  // 조준
  if (st === 'mounted') {
    const h = m.horses[f.horse];
    f.aimYaw = h.heading + clamp(inp.look[0], -2.0, 2.0);
  } else f.aimYaw = inp.look[0];
  f.aimPitch = clamp(inp.look[1], -0.7, 0.6);
  const cp = Math.cos(f.aimPitch), fw = fwdOf(f.aimYaw);
  f.aimDir = { x: fw.x * cp, y: Math.sin(f.aimPitch), z: fw.z * cp };

  const q = tb.rotation(), up = qRotate(q, Y), w = tb.angvel();
  if (st === 'mounted') {
    const h = m.horses[f.horse], hw = h.body.angvel();
    const lean = RC.leanPerSpeed * h.speed + (inp.duck ? RC.duckLean : 0) + (inp.thrust ? 0.12 : 0);
    const want = norm(add(Y, scale(fwdOf(h.heading), lean)));
    const bal = f.balance * (dizzy ? 0.6 : 1) * (inp.duck ? RC.duckMul : 1);
    const target = h.heading + clamp(wrapAngle(f.aimYaw - h.heading), -RC.bodyYawMax, RC.bodyYawMax);
    const yawErr = wrapAngle(target - bodyYaw(q));
    const ang = uprightTorque(tb, up, want, RC.upKp * bal, RC.upKd * Math.sqrt(bal), RC.upTauMax * bal, sub(w, hw), yawErr, RC.yawKp, RC.yawKd, dt);
    rs.tiltT = ang > RC.tiltUnhorse ? rs.tiltT + dt : 0;
    if (rs.tiltT > RC.tiltTime) unhorse(m, f, 'tilt');
  } else if (st === 'getup' || st === 'foot') {
    const k = st === 'getup' ? Math.pow(clamp(rs.t / RC.getupT, 0, 1), 1.5) : 1;
    const bal = f.balance * (dizzy ? 0.55 : 1) * k * (f.stagger > 0 ? 0.55 : 1);
    const yawErr = wrapAngle(f.aimYaw - bodyYaw(q));
    const ang = uprightTorque(tb, up, Y, RC.footKp * bal, RC.footKd * Math.sqrt(Math.max(bal, 0.05)), RC.footTauMax * bal, w, yawErr * (ang0(up) < 0.6 ? 1 : 0), RC.yawKp, RC.yawKd, dt);
    // 다리 스프링: 엉덩이를 서 있는 높이로 받친다
    const p = tb.translation(), v = tb.linvel();
    if (p.y < RC.standY + 0.25 && ang < 1.1) {
      const fy = f.mass * (9.81 + RC.standK * (RC.standY - p.y) - RC.standC * v.y) * k;
      if (fy > 0) tb.applyImpulse({ x: 0, y: fy * dt, z: 0 }, true);
    }
    if (st === 'getup' && rs.t > RC.getupT && ang < 0.45) { rs.state = 'foot'; rs.t = 0; m.emit({ type: 'getup', i: f.i }); }
    if (st === 'getup' && rs.t > RC.getupT + 2.5) { tb.setRotation(yawQ(bodyYaw(q)), true); tb.setAngvel(v3(), true); }   // 끼었으면 일으켜 세움
    if (st === 'foot' && !frozen) {
      const mv = inp.move, fwF = fwdOf(f.aimYaw), rt = rightOf(f.aimYaw);
      let want = add(scale(fwF, mv[1]), scale(rt, mv[0]));
      const l = len(want); if (l > 1) want = scale(want, 1 / l);
      const running = inp.gallop && l > 0.1 && f.stam > 5;
      const sp = (running ? RC.run : RC.walk) * (dizzy ? 0.6 : 1) * (f.stagger > 0 ? 0.3 : 1) * (f.stam < 15 ? 0.75 : 1);
      if (running) drain(f, SA.run * dt);
      want = scale(want, sp);
      const dv = clampLen({ x: want.x - v.x, y: 0, z: want.z - v.z }, RC.footAccel * dt);
      if (p.y < RC.standY + 0.3) tb.applyImpulse(scale(dv, f.mass), true);
      if (edge('kick')) doKick(m, f);
      // E: 휘두르는 중이면 던지기, 무기가 없거나 가까이 있으면 줍기, 아니면 말에 타기
      if (edge('mount')) {
        if (inp.swing && f.weapon >= 0) throwWeapon(m, f);
        else if (f.weapon < 0 && tryPickup(m, f)) { /* 주웠다 */ }
        else if (!tryMount(m, f)) tryPickup(m, f);
      }
    }
  } else if (st === 'flying') {
    const v = tb.linvel();
    if ((rs.t > RC.flyMin && Math.hypot(v.x, v.y, v.z) < 1.5) || rs.t > RC.flyMax) { rs.state = 'getup'; rs.t = 0; removeRagdoll(m, f); }
  } else if (st === 'mounting') {
    const h = m.horses[rs.mountK], k = clamp(rs.t / RC.mountT, 0, 1), target = saddleWorld(h);
    const from = rs.from, ease = k * k * (3 - 2 * k);
    const p = { x: from.x + (target.x - from.x) * ease, y: from.y + (target.y - from.y) * ease + Math.sin(k * Math.PI) * 0.6, z: from.z + (target.z - from.z) * ease };
    tb.setTranslation(p, true); tb.setLinvel(h.body.linvel(), true); tb.setAngvel(v3(), true);
    tb.setRotation(yawQ(h.heading), true);
    if (k >= 1) { mountFighter(m, f, rs.mountK, false); m.emit({ type: 'mount', i: f.i, k: h.k }); }
  }
  // 말 위에서 E: 휘두르는 중이면 던지기, 아니면 (말이 느릴 때) 몸을 숙여 줍기
  if (st === 'mounted' && edge('mount') && !frozen) {
    if (inp.swing && f.weapon >= 0) throwWeapon(m, f);
    else tryPickup(m, f);
  }
  // 잡기 (Q)
  if ((st === 'mounted' || st === 'foot') && !frozen && edge('grab')) tryGrab(m, f);
  updateGrab(m, f, dt);

  // 마법 — 지팡이가 있어야 한다. 슬롯별 누르는 법은 magic.js(castStep)가 맡는다
  const canCast = (rs.state === 'mounted' || rs.state === 'foot') && !inp.duck && !inp.thrust && !frozen && f.weapon >= 0;
  m.castStep(f, dt, canCast);
  if (inp.swing && !f.prevInput.swing) f.stats.swings++;
  if (inp.thrust && !f.prevInput.thrust) f.stats.thrusts++;
  // 기운: 빠르게 휘두르거나 찌르면 줄고, 쉬면 찬다
  if (inp.swing && f.staff.tipSpeed > 7) drain(f, SA.swing * (f.staff.tipSpeed / 12) * dt);
  if (inp.thrust) drain(f, Math.max(0, inp.reach - (f.prevInput.reach || 0)) * SA.thrust);
  f.stamIdle += dt;
  if (f.stamIdle > SA.regenDelay) f.stam = Math.min(100, f.stam + SA.regen * (dizzy ? 0.5 : 1) * dt);
  f.mana = kineticEnergy(m, f);
  controlStaff(m, f, dt);
}
const ang0 = (up) => Math.acos(clamp(up.y, -1, 1));

function tryMount(m, f) {
  const hip = f.rider.body.translation();
  let best = -1, bd = CFG.rider.mountDist;
  for (const h of m.horses) {
    if (h.rider >= 0 || (h.reserved >= 0 && h.reserved !== f.i)) continue;
    const v = h.body.linvel();
    if (Math.hypot(v.x, v.z) > CFG.rider.mountSpeed) continue;
    const d = hdist(hip, h.body.translation());
    if (d < bd + 0.6) { bd = d; best = h.k; }
  }
  if (best < 0) { if (f.isPlayer) m.emit({ type: 'mountFail', i: f.i }); return false; }
  releaseGrab(m, f);
  const h = m.horses[best];
  h.reserved = f.i; h.panicT = 0; h.cruise = 0;
  f.rider.state = 'mounting'; f.rider.t = 0; f.rider.mountK = best; f.rider.from = { ...hip };
  setRiderGroups(f);
  return true;
}

// 무기 목표 자세: 경계 / 휘두르기 / 찌르기 / 마력 모으기 / 숙이기. 주먹이면 손 위치가 곧 목표
export function staffTarget(m, f) {
  const SC = CFG.staff, tb = f.rider.body, inp = f.input, wpn = f.staff;
  const S = shoulderWorld(f);
  const fw = fwdOf(f.aimYaw), rt = rightOf(f.aimYaw);
  let G, D, mode = 'guard';
  if (f.charging) {
    mode = 'charge';
    G = add(S, add(scale(fw, 0.45), add(scale(Y, -0.02), scale(rt, 0.05))));
    D = f.aimDir;
  } else if (inp.thrust) {   // 창처럼 겨누고, reach로 내뻗는다
    mode = 'thrust';
    const r = clamp(inp.reach, -1, 1);
    G = add(S, add(scale(rt, wpn.isFist ? 0.05 : 0.16), add(scale(fw, 0.34 + 0.38 * r), scale(Y, -0.08))));
    D = norm(add(f.aimDir, scale(Y, -0.03)));
  } else if (inp.swing) {
    mode = 'swing';
    const hx = clamp(inp.hand[0], -1, 1), hy = clamp(inp.hand[1], -1, 1), r2 = hx * hx + hy * hy;
    G = add(S, add(scale(rt, hx * 0.7 - 0.05), add(scale(Y, hy * 0.5 - 0.05), scale(fw, 0.42 - 0.12 * r2))));
    const Pv = sub(S, add(scale(rt, 0.25), add(scale(Y, 0.25), scale(fw, 0.1))));   // 회전 중심: 지팡이가 손을 지나 바깥으로 뻗는다
    D = norm(sub(G, Pv));
  } else if (inp.duck) {
    G = add(S, add(scale(rt, 0.1), add(scale(fw, 0.3), scale(Y, -0.2))));
    D = norm(add(scale(fw, 0.9), scale(Y, 0.2)));
  } else if (wpn.isFist) {   // 맨손 경계: 주먹을 가슴 앞에
    G = add(S, add(scale(rt, 0.12), add(scale(fw, 0.32), scale(Y, -0.1))));
    D = fw;
  } else {   // 경계 자세: 오른쪽 앞에서 비스듬히 세운다 (1인칭 얼굴을 가리지 않게)
    G = add(S, add(scale(rt, 0.22), add(scale(fw, 0.42), scale(Y, -0.2))));
    D = norm(add(scale(fw, 0.55), add(scale(Y, 0.75), scale(rt, 0.3))));
  }
  const C = wpn.isFist ? G : add(G, scale(D, wpn.len * SC.gripFrac));
  return { S, G, D, C, mode };
}

function controlStaff(m, f, dt) {
  const SC = CFG.staff, st = f.staff, sb = st.body, tb = f.rider.body, rs = f.rider.state;
  const { S, D, C } = staffTarget(m, f);
  const limp = rs === 'ko' ? 0 : rs === 'flying' ? 0.12 : rs === 'getup' || rs === 'mounting' ? 0.5 : 1;
  const power = limp * strength(f);
  const mass = st.mass;
  let vt = st.prevC ? scale(sub(C, st.prevC), 1 / dt) : v3();
  vt = clampLen(vt, 30); st.prevC = C;
  const c = sb.translation(), v = sb.linvel();
  if (limp > 0) {
    let F = scale(add(scale(sub(C, c), SC.kp), scale(sub(vt, v), SC.kd)), mass);
    F = clampLen(F, SC.fMax * power);
    F.y += mass * 9.81 * limp;
    sb.applyImpulse(scale(F, dt), true);
    const react = { x: -F.x, y: -(F.y - mass * 9.81 * limp), z: -F.z };
    tb.applyImpulseAtPoint(scale(react, dt * SC.reaction), S, true);
    if (!st.isFist) {
      // 방향 PD는 지팡이 축에 수직인 회전만 다룬다. 축을 따라 도는 회전(롤)은 관성이 수백 배 작아서
      // 같은 이득으로 누르면 매 틱 넘쳐 팽이처럼 돌고(약 45 rad/s), 자이로 효과로 조준이 9~20° 틀어졌다
      const a = qRotate(sb.rotation(), Y), e = cross(a, D), s = len(e), ang = Math.atan2(s, dot(a, D));
      const axis = s > 1e-6 ? scale(e, 1 / s) : v3(), wv = sb.angvel();
      const wRoll = dot(wv, a), wPerp = sub(wv, scale(a, wRoll));
      const I = mass * st.len * st.len / 12, Iroll = 0.5 * mass * SC.radius * SC.radius;
      const tau = clampLen(scale(sub(scale(axis, SC.rKp * ang), scale(wPerp, SC.rKd)), I), SC.tauMax * power);
      sb.applyTorqueImpulse(scale(add(tau, scale(a, -wRoll * Iroll * 0.5 / dt)), dt), true);   // 롤은 자기 관성으로 절반씩 멈춘다
    }
  }
  // 무기 끝 속도(기수 몸 기준) — 되받아치기 판정·무장 해제·소리용
  const tip = staffTip(f), r = sub(tip, c), wv = sb.angvel();
  const vTip = add(sb.linvel(), cross(wv, r)), vb = tb.linvel();
  st.tipSpeed = len(sub(vTip, vb));
}
export function weaponTip(w) {
  const sb = w.body;
  return add(sb.translation(), qRotate(sb.rotation(), { x: 0, y: w.tipY, z: 0 }));
}
export const staffTip = (f) => weaponTip(f.staff);

// 떨어진·던진 무기: 비행 시간, 던진 사람 제외 시간
export function updateLooseWeapons(m, dt) {
  for (const w of m.weapons) {
    if (w.holder >= 0) continue;
    w.looseT += dt;
    if (w.thrownBy >= 0) { w.flightT += dt; if (w.flightT > CFG.throw.flight) w.thrownBy = -1; }
    if (w.graceT > 0) { w.graceT -= dt; if (w.graceT <= 0) setWeaponGroups(m, w); }
  }
}

// 빙판에서 급히 틀다 미끄러짐: 말은 비틀거리고 기수는 하던 속도로 떨어진다
function slipOnIce(m, h, rider) {
  const S = SPELLS.ice, v = h.body.linvel();
  h.slipCd = 1.5; h.stagger = Math.max(h.stagger, 1.0);
  h.fear = Math.min(100, h.fear + S.slipFear * h.def.fearGain);
  tag(m, rider, h.iceBy, 'ice');
  m.emit({ type: 'slip', k: h.k, i: rider.i, pos: h.body.translation() });
  unhorse(m, rider, 'ice');
  rider.rider.body.setLinvel({ x: v.x, y: 2.5, z: v.z }, true);
}

// 말 제어: 탄 사람의 입력, 주인 잃은 말의 질주, 쉬는 말
export function controlHorse(m, h, dt) {
  const H = CFG.horse, def = h.def, b = h.body, HS = CFG.horseStam;
  const q = b.rotation(); h.heading = yawOfQ(q);
  const fw = fwdOf(h.heading), rt = rightOf(h.heading), v = b.linvel();
  const fwd = v.x * fw.x + v.z * fw.z, side = v.x * rt.x + v.z * rt.z;
  h.speed = Math.hypot(v.x, v.z);
  h.gait += (h.speed / (1.4 + h.speed * 0.2)) * dt;   // 걸음 박자 (보기·들썩임)
  const rider = h.rider >= 0 ? m.fighters[h.rider] : null;
  const gear = rider ? ITEMS[rider.loadout.gear] : ITEMS.nogear;
  const accel = def.accel * (gear.accelMul || 1), speedMul = (gear.speedMul || 1) * (rider ? rider.speedMul || 1 : 1);
  const fearCut = 1 - CFG.fear.speedCut * h.fear / 100;
  let steer = 0, galloping = false;
  if (m.t < 0) {
    h.cruise = 0;
  } else if (rider && rider.rider.state === 'mounted') {
    const inp = rider.input, gallop = inp.gallop && !inp.duck && !h.winded;
    const cap = (gallop ? def.gallop : def.cruise) * speedMul * fearCut;
    if (inp.move[1] > 0.1) h.cruise = Math.min(cap, h.cruise + accel * inp.move[1] * dt);
    else if (inp.move[1] < -0.1) h.cruise = Math.max(H.reverse, h.cruise + accel * H.brake * inp.move[1] * dt);
    if (h.cruise > cap) h.cruise = Math.max(cap, h.cruise - 3 * dt);
    if (gallop && fwd > def.cruise * 0.9) { galloping = true; h.fear = Math.min(100, h.fear + CFG.fear.gallop * (gear.fearMul || 1) * dt); }
    steer = inp.move[0];
    // 공포가 넘치면 날뛴다
    if (h.fear > CFG.fear.buck) {
      h.buckT -= dt;
      if (h.buckT <= 0) {
        h.buckT = CFG.fear.buckEvery;
        const a = m.rng.range(0, Math.PI * 2), J = CFG.fear.buckJ;
        rider.rider.body.applyTorqueImpulse({ x: Math.cos(a) * J, y: 0, z: Math.sin(a) * J }, true);
        h.cruise *= 0.7;
        m.emit({ type: 'buck', k: h.k, i: rider.i });
      }
    }
  } else if (h.reserved >= 0 || h.held >= 0) {
    h.cruise = 0; h.panicT = 0;
  } else if (h.panicT > 0) {
    h.panicT -= dt;
    h.cruise = Math.min(H.panicSpeed * Math.min(1, def.gallop / 15), h.cruise + accel * dt);
    h.wanderT -= dt;
    if (h.wanderT <= 0) { h.wanderT = m.rng.range(0.8, 1.6); h.wanderYaw = h.heading + m.rng.range(-1.2, 1.2); }
    steer = steerToward(h, avoidFence(m, h, h.wanderYaw, 9));
  } else {
    h.cruise = Math.max(0, h.cruise - 4 * dt);
    if (h.speed > 1) steer = steerToward(h, avoidFence(m, h, h.heading, 6));
  }
  // 말의 숨: 질주하면 줄고, 바닥나면 숨이 돌아올 때까지 질주를 못 한다
  if (galloping) h.stam = Math.max(0, h.stam - HS.gallop * dt);
  else h.stam = Math.min(100, h.stam + (h.speed < 5 ? HS.regenSlow : HS.regenCruise) * dt);
  if (!h.winded && h.stam <= 0) { h.winded = true; m.emit({ type: 'winded', k: h.k, i: h.rider }); }
  if (h.winded && h.stam >= HS.recover) h.winded = false;
  h.slipCd = Math.max(0, (h.slipCd || 0) - dt);
  // 빙판: 속도 따라잡기·옆 미끄럼 잡기·회전을 줄여 하던 속도로 미끄러진다. 빠르게 달리며 급히 틀면 넘어진다
  const ice = h.onIce ? SPELLS.ice.grip : 1;
  if (h.onIce && rider && rider.rider.state === 'mounted' && h.speed > SPELLS.ice.slipV && Math.abs(steer) > SPELLS.ice.slipTurn && h.slipCd <= 0) slipOnIce(m, h, rider);
  h.fear = Math.max(0, h.fear - CFG.fear.decay * dt);
  if (h.stagger > 0) { h.stagger -= dt; return; }
  const dv = clamp(h.cruise - fwd, -accel * 2.5 * dt * ice, accel * dt * ice);
  const nf = fwd + dv, ns = side * Math.max(0, 1 - H.grip * ice * dt);
  b.setLinvel({ x: fw.x * nf + rt.x * ns, y: v.y, z: fw.z * nf + rt.z * ns }, true);
  const turnMax = def.turn / (1 + Math.abs(fwd) / 9) * ice;
  b.setAngvel({ x: 0, y: -clamp(steer, -1, 1) * turnMax, z: 0 }, true);
}
// 원하는 요로 돌리는 조향값 (오른쪽 = +1)
export function steerToward(h, yaw) { return clamp(-wrapAngle(yaw - h.heading) * 2.2, -1, 1); }
// 울타리 가까우면 원하는 방향을 중앙 쪽으로 섞는다
export function avoidFence(m, h, yaw, margin) {
  const p = h.body.translation(), r = Math.hypot(p.x, p.z), lim = m.fenceR - margin;
  if (r < lim) return yaw;
  const toC = Math.atan2(-p.x, -p.z), k = clamp((r - lim) / margin, 0, 1);
  const d = wrapAngle(toC - yaw);
  return yaw + d * k;
}
