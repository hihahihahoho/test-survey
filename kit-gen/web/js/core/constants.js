/**
 * web/js/core/constants.js — hằng số dùng chung của lớp transport & state.
 * Nguồn: UX-SPEC §6.1 (hợp đồng API), architecture §3.4 (bảo mật), §4.1 (state browser).
 * KHÔNG chứa bất kỳ secret nào. Không đọc biến môi trường.
 */

/** Phiên bản giao thức mà bundle web này nói được (UX-SPEC §6.1 version negotiation). */
export const APP_PROTOCOL = 1;

/** Header bắt buộc để ép preflight — architecture §3.4 lớp 3. */
export const CLIENT_HEADER = 'X-KitGen-Client';
export const CLIENT_HEADER_VALUE = '1';
export const PROTOCOL_HEADER = 'X-KitGen-Protocol';
/** Mã xác nhận 4 số cho thao tác huỷ diệt — KHÔNG BAO GIỜ persist (arch §4.3-7). */
export const CONFIRM_HEADER = 'X-KitGen-Confirm';

/** Dò cổng theo đúng chốt X2: 8765 → 8766 → 8767. Cấm dò 8125 (server v1, khác giao thức). */
export const PORT_CANDIDATES = Object.freeze([8765, 8766, 8767]);

/** Host loopback hợp lệ. Client luôn gọi 127.0.0.1 trước (arch §3.1). */
export const LOOPBACK_HOSTS = Object.freeze(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Timeout & retry — UX-SPEC §6.1 "Timeout & retry ở client". */
export const TIMEOUT = Object.freeze({
  health: 1200,   // không retry
  get: 8000,      // retry 1 lần
  write: 15000,   // POST/PUT/PATCH/DELETE — KHÔNG retry tự động
  upload: 60000,  // multipart
  stream: 0,      // 0 = không timeout
  bridge: 8000,   // cầu dò popup postMessage (arch §5.3)
});

export const RETRY = Object.freeze({
  get: 1,
  write: 0,
  health: 0,
  upload: 0,
  /** §3.9 RATE_LIMITED: tự thử lại sau 2s (chỉ cho request đọc, tránh nhân bản đôi). */
  rateLimitDelayMs: 2000,
});

/** Backoff của health-probe định kỳ — arch §5.3. */
export const PROBE_BACKOFF_MS = Object.freeze([1500, 3000, 6000, 15000]);
/** Khi có run đang chạy: poll cố định 1.5s (arch §5.3). */
export const PROBE_ACTIVE_RUN_MS = 1500;
/** Stream: heartbeat 15s; 40s không có gì → coi là đứt, chuyển poll 2s (UX-SPEC §6.3). */
export const STREAM_STALL_MS = 40000;
export const STREAM_POLL_FALLBACK_MS = 2000;

/** Đường vào (§0.2 X1, §6.2 #6). */
export const ENTRY = Object.freeze({
  pages: 'pages',     // web tĩnh HTTPS trên Cloudflare Pages → fetch chéo origin tới loopback
  mirror: 'mirror',   // agent tự phục vụ bundle tại http://127.0.0.1:8765/app/ (same-origin)
  unknown: 'unknown', // file://, dev server khác, v.v.
});

/** Chế độ transport lưu ở kitgen.agent.v1.mode. */
export const AGENT_MODE = Object.freeze({ remote: 'remote', mirror: 'mirror' });

/** 6 trạng thái agent pill — UX-SPEC §2.4. Luôn có CHỮ, không bao giờ chỉ có màu (audit I1). */
export const PILL = Object.freeze({
  connected: 'connected',
  checking: 'checking',
  notRunning: 'not-running',
  blocked: 'blocked-by-browser',
  protocolMismatch: 'protocol-mismatch',
  imagegenUnavailable: 'imagegen-unavailable',
});

/** 7 trạng thái job — UX-SPEC §5.7, không thêm không bớt. */
export const JOB_STATUS = Object.freeze([
  'never', 'queued', 'running', 'ok', 'stale', 'uncut', 'failed',
]);
/** Thứ tự ưu tiên khi gộp nhiều job vào 1 badge (§5.7). */
export const JOB_STATUS_PRIORITY = Object.freeze([
  'failed', 'running', 'queued', 'stale', 'uncut', 'never', 'ok',
]);
/** Trạng thái của lượt chạy (§5.7). */
export const RUN_STATUS = Object.freeze([
  'queued', 'running', 'done', 'done-with-errors', 'cancelled', 'env-failed',
]);

/** Enum chế độ tạo ảnh — được phép lưu ở browser (arch §4.1 kitgen.setup.v1). */
export const IMAGE_GEN_MODES = Object.freeze([
  'default-home', 'img-home', 'profile-overlay', 'unavailable', 'unknown',
]);

/** Loại event của stream NDJSON — UX-SPEC §6.3. */
export const STREAM_EVENTS = Object.freeze([
  'run.started', 'job.started', 'job.log', 'job.done',
  'phase.changed', 'progress', 'workspace.changed', 'run.finished', 'heartbeat',
]);

/** Khoá localStorage — danh sách ĐẦY ĐỦ, arch §4.1. Không có key nào ngoài bảng này. */
export const LS_KEYS = Object.freeze({
  setup: 'kitgen.setup.v1',
  agent: 'kitgen.agent.v1',
  workspace: 'kitgen.workspace.v1',
  projectsCache: 'kitgen.projects.cache.v1',
  ui: 'kitgen.ui.v1',
  prefs: 'kitgen.prefs.v1',
  recent: 'kitgen.recent.v1',
  hints: 'kitgen.hints.v1',
});

/** Store IndexedDB — arch §4.2. */
export const IDB_NAME = 'kitgen';
export const IDB_VERSION = 1;
export const IDB_STORES = Object.freeze({ drafts: 'drafts', thumbs: 'thumbs', runlog: 'runlog' });

/** Giới hạn của agent (để client validate TRƯỚC khi gửi, tránh 413 vô ích). */
export const LIMITS = Object.freeze({
  refBytes: 20 * 1024 * 1024,       // #30: ảnh ref ≤ 20 MB
  uploadBytes: 200 * 1024 * 1024,   // #19: zip ≤ 200 MB
  refTypes: Object.freeze(['image/png', 'image/jpeg', 'image/webp']),
  thumbWidth: 256,                  // §6.5-5: lưới LUÔN dùng ?w=256
  runlogKeepRuns: 20,
  runlogMaxLines: 5000,
});
