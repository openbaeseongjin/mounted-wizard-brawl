// 원소 이펙트 재료 여섯 가지: 툰 불꽃 · 띠 · 바람 줄기 · 덩어리 파편 · 툰 연기 뭉치 · 땅 자국
// 순간 효과는 미리 만든 묶음에서 꺼내 쓰고, 다 쓰면 가장 오래된 것부터 다시 쓴다(시합 중에 새로 만들지 않는다)
// 오래 남는 것(화염구 꼬리·물채찍·회오리 띠)은 newRibbon/newFlame으로 따로 만든다. 점광원은 쓰지 않는다
import * as THREE from 'three';
import { toon, glowTexture } from './models.js';

const CAP = { flame: 160, streak: 40, chunk: 180, puff: 90, decal: 28 };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const easeOut = (k) => 1 - (1 - k) * (1 - k);

// ---------- 캔버스 그림 (같은 무늬가 나오게 고정 난수) ----------
function lcg(seed) { let s = seed; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// 불꽃 혀: 바깥 빨강 → 주황 → 노랑 → 흰 노랑 속. 경계가 또렷한 물방울 모양, 아래가 바닥
function flameLayer(g, w, h, ty, rw, by, color) {
  const cx = w / 2, R = w * rw;
  g.fillStyle = color; g.beginPath(); g.moveTo(cx, h * ty);
  g.bezierCurveTo(cx + R * 0.3, h * (ty + 0.25), cx + R, h * (by - 0.32), cx + R * 0.82, h * (by - 0.1));
  g.bezierCurveTo(cx + R * 0.55, h * by, cx - R * 0.55, h * by, cx - R * 0.82, h * (by - 0.1));
  g.bezierCurveTo(cx - R, h * (by - 0.32), cx - R * 0.3, h * (ty + 0.25), cx, h * ty);
  g.closePath(); g.fill();
}
function blob(g, cx, cy, r, n, rnd) { g.beginPath(); for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2, rr = r * (0.75 + rnd() * 0.4); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); }
function cracks(g, cx, cy, n, len, rnd, width) {
  for (let k = 0; k < n; k++) {
    let a = k / n * Math.PI * 2 + rnd() * 0.5, x = cx, y = cy, w = width;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 5; s++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * len / 5; y += Math.sin(a) * len / 5; g.lineWidth = w; g.lineTo(x, y); g.stroke(); g.beginPath(); g.moveTo(x, y); w *= 0.72; }
  }
}
function makeTextures() {
  const T = {};
  T.flame = canvasTex(64, 96, (g, w, h) => {
    flameLayer(g, w, h, 0.02, 0.47, 0.99, '#d8401a'); flameLayer(g, w, h, 0.2, 0.37, 0.96, '#ff7a1a');
    flameLayer(g, w, h, 0.4, 0.27, 0.93, '#ffc23a'); flameLayer(g, w, h, 0.6, 0.15, 0.9, '#fff2b0');
  });
  T.scorch = canvasTex(128, 128, (g) => {
    const r = lcg(11); g.fillStyle = 'rgba(90,60,30,0.35)'; blob(g, 64, 64, 58, 14, r);
    g.fillStyle = 'rgba(38,24,14,0.8)'; for (let k = 0; k < 6; k++) blob(g, 64 + (r() - 0.5) * 30, 64 + (r() - 0.5) * 30, 18 + r() * 16, 10, r);
    g.strokeStyle = 'rgba(30,18,10,0.85)'; g.lineCap = 'round'; cracks(g, 64, 64, 7, 56, r, 6);
  });
  T.wet = canvasTex(128, 128, (g) => {
    const r = lcg(23); g.fillStyle = 'rgba(95,72,45,0.55)'; blob(g, 64, 64, 50, 16, r);
    g.strokeStyle = 'rgba(140,205,255,0.7)'; g.lineWidth = 4; g.beginPath(); for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI * 2, rr = 50 * (0.85 + r() * 0.2); g.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr); } g.stroke();
  });
  T.crack = canvasTex(128, 128, (g) => {
    const r = lcg(37); g.fillStyle = 'rgba(58,36,18,0.9)'; blob(g, 64, 64, 9, 8, r);
    g.strokeStyle = 'rgba(58,36,18,0.92)'; g.lineCap = 'round'; cracks(g, 64, 64, 7, 58, r, 7);
  });
  T.frost = canvasTex(128, 128, (g) => {
    const r = lcg(41); g.fillStyle = 'rgba(205,238,255,0.35)'; blob(g, 64, 64, 54, 14, r);
    g.strokeStyle = 'rgba(240,252,255,0.9)'; g.lineCap = 'round'; cracks(g, 64, 64, 6, 52, r, 4);
  });
  T.wave = canvasTex(128, 128, (g) => {
    g.fillStyle = 'rgba(232,210,168,0.9)'; g.beginPath(); g.arc(64, 64, 62, 0, Math.PI * 2); g.arc(64, 64, 48, 0, Math.PI * 2, true); g.fill();
    g.strokeStyle = 'rgba(176,136,80,0.85)'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 49, 0, Math.PI * 2); g.stroke();
  });
  T.iceCrack = canvasTex(256, 256, (g) => {
    const r = lcg(53); g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineCap = 'round';
    for (let k = 0; k < 5; k++) cracks(g, 128 + (r() - 0.5) * 120, 128 + (r() - 0.5) * 120, 3, 70, r, 3);
  });
  // 땅가르기: 세로로 이어 붙는 지그재그 균열 (위·아래 끝이 가운데에서 만난다)
  T.fissure = canvasTex(64, 256, (g, w, h) => {
    const r = lcg(61), pts = [[w / 2, 0]]; for (let k = 1; k < 8; k++) pts.push([w / 2 + (r() - 0.5) * w * 0.55, k * h / 8]); pts.push([w / 2, h]);
    const line = (width, color) => { g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'miter'; g.beginPath(); pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
    line(26, 'rgba(150,110,70,0.65)'); line(12, 'rgba(40,24,12,0.95)');
  });
  T.fissure.wrapT = THREE.RepeatWrapping;
  return T;
}

// ---------- 띠: 점 목록을 따라 카메라 쪽으로 편 삼각형 띠 (꼭짓점 색에 투명도) ----------
const RIB_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide });
const _t = V(), _vw = V(), _s = V(), _c4 = [0, 0, 0, 0];
class Ribbon {
  constructor(scene, maxPts) {
    this.max = maxPts; this.scene = scene;
    this.pos = new Float32Array(maxPts * 6); this.col = new Float32Array(maxPts * 8);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let k = 0; k < maxPts - 1; k++) { const a = k * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx); g.setDrawRange(0, 0);
    this.mesh = new THREE.Mesh(g, RIB_MAT); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.visible = false;
    scene.add(this.mesh);
  }
  // pts: Vector3[] (앞 → 뒤), widthAt(u) → 폭, colorAt(u, out) → out = [r,g,b,a]
  set(pts, widthAt, colorAt, cam) {
    const n = Math.min(pts.length, this.max);
    if (n < 2) { this.hide(); return; }
    for (let k = 0; k < n; k++) {
      const p = pts[k], a = pts[Math.max(0, k - 1)], b = pts[Math.min(n - 1, k + 1)], u = k / (n - 1);
      _t.subVectors(b, a); _vw.subVectors(cam, p); _s.crossVectors(_t, _vw);
      const L = _s.length(); if (L > 1e-6) _s.multiplyScalar(widthAt(u) / 2 / L); else _s.set(0, widthAt(u) / 2, 0);
      this.pos.set([p.x + _s.x, p.y + _s.y, p.z + _s.z, p.x - _s.x, p.y - _s.y, p.z - _s.z], k * 6);
      colorAt(u, _c4); this.col.set(_c4, k * 8); this.col.set(_c4, k * 8 + 4);
    }
    const g = this.mesh.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.setDrawRange(0, (n - 1) * 6);
    this.mesh.visible = true;
  }
  hide() { this.mesh.visible = false; }
  dispose() { this.scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}

export function createKit(scene, { low = false, rand = Math.random } = {}) {
  const R = (a, b) => a + rand() * (b - a), N = (k) => (low ? Math.ceil(k / 2) : k);
  const cap = (k) => (low ? CAP[k] / 2 : CAP[k]);
  const TEX = makeTextures();
  const GEO = {
    rock: new THREE.DodecahedronGeometry(1, 0), shard: new THREE.OctahedronGeometry(1, 0).scale(0.45, 1.4, 0.45),
    drop: new THREE.SphereGeometry(1, 7, 5), ember: new THREE.TetrahedronGeometry(1, 0), ico: new THREE.IcosahedronGeometry(1, 0),
    cone: new THREE.ConeGeometry(1, 1, 5), plane: new THREE.PlaneGeometry(1, 1),
  };
  // 재질: 돌·흙은 툰, 물·얼음은 살짝 스스로 빛나는 툰, 불티는 빛나는 기본 재질
  const basicCache = new Map();
  const mat = (kind, color) => {
    if (kind === 'ember') { if (!basicCache.has(color)) basicCache.set(color, new THREE.MeshBasicMaterial({ color })); return basicCache.get(color); }
    if (kind === 'drop') return toon(color ?? 0x5ac8ff, { emissive: 0x1a5a88, ei: 0.6 });
    if (kind === 'shard') return toon(color ?? 0xdff4ff, { emissive: 0x6aa8c8, ei: 0.6 });
    if (kind === 'glow') return toon(color, { emissive: color, ei: 0.55 });
    return toon(color ?? 0x8a7a68);
  };
  function pool(n, make) { const items = []; for (let k = 0; k < n; k++) items.push(make(k)); let at = 0; return { items, take() { const it = items[at]; at = (at + 1) % n; it.on = true; it.life = 0; return it; } }; }

  // 1) 툰 불꽃
  const flames = pool(cap('flame'), () => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.flame, transparent: true, depthWrite: false }));
    s.center.set(0.5, 0.05); s.renderOrder = 5; s.visible = false; scene.add(s);
    return { obj: s, on: false, v: V(), life: 0, max: 1, w: 1, h: 1, seed: 0, drag: 2, g: 0 };
  });
  // 2) 바람 줄기 (호 모양 띠)
  const streaks = pool(cap('streak'), () => ({ rib: new Ribbon(scene, 14), on: false, c: V(), life: 0, max: 1, col: new THREE.Color(), pts: Array.from({ length: 14 }, () => V()) }));
  // 3) 덩어리 파편
  const chunks = pool(cap('chunk'), () => {
    const m = new THREE.Mesh(GEO.rock, mat('rock')); m.castShadow = false; m.visible = false; scene.add(m);
    return { obj: m, on: false, v: V(), spin: V(), life: 0, max: 1, size: 0.1, g: -14, bounce: 0.35, drag: 0.4 };
  });
  // 4) 툰 연기 뭉치
  const puffs = pool(cap('puff'), () => {
    const m = new THREE.Mesh(GEO.ico, mat('rock', 0xd9b67c)); m.castShadow = false; m.visible = false; scene.add(m);
    return { obj: m, on: false, v: V(), life: 0, max: 1, s0: 0.2, s1: 0.6, delay: 0, drag: 1.5 };
  });
  // 5) 땅 자국
  const decals = pool(cap('decal'), (k) => {
    const m = new THREE.Mesh(GEO.plane, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    m.rotation.order = 'YXZ'; m.visible = false; m.renderOrder = 2; m.userData.y = 0.03 + (k % 8) * 0.002; scene.add(m);
    return { obj: m, on: false, life: 0, max: 1, s0: 1, s1: 1, growT: 0.01, sx: 1, sz: 1, op: 1 };
  });

  const kit = {
    N, R, GEO, TEX, mat,
    flame(pos, o = {}) {
      const it = flames.take(), s = it.obj;
      s.position.copy(pos); it.v.copy(o.v || V(0, 1, 0)); it.max = o.life ?? 0.4; it.w = o.w ?? 0.3; it.h = o.h ?? 0.45;
      it.drag = o.drag ?? 2; it.g = o.g ?? 1.5; it.seed = rand() * 10; s.material.opacity = 1; s.material.rotation = R(-0.25, 0.25); s.visible = true;
      return it;
    },
    chunk(kind, pos, o = {}) {
      const it = chunks.take(), m = it.obj;
      m.geometry = GEO[kind]; m.material = mat(kind, o.color); m.position.copy(pos);
      it.v.copy(o.v || V()); it.spin.set(R(-9, 9), R(-9, 9), R(-9, 9)); it.max = o.life ?? 1; it.size = o.size ?? 0.08;
      it.g = o.g ?? -14; it.bounce = o.bounce ?? 0.35; it.drag = o.drag ?? 0.4;
      m.scale.setScalar(it.size); m.rotation.set(R(0, 6), R(0, 6), R(0, 6)); m.visible = true;
      return it;
    },
    puff(pos, color, o = {}) {
      const it = puffs.take(), m = it.obj;
      m.material = mat(o.glow ? 'glow' : 'rock', color); m.position.copy(pos);
      it.v.copy(o.v || V(0, 0.8, 0)); it.max = o.life ?? 0.8; it.s0 = o.s0 ?? 0.2; it.s1 = o.s1 ?? 0.6; it.delay = o.delay ?? 0; it.drag = o.drag ?? 1.5;
      m.scale.setScalar(it.s0); m.rotation.set(R(0, 6), R(0, 6), 0); m.visible = it.delay <= 0;
      return it;
    },
    decal(kind, pos, size, o = {}) {
      const it = decals.take(), m = it.obj;
      m.material.map = TEX[kind]; m.material.needsUpdate = true; m.material.opacity = 0;
      m.position.set(pos.x, m.userData.y, pos.z); m.rotation.set(-Math.PI / 2, o.yaw ?? R(0, 6.28), 0, 'YXZ');
      it.max = o.life ?? 5; it.s0 = size; it.s1 = o.grow ?? size; it.growT = o.growT ?? 0.12; it.sx = o.sx ?? 1; it.sz = o.sz ?? 1; it.op = o.opacity ?? 1;
      m.visible = true;
      return it;
    },
    // 둥근 바람 줄기: center 둘레 반지름 r0→r1, 높이 center.y+y, 각 a0부터 span만큼 dir 쪽으로 쓸고 지나간다. ring이면 온 고리
    streak(center, o = {}) {
      const it = streaks.take();
      it.c.copy(center); it.max = o.life ?? 0.35; it.r0 = o.r0 ?? 0.5; it.r1 = o.r1 ?? 3; it.y = o.y ?? 0.6; it.a0 = o.a0 ?? 0;
      it.span = o.span ?? 1; it.dir = o.dir ?? 1; it.w = o.w ?? 0.12; it.col.set(o.color ?? 0xffffff); it.ring = !!o.ring; it.lift = o.lift ?? 0.15;
      return it;
    },
    newRibbon(maxPts = 16) { return new Ribbon(scene, maxPts); },
    newFlame() { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.flame, transparent: true, depthWrite: false })); s.center.set(0.5, 0.05); s.renderOrder = 5; return s; },
    disposeFlame(s) { if (s.parent) s.parent.remove(s); s.material.dispose(); },
    newGlow(color, size) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); s.scale.setScalar(size); s.renderOrder = 6; return s; },

    update(dt, cam) {
      for (const it of flames.items) {
        if (!it.on) continue;
        it.life += dt; const k = it.life / it.max, s = it.obj;
        if (k >= 1) { it.on = false; s.visible = false; continue; }
        it.v.y += it.g * dt; it.v.multiplyScalar(Math.max(0, 1 - it.drag * dt)); s.position.addScaledVector(it.v, dt);
        const sz = k < 0.2 ? 0.4 + k / 0.2 * 0.6 : 1 - (k - 0.2) / 0.8 * 0.65, fl = Math.sin(it.life * 30 + it.seed);
        s.scale.set(it.w * sz * (1 + fl * 0.1), it.h * sz * (1 + fl * 0.18), 1);
        s.material.opacity = k > 0.6 ? (1 - k) / 0.4 : 1;
      }
      for (const it of chunks.items) {
        if (!it.on) continue;
        it.life += dt; const k = it.life / it.max, m = it.obj;
        if (k >= 1) { it.on = false; m.visible = false; continue; }
        it.v.y += it.g * dt; it.v.multiplyScalar(Math.max(0, 1 - it.drag * dt)); m.position.addScaledVector(it.v, dt);
        const floor = it.size * 0.6;
        if (m.position.y < floor && it.v.y < 0 && it.g < 0) { m.position.y = floor; it.v.y *= -it.bounce; it.v.x *= 0.6; it.v.z *= 0.6; it.spin.multiplyScalar(0.5); }
        m.rotation.x += it.spin.x * dt; m.rotation.y += it.spin.y * dt; m.rotation.z += it.spin.z * dt;
        m.scale.setScalar(k > 0.7 ? it.size * (1 - k) / 0.3 : it.size);
      }
      for (const it of puffs.items) {
        if (!it.on) continue;
        const m = it.obj;
        if (it.delay > 0) { it.delay -= dt; if (it.delay > 0) continue; m.visible = true; }
        it.life += dt; const k = it.life / it.max;
        if (k >= 1) { it.on = false; m.visible = false; continue; }
        it.v.multiplyScalar(Math.max(0, 1 - it.drag * dt)); m.position.addScaledVector(it.v, dt);
        const s = k < 0.35 ? it.s0 + (it.s1 - it.s0) * easeOut(k / 0.35) : it.s1 * Math.pow(1 - (k - 0.35) / 0.65, 0.7);
        m.scale.setScalar(Math.max(0.001, s)); m.rotation.y += dt * 0.8;
      }
      for (const it of decals.items) {
        if (!it.on) continue;
        it.life += dt; const k = it.life / it.max, m = it.obj;
        if (k >= 1) { it.on = false; m.visible = false; continue; }
        const s = it.s0 + (it.s1 - it.s0) * easeOut(Math.min(1, it.life / it.growT));
        m.scale.set(s * it.sx, s * it.sz, 1);
        const fadeT = Math.min(1.2, it.max * 0.6);
        m.material.opacity = it.op * Math.min(1, it.life / 0.08) * (it.life > it.max - fadeT ? (it.max - it.life) / fadeT : 1);
      }
      for (const it of streaks.items) {
        if (!it.on) continue;
        it.life += dt; const k = it.life / it.max;
        if (k >= 1) { it.on = false; it.rib.hide(); continue; }
        const rad = it.r0 + (it.r1 - it.r0) * easeOut(k), head = it.ring ? 1 : Math.min(1, k * 1.8), tail = it.ring ? 0 : Math.max(0, k * 1.8 - 0.8);
        const n = it.pts.length;
        for (let j = 0; j < n; j++) {
          const u = head - (head - tail) * j / (n - 1), a = it.a0 + it.dir * (it.ring ? Math.PI * 2 : it.span) * u;
          it.pts[j].set(it.c.x + Math.cos(a) * rad, it.c.y + it.y + Math.sin(u * Math.PI) * it.lift, it.c.z + Math.sin(a) * rad);
        }
        const al = 0.9 * (1 - k), c = it.col, w = it.w * (1 - k * 0.4);
        it.rib.set(it.pts, (u) => w * (it.ring ? 1 : Math.sin(Math.PI * Math.min(1, u * 1.1 + 0.05))), (u, o) => { o[0] = c.r; o[1] = c.g; o[2] = c.b; o[3] = al * (it.ring ? 1 : 1 - u * 0.6); return o; }, cam);
      }
    },
    // 처음 쏠 때 끊기지 않게: 모든 재료를 한 번 보이게 놓고 재질을 미리 컴파일한다
    prewarm(renderer, camera) {
      const shown = [], show = (o) => { o.visible = true; shown.push(o); };
      show(flames.items[0].obj); show(decals.items[0].obj); show(puffs.items[0].obj);
      const temp = [];
      for (const kind of ['rock', 'shard', 'drop', 'ember']) { const m = new THREE.Mesh(GEO[kind], mat(kind, kind === 'ember' ? 0xffb030 : undefined)); temp.push(m); }
      temp.push(new THREE.Mesh(GEO.ico, mat('glow', 0xffb030)));
      const rib = new Ribbon(scene, 4); rib.set([V(0, -50, 0), V(1, -50, 0)], () => 0.1, (u, o) => { o[0] = o[1] = o[2] = 1; o[3] = 1; return o; }, camera.position);
      const glow = kit.newGlow(0xffffff, 1);
      for (const m of [...temp, glow]) { m.position.set(0, -50, 0); scene.add(m); }
      for (const o of shown) o.position.y = -50;
      renderer.compile(scene, camera);
      for (const o of shown) o.visible = false;
      for (const m of [...temp, glow]) scene.remove(m);
      glow.material.dispose(); rib.dispose();
    },
    clear() {
      for (const p of [flames, chunks, puffs, decals]) for (const it of p.items) { it.on = false; it.obj.visible = false; }
      for (const it of streaks.items) { it.on = false; it.rib.hide(); }
    },
    stats() { const c = (p) => p.items.filter((it) => it.on).length; return { flame: c(flames), streak: c(streaks), chunk: c(chunks), puff: c(puffs), decal: c(decals) }; },
  };
  return kit;
}
