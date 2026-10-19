// 진짜 모델: KayKit 기수 5종 + Quaternius 말 6품종, 성격별 실루엣 (설계: superpowers/specs/2026-10-19-mw-real-models-design.md)
// 그리기만 바꾼다. view.js renderFrames 가 놓은 도형 팔다리(보이지 않게 둔다)의 손·발·팔꿈치·무릎 자리를 모델 뼈가 따라간다
// → 말 위·걷기·낙마·래그돌·발차기·잡기·다시 보기를 따로 손대지 않는다. 시안: lookPreview.js 3판
import * as THREE from 'three';
import { HORSES, CHARS, CFG } from './config.js';
import { toon, outlineMat, part, solveIK } from './models.js';

const JSM = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const _Y = V(0, 1, 0);
// GLTFLoader 는 노드 이름에서 . 을 뺀다 ('upperarm.r' → 'upperarmr')
const byName = (root, n) => root.getObjectByName(n) || root.getObjectByName(n.replace(/[.]/g, ''));

// ---------- 성격별 모양 ----------
// 몸: KayKit Adventurers (모두 같은 41마디 뼈대). team = 캐릭터 옷 색으로 칠할 색 칸 [x, y, 폭], hide = 기본으로 숨길 소품(STYLE 이 꺼내 쓴다)
const BODIES = {
  mage: { head: 'Mage_Head', hide: ['Spellbook'], team: [[0, 1, 2]], cape: [2, 1] },
  knight: { head: 'Knight_Head', hide: ['Badge_Shield'], team: [[0, 1, 1]] },
  barbarian: { head: 'Barbarian_Head', hide: ['Barbarian_Round_Shield', '2H_Axe', 'Mug', 'Barbarian_Hat'], team: [[0, 1, 2]] },
  rogue: { head: 'Rogue_Head', hide: [], team: [[0, 1, 2]] },
  rogue_hooded: { head: 'Rogue_Head_Hooded', hide: ['Knife'], team: [[0, 1, 2]] },
};
export const BODY_OF = { maji: 'mage', dummy: 'mage', mukjik: 'barbarian', boss1: 'barbarian', beongae: 'rogue', gihoe: 'rogue_hooded', rival: 'knight' };
// 기수: wide 몸통 폭(배·어깨·팔이 같이 굵어진다) · lean 앞으로 숙임 · hunch 등 굽힘 · tilt 고개 갸웃 · armOut 왼팔을 옆으로(허수아비)
//   hat: 'game' 장비 모자 그대로 | 'swept' 바람에 젖힌 고깔 | 'floppy' 축 처진 고깔 + 지푸라기 | 'plume' 깃털 챙 모자 | 'none' 두건 | 그 밖 = 몸 glb 안의 KayKit 모자 이름
//   head 'pumpkin' 호박 머리 · back/hip/arm 소품: { n: 몸 glb 안 소품 이름 · props.glb 이름 · BUILT 이름, at: 붙는 뼈 기준 모델 좌표, rot, size }
export const STYLE = {
  maji: { hat: 'game', hip: { n: 'Spellbook', at: [0.42, -0.42, 0.05], rot: [0, Math.PI / 2, 0.2], size: 0.42 } },
  dummy: { head: 'pumpkin', wide: 0.85, tilt: 0.3, armOut: true, hat: 'floppy' },
  mukjik: { wide: 1.4, hat: 'Barbarian_Hat', back: { n: 'Barbarian_Round_Shield', at: [0, 0.05, -0.42], rot: [0, 0, 0], size: 0.95 } },
  boss1: { wide: 1.3, hat: 'game', back: { n: '2H_Axe', at: [0, 0.1, -0.4], rot: [0, 0, 0.6], size: 1.5 }, hip: { n: 'Mug', at: [0.45, -0.4, 0.1], rot: [0, 0, 0], size: 0.3 } },
  beongae: { wide: 0.85, lean: 0.4, hat: 'swept', back: { n: 'sashimono', at: [0, 0.75, -0.36], rot: [0, 0, 0], size: 2.1 } },
  gihoe: { hunch: 0.35, hat: 'none', back: { n: 'quiver', at: [0.1, 0.05, -0.38], rot: [0, 0, -0.5], size: 0.85 }, hip: { n: 'Knife', at: [-0.42, -0.4, 0.05], rot: [0, 0, 0], size: 0.45 } },
  rival: { hat: 'plume', arm: { n: 'Badge_Shield', at: [0.12, 0, 0], rot: [0, -Math.PI / 2, 0], size: 0.9 } },
};
// 말 품종: legs [굵기, 길이] · neck [굵기, 길이] · head 머리 크기 · wide 몸통 폭 · mane 'mohawk'|'long'|'braid' · feather 발목 털 · headLow 고개 숙임 · earDroop 귀 처짐 · packs 짐 · plume 머리 깃털
export const BREED = {
  gojip: {},
  bigred: { legs: [1.45, 0.95], neck: [1.3, 1], head: 1.1, wide: 1.15, feather: true },
  pony: { legs: [1.45, 0.62], neck: [1.3, 0.8], head: 1.35, wide: 1.28, mane: 'mohawk' },
  black: { legs: [0.85, 1.12], neck: [0.9, 1.2], head: 0.9, wide: 0.92, mane: 'long' },
  nag: { legs: [0.9, 1], wide: 0.95, headLow: 0.5, earDroop: true, packs: true },
  bay: { neck: [1, 1.08], mane: 'braid', plume: true },
};
export const HORSE_EXTRA = { boss1: 'armor' };   // 돌쇠 말: 놋쇠 얼굴 가리개 (묵직이와 같은 큰 밤색 말이라 구분)
// 맞춤 값: KayKit 은 머리가 커서 줄이고(mageScale·headScale), 말은 게임 말처럼 조금 통통하게(horseWide), 짧은 다리는 늘리고(legScale), 목은 세운다(neckUp, 양수 = 위)
export const TUNE = { mageScale: 0.72, headScale: 0.82, horseWide: 1.1, legScale: 1.45, neckUp: 0.12, neckUpFp: 0.18, sweptTilt: -1.0, earDroop: [0.9, 0.5], earBack: [-0.9, 0.3], pumpkinYaw: 0 };

// ---------- 공용 도구 (venues.js 도 쓴다) ----------
// 스킨 메시 정점의 월드 위치로 경계 상자를 잰다 (뼈 자세 반영)
function skinnedBox(root, filter) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), v = V(), pts = [];
  root.traverse((o) => {
    if (!o.isMesh || (filter && !filter(o))) return;
    const n = o.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) { o.getVertexPosition(i, v); v.applyMatrix4(o.matrixWorld); box.expandByPoint(v); pts.push(v.clone()); }
  });
  return { box, pts };
}
function posePlay(root, anims, name) {
  const mixer = new THREE.AnimationMixer(root), act = mixer.clipAction(anims.find((a) => a.name === name));
  act.play(); mixer.update(0); root.updateMatrixWorld(true);
  return mixer;
}
// 툰 재질 + 뒤집은 껍데기 외곽선 (스킨 메시는 같은 뼈대를 공유하는 껍데기). outlineW = 세계 단위 두께
const gradMap = toon(0xffffff).gradientMap;
const _m4 = new THREE.Matrix4();
// 메시 자체 단위 1이 세계에서 몇 m인가 (스킨 메시: 뼈 행렬 × 뼈 역행렬 × bind 행렬의 배율, 자세와 무관)
function meshScale(o) {
  if (!o.isSkinnedMesh) return o.matrixWorld.getMaxScaleOnAxis();
  const sk = o.skeleton; return _m4.multiplyMatrices(sk.bones[0].matrixWorld, sk.boneInverses[0]).multiply(o.bindMatrix).getMaxScaleOnAxis();
}
export function toonify(root, colorOf, mapOf, outlineW, shadows = true) {
  let top = root; while (top.parent) top = top.parent;
  top.updateMatrixWorld(true);
  const meshes = []; root.traverse((o) => { if (o.isMesh && o.visible && !o.userData.outline && !o.userData.keep) meshes.push(o); });
  for (const o of meshes) {
    const old = o.material, col = colorOf ? colorOf(old) : null;
    o.material = new THREE.MeshToonMaterial({ color: col != null ? col : 0xffffff, map: mapOf ? mapOf(old) : null, gradientMap: gradMap });
    o.castShadow = shadows; o.receiveShadow = true; o.frustumCulled = false; o.userData.rig = true;   // view.js 가 시합 끝에 모양을 버리지 않게
    if (!(outlineW > 0)) continue;
    const w = outlineW / meshScale(o);
    const ol = o.isSkinnedMesh ? new THREE.SkinnedMesh(o.geometry, outlineMat(w)) : new THREE.Mesh(o.geometry, outlineMat(w));
    if (o.isSkinnedMesh) ol.bind(o.skeleton, o.bindMatrix);
    ol.userData.outline = true; ol.userData.rig = true; ol.castShadow = false; ol.frustumCulled = false;
    ol.position.copy(o.position); ol.quaternion.copy(o.quaternion); ol.scale.copy(o.scale);
    o.parent.add(ol);
  }
}
// 크기 맞춤: obj 의 가장 긴 변을 size 로, 원점을 경계 상자 가운데(또는 바닥 가운데)로 옮긴 틀 그룹을 돌려준다
export function fitPivot(obj, size, bottom) {
  if (obj.parent) obj.parent.remove(obj);
  obj.position.set(0, 0, 0); obj.quaternion.identity(); obj.scale.setScalar(1); obj.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(obj, true), sz = bb.getSize(V()), c = bb.getCenter(V()), s = size / Math.max(sz.x, sz.y, sz.z);
  obj.scale.setScalar(s); obj.position.set(-c.x * s, -(bottom ? bb.min.y : c.y) * s, -c.z * s);
  const g = new THREE.Group(); g.add(obj); g.userData.h = sz.y * s; g.userData.size = sz.multiplyScalar(s);
  return g;
}
// 다른 팩 소품: 자기 텍스처 그대로 툰 재질 + 외곽선. keep = 기수 옷 색칠에서 뺀다 (자리 잡은 뒤에 불러야 외곽선 두께가 맞다)
export function toonProp(g, outlineW = 0.012, shadows = true) {
  toonify(g, null, (old) => old.map || null, outlineW, shadows);
  g.traverse((o) => { if (o.isMesh) o.userData.keep = true; });
}
const shade = (hex, k) => new THREE.Color(hex).multiplyScalar(k);
// 로컬 y 를 yDir 로, 로컬 x 를 xHint 쪽(수직 성분)으로 두는 회전
function basisQ(yDir, xHint) {
  const y = yDir.clone().normalize(), x = xHint.clone().addScaledVector(y, -xHint.dot(y)).normalize(), z = V().crossVectors(x, y);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
// 뼈 하나를 돌려서 자식 뼈가 목표 쪽을 보게 한다
const _v1 = V(), _v2 = V(), _v3 = V(), _v4 = V(), _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
function aimBone(bone, child, target) {
  const bp = bone.getWorldPosition(_v1), cp = child.getWorldPosition(_v2);
  const cur = _v3.subVectors(cp, bp).normalize(), want = _v4.subVectors(target, bp).normalize();
  _q1.setFromUnitVectors(cur, want);
  bone.getWorldQuaternion(_q2); _q2.premultiply(_q1);
  bone.parent.getWorldQuaternion(_q3).invert();
  bone.quaternion.copy(_q3.multiply(_q2));
  bone.updateMatrixWorld(true);
}
const _E = V(), _S = V(), _T = V();
function ikChain(a, b, c, target, pole) {
  a.updateMatrixWorld(true);
  const S = a.getWorldPosition(_S), la = S.distanceTo(b.getWorldPosition(_v1)), lb = b.getWorldPosition(_v1).distanceTo(c.getWorldPosition(_v2));
  const end = solveIK(S.clone(), _T.copy(target), la, lb, pole, _E).clone();
  aimBone(a, b, _E.clone());
  aimBone(b, c, end);
}
// 애니메이션 자세 위에 회전을 더한다. 믹서는 값이 안 바뀌면(멈춤·같은 시각) 뼈에 다시 쓰지 않으므로
// 그냥 곱하면 매 프레임 쌓인다 → 믹서가 새로 쓴 값(=지난번 내가 쓴 값과 다름)일 때만 기준을 새로 잡는다
const rotBase = new WeakMap(), _e = new THREE.Euler();
function addRot(bone, x, z) {
  let st = rotBase.get(bone); if (!st) rotBase.set(bone, st = { base: new THREE.Quaternion(), last: null });
  if (!st.last || !bone.quaternion.equals(st.last)) st.base.copy(bone.quaternion);
  bone.quaternion.copy(st.base).multiply(_q1.setFromEuler(_e.set(x, 0, z)));
  st.last = (st.last || new THREE.Quaternion()).copy(bone.quaternion);
}
function setAct(o, name, t) {
  for (const n in o.acts) o.acts[n].weight = n === name ? 1 : 0;
  o.acts[name].time = t; o.mixer.update(0);
}
// 도형 마디(placeSeg 로 놓인 캡슐)의 양 끝: a = 시작(어깨·엉덩이 쪽), b = 끝(팔꿈치·무릎 쪽)
const _ax = V();
function segEnds(m, a, b) {
  const h = m.userData.len * m.scale.y / 2; _ax.set(0, 1, 0).applyQuaternion(m.quaternion);
  a.copy(m.position).addScaledVector(_ax, -h); b.copy(m.position).addScaledVector(_ax, h);
}

// ---------- 만들기 ----------
export async function createRig(assets) {
  const SkeletonUtils = await import(JSM + 'utils/SkeletonUtils.js');
  const PROPS = assets.props;
  const stats = {};
  const H = prepHorse(assets.horse), BP = {};
  for (const k in BODIES) BP[k] = prepBody(assets.bodies[k], k);

  function prepHorse(g) {
    const src = g.scene, mixer = posePlay(src, g.animations, 'Idle'), M = measureHorse(src);
    mixer.stopAllAction();
    const clips = Object.fromEntries(['Idle', 'Walk', 'Gallop'].map((n) => [n, g.animations.find((a) => a.name === n)]));
    return { src, clips, ...M };
  }
  // 서 있는 자세(Idle)의 말에서 게임 말에 맞출 배율·위치를 잰다
  function measureHorse(src) {
    src.updateMatrixWorld(true);
    const bone = (n) => byName(src, n).getWorldPosition(V());
    const head = bone('Head'), tail = bone('Tail1'), yaw = head.z > tail.z ? 0 : Math.PI, sgn = yaw ? -1 : 1;
    const { box, pts } = skinnedBox(src);
    const fs = bone('FrontShoulder.L'), bs = bone('BackShoulder.L'), midZ = (fs.z + bs.z) / 2;
    // 등 높이 = 앞뒤 다리 사이 몸통 가운데 띠에서 가장 높은 점
    let backY = -1e9; for (const p of pts) if (Math.abs(p.z - midZ) < Math.abs(fs.z - bs.z) * 0.15) backY = Math.max(backY, p.y);
    // 게임 말(크기 1)에 맞춘다: 발굽 바닥 -1.27, 등 0.40, 앞뒤 다리 사이 가운데 z -0.01
    const k = (0.40 - -1.27) / (backY - box.min.y), oy = -1.27 - box.min.y * k, oz = -0.01 - midZ * k * sgn;
    // 안장 자리 몸통 반폭
    let half = 0; for (const p of pts) if (Math.abs(p.z - (midZ - 0.11 / k * sgn)) < 0.08 / k && p.y > backY - 0.45 / k) half = Math.max(half, Math.abs(p.x));
    return { k, oy, oz, yaw, half: half * k };
  }

  // 품종별 말: 뼈 굵기·길이를 바꾸고 갈기·발목 털·깃털·가리개를 뼈에 붙인 원본을 하나씩 만든다
  const breeds = new Map();
  function breedOf(defKey, extra) {
    const ck = defKey + '|' + (extra || ''); if (breeds.has(ck)) return breeds.get(ck);
    const B = BREED[defKey] || {}, def = HORSES[defKey], src = SkeletonUtils.clone(H.src), bn = (n) => byName(src, n);
    if (B.legs) for (const n of ['FrontUpperLeg.L', 'FrontUpperLeg.R', 'BackLeg.L', 'BackLeg.R']) bn(n).scale.set(B.legs[0], B.legs[1], B.legs[0]);
    if (B.neck) bn('Neck1').scale.set(B.neck[0], B.neck[1], B.neck[0]);
    if (B.neck || B.head) { const n = B.neck || [1, 1], h = B.head || 1; bn('Head').scale.set(h / n[0], h / n[1], h / n[0]); }
    const mixer = new THREE.AnimationMixer(src); mixer.clipAction(H.clips.Idle).play(); mixer.update(0);
    const M = measureHorse(src);
    decorateHorse(src, B, def, extra, M);
    mixer.stopAllAction();
    const r = { src, B, ...M }; breeds.set(ck, r);
    return r;
  }
  // 뼈에 붙이기: 원본 좌표(src)의 자리·회전에 m 단위 모양을 1/k 배로 놓고 뼈 자식으로 옮긴다
  function stick(src, bone, mesh, pos, quat, k) {
    mesh.position.copy(pos); mesh.quaternion.copy(quat); mesh.scale.setScalar(1 / k);
    src.updateMatrixWorld(true); bone.attach(mesh);
    return mesh;
  }
  const mk = (geo, color) => new THREE.Mesh(geo, new THREE.MeshToonMaterial({ color }));
  function decorateHorse(src, B, def, extra, M) {
    src.updateMatrixWorld(true);
    const k = M.k, bn = (n) => byName(src, n), wp = (n) => bn(n).getWorldPosition(V());
    const NECK = ['Neck1', 'Neck2', 'Neck3', 'Head'], np = NECK.map(wp);
    // 갈기 능선: 갈기(Hair) 정점 가운데 목뼈에 가까운 것을 목 길이 방향 6칸으로 나눠, 칸마다 목 축에서 가장 먼 점(=갈기 꼭대기)과 그 방향
    if (B.mane) {
      const hairV = [], v = V(), tails = [1, 2, 3, 4, 5, 6, 7].map((i) => wp('Tail' + i));
      src.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'Hair') for (let i = 0; i < o.geometry.attributes.position.count; i++) { o.getVertexPosition(i, v); hairV.push(v.clone().applyMatrix4(o.matrixWorld)); } });
      const near = (p, arr) => Math.min(...arr.map((q) => q.distanceTo(p)));
      const mane = hairV.filter((p) => near(p, np) < near(p, tails));
      const a = np[0], b = np[3], ax = V().subVectors(b, a), L = ax.length(); ax.normalize();
      const bins = Array.from({ length: 6 }, () => null);
      for (const p of mane) {
        const t = V().subVectors(p, a).dot(ax) / L; if (t < 0 || t >= 1) continue;
        const i = Math.floor(t * 6), proj = a.clone().addScaledVector(ax, t * L), d = p.distanceTo(proj);
        if (!bins[i] || d > bins[i].d) bins[i] = { p, d, dir: V().subVectors(p, proj).normalize(), t };
      }
      const ridge = [];
      for (const r of bins) if (r) { let bi = 0; for (let j = 1; j < 4; j++) if (np[j].distanceTo(r.p) < np[bi].distanceTo(r.p)) bi = j; ridge.push({ ...r, bone: bn(NECK[bi]) }); }
      const q = new THREE.Quaternion();
      ridge.forEach((r, i) => {
        if (B.mane === 'mohawk') {   // 조랑말: 곤두선 솔 갈기
          stick(src, r.bone, mk(new THREE.ConeGeometry(0.07, 0.26, 6), def.mane), r.p.clone().addScaledVector(r.dir, 0.08 / k), q.setFromUnitVectors(_Y, r.dir), k);
        } else if (B.mane === 'long') {   // 검은 말: 옆으로 길게 늘어진 갈기
          const side = V().crossVectors(ax, _Y).normalize(), hang = V(0, -1, 0).addScaledVector(side, 0.35).addScaledVector(r.dir, 0.2).normalize();
          const g = new THREE.BoxGeometry(0.17, 0.62, 0.035); g.translate(0, -0.31, 0);
          stick(src, r.bone, mk(g, def.mane), r.p, basisQ(hang.negate(), ax), k).rotateZ(i % 2 ? 0.12 : -0.08);
        } else if (B.mane === 'braid') {   // 갈색 말: 단추처럼 땋은 갈기
          stick(src, r.bone, mk(new THREE.SphereGeometry(0.065, 10, 8), def.mane), r.p.clone().addScaledVector(r.dir, 0.03 / k), q.identity(), k);
        }
      });
      if (B.mane === 'long') {   // 긴 꼬리
        const t6 = wp('Tail6'), t7 = wp('Tail7'), d = V().subVectors(t7, t6).normalize();
        const g = new THREE.ConeGeometry(0.11, 0.7, 8); g.rotateX(Math.PI); g.translate(0, 0.35, 0);
        stick(src, bn('Tail7'), mk(g, def.mane), t7, new THREE.Quaternion().setFromUnitVectors(_Y, d), k);
      }
    }
    // 짐마차 말: 발굽 위를 덮는 흰 발목 털 (아래 테두리를 톱니처럼)
    if (B.feather) for (const n of ['FrontLowerLeg.L', 'FrontLowerLeg.R', 'BackLowerLeg.L', 'BackLowerLeg.R']) {
      const p0 = wp(n), p1 = bn(n + '_end').getWorldPosition(V()), d = V().subVectors(p0, p1).normalize();
      const g = new THREE.CylinderGeometry(0.07 * B.legs[0], 0.17 * B.legs[0], 0.28, 14, 2), pa = g.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i), r = Math.hypot(x, z); if (y > -0.13 || r < 0.02) continue;
        const odd = Math.round(Math.atan2(z, x) / (Math.PI * 2 / 14)) % 2 !== 0;
        pa.setY(i, y - (odd ? 0.07 : 0)); pa.setX(i, x * (odd ? 0.92 : 1.12)); pa.setZ(i, z * (odd ? 0.92 : 1.12));
      }
      g.computeVertexNormals();
      stick(src, bn(n), mk(g, 0xf2ece0), p0.clone().lerp(p1, 0.78), new THREE.Quaternion().setFromUnitVectors(_Y, d), k);
    }
    // 머리 기준점: 귀 사이, 주둥이(머리 근처 Muzzle 정점 가운데), 이마 방향
    const hd = np[3], ears = wp('Ear1.L').add(wp('Ear1.R')).multiplyScalar(0.5);
    const muz = V(), v2 = V(), headR = hd.distanceTo(np[1]) * 2.5; let nm = 0;
    src.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'Muzzle') for (let i = 0; i < o.geometry.attributes.position.count; i++) { o.getVertexPosition(i, v2).applyMatrix4(o.matrixWorld); if (v2.distanceTo(hd) < headR) { muz.add(v2); nm++; } } });
    muz.multiplyScalar(1 / Math.max(1, nm));
    const fa = V().subVectors(muz, hd).normalize(), up0 = V().subVectors(ears, hd), dors = up0.addScaledVector(fa, -up0.dot(fa)).normalize();
    if (B.plume) {   // 귀 뒤에서 뒤로 넘어가는 깃털 셋 (뿔처럼 안 보이게 굵고 뒤로 눕힌다)
      const back = V().subVectors(np[2], hd).normalize();
      [[0xffffff, -0.35], [0xe8c860, 0], [0xffffff, 0.35]].forEach(([c, sp]) => {
        const g = new THREE.SphereGeometry(1, 12, 8); g.scale(0.075, 0.3, 0.03); g.translate(0, 0.27, 0);
        const dir = V().addScaledVector(dors, 0.55).addScaledVector(back, 0.85).normalize();
        dir.addScaledVector(V().crossVectors(dir, dors).normalize(), sp * 0.5).normalize();
        stick(src, bn('Head'), mk(g, c), ears.clone().addScaledVector(dors, 0.03 / k), new THREE.Quaternion().setFromUnitVectors(_Y, dir), k);
      });
    }
    if (extra === 'armor') {   // 놋쇠 얼굴 가리개 + 가운데 장식
      const g = new THREE.BoxGeometry(0.17, hd.distanceTo(muz) * k * 0.7, 0.03), c = hd.clone().lerp(muz, 0.42).addScaledVector(dors, 0.075 / k);
      const qq = new THREE.Quaternion().setFromUnitVectors(_Y, fa), zNow = V(0, 0, 1).applyQuaternion(qq);
      qq.premultiply(new THREE.Quaternion().setFromUnitVectors(zNow, dors));
      stick(src, bn('Head'), mk(g, 0xd4a446), c, qq, k);
      stick(src, bn('Head'), mk(new THREE.SphereGeometry(0.06, 10, 8), 0xb8892f), c.clone().addScaledVector(dors, 0.03 / k), new THREE.Quaternion(), k);
    }
  }

  function prepBody(g, key) {
    const D = BODIES[key], src = g.scene;
    for (const n of D.hide) { const o = src.getObjectByName(n); if (o) o.visible = false; }
    const mixer = posePlay(src, g.animations, 'Sit_Chair_Pose');
    const hips = byName(src, 'hips').getWorldPosition(V()), hb = byName(src, 'head');
    const { box, pts } = skinnedBox(src, (o) => o.name === D.head || (o.parent && o.parent.name === D.head));
    const headC = box.getCenter(V()), hh = box.max.y - box.min.y;
    const k = CFG.rider.headY / (headC.y - hips.y);
    // 모자 맞춤(머리 뼈 기준): 머리 높이의 80%·60%·45% 지점(챙 모자·투구·머리 가운데), 머리 반폭, 모델 공간에서 똑바로 서게 하는 회전
    const at = (f) => hb.worldToLocal(V(headC.x, box.min.y + hh * f, headC.z));
    let halfW = 0; for (const p of pts) halfW = Math.max(halfW, Math.abs(p.x - headC.x));
    const hat = { brim: at(0.8), helm: at(0.6), mid: at(0.45), hh, halfW, bs: hb.getWorldScale(V()).x, q: hb.getWorldQuaternion(new THREE.Quaternion()).invert() };
    mixer.stopAllAction();
    let tex = null; src.traverse((o) => { if (!tex && o.isMesh && o.visible && o.material.map) tex = o.material.map; });
    stats[key] = { k: +k.toFixed(4), halfW: +halfW.toFixed(3) };
    return { src, anims: g.animations, k, hips, tex, hat, D };
  }

  const propClone = (name, size, bottom = true) => fitPivot(PROPS[name].clone(true), size, bottom);
  const keyOfDef = (def) => Object.keys(HORSES).find((k) => HORSES[k] === def);

  // 안장: 말 등을 덮어 늘어진 천(원통 일부) + 가죽 안장 + 앞 손잡이
  function saddleOn(wrap, hw, cloth) {
    const g = new THREE.Group(); g.position.set(0, 0.38, -0.12); wrap.add(g);
    const r = hw + 0.03, drape = new THREE.CylinderGeometry(r, r, 0.74, 20, 1, true, -1.95, 3.9); drape.rotateX(-Math.PI / 2);
    part(drape, cloth, g, { pos: [0, 0.03 - r, 0], outline: 0.012 }).material.side = THREE.DoubleSide;
    const trim = new THREE.CylinderGeometry(r + 0.012, r + 0.012, 0.06, 20, 1, true, -1.95, 3.9); trim.rotateX(-Math.PI / 2);
    for (const z of [-0.36, 0.36]) part(trim, shade(cloth, 0.6).getHex(), g, { pos: [0, 0.03 - r, z], outline: 0 }).material.side = THREE.DoubleSide;
    const seat = new THREE.SphereGeometry(1, 18, 10); seat.scale(0.24, 0.075, 0.3);
    part(seat, 0x6b3e1f, g, { pos: [0, 0.07, 0], outline: 0.012 });
    part(new THREE.SphereGeometry(0.07, 10, 8), 0x5a3218, g, { pos: [0, 0.13, 0.26], scale: [1.2, 1, 0.8], outline: 0.01 });   // 앞 손잡이
    part(new THREE.TorusGeometry(0.17, 0.03, 6, 14, Math.PI), 0x5a3218, g, { pos: [0, 0.08, -0.25], outline: 0.01 });   // 뒤 등받이
    return g;
  }

  function attachHorse(hs) {
    const hv = hs.hv, def = hv.def, defKey = keyOfDef(def), Br = breedOf(defKey, HORSE_EXTRA[hs.char]), B = Br.B;
    const m = SkeletonUtils.clone(Br.src);
    const holder = new THREE.Group(); holder.add(m);
    const wide = TUNE.horseWide * (B.wide || 1);
    holder.scale.set(Br.k * wide, Br.k, Br.k); holder.position.set(0, Br.oy, Br.oz); holder.rotation.y = Br.yaw;
    const wrap = new THREE.Group(); wrap.scale.setScalar(hv.s); wrap.add(holder); hv.root.add(wrap);
    const colOf = { Main: shade(def.coat, 1), Main_Dark: shade(def.coat, 0.78), Main_Light: shade(def.coat, 1.15), Muzzle: shade(def.coat, 0.62), Hair: shade(def.mane, 1) };
    toonify(m, (old) => colOf[old.name] || old.color, null, 0.02 * hv.s);
    // 짐말: 양옆 통, 뒤 술통, 말아 둔 담요
    if (B.packs) {
      const hw0 = Br.half * wide;
      for (const sx of [-1, 1]) { const b = propClone('barrel', 0.42); b.position.set(sx * (hw0 + 0.16), -0.2, -0.55); b.rotation.z = sx * 0.12; wrap.add(b); toonProp(b); }
      const kg = propClone('keg', 0.5); kg.position.set(0, 0.42, -0.78); kg.rotation.y = Math.PI / 2; wrap.add(kg); toonProp(kg);
      part(new THREE.CylinderGeometry(0.11, 0.11, hw0 * 2 + 0.3, 12), 0x8a5a3a, wrap, { pos: [0, 0.5, -0.5], rot: [0, 0, Math.PI / 2], outline: 0.012 });
      for (const x of [0.2, -0.2]) part(new THREE.CylinderGeometry(0.115, 0.115, 0.05, 12), 0x5a3a20, wrap, { pos: [x, 0.5, -0.5], rot: [0, 0, Math.PI / 2], outline: 0 });
    }
    saddleOn(wrap, Math.max(0.3, Br.half * wide), hs.cloth);
    const mixer = new THREE.AnimationMixer(m), acts = {};
    for (const n in H.clips) { acts[n] = mixer.clipAction(H.clips[n]); acts[n].play(); acts[n].weight = 0; }
    return { wrap, m, mixer, acts, B, hv, neck: [byName(m, 'Neck1'), byName(m, 'Neck2')], ears: [byName(m, 'Ear1.L'), byName(m, 'Ear1.R')] };
  }

  // 옷 색: KayKit 팔레트 텍스처(8×4 칸, 칸 128×256)에서 옷 칸의 색상만 캐릭터 색으로 돌린다. 칸 안의 밝기 그라데이션은 그대로
  // 몸마다 칸이 다르다(glb UV 조사): 마법사 (0,1)(1,1) 옷·(2,1) 망토 · 기사 (0,1) 겉옷 · 바바리안·도적 (0,1)(1,1) 옷. 머리카락·눈썹·수염은 모두 (1,0)
  const texCache = new Map();
  function bodyTex(key, ch) {
    const ck = key + '|' + ch.robe + '|' + ch.color + '|' + ch.hair;
    if (texCache.has(ck)) return texCache.get(ck);
    const P = BP[key], img = P.tex.image, c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0);
    const cw = img.width / 8, chh = img.height / 4, hsl = {}, tmp = new THREE.Color();
    const tint = (cx, cy, w, hex, lift, satK, rel) => {
      new THREE.Color(hex).getHSL(hsl, THREE.SRGBColorSpace);
      const want = { ...hsl };
      const d = g.getImageData(cx * cw, cy * chh, cw * w, chh), p = d.data;
      let mean = 0;
      if (rel) { for (let i = 0; i < p.length; i += 4) { tmp.setRGB(p[i] / 255, p[i + 1] / 255, p[i + 2] / 255, THREE.SRGBColorSpace).getHSL(hsl, THREE.SRGBColorSpace); mean += hsl.l; } mean /= p.length / 4; }
      for (let i = 0; i < p.length; i += 4) {
        tmp.setRGB(p[i] / 255, p[i + 1] / 255, p[i + 2] / 255, THREE.SRGBColorSpace).getHSL(hsl, THREE.SRGBColorSpace);
        const l = rel ? want.l * hsl.l / Math.max(0.05, mean) : hsl.l * lift + 0.04;
        tmp.setHSL(want.h, Math.min(1, want.s * satK), Math.min(0.92, l), THREE.SRGBColorSpace);
        const o = tmp.getStyle(THREE.SRGBColorSpace).match(/[\d.]+/g);
        p[i] = +o[0]; p[i + 1] = +o[1]; p[i + 2] = +o[2];
      }
      g.putImageData(d, cx * cw, cy * chh);
    };
    for (const [cx, cy, w] of P.D.team) tint(cx, cy, w, ch.robe, 1.45, 0.95);
    if (P.D.cape) tint(P.D.cape[0], P.D.cape[1], 1, ch.color, 1.5, 1);
    tint(1, 0, 1, ch.hair, 0, 1, true);
    const t = new THREE.CanvasTexture(c); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
    texCache.set(ck, t);
    return t;
  }

  // 성격별 모자 모양 (게임 모자와 같은 좌표: 챙 가운데가 원점, 챙 반지름 ≈ 0.3)
  const HAT_STYLES = new Set(['game', 'swept', 'floppy', 'plume', 'none']);
  function hatStyle(id, ch) {
    const g = new THREE.Group(), col = ch.hatColor;
    const aim = (m, d) => { m.quaternion.setFromUnitVectors(_Y, V(...d).normalize()); return m; };
    if (id === 'swept') {   // 번개: 바람에 뒤로 젖힌 긴 고깔 + 휘날리는 끈
      part(new THREE.CylinderGeometry(0.27, 0.27, 0.022, 18), col, g, { pos: [0, 0.05, 0], outline: 0.012 });
      const cone = new THREE.Group(); cone.position.set(0, 0.06, 0); cone.rotation.x = TUNE.sweptTilt; g.add(cone);
      part(new THREE.ConeGeometry(0.16, 0.42, 14, 1, true), col, cone, { pos: [0, 0.21, 0], outline: 0.012 });
      part(new THREE.TorusGeometry(0.155, 0.025, 6, 18), 0xffd04a, cone, { pos: [0, 0.04, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
      const tip = new THREE.Group(); tip.position.set(0, 0.4, 0); tip.rotation.x = TUNE.sweptTilt * 0.9; cone.add(tip);
      part(new THREE.ConeGeometry(0.08, 0.44, 10), col, tip, { pos: [0, 0.21, 0], outline: 0.01 });
      const rib = new THREE.Group(); rib.position.set(0, 0.05, -0.12); rib.rotation.x = -1.9; cone.add(rib);
      part(new THREE.BoxGeometry(0.07, 0.6, 0.012), 0xff7a30, rib, { pos: [0, 0.3, 0], outline: 0.006 });
    } else if (id === 'floppy') {   // 허수아비: 축 처진 기운 고깔 + 챙 밑으로 삐져나온 지푸라기
      part(new THREE.CylinderGeometry(0.36, 0.36, 0.022, 9), col, g, { pos: [0, 0.05, 0], rot: [0.08, 0, -0.1], outline: 0.012 });
      const cone = new THREE.Group(); cone.position.set(0, 0.06, 0); cone.rotation.z = -0.15; g.add(cone);
      part(new THREE.ConeGeometry(0.18, 0.3, 9, 1, true), col, cone, { pos: [0, 0.15, 0], outline: 0.012 });
      const tip = new THREE.Group(); tip.position.set(0, 0.28, 0); tip.rotation.set(0.2, 0, 1.5); cone.add(tip);
      part(new THREE.ConeGeometry(0.1, 0.42, 9), col, tip, { pos: [0, 0.2, 0], outline: 0.01 });
      part(new THREE.BoxGeometry(0.1, 0.09, 0.02), 0xc04a2a, cone, { pos: [0.07, 0.12, 0.13], rot: [0, 0.4, 0.2], outline: 0.006 });
      part(new THREE.BoxGeometry(0.08, 0.08, 0.02), 0x4a7ac0, cone, { pos: [-0.09, 0.1, 0.12], rot: [0, -0.4, -0.1], outline: 0.006 });
      for (let i = 0; i < 11; i++) {
        const a = i / 11 * Math.PI * 2 + 0.3, r = 0.27 + (i % 3) * 0.02;
        aim(part(new THREE.ConeGeometry(0.022, 0.22 + (i % 2) * 0.06, 4), 0xe8cf6a, g, { pos: [Math.sin(a) * r, 0.0, Math.cos(a) * r], outline: 0.004 }), [Math.sin(a), -0.9, Math.cos(a)]);
      }
    } else if (id === 'plume') {   // 세린: 비스듬한 챙 모자 + 뒤로 넘어가는 큰 깃털
      part(new THREE.CylinderGeometry(0.39, 0.39, 0.022, 22), col, g, { pos: [0, 0.04, 0], rot: [-0.06, 0, 0.18], outline: 0.012 });
      part(new THREE.CylinderGeometry(0.17, 0.2, 0.2, 16), col, g, { pos: [0, 0.14, 0], outline: 0.012 });
      part(new THREE.TorusGeometry(0.195, 0.03, 6, 18), 0xf2d16b, g, { pos: [0, 0.07, 0], rot: [Math.PI / 2, 0, 0], outline: 0 });
      [[0xffffff, -0.25], [ch.color, 0], [0xffffff, 0.25]].forEach(([c, sp]) => {
        const geo = new THREE.SphereGeometry(1, 12, 8); geo.scale(0.085, 0.36, 0.025); geo.translate(0, 0.32, 0);
        aim(part(geo, c, g, { pos: [0.15, 0.12, 0.02], outline: 0.008 }), [0.45 + sp, 0.55, -0.8 + sp]);
      });
    }
    return g;
  }
  // 몸 소품 자리 잡기: 앉은 자세에서 뼈 위치 + at (모델 좌표), 모델 기준 회전 rot. 그 뒤로는 뼈를 따라간다
  function placeOn(m, bone, piv, d) {
    m.updateMatrixWorld(true);
    const c = m.worldToLocal(bone.getWorldPosition(V())).add(V(...d.at));
    const M = new THREE.Matrix4().compose(c, new THREE.Quaternion().setFromEuler(new THREE.Euler(...d.rot)), V(1, 1, 1)).premultiply(m.matrixWorld);
    M.decompose(piv.position, piv.quaternion, piv.scale);
    bone.attach(piv);
  }
  const SLOT_BONE = { back: 'chest', hip: 'hips', arm: 'lowerarm.l' };
  // 코드로 만드는 소품 (m 단위로 만들고 fitPivot 이 크기를 맞춘다)
  const BUILT = {
    sashimono(ch) {   // 등에 꽂는 깃발: 장대 + 캐릭터 색 깃발 + 번개 문양
      const g = new THREE.Group();
      part(new THREE.CylinderGeometry(0.018, 0.022, 1.5, 6), 0x5a3a20, g, { pos: [0, 0.75, 0], outline: 0.008 });
      part(new THREE.BoxGeometry(0.36, 0.6, 0.012), ch.color, g, { pos: [0.19, 1.15, 0], outline: 0.008 });
      const bolt = new THREE.Shape(); bolt.moveTo(0.04, 0.22); bolt.lineTo(-0.07, -0.01); bolt.lineTo(0.0, -0.01); bolt.lineTo(-0.05, -0.22); bolt.lineTo(0.08, 0.04); bolt.lineTo(0.01, 0.04); bolt.lineTo(0.06, 0.22);
      for (const z of [0.008, -0.008]) part(new THREE.ShapeGeometry(bolt), 0xffffff, g, { pos: [0.19, 1.15, z], outline: 0, rot: [0, z < 0 ? Math.PI : 0, 0] });
      return g;
    },
  };

  // s = view.js 기수 비주얼 { w, limbs, hatOn }, f = { char, ch, loadout }
  function attachMage(s, f) {
    const ch = f.ch, key = BODY_OF[f.char] || 'mage', P = BP[key], st = STYLE[f.char] || {};
    const m = SkeletonUtils.clone(P.src);
    const holder = new THREE.Group(); holder.add(m);
    const big = ch.mass > 85 ? 1.15 : ch.mass < 62 ? 0.94 : 1;   // 게임 마법사와 같은 덩치 차이
    const k = P.k * TUNE.mageScale * big;
    holder.scale.setScalar(k); holder.position.copy(P.hips).multiplyScalar(-k);   // 앉은 자세의 엉덩이 = 게임 몸통 원점
    s.w.root.add(holder);
    const B = (n) => byName(m, n), head = B('head');
    const mixer = new THREE.AnimationMixer(m), acts = { Sit_Chair_Pose: mixer.clipAction(P.anims.find((a) => a.name === 'Sit_Chair_Pose')) };
    acts.Sit_Chair_Pose.play();
    setAct({ mixer, acts }, 'Sit_Chair_Pose', 0);
    // 성격별 모양: 호박 머리, KayKit 모자, 등·허리·팔 소품
    const show = (n) => { const o = m.getObjectByName(n); if (o) o.traverse((c) => { c.visible = true; }); return o; };
    const ext = [];
    let pk = null;
    if (st.head === 'pumpkin') {
      const hm = m.getObjectByName(P.D.head); if (hm) hm.visible = false;
      pk = propClone('pumpkin', P.hat.halfW * 2.5, false);
      pk.position.copy(P.hat.mid); pk.quaternion.copy(P.hat.q).multiply(new THREE.Quaternion().setFromAxisAngle(_Y, TUNE.pumpkinYaw)); pk.scale.setScalar(1 / P.hat.bs); head.add(pk); ext.push(pk);
    }
    const kHat = st.hat && !HAT_STYLES.has(st.hat) ? show(st.hat) : null;
    for (const slot of ['back', 'hip', 'arm']) {
      const d = st[slot]; if (!d) continue;
      const built = BUILT[d.n] ? BUILT[d.n](ch) : null, own = PROPS[d.n] || built ? null : show(d.n);
      if (!PROPS[d.n] && !own && !built) continue;
      const piv = PROPS[d.n] ? propClone(d.n, d.size, false) : fitPivot(built || own, d.size, false);
      placeOn(m, B(SLOT_BONE[slot]), piv, d);
      if (PROPS[d.n]) ext.push(piv);
      if (built) piv.traverse((o) => { if (o.isMesh) o.userData.keep = true; });
    }
    // 모자 자리: 게임 장비 모자(s.w.hat)를 머리 뼈의 이 자리로 옮긴다 → 모자 날아가기(main.js)가 그대로 복제해 날린다
    const hat = s.w.hat, helm = f.loadout && f.loadout.hat === 'brass';
    const hatHome = { parent: hat.parent, pos: hat.position.clone(), q: hat.quaternion.clone(), s: hat.scale.clone(), kids: hat.children.map((c) => [c, c.visible]) };
    const hatPose = { pos: (helm ? P.hat.helm : P.hat.brim).clone(), q: P.hat.q.clone(), s: P.hat.halfW * (helm ? 1.12 / 0.19 : 1.35 / 0.31) / P.hat.bs };
    if (pk) hatPose.pos.copy(P.hat.mid).addScaledVector(V(0, 1, 0).applyQuaternion(P.hat.q), pk.userData.h * 0.4 / P.hat.bs);
    // 성격별 모양: 코드 모자, 또는 KayKit 모자를 모자 자리 틀 안으로 (외곽선을 만들기 전에 옮겨야 외곽선도 같이 날아간다)
    let styled = null;
    if (st.hat && st.hat !== 'game' && HAT_STYLES.has(st.hat) && st.hat !== 'none') styled = hatStyle(st.hat, ch);
    let frame = null;
    if (kHat) {
      frame = new THREE.Group(); frame.position.copy(hatPose.pos); frame.quaternion.copy(hatPose.q); frame.scale.setScalar(hatPose.s); head.add(frame);
      styled = new THREE.Group(); frame.add(styled); m.updateMatrixWorld(true); styled.attach(kHat);
    }
    for (const e of ext) toonProp(e, 0.014);
    const tex = bodyTex(key, ch);
    toonify(m, null, (old) => (old.map ? tex : null), 0.014);
    if (frame) { frame.remove(styled); head.remove(frame); }
    // 혹이 붙는 자리: 게임 머리(반지름 0.17)와 같은 크기의 빈 그룹을 모델 머리 가운데에 (view.js addBump)
    const bumpHead = new THREE.Group(); bumpHead.position.copy(P.hat.mid); bumpHead.quaternion.copy(P.hat.q); bumpHead.scale.setScalar(P.hat.halfW / 0.17 / P.hat.bs); head.add(bumpHead);
    const o = { holder, m, mixer, acts, key, st, s, hat, hatHome, hatPose, styled, hideHat: st.hat === 'none', bumpHead,
      b: { ua: { r: B('upperarm.r'), l: B('upperarm.l') }, la: { r: B('lowerarm.r'), l: B('lowerarm.l') }, wr: { r: B('wrist.r'), l: B('wrist.l') },
        ul: { r: B('upperleg.r'), l: B('upperleg.l') }, ll: { r: B('lowerleg.r'), l: B('lowerleg.l') }, ft: { r: B('foot.r'), l: B('foot.l') }, head, hips: B('hips'), spine: B('spine'), chest: B('chest') } };
    setOn(o, true);
    return o;
  }
  // 진짜 모델 켜기/끄기: 모자를 모델 머리 ↔ 도형 머리로 옮기고, 도형 몸·팔다리를 숨기거나 보인다
  function setOn(o, on) {
    if (o.on === on) return;
    o.on = on;
    const { hat, s } = o;
    o.holder.visible = on;
    if (on) {
      o.b.head.add(hat); hat.position.copy(o.hatPose.pos); hat.quaternion.copy(o.hatPose.q); hat.scale.setScalar(o.hatPose.s);
      if (o.styled || o.hideHat) for (const [c] of o.hatHome.kids) c.visible = false;
      if (o.styled) hat.add(o.styled);
      s.rigHead = o.bumpHead;
    } else {
      o.hatHome.parent.add(hat); hat.position.copy(o.hatHome.pos); hat.quaternion.copy(o.hatHome.q); hat.scale.copy(o.hatHome.s);
      for (const [c, v] of o.hatHome.kids) c.visible = v;
      if (o.styled) hat.remove(o.styled);
      s.rigHead = null;
      s.limbs.group.visible = true;
      for (const c of s.w.root.children) if (c !== o.holder) c.visible = true;
    }
    hat.visible = s.hatOn !== false;
    s.flashMeshes = null;   // 번쩍임 대상 다시 모으기
  }

  // ---------- 매 프레임 ----------
  const _s0 = V(), _el = V(), _pole = V(), _hipW = V(), _kp = V(), _tg = V();
  // 말 하나: 걸음 박자(시뮬 gait)를 동작 시각으로 → 멈추고 찍어도·다시 보기에서도 같은 자세
  function updateHorse(o, speed, gait, fear, fpMine, now) {
    o.hv.scaled.visible = false; o.wrap.visible = true;
    const name = speed < 0.3 ? 'Idle' : speed < 5 ? 'Walk' : 'Gallop';
    const dur = H.clips[name].duration, ph = name === 'Idle' ? (now * 0.3) % 1 : (((gait || 0) % 1) + 1) % 1;
    setAct(o, name, ph * dur);
    // 목을 조금 세운다: 1인칭에서 말 머리·귀가 앞에 보이게. 1인칭 내 말은 더 세운다 · 짐말은 고개를 떨군다
    for (const nb of o.neck) if (nb) addRot(nb, TUNE.neckUp - (o.B.headLow || 0) / 2 + (fpMine ? TUNE.neckUpFp : 0), 0);
    const ear = fear > 55 ? TUNE.earBack : o.B.earDroop ? TUNE.earDroop : null;   // 겁먹으면 귀를 뒤로 눕힌다
    if (ear) { addRot(o.ears[0], ear[0], ear[1]); addRot(o.ears[1], ear[0], -ear[1]); }
  }
  // 기수 하나: st = 상태, horseQ = 탄 말 방향(말 위일 때), hideHead = 1인칭 내 머리
  function updateRider(o, st, horseQ, hideHead) {
    const s = o.s, S = o.st, wd = S.wide || 1;
    if (!o.on) setOn(o, true);
    s.limbs.group.visible = false;
    for (const c of s.w.root.children) if (c !== o.holder) c.visible = false;
    setAct(o, 'Sit_Chair_Pose', 0);
    // 성격별 체형·자세: 몸통 폭(믹서가 크기도 쓰므로 매 프레임), 앞으로 숙임, 등 굽힘
    if (S.wide) o.b.spine.scale.set(wd, 1, wd);
    if (S.lean || S.hunch) addRot(o.b.spine, (S.lean || 0) + (S.hunch || 0) * 0.4, 0);
    if (S.hunch) addRot(o.b.chest, S.hunch * 0.6, 0);
    o.m.updateMatrixWorld(true);
    const q = s.w.root.quaternion, L = s.limbs;
    // 팔: 도형 손 자리로, 팔꿈치는 도형 팔꿈치 쪽 (지팡이 손잡이 · 고삐 · 잡기 · 래그돌 모두)
    segEnds(L.R.upper, _s0, _el); ikChain(o.b.ua.r, o.b.la.r, o.b.wr.r, L.R.hand.position, _pole.subVectors(_el, _s0));
    if (S.armOut && st === 'mounted') {   // 허수아비: 말 위에서는 왼팔을 옆으로 쭉
      const sh = o.b.ua.l.getWorldPosition(V()), reach = sh.distanceTo(o.b.la.l.getWorldPosition(_v3)) + _v3.distanceTo(o.b.wr.l.getWorldPosition(_v4));
      ikChain(o.b.ua.l, o.b.la.l, o.b.wr.l, _tg.copy(sh).add(V(1, 0.08, 0.05).normalize().applyQuaternion(q).multiplyScalar(reach * 0.97)), _pole.set(0, -1, 0).applyQuaternion(q));
    } else { segEnds(L.L.upper, _s0, _el); ikChain(o.b.ua.l, o.b.la.l, o.b.wr.l, L.L.hand.position, _pole.subVectors(_el, _s0)); }
    // 다리: KayKit 다리는 짧아서 넓적다리를 늘린다
    for (const [sd, sg, leg] of [['l', 1, L.legL], ['r', -1, L.legR]]) {
      const ul = o.b.ul[sd], ll = o.b.ll[sd], ft = o.b.ft[sd];
      ul.scale.setScalar(TUNE.legScale); ul.updateMatrixWorld(true);
      if (st === 'mounted' && horseQ) {   // 말 위: 허벅지는 말 등을 감싸 바깥·앞으로, 정강이는 옆구리를 따라 아래로
        const hip = ul.getWorldPosition(_hipW), kp0 = ll.getWorldPosition(_kp), lt = hip.distanceTo(kp0), ls = kp0.distanceTo(ft.getWorldPosition(_v3));
        aimBone(ul, ll, _tg.copy(hip).add(V(sg * 0.85, -0.4, 0.45).normalize().applyQuaternion(horseQ).multiplyScalar(lt)));
        const kp = ll.getWorldPosition(_kp);
        aimBone(ll, ft, _tg.copy(kp).add(V(sg * 0.15, -1, -0.12).normalize().applyQuaternion(horseQ).multiplyScalar(ls)));
      } else {   // 걷기·낙마·래그돌: 도형 발 자리로, 무릎은 도형 무릎 쪽
        segEnds(leg.upper, _s0, _el);
        ikChain(ul, ll, ft, leg.foot.position, _pole.subVectors(_el, _s0));
      }
    }
    // 머리 젖힘 용수철 + 성격별 고개 + 1인칭이면 내 머리(모자 포함)는 숨긴다
    const hr = s.w.head.rotation;
    addRot(o.b.head, hr.x - (S.hunch || 0) * 0.5 - (S.lean || 0) * 0.6, hr.z + (S.tilt || 0));
    if (hideHead) o.b.head.scale.setScalar(0.001); else o.b.head.scale.set(TUNE.headScale / wd, TUNE.headScale, TUNE.headScale / wd);
  }

  // 시합장 소품(match.js PROP_SETS): 통·상자·과녁은 KayKit 모델로, 건초·무기 걸이는 도형 그대로. 물리 원점: 통·상자 = 가운데, 과녁 = 받침 바닥
  const PROP_LOOK = { barrel: ['barrel', 0.92, false, 0], crate: ['crate_A_big', 0.74, false, 0], target: ['target', 1.75, true, Math.PI] };   // 무기 걸이는 지팡이가 걸린 코드 모양이 더 잘 읽혀서 그대로 둔다   // 과녁 판이 가운데를 보게
  function propOn(pg, on) {
    const L = PROP_LOOK[pg.userData.kind]; if (!L || !assets.map[L[0]]) return;
    if (on && !pg.userData.rigObj) {
      const g = fitPivot(assets.map[L[0]].clone(true), L[1], L[2]); g.rotation.y = L[3]; pg.add(g); toonProp(g, 0.02); pg.userData.rigObj = g;
    }
    const o = pg.userData.rigObj; if (!o) return;
    o.visible = on;
    for (const c of pg.children) if (c !== o) c.visible = !on;
  }
  const rig = {
    stats, map: assets.map, props: PROPS,
    // vis(view.js buildVisuals) 에 모델을 붙인다. match = 같은 시합 (말 주인 색, 기수 성격)
    attach(vis, match) {
      if (vis.rig) return vis.rig;
      vis.rig = {
        horses: vis.horses.map((hs, k) => { const fk = match.fighters[match.horses[k].k]; return attachHorse({ hv: hs.hv, cloth: fk.ch.color, char: fk.char }); }),
        mages: vis.fighters.map((s, i) => { const f = match.fighters[i]; return attachMage(s, { char: f.char, ch: f.ch, loadout: f.loadout }); }),
      };
      vis.rig.propsOn = false;
      return vis.rig;
    },
    // renderFrames 끝에서 부른다. B = 이번 프레임, ctx = { player, view, replay }
    update(vis, B, ctx) {
      const R = vis.rig; if (!R) return;
      if (!R.propsOn) { for (const pg of vis.props) propOn(pg, true); R.propsOn = true; }
      const now = performance.now() / 1000, fp = ctx.view === 'fp' && !ctx.replay;
      const myHorse = ctx.player >= 0 && B.fighters[ctx.player] ? B.fighters[ctx.player].horse : -1;
      B.horses.forEach((hb, k) => updateHorse(R.horses[k], hb.speed, hb.gait, hb.fear, fp && k === myHorse, now));
      B.fighters.forEach((fb, i) => {
        const hq = fb.state === 'mounted' && fb.horse >= 0 ? vis.horses[fb.horse].Q : null;
        updateRider(R.mages[i], fb.state, hq, fp && i === ctx.player);
      });
    },
    // 「캐릭터 모델: 도형」으로 바꾸면 도형으로 되돌린다
    off(vis) {
      const R = vis && vis.rig; if (!R) return;
      for (const o of R.mages) setOn(o, false);
      for (const o of R.horses) { o.wrap.visible = false; o.hv.scaled.visible = true; }
      for (const pg of vis.props) propOn(pg, false); R.propsOn = false;
    },
    // 마구간 화면: main.js 의 display({ hv, w, limbs }) 에 붙인다
    attachDisplay(d, loadout) {
      d.rig = { horse: attachHorse({ hv: d.hv, cloth: CHARS.maji.color, char: 'maji' }), mage: attachMage({ w: d.w, limbs: d.limbs, hatOn: true }, { char: 'maji', ch: CHARS.maji, loadout }) };
    },
    updateDisplay(d) {
      if (!d.rig) return;
      updateHorse(d.rig.horse, 0, 0, 0, false, performance.now() / 1000);
      d.hv.root.updateMatrixWorld(true);
      updateRider(d.rig.mage, 'mounted', d.hv.root.getWorldQuaternion(new THREE.Quaternion()), false);
    },
    offDisplay(d) {
      if (!d || !d.rig) return;
      setOn(d.rig.mage, false); d.rig.horse.wrap.visible = false; d.hv.scaled.visible = true;
    },
  };
  return rig;
}
