/**
 * features/home/lib/run-line.ts — TRẠNG THÁI LƯỢT GEN GẦN NHẤT trên thẻ Home (BACKLOG #22).
 *
 * ══ LỖ THỦNG NÀY CÓ THẬT, VÀ NÓ IM LẶNG ══════════════════════════════════════
 * `deriveStatus` (features/kitfile) suy trạng thái theo thứ tự: đang chạy → chưa có
 * ảnh nào → đã sửa thiết kế → có tấm lỗi → xong. Thứ tự đó đúng cho mọi ca TRỪ ĐÚNG
 * MỘT — ca đau nhất: lượt gen chết **100%**. Khi đó `rawPresent === 0`, nhánh "chưa có
 * ảnh nào" bắt trước, và thẻ nói «Chưa vẽ» — y hệt một dự án chưa từng chạy. Chủ sản
 * phẩm gặp đúng cảnh này hai lần trong một ngày và mô tả nó là «nó chẳng báo gì cả».
 *
 * ══ VÌ SAO KHÔNG SỬA THẲNG `deriveStatus` ════════════════════════════════════
 * Hàm đó là hợp đồng chung của nhiều màn (S1 cũ, chip lọc, `hasStatus`), và thứ tự ưu
 * tiên của nó được chốt bằng chữ trong FE3-PLAN §3-S1. Đảo nhánh ở đó là đổi nghĩa
 * dưới chân những màn không liên quan. Ở đây thêm một LỚP MỎNG chỉ cho thẻ Home: nói
 * về LƯỢT CHẠY (nguồn `stats.lastRun` + `state.activeRun`), không phải về ảnh trên đĩa.
 *
 * ══ MỘT DÒNG, KHÔNG PHẢI DASHBOARD ═══════════════════════════════════════════
 * Trả về `null` nghĩa là "thẻ cứ dùng badge cũ" — cố ý, để những trạng thái mà
 * `deriveStatus` nói hay hơn (Cần vẽ lại, Không mở được, Chưa vẽ) không bị đè. Thẻ vì
 * vậy luôn có ĐÚNG MỘT dòng trạng thái, không bao giờ hai.
 *
 * Thuần khiết, không React ⇒ test bằng Node.
 */
import { relTime } from "@/lib/format";
import type { Project } from "@/lib/types";

/** Ba chấm màu, ánh xạ thẳng sang token đã đo tương phản. */
export type RunDot = "running" | "danger" | "ok";

export interface RunLine {
  dot: RunDot;
  /** Dòng phụ ngắn, đã Việt hoá và đã nhét số. */
  text: string;
  /** Câu dài cho `title`/`aria-label`. */
  long: string;
}

function num(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0;
}

/**
 * Suy dòng phụ. `null` ⇒ không có gì đáng nói về lượt chạy, thẻ giữ badge cũ.
 * `now` tiêm được để test thời gian tương đối không phụ thuộc đồng hồ máy.
 */
export function runLineOf(project: Project | null | undefined, now: number = Date.now()): RunLine | null {
  if (!project || project.broken === true) return null;

  // ① ĐANG CHẠY — việc đang diễn ra thắng mọi thứ đã qua. Số x/y tự cập nhật theo
  //    nhịp poll sẵn có của danh sách project; không thêm query nào cho riêng thẻ.
  const active = project.state?.activeRun;
  if (active) {
    const total = num(active.total);
    const done = Math.min(num(active.done), total || Number.MAX_SAFE_INTEGER);
    return {
      dot: "running",
      text: total > 0 ? `Đang tạo ảnh ${done}/${total}` : "Đang tạo ảnh",
      long: total > 0 ? `Máy đang tạo ảnh, xong ${done} trên ${total} tấm.` : "Máy đang tạo ảnh.",
    };
  }

  const last = project.stats?.lastRun;
  if (!last) return null;

  // ② LƯỢT VỪA RỒI HỎNG — kể cả khi hỏng sạch (ca mà badge cũ nuốt mất).
  //    `env-failed` = engine còn chẳng chạy được; im lặng ở đây là tệ nhất.
  const failed = num(last.fail);
  if (last.status === "env-failed" || last.status === "done-with-errors" || failed > 0) {
    const total = num(last.total) || failed + num(last.ok);
    const text = last.status === "env-failed" && failed === 0
      ? "Lần trước không chạy được"
      : `Lỗi ${failed}/${total || failed} tấm`;
    return {
      // `failSummary` do agent gộp — dùng nguyên văn để mọi bề mặt nói cùng một câu.
      dot: "danger",
      text,
      long: last.failSummary ?? `Lượt tạo ảnh gần nhất có ${failed} tấm lỗi. Mở dự án để xem lý do.`,
    };
  }

  // ③ XONG ỔN. Nhường đường khi thiết kế đã đổi sau lần chạy: «Cần vẽ lại» là việc
  //    CẦN LÀM, còn «Xong» chỉ là tin cũ — badge của `deriveStatus` nói đúng hơn.
  if (last.status === "done" && project.state?.stale !== true) {
    const rel = last.at ? relTime(last.at, now) : "—";
    return {
      dot: "ok",
      text: rel === "—" ? "Đã tạo ảnh xong" : `Đã tạo ảnh xong · ${rel}`,
      long: rel === "—" ? "Lượt tạo ảnh gần nhất xong, không có tấm nào lỗi." : `Lượt tạo ảnh gần nhất xong ${rel}, không có tấm nào lỗi.`,
    };
  }

  // Dừng tay, đang chờ, hoặc thiết kế đã đổi ⇒ để badge cũ nói.
  return null;
}

/** Chấm màu → class nền. Màn KHÔNG tự chọn màu (luật của `kit-status.ts`). */
export const RUN_DOT_CLASS: Record<RunDot, string> = {
  running: "bg-running",
  danger: "bg-danger",
  ok: "bg-ok",
};
