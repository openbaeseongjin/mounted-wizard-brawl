// 진짜 모델 불러오기 (설계: superpowers/specs/2026-10-19-mw-real-models-design.md 7장)
// 공유 파일이면 window.__ASSETS(base64), 아니면 ./assets/rig/*.glb. 모두 meshopt 압축 (tools/pack_assets.mjs)
// 하나라도 실패하면 null → 게임은 도형 모델로 그대로 논다
const JSM = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/';
export const RIG_FILES = ['mage', 'knight', 'barbarian', 'rogue', 'rogue_hooded', 'horse', 'props', 'map'];

export async function loadRigAssets() {
  try {
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import(JSM + 'loaders/GLTFLoader.js'), import(JSM + 'libs/meshopt_decoder.module.js')]);
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    const A = typeof window !== 'undefined' ? window.__ASSETS : null;
    const one = (n) => {
      if (A && A[n]) { const s = atob(A[n]), bin = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) bin[i] = s.charCodeAt(i); return loader.parseAsync(bin.buffer, './'); }
      return loader.loadAsync('./assets/rig/' + n + '.glb');
    };
    const g = Object.fromEntries(await Promise.all(RIG_FILES.map(async (n) => [n, await one(n)])));
    // 소품·맵 glb 는 루트 노드 하나가 모델 하나 (이름 = 원래 파일 이름)
    const named = (gl) => Object.fromEntries(gl.scene.children.map((o) => [o.name, o]));
    return {
      bodies: { mage: g.mage, knight: g.knight, barbarian: g.barbarian, rogue: g.rogue, rogue_hooded: g.rogue_hooded },
      horse: g.horse, props: named(g.props), map: named(g.map),
    };
  } catch (e) {
    console.warn('진짜 모델을 못 불러왔다 · 도형 모델로 논다', e);
    return null;
  }
}
