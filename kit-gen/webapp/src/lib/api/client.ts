/**
 * webapp/src/lib/api/client.ts — MODULE TRANSPORT DUY NHẤT tới agent local.
 * Ràng buộc §6.5-1: "Cấm gọi `fetch` trực tiếp ở component." Mọi request đi qua đây.
 *
 * Bảo đảm ở một chỗ, không nơi nào được làm khác:
 *  · header `X-KitGen-Client: 1` + `Content-Type: application/json` cho MỌI request
 *    (kể cả GET — để ép preflight, arch §3.4 lớp 3)
 *  · `credentials: "omit"`, KHÔNG cookie, KHÔNG `Authorization`, KHÔNG token (YC#7).
 *    Hai header này bị LỌC BỎ ngay cả khi caller cố truyền vào.
 *  · dò cổng 8765 → 8766 → 8767 (chốt X2); KHÔNG BAO GIỜ dò 8125
 *  · timeout & retry đúng §6.1 — bảng ở constants.ts, không ai được tự đặt số khác
 *  · version negotiation qua `X-KitGen-Protocol`
 *  · parse envelope lỗi → `AgentError` có `.code` để tra bảng §3.9
 */
import {
  APP_PROTOCOL, CLIENT_HEADER, CLIENT_HEADER_VALUE, CONFIRM_HEADER, ENTRY,
  LIMITS, PORT_CANDIDATES, PROTOCOL_HEADER, RETRY, TIMEOUT,
  type Entry, type RequestKind,
} from "./constants";
import { STATUS_FALLBACK, canonicalCode } from "./errors";
import { readNdjsonStream, NdjsonParser, type NdjsonResult, type ReadStreamOptions } from "./ndjson";

/* ═════════════ AgentError ═════════════ */

export interface AgentErrorInit {
  code?: string;
  /** KỸ THUẬT — chỉ hiện ở panel "Chi tiết cho lập trình viên" (§3.9). */
  message?: string;
  hint?: string;
  docs?: string;
  details?: unknown;
  status?: number;
  method?: string;
  url?: string;
  /** phân loại tầng vận chuyển: có tới được agent hay không. Xem `transport` bên dưới. */
  transport?: TransportOutcome;
  entry?: Entry;
  cause?: unknown;
}

/**
 * `transport` trả lời câu hỏi mà QA-UX TRUNG BÌNH-01 chỉ ra là bản cũ trả lời sai:
 *  · "http-error"  → ĐÃ tới agent, agent trả mã ≥400. TUYỆT ĐỐI không được đổ tội trình duyệt.
 *  · "unreachable" → fetch reject, không có response. Agent chưa chạy HOẶC trình duyệt chặn.
 *  · "timeout"     → có kết nối nhưng quá hạn.
 *  · "client"      → lỗi do chính client (validate trước khi gửi, thiếu If-Match…).
 */
export type TransportOutcome = "http-error" | "unreachable" | "timeout" | "client";

export class AgentError extends Error {
  readonly code: string;
  readonly hint: string | null;
  readonly docs: string | null;
  readonly details: unknown;
  readonly status: number;
  readonly method: string;
  readonly url: string;
  readonly transport: TransportOutcome;
  readonly entry: Entry | null;

  constructor(init: AgentErrorInit) {
    super(init.message ?? init.code ?? "AGENT_ERROR");
    this.name = "AgentError";
    this.code = canonicalCode(init.code) ?? "AGENT_INTERNAL";
    this.hint = init.hint ?? null;
    this.docs = init.docs ?? null;
    this.details = init.details ?? null;
    this.status = init.status ?? 0;
    this.method = init.method ?? "GET";
    this.url = init.url ?? "";
    this.transport = init.transport ?? "http-error";
    this.entry = init.entry ?? null;
    if (init.cause !== undefined) this.cause = init.cause;
  }

  /** true ⇒ ĐÃ nói chuyện được với agent. Dùng để chọn đúng 1 trong 3 ca lỗi kết nối. */
  get reachedAgent(): boolean {
    return this.transport === "http-error";
  }
}

/* ═════════════ Phát hiện đường vào ═════════════ */

export interface EntryInfo {
  entry: Entry;
  /** trang và agent CÙNG origin ⇒ trình duyệt không thể là thủ phạm chặn. */
  sameOrigin: boolean;
  origin: string | null;
  /** base để gọi API. `""` = đường dẫn tương đối cùng origin (mirror hoặc dev proxy). */
  base: string | null;
  httpsPage: boolean;
}

export interface LocationLike {
  hostname?: string;
  pathname?: string;
  protocol?: string;
  origin?: string;
  port?: string;
}

function isLoopbackHost(host: string): boolean {
  return /^(127\.0\.0\.1|localhost|\[?::1\]?)$/.test(host);
}

/**
 * Ba đường vào có ý nghĩa KHÁC NHAU khi chẩn đoán lỗi:
 *  · `mirror`  — `http://127.0.0.1:8765/app/…`: agent phục vụ chính bundle này.
 *                Same-origin ⇒ nếu fetch fail thì agent đã tắt, KHÔNG phải trình duyệt chặn.
 *  · `unknown` — dev server `localhost:5173` (vite proxy /api,/health sang agent), hay file://.
 *                Cũng same-origin nên cùng kết luận như mirror.
 *  · `pages`   — trang HTTPS ở Cloudflare Pages gọi chéo vào loopback: đây là đường
 *                DUY NHẤT mà "trình duyệt đang chặn" là giả thuyết hợp lý (mixed-content,
 *                Private Network Access, Safari).
 */
export function detectEntry(loc?: LocationLike | null): EntryInfo {
  const l = loc ?? (typeof location !== "undefined" ? (location as LocationLike) : null);
  if (!l) {
    return { entry: ENTRY.unknown, sameOrigin: false, origin: null, base: null, httpsPage: false };
  }
  const host = l.hostname ?? "";
  const path = l.pathname ?? "";
  const origin = l.origin ?? null;
  const httpsPage = l.protocol === "https:";
  const loopback = isLoopbackHost(host);
  const inApp = path.startsWith("/app/") || path === "/app";

  if (loopback && inApp) {
    return { entry: ENTRY.mirror, sameOrigin: true, origin, base: origin ?? "", httpsPage };
  }
  if (loopback) {
    // dev server (vite proxy) — gọi bằng đường dẫn TƯƠNG ĐỐI để đi qua proxy same-origin.
    return { entry: ENTRY.unknown, sameOrigin: true, origin, base: "", httpsPage };
  }
  if (l.protocol === "https:" || l.protocol === "http:") {
    return { entry: ENTRY.pages, sameOrigin: false, origin, base: null, httpsPage };
  }
  return { entry: ENTRY.unknown, sameOrigin: false, origin, base: null, httpsPage };
}

/** URL bản chạy tại máy — mở bằng ĐIỀU HƯỚNG TOP-LEVEL (không bị mixed-content chặn). */
export function mirrorUrl(port: number = PORT_CANDIDATES[0], hash = ""): string {
  return `http://127.0.0.1:${port}/app/${hash}`;
}

/** URL cầu dò postMessage (§6.2 #5, arch §5.3). */
export function bridgeUrl(port: number = PORT_CANDIDATES[0], pagesOrigin?: string): string {
  const o = pagesOrigin ?? (typeof location !== "undefined" ? location.origin : "");
  return `http://127.0.0.1:${port}/bridge.html?o=${encodeURIComponent(o)}`;
}

/* ═════════════ Trạng thái transport ═════════════ */

interface ClientState {
  base: string | null;
  entry: Entry;
  protocol: number | null;
  fetchImpl: typeof fetch | null;
  location: LocationLike | null;
}

const state: ClientState = {
  base: null,
  entry: ENTRY.unknown,
  protocol: null,
  fetchImpl: null,
  location: null,
};

/** Tiêm phụ thuộc — dùng cho test (không cần trình duyệt) và cho hook probe. */
export function configureClient(opts: {
  fetchImpl?: typeof fetch | null;
  location?: LocationLike | null;
  base?: string | null;
  entry?: Entry;
}): void {
  if (opts.fetchImpl !== undefined) state.fetchImpl = opts.fetchImpl;
  if (opts.location !== undefined) state.location = opts.location;
  if (opts.base !== undefined) state.base = opts.base;
  if (opts.entry !== undefined) state.entry = opts.entry;
}

/** Reset toàn bộ — chỉ dùng trong test. */
export function _resetClient(): void {
  state.base = null;
  state.entry = ENTRY.unknown;
  state.protocol = null;
  state.fetchImpl = null;
  state.location = null;
}

export function currentEntry(): Entry {
  return state.entry;
}
export function currentProtocol(): number | null {
  return state.protocol;
}

/**
 * Base URL đang dùng. §6.5-3: KHÔNG BAO GIỜ nhận baseUrl do user gõ tự do — chỉ
 * same-origin, hoặc loopback với cổng nằm trong `PORT_CANDIDATES`.
 */
export function currentBase(): string {
  if (state.base !== null) return state.base;
  const info = detectEntry(state.location);
  state.entry = info.entry;
  if (info.base !== null) {
    state.base = info.base;
    return state.base;
  }
  return `http://127.0.0.1:${PORT_CANDIDATES[0]}`;
}

export function isAllowedBase(base: string, ports: readonly number[] = PORT_CANDIDATES): boolean {
  if (typeof base !== "string") return false;
  if (base === "") return true; // same-origin tương đối
  let u: URL;
  try {
    u = new URL(base);
  } catch {
    return false;
  }
  if (u.username !== "" || u.password !== "") return false;
  if (u.search !== "" || u.hash !== "") return false;
  if (u.pathname !== "/" && u.pathname !== "") return false;
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!isLoopbackHost(host) && !isLoopbackHost(u.hostname)) return false;
  const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
  return ports.includes(port);
}

/** Đặt base sau khi dò được cổng. Base lạ bị từ chối (không ném, chỉ bỏ qua). */
export function setBase(base: string, entry?: Entry): boolean {
  if (!isAllowedBase(base)) return false;
  state.base = base;
  if (entry) state.entry = entry;
  return true;
}

/* ═════════════ Lõi request ═════════════ */

function theFetch(): typeof fetch {
  const f = state.fetchImpl ?? (typeof fetch === "function" ? fetch : null);
  if (!f) {
    throw new AgentError({
      code: "AGENT_INTERNAL", message: "fetch không khả dụng trong môi trường này",
      transport: "client",
    });
  }
  return f;
}

function joinUrl(base: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return base === "" ? p : `${base.replace(/\/+$/, "")}${p}`;
}

/** Header bắt buộc §6.1. `Authorization`/`Cookie` bị lọc CỨNG, không thương lượng. */
function buildHeaders(extra: Record<string, string | undefined> = {}, isFormData = false): Record<string, string> {
  const h: Record<string, string> = { [CLIENT_HEADER]: CLIENT_HEADER_VALUE };
  // multipart: để trình duyệt tự đặt Content-Type kèm boundary.
  if (!isFormData) h["Content-Type"] = "application/json";
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null) continue;
    if (/^(authorization|cookie|set-cookie|proxy-authorization)$/i.test(k)) continue;
    h[k] = String(v);
  }
  return h;
}

/**
 * Signal: hết hạn `ms` HOẶC caller huỷ. `ms = 0` (stream) ⇒ không đặt hạn.
 * Có đường lùi bằng AbortController khi môi trường thiếu `AbortSignal` —
 * đúng lỗi B3 mà INTEGRATION.md §0 đã ghi: bản trước trả về signal của caller và
 * ĐÁNH RƠI hạn thời gian, làm request treo vô hạn.
 *
 * ══ VÌ SAO KHÔNG DÙNG `AbortSignal.timeout()` NỮA ═══════════════════════════
 * Vì nó KHÔNG TẮT ĐƯỢC. Đồng hồ nằm trong signal, không ai cầm handle, nên hạn
 * vẫn chạy sau khi request đã xong việc của nó — và với `raw: true` thì "xong việc"
 * mới chỉ là NHẬN XONG HEADER: thân response còn nằm nguyên đó, do NƠI GỌI đọc
 * (`refsApi.blob` → `response.blob()`).
 *
 * Hậu quả đo được (người test mù #2, tái hiện bằng throttle 40 KB/s): ảnh tham
 * chiếu 700 KB trả về `200 image/png` với đúng `content-length`, nhưng `.blob()`
 * ném `AbortError` ở giây thứ 8 (`TIMEOUT.get`) vì đồng hồ của REQUEST vẫn đang
 * đếm trên thân ảnh. `RefChips` nuốt lỗi thành ô xám câm ⇒ "server 200 mà UI trống".
 * Cùng vết ấy nằm ở mọi chỗ `raw: true`: file thư viện, log job, và `image-source.ts`
 * — tức cả ảnh gốc mà [Copy sang Figma] tải về.
 *
 * Nay hàm trả kèm `done()` để `request()` TẮT đồng hồ ngay trước khi trao thân
 * response cho nơi gọi. Đường không-raw giữ nguyên hạn cho tới lúc đọc xong JSON.
 */
interface TimeoutHandle {
  signal: AbortSignal | undefined;
  /** Tắt đồng hồ. Gọi nhiều lần vô hại. */
  done: () => void;
}

const NO_TIMEOUT = (signal: AbortSignal | undefined): TimeoutHandle => ({ signal, done: () => {} });

function timeoutSignal(ms: number, external?: AbortSignal): TimeoutHandle {
  if (!ms) return NO_TIMEOUT(external);
  // Không có AbortController ⇒ không dựng được đồng hồ tắt được. Giữ đường lùi cũ:
  // thà có hạn không tắt được còn hơn không có hạn nào.
  if (typeof AbortController === "undefined") {
    const hasTimeout = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function";
    return NO_TIMEOUT(hasTimeout && !external ? AbortSignal.timeout(ms) : external);
  }
  const ac = new AbortController();
  const fire = (reason?: unknown) => {
    if (!ac.signal.aborted) ac.abort(reason);
  };
  const timer = setTimeout(() => {
    const e = new Error("TimeoutError");
    e.name = "TimeoutError";
    fire(e);
  }, ms);
  ac.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  if (external) {
    if (external.aborted) fire(external.reason);
    else external.addEventListener("abort", () => fire(external.reason), { once: true });
  }
  return { signal: ac.signal, done: () => clearTimeout(timer) };
}

/**
 * fetch reject ⇒ KHÔNG có response. Đây là ca **mơ hồ**: agent chưa chạy hay trình duyệt chặn?
 * Kết luận phụ thuộc ĐƯỜNG VÀO, và đó chính là chỗ bản cũ làm sai (QA-UX TRUNG BÌNH-01):
 *  · same-origin (mirror / dev proxy): trang này do chính agent (hoặc proxy tới agent) phục vụ
 *    ⇒ trình duyệt không có lý do gì chặn ⇒ AGENT_NOT_RUNNING, KHÔNG nói "trình duyệt chặn".
 *  · pages (HTTPS → loopback): cả hai giả thuyết đều sống ⇒ để `AGENT_UNREACHABLE_AMBIGUOUS`,
 *    UI phải mời user chạy cầu dò popup trước khi kết luận.
 */
function transportError(e: unknown, method: string, url: string, entry: Entry): AgentError {
  const name = (e as { name?: string } | null)?.name ?? "Error";
  const aborted = name === "AbortError" || name === "TimeoutError";
  const sameOrigin = entry === ENTRY.mirror || entry === ENTRY.unknown;
  const code = aborted
    ? "AGENT_NOT_RUNNING"
    : sameOrigin
      ? "AGENT_NOT_RUNNING"
      : "AGENT_UNREACHABLE_AMBIGUOUS";
  return new AgentError({
    code,
    message: aborted
      ? `Hết thời gian chờ khi gọi ${method} ${url}`
      : `Không gọi được ${method} ${url}: ${name}: ${(e as Error | null)?.message ?? String(e)}`,
    status: 0,
    method,
    url,
    entry,
    transport: aborted ? "timeout" : "unreachable",
    details: { transport: aborted ? "timeout" : "fetch-failed", entry, sameOrigin },
    cause: e,
  });
}

function checkProtocolHeader(res: Response): number | null {
  const raw = res.headers?.get?.(PROTOCOL_HEADER);
  if (raw === null || raw === undefined || raw === "") return null;
  const p = Number(raw);
  if (!Number.isFinite(p)) return null;
  state.protocol = p;
  return p;
}

export function protocolMismatch(p: number | null | undefined): "AGENT_PROTOCOL_OLD" | "AGENT_PROTOCOL_NEW" | null {
  if (p === null || p === undefined || !Number.isFinite(p)) return null;
  if (p < APP_PROTOCOL) return "AGENT_PROTOCOL_OLD";
  if (p > APP_PROTOCOL) return "AGENT_PROTOCOL_NEW";
  return null;
}

async function parseErrorEnvelope(res: Response, method: string, url: string, entry: Entry): Promise<AgentError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* không phải JSON — vẫn dựng được lỗi từ status */
  }
  const env = (body as { error?: Record<string, unknown> } | null)?.error;
  const code = (typeof env?.code === "string" ? env.code : undefined) ?? STATUS_FALLBACK[res.status] ?? "AGENT_INTERNAL";
  return new AgentError({
    code,
    message: (typeof env?.message === "string" ? env.message : undefined) ?? `HTTP ${res.status} ${res.statusText ?? ""}`.trim(),
    hint: typeof env?.hint === "string" ? env.hint : undefined,
    docs: typeof env?.docs === "string" ? env.docs : undefined,
    details: env?.details,
    status: res.status,
    method,
    url,
    entry,
    // ĐÃ nhận được response ⇒ agent sống và đã trả lời. Không bao giờ đổ tội trình duyệt.
    transport: "http-error",
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface RequestOptions {
  method?: string;
  kind?: RequestKind;
  body?: unknown;
  headers?: Record<string, string | undefined>;
  signal?: AbortSignal;
  /** true ⇒ trả nguyên `Response` (dùng cho stream, log text, zip). */
  raw?: boolean;
  /** ghi đè base cho một request (dùng khi dò cổng). */
  base?: string;
}

/**
 * Lõi request. `kind` quyết định timeout & retry theo §6.1 — KHÔNG nơi nào được đặt khác.
 * Retry chỉ áp cho GET (1 lần) và cho 429 ở request đọc; POST/PUT/PATCH/DELETE
 * KHÔNG BAO GIỜ retry tự động vì sẽ tạo/sửa nhân đôi.
 */
export async function request<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", kind = "get", body, headers, signal, raw = false } = opts;
  const maxAttempts = (RETRY[kind] ?? 0) + 1;
  const ms = TIMEOUT[kind] ?? TIMEOUT.get;
  const base = opts.base ?? currentBase();
  const entry = state.entry;
  const url = joinUrl(base, path);
  let lastErr: AgentError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const isForm = typeof FormData !== "undefined" && body instanceof FormData;
    const timeout = timeoutSignal(ms, signal);
    const init: RequestInit = {
      method,
      mode: "cors",
      cache: "no-store",
      credentials: "omit", // §6.1: không cookie, không phiên
      redirect: "follow",
      referrerPolicy: "no-referrer",
      headers: buildHeaders(headers, isForm),
      signal: timeout.signal,
    };
    if (body !== undefined && body !== null) {
      init.body = isForm ? (body as FormData) : typeof body === "string" ? body : JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await theFetch()(url, init);
    } catch (e) {
      timeout.done();
      lastErr = transportError(e, method, url, entry);
      if (attempt < maxAttempts - 1) continue;
      throw lastErr;
    }

    const mism = protocolMismatch(checkProtocolHeader(res));
    if (mism !== null) {
      throw new AgentError({
        code: mism,
        status: res.status,
        method,
        url,
        entry,
        transport: "http-error",
        message: `Protocol agent=${state.protocol} app=${APP_PROTOCOL}`,
        details: { agentProtocol: state.protocol, appProtocol: APP_PROTOCOL },
      });
    }

    if (res.status === 304) {
      return { notModified: true, etag: res.headers?.get?.("ETag") ?? null } as T;
    }

    if (!res.ok) {
      const err = await parseErrorEnvelope(res, method, url, entry);
      // §3.9 RATE_LIMITED: tự thử lại sau 2s — chỉ cho request ĐỌC.
      if (res.status === 429 && (kind === "get" || kind === "health") && attempt < maxAttempts - 1) {
        lastErr = err;
        await sleep(RETRY.rateLimitDelayMs);
        continue;
      }
      // 5xx trên GET: dùng nốt lần retry còn lại.
      if (res.status >= 500 && attempt < maxAttempts - 1) {
        lastErr = err;
        continue;
      }
      throw err;
    }

    /* THÂN RESPONSE ĐỔI CHỦ Ở ĐÂY. Từ dòng này nơi gọi mới là người đọc `.blob()`/
       `.text()`, và nó có thể đọc chậm hoặc đọc muộn một cách hoàn toàn hợp lệ (ảnh
       700 KB qua đường chậm, agent đang bận vì một lượt gen). Đồng hồ của REQUEST
       không được đếm tiếp trên quãng đó — nếu không, thân ảnh bị cắt giữa chừng dù
       header đã `200`. Ai muốn hạn cho phần đọc thì tự truyền `signal` của mình. */
    if (raw) {
      timeout.done();
      return res as unknown as T;
    }
    if (res.status === 204) return { ok: true } as T;
    const etag = res.headers?.get?.("ETag") ?? null;
    let data: unknown = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (data !== null && typeof data === "object" && !Array.isArray(data) && etag !== null) {
      // ETag đi kèm dữ liệu để #23 đặt If-Match và #7 đặt If-None-Match, nhưng
      // không enumerable để không lọt vào JSON khi cache/persist.
      Object.defineProperty(data, "__etag", { value: etag, enumerable: false });
    }
    return (data ?? { ok: true }) as T;
  }
  throw lastErr ?? new AgentError({ code: "AGENT_INTERNAL", message: "Không có phản hồi", transport: "client" });
}

export const httpGet = <T>(path: string, opts: RequestOptions = {}) =>
  request<T>(path, { ...opts, method: "GET", kind: "get" });
export const httpPost = <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
  request<T>(path, { ...opts, method: "POST", kind: "write", body });
export const httpPut = <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
  request<T>(path, { ...opts, method: "PUT", kind: "write", body });
export const httpPatch = <T>(path: string, body?: unknown, opts: RequestOptions = {}) =>
  request<T>(path, { ...opts, method: "PATCH", kind: "write", body });
export const httpDelete = <T>(path: string, opts: RequestOptions = {}) =>
  request<T>(path, { ...opts, method: "DELETE", kind: "write" });
export const httpUpload = <T>(path: string, form: FormData, opts: RequestOptions = {}) =>
  request<T>(path, { ...opts, method: "POST", kind: "upload", body: form });

/** ETag ẩn mà `request()` gắn kèm response. */
export function etagOf(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const v = (data as { __etag?: unknown }).__etag;
  return typeof v === "string" ? v : null;
}

/** Header mã 4 số cho purge — KHÔNG BAO GIỜ persist mã này (arch §4.3-7). */
export function confirmHeader(code: string | number): Record<string, string> {
  const c = String(code ?? "").trim();
  if (!/^\d{4}$/.test(c)) {
    throw new AgentError({ code: "CONFIRM_INVALID", message: "Mã xác nhận phải là 4 chữ số", transport: "client" });
  }
  return { [CONFIRM_HEADER]: c };
}

/* ═════════════ /health & dò cổng ═════════════ */

export interface HealthProbe {
  base: string;
  ok: boolean;
  health: unknown;
  protocolIssue: "AGENT_PROTOCOL_OLD" | "AGENT_PROTOCOL_NEW" | null;
}

/** #1 `/health` — 1200ms, KHÔNG retry. Endpoint DUY NHẤT được gọi định kỳ. */
export async function fetchHealth(opts: { base?: string; signal?: AbortSignal } = {}): Promise<HealthProbe> {
  const base = opts.base ?? currentBase();
  const data = await request<Record<string, unknown>>("/health", {
    kind: "health",
    base,
    ...(opts.signal ? { signal: opts.signal } : {}),
  });
  const protocol = typeof data?.protocol === "number" ? data.protocol : state.protocol;
  return { base, ok: data?.ok === true, health: data, protocolIssue: protocolMismatch(protocol) };
}

/**
 * Dò cổng 8765 → 8766 → 8767 song song (chốt X2).
 * Same-origin (mirror / dev proxy) thì KHÔNG dò gì — chỉ thử đúng origin của trang,
 * vì dò cổng khác từ trang same-origin là tự tạo request chéo origin vô ích.
 *
 * Trả `{ found }` hoặc `{ errors }`. KHÔNG ném hết bằng chứng đi: 403/421/503/protocol-lệch
 * chứng minh agent ĐANG SỐNG mà từ chối ta — `diagnose()` cần biết để chọn đúng thông điệp.
 */
export async function discoverAgent(opts: {
  ports?: readonly number[];
  signal?: AbortSignal;
  location?: LocationLike | null;
} = {}): Promise<{ found: HealthProbe | null; errors: AgentError[]; entry: Entry }> {
  const info = detectEntry(opts.location ?? state.location);
  state.entry = info.entry;
  const bases = info.base !== null
    ? [info.base]
    : (opts.ports ?? PORT_CANDIDATES).map((p) => `http://127.0.0.1:${p}`);

  const settled = await Promise.allSettled(
    bases.map(async (base) => {
      const r = await fetchHealth({ base, ...(opts.signal ? { signal: opts.signal } : {}) });
      if (!r.ok && r.protocolIssue === null) {
        throw new AgentError({
          code: "AGENT_NOT_RUNNING",
          message: `health không ok tại ${base}`,
          transport: "http-error",
          status: 200,
          url: `${base}/health`,
          entry: info.entry,
        });
      }
      return r;
    }),
  );

  let found: HealthProbe | null = null;
  const errors: AgentError[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") {
      if (found === null) found = r.value;
    } else if (r.reason instanceof AgentError) errors.push(r.reason);
    else errors.push(new AgentError({ code: "AGENT_INTERNAL", message: String(r.reason), transport: "client" }));
  }
  if (found !== null) setBase(found.base, info.entry);
  return { found, errors, entry: info.entry };
}

/* ═════════════ Stream NDJSON (#35) ═════════════ */

export interface StreamRunResult extends NdjsonResult {
  /** 416 CURSOR_GONE ⇒ phải GET #34 rồi stream lại từ đầu (§6.3). */
  cursorGone: boolean;
}

/** #35 — KHÔNG timeout (§6.1). */
export async function streamRun(
  runId: string,
  { from = 0, ...handlers }: { from?: number } & ReadStreamOptions = {},
): Promise<StreamRunResult> {
  const qs = from > 0 ? `?from=${encodeURIComponent(from)}` : "";
  const path = `/api/runs/${encodeURIComponent(runId)}/stream${qs}`;
  let res: Response;
  try {
    res = await request<Response>(path, {
      method: "GET",
      kind: "stream",
      raw: true,
      ...(handlers.signal ? { signal: handlers.signal } : {}),
      headers: { Accept: "application/x-ndjson" },
    });
  } catch (e) {
    if (e instanceof AgentError && e.status === 416) {
      return { lastSeq: from > 0 ? from - 1 : 0, count: 0, badLines: 0, stalled: false, cursorGone: true };
    }
    throw e;
  }
  if (!res.body) {
    // Môi trường không có ReadableStream → đọc một lần, vẫn đúng định dạng NDJSON.
    const text = await res.text();
    const parser = new NdjsonParser(handlers);
    parser.push(text);
    parser.flush();
    return { lastSeq: parser.lastSeq, count: parser.count, badLines: parser.badLines, stalled: false, cursorGone: false };
  }
  const r = await readNdjsonStream(res.body, handlers);
  return { ...r, cursorGone: false };
}

/**
 * URL ảnh cho thẻ `<img>` — không đi qua fetch nên KHÔNG có header client.
 * Lưới LUÔN dùng `w=256` (§6.5-5, đóng H4); ảnh full chỉ trong lightbox.
 */
export function fileUrl(projectId: string, relPath: string, opts: { w?: number } = {}): string {
  const base = currentBase().replace(/\/+$/, "");
  // `encodeURIComponent` KHÔNG mã hoá dấu chấm, nên `"..".split("/")` đi qua nguyên vẹn.
  // Agent đã chặn traversal đúng cách (`agent/lib/paths.mjs`, 24/24 ca của qa-security.md),
  // nhưng client không có lý do gì dựng một URL như vậy: chặn luôn ở đây để nếu có bug
  // ở tầng trên thì nó lộ ra thành lỗi rõ ràng thay vì thành một request 400 âm thầm.
  const segments = String(relPath).split("/").filter((s) => s !== "" && s !== ".");
  if (segments.some((s) => s === "..")) {
    throw new AgentError({
      code: "PATH_ESCAPE", status: 400, transport: "client",
      message: `Đường dẫn file không được chứa ".." (nhận: ${relPath})`,
    });
  }
  const safe = segments.map(encodeURIComponent).join("/");
  const qs = opts.w ? `?w=${encodeURIComponent(opts.w)}` : "";
  return `${base}/api/projects/${encodeURIComponent(projectId)}/files/${safe}${qs}`;
}

export function thumbUrl(projectId: string, relPath: string): string {
  return fileUrl(projectId, relPath, { w: LIMITS.thumbWidth });
}
