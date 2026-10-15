// 상대 AI: 플레이어와 같은 입력 구조를 만든다
// 성격: dummy 허수아비 / heavy 묵직이 / quick 번개 / sneaky 기회주의자 / rival 라이벌 / still 연습장 과녁
// v0.2: 근접 막기, 찌르기 돌진, 잡기, 무기 줍기, 던지기, 발차기
import { CFG, PERSONAS } from './config.js';
import { createRng, add, sub, scale, len, norm, clamp, dot, wrapAngle, fwdOf, rightOf, hdist } from './rng.js';
import { idleInput, steerToward, avoidFence, weaponTip } from './fighter.js';

export function createBrain(m, i, personaKey, seed) {
  const P = { ...PERSONAS[personaKey] };
  if (personaKey === 'rival' && m.opts.rivalMimic) {
    P.chargeGoal = clamp(m.opts.rivalMimic.chargeGoal, 0.15, 0.75);
    P.swing = clamp(m.opts.rivalMimic.swing, 0.3, 1);
  }
  const rng = createRng(seed);
  const b = { target: -1, decideT: 0, swingT: -1, swingSide: 1, swingDur: 0.2, castCd: rng.range(1.5, 3.5), passSide: rng.chance(0.5) ? 1 : -1,
    patrol: 1, seen: new Set(), lurkDir: rng.chance(0.5) ? 1 : -1, lookYaw: 0, flip: false, chargeGoal: P.chargeGoal,
    grabT: 0, grabCd: rng.range(2, 5), parryCd: 0, throwAt: -1, kickCd: 1, thrustT: 0 };

  const pos = (g) => g.rider.body.translation();
  const vel = (g) => (g.horse >= 0 ? m.horses[g.horse].body.linvel() : g.rider.body.linvel());
  const pulse = () => { b.flip = !b.flip; return b.flip; };   // 누르기 가장자리(edge)를 만들려고 번갈아 켠다

  function pickTarget(f) {
    const me = pos(f), others = m.fighters.filter((g) => g.i !== f.i && !g.out);
    if (!others.length || P.still) return -1;
    if (personaKey === 'dummy' || personaKey === 'rival') { const p = others.find((g) => g.isPlayer); if (p) return p.i; }
    if (personaKey === 'sneaky') {   // 다른 둘이 붙을 때까지 기다린다
      let fight = false;
      for (const a of others) for (const c of others) if (a.i < c.i && hdist(pos(a), pos(c)) < 10) fight = true;
      const weakOne = others.find((g) => g.horse < 0 || g.rider.conscious < 50 || g.weapon < 0);
      if (!fight && !weakOne && m.t < 60) return -1;
    }
    const W = { heavy: [1.6, 0.3, 0.2], quick: [1.0, 0.6, 0.3], sneaky: [0.5, 1.6, 0.2], rival: [1, 0.5, 0.5], dummy: [1, 0, 0] }[personaKey] || [1, 0.5, 0.3];
    let best = -1, bs = -1e9;
    for (const g of others) {
      const d = hdist(me, pos(g));
      const close = 1 - Math.min(d, 60) / 60;
      const sp = g.horse >= 0 ? m.horses[g.horse].speed : 0;
      const weak = (g.horse < 0 ? 0.6 : 0) + (g.weapon < 0 ? 0.3 : 0) + (1 - g.rider.conscious / 100) * 0.5 + (g.horse >= 0 ? (1 - Math.min(sp, 15) / 15) * 0.3 : 0);
      const threat = (g.stats.unhorsed + g.stats.kos) * 0.15 + (g.isPlayer ? 0.12 : 0);
      const s = W[0] * close + W[1] * weak + W[2] * threat + (g.i === b.target ? 0.25 : 0) + rng.range(0, 0.05);
      if (s > bs) { bs = s; best = g.i; }
    }
    return best;
  }

  // 휘두르기: 옆에서 반대쪽으로 쓸어 친다 (hand x: side → -side)
  function startSwing(side, hy) { b.swingT = 0; b.swingSide = side; b.swingHy = hy; b.swingDur = 0.16 + rng.range(0, 0.06); }
  function swingInput(inp, dt) {
    if (b.swingT < 0) return;
    b.swingT += dt;
    const wind = 0.12, k = (b.swingT - wind) / b.swingDur;
    inp.swing = true;
    if (b.swingT < wind) inp.hand = [b.swingSide * 1.0, b.swingHy + 0.1];
    else inp.hand = [b.swingSide * (1 - 2 * clamp(k, 0, 1)), b.swingHy];
    if (b.throwAt >= 0 && b.swingT >= b.throwAt) { inp.mount = true; b.throwAt = -1; }   // 휘두르는 중 E = 던지기
    if (k > 1.6) b.swingT = -1;
  }

  function watchSpells(f, inp, aimYaw) {
    const me = add(pos(f), { x: 0, y: 1.0, z: 0 }), mv = vel(f);
    for (const sp of m.spells) {
      if (sp.owner === f.i || b.seen.has(sp.id)) continue;
      const rel = sub(sp.pos, me), rv = sub(sp.vel, mv), rv2 = dot(rv, rv);
      if (rv2 < 1) continue;
      const tc = -dot(rel, rv) / rv2;
      if (tc < 0 || tc > 0.4) continue;
      const miss = len(add(rel, scale(rv, tc)));
      if (miss > 1.8) continue;
      b.seen.add(sp.id);
      if (b.swingT < 0 && rng.chance(P.deflect)) {
        const side = dot(rel, rightOf(aimYaw)) >= 0 ? 1 : -1;
        startSwing(side, 0.35); b.swingDur = 0.13;
      } else if (personaKey === 'rival' && rng.chance(0.3)) inp.duck = true;
    }
  }
  // 근접 막기: 내 머리 쪽으로 빠르게 오는 상대 무기 쪽으로 지팡이를 든다
  function watchMelee(f, aimYaw, dt) {
    b.parryCd -= dt;
    if (b.parryCd > 0 || b.swingT >= 0 || !P.parry) return;
    const head = add(pos(f), { x: 0, y: 1.0, z: 0 }), mv = vel(f);
    for (const g of m.fighters) {
      if (g === f || g.out || !g.staff) continue;
      const w = g.staff;
      if (w.tipSpeed < 7) continue;
      const tip = weaponTip(w), rel = sub(tip, head);
      if (len(rel) > 2.6) continue;
      const rv = sub(w.body.linvel(), mv);
      if (dot(rel, rv) >= 0) continue;   // 멀어지는 중
      b.parryCd = 0.6;
      if (rng.chance(P.parry)) {
        const side = dot(rel, rightOf(aimYaw)) >= 0 ? 1 : -1;
        startSwing(side, 0.3); b.swingDur = 0.12;
        m.emit({ type: 'parryTry', i: f.i });
      }
      return;
    }
  }
  function nearestLoose(f, range) {
    const me = pos(f); let best = null, bd = range;
    for (const w of m.weapons) {
      if (w.isFist || w.holder >= 0) continue;
      const d = hdist(me, w.body.translation());
      if (d < bd) { bd = d; best = w; }
    }
    return best ? { w: best, d: bd } : null;
  }

  function mounted(f, inp, dt) {
    const h = m.horses[f.horse], hp = h.body.translation();
    let desired = h.heading, throttle = 0.8, gallop = false, aimAt = null, d = 99, g = null;
    const unarmed = f.weapon < 0;
    const loose = unarmed ? nearestLoose(f, 32) : null;
    if (P.still) {   // 가만히 선다 (S를 누르면 뒷걸음질하므로 아무것도 안 누른다)
      inp.move = [0, 0]; inp.look = [0, 0];
      return;
    }
    if (loose && !(b.target >= 0 && hdist(hp, pos(m.fighters[b.target])) < 5)) {
      // 맨손: 떨어진 지팡이를 주우러 간다 (가까우면 속도를 줄이고 E)
      const wp = loose.w.body.translation();
      desired = Math.atan2(wp.x - hp.x, wp.z - hp.z);
      throttle = loose.d > 9 ? 1 : h.speed > 3.5 ? -1 : 0.3;
      if (loose.d < CFG.pickup.mounted - 0.2 && h.speed < CFG.pickup.mountedSpeed) inp.mount = pulse();
    } else if (personaKey === 'dummy') {
      const goal = { x: -4.5, y: 0, z: 22 * b.patrol };   // 플레이어 출발선(x=0) 옆 차선: 정면충돌 대신 스치는 마상 시합
      if (Math.abs(hp.z - goal.z) < 4) b.patrol *= -1;
      desired = Math.atan2(goal.x - hp.x + 0.001, goal.z - hp.z);
      throttle = 1;
      g = b.target >= 0 ? m.fighters[b.target] : null;
      if (g) { aimAt = add(pos(g), { x: 0, y: 1.0, z: 0 }); d = hdist(hp, pos(g)); }
    } else if (b.target < 0) {
      // 가장자리를 돈다
      const r = Math.hypot(hp.x, hp.z), ang = Math.atan2(hp.x, hp.z);
      const tangent = ang + b.lurkDir * Math.PI / 2, want = m.fenceR - 7;
      desired = tangent + clamp((r - want) / 6, -0.6, 0.6) * b.lurkDir;
      throttle = 0.6;
    } else {
      g = m.fighters[b.target];
      const gp = pos(g), gv = vel(g);
      d = hdist(hp, gp);
      const lead = clamp(d / 30, 0, 1);
      const pred = { x: gp.x + gv.x * lead * 0.6, y: 0, z: gp.z + gv.z * lead * 0.6 };
      const toYaw = Math.atan2(pred.x - hp.x, pred.z - hp.z);
      if (P.orbit && d < P.orbit + 6) {
        desired = toYaw + b.passSide * (Math.PI / 2 - clamp((d - P.orbit) / 8, -0.6, 0.6));
      } else {
        const couching = P.thrust && b.thrustT > 0;
        const off = couching ? 1.1 : d > 7 ? P.passOffset : P.passOffset * 0.7;   // 찌르기 돌진이면 바짝 스친다
        const perp = scale(rightOf(toYaw), b.passSide * off);
        desired = Math.atan2(pred.x + perp.x - hp.x, pred.z + perp.z - hp.z);
      }
      throttle = 1; gallop = P.gallop && d > 12 && h.fear < 60 && !h.winded;
      aimAt = add(gp, { x: gv.x * d / 40, y: g.horse >= 0 ? 1.0 : 0.5, z: gv.z * d / 40 });
      // 지나쳤으면 가끔 스치는 쪽을 바꾼다
      const behind = dot(sub(gp, hp), fwdOf(h.heading)) < 0;
      if (behind && d > 10 && rng.chance(0.01)) b.passSide *= -1;
      // 잡고 있으면 반대쪽으로 꺾어서 끌어낸다
      if (f.grab) desired = toYaw + Math.PI * 0.6 * b.passSide;
    }
    desired = avoidFence(m, h, desired, 8);
    inp.move = [steerToward(h, desired), throttle];
    inp.gallop = gallop;
    // 조준: 몸 기준 상대 각
    let lookRel = 0, pitch = 0;
    if (aimAt) {
      const head = add(hp, { x: 0, y: 1.9, z: 0 });
      const yawTo = Math.atan2(aimAt.x - head.x, aimAt.z - head.z);
      lookRel = clamp(wrapAngle(yawTo - h.heading), -2, 2);
      pitch = Math.atan2(aimAt.y - head.y, Math.max(1, hdist(aimAt, head)));
    }
    b.lookYaw += (lookRel - b.lookYaw) * Math.min(1, dt * 8);
    inp.look = [b.lookYaw, pitch];
    const aimYaw = h.heading + b.lookYaw;
    // 찌르기 돌진 (마상창처럼): 정면에 두고 빠르게 다가갈 때
    b.thrustT = Math.max(0, b.thrustT - dt);
    if (P.thrust && !unarmed && g && d < 15 && d > 2 && h.speed > 8 && Math.abs(lookRel) < 0.35 && !f.charging && b.swingT < 0) b.thrustT = 0.4;
    if (b.thrustT > 0) { inp.thrust = true; inp.reach = d < 4.5 ? 1 : 0.1; }
    // 쏘기
    b.castCd -= dt;
    const inCone = aimAt && Math.abs(wrapAngle(lookRel - b.lookYaw)) < 0.15 && Math.abs(lookRel) < 1.4;
    const wantCast = !unarmed && aimAt && b.castCd <= 0 && m.t > 3 && d > 7 && d < 34 && h.speed > (personaKey === 'dummy' ? 3 : 6) && inCone && b.swingT < 0 && !inp.thrust;
    if (f.charging) {
      inp.charge = f.charge < b.chargeGoal && (inCone || f.charge < 0.12);
      if (!inp.charge) b.castCd = personaKey === 'dummy' ? P.castEvery : personaKey === 'heavy' ? rng.range(2.5, 4) : personaKey === 'quick' ? rng.range(0.8, 1.6) : rng.range(1.4, 2.8);
    } else if (wantCast) inp.charge = true;
    // 휘두르기
    if (aimAt && d < 4.6 && b.swingT < 0 && !f.charging && !inp.thrust && rng.chance(P.swing * 0.5)) {
      const side = dot(sub(aimAt, hp), rightOf(h.heading)) >= 0 ? 1 : -1;
      const shoulderY = f.rider.body.translation().y + 0.66;
      startSwing(side, clamp((aimAt.y - 0.25 - shoulderY) / 0.6, -0.9, 0.6) + rng.range(-0.1, 0.1));   // 상대 머리 높이에 맞춘다
    }
    // 던지기 (가끔): 7~12m 앞의 상대에게
    if (!unarmed && g && d > 7 && d < 12 && Math.abs(lookRel) < 0.3 && b.swingT < 0 && !f.charging && rng.chance(P.throw * 0.01)) {
      startSwing(1, 0.4); b.throwAt = 0.12 + b.swingDur * 0.55;
    }
    // 잡기: 바로 옆을 지나는 기수를 잡아 끌어내린다
    b.grabCd -= dt;
    if (g && g.horse >= 0 && d < 2.1 && b.grabCd <= 0 && b.grabT <= 0 && rng.chance(P.grab * 0.08)) { b.grabT = 0.9; b.grabCd = rng.range(4, 7); }
    if (b.grabT > 0) { b.grabT -= dt; inp.grab = true; }
    watchSpells(f, inp, aimYaw);
    watchMelee(f, aimYaw, dt);
    swingInput(inp, dt);
    if (inp.swing) inp.charge = false;
  }

  function onFoot(f, inp, dt) {
    const me = pos(f);
    // 1) 다시 탈 말
    let hk = -1, hd = 26;
    for (const h of m.horses) {
      if (h.rider >= 0 || (h.reserved >= 0 && h.reserved !== f.i)) continue;
      if (h.speed > 6) continue;
      const d = hdist(me, h.body.translation()) + (h.panicT > 0 ? 6 : 0);
      if (d < hd) { hd = d; hk = h.k; }
    }
    // 2) 돌진해 오는 말 피하기
    let threat = null;
    for (const g of m.fighters) {
      if (g.i === f.i || g.out || g.horse < 0 || P.still) continue;
      const hz = m.horses[g.horse], hp = hz.body.translation(), d = hdist(me, hp);
      if (d > 14 || hz.speed < 6) continue;
      const toMe = norm(sub(me, hp)), fv = fwdOf(hz.heading);
      if (dot({ x: toMe.x, y: 0, z: toMe.z }, fv) > 0.8) threat = { hp, fv };
    }
    const loose = f.weapon < 0 ? nearestLoose(f, 18) : null;
    let goalYaw = b.lookYaw, mv = [0, 0], run = false;
    if (threat) {
      const side = rightOf(Math.atan2(threat.fv.x, threat.fv.z));
      const s = dot(sub(me, threat.hp), side) >= 0 ? 1 : -1;
      goalYaw = Math.atan2(side.x * s, side.z * s); mv = [0, 1]; run = true;
    } else if (loose && (hk < 0 || loose.d < hd)) {
      // 맨손이면 무기부터 줍는다
      const wp = loose.w.body.translation();
      goalYaw = Math.atan2(wp.x - me.x, wp.z - me.z); mv = [0, loose.d > 1.2 ? 1 : 0]; run = loose.d > 5;
      b.swingT = -1;
      if (loose.d < CFG.pickup.foot - 0.2) inp.mount = pulse();
    } else if (hk >= 0) {
      const hp = m.horses[hk].body.translation();
      goalYaw = Math.atan2(hp.x - me.x, hp.z - me.z); mv = [0, hd > 2.2 ? 1 : 0]; run = hd > 5;
      b.swingT = -1;
      if (hd < 2.6) inp.mount = pulse();
    } else if (!P.still) {
      const foes = m.fighters.filter((g) => g.i !== f.i && !g.out);
      let g = null, gd = 99;
      for (const x of foes) { const d = hdist(me, pos(x)); if (d < gd) { gd = d; g = x; } }
      if (g) {
        const gp = pos(g);
        goalYaw = Math.atan2(gp.x - me.x, gp.z - me.z);
        mv = [0, gd > 1.6 ? 1 : 0]; run = gd > 6;
        b.kickCd -= dt;
        if (gd < 1.4 && g.horse < 0 && b.kickCd <= 0 && rng.chance(P.kick * 0.05)) { inp.kick = true; b.kickCd = 1.2; }
        else if (gd < 2.6 && b.swingT < 0 && rng.chance(0.08)) startSwing(rng.chance(0.5) ? 1 : -1, g.horse >= 0 ? 0.6 : 0.3);
      }
    }
    b.lookYaw += wrapAngle(goalYaw - b.lookYaw) * Math.min(1, dt * 6);
    inp.look = [b.lookYaw, 0];
    inp.move = mv; inp.gallop = run;
    if (!P.still) { watchSpells(f, inp, b.lookYaw); watchMelee(f, b.lookYaw, dt); }
    swingInput(inp, dt);
  }

  function think(dt) {
    const f = m.fighters[i], inp = idleInput();
    if (f.out) return inp;
    b.decideT -= dt;
    if (b.decideT <= 0) { b.decideT = 0.1 + rng.range(0, P.react * 0.5); b.target = pickTarget(f); }
    if (f.rider.state === 'mounted') mounted(f, inp, dt);
    else if (f.rider.state === 'foot') {
      if (f.prevInput && f.rider.t < 0.05) b.lookYaw = f.aimYaw;
      onFoot(f, inp, dt);
    } else if (f.rider.state === 'flying' || f.rider.state === 'getup') { b.swingT = -1; b.grabT = 0; inp.look = [f.aimYaw, 0]; }
    return inp;
  }
  return { think, state: b, P };
}
