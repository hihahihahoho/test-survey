import * as THREE from "three";

import {
  childrenOf, joint, rad, rootJoints, type JointDef, type JointId,
} from "./skeleton";
import type { PoseAngles } from "./pose-state";

/**
 * mannequin-mesh.ts — DỰNG BỘ KHUNG BẰNG THREE.JS THUẦN (không React).
 *
 * ⚠️ FILE NÀY IMPORT TĨNH `three`. Chỉ được với tới nó qua `import()` ĐỘNG, nếu
 *    không cả engine 3D rơi vào bundle chính. Hai nơi duy nhất được phép:
 *      · `pose-renderer.ts` (chụp ngầm) — chính nó cũng chỉ được nạp động.
 *      · `components/PoseViewport.tsx` — đã nằm sau `React.lazy`.
 *
 * ╔══ VÌ SAO HÌNH HỌC PHẢI Ở ĐÂY, KHÔNG PHẢI TRONG JSX CỦA R3F ═══════════════╗
 * ║ Có HAI đường dựng cùng một manơcanh: viewport tương tác (R3F) và bộ chụp   ║
 * ║ ngầm (three thuần, không có React). Nếu mỗi đường tự khai hình học của     ║
 * ║ mình thì tấm ảnh gửi cho máy vẽ sẽ dần khác con manơcanh người dùng vừa    ║
 * ║ nắn — sai lệch loại KHÔNG BÁO, chỉ lộ ra khi ảnh sinh ra sai dáng.         ║
 * ║ Nên: đúng một hàm dựng, R3F gắn nó vào scene bằng `<primitive>`.           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

export const POSE_COLORS = {
  bone: "#c3c9d2",
  joint: "#8d97a5",
  jointHover: "#5b93ff",
  jointActive: "#f59e0b",
  head: "#d7dce3",
  face: "#3a4250",
  /* KHÔNG còn khoá `background`. Ảnh manơcanh nộp cho máy vẽ nay để nền TRỐNG
     (alpha 0) — xem `pose-renderer.ts` — nên không có màu nền nào để khai. */
} as const;

/** Khoá `userData` mang id khớp — đường duy nhất để từ mesh bị bấm trúng suy ra
 *  khớp nào. Đặt hằng để chỗ đọc và chỗ ghi không thể gõ lệch nhau. */
const JOINT_KEY = "poseLabJointId";

export interface MannequinHandle {
  /** Gắn cái này vào scene. `position.y` = độ nâng gốc (`rootY`). */
  root: THREE.Group;
  /** Group của từng khớp — gizmo xoay bám vào chính các object này. */
  joints: Record<JointId, THREE.Group>;
  setAngles(angles: PoseAngles): void;
  setRootY(y: number): void;
  /** Tô sáng khớp đang chọn / đang rê chuột. `null` = không có. */
  setHighlight(selected: JointId | null, hovered: JointId | null): void;
  /** Trả GPU lại. Bắt buộc gọi khi gỡ — nhất là ở bộ chụp ngầm, nơi hàm này chạy
   *  hàng chục lần trong một phiên. */
  dispose(): void;
}

/** Từ một object bị raycast trúng, lần ngược lên tìm khớp sở hữu nó. */
export function jointIdOf(object: THREE.Object3D | null | undefined): JointId | null {
  let cursor: THREE.Object3D | null = object ?? null;
  while (cursor) {
    const id = cursor.userData[JOINT_KEY];
    if (typeof id === "string") return id as JointId;
    cursor = cursor.parent;
  }
  return null;
}

export function buildMannequin(): MannequinHandle {
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  const track = <T extends THREE.BufferGeometry>(g: T): T => { geometries.push(g); return g; };
  const mat = (color: string, roughness: number): THREE.MeshStandardMaterial => {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
    materials.push(m);
    return m;
  };

  /* Vật liệu DÙNG CHUNG: 40 mesh × vật liệu riêng là 40 shader program phải biên
     dịch. Ba trạng thái khớp = ba vật liệu, đổi trạng thái là gán lại con trỏ. */
  const boneMat = mat(POSE_COLORS.bone, 0.85);
  const headMat = mat(POSE_COLORS.head, 0.8);
  const faceMat = mat(POSE_COLORS.face, 0.4);
  const jointMat = mat(POSE_COLORS.joint, 0.6);
  const jointHoverMat = mat(POSE_COLORS.jointHover, 0.6);
  const jointActiveMat = mat(POSE_COLORS.jointActive, 0.6);

  const joints = {} as Record<JointId, THREE.Group>;
  /* Mesh đổi màu theo trạng thái của từng khớp (viên bi + quả đầu). */
  const skins = {} as Record<JointId, THREE.Mesh[]>;

  const buildJoint = (def: JointDef): THREE.Group => {
    const group = new THREE.Group();
    group.name = def.id;
    group.userData[JOINT_KEY] = def.id;
    group.position.set(def.offset[0], def.offset[1], def.offset[2]);
    joints[def.id] = group;
    skins[def.id] = [];

    if (def.bone) {
      const bone = new THREE.Mesh(
        track(new THREE.CapsuleGeometry(def.bone.radius, def.bone.length, 4, 14)),
        boneMat,
      );
      bone.position.y = (def.bone.dir * def.bone.length) / 2;
      group.add(bone);
    }

    if (def.ball) {
      const ball = new THREE.Mesh(track(new THREE.SphereGeometry(def.ball, 16, 12)), jointMat);
      group.add(ball);
      skins[def.id]!.push(ball);
    }

    if (def.headRadius) {
      const r = def.headRadius;
      const headPivot = new THREE.Group();
      headPivot.position.y = r;
      const head = new THREE.Mesh(track(new THREE.SphereGeometry(r, 28, 20)), headMat);
      headPivot.add(head);
      skins[def.id]!.push(head);

      /* Hai con mắt KHÔNG phải trang trí: không có chúng thì quả cầu đầu đối xứng
         hoàn toàn, và ở góc ¾ / trên xuống không ai đọc được nhân vật đang quay
         mặt đi đâu — thứ quan trọng số một của một tấm pose reference. */
      const eyeGeo = track(new THREE.SphereGeometry(r * 0.13, 12, 10));
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(eyeGeo, faceMat);
        eye.position.set(side * r * 0.33, r * 0.08, r * 0.86);
        headPivot.add(eye);
      }
      group.add(headPivot);
    }

    if (def.foot) {
      const foot = new THREE.Mesh(track(new THREE.BoxGeometry(0.2, 0.1, 0.34)), boneMat);
      foot.position.set(0, -0.05, 0.13);
      group.add(foot);
    }

    /* Khớp con là CON THẬT trong cây scene — đó chính là "forward kinematics":
       xoay vai thì khuỷu/cổ tay/bàn tay đi theo, không cần một dòng toán nào. */
    for (const child of childrenOf(def.id)) group.add(buildJoint(child));

    return group;
  };

  const root = new THREE.Group();
  for (const def of rootJoints()) root.add(buildJoint(def));

  let current: { selected: JointId | null; hovered: JointId | null } = { selected: null, hovered: null };

  const paint = (id: JointId) => {
    const isHead = joint(id).headRadius !== undefined;
    const base = isHead ? headMat : jointMat;
    const material = id === current.selected ? jointActiveMat : id === current.hovered ? jointHoverMat : base;
    for (const mesh of skins[id] ?? []) mesh.material = material;
  };

  return {
    root,
    joints,
    setAngles(angles) {
      for (const id of Object.keys(joints) as JointId[]) {
        const a = angles[id];
        joints[id].rotation.set(rad(a[0]), rad(a[1]), rad(a[2]));
      }
    },
    setRootY(y) {
      root.position.y = y;
    },
    setHighlight(selected, hovered) {
      const before = current;
      current = { selected, hovered };
      /* Chỉ sơn lại 4 khớp có thể đổi, không quét cả 17: hàm này chạy mỗi lần rê
         chuột qua một khớp. */
      for (const id of [before.selected, before.hovered, selected, hovered]) {
        if (id) paint(id);
      }
    },
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
}
