// 게임 화면 크기. 가로 맞춤(폰 화면은 세로인데 게임을 CSS로 90° 돌려 그림)이면 가로·세로가 바뀐다.
// 돌렸을 때 게임 왼쪽 위 = 폰 화면 오른쪽 위: 게임 x = 화면 y, 게임 y = 화면 폭 − 화면 x
export const vp = { w: innerWidth, h: innerHeight, rot: false };
export const deltaToGame = (dx, dy) => (vp.rot ? [dy, -dx] : [dx, dy]);
export const toGame = (x, y) => (vp.rot ? [y, innerWidth - x] : [x, y]);
export function rectToGame(r) {   // getBoundingClientRect() 결과 → 게임 좌표
  if (!vp.rot) return r;
  const W = innerWidth;
  return { left: r.top, right: r.bottom, top: W - r.right, bottom: W - r.left, width: r.height, height: r.width };
}
