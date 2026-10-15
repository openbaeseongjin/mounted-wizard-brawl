// 쉬운 조작 (기본): 스틱 + 마법 · 휘두르기 두 버튼 + 피하기. 바운코처럼 표적 고르기·조준·휘두르는 궤적은 게임이 맡고
// 사람은 "언제"만 정한다. 결과는 AI와 같은 입력 구조(fighter.idleInput)라서 물리·판정은 고급 조작과 똑같다.
//  마법     누르고 있으면 모이면서 표적 쪽으로 겨눈다 → 조준선이 금색일 때 떼면 쏜다
//  휘두르기 닿는 거리면 바로 친다. 멀면 지팡이를 들어 겨누고 → 다가와 금색이 될 때 떼면 친다
//           같은 버튼이 상황에 따라 쳐내기(날아오는 마법) · 줍기 · 타기 · 찌르기(마상창) · 주먹으로 바뀐다
//  피하기   말 위 = 숙이기(누르는 동안), 걸을 때 = 발차기
//  스틱     말은 저절로 달린다(가만두면 구보). 끝까지 밀면 질주, 당기면 감속
import { CFG } from './config.js';
import { add, sub, scale, len, dot, clamp, wrapAngle, rightOf, hdist } from './rng.js';
import { idleInput, steerToward, shoulderWorld, avoidFence } from './fighter.js';

export const ASSIST = {
  cruise: 0.7,        // 스틱을 가만두면 이만큼 박차
  gallopAt: 0.85,     // 스틱을 이만큼 밀면 질주
  view: 1.25,         // 보는 방향 ±이 각(rad) 안의 상대만 표적
  range: 50,          // 표적 최대 거리 (m)
  // 휘두르기가 닿는 거리 = 오른쪽 어깨 → 상대 머리. 휘두를 때 무기 끝은 어깨에서 0.42 + 0.66 × 길이쯤 나간다
  // (실측: 나무 막대기 1.4 m면 나란히 선 상대와 약 1.1 m까지만 맞는다)
  reach0: 0.54, reachK: 0.66,
  lead: 0.12,         // 뗀 뒤 무기 끝이 상대 쪽을 지나는 데 걸리는 시간(초)
  passOff: 1.0,       // 휘두르기를 누르고 있으면 상대를 오른쪽(지팡이 쪽)에 두고 이만큼 옆을 스치게 몬다
  lanceReach0: 0.87, lanceReachK: 0.75,
  castGold: 0.3,      // 이만큼 모이면(최대 0.75) 금색
  castRange: 34,
  aimTol: 0.1,        // 조준 오차(rad)가 이 안이면 맞춘 것
  deflectT: 0.45,     // 날아오는 마법이 이 시간 안에 닿으면 쳐내기
  pickRange: 8,       // 맨손일 때 이 안의 지팡이를 줍는다
  mountRange: 14,     // 걸을 때 이 안의 빈 말에 탄다
};

export function createAssist(m, i) {
  const a = {
    target: -1, swingT: -1, side: 1, hy: 0, dur: 0.18, wind: 0.12, arming: false, thrustT: 0, couch: false,
    prev: { cast: false, swing: false, dodge: false }, flip: false,
    look: null,   // 버튼을 누르는 동안 보기를 이쪽으로 돌린다 [몸/말 기준 요, 피치]
    ui: { target: -1, mode: 'idle', prog: 0, gold: false, swingLabel: '휘두르기', castOk: true, dodgeLabel: '숙이기', aim: null },
  };
  const pos = (g) => g.rider.body.translation();
  const vel = (g) => (g.horse >= 0 ? m.horses[g.horse].body.linvel() : g.rider.body.linvel());
  const pulse = () => { a.flip = !a.flip; return a.flip; };   // E를 누르는 가장자리(edge)를 만든다

  function pickTarget(f, viewYaw, keep) {
    const me = pos(f), cur = m.fighters[a.target];
    if (keep && cur && !cur.out && cur !== f) return a.target;
    let best = -1, bs = -1e9;
    for (const g of m.fighters) {
      if (g === f || g.out) continue;
      const gp = pos(g), d = hdist(me, gp);
      if (d > ASSIST.range) continue;
      const ang = Math.abs(wrapAngle(Math.atan2(gp.x - me.x, gp.z - me.z) - viewYaw));
      const mine = g.i === a.target;
      if (ang > (mine ? ASSIST.view + 0.4 : ASSIST.view)) continue;
      const s = -ang * 1.5 - d / 25 + (mine ? 0.45 : 0) - (g.rider.state === 'ko' ? 3 : 0);
      if (s > bs) { bs = s; best = g.i; }
    }
    return best;
  }
  // 표적의 머리 쪽(마법은 날아가는 동안 움직일 만큼 앞을 노린다)
  function aimPoint(f, g, leadK) {
    const gp = pos(g), gv = vel(g), d = hdist(pos(f), gp), t = d * leadK;
    return { x: gp.x + gv.x * t, y: gp.y + (g.horse >= 0 ? 1.0 : 0.5), z: gp.z + gv.z * t };
  }
  function lookAt(f, P, fromShoulder = false) {   // 입력의 look(말 위면 말 기준 요). 휘두르기는 오른쪽 어깨를 중심으로 돈다
    const me = pos(f), eye = fromShoulder ? shoulderWorld(f) : { x: me.x, y: me.y + 1.0, z: me.z };
    const yaw = Math.atan2(P.x - eye.x, P.z - eye.z), pitch = Math.atan2(P.y - eye.y, Math.max(1, hdist(P, eye)));
    if (f.horse >= 0) return [clamp(wrapAngle(yaw - m.horses[f.horse].heading), -2, 2), clamp(pitch, -0.7, 0.6)];
    return [yaw, clamp(pitch, -0.7, 0.6)];
  }
  const aimErr = (f, want) => Math.abs(wrapAngle(f.input.look[0] - want[0])) + Math.abs(f.input.look[1] - want[1]) * 0.5;
  // 무기가 닿을 거리인가: 잠시 뒤 내 오른쪽 어깨 → 상대 머리
  function predDist(f, g, t) {
    const S = shoulderWorld(f), mv = vel(f), gp = pos(g), gv = vel(g);
    const hy = gp.y + (g.horse >= 0 ? 0.9 : 0.75);
    return Math.hypot(S.x + mv.x * t - (gp.x + gv.x * t), S.y - hy, S.z + mv.z * t - (gp.z + gv.z * t));
  }
  // 누르고 있는 동안: 상대가 오른쪽(지팡이 쪽)에 오도록 옆을 스치게 몬다. 스틱을 옆으로 세게 밀면 손으로 몬다
  function lineUp(f, g, inp, intent) {
    if (f.horse < 0 || Math.abs(intent.move[0]) > 0.5) return;
    const h = m.horses[f.horse], hp = h.body.translation(), gp = pos(g), gv = vel(g);
    const d = hdist(hp, gp), lead = clamp(d / 30, 0, 1) * 0.6;
    const pred = { x: gp.x + gv.x * lead, y: 0, z: gp.z + gv.z * lead };
    const toYaw = Math.atan2(pred.x - hp.x, pred.z - hp.z), perp = scale(rightOf(toYaw), -ASSIST.passOff);
    let want = Math.atan2(pred.x + perp.x - hp.x, pred.z + perp.z - hp.z);
    want = avoidFence(m, h, want, 8);
    inp.move = [steerToward(h, want), 1];
    inp.gallop = d > 12 && !h.winded && intent.move[1] > -0.2;
  }
  function swingSideHeight(f, P) {
    const me = pos(f), yaw = f.horse >= 0 ? m.horses[f.horse].heading : f.aimYaw;
    const side = dot(sub(P, me), rightOf(yaw)) >= 0 ? 1 : -1;
    const hy = clamp((P.y - 0.25 - (me.y + 0.66)) / 0.6, -0.9, 0.6);   // 상대 머리 높이에 맞춘다 (AI와 같은 식)
    return [side, hy];
  }
  function startSwing(side, hy, wind = 0.12, dur = 0.18) { a.swingT = 0; a.side = side; a.hy = hy; a.wind = wind; a.dur = dur; a.arming = false; }
  function swingStep(inp, dt) {
    if (a.swingT < 0) return false;
    a.swingT += dt;
    const k = (a.swingT - a.wind) / a.dur;
    inp.swing = true;
    inp.hand = a.swingT < a.wind ? [a.side, a.hy + 0.1] : [a.side * (1 - 2 * clamp(k, 0, 1)), a.hy];
    if (k > 1.6) a.swingT = -1;
    return true;
  }
  // 나에게 날아오는 마법 (쳐낼 쪽)
  function incoming(f) {
    const me = add(pos(f), { x: 0, y: 1.0, z: 0 }), mv = vel(f), yaw = f.horse >= 0 ? m.horses[f.horse].heading : f.aimYaw;
    for (const sp of m.spells) {
      if (sp.owner === f.i) continue;
      const rel = sub(sp.pos, me), rv = sub(sp.vel, mv), rv2 = dot(rv, rv);
      if (rv2 < 1) continue;
      const tc = -dot(rel, rv) / rv2;
      if (tc < 0 || tc > ASSIST.deflectT) continue;
      if (len(add(rel, scale(rv, tc))) > 1.8) continue;
      return { side: dot(rel, rightOf(yaw)) >= 0 ? 1 : -1, tc, sp };
    }
    return null;
  }
  // 마법이 내 오른쪽 어깨에서 r m 앞까지 오는 시간 (그만큼 안 오면 가장 가까워지는 시간)
  function meetTime(f, sp, r) {
    const S = shoulderWorld(f), rel = sub(sp.pos, S), rv = sub(sp.vel, vel(f));
    const A = dot(rv, rv), B = 2 * dot(rel, rv), C = dot(rel, rel) - r * r, D = B * B - 4 * A * C;
    if (A < 1e-6) return 0;
    if (D < 0) return Math.max(0, -dot(rel, rv) / A);
    return Math.max(0, (-B - Math.sqrt(D)) / (2 * A));
  }
  function nearLoose(f, range) {
    const me = pos(f); let best = null, bd = range;
    for (const w of m.weapons) {
      if (w.isFist || w.holder >= 0) continue;
      const d = hdist(me, w.body.translation());
      if (d < bd) { bd = d; best = w; }
    }
    return best ? { w: best, d: bd } : null;
  }
  function nearHorse(f, range) {
    const me = pos(f); let best = null, bd = range;
    for (const h of m.horses) {
      if (h.rider >= 0 || (h.reserved >= 0 && h.reserved !== f.i) || h.speed > 6) continue;
      const d = hdist(me, h.body.translation());
      if (d < bd) { bd = d; best = h; }
    }
    return best ? { h: best, d: bd } : null;
  }
  const foeWithin = (f, r) => m.fighters.some((g) => g !== f && !g.out && hdist(pos(f), pos(g)) < r);

  // intent: { move:[x,y], look:[요,피치] (손으로 돌린 보기), cast, swing, dodge } (누르고 있는지)
  function step(intent, dt) {
    const f = m.fighters[i], inp = idleInput(), st = f.rider.state, ui = a.ui;
    const pressed = (k) => intent[k] && !a.prev[k], released = (k) => !intent[k] && a.prev[k];
    const mounted = st === 'mounted', onFoot = st === 'foot', active = mounted || onFoot;
    inp.look = [intent.look[0], intent.look[1]];
    a.look = null;
    ui.mode = 'idle'; ui.prog = 0; ui.gold = false; ui.aim = null;
    // 움직임: 말은 저절로 달린다
    const [mx, my] = intent.move;
    if (mounted) {
      const h = m.horses[f.horse];
      inp.move = [mx, my < -0.2 ? my : Math.max(ASSIST.cruise, my)];
      inp.gallop = my >= ASSIST.gallopAt && !h.winded;
    } else { inp.move = [mx, my]; inp.gallop = Math.hypot(mx, my) >= ASSIST.gallopAt; }
    if (!active) { a.swingT = -1; a.arming = false; a.thrustT = 0; a.couch = false; a.prev = { cast: intent.cast, swing: intent.swing, dodge: intent.dodge }; ui.target = -1; return inp; }

    const viewYaw = mounted ? m.horses[f.horse].heading + intent.look[0] : intent.look[0];
    const busy = intent.cast || intent.swing || a.swingT >= 0 || a.thrustT > 0;
    a.target = pickTarget(f, viewYaw, busy);
    const g = a.target >= 0 ? m.fighters[a.target] : null;
    ui.target = a.target;
    const armed = f.weapon >= 0, lance = armed && (f.staff.item.thrustMul || 0) >= 1.4;

    // 휘두르기 버튼이 지금 하는 일
    const inc = armed ? incoming(f) : null;
    const loose = nearLoose(f, ASSIST.pickRange);
    const horse = onFoot ? nearHorse(f, ASSIST.mountRange) : null;
    let ctx = 'swing';
    if (inc) ctx = 'deflect';
    else if (loose && (!armed || loose.d < (mounted ? CFG.pickup.mounted : CFG.pickup.foot))) ctx = 'pickup';
    else if (horse && !foeWithin(f, 4)) ctx = 'mount';
    else if (lance && mounted) ctx = 'thrust';
    else if (!armed) ctx = 'fist';
    if (a.swingT >= 0 || a.arming || a.thrustT > 0 || a.couch) ctx = a.ctxHeld || ctx;   // 하던 동작은 끝까지
    ui.swingLabel = { swing: '휘두르기', deflect: '쳐내기', pickup: '줍기', mount: '타기', thrust: '찌르기', fist: '주먹' }[ctx];
    ui.castOk = armed;
    ui.dodgeLabel = mounted ? '숙이기' : '발차기';

    // 피하기
    if (mounted) inp.duck = intent.dodge;
    else if (pressed('dodge')) inp.kick = true;

    // ----- 휘두르기 버튼 -----
    const wl = f.staff.len || 0.3, reach = ASSIST.reach0 + ASSIST.reachK * wl, lanceReach = ASSIST.lanceReach0 + ASSIST.lanceReachK * wl;
    if (ctx === 'pickup' && intent.swing) {
      // 지팡이 쪽으로 가서(말이면 속도를 줄이며) 줍는다
      const wp = loose.w.body.translation(), me = pos(f), yawTo = Math.atan2(wp.x - me.x, wp.z - me.z);
      if (mounted) {
        const h = m.horses[f.horse];
        inp.move = [steerToward(h, yawTo), h.speed > CFG.pickup.mountedSpeed - 1 ? -1 : 0.3]; inp.gallop = false;
        if (loose.d < CFG.pickup.mounted - 0.2 && h.speed <= CFG.pickup.mountedSpeed) inp.mount = pulse();
      } else {
        inp.look = [yawTo, 0]; a.look = [yawTo, 0]; inp.move = [0, loose.d > 1.0 ? 1 : 0]; inp.gallop = loose.d > 5;
        if (loose.d < CFG.pickup.foot - 0.2) inp.mount = pulse();
      }
      ui.mode = 'pickup';
    } else if (ctx === 'mount' && intent.swing) {
      const hp = horse.h.body.translation(), me = pos(f), yawTo = Math.atan2(hp.x - me.x, hp.z - me.z);
      inp.look = [yawTo, 0]; a.look = [yawTo, 0]; inp.move = [0, horse.d > 2.0 ? 1 : 0]; inp.gallop = horse.d > 5;
      if (horse.d < CFG.rider.mountDist + 0.3) inp.mount = pulse();
      ui.mode = 'mount';
    } else if (ctx === 'deflect' && pressed('swing') && a.swingT < 0) {
      // 마법이 어깨에서 1 m쯤 앞에 올 때 휘두르는 한가운데가 그 점을 지나도록, 그쪽을 보며 들어 올린 채 기다린다
      const t = meetTime(f, inc.sp, 0.95), P = add(inc.sp.pos, scale(inc.sp.vel, t));
      const hy = clamp((P.y - 0.25 - (pos(f).y + 0.66)) / 0.6 + 0.15, -0.9, 0.6);   // 만날 점 높이에 맞춘다
      a.ctxHeld = 'deflect'; a.deflId = inc.sp.id;
      startSwing(inc.side, hy, clamp(t - 0.065, 0.02, 0.4), 0.13);
    } else if (ctx === 'thrust') {
      // 마상창: 누르고 있으면 겨누고, 닿을 거리(금색)에서 떼면 내지른다
      if (intent.swing) { a.couch = true; a.ctxHeld = 'thrust'; }
      if (a.couch || a.thrustT > 0) {
        inp.thrust = true; inp.reach = a.thrustT > 0 ? 1 : 0.1;
        if (g) { const P = aimPoint(f, g, 0); a.look = lookAt(f, P); inp.look = a.look.slice(); if (a.couch) lineUp(f, g, inp, intent); }
        const dp = g ? predDist(f, g, ASSIST.lead) : 99;
        ui.mode = 'arm'; ui.gold = dp < lanceReach; ui.prog = g ? clamp(1 - (dp - lanceReach) / 15, 0, 1) : 0;
        if (released('swing') && a.couch) { a.couch = false; a.thrustT = 0.35; }
      }
      a.thrustT = Math.max(0, a.thrustT - dt);
      if (!a.couch && a.thrustT <= 0) a.ctxHeld = null;
    } else if (ctx === 'swing' || ctx === 'fist' || ctx === 'deflect') {
      const P = g ? aimPoint(f, g, 0) : null;
      const dp = g ? predDist(f, g, ASSIST.lead) : 99, inReach = g && dp < reach && dp > 0.35;
      if (pressed('swing') && a.swingT < 0) {
        a.ctxHeld = ctx;
        if (inReach || !g) { const [s, hy] = P ? swingSideHeight(f, P) : [1, 0.25]; startSwing(s, hy); }
        else a.arming = true;   // 아직 멀다: 들어 올려 겨눈다
      }
      if (a.arming) {
        const [s, hy] = P ? swingSideHeight(f, P) : [a.side, 0.25];
        a.side = s; a.hy = hy;
        inp.swing = true; inp.hand = [s, hy + 0.1];
        ui.mode = 'arm'; ui.gold = !!inReach; ui.prog = g ? clamp(1 - (dp - reach) / 12, 0, 1) : 0;
        if (P) { a.look = lookAt(f, P); inp.look = a.look.slice(); lineUp(f, g, inp, intent); }
        if (!intent.swing) startSwing(a.side, a.hy, 0, 0.18);   // 뗐다: 이미 들어 올렸으니 바로 휘두른다
      }
    }
    if (swingStep(inp, dt)) {
      ui.mode = ui.mode === 'idle' ? 'swing' : ui.mode;
      const sp = a.ctxHeld === 'deflect' ? m.spells.find((x) => x.id === a.deflId) : null;
      let P = null;
      if (sp) { const t = Math.max(0, a.wind + a.dur * 0.5 - a.swingT); P = add(sp.pos, scale(sub(sp.vel, vel(f)), t)); P = add(P, vel(f)); }
      else if (g && a.ctxHeld !== 'deflect') P = aimPoint(f, g, 0);
      if (P) { a.look = lookAt(f, P, !!sp); inp.look = a.look.slice(); }
    }
    else if (!a.arming && !a.couch && a.thrustT <= 0) a.ctxHeld = null;

    // ----- 마법 버튼 ----- (뗀 직후 몇 틱도 계속 겨눈다: 쏘는 건 뗀 다음 틱이다)
    if (released('cast')) a.castAimT = 0.1;
    a.castAimT = Math.max(0, (a.castAimT || 0) - dt);
    if (armed && (intent.cast || a.castAimT > 0) && !inp.swing && !inp.thrust) {
      inp.charge = intent.cast;
      const P = g ? aimPoint(f, g, 1 / CFG.spell.speed) : null;
      if (P) { a.look = lookAt(f, P); inp.look = a.look.slice(); }
      const fr = f.charging ? f.charge : 0, d = g ? hdist(pos(f), pos(g)) : 99;
      ui.mode = 'charge'; ui.prog = clamp(fr / ASSIST.castGold, 0, 1);
      ui.gold = !!g && fr >= ASSIST.castGold && d < ASSIST.castRange && (!P || aimErr(f, lookAt(f, P)) < ASSIST.aimTol * 2);
    }
    if (g) ui.aim = aimPoint(f, g, 0);
    a.prev = { cast: intent.cast, swing: intent.swing, dodge: intent.dodge };
    return inp;
  }
  return { step, state: a, ui: a.ui };
}
