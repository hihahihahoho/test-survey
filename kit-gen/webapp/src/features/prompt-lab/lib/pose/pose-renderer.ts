import * as THREE from "three";

import { buildMannequin } from "./mannequin-mesh";
import { CAMERA_TARGET, cameraView, type CameraView, type PoseAngles } from "./pose-state";

/**
 * pose-renderer.ts — VẼ MỘT TẤM POSE REFERENCE, KHÔNG CẦN MÀN HÌNH NÀO.
 *
 * ⚠️ IMPORT TĨNH `three` ⇒ chỉ được nạp bằng `import()` động. Cửa vào duy nhất là
 *    `capture-pose-ref.ts`; đừng import file này từ bất cứ đâu khác.
 *
 * ╔══ VÌ SAO TỰ TẠO RENDERER RỒI HUỶ, THAY VÌ MƯỢN CANVAS ĐANG MỞ ═══════════╗
 * ║ Cái hàm này tồn tại để composer gọi lúc người dùng bấm Gen — lúc đó rất có ║
 * ║ thể KHÔNG có viewport 3D nào đang mở (họ chỉ chọn hai cái pill). Mượn      ║
 * ║ canvas đang mở nghĩa là tính năng chỉ chạy khi người dùng tình cờ đang ở   ║
 * ║ tab 3D — một lời hứa không giữ được.                                       ║
 * ║ Giá phải trả là context WebGL: trình duyệt chỉ cho ~16 context sống cùng   ║
 * ║ lúc, nên `dispose()` + `forceContextLoss()` ở cuối KHÔNG phải dọn dẹp cho  ║
 * ║ đẹp — thiếu nó thì gọi tới lần thứ 16 là cả trang mất WebGL.               ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

export interface RenderPoseInput {
  angles: PoseAngles;
  rootY: number;
  view: CameraView;
  /** Cạnh ảnh vuông, tính bằng pixel. */
  size: number;
}

/** Trường nhìn dọc — GIỮ BẰNG viewport tương tác, nếu không thì ảnh chụp ngầm sẽ
 *  đóng khung nhân vật khác với cái người dùng vừa nhìn thấy. */
export const POSE_FOV = 34;

/**
 * Dựng scene → render một khung → đọc PNG → trả GPU. Đồng bộ, không đợi gì cả:
 * không có texture hay model nào phải tải, toàn bộ hình học sinh từ số.
 */
export function renderPoseDataUrl({ angles, rootY, view, size }: RenderPoseInput): string {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    /* Bắt buộc: không có nó, trình duyệt được phép xoá buffer ngay sau khi vẽ và
       `toDataURL` đọc phải khung trống (ảnh đen). */
    preserveDrawingBuffer: true,
    /* NỀN TRONG SUỐT THẬT, không phải một tấm trắng. Ảnh này đi thẳng vào
       `referenced_image_paths` của image_gen, và máy vẽ bắt chước ảnh tham chiếu ở
       mọi tầng — kể cả tầng nền: một manơcanh trên nền trắng đặc dạy nó trả về một
       tấm nhân vật đục kín, đúng thứ cổng alpha của `gen.sh` đánh trượt. */
    alpha: true,
  });
  renderer.setPixelRatio(1); // cỡ ảnh do `size` quyết, không do màn hình người dùng
  renderer.setSize(size, size, false);

  /* SCENE KHÔNG CÓ NỀN. `toDataURL` đọc buffer WebGL, nên một `Color` gán làm nền
     của scene là một tấm nền ĐẶC ghi thẳng vào ảnh nộp cho máy vẽ — và máy vẽ bắt
     chước cả tầng nền của ảnh tham chiếu. Để trống + `setClearColor(…, 0)` thì
     buffer giữ nguyên alpha 0, trong ảnh chỉ còn đúng cái manơcanh xám. */
  const scene = new THREE.Scene();
  renderer.setClearColor(0x000000, 0);

  const ambient = new THREE.AmbientLight(0xffffff, 0.9);
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(3.5, 6, 4);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(-4, 2.5, -3);
  scene.add(ambient, key, fill);

  const mannequin = buildMannequin();
  mannequin.setAngles(angles);
  mannequin.setRootY(rootY);
  scene.add(mannequin.root);

  const spec = cameraView(view);
  const camera = new THREE.PerspectiveCamera(POSE_FOV, 1, 0.1, 100);
  camera.position.set(spec.position[0], spec.position[1], spec.position[2]);
  camera.lookAt(CAMERA_TARGET[0], CAMERA_TARGET[1], CAMERA_TARGET[2]);

  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL("image/png");

  mannequin.dispose();
  scene.remove(mannequin.root);
  ambient.dispose();
  key.dispose();
  fill.dispose();
  renderer.dispose();
  /* `dispose()` một mình KHÔNG trả lại context — nó chỉ dọn tài nguyên bên trong.
     `forceContextLoss()` mới là cái bảo trình duyệt thu hồi context. */
  renderer.forceContextLoss();

  return url;
}
