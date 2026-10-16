// HUD: 위 피통(정신) + 그 아래 작은 위험 자막, 마력 고리, 충전 고리, 화면 밖 화살표, 맞힘 표시, 피해 숫자, 머리 위 피통, 어지러움, 알림
import * as THREE from 'three';
import { CFG, CHARS } from './config.js';
import { vp, rectToGame } from './viewport.js';

const $ = (id) => document.getElementById(id);
const C_MANA = 2 * Math.PI * 34, C_CHG = 2 * Math.PI * 26;
const J = (w, pair) => { const c = w.charCodeAt(w.length - 1) - 0xac00; const has = c >= 0 && c % 28 !== 0; const [a, b] = pair.split('/'); return w + (has ? a : b); };
// 폰에서는 안내 문구의 키 이름을 화면 버튼 이름으로 바꿔 보여 준다
const TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const TKEY = { E: '타기·줍기', Q: '잡기', C: '찌르기', Space: '숙이기', W: '스틱 ↑', WASD: '스틱', Shift: '질주', V: '시점', Z: '고정', G: '⏸' };
const tk = (h) => !TOUCH ? h : h.replace(/<kbd>([^<]+)<\/kbd>/g, (m, k) => (TKEY[k] ? `<kbd>${TKEY[k]}</kbd>` : m))
  .replace(/우클릭을 누르고 있다가 떼면/g, '마법 버튼을 누르고 있다가 떼면').replace(/좌클릭을 누른 채 마우스를 휘두르면/g, '휘두르기를 누른 채 화면을 끌면')
  .replace(/마우스를 앞으로 밀면/g, '화면을 위로 끌면').replace(/ E로/g, ' 줍기 버튼으로').replace(/다가가서 E/g, '다가가서 타기');

export function createHud() {
  const el = {
    hud: $('hud'), chips: $('chips'), alerts: $('alerts'), timer: $('timer'), feed: $('feed'), toast: $('toast'), center: $('center'),
    gait: document.querySelector('#speedo .gait'), spd: document.querySelector('#speedo .spd'), mana: document.querySelector('#speedo .mana'), fear: document.querySelector('#speedo .fear'),
    manaArc: $('manaArc'), chargeArc: $('chargeArc'), ghost: $('ghost'), arrows: $('arrows'), warn: $('warn'), vignette: $('vignette'), flash: $('flash'),
    lines: $('speedlines'), mountHint: $('mountHint'), legend: $('legend'), cross: $('cross'), hitmark: $('hitmark'), dmgDir: $('dmgDir'), ohb: $('ohb'), dmgNums: $('dmgNums'),
    stamArc: $('stamArc'), modeTag: $('modeTag'), weaponHint: $('weaponHint'), replayTag: $('replayTag'), practice: $('practice'), practiceList: $('practiceList'),
    trialHud: $('trialHud'), trialTag: $('trialTag'), trialTitle: $('trialTitle'), trialGoal: $('trialGoal'), trialTime: $('trialTime'), trialProg: $('trialProg'), trialTip: $('trialTip'),
  };
  const C_STAM = 2 * Math.PI * 44;
  const lctx = el.lines.getContext('2d');
  let toastT = 0, centerT = 0, flashV = 0, chipEls = [], arrowEls = [], ohbEls = [], toastKey = '', alertKey = '', dirV = 0;
  const lastHurt = [], nums = [];
  const v = new THREE.Vector3();

  function setup(m) {
    el.chips.innerHTML = ''; chipEls = []; el.feed.innerHTML = ''; el.arrows.innerHTML = ''; arrowEls = []; el.ohb.innerHTML = ''; ohbEls = []; el.dmgNums.innerHTML = ''; nums.length = 0; lastHurt.length = 0;
    // 나를 맨 앞에
    const order = [...m.fighters].sort((a, b) => (b.isPlayer ? 1 : 0) - (a.isPlayer ? 1 : 0));
    for (const f of order) {
      const d = document.createElement('div'); d.className = 'fchip' + (f.isPlayer ? ' me' : '');
      d.innerHTML = `<i style="background:${f.ch.css}"></i><span class="nm">${f.isPlayer ? '나 (마지)' : f.ch.name}</span><span class="st"></span><div class="hp"><u style="width:100%"></u><b style="width:100%;background:${f.ch.css}"></b><em>100</em></div>`;
      el.chips.appendChild(d); chipEls[f.i] = d;
    }
    for (const f of m.fighters) {
      const a = document.createElement('div'); a.className = 'arw'; a.style.borderBottomColor = f.ch.css; a.style.display = 'none';
      el.arrows.appendChild(a); arrowEls.push(a);
      const o = document.createElement('div'); o.className = 'ohb'; o.style.opacity = 0;
      o.innerHTML = `<div class="obar"><u style="width:100%"></u><b style="width:100%;background:${f.ch.css}"></b></div><small>${f.ch.name}</small>`;
      el.ohb.appendChild(o); ohbEls.push(o); lastHurt.push(-99);
    }
    flashV = 0; dirV = 0; el.flash.style.opacity = 0; el.center.textContent = ''; el.alerts.innerHTML = ''; alertKey = '';
  }
  const hpCol = (hp, css) => (hp < 25 ? '#ff4a3a' : hp < 50 ? '#ffb030' : css);
  const setBar = (root, hp, css) => {
    const w = Math.max(0, Math.min(100, hp)) + '%';
    const b = root.querySelector('b'), u = root.querySelector('u');
    if (b.style.width !== w) { b.style.width = w; u.style.width = w; }
    b.style.background = hpCol(hp, css);
  };
  const fmt = (t) => { t = Math.max(0, t); const s = Math.floor(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const gaitOf = (s) => (s < 0.5 ? '정지' : s < 3.5 ? '걷기' : s < 8.5 ? '속보' : s < 12.5 ? '구보' : '질주');

  function update(m, p, camera, dt, view) {
    // 시계·울타리
    const A = CFG.arena, t = m.t;
    let fence = '';
    if (t < A.shrinkStart) fence = `울타리가 ${fmt(A.shrinkStart - t)} 뒤에 조여 온다`;
    else if (t < A.shrinkEnd) fence = `울타리가 조여 온다! 반지름 ${m.fenceR.toFixed(0)}m`;
    else fence = '울타리 최소 · 공간이 곧 마력';
    if (t > A.timeLimit - 30) fence = `판정까지 ${fmt(A.timeLimit - t)}`;
    if (m.opts.mode === 'practice' || m.opts.mode === 'trial') fence = '';   // 연습장 · 시험: 울타리가 조이지 않는다
    el.timer.firstChild.nodeValue = fmt(t);
    el.timer.querySelector('small').textContent = fence;
    // 피통 (= 정신. 0이면 기절)
    m.fighters.forEach((f, i) => {
      const s = f.rider.state, c = chipEls[i]; if (!c) return;
      const icon = f.surrendered ? '🏳' : s === 'ko' ? '💤' : s === 'mounted' ? '🐴' : s === 'foot' ? '🚶' : s === 'mounting' ? '🐴' : '💫';
      c.querySelector('.st').textContent = icon + (s !== 'ko' && f.rider.conscious < CFG.mind.dizzy ? '💫' : '') + (f.weapon < 0 && s !== 'ko' ? '👊' : '');
      const hp = s === 'ko' ? 0 : f.rider.conscious;
      setBar(c.querySelector('.hp'), hp, f.ch.css);
      c.querySelector('em').textContent = s === 'ko' ? '기절' : Math.ceil(hp);
      c.classList.toggle('out', f.out); c.classList.toggle('low', !f.out && hp < 25);
    });
    // 속도·마력·공포
    const E = f2(p.mana), Ef = Math.min(1, p.mana / CFG.spell.eRef);
    if (p.horse >= 0) {
      const h = m.horses[p.horse];
      el.gait.textContent = gaitOf(h.speed); el.spd.textContent = h.speed.toFixed(1) + ' m/s';
      const fr = h.fear;
      el.fear.textContent = `${h.def.name} ${fr > 70 ? '😱 겁먹음' : fr > 40 ? '😟 불안' : '😌 침착'} · ${h.winded ? '숨참! 질주 불가' : '숨 ' + Math.round(h.stam) + '%'}`;
      el.fear.style.color = h.winded || fr > 70 ? '#ff7a6a' : fr > 40 || h.stam < 35 ? '#ffd34d' : '#bff2c4';
    } else {
      el.gait.textContent = p.rider.state === 'ko' ? '기절' : p.rider.state === 'foot' ? '도보' : '낙마!';
      const vv = p.rider.body.linvel(); el.spd.textContent = Math.hypot(vv.x, vv.z).toFixed(1) + ' m/s';
      el.fear.textContent = '말이 없으면 마력도 없다'; el.fear.style.color = '#ffd34d';
    }
    el.mana.textContent = '마력 ' + E;
    el.manaArc.setAttribute('stroke-dasharray', `${(Ef * C_MANA).toFixed(1)} 999`);
    el.manaArc.setAttribute('stroke', Ef > 0.75 ? '#ffffff' : Ef > 0.4 ? '#9fe8ff' : '#5fb8d8');
    const cf = p.charging ? p.charge / CFG.spell.fMax : 0;
    el.chargeArc.setAttribute('stroke-dasharray', `${(cf * C_CHG).toFixed(1)} 999`);
    if (p.charging) {   // 쏘고 나서 남을 마력 자리
      const remain = Ef * (1 - p.charge), ang = remain * 360;
      el.ghost.setAttribute('opacity', 1); el.ghost.setAttribute('transform', `rotate(${ang} 60 60)`);
    } else el.ghost.setAttribute('opacity', 0);
    el.cross.style.display = view === 'fp' || view === 'tp' ? '' : 'none';
    // 화면 밖 화살표 + 조준 경고 + 머리 위 피통
    const W = vp.w, H = vp.h, me = p.rider.body.translation();
    let warnSide = null;
    const alerts = [];   // [등급, 글] r=빨강 o=주황 y=노랑
    const now = performance.now() / 1000;
    m.fighters.forEach((f, i) => {
      const a = arrowEls[i], o = ohbEls[i];
      if (f === p) { a.style.display = 'none'; o.style.opacity = 0; return; }
      const tp = f.rider.body.translation();
      v.set(tp.x, tp.y + 1.0, tp.z).project(camera);
      const behind = v.z > 1;
      let x = v.x, y = v.y;
      if (behind) { x = -x; y = -y; }
      const onScreen = !behind && Math.abs(x) < 0.95 && Math.abs(y) < 0.95;
      const dx = me.x - tp.x, dz = me.z - tp.z, d = Math.hypot(dx, dz);
      // 머리 위 피통: 최근에 맞았거나 가까우면 보인다
      const hp = f.rider.state === 'ko' ? 0 : f.rider.conscious;
      const show = !behind && view !== 'cine' && (now - lastHurt[i] < 4 || d < 16 || f.rider.state === 'ko' && now - lastHurt[i] < 6);
      if (show) {
        v.set(tp.x, tp.y + (f.horse >= 0 ? 1.55 : 1.45), tp.z).project(camera);
        o.style.left = ((v.x * 0.5 + 0.5) * W) + 'px'; o.style.top = ((-v.y * 0.5 + 0.5) * H - 18) + 'px';
        setBar(o, hp, f.ch.css);
        o.style.opacity = f.out ? 0.5 : 1;
        o.style.transform = `scale(${Math.max(0.7, Math.min(1.15, 14 / Math.max(6, d)))})`;
      } else o.style.opacity = 0;
      if (f.out) { a.style.display = 'none'; return; }
      if (onScreen) a.style.display = 'none';
      else {
        const ang = Math.atan2(y, x), k = 1 / Math.max(Math.abs(Math.cos(ang)), Math.abs(Math.sin(ang)));
        const ex = Math.cos(ang) * k, ey = Math.sin(ang) * k;
        a.style.display = ''; a.style.left = ((ex * 0.46 + 0.5) * W - 14) + 'px'; a.style.top = ((-ey * 0.44 + 0.5) * H - 13) + 'px';
        a.style.transform = `rotate(${90 - ang * 180 / Math.PI}deg)`;
      }
      // 나를 노리는가: 충전 중이고 조준이 나를 향함, 또는 빠르게 정면 돌진, 또는 나를 잡음
      const nm = f.ch.name;
      let aimed = false;
      if (f.charging && f.charge > 0.1 && d < 40) { const dd = (f.aimDir.x * dx + f.aimDir.z * dz) / d; if (dd > 0.97) { aimed = true; alerts.push(['r', `⚠ ${nm} 마법 조준 중 (${Math.round(f.charge / CFG.spell.fMax * 100)}%)`]); } }
      if (f.horse >= 0 && d < 22) { const h = m.horses[f.horse], fw = { x: Math.sin(h.heading), z: Math.cos(h.heading) }; if (h.speed > 9 && (fw.x * dx + fw.z * dz) / d > 0.93) { aimed = true; alerts.push(['r', `⚠ ${nm} 돌진해 온다${f.input.thrust ? ' (찌르기!)' : ''}`]); } }
      if (f.grab && f.grab.kind === 'rider' && f.grab.i === p.i) alerts.push(['r', `✋ ${J(nm, '이/가')} 나를 잡았다! 멀어지면 끌려 떨어진다`]);
      if (aimed) warnSide = onScreen ? 'front' : (x < 0 ? 'left' : 'right');
    });
    // 내 상태 위험 자막
    const rs = p.rider.state;
    if (rs === 'mounted') {
      const q = p.rider.body.rotation(), upY = 1 - 2 * (q.x * q.x + q.z * q.z);
      if (!p.input.duck && upY < Math.cos(30 * Math.PI / 180)) alerts.push(['r', '⚠ 몸이 기울었다 — 떨어지기 직전 (Space 숙이기)']);
      const h = m.horses[p.horse];
      if (h.fear > 70) alerts.push(['o', `😱 ${J(h.def.name, '이/가')} 겁먹었다 — 날뛸 수 있다`]);
      if (h.winded) alerts.push(['o', '😮‍💨 말이 숨참 — 질주 불가']);
      else if (h.stam < 25) alerts.push(['y', `말 숨 ${Math.round(h.stam)}%`]);
    }
    if (rs !== 'ko' && p.rider.conscious < CFG.mind.dizzy) alerts.push(['r', '💫 어지러움 — 한두 대 더 맞으면 기절']);
    if (p.stam < 15 && rs !== 'ko') alerts.push(['o', '기운 바닥 — 힘이 빠진다']);
    if (p.weapon < 0 && rs !== 'ko') alerts.push(['y', '👊 맨손 (마법 불가)']);
    if (rs === 'foot' || rs === 'getup') alerts.push(['y', '말에서 떨어짐 — 말발굽 조심']);
    const fr = Math.hypot(me.x, me.z);
    if (m.t > A.shrinkStart && m.t < A.shrinkEnd && fr > m.fenceR - 4) alerts.push(['y', '울타리가 다가온다']);
    const pri = { r: 0, o: 1, y: 2 };
    alerts.sort((a, b) => pri[a[0]] - pri[b[0]]);
    const shown = alerts.slice(0, 4), key = shown.map((s) => s[0] + s[1]).join('|');
    if (key !== alertKey) { alertKey = key; el.alerts.innerHTML = shown.map(([c, t]) => `<span class="${c}">${t}</span>`).join(''); }
    el.warn.style.opacity = warnSide ? 0.6 : 0;
    if (warnSide) el.warn.style.background = warnSide === 'left' ? 'linear-gradient(90deg,rgba(255,40,30,.55),transparent 22%)' : warnSide === 'right' ? 'linear-gradient(270deg,rgba(255,40,30,.55),transparent 22%)' : 'radial-gradient(ellipse at center,transparent 55%,rgba(255,40,30,.45))';
    // 어지러움·피격
    const c = p.rider.conscious, dizzy = c < CFG.mind.dizzy ? (CFG.mind.dizzy - c) / CFG.mind.dizzy : 0;
    el.vignette.style.opacity = Math.min(1, dizzy * 0.85 + (c < 60 ? (60 - c) / 160 : 0) + (dizzy ? Math.sin(performance.now() / 260) * 0.12 * dizzy : 0));
    el.vignette.style.filter = '';
    flashV = Math.max(0, flashV - dt * 2.4); el.flash.style.opacity = flashV;
    // 속도선
    const W2 = el.lines.width = el.lines.clientWidth, H2 = el.lines.height = el.lines.clientHeight;
    const sp = p.horse >= 0 ? m.horses[p.horse].speed : 0, k = view === 'fp' ? Math.max(0, (sp - 11) / 5) : 0;
    lctx.clearRect(0, 0, W2, H2);
    if (k > 0) {
      lctx.strokeStyle = `rgba(255,255,255,${0.22 * Math.min(1, k)})`; lctx.lineWidth = 2;
      const now = performance.now() / 1000;
      for (let i = 0; i < 26; i++) {
        const a = i * 2.39996 + Math.floor(now * 12 + i) * 0.7, r0 = Math.max(W2, H2) * (0.42 + ((now * 3 + i * 0.37) % 1) * 0.2);
        lctx.beginPath(); lctx.moveTo(W2 / 2 + Math.cos(a) * r0, H2 / 2 + Math.sin(a) * r0); lctx.lineTo(W2 / 2 + Math.cos(a) * (r0 + 90 * k), H2 / 2 + Math.sin(a) * (r0 + 90 * k)); lctx.stroke();
      }
    }
    // 기운 고리 (조준점 바깥 초록)
    el.stamArc.setAttribute('stroke-dasharray', `${(p.stam / 100 * C_STAM).toFixed(1)} 999`);
    el.stamArc.setAttribute('stroke', p.stam < 20 ? '#ff7a6a' : p.stam < 45 ? '#ffd34d' : '#9be37a');
    // 자세 표시 (위험이 아닌 것만 조준점 아래에)
    const tags = [];
    if (p.input.thrust) tags.push('[찌르기 자세] 마우스를 앞으로 밀어 찌른다');
    if (p.grab) tags.push('✋ 잡는 중! 멀어지면 끌어내린다');
    el.modeTag.textContent = tags.join('   ');
    // 피해 방향 고리, 피해 숫자
    dirV = Math.max(0, dirV - dt * 1.4); el.dmgDir.style.opacity = dirV;
    for (let k = nums.length - 1; k >= 0; k--) {
      const n = nums[k]; n.t += dt;
      if (n.t > n.life) { n.el.remove(); nums.splice(k, 1); continue; }
      const kk = n.t / n.life, pop = kk < 0.15 ? 0.6 + kk / 0.15 * 0.7 : 1.3 - (kk - 0.15) * 0.4;
      if (n.screen) { n.el.style.left = n.screen.x + 'px'; n.el.style.top = (n.screen.y + 22 * kk) + 'px'; }
      else {
        v.set(n.pos.x, n.pos.y, n.pos.z).project(camera);
        if (v.z > 1) { n.el.style.opacity = 0; continue; }
        n.el.style.left = ((v.x * 0.5 + 0.5) * W + n.dx) + 'px'; n.el.style.top = ((-v.y * 0.5 + 0.5) * H - 40 * kk - 10) + 'px';
      }
      n.el.style.opacity = kk > 0.7 ? (1 - kk) / 0.3 : 1; n.el.style.fontSize = (n.size * pop) + 'px';
    }
    // 맨손이면 지팡이 줍기 안내
    let weaponShown = false;
    if (p.weapon < 0 && (p.rider.state === 'foot' || p.rider.state === 'mounted')) {
      let best = null, bd = 1e9;
      for (const w of m.weapons) { if (w.isFist || w.holder >= 0) continue; const wp = w.body.translation(), d = Math.hypot(wp.x - me.x, wp.z - me.z); if (d < bd) { bd = d; best = w; } }
      if (best) {
        weaponShown = true;
        const mounted = p.rider.state === 'mounted', range = mounted ? CFG.pickup.mounted : CFG.pickup.foot;
        const slow = !mounted || m.horses[p.horse].speed <= CFG.pickup.mountedSpeed;
        el.weaponHint.innerHTML = tk(bd < range && slow ? `<kbd>E</kbd> ${best.item.name} 줍기<small>${mounted ? '말 위에서 몸을 숙여 줍는다' : '남의 지팡이도 주울 수 있다'}</small>`
          : `맨손! 가장 가까운 지팡이까지 ${bd.toFixed(0)}m<small>${mounted && bd < range ? '말을 세우면(속도 5 이하) E로 줍는다' : '지팡이가 없으면 마법을 못 쓴다 · 주먹은 휘두르기로'}</small>`);
      }
    }
    el.weaponHint.classList.toggle('hidden', !weaponShown);
    // 다시 타기 안내
    if (p.rider.state === 'foot' && !weaponShown) {
      let best = null, bd = 1e9;
      for (const h of m.horses) { if (h.rider >= 0) continue; const hp = h.body.translation(), d = Math.hypot(hp.x - me.x, hp.z - me.z); if (d < bd) { bd = d; best = h; } }
      el.mountHint.classList.remove('hidden');
      if (!best) el.mountHint.innerHTML = '빈 말이 없다!<small>걸어서 지팡이로 싸워라 (말에 밟히지 않게)</small>';
      else if (bd < CFG.rider.mountDist + 0.6 && best.speed < CFG.rider.mountSpeed) el.mountHint.innerHTML = tk('<kbd>E</kbd> 말에 타기<small>' + best.def.name + '</small>');
      else el.mountHint.innerHTML = tk(`빈 말까지 ${bd.toFixed(0)}m<small>${best.panicT > 0 ? '겁에 질려 달아나는 중… 멈출 때까지 기다려' : '다가가서 E'}</small>`);
    } else el.mountHint.classList.add('hidden');
    // 시간 지나면 사라지는 것들
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.style.opacity = 0; }
    if (centerT > 0) { centerT -= dt; if (centerT <= 0) el.center.textContent = ''; }
  }
  function f2(E) { return E >= 1000 ? (E / 1000).toFixed(E >= 10000 ? 0 : 1) + 'k' : Math.round(E) + ''; }

  return {
    setup, update,
    show(on) { el.hud.classList.toggle('hidden', !on); },
    toast(text, secs = 4, key) { if (key && key === toastKey && toastT > 0) return; toastKey = key || ''; el.toast.innerHTML = tk(text); el.toast.style.opacity = 1; toastT = secs; },
    hideToast() { toastT = 0; el.toast.style.opacity = 0; },
    feed(html) {
      const d = document.createElement('div'); d.innerHTML = html; el.feed.prepend(d);
      while (el.feed.children.length > 5) el.feed.lastChild.remove();
      setTimeout(() => d.remove(), 5000);
    },
    center(text, secs = 1.2) { el.center.textContent = text; el.center.classList.remove('pop'); void el.center.offsetWidth; el.center.classList.add('pop'); centerT = secs; },
    flash(v) { flashV = Math.max(flashV, Math.min(0.3, v)); },
    // 피해 숫자: 맞은 자리 위로 떠오른다 (화면 크기 고정이라 멀어도 보인다)
    damage(i, pos, amount, cls = '') {
      const d = document.createElement('div'); d.className = 'dmg ' + cls;
      d.textContent = (amount >= 1 ? '-' + Math.round(amount) : '-' + amount.toFixed(1)) + (cls.includes('head') ? '!' : '');
      el.dmgNums.appendChild(d);
      const size = Math.min(44, 18 + amount * 0.7) * (cls.includes('minor') ? 0.75 : 1);
      // 내가 맞은 숫자는 화면 위 내 피통 아래에 고정 (내 머리는 카메라 바로 옆이라 세계 좌표로 두면 화면 끝으로 튄다)
      let screen = null;
      if (cls.includes('me') && chipEls[i]) { const r = rectToGame(chipEls[i].getBoundingClientRect()); screen = { x: r.left + r.width * 0.7, y: r.bottom + 18 }; }
      nums.push({ el: d, pos: { x: pos.x, y: pos.y, z: pos.z }, screen, t: 0, life: 1.0, size, dx: (Math.random() - 0.5) * 30 });
      while (nums.length > 14) { nums[0].el.remove(); nums.shift(); }
      if (i >= 0) {
        lastHurt[i] = performance.now() / 1000;
        const c = chipEls[i]; if (c) { c.classList.add('hit'); setTimeout(() => c.classList.remove('hit'), 140); }
      }
    },
    // 내가 맞혔을 때 조준점에 X 표시
    hitMarker(kind = '') { const h = el.hitmark; h.className = ''; void h.offsetWidth; h.className = 'on ' + kind; },
    // 나를 친 쪽 방향으로 붉은 고리 (ang: 화면 기준 라디안, 0 = 위)
    damageFrom(ang) { el.dmgDir.style.transform = `rotate(${ang}rad)`; dirV = 1; },
    // 쉬운 조작의 표적 조준선 (assist.ui). 누르는 동안 줄어들고, 금색이면 "떼기!"
    target(ui, camera) {
      const t = el.tgt || (el.tgt = $('tgt'));
      if (!ui || ui.target < 0 || !ui.aim) { t.classList.add('hidden'); return; }
      v.set(ui.aim.x, ui.aim.y - 0.35, ui.aim.z).project(camera);
      if (v.z > 1 || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.15) { t.classList.add('hidden'); return; }
      const busy = ui.mode === 'arm' || ui.mode === 'charge', size = Math.round((busy ? 120 - 72 * ui.prog : 96) * (vp.h < 500 ? 0.8 : 1));
      t.classList.remove('hidden');
      t.style.width = t.style.height = size + 'px';
      t.style.transform = `translate(${(v.x * 0.5 + 0.5) * vp.w - size / 2}px,${(-v.y * 0.5 + 0.5) * vp.h - size / 2}px)`;
      const cls = ui.gold && busy ? 'gold' : busy ? ui.mode : '';
      if (t.className !== cls) { t.className = cls; t.lastChild.textContent = cls === 'gold' ? '떼기!' : ''; }
    },
    legend(on) { el.legend.classList.toggle('hidden', !on); },
    // 전직 시험 안내판: info = { tag, title, goal } 또는 null
    trial(info) { el.trialHud.classList.toggle('hidden', !info); el.trialTip.classList.toggle('hidden', !info); if (!info) return; el.trialTag.textContent = info.tag; el.trialTitle.textContent = info.title; el.trialGoal.textContent = info.goal; },
    trialTip(text) { el.trialTip.innerHTML = tk(text); },
    trialProgress(left, n, need) { const s = Math.max(0, Math.floor(left)); el.trialTime.textContent = '⏱ ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); el.trialProg.textContent = `${n} / ${need}`; },
    setLegend(html) { el.legend.innerHTML = html; },
    toggleLegend() { el.legend.classList.toggle('hidden'); },
    replay(on) { el.replayTag.classList.toggle('hidden', !on); },
    practice(items) {   // items: [{key, text}] 또는 null
      el.practice.classList.toggle('hidden', !items);
      if (items) el.practiceList.innerHTML = items.map((it) => `<li data-k="${it.key}">${it.text}</li>`).join('');
    },
    practiceDone(key) { const li = el.practiceList.querySelector(`li[data-k="${key}"]`); if (li && !li.classList.contains('done')) { li.classList.add('done'); return true; } return false; },
  };
}
