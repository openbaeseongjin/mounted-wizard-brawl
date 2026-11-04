// 「마상 마법 난투」 데모 · 연결: 화면 전환, 고정 틱 루프, 카메라(1인칭/3인칭), 사건 → 효과·소리·알림, 다시 보기, 설정, 건틀릿·자유 대전·연습장
import * as THREE from 'three';
import { TICK, CFG, CHARS, ITEMS, LADDER, JOBS, SPELLS, JOB_ORDER } from './config.js';
import { createMatch } from './match.js';
import { idleInput, knockOut } from './fighter.js';
import { buildHorse, animateHorse, buildWizard, buildLimbs, buildStaff, placeSeg, solveIK } from './models.js';
import { buildArena } from './scene.js';
import { createFx } from './fx.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { makeFrame, buildVisuals, disposeVisuals, renderFrames, headKick, addBump, flashFighter } from './view.js';
import { vp, rectToGame } from './viewport.js';
import { createAssist } from './assist.js';
import { newCareer, normalizeCareer, currentFights, buildRoster, applyResult, takeLoot, buy, equip, tierSum, tierMul, rivalMimic, rankName, jobOffer, chooseJob, passTrial, failTrial, slotsFor } from './gauntlet.js';
import { trialFor, trialMatchOpts } from './trials.js';
import { statsFor } from './stats.js';
import { createMagicView } from './magicView.js';
import { createElemFx } from './elemFx.js';
import { createPostFx } from './postfx.js';
import { loadRigAssets } from './assets.js';
import { createRig } from './rigModels.js';
import { createVenues, venueFor } from './venues.js';
import { L, LANG, setLang, applyDom } from './i18n.js';

const RAPIER_URL = 'https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.21.0/+esm';
const $ = (id) => document.getElementById(id);
applyDom();   // index.html 의 data-en 글자를 영어로 (이미 했어도 안전: 원문은 data-ko 에 남아 있다)
function showError(e) { const p = $('error'); p.textContent = String((e && e.stack) || e); p.classList.add('show'); }
addEventListener('error', (e) => showError(e.error || e.message));
addEventListener('unhandledrejection', (e) => showError(e.reason));

let R;
try { const mod = await import(RAPIER_URL); R = mod.default || mod; await R.init(); }
catch (e) { $('boot').textContent = L('물리 엔진(Rapier)을 못 불러왔어요 · 인터넷 연결을 확인해 주세요', 'Could not load the physics engine (Rapier) · please check your internet connection'); showError(e); throw e; }

// ---------- 설정 (이 브라우저에만) ----------
const SET_KEY = 'mw-demo-settings-v1';
const DEFAULTS = { sens: 1, swing: 1, fov: 76, sway: 1, vol: 0.85, inv: false, replay: true, shadow: 'high', orient: '', adv: false, gfx: 'high', models: 'real' };   // models: 캐릭터 모델 'real' 진짜(KayKit·Quaternius) · 'simple' 도형   // gfx: 화면 효과(postfx.js) 'high' 켬 · 'normal' 끔   // adv: 고급 조작(하프소드식). 기본은 쉬운 조작   // orient: 폰 화면 방향 ('' 아직 안 고름 · 'land' 가로 · 'port' 세로)
let S = { ...DEFAULTS }, hadSettings = false, savedGfx = false;
// 저장된 설정이 깨졌거나 범위 밖이면 그 칸만 기본값으로 (소리 크기가 글자면 오디오가 죽던 것을 막는다)
const numIn = (v, lo, hi, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
function cleanSettings(o) {
  const r = {};
  r.sens = numIn(o.sens, 0.3, 3, DEFAULTS.sens); r.swing = numIn(o.swing, 0.3, 3, DEFAULTS.swing); r.fov = numIn(o.fov, 60, 100, DEFAULTS.fov);
  r.sway = numIn(o.sway, 0, 1.5, DEFAULTS.sway); r.vol = numIn(o.vol, 0, 1, DEFAULTS.vol);
  for (const k of ['inv', 'replay', 'adv']) r[k] = typeof o[k] === 'boolean' ? o[k] : DEFAULTS[k];
  r.shadow = pick(o.shadow, ['high', 'low', 'off'], DEFAULTS.shadow); r.gfx = pick(o.gfx, ['high', 'normal'], DEFAULTS.gfx);
  r.models = pick(o.models, ['real', 'simple'], DEFAULTS.models); r.orient = pick(o.orient, ['', 'land', 'port'], DEFAULTS.orient);
  return r;
}
try { const s = localStorage.getItem(SET_KEY); if (s) { const o = JSON.parse(s); if (o && typeof o === 'object' && !Array.isArray(o)) { S = { ...DEFAULTS, ...cleanSettings(o) }; hadSettings = true; savedGfx = pick(o.gfx, ['high', 'normal'], null) !== null; } } } catch (e) { /* 기본값 */ }
function saveSettings() { try { localStorage.setItem(SET_KEY, JSON.stringify(S)); } catch (e) { /* 저장 못 해도 계속 */ } }

// ---------- 렌더러 ----------
const canvas = $('c');
const lowQ = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 600;
if (lowQ && !hadSettings) S.shadow = 'low';
if (!savedGfx) S.gfx = lowQ ? 'normal' : 'high';   // 화면 효과는 처음에 PC 켬 · 폰 끔 (예전 설정이 있어도 이 항목은 새로 정한다)
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
const BASE_PR = Math.min(devicePixelRatio, lowQ ? 1.5 : 2);
renderer.setPixelRatio(BASE_PR);
renderer.shadowMap.enabled = S.shadow !== 'off'; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(76, innerWidth / innerHeight, 0.05, 700);
camera.rotation.order = 'YXZ';
const arena = buildArena(scene, renderer, S.shadow === 'low' ? 'low' : 'high');
const fx = createFx(scene), hud = createHud(), input = createInput(canvas), audio = createAudio();
const elemFx = createElemFx(scene, { fx, camera, low: S.shadow === 'low' }), magicView = createMagicView(scene, elemFx.kit);
let fxWarm = false;   // 원소 이펙트 재질은 첫 시합에서 한 번 미리 컴파일한다
// 그래픽 비교 시험 (?look=pp | all): 화면 효과를 켜고 카메라를 고정해 찍는다. 주소에 없으면 불러오지도 않는다
const LOOK = new URLSearchParams(location.search).get('look');
const look = LOOK ? await (await import('./lookPreview.js')).createLook({ renderer, scene, camera, mode: LOOK,
  get: { vis: () => vis, frame: () => curF, match: () => match, player: () => (player ? player.i : -1), view: () => view } }) : null;
// 화면 효과 (postfx.js): 켤 때 한 번 만든다. 못 만들면(인터넷·WebGL2 없음) 끈다
let post = null, postBusy = false;
function applyGfx() {
  if (look || S.gfx !== 'high' || post || postBusy) return;
  if (!renderer.capabilities.isWebGL2) { S.gfx = 'normal'; return; }
  postBusy = true;
  createPostFx({ renderer, scene, camera }).then((p) => { post = p; }).catch((e) => { console.warn('화면 효과를 못 켰다', e); S.gfx = 'normal'; }).finally(() => { postBusy = false; });
}
applyGfx();
// 진짜 모델 (assets.js · rigModels.js): 도형으로 바로 시작하고, 다 불러오면 다음 프레임부터 바꿔 그린다. 못 불러오면 도형 그대로
// 배경(venues.js)도 같은 자산이라 같이 켜고 끈다: 시합마다 장소·날씨가 다르다
let rig = null, rigBusy = false, venues = null, curVenue = 'spring';
function applyModels() {
  if (S.models !== 'real') { if (rig) { rig.off(vis); rig.offDisplay(display); } if (venues) venues.set(null); return; }
  if (venues) venues.set(curVenue);
  if (rig || rigBusy) return;
  rigBusy = true;
  loadRigAssets().then(async (a) => {
    if (!a) return;
    const r = await createRig(a);
    venues = await createVenues(scene, arena, a.map);
    rig = r;
    if (S.models === 'real') venues.set(curVenue);
  }).catch((e) => { console.warn('진짜 모델을 못 만들었다 · 도형으로 논다', e); }).finally(() => { rigBusy = false; });
}
function setVenue(name) { curVenue = name; if (venues && S.models === 'real') venues.set(name); }
applyModels();
// 이번 프레임에 쓸 rig: 켜져 있으면 지금 시합 비주얼에 붙인다
function rigNow() {
  if (!rig || S.models !== 'real' || !vis || !match) return null;
  if (!vis.rig) rig.attach(vis, match);
  return rig;
}
// ---------- 적응형 화질 (그리는 방식만 바꾼다. 시뮬은 그대로) ----------
// 다른 게임·무거운 프로그램이 GPU를 나눠 쓰면 프레임이 늘어지거나 가끔 크게 멎는다. 느리면 층계를 한 칸씩 내려간다:
// 그림자 갱신 절반 → 그림자 깊이(AO) 끄기 → 해상도 → 화면 효과 끄기 → 해상도 더. 값싼 것(해상도를 안 바꾸는 것)부터 쓴다:
// 해상도를 바꾸면 렌더 타깃을 다시 만들어 한두 프레임 멎는다. 여유가 있어 보이면 천천히 한 칸씩 되돌린다
// (올려 봤다가 느리면 바로 내리고 다음 시도를 늦춘다). 아주 느리면 두 칸씩 내린다. 주소에 ?gov=0 이면 끈다
// sh2: 그림자 맵을 두 프레임에 한 번만 다시 그린다 (움직이는 그림자가 한 프레임 늦을 뿐 눈에 거의 안 띈다)
const GOV_LEVELS = [
  { pr: 1, ao: true, post: true, sh2: false }, { pr: 1, ao: true, post: true, sh2: true }, { pr: 1, ao: false, post: true, sh2: true },
  { pr: 0.85, ao: false, post: true, sh2: true }, { pr: 0.85, ao: false, post: false, sh2: true }, { pr: 0.72, ao: false, post: false, sh2: true }, { pr: 0.6, ao: false, post: false, sh2: true }];
const PERF = new URLSearchParams(location.search).get('perf') === '1';
const gov = { on: new URLSearchParams(location.search).get('gov') !== '0', level: 0, ema: 1 / 60, bad: 0, huge: 0, hold: -4, settle: 0, slowT: 0, fastT: 0, upWait: 20, hist: [], tried: false, ao: true, post: true, sh2: false, cpuMs: 0, drawMs: 0 };
function govApply() {
  const g = GOV_LEVELS[gov.level], pr = Math.max(0.6, BASE_PR * g.pr);
  if (Math.abs(renderer.getPixelRatio() - pr) > 0.01) renderer.setPixelRatio(pr);
  gov.ao = g.ao; gov.post = g.post; gov.sh2 = g.sh2;
  if (!g.sh2) renderer.shadowMap.autoUpdate = true;
}
function govStep(to, tried) {
  gov.level = Math.max(0, Math.min(GOV_LEVELS.length - 1, to)); gov.tried = tried;
  gov.hold = 0; gov.slowT = 0; gov.fastT = 0; gov.ema = 1 / 60; gov.bad = 0; gov.huge = 0; gov.settle = 0.7; govApply();
  if (gov.hist.length < 60) gov.hist.push(Math.round(performance.now() / 100) / 10 + ':' + gov.level + (tried ? 'u' : ''));   // 시험·디버그용 기록
}
function govTick(dt) {
  if (!gov.on || document.hidden) return;
  const d = Math.min(dt, 0.05);
  gov.hold += d;
  if (gov.settle > 0) { gov.settle -= d; return; }   // 바꾼 직후 한두 프레임 멎는 구간은 평균에 넣지 않는다
  gov.ema += (d - gov.ema) * 0.06;
  gov.bad += ((d > 0.026 ? 1 : 0) - gov.bad) * 0.012;   // 38fps 아래로 떨어진 프레임의 비율: 평균은 괜찮아도 가끔 크게 멎는 것을 잡는다
  gov.huge += ((d >= 0.045 ? 1 : 0) - gov.huge) * 0.012;   // 0.05초 넘게 멎은 프레임의 비율
  if (gov.hold < 2) return;
  if (gov.huge > 0.02 && gov.level < 4 && !gov.tried) { gov.slowT += d; if (gov.slowT >= 1) { govStep(4, false); return; } }   // 크게 멎는 일이 잦으면(시합 시작·첫 마법 컴파일 같은 한두 번이 아니라 계속) 화면 효과부터 끈다 (가장 값비싼 전환이라 가장 잘 듣는다)
  if (gov.ema > 0.0215 || gov.bad > 0.02) {   // 46fps 아래거나 느린 프레임이 2% 넘게 (5% 만 100ms 씩 멎어도 0.25초마다 끊긴다)
    gov.slowT += d; gov.fastT = 0;
    if (gov.slowT >= 0.8) {
      if (gov.tried) { gov.upWait = Math.min(120, gov.upWait * 2); govStep(gov.level + 1, false); }   // 올려 봤더니 느리다: 되돌리고 다음 시도를 늦춘다
      else if (gov.level < GOV_LEVELS.length - 1) govStep(gov.level + (gov.ema > 0.03 || gov.bad > 0.12 ? 2 : 1), false);
      else gov.slowT = 0;
    }
  } else {
    gov.slowT = Math.max(0, gov.slowT - d * 0.5);   // 한 번 괜찮았다고 바로 지우지 않는다: 군데군데 멎는 경우를 놓치지 않게 천천히 줄인다
    if (gov.tried && gov.hold > 4) { gov.tried = false; gov.upWait = Math.max(20, gov.upWait * 0.5); }   // 올린 자리가 버틴다
    if (gov.level > 0 && gov.ema < 0.0178 && gov.bad < 0.004) {
      gov.fastT += d;
      if (gov.fastT >= gov.upWait) govStep(gov.level - 1, true);
    } else gov.fastT = 0;
  }
}
let perfEl = null, perfAcc = 0, perfN = 0;
function perfHud(dt) {
  if (!PERF) return;
  if (!perfEl) { perfEl = document.createElement('div'); perfEl.style.cssText = 'position:fixed;left:6px;bottom:6px;z-index:99999;font:12px/1.3 monospace;color:#9f9;background:rgba(0,0,0,.6);padding:3px 6px;pointer-events:none;white-space:pre'; document.body.appendChild(perfEl); }
  perfAcc += dt; perfN++;
  if (perfAcc > 0.5) {
    perfEl.textContent = `${(perfN / perfAcc).toFixed(0)} fps · ${(perfAcc / perfN * 1000).toFixed(1)} ms · cpu ${gov.cpuMs.toFixed(1)} ms\nlevel ${gov.level} · pr ${renderer.getPixelRatio().toFixed(2)} · ao ${gov.ao ? 1 : 0} · post ${post && S.gfx === 'high' && gov.post ? 1 : 0}`;
    perfAcc = 0; perfN = 0;
  }
}
let shK = 0;
const draw = () => {
  const t1 = performance.now();
  if (gov.sh2) { renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = (shK++ & 1) === 0; }
  if (look) look.render();
  else if (post && S.gfx === 'high' && gov.post) { post.ao.enabled = gov.ao; post.render(); }
  else renderer.render(scene, camera);
  gov.drawMs += (performance.now() - t1 - gov.drawMs) * 0.05;
};
audio.setVolume(S.vol);
function applyShadow() {
  renderer.shadowMap.enabled = S.shadow !== 'off';
  const size = S.shadow === 'low' ? 1024 : 2048;
  if (arena.sun.shadow.mapSize.x !== size) { arena.sun.shadow.mapSize.set(size, size); if (arena.sun.shadow.map) { arena.sun.shadow.map.dispose(); arena.sun.shadow.map = null; } }
  scene.traverse((o) => { if (o.isMesh && o.material) for (const mt of [].concat(o.material)) mt.needsUpdate = true; });   // 그림자를 켜고 끄면 재질을 다시 컴파일해야 한다
}
// 가로를 고른 폰인데 화면이 세로면(카톡 안 브라우저처럼 자동 회전이 안 되는 곳) 게임 상자를 90° 돌려 그린다
function resize() {
  const W = innerWidth, H = innerHeight;
  vp.rot = input.st.touch && S.orient === 'land' && H > W;
  vp.w = vp.rot ? H : W; vp.h = vp.rot ? W : H;
  document.body.classList.toggle('rot', vp.rot);
  const app = $('app'); app.style.width = vp.w + 'px'; app.style.height = vp.h + 'px'; app.style.left = vp.rot ? W + 'px' : '0px';
  renderer.setSize(vp.w, vp.h, false); camera.aspect = vp.w / vp.h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
// 세로 화면: 세로 시야각을 넓혀서 가로 폭이 너무 좁아지지 않게 한다
const fitFov = (v) => { const a = camera.aspect; if (a >= 1) return v; return Math.min(110, 2 * Math.atan(Math.tan(v * Math.PI / 360) / Math.pow(a, 0.6)) * 180 / Math.PI); };

// ---------- 저장 ----------
const SAVE = 'mw-demo-career-v1';
let career = null;
try { const s = localStorage.getItem(SAVE); if (s) career = JSON.parse(s); } catch (e) { career = null; }
const hasSave = !!career;
career = normalizeCareer(career);   // 옛 저장은 견습으로 이어 간다
function save() { try { localStorage.setItem(SAVE, JSON.stringify(career)); } catch (e) { /* 저장 못 해도 계속 */ } }

// ---------- 공통 도우미 ----------
const J = (w, pair) => { if (LANG === 'en') return w; const c = w.charCodeAt(w.length - 1) - 0xac00; const has = c >= 0 && c % 28 !== 0; const [a, b] = pair.split('/'); return w + (has ? a : b); };   // 영어에는 조사가 없다: 이름만
const nameOf = (f) => (f.isPlayer ? L('마지', 'Maji') : f.ch.name);
const colorName = (f) => `<b style="color:${f.ch.css}">${nameOf(f)}</b>`;
const CJ = (f, pair) => colorName(f) + (LANG === 'en' ? '' : J(nameOf(f), pair).slice(nameOf(f).length));   // 색 이름 + 조사
const PERSONA_TXT = {
  dummy: L('일직선으로 왕복한다. 가끔 약하게 쏜다. 쳐내지 않는다.', 'Shuttles back and forth in a straight line. Fires weakly now and then. Never parries.'),
  heavy: L('가장 가까운 상대에게 정면 돌진하고 찌르기로 들이받는다. 한 방이 크고 선회가 느리다. → 옆으로 비껴 스치며 쳐라.', 'Charges the nearest rival head-on and rams with thrusts. Hits hard, turns slowly. → Slip past its side and strike.'),
  quick: L('빠르게 돌며 작게 자주 쏜다. 가끔 지팡이를 던진다. 쉽게 겁먹는다.', 'Circles fast and fires small shots often. Sometimes throws its staff. Spooks easily.'),
  sneaky: L('둘이 붙을 때까지 가장자리를 돈다. 약한 상대를 노리고, 옆에 붙으면 잡아 끌어내린다.', 'Circles the edge until two others clash. Targets the weak, and grabs and drags riders off when alongside.'),
  rival: L('네가 쏘는 버릇과 휘두르는 버릇을 따라 한다. 마상창으로 찌르고 잡기도 한다.', 'Copies your casting and swinging habits. Thrusts with a lance and can grab.'),
  still: L('가만히 있는 연습 과녁.', 'A practice target that stands still.'),
};
const VERSION = 'v0.5.3';   // 시험 기록에 같이 적는다
// 사람 시험용 기록 (시뮬과 무관, 화면 쪽에서만 센다): 시합이 끝나면 결과 화면에 한 줄로 보여 주고 복사하게 한다
let tst = null;
const VOICE = { maji: 1.35, dummy: 1.1, mukjik: 0.72, boss1: 0.66, beongae: 1.5, gihoe: 0.95, rival: 1.25 };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

// ---------- 시합 상태 ----------
let match = null, vis = null, player = null, fightDef = null, mode = 'boot', view = 'fp', kind = 'gauntlet';
let frames = [], prevF = null, curF = null;
const MAX_FRAMES = 300;
let replay = null, pendingReplay = null, replayCd = 0, lastBig = null;
const bumpsGrowing = [];
function clearVisuals() { fx.clear(); disposeVisuals(scene, vis); vis = null; bumpsGrowing.length = 0; }
function stopMatch() { if (match) { match.free(); match = null; } clearVisuals(); magicView.clear(); elemFx.clear(); player = null; cam.swP = null; frames = []; prevF = curF = null; replay = null; pendingReplay = null; hud.replay(false); camera.clearViewOffset(); }

// ---------- 카메라 ----------
const cam = { pos: V(0, 3, -10), shake: 0, fovKick: 0, cineAng: 0, focus: V(), swP: null, swY: 0, swW: null };   // swP·swY·swW: 몸 흔들림 기준 (bodySway)
const ctl = { yaw: 0, pitch: 0, hand: [0.5, 0.1], swinging: false, mountReq: false, kickReq: false, reach: 0, lock: -1, gHold: 0, surrender: false, prevState: 'mounted', manualT: 9 };
let assist = null;   // 쉬운 조작 (assist.js)
const _q = new THREE.Quaternion(), _tf = new THREE.Vector3();
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
// 몸이 실제로 흔들린 만큼 1인칭 시야도 따라간다 (하프소드식). 몸이 '있어야 할' 자세(질주 기울기·숙이기·찌르기 기울기,
// 조준 쪽으로 돌린 몸통)와 실제 자세의 차이만 쓰고, 그중에서도 반 박자 늦게 따라오는 기준을 빼서 순간 흔들림만 남긴다.
// 실측(시뮬): 크게 휘두르기 1~3°, 철퇴 스침 약 3°, 말끼리 부딪히면 수십 ° → 최대 ±0.35 rad로 자른다
const _wu = new THREE.Vector3(), _cf = new THREE.Vector3();
function bodySway(dt, tq, up, refYaw, yaw, fb, speed) {
  const inp = match && player ? match.fighters[player.i].input : null, RC = CFG.rider;
  _tf.set(0, 0, 1).applyQuaternion(tq);
  // 앞뒤: 시선 방향으로 본 기울기 - 있어야 할 기울기
  const lean = fb.horse >= 0 ? RC.leanPerSpeed * speed + (inp && inp.duck ? RC.duckLean : 0) + (inp && inp.thrust ? 0.12 : 0) : 0;
  _wu.set(Math.sin(refYaw) * lean, 1, Math.cos(refYaw) * lean).normalize();
  _cf.set(Math.sin(yaw), 0, Math.cos(yaw));
  const dp = Math.asin(clamp(up.dot(_cf), -1, 1)) - Math.asin(clamp(_wu.dot(_cf), -1, 1));
  // 비틀림: 몸통 방향 - 몸통이 돌아가 있어야 할 방향(말 위면 말 앞 + 조준 쪽 최대 bodyYawMax, 걸을 땐 조준 방향)
  const want = fb.horse >= 0 ? refYaw + clamp(wrapA(fb.aimYaw - refYaw), -RC.bodyYawMax, RC.bodyYawMax) : fb.aimYaw;
  // 쉬운 조작은 몸통을 표적 쪽으로 홱 돌린다: 그 목표를 몸통이 따라오는 빠르기(약 0.12초)로 늦춰서 빼야 일부러 돈 것이 흔들림으로 안 잡힌다
  if (cam.swW == null || cam.swP == null) cam.swW = want;
  cam.swW += wrapA(want - cam.swW) * (1 - Math.exp(-dt / 0.12));
  const dy = wrapA(Math.atan2(_tf.x, _tf.z) - cam.swW);
  if (cam.swP == null || Math.abs(dp - cam.swP) > 0.8 || Math.abs(wrapA(dy - cam.swY)) > 0.8) { cam.swP = dp; cam.swY = dy; }
  const k = 1 - Math.exp(-dt / 0.35);
  cam.swP += (dp - cam.swP) * k; cam.swY += wrapA(dy - cam.swY) * k;
  const g = 1.2 * S.sway;
  return { p: clamp(dp - cam.swP, -0.35, 0.35) * g, y: clamp(wrapA(dy - cam.swY), -0.12, 0.12) * g * 0.7 };   // 좌우는 작게: 조준이 흔들리면 쉬운 조작이 헷갈린다
}
function playerHead(F, alpha) {
  const A = prevF.fighters[player.i], B = F.fighters[player.i];
  const p = V(A.p.x + (B.p.x - A.p.x) * alpha, A.p.y + (B.p.y - A.p.y) * alpha, A.p.z + (B.p.z - A.p.z) * alpha);
  _q.set(B.q.x, B.q.y, B.q.z, B.q.w);
  return { p, q: _q.clone() };
}
function updateFightCamera(dt, alpha) {
  const p = player, fb = curF.fighters[p.i];
  const { p: tp, q: tq } = playerHead(curF, alpha);
  const head = V(0, CFG.rider.headY + 0.04, 0.06).applyQuaternion(tq).add(tp);
  let yaw = fb.aimYaw, pitch = fb.aimPitch, refYaw = 0;
  if (fb.horse >= 0) {
    const hs = vis.horses[fb.horse], fwH = V(0, 0, 1).applyQuaternion(hs.Q);
    refYaw = Math.atan2(fwH.x, fwH.z);
    yaw = refYaw + clamp(ctl.yaw, -2, 2); pitch = ctl.pitch;
  } else if (fb.state === 'foot' || fb.state === 'getup') { yaw = ctl.yaw; pitch = ctl.pitch; }
  const up = V(0, 1, 0).applyQuaternion(tq);
  const fwd = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
  const right = V(-Math.cos(yaw), 0, Math.sin(yaw));
  const tumbling = fb.state === 'flying' || fb.state === 'ko' || fb.state === 'mounting';
  cam.shake = Math.max(0, cam.shake - dt * 2.2); cam.fovKick = Math.max(0, cam.fovKick - dt * 22);
  const sh = cam.shake * cam.shake * S.sway;
  const jitter = V((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);
  const hb = fb.horse >= 0 ? curF.horses[fb.horse] : null, speed = hb ? hb.speed : 0;
  const hs = vis.fighters[p.i].hs;   // 머리 젖힘 용수철 → 시야도 젖혀진다
  if (view === 'fp') {
    // 말 걸음에 맞춘 들썩임 (질주일수록 크게)
    const bob = hb ? Math.sin(hb.gait * Math.PI * 4) * 0.035 * Math.min(1, speed / 12) * S.sway : 0;
    cam.pos.lerp(head, 1 - Math.exp(-dt * 30));
    camera.position.copy(cam.pos).add(jitter); camera.position.y += bob;
    if (tumbling) {   // 굴러떨어질 때는 몸 회전을 반쯤 따라간다 (하프소드 느낌)
      const look = V(0, 0.15, 1).applyQuaternion(tq).normalize();
      const m4 = new THREE.Matrix4().lookAt(camera.position, camera.position.clone().add(look), up);
      camera.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(m4), 1 - Math.exp(-dt * 6));
    } else {
      const roll = -up.dot(right) * 0.45 + (fb.conscious < CFG.mind.dizzy ? Math.sin(performance.now() / 400) * 0.06 : 0) + hs.z * 0.7 + (hb ? Math.sin(hb.gait * Math.PI * 2) * 0.012 * Math.min(1, speed / 12) : 0);
      const sw = bodySway(dt, tq, up, refYaw, yaw, fb, speed);
      camera.rotation.set(pitch + jitter.y * 0.4 + hs.x * 0.7 - sw.p, yaw + Math.PI + jitter.x * 0.4 + sw.y, roll);
    }
    camera.fov = S.fov - 4 + Math.min(14, speed * 0.85) + cam.fovKick;
  } else {
    const back = V(-Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(5.2).add(V(0, 1.9 - pitch * 2, 0));
    cam.pos.lerp(head.clone().add(back), 1 - Math.exp(-dt * 8));
    camera.position.copy(cam.pos).add(jitter);
    camera.lookAt(head.clone().add(fwd.clone().multiplyScalar(6)).add(V(0, 0.4, 0)));
    camera.fov = S.fov - 10 + Math.min(10, speed * 0.6) + cam.fovKick;
  }
  camera.fov = fitFov(camera.fov); camera.updateProjectionMatrix();
  audio.setListener(camera.position, fwd);
}
function updateCineCamera(dt, focus, radius = 26, height = 9, speed = 0.13) {
  cam.cineAng += dt * speed;
  cam.focus.lerp(focus, 1 - Math.exp(-dt * 2));
  const want = V(cam.focus.x + Math.sin(cam.cineAng) * radius, height, cam.focus.z + Math.cos(cam.cineAng) * radius);
  cam.pos.lerp(want, 1 - Math.exp(-dt * 1.5));
  camera.position.copy(cam.pos); camera.lookAt(cam.focus.x, 1.6, cam.focus.z);
  camera.fov = fitFov(55); camera.updateProjectionMatrix();
  audio.setListener(camera.position, V(-Math.sin(cam.cineAng), 0, -Math.cos(cam.cineAng)));
}
const centroid = () => { const c = V(); let n = 0; for (const f of match.fighters) if (!f.out) { c.add(f.rider.body.translation()); n++; } return n ? c.multiplyScalar(1 / n) : c; };

// ---------- 플레이어 입력 ----------
function readFrameInput(dt) {
  const [dx0, dy0] = input.takeMouse();
  const p = player; if (!p) return;
  const dx = dx0, dy = dy0 * (S.inv ? -1 : 1);
  // 상태가 바뀌면 보기 각을 말 기준 ↔ 세계 기준으로 바꾼다
  const st = p.rider.state, wasMounted = ctl.prevState === 'mounted', isMounted = st === 'mounted';
  if (wasMounted && !isMounted) ctl.yaw = p.aimYaw;
  if (!wasMounted && isMounted) { const h = match.horses[p.horse]; ctl.yaw = wrap(ctl.yaw - h.heading); }
  ctl.prevState = st;
  const sens = 0.0023 * S.sens, hsens = 0.0042 * S.swing;
  if (!S.adv) {
    // 쉬운 조작: 마우스·화면 끌기는 보기만. 버튼을 누르는 동안은 게임이 표적 쪽으로 보기를 돌리고, 손을 떼고 있으면 앞으로 돌아온다
    ctl.swinging = false;
    if (dx || dy) { ctl.yaw -= dx * sens; ctl.pitch = clamp(ctl.pitch - dy * sens, -0.7, 0.6); ctl.manualT = 0; } else ctl.manualT += dt;
    const want = assist && assist.state.look;
    if (want) { const k = 1 - Math.exp(-dt * 14); ctl.yaw += wrap(want[0] - ctl.yaw) * k; ctl.pitch += (want[1] - ctl.pitch) * k; }
    else if (isMounted && ctl.manualT > 1.2) { const k = 1 - Math.exp(-dt * 1.6); ctl.yaw -= ctl.yaw * k; ctl.pitch += (-0.04 - ctl.pitch) * k; }
    if (isMounted) ctl.yaw = clamp(ctl.yaw, -2, 2);
    commonKeys(dt);
    return;
  }
  const thrusting = input.held('KeyC') || input.held('AltLeft') || input.held('AltRight');
  if (input.st.lmb && (st === 'mounted' || st === 'foot') && !thrusting) {
    if (!ctl.swinging) { ctl.swinging = true; ctl.hand = [0.55, 0.05]; }
    ctl.hand[0] += dx * hsens; ctl.hand[1] -= dy0 * hsens;
    const l = Math.hypot(ctl.hand[0], ctl.hand[1]); if (l > 1) { ctl.hand[0] /= l; ctl.hand[1] /= l; }
  } else {
    ctl.swinging = false;
    ctl.yaw -= dx * sens;
    if (thrusting) ctl.reach = clamp(ctl.reach - dy0 * 0.006 * S.swing, -1, 1);   // 찌르기 자세: 마우스 앞뒤 = 내뻗기
    else ctl.pitch = clamp(ctl.pitch - dy * sens, -0.7, 0.6);
  }
  if (!thrusting) ctl.reach += (0 - ctl.reach) * Math.min(1, dt * 6);
  if (isMounted) ctl.yaw = clamp(ctl.yaw, -2, 2);
  // 표적 고정
  if (ctl.lock >= 0) {
    const g = match.fighters[ctl.lock];
    if (!g || g.out) ctl.lock = -1;
    else {
      const me = p.rider.body.translation(), tp = g.rider.body.translation();
      const head = { x: me.x, y: me.y + 1, z: me.z };
      let yw = Math.atan2(tp.x - head.x, tp.z - head.z);
      if (isMounted) yw = clamp(wrap(yw - match.horses[p.horse].heading), -2, 2);
      const pt = Math.atan2(tp.y + 0.7 - head.y, Math.max(1, Math.hypot(tp.x - head.x, tp.z - head.z)));
      const k = 1 - Math.exp(-dt * 10);
      ctl.yaw += wrap(yw - ctl.yaw) * k; if (!thrusting) ctl.pitch += (pt - ctl.pitch) * k;
    }
  }
  if (input.pressed('KeyE')) ctl.mountReq = true;
  if (input.pressed('Space') && st === 'foot') ctl.kickReq = true;
  commonKeys(dt);
}
function commonKeys(dt) {
  const p = player;
  if (input.pressed('KeyV')) { view = view === 'fp' ? 'tp' : 'fp'; hud.toast(view === 'fp' ? L('1인칭', 'First person') : L('3인칭', 'Third person'), 1.2); }
  if (input.pressed('KeyZ') && S.adv) {
    if (ctl.lock >= 0) ctl.lock = -1;
    else {   // 화면 정면에 가장 가까운 상대
      let best = -1, bs = -1e9; const me = p.rider.body.translation(), fw = V(Math.sin(p.aimYaw), 0, Math.cos(p.aimYaw));
      for (const g of match.fighters) { if (g === p || g.out) continue; const tp = g.rider.body.translation(), d = V(tp.x - me.x, 0, tp.z - me.z); const dl = d.length(); const s = d.normalize().dot(fw) * 2 - dl / 40; if (s > bs) { bs = s; best = g.i; } }
      ctl.lock = best; if (best >= 0) hud.toast(L(`표적 고정: ${colorName(match.fighters[best])} (Z로 해제)`, `Locked on: ${colorName(match.fighters[best])} (Z to release)`), 1.6);
    }
  }
  if (input.pressed('KeyF')) { slowUser = !slowUser; hud.toast(slowUser ? L('슬로모션 켬 (F)', 'Slow motion on (F)') : L('슬로모션 끔', 'Slow motion off'), 1.2); }
  if (input.pressed('KeyH')) hud.toggleLegend();
  if (input.pressed('Escape')) pause(true);
  if (input.held('KeyG') && kind !== 'practice') { ctl.gHold += dt; if (ctl.gHold > 0.9 && !ctl.surrender) ctl.surrender = true; } else ctl.gHold = 0;
  if (ctl.gHold > 0.1 && !ctl.surrender) hud.toast(L(`🏳 항복하려면 G를 계속 누르세요 (${Math.ceil((0.9 - ctl.gHold) * 10) / 10}초)`, `🏳 Keep holding G to surrender (${Math.ceil((0.9 - ctl.gHold) * 10) / 10}s)`), 0.3, 'g');
}
// 쉬운 조작 ↔ 고급 조작: 터치 버튼 모양·PC 안내를 바꾼다
const TB_DEFAULT = { tbSwing: $('tbSwing').innerHTML, tbCast: $('tbCast').innerHTML, tbDuck: $('tbDuck').innerHTML }, LEGEND_ADV = $('legend').innerHTML;
const LEGEND_SIMPLE = L('<kbd>W</kbd> 질주 <kbd>S</kbd> 감속 <kbd>A</kbd><kbd>D</kbd> 방향 (말은 저절로 달린다) · 마우스 = 보기<br><b>우클릭</b> 마법: 누르고 있다가 조준선이 금색일 때 떼기 · <kbd>Q</kbd> 큰 마법(2차 전직 뒤)<br><b>좌클릭</b> 휘두르기: 누르고 있으면 상대 옆으로 붙고, 금색일 때 떼기<br>(상황에 따라 쳐내기 · 줍기 · 타기 · 찌르기로 바뀜) · <kbd>Space</kbd> 피하기<br><kbd>V</kbd> 시점 <kbd>G</kbd> 항복(길게) <kbd>H</kbd> 숨기기 · 설정에서 고급 조작(하프소드식)',
  '<kbd>W</kbd> gallop <kbd>S</kbd> slow <kbd>A</kbd><kbd>D</kbd> steer (the horse runs on its own) · mouse = look<br><b>Right-click</b> magic: hold, release when the reticle turns gold · <kbd>Q</kbd> big spell (after 2nd advancement)<br><b>Left-click</b> swing: hold to close in beside a rival, release on gold<br>(becomes parry · pick up · mount · thrust by context) · <kbd>Space</kbd> duck<br><kbd>V</kbd> view <kbd>G</kbd> surrender (hold) <kbd>H</kbd> hide · Advanced (Half Sword-style) controls in Settings');
let lastLbl = '';
const LBL_EN = { 휘두르기: 'Swing', 쳐내기: 'Parry', 줍기: 'Pick up', 타기: 'Mount', 찌르기: 'Thrust', 주먹: 'Fist', 숙이기: 'Duck', 발차기: 'Kick' };
const lbl = (s) => (LANG === 'en' ? LBL_EN[s] || s : s);
function applyControls() {
  document.body.classList.toggle('simple', !S.adv);
  hud.setLegend(S.adv ? LEGEND_ADV : LEGEND_SIMPLE);
  if (S.adv) { for (const id in TB_DEFAULT) { $(id).innerHTML = TB_DEFAULT[id]; $(id).classList.remove('gold', 'off'); } lastLbl = ''; }
}
function simpleButtons(ui) {
  if (!input.st.touch) return;
  const REL = L('떼기!', 'Release!');   // assist.js 가 주는 버튼 이름은 한국어 표지: 보이는 글자만 여기서 바꾼다
  const sw = ui.mode === 'arm' && ui.gold ? REL : lbl(ui.swingLabel), ca = !ui.castOk ? L('지팡이<br>없음', 'No<br>staff') : ui.mode === 'charge' && ui.slot === 'main' && ui.gold ? REL : ui.castLabel;
  const big = !ui.bigOk ? '' : ui.mode === 'charge' && ui.slot === 'big' && ui.gold ? REL : ui.bigLabel;
  const key = sw + '|' + ca + '|' + ui.dodgeLabel + '|' + big;
  if (key === lastLbl) return;
  lastLbl = key;
  $('tbSwing').innerHTML = sw; $('tbCast').innerHTML = ca; $('tbDuck').innerHTML = lbl(ui.dodgeLabel);
  $('tbBig').classList.toggle('hidden', !ui.bigOk); $('tbBig').innerHTML = big; $('tbBig').classList.toggle('gold', big === REL);
  $('tbSwing').classList.toggle('gold', sw === REL); $('tbCast').classList.toggle('gold', ca === REL); $('tbCast').classList.toggle('off', !ui.castOk);
}
applyControls();
if (input.st.touch) $('goBtn').textContent = L('▶ 시작', '▶ Start');   // 폰에는 마우스 고정이 없다
function playerInput() {
  if (!S.adv && assist) {   // 쉬운 조작: 버튼 셋(좌클릭·E = 휘두르기, 우클릭 = 마법, Space = 피하기)을 assist가 입력으로 바꾼다
    const inp = assist.step({ move: input.axes(), look: [ctl.yaw, ctl.pitch], cast: input.st.rmb, big: input.held('KeyQ') || input.st.big, swing: input.st.lmb || input.held('KeyE'), dodge: input.held('Space') }, TICK);
    if (ctl.surrender) inp.surrender = true;
    return inp;
  }
  const inp = idleInput(), [ax, ay] = input.axes(), st = player.rider.state;
  inp.move = [ax, ay];
  inp.gallop = input.held('ShiftLeft') || input.held('ShiftRight') || input.st.run;
  inp.duck = input.held('Space') && st === 'mounted';
  inp.thrust = input.held('KeyC') || input.held('AltLeft') || input.held('AltRight');
  inp.reach = ctl.reach;
  inp.swing = input.st.lmb && !inp.duck && !inp.thrust;
  inp.hand = [ctl.hand[0], ctl.hand[1]];
  inp.charge = input.st.rmb && !inp.swing && !inp.thrust;
  inp.big = (input.held('KeyR') || input.st.big) && !inp.swing && !inp.thrust;
  inp.grab = input.held('KeyQ');
  inp.look = [ctl.yaw, ctl.pitch];
  if (ctl.mountReq) { inp.mount = true; ctl.mountReq = false; }
  if (ctl.kickReq) { inp.kick = true; ctl.kickReq = false; }
  if (ctl.surrender) inp.surrender = true;
  return inp;
}

// ---------- 사건 → 효과 ----------
let slowT = 0, hitStop = 0, slowUser = false;
const voiceCd = new Map();
function nearCam(pos, r = 25) { return camera.position.distanceTo(V(pos.x, pos.y, pos.z)) < r; }
function voice(f, kindV, v = 1) {
  const now = performance.now() / 1000, last = voiceCd.get(f.i) || 0;
  if (now - last < 0.28) return; voiceCd.set(f.i, now);
  audio.play('voice', f.rider.body.translation(), v, VOICE[f.char] || 1, kindV);
}
function flingHat(i, vel) {
  const s = vis.fighters[i]; if (!s || !s.hatOn) return;
  const hat = s.w.hat, wp = V(), wq = new THREE.Quaternion(); hat.getWorldPosition(wp); hat.getWorldQuaternion(wq);
  const clone = hat.clone(true); clone.quaternion.copy(wq); hat.getWorldScale(clone.scale); hat.visible = false; s.hatOn = false;   // 진짜 모델이면 모자가 머리 뼈 밑에 있어 세계 크기로
  fx.fling(clone, wp, vel);
}
const PRACTICE = [
  { key: 'cast', text: L('질주하며 마법 쏘기 (우클릭 누르기→떼기)', 'Cast while galloping (hold right-click → release)'), tt: L('질주하며 마법 쏘기 (마법 누르기→떼기)', 'Cast while galloping (hold Magic → release)'), sm: L('질주하며 마법 쏘기 ({마법} 누르고 있다가 금색에 떼기)', 'Cast while galloping (hold {마법}, release on gold)') },
  { key: 'hit', text: L('휘둘러 맞히기 (좌클릭 누른 채 마우스)', 'Land a swing (hold left-click and move the mouse)'), tt: L('휘둘러 맞히기 (휘두르기 누른 채 화면 끌기)', 'Land a swing (hold Swing and drag the screen)'), sm: L('휘둘러 맞히기 ({휘두르기} 누르고 있다가 금색에 떼기)', 'Land a swing (hold {휘두르기}, release on gold)') },
  { key: 'thrust', text: L('찌르기로 맞히기 (C 누른 채 마우스 앞으로)', 'Land a thrust (hold C, push the mouse forward)'), tt: L('찌르기로 맞히기 (찌르기 누른 채 화면을 위로)', 'Land a thrust (hold Thrust, drag up)'), sm: L('마상창으로 찌르기 (창을 쥐면 {휘두르기} = 찌르기)', 'Thrust with the lance (holding a lance, {휘두르기} = thrust)') },
  { key: 'deflect', text: L('날아오는 마법 쳐내기 (휘두르기)', 'Parry an incoming spell (swing)'), sm: L('날아오는 마법 쳐내기 (버튼이 "쳐내기"일 때 {휘두르기})', 'Parry an incoming spell ({휘두르기} when the button reads "Parry")') },
  { key: 'unhorse', text: L('허수아비 낙마시키기', 'Knock the scarecrow off its horse') },
  { key: 'grab', text: L('옆 기수 잡기 (Q 누르고 있기)', 'Grab a rider alongside (hold Q)'), tt: L('옆 기수 잡기 (잡기 누르고 있기)', 'Grab a rider alongside (hold Grab)'), adv: true },
  { key: 'throw', text: L('지팡이 던지기 (휘두르는 중 E)', 'Throw your staff (E while swinging)'), tt: L('지팡이 던지기 (휘두르는 중 줍기)', 'Throw your staff (Pick up while swinging)'), adv: true },
  { key: 'pickup', text: L('지팡이 줍기 (떨어진 지팡이 옆에서 E)', 'Pick up a staff (E beside a dropped staff)'), tt: L('지팡이 줍기 (떨어진 지팡이 옆에서 줍기)', 'Pick up a staff (Pick up beside a dropped staff)'), sm: L('무기 바꿔 쥐기 (무기 더미 옆에서 천천히 → "줍기")', 'Swap weapons (go slowly beside the weapon pile → "Pick up")') },
  { key: 'kick', text: L('걸어서 발차기 (Space)', 'Kick on foot (Space)'), tt: L('걸어서 발차기 (숙이기)', 'Kick on foot (Duck)'), sm: L('걸어서 발차기 ({피하기})', 'Kick on foot ({피하기})') },
  { key: 'mount', text: L('다시 타기 (멈춘 빈 말 옆에서 E)', 'Remount (E beside a stopped riderless horse)'), tt: L('다시 타기 (멈춘 빈 말 옆에서 타기)', 'Remount (Mount beside a stopped riderless horse)'), sm: L('다시 타기 (빈 말 옆에서 "타기")', 'Remount (beside a riderless horse → "Mount")') },
];
// 쉬운 조작의 버튼 이름: 폰은 화면 버튼, PC는 마우스·키
const BTN_PC = LANG === 'en' ? { 마법: 'right-click', 휘두르기: 'left-click', 피하기: 'Space' } : { 마법: '우클릭', 휘두르기: '좌클릭', 피하기: 'Space' };
const BTN_TOUCH_EN = { 마법: 'Magic', 휘두르기: 'Swing', 피하기: 'Duck' };   // 폰 화면 버튼 이름
const bname = (n) => (input.st.touch ? (LANG === 'en' ? BTN_TOUCH_EN[n] || n : n) : BTN_PC[n] || n);
const ptext = (p) => (!S.adv ? (p.sm || p.text).replace(/\{(\S+?)\}/g, (_, n) => bname(n)) : (input.st.touch && p.tt) || p.text);
const SIMPLE_ORDER = ['cast', 'hit', 'deflect', 'unhorse', 'pickup', 'thrust', 'kick', 'mount'];
const practiceItems = () => (S.adv ? PRACTICE : SIMPLE_ORDER.map((k) => PRACTICE.find((p) => p.key === k))).map((p) => ({ key: p.key, text: ptext(p) }));
function practiceTick(key) { if (kind === 'practice' && hud.practiceDone(key)) { audio.play('chime', [784, 1046]); hud.toast('✔ ' + ptext(PRACTICE.find((p) => p.key === key)), 1.6, 'pr'); } }
function handleEvents(evs) {
  const pi = player ? player.i : -1, ectx = vfxCtx(curF);
  for (const e of evs) {
    const P = e.pos ? V(e.pos.x, e.pos.y, e.pos.z) : null;
    elemFx.onEvent(e, ectx);   // 원소 마법 그림 (소리·HUD는 아래)
    const F = (i) => match.fighters[i];
    switch (e.type) {
      case 'cast': {
        const f = F(e.i);
        if (e.kind !== 'fireball') fx.flash(P, f.ch.color, 0.8 + e.frac * 2.2, 0.2);
        audio.play('cast', P, 0.6 + e.frac * 0.7, e.frac);
        if (e.frac > 0.4) voice(f, 'huff', 0.7);
        if (e.i === pi && tst) { tst.casts++; if (player.horse >= 0 && match.horses[player.horse].speed / Math.sqrt(Math.max(0.05, 1 - e.frac)) > 9) tst.fast++; }   // 쏘기 전 속도로 질주 중이었나
        if (e.i === pi) { cam.shake += 0.12 + e.frac * 0.3; cam.fovKick += 4 + e.frac * 10; tut.cast = true; if (player.horse >= 0 && match.horses[player.horse].speed > 6) practiceTick('cast'); }
        break;
      }
      case 'explode': {
        if (e.kind !== 'fireball') fx.explosion(P, new THREE.Color(F(e.owner).ch.color).lerp(new THREE.Color(0xffffff), 0.3).getHex(), e.r);
        audio.play('boom', P, 0.45 + Math.min(1, e.E / CFG.spell.eRef) * 0.8);
        const d = camera.position.distanceTo(P); cam.shake += Math.max(0, 1 - d / 22) * (0.25 + e.E / CFG.spell.eRef * 0.4);
        const me = e.hits.find((h) => h.i === pi);
        if (me) hud.flash(0.25 + me.dmg / 70);
        for (const h of e.hits) if (h.J > 60) headKick(vis, h.i, V(match.fighters[h.i].rider.body.translation().x - P.x, 0, match.fighters[h.i].rider.body.translation().z - P.z).normalize(), Math.min(9, h.J / 25), vis.fighters[h.i].w.root.quaternion);
        if (e.deflected && e.hits.length && e.owner === pi) hud.feed(L(`↩ 되받아친 마법이 ${e.hits.map((h) => colorName(F(h.i))).join(', ')}에게 명중!`, `↩ The deflected spell hit ${e.hits.map((h) => colorName(F(h.i))).join(', ')}!`));
        arena.setCheer(0.25);
        break;
      }
      case 'hurt': {
        const f = F(e.i);
        voice(f, e.d > 16 || e.cause === 'fall' && e.d > 8 ? 'cry' : 'grunt', Math.min(1.3, 0.5 + e.d / 25));
        // 피해 숫자 · 몸 번쩍임 · 맞힘 표시 · 맞은 방향
        const tp = f.rider.body.translation(), at = V(tp.x, tp.y + (e.part === 'head' ? 1.2 : 0.9), tp.z);
        const cls = e.i === pi ? 'me' : e.part === 'head' ? 'head' : e.cause === 'fall' ? 'minor' : e.d > 18 ? 'big' : '';
        if (e.d >= 0.5) hud.damage(e.i, at, e.d, cls);
        if (e.cause !== 'fall') flashFighter(vis, e.i, e.d);
        if (e.by === pi && e.i !== pi && e.d >= 1) { hud.hitMarker(e.part === 'head' ? 'head' : ''); audio.play('tick'); }
        if (e.i === pi && e.by >= 0 && e.by !== pi) {
          const src = F(e.by).rider.body.translation(), d = V(src.x, src.y, src.z).sub(camera.position).applyQuaternion(camera.quaternion.clone().invert());
          hud.damageFrom(Math.atan2(d.x, -d.z));
        }
        break;
      }
      case 'hit': {
        const head = e.part === 'head', g = F(e.j);
        const word = e.thrown ? L('휙-퍽!', 'Whoosh-thunk!') : e.thrust ? L('푹!', 'Stab!') : e.fist ? L('퍽!', 'Pow!') : head ? L('퍽!', 'Bonk!') : L('쿵!', 'Thud!');
        const sc = clamp(camera.position.distanceTo(P) / 9, 1, 3.2);   // 멀수록 크게 그려서 화면에서 잘 보이게
        fx.burst(P, e.thrust ? 0xff9cff : head ? 0xffe14d : 0xffb37a, sc, e.s > 14 || head);
        fx.stars(P, head ? 10 : 6, 0xffe14d, sc); fx.pop(word, P, e.thrust ? '#ffb3ff' : head ? '#ffe14d' : '#ffb37a', (1.1 + Math.min(1, e.s / 20)) * sc);
        audio.play('hit', P, Math.min(1.4, 0.4 + e.s / 14), head, e.fist ? 'fist' : e.item === 'iron' || e.item === 'mace' ? 'metal' : 'wood');
        const dir = V(g.rider.body.translation().x - P.x, 0, g.rider.body.translation().z - P.z).normalize();
        headKick(vis, e.j, dir, Math.min(10, e.J / (head ? 14 : 28)), vis.fighters[e.j].w.root.quaternion);
        if (head && e.dmg > 6) { const b = addBump(vis, e.j, P); if (b) bumpsGrowing.push(b); }
        if (e.j === pi) { cam.shake += 0.25 + e.s / 35; hud.flash(0.2 + e.dmg / 80); if (tst) tst.taken++; }
        if (e.i === pi) {
          hitStop = 0.05 + Math.min(0.06, e.s / 400); cam.shake += 0.1; tut.hit = true;
          if (e.thrust) practiceTick('thrust'); else if (!e.thrown) practiceTick('hit');
          if (e.s > 14 && nearCam(P, 30)) audio.play('ooh', 0.6);
        }
        break;
      }
      case 'clash': fx.sparks(P, e.metal ? 0xffe9b0 : 0xffffff, 10, 5); audio.play(e.metal ? 'clank' : 'clack', P, Math.min(1.2, e.s / 10)); break;
      case 'disarm': {
        fx.sparks(P, 0xffe9b0, 18, 8); fx.pop(L('쨍!', 'Clang!'), P, '#fff3a0', 1.3);
        audio.play('clank', P, 1); audio.play('ooh', 0.8);
        hud.feed(L(`💥 ${CJ(F(e.i), '이/가')} ${colorName(F(e.j))}의 지팡이를 쳐냈다!`, `💥 ${colorName(F(e.i))} knocked ${colorName(F(e.j))}’s staff away!`));
        if (e.j === pi) hud.toast(L('지팡이를 놓쳤다! 떨어진 지팡이 옆에서 <kbd>E</kbd>로 줍기 (남의 것도 된다)', 'You lost your staff! Press <kbd>E</kbd> beside a dropped staff to pick it up (anyone’s will do)'), 4, 'disarm');
        break;
      }
      case 'drop': if (e.cause !== 'throw') audio.play('rattle', P, 0.7); break;
      case 'clatter': audio.play('rattle', P, Math.min(1, e.s / 8)); break;
      case 'throw': audio.play('throw', P, 1); if (e.i === pi) { practiceTick('throw'); hud.toast(L('던졌다! 이제 맨손 — 주먹으로 싸우거나 지팡이를 주워라', 'Thrown! Bare-handed now — fight with fists or pick up a staff'), 2.5, 'throw'); } else voice(F(e.i), 'huff', 0.6); break;
      case 'pickup': audio.play('pickup', P, 1); if (e.i === pi) { practiceTick('pickup'); hud.toast(L(`${J(match.weapons[e.w].item.name, '을/를')} 쥐었다`, `Picked up ${match.weapons[e.w].item.name}`), 1.6, 'pickup'); } break;
      case 'grab': voice(F(e.i), 'huff', 0.8); if (e.i === pi) { practiceTick('grab'); hud.toast(L('잡았다! 말을 몰아 멀어지면 끌어내린다 · Q를 떼면 놓는다', 'Grabbed! Ride away to drag them off · release Q to let go'), 2.5, 'grab'); } if (e.j === pi) hud.toast(L(`😨 ${CJ(F(e.i), '이/가')} 나를 잡았다!`, `😨 ${colorName(F(e.i))} grabbed you!`), 2, 'grabbed'); break;
      case 'grabMiss': if (e.i === pi) hud.toast(L('잡을 게 없다 (1m 안의 기수나 빈 말)', 'Nothing to grab (a rider or empty horse within 1 m)'), 1.4, 'gm'); break;
      case 'kick':
        if (e.miss) { audio.play('whoosh', P, 0.5); break; }
        audio.play('kick', P, 1); fx.pop(L('뻥!', 'Bam!'), P, '#ffd27a', 1.2); fx.dust(P, 4);
        if (e.i === pi) practiceTick('kick');
        break;
      case 'knockdown': fx.dust(P, 8, 0xe8d2a8, 1); audio.play('ooh', 0.7); if (nearCam(P) || e.i === pi) slowT = Math.max(slowT, 0.45); if (e.i === pi) { hud.center(L('넘어졌다!', 'Knocked down!'), 1.2); cam.shake += 0.5; } lastBig = { tick: match.tick, focus: e.i, by: e.by }; if (e.i === pi || e.by === pi) queueReplay(e.i); break;
      case 'unhorse': {
        const f = F(e.i), by = e.by >= 0 ? F(e.by) : null;
        audio.play('neigh', P, 0.9); audio.play('cheer', 1); arena.setCheer(1);
        fx.dust(P, 8, 0xe8d2a8, 1);
        const v = f.rider.body.linvel(); flingHat(e.i, V(v.x * 0.6 + (Math.random() - 0.5) * 3, 4 + Math.random() * 3, v.z * 0.6 + (Math.random() - 0.5) * 3));
        const grabbed = by && by.grab && by.grab.kind === 'rider' && by.grab.i === f.i;
        const how = { gust: '돌풍으로 ', tornado: '회오리로 ', fissure: '땅가르기로 ', wall: '흙벽으로 ', whip: '물채찍으로 끌어 ', ice: '빙판에서 ', fireball: '화염구로 ', firetrail: '불길로 ', orb: '' }[e.spell] || '';
        const howEn = { gust: ' with a gust', tornado: ' with a tornado', fissure: ' with a fissure', wall: ' with an earth wall', whip: ' with a water whip', ice: ' on the ice', fireball: ' with a fireball', firetrail: ' with a fire trail', orb: '' }[e.spell] || '';
        hud.feed(by && by !== f ? L(`🐴 ${CJ(by, '이/가')} ${CJ(f, '을/를')} ${grabbed ? '잡아 끌어내렸다!' : how + '낙마시켰다!'}`, `🐴 ${colorName(by)} ${grabbed ? 'dragged' : 'unhorsed'} ${colorName(f)}${grabbed ? ' off their horse' : howEn}!`) : L(`🐴 ${CJ(f, '이/가')} 말에서 떨어졌다!`, `🐴 ${colorName(f)} fell off their horse!`));
        if (e.i === pi || e.by === pi || nearCam(P)) slowT = 0.65;
        if (e.i === pi && tst) tst.fell++;
        if (e.i === pi) { hud.center(L('낙마!', 'Unhorsed!'), 1.4); hud.toast(L('떨어져도 끝이 아니다! 비틀대며 일어나서 빈 말 옆에서 <kbd>E</kbd>', 'It is not over! Get up, then press <kbd>E</kbd> beside a riderless horse'), 5); cam.shake += 0.6; }
        if (e.by === pi) { hud.center(grabbed ? L('끌어내렸다!', 'Dragged off!') : L('낙마시켰다!', 'Unhorsed!'), 1.2); practiceTick('unhorse'); }
        lastBig = { tick: match.tick, focus: e.i, by: e.by };
        if (e.i === pi || e.by === pi) queueReplay(e.i);
        break;
      }
      case 'land': fx.dust(P, 6, 0xe8d2a8, 0.8); audio.play('thud', P, Math.min(1.2, e.s / 8)); if (match.fighters[e.i] === player) cam.shake += 0.3; break;
      case 'mount': audio.play('neigh', match.horses[e.k].body.translation(), 0.4); if (e.i === pi) { hud.center(L('다시 탔다!', 'Remounted!'), 1); hud.hideToast(); practiceTick('mount'); } break;
      case 'mountFail': if (e.i === pi) hud.toast(L('말이 너무 멀거나 아직 달리고 있다 (겁먹은 말은 Q로 머리를 잡아 세운다)', 'The horse is too far or still running (hold Q to grab a spooked horse by the head and stop it)'), 2, 'mf'); break;
      case 'ko': {
        const f = F(e.i), by = e.by >= 0 ? F(e.by) : null;
        fx.stars(P, 12, 0xffffff); fx.pop(L('기절!', 'KO!'), P, '#ff7a6a', 1.8 * clamp(camera.position.distanceTo(P) / 9, 1, 3));
        if (e.by === pi && e.i !== pi) hud.hitMarker('kill');
        if (e.i === pi && tst) tst.koMe++;
        audio.play('boom', P, 0.4); audio.play('cheer', 1.2); arena.setCheer(1); voice(f, 'cry', 1.2);
        flingHat(e.i, V((Math.random() - 0.5) * 4, 5, (Math.random() - 0.5) * 4));
        hud.feed(L(`💤 ${CJ(f, '이/가')} 기절했다${by && by !== f ? ` (${colorName(by)})` : ''}`, `💤 ${colorName(f)} was knocked out${by && by !== f ? ` (${colorName(by)})` : ''}`));
        slowT = Math.max(slowT, 0.5);
        lastBig = { tick: match.tick, focus: e.i, by: e.by };
        break;
      }
      case 'revive': if (kind === 'practice') hud.feed(L(`🎯 ${CJ(F(e.i), '이/가')} 다시 일어났다`, `🎯 ${colorName(F(e.i))} got back up`)); break;
      case 'trample': fx.dust(P, 8); audio.play('bonk', P, 1.2, false); hud.feed(L(`🐎 ${colorName(F(e.j))} 말발굽에 밟혔다!`, `🐎 ${colorName(F(e.j))} was trampled!`)); if (e.j === pi) { cam.shake += 0.7; hud.flash(0.4); } break;
      case 'buck': audio.play('neigh', match.horses[e.k].body.translation(), 0.8); if (e.i === pi) hud.toast(L(`😱 ${J(match.horses[e.k].def.name, '이/가')} 겁에 질려 날뛴다! 마법을 아끼고 속도를 줄여요`, `😱 ${match.horses[e.k].def.name} is panicking and bucking! Save your mana and slow down`), 2.5, 'buck'); break;
      case 'winded': if (player && e.i === pi) { audio.play('neigh', match.horses[e.k].body.translation(), 0.5); hud.toast(L(`😮‍💨 ${J(match.horses[e.k].def.name, '이/가')} 숨이 찼다! 숨이 돌아올 때까지 질주 못 한다`, `😮‍💨 ${match.horses[e.k].def.name} is winded! No galloping until it catches its breath`), 3, 'winded'); } break;
      case 'fence': audio.play('creak', P, 0.7); fx.dust(P, 3); break;
      case 'propHit': audio.play('propThud', P, Math.min(1, e.s / 10)); fx.dust(P, 4, 0xe2c169, 0.8); break;
      case 'bump': audio.play('thud', P, 0.6); break;
      case 'hitHorse': audio.play('bonk', P, 0.5, false); break;
      case 'deflect':
        fx.flash(P, 0x9fe8ff, 1.6, 0.25); fx.sparks(P, 0x9fe8ff, 16, 8); fx.pop(L('팅!', 'Ting!'), P, '#9fe8ff', 1.2);
        audio.play('ting', P, 1);
        if (e.i === pi) { hud.toast(L('↩ 되받아치기! 휘두른 방향으로 날아간다', '↩ Deflected! It flies the way you swung'), 2.5); hitStop = 0.06; tut.deflect = true; practiceTick('deflect'); }
        break;
      case 'surrender': hud.feed(L(`🏳 ${colorName(F(e.i))} 항복`, `🏳 ${colorName(F(e.i))} surrendered`)); break;
      // ---------- 4원소 마법 ----------
      case 'gust': audio.play('whoosh', P, 1.2); audio.play('boom', P, 0.4); if (e.i === pi) { cam.shake += 0.3; tut.cast = true; } break;
      case 'wallUp': audio.play('propThud', P, 1); audio.play('thud', P, 0.8); if (e.i === pi) tut.cast = true; break;
      case 'wallDown': break;
      case 'wallCrash': audio.play('thud', P, 1.3); audio.play('ooh', 0.9); hud.feed(L(`🧱 ${e.i >= 0 ? colorName(F(e.i)) + '의 말' : '빈 말'}이 흙벽에 박았다!`, `🧱 ${e.i >= 0 ? colorName(F(e.i)) + '’s horse' : 'A riderless horse'} crashed into the earth wall!`)); if (e.i === pi) cam.shake += 0.7; break;
      case 'whip': audio.play('throw', P, 0.9); if (e.i === pi) tut.cast = true; if (e.j === pi) hud.toast(L(`😨 ${CJ(F(e.i), '이/가')} 물채찍으로 나를 묶었다! 더 빨리 달려라`, `😨 ${colorName(F(e.i))} tied you up with a water whip! Ride faster`), 2.5, 'whipped'); break;
      case 'whipMiss': if (e.i === pi) hud.toast(L('물채찍이 빗나갔다 (14m 안의 상대를 겨눠라)', 'The water whip missed (aim at a rival within 14 m)'), 1.6, 'wm'); break;
      case 'whipCut': break;
      case 'iceUp': audio.play('ting', P, 0.8); if (e.i === pi) tut.cast = true; break;
      case 'slip': audio.play('neigh', P, 0.9); hud.feed(L(`🧊 ${colorName(F(e.i))}의 말이 빙판에서 미끄러졌다!`, `🧊 ${colorName(F(e.i))}’s horse slipped on the ice!`)); break;
      case 'tornado': audio.play('whoosh', P, 1.4); if (e.i === pi) tut.cast = true; break;
      case 'fireTornado': hud.feed(L('🔥🌪️ 불 회오리!', '🔥🌪️ Fire tornado!')); break;
      case 'swallow': break;
      case 'fissure': audio.play('boom', P, 0.7); audio.play('thud', P, 1); if (e.i === pi) { cam.shake += 0.25; tut.cast = true; } break;
      case 'trip': audio.play('neigh', P, 1); hud.feed(L(`⛰️ ${e.i >= 0 ? colorName(F(e.i)) + '의 말' : '빈 말'}이 고꾸라졌다!`, `⛰️ ${e.i >= 0 ? colorName(F(e.i)) + '’s horse' : 'A riderless horse'} stumbled and fell!`)); break;
      case 'trail': if (e.on) { audio.play('cast', P, 0.5, 0.2); if (e.i === pi) tut.cast = true; } break;
      case 'zoneFear': if (e.add > 40) audio.play('neigh', P, 0.6); break;
      case 'steam': audio.play('whoosh', P, 0.8); hud.feed(L('♨️ 불과 얼음이 만나 김이 솟았다', '♨️ Fire met ice and steam rose')); break;
      case 'iceBreak': audio.play('ting', P, 1); break;
      case 'getup': if (e.i === pi) hud.toast(L('일어났다! <kbd>WASD</kbd> 걷기 · <kbd>Shift</kbd> 뛰기 · <kbd>Space</kbd> 발차기 · 빈 말 옆에서 <kbd>E</kbd>', 'Up! <kbd>WASD</kbd> walk · <kbd>Shift</kbd> run · <kbd>Space</kbd> kick · <kbd>E</kbd> beside a riderless horse'), 3.5); break;
    }
  }
}

// ---------- 다시 보기 (킬캠) ----------
function queueReplay(focus) {
  if (!S.replay || kind === 'practice' || kind === 'trial' || replay || pendingReplay || replayCd > 0 || !match || match.over) return;
  pendingReplay = { at: performance.now() / 1000 + 0.55, focus, tick: match.tick };
}
function startReplay(focus, tick, onDone) {
  const from = tick - 85, list = frames.filter((fr) => fr.tick >= from);
  if (list.length < 20) { if (onDone) onDone(); return; }
  replay = { list, pos: 0, evK: 0, focus, onDone, ang: Math.random() * 6 };
  hud.replay(true); audio.play('replay');
  replayCd = 8;
}
function endReplay() {
  if (!replay) return;
  const done = replay.onDone; replay = null; hud.replay(false); acc = 0;
  // 지금 상태로 되돌린다 (주문 그림을 지금 것으로)
  for (const id of fx.spellIds()) fx.spellEnd(id);
  for (const id of elemFx.fireballIds()) elemFx.fireballEnd(id);
  if (done) done();
}

// ---------- 튜토리얼 (첫 시합) ----------
let tut = {};
function tutorialTick() {
  if (!fightDef || !fightDef.tutorial || !player || match.t < 0) return;
  const p = player, sp = p.horse >= 0 ? match.horses[p.horse].speed : 0;
  if (!S.adv) {   // 쉬운 조작: 바운코처럼 한 단계씩
    const B = (n) => `<b>${bname(n)}</b>`;
    if (!tut.s1) { tut.s1 = true; hud.toast(L(`1 · 말은 저절로 달린다. ${input.st.touch ? '스틱을 끝까지 밀면' : '<kbd>W</kbd>를 누르면'} 질주 — 빠를수록 <b>마력</b>이 찬다`, `1 · The horse runs on its own. ${input.st.touch ? 'Push the stick all the way' : 'Hold <kbd>W</kbd>'} to gallop — the faster you go, the more <b>mana</b> you have`), 6); return; }
    if (!tut.s2 && sp > 8) { tut.s2 = true; hud.toast(L(`2 · ${B('마법')}을 누르고 있다가, 상대 둘레 조준선이 <b style="color:#b8860b">금색</b>이 되면 떼라`, `2 · Hold ${B('마법')}, and release when the ring around a rival turns <b style="color:#b8860b">gold</b>`), 7); return; }
    if (tut.cast && !tut.s3) { tut.s3 = true; hud.toast(L(`3 · ${B('휘두르기')}를 누르고 있으면 말이 상대 옆으로 붙는다. 금색일 때 떼면 친다`, `3 · Hold ${B('휘두르기')} and your horse closes in beside the rival. Release on gold to strike`), 7); return; }
    if (tut.hit && !tut.s4) { tut.s4 = true; hud.toast(L(`4 · 맞을 것 같으면 ${B('피하기')}(숙이기). 버튼 이름이 바뀌면 그 일을 한다 (쳐내기·줍기·타기)`, `4 · If you are about to get hit, ${B('피하기')} (duck). When the button name changes, it does that instead (Parry · Pick up · Mount)`), 7); return; }
    if (!tut.s5 && match.spells.some((s) => s.owner !== p.i)) { tut.s5 = true; hud.toast(L(`마법이 날아온다! ${B('휘두르기')} = 쳐내기로 되받아쳐라`, `A spell is incoming! ${B('휘두르기')} = parry it back`), 3.5); }
    return;
  }
  if (!tut.s1) { tut.s1 = true; hud.toast(L('<kbd>W</kbd> 박차! 빨리 달릴수록 지팡이 끝과 조준 고리가 밝아진다 = <b>마력</b>', '<kbd>W</kbd> to spur! The faster you ride, the brighter the staff tip and aim ring = <b>mana</b>'), 6); return; }
  if (!tut.s2 && sp > 9) { tut.s2 = true; hud.toast(L('좋아! 이제 <b>우클릭을 누르고 있다가 떼면</b> 발사. 쏜 만큼 말이 느려진다', 'Good! Now <b>hold right-click and release</b> to fire. Your horse slows by what you spend'), 7); return; }
  if (tut.cast && !tut.s3) { tut.s3 = true; hud.toast(L('<b>좌클릭을 누른 채 마우스를 휘두르면</b> 지팡이로 친다. 스치며 머리를 노려라', '<b>Hold left-click and swing the mouse</b> to strike with the staff. Ride past close and aim for the head'), 7); return; }
  if (tut.hit && !tut.s4) { tut.s4 = true; hud.toast(L('<kbd>C</kbd>를 누르고 마우스를 앞으로 밀면 <b>찌르기</b> · <kbd>Q</kbd>로 옆 기수를 <b>잡아 끌어내린다</b>', 'Hold <kbd>C</kbd> and push the mouse forward to <b>thrust</b> · <kbd>Q</kbd> <b>grabs and drags</b> a rider alongside'), 7); return; }
  if (tut.s4 && !tut.s6 && match.t > 50) { tut.s6 = true; hud.toast(L('바깥 초록 고리 = 기운. 계속 휘두르면 힘이 빠진다 · 말도 질주하면 숨이 찬다', 'The outer green ring = stamina. Swinging nonstop tires you · a galloping horse runs out of breath too'), 6); return; }
  if (!tut.s5 && match.spells.some((s) => s.owner !== p.i)) { tut.s5 = true; hud.toast(L('날아오는 마법을 <b>지팡이로 후려치면</b> 되돌아간다!', 'Swat an incoming spell <b>with your staff</b> and it flies back!'), 4); }
}

// ---------- 화면 ----------
const screens = ['title', 'hub', 'pre', 'result', 'ending', 'pause', 'settings', 'free', 'rotateTip', 'shopScreen', 'jobs'];
function show(id) { for (const s of screens) $(s).classList.toggle('hidden', s !== id); }
let display = null;   // 마구간 화면의 말·마법사
const _a = V(), _b = V(), _e = V();
function poseLimb(seg2, S0, Tg, la, lb, pole) { const end = solveIK(S0, Tg.clone(), la, lb, pole, _e); placeSeg(seg2.upper, S0, _e); placeSeg(seg2.lower, _e, end); return end; }
const localOf = (Tt, x, y, z, out = V()) => out.set(x, y, z).applyQuaternion(Tt.q).add(Tt.p);
function buildDisplay() {
  if (display) scene.remove(display.group);
  const g = new THREE.Group(); scene.add(g);
  const hv = buildHorse('gojip', CHARS.maji.color); g.add(hv.root);
  const y = (0.85 + 0.43) + 0.02; hv.root.position.set(0, y, 0);
  const w = buildWizard('maji', career.loadout, career.jobTier > 0 ? career.job : null); g.add(w.root);
  w.root.position.set(0, y + 0.47, -0.12);
  const st = buildStaff(career.loadout.staff); g.add(st.group);
  st.group.position.set(-0.45, y + 1.0, 0.3); st.group.rotation.set(0.35, 0, 0.25);
  const limbs = buildLimbs(CHARS.maji); g.add(limbs.group);
  display = { group: g, hv, w, st, limbs, y };
}
function poseDisplay(dt, t) {
  if (!display) return;
  const d = display, Tt = { p: d.w.root.position, q: d.w.root.quaternion };
  animateHorse(d.hv, 0, dt, 0, t);
  d.w.root.rotation.z = Math.sin(t * 1.3) * 0.02;
  const sR = localOf(Tt, -0.2, 0.66, 0.06, _a), sL = localOf(Tt, 0.2, 0.66, 0.06, _b);
  const grip = V(0, -d.st.len * 0.25, 0).applyQuaternion(d.st.group.quaternion).add(d.st.group.position);
  poseLimb(d.limbs.R, sR, grip, 0.33, 0.31, V(-0.8, -0.8, -0.5)); d.limbs.R.hand.position.copy(grip);
  const lh = V(0.06, d.y + 0.72, 0.42); poseLimb(d.limbs.L, sL, lh, 0.33, 0.31, V(0.8, -0.8, -0.5)); d.limbs.L.hand.position.copy(lh);
  for (const side of [1, -1]) {
    const leg = side > 0 ? d.limbs.legL : d.limbs.legR, hip = localOf(Tt, 0.12 * side, 0, 0, V()), foot = V(0.47 * side, d.y - 0.48, 0);
    const end = poseLimb(leg, hip, foot, 0.43, 0.43, V(0.3 * side, 0, 1)); leg.foot.position.copy(end);
  }
  d.st.glow.scale.setScalar(0.3 + Math.sin(t * 2) * 0.05);
  if (rig && S.models === 'real') { if (!d.rig) rig.attachDisplay(d, career.loadout); rig.updateDisplay(d); }   // 진짜 모델이면 위 도형 자세를 따라간다
  cam.cineAng += dt * 0.25;
  camera.position.set(Math.sin(cam.cineAng) * 6.2, 2.7, Math.cos(cam.cineAng) * 6.2);
  camera.lookAt(0, 2.0, 0); camera.fov = fitFov(50);
  if (vp.w > 1100 && mode === 'hub') camera.setViewOffset(vp.w, vp.h, -vp.w * 0.27, 0, vp.w, vp.h);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}

function chipHTML(id, extra = '') { const c = CHARS[id]; return `<span class="chip"><i style="background:${c.css}"></i>${c.name}${extra}</span>`; }
function itemDesc(id) {
  const it = ITEMS[id];
  if (it.slot === 'staff') return L(`${it.mass}kg · 길이 ${it.len}${it.spellMul !== 1 ? ` · 마법 ×${it.spellMul}` : ''}${it.thrustMul ? ` · 찌르기 ×${it.thrustMul}` : ''}${it.tipMul ? ` · 끝 ×${it.tipMul}` : ''}`, `${it.mass}kg · length ${it.len}${it.spellMul !== 1 ? ` · spell ×${it.spellMul}` : ''}${it.thrustMul ? ` · thrust ×${it.thrustMul}` : ''}${it.tipMul ? ` · tip ×${it.tipMul}` : ''}`);
  if (it.slot === 'hat') return L(`머리 피해 ×${it.headMul}`, `Head damage ×${it.headMul}`);
  if (it.slot === 'robe') return L(`몸통 피해 ×${it.torsoMul} · 균형 ×${it.balance}`, `Torso damage ×${it.torsoMul} · balance ×${it.balance}`);
  if (id === 'saddle') return L('균형 ×1.4 · 속도 ×0.92', 'Balance ×1.4 · speed ×0.92');
  if (id === 'spurs') return L('가속 ×1.3 · 공포 ×1.3', 'Acceleration ×1.3 · fear ×1.3');
  return '';
}
// ---------- 마구간 · 상점 · 전직관 ----------
const SHOP_ICON = { stick: '🪵', oak: '🌳', iron: '⚙️', crystal: '💎', lance: '🔱', mace: '🔨', oldcone: '🎩', felt: '🎩', brass: '⛑️', rags: '👘', quilted: '🧥', nogear: '🐴', saddle: '🪑', spurs: '⭐' };
const STAT_ROWS = [['hit', L('⚔ 타격', '⚔ Strike'), 80], ['magic', L('✨ 마법', '✨ Magic'), 160], ['mana', L('🔋 마력통', '🔋 Mana Pool'), 100], ['hold', L('🛡 버티기', '🛡 Toughness'), 160]];
function statBars(a, b, why = '') {   // a: 지금(또는 보너스 없는 값), b: 바꾼 뒤
  return STAT_ROWS.map(([k, lb, max]) => {
    const x = a[k], y = b[k], lo = Math.min(x, y), hi = Math.max(x, y), d = y - x, up = d > 0;
    return `<div class="srow"><span class="lb">${lb}</span><span class="sbar"><b style="width:${Math.min(100, lo / max * 100)}%"></b>${d ? `<u class="${up ? '' : 'dn'}" style="left:${Math.min(100, lo / max * 100)}%;width:${Math.min(100, (hi - lo) / max * 100)}%"></u>` : ''}</span><span class="num ${up ? 'up' : d < 0 ? 'dn' : 'same'}">${y}${d ? ` (${up ? '+' : ''}${d})${why ? `<small> ${why}</small>` : ''}` : ''}</span></div>`;
  }).join('');
}
function worstOf(loadout) { let w = null; for (const id of Object.values(loadout)) if (ITEMS[id].price > 0 && (!w || ITEMS[id].price > ITEMS[w].price)) w = id; return w; }
const myJob = () => (career.jobTier > 0 ? career.job : null);
function oppChip(id, fight) {
  const c = CHARS[id], ov = fight.oppJob && fight.oppJob[id];
  let job = ov ? ov[0] : c.job;
  if (job === 'mimic') job = myJob();
  const Jb = job && JOBS[job], bad = Jb && myJob() && Jb.beats === myJob();
  return `<span class="chip${bad ? ' bad' : ''}"><i style="background:${c.css}"></i>${c.name}${Jb ? ` · ${Jb.icon} ${Jb.short}` : ''}${bad ? ' ▼' : ''}</span>`;
}
function renderHub() {
  const c = career, cf = currentFights(c), offer = jobOffer(c), Jb = myJob() ? JOBS[c.job] : null;
  $('rankBadge').textContent = (Jb ? L(`${Jb.icon} ${Jb.name} ${c.jobTier}차 · `, `${Jb.icon} ${Jb.name} T${c.jobTier} · `) : '') + rankName(c.rank) + (c.champion ? ' 🏆' : '');
  if (Jb) { $('rankBadge').style.background = Jb.css; $('rankBadge').style.color = '#2a1608'; } else { $('rankBadge').style.background = ''; $('rankBadge').style.color = ''; }
  $('rankBar').style.width = Math.min(100, c.points / cf.rank.unlock * 100) + '%';
  $('rankPts').textContent = L(`${c.points} / ${cf.rank.unlock}점`, `${c.points} / ${cf.rank.unlock} pts`);
  $('goldTxt').textContent = c.gold;
  $('hubStats').innerHTML = statBars(statsFor(c.loadout, null), statsFor(c.loadout, myJob()), L('전직', 'job'));
  const sl = slotsFor(myJob(), c.jobTier), big = Jb ? Jb.spells[1] : null, tch = input.st.touch;
  $('hubSpells').innerHTML = `<div><kbd>${tch ? L('마법', 'Magic') : L('우클릭', 'R-click')}</kbd> ${L('마법', 'Spell')}<b>${SPELLS[sl.main].icon} ${SPELLS[sl.main].name}</b></div>`
    + `<div class="${sl.big ? '' : 'lock'}"><kbd>${tch ? L('큰 마법', 'Big spell') : 'Q'}</kbd> ${L('큰 마법', 'Big spell')}<b>${sl.big ? SPELLS[sl.big].icon + ' ' + SPELLS[sl.big].name : '🔒 ' + (big ? SPELLS[big].name : L('전직하면 열림', 'Unlocks on advancement'))}</b>${sl.big ? '' : (Jb ? L('랭크 결정전을 이기면 2차 전직', 'Win the rank decider for the 2nd advancement') : L('첫 승리 뒤 전직관에서', 'At the Advancement Hall after your first win'))}</div>`;
  const worst = worstOf(c.loadout);
  $('gearRow').innerHTML = [['staff', L('지팡이', 'Staff')], ['hat', L('모자', 'Hat')], ['robe', L('로브', 'Robe')], ['gear', L('마구', 'Tack')]].map(([k, lb]) => { const id = c.loadout[k]; return `<div class="${id === worst ? 'risk' : ''}">${lb}<b>${SHOP_ICON[id] || ''}</b>${ITEMS[id].name} · ${ITEMS[id].tier}</div>`; }).join('');
  const ts = tierSum(c.loadout);
  $('hubRules').innerHTML = `<span>${L('등급 합', 'Tier sum')} ${ts} → ${L('포인트', 'points')} ×${tierMul(ts)}</span>${worst ? `<span class="warn">${L('압수 1순위', 'First to be confiscated')}: ${ITEMS[worst].name}</span>` : ''}${Jb ? `<span class="ok">${L('전직은 압수 안 됨', 'Advancement is never confiscated')}</span>` : ''}`;
  const nx = cf.next;
  $('nextTitle').textContent = offer ? (offer === 1 ? L('🔮 전직할 때다', '🔮 Time to advance') : L('🔮 2차 전직', '🔮 2nd advancement')) : nx.title;
  $('nextOpps').innerHTML = offer ? '' : nx.opp.map((id) => oppChip(id, nx)).join('');
  $('nextPersona').innerHTML = offer ? (offer === 1 ? L('첫 시합을 이겼다! 전직관에서 네 원소 중 하나를 골라 시험을 치르면 그 원소의 마법을 받는다.', 'You won your first fight! Pick one of the four elements at the Advancement Hall and pass its trial to receive that element’s magic.') : L('랭크 결정전을 이겼다! 전직관에서 큰 마법(Q)을 배운다.', 'You won the rank decider! Learn your big spell (Q) at the Advancement Hall.'))
    : [...new Set(nx.opp)].map((id) => `<b>${CHARS[id].name}</b>: ${PERSONA_TXT[CHARS[id].persona]}`).join('<br>');
  $('nextPts').textContent = offer ? '' : L(`이기면 기본 ${nx.base}점 × ${tierMul(ts)} + 낙마시킬 때마다 30 + 되받아쳐 맞힐 때마다 50`, `Win for ${nx.base} base pts × ${tierMul(ts)} + 30 per unhorsing + 50 per deflected hit`);
  $('fightBtn').textContent = offer ? L('🔮 전직관', '🔮 Advancement Hall') : L('⚔ 시합 시작', '⚔ Start Fight');
  $('fightBtn').classList.toggle('pulse', !!offer);
  $('bossTitle').textContent = cf.boss.title;
  $('bossPersona').innerHTML = cf.boss.opp.map((id) => `${oppChip(id, cf.boss)} ${PERSONA_TXT[CHARS[id].persona]}`).join('<br>');
  $('bossBtn').disabled = !cf.bossOpen || !!offer;
  $('bossBtn').textContent = offer ? L('🔮 전직 먼저', '🔮 Advance first') : cf.bossOpen ? L('👑 결정전 도전', '👑 Rank Decider') : L(`🔒 ${cf.rank.unlock}점이면 열림`, `🔒 Opens at ${cf.rank.unlock} pts`);
}
// 상점: 지팡이 / 옷·마구 탭, 카드를 고르면 스탯 4개 비교와 하프소드 규칙 알약
let shopTab = 'staff', shopSel = null;
function openShop(tab = shopTab) { shopTab = tab; shopSel = null; show('shopScreen'); renderShop(); }
function renderShop() {
  const c = career, ids = shopTab === 'staff' ? ['stick', 'oak', 'iron', 'crystal', 'lance', 'mace'] : ['oldcone', 'felt', 'brass', 'rags', 'quilted', 'nogear', 'saddle', 'spurs'];
  $('shopGold').textContent = c.gold;
  $('tabStaff').classList.toggle('on', shopTab === 'staff'); $('tabWear').classList.toggle('on', shopTab !== 'staff');
  $('shopNote').textContent = shopTab === 'staff' ? L('지팡이를 바꾸면 휘두르기와 마법 위력이 바뀐다', 'A new staff changes your swing and spell power') : L('옷과 마구를 바꾸면 버티기와 말 속도가 바뀐다', 'New clothes and tack change toughness and horse speed');
  const sel = shopSel || ids.find((id) => c.loadout[ITEMS[id].slot] === id) || ids[0];
  $('shopCards').innerHTML = ids.map((id) => {
    const it = ITEMS[id], own = c.inventory.includes(id), on = c.loadout[it.slot] === id;
    return `<div class="icard${id === sel ? ' sel' : ''}" data-id="${id}"><span class="tr">${L('등급', 'Tier ')}${it.tier}</span><div class="ic">${SHOP_ICON[id] || '❔'}</div><b>${it.name}</b>${on ? `<span class="eq">${L('들고 있음', 'Equipped')}</span>` : own ? `<span class="own">${L('가짐', 'Owned')}</span>` : `<div class="pr">🪙 ${it.price}</div>`}</div>`;
  }).join('');
  for (const el of $('shopCards').querySelectorAll('.icard')) el.onclick = () => { shopSel = el.dataset.id; audio.play('click'); renderShop(); };
  const it = ITEMS[sel], next = { ...c.loadout, [it.slot]: sel };
  const a = statsFor(c.loadout, myJob()), b = statsFor(next, myJob()), t0 = tierSum(c.loadout), t1 = tierSum(next);
  const own = c.inventory.includes(sel), on = c.loadout[it.slot] === sel, worst = it.price > 0 && worstOf(next) === sel;
  const Jb = myJob() ? JOBS[c.job] : null;
  $('shopDetail').innerHTML = `<h3>${it.name}<span class="tag">${L('등급', 'Tier')} ${it.tier}</span>${Jb ? `<span class="tag" style="background:${Jb.css}">${Jb.icon} ${Jb.bonusTxt} ${L('포함', 'incl.')}</span>` : ''}</h3><div class="note">${itemDesc(sel) || L('기본 장비', 'Starter gear')}</div>${statBars(a, b)}
    <div class="rule"><span>${L('장비 등급 합', 'Gear tier sum')} ${t0} → ${t1}</span><span>${L('이기면 포인트', 'Win points')} ×${tierMul(t0)} → <b class="${tierMul(t1) < tierMul(t0) ? 'num dn' : ''}">×${tierMul(t1)}</b></span>${worst ? `<span class="warn">${L('기절해서 지면 압수 1순위가 된다', 'First to be confiscated if you get knocked out')}</span>` : ''}</div>
    <div class="btnRow"><button id="shopAct" class="primary" ${on || (!own && c.gold < it.price) ? 'disabled' : ''}>${on ? L('들고 있음', 'Equipped') : own ? L('바로 들기', 'Equip') : L(`🪙 ${it.price} 사고 바로 들기`, `🪙 ${it.price} Buy & equip`)}</button></div>`;
  $('shopAct').onclick = () => { if (!own && !buy(c, sel)) return; equip(c, sel); save(); audio.play('chime', [660, 990]); buildDisplay(); renderShop(); };
}
// 전직관: 1차는 네 원소 카드, 2차는 내 원소. 고르면 시험 설명, 1차는 시험 전에 질문 하나
let trialDef = null, trialAttempt = 0, jobPick = null, quizDone = false;
function goJobs() {
  const tier = jobOffer(career);
  if (!tier) { goHub(); return; }
  stopMatch(); leaveFight(); mode = 'hub'; kind = 'gauntlet'; show('jobs'); setVenue('stable');
  if (!display) buildDisplay();
  jobPick = career.job || jobPick;
  $('jobsQuiz').classList.add('hidden');
  renderJobs(tier);
}
function renderJobs(tier) {
  $('jobsBadge').textContent = tier === 1 ? L('견습 졸업', 'Apprentice graduate') : L('2차 전직', '2nd advancement');
  $('jobsNote').textContent = tier === 1 ? L('첫 시합을 이겼다! 네 원소 중 하나를 고른다', 'You won your first fight! Pick one of the four elements') : L('랭크 결정전을 이겼다! 큰 마법을 배운다', 'You won the rank decider! Learn your big spell');
  $('jobsNpc').innerHTML = L('<b>전직관 노마법사</b>', '<b>Old Mage of the Hall</b> ') + (tier === 1 ? L('마력은 결국 말의 속도다. 불은 겁주고, 물은 당기고, 바람은 밀고, 땅은 막는다. 어느 쪽으로 쓸 테냐?', 'Mana is, in the end, the speed of your horse. Fire frightens, water pulls, wind pushes, earth blocks. Which will you wield?') : L(`이제 두 번째 마법이다. 큰 마법은 ${input.st.touch ? '큰 마법 버튼' : 'Q'}다.`, `Now for your second spell. Your big spell is ${input.st.touch ? 'the Big spell button' : 'Q'}.`));
  const list = tier === 1 ? JOB_ORDER : [career.job];
  $('jobCards').innerHTML = list.map((k) => {
    const Jk = JOBS[k], [s1, s2] = Jk.spells, strong = JOB_ORDER.find((x) => JOBS[x].beats === k), tr = trialFor(k, tier);
    return `<div class="job${k === jobPick ? ' sel' : ''}" data-job="${k}"><div class="jh"><div class="ic" style="background:${Jk.css}">${Jk.icon}</div><div><b>${Jk.name}</b><span class="sp">${Jk.role}</span></div></div>
      <div class="sk"><span class="t">${L('1차', '1st')}</span>${SPELLS[s1].icon} ${SPELLS[s1].name}</div><div class="sk${tier === 1 ? ' lock' : ''}"><span class="t">${L('2차', '2nd')}</span>${SPELLS[s2].icon} ${SPELLS[s2].name}</div>
      <div class="ln"><span class="k">${L('📏 거리', '📏 Range')}</span>${Jk.range}</div><div class="ln"><span class="k">${L('전직 보너스', 'Advancement bonus')}</span><span class="up">${Jk.bonusTxt}</span></div>
      <div class="ln"><span class="w">${L(`▲ ${JOBS[Jk.beats].short}에 강함`, `▲ Strong vs ${JOBS[Jk.beats].short}`)}</span><br><span class="l">${L(`▼ ${JOBS[strong].short}에 약함`, `▼ Weak vs ${JOBS[strong].short}`)}</span></div>
      <div class="ln"><span class="k">${L('📜 시험', '📜 Trial')}</span>${L('「', '“')}${tr.title}${L('」', '”')}</div>${tier === 1 ? `<div class="pick">${k === jobPick ? L('✓ 고름', '✓ Picked') : L('눌러서 고르기', 'Tap to pick')}</div>` : ''}</div>`;
  }).join('');
  if (tier === 2) jobPick = career.job;
  for (const el of $('jobCards').querySelectorAll('.job')) el.onclick = () => { if (tier !== 1) return; jobPick = el.dataset.job; audio.play('click'); renderJobs(tier); };
  const tr = jobPick ? trialFor(jobPick, tier) : null;
  if (!tr) { $('jobTrial').innerHTML = `<div class="note">${L('카드를 눌러 원소를 고른다', 'Tap a card to pick an element')}</div>`; return; }
  const tries = career.trials[tr.id] || 0, Jk = JOBS[jobPick], spell = SPELLS[Jk.spells[tier - 1]];
  $('jobTrial').innerHTML = `<h3>${Jk.icon} ${Jk.name} ${L(`${tier}차 시험`, `Tier ${tier} Trial`)}: ${tr.title}<span class="tag">${tr.time}${L('초', 's')}</span></h3><div>${tr.goal}</div>
    ${tries >= 2 ? `<div class="hint">💡 ${tr.hint} · ${L('이번엔 조건을 낮춘다', 'the goal is eased this time')}</div>` : ''}
    <div class="rule"><span class="ok">${L('통과하면', 'Pass to get')} ${tier === 1 ? Jk.name + ' + ' : ''}${spell.icon} ${spell.name}${tier === 1 ? ' + ' + Jk.bonusTxt : ''}</span><span>${L('실패해도 잃는 것 없이 다시', 'Failing costs nothing — try again')}</span>${tier === 1 ? `<span class="warn">${L('통과하면 원소가 정해진다 · 그 전엔 카드를 눌러 바꿀 수 있다', 'Passing locks in your element · until then you can switch cards')}</span>` : ''}</div>
    <div class="btnRow"><button id="trialGo" class="primary">${L('📜 시험 보러 가기', '📜 Take the Trial')}</button></div>`;
  $('trialGo').onclick = () => { audio.play('click'); if (tier === 1 && !quizDone) { showQuiz(tr); return; } beginTrial(tr); };
}
function showQuiz(tr) {
  const q = $('jobsQuiz'); q.classList.remove('hidden');
  q.innerHTML = L('<b>전직관</b>시험 전에 하나만 묻자. 마력은 어디서 나오지?', '<b>Advancement Hall</b> One question before the trial. Where does mana come from?') + '<div class="btnRow">' + [['staff', L('지팡이', 'The staff')], ['speed', L('말의 속도', 'The horse’s speed')], ['hat', L('모자', 'The hat')]].map(([id, lb]) => `<button data-a="${id}">${lb}</button>`).join('') + '</div>';
  for (const b of q.querySelectorAll('button')) b.onclick = () => {
    const ok = b.dataset.a === 'speed'; quizDone = true; audio.play(ok ? 'chime' : 'click', ok ? [660, 990] : undefined);
    q.innerHTML = `${L('<b>전직관</b>', '<b>Advancement Hall</b> ')}${ok ? L('맞다.', 'Correct.') : L('아니다.', 'Wrong.')} ${L('말이 빠를수록 마력이 크고, 마법을 쓰면 그만큼 느려진다. 자, 가 봐라.', 'The faster the horse, the more mana — and every spell slows you by that much. Off you go.')}<div class="btnRow"><button id="quizGo" class="primary">${L('📜 시험 시작', '📜 Start Trial')}</button></div>`;
    $('quizGo').onclick = () => { q.classList.add('hidden'); beginTrial(tr); };
  };
}
function beginTrial(tr) {
  if (tr.tier === 1 && !chooseJob(career, tr.job)) return;
  save(); trialDef = tr; trialAttempt = career.trials[tr.id] || 0;
  beginPlay('trial');
}
function leaveFight() { input.exitLock(); input.st.enabled = false; input.showTouch(false); document.body.classList.remove('playing'); hud.show(false); hud.practice(null); hud.trial(null); paused = false; }
function goTitle() { stopMatch(); leaveFight(); show('title'); startMatch(null, 'attract'); }
function goHub() {
  stopMatch(); leaveFight(); mode = 'hub'; kind = 'gauntlet'; show('hub'); setVenue('stable');
  buildDisplay(); renderHub();
  arena.setFence(CFG.arena.r0);
}
function goPre(fight) {
  fightDef = fight; mode = 'pre'; kind = 'gauntlet'; show('pre');
  $('preMode').textContent = fight.mode === 'duel' ? L('1대1 결투', '1-on-1 duel') : L(`${fight.opp.length + 1}인 난투`, `${fight.opp.length + 1}-rider brawl`);
  $('preTitle').textContent = fight.title;
  $('preOpps').innerHTML = fight.opp.map((id) => oppChip(id, fight)).join('');
  $('preLine').innerHTML = `<b>${fight.line[0]}</b>${fight.line[1]}`;
  const tips = [];
  if (fight.tutorial) tips.push(L('첫 시합은 안내가 나와요. 동작은 연습장에서 먼저 해 봐도 좋아요.', 'The first fight shows on-screen guidance. You can also try the moves in the Practice Yard first.'));
  if (fight.opp.includes('mukjik')) tips.push(L('묵직이는 💨 바람 마법사다. 정면으로 오다 붙으면 돌풍으로 날린다. 옆으로 비껴 스쳐라.', 'Mukjik is a 💨 Wind mage: charges head-on and blasts you away with a gust when close. Slip past the side.'));
  if (fight.opp.includes('boss1')) tips.push(L('돌쇠는 🪨 땅 마법사다. 정면으로 달려들면 흙벽, 질주해 오면 땅가르기. 옆으로 돌아라.', 'Dolsoe is an 🪨 Earth mage: an earth wall if you charge head-on, a fissure if you gallop at them. Circle around.'));
  if (fight.opp.includes('beongae')) tips.push(L('번개는 🔥 불 마법사다. 화염구에 말이 놀라고, 쫓아가면 불길이 깔린다.', 'Beongae is a 🔥 Fire mage: fireballs spook your horse, and chasing leaves fire trails behind.'));
  if (fight.opp.includes('gihoe')) tips.push(L('기회주의자는 💧 물 마법사다. 나보다 빠를 때 물채찍으로 끌어당긴다. 더 빨리 달려라.', 'Gihoe is a 💧 Water mage: pulls you in with a water whip when faster than you. Ride faster.'));
  if (fight.final) tips.push(L('라이벌은 네 습관을 따라 한다. 평소와 다르게 싸워 봐.', 'The rival copies your habits. Try fighting differently from usual.'));
  tips.push(L('기절하면 장비 하나를 압수당한다. 위험하면 ' + (input.st.touch ? '⏸ 메뉴에서 항복.' : '<kbd>G</kbd>를 길게 눌러 항복.'), 'If you get knocked out, a piece of gear is confiscated. In danger? ' + (input.st.touch ? 'Surrender from the ⏸ menu.' : 'Hold <kbd>G</kbd> to surrender.')));
  $('preTip').innerHTML = tips.join('<br>');
}

// ---------- 시합 시작·끝 ----------
let endTimer = -1, lastResult = null, freeSpec = null, practiceSpell = 0;
function startMatch(fight, how = 'fight', custom = null) {
  stopMatch();
  if (display) { scene.remove(display.group); display = null; }
  let opts;
  if (how === 'attract') opts = { seed: 1 + Math.floor(Math.random() * 9999), mode: 'brawl', roster: ['mukjik', 'beongae', 'gihoe', 'rival'].map((c) => ({ char: c })), countdown: 0.5 };
  else if (how === 'practice') opts = { seed: 7, mode: 'practice', countdown: 1, roster: [{ char: 'maji', isPlayer: true, loadout: { ...career.loadout } }, { char: 'dummy', persona: 'still' }, { char: 'dummy', persona: 'still' }, { char: 'beongae', persona: 'still' }],
    looseWeapons: [{ item: 'oak', x: -4, z: -18 }, { item: 'iron', x: -5.5, z: -18 }, { item: 'lance', x: -7, z: -18 }, { item: 'mace', x: -8.5, z: -18 }, { item: 'crystal', x: -10, z: -18 }] };
  else if (how === 'free') opts = { seed: 1 + Math.floor(Math.random() * 9999), mode: custom.opp.length === 1 ? 'duel' : 'brawl', countdown: 3, roster: [{ char: 'maji', isPlayer: true, loadout: custom.loadout, ...(custom.job ? { job: custom.job, jobTier: custom.tier } : {}) }, ...custom.opp.map((c) => ({ char: c }))], rivalMimic: rivalMimic(career) };
  else if (how === 'trial') opts = trialMatchOpts(trialDef, career, trialAttempt);
  else opts = { seed: fight.seed + career.log.length * 17, mode: fight.mode, roster: buildRoster(career, fight), countdown: 3, rivalMimic: rivalMimic(career) };
  setVenue(venueFor(how, fight));
  opts.venue = curVenue;   // 장소별 시합장 소품 (match.js PROP_SETS)
  match = createMatch(R, opts);
  vis = buildVisuals(scene, match);
  if (!fxWarm) { fxWarm = true; elemFx.prewarm(renderer, camera); }
  player = how === 'attract' ? null : match.fighters[0];
  assist = player ? createAssist(match, player.i) : null;
  tst = { n: 0, sum: 0, slow: 0, casts: 0, fast: 0, fell: 0, koMe: 0, taken: 0 };
  hud.setup(match);
  frames = []; curF = prevF = makeFrame(match);
  endTimer = -1; slowT = 0; hitStop = 0; acc = 0; tut = {}; replayCd = 0; lastBig = null; practiceSpell = 4;
  ctl.yaw = 0; ctl.pitch = -0.04; ctl.lock = -1; ctl.surrender = false; ctl.gHold = 0; ctl.prevState = 'mounted'; ctl.mountReq = false; ctl.kickReq = false; ctl.reach = 0;
  if (player) { const h = curF.fighters[0].p; cam.pos.set(h.x, h.y + 1, h.z); } else cam.pos.set(0, 20, -40);
  lastCount = 99;
  kind = how === 'fight' ? 'gauntlet' : how;
  mode = how === 'attract' ? 'attract' : 'fight';
}
// 폰 화면 방향: 세로 폰으로 처음 시작할 때 한 번 묻는다(⏸ 메뉴에서 바꿈).
// 가로를 고르면 전체 화면·가로 고정을 시도만 하고(카톡 안 브라우저·아이폰은 막힘) 기다리지 않는다.
// 회전이 안 되면 resize()가 게임을 90° 돌려 그린다
let rotPending = null;
const needsAsk = () => input.st.touch && !S.orient && innerHeight > innerWidth && innerWidth < 700;
function tryFullscreen() {
  const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!req || document.fullscreenElement || document.webkitFullscreenElement) return;
  try {
    const p = req.call(el, { navigationUI: 'hide' });
    if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape')).catch(() => { /* 막히면 돌려 그리기로 */ });
  } catch (e) { /* 막히면 돌려 그리기로 */ }
}
function setOrient(o) {
  S.orient = o; saveSettings();
  if (o === 'land') tryFullscreen();
  resize(); orientLabel();
}
function orientLabel() { $('orientBtn').classList.toggle('hidden', !input.st.touch); $('orientBtn').textContent = S.orient === 'land' ? L('📱 세로로 보기', '📱 Portrait view') : L('↻ 가로로 보기', '↻ Landscape view'); }
orientLabel();
if (input.st.touch) $('pauseNote').textContent = L('계속을 누르면 이어서 합니다.', 'Tap Resume to continue.');
const TILT = L('📱 폰 <b>윗부분이 왼쪽으로</b> 가게 눕혀서 하세요', '📱 Turn your phone sideways so its <b>top points left</b>');
$('orientBtn').onclick = () => { audio.play('click'); setOrient(S.orient === 'land' ? 'port' : 'land'); if (vp.rot) hud.toast(TILT, 3); };
function rotateGo() { const pend = rotPending; rotPending = null; if (pend) beginPlay(pend[0], pend[1]); }
$('rotStay').onclick = () => { audio.start(); audio.play('click'); setOrient('port'); rotateGo(); };
$('rotFull').onclick = () => { audio.start(); audio.play('click'); setOrient('land'); rotateGo(); };
function beginPlay(how, custom) {
  if (needsAsk()) { rotPending = [how, custom]; show('rotateTip'); return; }
  audio.start();
  startMatch(how === 'fight' ? fightDef : null, how, custom);
  show(null); hud.show(true); input.st.enabled = true; input.st.wantLock = true; input.showTouch(true); document.body.classList.add('playing');
  input.requestLock(); input.clearEdges();
  view = input.st.touch && vp.h > vp.w ? 'tp' : 'fp';   // 세로 화면은 좁아서 1인칭이면 지팡이가 화면 밖 → 3인칭으로 시작
  hud.legend(!input.st.touch);
  hud.practice(how === 'practice' ? practiceItems() : null);
  hud.trial(how === 'trial' ? { tag: L(`${JOBS[trialDef.job].name} ${trialDef.tier}차 시험`, `${JOBS[trialDef.job].name} Tier ${trialDef.tier} Trial`), title: trialDef.title, goal: trialDef.goal } : null);
  if (how === 'trial') hud.trialTip((trialAttempt >= 2 ? '💡 ' : L('<b>전직관:</b> ', '<b>Hall:</b> ')) + trialDef.hint);
  if (how === 'practice') hud.toast(L('연습장: 가만히 있는 허수아비와 오른쪽 앞 무기 더미. 왼쪽 목록을 하나씩 해 보세요', 'Practice Yard: a still scarecrow, and a weapon pile ahead on the right. Try the list on the left one by one'), 6);
  else if (vp.rot) hud.toast(TILT, 3.5);
}
function finishFight() {
  leaveFight();
  const r = match.result;
  if (kind === 'trial') {   // 전직 시험 결과
    const passed = r.reason === 'pass';
    if (passed) passTrial(career, trialDef); else failTrial(career, trialDef);
    save();
    show('result');
    const Jk = JOBS[trialDef.job], spell = SPELLS[Jk.spells[trialDef.tier - 1]];
    $('resT').textContent = passed ? L('전직!', 'Advanced!') : L('다시 해 보자', 'Try again');
    $('resT').className = 'bigT ' + (passed ? 'win' : 'lose');
    $('resSub').textContent = L(`${Jk.name} ${trialDef.tier}차 시험 「${trialDef.title}」 · ${Math.floor(r.t)}초`, `${Jk.name} Tier ${trialDef.tier} Trial “${trialDef.title}” · ${Math.floor(r.t)}s`);
    statsHTML(r); testLine(r);
    const tries = career.trials[trialDef.id] || 0;
    $('resRewards').innerHTML = passed ? L(`${Jk.icon} <b>${Jk.name}</b> ${trialDef.tier}차 · ${spell.icon} <b>${spell.name}</b>을 배웠다${trialDef.tier === 1 ? ` · ${Jk.bonusTxt}` : ' · 큰 마법은 ' + (input.st.touch ? '큰 마법 버튼' : 'Q')}`, `${Jk.icon} <b>${Jk.name}</b> Tier ${trialDef.tier} · learned ${spell.icon} <b>${spell.name}</b>${trialDef.tier === 1 ? ` · ${Jk.bonusTxt}` : ' · big spell on ' + (input.st.touch ? 'the Big spell button' : 'Q')}`)
      : L(`잃은 것은 없다.${tries >= 2 ? ' 다음엔 힌트를 주고 조건을 낮춘다.' : ''}`, `Nothing lost.${tries >= 2 ? ' Next time you get a hint and an easier goal.' : ''}`);
    $('lootBox').classList.add('hidden');
    $('resRetry').textContent = passed ? L('마구간으로', 'To the Stable') : L('다시 도전', 'Try again'); $('resHub').textContent = passed ? L('마구간으로', 'To the Stable') : trialDef.tier === 1 ? L('다른 원소 고르기', 'Pick another element') : L('전직관으로', 'To the Hall');
    lastResult = { r, rewards: { won: passed }, trial: true, passed };
    audio.play(passed ? 'fanfare' : 'sad');
    return;
  }
  if (kind === 'free') {
    show('result');
    $('resT').textContent = r.playerWon ? L('승리!', 'Victory!') : r.reason === 'surrender' ? L('항복', 'Surrendered') : L('패배', 'Defeat');
    $('resT').className = 'bigT ' + (r.playerWon ? 'win' : 'lose');
    $('resSub').textContent = L('자유 대전 · ' + Math.floor(r.t) + '초', 'Free Battle · ' + Math.floor(r.t) + 's');
    statsHTML(r); testLine(r);
    $('resRewards').innerHTML = L('자유 대전은 보상이 없다.', 'Free Battle gives no rewards.');
    $('lootBox').classList.add('hidden');
    $('resRetry').textContent = L('한 판 더', 'One more'); $('resHub').textContent = L('처음 화면', 'Title');
    lastResult = { r, rewards: { won: r.playerWon }, free: true };
    if (r.playerWon) audio.play('fanfare'); else audio.play('sad');
    return;
  }
  $('resHub').textContent = L('마구간으로', 'To the Stable');
  const prevRank = career.rank;
  const { career: c2, rewards } = applyResult(career, fightDef, r);
  career = c2; save();
  lastResult = { r, rewards, fight: fightDef };
  show('result');
  const won = r.playerWon;
  $('resT').textContent = won ? (rewards.rankUp ? L('랭크 업!', 'Rank up!') : L('승리!', 'Victory!')) : rewards.surrendered ? L('항복', 'Surrendered') : L('패배', 'Defeat');
  $('resT').className = 'bigT ' + (won ? 'win' : 'lose');
  const why = { last: won ? L('말 위에 마지막까지 남았다', 'Last one standing on horseback') : L('다른 기수가 끝까지 남았다', 'Another rider stayed up to the end'), ko: L('정신을 잃었다', 'You were knocked out'), time: won ? L('판정승 (말 위에 남아 있었다)', 'Won on points (still mounted)') : L('판정패', 'Lost on points'), surrender: L('항복했다. 잃은 것은 없다', 'You surrendered. Nothing lost') }[r.reason] || '';
  $('resSub').textContent = why + L(` · ${Math.floor(r.t)}초`, ` · ${Math.floor(r.t)}s`);
  statsHTML(r); testLine(r);
  const lines = [];
  if (won) lines.push(L(`<b>+${rewards.points}점</b> · 🪙 +${rewards.gold}`, `<b>+${rewards.points} pts</b> · 🪙 +${rewards.gold}`));
  if (rewards.rankUp && career.rank > prevRank) lines.push(L(`🏅 새 랭크: <b>${rankName(career.rank)}</b>`, `🏅 New rank: <b>${rankName(career.rank)}</b>`));
  if (rewards.confiscated) lines.push(L(`😢 기절해서 <b>${J(ITEMS[rewards.confiscated].name, '을/를')}</b> 압수당했다`, `😢 Knocked out — <b>${ITEMS[rewards.confiscated].name}</b> was confiscated`));
  if (!won && !rewards.confiscated && !rewards.surrendered) lines.push(L('압수당할 장비가 없었다 (기본 장비뿐)', 'No gear to confiscate (starter gear only)'));
  lines.push(L(`지금 랭크 포인트 ${career.points} / ${currentFights(career).rank.unlock} · 금화 ${career.gold}`, `Rank points ${career.points} / ${currentFights(career).rank.unlock} · Gold ${career.gold}`));
  $('resRewards').innerHTML = lines.join('<br>');
  const loot = rewards.loot.filter((o) => o.item || o.gold);
  $('lootBox').classList.toggle('hidden', !won || !loot.length);
  const box = $('loot'); box.innerHTML = '';
  for (const o of loot) {
    const b = document.createElement('button');
    b.innerHTML = o.item ? `${ITEMS[o.item].name}<br><small style="font-family:Gowun Dodum">${L(`${CHARS[o.from].name}의 것`, `${CHARS[o.from].name}’s`)} · ${itemDesc(o.item)}</small>` : L(`🪙 금화 ${o.gold}`, `🪙 ${o.gold} gold`);
    b.onclick = () => { takeLoot(career, o); save(); audio.play('chime', [523, 784]); box.innerHTML = `<div class="note">${o.item ? L(J(ITEMS[o.item].name, '을/를') + ' 챙겼다. 마구간에서 장착할 수 있다', 'Took ' + ITEMS[o.item].name + '. You can equip it at the Stable') : L('금화를 챙겼다', 'Took the gold')}</div>`; };
    box.appendChild(b);
  }
  $('resRetry').textContent = rewards.rankUp ? L('다음 상대 보기', 'See next rival') : L('한 판 더', 'One more');
  if (won) audio.play('fanfare'); else audio.play('sad');
}
function statsHTML(r) {
  const me = r.fighters[0], s = me.stats, fearAvg = s.fearN > 0 ? Math.round(s.fearSum / s.fearN) : 0;
  $('resStats').innerHTML = `<div><b>${s.unhorsed}</b>${L('낙마시킴', 'Unhorsed')}</div><div><b>${s.kos}</b>${L('기절시킴', 'KOs')}</div><div><b>${s.deflectHits}</b>${L('되받아쳐 맞힘', 'Deflect hits')}</div><div><b>${s.hits}</b>${L('타격', 'Strikes')}</div><div><b>${s.disarms}</b>${L('무장 해제', 'Disarms')}</div><div><b>${s.grabs}</b>${L('잡기', 'Grabs')}</div><div><b>${s.casts}</b>${L('마법 (평균', 'Casts (avg')} ${s.casts ? Math.round(s.chargeSum / s.casts * 100) : 0}%)</div><div><b>${s.kicks}</b>${L('발차기', 'Kicks')}</div><div><b>${fearAvg}</b>${L('고집이 평균 공포', 'Stubborn’s avg fear')}</div>`;
}
// 시험 기록 한 줄: 기기·조작·시점, 상대, 결과, 내가 한 것과 당한 것, 프레임. 시험해 주는 사람이 카톡에 붙여 보낸다
function testLine(r) {
  const s = r.fighters[0].stats, t = tst || { n: 0, sum: 0, slow: 0, casts: 0, fast: 0, fell: 0, koMe: 0, taken: 0 };
  const opp = match.fighters.filter((f) => f !== player).map((f) => f.ch.name).join('·');
  const res = r.playerWon ? L('승', 'Win') : r.reason === 'surrender' ? L('항복', 'Surrender') : L('패', 'Loss');
  const ms = t.n ? (t.sum / t.n * 1000).toFixed(1) : '-', slow = t.n ? Math.round(t.slow / t.n * 100) : 0;
  const d = new Date(), day = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const jb = player && player.job ? `${JOBS[player.job].short}${player.jobTier}` : L('견습', 'Apprentice'), sp = Object.entries(s.spells || {}).map(([k, v]) => `${SPELLS[k] ? SPELLS[k].name : k}${v}`).join(' ');
  const line = L(`[마상 시험 ${VERSION}] ${day} · ${input.st.touch ? '폰' : 'PC'}·${S.adv ? '고급' : '쉬운'} 조작·${view === 'fp' ? '1인칭' : '3인칭'} · ${jb}${kind === 'trial' && trialDef ? ' 시험 ' + trialDef.id : ''} · vs ${opp} · ${res} ${Math.floor(r.t)}초`
    + ` | 마법 ${t.casts}(질주 중 ${t.fast})${sp ? ' [' + sp + ']' : ''} · 타격 ${s.hits} · 맞음 ${t.taken} · 낙마시킴 ${s.unhorsed} · 낙마당함 ${t.fell} · 기절시킴 ${s.kos} · 되받아침 ${s.deflectHits}`
    + ` | 프레임 평균 ${ms}ms, 느린 프레임 ${slow}%`,
  `[MW test ${VERSION}] ${day} · ${input.st.touch ? 'Phone' : 'PC'} · ${S.adv ? 'Advanced' : 'Easy'} controls · ${view === 'fp' ? '1st' : '3rd'} person · ${jb}${kind === 'trial' && trialDef ? ' trial ' + trialDef.id : ''} · vs ${opp} · ${res} ${Math.floor(r.t)}s`
    + ` | casts ${t.casts} (${t.fast} while galloping)${sp ? ' [' + sp + ']' : ''} · strikes ${s.hits} · hit taken ${t.taken} · unhorsed ${s.unhorsed} · fell ${t.fell} · KOs ${s.kos} · deflects ${s.deflectHits}`
    + ` | frame avg ${ms}ms, slow frames ${slow}%`);
  $('resTest').textContent = line; $('resCopy').textContent = L('📋 시험 기록 복사', '📋 Copy test log');
}
$('resCopy').onclick = () => {
  const el = $('resTest'), txt = el.textContent, done = () => { $('resCopy').textContent = L('복사했다 ✓', 'Copied ✓'); };
  const pick = () => { const rg = document.createRange(); rg.selectNodeContents(el); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); $('resCopy').textContent = L('선택했다 → 길게 눌러 복사', 'Selected → long-press to copy'); };
  try { navigator.clipboard.writeText(txt).then(done, pick); } catch (e) { pick(); }
};
function endingScreen() {
  show('ending');
  const pair = career.ending === 'pair';
  $('endT').textContent = pair ? L('엔딩: 한 쌍', 'Ending: A Pair') : L('엔딩: 빚 갚은 챔피언', 'Ending: The Debt-Free Champion');
  $('endBody').innerHTML = pair
    ? L('고집이는 끝까지 겁먹지 않았다. 마지가 마법을 아낄 줄 알았기 때문이다.<br>상금으로 목장 빚을 갚고, 둘은 다음 봄 시합장으로 함께 떠난다.', 'Stubborn never lost its nerve, because Maji knew how to spare magic.<br>With the prize money they clear the ranch’s debt and ride off together to the next spring tournament field.')
    : L('빚은 갚았다. 하지만 폭발 소리에 질린 고집이는 더 이상 달리려 하지 않는다.<br>마지는 트로피 대신 고집이의 갈기를 오래 쓰다듬었다. (공포를 덜 쌓으면 다른 엔딩이 있다)', 'The debt is paid. But Stubborn, shaken by the blasts, no longer wants to run.<br>Instead of the trophy, Maji spent a long while stroking Stubborn’s mane. (Pile up less fear for a different ending.)');
}
let paused = false, settingsFrom = null;
function pause(on) {
  if (mode !== 'fight') return;
  paused = on;
  if (on) { show('pause'); input.exitLock(); $('giveBtn').textContent = kind === 'practice' ? L('연습 끝내기', 'End practice') : kind === 'trial' ? L('🏳 시험 그만두기 (잃는 것 없음)', '🏳 Quit trial (nothing lost)') : L('🏳 항복 (잃는 것 없음)', '🏳 Surrender (nothing lost)'); }
  else { show(null); input.requestLock(); }
}
input.st.onLockChange = (locked) => { if (!locked && mode === 'fight' && !paused && endTimer < 0 && !input.st.touch && !input.st.lockFailed && !replay) pause(true); };

// 설정 화면
function openSettings(from) {
  settingsFrom = from; show('settings');
  const bind = (id, key, fmt) => { const el = $(id); if (el.type === 'checkbox') el.checked = !!S[key]; else el.value = S[key]; const out = $('v' + id.slice(1)); const upd = () => { if (out && fmt) out.textContent = fmt(S[key]); }; upd();
    el.oninput = el.onchange = () => { S[key] = el.type === 'checkbox' ? el.checked : el.tagName === 'SELECT' ? el.value : +el.value; upd(); saveSettings(); if (key === 'vol') audio.setVolume(S.vol); if (key === 'shadow') applyShadow(); if (key === 'gfx') applyGfx(); if (key === 'models') applyModels(); }; };
  bind('sSens', 'sens', (v) => v.toFixed(2) + '×'); bind('sSwing', 'swing', (v) => v.toFixed(2) + '×'); bind('sFov', 'fov', (v) => v + '°'); bind('sSway', 'sway', (v) => Math.round(v * 100) + '%'); bind('sVol', 'vol', (v) => Math.round(v * 100) + '%');
  bind('sInv', 'inv'); bind('sReplay', 'replay'); bind('sShadow', 'shadow'); bind('sGfx', 'gfx'); bind('sModels', 'models'); bind('sAdv', 'adv');
  $('sAdv').addEventListener('change', applyControls);
}
$('setDone').onclick = () => { audio.play('click'); if (settingsFrom === 'pause') show('pause'); else if (settingsFrom === 'hub') show('hub'); else show('title'); };
$('setBtn1').onclick = () => { audio.start(); openSettings('title'); };
$('setBtn2').onclick = () => openSettings('hub');
$('setBtn3').onclick = () => openSettings('pause');

// 자유 대전 화면
const FREE_OPPS = ['mukjik', 'beongae', 'gihoe', 'rival', 'boss1', 'dummy'];
function openFree() {
  show('free');
  $('freeOpps').innerHTML = FREE_OPPS.map((id, k) => `<label><input type="checkbox" id="fo_${id}" ${k < 2 ? 'checked' : ''}><i style="width:14px;height:14px;border-radius:50%;border:2px solid #3a2414;background:${CHARS[id].css};display:inline-block"></i>${CHARS[id].name}</label>`).join('');
  const groups = { staff: ['stick', 'oak', 'iron', 'crystal', 'lance', 'mace'], hat: ['oldcone', 'felt', 'brass'], robe: ['rags', 'quilted'], gear: ['nogear', 'saddle', 'spurs'] };
  $('freeGear').innerHTML = Object.entries(groups).map(([slot, ids]) => `<span style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;width:100%">${ids.map((id, k) => `<label><input type="radio" name="fg_${slot}" value="${id}" ${k === 0 ? 'checked' : ''}>${ITEMS[id].name}</label>`).join('')}</span>`).join('');
}
$('freeBtn').onclick = () => { audio.start(); audio.play('click'); openFree(); };
$('freeBack').onclick = () => show('title');
$('freeGo').onclick = () => {
  const opp = FREE_OPPS.filter((id) => $('fo_' + id).checked).slice(0, 3);
  if (!opp.length) { $('freeOpps').insertAdjacentHTML('afterend', `<div class="note" id="freeWarn">${L('상대를 한 명 이상 고르세요', 'Pick at least one rival')}</div>`); return; }
  const loadout = {}; for (const slot of ['staff', 'hat', 'robe', 'gear']) loadout[slot] = document.querySelector(`input[name="fg_${slot}"]:checked`).value;
  freeSpec = { opp, loadout };
  audio.play('click'); beginPlay('free', freeSpec);
};
$('practiceBtn').onclick = () => { audio.play('click'); beginPlay('practice'); };

// 버튼
$('startBtn').onclick = () => { audio.start(); audio.play('click'); goHub(); };
if (hasSave && career.log.length) $('startBtn').textContent = L('🐴 건틀릿 (이어서)', '🐴 Gauntlet (continue)');
$('titleBtn').onclick = () => goTitle();
$('fightBtn').onclick = () => { audio.play('click'); if (jobOffer(career)) goJobs(); else goPre(currentFights(career).next); };
$('shopBtn').onclick = () => { audio.play('click'); openShop('staff'); };
$('tabStaff').onclick = () => { shopTab = 'staff'; shopSel = null; audio.play('click'); renderShop(); };
$('tabWear').onclick = () => { shopTab = 'wear'; shopSel = null; audio.play('click'); renderShop(); };
$('shopBack').onclick = () => { audio.play('click'); goHub(); };
$('jobsBack').onclick = () => { audio.play('click'); goHub(); };
$('bossBtn').onclick = () => { audio.play('click'); goPre(currentFights(career).boss); };
$('resetBtn').onclick = () => { if (confirmReset()) { career = newCareer(); save(); renderHub(); buildDisplay(); } };
let resetArm = 0;
let resetOrig = '';
function confirmReset() { const now = performance.now(); if (now - resetArm < 2500) return true; resetArm = now; resetOrig = $('resetBtn').textContent; $('resetBtn').textContent = L('한 번 더 누르면 초기화', 'Press again to reset'); setTimeout(() => { $('resetBtn').textContent = resetOrig; }, 2500); return false; }
$('muteBtn').onclick = () => { const mu = audio.toggleMute(); $('muteBtn').textContent = mu ? L('🔇 소리 끔', '🔇 Sound off') : L('🔊 소리', '🔊 Sound'); };
// 언어 바꾸기 단추: data-setlang="ko" 또는 "en" 이 붙은 요소를 누르면 그 언어로 새로 고친다 (index.html 쪽 단추가 쓴다)
for (const el of document.querySelectorAll('[data-setlang]')) el.onclick = () => { audio.play('click'); setLang(el.dataset.setlang); };
$('goBtn').onclick = () => { audio.play('click'); beginPlay('fight'); };
$('backBtn').onclick = () => goHub();
$('resHub').onclick = () => { if (lastResult && lastResult.trial) { if (lastResult.passed) goHub(); else goJobs(); return; } if (lastResult && lastResult.free) { goTitle(); return; } if (lastResult && lastResult.rewards.ending) endingScreen(); else goHub(); };
$('resRetry').onclick = () => {
  if (lastResult && lastResult.trial) { if (lastResult.passed) goHub(); else { trialAttempt = career.trials[trialDef.id] || 0; beginPlay('trial'); } return; }
  if (lastResult && lastResult.free) { beginPlay('free', freeSpec); return; }
  if (lastResult && lastResult.rewards.ending) { endingScreen(); return; }
  if (lastResult.rewards.rankUp) goHub(); else goPre(lastResult.rewards.won ? currentFights(career).next : lastResult.fight);
};
$('endHub').onclick = () => goHub();
$('resumeBtn').onclick = () => pause(false);
$('giveBtn').onclick = () => { paused = false; show(null); if (kind === 'practice') { goTitle(); return; } ctl.surrender = true; };
canvas.addEventListener('click', () => { if (paused) pause(false); else if (replay) endReplay(); });

// ---------- 루프 ----------
let acc = 0, last = performance.now(), lastCount = 99, breathT = 0;
function stepOnce() {
  const inputs = {};
  if (player && mode === 'fight') inputs[player.i] = playerInput();
  const evs = match.step(inputs);
  const fr = makeFrame(match, evs);
  frames.push(fr); if (frames.length > MAX_FRAMES) frames.shift();
  prevF = curF; curF = fr;
  handleEvents(evs);
  if (mode === 'fight') tutorialTick();
}
// 연습장: 6초마다 탑에서 연습용 마법이 날아온다 (쳐내기 연습)
function practiceTurret(dt) {
  if (kind !== 'practice' || !player || player.rider.state !== 'mounted') return;
  practiceSpell -= dt;
  if (practiceSpell > 0) return;
  practiceSpell = 6;
  const tb = player.rider.body.translation(), from = { x: 0, y: 3, z: 36 };
  const to = { x: tb.x, y: tb.y + 0.9, z: tb.z }, d = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const sp = 24, vel = { x: (to.x - from.x) / d * sp, y: (to.y - from.y) / d * sp, z: (to.z - from.z) / d * sp };
  match.spells.push({ id: match.nextSpellId++, owner: 1, pos: from, vel, r: 0.22, E: 3000, age: 0, deflects: 0, grace: 0, frac: 0.2, lastDeflector: -1 });
  hud.toast(L('🔮 연습용 마법이 날아온다! 지팡이로 후려쳐 보세요', '🔮 A practice spell is coming! Swat it with your staff'), 1.8, 'turret');
}
function hooves(k, s, hb) {
  const dtv = lastDt;
  const near = camera.position.distanceTo(s.P) < 45;
  const gi = Math.floor(hb.gait);   // 다리 그림과 같은 걸음 박자: 한 걸음이 끝날 때마다 발굽 소리 한 묶음
  if (gi !== s.gaitI) { const first = s.gaitI === undefined; s.gaitI = gi; if (!first && near && hb.speed > 1) audio.play('stride', s.P, Math.min(1, hb.speed / 11), hb.speed, (1.4 + hb.speed * 0.2) / hb.speed); }
  s.dustT -= dtv;
  if (hb.speed > 7 && s.dustT <= 0) { s.dustT = 0.09; fx.dust({ x: s.P.x, y: 0, z: s.P.z }, 1, 0xd9b67c, 0.6); }
}
let lastDt = 0.016;
function renderSpells(A, B, alpha, dt) {
  const seen = new Set();
  const amap = new Map(A.spells.map((s) => [s.id, s]));
  for (const sb of B.spells) {
    seen.add(sb.id);
    const sa = amap.get(sb.id) || sb, p = { x: sa.pos.x + (sb.pos.x - sa.pos.x) * alpha, y: sa.pos.y + (sb.pos.y - sa.pos.y) * alpha, z: sa.pos.z + (sb.pos.z - sa.pos.z) * alpha };
    if (sb.kind === 'fireball') { elemFx.fireballMove(sb.id, p, sb.vel, sb.r, dt); continue; }   // 화염구는 원소 이펙트가 그린다
    fx.spellMove(sb.id, p, dt, new THREE.Color(match.fighters[sb.owner].ch.color).lerp(new THREE.Color(0xffffff), 0.35).getHex(), sb.r);
  }
  for (const id of fx.spellIds()) if (!seen.has(id)) fx.spellEnd(id);
  for (const id of elemFx.fireballIds()) if (!seen.has(id)) elemFx.fireballEnd(id);
}
// 마법 보기용 위치: 지팡이 끝(물채찍 시작) 또는 몸
function fighterPosOf(F) {
  const fn = (i, tip) => {
    const fr = F.fighters[i];
    if (tip && fr.weapon >= 0 && vis && vis.weapons[fr.weapon]) { const st = vis.weapons[fr.weapon]; return st.group.localToWorld(V(0, st.len / 2, 0)); }
    return V(fr.p.x, fr.p.y + 0.6, fr.p.z);
  };
  fn.cam = camera.position;   // 띠(물채찍·회오리)를 카메라 쪽으로 편다
  return fn;
}
// 원소 이펙트에 넘기는 것: 기수 위치, 원소, 막 쏜 화염구 방향
function vfxCtx(F) {
  return { fighterPos: fighterPosOf(F), jobOf: (i) => (match && match.fighters[i] ? match.fighters[i].job : null), spellVel: (id) => { const s = F.spells.find((x) => x.id === id); return s ? s.vel : null; },
    count: F.fighters.length, player: player ? player.i : -1, view, camPos: camera.position };
}
// 화면 주사율이 높으면(120·144·165Hz) 주사율만큼 그리지 않고 대략 60~80fps로 묶는다: 같은 PC에서 도는 다른 게임과 GPU를 덜 다툰다.
// 시뮬은 고정 간격 누적(acc)이라 건너뛴 프레임의 시간이 다음 프레임 dt 에 그대로 들어가 속도는 같다
let lastRaf = 0, vEst = 1000 / 60, lastRun = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const raw = now - lastRaf; lastRaf = now;
  vEst = Math.min(raw > 3 ? raw : vEst, vEst * 1.003);   // 모니터 한 칸 시간: 최근 가장 빠른 간격 (느려져도 천천히만 늘어난다)
  const n = Math.max(1, Math.round(1000 / 75 / vEst));
  if (n >= 2 && now - lastRun < (n - 0.4) * vEst) return;
  lastRun = now;
  const t0 = performance.now();
  frameBody(now);
  gov.cpuMs += (performance.now() - t0 - gov.cpuMs) * 0.05;
}
function frameBody(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; lastDt = dt;
  if (window.__drawLog) window.__drawLog.push(dt * 1000);   // 시험용 (?perf=1): 실제로 그린 프레임 간격
  govTick(dt); perfHud(dt);
  if (mode === 'fight' && player && tst && !replay && !paused) { tst.n++; tst.sum += dt; if (dt > 0.025) tst.slow++; }
  const t = now / 1000;
  replayCd = Math.max(0, replayCd - dt);
  for (let k = bumpsGrowing.length - 1; k >= 0; k--) { const b = bumpsGrowing[k]; b.scale.multiplyScalar(1 + dt * 6); if (b.scale.x >= 1) { b.scale.setScalar(1); bumpsGrowing.splice(k, 1); } }
  if ((mode === 'fight' || mode === 'attract') && match) {
    if (replay) {
      // 다시 보기: 시뮬은 멈추고 저장한 프레임을 0.35배속으로 그린다
      input.takeMouse();
      if (input.pressed('Space') || input.pressed('Escape')) endReplay();
      if (replay) {
        replay.pos += dt * 60 * 0.35;
        const k = Math.floor(replay.pos);
        if (k >= replay.list.length - 1) endReplay();
        else {
          const A = replay.list[k], B = replay.list[k + 1], a = replay.pos - k;
          renderFrames(vis, A, B, a, { dt: dt * 0.35, t, player: player ? player.i : -1, view, replay: true, rig: rigNow() });
          renderSpells(A, B, a, dt * 0.35);
          while (replay.evK < k) { replay.evK++; const fr = replay.list[replay.evK]; if (fr.ev) for (const ev of fr.ev) elemFx.onEvent(ev, vfxCtx(fr)); }   // 원소 순간 효과를 다시 낸다
          magicView.update(B, t, fighterPosOf(B), dt * 0.35);
          elemFx.update(B, dt * 0.35, vfxCtx(B));
          arena.setFence(B.fenceR);
          const fp = B.fighters[replay.focus].p;
          replay.ang += dt * 0.5;
          const want = V(fp.x + Math.sin(replay.ang) * 6, fp.y + 2.2, fp.z + Math.cos(replay.ang) * 6);
          cam.pos.lerp(want, 1 - Math.exp(-dt * 3)); camera.position.copy(cam.pos); camera.lookAt(fp.x, fp.y + 0.8, fp.z);
          camera.fov = fitFov(55); camera.updateProjectionMatrix();
          arena.update(t, dt, fp);
          fx.update(dt * 0.35, camera.position);
          draw();
          return;
        }
      }
    }
    if (mode === 'fight' && !paused && endTimer < 0) readFrameInput(dt); else input.takeMouse();
    if (pendingReplay && performance.now() / 1000 >= pendingReplay.at && !match.over) { const pr = pendingReplay; pendingReplay = null; startReplay(pr.focus, pr.tick); }
    let ts = slowUser && mode === 'fight' ? 0.35 : 1;
    if (slowT > 0) { slowT -= dt; ts = Math.min(ts, 0.3); }
    if (hitStop > 0) { hitStop -= dt; ts = Math.min(ts, 0.08); }
    if (endTimer >= 0) ts = Math.min(ts, endTimer < 1.4 ? 0.35 : 1);
    if (paused) ts = 0;
    practiceTurret(dt * ts);
    acc += dt * ts;
    let n = 0;
    while (acc >= TICK && n < 6) { stepOnce(); acc -= TICK; n++; }
    if (n >= 6) acc = 0;
    const alpha = acc / TICK;
    renderFrames(vis, prevF, curF, alpha, { dt: dt * ts, rdt: dt, t, player: player ? player.i : -1, view, hooves, rig: rigNow() });
    renderSpells(prevF, curF, alpha, dt * ts);
    magicView.update(curF, t, fighterPosOf(curF), dt * ts);
    elemFx.update(curF, dt * ts, vfxCtx(curF));
    arena.setFence(prevF.fenceR + (curF.fenceR - prevF.fenceR) * alpha);
    // 카운트다운
    if (match.t < 0.2 && mode === 'fight') {
      const cnt = match.t < 0 ? Math.ceil(-match.t) : 0;
      if (cnt !== lastCount) { lastCount = cnt; hud.center(cnt > 0 ? String(cnt) : L('시작!', 'Go!'), 0.9); audio.play('count', cnt === 0); }
    }
    if (mode === 'fight') {
      if (match.over && endTimer < 0) {
        endTimer = 0; input.exitLock();
        const won = match.result.playerWon;
        hud.center(won ? L('승리!', 'Victory!') : match.result.reason === 'surrender' ? L('항복', 'Surrendered') : L('패배…', 'Defeat…'), 2.5);
        audio.play('cheer', won ? 1.4 : 0.6); arena.setCheer(won ? 1 : 0.4);
        // 마지막 결정타를 다시 보여 준다
        if (S.replay && lastBig && match.tick - lastBig.tick < 150 && match.result.reason !== 'surrender') { const lb = lastBig; setTimeout(() => { if (match && mode === 'fight') startReplay(lb.focus, lb.tick, () => { endTimer = 2.2; }); }, 900); }
      }
      if (endTimer >= 0) {
        endTimer += dt;
        const w = match.result.winner >= 0 ? match.fighters[match.result.winner] : player;
        updateCineCamera(dt, V().copy(w.rider.body.translation()), 9, 4);
        if (endTimer > 2.8 && !replay) { mode = 'result'; finishFight(); }
      } else updateFightCamera(dt, alpha);
      if (player) {
        hud.update(match, player, camera, dt, endTimer >= 0 ? 'cine' : view);
        hud.target(!S.adv && assist && endTimer < 0 ? assist.ui : null, camera);
        if (kind === 'trial' && trialDef && match.opts.judge) hud.trialProgress(trialDef.time - Math.max(0, match.t), match.opts.judge.st.progress, match.opts.judge.st.need);
        if (!S.adv && assist) simpleButtons(assist.ui);
        audio.chargeHum(player.charging ? player.charge / CFG.spell.fMax : 0);
        breathT -= dt; if (player.stam < 20 && breathT <= 0) { breathT = 0.9; audio.play('breath', 1 - player.stam / 25); }
      }
      arena.update(t, dt, player ? player.rider.body.translation() : null);
    } else {
      updateCineCamera(dt, centroid());
      arena.update(t, dt, cam.focus);
      if (match.over) { endTimer = endTimer < 0 ? 0 : endTimer + dt; if (endTimer > 3) startMatch(null, 'attract'); }
    }
  } else if (['hub', 'pre', 'result', 'ending', 'settings', 'free', 'title'].includes(mode)) {
    if (!display && mode !== 'result') buildDisplay();
    if (display) poseDisplay(dt, t); else updateCineCamera(dt, V());
    arena.update(t, dt, V());
    audio.chargeHum(0);
  }
  // 세로 화면 HUD는 피통 카드(줄 수가 바뀜) 바로 아래에 붙는다
  layoutT -= dt;
  if (layoutT <= 0 && document.body.classList.contains('playing')) {
    layoutT = 0.25;
    const b = Math.round(rectToGame($('topbar').getBoundingClientRect()).bottom);
    if (b !== topH) { topH = b; document.documentElement.style.setProperty('--topH', b + 'px'); }
  }
  fx.update(dt, camera.position);
  draw();
}
let layoutT = 0, topH = -1;

// 시험용 고리 (Playwright)
window.__mw = {
  get mode() { return mode; }, get kind() { return kind; }, get match() { return match; }, get career() { return career; }, set career(c) { career = c; save(); if (mode === 'hub') { renderHub(); buildDisplay(); } },
  get view() { return view; }, set view(v) { view = v; }, get replay() { return replay; }, get assistUI() { return assist ? assist.ui : null; },
  startFight(id) { const all = LADDER.flatMap((r) => [...r.fights, r.boss]); goPre(all.find((f) => f.id === id) || all[0]); beginPlay('fight'); },
  practice() { beginPlay('practice'); },
  free(opp = ['mukjik', 'beongae'], loadout = { staff: 'lance', hat: 'felt', robe: 'quilted', gear: 'nogear' }, job, tier = 2) { freeSpec = { opp, loadout, job, tier }; beginPlay('free', freeSpec); },
  skip(sec) { for (let k = 0; k < sec * 60 && match && !match.over; k++) stepOnce(); },
  koOthers() { for (const f of match.fighters) if (f !== player) knockOut(match, f, player.i); },
  koMe() { knockOut(match, player, 1); },
  ko(i) { knockOut(match, match.fighters[i], player ? player.i : 0); },   // 시험용: 한 명만 기절 (시합이 안 끝나게)
  replayNow(focus = 1) { startReplay(focus, match.tick); },
  freeze(on) { paused = on; },   // 화면 비교용: 일시정지 화면 없이 시뮬만 멈춘다
  govLevel(l) { gov.on = false; govStep(l, false); },   // 시험용: 화질 층계를 고정한다
  get gov() { return gov; }, get perf() { return { level: gov.level, ema: +(gov.ema * 1000).toFixed(1), bad: +gov.bad.toFixed(3), cpu: +gov.cpuMs.toFixed(1), draw: +gov.drawMs.toFixed(1), vEst: +vEst.toFixed(2), pr: +renderer.getPixelRatio().toFixed(2), hist: gov.hist.join(' ') }; },
  get look() { return look; }, get rig() { return rig; }, get venues() { return venues; }, get vis() { return vis; }, get post() { return post && S.gfx === 'high' ? post : null; }, renderer,
  input: (patch) => Object.assign(ctl, patch),
  hud, fx, camera, THREE, ctl, input, audio, settings: S, vp, setOrient, magicView, scene, elemFx,
};

// 시작: 타이틀 뒤에서 AI 난투를 보여 준다
$('boot').classList.add('hidden');
show('title');
startMatch(null, 'attract');
mode = 'attract';
requestAnimationFrame(frame);

