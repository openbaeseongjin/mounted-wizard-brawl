// 코드로 만든 모델: 말 · 마법사 · 지팡이 (툰 셰이딩 + 뒤집은 껍데기 외곽선). 에셋 파일 없음
import * as THREE from 'three';
import { HORSES, ITEMS, CHARS, CFG, JOBS } from './config.js';

let gradientMap = null;
const matCache = new Map(), outCache = new Map();
function grad() {
  if (gradientMap) return gradientMap;
  gradientMap = new THREE.DataTexture(new Uint8Array([70, 150, 215, 255]), 4, 1, THREE.RedFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter; gradientMap.needsUpdate = true;
  return gradientMap;
}
export function toon(color, opts = {}) {
  const key = color + '|' + (opts.emissive || 0) + '|' + (opts.ei || 1);
  if (!opts.unique && matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshToonMaterial({ color, gradientMap: grad(), emissive: opts.emissive || 0, emissiveIntensity: opts.ei || 1 });
  if (!opts.unique) matCache.set(key, m);
  return m;
}
export function outlineMat(w) {
  const k = w.toFixed(4);
  if (outCache.has(k)) return outCache.get(k);
  const m = new THREE.MeshBasicMaterial({ color: 0x1d140f, side: THREE.BackSide });
  m.onBeforeCompile = (s) => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normalize(normal) * ${k};`); };
  m.customProgramCacheKey = () => 'outline' + k;
  outCache.set(k, m);
  return m;
}
export function part(geo, color, parent, o = {}) {
  const m = new THREE.Mesh(geo, o.mat || toon(color, o));
  if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
  if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
  if (o.scale) m.scale.set(o.scale[0], o.scale[1], o.scale[2]);
  m.castShadow = o.shadow !== false; m.receiveShadow = true;
  const ow = o.outline === undefined ? 0.018 : o.outline;
  if (ow > 0) { const ol = new THREE.Mesh(geo, outlineMat(ow)); ol.castShadow = false; ol.userData.outline = true; m.add(ol); }
  if (parent) parent.add(m);
  return m;
}
const shade = (hex, k) => { const c = new THREE.Color(hex); c.multiplyScalar(k); return c.getHex(); };

// 빛 번짐 텍스처 (지팡이 끝, 주문, 폭발)
let glowTex = null;
export function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowTex = new THREE.CanvasTexture(c); glowTex.colorSpace = THREE.SRGBColorSpace;
  return glowTex;
}
export function glowSprite(color, size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  s.scale.setScalar(size); s.renderOrder = 5;
  return s;
}

// ---------- 말 ----------
const NECK = 0.88;   // 목 기울기(수직에서 앞으로). 1인칭에서 귀와 갈기가 앞에 보이게 낮게
export function buildHorse(defKey, cloth) {
  const def = HORSES[defKey], s = def.size;
  const root = new THREE.Group();
  const scaled = new THREE.Group(); scaled.scale.setScalar(s); root.add(scaled);
  const body = new THREE.Group(); scaled.add(body);
  const coat = def.coat, mane = def.mane, hoofC = 0x2b231d, coatD = shade(coat, 0.8);
  part(new THREE.CapsuleGeometry(0.4, 1.1, 6, 16), coat, body, { rot: [Math.PI / 2, 0, 0], scale: [0.95, 1, 1.02], outline: 0.022 });
  part(new THREE.SphereGeometry(0.44, 16, 12), coat, body, { pos: [0, 0.03, 0.6], scale: [0.95, 1.0, 0.92], outline: 0.02 });
  part(new THREE.SphereGeometry(0.46, 16, 12), coat, body, { pos: [0, 0.06, -0.62], scale: [1.0, 0.98, 0.95], outline: 0.02 });
  // 목·머리
  const neck = new THREE.Group(); neck.position.set(0, 0.2, 0.86); neck.rotation.x = NECK; body.add(neck);
  part(new THREE.CylinderGeometry(0.14, 0.22, 0.9, 12), coat, neck, { pos: [0, 0.42, 0], outline: 0.018 });
  part(new THREE.BoxGeometry(0.07, 0.95, 0.1), mane, neck, { pos: [0, 0.46, -0.16], rot: [-0.06, 0, 0], outline: 0.01 });   // 갈기: 한 줄로 이어진 띠
  for (let k = 0; k < 4; k++) part(new THREE.ConeGeometry(0.05, 0.16, 5), mane, neck, { pos: [(k % 2 ? 0.03 : -0.03), 0.2 + k * 0.2, -0.22], rot: [-1.9, 0, (k % 2 ? 0.4 : -0.4)], outline: 0.008 });
  const head = new THREE.Group(); head.position.set(0, 0.88, 0.02); head.rotation.x = 1.0; neck.add(head);
  part(new THREE.CapsuleGeometry(0.15, 0.36, 5, 12), coat, head, { pos: [0, 0.22, 0], scale: [0.9, 1, 1.05], outline: 0.016 });
  part(new THREE.SphereGeometry(0.14, 12, 10), coatD, head, { pos: [0, 0.48, 0.02], scale: [0.95, 0.85, 1.05], outline: 0.014 });
  for (const sx of [-1, 1]) {
    part(new THREE.SphereGeometry(0.025, 8, 6), 0x1a1210, head, { pos: [sx * 0.07, 0.56, 0.08], outline: 0 });      // 콧구멍
    part(new THREE.SphereGeometry(0.038, 10, 8), 0x120c0a, head, { pos: [sx * 0.135, 0.18, 0.06], outline: 0 });   // 눈
    part(new THREE.SphereGeometry(0.012, 6, 5), 0xffffff, head, { pos: [sx * 0.15, 0.2, 0.09], outline: 0 });
  }
  const ears = [];
  for (const sx of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(sx * 0.085, 0.02, -0.1); head.add(ear);   // 머리 로컬 -z = 정수리 위쪽
    part(new THREE.ConeGeometry(0.05, 0.17, 8), coat, ear, { pos: [0, 0, -0.08], rot: [-Math.PI / 2, 0, 0], outline: 0.01 });
    ears.push(ear);
  }
  part(new THREE.BoxGeometry(0.08, 0.14, 0.12), mane, head, { pos: [0, 0.0, -0.1], outline: 0.01 });   // 앞머리
  // 꼬리
  const tail = new THREE.Group(); tail.position.set(0, 0.22, -1.02); body.add(tail);
  part(new THREE.ConeGeometry(0.13, 0.85, 8), mane, tail, { pos: [0, -0.4, -0.05], rot: [0.15, 0, 0], outline: 0.014 });
  // 다리 (왼앞, 오른앞, 왼뒤, 오른뒤) — 몸 로컬에서 왼쪽 = +x
  const legs = [];
  for (const [lx, lz, front] of [[0.22, 0.62, true], [-0.22, 0.62, true], [0.22, -0.64, false], [-0.22, -0.64, false]]) {
    const hip = new THREE.Group(); hip.position.set(lx, -0.22, lz); body.add(hip);
    part(new THREE.CylinderGeometry(0.12, 0.085, 0.52, 10), coat, hip, { pos: [0, -0.24, 0], outline: 0.014 });
    const knee = new THREE.Group(); knee.position.set(0, -0.5, 0); hip.add(knee);
    part(new THREE.CylinderGeometry(0.068, 0.058, 0.46, 8), coat, knee, { pos: [0, -0.23, 0], outline: 0.012 });
    part(new THREE.CylinderGeometry(0.08, 0.09, 0.09, 10), hoofC, knee, { pos: [0, -0.5, 0.01], outline: 0.01 });
    if (def.mane !== 0x0c0b0e && defKey !== 'gojip') part(new THREE.CylinderGeometry(0.072, 0.075, 0.12, 8), 0xf2ece0, knee, { pos: [0, -0.4, 0], outline: 0 });
    legs.push({ hip, knee, front });
  }
  // 안장 + 기수 색 천
  const saddle = new THREE.Group(); saddle.position.set(0, 0.36, -0.12); body.add(saddle);
  part(new THREE.BoxGeometry(0.92, 0.04, 0.78), cloth, saddle, { pos: [0, 0.02, 0], outline: 0.012 });
  part(new THREE.BoxGeometry(0.04, 0.38, 0.7), cloth, saddle, { pos: [0.46, -0.16, 0], outline: 0.01 });
  part(new THREE.BoxGeometry(0.04, 0.38, 0.7), cloth, saddle, { pos: [-0.46, -0.16, 0], outline: 0.01 });
  part(new THREE.BoxGeometry(0.46, 0.1, 0.55), 0x6b3e1f, saddle, { pos: [0, 0.09, 0], outline: 0.012 });
  part(new THREE.BoxGeometry(0.3, 0.14, 0.08), 0x5a3218, saddle, { pos: [0, 0.16, 0.26], outline: 0.01 });
  // 고삐 (목 앞 → 손 근처)
  const reins = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 4, 16, Math.PI), toon(0x3a2414));
  reins.position.set(0, 0.62, 0.62); reins.rotation.set(0.4, Math.PI / 2, 0); body.add(reins);
  return { root, scaled, body, neck, head, ears, tail, legs, s, phase: Math.random() * 6, def };
}

// 걸음새 애니메이션: speed m/s, fear 0~100
export function animateHorse(h, speed, dt, fear, t, gait) {
  const gallop = speed > 9, trot = speed > 3.2;
  const freq = speed < 0.3 ? 0 : speed / (1.4 + speed * 0.2);   // 보폭이 속도에 맞게 늘어나서 발굽이 미끄러지지 않는다
  if (gait !== undefined) h.phase = gait * Math.PI * 2;   // 시뮬의 걸음 박자를 그대로 (다시 보기에서도 같다)
  else h.phase += freq * dt * Math.PI * 2;
  const amp = Math.min(0.8, 0.12 + speed / 14);
  const offs = gallop ? [0, 0.1, 0.55, 0.66] : trot ? [0, 0.5, 0.5, 0] : [0, 0.5, 0.75, 0.25];
  h.legs.forEach((L, i) => {
    if (freq === 0) { L.hip.rotation.x *= 0.9; L.knee.rotation.x *= 0.9; return; }
    const p = h.phase + offs[i] * Math.PI * 2, sw = Math.sin(p) * amp;
    L.hip.rotation.x = L.front ? sw : -sw * 0.9;
    const lift = Math.max(0, Math.cos(p)) * amp * 1.4;
    L.knee.rotation.x = L.front ? -lift : lift * 0.7;
  });
  const bob = freq === 0 ? Math.sin(t * 1.4) * 0.008 : Math.abs(Math.sin(h.phase)) * 0.06 * amp;
  h.body.position.y = bob;
  h.body.rotation.x = gallop ? Math.sin(h.phase) * 0.06 : 0;
  h.neck.rotation.x = NECK + (gallop ? Math.sin(h.phase + 0.6) * 0.12 : Math.sin(h.phase * 2) * 0.03) - fear * 0.003;
  h.tail.rotation.x = -0.1 - Math.min(0.9, speed * 0.06) + Math.sin(t * 3 + h.phase) * 0.06;
  h.tail.rotation.z = Math.sin(t * 2.1) * 0.12;
  const earBack = fear > 55 ? 0.9 : 0;
  for (const e of h.ears) e.rotation.x += ((-earBack) - e.rotation.x) * Math.min(1, dt * 6);
}

// ---------- 마법사 ----------
function buildHat(id, color, parent) {
  const hat = new THREE.Group(); parent.add(hat);
  if (id === 'brass') {
    part(new THREE.SphereGeometry(0.19, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xd4a446, hat, { pos: [0, 0.03, 0], outline: 0.014 });
    part(new THREE.CylinderGeometry(0.25, 0.25, 0.025, 18), 0xb8892f, hat, { pos: [0, 0.03, 0], outline: 0.01 });
    part(new THREE.ConeGeometry(0.05, 0.22, 8), color, hat, { pos: [0, 0.29, -0.03], rot: [-0.3, 0, 0], outline: 0.01 });
  } else {
    const tall = id === 'felt' ? 0.62 : 0.5;
    part(new THREE.CylinderGeometry(0.31, 0.31, 0.022, 20), color, hat, { pos: [0, 0.05, 0], outline: 0.012 });
    const cone = new THREE.Group(); cone.position.set(0, 0.06, 0); hat.add(cone);
    part(new THREE.ConeGeometry(0.17, tall * 0.6, 14, 1, true), color, cone, { pos: [0, tall * 0.3, 0], outline: 0.012 });
    const tip = new THREE.Group(); tip.position.set(0, tall * 0.58, 0); tip.rotation.set(-0.5, 0, 0.15); cone.add(tip);
    part(new THREE.ConeGeometry(0.085, tall * 0.45, 10), color, tip, { pos: [0, tall * 0.2, 0], outline: 0.01 });
    if (id === 'felt') part(new THREE.TorusGeometry(0.165, 0.025, 6, 18), 0xf2d16b, cone, { pos: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
    if (id === 'oldcone') part(new THREE.BoxGeometry(0.1, 0.09, 0.02), shade(color, 1.35), cone, { pos: [0.06, 0.16, 0.13], rot: [0, 0.3, 0.2], outline: 0.006 });   // 기운 자국
  }
  return hat;
}
export function buildWizard(charKey, loadout, job = null) {
  const ch = CHARS[charKey];
  const root = new THREE.Group();
  const robe = ch.robe, skin = ch.skin, team = ch.color;
  const big = ch.mass > 85 ? 1.15 : ch.mass < 62 ? 0.94 : 1;
  const torsoG = new THREE.Group(); torsoG.scale.set(big, 1, big); root.add(torsoG);
  part(new THREE.CylinderGeometry(0.23, 0.33, 0.42, 14), robe, torsoG, { pos: [0, 0.02, 0], outline: 0.016 });
  part(new THREE.CapsuleGeometry(0.21, 0.34, 6, 14), robe, torsoG, { pos: [0, 0.43, 0], scale: [1, 1, 0.86], outline: 0.018 });
  part(new THREE.TorusGeometry(0.205, 0.035, 6, 18), 0x5a3a1c, torsoG, { pos: [0, 0.22, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.86, 1], outline: 0 });
  part(new THREE.BoxGeometry(0.07, 0.52, 0.03), team, torsoG, { pos: [0.02, 0.45, 0.17], rot: [0, 0, 0.62], outline: 0.008 });   // 띠
  part(new THREE.ConeGeometry(0.34, 0.42, 14, 1, true), team, torsoG, { pos: [0, 0.58, -0.05], rot: [-0.12, 0, 0], outline: 0.012 });  // 어깨 망토
  // 머리
  const head = new THREE.Group(); head.position.set(0, CFG.rider.headY, 0); root.add(head);
  part(new THREE.SphereGeometry(0.17, 18, 14), skin, head, { outline: 0.014 });
  part(new THREE.SphereGeometry(0.175, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), ch.hair, head, { pos: [0, 0.015, -0.015], rot: [-0.25, 0, 0], outline: 0.01 });
  for (const sx of [-1, 1]) {
    part(new THREE.SphereGeometry(0.034, 10, 8), 0xffffff, head, { pos: [sx * 0.062, 0.025, 0.145], outline: 0 });
    part(new THREE.SphereGeometry(0.02, 8, 6), 0x1a1210, head, { pos: [sx * 0.062, 0.022, 0.172], outline: 0 });
    part(new THREE.SphereGeometry(0.03, 8, 6), 0xff9a8a, head, { pos: [sx * 0.105, -0.045, 0.12], scale: [1, 0.6, 0.5], outline: 0 });
  }
  part(new THREE.SphereGeometry(0.03, 8, 6), shade(skin, 0.9), head, { pos: [0, -0.02, 0.172], outline: 0 });
  if (charKey === 'mukjik' || charKey === 'boss1') part(new THREE.BoxGeometry(0.2, 0.09, 0.08), ch.hair, head, { pos: [0, -0.1, 0.11], outline: 0.008 });   // 수염
  if (charKey === 'dummy') part(new THREE.BoxGeometry(0.16, 0.02, 0.02), 0x6a4a20, head, { pos: [0, -0.07, 0.165], outline: 0 });
  const hat = buildHat(loadout.hat, loadout.hat === 'brass' ? 0xd4a446 : ch.hatColor, head);
  hat.position.y = 0.1;
  if (job && JOBS[job]) {   // 전직: 원소 색 목도리, 모자 앞 문양, 허리춤 책
    const jc = JOBS[job].color;
    part(new THREE.TorusGeometry(0.2, 0.05, 6, 18), jc, torsoG, { pos: [0, 0.66, 0], rot: [Math.PI / 2, 0, 0], scale: [1, 0.9, 1], outline: 0.008 });
    part(new THREE.BoxGeometry(0.09, 0.4, 0.02), jc, torsoG, { pos: [-0.08, 0.5, 0.19], rot: [0, 0, -0.25], outline: 0.006 });
    part(new THREE.CircleGeometry(0.06, 12), jc, hat, { pos: [0, 0.14, 0.17], outline: 0 });
    part(new THREE.BoxGeometry(0.16, 0.2, 0.06), jc, torsoG, { pos: [0.3, -0.05, -0.05], rot: [0, 0, 0.1], outline: 0.008 });
  }
  return { root, head, hat, ch, big, armColor: robe, skin };
}

// 팔·다리 (월드 공간에 두고 매 프레임 IK로 놓는다)
export function buildLimbs(ch) {
  const g = new THREE.Group();
  const seg = (r, l, c) => { const m = part(new THREE.CapsuleGeometry(r, l, 4, 8), c, g, { outline: 0.012 }); m.userData.len = l + 2 * r; return m; };
  const arm = () => ({ upper: seg(0.06, 0.2, ch.robe), lower: seg(0.05, 0.2, ch.robe), hand: part(new THREE.SphereGeometry(0.055, 10, 8), ch.skin, g, { outline: 0.01 }) });
  const leg = () => ({ upper: seg(0.075, 0.28, shade(ch.robe, 0.8)), lower: seg(0.065, 0.28, 0x4a3324), foot: part(new THREE.BoxGeometry(0.1, 0.08, 0.2), 0x3a2618, g, { outline: 0.01 }) });
  return { group: g, R: arm(), L: arm(), legL: leg(), legR: leg() };
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
export function placeSeg(m, from, to) {
  _d.subVectors(to, from); const l = _d.length();
  m.position.addVectors(from, to).multiplyScalar(0.5);
  if (l > 1e-5) m.quaternion.setFromUnitVectors(_up, _d.multiplyScalar(1 / l));
  m.scale.set(1, Math.max(0.3, l / m.userData.len), 1);
}
// 두 마디 IK: 어깨 S → 손 T, 팔꿈치는 pole 쪽으로
export function solveIK(S, T, a, b, pole, outE) {
  _d.subVectors(T, S); let d = _d.length();
  const maxD = (a + b) * 0.999; if (d > maxD) { _d.multiplyScalar(maxD / d); T = _a.copy(S).add(_d); d = maxD; }
  const dir = _d.clone().normalize();
  const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
  const p = _b.copy(pole).projectOnPlane(dir).normalize();
  outE.copy(S).addScaledVector(dir, x).addScaledVector(p, h);
  return T;
}

// ---------- 지팡이 ----------
export function buildStaff(itemId) {
  const it = ITEMS[itemId], L = it.len;
  const g = new THREE.Group();
  part(new THREE.CylinderGeometry(0.028, 0.034, L, 8), it.color, g, { outline: 0.01 });
  part(new THREE.CylinderGeometry(0.04, 0.04, 0.22, 8), 0x4a2c16, g, { pos: [0, -L * 0.25, 0], outline: 0.008 });
  if (itemId === 'iron') for (const y of [0.2, -0.05]) part(new THREE.TorusGeometry(0.04, 0.012, 6, 12), 0x9aa3ad, g, { pos: [0, L * y, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
  if (itemId === 'stick') part(new THREE.CylinderGeometry(0.012, 0.02, 0.18, 5), it.color, g, { pos: [0.04, L * 0.18, 0], rot: [0, 0, -0.7], outline: 0.006 });
  const tipMat = new THREE.MeshBasicMaterial({ color: it.tip });
  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(itemId === 'crystal' ? 0.085 : 0.06, 0), tipMat);
  tip.position.y = L / 2 + 0.05; tip.scale.set(1, 1.5, 1); g.add(tip);
  const glow = glowSprite(it.tip, 0.4); glow.position.y = L / 2 + 0.05; g.add(glow);
  return { group: g, tip, glow, tipMat, len: L, item: it, base: new THREE.Color(it.tip) };
}
