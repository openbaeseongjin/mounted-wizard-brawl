// 입력: 키보드 · 마우스(포인터 잠금) · 터치 → 매 프레임 읽는 상태
// Ctrl 조합은 쓰지 않는다 (Chrome이 Ctrl+W 등을 가로챈다). 숙이기는 Space
import { vp, deltaToGame, toGame } from './viewport.js';

export function createInput(canvas) {
  const keys = new Set(), edges = new Set();
  const st = { lmb: false, rmb: false, dx: 0, dy: 0, locked: false, touch: false, stick: [0, 0], run: false, enabled: false };
  const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'KeyF', 'KeyG', 'KeyH', 'AltLeft', 'AltRight', 'KeyQ', 'KeyC']);
  addEventListener('keydown', (e) => {
    if (!st.enabled) return;
    if (PREVENT.has(e.code)) e.preventDefault();
    if (!keys.has(e.code)) edges.add(e.code);
    keys.add(e.code);
  });
  addEventListener('keyup', (e) => { keys.delete(e.code); });
  addEventListener('blur', () => { keys.clear(); st.lmb = st.rmb = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('contextmenu', (e) => { if (st.enabled) e.preventDefault(); });
  // 손가락으로 누른 직후의 마우스 이벤트는 브라우저가 흉내 낸 것 → 무시 (폰에서 포인터 잠금·헛휘두르기 방지)
  let lastTouch = -1e9;
  const touched = () => { lastTouch = performance.now(); };
  addEventListener('touchstart', touched, { capture: true, passive: true });
  addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') touched(); }, { capture: true, passive: true });
  const recentTouch = () => performance.now() - lastTouch < 1500;
  canvas.addEventListener('mousedown', (e) => {
    if (!st.enabled || recentTouch()) return;
    if (!st.locked && st.wantLock) { requestLock(); }
    if (e.button === 0) st.lmb = true;
    if (e.button === 2) st.rmb = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) st.lmb = false; if (e.button === 2) st.rmb = false; });
  // 포인터 잠금이 막힌 곳(일부 iframe, ?nolock)에서는 잠금 없이 마우스 이동을 그대로 쓴다
  st.lockFailed = /[?&]nolock/.test(location.search) || !('requestPointerLock' in canvas);
  addEventListener('mousemove', (e) => {
    if (!st.enabled) return;
    if (st.locked || st.lockFailed) { st.dx += e.movementX; st.dy += e.movementY; }
  });
  document.addEventListener('pointerlockchange', () => {
    st.locked = document.pointerLockElement === canvas;
    if (st.onLockChange) st.onLockChange(st.locked);
  });
  document.addEventListener('pointerlockerror', () => { st.lockFailed = true; });
  function requestLock() {
    if (/[?&]nolock/.test(location.search)) return;
    // 폰·태블릿: 잠그면 손가락 입력이 먹통이 되고 "커서를 표시하려면…" 안내가 뜬다
    if (recentTouch() || !matchMedia('(any-pointer: fine)').matches) return;
    const fail = () => { st.lockFailed = true; };
    try {
      const p = canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { const p2 = canvas.requestPointerLock(); if (p2 && p2.catch) p2.catch(fail); } catch (e) { fail(); } });
    } catch (e) { try { canvas.requestPointerLock(); } catch (e2) { fail(); } }
  }

  // ---------- 터치 ----------
  const touchRoot = document.getElementById('touch');
  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  st.touch = isTouch;
  const tbtn = {};
  if (isTouch) {
    const stick = document.getElementById('stick'), knob = stick.querySelector('i');
    let sid = null, sx = 0, sy = 0, R = 55;   // R: 스틱 크기(화면 방향마다 다름)에 맞춘 최대 반경
    stick.addEventListener('pointerdown', (e) => { sid = e.pointerId; const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2; R = r.width * 0.42; stick.setPointerCapture(sid); move(e); });
    const move = (e) => { if (e.pointerId !== sid) return; let [x, y] = deltaToGame(e.clientX - sx, e.clientY - sy); const l = Math.hypot(x, y); if (l > R) { x *= R / l; y *= R / l; } knob.style.transform = `translate(${x}px,${y}px)`; st.stick = [x / R, -y / R]; };
    stick.addEventListener('pointermove', move);
    const up = (e) => { if (e.pointerId !== sid) return; sid = null; st.stick = [0, 0]; knob.style.transform = ''; };
    stick.addEventListener('pointerup', up); stick.addEventListener('pointercancel', up);
    // 오른쪽 화면 드래그 = 보기 (휘두르기 버튼을 누르고 있으면 손)
    let lid = null, lx = 0, ly = 0;
    canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch' || !st.enabled) return; if (toGame(e.clientX, e.clientY)[0] < vp.w * 0.35) return; lid = e.pointerId; lx = e.clientX; ly = e.clientY; });
    canvas.addEventListener('pointermove', (e) => { if (e.pointerId !== lid) return; const [gx, gy] = deltaToGame(e.clientX - lx, e.clientY - ly); st.dx += gx * 2.2; st.dy += gy * 2.2; lx = e.clientX; ly = e.clientY; });
    const lup = (e) => { if (e.pointerId === lid) lid = null; };
    canvas.addEventListener('pointerup', lup); canvas.addEventListener('pointercancel', lup);
    const hold = (id, on, off) => {
      const el = document.getElementById(id); tbtn[id] = el;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('on'); on(); });
      const rel = () => { el.classList.remove('on'); off && off(); };
      el.addEventListener('pointerup', rel); el.addEventListener('pointercancel', rel); el.addEventListener('pointerleave', rel);
    };
    hold('tbCast', () => { st.rmb = true; }, () => { st.rmb = false; });
    hold('tbSwing', () => { st.lmb = true; }, () => { st.lmb = false; });
    hold('tbDuck', () => { keys.add('Space'); edges.add('Space'); }, () => keys.delete('Space'));
    hold('tbThrust', () => keys.add('KeyC'), () => keys.delete('KeyC'));
    hold('tbGrab', () => { keys.add('KeyQ'); }, () => keys.delete('KeyQ'));
    hold('tbRun', () => { st.run = !st.run; tbtn.tbRun.classList.toggle('on', st.run); }, () => tbtn.tbRun.classList.toggle('on', st.run));
    hold('tbMount', () => edges.add('KeyE'));
    hold('tbView', () => edges.add('KeyV'));
    hold('tbLock', () => edges.add('KeyZ'));
    hold('tbPause', () => edges.add('Escape'));
  }

  return {
    st, keys,
    held: (c) => keys.has(c),
    pressed(c) { if (edges.has(c)) { edges.delete(c); return true; } return false; },
    clearEdges() { edges.clear(); },
    takeMouse() { const d = [st.dx, st.dy]; st.dx = 0; st.dy = 0; return d; },
    requestLock, exitLock() { if (document.pointerLockElement) document.exitPointerLock(); },
    showTouch(on) { touchRoot.classList.toggle('hidden', !(on && isTouch)); },
    axes() {   // [좌우, 앞뒤]
      let x = 0, y = 0;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1; if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y += 1; if (keys.has('KeyS') || keys.has('ArrowDown')) y -= 1;
      if (st.stick[0] || st.stick[1]) { x = st.stick[0]; y = st.stick[1]; }
      return [x, y];
    },
  };
}
