// 원소 이펙트: 지팡이 원소 오라(들고 있을 때), 원소 마법 이벤트의 순간 효과(쏠 때·맞을 때), 날아가는 화염구
// 설계: superpowers/specs/2026-10-16-mw-element-vfx-design.md 4장. 보기 전용 — 소리·HUD는 main.js, 다시 보기도 같은 onEvent를 부른다
import * as THREE from 'three';
import { CFG } from './config.js';
import { toon } from './models.js';
import { createKit } from './fxKit.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const WORD = { 화르륵: '#ff8a3a', 철썩: '#7fd0ff', 휘잉: '#bff5dc', 쿵: '#e0b070', 쭈욱: '#dff4ff', 치익: '#ffffff' };
const C = { dust: 0xf0dfb8, dirt: 0x8a6236, smoke: 0x8a8079, steam: 0xf4f8fa, fireA: 0xffb030, fireB: 0xff7a1a, fireC: 0xffe070, rock: 0x8a7a68, wallRock: 0x9a7448, ice: 0xdff4ff, mint: 0xbff5dc };
const TAIL = [[0, [1, 0.92, 0.5]], [0.25, [1, 0.6, 0.15]], [0.55, [0.88, 0.25, 0.08]], [0.8, [0.36, 0.31, 0.28]], [1, [0.3, 0.27, 0.25]]];
function tailColor(u, o) { let k = 1; while (k < TAIL.length - 1 && TAIL[k][0] < u) k++; const [ua, a] = TAIL[k - 1], [ub, b] = TAIL[k], f = Math.min(1, (u - ua) / (ub - ua)); for (let j = 0; j < 3; j++) o[j] = a[j] + (b[j] - a[j]) * f; o[3] = 0.95 * (1 - u); return o; }

export function createElemFx(scene, { fx = null, camera = null, low = false, rand = Math.random } = {}) {
  const kit = createKit(scene, { low, rand });
  const { N, R } = kit;
  let clock = 0;
  const gates = new Map(), booms = [], auras = new Map(), balls = new Map();
  const ground = (p) => V(p.x, 0.05, p.z);
  const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  const outward = (a, s, up = 0) => V(Math.cos(a) * s, up, Math.sin(a) * s);
  function word(text, P, ctx, key) {
    if (!fx) return;
    const g = gates.get(key); if (g !== undefined && clock - g < 0.4) return; gates.set(key, clock);
    const d = ctx && ctx.camPos ? ctx.camPos.distanceTo(P) : 9;
    fx.pop(text + '!', P, WORD[text], 1.3 * Math.min(3.2, Math.max(1, d / 9)));
  }
  // ---------- 재료 조합 ----------
  function droplets(P, n, speed = 4, up = 2) { for (let k = 0; k < N(n); k++) { const a = R(0, 6.28); kit.chunk('drop', P, { v: outward(a, R(speed * 0.4, speed), R(up * 0.5, up * 1.5)), size: R(0.035, 0.06), life: R(0.5, 0.8), g: -12, bounce: 0.1 }); } }
  function dirt(P, n, speed = 4, size = [0.05, 0.11], color = C.dirt) { for (let k = 0; k < N(n); k++) { const a = R(0, 6.28); kit.chunk('rock', P, { v: outward(a, R(speed * 0.3, speed), R(2, 5)), size: R(size[0], size[1]), color, life: R(0.8, 1.3) }); } }
  function dust(P, n, s1 = 0.7, speed = 1.2, color = C.dust) { for (let k = 0; k < N(n); k++) { const a = R(0, 6.28); kit.puff(V(P.x + Math.cos(a) * 0.3, 0.2, P.z + Math.sin(a) * 0.3), color, { v: outward(a, R(speed * 0.5, speed), R(0.2, 0.7)), s0: 0.15, s1: R(s1 * 0.7, s1), life: R(0.6, 0.9) }); } }
  function ring(P, color, r1 = 0.6) { kit.streak(P, { ring: true, r0: 0.1, r1, y: 0, life: 0.25, w: 0.06, color }); }
  function flames(P, n, o = {}) { for (let k = 0; k < N(n); k++) { const a = R(0, 6.28); kit.flame(V(P.x + Math.cos(a) * (o.spread ?? 0.3), P.y, P.z + Math.sin(a) * (o.spread ?? 0.3)), { v: outward(a, R(0.5, o.out ?? 2), R(o.up ?? 1.5, (o.up ?? 1.5) * 2)), w: R(0.25, 0.4) * (o.big ?? 1), h: R(0.4, 0.65) * (o.big ?? 1), life: R(0.25, 0.45) }); } }

  // 🔥
  function fireMuzzle(P, dir) {
    for (let k = 0; k < N(8); k++) kit.flame(P.clone().addScaledVector(dir, R(0, 0.4)), { v: dir.clone().multiplyScalar(R(2.5, 7)).add(V(R(-1.2, 1.2), R(-0.4, 1.2), R(-1.2, 1.2))), w: R(0.25, 0.4), h: R(0.4, 0.6), life: R(0.18, 0.3), g: 0 });
    for (let k = 0; k < N(3); k++) kit.puff(P.clone().addScaledVector(dir, R(0.2, 0.7)), C.smoke, { v: V(R(-0.4, 0.4), R(0.5, 1.1), R(-0.4, 0.4)), s0: 0.08, s1: R(0.16, 0.26), life: R(0.5, 0.8), delay: 0.05 });
  }
  function fireBurst(P, r, hit, ctx) {
    if (fx) fx.flash(P, 0xffffff, r * 1.6, 0.08);
    const cols = [C.fireA, C.fireB, C.fireC];
    for (let k = 0; k < N(6); k++) kit.puff(V(P.x + R(-0.4, 0.4) * r, Math.max(0.3, P.y + R(-0.2, 0.4) * r), P.z + R(-0.4, 0.4) * r), cols[k % 3], { v: V(R(-1.5, 1.5), R(0, 1.5), R(-1.5, 1.5)), s0: 0.2, s1: r * R(0.45, 0.65), life: R(0.35, 0.55), glow: true });
    for (let k = 0; k < N(4); k++) kit.puff(V(P.x + R(-0.3, 0.3) * r, P.y + 0.3, P.z + R(-0.3, 0.3) * r), C.smoke, { v: V(R(-0.6, 0.6), R(1.2, 2.2), R(-0.6, 0.6)), s0: 0.2, s1: r * R(0.35, 0.5), life: R(0.9, 1.3), delay: R(0.12, 0.25), drag: 0.8 });
    flames(ground(P), 10, { spread: r * 0.5, out: 4, up: 1.2, big: 1.2 });
    for (let k = 0; k < N(14); k++) { const a = R(0, 6.28); kit.chunk('ember', P, { v: outward(a, R(3, 8), R(2, 6)), size: R(0.03, 0.06), color: k % 2 ? C.fireA : C.fireC, life: R(0.6, 1.1), g: -9 }); }
    kit.decal('scorch', P, r * 1.3, { life: 5 });
    if (hit) word('화르륵', P, ctx, 'b' + Math.round(P.x) + ',' + Math.round(P.z));
    booms.push({ x: P.x, z: P.z, t: clock });
  }
  // 💨 돌풍: 나를 중심으로 둥글게
  function gust(e, ctx) {
    const c = V(e.pos.x, 0, e.pos.z), r = e.r || 4;
    for (let k = 0; k < N(10); k++) kit.streak(c, { r0: 0.6, r1: r, y: R(0.5, 1.8), a0: k * Math.PI / 5 + R(-0.2, 0.2), span: R(0.9, 1.3), life: R(0.34, 0.44), w: R(0.18, 0.26), color: k % 2 ? 0xffffff : 0x8fe8c0 });
    for (let k = 0; k < N(16); k++) { const a = k / 16 * 6.28 + R(-0.15, 0.15); kit.puff(V(c.x + Math.cos(a) * 0.8, 0.12, c.z + Math.sin(a) * 0.8), C.dust, { v: outward(a, r / 0.4, 0.4), s0: 0.12, s1: R(0.28, 0.42), life: R(0.4, 0.55), drag: 3 }); }
    kit.decal('wave', c, 1.2, { grow: r * 2.1, growT: 0.4, life: 0.55 });
    for (let k = 0; k < N(8); k++) { const a = R(0, 6.28); kit.chunk('rock', V(c.x + Math.cos(a) * 0.8, 0.1, c.z + Math.sin(a) * 0.8), { v: outward(a, R(4, 8), R(2, 4)), size: R(0.04, 0.08), color: C.rock, life: 1 }); }
    for (let j = 0; j < ctx.count; j++) {
      if (j === e.i) continue;
      const p = ctx.fighterPos(j, false);
      if (hd(p, c) > r + 0.3) continue;
      for (let k = 0; k < 2; k++) kit.streak(V(p.x, p.y - 0.4, p.z), { r0: 0.5, r1: 0.75, y: k * 0.35, a0: R(0, 6.28), span: 2.6, dir: k ? 1 : -1, life: 0.3, w: 0.1, color: k ? 0xffffff : C.mint });
      word('휘잉', p, ctx, 'f' + j);
    }
    for (const b of booms) {   // 돌풍 + 화염구: 같은 틱에 터진 화염구를 바람이 쓸어 간다
      if (clock - b.t > 0.1 || Math.hypot(b.x - c.x, b.z - c.z) > r + 1) continue;
      const bp = V(b.x, 1, b.z), out = V(b.x - c.x, 0, b.z - c.z).normalize();
      for (let k = 0; k < N(4); k++) kit.streak(bp, { r0: 0.3, r1: 1.6, y: R(-0.3, 0.6), a0: Math.atan2(out.z, out.x) + R(-0.8, 0.8), span: 1.2, life: 0.35, w: 0.12, color: C.mint });
      for (let k = 0; k < N(8); k++) kit.flame(bp, { v: out.clone().multiplyScalar(R(4, 8)).add(V(R(-1, 1), R(0.5, 2), R(-1, 1))), w: 0.35, h: 0.55, life: 0.4, g: 0 });
    }
    if (e.i >= 0) ring(ctx.fighterPos(e.i, true), C.mint);
  }

  function onEvent(e, ctx) {
    const P = e.pos ? V(e.pos.x, e.pos.y || 0, e.pos.z) : null;
    switch (e.type) {
      case 'cast': {
        if (e.kind !== 'fireball') return;
        const v = ctx.spellVel ? ctx.spellVel(e.id) : null, dir = v ? V(v.x, v.y, v.z).normalize() : V(0, 0, 1);
        fireMuzzle(P, dir); return;
      }
      case 'explode': if (e.kind === 'fireball') fireBurst(P, e.r || 2, !!(e.hits && e.hits.length), ctx); return;
      case 'trail': if (e.on && e.i >= 0) flames(ctx.fighterPos(e.i, true), 5, { spread: 0.1, out: 1.5, up: 1 }); return;
      case 'zoneFear': flames(ground(P), 4, { spread: 0.4, out: 1, up: 3, big: 1.6 }); return;
      case 'gust': gust(e, ctx); return;
      case 'tornado': if (e.i >= 0) ring(ctx.fighterPos(e.i, true), C.mint); dust(P, 6, 0.8, 1.5); return;
      case 'fireTornado': if (fx) fx.flash(V(P.x, 1.5, P.z), 0xff8a3a, 4, 0.4); flames(ground(P), 10, { spread: 0.8, out: 3, up: 3, big: 1.4 }); return;
      case 'swallow': if (fx) fx.flash(P, 0xffe6b0, 2, 0.25); return;
      case 'whip': case 'whipMiss': {
        const tip = e.i >= 0 ? ctx.fighterPos(e.i, true) : P;
        droplets(tip, 10, 4, 1.5); ring(tip, 0xffffff, 0.5);
        if (e.type === 'whip' && e.j >= 0) {
          const p = ctx.fighterPos(e.j, false);
          for (let k = 0; k < N(12); k++) { const a = k / 12 * 6.28; kit.chunk('drop', p, { v: outward(a, 2.5, R(2, 3.5)), size: R(0.04, 0.065), life: 0.7, g: -12, bounce: 0.1 }); }
          word('철썩', p, ctx, 'f' + e.j);
        }
        return;
      }
      case 'whipCut': {
        if (e.i < 0 || e.j < 0) return;
        const a = ctx.fighterPos(e.i, true), b = ctx.fighterPos(e.j, false), mid = a.clone().lerp(b, 0.5);
        for (let k = 0; k < N(14); k++) kit.chunk('drop', a.clone().lerp(b, R(0.2, 0.8)), { v: V(R(-1, 1), R(-0.5, 1), R(-1, 1)), size: R(0.04, 0.07), life: 0.8, g: -12, bounce: 0.1 });
        kit.decal('wet', mid, 1.3, { life: 4 }); return;
      }
      case 'iceUp': if (e.i >= 0) { const tip = ctx.fighterPos(e.i, true); droplets(tip, 8, 3, 1.5); ring(tip, 0xffffff, 0.5); } return;
      case 'slip':
        for (let k = 0; k < N(10); k++) { const a = R(0, 6.28); kit.chunk('shard', V(P.x, 0.1, P.z), { v: outward(a, R(2, 5), R(1, 3)), size: R(0.025, 0.04), color: 0xffffff, life: 0.6 }); }
        for (let k = 0; k < N(4); k++) { const a = R(0, 6.28); kit.chunk('shard', V(P.x, 0.1, P.z), { v: outward(a, R(2, 4), R(2, 4)), size: R(0.06, 0.09), life: 0.9 }); }
        word('쭈욱', V(P.x, P.y + 0.8, P.z), ctx, 'h' + e.k); return;
      case 'iceBreak':
        if (fx) fx.flash(V(P.x, 0.5, P.z), 0xbfe9ff, 2, 0.15);
        for (let k = 0; k < N(18); k++) { const a = R(0, 6.28); kit.chunk('shard', V(P.x + Math.cos(a) * R(0, 1.5), 0.15, P.z + Math.sin(a) * R(0, 1.5)), { v: outward(a, R(3, 7), R(2, 5)), size: R(0.06, 0.14), life: R(0.8, 1.2) }); }
        kit.decal('frost', P, 3, { life: 2.5, opacity: 0.8 }); return;
      case 'wallUp': {
        if (e.i >= 0) { const cp = ctx.fighterPos(e.i, false); kit.decal('crack', cp, 1.2, { life: 3 }); dirt(V(cp.x, 0.1, cp.z), 5, 2); }
        const yaw = e.yaw || 0, ax = V(Math.cos(yaw), 0, -Math.sin(yaw)), w = e.w || 4;
        kit.decal('crack', P, 1, { life: 6, yaw, sx: w * 1.2, sz: 1.8 });
        for (let k = 0; k < N(10); k++) { const s = R(-w / 2, w / 2); kit.chunk('rock', V(P.x + ax.x * s, 0.2, P.z + ax.z * s), { v: V(R(-1.5, 1.5), R(3, 6), R(-1.5, 1.5)), size: R(0.06, 0.13), color: k % 2 ? C.wallRock : C.dirt, life: 1.2 }); }
        for (let k = 0; k < N(8); k++) { const s = R(-w / 2, w / 2), side = k % 2 ? 1 : -1; kit.puff(V(P.x + ax.x * s, 0.25, P.z + ax.z * s), C.dust, { v: V(-ax.z * side * R(1, 2.5), R(0.1, 0.4), ax.x * side * R(1, 2.5)), s0: 0.3, s1: R(0.7, 1.1), life: R(0.7, 1) }); }
        return;
      }
      case 'wallDown': dirt(V(P.x, 0.3, P.z), 8, 2.5); dust(P, 4, 0.8); return;
      case 'wallCrash': {
        for (let k = 0; k < N(12); k++) { const a = R(0, 6.28); kit.chunk('rock', P, { v: outward(a, R(3, 7), R(2, 6)), size: R(0.1, 0.22), color: k % 2 ? C.wallRock : C.dirt, life: 1.4 }); }
        dust(P, 6, 1.0, 2); word('쿵', V(P.x, P.y + 0.8, P.z), ctx, 'h' + e.k); return;
      }
      case 'fissure': if (e.i >= 0) { const cp = ctx.fighterPos(e.i, false); kit.decal('crack', cp, 1.2, { life: 3 }); dirt(V(cp.x, 0.1, cp.z), 5, 2); } return;
      case 'trip': dirt(V(P.x, 0.2, P.z), 10, 4); dust(P, 4, 0.9); word('쿵', V(P.x, P.y + 0.8, P.z), ctx, 'h' + e.k); return;
      case 'steam':
        for (let k = 0; k < N(10); k++) kit.puff(V(P.x + R(-1, 1), 0.4, P.z + R(-1, 1)), C.steam, { v: V(R(-0.8, 0.8), R(1, 2), R(-0.8, 0.8)), s0: 0.3, s1: R(0.7, 1.2), life: R(1.2, 1.8), delay: R(0, 0.2), drag: 0.6 });
        word('치익', V(P.x, 1.6, P.z), ctx, 's' + Math.round(P.x) + ',' + Math.round(P.z)); return;
    }
  }

  // ---------- 지팡이 원소 오라 ----------
  const dropGeo = new THREE.SphereGeometry(1, 10, 8), torusGeo = new THREE.TorusGeometry(1, 0.09, 4, 22);
  const windMats = [new THREE.MeshBasicMaterial({ color: C.mint, transparent: true, opacity: 0.85 }), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })];
  function makeAura(job) {
    const g = new THREE.Group(), a = { job, g, parts: [], emberT: 0 };
    if (job === 'fire') for (let k = 0; k < 2; k++) { const f = kit.newFlame(); g.add(f); a.parts.push(f); }
    if (job === 'water') { const core = new THREE.Mesh(dropGeo, kit.mat('drop')); core.scale.setScalar(0.07); g.add(core); a.parts.push(core); for (let k = 0; k < 6; k++) { const d = new THREE.Mesh(dropGeo, kit.mat('drop')); d.scale.setScalar(0.025); g.add(d); a.parts.push(d); } }
    if (job === 'wind') for (let k = 0; k < 2; k++) { const r = new THREE.Mesh(torusGeo, windMats[k]); r.scale.setScalar(k ? 0.26 : 0.18); g.add(r); a.parts.push(r); }
    if (job === 'earth') for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(kit.GEO.rock, kit.mat('rock', [0x8a6a48, 0x9a7448, 0x7d5f3e][k])); s.scale.setScalar(0.05); g.add(s); a.parts.push(s); }
    for (const p of a.parts) if (p.isMesh) p.castShadow = false;
    scene.add(g); return a;
  }
  function dropAura(i) { const a = auras.get(i); if (!a) return; scene.remove(a.g); for (const p of a.parts) if (p.isSprite) kit.disposeFlame(p); auras.delete(i); }
  function animAura(a, t, dt, pos) {
    const P = a.parts;
    if (a.job === 'fire') {
      P.forEach((f, k) => { const fl = Math.sin(t * 26 + k * 2); f.position.set(k ? 0.04 : -0.03, -0.02, 0); f.scale.set(0.16 * (1 + fl * 0.12), 0.26 * (1 + fl * 0.2), 1); f.material.rotation = Math.sin(t * 9 + k) * 0.2; });
      a.emberT -= dt; if (a.emberT <= 0) { a.emberT = 0.25; kit.chunk('ember', pos, { v: V(R(-0.3, 0.3), R(1, 2), R(-0.3, 0.3)), size: 0.025, color: C.fireA, life: 0.6, g: 1, drag: 1 }); }
    }
    if (a.job === 'water') for (let k = 1; k < P.length; k++) { const an = t * 4 + k * 6.28 / 6; P[k].position.set(Math.cos(an) * 0.13, Math.sin(t * 3 + k) * 0.08, Math.sin(an) * 0.13); }
    if (a.job === 'wind') { P[0].rotation.set(t * 5, t * 3, 0); P[1].rotation.set(-t * 4, 0, t * 6); }
    if (a.job === 'earth') P.forEach((s, k) => { const an = t * 2.2 + k * 2.09; s.position.set(Math.cos(an) * 0.22, Math.sin(t * 3 + k) * 0.05, Math.sin(an) * 0.22); s.rotation.set(t * 2 + k, t * 3, 0); });
  }

  // ---------- 날아가는 화염구 ----------
  const coreGeo = new THREE.IcosahedronGeometry(1, 1), coreMat = toon(C.fireC, { emissive: 0xffa020, ei: 0.9 });
  const _pa = V(), _pb = V();
  function makeBall() {
    const g = new THREE.Group(), core = new THREE.Mesh(coreGeo, coreMat), halo = kit.newGlow(0xff8a3a, 1);
    core.castShadow = false; halo.material.opacity = 0.7; g.add(core, halo);
    const cards = []; for (let k = 0; k < 6; k++) { const f = kit.newFlame(); g.add(f); cards.push(f); }
    scene.add(g);
    return { g, core, halo, cards, tail: kit.newRibbon(16), hist: [], emberT: 0 };
  }
  function fireballMove(id, pos, vel, r, dt) {
    let b = balls.get(id); if (!b) { b = makeBall(); balls.set(id, b); }
    const sz = r * 1.5, p = V(pos.x, pos.y, pos.z), d = V(vel.x, vel.y, vel.z); const sp = d.length(); if (sp > 1e-3) d.divideScalar(sp); else d.set(0, 0, 1);
    b.g.position.copy(p); b.core.scale.setScalar(sz * 0.9); b.core.rotation.x += dt * 9; b.core.rotation.y += dt * 7; b.halo.scale.setScalar(sz * 5);
    // 불꽃 판: 진행 반대쪽(화면에서)으로 끝이 향한다
    let rot = 0;
    if (camera) { _pa.copy(p).project(camera); _pb.copy(p).addScaledVector(d, -1).project(camera); rot = Math.atan2(_pb.y - _pa.y, _pb.x - _pa.x) - Math.PI / 2; }
    b.cards.forEach((f, k) => {
      const back = sz * (0.2 + (k % 3) * 0.35), fl = Math.sin(clock * 22 + k * 1.7);
      f.position.set(-d.x * back + fl * 0.04, -d.y * back + Math.cos(clock * 17 + k) * 0.04, -d.z * back);
      f.scale.set(sz * 2.2 * (0.85 + 0.15 * fl), sz * 3.2 * (0.8 + 0.2 * fl) * (1 - (k % 3) * 0.2), 1);
      f.material.rotation = rot + Math.sin(clock * 13 + k) * 0.15;
    });
    if (!b.hist.length || b.hist[0].distanceTo(p) > 0.15) { b.hist.unshift(p.clone()); if (b.hist.length > 16) b.hist.pop(); }
    const pts = [p, ...b.hist.slice(p.distanceTo(b.hist[0]) < 0.05 ? 1 : 0)].slice(0, 16);
    b.tail.set(pts, (u) => sz * 1.6 * (1 - u), tailColor, camera ? camera.position : V(0, 5, -10));
    b.emberT -= dt; if (b.emberT <= 0) { b.emberT = 0.05; kit.chunk('ember', p.clone().add(V(R(-0.1, 0.1), R(-0.1, 0.1), R(-0.1, 0.1))), { v: d.clone().multiplyScalar(-2).add(V(0, -1, 0)), size: 0.03, color: C.fireA, life: 0.5, g: -6 }); }
  }
  function fireballEnd(id) { const b = balls.get(id); if (!b) return; scene.remove(b.g); b.cards.forEach((f) => kit.disposeFlame(f)); b.halo.material.dispose(); b.tail.dispose(); balls.delete(id); }

  return {
    kit, onEvent, fireballMove, fireballEnd,
    fireballIds() { return [...balls.keys()]; },
    update(B, dt, ctx) {
      clock += dt;
      while (booms.length && clock - booms[0].t > 0.5) booms.shift();
      if (B && B.fighters) B.fighters.forEach((fb, i) => {
        const job = ctx.jobOf(i); let a = auras.get(i);
        if (a && a.job !== job) { dropAura(i); a = null; }
        if (!job) return;
        if (!a) { a = makeAura(job); auras.set(i, a); }
        const show = fb.weapon >= 0 && fb.state !== 'ko';
        a.g.visible = show; if (!show) return;
        const pos = ctx.fighterPos(i, true), ch = fb.charging ? Math.min(1, fb.charge / CFG.spell.fMax) : 0;
        a.g.position.copy(pos); a.g.scale.setScalar((1 + ch * 0.8) * (i === ctx.player && ctx.view === 'fp' ? 0.55 : 1));
        animAura(a, clock, dt, pos);
      });
      kit.update(dt, ctx && ctx.camPos ? ctx.camPos : V(0, 5, -10));
    },
    prewarm(renderer, cam) { kit.prewarm(renderer, cam); },
    clear() { for (const id of [...balls.keys()]) fireballEnd(id); for (const i of [...auras.keys()]) dropAura(i); kit.clear(); booms.length = 0; gates.clear(); },
    stats() { return { ...kit.stats(), auras: auras.size, balls: balls.size }; },
  };
}
