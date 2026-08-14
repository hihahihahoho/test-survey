/**
 * features/docs/lib/docs-errors.ts — MÃ LỖI của tầng file con.
 *
 * LUẬT COPY (brief + UX-SPEC §7.3): thân UI chỉ được hiện `message` viết cho người thường;
 * chi tiết kỹ thuật (`cause`) chỉ dùng trong panel "Chi tiết cho lập trình viên".
 * Vì vậy `DocsRepoError.message` KHÔNG BAO GIỜ chứa stack, tên hàm, hay đường dẫn máy.
 *
 * Mã ở đây cố ý TRÙNG TÊN với mã của hợp đồng API tương lai (§8.2 [REV]) để khi đổi
 * adapter `local → http` thì lớp UI không phải ánh xạ lại lần nữa.
 */
export const DOCS_ERROR_CODES = [
  "DOC_NOT_FOUND",
  "DOC_NAME_TAKEN",
  "INVALID_NAME",
  "DOC_CONFLICT",
  "DOC_BROKEN",
  "DOC_READONLY",
  "STORAGE_FULL",
  "STORAGE_UNAVAILABLE",
  /**
   * Nội dung bị lớp bảo mật CHẶN (`assertNoSecret`) nên không được ghi.
   *
   * Tách khỏi `STORAGE_FULL` vì hai mã này đòi người dùng làm hai việc trái ngược:
   * "hết chỗ" bảo họ **xoá bớt file** (vô ích ở đây, và họ mất dữ liệu thật), còn mã
   * này bảo họ **sửa nội dung vừa gõ**. Trước đây `docs-repo-local.ts` gộp cả hai vì
   * `docsIdbSet` chỉ trả `false` trần — xem `DocsIdbWriteOutcome`.
   */
  "WRITE_BLOCKED",
  "NOT_IMPLEMENTED",
] as const;
export type DocsErrorCode = (typeof DOCS_ERROR_CODES)[number];

/** Câu hiện thẳng cho người dùng — không thuật ngữ nội bộ (§1.3 cấm `contract`, `job`…). */
const MESSAGES: Record<DocsErrorCode, string> = {
  DOC_NOT_FOUND: "Không tìm thấy file này. Có thể nó đã bị xoá ở nơi khác.",
  DOC_NAME_TAKEN: "Trong dự án đã có file trùng tên. Đặt tên khác giúp bạn dễ tìm hơn.",
  INVALID_NAME: "Tên file cần từ 1 đến 48 ký tự và không xuống dòng.",
  DOC_CONFLICT: "File này vừa được sửa ở nơi khác. Xem lại rồi lưu lần nữa để không đè mất.",
  DOC_BROKEN: "Nội dung file lưu trên máy bị hỏng nên không mở được. Bản gốc trong dự án không bị ảnh hưởng.",
  DOC_READONLY: "Đây là file hệ thống nên không sửa hay xoá được.",
  STORAGE_FULL: "Máy đã hết chỗ lưu nháp. Xoá bớt file cũ rồi thử lại.",
  STORAGE_UNAVAILABLE: "Trình duyệt đang không cho lưu nháp trên máy này. Bạn vẫn xem được, nhưng thay đổi sẽ không được giữ.",
  /* KHÔNG nêu tên luật, không trích lại đoạn đã chặn: câu này hiện ở thân UI, mà thứ bị
     chặn thường CHÍNH LÀ giá trị nhạy cảm. Chỉ nói loại nội dung để người dùng tìm ra
     chỗ cần sửa. */
  WRITE_BLOCKED: "Nội dung có đoạn giống khoá bí mật hoặc đường dẫn trong máy nên không được lưu. Bỏ đoạn đó rồi lưu lại.",
  NOT_IMPLEMENTED: "Tính năng này chưa mở. Bản nháp của bạn vẫn nằm trên máy.",
};

export class DocsRepoError extends Error {
  readonly name = "DocsRepoError";
  constructor(
    readonly code: DocsErrorCode,
    /** chi tiết cho panel lập trình viên — KHÔNG hiện ở thân UI, KHÔNG chứa secret. */
    readonly detail?: string,
  ) {
    super(MESSAGES[code]);
  }
}

export function isDocsRepoError(e: unknown): e is DocsRepoError {
  return e instanceof DocsRepoError;
}
