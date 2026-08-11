/**
 * web/js/core/agent.js — MODULE TRANSPORT DUY NHẤT tới agent local (UX-SPEC §6, ràng buộc §6.5-1).
 * Cấm component gọi fetch trực tiếp. Mọi request đi qua đây để đảm bảo:
 *   · header X-KitGen-Client: 1 + Content-Type: application/json (ép preflight, arch §3.4 lớp 3)
 *   · credentials: 'omit', KHÔNG cookie, KHÔNG Authorization, KHÔNG token (YC#7)
 *   · dò cổng 8765 → 8766 → 8767 (chốt X2), không bao giờ dò 8125
 *   · timeout/retry đúng §6.1: health 1200ms không retry · GET 8s retry 1 lần
 *     · POST/PUT/PATCH/DELETE KHÔNG retry tự động · upload 60s · run stream không timeout
 *   · version negotiation qua header X-KitGen-Protocol
 *   · parse envelope lỗi → AgentError có `code` để tra bảng §3.9 (errors.js)
 */

import {
  AGENT_MODE, APP_PROTOCOL, CLIENT_HEADER, CLIENT_HEADER_VALUE, CONFIRM_HEADER,
  ENTRY, LS_KEYS, PORT_CANDIDATES, PROTOCOL_HEADER, RETRY, TIMEOUT,
} from './constants.js';
import { STATUS_FALLBACK, canonicalCode } from './errors.js';
import { readNdjsonStream } from './ndjson.js';
import * as store from './store.js';

/** Lỗi chuẩn hoá của transport. `message` là KỸ THUẬT — chỉ hiện ở panel dev (§3.9). */
export class AgentError extends Error {
  constructor({ code, message, hint, docs, details, status, method, url, cause }) {
    super(message ?? code ?? 'AGENT_ERROR');
    this.name = 'AgentError';
    this.code = canonicalCode(code) ?? 'AGENT_INTERNAL';
    this.hint = hint ?? null;
    this.docs = docs ?? null;
    this.details = details ?? null;
    this.status = status ?? 0;
    this.method = method ?? 'GET';
    this.url = url ?? '';
    if (cause) this.cause = cause;
  }
}

/** Trạng thái transport trong RAM (không persist ngoài kitgen.agent.v1). */
const state = {
  baseUrl: null,
  mode: AGENT_MODE.remote,
  protocol: null,
  health: null,
  entry: ENTRY.unknown,
  /** deps tiêm được để test không cần trình duyệt. */
  fetchImpl: null,
  location: null,
};

/** Tiêm phụ thuộc (test hoặc môi trường không có window). */
export function configure({ fetchImpl, location, baseUrl, mode, entry } = {}) {
  if (fetchImpl !== undefined) state.fetchImpl = fetchImpl;
  if (location !== undefined) state.location = location;
  if (baseUrl !== undefined) state.baseUrl = baseUrl;
  if (mode !== undefined) state.mode = mode;
  if (entry !== undefined) state.entry = entry;
}

function theFetch() {
  const f = state.fetchImpl ?? (typeof fetch === 'function' ? fetch : null);
  if (!f) throw new AgentError({ code: 'AGENT_INTERNAL', message: 'fetch không khả dụng' });
  return f;
}

function theLocation() {
  return state.location ?? (typeof location !== 'undefined' ? location : null);
}

/** Origin của bản mirror nếu trang đang được agent phục vụ tại /app/ (§6.2 #6). */
export function mirrorOrigin() {
  const loc = theLocation();
  if (!loc) return null;
  const path = loc.pathname ?? '';
  const isHttp = loc.protocol === 'http:' || loc.protocol === 'https:';
  if (isHttp && path.startsWith('/app/')) return loc.origin;
  return null;
}

/** baseUrl đang dùng. Ưu tiên: same-origin mirror → giá trị đã dò → kitgen.agent.v1 → mặc định. */
export function baseUrl() {
  if (state.baseUrl) return state.baseUrl;
  const mirror = mirrorOrigin();
  if (mirror) {
    state.baseUrl = mirror;
    state.mode = AGENT_MODE.mirror;
    state.entry = ENTRY.mirror;
    return mirror;
  }
  const saved = store.get(LS_KEYS.agent);
  if (saved.baseUrl && store.isAllowedBaseUrl(saved.baseUrl, saved.portCandidates)) {
    state.baseUrl = saved.baseUrl;
    state.mode = saved.mode ?? AGENT_MODE.remote;
    return saved.baseUrl;
  }
  return `http://127.0.0.1:${PORT_CANDIDATES[0]}`;
}

export function currentMode() { return state.mode; }
export function currentProtocol() { return state.protocol; }
export function lastHealth() { return state.health; }

function joinUrl(base, path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${base.replace(/\/+$/, '')}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Header bắt buộc cho MỌI request (§6.1). Không bao giờ thêm Authorization/Cookie. */
function buildHeaders(extra = {}) {
  const h = {
    [CLIENT_HEADER]: CLIENT_HEADER_VALUE,
    'Content-Type': 'application/json',   // GET vẫn gửi để ép preflight (§6.1)
  };
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined || v === null) continue;
    if (/^(authorization|cookie|set-cookie)$/i.test(k)) continue;   // chốt cứng YC#7
    h[k] = String(v);
  }
  return h;
}

/**
 * Signal cho một request: hết hạn `ms` HOẶC bên gọi tự huỷ.
 * `ms = 0` (stream) = không đặt hạn, chỉ dùng signal của bên gọi.
 *
 * Lượt tích hợp sửa 2 lỗ: (a) khi có `external` mà trình duyệt thiếu `AbortSignal.any`,
 * bản trước trả về `external` và ĐÁNH RƠI hạn thời gian ⇒ request có thể chờ vô hạn;
 * (b) thiếu `AbortSignal.timeout` thì cũng không có hạn nào cả. Nay luôn có đường lùi
 * bằng `AbortController` + `setTimeout` — mọi request đều CHẮC CHẮN kết thúc.
 */
function timeoutSignal(ms, external) {
  if (!ms) return external ?? undefined;
  const hasTimeout = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
  if (hasTimeout && !external) return AbortSignal.timeout(ms);
  if (hasTimeout && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([AbortSignal.timeout(ms), external]);
  }
  if (typeof AbortController === 'undefined') return external ?? undefined;
  // đường lùi: tự ghép hạn thời gian với signal của bên gọi
  const ac = new AbortController();
  const fire = (reason) => { if (!ac.signal.aborted) ac.abort(reason); };
  const timer = setTimeout(() => fire(new DOMExceptionLike('TimeoutError')), ms);
  const done = () => clearTimeout(timer);
  ac.signal.addEventListener?.('abort', done, { once: true });
  if (external) {
    if (external.aborted) fire(external.reason);
    else external.addEventListener?.('abort', () => fire(external.reason), { once: true });
  }
  return ac.signal;
}

/** Lỗi mang `name` đúng để `networkError()` phân loại được là hết hạn, không phải lỗi lạ. */
function DOMExceptionLike(name) {
  const e = new Error(name);
  e.name = name;
  return e;
}

/** Phân loại lỗi mạng: fetch bị chặn/agent chưa chạy đều ném TypeError (arch §5.3). */
function networkError(e, method, url) {
  const aborted = e?.name === 'AbortError' || e?.name === 'TimeoutError';
  return new AgentError({
    code: aborted ? 'AGENT_NOT_RUNNING' : 'AGENT_NOT_RUNNING',
    message: aborted
      ? `Hết thời gian chờ khi gọi ${method} ${url}`
      : `Không gọi được ${method} ${url}: ${e?.name ?? 'Error'}: ${e?.message ?? String(e)}`,
    status: 0, method, url, cause: e,
    details: { transport: aborted ? 'timeout' : 'fetch-failed' },
  });
}

/** Đọc + so protocol; lệch → AGENT_PROTOCOL_OLD/NEW (§6.1, arch §3.5). */
function checkProtocol(res) {
  const raw = res.headers?.get?.(PROTOCOL_HEADER);
  if (raw === null || raw === undefined || raw === '') return null;
  const p = Number(raw);
  if (!Number.isFinite(p)) return null;
  state.protocol = p;
  return p;
}

export function protocolMismatch(p) {
  if (!Number.isFinite(p)) return null;
  if (p < APP_PROTOCOL) return 'AGENT_PROTOCOL_OLD';
  if (p > APP_PROTOCOL) return 'AGENT_PROTOCOL_NEW';
  return null;
}

async function parseError(res, method, url) {
  let body = null;
  try { body = await res.json(); } catch { /* không phải JSON */ }
  const env = body?.error;
  const code = env?.code ?? STATUS_FALLBACK[res.status] ?? 'AGENT_INTERNAL';
  return new AgentError({
    code,
    message: env?.message ?? `HTTP ${res.status} ${res.statusText ?? ''}`.trim(),
    hint: env?.hint, docs: env?.docs, details: env?.details,
    status: res.status, method, url,
  });
}

/**
 * Lõi request. `kind` quyết định timeout & retry theo §6.1 — không nơi nào được tự đặt khác.
 * @param {'health'|'get'|'write'|'upload'} kind
 */
async function request(path, { method = 'GET', kind = 'get', body, headers, signal, raw = false } = {}) {
  const attempts = (RETRY[kind] ?? 0) + 1;
  const ms = TIMEOUT[kind] ?? TIMEOUT.get;
  let lastErr;

  for (let i = 0; i < attempts; i += 1) {
    const url = joinUrl(baseUrl(), path);
    const init = {
      method,
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',            // §6.1: không cookie, không phiên
      redirect: 'follow',
      referrerPolicy: 'no-referrer',
      headers: buildHeaders(headers),
      signal: timeoutSignal(ms, signal),
    };
    if (body !== undefined && body !== null) {
      if (typeof FormData !== 'undefined' && body instanceof FormData) {
        delete init.headers['Content-Type'];   // browser tự đặt boundary
        init.body = body;
      } else {
        init.body = typeof body === 'string' ? body : JSON.stringify(body);
      }
    }

    let res;
    try { res = await theFetch()(url, init); }
    catch (e) {
      lastErr = networkError(e, method, url);
      if (i < attempts - 1) continue;
      throw lastErr;
    }

    const p = checkProtocol(res);
    const mism = protocolMismatch(p);
    if (mism !== null) {
      throw new AgentError({
        code: mism, status: res.status, method, url,
        message: `Protocol agent=${p} app=${APP_PROTOCOL}`,
        details: { agentProtocol: p, appProtocol: APP_PROTOCOL },
      });
    }

    if (res.status === 304) return { notModified: true, etag: res.headers?.get?.('ETag') ?? null };

    if (!res.ok) {
      const err = await parseError(res, method, url);
      // §3.9 RATE_LIMITED: tự retry sau 2s — CHỈ cho request đọc (không nhân bản thao tác ghi).
      const canRetry = i < attempts - 1
        || (res.status === 429 && (kind === 'get' || kind === 'health'));
      if (res.status === 429 && canRetry) {
        await sleep(RETRY.rateLimitDelayMs);
        if (i >= attempts - 1) { lastErr = err; continue; }
      }
      if (i < attempts - 1 && res.status >= 500) { lastErr = err; continue; }
      throw err;
    }

    if (raw) return res;
    if (res.status === 204) return { ok: true, etag: res.headers?.get?.('ETag') ?? null };
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    const etag = res.headers?.get?.('ETag') ?? null;
    if (data !== null && typeof data === 'object' && !Array.isArray(data) && etag !== null) {
      Object.defineProperty(data, '__etag', { value: etag, enumerable: false });
    }
    return data ?? { ok: true };
  }
  throw lastErr ?? new AgentError({ code: 'AGENT_INTERNAL', message: 'Không có phản hồi' });
}

function sleep(ms) { return new Promise((r) => { setTimeout(r, ms); }); }

/** GET đọc: 8s, retry 1 lần (§6.1). */
export function get(path, opts = {}) { return request(path, { ...opts, method: 'GET', kind: 'get' }); }
/** POST/PUT/PATCH/DELETE: KHÔNG retry tự động (tránh tạo/sửa nhân đôi). */
export function post(path, body, opts = {}) { return request(path, { ...opts, method: 'POST', kind: 'write', body }); }
export function put(path, body, opts = {}) { return request(path, { ...opts, method: 'PUT', kind: 'write', body }); }
export function patch(path, body, opts = {}) { return request(path, { ...opts, method: 'PATCH', kind: 'write', body }); }
export function del(path, opts = {}) { return request(path, { ...opts, method: 'DELETE', kind: 'write' }); }
/** Upload multipart: 60s, không retry. */
export function upload(path, formData, opts = {}) {
  return request(path, { ...opts, method: 'POST', kind: 'upload', body: formData });
}
export { request as _request };

/**
 * /health — 1200ms, KHÔNG retry (§6.1). Trả về {ok, health, protocolIssue} hoặc ném AgentError.
 * Là endpoint DUY NHẤT được gọi định kỳ (§6.2 ràng buộc thiết kế).
 */
export async function health({ base, signal } = {}) {
  const prev = state.baseUrl;
  if (base) state.baseUrl = base;
  try {
    const data = await request('/health', { kind: 'health', signal });
    state.health = data;
    const issue = protocolMismatch(data?.protocol ?? state.protocol);
    return { ok: data?.ok === true, health: data, protocolIssue: issue };
  } finally {
    if (base && prev !== null) state.baseUrl = prev;
    else if (base && prev === null) state.baseUrl = base;
  }
}

/**
 * Dò cổng 8765 → 8766 → 8767 song song, lấy cái nào trả lời trước (arch §5.3).
 * KHÔNG dò 8125 (server v1 khác giao thức — chốt X2).
 * @returns {Promise<{baseUrl, health, protocolIssue}|null>} null nếu không cổng nào trả lời
 */
export async function discover({ ports = PORT_CANDIDATES, signal } = {}) {
  const mirror = mirrorOrigin();
  const candidates = mirror ? [mirror] : ports.map((p) => `http://127.0.0.1:${p}`);
  const attempts = candidates.map(async (base) => {
    const r = await health({ base, signal });
    if (!r.ok && r.protocolIssue === null) throw new AgentError({ code: 'AGENT_NOT_RUNNING', message: `health không ok tại ${base}` });
    return { baseUrl: base, ...r };
  });
  let winner = null;
  const errors = [];
  const results = await Promise.allSettled(attempts);
  for (const r of results) {
    if (r.status === 'fulfilled' && winner === null) winner = r.value;
    else if (r.status === 'rejected') errors.push(r.reason);
  }
  // Không cổng nào trả lời: KHÔNG được ném hết bằng chứng đi. 403/421/503/protocol-lệch
  // chứng minh agent ĐANG SỐNG mà từ chối ta — detect.js cần biết để chọn đúng pill (§2.4).
  if (winner === null) {
    const informative = pickInformative(errors);
    if (informative !== null) throw informative;
    return null;
  }
  state.baseUrl = winner.baseUrl;
  state.mode = mirror ? AGENT_MODE.mirror : AGENT_MODE.remote;
  state.entry = mirror ? ENTRY.mirror : state.entry;
  state.health = winner.health;
  persistAgent(winner);
  return winner;
}

/** Xếp hạng lỗi theo mức "nói được nhiều nhất" về nguyên nhân thật. */
const ERROR_RANK = Object.freeze({
  AGENT_PROTOCOL_OLD: 5, AGENT_PROTOCOL_NEW: 5,
  BAD_HOST: 4, ORIGIN_NOT_ALLOWED: 4,
  AGENT_STARTING: 3, RATE_LIMITED: 2, AGENT_INTERNAL: 2,
});
function pickInformative(errors) {
  let best = null;
  let bestRank = 0;
  for (const e of errors) {
    const rank = ERROR_RANK[e?.code] ?? (e?.status > 0 ? 1 : 0);
    if (rank > bestRank) { best = e; bestRank = rank; }
  }
  return bestRank > 0 ? best : null;
}

/** Lưu baseUrl + nhãn instance vào kitgen.agent.v1 (đi qua allowlist + dò secret của store). */
function persistAgent(winner) {
  try {
    const ports = mirrorOrigin()
      ? [...new Set([...PORT_CANDIDATES, Number(new URL(winner.baseUrl).port || 80)])]
      : [...PORT_CANDIDATES];
    store.patch(LS_KEYS.agent, {
      baseUrl: winner.baseUrl,
      portCandidates: ports,
      mode: state.mode,
      instanceLabel: typeof winner.health?.instanceLabel === 'string' ? winner.health.instanceLabel : '',
      lastOkAt: new Date().toISOString(),
    });
    const h = winner.health ?? {};
    if (typeof h.workspaceLabel === 'string') {
      store.patch(LS_KEYS.workspace, {
        label: h.workspaceLabel,
        fingerprint: typeof h.workspaceFingerprint === 'string' ? h.workspaceFingerprint : '',
        workspaceId: typeof h.workspaceId === 'string' ? h.workspaceId : '',
        knownAt: new Date().toISOString(),
      });
    }
  } catch { /* store chặn (secret/allowlist) thì thôi, không được phá kết nối */ }
}

/**
 * Mở stream NDJSON của một run (#35). KHÔNG timeout (§6.1).
 * @returns {Promise<{lastSeq, count, badLines, stalled, cursorGone?:boolean}>}
 */
export async function streamRun(runId, { from = 0, onEvent, onBadLine, onStall, signal } = {}) {
  const qs = from > 0 ? `?from=${encodeURIComponent(from)}` : '';
  const url = `/api/runs/${encodeURIComponent(runId)}/stream${qs}`;
  let res;
  try {
    res = await request(url, {
      method: 'GET', kind: 'stream', raw: true, signal,
      headers: { Accept: 'application/x-ndjson' },
    });
  } catch (e) {
    if (e instanceof AgentError && e.status === 416) {
      return { lastSeq: from > 0 ? from - 1 : 0, count: 0, badLines: 0, stalled: false, cursorGone: true };
    }
    throw e;
  }
  if (!res.body) {
    // Môi trường không có ReadableStream → đọc một lần rồi parse (vẫn đúng định dạng).
    const text = await res.text();
    const { NdjsonParser } = await import('./ndjson.js');
    const parser = new NdjsonParser({ onEvent, onBadLine });
    parser.push(text); parser.flush();
    return { lastSeq: parser.lastSeq, count: parser.count, badLines: parser.badLines, stalled: false };
  }
  return readNdjsonStream(res.body, { onEvent, onBadLine, onStall, signal });
}

/** Header mã xác nhận 4 số cho purge (arch §3.4 lớp 8) — KHÔNG BAO GIỜ persist mã này. */
export function confirmHeader(code) {
  const c = String(code ?? '').trim();
  if (!/^\d{4}$/.test(c)) {
    throw new AgentError({ code: 'CONFIRM_INVALID', message: 'Mã xác nhận phải là 4 chữ số' });
  }
  return { [CONFIRM_HEADER]: c };
}

/** URL ảnh cho thẻ <img> — lưới LUÔN dùng w=256 (§6.5-5). Không đi qua fetch nên không có header. */
export function fileUrl(projectId, relPath, { w } = {}) {
  const base = baseUrl().replace(/\/+$/, '');
  const safe = String(relPath).split('/').map(encodeURIComponent).join('/');
  const qs = w ? `?w=${encodeURIComponent(w)}` : '';
  return `${base}/api/projects/${encodeURIComponent(projectId)}/files/${safe}${qs}`;
}
