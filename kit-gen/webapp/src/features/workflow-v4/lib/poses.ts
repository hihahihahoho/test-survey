/**
 * poses.ts — DANH MỤC DÁNG MASCOT, tách khỏi `steps/MascotStep.tsx`.
 *
 * Vì sao tách: `model.ts` phải biết danh sách dáng để đặt **mặc định chọn hết** (UI-FIX §2),
 * mà `model.ts` import ngược lên một file `steps/` thì thành vòng import (step nào cũng
 * `import { useWorkflowStore } from "../lib/model"`). Danh mục là DỮ LIỆU, nên nó về `lib/`.
 *
 * §W1-7 vẫn nguyên: store giữ **id tiếng Anh**, UI hiện **nhãn tiếng Việt**.
 */
export type PoseGroup = "Cơ bản" | "Cảm xúc" | "Chuyển động" | "Chiến dịch" | "Góc nhìn";

export const POSES = [
  { id: "idle", label: "Đứng chờ", group: "Cơ bản" }, { id: "wave", label: "Vẫy tay", group: "Cơ bản" },
  { id: "point", label: "Chỉ tay", group: "Cơ bản" }, { id: "present", label: "Giới thiệu", group: "Cơ bản" },
  { id: "cheer", label: "Ăn mừng", group: "Cảm xúc" }, { id: "sad", label: "Buồn", group: "Cảm xúc" },
  { id: "think", label: "Suy nghĩ", group: "Cảm xúc" }, { id: "thumbs-up", label: "Giơ ngón cái", group: "Cảm xúc" },
  { id: "run", label: "Chạy", group: "Chuyển động" }, { id: "walk", label: "Đi bộ", group: "Chuyển động" },
  { id: "jump", label: "Nhảy", group: "Chuyển động" }, { id: "dance", label: "Nhảy múa", group: "Chuyển động" },
  { id: "hold-gift", label: "Ôm quà", group: "Chiến dịch" }, { id: "bow", label: "Cúi chào", group: "Chiến dịch" },
  { id: "sit", label: "Ngồi", group: "Chiến dịch" }, { id: "fly", label: "Bay", group: "Chiến dịch" },
  { id: "view-34", label: "Góc 3/4", group: "Góc nhìn" }, { id: "view-side", label: "Nhìn ngang", group: "Góc nhìn" },
  { id: "view-back", label: "Nhìn sau", group: "Góc nhìn" },
] as const satisfies ReadonlyArray<{ id: string; label: string; group: PoseGroup }>;

/** Thứ tự nhóm hiện trên hàng chip — lấy từ chính danh mục để không lệch khi thêm dáng. */
export const POSE_GROUPS: PoseGroup[] = [...new Set(POSES.map((pose) => pose.group))];

/** Nhãn tiếng Việt của một id; id lạ (dữ liệu cũ) rơi về chính nó thay vì biến mất. */
export function poseLabel(id: string): string {
  return POSES.find((pose) => pose.id === id)?.label ?? id;
}

/** MẶC ĐỊNH CHỌN HẾT (UI-FIX §2/§3a): bỏ bớt dễ hơn cộng thêm từng cái. */
export function allPoseIds(): string[] {
  return POSES.map((pose) => pose.id);
}
