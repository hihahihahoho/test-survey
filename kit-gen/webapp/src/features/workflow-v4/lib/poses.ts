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

/** TOÀN BỘ dáng — nay chỉ còn phục vụ nút "Chọn tất cả", không còn là mặc định. */
export function allPoseIds(): string[] {
  return POSES.map((pose) => pose.id);
}

/**
 * Thứ tự dáng của PROTOTYPE (`characterPoses` trong `styles.example.json`, cũng là thứ
 * tự khai báo của `silhouettes.js`) — "dáng thông dụng đứng trước" theo đúng bản gốc.
 */
const PROTOTYPE_POSE_ORDER = [
  "idle", "wave", "point", "hold-gift", "cheer", "sad", "run", "think", "sit", "jump",
  "bow", "thumbs-up", "fly", "walk", "dance", "present", "view-34", "view-side", "view-back",
];

/** 3 sheet × 4 ô (= `DEFAULT_SHEET_LIMITS.mascot` của `kitset-to-contract.ts` — không
 *  import được vì file đó import ngược `model.ts`). Đổi trần ô/sheet thì sửa cả hai. */
const DEFAULT_POSE_CAP = 3 * 4;

/**
 * MẶC ĐỊNH CỦA BẢN NHÁP MỚI (2026-08, quyết định chủ sản phẩm): mascot chiếm TỐI ĐA
 * ~3 sheet mỗi lần gen. Chọn hết 19 dáng = 5 sheet — mascot ăn nhiều lượt hơn cả phần
 * UI, trong khi đa số dự án chỉ cần bộ cơ bản. Quy tắc: trọn nhóm "Cơ bản" trước, rồi
 * cộng dáng thông dụng theo đúng thứ tự prototype cho tới trần 12 dáng = 3 sheet.
 *
 * Chỉ là GIÁ TRỊ KHỞI TẠO: người dùng vẫn "Chọn tất cả" / cộng từng dáng; bản nháp và
 * contract đã lưu giữ nguyên selection của họ; mascot thư viện có bộ dáng riêng vẫn
 * THẮNG mặc định này (MascotDialog `onAdoptPoses`).
 */
export function defaultPoseIds(): string[] {
  const picked: string[] = POSES.filter((pose) => pose.group === "Cơ bản").map((pose) => pose.id);
  for (const id of PROTOTYPE_POSE_ORDER) {
    if (picked.length >= DEFAULT_POSE_CAP) break;
    if (!picked.includes(id)) picked.push(id);
  }
  return picked.slice(0, DEFAULT_POSE_CAP);
}
