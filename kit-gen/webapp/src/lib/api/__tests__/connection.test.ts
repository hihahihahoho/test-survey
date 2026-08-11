/**
 * CA TỐI THIỂU BẮT BUỘC: phân biệt đúng 3 ca lỗi kết nối.
 *
 * Bài kiểm tra thật sự của file này là tái hiện chính xác tình huống trong
 * `teams/qa-ux/browser-evidence.md`:
 *   · CAO-01        — mở `http://127.0.0.1:8791/app/`, agent trả 403 ORIGIN_NOT_ALLOWED
 *   · TRUNG BÌNH-01 — bản cũ hiện "Trình duyệt đang chặn", SAI SỰ THẬT
 * Ca "same-origin + 403" ở dưới FAIL nếu ai đó lỡ tay đưa lại kết luận "trình duyệt chặn".
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { _resetClient, configureClient, type LocationLike } from "../client";
import { diagnose } from "../connection";
import { presentError } from "../errors";

const MIRROR_LOC: LocationLike = {
  hostname: "127.0.0.1", pathname: "/app/", protocol: "http:", origin: "http://127.0.0.1:8791", port: "8791",
};
const PAGES_LOC: LocationLike = {
  hostname: "kitgen.pages.dev", pathname: "/", protocol: "https:", origin: "https://kitgen.pages.dev",
};

const healthOk = () =>
  new Response(
    JSON.stringify({
      ok: true, app: "kitgen-agent", protocol: 1, version: "1.2.0",
      instanceLabel: "gray-otter", workspaceLabel: "~/KitGen", projects: 7, activeRuns: 0,
    }),
    { status: 200, headers: { "content-type": "application/json", "X-KitGen-Protocol": "1" } },
  );

const httpErr = (status: number, code: string, hint?: string) =>
  new Response(JSON.stringify({ error: { code, message: "chuỗi kỹ thuật của agent", hint } }), {
    status,
    headers: { "content-type": "application/json", "X-KitGen-Protocol": "1" },
  });

function fetchAlways(make: () => Response | Error) {
  return vi.fn(async () => {
    const r = make();
    if (r instanceof Error) throw r;
    return r;
  }) as unknown as typeof fetch;
}

beforeEach(() => _resetClient());

describe("CA 1 — agent TRẢ LỖI HTTP (đã tới được agent)", () => {
  it("403 ORIGIN_NOT_ALLOWED trên /app/ ⇒ 'agent-http-error', KHÔNG PHẢI 'trình duyệt chặn' (CAO-01)", async () => {
    configureClient({ location: MIRROR_LOC, fetchImpl: fetchAlways(() => httpErr(403, "ORIGIN_NOT_ALLOWED", "run-with-allow-cli")) });
    const s = await diagnose({ location: MIRROR_LOC });

    expect(s.case).toBe("agent-http-error");
    expect(s.code).toBe("ORIGIN_NOT_ALLOWED");
    expect(s.httpStatus).toBe(403);
    // ĐÂY LÀ ASSERT CHỐNG HỒI QUY CỦA TRUNG BÌNH-01:
    expect(s.pill).not.toBe("blocked-by-browser");
    expect(s.case).not.toBe("blocked-by-browser");
    expect(s.ambiguous).toBe(false);
  });

  it("copy hiện ra nói đúng chủ thể từ chối là CÔNG CỤ LOCAL, không đổ tội trình duyệt", () => {
    const view = presentError({ code: "ORIGIN_NOT_ALLOWED" });
    expect(view.title).toContain("Công cụ local");
    expect(view.title.toLowerCase()).not.toContain("trình duyệt");
    // Câu giải thích phải nói rõ trình duyệt KHÔNG chặn, để user không đi tắt ad-blocker.
    expect(view.explain).toContain("Trình duyệt không chặn");
  });

  it("403 trên đường vào PAGES cũng là ca 1 — có response thì thủ phạm vẫn là agent", async () => {
    configureClient({ location: PAGES_LOC, fetchImpl: fetchAlways(() => httpErr(403, "ORIGIN_NOT_ALLOWED")) });
    const s = await diagnose({ location: PAGES_LOC });
    expect(s.case).toBe("agent-http-error");
    expect(s.pill).not.toBe("blocked-by-browser");
  });

  it("421 BAD_HOST ⇒ ca 1 với mã riêng", async () => {
    configureClient({ location: MIRROR_LOC, fetchImpl: fetchAlways(() => httpErr(421, "BAD_HOST")) });
    const s = await diagnose({ location: MIRROR_LOC });
    expect(s.case).toBe("agent-http-error");
    expect(s.code).toBe("BAD_HOST");
  });

  it("503 STARTING ⇒ 'đang khởi động', không phải 'chưa chạy'", async () => {
    configureClient({ location: MIRROR_LOC, fetchImpl: fetchAlways(() => httpErr(503, "STARTING")) });
    const s = await diagnose({ location: MIRROR_LOC });
    expect(s.case).toBe("agent-http-error");
    expect(s.code).toBe("AGENT_STARTING");
    expect(s.pill).toBe("checking");
  });
});

describe("CA 2 — agent CHƯA CHẠY (fetch fail + same-origin ⇒ kết luận CHẮC)", () => {
  it("/app/ + TypeError ⇒ agent-not-running, KHÔNG mời cầu dò", async () => {
    configureClient({ location: MIRROR_LOC, fetchImpl: fetchAlways(() => new TypeError("Failed to fetch")) });
    const s = await diagnose({ location: MIRROR_LOC });

    expect(s.case).toBe("agent-not-running");
    expect(s.code).toBe("AGENT_NOT_RUNNING");
    expect(s.pill).toBe("not-found");
    // Same-origin: trang này do chính agent phục vụ ⇒ trình duyệt không thể là thủ phạm.
    expect(s.needsBridgeProbe).toBe(false);
    expect(s.ambiguous).toBe(false);
  });

  it("dev server (localhost:5173, qua vite proxy) cũng same-origin ⇒ cùng kết luận", async () => {
    const dev: LocationLike = { hostname: "localhost", pathname: "/", protocol: "http:", origin: "http://localhost:5173" };
    configureClient({ location: dev, fetchImpl: fetchAlways(() => new TypeError("Failed to fetch")) });
    const s = await diagnose({ location: dev });
    expect(s.case).toBe("agent-not-running");
    expect(s.pill).not.toBe("blocked-by-browser");
  });
});

describe("CA 3 — TRÌNH DUYỆT CHẶN (chỉ có thể xảy ra ở đường vào Pages)", () => {
  it("3a: pages + fetch fail + chưa có cầu dò ⇒ CHƯA KẾT LUẬN, mời user kiểm tra", async () => {
    configureClient({ location: PAGES_LOC, fetchImpl: fetchAlways(() => new TypeError("Failed to fetch")) });
    const s = await diagnose({ location: PAGES_LOC });

    expect(s.case).toBe("unreachable-ambiguous");
    expect(s.ambiguous).toBe(true);
    expect(s.needsBridgeProbe).toBe(true);
    // Chưa có bằng chứng ⇒ KHÔNG được khẳng định bên nào có lỗi.
    expect(s.pill).not.toBe("blocked-by-browser");
    const view = presentError({ code: s.code });
    expect(view.explain).toContain("Chưa rõ");
  });

  it("3b: cầu dò xác nhận agent SỐNG ⇒ lúc này MỚI được nói 'trình duyệt đang chặn'", async () => {
    configureClient({ location: PAGES_LOC, fetchImpl: fetchAlways(() => new TypeError("Failed to fetch")) });
    const s = await diagnose({
      location: PAGES_LOC,
      bridgeResult: { alive: true, info: { protocol: 1, version: "1.2.0", workspaceLabel: "~/KitGen" } },
    });

    expect(s.case).toBe("blocked-by-browser");
    expect(s.code).toBe("AGENT_BLOCKED_BY_BROWSER");
    expect(s.pill).toBe("blocked-by-browser");
    expect(s.workspaceLabel).toBe("~/KitGen");
    // §3.9: nút chính phải là [Mở bản chạy tại máy]
    expect(presentError({ code: s.code }).actions[0]!.id).toBe("OPEN_MIRROR");
    expect(s.mirrorUrl).toContain("/app/");
  });

  it("cầu dò IM LẶNG ⇒ kết luận agent chưa chạy, không treo ở trạng thái mơ hồ mãi", async () => {
    configureClient({ location: PAGES_LOC, fetchImpl: fetchAlways(() => new TypeError("Failed to fetch")) });
    const s = await diagnose({ location: PAGES_LOC, bridgeResult: { alive: false } });
    expect(s.case).toBe("agent-not-running");
    expect(s.needsBridgeProbe).toBe(false);
  });
});

describe("kết nối tốt & protocol lệch", () => {
  it("/health 200 ⇒ connected, không readOnly", async () => {
    configureClient({ location: MIRROR_LOC, fetchImpl: fetchAlways(healthOk) });
    const s = await diagnose({ location: MIRROR_LOC });
    expect(s.pill).toBe("connected");
    expect(s.connected).toBe(true);
    expect(s.readOnly).toBe(false);
    expect(s.workspaceLabel).toBe("~/KitGen");
    expect(s.agentVersion).toBe("1.2.0");
  });

  it("protocol lệch ⇒ pill 'outdated' + chỉ đọc, KHÔNG phải mất kết nối", async () => {
    configureClient({
      location: MIRROR_LOC,
      fetchImpl: fetchAlways(
        () =>
          new Response(JSON.stringify({ ok: true, protocol: 2 }), {
            status: 200,
            headers: { "content-type": "application/json", "X-KitGen-Protocol": "2" },
          }),
      ),
    });
    const s = await diagnose({ location: MIRROR_LOC });
    expect(s.case).toBe("protocol-mismatch");
    expect(s.pill).toBe("outdated");
    expect(s.readOnly).toBe(true);
  });

  it("§2.4 hàng 6: doctor báo không tạo được ảnh ⇒ pill vàng RIÊNG, VẪN sửa được", async () => {
    configureClient({
      location: MIRROR_LOC,
      fetchImpl: fetchAlways(
        () =>
          new Response(JSON.stringify({ ok: true, protocol: 1, imageGen: { available: false } }), {
            status: 200,
            headers: { "content-type": "application/json", "X-KitGen-Protocol": "1" },
          }),
      ),
    });
    const s = await diagnose({ location: MIRROR_LOC });
    expect(s.pill).toBe("imagegen-unavailable");
    expect(s.connected).toBe(true);
    expect(s.readOnly).toBe(false); // mất tạo ảnh ≠ mất quyền sửa thiết kế
  });
});

describe("ưu tiên bằng chứng: lỗi CÓ response luôn thắng lỗi không có response", () => {
  it("một cổng im lặng, một cổng trả 403 ⇒ kết luận theo cái 403", async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new TypeError("Failed to fetch");
      return httpErr(403, "ORIGIN_NOT_ALLOWED");
    }) as unknown as typeof fetch;
    configureClient({ location: PAGES_LOC, fetchImpl: fn });
    const s = await diagnose({ location: PAGES_LOC });
    expect(s.case).toBe("agent-http-error");
    expect(s.code).toBe("ORIGIN_NOT_ALLOWED");
  });
});

describe("§3.9 — không bao giờ lộ message kỹ thuật ra thân UI", () => {
  it("presentError KHÔNG trả field message", () => {
    const view = presentError({ code: "CONTRACT_CONFLICT", message: "Contract version 37 != 38" });
    expect(view).not.toHaveProperty("message");
    expect(JSON.stringify(view)).not.toContain("37 != 38");
  });
  it("mã LẠ ⇒ entry generic, không vỡ UI (§6.5-6)", () => {
    const view = presentError({ code: "QUANTUM_FLUX_ERROR", message: "kỹ thuật" });
    expect(view.known).toBe(false);
    expect(view.title).toBe("Có lỗi từ công cụ local");
    expect(view.actions.length).toBeGreaterThan(0);
  });
});
