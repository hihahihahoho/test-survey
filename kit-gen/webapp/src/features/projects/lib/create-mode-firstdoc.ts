/**
 * features/projects/lib/create-mode-firstdoc.ts — LUẬT của FILE CON ĐẦU TIÊN (thuần hàm).
 *
 * NGUỒN: FE2-PLAN §3-B2 · §6 hàng rủi ro **cao** ("project tạo thật nhưng doc local tạo lỗi") ·
 *        UI-SPEC-V2 §1.4 hàng *success* · quyết định đã chốt của chủ dự án (FE2-PLAN §8-2):
 *        **doc lỗi ⇒ GIỮ PROJECT + [Thử tạo file lại]**, KHÔNG tự xoá project.
 *
 * BỐN LUẬT:
 *
 *  1. **`POST /api/projects` chạy ĐÚNG MỘT LẦN.** Retry ở đây chỉ tạo lại FILE CON.
 *     Vì thế mọi thứ liên quan tới project được truyền vào dưới dạng dữ liệu đã có
 *     (`projectId`), module này không biết và không được biết cách tạo project.
 *
 *  2. **Canvas KHÔNG có `view`.** `view` là bộ lọc sheet của file workflow (§4.5). Gắn nó
 *     vào canvas là mời người sau hiểu nhầm canvas cũng lọc contract.
 *
 *  3. **Không đọc được danh sách sheet thì VẪN tạo file, và NÓI RA.** Bịa `sheetIds` là
 *     tạo bộ lọc trỏ vào id không tồn tại; im lặng thì người dùng mở file ra thấy trống
 *     mà không hiểu vì sao. Tab ảo «Tất cả sheet» (C1) bảo đảm không sheet nào tàng hình.
 *
 *  4. **Câu chữ ở đây, không ở JSX.** Ca "project xong / file lỗi" là ca khó nhất của đợt;
 *     để câu chữ trong hàm thuần thì test khoá được nó mà không cần dựng DOM.
 */
import type { CreateDocInput } from "@/features/docs/lib";
import type { CreateIntent } from "./create-mode";

/** Chờ ngần này mới hiện hộp «Đang tạo…». Dưới ngưỡng thì chớp nháy còn khó chịu hơn im lặng. */
export const FIRST_DOC_DELAY_MS = 400;

/**
 * Trần thời gian chờ đọc bản thiết kế để lấy `sheetIds`. Hết hạn ⇒ **vẫn tạo file** với
 * `sheetIds = null` (LUẬT 3) thay vì treo người dùng ở màn "Đang tạo…" vô thời hạn.
 */
export const SHEETS_WAIT_MS = 8_000;

/**
 * Dựng payload cho `docsRepo.create`.
 *
 * @param sheetIds `null` = CHƯA BIẾT (chưa đọc được bản thiết kế). `[]` = biết chắc là rỗng
 *                 (template `blank`) — hai ca khác nhau, không được gộp.
 */
export function firstDocInput(intent: CreateIntent, sheetIds: readonly string[] | null): CreateDocInput {
  const { name, kind } = intent.firstDoc;
  if (kind === "canvas") return { name, kind };            // LUẬT 2
  if (sheetIds === null) return { name, kind };            // LUẬT 3
  return { name, kind, view: { sheetIds: [...sheetIds], variantIds: [] } };
}

/** Có cần đọc bản thiết kế trước khi tạo file đầu tiên không? Canvas thì không. */
export function needsSheetIds(intent: CreateIntent): boolean {
  return intent.firstDoc.kind === "workflow";
}

/* ═════════════ CÂU CHỮ ═════════════ */

export interface FirstDocCopy {
  /** Tiêu đề toast khi mọi thứ trót lọt. */
  successTitle: string;
  /** Câu phụ — nói THẬT chỗ file đang nằm (IndexedDB trên máy), không nói mập mờ. */
  successBody: string;
}

export function firstDocCopy(intent: CreateIntent, projectName: string): FirstDocCopy {
  const doc = intent.firstDoc.name;
  return {
    successTitle: `Đã tạo «${projectName}» và file «${doc}»`,
    successBody:
      intent.firstDoc.kind === "canvas"
        ? "Bàn làm việc đang trống và được lưu trên máy bạn. Chưa tốn lượt sinh ảnh nào."
        : "File này lọc theo các sheet của bản thiết kế và được lưu trên máy bạn.",
  };
}

/** Câu bổ sung khi tạo file workflow mà chưa đọc được bản thiết kế (LUẬT 3). */
export const FIRST_DOC_NO_SHEETS_NOTE =
  "Chưa đọc được danh sách sheet của project nên file này chưa lọc sheet nào. " +
  "Mở tab «Tất cả sheet» để thấy đủ, hoặc chọn sheet cho file sau.";

export interface PartialSuccessCopy {
  /** Tiêu đề: điều CHẮC CHẮN ĐÚNG phải đứng trước (project đã có thật). */
  title: string;
  /** Trấn an: cái gì KHÔNG mất. */
  reassure: string;
  /** Việc còn thiếu, nói bằng tiếng người. */
  whatFailed: string;
  retryLabel: string;
  fallbackLabel: string;
}

/**
 * Ca "project xong / file lỗi".
 *
 * Vì sao KHÔNG tự xoá project (FE2-PLAN §8-2 + bài học C-01): xoá để giả vờ rollback là
 * một thao tác PHÁ HUỶ chạy tự động sau lưng người dùng, đúng loại việc đã gây race C-01.
 * Thư mục trên đĩa đã tạo xong và không có gì sai với nó — thứ hỏng chỉ là bản nháp trong
 * trình duyệt.
 */
export function partialSuccessCopy(projectName: string, docName: string): PartialSuccessCopy {
  return {
    title: `Đã tạo project «${projectName}»`,
    reassure:
      "Thư mục project trên đĩa đã tạo xong và không bị ảnh hưởng. Bạn không cần tạo lại project.",
    whatFailed: `Chỉ file đầu tiên «${docName}» chưa lưu được trên máy này.`,
    retryLabel: "Thử tạo file lại",
    fallbackLabel: "Mở quy trình chuẩn",
  };
}
