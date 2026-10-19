// 화면 효과 (설정 「그래픽 효과」 · PC 기본 켬, 폰 기본 끔): 그림자 깊이(GTAO) · 빛 번짐 · 색 보정 · 가장자리 어둡게
// 켤 때 처음 한 번만 three.js 후처리 부품을 jsDelivr에서 불러온다. 시뮬과 무관하고 그리는 방식만 바꾼다
//  - 불투명한 세상만 후처리한다. 효과(먼지·글자·불꽃·번쩍임 같은 반투명·가산 그림)는 후처리 안에서 섞으면(선형 공간 + 빛 번짐)
//    하얗게 번져 말을 덮으므로, 후처리가 끝난 화면 위에 원래 게임과 똑같은 방식으로 따로 그린다
//  - 하늘 셰이더는 원래 톤 매핑·sRGB 변환 없이 값을 그대로 낸다 → 깊이가 없는 곳(하늘)은 마무리 변환을 건너뛴다
//  - GTAO 는 장면을 다시 그리지 않고 첫 그리기의 깊이를 그대로 쓴다 (법선은 깊이에서 복원)
import * as THREE from 'three';

const JSM = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/';
const FX_LAYER = 1, OCC_LAYER = 2;   // 따로 그릴 효과 · 효과를 가리는 물체(깊이만)
const OCC_RANGE = 60;                // 이보다 먼 물체는 효과를 가리는 깊이에서 뺀다 (관중석·언덕)

// 마무리: 톤 매핑 + sRGB + 색 보정 + 가장자리 어둡게를 한 번에 (하늘은 그대로)
const FINAL_VS = `precision highp float;
uniform mat4 modelViewMatrix; uniform mat4 projectionMatrix;
attribute vec3 position; attribute vec2 uv; varying vec2 vUv;
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FINAL_FS = `precision highp float;
uniform sampler2D tDiffuse; uniform sampler2D tDepth;
uniform float contrast, sat, vig, warm;
#include <tonemapping_pars_fragment>
#include <colorspace_pars_fragment>
varying vec2 vUv;
void main(){
  vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb;
  if (texture2D(tDepth, vUv).x < 0.99999) c = sRGBTransferOETF(vec4(ACESFilmicToneMapping(c), 1.0)).rgb;
  c = (c - 0.5) * contrast + 0.5;
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, sat);
  c += warm * (vec3(0.035, 0.012, -0.03) * smoothstep(0.45, 1.0, l) + vec3(-0.012, 0.0, 0.03) * (1.0 - smoothstep(0.0, 0.45, l)));
  vec2 d = vUv - 0.5; c *= 1.0 - dot(d, d) * vig;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

export async function createPostFx({ renderer, scene, camera }) {
  const [{ EffectComposer }, { RenderPass }, { GTAOPass }, { UnrealBloomPass }, { ShaderPass }] = await Promise.all([
    import(JSM + 'postprocessing/EffectComposer.js'), import(JSM + 'postprocessing/RenderPass.js'), import(JSM + 'postprocessing/GTAOPass.js'),
    import(JSM + 'postprocessing/UnrealBloomPass.js'), import(JSM + 'postprocessing/ShaderPass.js'),
  ]);
  const size = renderer.getSize(new THREE.Vector2()), pr = renderer.getPixelRatio();
  let W = size.x, H = size.y;
  const rt = new THREE.WebGLRenderTarget(W * pr, H * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  // 장면은 readBuffer(= renderTarget2)에 그려진다. 패스마다 읽기·쓰기 버퍼를 바꾸는데 한 프레임에 2번(GTAO·마무리)이라
  // 다음 프레임에도 장면은 늘 renderTarget2 에 그려진다 → 그쪽에만 깊이 텍스처를 달아 GTAO 와 하늘 판별에 쓴다
  // (rt 에 달면 복제본과 같은 GPU 텍스처를 나눠 써서, 다른 패스가 그린 빈 깊이로 덮인다 → 화면 전체가 하늘로 처리됐다)
  const sceneDepth = new THREE.DepthTexture(W * pr, H * pr);
  composer.renderTarget2.depthTexture = sceneDepth;
  composer.addPass(new RenderPass(scene, camera));
  const ao = new GTAOPass(scene, camera, W * pr, H * pr);
  ao.setGBuffer(sceneDepth);   // 장면을 다시 그리지 않는다 (생성자가 만든 법선 타깃은 안 쓰인다)
  ao.updateGtaoMaterial({ radius: 0.8, distanceExponent: 1.4, thickness: 1.5, scale: 1.7, samples: 12 });
  ao.setSceneClipBox(new THREE.Box3(new THREE.Vector3(-90, -2, -90), new THREE.Vector3(90, 16, 90)));   // 경기장·관중석만. 하늘의 구름·먼 언덕에 그늘이 지면 회색으로 얼룩진다
  composer.addPass(ao);
  const bloom = new UnrealBloomPass(new THREE.Vector2(W * pr, H * pr), 0.3, 0.4, 0.92);
  composer.addPass(bloom);
  const finalMat = new THREE.RawShaderMaterial({
    uniforms: { tDiffuse: { value: null }, tDepth: { value: sceneDepth }, toneMappingExposure: { value: renderer.toneMappingExposure },
      contrast: { value: 1.1 }, sat: { value: 1.16 }, vig: { value: 0.6 }, warm: { value: 1 } },
    vertexShader: FINAL_VS, fragmentShader: FINAL_FS, depthTest: false, depthWrite: false,
  });
  composer.addPass(new ShaderPass(finalMat));
  const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false });
  const _v = new THREE.Vector3(), over = [], occ = [];

  function render() {
    const s = renderer.getSize(new THREE.Vector2());
    if (s.x !== W || s.y !== H) { W = s.x; H = s.y; const p = renderer.getPixelRatio(); composer.setSize(W, H); ao.setSize(W * p, H * p); bloom.setSize(W * p, H * p); }
    finalMat.uniforms.toneMappingExposure.value = renderer.toneMappingExposure;
    over.length = 0; occ.length = 0;
    const cx = camera.position.x, cz = camera.position.z;
    scene.traverse((o) => {
      const m = o.material; if (!m || Array.isArray(m)) return;
      if (o.userData.outline) return;
      if (o.isSprite || m.transparent || m.blending !== THREE.NormalBlending) { over.push(o); o.layers.set(FX_LAYER); }
      else if (o.isMesh && o.visible && !m.isShaderMaterial && !o.userData.noOcc) {   // noOcc: 먼 배경 덩어리(venues.js)는 효과를 가릴 일이 없다
        const e = o.matrixWorld.elements, dx = e[12] - cx, dz = e[14] - cz;
        const bs = o.geometry.boundingSphere;   // 땅처럼 큰 판은 멀어도 넣는다
        if (dx * dx + dz * dz < OCC_RANGE * OCC_RANGE || !bs || bs.radius > 30) { occ.push(o); o.layers.enable(OCC_LAYER); }
      }
    });
    composer.render();
    // 효과: 가까운 물체 깊이만 먼저 그리고(말 뒤 불꽃이 가려지게), 그 위에 원래 방식(톤 매핑·sRGB)으로
    const camMask = camera.layers.mask, auto = renderer.autoClear;
    renderer.autoClear = false; renderer.clearDepth();
    camera.layers.set(OCC_LAYER); scene.overrideMaterial = depthOnly; renderer.render(scene, camera); scene.overrideMaterial = null;
    camera.layers.set(FX_LAYER); renderer.render(scene, camera);
    camera.layers.mask = camMask; renderer.autoClear = auto;
    for (const o of over) o.layers.set(0);
    for (const o of occ) o.layers.disable(OCC_LAYER);
  }
  function dispose() { composer.dispose(); rt.dispose(); ao.dispose(); bloom.dispose(); finalMat.dispose(); depthOnly.dispose(); }
  return { render, dispose, composer, ao, finalMat, sceneDepth };   // 뒤 넷은 시험·조정용
}
