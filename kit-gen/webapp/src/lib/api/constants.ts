/**
 * webapp/src/lib/api/constants.ts — hằng số của lớp transport.
 * Nguồn: UX-SPEC §6.1 (hợp đồng), arch §3.4 (bảo mật), §4.1 (state browser), §5.3 (probe).
 * KHÔNG chứa secret, KHÔNG đọc biến môi trường.
 */

/** Phiên bản giao thức mà bundle này nói được — §6.1 version negotiation. */
export const APP_PROTOCOL = 1;

/** Header ép preflight — arch §3.4 lớp 3. Gửi cho MỌI request, kể cả GET. */
export const CLIENT_HEADER = "X-KitGen-Client";
export const CLIENT_HEADER_VALUE = "1";
export const PROTOCOL_HEADER = "X-KitGen-Protocol";
/** Mã 4 số cho purge vĩnh viễn — dùng 1 lần, KHÔNG BAO GIỜ persist (arch §4.3-7). */
export const CONFIRM_HEADER = "X-KitGen-Confirm";

/** Dò cổng theo chốt X2: 8765 → 8766 → 8767. CẤM dò 8125 (server v1, khác giao thức). */
export const PORT_CANDIDATES = [8765, 8766, 8767] as const;

export const LOOPBACK_HOSTS = ["127.0.0.1", "localhost", "[::1]", "::1"] as const;

/**
 * Timeout — §6.1 "Timeout & retry ở client", nguyên văn:
 * health 1200ms không retry · GET đọc 8s retry 1 lần · POST tạo/sửa KHÔNG retry
 * · run stream không timeout · upload 60s.
 */
export const TIMEOUT = {
  health: 1200,
  get: 8000,
  write: 15000,
  upload: 60000,
  /** 0 = KHÔNG đặt hạn. Stream chạy hàng phút, đặt hạn là tự cắt log của mình. */
  stream: 0,
  bridge: 8000,
  /**
   * ══ `preview` 75s — CHO ĐÚNG MỘT ENDPOINT: `POST …/prompt-preview` ═════════
   *
   * Nó là POST, nên trước lượt này nó đi bằng hạn `write` = 15s. Nhưng nó KHÔNG
   * phải một phép ghi vài chục byte: agent chạy `renderPromptsOnly`, tức khởi
   * động engine thật và render prompt cho từng tấm — đo trên máy dev là 20–50s
   * cho một dự án bốn tấm. Hạn 15s vì thế cắt một lượt HOÀN TOÀN KHOẺ MẠNH, và
   * `transportError` phân loại cú cắt ấy là `AGENT_NOT_RUNNING` ⇒ người dùng
   * được bảo "agent chưa chạy" trong khi agent đang chạy và đang làm việc.
   *
   * 75s là trần trên của khoảng đo được cộng biên. Quá 75s thì có thật là hỏng,
   * và lúc đó UI phải ra CHỮ kèm nút bấm lại — xem `block-prompt.ts`.
   */
  preview: 75_000,
} as const;

export const RETRY = {
  health: 0,
  get: 1,
  write: 0,
  upload: 0,
  stream: 0,
  /** Chạy engine thật ⇒ KHÔNG thử lại: lần thử thứ hai là một tiến trình engine
      thứ hai cùng ghi vào `prompts/` của một dự án. */
  preview: 0,
  /** §3.9 RATE_LIMITED: tự thử lại sau 2s — CHỈ cho request đọc. */
  rateLimitDelayMs: 2000,
} as const;

export type RequestKind = keyof typeof TIMEOUT & keyof typeof RETRY;

/** Backoff health-probe — arch §5.3. Tab ẩn thì dừng (`lib/api/health-probe.ts` xử). */
export const PROBE_BACKOFF_MS = [1500, 3000, 6000, 15000] as const;
export const PROBE_ACTIVE_RUN_MS = 1500;
/** Tab ẩn: KHÔNG probe, chỉ ngó lại xem user quay về chưa. */
export const PROBE_HIDDEN_MS = 5000;
/** `diagnose()` tự ném (hiếm — nó nuốt gần hết lỗi): thử lại ở nhịp cố định. */
export const PROBE_ERROR_RETRY_MS = 3000;

/** §6.3: heartbeat 15s; 40s im lặng ⇒ coi là đứt → chuyển poll 2s + badge "chế độ poll". */
export const STREAM_STALL_MS = 40_000;
export const STREAM_POLL_FALLBACK_MS = 2000;

/** Đường vào — quyết định cách chẩn đoán lỗi kết nối (§6.2 #6, arch §5.3). */
export const ENTRY = {
  /** agent tự phục vụ bundle tại http://127.0.0.1:<port>/app/ → SAME-ORIGIN. */
  mirror: "mirror",
  /** web tĩnh HTTPS (Cloudflare Pages) → fetch chéo origin tới loopback. */
  pages: "pages",
  /** dev server (vite proxy), file://, hay loopback không ở /app/. */
  unknown: "unknown",
} as const;
export type Entry = (typeof ENTRY)[keyof typeof ENTRY];

/** Giới hạn của agent — client kiểm TRƯỚC khi gửi để không tốn công ăn 413. */
export const LIMITS = {
  refBytes: 20 * 1024 * 1024,
  uploadBytes: 200 * 1024 * 1024,
  refTypes: ["image/png", "image/jpeg", "image/webp"] as const,
  /** §6.5-5: lưới LUÔN dùng ?w=256; ảnh full CHỈ trong lightbox (đóng H4). */
  thumbWidth: 256,
  runlogMaxLines: 5000,
} as const;
