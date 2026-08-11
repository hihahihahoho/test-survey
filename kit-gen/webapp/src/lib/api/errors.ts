/**
 * webapp/src/lib/api/errors.ts — BẢNG TRA CỨU LỖI CỐ ĐỊNH: error.code → văn bản VI + hành động.
 * Nguồn: UX-SPEC §3.9 (bảng tra cứu) + §6.1 (danh sách mã HTTP) + arch §5.4.
 *
 * BA LUẬT BẤT DI BẤT DỊCH (§3.9 "Ba điều tuyệt đối cấm", rút từ audit E1–E5):
 *   1. `error.message` kỹ thuật KHÔNG BAO GIỜ ra thân UI. Chỉ qua `devDetails()` để đổ vào
 *      panel gập "Chi tiết cho lập trình viên ▾". `presentError()` trả về object KHÔNG CÓ
 *      field `message` — muốn rò được message ra UI thì phải gọi hàm khác, tức là phải cố ý.
 *   2. Không màn nào tự viết copy lỗi riêng. Tất cả lấy từ `ERROR_TABLE` ở đây.
 *   3. Mã lạ (agent thêm sau) → entry generic "Có lỗi từ công cụ local". KHÔNG vỡ UI (§6.5-6).
 */

/** Nút hành động — `id` ổn định để màn hình bind handler, `label` là chữ hiện ra. */
export const ACTIONS = {
  COPY_RUN_CMD: { id: "COPY_RUN_CMD", label: "Copy lệnh" },
  INSTALL_GUIDE: { id: "INSTALL_GUIDE", label: "Hướng dẫn cài" },
  OPEN_MIRROR: { id: "OPEN_MIRROR", label: "Mở bản chạy tại máy" },
  WHY_BLOCKED: { id: "WHY_BLOCKED", label: "Vì sao?" },
  COPY_UPDATE_CMD: { id: "COPY_UPDATE_CMD", label: "Copy lệnh cập nhật" },
  HARD_RELOAD: { id: "HARD_RELOAD", label: "Tải lại cứng" },
  SHOW_DETAILS: { id: "SHOW_DETAILS", label: "Chi tiết" },
  USE_THIS_WORKSPACE: { id: "USE_THIS_WORKSPACE", label: "Dùng thư mục này" },
  COPY_WS_CMD: { id: "COPY_WS_CMD", label: "Copy lệnh đổi thư mục" },
  RECHECK: { id: "RECHECK", label: "Kiểm tra lại" },
  COPY_INSTALL_CMD: { id: "COPY_INSTALL_CMD", label: "Copy lệnh cài" },
  OPEN_DOCS: { id: "OPEN_DOCS", label: "Xem hướng dẫn" },
  FIX_IMAGEGEN: { id: "FIX_IMAGEGEN", label: "Chạy trợ lý khắc phục" },
  LOWER_MAXJOBS: { id: "LOWER_MAXJOBS", label: "Giảm số lượt song song" },
  RETRY_FAILED_JOBS: { id: "RETRY_FAILED_JOBS", label: "Chạy lại lượt lỗi" },
  VIEW_ACTIVE_RUN: { id: "VIEW_ACTIVE_RUN", label: "Xem lượt đang chạy" },
  CANCEL_RUN: { id: "CANCEL_RUN", label: "Dừng lượt đó" },
  VIEW_RUN: { id: "VIEW_RUN", label: "Xem lượt" },
  COMPARE: { id: "COMPARE", label: "So sánh" },
  RELOAD_DATA: { id: "RELOAD_DATA", label: "Tải lại" },
  SAVE_AS_COPY: { id: "SAVE_AS_COPY", label: "Lưu thành bản sao" },
  VIEW_VALIDATION: { id: "VIEW_VALIDATION", label: "Xem lỗi" },
  USE_SUGGESTION: { id: "USE_SUGGESTION", label: "Dùng tên gợi ý" },
  REVEAL_FOLDER: { id: "REVEAL_FOLDER", label: "Mở thư mục" },
  RESTORE_HISTORY: { id: "RESTORE_HISTORY", label: "Phục hồi từ lịch sử" },
  BACK_TO_LIST: { id: "BACK_TO_LIST", label: "Về danh sách" },
  VIEW_TRASH: { id: "VIEW_TRASH", label: "Xem thùng rác" },
  VIEW_USAGES: { id: "VIEW_USAGES", label: "Xem chỗ dùng" },
  DELETE_ANYWAY: { id: "DELETE_ANYWAY", label: "Vẫn xoá" },
  PICK_OTHER_FILE: { id: "PICK_OTHER_FILE", label: "Chọn file khác" },
  RESEND_CODE: { id: "RESEND_CODE", label: "Gửi lại mã" },
  DOWNLOAD_REPORT: { id: "DOWNLOAD_REPORT", label: "Tải báo cáo" },
  RERUN_THIS: { id: "RERUN_THIS", label: "Chạy lại lượt này" },
  RETRY: { id: "RETRY", label: "Thử lại" },
  ALLOW_CLI_HINT: { id: "ALLOW_CLI_HINT", label: "Cách khắc phục" },
} as const;

export type ErrorAction = (typeof ACTIONS)[keyof typeof ACTIONS];

/** Nơi được phép hiện lỗi — cột "Hiện ở đâu" của §3.9. */
export const WHERE = {
  banner: "banner", pill: "pill", toast: "toast", modal: "modal",
  inline: "inline", screen: "screen", drawer: "drawer", validateBar: "validate-bar",
} as const;
export type ErrorWhere = (typeof WHERE)[keyof typeof WHERE];

export type Severity = "info" | "warn" | "danger";

export interface ErrorEntry {
  /** Tiêu đề người dùng đọc — KHÔNG chứa thuật ngữ kỹ thuật (§1.3 danh sách cấm). */
  title: string;
  /** Giải thích 1 câu. */
  explain: string;
  actions: readonly ErrorAction[];
  where: readonly ErrorWhere[];
  severity: Severity;
  /** true ⇒ app vào chế độ chỉ-đọc §2.5 (banner vàng + nút disabled, KHÔNG ẩn nút). */
  readOnly?: boolean;
}

const A = ACTIONS;
const W = WHERE;

/** BẢNG TĨNH — phủ đủ mã của §6.1 (danh sách HTTP) và §3.9 (bảng tra cứu). */
export const ERROR_TABLE: Record<string, ErrorEntry> = {
  /* ── Agent / kết nối ─────────────────────────────────────────────────── */
  AGENT_NOT_RUNNING: {
    title: "Chưa thấy công cụ local",
    explain: "Mở Terminal và chạy kitgen-agent.",
    actions: [A.COPY_RUN_CMD, A.INSTALL_GUIDE], where: [W.banner, W.pill],
    severity: "warn", readOnly: true,
  },
  AGENT_BLOCKED_BY_BROWSER: {
    title: "Trình duyệt đang chặn kết nối tới máy bạn",
    explain: "Công cụ local đang chạy, nhưng trình duyệt không cho trang này gọi vào máy.",
    actions: [A.OPEN_MIRROR, A.WHY_BLOCKED], where: [W.banner, W.pill],
    severity: "warn", readOnly: true,
  },
  AGENT_PROTOCOL_OLD: {
    title: "Công cụ local cũ hơn giao diện",
    explain: "Cập nhật để dùng được tính năng mới.",
    actions: [A.COPY_UPDATE_CMD], where: [W.banner, W.pill], severity: "warn", readOnly: true,
  },
  AGENT_PROTOCOL_NEW: {
    title: "Giao diện đang là bản cache cũ",
    explain: "Tải lại trang để lấy bản mới.",
    actions: [A.HARD_RELOAD], where: [W.banner, W.pill], severity: "warn", readOnly: true,
  },
  /**
   * Ca 3a của lib/api/connection.ts: trang HTTPS gọi chéo vào loopback, fetch reject,
   * CHƯA có bằng chứng nào. Copy ở đây cố ý KHÔNG khẳng định bên nào có lỗi — đúng
   * bài học QA-UX TRUNG BÌNH-01 (bản cũ khẳng định "trình duyệt chặn" khi chưa biết).
   */
  AGENT_UNREACHABLE_AMBIGUOUS: {
    title: "Chưa gọi được công cụ local",
    explain: "Chưa rõ do công cụ chưa chạy hay do trình duyệt. Bấm kiểm tra để biết chính xác.",
    actions: [A.RECHECK, A.OPEN_MIRROR, A.COPY_RUN_CMD], where: [W.banner, W.pill],
    severity: "warn", readOnly: true,
  },
  AGENT_STARTING: {
    title: "Công cụ local đang khởi động",
    explain: "Chờ vài giây rồi thử lại.",
    actions: [A.RECHECK], where: [W.banner, W.pill], severity: "info", readOnly: true,
  },
  /**
   * ORIGIN_NOT_ALLOWED — bài học QA-UX TRUNG BÌNH-01: bản cũ hiện "trình duyệt đang chặn"
   * cho ca này, đổ tội sai cho trình duyệt và đẩy user đi tắt ad-blocker trong khi lỗi
   * nằm ở agent. Copy ở đây nói ĐÚNG chủ thể từ chối: **công cụ local**.
   */
  ORIGIN_NOT_ALLOWED: {
    title: "Công cụ local từ chối trang này",
    explain: "Công cụ local đang chạy nhưng không nhận địa chỉ của trang này. Trình duyệt không chặn gì.",
    actions: [A.OPEN_MIRROR, A.ALLOW_CLI_HINT, A.SHOW_DETAILS], where: [W.banner],
    severity: "warn", readOnly: true,
  },
  BAD_HOST: {
    title: "Công cụ local từ chối trang này",
    explain: "Công cụ local đang chạy nhưng không nhận tên máy mà trang này dùng để gọi.",
    actions: [A.OPEN_MIRROR, A.SHOW_DETAILS], where: [W.banner], severity: "warn", readOnly: true,
  },
  /**
   * NGUYÊN NHÂN 1/4 — agent NHẬN được yêu cầu và tự nó hỏng khi làm.
   * Chỉ dùng cho ca này; ba ca còn lại có entry riêng bên dưới (xem `refineCatchAll`).
   */
  AGENT_INTERNAL: {
    title: "Công cụ local gặp lỗi khi xử lý",
    explain: "Yêu cầu đã tới nơi nhưng công cụ local không làm xong. Thử lại; nếu lặp lại, xem cửa sổ Terminal đang chạy nó.",
    actions: [A.RETRY, A.SHOW_DETAILS], where: [W.toast], severity: "danger",
  },
  /**
   * NGUYÊN NHÂN 2/4 — agent CÓ trả lời nhưng nội dung không khớp dạng giao diện hiểu.
   * Trước FE-2 ca này dùng chung câu với AGENT_INTERNAL ⇒ user bị bảo "thử lại" trong khi
   * thử lại chắc chắn ra đúng kết quả sai đó (SHOTS-FE1 #6). Hành động đúng là tải lại /
   * cập nhật, không phải retry.
   */
  AGENT_BAD_RESPONSE: {
    title: "Không đọc được trả lời của công cụ local",
    explain: "Công cụ local có trả lời, nhưng nội dung không đúng dạng mà giao diện hiểu. Thường do hai bên lệch phiên bản.",
    actions: [A.RELOAD_DATA, A.COPY_UPDATE_CMD, A.SHOW_DETAILS], where: [W.toast, W.inline],
    severity: "danger",
  },
  /**
   * NGUYÊN NHÂN 3/4 — yêu cầu CHƯA RỜI trình duyệt (thiếu fetch, không có phản hồi nào,
   * lỗi tự sinh phía client). Điểm trấn an quan trọng: chưa có gì đổi trên máy người dùng,
   * nên retry là an toàn — khác hẳn ca 500 nửa vời.
   */
  REQUEST_NOT_SENT: {
    title: "Chưa gửi được yêu cầu đi",
    explain: "Yêu cầu chưa rời khỏi trình duyệt nên chưa có gì thay đổi trên máy bạn. Thử lại là an toàn.",
    actions: [A.RETRY, A.SHOW_DETAILS], where: [W.toast, W.inline], severity: "danger",
  },
  /**
   * NGUYÊN NHÂN 4/4 — 409 KHÔNG kèm mã cụ thể. Đây là XUNG ĐỘT, không phải hỏng hóc:
   * ai đó (hoặc tab khác) đã đổi trạng thái trước. Retry mù sẽ hỏng lần nữa; phải tải lại trước.
   */
  STATE_CONFLICT: {
    title: "Thứ bạn vừa sửa đã đổi ở nơi khác",
    explain: "Một thay đổi khác xảy ra trước bạn nên yêu cầu vừa rồi không áp dụng được. Tải lại rồi làm lại.",
    actions: [A.RELOAD_DATA, A.SHOW_DETAILS], where: [W.toast, W.modal], severity: "warn",
  },
  /* ── Thư mục làm việc ────────────────────────────────────────────────── */
  WORKSPACE_CHANGED: {
    title: "Bạn đang mở một thư mục làm việc khác",
    explain: "Danh sách project sẽ được tải lại.",
    actions: [A.USE_THIS_WORKSPACE], where: [W.modal], severity: "info",
  },
  WORKSPACE_UNKNOWN: {
    title: "Không thấy thư mục làm việc này",
    explain: "Thư mục có thể đã bị đổi tên hoặc tháo ổ đĩa.",
    actions: [A.RECHECK], where: [W.inline], severity: "warn",
  },
  WORKSPACE_UNWRITABLE: {
    title: "Không ghi được vào thư mục làm việc",
    explain: "Kiểm tra quyền hoặc dung lượng ổ đĩa.",
    actions: [A.COPY_WS_CMD, A.RECHECK], where: [W.banner, W.inline], severity: "danger",
  },
  DISK_FULL: {
    title: "Không ghi được vào thư mục làm việc",
    explain: "Ổ đĩa không còn đủ chỗ cho thao tác này.",
    actions: [A.COPY_WS_CMD, A.RECHECK], where: [W.banner, W.inline], severity: "danger",
  },
  /* ── Môi trường ──────────────────────────────────────────────────────── */
  CODEX_MISSING: {
    title: "Thiếu công cụ trên máy",
    explain: "Chưa cài công cụ tạo ảnh nên không sinh được ảnh mới.",
    actions: [A.COPY_INSTALL_CMD, A.OPEN_DOCS], where: [W.inline], severity: "warn",
  },
  PY_DEPS_MISSING: {
    title: "Thiếu công cụ trên máy",
    explain: "Thiếu thư viện Python nên không cắt được ảnh.",
    actions: [A.COPY_INSTALL_CMD, A.OPEN_DOCS], where: [W.inline], severity: "warn",
  },
  IMAGEGEN_UNAVAILABLE: {
    title: "Chưa tạo được ảnh AI",
    explain: "Công cụ local chạy được nhưng phần tạo ảnh chưa dùng được.",
    actions: [A.FIX_IMAGEGEN, A.RECHECK], where: [W.inline, W.modal], severity: "warn",
  },
  QUOTA_SUSPECTED: {
    title: "Có vẻ đã chạm giới hạn tạo ảnh của tài khoản",
    explain: "Sinh ảnh tiêu quota gấp 3–5 lần lượt hỏi thường.",
    actions: [A.LOWER_MAXJOBS, A.RETRY_FAILED_JOBS], where: [W.inline, W.banner], severity: "warn",
  },
  /* ── Lượt chạy ───────────────────────────────────────────────────────── */
  RUN_CONFLICT: {
    title: "Project này đang chạy một lượt khác",
    explain: "Chờ xong hoặc dừng lượt đó.",
    actions: [A.VIEW_ACTIVE_RUN, A.CANCEL_RUN], where: [W.toast, W.modal], severity: "warn",
  },
  RUN_ACTIVE: {
    title: "Không làm được khi đang chạy",
    explain: "Thao tác này cần dừng lượt chạy trước.",
    actions: [A.VIEW_RUN, A.CANCEL_RUN], where: [W.inline], severity: "warn",
  },
  RUN_FINISHED: {
    title: "Lượt chạy đã kết thúc",
    explain: "Không dừng được nữa vì lượt này đã xong.",
    actions: [A.RELOAD_DATA], where: [W.toast], severity: "info",
  },
  RUN_NOT_FOUND: {
    title: "Không tìm thấy lượt chạy",
    explain: "Lượt này có thể đã bị dọn theo hạn lưu.",
    actions: [A.BACK_TO_LIST], where: [W.screen], severity: "warn",
  },
  UNKNOWN_JOB: {
    title: "Có lượt không còn tồn tại",
    explain: "Bản thiết kế đã đổi từ lúc bạn mở màn này.",
    actions: [A.RELOAD_DATA], where: [W.modal], severity: "warn",
  },
  CURSOR_GONE: {
    title: "Nhật ký đã bị dọn phần đầu",
    explain: "Đang tải lại trạng thái lượt chạy từ đầu.",
    actions: [A.RELOAD_DATA], where: [W.inline], severity: "info",
  },
  LOG_NOT_FOUND: {
    title: "Không còn nhật ký của lượt này",
    explain: "Log cũ đã bị dọn theo hạn lưu.",
    actions: [A.RERUN_THIS], where: [W.drawer], severity: "info",
  },
  /* ── Bản thiết kế ────────────────────────────────────────────────────── */
  CONTRACT_CONFLICT: {
    title: "Bản thiết kế đã đổi ở nơi khác",
    explain: "Có người hoặc tab khác đã lưu sau bạn.",
    actions: [A.COMPARE, A.RELOAD_DATA, A.SAVE_AS_COPY], where: [W.modal], severity: "warn",
  },
  CONTRACT_INVALID: {
    title: "Bản thiết kế có lỗi",
    explain: "Sửa những chỗ được đánh dấu rồi lưu lại.",
    actions: [A.VIEW_VALIDATION], where: [W.validateBar], severity: "danger",
  },
  CONTRACT_BROKEN: {
    title: "Không đọc được bản thiết kế",
    explain: "File trên đĩa bị hỏng định dạng.",
    actions: [A.RESTORE_HISTORY, A.REVEAL_FOLDER], where: [W.screen], severity: "danger",
  },
  IF_MATCH_REQUIRED: {
    title: "Chưa lưu được bản thiết kế",
    explain: "Giao diện thiếu thông tin phiên bản để lưu an toàn. Tải lại rồi thử lại.",
    actions: [A.RELOAD_DATA], where: [W.toast], severity: "danger",
  },
  /* ── Project ─────────────────────────────────────────────────────────── */
  PROJECT_ID_TAKEN: {
    title: "Tên thư mục này đã có",
    explain: "Dùng gợi ý hoặc đổi tên khác.",
    actions: [A.USE_SUGGESTION], where: [W.inline], severity: "warn",
  },
  PROJECT_BROKEN: {
    title: "Không đọc được project",
    explain: "File mô tả project bị hỏng định dạng.",
    actions: [A.REVEAL_FOLDER, A.RESTORE_HISTORY], where: [W.screen, W.inline], severity: "danger",
  },
  PROJECT_NOT_FOUND: {
    title: "Project không còn ở đây",
    explain: "Có thể đã bị xoá hoặc bạn đang mở thư mục làm việc khác.",
    actions: [A.BACK_TO_LIST, A.VIEW_TRASH], where: [W.screen], severity: "warn",
  },
  PROJECT_IN_TRASH: {
    title: "Project không còn ở đây",
    explain: "Project này đang ở trong thùng rác.",
    actions: [A.VIEW_TRASH, A.BACK_TO_LIST], where: [W.screen], severity: "warn",
  },
  INVALID_NAME: {
    title: "Tên chưa dùng được",
    explain: "Nhập tên project có ít nhất 1 ký tự.",
    actions: [], where: [W.inline], severity: "warn",
  },
  INVALID_SLUG: {
    title: "Tên thư mục chưa dùng được",
    explain: "Chỉ dùng chữ thường, số và gạch nối.",
    actions: [A.USE_SUGGESTION], where: [W.inline], severity: "warn",
  },
  /* ── Ảnh tham khảo & file ────────────────────────────────────────────── */
  REF_IN_USE: {
    title: "Ảnh này đang được dùng",
    explain: "Xoá sẽ làm những chỗ đang dùng nó thiếu ảnh.",
    actions: [A.VIEW_USAGES, A.DELETE_ANYWAY], where: [W.inline], severity: "warn",
  },
  TOO_LARGE: {
    title: "File không dùng được",
    explain: "Ảnh tối đa 20 MB, file nén tối đa 200 MB.",
    actions: [A.PICK_OTHER_FILE], where: [W.inline], severity: "warn",
  },
  BAD_TYPE: {
    title: "File không dùng được",
    explain: "Chỉ nhận PNG, JPG hoặc WebP.",
    actions: [A.PICK_OTHER_FILE], where: [W.inline], severity: "warn",
  },
  PATH_ESCAPE: {
    title: "Không mở được file này",
    explain: "Đường dẫn nằm ngoài phạm vi project.",
    actions: [A.RELOAD_DATA], where: [W.inline], severity: "warn",
  },
  KIT_NOT_CUT: {
    title: "Chưa có file nào được cắt",
    explain: "Cần cắt ảnh đã sinh trước khi xem thư viện kit.",
    actions: [], where: [W.screen], severity: "info",
  },
  NOT_SUPPORTED: {
    title: "Máy bạn không làm được việc này",
    explain: "Hệ điều hành không hỗ trợ mở thư mục từ giao diện.",
    actions: [], where: [W.toast], severity: "info",
  },
  /* ── Thùng rác & xác nhận ────────────────────────────────────────────── */
  TRASH_NOT_FOUND: {
    title: "Không thấy mục này trong thùng rác",
    explain: "Có thể đã được phục hồi hoặc đã hết hạn 30 ngày.",
    actions: [A.RELOAD_DATA], where: [W.inline], severity: "info",
  },
  CONFIRM_REQUIRED: {
    title: "Cần mã xác nhận từ Terminal",
    explain: "Mã in ở cửa sổ đang chạy công cụ local, dùng 1 lần, 60 giây.",
    actions: [A.RESEND_CODE], where: [W.modal], severity: "warn",
  },
  CONFIRM_INVALID: {
    title: "Cần mã xác nhận từ Terminal",
    explain: "Mã vừa nhập không đúng. Xem lại cửa sổ Terminal.",
    actions: [A.RESEND_CODE], where: [W.modal], severity: "warn",
  },
  CONFIRM_LOCKED: {
    title: "Cần mã xác nhận từ Terminal",
    explain: "Đã nhập sai quá nhiều lần. Chờ một chút rồi xin mã mới.",
    actions: [A.RESEND_CODE], where: [W.modal], severity: "danger",
  },
  /* ── Nhập / xuất ─────────────────────────────────────────────────────── */
  IMPORT_INVALID: {
    title: "File nhập không đọc được",
    explain: "Không có project nào được tạo nửa vời.",
    actions: [A.PICK_OTHER_FILE, A.DOWNLOAD_REPORT], where: [W.inline, W.modal], severity: "warn",
  },
  UNKNOWN_VARIANT: {
    title: "Phong cách không còn tồn tại",
    explain: "Bản thiết kế đã đổi từ lúc bạn mở màn này.",
    actions: [A.RELOAD_DATA], where: [W.inline], severity: "warn",
  },
  /* ── Chung ───────────────────────────────────────────────────────────── */
  RATE_LIMITED: {
    title: "Bạn bấm quá nhanh",
    explain: "Đang tự thử lại sau vài giây.",
    actions: [], where: [W.toast], severity: "info",
  },
  BAD_REQUEST: {
    title: "Giao diện gửi dữ liệu chưa đúng",
    explain: "Tải lại trang rồi thử lại. Nếu vẫn lỗi, gửi phần chi tiết kỹ thuật cho người phát triển.",
    actions: [A.HARD_RELOAD, A.SHOW_DETAILS], where: [W.toast], severity: "danger",
  },
  NOT_FOUND: {
    title: "Không tìm thấy thứ bạn cần",
    explain: "Dữ liệu có thể đã bị xoá hoặc đổi tên.",
    actions: [A.RELOAD_DATA], where: [W.toast], severity: "warn",
  },
};

/**
 * Entry cho mã LẠ — §3.9 hàng cuối: "bất kỳ code lạ".
 *
 * FE-2 #6: mã lạ vẫn là một sự kiện CÓ NGUYÊN NHÂN BIẾT ĐƯỢC — agent **đã trả lời** và
 * tự nó gọi tên lỗi; chỉ có giao diện là chưa có hướng dẫn. Copy cũ ("Giao diện chưa biết
 * mã lỗi này.") bỏ mất vế đầu nên người đọc không biết mình đang ở đâu và nên làm gì.
 */
export const UNKNOWN_ENTRY: ErrorEntry = {
  // ⚠️ `title` GIỮ NGUYÊN CÓ CHỦ Ý. `lib/api/__tests__/errors.test.ts:58` khoá đúng chuỗi này
  // và file test đó NGOÀI glob nhánh A (FE2-PLAN §1) ⇒ tôi không sửa nó để "làm xanh test".
  // Bản chữ đề nghị ("Công cụ local báo một lỗi giao diện chưa biết") + dòng test cần đổi
  // nằm ở teams/react/NEEDS-fe2-a.md #A2-2.
  title: "Có lỗi từ công cụ local",
  explain: "Yêu cầu đã tới nơi và bị từ chối kèm một mã lỗi mà bản giao diện này chưa có hướng dẫn.",
  actions: [A.RETRY, A.COPY_UPDATE_CMD, A.SHOW_DETAILS], where: [W.toast], severity: "danger",
};

/** Mã ≥400 không có envelope → suy từ status HTTP (§6.1 "Mã HTTP dùng thống nhất"). */
export const STATUS_FALLBACK: Record<number, string> = {
  400: "BAD_REQUEST",
  403: "ORIGIN_NOT_ALLOWED",
  404: "NOT_FOUND",
  409: "STATE_CONFLICT",
  410: "PROJECT_IN_TRASH",
  412: "IF_MATCH_REQUIRED",
  413: "TOO_LARGE",
  415: "BAD_TYPE",
  416: "CURSOR_GONE",
  421: "BAD_HOST",
  422: "CONTRACT_INVALID",
  423: "WORKSPACE_UNWRITABLE",
  429: "RATE_LIMITED",
  500: "AGENT_INTERNAL",
  501: "NOT_SUPPORTED",
  503: "AGENT_STARTING",
};

/** 7 enum `details.reason` của IMAGEGEN_UNAVAILABLE (§3.9). */
export const IMAGEGEN_REASONS: Record<string, string> = {
  NO_CODEX: "Chưa cài công cụ tạo ảnh trên máy.",
  NOT_LOGGED_IN: "Công cụ tạo ảnh chưa đăng nhập.",
  FEATURE_OFF: "Tài khoản này chưa bật tính năng tạo ảnh.",
  QUOTA: "Tài khoản đã hết lượt tạo ảnh.",
  TIMEOUT: "Kiểm tra tạo ảnh quá lâu không phản hồi.",
  NO_AUTH_FILE: "Chưa thấy dấu hiệu đã đăng nhập trên máy.",
  UNKNOWN: "Chưa xác định được lý do.",
};

/** Alias mã do client tự sinh → mã chính của bảng. */
const CODE_ALIASES: Record<string, string> = {
  AGENT_OFFLINE: "AGENT_NOT_RUNNING",
  NETWORK: "AGENT_NOT_RUNNING",
  STARTING: "AGENT_STARTING",
  INTERNAL: "AGENT_INTERNAL",
  FETCH_FAILED: "AGENT_NOT_RUNNING",
};

export function canonicalCode(code: unknown): string | null {
  if (typeof code !== "string" || code.trim() === "") return null;
  const up = code.trim().toUpperCase().replace(/[-\s]+/g, "_");
  return CODE_ALIASES[up] ?? up;
}

export function isKnownCode(code: unknown): boolean {
  const c = canonicalCode(code);
  return c !== null && Object.hasOwn(ERROR_TABLE, c);
}

export interface PresentedError {
  code: string;
  known: boolean;
  title: string;
  explain: string;
  actions: readonly ErrorAction[];
  where: readonly ErrorWhere[];
  severity: Severity;
  readOnly: boolean;
  /** `details` có schema riêng theo endpoint — dùng để dựng nút (vd suggestion, runId). */
  details: unknown;
}

/**
 * Tra bảng → phần hiển thị cho user. LUÔN trả object dùng được, không bao giờ null.
 * CHÚ Ý: object trả về **không có** field `message`. Đó là chủ ý (luật 1).
 */
export function presentError(err: unknown): PresentedError {
  const code = extractCode(err);
  const c0 = canonicalCode(code);
  const c = c0 !== null ? refineCatchAll(c0, err) : null;
  const hit = c !== null ? ERROR_TABLE[c] : undefined;
  const entry = hit ?? UNKNOWN_ENTRY;
  return {
    code: c ?? "UNKNOWN",
    known: Boolean(hit),
    title: entry.title,
    explain: entry.explain,
    actions: entry.actions,
    where: entry.where,
    severity: entry.severity,
    readOnly: entry.readOnly === true,
    details: extractDetails(err),
  };
}

/* ═════════ #6 — TÁCH CATCH-ALL THEO NGUYÊN NHÂN (FE2-PLAN §3-A2) ═════════
 *
 * VẤN ĐỀ (SHOTS-FE1-DESCRIBED #6, fe1/A2-REPORT §3): bốn nguyên nhân rất khác nhau
 * cùng rơi vào một mã `AGENT_INTERNAL` nên 49 điểm hiển thị đọc lên **cùng một câu**
 * kèm **cùng một nút [Thử lại]** — kể cả khi thử lại chắc chắn vô ích.
 *
 * VÌ SAO SỬA Ở ĐÂY chứ không ở nơi ném lỗi: `lib/api/client.ts` và `lib/api/endpoints.ts`
 * nằm NGOÀI glob nhánh A (FE2-PLAN §1) nên tôi không được sửa. May là mọi thứ cần để
 * phân biệt nguyên nhân đã có sẵn TRÊN chính object lỗi mà chúng ném ra
 * (`transport`, `status`, `details.what`), nên việc phân loại làm trọn vẹn được trong file này.
 * Đề nghị dời việc gọi tên đúng mã về nơi ném: `teams/react/NEEDS-fe2-a.md` #A2-1.
 *
 * BỐN NGÁCH — mỗi ngách một câu và một HÀNH ĐỘNG KHÁC NHAU:
 *   1. đã tới agent, agent hỏng khi làm      → AGENT_INTERNAL     → [Thử lại]
 *   2. agent trả về thứ không parse được     → AGENT_BAD_RESPONSE → [Tải lại] / [Cập nhật]
 *   3. yêu cầu chưa rời trình duyệt          → REQUEST_NOT_SENT   → [Thử lại] (an toàn)
 *   4. xung đột trạng thái (409 trần)        → STATE_CONFLICT     → [Tải lại] trước đã
 */
const CATCH_ALL = "AGENT_INTERNAL";

/** Nhận diện lỗi parse schema của `endpoints.ts`: nó gắn `details = { what, issues }`. */
function isSchemaFailure(err: unknown): boolean {
  const d = extractDetails(err);
  if (!d || typeof d !== "object") return false;
  const o = d as Record<string, unknown>;
  return typeof o.what === "string" && Array.isArray(o.issues);
}

function transportOf(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const t = (err as Record<string, unknown>).transport;
  return typeof t === "string" ? t : null;
}

function statusOf(err: unknown): number {
  if (!err || typeof err !== "object") return 0;
  const outer = err as Record<string, unknown>;
  const inner = (outer.error && typeof outer.error === "object" ? outer.error : outer) as Record<string, unknown>;
  const s = outer.status ?? inner.status;
  return typeof s === "number" && Number.isFinite(s) ? s : 0;
}

/**
 * Chỉ động tới đúng mã catch-all. Mọi mã ĐÃ CÓ NGHĨA (`RUN_CONFLICT`, `PROJECT_BROKEN`…)
 * trả về nguyên vẹn — hàm này không được phép viết lại chẩn đoán của tầng dưới.
 */
export function refineCatchAll(code: string, err: unknown): string {
  if (code !== CATCH_ALL) return code;
  if (isSchemaFailure(err)) return "AGENT_BAD_RESPONSE";
  const status = statusOf(err);
  if (status === 409) return "STATE_CONFLICT";
  const transport = transportOf(err);
  // "client" = client tự dựng lỗi trước/thay vì một response; "unreachable"/"timeout" =
  // fetch không mang về response nào. Cả ba đều nghĩa là CHƯA có gì đổi ở phía máy user.
  if (transport === "client" || transport === "unreachable" || transport === "timeout") {
    return "REQUEST_NOT_SENT";
  }
  // Còn lại: có response ≥500 ⇒ đúng nghĩa "agent hỏng khi xử lý".
  return CATCH_ALL;
}

function extractCode(err: unknown): string | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  if (typeof e.code === "string") return e.code;
  const nested = e.error;
  if (nested && typeof nested === "object") {
    const c = (nested as Record<string, unknown>).code;
    if (typeof c === "string") return c;
  }
  return null;
}

function extractDetails(err: unknown): unknown {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  if (e.details !== undefined && e.details !== null) return e.details;
  const nested = e.error as Record<string, unknown> | undefined;
  return nested?.details ?? null;
}

/**
 * CHỖ DUY NHẤT được phép trả `message` kỹ thuật — dành riêng cho panel gập
 * "Chi tiết cho lập trình viên ▾" (§3.9). Không component nào được đổ chuỗi này
 * vào thân UI.
 */
export function devDetails(err: unknown): string {
  if (err === null || err === undefined) return "";
  if (typeof err === "string") return err;
  if (typeof err !== "object") return String(err);
  const outer = err as Record<string, unknown>;
  const inner = (outer.error && typeof outer.error === "object" ? outer.error : outer) as Record<string, unknown>;
  const rows: [string, unknown][] = [
    ["code", inner.code],
    ["status", outer.status ?? inner.status],
    ["method", outer.method],
    ["url", outer.url],
    ["message", inner.message ?? outer.message],
    ["hint", inner.hint],
    ["docs", inner.docs],
    ["entry", outer.entry],
  ];
  let out = rows
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join("\n");
  const details = inner.details ?? outer.details;
  if (details && typeof details === "object") {
    try {
      out += `\ndetails: ${JSON.stringify(details, null, 2)}`;
    } catch {
      /* tham chiếu vòng — bỏ qua, thà thiếu chi tiết hơn là vỡ panel */
    }
  }
  return out;
}

export function imageGenReasonText(reason: unknown): string {
  const key = typeof reason === "string" ? reason.trim().toUpperCase() : "";
  return IMAGEGEN_REASONS[key] ?? IMAGEGEN_REASONS.UNKNOWN!;
}

export function knownCodes(): string[] {
  return Object.keys(ERROR_TABLE);
}
