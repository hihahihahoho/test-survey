/**
 * VÒNG PROBE `/health` LÀ MỘT — CHỨNG MINH BẰNG SỐ LƯỢT GỌI.
 *
 * Bug được vá ở đây (QA blind): mỗi component gọi `useAgentStatus()` dựng một vòng probe
 * riêng; 9+ chỗ gọi cùng lúc ⇒ hàng trăm `GET /health` lặp. Test này đóng đinh ba điều mà
 * lời cảnh báo trong comment đã KHÔNG giữ nổi suốt mấy vòng trước:
 *
 *   ① N subscriber ⇒ ĐÚNG 1 request mỗi nhịp (không nhân theo số component);
 *   ② hết subscriber ⇒ vòng DỪNG hẳn (app idle không probe nền suốt phiên);
 *   ③ thang backoff / nhịp run / tab ẩn giữ NGUYÊN ngữ nghĩa bản cũ.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createHealthProbe, type VisibilitySource } from "../health-probe";
import { PROBE_ACTIVE_RUN_MS, PROBE_BACKOFF_MS, PROBE_ERROR_RETRY_MS, PROBE_HIDDEN_MS } from "../constants";
import type { BridgeResult, ConnectionStatus } from "../connection";

function statusOf(connected: boolean): ConnectionStatus {
  return {
    pill: connected ? "connected" : "not-found",
    code: connected ? null : "AGENT_NOT_RUNNING",
    case: connected ? "none" : "agent-not-running",
    readOnly: !connected,
    connected,
    entry: "unknown",
    sameOrigin: true,
    base: "",
    health: null,
    workspaceLabel: null,
    agentVersion: null,
    instanceLabel: null,
    updateCommand: null,
    needsBridgeProbe: false,
    ambiguous: false,
    httpStatus: null,
    mirrorUrl: "http://127.0.0.1:39217/app/",
    checkedAt: "2026-08-18T00:00:00.000Z",
  };
}

/** `document` giả: bật/tắt được `hidden` và bắn được `visibilitychange`. */
function fakeDoc(): VisibilitySource & { hidden: boolean; fire: () => void } {
  const fns = new Set<() => void>();
  return {
    hidden: false,
    addEventListener: (_t: "visibilitychange", fn: () => void) => void fns.add(fn),
    removeEventListener: (_t: "visibilitychange", fn: () => void) => void fns.delete(fn),
    fire: () => fns.forEach((f) => f()),
  };
}

/** Bộ đếm lượt `/health`: mỗi lần `diagnose()` được gọi là ĐÚNG một request. */
function counter(opts: { connected?: boolean | (() => boolean) } = {}) {
  const calls: {
    signals: (AbortSignal | undefined)[];
    bridges: (BridgeResult | null | undefined)[];
    /** mốc thời gian (đồng hồ giả) của từng lượt ⇒ đo được KHOẢNG CÁCH giữa các nhịp. */
    at: number[];
  } = { signals: [], bridges: [], at: [] };
  const fn = vi.fn(async (o: { signal?: AbortSignal; bridgeResult?: BridgeResult | null } = {}) => {
    calls.signals.push(o.signal);
    calls.bridges.push(o.bridgeResult);
    calls.at.push(Date.now());
    const c = typeof opts.connected === "function" ? opts.connected() : (opts.connected ?? true);
    return statusOf(c);
  });
  /** Khoảng cách giữa các lượt probe — đây mới là "nhịp" mà brief nói tới. */
  const gaps = () => calls.at.slice(1).map((t, i) => t - calls.at[i]!);
  return { fn, calls, gaps };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("một vòng probe cho cả app", () => {
  it("9 subscriber (đúng số chỗ gọi thật) ⇒ 1 request mỗi nhịp, KHÔNG nhân lên", async () => {
    const d = counter();
    const probe = createHealthProbe({ diagnose: d.fn, doc: null });

    const unsubs = Array.from({ length: 9 }, () => probe.subscribe(() => {}));
    await vi.advanceTimersByTimeAsync(0);

    expect(probe._debug().subscribers).toBe(9);
    expect(d.fn).toHaveBeenCalledTimes(1); // 9 màn hình, 1 request

    // Ba nhịp kế tiếp: vẫn đúng một request mỗi nhịp.
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[0]);
    expect(d.fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[1]);
    expect(d.fn).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[2]);
    expect(d.fn).toHaveBeenCalledTimes(4);

    unsubs.forEach((u) => u());
  });

  it("bản cũ tốn 9× — mốc so sánh: 9 vòng độc lập thì 30s đầu là 9 lần thế này", async () => {
    const d = counter();
    const probe = createHealthProbe({ diagnose: d.fn, doc: null });
    const unsub = probe.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30_000);
    const shared = d.fn.mock.calls.length;
    unsub();

    // Vòng chung: 1 + 1.5 + 3 + 6 + 15 rồi 15s/lượt ⇒ đếm được, và KHÔNG phụ thuộc
    // số màn đang mở. Bản cũ nhân đúng con số này với số component đang mount.
    expect(shared).toBeLessThanOrEqual(6);
    expect(shared * 9).toBeGreaterThan(shared); // 9 vòng cũ = 9× lưu lượng, ghi lại cho rõ
  });

  it("subscriber cuối cùng rời ⇒ vòng DỪNG hẳn (app idle không probe nền)", async () => {
    const d = counter();
    const probe = createHealthProbe({ diagnose: d.fn, doc: null });
    const a = probe.subscribe(() => {});
    const b = probe.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(d.fn).toHaveBeenCalledTimes(1);

    a();
    await vi.advanceTimersByTimeAsync(60_000);
    const whileOneLeft = d.fn.mock.calls.length;
    expect(whileOneLeft).toBeGreaterThan(1); // còn 1 người nghe thì vòng vẫn sống

    b();
    expect(probe._debug()).toMatchObject({ subscribers: 0, running: false });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(d.fn).toHaveBeenCalledTimes(whileOneLeft); // im lặng tuyệt đối
  });

  it("request đang bay lúc người cuối rời: bị abort và KHÔNG hẹn được nhịp kế", async () => {
    const gate: { release: () => void } = { release: () => {} };
    const seen: AbortSignal[] = [];
    const slow = vi.fn(async (o: { signal?: AbortSignal } = {}) => {
      if (o.signal) seen.push(o.signal);
      await new Promise<void>((r) => (gate.release = r));
      return statusOf(true);
    });
    const probe = createHealthProbe({ diagnose: slow, doc: null });
    const unsub = probe.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(slow).toHaveBeenCalledTimes(1);

    unsub();
    expect(seen[0]?.aborted).toBe(true);
    gate.release();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(slow).toHaveBeenCalledTimes(1); // lượt cũ về đích cũng không làm vòng sống lại
  });

  it("mở lại sau khi đã dừng ⇒ vòng khởi động lại từ bậc thấp nhất", async () => {
    const d = counter();
    const probe = createHealthProbe({ diagnose: d.fn, doc: null });
    const first = probe.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000); // leo hết thang
    first();
    d.fn.mockClear();

    const again = probe.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(d.fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[0]);
    expect(d.fn).toHaveBeenCalledTimes(2); // bậc 1.5s, không phải 15s thừa hưởng
    again();
  });
});

describe("ngữ nghĩa nhịp giữ nguyên bản cũ", () => {
  it("thang backoff 1.5→3→6→15s rồi đóng ở 15s khi trạng thái không đổi", async () => {
    const d = counter({ connected: true });
    const probe = createHealthProbe({ diagnose: d.fn, doc: null });
    const unsub = probe.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);

    for (const [i, ms] of [...PROBE_BACKOFF_MS, 15_000].entries()) {
      const before = d.fn.mock.calls.length;
      await vi.advanceTimersByTimeAsync(ms - 1);
      expect(d.fn.mock.calls.length, `bậc ${i}: chưa tới ${ms}ms thì chưa được probe`).toBe(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(d.fn.mock.calls.length).toBe(before + 1);
    }
    unsub();
  });

  it("có run đang chạy ⇒ nhịp cố định 1.5s, và ≥1 màn giữ chỗ là đủ", async () => {
    const d = counter();
    const probe = createHealthProbe({ diagnose: d.fn, doc: null });
    const unsub = probe.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000); // đã leo lên bậc 15s

    const hold1 = probe.holdActiveRun(); // 0→1: probe lại NGAY, y như bản cũ
    const hold2 = probe.holdActiveRun(); // màn thứ hai cũng khai "đang chạy"
    await vi.advanceTimersByTimeAsync(0);
    d.calls.at.length = 0;
    d.fn.mockClear();

    await vi.advanceTimersByTimeAsync(PROBE_ACTIVE_RUN_MS * 4);
    // 4 lượt, mỗi lượt ĐÚNG một request — hai chỗ giữ chỗ không thành hai vòng probe.
    expect(d.fn).toHaveBeenCalledTimes(4);
    expect(d.gaps()).toEqual([PROBE_ACTIVE_RUN_MS, PROBE_ACTIVE_RUN_MS, PROBE_ACTIVE_RUN_MS]);

    hold1(); // một màn nhả, còn một ⇒ nhịp vẫn dày
    d.calls.at.length = 0;
    await vi.advanceTimersByTimeAsync(PROBE_ACTIVE_RUN_MS * 2);
    expect(d.gaps()).toEqual([PROBE_ACTIVE_RUN_MS]);

    hold2(); // hết chỗ giữ ⇒ thang leo lại từ bậc thấp nhất
    d.calls.at.length = 0;
    await vi.advanceTimersByTimeAsync(20_000);
    expect(d.gaps().slice(0, 3)).toEqual([PROBE_BACKOFF_MS[0], PROBE_BACKOFF_MS[1], PROBE_BACKOFF_MS[2]]);
    unsub();
  });

  it("mất kết nối rồi có lại ⇒ thang về bậc 1.5s (bắt được lúc agent sống lại)", async () => {
    let connected = true;
    const d = counter({ connected: () => connected });
    const probe = createHealthProbe({ diagnose: d.fn, doc: null });
    const unsub = probe.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000); // đóng ở bậc 15s

    connected = false;
    await vi.advanceTimersByTimeAsync(20_000);
    // Lượt PHÁT HIỆN mất kết nối kết thúc bậc 15s và kéo thang về 1.5s → 3s → …
    expect(d.gaps().slice(-3)).toEqual([15_000, PROBE_BACKOFF_MS[0], PROBE_BACKOFF_MS[1]]);

    connected = true;
    d.calls.at.length = 0;
    await vi.advanceTimersByTimeAsync(20_000);
    // Nối lại được cũng là TIN MỚI: thang lại về 1.5s thay vì ngồi ở bậc cao.
    expect(d.gaps()).toContain(PROBE_BACKOFF_MS[0]);
    unsub();
  });

  it("tab ẩn ⇒ KHÔNG probe, chỉ ngó lại mỗi 5s; hiện lại thì probe tiếp", async () => {
    const d = counter();
    const doc = fakeDoc();
    const probe = createHealthProbe({ diagnose: d.fn, doc });
    const unsub = probe.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(d.fn).toHaveBeenCalledTimes(1);

    doc.hidden = true;
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[0]);
    const whileHidden = d.fn.mock.calls.length;
    await vi.advanceTimersByTimeAsync(PROBE_HIDDEN_MS * 6);
    expect(d.fn.mock.calls.length, "tab ẩn thì không tốn request nào").toBe(whileHidden);

    doc.hidden = false;
    doc.fire(); // visibilitychange: đặt lại thang
    await vi.advanceTimersByTimeAsync(PROBE_HIDDEN_MS);
    expect(d.fn.mock.calls.length).toBe(whileHidden + 1);
    d.fn.mockClear();
    await vi.advanceTimersByTimeAsync(PROBE_BACKOFF_MS[0]);
    expect(d.fn).toHaveBeenCalledTimes(1); // thang đã về bậc thấp nhất
    unsub();
  });

  it("hết subscriber thì gỡ luôn listener visibilitychange", async () => {
    const d = counter();
    const doc = fakeDoc();
    const probe = createHealthProbe({ diagnose: d.fn, doc });
    const unsub = probe.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    unsub();
    doc.fire(); // không được ném, không được dựng lại vòng
    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.fn).toHaveBeenCalledTimes(1);
  });

  it("`diagnose()` ném ⇒ thử lại sau 3s, không chết vòng", async () => {
    const boom = vi.fn(async () => {
      throw new Error("mạng hỏng");
    });
    const probe = createHealthProbe({ diagnose: boom as never, doc: null });
    const unsub = probe.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(boom).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(PROBE_ERROR_RETRY_MS);
    expect(boom).toHaveBeenCalledTimes(2);
    unsub();
  });
});

describe("state dùng chung + hai nút của user", () => {
  it("mọi subscriber nhận CÙNG một object trạng thái, báo đúng một lần mỗi lượt", async () => {
    const d = counter();
    const probe = createHealthProbe({ diagnose: d.fn, doc: null });
    const hits = [{ n: 0 }, { n: 0 }, { n: 0 }];
    const unsubs = hits.map((h) => probe.subscribe(() => (h.n += 1)));
    await vi.advanceTimersByTimeAsync(0);

    expect(hits.map((h) => h.n)).toEqual([1, 1, 1]);
    expect(probe.getStatus().connected).toBe(true);
    expect(probe.getStatus()).toBe(probe.getStatus()); // identity ổn định giữa hai nhịp
    unsubs.forEach((u) => u());
  });

  it("[Kiểm tra lại] probe NGAY; không ai nghe thì không probe lén", async () => {
    const d = counter();
    const probe = createHealthProbe({ diagnose: d.fn, doc: null });
    probe.recheck();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(d.fn, "0 subscriber ⇒ recheck() không được dựng vòng").toHaveBeenCalledTimes(0);

    const unsub = probe.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(d.fn).toHaveBeenCalledTimes(1);
    probe.recheck();
    await vi.advanceTimersByTimeAsync(0);
    expect(d.fn).toHaveBeenCalledTimes(2); // không phải đợi hết nhịp
    unsub();
  });

  it("cầu dò popup: kết quả là bằng chứng CHUNG, lượt probe sau mang nó theo", async () => {
    const d = counter();
    const bridge = vi.fn(async () => ({ alive: true } as BridgeResult));
    const probe = createHealthProbe({ diagnose: d.fn, bridgeProbe: bridge, doc: null });
    const unsub = probe.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(0);
    expect(d.calls.bridges[0]).toBe(null);

    const r = await probe.runBridgeProbe();
    await vi.advanceTimersByTimeAsync(0);
    expect(r.alive).toBe(true);
    expect(d.calls.bridges.at(-1)).toEqual({ alive: true });
    unsub();
  });
});
