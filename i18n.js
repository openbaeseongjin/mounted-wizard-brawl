// i18n.js — 한/영 문자열 선택 (기본 영어). 순수 모듈: Node 시험에서도 import 된다.
// 쓰는 법: L('한국어', 'English')  → 현재 언어 쪽을 돌려준다.  템플릿도 된다: L(`${n}판`, `${n} fights`)
// 언어 정하기: ?lang=ko|en  >  localStorage 'mw.lang'  >  기본 'en'.  바꾸기: setLang('ko') (새로 고침한다)
function pick() {
  let v = null;
  try { if (typeof location !== 'undefined') v = new URLSearchParams(location.search).get('lang'); } catch (e) { /* 무시 */ }
  if (v !== 'ko' && v !== 'en') { try { if (typeof localStorage !== 'undefined') v = localStorage.getItem('mw.lang'); } catch (e) { /* 막힌 저장소 */ } }
  return v === 'ko' ? 'ko' : 'en';
}
export const LANG = pick();
export const L = (ko, en) => (LANG === 'ko' ? ko : en);

export function setLang(l) {
  const v = l === 'ko' ? 'ko' : 'en';
  try { localStorage.setItem('mw.lang', v); } catch (e) { /* 막힌 저장소: 주소로 넘긴다 */ }
  if (typeof location !== 'undefined') {
    const u = new URL(location.href); u.searchParams.set('lang', v); location.href = u.toString();
  }
}

// 정적 HTML 용: data-en="English" 가 붙은 요소는 영어일 때 textContent 를 바꾼다 (원문은 data-ko 에 보관).
//   data-en-html="…" 이면 innerHTML, data-en-attr="title:Hello;aria-label:Hi" 이면 속성들.
export function applyDom(root = (typeof document !== 'undefined' ? document : null)) {
  if (!root) return;
  document.documentElement.lang = LANG;
  if (LANG !== 'en') return;
  for (const el of root.querySelectorAll('[data-en]')) {
    if (!el.hasAttribute('data-ko')) el.setAttribute('data-ko', el.textContent);
    el.textContent = el.getAttribute('data-en');
  }
  for (const el of root.querySelectorAll('[data-en-html]')) {
    if (!el.hasAttribute('data-ko')) el.setAttribute('data-ko', el.innerHTML);
    el.innerHTML = el.getAttribute('data-en-html');
  }
  for (const el of root.querySelectorAll('[data-en-attr]')) {
    for (const pair of el.getAttribute('data-en-attr').split(';')) {
      const i = pair.indexOf(':'); if (i < 0) continue;
      el.setAttribute(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
  }
}
