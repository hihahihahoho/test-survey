/**
 * webapp/src/lib/api/health-probe.ts — MỘT vòng probe `/health` cho CẢ APP.
 *
 * ╔══ VÌ SAO FILE NÀY TỒN TẠI ════════════════════════════════════════════════╗
 * ║ `useAgentStatus()` bản cũ dựng vòng probe TRONG `useEffect` của từng       ║
 * ║ component: mỗi lần gọi là một `setTimeout` + một `AbortController` + một   ║
 * ║ `createProbeSchedule()` RIÊNG. Có ≥9 chỗ gọi nó cùng lúc (AppLayout,       ║
 * ║ ProjectScreen, RunsScreen, StudioScreen, DesignScreen, WorkflowScreen,     ║
 * ║ KitScreen, ProjectSettingsScreen, SettingsDialog, SetupScreen…) ⇒ mở một   ║
 * ║ màn hình là 2–4 vòng probe chạy song song, mỗi vòng leo thang backoff      ║
 * ║ riêng và lệch pha nhau. QA blind đo được HÀNG TRĂM `GET /health` lặp.      ║
 * ║ Cảnh báo đã ghi sẵn ở `components/layout/screen-contract.ts` §E1 và ở      ║
 * ║ `features/home/components/UpdateSidebarButton.tsx` — nhưng lời cảnh báo    ║
 * ║ không chặn được ai, nên nay CẤU TRÚC chặn: vòng probe không còn nằm trong  ║
 * ║ component nữa, gọi hook bao nhiêu lần cũng chỉ có một vòng.                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Cùng lý do với `lib/update/install-store.ts`: trạng thái phải sống LÂU HƠN
 * component đọc nó (đổi màn = unmount). Khác ở chỗ store kia là zustand vì nó
 * chỉ giữ dữ liệu, còn ở đây thứ cần quản là một VÒNG LẶP có tài nguyên (timer,
 * request đang bay) — nên dùng store ngoài React với đếm subscriber:
 *
 *   · subscriber thứ NHẤT vào  ⇒ vòng probe khởi động;
 *   · subscriber cuối cùng ra  ⇒ vòng probe DỪNG, huỷ timer, abort request đang bay.
 *     (không có màn nào cần thì đừng bắt máy user probe suốt phiên)
 *
 * NGỮ NGHĨA GIỮ NGUYÊN so với bản trong hook — đây là điều kiện của lần sửa này:
 *   · thang backoff vẫn là `createProbeSchedule()` (1.5→3→6→15s), một thang DUY NHẤT;
 *   · có run đang chạy ⇒ 1.5s cố định. Nhiều màn cùng khai "đang chạy" thì đếm giữ
 *     chỗ (`holdActiveRun`), còn ≥1 chỗ giữ là còn nhịp dày;
 *   · tab ẩn ⇒ KHÔNG probe, chỉ ngó lại sau `PROBE_HIDDEN_MS`; quay lại tab thì
 *     `schedule.reset()` để nhịp về bậc thấp nhất;
 *   · `diagnose()` ném ⇒ thử lại sau `PROBE_ERROR_RETRY_MS`.
 *
 * Mọi phụ thuộc ra thế giới ngoài (`diagnose`, `bridgeProbe`, `document`) đều tiêm
 * được ⇒ test đếm được số lượt gọi mà không cần jsdom, không cần mạng, không cần chờ thật.
 */
import {
  bridgeProbe as realBridgeProbe,
  checkingStatus,
  createProbeSchedule,
  diagnose as realDiagnose,
  type BridgeResult,
  type ConnectionStatus,
} from "./connection";
import { PROBE_ERROR_RETRY_MS, PROBE_HIDDEN_MS } from "./constants";

/** Phần `document` mà vòng probe thực sự cần — để test đưa vào một cái giả. */
export interface VisibilitySource {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", fn: () => void): void;
  removeEventListener(type: "visibilitychange", fn: () => void): void;
}

export interface HealthProbeDeps {
  diagnose: typeof realDiagnose;
  bridgeProbe: typeof realBridgeProbe;
  /** `null` ⇒ môi trường không có DOM (SSR, test node): coi như tab luôn hiện. */
  doc: VisibilitySource | null;
}

export interface HealthProbe {
  /** Ảnh chụp hiện tại — ổn định về identity giữa hai lần probe (hợp đồng của
   *  `useSyncExternalStore`: đổi identity mà nội dung y hệt là render vô ích). */
  getStatus: () => ConnectionStatus;
  /** Đăng ký nghe. Trả hàm huỷ đăng ký; hết người nghe thì vòng probe dừng. */
  subscribe: (listener: () => void) => () => void;
  /** Khai "màn tôi đang có run chạy" ⇒ nhịp 1.5s. Trả hàm nhả chỗ. */
  holdActiveRun: () => () => void;
  /** Nút [Kiểm tra lại]: probe NGAY, không đợi hết nhịp. */
  recheck: () => void;
  /** Cầu dò popup (chỉ từ cử chỉ user) — kết quả dùng CHUNG cho mọi màn. */
  runBridgeProbe: () => Promise<BridgeResult>;
  /** Chỉ dùng trong test: nhìn vào ruột mà không phải đoán qua tác dụng phụ. */
  _debug: () => { subscribers: number; activeRunHolds: number; running: boolean };
}

function defaultDoc(): VisibilitySource | null {
  return typeof document !== "undefined" ? (document as unknown as VisibilitySource) : null;
}

export function createHealthProbe(overrides: Partial<HealthProbeDeps> = {}): HealthProbe {
  const deps: HealthProbeDeps = {
    diagnose: realDiagnose,
    bridgeProbe: realBridgeProbe,
    doc: defaultDoc(),
    ...overrides,
  };

  const listeners = new Set<() => void>();
  const schedule = createProbeSchedule();
  /* Lười khởi tạo: `checkingStatus()` đọc `location`, không được chạy lúc import
     module (test node không có `location`, và import không phải lúc để làm việc đó). */
  let status: ConnectionStatus | null = null;
  let bridge: BridgeResult | null = null;
  let activeRunHolds = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let ac: AbortController | null = null;
  let detachVisibility: (() => void) | null = null;
  /* Tem của vòng lặp hiện hành. Mỗi lần cắt vòng thì tăng ⇒ lượt `diagnose()` đang
     bay của vòng cũ về đích cũng không ghi được state, không hẹn được timer mới.
     Không có nó thì "dừng khi hết subscriber" chỉ đúng trên giấy: request cuối vẫn
     kịp đặt `setTimeout` và vòng sống lại sau khi đã tắt. */
  let generation = 0;

  const emit = () => {
    for (const l of [...listeners]) l();
  };

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const cut = () => {
    generation += 1;
    clearTimer();
    ac?.abort();
    ac = null;
  };

  const loop = async (gen: number): Promise<void> => {
    if (gen !== generation) return;
    if (deps.doc?.hidden === true) {
      timer = setTimeout(() => void loop(gen), PROBE_HIDDEN_MS); // tab ẩn: không probe
      return;
    }
    const controller = new AbortController();
    ac = controller;
    try {
      const s = await deps.diagnose({ signal: controller.signal, bridgeResult: bridge });
      if (gen !== generation) return;
      status = s;
      emit();
      timer = setTimeout(
        () => void loop(gen),
        schedule.next({ hasActiveRun: activeRunHolds > 0, connected: s.connected }),
      );
    } catch {
      if (gen !== generation) return;
      timer = setTimeout(() => void loop(gen), PROBE_ERROR_RETRY_MS);
    }
  };

  /** Cắt vòng đang chạy rồi probe lại NGAY (dùng cho [Kiểm tra lại], cầu dò, run mới). */
  const restart = () => {
    cut();
    void loop(generation);
  };

  const onVisible = () => {
    // Y HỆT bản cũ: chỉ đặt lại thang, KHÔNG probe ngay — lượt ngó 5s đang hẹn sẽ
    // thấy tab hiện và probe. Quay lại tab không được biến thành một tràng request.
    if (deps.doc?.hidden === false) schedule.reset();
  };

  const start = () => {
    if (deps.doc && detachVisibility === null) {
      const d = deps.doc;
      d.addEventListener("visibilitychange", onVisible);
      detachVisibility = () => d.removeEventListener("visibilitychange", onVisible);
    }
    restart();
  };

  const stop = () => {
    cut();
    detachVisibility?.();
    detachVisibility = null;
    /* Thang về bậc thấp nhất cho phiên sau: màn hình mở lại là tin mới, đừng bắt nó
       thừa hưởng bậc 15s của phiên trước. Trạng thái thì GIỮ (không quay về
       `checking`) — vòng probe khởi động lại ngay khi có subscriber, và nháy "đang
       kiểm tra" mỗi lần đổi màn chính là thứ đẩy app vào chỉ-đọc vô cớ. */
    schedule.reset();
  };

  return {
    getStatus: () => (status ??= checkingStatus()),

    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (listeners.size === 1) start();
      return () => {
        if (!listeners.delete(listener)) return;
        if (listeners.size === 0) stop();
      };
    },

    holdActiveRun: () => {
      activeRunHolds += 1;
      // 0→1: nhịp phải dày lên NGAY, y như bản cũ (đổi `hasActiveRun` là effect chạy lại).
      if (activeRunHolds === 1 && listeners.size > 0) restart();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        activeRunHolds -= 1;
        // 1→0 KHÔNG cắt vòng: lượt kế tự đọc `activeRunHolds` mà giãn nhịp ra.
      };
    },

    recheck: () => {
      if (listeners.size === 0) return; // không ai nghe thì không có gì để kiểm tra lại
      restart();
    },

    runBridgeProbe: async () => {
      const r = await deps.bridgeProbe();
      bridge = r;
      // Probe lại để `diagnose()` dùng bằng chứng mới mà kết luận ca 3a → 3b hoặc ca 2.
      if (listeners.size > 0) restart();
      return r;
    },

    _debug: () => ({ subscribers: listeners.size, activeRunHolds, running: timer !== null || ac !== null }),
  };
}

/** Vòng probe DUY NHẤT của app. Đừng tạo thêm cái thứ hai ngoài test. */
export const healthProbe = createHealthProbe();
