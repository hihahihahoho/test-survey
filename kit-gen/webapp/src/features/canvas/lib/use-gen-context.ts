/**
 * features/canvas/lib/use-gen-context.ts — BA CON SỐ mà hộp GEN và lớp phủ «Đóng gói» cần.
 *
 * Ba thứ này là **dữ liệu THẬT** (không mock), đọc qua hook có sẵn của R0 — đúng luật
 * FE3-PLAN §4: chỉ lệnh gen mới đi qua cửa mock, còn bản thiết kế/dự án vẫn là hàng thật.
 *   ① có ảnh nhân vật chưa  → khoá/mở lệnh «Tư thế nhân vật» (BA-V3 §3.2)
 *   ② đang có lượt vẽ không → dải vàng của C2 (BA-V3 §3.4) — **chỉ để cảnh báo**
 *   ③ trên bàn có bao nhiêu thứ → giá của lệnh «Cả bộ kit»
 *
 * ⚠️ **KHÔNG có, và không được có, lời gọi huỷ lượt vẽ ở đây** (C-01: bản vanilla từng
 * xoá project khi đang gen). File này chỉ ĐỌC.
 *
 * Lỗi mạng ⇒ **không** ném, **không** chặn: coi như "chưa có ảnh nhân vật" và "không có
 * lượt nào đang chạy". Bàn làm việc nằm trên máy nên phải mở được cả khi agent tắt
 * (UX-V3 §6 hàng C1).
 */
import { useContract } from "@/lib/hooks";
import { useProject } from "@/lib/hooks";
import { contractVariants } from "@/lib/types/contract";
import type { CanvasDoc } from "@/features/docs/lib";

export interface GenContext {
  hasCharacterRef: boolean;
  runActive: boolean;
  boardItemCount: number;
}

export function useGenContext(
  projectId: string | undefined | null,
  canvas: CanvasDoc | null,
): GenContext {
  const contractQ = useContract(projectId);
  const projectQ = useProject(projectId);

  // `#22` trả `{version, contract}` chứ không trả contract trần — bọc một lớp, và đây là
  // chỗ `tsc` đã bắt tôi sai ngay lần biên dịch đầu (ghi lại để không ai "sửa cho gọn").
  const contract = contractQ.data?.contract;
  const variants = contract ? contractVariants(contract) : [];
  // "Có ảnh nhân vật" = có ít nhất một nhân vật đã gắn ảnh mẫu. `ref` là `null` khi
  // nhân vật mới khai mà chưa có ảnh (QA-FUNC) ⇒ phải lọc, không chỉ đếm `characters`.
  const hasCharacterRef = variants.some((v) =>
    (v.characters ?? []).some((c) => typeof c.ref === "string" && c.ref.trim() !== ""),
  );

  const active = projectQ.data?.state?.activeRun;
  const runActive = Boolean(active && (active.total ?? 0) > 0 && (active.done ?? 0) < (active.total ?? 0));

  return {
    hasCharacterRef,
    runActive,
    boardItemCount: canvas?.nodes.length ?? 0,
  };
}
