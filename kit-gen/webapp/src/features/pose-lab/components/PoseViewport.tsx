import * as React from "react";
import * as THREE from "three";
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, TransformControls } from "@react-three/drei";
import type { TransformControls as TransformControlsImpl } from "three-stdlib";

import { deg, type JointId, type Vec3 } from "../lib/skeleton";
import { CAMERA_TARGET, cameraView, type CameraView, type PoseAngles } from "../lib/pose-state";
import { buildMannequin, jointIdOf, POSE_COLORS, type MannequinHandle } from "../lib/mannequin-mesh";
import { POSE_FOV } from "../lib/pose-renderer";

/**
 * PoseViewport — VIEWPORT TƯƠNG TÁC (đường "Nâng cao" của tab Pose 3D).
 *
 * ╔══ NÓ KHÔNG PHẢI ĐƯỜNG CHÍNH, VÀ KHÔNG PHẢI ĐƯỜNG CHỤP ẢNH ════════════════╗
 * ║ Ảnh pose reference thật do `lib/capture-pose-ref.ts` dựng NGẦM, không cần  ║
 * ║ component này tồn tại. Đây chỉ là chỗ cho ai muốn tự nắn khớp ra một dáng  ║
 * ║ không có trong danh mục. Hai đường dùng CHUNG `buildMannequin()` nên hình  ║
 * ║ học không thể lệch nhau.                                                   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO NẠP BẰNG `React.lazy` ═══════════════════════════════════════════╗
 * ║ ① three + fiber + drei ~700 kB — import tĩnh thì mọi người dùng thật tải   ║
 * ║   chúng chỉ vì lab tồn tại trong repo.                                     ║
 * ║ ② `Pose3DTab` phải render được ở môi trường `node` (ca test dùng           ║
 * ║   `renderToString`). WebGL không có ở đó. Biên `lazy` + cờ `mounted` bên   ║
 * ║   `Pose3DTab` khiến file này KHÔNG BAO GIỜ được nạp trong test.            ║
 * ║ ⇒ Luật: đừng import file này ở bất cứ đâu bằng `import` tĩnh.              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export interface PoseViewportProps {
  angles: PoseAngles;
  rootY: number;
  selected: JointId | null;
  onSelect: (id: JointId | null) => void;
  /** Gizmo xoay xong → chép góc (ĐỘ) ngược về state để slider khớp với hình. */
  onRotate: (id: JointId, euler: Vec3) => void;
  view: CameraView;
  /** Tăng 1 mỗi lần bấm nút góc — để bấm LẠI cùng một góc vẫn kéo camera về. */
  viewNonce: number;
  /** Nhận (hoặc thu hồi) hàm chụp. `null` = canvas vừa bị gỡ, đừng chụp nữa. */
  onCaptureReady: (fn: (() => string) | null) => void;
}

/**
 * Gắn bộ khung (dựng bằng three thuần) vào cây scene của R3F.
 *
 * ══ VÌ SAO `<primitive>` CHỨ KHÔNG PHẢI MỘT CÂY JSX ═══════════════════════
 * Viết lại 17 khớp bằng JSX sẽ đẹp mắt hơn, nhưng khi đó hình học tồn tại HAI
 * bản: một cho viewport, một cho bộ chụp ngầm. Chúng sẽ trôi khỏi nhau và triệu
 * chứng duy nhất là "ảnh gửi máy vẽ hơi khác con manơcanh vừa nắn" — không log,
 * không lỗi. `<primitive>` cho phép dùng đúng một bản dựng.
 *
 * Đổi lại phải tự làm hai việc mà JSX vốn làm hộ:
 *  · Bấm chọn: R3F chỉ gắn handler lên chính `<primitive>`, nên `e.object` là
 *    mesh bị trúng và ta lần ngược lên tìm khớp (`jointIdOf`).
 *  · Cập nhật góc: ghi thẳng vào `rotation` trong `useLayoutEffect`.
 */
function MannequinObject({
  angles, rootY, selected, onSelect, onHandle,
}: {
  angles: PoseAngles;
  rootY: number;
  selected: JointId | null;
  onSelect: (id: JointId | null) => void;
  onHandle: (handle: MannequinHandle | null) => void;
}) {
  const [hovered, setHovered] = React.useState<JointId | null>(null);
  const handle = React.useMemo(() => buildMannequin(), []);

  React.useEffect(() => {
    onHandle(handle);
    return () => {
      onHandle(null);
      handle.dispose();
    };
  }, [handle, onHandle]);

  /* `useLayoutEffect`: góc phải nằm trong cây scene TRƯỚC khung hình kế, nếu không
     mỗi lần kéo slider sẽ thấy một khung hình ở tư thế cũ. */
  React.useLayoutEffect(() => { handle.setAngles(angles); }, [handle, angles]);
  React.useLayoutEffect(() => { handle.setRootY(rootY); }, [handle, rootY]);
  React.useLayoutEffect(() => { handle.setHighlight(selected, hovered); }, [handle, selected, hovered]);

  return (
    <primitive
      object={handle.root}
      onPointerDown={(e: ThreeEvent<PointerEvent>) => {
        const id = jointIdOf(e.object);
        if (!id) return;
        /* Tia bấm xuyên qua nhiều mesh lồng nhau; không chặn thì bấm vào bàn tay
           cũng chọn luôn vai và ngực nằm phía sau. */
        e.stopPropagation();
        onSelect(id);
      }}
      onPointerMove={(e: ThreeEvent<PointerEvent>) => {
        const id = jointIdOf(e.object);
        if (id !== hovered) setHovered(id);
      }}
      onPointerOut={() => setHovered(null)}
    />
  );
}

/** Kéo camera về một trong các góc nhanh. Phải sống BÊN TRONG `<Canvas>` vì chỉ ở
 *  đó mới với được `camera` và `controls` của R3F. */
function ViewRig({ view, nonce }: { view: CameraView; nonce: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: THREE.Vector3; update: () => void } | null;

  React.useEffect(() => {
    const spec = cameraView(view);
    camera.position.set(spec.position[0], spec.position[1], spec.position[2]);
    if (controls) {
      controls.target.set(CAMERA_TARGET[0], CAMERA_TARGET[1], CAMERA_TARGET[2]);
      controls.update();
    } else {
      camera.lookAt(CAMERA_TARGET[0], CAMERA_TARGET[1], CAMERA_TARGET[2]);
    }
    /* `nonce` cố ý nằm trong deps dù không dùng tới: bấm lại đúng nút góc đang
       chọn (sau khi đã tự xoay lung tung) phải kéo camera về, mà `view` thì không
       đổi nên effect sẽ không chạy nếu thiếu nó. */
  }, [view, nonce, camera, controls]);

  return null;
}

/**
 * Cầu nối chụp THỦ CÔNG (nút "Chụp pose" của phần Nâng cao). Ảnh của luồng chính
 * KHÔNG đi qua đây — xem `lib/capture-pose-ref.ts`.
 *
 * Hai chi tiết bắt buộc, thiếu cái nào cũng ra ảnh đen:
 *  ① `preserveDrawingBuffer: true` ở `<Canvas gl>` — không có thì trình duyệt được
 *    phép xoá buffer ngay sau khi vẽ, và `toDataURL` đọc phải khung trống.
 *  ② `gl.render(...)` ngay trước khi đọc — ta còn phải GIẤU GIZMO trước khi chụp
 *    nên bắt buộc vẽ lại một lượt nữa.
 */
function CaptureBridge({
  gizmo, onReady,
}: {
  gizmo: React.MutableRefObject<TransformControlsImpl | null>;
  onReady: (fn: (() => string) | null) => void;
}) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);

  React.useEffect(() => {
    onReady(() => {
      const helper = gizmo.current;
      const wasVisible = helper?.visible ?? true;
      /* Gizmo là một object trong scene ⇒ nó SẼ nằm trong ảnh nếu không tắt. Một
         tấm pose reference dính ba cái vòng tròn xanh-đỏ-lam là ảnh hỏng. */
      if (helper) helper.visible = false;
      gl.render(scene, camera);
      const url = gl.domElement.toDataURL("image/png");
      if (helper) {
        helper.visible = wasVisible;
        gl.render(scene, camera);
      }
      return url;
    });
    return () => onReady(null);
  }, [gl, scene, camera, gizmo, onReady]);

  return null;
}

export default function PoseViewport(props: PoseViewportProps) {
  const { angles, rootY, selected, onSelect, onRotate, view, viewNonce, onCaptureReady } = props;

  const gizmo = React.useRef<TransformControlsImpl | null>(null);
  const handleRef = React.useRef<MannequinHandle | null>(null);
  const [target, setTarget] = React.useState<THREE.Object3D | null>(null);

  const onHandle = React.useCallback((handle: MannequinHandle | null) => {
    handleRef.current = handle;
  }, []);

  /* Đổi khớp đang chọn ⇒ ĐỔI object mà gizmo bám vào, một nhịp SAU khi cây scene
     đã dựng xong (lúc đó `handleRef.current` mới có object của khớp mới). */
  React.useEffect(() => {
    const handle = handleRef.current;
    setTarget(selected && handle ? handle.joints[selected] ?? null : null);
  }, [selected]);

  const handleObjectChange = React.useCallback(() => {
    if (!selected || !target) return;
    onRotate(selected, [deg(target.rotation.x), deg(target.rotation.y), deg(target.rotation.z)]);
  }, [selected, target, onRotate]);

  return (
    <Canvas
      /* `preserveDrawingBuffer` là cái giá phải trả để chụp được ảnh — nó cấm
         trình duyệt tối ưu bỏ buffer sau mỗi khung. Với một manơcanh ~40 mesh thì
         không đo được, nhưng đừng bê nguyên tuỳ chọn này sang màn sản phẩm. */
      gl={{ preserveDrawingBuffer: true, antialias: true, alpha: false }}
      dpr={[1, 2]}
      camera={{ position: [0, 1.8, 7.8], fov: POSE_FOV, near: 0.1, far: 100 }}
      onPointerMissed={() => onSelect(null)}
      style={{ width: "100%", height: "100%", touchAction: "none" }}
    >
      {/* Nền TRẮNG ĐẶC của scene, không phải nền CSS: `toDataURL` đọc buffer WebGL,
          nền CSS nằm ngoài buffer nên ảnh chụp sẽ ra trong suốt/đen. */}
      <color attach="background" args={[POSE_COLORS.background]} />

      <ambientLight intensity={0.9} />
      <directionalLight position={[3.5, 6, 4]} intensity={1.15} />
      <directionalLight position={[-4, 2.5, -3]} intensity={0.35} />

      <MannequinObject
        angles={angles}
        rootY={rootY}
        selected={selected}
        onSelect={onSelect}
        onHandle={onHandle}
      />

      {/* ĐÃ THỬ VÀ BỎ: `<ContactShadows>` + `shadows` trên Canvas. Bóng đổ giúp đọc
          chỗ bàn chân chạm đất, nhưng nó phải có một MẶT PHẲNG để hứng bóng, và mặt
          phẳng đó hiện thành một tấm xám to chiếm nửa khung — soi trên trình duyệt
          mới thấy. Với một tấm pose reference thì nền trắng SẠCH quan trọng hơn cảm
          giác chạm đất: mọi vệt xám trong ảnh đều là thứ máy vẽ có thể bắt chước. */}

      {/* `makeDefault` KHÔNG phải tuỳ chọn phong cách: nhờ nó drei ghi OrbitControls
          vào store, và `TransformControls` tự tắt orbit khi bắt đầu kéo gizmo. Bỏ
          nó ra thì kéo gizmo sẽ vừa xoay khớp vừa quay cả camera. */}
      <OrbitControls makeDefault target={CAMERA_TARGET} enableDamping dampingFactor={0.12} minDistance={2.2} maxDistance={16} />

      {target ? (
        <TransformControls ref={gizmo} object={target} mode="rotate" size={0.62} onObjectChange={handleObjectChange} />
      ) : null}

      <ViewRig view={view} nonce={viewNonce} />
      <CaptureBridge gizmo={gizmo} onReady={onCaptureReady} />
    </Canvas>
  );
}
