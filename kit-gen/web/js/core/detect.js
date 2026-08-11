/**
 * web/js/core/detect.js — phát hiện đường vào + sức khoẻ agent + phân biệt
 * "agent chưa chạy" vs "trình duyệt đang chặn" (architecture §5.3, UX-SPEC §2.4/§3.9).
 *
 * Sự thật phũ phàng (arch §5.3): khi bị chặn, fetch chỉ ném `TypeError: Failed to fetch`
 * — KHÔNG có cách nào phân biệt 100% từ JS. Nên dùng ĐỒNG THỜI 3 cách:
 *   1. fetch fail signature  → nghi vấn, chưa kết luận
 *   2. cầu dò popup + postMessage tới /bridge.html (điều hướng TOP-LEVEL, không bị
 *      mixed-content chặn kể cả Safari) → nhận message = agent SỐNG + trình duyệt CHẶN
 *   3. điều hướng top-level sang bản mirror /app/ → đường thoát cuối, luôn chạy được
 * Kết quả xuất ra 6 trạng thái agent pill (§2.4).
 */

import {
  AGENT_MODE, ENTRY, PILL, PORT_CANDIDATES, PROBE_ACTIVE_RUN_MS, PROBE_BACKOFF_MS, TIMEOUT,
} from './constants.js';
import * as agent from './agent.js';

const deps = { location: null, windowRef: null };
export function configure({ location, windowRef } = {}) {
  if (location !== undefined) deps.location = location;
  if (windowRef !== undefined) deps.windowRef = windowRef;
}
const loc = () => deps.location ?? (typeof location !== 'undefined' ? location : null);
const win = () => deps.windowRef ?? (typeof window !== 'undefined' ? window : null);

/**
 * Đường vào hiện tại (§2.1, §6.2 #6):
 *  - 'mirror': agent tự phục vụ bundle tại http://127.0.0.1:<port>/app/ → same-origin,
 *              MIỄN NHIỄM mixed-content
 *  - 'pages' : web tĩnh HTTPS (Cloudflare Pages) → phải fetch chéo tới loopback
 */
export function detectEntry() {
  const l = loc();
  if (!l) return { entry: ENTRY.unknown, sameOrigin: false, origin: null, mirrorBase: null };
  const isLoopback = /^(127\.0\.0\.1|localhost|\[?::1\]?)$/.test(l.hostname ?? '');
  const inApp = (l.pathname ?? '').startsWith('/app/');
  if (isLoopback && inApp) {
    return { entry: ENTRY.mirror, sameOrigin: true, origin: l.origin, mirrorBase: l.origin };
  }
  if (l.protocol === 'https:' || l.protocol === 'http:') {
    return {
      entry: isLoopback ? ENTRY.unknown : ENTRY.pages,
      sameOrigin: false,
      origin: l.origin,
      mirrorBase: null,
      httpsPage: l.protocol === 'https:',
    };
  }
  return { entry: ENTRY.unknown, sameOrigin: false, origin: l.origin ?? null, mirrorBase: null };
}

/** URL bản mirror để mở bằng điều hướng top-level (cách 3). */
export function mirrorUrl(port = PORT_CANDIDATES[0], hash = '') {
  return `http://127.0.0.1:${port}/app/${hash}`;
}

/** URL cầu dò (cách 2) — agent phục vụ /bridge.html, same-origin với agent (§6.2 #5). */
export function bridgeUrl(port = PORT_CANDIDATES[0], pagesOrigin) {
  const o = pagesOrigin ?? loc()?.origin ?? '';
  return `http://127.0.0.1:${port}/bridge.html?o=${encodeURIComponent(o)}`;
}

/**
 * Cách 2 — CẦU DÒ POPUP, đáng tin nhất. Mở top-level nên không bị chặn subresource.
 * Chỉ được gọi từ CỬ CHỈ NGƯỜI DÙNG (nút "Tôi đã chạy script nhưng vẫn không kết nối được"),
 * vì popup không do user bấm sẽ bị chặn.
 * @returns {Promise<{alive:boolean, blockedPopup?:boolean, info?:object}>}
 */
export function bridgeProbe({ ports = PORT_CANDIDATES, timeoutMs = TIMEOUT.bridge } = {}) {
  const w = win();
  if (!w || typeof w.open !== 'function') return Promise.resolve({ alive: false, blockedPopup: false });
  const expectOrigins = ports.map((p) => `http://127.0.0.1:${p}`);
  const popup = w.open(bridgeUrl(ports[0]), 'kitgen-bridge', 'width=460,height=320');
  if (!popup) return Promise.resolve({ alive: false, blockedPopup: true });

  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      w.removeEventListener('message', onMessage);
      clearTimeout(timer);
      try { popup.close(); } catch { /* popup có thể đã tự đóng */ }
      resolve(result);
    };
    const onMessage = (ev) => {
      if (!expectOrigins.includes(ev.origin)) return;      // chỉ tin message từ loopback
      const d = ev.data;
      if (d && typeof d === 'object' && d.ok === true) {
        finish({
          alive: true,
          info: {
            protocol: typeof d.protocol === 'number' ? d.protocol : null,
            version: typeof d.version === 'string' ? d.version : null,
            workspaceLabel: typeof d.workspaceLabel === 'string' ? d.workspaceLabel : null,
            origin: ev.origin,
          },
        });
      }
    };
    w.addEventListener('message', onMessage);
    const timer = setTimeout(() => finish({ alive: false }), timeoutMs);
  });
}

/**
 * Chẩn đoán đầy đủ: dò cổng bằng fetch (cách 1) rồi kết luận.
 * KHÔNG tự mở popup (cách 2 cần cử chỉ user) — trả về `needsBridgeProbe` để UI mời user bấm.
 * @returns {Promise<AgentStatus>}
 */
export async function probe({ ports = PORT_CANDIDATES, signal, bridgeResult = null } = {}) {
  const entryInfo = detectEntry();
  let found = null;
  let lastErr = null;
  try {
    found = await agent.discover({ ports, signal });
  } catch (e) { lastErr = e; }

  if (found) {
    const mism = found.protocolIssue;
    if (mism !== null) {
      return status({
        pill: PILL.protocolMismatch, code: mism, entryInfo,
        health: found.health, baseUrl: found.baseUrl, readOnly: true,
      });
    }
    const h = found.health ?? {};
    // §2.4 hàng 6: doctor báo không tạo được ảnh → pill vàng riêng, KHÔNG phải mất kết nối.
    if (h.imageGen && h.imageGen.available === false) {
      return status({
        pill: PILL.imagegenUnavailable, code: 'IMAGEGEN_UNAVAILABLE', entryInfo,
        health: h, baseUrl: found.baseUrl, readOnly: false,
      });
    }
    return status({
      pill: PILL.connected, code: null, entryInfo,
      health: h, baseUrl: found.baseUrl, readOnly: false,
    });
  }

  // Không cổng nào trả lời. Cách 1 không đủ kết luận → dùng kết quả cầu dò nếu có.
  if (bridgeResult?.alive === true) {
    return status({
      pill: PILL.blocked, code: 'AGENT_BLOCKED_BY_BROWSER', entryInfo,
      health: null, baseUrl: null, readOnly: true,
      bridge: bridgeResult, needsBridgeProbe: false,
    });
  }

  // Protocol lệch: agent SỐNG, chỉ là không cùng phiên bản giao thức (§3.5).
  if (lastErr && (lastErr.code === 'AGENT_PROTOCOL_OLD' || lastErr.code === 'AGENT_PROTOCOL_NEW')) {
    return status({
      pill: PILL.protocolMismatch, code: lastErr.code, entryInfo,
      health: lastErr.details ?? null, baseUrl: null, readOnly: true, needsBridgeProbe: false,
    });
  }

  // 403/421 là bằng chứng agent SỐNG nhưng từ chối origin này (§3.9 ORIGIN_NOT_ALLOWED/BAD_HOST).
  if (lastErr && (lastErr.status === 403 || lastErr.status === 421)) {
    return status({
      pill: PILL.blocked, code: lastErr.status === 421 ? 'BAD_HOST' : 'ORIGIN_NOT_ALLOWED',
      entryInfo, health: null, baseUrl: null, readOnly: true, needsBridgeProbe: false,
    });
  }
  if (lastErr && lastErr.status === 503) {
    return status({
      pill: PILL.checking, code: 'AGENT_STARTING', entryInfo,
      health: null, baseUrl: null, readOnly: true, needsBridgeProbe: false,
    });
  }

  // Vẫn mơ hồ. Nếu trang là HTTPS-Pages thì khả năng bị chặn là thật → mời user chạy cầu dò.
  const ambiguous = entryInfo.entry === ENTRY.pages;
  return status({
    pill: PILL.notRunning, code: 'AGENT_NOT_RUNNING', entryInfo,
    health: null, baseUrl: null, readOnly: true,
    needsBridgeProbe: ambiguous && bridgeResult === null,
    ambiguous,
  });
}

/** Trạng thái "đang kiểm tra" để UI vẽ ngay lúc mở app (§2.4 hàng 2). */
export function checkingStatus() {
  return status({
    pill: PILL.checking, code: null, entryInfo: detectEntry(),
    health: null, baseUrl: null, readOnly: true,
  });
}

function status(o) {
  const entryInfo = o.entryInfo ?? detectEntry();
  return Object.freeze({
    pill: o.pill,
    code: o.code ?? null,
    /** §2.5: app vào chế độ chỉ-đọc + xám, KHÔNG ẩn nút, vẽ từ cache. */
    readOnly: o.readOnly === true,
    connected: o.pill === PILL.connected || o.pill === PILL.imagegenUnavailable,
    entry: entryInfo.entry,
    sameOrigin: entryInfo.sameOrigin === true,
    mode: entryInfo.entry === ENTRY.mirror ? AGENT_MODE.mirror : AGENT_MODE.remote,
    baseUrl: o.baseUrl ?? null,
    health: o.health ?? null,
    workspaceLabel: o.health?.workspaceLabel ?? o.bridge?.info?.workspaceLabel ?? null,
    agentVersion: o.health?.version ?? o.bridge?.info?.version ?? null,
    instanceLabel: o.health?.instanceLabel ?? null,
    updateCommand: o.health?.updateCommand ?? null,
    /** true ⇒ UI nên mời user bấm nút chạy cầu dò popup (cách 2) để phân biệt dứt khoát. */
    needsBridgeProbe: o.needsBridgeProbe === true,
    ambiguous: o.ambiguous === true,
    /** Đường thoát cuối (cách 3): điều hướng top-level sang bản mirror. */
    mirrorUrl: mirrorUrl(PORT_CANDIDATES[0]),
    checkedAt: new Date().toISOString(),
  });
}

/** Nhãn pill — LUÔN có chữ, không bao giờ chỉ có màu (§2.4, audit I1). */
export const PILL_LABEL = Object.freeze({
  [PILL.connected]: { icon: '●', text: 'Đã kết nối', tone: 'ok' },
  [PILL.checking]: { icon: '◐', text: 'Đang kiểm tra…', tone: 'muted' },
  [PILL.notRunning]: { icon: '○', text: 'Chưa thấy công cụ local', tone: 'muted' },
  [PILL.blocked]: { icon: '▲', text: 'Trình duyệt đang chặn', tone: 'warn' },
  [PILL.protocolMismatch]: { icon: '▲', text: 'Công cụ local cũ', tone: 'warn' },
  [PILL.imagegenUnavailable]: { icon: '⚠', text: 'Chưa tạo được ảnh', tone: 'warn' },
});

/** Nhãn pill đã tính hậu tố mirror: workspace pill thêm "(bản tại máy)" (§2.4). */
export function pillView(st) {
  const base = PILL_LABEL[st.pill] ?? PILL_LABEL[PILL.notRunning];
  const label = st.pill === PILL.protocolMismatch && st.code === 'AGENT_PROTOCOL_NEW'
    ? { ...base, text: 'Giao diện là bản cache cũ' }
    : base;
  return Object.freeze({
    ...label,
    clickable: st.pill !== PILL.checking,
    workspaceSuffix: st.mode === AGENT_MODE.mirror ? '(bản tại máy)' : '',
  });
}

/**
 * Bộ đếm nhịp probe: backoff 1.5→3→6→15s; có run đang chạy thì cố định 1.5s;
 * tab ẩn thì dừng (arch §5.3).
 */
export function createProbeSchedule() {
  let step = 0;
  return {
    reset() { step = 0; },
    next({ hasActiveRun = false, connected = false } = {}) {
      if (hasActiveRun) return PROBE_ACTIVE_RUN_MS;
      if (connected) { step = 0; return PROBE_BACKOFF_MS[0]; }
      const ms = PROBE_BACKOFF_MS[Math.min(step, PROBE_BACKOFF_MS.length - 1)];
      step += 1;
      return ms;
    },
  };
}
