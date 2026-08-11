/**
 * features/docs/lib/draft-badge.ts — NỘI DUNG huy hiệu «bản nháp cục bộ» (KHÔNG có JSX).
 *
 * FE-PLAN §3-C1 tiêu chí ⑤: task này **không có UI**. Nhưng mục "Mock" của chính nó lại bắt
 * *"cờ dev hiện badge `bản nháp cục bộ` — người dùng phải biết mình đang mock"* (Q3).
 * Giải: tầng C1 chỉ cung cấp **dữ liệu** của badge (nhãn + câu giải thích + mức độ);
 * việc vẽ là của FE-2 bằng `Badge`/`Tooltip` của R0 (KHÔNG tự viết lại component, không hard-code màu).
 *
 * Vì sao phải có: nếu người dùng tưởng file con đã nằm trong project trên đĩa, họ sẽ đổi máy
 * hoặc xoá dữ liệu duyệt web và mất việc mà không hiểu vì sao — đúng rủi ro Q3 nêu.
 */
import { docsRepo } from "./docs-repo";

export interface DraftBadge {
  /** `"none"` = không hiện badge (đã có backend thật). */
  level: "none" | "info" | "warn";
  label: string;
  /** câu đầy đủ cho tooltip — viết cho người thường, không thuật ngữ nội bộ. */
  explain: string;
  /** tên token màu, KHÔNG phải mã màu (brief: cấm hard-code màu). */
  tone: "muted" | "amber";
}

export function draftBadge(storageAvailable: boolean): DraftBadge {
  if (docsRepo().kind !== "local") {
    return { level: "none", label: "", explain: "", tone: "muted" };
  }
  if (!storageAvailable) {
    return {
      level: "warn",
      label: "không lưu được",
      explain:
        "Trình duyệt đang không cho lưu trên máy này, nên thay đổi của bạn sẽ mất khi đóng tab. Ảnh và bản thiết kế của dự án không bị ảnh hưởng.",
      tone: "amber",
    };
  }
  return {
    level: "info",
    label: "bản nháp cục bộ",
    explain:
      "File này đang được lưu trên máy bạn, chưa nằm trong thư mục dự án. Đổi máy hoặc xoá dữ liệu duyệt web thì nó sẽ mất. Ảnh và bản thiết kế thì luôn nằm trong dự án.",
    tone: "muted",
  };
}
