// 마법 보기: 땅 위 구역(불 자리·불길·빙판), 흙벽, 회오리, 땅가르기 균열, 물채찍. 프레임만 보고 그린다(다시 보기도 같은 프레임)
// 점광원은 쓰지 않는다 (빛 개수가 바뀌면 모든 재질이 다시 컴파일되어 끊긴다)
import * as THREE from 'three';
import { toon } from './models.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function createMagicView(scene) {
  const root = new THREE.Group(); scene.add(root);
  const live = new Map();   // key → { obj, seen }
  const discGeo = new THREE.CircleGeometry(1, 40), planeGeo = new THREE.PlaneGeometry(1, 1), boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const dropGeo = new THREE.SphereGeometry(1, 8, 6), DROPS = 16;
  const funnelGeo = new THREE.ConeGeometry(1, 1, 18, 6, true), ringGeo = new THREE.TorusGeometry(1, 0.18, 6, 24);
  const blendAdd = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide };
  const MAT = {
    ice: () => new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.75, depthWrite: false }),
    burn: () => new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.6, depthWrite: false }),   // 더하기 섞기는 모래 위에서 연노랑으로 바랜다
    trail: () => new THREE.MeshBasicMaterial({ color: 0xff8a3a, ...blendAdd, opacity: 0.6 }),
    trailFloor: () => new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.7, depthWrite: false }),
    crack: new THREE.MeshBasicMaterial({ color: 0x3a2412, transparent: true, opacity: 0.85, depthWrite: false }),
    wall: toon(0x9a7448),
    // 회오리는 모래 바닥과 섞이지 않게 바람 색(민트·흰색), 불 회오리는 주황
    funnel: (k) => new THREE.MeshBasicMaterial({ color: [0xf4fffa, 0xc8f2e0, 0x8fd6b4][k], transparent: true, opacity: [0.35, 0.5, 0.65][k], depthWrite: false, side: THREE.DoubleSide }),
    dustRing: () => new THREE.MeshBasicMaterial({ color: 0x8a6a40, transparent: true, opacity: 0.6, depthWrite: false }),
    swirl: () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }),
    water: new THREE.MeshBasicMaterial({ color: 0x5ac8ff }),
  };
  function get(key, make) {
    let e = live.get(key);
    if (!e) { e = { obj: make() }; root.add(e.obj); live.set(key, e); }
    e.seen = true;
    return e.obj;
  }
  // B: 프레임, t: 시간, fighterPos(i, tip) → Vector3 (tip이면 지팡이 끝)
  function update(B, t, fighterPos) {
    if (!B || !B.zones) return;
    for (const e of live.values()) e.seen = false;
    for (const z of B.zones) {
      const fade = Math.max(0, Math.min(1, (z.life - z.t) / 0.6));
      if (z.kind === 'ice' || z.kind === 'burn') {
        const o = get('z' + z.id, () => { const ms = new THREE.Mesh(discGeo, MAT[z.kind]()); ms.rotation.x = -Math.PI / 2; return ms; });
        o.position.set(z.a.x, z.kind === 'ice' ? 0.03 : 0.05, z.a.z); o.scale.setScalar(z.r);
        o.material.opacity = (z.kind === 'ice' ? 0.75 : 0.5 + Math.sin(t * 20 + z.id) * 0.15) * fade;
      } else {   // 불길: 땅에 깔린 띠 + 세로 불꽃 (뒤에서 따라가며 봐도 보이게)
        const o = get('z' + z.id, () => {
          const g = new THREE.Group(), flat = new THREE.Mesh(planeGeo, MAT.trailFloor()), up = new THREE.Mesh(planeGeo, MAT.trail());
          flat.rotation.x = -Math.PI / 2; flat.position.y = 0.05; up.rotation.y = Math.PI / 2; g.add(flat, up); return g;
        });
        const dx = z.b.x - z.a.x, dz = z.b.z - z.a.z, L = Math.hypot(dx, dz) + z.r, [flat, up] = o.children, hh = 0.9 + Math.sin(t * 18 + z.id) * 0.25;
        o.position.set((z.a.x + z.b.x) / 2, 0, (z.a.z + z.b.z) / 2); o.rotation.set(0, Math.atan2(dx, dz), 0);
        flat.scale.set(z.r * 1.6, L, 1); flat.material.opacity = (0.55 + Math.sin(t * 14 + z.id) * 0.15) * fade;
        up.scale.set(L, hh, 1); up.position.y = hh / 2; up.material.opacity = 0.6 * fade;
      }
    }
    for (const w of B.walls) {
      const o = get('w' + w.id, () => new THREE.Mesh(boxGeo, MAT.wall));
      o.position.set(w.p.x, w.p.y, w.p.z); o.rotation.set(0, w.yaw, 0); o.scale.set(w.w, w.h, 0.6);
    }
    for (const tr of B.tornados) {
      const o = get('t' + tr.id, () => {
        const g = new THREE.Group();
        for (let k = 0; k < 3; k++) { const c = new THREE.Mesh(funnelGeo, MAT.funnel(k)); c.rotation.x = Math.PI; c.position.y = 1.8; c.scale.set(2.2 - k * 0.55, 3.6, 2.2 - k * 0.55); g.add(c); }
        const ring = new THREE.Mesh(ringGeo, MAT.dustRing()); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.15; ring.scale.setScalar(1.3); g.add(ring);
        // 휘도는 흰 고리 넷: 위로 갈수록 넓고, 각자 다른 박자로 흔들린다 (투명 깔때기만으로는 빛기둥처럼 보인다)
        for (let k = 0; k < 4; k++) { const sw = new THREE.Mesh(ringGeo, MAT.swirl()); sw.rotation.x = -Math.PI / 2; sw.position.y = 0.7 + k * 0.85; const r = 0.45 + k * 0.42; sw.scale.set(r, r, 0.35 + k * 0.1); g.add(sw); }
        return g;
      });
      o.position.set(tr.x, 0, tr.z); o.rotation.y = t * 9;
      o.children[3].scale.setScalar(1.3 + Math.sin(t * 12) * 0.15);
      for (let k = 0; k < 4; k++) { const sw = o.children[4 + k], a = t * 7 + k * 1.7; sw.position.x = Math.sin(a) * 0.25 * (k + 1) * 0.5; sw.position.z = Math.cos(a) * 0.25 * (k + 1) * 0.5; }
      if (tr.fire && !o.userData.fire) { o.userData.fire = true; [0xffd27a, 0xff8a3a, 0xe2501c].forEach((c, k) => o.children[k].material.color.set(c)); for (let k = 4; k < 8; k++) o.children[k].material.color.set(0xffe0a0); }
    }
    for (const s of B.fissures) {
      const o = get('f' + s.id, () => { const ms = new THREE.Mesh(planeGeo, MAT.crack); ms.rotation.order = 'YXZ'; return ms; });
      const L = Math.max(0.1, s.front);
      o.position.set(s.o.x + s.dir.x * L / 2, 0.04, s.o.z + s.dir.z * L / 2);
      o.rotation.set(-Math.PI / 2, Math.atan2(s.dir.x, s.dir.z), 0, 'YXZ'); o.scale.set(0.5, L, 1);
    }
    // 물채찍: 지팡이 끝에서 상대까지 처진 곡선 위의 물방울 줄 (선은 1픽셀이라 안 보인다)
    B.whips.forEach((j, i) => {
      if (j < 0) return;
      const o = get('h' + i, () => { const g = new THREE.Group(); for (let k = 0; k < DROPS; k++) g.add(new THREE.Mesh(dropGeo, MAT.water)); return g; });
      const a = fighterPos(i, true), b = fighterPos(j, false), sag = 0.5 + Math.sin(t * 25) * 0.1;
      o.children.forEach((d, k) => {
        const u = k / (DROPS - 1);
        d.position.lerpVectors(a, b, u); d.position.y -= sag * 4 * u * (1 - u);
        d.position.x += Math.sin(t * 30 + k) * 0.04; d.scale.setScalar(0.06 + 0.04 * Math.sin(u * Math.PI));
      });
    });
    for (const [k, e] of live) if (!e.seen) { root.remove(e.obj); live.delete(k); }
  }
  function clear() { for (const e of live.values()) root.remove(e.obj); live.clear(); }
  return { update, clear, root };
}
