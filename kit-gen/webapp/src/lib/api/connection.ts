/**
 * webapp/src/lib/api/connection.ts — CHẨN ĐOÁN KẾT NỐI: phân biệt cho đúng 3 ca.
 *
 * ĐÂY LÀ FILE ĐƯỢC VIẾT ĐỂ KHÔNG LẶP LỖI `teams/qa-ux/browser-evidence.md`:
 *
 *   TRUNG BÌNH-01 — "Thông điệp lỗi đổ tội cho trình duyệt, che mất nguyên nhân thật".
 *   Bản cũ hiện banner *"Trình duyệt đang chặn kết nối"* trong khi thực tế agent trả
 *   **HTTP 403 `ORIGIN_NOT_ALLOWED`**. User bị đẩy đi tắt ad-blocker, đổi trình duyệt,
 *   tìm cờ Chrome — trong khi lỗi nằm ở agent. Bằng chứng: reqid=59, `sec-fetch-site:
 *   same-origin`, response 403 + `hint: run-with-allow-cli`.
 *
 * Nguyên tắc phân xử ở đây, theo đúng thứ tự:
 *
 *   Ca 1 — AGENT_HTTP_ERROR: **có response** (status ≥ 400).
 *           ⇒ Đã tới được agent. Thủ phạm là AGENT, không phải trình duyệt.
 *           Copy nói đúng chủ thể: "Công cụ local từ chối trang này".
 *           Đây là ca 403 ORIGIN_NOT_ALLOWED / 421 BAD_HOST / 503 STARTING.
 *
 *   Ca 2 — AGENT_NOT_RUNNING: fetch reject, **và** trang same-origin với agent
 *           (mirror `/app/` hoặc dev proxy). Trang này do chính agent phục vụ ⇒
 *           trình duyệt không có lý do gì chặn ⇒ kết luận dứt khoát: agent đã tắt.
 *
 *   Ca 3 — BLOCKED_BY_BROWSER (chỉ khi ở đường vào `pages`): fetch reject trên trang
 *           HTTPS gọi chéo vào loopback. Ở đây **hai giả thuyết đều sống**, và JS
 *           không phân biệt được (arch §5.3: fetch chỉ ném `TypeError`).
 *           ⇒ KHÔNG kết luận ngay. Trạng thái trung gian `ambiguous` + mời user bấm
 *           cầu dò popup. Chỉ khi cầu dò trả về "agent sống" thì mới được nói
 *           "trình duyệt đang chặn". Nếu cầu dò im lặng ⇒ nói "chưa thấy công cụ local".
 */
import {
  AgentError, detectEntry, discoverAgent, type EntryInfo, type LocationLike,
} from "./client";
import { ENTRY, PORT_CANDIDATES, TIMEOUT, type Entry } from "./constants";
import { healthSchema, type Health } from "../types/api";

/** 6 trạng thái agent pill §2.4 — khớp `AgentStatus` của lib/status.ts (P1). */
export type AgentPill =
  | "connected"
  | "checking"
  | "not-found"
  | "blocked-by-browser"
  | "outdated"
  | "imagegen-unavailable";

/** Ba ca lỗi kết nối — mục 2 của brief. `none` = kết nối được. */
export type ConnectionCase =
  | "none"
  /** Ca 1: agent trả lỗi HTTP (403 ORIGIN_NOT_ALLOWED, 421 BAD_HOST, 503 STARTING…) */
  | "agent-http-error"
  /** Ca 2: agent chưa chạy — kết luận CHẮC vì same-origin */
  | "agent-not-running"
  /** Ca 3a: chưa kết luận được (pages + fetch fail), cần cầu dò */
  | "unreachable-ambiguous"
  /** Ca 3b: cầu dò xác nhận agent sống ⇒ trình duyệt đang chặn */
  | "blocked-by-browser"
  /** protocol lệch — agent sống, chỉ khác phiên bản */
  | "protocol-mismatch";

export interface BridgeResult {
  alive: boolean;
  blockedPopup?: boolean;
  info?: { protocol?: number | null; version?: string | null; workspaceLabel?: string | null; origin?: string };
}

export interface ConnectionStatus {
  pill: AgentPill;
  /** mã để tra bảng §3.9. `null` khi kết nối tốt. */
  code: string | null;
  case: ConnectionCase;
  /** §2.5: app vào chế độ chỉ-đọc + xám, KHÔNG ẩn nút, vẽ từ cache. */
  readOnly: boolean;
  connected: boolean;
  entry: Entry;
  sameOrigin: boolean;
  base: string | null;
  health: Health | null;
  workspaceLabel: string | null;
  agentVersion: string | null;
  instanceLabel: string | null;
  updateCommand: string | null;
  /** true ⇒ UI phải mời user bấm nút chạy cầu dò popup TRƯỚC khi kết luận (ca 3). */
  needsBridgeProbe: boolean;
  /** true ⇒ chưa biết thủ phạm; copy KHÔNG được khẳng định bên nào. */
  ambiguous: boolean;
  /** status HTTP nếu là ca 1 — dùng cho panel dev, không hiện ra thân UI. */
  httpStatus: number | null;
  mirrorUrl: string;
  checkedAt: string;
}

function baseStatus(o: Partial<ConnectionStatus> & { pill: AgentPill; entryInfo: EntryInfo }): ConnectionStatus {
  const { entryInfo } = o;
  return {
    pill: o.pill,
    code: o.code ?? null,
    case: o.case ?? "none",
    readOnly: o.readOnly === true,
    connected: o.pill === "connected" || o.pill === "imagegen-unavailable",
    entry: entryInfo.entry,
    sameOrigin: entryInfo.sameOrigin,
    base: o.base ?? null,
    health: o.health ?? null,
    workspaceLabel: o.workspaceLabel ?? o.health?.workspaceLabel ?? null,
    /* `runtimeVersion` TRƯỚC: đó là version bản phát hành người dùng đối chiếu được.
       `version` chỉ là đời bộ khung agent (hằng "1.2.0") — giữ làm fallback cho agent
       đời cũ chưa trả field mới, chứ không phải số để khoe ra ở Cài đặt. */
    agentVersion: o.agentVersion ?? o.health?.runtimeVersion ?? o.health?.version ?? null,
    instanceLabel: o.health?.instanceLabel ?? null,
    updateCommand: o.health?.updateCommand ?? null,
    needsBridgeProbe: o.needsBridgeProbe === true,
    ambiguous: o.ambiguous === true,
    httpStatus: o.httpStatus ?? null,
    mirrorUrl: `http://127.0.0.1:${PORT_CANDIDATES[0]}/app/`,
    checkedAt: new Date().toISOString(),
  };
}

/** Trạng thái vẽ ngay lúc mở app (§2.4 hàng 2) — pill không bấm được. */
export function checkingStatus(loc?: LocationLike | null): ConnectionStatus {
  return baseStatus({ pill: "checking", entryInfo: detectEntry(loc), readOnly: true, case: "none" });
}

/**
 * Xếp hạng lỗi theo mức "nói được nhiều nhất về nguyên nhân thật".
 * Protocol lệch > agent từ chối origin/host > agent đang khởi động > lỗi mạng mơ hồ.
 */
const ERROR_RANK: Record<string, number> = {
  AGENT_PROTOCOL_OLD: 6,
  AGENT_PROTOCOL_NEW: 6,
  ORIGIN_NOT_ALLOWED: 5,
  BAD_HOST: 5,
  AGENT_STARTING: 4,
  RATE_LIMITED: 3,
  AGENT_INTERNAL: 3,
};

function pickMostInformative(errors: readonly AgentError[]): AgentError | null {
  let best: AgentError | null = null;
  let bestRank = 0;
  for (const e of errors) {
    // Bất kỳ lỗi ĐÃ NHẬN RESPONSE luôn thắng lỗi không có response: nó là bằng chứng
    // agent sống. Đây là mấu chốt để không lặp TRUNG BÌNH-01.
    const rank = (ERROR_RANK[e.code] ?? 0) + (e.reachedAgent ? 2 : 0) + (e.status > 0 ? 1 : 0);
    if (rank > bestRank) {
      best = e;
      bestRank = rank;
    }
  }
  return bestRank > 0 ? best : null;
}

/**
 * Chẩn đoán đầy đủ. KHÔNG tự mở popup (cầu dò cần cử chỉ user) — trả `needsBridgeProbe`
 * để UI mời user bấm, rồi gọi lại `diagnose()` với `bridgeResult`.
 */
export async function diagnose(opts: {
  ports?: readonly number[];
  signal?: AbortSignal;
  location?: LocationLike | null;
  bridgeResult?: BridgeResult | null;
} = {}): Promise<ConnectionStatus> {
  const entryInfo = detectEntry(opts.location);
  const bridgeResult = opts.bridgeResult ?? null;
  const { found, errors } = await discoverAgent({
    ...(opts.ports ? { ports: opts.ports } : {}),
    ...(opts.signal ? { signal: opts.signal } : {}),
    ...(opts.location !== undefined ? { location: opts.location } : {}),
  });

  /* ── Kết nối được ─────────────────────────────────────────────────────── */
  if (found !== null) {
    const parsed = healthSchema.safeParse(found.health);
    const health = parsed.success ? parsed.data : null;
    if (found.protocolIssue !== null) {
      return baseStatus({
        pill: "outdated", code: found.protocolIssue, case: "protocol-mismatch",
        entryInfo, readOnly: true, base: found.base,
        ...(health ? { health } : {}),
      });
    }
    // §2.4 hàng 6: doctor báo không tạo được ảnh → pill vàng RIÊNG, KHÔNG phải mất kết nối.
    if (health?.imageGen?.available === false) {
      return baseStatus({
        pill: "imagegen-unavailable", code: "IMAGEGEN_UNAVAILABLE", case: "none",
        entryInfo, readOnly: false, base: found.base, health,
      });
    }
    return baseStatus({
      pill: "connected", code: null, case: "none",
      entryInfo, readOnly: false, base: found.base,
      ...(health ? { health } : {}),
    });
  }

  const worst = pickMostInformative(errors);

  /* ── Protocol lệch: agent SỐNG, chỉ khác phiên bản giao thức ───────────── */
  if (worst && (worst.code === "AGENT_PROTOCOL_OLD" || worst.code === "AGENT_PROTOCOL_NEW")) {
    return baseStatus({
      pill: "outdated", code: worst.code, case: "protocol-mismatch",
      entryInfo, readOnly: true, httpStatus: worst.status,
    });
  }

  /* ── CA 1: agent trả lỗi HTTP ──────────────────────────────────────────
     ĐÃ có response ⇒ đã tới được agent. Dùng đúng mã của agent (403
     ORIGIN_NOT_ALLOWED, 421 BAD_HOST, 503 STARTING) và pill "not-found"
     — TUYỆT ĐỐI không dùng "blocked-by-browser" cho ca này.               */
  if (worst?.reachedAgent) {
    if (worst.status === 503) {
      return baseStatus({
        pill: "checking", code: "AGENT_STARTING", case: "agent-http-error",
        entryInfo, readOnly: true, httpStatus: 503,
      });
    }
    return baseStatus({
      pill: "not-found",
      code: worst.code,
      case: "agent-http-error",
      entryInfo,
      readOnly: true,
      httpStatus: worst.status,
    });
  }

  /* ── CA 3b: cầu dò đã xác nhận agent sống ⇒ trình duyệt CHẶN thật ─────── */
  if (bridgeResult?.alive === true) {
    return baseStatus({
      pill: "blocked-by-browser", code: "AGENT_BLOCKED_BY_BROWSER", case: "blocked-by-browser",
      entryInfo, readOnly: true,
      workspaceLabel: bridgeResult.info?.workspaceLabel ?? null,
      agentVersion: bridgeResult.info?.version ?? null,
    });
  }

  /* ── CA 2: same-origin + fetch fail ⇒ agent chưa chạy (kết luận CHẮC) ─── */
  if (entryInfo.sameOrigin) {
    return baseStatus({
      pill: "not-found", code: "AGENT_NOT_RUNNING", case: "agent-not-running",
      entryInfo, readOnly: true,
    });
  }

  /* ── CA 3a: pages + fetch fail ⇒ CHƯA KẾT LUẬN. Mời user chạy cầu dò. ─── */
  if (entryInfo.entry === ENTRY.pages && bridgeResult === null) {
    return baseStatus({
      pill: "not-found", code: "AGENT_UNREACHABLE_AMBIGUOUS", case: "unreachable-ambiguous",
      entryInfo, readOnly: true, needsBridgeProbe: true, ambiguous: true,
    });
  }

  // Cầu dò đã chạy và im lặng ⇒ kết luận agent chưa chạy.
  return baseStatus({
    pill: "not-found", code: "AGENT_NOT_RUNNING", case: "agent-not-running",
    entryInfo, readOnly: true,
  });
}

/**
 * Cầu dò popup (arch §5.3, §6.2 #5) — cách ĐÁNG TIN NHẤT để biết agent có sống hay không
 * khi ở đường vào `pages`. Điều hướng top-level nên không bị mixed-content chặn.
 * CHỈ được gọi từ CỬ CHỈ NGƯỜI DÙNG (nút "Tôi đã chạy script nhưng vẫn không kết nối được"),
 * vì popup không do user bấm sẽ bị trình duyệt chặn.
 */
export function bridgeProbe(opts: {
  ports?: readonly number[];
  timeoutMs?: number;
  windowRef?: Window | null;
} = {}): Promise<BridgeResult> {
  const ports = opts.ports ?? PORT_CANDIDATES;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT.bridge;
  const w = opts.windowRef ?? (typeof window !== "undefined" ? window : null);
  if (!w || typeof w.open !== "function") return Promise.resolve({ alive: false, blockedPopup: false });

  const expect = ports.map((p) => `http://127.0.0.1:${p}`);
  const popup = w.open(
    `http://127.0.0.1:${ports[0]}/bridge.html?o=${encodeURIComponent(w.location?.origin ?? "")}`,
    "kitgen-bridge",
    "width=460,height=320",
  );
  if (!popup) return Promise.resolve({ alive: false, blockedPopup: true });

  return new Promise<BridgeResult>((resolve) => {
    let done = false;
    const finish = (r: BridgeResult) => {
      if (done) return;
      done = true;
      w.removeEventListener("message", onMessage);
      clearTimeout(timer);
      try {
        popup.close();
      } catch {
        /* popup có thể đã tự đóng */
      }
      resolve(r);
    };
    const onMessage = (ev: MessageEvent) => {
      if (!expect.includes(ev.origin)) return; // chỉ tin message từ loopback
      const d = ev.data as Record<string, unknown> | null;
      if (d && typeof d === "object" && d.ok === true) {
        finish({
          alive: true,
          info: {
            protocol: typeof d.protocol === "number" ? d.protocol : null,
            version: typeof d.version === "string" ? d.version : null,
            workspaceLabel: typeof d.workspaceLabel === "string" ? d.workspaceLabel : null,
            origin: ev.origin,
          },
        });
      }
    };
    w.addEventListener("message", onMessage);
    const timer = setTimeout(() => finish({ alive: false }), timeoutMs);
  });
}

/** Nhịp probe: backoff 1.5→3→6→15s; có run đang chạy thì cố định 1.5s (arch §5.3). */
export function createProbeSchedule(): {
  reset: () => void;
  next: (o?: { hasActiveRun?: boolean; connected?: boolean }) => number;
} {
  let step = 0;
  return {
    reset() {
      step = 0;
    },
    next({ hasActiveRun = false, connected = false } = {}) {
      if (hasActiveRun) return 1500;
      if (connected) {
        step = 0;
        return 1500;
      }
      const table = [1500, 3000, 6000, 15000];
      const ms = table[Math.min(step, table.length - 1)]!;
      step += 1;
      return ms;
    },
  };
}
