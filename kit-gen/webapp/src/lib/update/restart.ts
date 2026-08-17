/**
 * webapp/src/lib/update/restart.ts — BIẾT LÚC NÀO AGENT ĐÃ SỐNG LẠI VỚI BẢN MỚI.
 *
 * Bản trước đặt `setTimeout(reload, 5000)` sau khi `POST /api/update` trả 202. Con số 5s
 * đó không đo gì cả: cài xong nhanh hơn thì user ngồi chờ vô cớ, chậm hơn thì trang tải
 * lại vào lúc agent đang chết ⇒ màn "mất kết nối" ngay sau khi bấm Cập nhật, và không ai
 * biết bản mới đã vào hay chưa.
 *
 * Thay bằng ĐO THẬT: poll `/health` (endpoint DUY NHẤT được phép poll, §6.2) cho tới khi
 * agent trả lời VÀ `version` khác bản cũ / đúng bản đích. Trong lúc agent thay mình,
 * request sẽ hỏng (fetch reject, 503 STARTING) — đó là DẤU HIỆU BÌNH THƯỜNG, không phải
 * lỗi để báo: nuốt im và thử lại.
 *
 * Ba kết cục, mỗi cái nói một câu khác nhau với user:
 *   · `updated`   — có bản mới thật ⇒ tự tải lại trang.
 *   · `unchanged` — agent đã tắt/bật lại nhưng version Y NGUYÊN ⇒ cài hỏng. Vẫn tải lại
 *                   để app đọc lại trạng thái thật, rồi báo "chưa thành công" kèm lệnh tay.
 *   · `timeout`   — quá hạn mà chưa kết luận được ⇒ KHÔNG tự tải lại (tải lại lúc này chỉ
 *                   giấu mất vấn đề), mà mời user tải lại thủ công / xem Terminal.
 */
import { AgentError, fetchHealth } from "../api/client";

/**
 * 180s. Trước đây là 90s với chú thích "dài hơn hẳn một lượt tải + cài" — SỐ ĐÓ SAI trên
 * máy thật: một lượt `kitgen update` nguội phải tải 2,6 MB từ GitHub, giải nén, `cp -R`
 * cả runtime, dò/cài Codex + trình render, rồi mới tới bước khởi động lại ở 5/7. Máy chủ
 * SP ngày 14/08 vượt 90s và vòng chờ bỏ cuộc GIỮA LÚC installer vẫn đang chạy.
 */
export const RESTART_TIMEOUT_MS = 180_000;
export const RESTART_INTERVAL_MS = 1500;
/**
 * Bao nhiêu lần thấy agent SỐNG với version CŨ (sau khi đã có bằng chứng nó khởi động
 * lại) thì kết luận "cài xong mà không đổi gì".
 */
export const RESTART_STABLE_CHECKS = 4;
/**
 * Bao nhiêu nhịp IM LIÊN TIẾP mới được coi là "agent đang tự thay mình".
 *
 * ĐÂY LÀ TÂM CỦA BUG "bấm Cập nhật lần đầu báo lỗi, lần sau thì ok" (máy chủ SP, 14/08).
 * `TIMEOUT.health` là **1200ms và KHÔNG retry** (`lib/api/constants.ts`), còn `/health`
 * thì `readdir` + `exists()` cho từng project (`agent/lib/workspace.mjs` · countProjects).
 * Trong lúc installer tải/giải nén/`cp -R`, một nhịp /health chậm quá 1,2s là chuyện
 * thường — và bản trước coi ĐÚNG MỘT nhịp hụt đó là "agent đã chết", rồi 4 nhịp × 1,5s
 * sau (6 giây!) kết luận "cài xong mà version y nguyên" ⇒ tự tải lại trang ⇒ lời chào
 * "Cập nhật chưa thành công… chạy kitgen update rồi thử lại", trong khi installer vẫn
 * đang tải dở. User bấm cập nhật lần hai, lần đó kịp xong, nên "lần sau lại ok".
 */
export const RESTART_MIN_DOWN_PROBES = 2;
/** Nhiễu cho phép khi so `uptimeMs` giữa hai nhịp (đồng hồ, làm tròn). */
export const RESTART_UPTIME_SLACK_MS = 1000;

export interface AgentProbe {
  /** agent trả lời được (kể cả khi protocol lệch — vẫn là bằng chứng nó SỐNG). */
  reachable: boolean;
  version: string | null;
  /**
   * Protocol lệch sau khi cài ⇒ agent đã đổi thật, chỉ có bundle đang chạy là cũ.
   * Đây là bằng chứng MẠNH của "đã cập nhật", và cũng là ca bắt buộc phải tải lại.
   */
  protocolChanged: boolean;
  /**
   * `uptimeMs` của /health — BẰNG CHỨNG DƯƠNG TÍNH của "tiến trình khác". Uptime chỉ tăng
   * trong một tiến trình, nên thấy nó TỤT là chắc chắn đã có tiến trình mới, không cần
   * đoán qua mấy nhịp hụt. `null`/thiếu = agent đời cũ ⇒ lùi về đếm nhịp im.
   */
  uptimeMs?: number | null;
}

export type RestartOutcome = "updated" | "unchanged" | "timeout";

export interface RestartResult {
  outcome: RestartOutcome;
  version: string | null;
}

/** So version kiểu `2.10.0` > `2.9.9` (số theo số, không theo chữ). Cùng luật với agent. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string) => String(v).split(/[.-]/).map((x) => (/^\d+$/.test(x) ? Number(x) : x));
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x < y ? -1 : 1;
    return String(x).localeCompare(String(y), undefined, { numeric: true }) < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * "Đây có phải bản mới không?" — trả lời bằng bằng chứng, không bằng phỏng đoán:
 *  · bản đích hoặc cao hơn ⇒ đúng, chắc chắn (manifest có thể tiến thêm trong lúc chờ);
 *  · lớn hơn bản cũ ⇒ đúng (ca `latestVersion` null vì lúc bấm mất mạng);
 *  · còn lại ⇒ chưa, cứ chờ tiếp.
 */
export function isUpdatedVersion(
  version: string | null,
  opts: { targetVersion?: string | null; fromVersion?: string | null } = {},
): boolean {
  const { targetVersion = null, fromVersion = null } = opts;
  if (!version) return false;
  if (targetVersion && compareVersions(version, targetVersion) >= 0) return true;
  if (fromVersion && compareVersions(version, fromVersion) > 0) return true;
  return false;
}

/**
 * VERSION NÀO LÀ VERSION ĐỂ SO? — `runtimeVersion` trước, `version` sau.
 *
 * `/health` trả hai số khác nhau và chỉ một trong hai so được với bản đích:
 *  · `runtimeVersion` — bản PHÁT HÀNH đang chạy (2.1.x), cùng thang với `latestVersion`;
 *  · `version` — đời bộ khung agent, một hằng "1.2.0" chưa bao giờ được bump. Đọc nó là
 *    nguồn gốc của bug "cập nhật thành công vẫn báo vẫn đang chạy bản 1.2.0" (P2-12).
 *
 * VẪN GIỮ FALLBACK về `version`: agent đời cũ (trước bản vá) không có `runtimeVersion`,
 * và với agent đó thì "1.2.0" tuy vô nghĩa nhưng ổn định — luồng chờ vẫn kết luận được
 * "đã chết rồi sống lại" nhờ `sawDown`. Đổi lại, LƯỢT UPDATE ĐẦU TIÊN SAU BẢN VÁ VẪN
 * BÁO SAI MỘT LẦN CUỐI: bên đứng chờ là BUNDLE CŨ đang chạy trong trình duyệt (bundle
 * mới chỉ vào sau khi reload), nên nó vẫn đọc `version`. Đây là cái giá bắt buộc của mọi
 * bản vá phía client trong luồng tự-thay-mình — không có cách nào tránh, chỉ có cách nói
 * trước.
 */
function healthVersion(health: unknown): string | null {
  const h = health as { runtimeVersion?: unknown; version?: unknown } | null;
  if (typeof h?.runtimeVersion === "string" && h.runtimeVersion) return h.runtimeVersion;
  return typeof h?.version === "string" && h.version ? h.version : null;
}

function healthUptime(health: unknown): number | null {
  const u = (health as { uptimeMs?: unknown } | null)?.uptimeMs;
  return typeof u === "number" && Number.isFinite(u) ? u : null;
}

/** Một nhịp `/health`. KHÔNG BAO GIỜ ném: mọi lỗi đều là "chưa sống lại". */
export async function probeAgentOnce(): Promise<AgentProbe> {
  try {
    const r = await fetchHealth();
    if (!r.ok) return { reachable: false, version: null, protocolChanged: false, uptimeMs: null };
    return {
      reachable: true,
      version: healthVersion(r.health),
      protocolChanged: r.protocolIssue !== null,
      uptimeMs: healthUptime(r.health),
    };
  } catch (e) {
    const code = e instanceof AgentError ? e.code : "";
    if (code === "AGENT_PROTOCOL_OLD" || code === "AGENT_PROTOCOL_NEW") {
      return { reachable: true, version: null, protocolChanged: true, uptimeMs: null };
    }
    return { reachable: false, version: null, protocolChanged: false, uptimeMs: null };
  }
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export interface WaitOptions {
  targetVersion?: string | null;
  fromVersion?: string | null;
  timeoutMs?: number;
  intervalMs?: number;
  stableChecks?: number;
  minDownProbes?: number;
  uptimeSlackMs?: number;
  /** tiêm được để test không phải chạy mạng và không phải chờ thật. */
  probe?: () => Promise<AgentProbe>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Chờ agent sống lại với bản mới. Hàm này KHÔNG tự tải lại trang — nó chỉ trả sự thật;
 * quyết định làm gì với sự thật đó là của `install-store`.
 *
 * LUẬT VÀNG (đổi sau sự cố 14/08, xem `RESTART_MIN_DOWN_PROBES`): kết luận `unchanged`
 * — tức "cài xong rồi mà chẳng đổi gì", câu duy nhất khiến app TỰ TẢI LẠI rồi báo hỏng —
 * chỉ được đưa ra khi có **bằng chứng tiến trình agent đã thật sự đổi**:
 *   · `uptimeMs` tụt (chắc chắn là tiến trình khác), hoặc
 *   · im liên tiếp ≥ `minDownProbes` nhịp (agent đời cũ không khai uptime).
 * Không có bằng chứng đó thì im lặng chờ tiếp: installer còn đang tải/cài, và "chưa thấy
 * gì" KHÔNG BAO GIỜ được đọc thành "đã hỏng" (§3.9).
 */
export async function waitForUpdatedAgent(opts: WaitOptions = {}): Promise<RestartResult> {
  const {
    targetVersion = null,
    fromVersion = null,
    timeoutMs = RESTART_TIMEOUT_MS,
    intervalMs = RESTART_INTERVAL_MS,
    stableChecks = RESTART_STABLE_CHECKS,
    minDownProbes = RESTART_MIN_DOWN_PROBES,
    uptimeSlackMs = RESTART_UPTIME_SLACK_MS,
  } = opts;
  const probe = opts.probe ?? probeAgentOnce;
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? (() => Date.now());

  const knowsVersions = Boolean(targetVersion || fromVersion);
  const startedAt = now();
  /** Đã có BẰNG CHỨNG agent khởi động lại (không phải "đoán vì một nhịp hụt"). */
  let sawRestart = false;
  let downStreak = 0;
  let lastUptime: number | null = null;
  let sameVersionStreak = 0;
  let lastVersion: string | null = null;

  for (;;) {
    const p = await probe();
    if (p.version) lastVersion = p.version;

    if (!p.reachable) {
      // Một nhịp hụt lẻ = /health chậm quá 1,2s trong lúc đĩa đang bận vì chính installer.
      // Chỉ im LIÊN TIẾP mới là "agent đang tự thay mình".
      downStreak += 1;
      sameVersionStreak = 0;
      if (downStreak >= minDownProbes) sawRestart = true;
    } else {
      downStreak = 0;
      const uptime = typeof p.uptimeMs === "number" ? p.uptimeMs : null;
      if (uptime !== null) {
        if (lastUptime !== null && uptime + uptimeSlackMs < lastUptime) sawRestart = true;
        lastUptime = uptime;
      }

      if (p.protocolChanged) return { outcome: "updated", version: p.version };
      if (knowsVersions ? isUpdatedVersion(p.version, { targetVersion, fromVersion }) : sawRestart) {
        // Không biết version nào cả ⇒ "đã khởi động lại" là bằng chứng tốt nhất còn lại.
        return { outcome: "updated", version: p.version };
      }
      if (sawRestart) {
        sameVersionStreak += 1;
        if (sameVersionStreak >= stableChecks) return { outcome: "unchanged", version: p.version };
      } else {
        sameVersionStreak = 0;
      }
    }

    if (now() - startedAt >= timeoutMs) return { outcome: "timeout", version: lastVersion };
    await sleep(intervalMs);
  }
}

/**
 * Sau khi trang đã tải lại: agent đang chạy bản nào? Nó có thể còn đang khởi động vài
 * giây nữa, nên vẫn phải chờ — nhưng chờ NGẮN, vì đây chỉ để chọn câu thông báo.
 * `null` = không hỏi được ⇒ tuyệt đối không được suy ra "cập nhật thất bại".
 */
export async function probeAgentVersion(opts: {
  timeoutMs?: number;
  intervalMs?: number;
  probe?: () => Promise<AgentProbe>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
} = {}): Promise<string | null> {
  const { timeoutMs = 20_000, intervalMs = 1500 } = opts;
  const probe = opts.probe ?? probeAgentOnce;
  const sleep = opts.sleep ?? realSleep;
  const now = opts.now ?? (() => Date.now());
  const startedAt = now();
  for (;;) {
    const p = await probe();
    if (p.reachable && p.version) return p.version;
    if (now() - startedAt >= timeoutMs) return null;
    await sleep(intervalMs);
  }
}
