// 효과: 먼지, 불꽃, 별, 주문 꼬리, 폭발 고리, 글자 팝 ("퍽!" "팅!")
import * as THREE from 'three';
import { glowTexture } from './models.js';

function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.translate(32, 32); g.fillStyle = '#fff'; g.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 28, a = i * Math.PI / 5 - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  g.closePath(); g.fill(); g.lineWidth = 4; g.strokeStyle = 'rgba(60,30,0,0.7)'; g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function textTexture(text, color) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  g.font = '900 78px "Black Han Sans", "Malgun Gothic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 14; g.strokeStyle = '#2a1608'; g.strokeText(text, 128, 66); g.fillStyle = color; g.fillText(text, 128, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createFx(scene) {
  const tex = { glow: glowTexture(), star: starTexture(), puff: puffTexture() };
  const pool = [], live = [];
  const MAX = 420;
  function get(kind) {
    let s = pool.pop();
    if (!s) { s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false })); scene.add(s); }
    const add = kind === 'glow' || kind === 'spark';
    s.material.map = kind === 'star' ? tex.star : kind === 'puff' ? tex.puff : tex.glow;
    s.material.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending;
    s.material.rotation = 0; s.material.needsUpdate = true; s.visible = true; s.renderOrder = add ? 6 : 4;
    return s;
  }
  function emit(kind, pos, o = {}) {
    if (live.length >= MAX) return;
    const s = get(kind);
    s.position.set(pos.x, pos.y, pos.z);
    s.material.color.set(o.color ?? 0xffffff);
    const p = { s, vel: new THREE.Vector3(o.vx || 0, o.vy || 0, o.vz || 0), life: 0, max: o.life || 0.6, s0: o.s0 ?? 0.3, s1: o.s1 ?? 0.6,
      a0: o.a0 ?? 1, g: o.g ?? 0, drag: o.drag ?? 1.5, spin: o.spin || 0 };
    s.scale.setScalar(p.s0); s.material.opacity = p.a0;
    live.push(p);
    return p;
  }
  const rand = (a, b) => a + Math.random() * (b - a);

  // 주문 투사체
  const spells = new Map();
  function spellVisual(id, color, r) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    core.scale.setScalar(r * 0.7); g.add(core);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    halo.scale.setScalar(r * 5); halo.renderOrder = 6; g.add(halo);
    scene.add(g);   // 점광원은 쓰지 않는다: 빛 개수가 바뀌면 모든 재질이 다시 컴파일되어 끊긴다
    const v = { g, core, halo, color: new THREE.Color(color), r, trailT: 0 };
    spells.set(id, v); return v;
  }

  // 폭발 고리
  const rings = [];
  const ringGeo = new THREE.RingGeometry(0.8, 1, 48);
  function ring(pos, color, r, life = 0.45, flat = true) {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(pos.x, pos.y, pos.z); if (flat) m.rotation.x = -Math.PI / 2;
    scene.add(m); rings.push({ m, life: 0, max: life, r, face: !flat });
  }
  // 글자 팝
  const texts = [], textCache = new Map();
  function pop(text, pos, color = '#ffe14d', size = 1.4) {
    const key = text + color;
    if (!textCache.has(key)) textCache.set(key, textTexture(text, color));
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: textCache.get(key), transparent: true, depthWrite: false, depthTest: false }));
    s.position.set(pos.x, pos.y + 0.6, pos.z); s.scale.set(size, size / 2, 1); s.renderOrder = 10;
    scene.add(s); texts.push({ s, life: 0, max: 0.9, size });
  }
  // 날아가는 모자
  const flying = [];
  function fling(obj, pos, vel) {
    obj.position.copy(pos); scene.add(obj);
    flying.push({ obj, vel: vel.clone(), spin: new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), life: 0 });
  }

  return {
    dust(pos, n = 4, color = 0xd9b67c, spread = 0.6) {
      for (let i = 0; i < n; i++) emit('puff', { x: pos.x + rand(-spread, spread) * 0.5, y: pos.y + 0.1, z: pos.z + rand(-spread, spread) * 0.5 },
        { color, vx: rand(-1, 1), vy: rand(0.4, 1.4), vz: rand(-1, 1), life: rand(0.5, 0.9), s0: 0.4, s1: 1.4 + spread, a0: 0.55, drag: 2 });
    },
    sparks(pos, color = 0xffd27a, n = 12, speed = 6, sc = 1) {
      for (let i = 0; i < n; i++) {
        const d = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(speed * 0.4, speed));
        emit('spark', pos, { color, vx: d.x, vy: d.y, vz: d.z, life: rand(0.25, 0.5), s0: 0.22 * sc, s1: 0.04 * sc, g: -9, drag: 1 });
      }
    },
    stars(pos, n = 6, color = 0xffe14d, sc = 1) {
      for (let i = 0; i < n; i++) emit('star', pos, { color, vx: rand(-3, 3) * sc, vy: rand(2, 5) * Math.sqrt(sc), vz: rand(-3, 3) * sc, life: rand(0.6, 0.9), s0: 0.35 * sc, s1: 0.15 * sc, g: -8, drag: 0.6, spin: rand(-8, 8) });
    },
    // 타격 순간: 흰 번쩍 + 카메라를 보는 고리 + 불꽃 (멀수록 크게 그려서 화면에서 잘 보이게)
    burst(pos, color, sc = 1, big = false) {
      emit('glow', pos, { color: 0xffffff, s0: 0.9 * sc, s1: 1.6 * sc, life: 0.14, a0: 1, drag: 0 });
      emit('glow', pos, { color, s0: 1.2 * sc, s1: (big ? 3.2 : 2.2) * sc, life: 0.3, a0: 0.9, drag: 0 });
      ring(pos, color, (big ? 1.6 : 1.0) * sc, 0.32, false);
      this.sparks(pos, color, big ? 20 : 12, big ? 9 : 6, sc);
    },
    flash(pos, color, size, life = 0.25) { emit('glow', pos, { color, s0: size, s1: size * 1.6, life, a0: 1, drag: 0 }); },
    explosion(pos, color, r) {
      this.flash(pos, 0xffffff, r * 2.2, 0.18); this.flash(pos, color, r * 3.2, 0.4);
      ring({ x: pos.x, y: Math.max(0.05, pos.y), z: pos.z }, color, r * 1.15, 0.5, false);
      ring({ x: pos.x, y: 0.06, z: pos.z }, color, r * 1.4, 0.6, true);
      this.sparks(pos, color, 22, 9 + r * 2);
      this.dust({ x: pos.x, y: 0, z: pos.z }, 8, 0xe8d2a8, r);
    },
    pop,
    fling,
    spellStart(id, color, r) { return spellVisual(id, color, r); },
    spellMove(id, pos, dt, color, r) {
      const v = spells.get(id) || spellVisual(id, color, r);
      v.g.position.set(pos.x, pos.y, pos.z);
      if (v.color.getHex() !== new THREE.Color(color).getHex()) { v.color.set(color); v.halo.material.color.set(color); }
      v.core.rotation.x += dt * 9; v.core.rotation.y += dt * 7;
      v.trailT -= dt;
      if (v.trailT <= 0) { v.trailT = 0.016; emit('glow', pos, { color, s0: v.r * 3.2, s1: v.r * 0.6, life: 0.32, a0: 0.8, drag: 0 }); }
    },
    spellEnd(id) { const v = spells.get(id); if (v) { scene.remove(v.g); v.core.geometry.dispose(); v.core.material.dispose(); v.halo.material.dispose(); spells.delete(id); } },
    spellIds() { return [...spells.keys()]; },
    update(dt, camPos) {
      for (let i = live.length - 1; i >= 0; i--) {
        const p = live[i]; p.life += dt;
        const k = p.life / p.max;
        if (k >= 1) { p.s.visible = false; pool.push(p.s); live.splice(i, 1); continue; }
        p.vel.y += p.g * dt; p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
        p.s.position.addScaledVector(p.vel, dt);
        const size = p.s0 + (p.s1 - p.s0) * k;
        p.s.scale.setScalar(size);
        let op = p.a0 * (1 - k * k);
        // 카메라 바로 앞의 빛은 흐리게 (눈앞 폭발이 화면 전체를 덮지 않게)
        if (camPos && p.s.material.blending === THREE.AdditiveBlending) { const dd = p.s.position.distanceTo(camPos); if (dd < size * 1.2) op *= Math.pow(Math.max(0.03, dd / (size * 1.2)), 1.5); }
        p.s.material.opacity = op;
        if (p.spin) p.s.material.rotation += p.spin * dt;
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const r = rings[i]; r.life += dt; const k = r.life / r.max;
        if (k >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; }
        const rs = 0.2 + r.r * Math.sqrt(k);
        r.m.scale.setScalar(rs);
        let op = 0.9 * (1 - k);
        if (camPos) { const dd = r.m.position.distanceTo(camPos); if (dd < rs * 3) op *= Math.pow(Math.max(0, dd / (rs * 3)), 2); }
        r.m.material.opacity = op;
        if (camPos && r.face) r.m.lookAt(camPos);
      }
      for (let i = texts.length - 1; i >= 0; i--) {
        const t = texts[i]; t.life += dt; const k = t.life / t.max;
        if (k >= 1) { scene.remove(t.s); t.s.material.dispose(); texts.splice(i, 1); continue; }
        t.s.position.y += dt * 0.9; const s = t.size * (k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - (k - 0.15) * 0.3);
        t.s.scale.set(s, s / 2, 1); t.s.material.opacity = k > 0.7 ? (1 - k) / 0.3 : 1;
      }
      for (let i = flying.length - 1; i >= 0; i--) {
        const f = flying[i]; f.life += dt;
        f.vel.y -= 9.8 * dt; f.obj.position.addScaledVector(f.vel, dt);
        if (f.obj.position.y < 0.05) { f.obj.position.y = 0.05; f.vel.set(f.vel.x * 0.5, Math.abs(f.vel.y) * 0.25, f.vel.z * 0.5); f.spin.multiplyScalar(0.5); }
        f.obj.rotation.x += f.spin.x * dt; f.obj.rotation.y += f.spin.y * dt; f.obj.rotation.z += f.spin.z * dt;
        if (f.life > 12) { scene.remove(f.obj); flying.splice(i, 1); }
      }
    },
    clear() {
      for (const id of [...spells.keys()]) this.spellEnd(id);
      for (const p of live) { p.s.visible = false; pool.push(p.s); } live.length = 0;
      for (const r of rings) scene.remove(r.m); rings.length = 0;
      for (const t of texts) scene.remove(t.s); texts.length = 0;
      for (const f of flying) scene.remove(f.obj); flying.length = 0;
    },
  };
}
