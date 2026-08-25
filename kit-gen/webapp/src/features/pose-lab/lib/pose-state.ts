/**
 * pose-state.ts — KIỂU + PHÉP BIẾN ĐỔI của một dáng. Thuần logic, không React,
 * không three.js: đây là phần chạy được ở môi trường test `node`, và cũng là phần
 * duy nhất của lab đáng mang đi nếu ý tưởng được chốt.
 */
import { JOINT_IDS, joint, type AxisSpec, type JointId, type Vec3 } from "./skeleton";

/** Góc của TOÀN BỘ khớp, theo ĐỘ. Đầy đủ (không `Partial`) để slider và gizmo
 *  không phải xử lý trường hợp "khớp này chưa có số". */
export type PoseAngles = Record<JointId, Vec3>;

/**
 * Một dáng = góc khớp + độ nâng gốc.
 *
 * Vì sao cần `rootY`: xương hông là gốc cây, xoay nó không làm người ngồi xuống
 * hay nhảy lên được. "Ngồi" phải hạ cả bộ khung xuống ~0.66, "nhảy" nhấc lên 0.35.
 * Không có ô này thì pose ngồi sẽ lơ lửng trong không khí đúng bằng chiều dài đùi.
 */
export interface PoseData {
  angles: Partial<Record<JointId, Vec3>>;
  rootY?: number;
}

/** Dáng gốc: mọi góc = 0 (đứng thẳng, tay buông) — xem quy ước ở `skeleton.ts`. */
export function zeroAngles(): PoseAngles {
  const out = {} as PoseAngles;
  for (const id of JOINT_IDS) out[id] = [0, 0, 0];
  return out;
}

/** Bảng góc THƯA của preset → bảng ĐẦY ĐỦ. Khớp không nhắc tới = 0, và bản trả về
 *  là bản sao mới (preset là hằng dùng chung, sửa trúng nó thì hỏng vĩnh viễn). */
export function expandPose(data: PoseData): PoseAngles {
  const out = zeroAngles();
  for (const id of JOINT_IDS) {
    const v = data.angles[id];
    if (v) out[id] = [v[0], v[1], v[2]];
  }
  return out;
}

/** Kẹp một góc vào dải cho phép của trục. Gizmo xoay KHÔNG bị kẹp (xoay tự do là
 *  cái hay của gizmo), nhưng slider thì phải — nên hàm này nhận `AxisSpec`. */
export function clampAxis(value: number, spec: AxisSpec): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(spec.max, Math.max(spec.min, value));
}

/** Ghi một trục của một khớp, trả bảng góc MỚI (không sửa tại chỗ — React cần
 *  tham chiếu mới mới chịu vẽ lại). */
export function setAxis(angles: PoseAngles, id: JointId, axis: "x" | "y" | "z", value: number): PoseAngles {
  const spec = joint(id).axes.find((a) => a.axis === axis);
  const current = angles[id];
  const next: Vec3 = [current[0], current[1], current[2]];
  next[axis === "x" ? 0 : axis === "y" ? 1 : 2] = spec ? clampAxis(value, spec) : value;
  return { ...angles, [id]: next };
}

/** Ghi cả ba trục cùng lúc — đường về của gizmo xoay (`onObjectChange`). */
export function setJointRotation(angles: PoseAngles, id: JointId, euler: Vec3): PoseAngles {
  return { ...angles, [id]: [euler[0], euler[1], euler[2]] };
}

/** `true` khi dáng hiện tại đã lệch khỏi dáng gốc — dùng để bật/tắt nút "Reset". */
export function isDirty(current: PoseAngles, base: PoseAngles, rootY: number, baseRootY: number): boolean {
  if (Math.abs(rootY - baseRootY) > 1e-6) return true;
  return JOINT_IDS.some((id) => {
    const a = current[id];
    const b = base[id];
    return a[0] !== b[0] || a[1] !== b[1] || a[2] !== b[2];
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   GÓC CAMERA NHANH
   ══════════════════════════════════════════════════════════════════════════
   Bốn góc này KHÔNG phải trang trí: chúng là bốn khung hình mà một bộ pose
   reference cần: chính diện để đọc tỉ lệ, ¾ để đọc khối, ngang để đọc độ vươn
   tay/chân, sau lưng cho sheet quay lưng, trên/dưới cho ô nhìn từ camera game.
   Chín hướng phủ đủ một vòng máy quay thật, và người dùng CHỈ CHỌN TÊN — không
   ai phải nghĩ bằng toạ độ. */
export type CameraView =
  | "front"
  | "three-quarter-left" | "three-quarter-right"
  | "side-left" | "side-right"
  | "back"
  | "top-down" | "low-angle"
  | "isometric";

export interface CameraViewSpec {
  id: CameraView;
  /** Nhãn tiếng Việt — thứ DUY NHẤT người dùng thấy. */
  vi: string;
  /** Vị trí camera trong world. Ngắm về `CAMERA_TARGET`. */
  position: Vec3;
}

/** Tâm ngắm: ngang ngực chibi (~1.6) chứ không phải gốc toạ độ — ngắm gốc thì
 *  nhân vật luôn nằm nửa trên khung hình. */
export const CAMERA_TARGET: Vec3 = [0, 1.55, 0];

/**
 * BẢNG GÓC MÁY — `{ id, vi, position }`, đủ một vòng như camera thật.
 *
 * KHOẢNG CÁCH ĐÃ ĐO, không phải ước: ở bán kính 6.2 thì dáng "Đứng chờ" lấp 87%
 * chiều cao khung — đẹp — nhưng dáng "Nhảy" (rootY +0.35, hai tay giơ) bị CẮT MẤT
 * ĐẦU. Lùi lên ~7.8 để dáng cao nhất còn lề.
 *
 * MỌI GÓC GIỮ CÙNG MỘT BÁN KÍNH (≈7.8 tính từ tâm ngắm) — không phải để cho đẹp:
 * một bộ reference mà mỗi tấm một cỡ nhân vật thì máy vẽ đọc ra mấy nhân vật khác
 * nhau. Sửa vị trí nào cũng phải giữ nguyên bán kính đó.
 *
 * "TRÁI/PHẢI" là trái/phải của NGƯỜI XEM, đồng bộ với cách đặt tên khớp trong
 * `skeleton.ts` (xem khối chú thích đầu file đó).
 */
export const CAMERA_VIEWS: readonly CameraViewSpec[] = [
  { id: "front", vi: "Chính diện", position: [0, 1.8, 7.8] },
  { id: "three-quarter-left", vi: "¾ trái", position: [-5.4, 2.3, 5.6] },
  { id: "three-quarter-right", vi: "¾ phải", position: [5.4, 2.3, 5.6] },
  /* `z: 0.01` chứ không phải 0: camera nằm ĐÚNG trên trục X thì vector nhìn song
     song với "up" ở vài phép `lookAt`, và ma trận xoay suy biến ⇒ khung hình lật. */
  { id: "side-left", vi: "Ngang trái", position: [-7.8, 1.8, 0.01] },
  { id: "side-right", vi: "Ngang phải", position: [7.8, 1.8, 0.01] },
  { id: "back", vi: "Sau lưng", position: [0, 1.8, -7.8] },
  /* Ngẩng 70°, KHÔNG phải 90° — thẳng đứng tuyệt đối cũng gặp đúng cái suy biến
     `lookAt` nói trên, và một tấm nhìn từ đỉnh đầu thì không đọc được dáng. */
  { id: "top-down", vi: "Trên xuống", position: [0, 8.9, 2.7] },
  { id: "low-angle", vi: "Dưới lên", position: [0, -1.7, 7.1] },
  /* ISOMETRIC ĐÚNG NGHĨA, không phải "một góc chéo cho đẹp": ba thành phần lệch
     so với tâm ngắm BẰNG NHAU (4.5 · 4.5 · 4.5) ⇒ phương vị 45°, ngẩng 35.26° —
     đúng hướng nhìn của tile isometric trong game, và bán kính vẫn là 7.79. */
  { id: "isometric", vi: "Isometric", position: [-4.5, 6.05, 4.5] },
];

/** Góc theo id; id lạ rơi về "chính diện" thay vì làm trắng màn. */
export function cameraView(id: CameraView): CameraViewSpec {
  return CAMERA_VIEWS.find((v) => v.id === id) ?? CAMERA_VIEWS[0]!;
}

export const DEFAULT_VIEW: CameraView = "three-quarter-left";
