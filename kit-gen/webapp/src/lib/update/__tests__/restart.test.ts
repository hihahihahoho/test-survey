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

/**
 * P2-12 — bug đã cắn người dùng thật: `/health` trả `version: "1.2.0"` (đời BỘ KHUNG
 * agent, hằng chưa bao giờ bump) còn bản đích là 2.1.x ⇒ so hai số khác thang, update
 * thành công vẫn báo "vẫn đang chạy bản 1.2.0". Hai ca dưới khoá đúng thứ tự ưu tiên.
 */
describe("đọc version từ /health — runtimeVersion trước, version sau", () => {
  const healthRes = (body: Record<string, unknown>) =>
    vi.fn(() => Promise.resolve(new Response(JSON.stringify({ ok: true, protocol: 1, ...body }), {
      status: 200,
      headers: { "Content-Type": "application/json", "X-KitGen-Protocol": "1" },
    })));

  it("có runtimeVersion ⇒ lấy version BẢN PHÁT HÀNH, KHÔNG lấy 1.2.0 của bộ khung", async () => {
    vi.stubGlobal("fetch", healthRes({ version: "1.2.0", runtimeVersion: "2.1.19" }));
    const { probeAgentOnce } = await import("../restart");
    const p = await probeAgentOnce();
    expect(p).toEqual({ reachable: true, version: "2.1.19", protocolChanged: false });
    vi.unstubAllGlobals();
  });

  it("agent đời cũ không có runtimeVersion ⇒ vẫn rơi về `version` chứ không mất tín hiệu", async () => {
    vi.stubGlobal("fetch", healthRes({ version: "1.2.0" }));
    const { probeAgentOnce } = await import("../restart");
    expect((await probeAgentOnce()).version).toBe("1.2.0");
    vi.unstubAllGlobals();
  });

  it("runtimeVersion null (chạy từ source) cũng rơi về `version`, không thành chuỗi 'null'", async () => {
    vi.stubGlobal("fetch", healthRes({ version: "1.2.0", runtimeVersion: null }));
    const { probeAgentOnce } = await import("../restart");
    expect((await probeAgentOnce()).version).toBe("1.2.0");
    vi.unstubAllGlobals();
  });
});

/**
 * Ca THẬT của lượt update sau bản vá, dựng bằng đúng hai con số của máy chủ SP:
 * bấm cập nhật 2.1.18 → 2.1.19, agent sống lại và trả runtimeVersion đúng bản đích.
 * Trước bản vá, probe trả "1.2.0" ⇒ vòng chờ kết luận `unchanged` và người dùng nhận
 * câu "Cập nhật chưa thành công" dù mọi thứ đã chạy đúng.
 */
describe("lượt update 2.1.18 → 2.1.19", () => {
  it("agent sống lại với runtimeVersion đúng bản đích ⇒ `updated`", async () => {
    const clock = fakeClock();
    const { probe } = scripted([up("2.1.18"), down(), up("2.1.19")]);
    const r = await waitForUpdatedAgent({ targetVersion: "2.1.19", fromVersion: "2.1.18", probe, ...clock });
    expect(r).toEqual({ outcome: "updated", version: "2.1.19" });
  });

  it("nếu probe vẫn đọc nhầm số của bộ khung ⇒ kết luận SAI thành `unchanged` (bug cũ)", () => {
    // Không phải test hành vi mong muốn — là bằng chứng vì sao thứ tự ưu tiên ở trên
    // quan trọng: "1.2.0" nhỏ hơn bản cũ nên không đời nào được coi là đã cập nhật.
    expect(isUpdatedVersion("1.2.0", { targetVersion: "2.1.19", fromVersion: "2.1.18" })).toBe(false);
  });
});
