/**
 * VÒNG CHỜ AGENT KHỞI ĐỘNG LẠI — thay cho `setTimeout(reload, 5000)` mù của bản trước.
 *
 * Ca đắt nhất ở đây là ca GIỮA: agent chết vài nhịp rồi mới sống lại. Nếu vòng chờ coi
 * mấy nhịp hỏng đó là lỗi (toast, thoát sớm), user sẽ thấy "mất kết nối" đúng vào lúc mọi
 * thứ đang chạy ĐÚNG như thiết kế. Toàn bộ thời gian ở đây là giả (`now`/`sleep` tiêm
 * vào) nên test không chờ một mili-giây thật nào.
 */
import { describe, expect, it, vi } from "vitest";
import {
  compareVersions, isUpdatedVersion, probeAgentVersion, waitForUpdatedAgent, type AgentProbe,
} from "../restart";

const up = (version: string | null): AgentProbe => ({ reachable: true, version, protocolChanged: false });
const down = (): AgentProbe => ({ reachable: false, version: null, protocolChanged: false });

/** Đồng hồ giả: mỗi lần `sleep(ms)` là thời gian nhảy đúng `ms`. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
  };
}

/** Kịch bản probe theo thứ tự; hết kịch bản thì lặp lại phần tử cuối. */
function scripted(steps: AgentProbe[]) {
  let i = 0;
  const calls = { n: 0 };
  const probe = async () => {
    calls.n += 1;
    const s = steps[Math.min(i, steps.length - 1)]!;
    i += 1;
    return s;
  };
  return { probe, calls };
}

describe("compareVersions — số theo số, không theo chữ", () => {
  it("2.10.0 mới hơn 2.9.9", () => {
    expect(compareVersions("2.10.0", "2.9.9")).toBe(1);
    expect(compareVersions("2.1.13", "2.1.13")).toBe(0);
    expect(compareVersions("2.1.13", "2.2.0")).toBe(-1);
  });
});

describe("isUpdatedVersion", () => {
  it("trùng bản đích ⇒ xong", () => {
    expect(isUpdatedVersion("2.2.0", { targetVersion: "2.2.0", fromVersion: "2.1.13" })).toBe(true);
  });
  it("không biết bản đích (lúc bấm mất mạng) vẫn kết luận được nhờ so với bản cũ", () => {
    expect(isUpdatedVersion("2.2.1", { targetVersion: null, fromVersion: "2.1.13" })).toBe(true);
    expect(isUpdatedVersion("2.1.13", { targetVersion: null, fromVersion: "2.1.13" })).toBe(false);
  });
  it("chưa đọc được version ⇒ CHƯA kết luận (không đoán bừa là xong)", () => {
    expect(isUpdatedVersion(null, { targetVersion: "2.2.0" })).toBe(false);
  });
});

describe("waitForUpdatedAgent", () => {
  it("agent chết vài nhịp rồi sống lại với bản mới ⇒ `updated`, KHÔNG coi nhịp hỏng là lỗi", async () => {
    const clock = fakeClock();
    const { probe, calls } = scripted([down(), down(), down(), up("2.2.0")]);
    const r = await waitForUpdatedAgent({
      targetVersion: "2.2.0", fromVersion: "2.1.13", probe, ...clock,
    });
    expect(r).toEqual({ outcome: "updated", version: "2.2.0" });
    expect(calls.n).toBe(4); // đúng 3 lần thử lại im lặng
  });

  it("chưa kịp restart (vẫn bản cũ, chưa từng chết) ⇒ cứ chờ, KHÔNG kết luận sớm", async () => {
    const clock = fakeClock();
    const { probe } = scripted([up("2.1.13")]);
    const r = await waitForUpdatedAgent({
      targetVersion: "2.2.0", fromVersion: "2.1.13", timeoutMs: 9000, intervalMs: 1500, probe, ...clock,
    });
    expect(r.outcome).toBe("timeout");
    expect(clock.now()).toBeGreaterThanOrEqual(9000);
  });

  it("quá hạn ⇒ `timeout` (KHÔNG tự tải lại — tải lại lúc này chỉ giấu mất vấn đề)", async () => {
    const clock = fakeClock();
    const { probe } = scripted([down()]);
    const r = await waitForUpdatedAgent({
      targetVersion: "2.2.0", fromVersion: "2.1.13", timeoutMs: 90_000, intervalMs: 1500, probe, ...clock,
    });
    expect(r.outcome).toBe("timeout");
    expect(clock.now()).toBeLessThan(92_000); // không chờ lố quá một nhịp
  });

  it("khởi động lại xong mà version Y NGUYÊN ⇒ `unchanged`, không chờ hết 90s", async () => {
    const clock = fakeClock();
    const { probe } = scripted([down(), up("2.1.13")]);
    const r = await waitForUpdatedAgent({
      targetVersion: "2.2.0", fromVersion: "2.1.13", stableChecks: 3, probe, ...clock,
    });
    expect(r).toEqual({ outcome: "unchanged", version: "2.1.13" });
    expect(clock.now()).toBeLessThan(20_000);
  });

  it("protocol lệch sau khi cài = bằng chứng agent ĐÃ đổi ⇒ `updated`", async () => {
    const clock = fakeClock();
    const { probe } = scripted([down(), { reachable: true, version: null, protocolChanged: true }]);
    const r = await waitForUpdatedAgent({ targetVersion: "2.2.0", fromVersion: "2.1.13", probe, ...clock });
    expect(r.outcome).toBe("updated");
  });

  it("không biết version nào cả ⇒ 'đã chết rồi sống lại' là bằng chứng tốt nhất còn lại", async () => {
    const clock = fakeClock();
    const { probe } = scripted([down(), up(null)]);
    const r = await waitForUpdatedAgent({ targetVersion: null, fromVersion: null, probe, ...clock });
    expect(r.outcome).toBe("updated");
  });
});

describe("probeAgentVersion — hỏi version sau khi trang đã tải lại", () => {
  it("agent còn đang khởi động thì chờ, xong thì trả version", async () => {
    const clock = fakeClock();
    const { probe } = scripted([down(), down(), up("2.2.0")]);
    expect(await probeAgentVersion({ probe, ...clock })).toBe("2.2.0");
  });

  it("agent không lên ⇒ `null` (KHÔNG được đọc thành 'cập nhật thất bại')", async () => {
    const clock = fakeClock();
    const { probe } = scripted([down()]);
    expect(await probeAgentVersion({ timeoutMs: 6000, probe, ...clock })).toBeNull();
  });
});

describe("probe thật KHÔNG BAO GIỜ ném", () => {
  it("fetch hỏng giữa lúc agent tự thay mình ⇒ chỉ là 'chưa sống lại'", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    const { probeAgentOnce } = await import("../restart");
    await expect(probeAgentOnce()).resolves.toEqual({ reachable: false, version: null, protocolChanged: false });
    vi.unstubAllGlobals();
  });
});
