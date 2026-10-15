// 한 판(시합): Rapier 월드, 조여 오는 울타리, 타격 판정, 승패, 이벤트, 상태 해시
// v0.2: 무기 주인 해석(던진 무기·떨어진 무기), 무장 해제, 끝·찌르기 배율, 접촉력으로도 타격 판정, 소품, 연습장·자유 대전
import { TICK, CFG, CHARS, ITEMS } from './config.js';
import { createRng, v3, add, sub, scale, dot, cross, len, norm, clamp, qRotate, yawQ, lerp } from './rng.js';
import { createHorse, createFighter, createWeapon, controlFighter, controlHorse, hurt, idleInput, dropWeapon, footImpact, knockDown, revive, updateLooseWeapons, GROUND_GROUPS, FENCE_GROUPS } from './fighter.js';
import { releaseCharge, stepSpells } from './spells.js';
import { createBrain } from './ai.js';

const Y = { x: 0, y: 1, z: 0 };

export function fenceRadius(t, noShrink) {
  const A = CFG.arena;
  if (noShrink || t <= A.shrinkStart) return A.r0;
  if (t >= A.shrinkEnd) return A.rMin;
  return lerp(A.r0, A.rMin, (t - A.shrinkStart) / (A.shrinkEnd - A.shrinkStart));
}

// 소품 자리: 출발선(축 방향)을 피해 대각선, 울타리 가까이
export const PROP_SPOTS = [
  { kind: 'hay', a: 0.25, r: 35 }, { kind: 'barrel', a: 0.32, r: 37 }, { kind: 'hay', a: 0.75, r: 36 }, { kind: 'barrel', a: 0.68, r: 34 },
  { kind: 'hay', a: 1.25, r: 35 }, { kind: 'barrel', a: 1.18, r: 37 }, { kind: 'hay', a: 1.75, r: 36 }, { kind: 'barrel', a: 1.82, r: 34 },
];

// opts: { seed, mode:'duel'|'brawl'|'practice'|'free', roster:[{char, loadout, isPlayer, persona}], countdown=3, rivalMimic, spawns, looseWeapons:[{item,x,z}], props=true }
export function createMatch(R, opts) {
  const world = new R.World({ x: 0, y: CFG.gravity, z: 0 });
  world.timestep = TICK;
  const practice = opts.mode === 'practice';
  const m = {
    R, world, opts, t: -(opts.countdown ?? 3), tick: 0, rng: createRng(opts.seed || 1), info: new Map(),
    fighters: [], horses: [], weapons: [], props: [], spells: [], nextSpellId: 1, fenceR: CFG.arena.r0, events: [], over: false, result: null,
    pre: new Map(), cds: new Map(), fence: [], practice, koT: new Map(),
    emit(e) { e.t = m.t; m.events.push(e); },
    release(f) { return releaseCharge(m, f); },
  };
  // 바닥
  const ground = world.createRigidBody(R.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0));
  const gcol = world.createCollider(R.ColliderDesc.cuboid(120, 0.5, 120).setFriction(0.9).setCollisionGroups(GROUND_GROUPS), ground);
  m.info.set(gcol.handle, { kind: 'ground' });
  // 울타리: 키네마틱 조각들
  const A = CFG.arena, N = A.fenceSegs;
  for (let s = 0; s < N; s++) {
    const th = (s + 0.5) * 2 * Math.PI / N, r = A.r0;
    const body = world.createRigidBody(R.RigidBodyDesc.kinematicPositionBased().setTranslation(Math.sin(th) * r, A.fenceH, Math.cos(th) * r).setRotation(yawQ(th)));
    const col = world.createCollider(R.ColliderDesc.cuboid(r * Math.PI / N + 0.25, A.fenceH, A.fenceThick).setFriction(0.2).setCollisionGroups(FENCE_GROUPS), body);
    m.info.set(col.handle, { kind: 'fence' });
    m.fence.push({ body, col, th });
  }
  m.fenceRSet = A.r0;

  // 출발 자리: 결투는 양 끝, 난투는 원 둘레에서 중앙을 본다. 연습장은 허수아비가 한 줄로 선다
  const n = opts.roster.length;
  opts.roster.forEach((spec, i) => {
    let pos, heading;
    if (practice) {
      if (i === 0) { pos = { x: 0, y: 0, z: -24 }; heading = 0; }
      else { pos = { x: (i - (n) / 2) * 9, y: 0, z: 8 + (i % 2) * 6 }; heading = Math.PI; }
    } else if (opts.mode === 'duel' && n === 2) { const z = i === 0 ? -30 : 30; pos = { x: 0, y: 0, z }; heading = i === 0 ? 0 : Math.PI; }
    else { const a = i * 2 * Math.PI / n + Math.PI; pos = { x: Math.sin(a) * 30, y: 0, z: Math.cos(a) * 30 }; heading = a + Math.PI; }
    const sp = opts.spawns && opts.spawns[i];   // 시험용 자리 지정
    if (sp) { pos = { x: sp.x, y: 0, z: sp.z }; heading = sp.heading ?? heading; }
    m.horses.push(createHorse(m, i, CHARS[spec.char].horse, pos, heading));
  });
  opts.roster.forEach((spec, i) => {
    const f = createFighter(m, i, spec, i);
    f.look = [0, 0];
    m.horses[i].owner = i;
    m.fighters.push(f);
  });
  // 두뇌는 모두 만든 다음에 (상대 목록을 본다)
  m.fighters.forEach((f, i) => { const spec = opts.roster[i]; if (!spec.isPlayer) f.brain = createBrain(m, i, spec.persona || CHARS[spec.char].persona, (opts.seed || 1) * 7919 + i * 104729); });
  // 떨어져 있는 무기 (연습장 무기 더미 등)
  for (const lw of opts.looseWeapons || []) {   // 바닥에 눕혀 둔다 (세워 두면 끝으로 선 채 균형을 잡는다)
    const w = createWeapon(m, lw.item, { x: lw.x, y: 0.12, z: lw.z });
    w.body.setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }, true);
  }
  // 소품: 건초 더미·나무통
  if (opts.props !== false) {
    for (const p of PROP_SPOTS) {
      const pos = { x: Math.sin(p.a * Math.PI) * p.r, z: Math.cos(p.a * Math.PI) * p.r };
      const hay = p.kind === 'hay';
      const body = world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(pos.x, hay ? 0.55 : 0.46, pos.z)
        .setRotation(hay ? { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } : { x: 0, y: 0, z: 0, w: 1 }).setLinearDamping(0.4).setAngularDamping(0.8));
      const col = world.createCollider((hay ? R.ColliderDesc.cylinder(0.45, 0.55) : R.ColliderDesc.cylinder(0.45, 0.3)).setMass(hay ? 35 : 18).setFriction(0.8).setRestitution(0.1)
        .setActiveEvents(R.ActiveEvents.COLLISION_EVENTS), body);
      m.info.set(col.handle, { kind: 'prop', p: m.props.length });
      m.props.push({ kind: p.kind, body, col });
    }
  }

  const queue = new R.EventQueue(true);

  function updateFence() {
    const r = m.fenceR = fenceRadius(m.t, practice);
    if (Math.abs(r - m.fenceRSet) < 1e-4) return;
    m.fenceRSet = r;
    for (const s of m.fence) {
      s.col.setHalfExtents({ x: r * Math.PI / N + 0.25, y: A.fenceH, z: A.fenceThick });
      s.body.setNextKinematicTranslation({ x: Math.sin(s.th) * r, y: A.fenceH, z: Math.cos(s.th) * r });
    }
  }

  function snap(body) { m.pre.set(body.handle, { c: body.translation(), q: body.rotation(), v: body.linvel(), w: body.angvel() }); }
  function cdOk(key, cd) { const t = m.cds.get(key); if (t !== undefined && m.t - t < cd) return false; m.cds.set(key, m.t); return true; }
  function velAt(pre, P) { return add(pre.v, cross(pre.w, sub(P, pre.c))); }
  const holderOf = (inf) => (inf.kind === 'staff' ? m.weapons[inf.w].holder : inf.i);

  // 무기(지팡이·주먹·던진 지팡이) → 몸 타격. 끝으로 맞히면 지렛대만큼 세고, 찌르기 자세면 더 세다
  function melee(wId, i, j, part, colPart, thrown) {
    const w = m.weapons[wId], f = m.fighters[i], g = m.fighters[j], M = CFG.melee;
    if ((!thrown && f.rider.state === 'ko') || g.rider.state === 'ko') return;
    const pre = m.pre.get(w.body.handle), tbody = g.rider.body, tpre = m.pre.get(tbody.handle);
    if (!pre || !tpre) return;
    const tc = colPart.translation();
    let P, u;
    if (w.isFist) { P = pre.c; u = 1; }
    else {
      const a = qRotate(pre.q, Y), half = w.len / 2, p0 = sub(pre.c, scale(a, half)), seg = scale(a, 2 * half);
      u = clamp(dot(sub(tc, p0), seg) / dot(seg, seg), 0, 1); P = add(p0, scale(seg, u));
    }
    const rel = sub(velAt(pre, P), velAt(tpre, P)), s = len(rel);
    if (s < M.minSpeed) return;
    if (!cdOk('m' + i + '_' + j, M.cooldown)) return;
    const tip = !w.isFist && u > M.tipFrac;
    const thrust = !thrown && f.input.thrust && tip;
    let mul = 1;
    if (tip) mul *= M.tipMul * (w.item.tipMul || 1);
    if (thrust) mul *= M.thrustMul * (w.item.thrustMul || 1) / M.tipMul;
    const J = Math.min(M.maxJ * (thrust ? 1.3 : 1), M.k * w.mass * s * mul);
    tbody.applyImpulseAtPoint(scale(norm(rel), J), P, true);
    const per = part === 'head' ? M.headDmg : part === 'legs' ? M.legsDmg : M.torsoDmg;
    const dmg = hurt(m, g, (s - M.minSpeed) * per * mul * (w.isFist ? 0.6 : 1), part, i, thrown ? 'throw' : w.isFist ? 'fist' : 'staff');
    footImpact(m, g, J, i);
    f.stats.hits++;
    if (thrown) w.thrownBy = -1;
    m.emit({ type: 'hit', i, j, part, s, J, dmg, pos: P, tip, thrust, fist: w.isFist, thrown: !!thrown, item: w.itemId });
  }
  function staffHorse(wId, i, k) {
    const w = m.weapons[wId], f = m.fighters[i], h = m.horses[k];
    if (h.rider === i || f.rider.state === 'ko') return;
    const pre = m.pre.get(w.body.handle), hp = m.pre.get(h.body.handle);
    if (!pre || !hp) return;
    const s = len(sub(pre.v, hp.v));
    if (s < CFG.melee.minSpeed || !cdOk('sh' + i + '_' + k, 0.4)) return;
    h.fear = Math.min(100, h.fear + (s - CFG.melee.minSpeed) * CFG.melee.horseFear);
    m.emit({ type: 'hitHorse', i, k, s, pos: pre.c });
  }
  // 지팡이끼리 부딪침: 무거운 쪽이 세게 휘두르면 상대 손에서 지팡이를 쳐낸다
  function clash(wa, wb) {
    const A2 = m.weapons[wa], B = m.weapons[wb];
    const pa = m.pre.get(A2.body.handle), pb = m.pre.get(B.body.handle);
    if (!pa || !pb) return;
    const s = len(sub(pa.v, pb.v));
    if (s <= 4) return;
    const ia = A2.holder, ib = B.holder;
    if (!cdOk('c' + Math.min(wa, wb) + '_' + Math.max(wa, wb), 0.25)) return;
    m.emit({ type: 'clash', i: ia, j: ib, s, pos: pa.c, metal: [A2.itemId, B.itemId].some((x) => x === 'iron' || x === 'mace') });
    if (ia < 0 || ib < 0) return;
    const D = CFG.disarm;
    const tryDisarm = (att, def) => {
      const fd = m.fighters[def.holder];
      if (def.isFist || fd.weapon !== def.id) return false;
      const share = (att.tipSpeed + 0.5) / (att.tipSpeed + def.tipSpeed + 1) * 2;
      const force = att.mass * s * share;
      const resist = D.base + D.perStam * fd.stam / 100 + D.perMass * def.mass;
      if (force <= resist) return false;
      const v = def.body.linvel(), attacker = att.holder, victim = def.holder;
      dropWeapon(m, fd, 'disarm');
      def.body.setLinvel({ x: v.x * 0.6, y: v.y + 3, z: v.z * 0.6 }, true);
      m.fighters[attacker].stats.disarms++;
      fd.lastHitBy = { i: attacker, t: m.t };
      m.emit({ type: 'disarm', i: attacker, j: victim, pos: def.body.translation() });
      return true;
    };
    if (!tryDisarm(A2, B)) tryDisarm(B, A2);
  }
  function trample(k, j) {
    const h = m.horses[k], g = m.fighters[j], T = CFG.trample;
    const st = g.rider.state;
    if (h.rider === j || st === 'mounted' || st === 'mounting') return;
    const hp = m.pre.get(h.body.handle), tp = m.pre.get(g.rider.body.handle);
    if (!hp || !tp) return;
    const rel = sub(hp.v, tp.v), s = len(rel);
    if (s < T.minSpeed || !cdOk('t' + k + '_' + j, 0.6)) return;
    const dir = norm(add(rel, { x: 0, y: 0.5 * s, z: 0 }));
    g.rider.body.applyImpulseAtPoint(scale(dir, T.k * s), add(tp.c, { x: 0, y: 0.6, z: 0 }), true);
    const by = h.rider >= 0 ? h.rider : -1;
    if (st === 'foot' || st === 'getup') knockDown(m, g, 'trample', by);
    const dmg = hurt(m, g, (s - T.minSpeed) * T.dmg, 'torso', by, 'trample');
    m.emit({ type: 'trample', k, j, by, s, dmg, pos: tp.c });
  }
  function land(j) {
    const g = m.fighters[j];
    if (g.rider.state !== 'flying') return;
    const tp = m.pre.get(g.rider.body.handle); if (!tp) return;
    const s = len(tp.v);
    if (s < CFG.mind.fallMin || !cdOk('l' + j, 0.4)) return;
    const dmg = hurt(m, g, (s - CFG.mind.fallMin) * CFG.mind.fallDmg, 'torso', -1, 'fall');
    m.emit({ type: 'land', i: j, s, dmg, pos: tp.c });
  }

  function collide(h1, h2) {
    let a = m.info.get(h1), b = m.info.get(h2), c1 = h1, c2 = h2;
    if (!a || !b) return;
    const isPart = (x) => x.kind === 'torso' || x.kind === 'head' || x.kind === 'legs';
    if (b.kind === 'staff' && a.kind !== 'staff') { [a, b] = [b, a]; [c1, c2] = [c2, c1]; }
    if (a.kind === 'staff' && b.kind === 'staff') { clash(a.w, b.w); return; }
    if (a.kind === 'staff') {
      const w = m.weapons[a.w], i = w.holder;
      if (isPart(b)) {
        if (i >= 0 && i !== b.i) melee(a.w, i, b.i, b.kind, world.getCollider(c2), false);
        else if (i < 0 && w.thrownBy >= 0 && w.thrownBy !== b.i) {
          const pre = m.pre.get(w.body.handle);
          if (pre && len(pre.v) > CFG.throw.hitMin) melee(a.w, w.thrownBy, b.i, b.kind, world.getCollider(c2), true);
        }
        return;
      }
      if (b.kind === 'horse' && i >= 0) { staffHorse(a.w, i, b.k); return; }
      if ((b.kind === 'ground' || b.kind === 'prop') && i < 0 && w.looseT > 0.1) {
        const pre = m.pre.get(w.body.handle);
        if (pre && len(pre.v) > 3 && cdOk('wl' + a.w, 0.3)) m.emit({ type: 'clatter', w: a.w, pos: pre.c, s: len(pre.v) });
      }
      return;
    }
    if (b.kind === 'horse' && isPart(a)) { [a, b] = [b, a]; }
    if (a.kind === 'horse' && isPart(b)) { trample(a.k, b.i); return; }
    if (a.kind === 'horse' && b.kind === 'horse') {
      const ha = m.horses[a.k], hb = m.horses[b.k], pa = m.pre.get(ha.body.handle), pb = m.pre.get(hb.body.handle);
      const s = pa && pb ? len(sub(pa.v, pb.v)) : 0;
      if (s > 3 && cdOk('hb' + Math.min(a.k, b.k) + '_' + Math.max(a.k, b.k), 0.5)) {
        ha.fear = Math.min(100, ha.fear + 6); hb.fear = Math.min(100, hb.fear + 6);
        m.emit({ type: 'bump', k: a.k, k2: b.k, s, pos: pa.c });
      }
      return;
    }
    if ((a.kind === 'horse' && b.kind === 'prop') || (b.kind === 'horse' && a.kind === 'prop')) {
      const h = m.horses[a.kind === 'horse' ? a.k : b.k], p = m.props[a.kind === 'prop' ? a.p : b.p];
      if (h.speed > 4 && cdOk('hp' + h.k + '_' + (a.kind === 'prop' ? a.p : b.p), 0.6)) { h.fear = Math.min(100, h.fear + 3); m.emit({ type: 'propHit', kind: p.kind, pos: p.body.translation(), s: h.speed }); }
      return;
    }
    if ((a.kind === 'horse' && b.kind === 'fence') || (b.kind === 'horse' && a.kind === 'fence')) {
      const h = m.horses[a.kind === 'horse' ? a.k : b.k];
      if (h.speed > 4 && cdOk('hf' + h.k, 0.6)) { h.fear = Math.min(100, h.fear + CFG.fear.fence); m.emit({ type: 'fence', k: h.k, pos: h.body.translation() }); }
      return;
    }
    if (isPart(a) && (b.kind === 'ground' || b.kind === 'fence' || b.kind === 'prop')) { land(a.i); return; }
    if (isPart(b) && (a.kind === 'ground' || a.kind === 'fence' || a.kind === 'prop')) { land(b.i); return; }
  }

  function contain() {
    const lim = m.fenceR + 0.6;
    const fix = (body) => {
      const p = body.translation(), r = Math.hypot(p.x, p.z);
      if (r <= lim) return;
      const k = (m.fenceR - 0.8) / r;
      body.setTranslation({ x: p.x * k, y: Math.max(p.y, 0.2), z: p.z * k }, true);
      const v = body.linvel(), out = (v.x * p.x + v.z * p.z) / r;
      if (out > 0) body.setLinvel({ x: v.x - out * p.x / r, y: v.y, z: v.z - out * p.z / r }, true);
    };
    for (const h of m.horses) fix(h.body);
    for (const f of m.fighters) if (f.horse < 0 && f.rider.state !== 'mounting') fix(f.rider.body);
    for (const w of m.weapons) if (w.holder < 0 && !w.isFist) fix(w.body);
    for (const p of m.props) fix(p.body);
  }

  function judge() {
    let best = -1, bs = -1;
    for (const f of m.fighters) if (!f.out) { const s = (f.horse >= 0 ? 1000 : 0) + f.rider.conscious; if (s > bs) { bs = s; best = f.i; } }
    return best;
  }
  function end(reason, winner) {
    m.over = true;
    const player = m.fighters.find((f) => f.isPlayer);
    m.result = {
      reason, winner, playerWon: player ? winner === player.i : null, t: m.t,
      fighters: m.fighters.map((f) => ({ i: f.i, char: f.char, isPlayer: f.isPlayer, loadout: { ...f.loadout }, out: f.out, surrendered: f.surrendered, conscious: f.rider.conscious, state: f.rider.state, mounted: f.horse >= 0, stats: { ...f.stats } })),
    };
    m.emit({ type: 'over', reason, winner });
  }

  m.step = function step(inputs) {
    m.events = [];
    const dt = TICK;
    m.t += dt; m.tick++;
    updateFence();
    for (const f of m.fighters) {
      f.prevInput = f.input;
      const given = inputs && inputs[f.i];
      f.input = f.out ? idleInput() : given ? given : f.brain ? f.brain.think(dt) : idleInput();
      if (given && given.surrender && !f.out && !m.over) {
        f.out = true; f.surrendered = true; f.charging = false; f.charge = 0;
        m.emit({ type: 'surrender', i: f.i });
      }
    }
    for (const f of m.fighters) controlFighter(m, f, dt);
    for (const h of m.horses) controlHorse(m, h, dt);
    updateLooseWeapons(m, dt);
    m.pre.clear();
    for (const f of m.fighters) snap(f.rider.body);
    for (const w of m.weapons) snap(w.body);
    for (const h of m.horses) snap(h.body);
    world.step(queue);
    queue.drainCollisionEvents((h1, h2, started) => { if (started) collide(h1, h2); });
    // 닿아 있는 동안의 강한 접촉도 타격으로 본다 (닿는 순간만 보면 타격이 빠진다)
    queue.drainContactForceEvents((e) => collide(e.collider1(), e.collider2()));
    stepSpells(m, dt);
    contain();
    for (const f of m.fighters) {
      const rs = f.rider;
      if (rs.state !== 'ko' && m.t - rs.lastHitT > CFG.mind.regenDelay) rs.conscious = Math.min(CFG.mind.max, rs.conscious + CFG.mind.regen * dt);
      if (f.horse >= 0 && m.t > 0) { f.stats.fearSum += m.horses[f.horse].fear * dt; f.stats.fearN += dt; }
      // 연습장: 기절한 허수아비는 5초 뒤 다시 일어난다
      if (practice && rs.state === 'ko' && !f.isPlayer) { const k = (m.koT.get(f.i) || 0) + dt; m.koT.set(f.i, k); if (k > 5) { m.koT.delete(f.i); revive(m, f); } }
      if (practice && f.isPlayer && rs.state === 'ko') { const k = (m.koT.get(f.i) || 0) + dt; m.koT.set(f.i, k); if (k > 3) { m.koT.delete(f.i); revive(m, f); } }
    }
    if (!m.over && m.t > 0 && !practice) {
      const alive = m.fighters.filter((f) => !f.out), player = m.fighters.find((f) => f.isPlayer);
      if (player && player.out) end(player.surrendered ? 'surrender' : 'ko', alive.length === 1 ? alive[0].i : -1);
      else if (alive.length <= 1) end('last', alive.length ? alive[0].i : -1);
      else if (m.t >= CFG.arena.timeLimit) end('time', judge());
    }
    if (practice && !m.over) { const player = m.fighters.find((f) => f.isPlayer); if (player && player.surrendered) end('surrender', -1); }
    return m.events;
  };

  m.hash = function hash() {
    let h = 2166136261 >>> 0;
    const mix = (x) => { h = Math.imul(h ^ (Math.round(x * 1000) | 0), 16777619) >>> 0; };
    for (const f of m.fighters) {
      const p = f.rider.body.translation();
      mix(p.x); mix(p.y); mix(p.z); mix(f.rider.conscious); mix(f.horse); mix(f.stam); mix(f.weapon);
    }
    for (const w of m.weapons) { const p = w.body.translation(); mix(p.x); mix(p.y); mix(p.z); mix(w.holder); }
    for (const hz of m.horses) { const p = hz.body.translation(); mix(p.x); mix(p.z); mix(hz.fear); mix(hz.stam); }
    for (const pr of m.props) { const p = pr.body.translation(); mix(p.x); mix(p.z); }
    mix(m.spells.length); for (const sp of m.spells) { mix(sp.pos.x); mix(sp.pos.z); }
    return h.toString(16);
  };
  m.free = () => { try { queue.free(); world.free(); } catch (e) { /* 이미 해제됨 */ } };
  return m;
}
