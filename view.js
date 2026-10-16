// 보기: 시뮬 상태를 프레임(스냅샷)으로 떠서 그린다. 같은 프레임으로 다시 보기(리플레이)도 그린다
// 무기 · 래그돌 팔다리 · 머리 젖힘 용수철 · 혹 · 잡기 팔 · 발차기 다리
import * as THREE from 'three';
import { CFG, CHARS } from './config.js';
import { LIMB_NAMES, grabPoint } from './fighter.js';
import { buildHorse, animateHorse, buildWizard, buildLimbs, buildStaff, placeSeg, solveIK, glowSprite, part, toon } from './models.js';
import { pickVfxEvents } from './vfxEvents.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const cp = (o) => ({ x: o.x, y: o.y, z: o.z });
const cq = (o) => ({ x: o.x, y: o.y, z: o.z, w: o.w });

// ---------- 프레임 ----------
export function makeFrame(m, evs = null) {
  const fr = {
    tick: m.tick, t: m.t, fenceR: m.fenceR,
    horses: m.horses.map((h) => ({ p: cp(h.body.translation()), q: cq(h.body.rotation()), speed: h.speed, fear: h.fear, gait: h.gait })),
    fighters: m.fighters.map((f) => ({
      p: cp(f.rider.body.translation()), q: cq(f.rider.body.rotation()), state: f.rider.state, horse: f.horse, conscious: f.rider.conscious,
      mana: f.mana, charging: f.charging, charge: f.charge, stam: f.stam, aimYaw: f.aimYaw, aimPitch: f.aimPitch, kickT: f.kickT,
      weapon: f.weapon, fist: f.fist, tipSpeed: f.staff ? f.staff.tipSpeed : 0, thrust: !!f.input.thrust,
      grab: f.grab ? cp(grabPoint(m, f)) : null, vel: cp(f.rider.body.linvel()),
      limbs: f.ragdoll ? f.ragdoll.map((L) => ({ p: cp(L.body.translation()), q: cq(L.body.rotation()), hl: L.hl })) : null,
    })),
    weapons: m.weapons.map((w) => ({ p: cp(w.body.translation()), q: cq(w.body.rotation()), holder: w.holder, on: w.isFist ? w.holder >= 0 : true })),
    props: m.props.map((p) => ({ p: cp(p.body.translation()), q: cq(p.body.rotation()) })),
    spells: m.spells.map((s) => ({ id: s.id, pos: cp(s.pos), vel: cp(s.vel), r: s.r, owner: s.owner, kind: s.kind || 'orb' })),
    zones: m.zones.map((z) => ({ id: z.id, kind: z.kind, a: { x: z.a.x, z: z.a.z }, b: { x: z.b.x, z: z.b.z }, r: z.r, t: z.t, life: z.life })),
    walls: m.walls.map((w) => ({ id: w.id, p: cp(w.body.translation()), yaw: w.yaw, w: w.w, h: w.h })),
    tornados: m.tornados.map((t) => ({ id: t.id, x: t.pos.x, z: t.pos.z, fire: t.fire, t: t.t })),
    fissures: m.fissures.map((s) => ({ id: s.id, o: { x: s.o.x, z: s.o.z }, dir: { x: s.dir.x, z: s.dir.z }, front: s.front, len: s.len })),
    whips: m.fighters.map((f) => (f.whip ? f.whip.j : -1)),
  };
  const ev = evs ? pickVfxEvents(evs) : null;   // 원소 이벤트: 다시 보기가 순간 효과를 다시 낸다
  if (ev) fr.ev = ev;
  return fr;
}
const _pa = V(), _pb = V(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
function lerpT(a, b, t, outP, outQ) {
  outP.set(a.p.x + (b.p.x - a.p.x) * t, a.p.y + (b.p.y - a.p.y) * t, a.p.z + (b.p.z - a.p.z) * t);
  _qa.set(a.q.x, a.q.y, a.q.z, a.q.w); _qb.set(b.q.x, b.q.y, b.q.z, b.q.w);
  outQ.slerpQuaternions(_qa, _qb, t);
}

// ---------- 비주얼 만들기 ----------
export function buildVisuals(scene, m) {
  const g = new THREE.Group(); scene.add(g);
  const vis = { group: g, horses: [], fighters: [], weapons: [], props: [] };
  for (const h of m.horses) {
    const hv = buildHorse(h.defKey, m.fighters[h.k].ch.color); g.add(hv.root);
    vis.horses.push({ hv, gaitI: undefined, dustT: 0, P: V(), Q: new THREE.Quaternion() });
  }
  for (const f of m.fighters) {
    const w = buildWizard(f.char, f.loadout, f.job); g.add(w.root);
    const limbs = buildLimbs(f.ch); g.add(limbs.group);
    const stars = new THREE.Group(); for (let k = 0; k < 3; k++) stars.add(glowSprite(0xffe14d, 0.22)); g.add(stars);
    vis.fighters.push({ w, limbs, stars, hatOn: true, walk: 0, hs: { x: 0, z: 0, vx: 0, vz: 0 }, bumps: 0, P: V(), Q: new THREE.Quaternion(), blend: 0, lastLimbs: null });
  }
  for (const wpn of m.weapons) {
    if (wpn.isFist) { vis.weapons.push(null); continue; }
    const st = buildStaff(wpn.itemId); g.add(st.group);
    vis.weapons.push(st);
  }
  for (const p of m.props) {
    const pg = new THREE.Group(); g.add(pg);
    if (p.kind === 'hay') {
      part(new THREE.CylinderGeometry(0.55, 0.55, 0.9, 16), 0xe2c169, pg, { outline: 0.02 });
      for (const y of [-0.25, 0.25]) part(new THREE.TorusGeometry(0.56, 0.02, 4, 18), 0xa8823a, pg, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    } else {
      part(new THREE.CylinderGeometry(0.28, 0.3, 0.9, 14), 0x8a5a32, pg, { outline: 0.02 });
      for (const y of [-0.32, 0, 0.32]) part(new THREE.TorusGeometry(0.3, 0.022, 4, 16), 0x5a5f66, pg, { pos: [0, y, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    }
    vis.props.push(pg);
  }
  return vis;
}
export function disposeVisuals(scene, vis) {
  if (!vis) return;
  scene.remove(vis.group);
  vis.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
}

// ---------- 그리기 ----------
const _a = V(), _b = V(), _c = V(), _pole = V(), _tmp = V(), _e = V(), _hand = V(), _d = V();
const T = { p: V(), q: new THREE.Quaternion() }, H = { p: V(), q: new THREE.Quaternion() }, Wt = { p: V(), q: new THREE.Quaternion() };
const local = (t, x, y, z, out = V()) => out.set(x, y, z).applyQuaternion(t.q).add(t.p);
function poseLimb(seg2, S, Tg, la, lb, pole) {
  const end = solveIK(S, Tg.clone(), la, lb, pole, _e);
  placeSeg(seg2.upper, S, _e); placeSeg(seg2.lower, _e, end);
  return end;
}
const LIMB_MAP = { uaR: ['R', 'upper'], faR: ['R', 'lower'], uaL: ['L', 'upper'], faL: ['L', 'lower'], thR: ['legR', 'upper'], shR: ['legR', 'lower'], thL: ['legL', 'upper'], shL: ['legL', 'lower'] };

// ctx: { dt, t, player, view, hooves(fn), camPos }
export function renderFrames(vis, A, B, alpha, ctx) {
  const { dt, t } = ctx;
  // 말
  A.horses.forEach((ha, k) => {
    const hb = B.horses[k], s = vis.horses[k], hv = s.hv;
    lerpT(ha, hb, alpha, s.P, s.Q);
    hv.root.position.copy(s.P); hv.root.quaternion.copy(s.Q);
    animateHorse(hv, hb.speed, dt, hb.fear, t, hb.gait);
    if (ctx.hooves) ctx.hooves(k, s, hb);
  });
  // 무기
  A.weapons.forEach((wa, id) => {
    const st = vis.weapons[id]; if (!st) return;
    const wb = B.weapons[id];
    lerpT(wa, wb, alpha, st.group.position, st.group.quaternion);
  });
  // 소품
  A.props.forEach((pa, k) => { lerpT(pa, B.props[k], alpha, vis.props[k].position, vis.props[k].quaternion); });
  // 기수
  A.fighters.forEach((fa, i) => {
    const fb = B.fighters[i], s = vis.fighters[i], w = s.w, big = w.big;
    lerpT(fa, fb, alpha, T.p, T.q);
    w.root.position.copy(T.p); w.root.quaternion.copy(T.q);
    const st = fb.state;
    // 머리 젖힘 용수철 (맞으면 튕긴다)
    const hs = s.hs; hs.vx += (-60 * hs.x - 9 * hs.vx) * dt; hs.vz += (-60 * hs.z - 9 * hs.vz) * dt; hs.x += hs.vx * dt; hs.z += hs.vz * dt;
    w.head.rotation.set(hs.x, 0, hs.z);
    // 지팡이 빛: 마력(속도)이 클수록 밝다 — "더 밝은 쪽이 이긴다"
    const wid = fb.weapon;
    if (wid >= 0 && vis.weapons[wid]) {
      const stv = vis.weapons[wid];
      const Ef = Math.min(1, fb.mana / CFG.spell.eRef), ch = fb.charging ? fb.charge / CFG.spell.fMax : 0;
      const pulse = ch ? 1 + Math.sin(t * 30) * 0.15 * ch : 1;
      stv.glow.scale.setScalar((0.22 + Ef * 0.9 + ch * 1.4) * pulse * (i === ctx.player && ctx.view === 'fp' ? 0.38 : 1));
      stv.glow.material.opacity = 0.35 + Ef * 0.5 + ch * 0.4;
      stv.tipMat.color.copy(stv.base).lerp(new THREE.Color(0xffffff), Math.min(1, Ef * 0.7 + ch));
      stv.tip.scale.set(1 + ch * 0.8, 1.5 + ch, 1 + ch * 0.8);
    }
    // 내려놓은(주인 없는) 지팡이는 빛을 줄인다
    const limbsOn = !!(fb.limbs && fa.limbs);
    if (limbsOn) {
      // 래그돌: 팔다리를 물리 마디 그대로 놓는다
      fb.limbs.forEach((Lb, k) => {
        const La = fa.limbs[k], name = LIMB_NAMES[k], [grp, seg] = LIMB_MAP[name];
        lerpT(La, Lb, alpha, Wt.p, Wt.q);
        const top = local(Wt, 0, Lb.hl, 0, _a), bot = local(Wt, 0, -Lb.hl, 0, _b);
        placeSeg(s.limbs[grp][seg], top, bot);
        if (seg === 'lower') { if (s.limbs[grp].hand) s.limbs[grp].hand.position.copy(bot); if (s.limbs[grp].foot) { s.limbs[grp].foot.position.copy(bot); s.limbs[grp].foot.quaternion.copy(Wt.q); } }
      });
      s.blend = 1;
    } else {
      // 오른손: 쥔 지팡이 손잡이, 맨손이면 주먹 위치
      const sR = local(T, -0.2 * big, 0.66, 0.06, _a), sL = local(T, 0.2 * big, 0.66, 0.06, _b);
      let grip;
      if (wid >= 0) { lerpT(A.weapons[wid], B.weapons[wid], alpha, Wt.p, Wt.q); const len = vis.weapons[wid] ? vis.weapons[wid].len : 1.4; grip = local(Wt, 0, -len * CFG.staff.gripFrac, 0, _hand); }
      else { lerpT(A.weapons[fb.fist], B.weapons[fb.fist], alpha, Wt.p, Wt.q); grip = _hand.copy(Wt.p); }
      _pole.set(-0.8, -0.8, -0.5).applyQuaternion(T.q);
      const handR = poseLimb(s.limbs.R, sR, grip, 0.33, 0.31, _pole); s.limbs.R.hand.position.copy(handR);
      s.limbs.R.hand.scale.setScalar(wid >= 0 ? 1 : 1.35);   // 맨손이면 주먹을 크게
      // 왼손: 잡기 > 고삐 > 걷기
      let lh;
      if (fb.grab) lh = _c.set(fb.grab.x, fb.grab.y, fb.grab.z);
      else if (st === 'mounted' && fb.horse >= 0) {
        const hs2 = vis.horses[fb.horse];
        H.p.copy(hs2.P); H.q.copy(hs2.Q);
        const sc = hs2.hv.s; lh = local(H, 0.06, 0.72 * sc, 0.42 * sc, _c);
      } else if (st === 'foot' || st === 'getup') {
        s.walk += dt * Math.hypot(fb.vel.x, fb.vel.z) * 2.2;
        lh = local(T, 0.32, 0.32 + Math.sin(s.walk) * 0.08, 0.12 + Math.cos(s.walk) * 0.14, _c);
      } else lh = local(T, 0.45, 0.8 + Math.sin(t * 11 + i) * 0.25, Math.sin(t * 9 + i) * 0.3, _c);
      _pole.set(0.8, -0.8, -0.5).applyQuaternion(T.q);
      const handL = poseLimb(s.limbs.L, sL, lh, 0.33, 0.31, _pole); s.limbs.L.hand.position.copy(handL);
      // 다리
      for (const side of [1, -1]) {
        const leg = side > 0 ? s.limbs.legL : s.limbs.legR;
        const hip = local(T, 0.12 * side * big, 0.0, 0, _d);
        let foot, footQ = T.q;
        if (st === 'mounted' && fb.horse >= 0) {
          const hs2 = vis.horses[fb.horse], sc = hs2.hv.s; H.p.copy(hs2.P); H.q.copy(hs2.Q);
          foot = local(H, 0.47 * sc * side, (0.47 - 0.95) * sc, 0.0, V());
          _pole.set(0.3 * side, 0, 1).applyQuaternion(H.q); footQ = H.q;
        } else if (st === 'foot' || st === 'getup' || st === 'mounting') {
          const ph = s.walk + (side > 0 ? 0 : Math.PI), k = Math.min(1, Math.hypot(fb.vel.x, fb.vel.z) / 4);
          foot = local(T, 0.13 * side, -0.86 + Math.max(0, Math.cos(ph)) * 0.12 * k, Math.sin(ph) * 0.28 * k, V());
          if (side < 0 && fb.kickT > 0) foot = local(T, -0.1, -0.35, 0.8, V());   // 오른발 차기
          _pole.set(0, 0, 1).applyQuaternion(T.q);
        } else {
          foot = local(T, 0.2 * side, -0.78, Math.sin(t * 8 + side) * 0.35, V());
          _pole.set(0, 0, 1).applyQuaternion(T.q);
        }
        const end = poseLimb(leg, hip, foot, 0.43, 0.43, _pole);
        leg.foot.position.copy(end); leg.foot.quaternion.copy(footQ);
      }
    }
    // 어지러움 별
    const dizzy = st === 'ko' || fb.conscious < CFG.mind.dizzy;
    s.stars.visible = dizzy;
    if (dizzy) { const hp = local(T, 0, 1.25, 0, _tmp); s.stars.children.forEach((c, k) => { const a = t * 5 + k * 2.1; c.position.set(hp.x + Math.cos(a) * 0.28, hp.y + Math.sin(t * 7 + k) * 0.04, hp.z + Math.sin(a) * 0.28); }); }
    // 1인칭이면 내 머리는 숨긴다
    w.head.visible = !(i === ctx.player && ctx.view === 'fp' && !ctx.replay);
    tickFlash(s, ctx.rdt ?? dt);
  });
}

// 맞은 몸 번쩍임: 잠깐 몸 전체를 흰색(크게 맞으면 붉은색)으로 바꾼다
const FLASH_W = new THREE.MeshBasicMaterial({ color: 0xffffff }), FLASH_R = new THREE.MeshBasicMaterial({ color: 0xff8a7a });
export function flashFighter(vis, i, amount) {
  const s = vis && vis.fighters[i]; if (!s) return;
  if (!s.flashMeshes) {
    s.flashMeshes = [];
    for (const g of [s.w.root, s.limbs.group]) g.traverse((o) => { if (o.isMesh && !o.userData.outline) s.flashMeshes.push({ mesh: o, mat: o.material }); });
  }
  s.flashT = Math.max(s.flashT || 0, 0.09 + Math.min(0.09, amount / 250));
  s.flashMat = amount > 18 ? FLASH_R : FLASH_W;
}
function tickFlash(s, rdt) {
  if (!s.flashMeshes) return;
  const on = s.flashT > 0;
  if (on) s.flashT -= rdt;
  if (on && !s.flashOn) { for (const fm of s.flashMeshes) fm.mesh.material = s.flashMat; s.flashOn = true; }
  else if (!on && s.flashOn) { for (const fm of s.flashMeshes) fm.mesh.material = fm.mat; s.flashOn = false; }
}

// 머리 젖힘: 맞은 방향으로 튕긴다 (보기용)
export function headKick(vis, i, dirWorld, power, rootQ) {
  const s = vis.fighters[i]; if (!s) return;
  const inv = rootQ.clone().invert(), d = dirWorld.clone().applyQuaternion(inv);
  s.hs.vx += d.z * power; s.hs.vz += -d.x * power;
}
// 혹: 머리를 세게 맞은 자리에 부풀어 오른다 (유혈 대신)
export function addBump(vis, i, hitWorld) {
  const s = vis.fighters[i]; if (!s || s.bumps >= 4) return;
  const head = s.w.head;
  head.updateMatrixWorld(true);
  const lp = head.worldToLocal(hitWorld.clone());
  if (lp.length() < 1e-3) lp.set(0, 1, 0);
  lp.normalize().multiplyScalar(0.165);
  if (lp.y < -0.05) lp.y = 0.06;
  const bump = part(new THREE.SphereGeometry(0.05, 10, 8), 0xf09080, head, { pos: [lp.x, lp.y, lp.z], outline: 0.008 });
  bump.scale.setScalar(0.2); bump.userData.grow = 1;
  s.bumps++;
  return bump;
}
