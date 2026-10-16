// 마법 보기: 땅 위 구역(불 자리·불길·빙판), 흙벽, 회오리, 땅가르기 균열, 물채찍. 프레임만 보고 그린다(다시 보기도 같은 프레임)
// 재료(kit)는 elemFx와 같이 쓴다. 점광원은 쓰지 않는다 (빛 개수가 바뀌면 모든 재질이 다시 컴파일되어 끊긴다)
import * as THREE from 'three';
import { toon, part } from './models.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const easeOut = (k) => 1 - (1 - k) * (1 - k);
function seeded(id) { let s = (id * 2654435761) % 2147483647 || 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

export function createMagicView(scene, kit) {
  const root = new THREE.Group(); scene.add(root);
  const live = new Map();   // key → { obj, seen, born, dispose? }
  const discGeo = new THREE.CircleGeometry(1, 40), planeGeo = new THREE.PlaneGeometry(1, 1);
  const funnelGeo = new THREE.ConeGeometry(1, 1, 18, 6, true), ringGeo = new THREE.TorusGeometry(1, 0.18, 6, 24);
  const own = (m) => { m.userData.own = true; return m; };   // 이 물체만 쓰는 재질·도형: 사라질 때 버린다
  const MAT = {
    ice: () => own(new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.75, depthWrite: false })),
    iceCrack: () => own(new THREE.MeshBasicMaterial({ map: kit.TEX.iceCrack, transparent: true, opacity: 0.9, depthWrite: false })),
    burn: () => own(new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.35, depthWrite: false })),   // 더하기 섞기는 모래 위에서 연노랑으로 바랜다
    trailFloor: () => own(new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.7, depthWrite: false })),
    crack: (L) => { const map = kit.TEX.fissure.clone(); map.needsUpdate = true; map.wrapT = THREE.RepeatWrapping; map.repeat.set(1, L); return own(new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); },
    funnel: (k) => own(new THREE.MeshBasicMaterial({ color: [0xf4fffa, 0xc8f2e0, 0x8fd6b4][k], transparent: true, opacity: [0.35, 0.5, 0.65][k], depthWrite: false, side: THREE.DoubleSide })),
    dustRing: () => own(new THREE.MeshBasicMaterial({ color: 0x8a6a40, transparent: true, opacity: 0.6, depthWrite: false })),
    swirl: () => own(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false })),
  };
  const ROCKS = [0xb88a58, 0xa47a4c, 0xc49a68, 0x9a7448];
  let clock = 0;
  function get(key, make) {
    let e = live.get(key);
    if (!e) { e = make(); e.born = clock; root.add(e.obj); live.set(key, e); }
    e.seen = true;
    return e;
  }
  function drop(k, e) {
    root.remove(e.obj); if (e.dispose) e.dispose(); live.delete(k);
    e.obj.traverse((o) => { if (o.material && o.material.userData.own) o.material.dispose(); if (o.geometry && o.geometry.userData.own) o.geometry.dispose(); });
  }
  // 불꽃 혀 n개: 흔들리며 선다 (불 자리·불길·불 회오리)
  function tongues(g, n, place, big = 1) { const fl = []; for (let k = 0; k < n; k++) { const f = kit.newFlame(); place(f, k); f.userData.s = big * (0.75 + 0.5 * ((k * 37) % 10) / 10); g.add(f); fl.push(f); } return fl; }
  function flick(fl, t, op = 1) { fl.forEach((f, k) => { const a = Math.sin(t * 18 + k * 2.3), s = f.userData.s; f.scale.set(0.5 * s * (1 + a * 0.12), 0.8 * s * (1 + a * 0.22), 1); f.material.rotation = Math.sin(t * 7 + k) * 0.12; f.material.opacity = op; }); }

  // B: 프레임, t: 시간, fighterPos(i, tip) → Vector3, dt: 지난 그림에서 흐른 시간
  function update(B, t, fighterPos, dt = 1 / 60) {
    if (!B || !B.zones) return;
    clock = t;
    for (const e of live.values()) e.seen = false;
    for (const z of B.zones) {
      const fade = Math.max(0, Math.min(1, (z.life - z.t) / 0.6));
      if (z.kind === 'ice') {
        const e = get('z' + z.id, () => {
          const g = new THREE.Group(), rnd = seeded(z.id), disc = new THREE.Mesh(discGeo, MAT.ice()), crack = new THREE.Mesh(discGeo, MAT.iceCrack());
          disc.rotation.x = crack.rotation.x = -Math.PI / 2; disc.position.y = 0.03; crack.position.y = 0.035; g.add(disc, crack);
          const n = 8 + (z.id % 5), cr = [];
          for (let k = 0; k < n; k++) { const s = new THREE.Mesh(kit.GEO.shard, kit.mat('shard')); const a = k / n * Math.PI * 2 + rnd() * 0.4; s.userData = { a, h: 0.25 + rnd() * 0.35, tilt: (rnd() - 0.5) * 0.6 }; s.castShadow = false; g.add(s); cr.push(s); }
          const sp = []; for (let k = 0; k < 3; k++) { const gl = kit.newGlow(0xffffff, 0.35); g.add(gl); sp.push(gl); }
          return { obj: g, disc, crack, cr, sp, dispose: () => sp.forEach((s) => s.material.dispose()) };
        });
        const grow = easeOut(Math.min(1, (t - e.born) / 0.3)), r = z.r * grow;
        e.obj.position.set(z.a.x, 0, z.a.z);
        e.disc.scale.setScalar(Math.max(0.01, r)); e.crack.scale.setScalar(Math.max(0.01, r));
        e.disc.material.opacity = 0.75 * fade; e.crack.material.opacity = 0.9 * fade;
        e.cr.forEach((s) => { const u = s.userData; s.position.set(Math.cos(u.a) * r * 0.92, 0, Math.sin(u.a) * r * 0.92); s.rotation.set(u.tilt, u.a, -u.tilt); s.scale.setScalar(u.h * grow * fade); });
        e.sp.forEach((s, k) => { const a = t * 0.8 + k * 2.1; s.position.set(Math.cos(a) * r * 0.5, 0.15, Math.sin(a) * r * 0.5); s.material.opacity = Math.max(0, Math.sin(t * 5 + k * 2)) * fade; });
      } else if (z.kind === 'burn') {
        const e = get('z' + z.id, () => {
          const g = new THREE.Group(), rnd = seeded(z.id), disc = new THREE.Mesh(discGeo, MAT.burn()); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; g.add(disc);
          const fl = tongues(g, 6, (f, k) => { const a = rnd() * 6.28, rr = Math.sqrt(rnd()) * z.r * 0.7; f.position.set(Math.cos(a) * rr, 0.02, Math.sin(a) * rr); }, 1.1);
          return { obj: g, disc, fl, dispose: () => fl.forEach((f) => kit.disposeFlame(f)) };
        });
        e.obj.position.set(z.a.x, 0, z.a.z); e.disc.scale.setScalar(z.r);
        e.disc.material.opacity = (0.3 + Math.sin(t * 20 + z.id) * 0.08) * fade; flick(e.fl, t, fade);
      } else {   // 불길: 땅에 깔린 띠 + 불꽃 혀 (1m에 2개꼴)
        const e = get('z' + z.id, () => {
          const g = new THREE.Group(), flat = new THREE.Mesh(planeGeo, MAT.trailFloor()); flat.rotation.x = -Math.PI / 2; flat.position.y = 0.05; g.add(flat);
          const L = Math.hypot(z.b.x - z.a.x, z.b.z - z.a.z) + z.r, n = Math.max(2, Math.min(16, Math.round(L * 2)));
          const fl = tongues(g, n, (f, k) => f.position.set(((k * 53) % 10 / 10 - 0.5) * z.r * 0.9, 0.02, (k + 0.5) / n * L - L / 2), 1.2);
          return { obj: g, flat, fl, L, emberT: 0, dispose: () => fl.forEach((f) => kit.disposeFlame(f)) };
        });
        const dx = z.b.x - z.a.x, dz = z.b.z - z.a.z;
        e.obj.position.set((z.a.x + z.b.x) / 2, 0, (z.a.z + z.b.z) / 2); e.obj.rotation.set(0, Math.atan2(dx, dz), 0);
        e.flat.scale.set(z.r * 1.6, e.L, 1); e.flat.material.opacity = (0.55 + Math.sin(t * 14 + z.id) * 0.15) * fade; flick(e.fl, t, fade);
        e.emberT -= dt; if (e.emberT <= 0 && fade > 0.3) { e.emberT = 0.15; const f = e.fl[(Math.random() * e.fl.length) | 0]; kit.chunk('ember', f.getWorldPosition(V()).add(V(0, 0.3, 0)), { v: V(kit.R(-0.4, 0.4), kit.R(1, 2.2), kit.R(-0.4, 0.4)), size: 0.03, color: 0xffb030, life: 0.6, g: 1, drag: 1 }); }
      }
    }
    // 흙벽: 각진 바위 덩이 (판정은 시뮬의 상자 그대로). 솟음·가라앉음은 프레임 높이가 한다
    for (const w of B.walls) {
      const e = get('w' + w.id, () => {
        const g = new THREE.Group(), rnd = seeded(w.id), n = Math.max(3, Math.round(w.w / 0.8));
        part(own(new THREE.BoxGeometry(w.w * 0.94, w.h * 0.82, 0.42)), 0xa47a4c, g, { pos: [0, -w.h * 0.09, 0], outline: 0.025 });   // 판판한 흙판: 바위 사이가 비어 보이지 않게
        for (let k = 0; k < n; k++) { const sy = w.h * (0.36 + rnd() * 0.08); part(kit.GEO.rock, ROCKS[k % 4], g, { pos: [-w.w / 2 + (k + 0.5) * w.w / n, -w.h / 2 + sy * 0.95, (rnd() - 0.5) * 0.08], scale: [w.w / n * 0.72, sy, 0.38], rot: [rnd() * 0.4, rnd() * 3, rnd() * 0.3], outline: 0.05 }); }
        for (let k = 0; k < n - 1; k++) { const sy = w.h * (0.2 + rnd() * 0.14); part(kit.GEO.rock, ROCKS[(k + 2) % 4], g, { pos: [-w.w / 2 + (k + 1) * w.w / n, w.h / 2 - sy * 0.75, (rnd() - 0.5) * 0.1], scale: [w.w / n * 0.5, sy, 0.32], rot: [rnd() * 0.5, rnd() * 3, rnd() * 0.4], outline: 0.05 }); }
        return { obj: g, lastY: w.p.y, crumbleT: 0 };
      });
      e.obj.position.set(w.p.x, w.p.y, w.p.z); e.obj.rotation.set(0, w.yaw, 0);
      // 가라앉는 동안 위에서 흙덩이가 흘러내린다
      e.crumbleT -= dt;
      if (w.p.y < e.lastY - 1e-3 && e.crumbleT <= 0) { e.crumbleT = 0.08; const s = kit.R(-w.w / 2, w.w / 2); kit.chunk('rock', V(w.p.x + Math.cos(w.yaw) * s, w.p.y + w.h / 2, w.p.z - Math.sin(w.yaw) * s), { v: V(kit.R(-1, 1), kit.R(0.5, 2), kit.R(-1, 1)), size: kit.R(0.05, 0.1), color: 0x8a6236, life: 0.9 }); }
      e.lastY = w.p.y;
    }
    for (const tr of B.tornados) {
      const e = get('t' + tr.id, () => {
        const g = new THREE.Group(), rnd = seeded(tr.id);
        for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(funnelGeo, MAT.funnel(k)); c.rotation.x = Math.PI; c.position.y = 1.8; c.scale.set(2.2 - k * 0.55, 3.6, 2.2 - k * 0.55); g.add(c); }
        const ring = new THREE.Mesh(ringGeo, MAT.dustRing()); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; ring.scale.setScalar(1.3); g.add(ring);
        // 휘도는 흰 고리 넷: 위로 갈수록 넓고, 각자 다른 박자로 흔들린다 (투명 깔때기만으로는 빛기둥처럼 보인다)
        for (let k = 0; k < 4; k++) { const sw = new THREE.Mesh(ringGeo, MAT.swirl()); sw.rotation.x = -Math.PI / 2; sw.position.y = 0.7 + k * 0.85; const r = 0.45 + k * 0.42; sw.scale.set(r, r, 0.35 + k * 0.1); g.add(sw); }
        // 빨려 올라가는 모래 덩이 6 + 돌멩이 4 (나선)
        const deb = []; for (let k = 0; k < 10; k++) { const m = new THREE.Mesh(kit.GEO.rock, kit.mat('rock', k < 6 ? 0xc8a878 : 0x8a7a68)); m.castShadow = false; m.userData = { ph: rnd(), sp: 0.7 + rnd() * 0.5, s: k < 6 ? 0.2 : 0.11 }; root.add(m); deb.push(m); }
        const bands = [kit.newRibbon(20), kit.newRibbon(20)], fire = [];
        return { obj: g, deb, bands, fire, pts: Array.from({ length: 20 }, () => V()), dispose: () => { deb.forEach((m) => root.remove(m)); bands.forEach((b) => b.dispose()); fire.forEach((f) => kit.disposeFlame(f)); } };
      });
      const o = e.obj; o.position.set(tr.x, 0, tr.z); o.rotation.y = t * 9;
      o.children[3].scale.setScalar(1.8 + Math.sin(t * 12) * 0.2);
      for (let k = 0; k < 4; k++) { const sw = o.children[4 + k], a = t * 7 + k * 1.7; sw.position.x = Math.sin(a) * 0.25 * (k + 1) * 0.5; sw.position.z = Math.cos(a) * 0.25 * (k + 1) * 0.5; }
      e.deb.forEach((m, k) => { const u = m.userData, h = ((t * 0.45 * u.sp + u.ph) % 1), a = t * (5 + k % 3) + k * 1.1, rr = 0.4 + h * 0.9; m.position.set(tr.x + Math.cos(a) * rr, h * 3.4, tr.z + Math.sin(a) * rr); m.scale.setScalar(u.s * (h < 0.85 ? 1 : (1 - h) / 0.15)); m.rotation.set(t * 4 + k, t * 3, 0); });
      e.bands.forEach((b, k) => { e.pts.forEach((p, j) => { const s = j / 19, a = -t * 9 + s * Math.PI * 4 + k * Math.PI; p.set(tr.x + Math.cos(a) * (0.5 + s * 1.6), 0.2 + s * 3.2, tr.z + Math.sin(a) * (0.5 + s * 1.6)); }); b.set(e.pts, (u) => 0.18 * Math.sin(Math.PI * u), (u, out) => { out[0] = out[1] = out[2] = tr.fire ? 1 : 1; if (tr.fire) { out[1] = 0.75; out[2] = 0.45; } out[3] = 0.7; return out; }, fighterPos.cam || V(0, 6, -12)); });
      if (tr.fire && !o.userData.fire) {
        o.userData.fire = true; [0xffd27a, 0xff8a3a, 0xe2501c].forEach((c, k) => o.children[k].material.color.set(c)); for (let k = 4; k < 8; k++) o.children[k].material.color.set(0xffe0a0);
        e.deb.forEach((m) => { m.geometry = kit.GEO.ember; m.material = kit.mat('ember', 0xffb030); });
        for (let k = 0; k < 6; k++) { const f = kit.newFlame(); f.userData.s = 1.6; o.add(f); e.fire.push(f); }
      }
      e.fire.forEach((f, k) => { const a = k / 6 * 6.28; f.position.set(Math.cos(a) * 0.6, 0.2 + (k % 3) * 0.9, Math.sin(a) * 0.6); });
      if (e.fire.length) flick(e.fire, t);
    }
    // 땅가르기: 지그재그 균열 + 앞머리 뾰족 바위 3개 + 0.5m마다 흙먼지
    for (const s of B.fissures) {
      const e = get('f' + s.id, () => {
        const g = new THREE.Group(), m = new THREE.Mesh(planeGeo, MAT.crack(1)); m.rotation.order = 'YXZ'; g.add(m);
        const sp = []; for (let k = 0; k < 3; k++) { const c = part(kit.GEO.cone, 0x8a6a48, null, { outline: 0.06 }); root.add(c); sp.push(c); }
        return { obj: g, m, sp, lastF: 0, stopT: -1, dispose: () => { sp.forEach((c) => root.remove(c)); m.material.map.dispose(); m.material.dispose(); } };
      });
      const L = Math.max(0.1, s.front), m = e.m;
      m.position.set(s.o.x + s.dir.x * L / 2, 0.04, s.o.z + s.dir.z * L / 2);
      m.rotation.set(-Math.PI / 2, Math.atan2(s.dir.x, s.dir.z), 0, 'YXZ'); m.scale.set(1.1, L, 1); m.material.map.repeat.set(1, L / 2.5);
      if (s.front >= s.len && e.stopT < 0) e.stopT = t;
      const sink = e.stopT < 0 ? 1 : Math.max(0, 1 - (t - e.stopT) / 0.3);
      e.sp.forEach((c, k) => { const d = Math.max(0, L - k * 0.7), hgt = [1, 0.65, 0.35][k] * sink; c.visible = hgt > 0.02; c.position.set(s.o.x + s.dir.x * d, hgt * 0.45, s.o.z + s.dir.z * d); c.scale.set(0.28, Math.max(0.01, hgt), 0.28); c.rotation.set(Math.sin(k * 3) * 0.2, k, Math.cos(k * 2) * 0.2); });
      while (e.lastF + 0.5 <= s.front) { e.lastF += 0.5; const p = V(s.o.x + s.dir.x * e.lastF, 0.15, s.o.z + s.dir.z * e.lastF); kit.puff(p, 0xd9b67c, { v: V(kit.R(-0.8, 0.8), kit.R(0.3, 0.8), kit.R(-0.8, 0.8)), s0: 0.2, s1: kit.R(0.45, 0.7), life: 0.7 }); }
    }
    // 물채찍: 지팡이 끝에서 상대까지 뻗는 물줄기(흰 거품 띠 위에 하늘색 띠) + 상대 몸통을 두 바퀴 감기
    B.whips.forEach((j, i) => {
      if (j < 0) return;
      const e = get('h' + i, () => ({ obj: new THREE.Group(), foam: kit.newRibbon(40), water: kit.newRibbon(40), pts: Array.from({ length: 40 }, () => V()), dripT: 0, dispose() { this.foam.dispose(); this.water.dispose(); } }));
      const a = fighterPos(i, true), b = fighterPos(j, false), ext = Math.min(1, (t - e.born) / 0.15), cam = fighterPos.cam || V(0, 6, -12);
      const side = V().subVectors(b, a).cross(V(0, 1, 0)).normalize(), nMain = 26, nCoil = 14;
      for (let k = 0; k < nMain; k++) {
        const u = k / (nMain - 1) * ext, sag = 0.5 * 4 * u * (1 - u), wave = Math.sin(u * 10 - t * 20) * 0.08 * 4 * u * (1 - u);
        e.pts[k].lerpVectors(a, b, u).addScaledVector(side, wave); e.pts[k].y -= sag;
      }
      let n = nMain;
      if (ext >= 1) for (let k = 0; k < nCoil; k++, n++) { const s = (k + 1) / nCoil, an = Math.atan2(a.z - b.z, a.x - b.x) + s * Math.PI * 4 + t * 6; e.pts[n].set(b.x + Math.cos(an) * 0.3, b.y - 0.25 + s * 0.45, b.z + Math.sin(an) * 0.3); }
      const pts = e.pts.slice(0, n), wAt = (k) => (u) => k * (0.6 + 0.4 * Math.sin(Math.PI * Math.min(1, u * 1.2)));
      e.foam.set(pts, wAt(0.3), (u, o) => { o[0] = o[1] = o[2] = 1; o[3] = 0.8; return o; }, cam);
      e.water.set(pts, wAt(0.19), (u, o) => { o[0] = 0.35; o[1] = 0.78; o[2] = 1; o[3] = 0.95; return o; }, cam);
      e.water.mesh.renderOrder = 6;
      e.dripT -= dt; if (e.dripT <= 0) { e.dripT = 0.08; kit.chunk('drop', pts[(Math.random() * nMain * ext) | 0].clone(), { v: V(0, -0.5, 0), size: kit.R(0.03, 0.05), life: 0.6, g: -12, bounce: 0.1 }); }
    });
    for (const [k, e] of live) if (!e.seen) drop(k, e);
  }
  function clear() { for (const [k, e] of [...live]) drop(k, e); }
  return { update, clear, root };
}
