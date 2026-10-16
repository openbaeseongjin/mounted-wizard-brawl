// 소리: 맞음·부딪힘·말발굽·말 울음·기합은 녹음(sfx/, 출처 sfx/CREDITS.md), 나머지(휘두름, 발사, 폭발, 팅, 관중, 안내음)는 WebAudio 합성.
// 녹음을 아직 못 받았거나 해독에 실패하면 그 소리도 합성으로 낸다
// 녹음 묶음: 이름 → 파일 수 (sfx/이름_번호.mp3). 공유 한 파일에서는 window.__SFX[이름_번호] = base64
export const SFX = { hitBody: 3, hitWood: 3, hitMetal: 3, clackWood: 3, clankMetal: 3, thud: 3, prop: 2, kick: 2, rattle: 3,
  hoofGallop: 2, hoofTrot: 1, neigh: 2, gruntLow: 3, cryLow: 3, gruntMid: 3, cryMid: 3, gruntHigh: 3, cryHigh: 3 };
const clampA = (x, a, b) => (x < a ? a : x > b ? b : x);
export function createAudio() {
  let ac = null, master = null, bus = null, noiseBuf = null, muted = false, crowd = null, charge = null, listener = null, vol = 0.85;
  const now = () => ac.currentTime;
  const raw = new Map(), rec = new Map();   // 이름 → [ArrayBuffer] → [{ b: AudioBuffer, off: 첫 소리 자리(초) }]
  const inl = typeof window !== 'undefined' ? window.__SFX : null;
  for (const [n, c] of Object.entries(SFX)) for (let i = 0; i < c; i++) {
    const key = n + '_' + i, got = (ab) => { if (!raw.has(n)) raw.set(n, []); raw.get(n).push(ab); if (ac) decode(n, ab); };
    if (inl) { const b64 = inl[key]; if (!b64) continue; const str = atob(b64), u = new Uint8Array(str.length); for (let j = 0; j < str.length; j++) u[j] = str.charCodeAt(j); got(u.buffer); }
    else if (typeof fetch === 'function') fetch('sfx/' + key + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : null)).then((ab) => ab && got(ab)).catch(() => { /* 합성으로 */ });
  }
  function decode(n, ab) {
    const done = (b) => {
      if (!b) return;
      const d = b.getChannelData(0); let pk = 0, on = 0;
      for (let i = 0; i < d.length; i++) pk = Math.max(pk, Math.abs(d[i]));
      while (on < d.length && Math.abs(d[on]) < pk * 0.03) on++;   // mp3 앞 여백까지 잘라 치는 순간이 바로 들리게
      if (!rec.has(n)) rec.set(n, []); rec.get(n).push({ b, off: Math.max(0, on - 64) / b.sampleRate });
    };
    try { const pr = ac.decodeAudioData(ab.slice(0), done, () => { }); if (pr && pr.catch) pr.catch(() => { }); } catch (e) { /* 합성으로 */ }
  }
  // 녹음 하나 재생 (같은 묶음에서 무작위, 높이 ±5%). 녹음이 없으면 false → 합성으로
  function smp(name, pos, v, rate = 1, at = 0) {
    const list = rec.get(name); if (!list || !list.length) return false;
    const s = list[(Math.random() * list.length) | 0], src = ac.createBufferSource();
    src.buffer = s.b; src.playbackRate.value = rate * (0.95 + Math.random() * 0.1);
    src.connect(out(pos, v)); src.start(now() + at, s.off);
    return true;
  }
  function start() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    ac = new AC(); listener = ac.listener;
    for (const [n, list] of raw) for (const ab of list) decode(n, ab);
    master = ac.createGain(); master.gain.value = muted ? 0 : vol; master.connect(ac.destination);
    bus = ac.createDynamicsCompressor(); bus.threshold.value = -12; bus.ratio.value = 4; bus.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); let b = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = (b + 0.02 * w) / 1.02; d[i] = w * 0.6 + b * 3; }
    // 관중 웅성임 (계속)
    const n = ac.createBufferSource(); n.buffer = noiseBuf; n.loop = true;
    const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.7;
    const g = ac.createGain(); g.gain.value = 0.0;
    n.connect(bp); bp.connect(g); g.connect(bus); n.start();
    crowd = { g, bp };
  }
  function out(pos, vol) {
    const g = ac.createGain(); g.gain.value = vol == null ? 1 : vol;
    if (pos) {
      const p = ac.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 6; p.rolloffFactor = 0.9; p.maxDistance = 90;
      if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p); p.connect(bus);
    } else g.connect(bus);
    return g;
  }
  function env(g, t, a, hold, rel, peak) {
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
    g.gain.setValueAtTime(Math.max(0.0002, peak), t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }
  function noise(t, dur) { const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(t, Math.random()); s.stop(t + dur + 0.05); return s; }
  function tone(type, f, t, dur) { const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t); o.start(t); o.stop(t + dur + 0.05); return o; }
  const ok = () => ac && !muted;

  const S = {
    hoof(pos, v = 1, at = 0) {   // 다그닥 (합성)
      const t = now() + at, n = noise(t, 0.07), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      const g = ac.createGain(); env(g, t, 0.003, 0.01, 0.06, 0.35 * v); n.connect(lp); lp.connect(g); g.connect(out(pos));
      const s = tone('sine', 140, t, 0.08); s.frequency.exponentialRampToValueAtTime(60, t + 0.07);
      const g2 = ac.createGain(); env(g2, t, 0.002, 0.01, 0.06, 0.25 * v); s.connect(g2); g2.connect(out(pos));
    },
    stride(pos, v = 1, speed = 10, period = 0.4) {   // 말 한 걸음: 질주는 발굽 4번, 속보·걷기는 2번. 걸음 박자에 맞춰 빠르기를 바꾼다
      const gallop = speed > 7.5;
      if (smp(gallop ? 'hoofGallop' : 'hoofTrot', pos, 0.6 * v, clampA((gallop ? 0.42 : 0.53) / period, 0.85, 1.3))) return;
      for (const f of gallop ? [0, 0.2, 0.4, 0.62] : [0, 0.5]) S.hoof(pos, v, f * period);
    },
    whoosh(pos, v = 1) {
      const t = now(), n = noise(t, 0.28), f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
      f.frequency.setValueAtTime(500, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.14); f.frequency.exponentialRampToValueAtTime(700, t + 0.26);
      const g = ac.createGain(); env(g, t, 0.04, 0.06, 0.16, 0.32 * v); n.connect(f); f.connect(g); g.connect(out(pos));
    },
    bonk(pos, v = 1, head = false) {   // 퍽(녹음) + 합성 쿵 / 뿅 (머리)
      if (smp('hitBody', pos, 0.95 * v, head ? 1.08 : 1)) v *= head ? 0.55 : 0.3;
      const t = now(), o = out(pos);
      const s = tone(head ? 'triangle' : 'sine', head ? 520 : 180, t, 0.18); s.frequency.exponentialRampToValueAtTime(head ? 220 : 70, t + 0.15);
      const g = ac.createGain(); env(g, t, 0.002, 0.02, 0.14, 0.55 * v); s.connect(g); g.connect(o);
      const n = noise(t, 0.06), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = head ? 2200 : 900; bp.Q.value = 2;
      const gn = ac.createGain(); env(gn, t, 0.001, 0.01, 0.05, 0.5 * v); n.connect(bp); bp.connect(gn); gn.connect(o);
    },
    hit(pos, v = 1, head = false, mat = 'wood') {   // 맞음: 살 + 무기 재질(나무 딱 / 쇠 쾅)
      S.bonk(pos, v, head);
      if (mat === 'metal') { if (!smp('hitMetal', pos, 0.8 * v)) S.clank(pos, 0.6); }
      else if (mat === 'wood') smp('hitWood', pos, 0.65 * v);
    },
    clack(pos, v = 1) {
      if (smp('clackWood', pos, 0.85 * v)) return;
      const t = now(), o = out(pos);
      for (const [f, d] of [[1300, 0.08], [1900, 0.06]]) { const s = tone('square', f, t, d), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 6; const g = ac.createGain(); env(g, t, 0.001, 0, d, 0.18 * v); s.connect(bp); bp.connect(g); g.connect(o); }
    },
    cast(pos, v = 1, frac = 0.5) {   // 쿠웅- 하고 나가는 소리
      const t = now(), o = out(pos);
      const s = tone('sawtooth', 220, t, 0.35); s.frequency.exponentialRampToValueAtTime(880 + frac * 600, t + 0.08); s.frequency.exponentialRampToValueAtTime(140, t + 0.33);
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
      const g = ac.createGain(); env(g, t, 0.005, 0.05, 0.28, 0.3 * v); s.connect(lp); lp.connect(g); g.connect(o);
      const n = noise(t, 0.3), hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
      const gn = ac.createGain(); env(gn, t, 0.01, 0.04, 0.25, 0.2 * v); n.connect(hp); hp.connect(gn); gn.connect(o);
    },
    boom(pos, v = 1) {
      const t = now(), o = out(pos);
      const s = tone('sine', 90, t, 0.7); s.frequency.exponentialRampToValueAtTime(32, t + 0.6);
      const g = ac.createGain(); env(g, t, 0.004, 0.05, 0.6, 0.8 * v); s.connect(g); g.connect(o);
      const n = noise(t, 0.8), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.6);
      const gn = ac.createGain(); env(gn, t, 0.002, 0.05, 0.7, 0.6 * v); n.connect(lp); lp.connect(gn); gn.connect(o);
    },
    ting(pos, v = 1) {
      const t = now(), o = out(pos);
      for (const [f, k] of [[1760, 0.3], [2637, 0.18], [3520, 0.1]]) { const s = tone('sine', f, t, 0.6), g = ac.createGain(); env(g, t, 0.002, 0, 0.55, k * v); s.connect(g); g.connect(o); }
    },
    neigh(pos, v = 1) {   // 히이잉
      if (smp('neigh', pos, 0.6 * v)) return;
      const t = now(), o = out(pos), len = 0.9;
      const s = tone('sawtooth', 700, t, len); s.frequency.linearRampToValueAtTime(1100, t + 0.15); s.frequency.linearRampToValueAtTime(500, t + len);
      const vib = tone('sine', 24, t, len), vg = ac.createGain(); vg.gain.value = 90; vib.connect(vg); vg.connect(s.frequency);
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 2;
      const g = ac.createGain(); env(g, t, 0.03, len - 0.35, 0.3, 0.32 * v); s.connect(f); f.connect(g); g.connect(o);
    },
    thud(pos, v = 1) { if (smp('thud', pos, 0.95 * v, 0.92)) { S.hoof(pos, v * 0.3); return; } const t = now(), s = tone('sine', 110, t, 0.2); s.frequency.exponentialRampToValueAtTime(40, t + 0.18); const g = ac.createGain(); env(g, t, 0.004, 0.01, 0.17, 0.55 * v); s.connect(g); g.connect(out(pos)); S.hoof(pos, v * 0.6); },
    creak(pos, v = 1) { const t = now(), s = tone('sawtooth', 160, t, 0.3); s.frequency.linearRampToValueAtTime(110, t + 0.28); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 4; const g = ac.createGain(); env(g, t, 0.02, 0.1, 0.15, 0.18 * v); s.connect(f); f.connect(g); g.connect(out(pos)); },
    cheer(v = 1) {
      if (!crowd) return; const t = now(), g = crowd.g.gain;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.07 + 0.22 * v, t + 0.15); g.linearRampToValueAtTime(0.05, t + 2.2);
      crowd.bp.frequency.setValueAtTime(900, t); crowd.bp.frequency.linearRampToValueAtTime(650, t + 2);
    },
    chime(notes = [660, 990], v = 1) { const t = now(), o = out(null); notes.forEach((f, i) => { const s = tone('sine', f, t + i * 0.1, 0.5), g = ac.createGain(); env(g, t + i * 0.1, 0.01, 0.06, 0.4, 0.22 * v); s.connect(g); g.connect(o); }); },
    fanfare() { S.chime([523, 659, 784, 1046, 1318], 1.1); },
    sad() { const t = now(), o = out(null); [392, 370, 349, 330].forEach((f, i) => { const s = tone('triangle', f, t + i * 0.32, 0.4), g = ac.createGain(); env(g, t + i * 0.32, 0.02, 0.18, 0.2, 0.2); s.connect(g); g.connect(o); }); },
    click() { const t = now(), s = tone('sine', 880, t, 0.05), g = ac.createGain(); env(g, t, 0.002, 0, 0.05, 0.12); s.connect(g); g.connect(out(null)); },
    tick() { const t = now(), s = tone('square', 1900, t, 0.04), g = ac.createGain(); env(g, t, 0.001, 0, 0.04, 0.08); s.connect(g); g.connect(out(null)); },   // 맞혔다 (조준점 X 표시와 함께)
    // 사람 소리: 톱니파 + 모음 필터 두 개(포먼트). pitch = 목소리 높이, kind = 'grunt'(윽) | 'cry'(으악) | 'huff'(흡)
    voice(pos, v = 1, pitch = 1, kind = 'grunt') {
      if (kind !== 'huff') {   // 녹음 목소리 세 묶음: 낮은(묵직이·대장) · 중간 · 높은. 묶음 안에서 기수마다 높이를 조금 바꾼다
        const bank = pitch < 0.85 ? 'Low' : pitch < 1.3 ? 'Mid' : 'High', c = pitch < 0.85 ? 0.7 : pitch < 1.3 ? 1.1 : 1.4;
        if (smp((kind === 'cry' ? 'cry' : 'grunt') + bank, pos, 0.65 * v, 1 + (pitch - c) * 0.35)) return;
      }
      const t = now(), o = out(pos);
      const len = kind === 'cry' ? 0.75 : kind === 'huff' ? 0.16 : 0.22;
      const f0 = 170 * pitch, s = tone('sawtooth', f0 * (kind === 'cry' ? 1.25 : 1.05), t, len);
      if (kind === 'cry') { s.frequency.linearRampToValueAtTime(f0 * 1.6, t + 0.15); s.frequency.linearRampToValueAtTime(f0 * 0.8, t + len); }
      else s.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + len);
      const vib = tone('sine', 7, t, len), vg = ac.createGain(); vg.gain.value = f0 * 0.04; vib.connect(vg); vg.connect(s.frequency);
      const g = ac.createGain(); env(g, t, 0.01, len * 0.4, len * 0.6, 0.32 * v);
      for (const [F, Q, k] of kind === 'cry' ? [[700, 5, 1], [1150, 6, 0.7]] : [[520, 5, 1], [1500, 7, 0.5]]) {
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = F * (0.9 + pitch * 0.1); bp.Q.value = Q;
        const gg = ac.createGain(); gg.gain.value = k; s.connect(bp); bp.connect(gg); gg.connect(g);
      }
      if (kind !== 'cry') { const n = noise(t, len), hp = ac.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 1800; hp.Q.value = 0.8; const gn = ac.createGain(); env(gn, t, 0.005, 0.03, len, 0.12 * v); n.connect(hp); hp.connect(gn); gn.connect(o); }
      g.connect(o);
    },
    ooh(v = 1) {   // 관중 "오오~": 잡음을 모음 필터로 미끄러뜨린다
      const t = now(), o = out(null), n = noise(t, 1.4);
      for (const [a, b] of [[380, 520], [900, 1300]]) {
        const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4; bp.frequency.setValueAtTime(a, t); bp.frequency.linearRampToValueAtTime(b, t + 0.5); bp.frequency.linearRampToValueAtTime(a * 0.9, t + 1.3);
        const g = ac.createGain(); env(g, t, 0.15, 0.5, 0.7, 0.18 * v); n.connect(bp); bp.connect(g); g.connect(o);
      }
    },
    breath(v = 1) {   // 숨찬 소리 (내 기운이 바닥일 때)
      const t = now(), o = out(null);
      for (const [dt, f] of [[0, 900], [0.42, 600]]) { const n = noise(t + dt, 0.3), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 1.2; const g = ac.createGain(); env(g, t + dt, 0.06, 0.08, 0.2, 0.09 * v); n.connect(bp); bp.connect(g); g.connect(o); }
    },
    kick(pos, v = 1) { if (smp('kick', pos, 0.9 * v)) { S.whoosh(pos, 0.5 * v); return; } const t = now(), s = tone('sine', 95, t, 0.15); s.frequency.exponentialRampToValueAtTime(45, t + 0.13); const g = ac.createGain(); env(g, t, 0.003, 0.02, 0.12, 0.6 * v); s.connect(g); g.connect(out(pos)); S.whoosh(pos, 0.5 * v); },
    throw(pos, v = 1) { S.whoosh(pos, 1.1 * v); const t = now(), s = tone('triangle', 300, t, 0.2); s.frequency.exponentialRampToValueAtTime(900, t + 0.18); const g = ac.createGain(); env(g, t, 0.01, 0.05, 0.12, 0.08 * v); s.connect(g); g.connect(out(pos)); },
    pickup(pos, v = 1) { const t = now(), o = out(pos); [660, 990].forEach((f, k) => { const s = tone('triangle', f, t + k * 0.06, 0.08), g = ac.createGain(); env(g, t + k * 0.06, 0.002, 0.02, 0.06, 0.15 * v); s.connect(g); g.connect(o); }); },
    clank(pos, v = 1) {   // 쇠붙이
      if (smp('clankMetal', pos, 0.8 * v)) return;
      const t = now(), o = out(pos);
      for (const [f, d] of [[820, 0.5], [1240, 0.4], [2050, 0.3]]) { const s = tone('square', f * (0.97 + Math.random() * 0.06), t, d), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 9; const g = ac.createGain(); env(g, t, 0.001, 0, d, 0.16 * v); s.connect(bp); bp.connect(g); g.connect(o); }
    },
    propThud(pos, v = 1) { if (smp('prop', pos, 0.75 * v)) return; const t = now(), n = noise(t, 0.18), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500; const g = ac.createGain(); env(g, t, 0.004, 0.03, 0.15, 0.4 * v); n.connect(lp); lp.connect(g); g.connect(out(pos)); },
    rattle(pos, v = 1) { if (smp('rattle', pos, 0.6 * v)) return; const t = now(), o = out(pos); for (let k = 0; k < 4; k++) { const tt = t + k * 0.05 + Math.random() * 0.03, n = noise(tt, 0.03), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400 + Math.random() * 800; bp.Q.value = 3; const g = ac.createGain(); env(g, tt, 0.002, 0, 0.03, 0.2 * v * (1 - k * 0.2)); n.connect(bp); bp.connect(g); g.connect(o); } },
    replay() { const t = now(), s = tone('sine', 1200, t, 0.6); s.frequency.exponentialRampToValueAtTime(300, t + 0.5); const g = ac.createGain(); env(g, t, 0.01, 0.1, 0.4, 0.12); s.connect(g); g.connect(out(null)); },
    count(final) { const t = now(), s = tone('square', final ? 1046 : 660, t, final ? 0.4 : 0.15), g = ac.createGain(); env(g, t, 0.005, final ? 0.2 : 0.05, 0.12, 0.12); s.connect(g); g.connect(out(null)); },
  };
  return {
    start,
    get ready() { return !!ac; },
    get recorded() { let n = 0; for (const l of rec.values()) n += l.length; return n; },   // 해독된 녹음 수 (확인용)
    play(name, ...args) { if (!ok() || !S[name]) return; try { S[name](...args); } catch (e) { /* 소리 실패는 무시 */ } },
    setListener(pos, fwd) {
      if (!ac) return;
      const l = listener, t = now();
      if (l.positionX) { l.positionX.setValueAtTime(pos.x, t); l.positionY.setValueAtTime(pos.y, t); l.positionZ.setValueAtTime(pos.z, t); l.forwardX.setValueAtTime(fwd.x, t); l.forwardY.setValueAtTime(fwd.y, t); l.forwardZ.setValueAtTime(fwd.z, t); l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t); }
      else { l.setPosition(pos.x, pos.y, pos.z); l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0); }
    },
    crowdLevel(v) { if (crowd && ac) crowd.g.gain.setTargetAtTime(v, now(), 0.5); },
    chargeHum(level) {   // 마력 모으는 웅- (플레이어만)
      if (!ok()) return;
      if (level <= 0) { if (charge) { charge.g.gain.setTargetAtTime(0, now(), 0.03); const c = charge; setTimeout(() => { try { c.o.stop(); } catch (e) { } }, 200); charge = null; } return; }
      if (!charge) {
        const o = ac.createOscillator(); o.type = 'sawtooth'; const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
        const g = ac.createGain(); g.gain.value = 0; o.connect(f); f.connect(g); g.connect(bus); o.start(); charge = { o, g, f };
      }
      charge.o.frequency.setTargetAtTime(110 + level * 330, now(), 0.05); charge.f.frequency.setTargetAtTime(500 + level * 2200, now(), 0.05);
      charge.g.gain.setTargetAtTime(0.05 + level * 0.12, now(), 0.05);
    },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : vol; return muted; },
    setVolume(x) { vol = x; if (master && !muted) master.gain.value = vol; },
    get muted() { return muted; },
  };
}
