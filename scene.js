// 봄 마상 시합장: 하늘, 언덕, 관중석, 깃발, 조여 오는 울타리
import * as THREE from 'three';
import { CFG } from './config.js';
import { toon, part, glowSprite } from './models.js';

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; if (repeat) t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}
function rnd(seed) { let s = seed; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }

export function buildArena(scene, renderer, quality) {
  const R = rnd(4242);
  // 하늘
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { top: { value: new THREE.Color(0x5aa8ec) }, mid: { value: new THREE.Color(0xbfe3ff) }, bot: { value: new THREE.Color(0xf6ecd2) } },
    vertexShader: 'varying vec3 vp; void main(){ vp = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vp; void main(){ float h = vp.y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, bot, smoothstep(0.0, -0.2, h)); gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(450, 24, 12), skyMat); scene.add(sky);
  scene.fog = new THREE.Fog(0xcfe6f5, 120, 420);
  // 빛
  const hemi = new THREE.HemisphereLight(0xdff0ff, 0x8a7a50, 1.15); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  const sunOff = new THREE.Vector3(40, 70, 25);   // 해 방향 (venues.js 가 해 질 녘에 낮춘다)
  sun.position.copy(sunOff); sun.castShadow = true;
  const sm = quality === 'low' ? 1024 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 10; sc.far = 160;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);

  // 땅: 풀 + 시합장 흙
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7fbf4f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) { const r = R(); g.fillStyle = r < 0.5 ? 'rgba(90,150,50,0.5)' : r < 0.85 ? 'rgba(150,205,90,0.45)' : 'rgba(230,240,140,0.5)'; g.fillRect(R() * w, R() * h, 2, 3 + R() * 4); }
  }, 60);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(460, 48), new THREE.MeshToonMaterial({ map: grassTex, gradientMap: toon(0xffffff).gradientMap }));
  const procedural = [];   // 코드로 만든 나무·천막: 진짜 배경(venues.js)을 쓰면 숨긴다
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const dirtTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d9b67c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) { const r = R(); g.fillStyle = r < 0.5 ? 'rgba(180,140,90,0.45)' : 'rgba(240,215,160,0.5)'; const s = 1 + R() * 3; g.fillRect(R() * w, R() * h, s, s); }
    for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(150,110,70,0.25)'; g.lineWidth = 2; g.beginPath(); const x = R() * w, y = R() * h; g.arc(x, y, 8 + R() * 30, 0, Math.PI * (0.3 + R())); g.stroke(); }
  }, 14);
  const dirt = new THREE.Mesh(new THREE.CircleGeometry(CFG.arena.r0 + 3, 64), new THREE.MeshToonMaterial({ map: dirtTex, gradientMap: toon(0xffffff).gradientMap }));
  dirt.rotation.x = -Math.PI / 2; dirt.position.y = 0.01; dirt.receiveShadow = true; scene.add(dirt);
  // 최종 울타리 자리 표시 (점선 원)
  const ring = new THREE.Mesh(new THREE.RingGeometry(CFG.arena.rMin - 0.15, CFG.arena.rMin + 0.15, 96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; scene.add(ring);
  const centerMark = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.6, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
  centerMark.rotation.x = -Math.PI / 2; centerMark.position.y = 0.025; scene.add(centerMark);

  // 관중석 3개 + 관중 (인스턴싱)
  const crowdBodies = [], standGroup = new THREE.Group(); scene.add(standGroup);
  const wood = 0xa8764a, woodD = 0x7d5533;
  const shirt = [0xe8483b, 0x3d7bff, 0x3cbf6a, 0xf2c230, 0xa060f0, 0xffffff, 0xff8a3d, 0x5bd0d9];
  const stands = [[Math.PI * 0.15, 1.0], [Math.PI * 0.85, 1.0], [Math.PI * 1.5, 1.3]];
  for (const [ang, wid] of stands) {
    const st = new THREE.Group(); st.position.set(Math.sin(ang) * 54, 0, Math.cos(ang) * 54); st.rotation.y = ang + Math.PI; standGroup.add(st);
    const W = 26 * wid;
    for (let r = 0; r < 5; r++) {
      part(new THREE.BoxGeometry(W, 0.5 + r * 0.9, 1.6), r % 2 ? wood : woodD, st, { pos: [0, (0.5 + r * 0.9) / 2, -r * 1.6], outline: 0.03 });
      for (let k = 0; k < W / 1.1; k++) if (R() < 0.82) crowdBodies.push({ st, x: -W / 2 + 0.6 + k * 1.1 + (R() - 0.5) * 0.3, y: 0.5 + r * 0.9, z: -r * 1.6 + 0.1, c: shirt[Math.floor(R() * shirt.length)], ph: R() * 6 });
    }
    // 차양 + 깃발
    part(new THREE.BoxGeometry(W + 1, 0.15, 9.5), 0xf2ece0, st, { pos: [0, 6.6, -3.6], rot: [-0.08, 0, 0], outline: 0.03 });
    for (let k = 0; k < 5; k++) part(new THREE.CylinderGeometry(0.12, 0.12, 6.6), woodD, st, { pos: [-W / 2 + k * W / 4, 3.3, -7.8], outline: 0.02 });
  }
  const nC = crowdBodies.length;
  const bodyGeo = new THREE.CapsuleGeometry(0.28, 0.45, 3, 8), headGeo = new THREE.SphereGeometry(0.22, 10, 8);
  const crowdB = new THREE.InstancedMesh(bodyGeo, toon(0xffffff), nC), crowdH = new THREE.InstancedMesh(headGeo, toon(0xf0c8a0), nC);
  crowdB.castShadow = false; crowdH.castShadow = false;
  const skins = [0xf2c9a0, 0xe0b088, 0xc68e62, 0xf5d6b8];
  crowdBodies.forEach((p, i) => { crowdB.setColorAt(i, new THREE.Color(p.c)); crowdH.setColorAt(i, new THREE.Color(skins[i % 4])); });
  scene.add(crowdB); scene.add(crowdH);
  const _m = new THREE.Matrix4(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
  standGroup.updateMatrixWorld(true);
  let cheer = 0;
  function updateCrowd(t) {
    crowdBodies.forEach((p, i) => {
      const jump = Math.max(0, Math.sin(t * (6 + (i % 5)) + p.ph)) * (0.05 + cheer * 0.35);
      _v.set(p.x, p.y + 0.55 + jump, p.z); p.st.localToWorld(_v);
      _m.compose(_v, _q, _s); crowdB.setMatrixAt(i, _m);
      _v.set(p.x, p.y + 1.15 + jump, p.z); p.st.localToWorld(_v);
      _m.compose(_v, _q, _s); crowdH.setMatrixAt(i, _m);
    });
    crowdB.instanceMatrix.needsUpdate = true; crowdH.instanceMatrix.needsUpdate = true;
  }

  // 깃대와 삼각기
  const flags = [];
  const flagCols = [0xe8483b, 0x3d7bff, 0x3cbf6a, 0xf2c230, 0xa060f0];
  for (let k = 0; k < 14; k++) {
    const a = (k + 0.5) / 14 * Math.PI * 2, r = 47.5;
    const pole = new THREE.Group(); pole.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); scene.add(pole);
    part(new THREE.CylinderGeometry(0.08, 0.1, 8, 6), 0xf2ece0, pole, { pos: [0, 4, 0], outline: 0.02 });
    part(new THREE.SphereGeometry(0.16, 8, 6), 0xf2d16b, pole, { pos: [0, 8.1, 0], outline: 0.01 });
    const fg = new THREE.Group(); fg.position.set(0, 7.4, 0); pole.add(fg);
    const shape = new THREE.Shape(); shape.moveTo(0, 0.6); shape.lineTo(2.2, 0); shape.lineTo(0, -0.6); shape.lineTo(0, 0.6);
    const fl = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshToonMaterial({ color: flagCols[k % 5], side: THREE.DoubleSide, gradientMap: toon(0xffffff).gradientMap }));
    fg.add(fl); flags.push({ fg, ph: k });
  }
  // 천막·나무·언덕·구름
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2 + 0.4, r = 66 + (k % 2) * 6;
    const tent = new THREE.Group(); tent.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); scene.add(tent); procedural.push(tent);
    part(new THREE.CylinderGeometry(2.6, 2.6, 2.4, 12), k % 2 ? 0xffffff : 0xf2d16b, tent, { pos: [0, 1.2, 0], outline: 0.03 });
    part(new THREE.ConeGeometry(3.0, 2.6, 12), flagCols[k % 5], tent, { pos: [0, 3.7, 0], outline: 0.03 });
  }
  for (let k = 0; k < 90; k++) {
    const a = R() * Math.PI * 2, r = 85 + R() * 140, s = 0.8 + R() * 1.6;
    const tr = new THREE.Group(); tr.position.set(Math.sin(a) * r, 0, Math.cos(a) * r); tr.scale.setScalar(s); scene.add(tr); procedural.push(tr);
    part(new THREE.CylinderGeometry(0.25, 0.35, 2, 6), 0x6b4a2a, tr, { pos: [0, 1, 0], outline: 0.03, shadow: false });
    const leaf = R() < 0.3 ? 0xf6c2d8 : R() < 0.5 ? 0x5fa646 : 0x7cc05a;   // 봄: 벚꽃도 섞는다
    part(new THREE.IcosahedronGeometry(1.8, 0), leaf, tr, { pos: [0, 3.2, 0], outline: 0.04, shadow: false });
  }
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2 + R() * 0.3, r = 260 + R() * 60;
    const hill = new THREE.Mesh(new THREE.SphereGeometry(60 + R() * 50, 16, 8), toon(R() < 0.5 ? 0x8cc46a : 0x79b45c));
    hill.position.set(Math.sin(a) * r, -30, Math.cos(a) * r); hill.scale.y = 0.55; scene.add(hill);
  }
  const clouds = [];
  for (let k = 0; k < 14; k++) {
    const c = new THREE.Group(), a = R() * Math.PI * 2, r = 150 + R() * 150;
    c.position.set(Math.sin(a) * r, 70 + R() * 40, Math.cos(a) * r);
    for (let j = 0; j < 5; j++) { const s = new THREE.Mesh(new THREE.SphereGeometry(7 + R() * 7, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })); s.position.set((j - 2) * 8, R() * 4, R() * 6); c.add(s); }
    scene.add(c); clouds.push(c);
  }

  // 울타리 (조여 온다)
  const N = CFG.arena.fenceSegs, fence = [];
  const railGeo = new THREE.BoxGeometry(1, 0.14, 0.12), postGeo = new THREE.CylinderGeometry(0.1, 0.12, 1.6, 6);
  const railMat = toon(0xc98f55), postMat = toon(0x8a5a32);
  const buntCols = [0xe8483b, 0xf2c230, 0x3d7bff, 0x3cbf6a];
  const buntGeo = new THREE.ConeGeometry(0.16, 0.34, 3);
  for (let s = 0; s < N; s++) {
    const g = new THREE.Group(); scene.add(g);
    const r1 = new THREE.Mesh(railGeo, railMat), r2 = new THREE.Mesh(railGeo, railMat);
    r1.position.y = 1.35; r2.position.y = 0.7; r1.castShadow = r2.castShadow = true;
    const post = new THREE.Mesh(postGeo, postMat); post.position.y = 0.8; post.castShadow = true;
    g.add(r1, r2, post);
    const bunts = [];
    for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(buntGeo, toon(buntCols[(s + k) % 4])); b.rotation.x = Math.PI; b.position.y = 1.18; g.add(b); bunts.push(b); }
    fence.push({ g, r1, r2, post, bunts, th: (s + 0.5) * 2 * Math.PI / N });
  }
  function setFence(r) {
    const segLen = 2 * Math.PI * r / N;
    for (const f of fence) {
      f.g.position.set(Math.sin(f.th) * r, 0, Math.cos(f.th) * r); f.g.rotation.y = f.th;
      f.r1.scale.x = f.r2.scale.x = segLen + 0.05;
      f.post.position.x = segLen / 2;
      f.bunts.forEach((b, k) => { b.position.x = (k - 1) * segLen / 3; });
    }
  }
  setFence(CFG.arena.r0);

  return {
    sun, sunOff, hemi, sky: skyMat, ground, dirt, procedural, clouds,   // venues.js 가 하늘·빛·땅 색을 바꾸고 나무·천막을 숨긴다
    setFence,
    setCheer(v) { cheer = Math.max(cheer, v); },
    update(t, dt, focus) {
      cheer = Math.max(0, cheer - dt * 0.35);
      updateCrowd(t);
      for (const f of flags) { f.fg.rotation.y = Math.sin(t * 1.7 + f.ph) * 0.35 + 0.6; f.fg.children[0].rotation.x = Math.sin(t * 5 + f.ph) * 0.15; }
      for (const c of clouds) c.position.x += dt * 0.6;
      if (focus) {   // 그림자 카메라가 보는 곳을 따라간다
        sun.position.set(focus.x + sunOff.x, sunOff.y, focus.z + sunOff.z); sun.target.position.set(focus.x, 0, focus.z); sun.target.updateMatrixWorld();
      }
    },
  };
}
