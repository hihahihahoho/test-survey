/**
 * prompt-studio.ts — phần THUẦN của Prompt Studio (bước ⑤).
 *
 * Panel ấy làm đúng một lời hứa: *"đây là chữ engine sẽ gửi đi"*. Hai thứ dễ phá lời
 * hứa đó nhất đều là logic, không phải markup — nên chúng nằm ở đây, kiểm được bằng
 * test mà không phải dựng cả wizard:
 *   ① TÊN TẤM       — id của contract (`nen2`, `pose-nhan-vat`) không phải thứ người ta
 *                      đọc được, nhưng dịch sai còn tệ hơn: id LUÔN được hiện kèm.
 *   ② CÂU BÁO LỖI   — bốn ngách lỗi của endpoint, mỗi ngách một việc phải làm khác nhau.
 */
import { presentError } from "@/lib/api/errors";
import { promptPreviewFailedDetailsSchema, validationSchema } from "@/lib/types/api";
import type { SheetPromptTweak } from "./model";

/* ══════════════════════════════════════════════════════════════════════════
   1. Tên tấm
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Id tấm do `buildKitsetContract` đặt → chữ người dùng đọc được.
 *
 * Bảng này là BẢN DỊCH, không phải nguồn sự thật: id không có trong bảng (contract nhập
 * từ `styles.json` của dự án khác) đi ra NGUYÊN VĂN chứ không bị gán một cái tên đẹp mà
 * sai. Cùng lý do màn luôn hiện id bên cạnh tên.
 */
const SHEET_TITLES: Record<string, string> = {
  nen: "Nền",
  popup: "Popup",
  "popup-doc": "Popup dọc",
  ui: "UI nhỏ",
  "ui-doc": "UI nhỏ dọc",
  "dao-cu": "Đạo cụ",
  "dao-cu-doc": "Đạo cụ dọc",
};

export function sheetTitle(sheetId: string): string {
  // `pose-<id nhân vật>` mang id nhân vật bên trong (`pose-nhan-vat-2`), nên nó KHÔNG
  // cắt được bằng luật "bỏ số đuôi" như các tấm khác — bắt riêng, trước.
  if (sheetId.startsWith("pose-")) return "Dáng nhân vật";
  const m = /^(.*?)(\d*)$/.exec(sheetId);
  const base = m?.[1] ?? sheetId;
  const n = m?.[2] ?? "";
  const label = SHEET_TITLES[base];
  if (!label) return sheetId;
  return n ? `${label} ${n}` : label;
}

/** Tấm này có lời người dùng nói thêm không? Nguồn DUY NHẤT của dấu "✎ đã chỉnh". */
export function isTweaked(t: SheetPromptTweak | undefined): boolean {
  if (!t) return false;
  return Boolean((t.directive ?? "").trim() || (t.promptOverride ?? "").trim());
}

/* ══════════════════════════════════════════════════════════════════════════
   2. Lỗi
   ══════════════════════════════════════════════════════════════════════════ */

export interface PromptStudioProblem {
  /** Câu hiện trong thân panel — đời thường, nói luôn việc phải làm tiếp. */
  message: string;
  /**
   * Bằng chứng kỹ thuật, CHỈ để trong panel gập "Chi tiết" (§3.9 luật ①: chuỗi kỹ thuật
   * không ra thân UI). Rỗng ⇒ không có gì để mở ra.
   */
  details: string[];
}

/** Ba `details.reason` của 422 PROMPT_PREVIEW_FAILED — mỗi cái một việc phải làm. */
const FAILED_REASONS: Record<string, string> = {
  ENGINE_MISSING: "Chưa thấy bộ dựng ảnh trên máy — cài lại KitGen rồi bấm xem lại.",
  TIMEOUT: "Dựng prompt lâu quá không xong. Bấm xem lại giúp nhé.",
  ENGINE_FAILED: "Bộ dựng ảnh dừng giữa chừng nên chưa có prompt để xem.",
};

/**
 * `AgentError` → câu tiếng Việt cho panel.
 *
 * VÌ SAO CÓ CÂU RIÊNG Ở ĐÂY, trong khi §3.9 luật ② cấm màn tự viết copy lỗi: bảng
 * `ERROR_TABLE` nói đúng nhưng nói cho MỘT NGỮ CẢNH KHÁC. `RUN_ACTIVE` ở đó là *"Thao
 * tác này cần dừng lượt chạy trước"* — đọc như thể người dùng vừa làm hỏng lượt vẽ của
 * mình, trong khi việc họ vừa làm chỉ là bấm XEM. Ba mã dưới đây là ba tình huống RIÊNG
 * của cửa xem trước (agent ghi đè chính `prompts/` mà lượt đang chạy đang đọc — xem
 * `agent/routes/contract.mjs:85`), nên chúng có câu riêng. Mọi mã còn lại vẫn đi qua
 * `presentError`, tức vẫn là copy của bảng chung — không có nhánh nào tự bịa chữ.
 */
export function promptPreviewProblem(err: unknown): PromptStudioProblem {
  const v = presentError(err);
  const details = v.details;

  if (v.code === "RUN_ACTIVE" || v.code === "RUN_CONFLICT") {
    const runId = readString(details, "runId");
    return {
      message: "Đang có lượt vẽ chạy — chờ xong rồi xem prompt.",
      details: runId ? [`runId: ${runId}`] : [],
    };
  }

  if (v.code === "CONTRACT_INVALID") {
    // `details.errors` đúng hình dạng `agent/lib/validate.mjs` (`{code, path, message}`) —
    // dùng lại schema đã có thay vì đọc mò từng khoá.
    const parsed = validationSchema.safeParse(details);
    const errors = parsed.success ? parsed.data.errors : [];
    return {
      message: errors.length
        ? `Bản thiết kế đang có ${errors.length} lỗi nên chưa dựng được prompt.`
        : "Bản thiết kế đang có lỗi nên chưa dựng được prompt.",
      details: errors.map((e) => [e.path, e.message ?? e.code].filter(Boolean).join(" — ")),
    };
  }

  if (v.code === "PROMPT_PREVIEW_FAILED") {
    const parsed = promptPreviewFailedDetailsSchema.safeParse(details);
    const d = parsed.success ? parsed.data : null;
    const reason = d?.reason ?? "";
    return {
      message: FAILED_REASONS[reason] ?? "Chưa dựng được prompt để xem.",
      details: [
        reason ? `reason: ${reason}` : "",
        typeof d?.exitCode === "number" ? `exitCode: ${d.exitCode}` : "",
        d?.output ?? "",
      ].filter((s) => s !== ""),
    };
  }

  /* Mọi ca còn lại — kể cả `AGENT_NOT_RUNNING` khi app local tắt (client.ts đặt mã đó
     cho fetch không tới được đích). Câu chữ LẤY TỪ BẢNG: đó chính là câu "mở công cụ
     local lên" mà cả app đang dùng, viết lại ở đây chỉ tạo ra phiên bản thứ hai. */
  return { message: `${v.title}. ${v.explain}`, details: [] };
}

function readString(details: unknown, key: string): string {
  if (!details || typeof details !== "object") return "";
  const v = (details as Record<string, unknown>)[key];
  return typeof v === "string" ? v : "";
}
