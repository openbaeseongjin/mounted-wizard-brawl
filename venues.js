// 시합장 둘레 배경: 시합마다 장소·날씨를 바꾼다 (설계: superpowers/specs/2026-10-19-mw-real-models-design.md 6장)
// KayKit Medieval Hexagon(CC0) 건물·나무·소품. 한 장소의 모델은 모두 같은 팔레트 텍스처라 가까운 것(그림자)·먼 것 두 덩어리로 합쳐 그린다
// 장소: 'stable' 마구간 마당 · 'spring' 봄 시합장 · 'rain' 비 온 뒤(봄 시합장 + 흐림·물웅덩이·무지개) · 'castle' 성 앞 결승(해 질 녘) · null = 코드로 만든 배경
import * as THREE from 'three';
import { toon, outlineMat } from './models.js';

const JSM = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/';
const STANDS = [27, 153, 270];   // 관중석 각도(도) — scene.js 0.15π·0.85π·1.5π
const angGap = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const nearStand = (a, w = 22) => STANDS.some((s) => angGap(a, s) < w);

// 하늘·빛: day = 지금 봄 하늘(scene.js 값 그대로)
const LIGHT = {
  day: { top: 0x5aa8ec, mid: 0xbfe3ff, bot: 0xf6ecd2, fog: 0xcfe6f5, near: 120, far: 420, hemiSky: 0xdff0ff, hemiGround: 0x8a7a50, hemi: 1.15, sun: 0xfff1d6, sunI: 2.4, sunOff: [40, 70, 25], dirt: 0xffffff, grass: 0xffffff, cloud: 0xffffff },
  rain: { top: 0x7f8c9a, mid: 0xc3ccd4, bot: 0xd8dcdf, fog: 0xbcc5cc, near: 60, far: 320, hemiSky: 0xd6dde6, hemiGround: 0x6a6656, hemi: 1.1, sun: 0xe6ecf4, sunI: 1.15, sunOff: [30, 80, 20], dirt: 0xb4a894, grass: 0xc2d0ba, cloud: 0x9aa4ae },
  dusk: { top: 0x46598f, mid: 0xf2a878, bot: 0xffd6a0, fog: 0xf0c0a0, near: 100, far: 400, hemiSky: 0xffd9bc, hemiGround: 0x7a5a40, hemi: 0.95, sun: 0xffb27a, sunI: 1.9, sunOff: [70, 30, -45], dirt: 0xe8d2c0, grass: 0xf0dcc0, cloud: 0xff9f7a },
};
const VENUES = {
  stable: { layout: 'stable', light: 'day' },
  spring: { layout: 'spring', light: 'day' },
  rain: { layout: 'spring', light: 'rain', puddles: true },
  castle: { layout: 'castle', light: 'dusk' },
};

// ---------- 배치 ----------
// put(이름, 각도°, 반지름, 크기(가장 긴 변 m), 더 돌리기, 높이)
const TREES = ['trees_A_large', 'trees_A_medium', 'trees_B_large', 'trees_B_medium', 'tree_single_A', 'tree_single_B'];
function forest(put, R, n, rMin, rMax, busy) {
  for (let i = 0, k = 0; i < 500 && k < n; i++) {
    const a = R() * 360, r = rMin + R() * (rMax - rMin);
    if (busy.some(([ba, r0, r1, w = 28]) => angGap(a, ba) < w && r > r0 - 8 && r < r1 + 8)) continue;
    put(TREES[Math.floor(R() * TREES.length)], a, r, 9 + R() * 9, R() * 6); k++;
  }
}
function mountains(put, R) {   // 먼 산: 안개 속 실루엣. 육각 타일의 잘린 옆면이 안 보이게 반쯤 땅에 묻는다
  for (let k = 0; k < 9; k++) put(k % 2 ? 'mountain_A_grass_trees' : 'mountain_B_grass_trees', k * 40 + 15 + R() * 15, 360 + R() * 40, 170 + R() * 50, R() * 6, -0.45);
}
function edgeProps(put, R, n, kinds) {   // 울타리 바로 바깥 소품 (관중석 앞은 비운다)
  for (let i = 0; i < n; i++) {
    const a = R() * 360; if (nearStand(a)) continue;
    const [nm, s] = kinds[Math.floor(R() * kinds.length)];
    put(nm, a, 44.5 + R() * 2.5, s, (R() - 0.5) * 2);
  }
}
const EDGE = [['barrel', 1.0], ['barrel', 1.0], ['crate_A_big', 1.3], ['sack', 0.9], ['weaponrack', 2.2], ['target', 2.4], ['wheelbarrow', 1.8], ['bucket_water', 0.7], ['crate_long_A', 1.8]];
const LAYOUTS = {
  // 봄 시합장: 빈 쪽(+x)에 성, 왼쪽 뒤에 마을, 오른쪽 뒤에 풍차 마을, 장터 천막, 숲, 먼 산
  spring(put, R, castle = false) {
    const cr = castle ? 80 : 125, cs = castle ? 58 : 46, tr = castle ? 70 : 112, wr = castle ? 66 : 106;
    put('building_castle_red', 90, cr, cs);
    put('building_tower_A_red', 72, tr, 22); put('building_tower_A_red', 108, tr, 22);
    for (const [a, n] of [[80, 'wall_straight'], [90, 'wall_straight_gate'], [100, 'wall_straight']]) put(n, a, wr, 22);
    [['building_tavern_red', 205, 92, 15], ['building_home_A_blue', 196, 104, 11], ['building_home_B_green', 216, 106, 11], ['building_market_yellow', 222, 90, 13],
      ['building_church_blue', 208, 122, 22], ['building_home_A_yellow', 190, 88, 10], ['building_well_blue', 212, 82, 6]].forEach(([n, a, r, s]) => put(n, a, r, s, (R() - 0.5) * 0.6));
    put('building_windmill_yellow', 330, 100, 24); put('building_grain', 340, 86, 9); put('building_grain', 318, 88, 8);
    put('building_watermill_green', 350, 118, 16); put('building_home_B_green', 322, 112, 11);
    const tents = castle ? [[58, 64], [124, 64], [192, 66], [228, 64], [312, 66], [346, 68]] : [[58, 66], [70, 72], [112, 70], [124, 65], [192, 66], [228, 64], [312, 66], [346, 68]];
    for (const [a, r] of tents) put('tent', a, r, 7, (R() - 0.5) * 0.8);
    if (!castle) put('building_stage_A', 90, 62, 12);
    const flags = castle ? [40, 50, 60, 120, 130, 140, 190, 235, 300, 345] : [48, 132, 240, 300];
    flags.forEach((a, i) => put(['flag_red', 'flag_blue', 'flag_yellow'][i % 3], a, castle ? 57 : 60, castle ? 8 : 6));
    edgeProps(put, R, 26, EDGE);
    for (let k = 0; k < 6; k++) put('fence_stone_straight', 176 + k * 7, 78, 9);
    forest(put, R, 70, 75, 225, [[90, castle ? 60 : 105, castle ? 95 : 140], [210, 80, 130], [335, 80, 125]]);
    for (let k = 0; k < 5; k++) put(R() < 0.5 ? 'rock_single_A' : 'rock_single_C', R() * 360, 70 + R() * 30, 3 + R() * 3, R() * 6);
    mountains(put, R);
  },
  castle(put, R) { LAYOUTS.spring(put, R, true); },
  // 마구간 마당: 가까운 헛간·대장간·곡식 창고·우물·나무 울타리·수레·짐. 성은 없고 숲이 가깝다
  stable(put, R) {
    put('building_barracks_yellow', 90, 64, 18); put('building_lumbermill_red', 68, 68, 14); put('building_blacksmith_blue', 113, 68, 13);
    put('building_archeryrange_green', 208, 64, 15); put('building_home_B_yellow', 226, 74, 11); put('building_well_blue', 196, 54, 5.5);
    put('building_grain', 318, 58, 9); put('building_grain', 332, 62, 8); put('building_grain', 346, 57, 7.5);
    put('building_windmill_yellow', 330, 108, 22); put('building_home_A_yellow', 300, 86, 10); put('building_home_B_green', 236, 92, 11);
    for (let a = 0; a < 360; a += 6.5) if (!nearStand(a, 24)) put('fence_wood_straight', a, 51, 6.2, Math.PI / 2);   // 울타리는 원을 따라(접선)
    edgeProps(put, R, 40, [...EDGE, ['pallet', 1.4], ['resource_lumber', 1.8], ['crate_open', 1.2], ['sack', 0.9], ['wheelbarrow', 1.8]]);
    forest(put, R, 95, 72, 200, [[90, 55, 80, 30], [210, 55, 100], [325, 50, 115]]);
    mountains(put, R);
  },
};

// ---------- 만들기 ----------
export async function createVenues(scene, arena, models) {
  const BGU = await import(JSM + 'utils/BufferGeometryUtils.js');
  const groups = {}, base = arena.sky.uniforms;
  let cur;
  // 모델별 크기 맞춤 정보 (가장 긴 변·가운데·바닥)
  const fitCache = new Map();
  function fitOf(name) {
    if (fitCache.has(name)) return fitCache.get(name);
    const src = models[name]; src.updateMatrixWorld(true);
    const rootInv = new THREE.Matrix4().copy(src.matrixWorld).invert();
    const bb = new THREE.Box3(), meshes = [];
    src.traverse((o) => { if (o.isMesh) { const m = new THREE.Matrix4().multiplyMatrices(rootInv, o.matrixWorld); meshes.push({ o, m }); bb.union(new THREE.Box3().setFromBufferAttribute(o.geometry.attributes.position).applyMatrix4(m)); } });
    const sz = bb.getSize(new THREE.Vector3()), f = { meshes, c: bb.getCenter(new THREE.Vector3()), minY: bb.min.y, max: Math.max(sz.x, sz.y, sz.z), h: sz.y };
    fitCache.set(name, f); return f;
  }
  // 모양을 실수 좌표로 풀어 월드 행렬을 굽는다 (압축·양자화된 모양도)
  function bake(geo, m) {
    const g = new THREE.BufferGeometry();
    for (const n of ['position', 'normal', 'uv']) {
      const a = geo.attributes[n]; if (!a) continue;
      const arr = new Float32Array(a.count * a.itemSize), get = [a.getX, a.getY, a.getZ, a.getW];
      for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) arr[i * a.itemSize + k] = get[k].call(a, i);   // 양자화(정수)·끼워 넣은 배열도 실수로
      g.setAttribute(n, new THREE.BufferAttribute(arr, a.itemSize));
    }
    if (geo.index) g.setIndex(Array.from(geo.index.array));
    g.applyMatrix4(m);
    return g;
  }
  function build(layout) {
    let seed = { stable: 31, spring: 77, castle: 77 }[layout];
    const R = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    // 덩어리: 가까운 것(그림자)·먼 것 × 둘레 6조각(60°) → 카메라 뒤쪽 조각은 안 그린다
    const buckets = {}; let map = null;
    const put = (name, angDeg, r, size, rotY = 0, sink = 0) => {
      if (!models[name]) return;
      const f = fitOf(name), s = size / f.max, a = angDeg * Math.PI / 180;
      const M = new THREE.Matrix4().compose(new THREE.Vector3(Math.sin(a) * r, sink * f.h * s, Math.cos(a) * r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI + rotY), new THREE.Vector3(s, s, s))
        .multiply(new THREE.Matrix4().makeTranslation(-f.c.x, -f.minY, -f.c.z));
      const key = (r < 75 ? 'near' : 'far') + Math.floor((((angDeg % 360) + 360) % 360) / 60);
      for (const { o, m } of f.meshes) { (buckets[key] || (buckets[key] = [])).push(bake(o.geometry, new THREE.Matrix4().multiplyMatrices(M, m))); if (!map && o.material.map) map = o.material.map; }
    };
    LAYOUTS[layout](put, R);
    const g = new THREE.Group(); g.name = 'venue-' + layout;
    const mat = new THREE.MeshToonMaterial({ map, gradientMap: toon(0xffffff).gradientMap });
    for (const [k, list0] of Object.entries(buckets)) {
      if (!list0.length) continue;
      const list = list0.some((x) => !x.index) ? list0.map((x) => (x.index ? x.toNonIndexed() : x)) : list0;   // 합치려면 모두 같은 방식이어야 한다
      const geo = BGU.mergeGeometries(list, false); list0.length = 0;
      geo.computeBoundingSphere();
      const near = k.startsWith('near');
      const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = near; mesh.receiveShadow = true; mesh.userData.noOcc = !near; g.add(mesh);
      const ol = new THREE.Mesh(geo, outlineMat(near ? 0.05 : 0.16)); ol.userData.outline = true; g.add(ol);
      g.userData[k] = geo.attributes.position.count;
    }
    scene.add(g);
    return g;
  }
  // 비 온 뒤: 물웅덩이(그림만) + 무지개
  let wet = null;
  function buildWet() {
    const g = new THREE.Group();
    let seed = 913; const R = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const water = new THREE.MeshBasicMaterial({ color: 0x4f6170, transparent: true, opacity: 0.62, depthWrite: false });
    const shine = new THREE.MeshBasicMaterial({ color: 0xc8d6e2, transparent: true, opacity: 0.5, depthWrite: false });
    for (let i = 0; i < 9; i++) {
      const a = R() * Math.PI * 2, r = 6 + R() * 30, rad = 0.9 + R() * 1.5;
      const p = new THREE.Mesh(new THREE.CircleGeometry(rad, 28), water); p.rotation.x = -Math.PI / 2; p.position.set(Math.sin(a) * r, 0.03, Math.cos(a) * r); p.scale.set(1, 0.55 + R() * 0.4, 1); p.rotation.z = R() * 3; g.add(p);
      const sh = new THREE.Mesh(new THREE.CircleGeometry(rad * 0.35, 16), shine); sh.rotation.x = -Math.PI / 2; sh.position.set(p.position.x + rad * 0.2, 0.035, p.position.z - rad * 0.1); sh.scale.set(1, 0.25, 1); g.add(sh);
    }
    const bow = new THREE.Group(); bow.position.set(300, -20, -60); bow.rotation.y = -Math.PI / 2 + 0.2; g.add(bow);
    [0xff5a5a, 0xffa94a, 0xffe45a, 0x6fd36a, 0x5aa8ff, 0x8a6aff].forEach((c, i) => {
      bow.add(new THREE.Mesh(new THREE.TorusGeometry(190 - i * 5, 2.6, 6, 72, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.3, depthWrite: false, fog: false })));
    });
    scene.add(g);
    return g;
  }
  function light(L) {
    base.top.value.setHex(L.top); base.mid.value.setHex(L.mid); base.bot.value.setHex(L.bot);
    scene.fog.color.setHex(L.fog); scene.fog.near = L.near; scene.fog.far = L.far;
    arena.hemi.color.setHex(L.hemiSky); arena.hemi.groundColor.setHex(L.hemiGround); arena.hemi.intensity = L.hemi;
    arena.sun.color.setHex(L.sun); arena.sun.intensity = L.sunI; arena.sunOff.set(...L.sunOff);
    arena.dirt.material.color.setHex(L.dirt); arena.ground.material.color.setHex(L.grass);
    for (const c of arena.clouds) for (const m of c.children) m.material.color.setHex(L.cloud);
  }
  const api = {
    get current() { return cur; },
    // name: 'stable'|'spring'|'rain'|'castle'|null(코드 배경)
    set(name) {
      if (name === cur) return;
      cur = name;
      const V = name ? VENUES[name] : null;
      if (V && !groups[V.layout]) groups[V.layout] = build(V.layout);
      for (const k in groups) groups[k].visible = !!V && k === V.layout;
      for (const p of arena.procedural) p.visible = !V;
      if (V && V.puddles && !wet) wet = buildWet();
      if (wet) wet.visible = !!(V && V.puddles);
      light(LIGHT[V ? V.light : 'day']);
    },
    stats: () => Object.fromEntries(Object.entries(groups).map(([k, g]) => [k, g.userData])),
  };
  return api;
}
// 어떤 시합이 어느 장소인가: 사다리 시합은 config LADDER 의 venue, 그 밖은 하는 일로
export function venueFor(how, fight) {
  if (fight && fight.venue) return fight.venue;
  return { practice: 'stable', trial: 'stable', hub: 'stable' }[how] || 'spring';
}
