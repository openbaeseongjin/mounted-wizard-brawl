// 그래픽 비교 시험 (?look=pp | all): 「화면 효과」(postfx.js)를 켠 채로, 시험 스크립트가 카메라를 고정해(camOv) 같은 장면을 찍는다
// 진짜 모델·배경은 이제 게임 설정 「진짜 모델」(rigModels.js · venues.js)이 그린다 (v0.5). 기본 게임에는 안 쓰인다: main.js 가 주소에 ?look 이 있을 때만 불러온다
import { createPostFx } from './postfx.js';

export async function createLook({ renderer, scene, camera, get, mode }) {
  const look = { mode, camOv: null, post: null, get };   // get: 시험 스크립트가 비주얼에 닿을 때 쓴다
  if (mode === 'pp' || mode === 'all') look.post = await createPostFx({ renderer, scene, camera });
  look.render = function () {
    if (look.camOv) { const c = look.camOv; camera.position.set(...c.p); camera.lookAt(...c.t); if (c.fov) { camera.fov = c.fov; camera.updateProjectionMatrix(); } }
    if (look.post) look.post.render();
    else renderer.render(scene, camera);
  };
  return look;
}
