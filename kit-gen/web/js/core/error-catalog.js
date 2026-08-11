/**
 * web/js/core/error-catalog.js — DỮ LIỆU bảng lỗi (không có logic).
 * Nguồn: UX-SPEC §3.9 + §6.1, architecture §5.4 + §6.3.
 * Tách khỏi errors.js để mỗi file dưới ~400 dòng (bài học studio.html 743 dòng).
 * Đọc bảng này qua errors.js (lookup/present) — màn hình KHÔNG import trực tiếp.
 */

/** Nhãn nút — id ổn định để màn hình bind handler; label là chữ hiện ra. */
export const ACTIONS = Object.freeze({
  COPY_RUN_CMD:      { id: 'COPY_RUN_CMD',      label: 'Copy lệnh' },
  INSTALL_GUIDE:     { id: 'INSTALL_GUIDE',     label: 'Hướng dẫn cài' },
  OPEN_MIRROR:       { id: 'OPEN_MIRROR',       label: 'Mở bản chạy tại máy' },
  WHY_BLOCKED:       { id: 'WHY_BLOCKED',       label: 'Vì sao?' },
  COPY_UPDATE_CMD:   { id: 'COPY_UPDATE_CMD',   label: 'Copy lệnh cập nhật' },
  HARD_RELOAD:       { id: 'HARD_RELOAD',       label: 'Tải lại cứng' },
  SHOW_DETAILS:      { id: 'SHOW_DETAILS',      label: 'Chi tiết' },
  USE_THIS_WORKSPACE:{ id: 'USE_THIS_WORKSPACE',label: 'Dùng thư mục này' },
  COPY_WS_CMD:       { id: 'COPY_WS_CMD',       label: 'Copy lệnh đổi thư mục' },
  RECHECK:           { id: 'RECHECK',           label: 'Kiểm tra lại' },
  COPY_INSTALL_CMD:  { id: 'COPY_INSTALL_CMD',  label: 'Copy lệnh cài' },
  OPEN_DOCS:         { id: 'OPEN_DOCS',         label: 'Xem hướng dẫn' },
  FIX_IMAGEGEN:      { id: 'FIX_IMAGEGEN',      label: 'Chạy trợ lý khắc phục' },
  LOWER_MAXJOBS:     { id: 'LOWER_MAXJOBS',     label: 'Giảm số lượt song song' },
  RETRY_FAILED_JOBS: { id: 'RETRY_FAILED_JOBS', label: 'Chạy lại lượt lỗi' },
  VIEW_ACTIVE_RUN:   { id: 'VIEW_ACTIVE_RUN',   label: 'Xem lượt đang chạy' },
  CANCEL_RUN:        { id: 'CANCEL_RUN',        label: 'Dừng lượt đó' },
  VIEW_RUN:          { id: 'VIEW_RUN',          label: 'Xem lượt' },
  COMPARE:           { id: 'COMPARE',           label: 'So sánh' },
  RELOAD_DATA:       { id: 'RELOAD_DATA',       label: 'Tải lại' },
  SAVE_AS_COPY:      { id: 'SAVE_AS_COPY',      label: 'Lưu thành bản sao' },
  VIEW_VALIDATION:   { id: 'VIEW_VALIDATION',   label: 'Xem lỗi' },
  USE_SUGGESTION:    { id: 'USE_SUGGESTION',    label: 'Dùng tên gợi ý' },
  REVEAL_FOLDER:     { id: 'REVEAL_FOLDER',     label: 'Mở thư mục' },
  RESTORE_HISTORY:   { id: 'RESTORE_HISTORY',   label: 'Phục hồi từ lịch sử' },
  BACK_TO_LIST:      { id: 'BACK_TO_LIST',      label: 'Về danh sách' },
  VIEW_TRASH:        { id: 'VIEW_TRASH',        label: 'Xem thùng rác' },
  VIEW_USAGES:       { id: 'VIEW_USAGES',       label: 'Xem chỗ dùng' },
  DELETE_ANYWAY:     { id: 'DELETE_ANYWAY',     label: 'Vẫn xoá' },
  PICK_OTHER_FILE:   { id: 'PICK_OTHER_FILE',   label: 'Chọn file khác' },
  RESEND_CODE:       { id: 'RESEND_CODE',       label: 'Gửi lại mã' },
  DOWNLOAD_REPORT:   { id: 'DOWNLOAD_REPORT',   label: 'Tải báo cáo' },
  RERUN_THIS:        { id: 'RERUN_THIS',        label: 'Chạy lại lượt này' },
  RETRY:             { id: 'RETRY',             label: 'Thử lại' },
  WAIT:              { id: 'WAIT',              label: 'Chờ một chút' },
});

const A = ACTIONS;
/** where: nơi được phép hiện (UX-SPEC §3.9 cột "Hiện ở đâu"). */
export const WHERE = Object.freeze({
  banner: 'banner', pill: 'pill', toast: 'toast', modal: 'modal',
  inline: 'inline', screen: 'screen', drawer: 'drawer', validateBar: 'validate-bar',
});
const W = WHERE;

/**
 * BẢNG TĨNH. Mỗi entry: { title, explain, actions[], where[], severity, readOnly? }
 * severity: 'info' | 'warn' | 'danger'  ·  readOnly:true ⇒ app vào chế độ chỉ-đọc (§2.5).
 */
export const ERROR_TABLE = Object.freeze({
  // ── Nhóm agent / kết nối (§3.9 + arch §5.4) ─────────────────────────────
  AGENT_NOT_RUNNING: {
    title: 'Chưa thấy công cụ local',
    explain: 'Mở Terminal và chạy kitgen-agent.',
    actions: [A.COPY_RUN_CMD, A.INSTALL_GUIDE], where: [W.banner, W.pill],
    severity: 'warn', readOnly: true,
  },
  AGENT_BLOCKED_BY_BROWSER: {
    title: 'Trình duyệt đang chặn kết nối tới máy bạn',
    explain: 'Công cụ local đang chạy, nhưng trình duyệt không cho trang này gọi vào máy.',
    actions: [A.OPEN_MIRROR, A.WHY_BLOCKED], where: [W.banner, W.pill],
    severity: 'warn', readOnly: true,
  },
  AGENT_PROTOCOL_OLD: {
    title: 'Công cụ local cũ hơn giao diện',
    explain: 'Cập nhật để dùng được tính năng mới.',
    actions: [A.COPY_UPDATE_CMD], where: [W.banner, W.pill],
    severity: 'warn', readOnly: true,
  },
  AGENT_PROTOCOL_NEW: {
    title: 'Giao diện đang là bản cache cũ',
    explain: 'Tải lại trang để lấy bản mới.',
    actions: [A.HARD_RELOAD], where: [W.banner, W.pill],
    severity: 'warn', readOnly: true,
  },
  AGENT_STARTING: {
    title: 'Công cụ local đang khởi động',
    explain: 'Chờ vài giây rồi thử lại.',
    actions: [A.RECHECK], where: [W.banner, W.pill], severity: 'info', readOnly: true,
  },
  ORIGIN_NOT_ALLOWED: {
    title: 'Không kết nối được vì lý do bảo mật',
    explain: 'Địa chỉ trang này không nằm trong danh sách cho phép của công cụ local.',
    actions: [A.OPEN_MIRROR, A.SHOW_DETAILS], where: [W.banner], severity: 'warn', readOnly: true,
  },
  BAD_HOST: {
    title: 'Không kết nối được vì lý do bảo mật',
    explain: 'Địa chỉ trang này không nằm trong danh sách cho phép của công cụ local.',
    actions: [A.OPEN_MIRROR, A.SHOW_DETAILS], where: [W.banner], severity: 'warn', readOnly: true,
  },
  AGENT_INTERNAL: {
    title: 'Công cụ local gặp lỗi',
    explain: 'Thao tác chưa hoàn tất. Thử lại, nếu vẫn lỗi hãy xem chi tiết kỹ thuật.',
    actions: [A.RETRY], where: [W.toast], severity: 'danger',
  },

  // ── Thư mục làm việc ────────────────────────────────────────────────────
  WORKSPACE_CHANGED: {
    title: 'Bạn đang mở một thư mục làm việc khác',
    explain: 'Danh sách project sẽ được tải lại.',
    actions: [A.USE_THIS_WORKSPACE], where: [W.modal], severity: 'info',
  },
  WORKSPACE_UNWRITABLE: {
    title: 'Không ghi được vào thư mục làm việc',
    explain: 'Kiểm tra quyền hoặc dung lượng ổ đĩa.',
    actions: [A.COPY_WS_CMD, A.RECHECK], where: [W.banner, W.inline], severity: 'danger',
  },
  DISK_FULL: {
    title: 'Không ghi được vào thư mục làm việc',
    explain: 'Kiểm tra quyền hoặc dung lượng ổ đĩa.',
    actions: [A.COPY_WS_CMD, A.RECHECK], where: [W.banner, W.inline], severity: 'danger',
  },
  WORKSPACE_UNKNOWN: {
    title: 'Không tìm thấy thư mục làm việc này',
    explain: 'Công cụ local không còn biết thư mục vừa chọn.',
    actions: [A.RECHECK, A.COPY_WS_CMD], where: [W.inline, W.toast], severity: 'warn',
  },

  // ── Môi trường (S6?tab=env) ─────────────────────────────────────────────
  CODEX_MISSING: {
    title: 'Thiếu công cụ trên máy',
    explain: 'Chưa cài codex CLI nên không sinh được ảnh.',
    actions: [A.COPY_INSTALL_CMD, A.OPEN_DOCS], where: [W.inline], severity: 'danger',
  },
  PY_DEPS_MISSING: {
    title: 'Thiếu công cụ trên máy',
    explain: 'Thiếu thư viện Python để cắt ảnh (Pillow/numpy).',
    actions: [A.COPY_INSTALL_CMD, A.OPEN_DOCS], where: [W.inline], severity: 'danger',
  },
  IMAGEGEN_UNAVAILABLE: {
    title: 'Chưa tạo được ảnh AI',
    explain: 'Codex trên máy chưa bật được công cụ tạo ảnh.',
    actions: [A.FIX_IMAGEGEN, A.RECHECK], where: [W.inline, W.modal], severity: 'warn',
  },
  QUOTA_SUSPECTED: {
    title: 'Có vẻ đã chạm giới hạn tạo ảnh của tài khoản',
    explain: 'Sinh ảnh tiêu quota gấp 3–5 lần một lượt hỏi thường.',
    actions: [A.LOWER_MAXJOBS, A.RETRY_FAILED_JOBS], where: [W.banner, W.inline], severity: 'warn',
  },

  // ── Lượt chạy ───────────────────────────────────────────────────────────
  RUN_CONFLICT: {
    title: 'Project này đang chạy một lượt khác',
    explain: 'Chờ xong hoặc dừng lượt đó.',
    actions: [A.VIEW_ACTIVE_RUN, A.CANCEL_RUN], where: [W.toast, W.modal], severity: 'warn',
  },
  RUN_ACTIVE: {
    title: 'Không làm được khi đang chạy',
    explain: 'Thao tác này cần dừng lượt chạy trước.',
    actions: [A.VIEW_RUN, A.CANCEL_RUN], where: [W.inline], severity: 'warn',
  },
  RUN_NOT_FOUND: {
    title: 'Không tìm thấy lượt chạy',
    explain: 'Lượt này không còn trong danh sách của công cụ local.',
    actions: [A.BACK_TO_LIST], where: [W.screen], severity: 'warn',
  },
  RUN_FINISHED: {
    title: 'Lượt chạy đã kết thúc',
    explain: 'Không dừng được vì nó đã xong.',
    actions: [A.RELOAD_DATA], where: [W.toast], severity: 'info',
  },
  CURSOR_GONE: {
    title: 'Nhật ký đã chạy quá xa',
    explain: 'Giao diện sẽ tải lại trạng thái lượt chạy rồi theo dõi tiếp.',
    actions: [A.RELOAD_DATA], where: [W.inline], severity: 'info',
  },
  UNKNOWN_JOB: {
    title: 'Có lượt không còn tồn tại',
    explain: 'Bản thiết kế đã đổi từ lúc bạn mở màn này.',
    actions: [A.RELOAD_DATA], where: [W.modal], severity: 'warn',
  },
  UNKNOWN_VARIANT: {
    title: 'Phong cách không còn trong bản thiết kế',
    explain: 'Bản thiết kế đã đổi từ lúc bạn mở màn này — hãy tải lại rồi chọn lại phong cách.',
    actions: [A.RELOAD_DATA], where: [W.modal], severity: 'warn',
  },
  LOG_NOT_FOUND: {
    title: 'Không còn nhật ký của lượt này',
    explain: 'Log cũ đã bị dọn theo hạn lưu.',
    actions: [A.RERUN_THIS], where: [W.drawer], severity: 'info',
  },

  // ── Bản thiết kế (contract) ─────────────────────────────────────────────
  CONTRACT_CONFLICT: {
    title: 'Bản thiết kế đã đổi ở nơi khác',
    explain: 'Có người hoặc tab khác đã lưu sau bạn.',
    actions: [A.COMPARE, A.RELOAD_DATA, A.SAVE_AS_COPY], where: [W.modal], severity: 'warn',
  },
  CONTRACT_INVALID: {
    title: 'Bản thiết kế có lỗi',
    explain: 'Sửa từng lỗi được liệt kê rồi lưu lại.',
    actions: [A.VIEW_VALIDATION], where: [W.validateBar], severity: 'danger',
  },
  CONTRACT_BROKEN: {
    title: 'Không đọc được bản thiết kế',
    explain: 'File bản thiết kế của project này bị hỏng.',
    actions: [A.RESTORE_HISTORY, A.REVEAL_FOLDER], where: [W.screen], severity: 'danger',
  },
  IF_MATCH_REQUIRED: {
    title: 'Không lưu được bản thiết kế',
    explain: 'Giao diện thiếu thông tin phiên bản để lưu an toàn. Tải lại rồi sửa tiếp.',
    actions: [A.RELOAD_DATA], where: [W.toast], severity: 'danger',
  },

  // ── Project ─────────────────────────────────────────────────────────────
  PROJECT_ID_TAKEN: {
    title: 'Tên thư mục này đã có',
    explain: 'Dùng gợi ý hoặc đổi tên khác.',
    actions: [A.USE_SUGGESTION], where: [W.inline], severity: 'warn',
  },
  INVALID_NAME: {
    title: 'Tên chưa dùng được',
    explain: 'Tên project cần 1–60 ký tự và không chỉ gồm khoảng trắng.',
    actions: [], where: [W.inline], severity: 'warn',
  },
  INVALID_SLUG: {
    title: 'Tên thư mục chưa dùng được',
    explain: 'Chỉ dùng chữ không dấu, số và dấu gạch ngang.',
    actions: [A.USE_SUGGESTION], where: [W.inline], severity: 'warn',
  },
  PROJECT_BROKEN: {
    title: 'Không đọc được project',
    explain: 'Có file trong project bị hỏng nên chưa mở được.',
    actions: [A.REVEAL_FOLDER, A.RESTORE_HISTORY], where: [W.screen, W.inline], severity: 'danger',
  },
  PROJECT_NOT_FOUND: {
    title: 'Project không còn ở đây',
    explain: 'Có thể đã bị xoá hoặc bạn đang mở thư mục làm việc khác.',
    actions: [A.BACK_TO_LIST, A.VIEW_TRASH], where: [W.screen], severity: 'warn',
  },
  PROJECT_IN_TRASH: {
    title: 'Project không còn ở đây',
    explain: 'Project này đang nằm trong thùng rác.',
    actions: [A.VIEW_TRASH, A.BACK_TO_LIST], where: [W.screen], severity: 'warn',
  },
  TRASH_NOT_FOUND: {
    title: 'Không còn trong thùng rác',
    explain: 'Mục này đã được phục hồi hoặc đã xoá vĩnh viễn.',
    actions: [A.VIEW_TRASH], where: [W.toast], severity: 'info',
  },
  REF_IN_USE: {
    title: 'Ảnh này đang được dùng',
    explain: 'Xoá sẽ làm những chỗ đang dùng bị thiếu ảnh.',
    actions: [A.VIEW_USAGES, A.DELETE_ANYWAY], where: [W.inline], severity: 'warn',
  },
  KIT_NOT_CUT: {
    title: 'Chưa có kit đã cắt',
    explain: 'Phong cách này chưa được cắt nên chưa có file PNG.',
    actions: [], where: [W.screen], severity: 'info',
  },

  // ── File / upload ───────────────────────────────────────────────────────
  TOO_LARGE: {
    title: 'File không dùng được',
    explain: 'Ảnh tối đa 20 MB, file nhập tối đa 200 MB.',
    actions: [A.PICK_OTHER_FILE], where: [W.inline], severity: 'warn',
  },
  BAD_TYPE: {
    title: 'File không dùng được',
    explain: 'Chỉ nhận ảnh PNG, JPG hoặc WebP.',
    actions: [A.PICK_OTHER_FILE], where: [W.inline], severity: 'warn',
  },
  PATH_ESCAPE: {
    title: 'Không mở được file này',
    explain: 'Đường dẫn nằm ngoài project nên bị từ chối.',
    actions: [], where: [W.toast], severity: 'danger',
  },
  IMPORT_INVALID: {
    title: 'File nhập không đọc được',
    explain: 'Không có project nào được tạo nửa vời — hãy xem báo cáo để biết chỗ hỏng.',
    actions: [A.PICK_OTHER_FILE, A.DOWNLOAD_REPORT], where: [W.modal], severity: 'danger',
  },
  NOT_SUPPORTED: {
    title: 'Máy bạn chưa làm được việc này',
    explain: 'Công cụ local không hỗ trợ thao tác này trên hệ điều hành hiện tại.',
    actions: [], where: [W.toast], severity: 'info',
  },

  // ── Mã xác nhận xoá vĩnh viễn (arch §3.4 lớp 8) ─────────────────────────
  CONFIRM_REQUIRED: {
    title: 'Cần mã xác nhận từ Terminal',
    explain: 'Mã in ở cửa sổ đang chạy công cụ local, dùng một lần, hết hạn sau 60 giây.',
    actions: [A.RESEND_CODE], where: [W.modal], severity: 'warn',
  },
  CONFIRM_INVALID: {
    title: 'Cần mã xác nhận từ Terminal',
    explain: 'Mã vừa nhập không đúng. Xem lại cửa sổ Terminal rồi nhập lại.',
    actions: [A.RESEND_CODE], where: [W.modal], severity: 'warn',
  },
  CONFIRM_LOCKED: {
    title: 'Cần mã xác nhận từ Terminal',
    explain: 'Đã nhập sai quá nhiều lần. Chờ một chút rồi xin mã mới.',
    actions: [A.WAIT, A.RESEND_CODE], where: [W.modal], severity: 'warn',
  },

  // ── Nhịp gọi ────────────────────────────────────────────────────────────
  RATE_LIMITED: {
    title: 'Bạn bấm quá nhanh',
    explain: 'Giao diện sẽ tự thử lại sau vài giây.',
    actions: [], where: [W.toast], severity: 'info',
  },
});

/** Nhãn diễn giải 7 enum `imageGen.reason` (arch §6.3) — phần dài nằm ở web, agent chỉ trả enum. */
export const IMAGEGEN_REASONS = Object.freeze({
  NO_CODEX: 'Chưa cài codex CLI trên máy.',
  NOT_LOGGED_IN: 'Codex chưa đăng nhập tài khoản ChatGPT.',
  FREE_PLAN: 'Gói ChatGPT Free không tạo được ảnh.',
  PROVIDER_NOT_OPENAI: 'Codex đang dùng nhà cung cấp riêng nên không có công cụ tạo ảnh.',
  MODEL_NO_IMAGE_INPUT: 'Model đang chọn không nhận công cụ tạo ảnh.',
  FEATURE_OFF: 'Tính năng tạo ảnh đang bị tắt trong cấu hình codex.',
  UNKNOWN: 'Chưa xác định được lý do.',
});

/** Fallback cho mọi mã lạ — §6.5-6: không được vỡ UI. */
export const UNKNOWN_ENTRY = Object.freeze({
  title: 'Có lỗi từ công cụ local',
  explain: 'Giao diện chưa biết mã lỗi này.',
  actions: [A.RETRY, A.SHOW_DETAILS], where: [W.toast], severity: 'danger',
});

/** HTTP status → code khi agent không trả envelope (hoặc trả rỗng). */
export const STATUS_FALLBACK = Object.freeze({
  403: 'ORIGIN_NOT_ALLOWED', 404: 'PROJECT_NOT_FOUND', 409: 'RUN_CONFLICT',
  410: 'PROJECT_IN_TRASH', 412: 'IF_MATCH_REQUIRED', 413: 'TOO_LARGE',
  415: 'BAD_TYPE', 416: 'CURSOR_GONE', 421: 'BAD_HOST', 422: 'CONTRACT_INVALID',
  423: 'WORKSPACE_UNWRITABLE', 429: 'RATE_LIMITED', 500: 'AGENT_INTERNAL',
  503: 'AGENT_STARTING',
});
