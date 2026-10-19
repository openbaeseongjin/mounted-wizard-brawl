// 진짜 모델 자산 줄이기: assets/look(원본, 기획 시안용) → assets/rig(게임용)
// 몸 5종: 앉은 자세 동작 하나 + 쓰는 소품만 · 말: Idle·Walk·Gallop · 소품·맵: gltf 여러 개를 한 glb 로 (루트 노드 이름 = 원래 파일 이름)
// 개발 도구 gltf-transform 이 필요하다 (저장소에는 안 넣는다):
//   npm i --prefix <폴더> @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 meshoptimizer@0.21
//   GLTFT=<폴더> node tools/pack_assets.mjs
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const req = createRequire(path.join(process.env.GLTFT || '.', 'package.json'));
const load = (n) => import(pathToFileURL(req.resolve(n)).href);
const { NodeIO } = await load('@gltf-transform/core');
const { prune, dedup, mergeDocuments, unpartition, quantize, meshopt } = await load('@gltf-transform/functions');
const { ALL_EXTENSIONS } = await load('@gltf-transform/extensions');
const { MeshoptEncoder, MeshoptDecoder } = await load('meshoptimizer');
await MeshoptEncoder.ready; await MeshoptDecoder.ready;

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.join(HERE, '..');
const SRC = path.join(ROOT, 'assets', 'look'), OUT = path.join(ROOT, 'assets', 'rig');
fs.mkdirSync(OUT, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

// 몸마다 남길 소품 (lookPreview STYLE 이 쓰는 것)
const BODIES = {
  mage: ['Spellbook'],
  knight: ['Badge_Shield'],
  barbarian: ['Barbarian_Round_Shield', '2H_Axe', 'Mug', 'Barbarian_Hat'],
  rogue: [],
  rogue_hooded: ['Knife'],
};
const PROPS = ['props/pumpkin_orange_jackolantern.gltf', 'props/Skeleton_Quiver.gltf', 'props/barrel_small.gltf.glb', 'props/keg.gltf.glb'];
const PROP_NAME = (f) => ({ pumpkin_orange_jackolantern: 'pumpkin', Skeleton_Quiver: 'quiver', barrel_small: 'barrel', keg: 'keg' })[path.basename(f).replace(/\.gltf(\.glb)?$/, '')];

function keepAnims(doc, keep) {
  // 동작만 지우면 샘플러·채널이 남아 데이터가 그대로 들어간다 → 같이 지운다
  for (const a of doc.getRoot().listAnimations()) {
    if (keep.includes(a.getName())) continue;
    for (const c of a.listChannels()) c.dispose();
    for (const s of a.listSamplers()) { const i = s.getInput(), o = s.getOutput(); s.dispose(); if (i && !i.listParents().some((p) => p.propertyType !== 'Root')) i.dispose(); if (o && !o.listParents().some((p) => p.propertyType !== 'Root')) o.dispose(); }
    a.dispose();
  }
}
const squeeze = () => meshopt({ encoder: MeshoptEncoder, level: 'medium' });   // 양자화 + meshopt 압축 (three: GLTFLoader.setMeshoptDecoder)
async function slim(doc) { await doc.transform(dedup(), prune({ keepAttributes: false, keepLeaves: true }), squeeze()); return doc; }
const size = (f) => (fs.statSync(f).size / 1024).toFixed(0) + ' KB';

// 몸 5종
for (const [key, keepProps] of Object.entries(BODIES)) {
  const doc = await io.read(path.join(SRC, key + '.glb'));
  keepAnims(doc, ['Sit_Chair_Pose']);
  const PROPLIKE = /Shield|Sword|Axe|Mug|Hat|Helmet|Spellbook|Wand|Staff|Crossbow|Knife|Throwable/;
  for (const n of doc.getRoot().listNodes()) {
    const nm = n.getName();
    if (n.getMesh() && PROPLIKE.test(nm) && !keepProps.includes(nm)) n.dispose();
  }
  await slim(doc);
  const f = path.join(OUT, key + '.glb'); await io.write(f, doc); console.log(key, size(f));
}
// 말
{
  const doc = await io.read(path.join(SRC, 'horse.glb'));
  keepAnims(doc, ['Idle', 'Walk', 'Gallop']);
  await slim(doc);
  const f = path.join(OUT, 'horse.glb'); await io.write(f, doc); console.log('horse', size(f));
}
// gltf 여러 개 → 한 glb. 장면마다 루트 노드 하나(이름 = 파일 이름)로 묶는다
async function pack(files, nameOf, outName) {
  const doc = await io.read(path.join(SRC, files[0]));
  const scene = doc.getRoot().getDefaultScene() || doc.getRoot().listScenes()[0];
  const wrap = (sc, name) => {
    const root = doc.createNode(name);
    for (const c of sc.listChildren()) { sc.removeChild(c); root.addChild(c); }
    return root;
  };
  const roots = [wrap(scene, nameOf(files[0]))];
  for (const f of files.slice(1)) {
    const before = new Set(doc.getRoot().listScenes());
    mergeDocuments(doc, await io.read(path.join(SRC, f)));
    for (const sc of doc.getRoot().listScenes()) if (!before.has(sc)) { roots.push(wrap(sc, nameOf(f))); sc.dispose(); }
  }
  for (const r of roots) scene.addChild(r);
  await doc.transform(unpartition(), dedup(), prune({ keepAttributes: false, keepLeaves: true }), squeeze());
  const out = path.join(OUT, outName); await io.write(out, doc); console.log(outName, size(out), roots.length + '개');
}
await pack(PROPS, PROP_NAME, 'props.glb');
const MAP = fs.readdirSync(path.join(SRC, 'map')).filter((f) => f.endsWith('.gltf')).sort().map((f) => 'map/' + f);
await pack(MAP, (f) => path.basename(f, '.gltf'), 'map.glb');

let tot = 0; for (const f of fs.readdirSync(OUT)) if (f.endsWith('.glb')) tot += fs.statSync(path.join(OUT, f)).size;
console.log('합계', (tot / 1024 / 1024).toFixed(2), 'MB');
