/* errors.mjs — envelope lỗi CỐ ĐỊNH theo UX-SPEC §6.1 + bảng mã HTTP §6.1.
   Mọi lỗi trả ra ngoài PHẢI đi qua đây: {error:{code,message,hint,docs,details}}.
   `message` là kỹ thuật (web chỉ hiện trong panel dev); web tự map code → tiếng Việt (§3.9). */

/** code → HTTP status. Bảng này là nguồn duy nhất, route không tự chọn status. */
export const STATUS = {
  // hệ thống / bảo mật
  ORIGIN_NOT_ALLOWED: 403, BAD_HOST: 421, RATE_LIMITED: 429, TOO_LARGE: 413, BAD_TYPE: 415,
  CLIENT_HEADER_REQUIRED: 403, BAD_REQUEST: 400, METHOD_NOT_ALLOWED: 405, NOT_FOUND: 404,
  INTERNAL: 500, STARTING: 503, NOT_SUPPORTED: 501, PATH_ESCAPE: 400,
  // workspace
  WORKSPACE_UNKNOWN: 404, WORKSPACE_UNWRITABLE: 423, DISK_FULL: 423,
  // project
  PROJECT_NOT_FOUND: 404, PROJECT_IN_TRASH: 410, PROJECT_BROKEN: 422, PROJECT_ID_TAKEN: 409,
  INVALID_NAME: 400, INVALID_SLUG: 400, IMPORT_INVALID: 422,
  // trash
  TRASH_NOT_FOUND: 404, CONFIRM_REQUIRED: 412, CONFIRM_INVALID: 403, CONFIRM_LOCKED: 429,
  // contract
  /* PROMPT_PREVIEW_FAILED = engine chạy được nhưng KHÔNG ra prompt nào (contract lắp
     không nổi, thiếu engine, hết giờ). 422 chứ không 500: thứ hỏng là dữ liệu/môi
     trường của lượt xem trước, không phải agent. */
  PROMPT_PREVIEW_FAILED: 422,
  CONTRACT_BROKEN: 422, DOC_NOT_FOUND: 404, DOC_NAME_TAKEN: 409, DOC_CONFLICT: 409, DOC_BROKEN: 422, DOC_READONLY: 423, IF_MATCH_REQUIRED: 412, CONTRACT_CONFLICT: 409, CONTRACT_INVALID: 422,
  // refs
  REF_IN_USE: 409, REF_NOT_FOUND: 404,
  // run
  RUN_CONFLICT: 409, RUN_ACTIVE: 409, RUN_NOT_FOUND: 404, RUN_FINISHED: 409, UNKNOWN_JOB: 422,
  /* Xoá phiên bản ảnh gốc ĐANG DÙNG (#39.1). 409, không 400: yêu cầu đúng cú pháp,
     chỉ là xung đột trạng thái — và web cần phân biệt nó với "id sai" để nói đúng lý do. */
  HISTORY_CURRENT: 409,
  UNKNOWN_VARIANT: 422,
  IMAGEGEN_UNAVAILABLE: 409, LOG_NOT_FOUND: 404, CURSOR_GONE: 416, KIT_NOT_CUT: 404,
  // ảnh bìa (job phụ — xem lib/cover.mjs)
  COVER_RUNNING: 409, COVER_UNAVAILABLE: 409,
}

const DOCS = "/docs/errors#"

export class AgentError extends Error {
  constructor(code, message, opts = {}) {
    super(message ?? code)
    this.name = "AgentError"
    this.code = code
    this.status = opts.status ?? STATUS[code] ?? 500
    this.hint = opts.hint ?? null
    this.details = opts.details ?? null
    this.headers = opts.headers ?? null
  }
  toEnvelope() {
    const e = { code: this.code, message: this.message, docs: DOCS + this.code.toLowerCase().replace(/_/g, "-") }
    if (this.hint) e.hint = this.hint
    if (this.details) e.details = this.details
    return { error: e }
  }
}

/** fail("PROJECT_NOT_FOUND", "…", {details}) → throw */
export function fail(code, message, opts) { throw new AgentError(code, message, opts) }

/** Bọc lỗi lạ (ENOENT, EACCES…) thành envelope an toàn — KHÔNG rò đường dẫn tuyệt đối. */
export function toAgentError(err, redactPath = s => s) {
  if (err instanceof AgentError) return err
  const raw = String(err?.message ?? err)
  const msg = redactPath(raw)
  if (err?.code === "ENOENT") return new AgentError("NOT_FOUND", msg)
  if (err?.code === "EACCES" || err?.code === "EPERM") return new AgentError("WORKSPACE_UNWRITABLE", msg)
  if (err?.code === "ENOSPC") return new AgentError("DISK_FULL", msg)
  return new AgentError("INTERNAL", msg)
}
