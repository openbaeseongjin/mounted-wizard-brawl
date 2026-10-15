// 시드 난수와 작은 벡터·쿼터니언 도우미. 시뮬과 렌더가 같이 쓴다 (Rapier 객체 {x,y,z} / {x,y,z,w} 모양 그대로)

export function createRng(seed) {
  let s = seed >>> 0 || 1;
  const next = () => {   // mulberry32
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (a, b) => a + (b - a) * next(),
    int: (n) => Math.floor(next() * n),
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    chance: (p) => next() < p,
  };
}

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const cross = (a, b) => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const len = (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const norm = (a) => { const l = len(a) || 1; return { x: a.x / l, y: a.y / l, z: a.z / l }; };
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const hlen = (a) => Math.sqrt(a.x * a.x + a.z * a.z);
export const dist = (a, b) => len(sub(a, b));
export const hdist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
export function clampLen(a, m) { const l = len(a); return l > m ? scale(a, m / l) : a; }
export function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

// 쿼터니언
export function qRotate(q, v) {   // q * v * q^-1
  const ix = q.w * v.x + q.y * v.z - q.z * v.y, iy = q.w * v.y + q.z * v.x - q.x * v.z;
  const iz = q.w * v.z + q.x * v.y - q.y * v.x, iw = -q.x * v.x - q.y * v.y - q.z * v.z;
  return {
    x: ix * q.w + iw * -q.x + iy * -q.z - iz * -q.y,
    y: iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z,
    z: iz * q.w + iw * -q.z + ix * -q.y - iy * -q.x,
  };
}
export function qMul(a, b) {
  return {
    x: a.x * b.w + a.w * b.x + a.y * b.z - a.z * b.y,
    y: a.y * b.w + a.w * b.y + a.z * b.x - a.x * b.z,
    z: a.z * b.w + a.w * b.z + a.x * b.y - a.y * b.x,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}
export function qFromTo(a, b) {   // a를 b로 돌리는 최단 회전 (둘 다 단위 벡터)
  const d = dot(a, b);
  if (d < -0.999999) {
    let ax = cross({ x: 1, y: 0, z: 0 }, a); if (len(ax) < 1e-6) ax = cross({ x: 0, y: 1, z: 0 }, a);
    ax = norm(ax); return { x: ax.x, y: ax.y, z: ax.z, w: 0 };
  }
  const c = cross(a, b), w = 1 + d, l = Math.sqrt(c.x * c.x + c.y * c.y + c.z * c.z + w * w);
  return { x: c.x / l, y: c.y / l, z: c.z / l, w: w / l };
}
export const yawQ = (h) => ({ x: 0, y: Math.sin(h / 2), z: 0, w: Math.cos(h / 2) });
export const fwdOf = (h) => ({ x: Math.sin(h), y: 0, z: Math.cos(h) });     // 요 h의 앞 (+z가 0)
export const rightOf = (h) => ({ x: -Math.cos(h), y: 0, z: Math.sin(h) });  // 앞을 볼 때 오른쪽
export function yawOfQ(q) {   // 몸의 +z 앞 방향의 요
  const f = qRotate(q, { x: 0, y: 0, z: 1 }); return Math.atan2(f.x, f.z);
}
