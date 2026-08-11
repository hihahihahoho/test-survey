/**
 * Ca tối thiểu bắt buộc: retry ĐÚNG CHÍNH SÁCH §6.1 —
 *   health 1200ms không retry · GET 8s retry 1 lần · POST tạo/sửa KHÔNG retry
 *   · stream không timeout · upload 60s.
 * Kèm các chốt bảo mật §6.1/§6.5 phải đo được chứ không chỉ hứa trong tài liệu.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentError, _resetClient, configureClient, confirmHeader, detectEntry, fileUrl,
  httpDelete, httpGet, httpPatch, httpPost, httpPut, httpUpload, isAllowedBase,
  protocolMismatch, request, setBase, thumbUrl,
} from "../client";
import { TIMEOUT } from "../constants";

interface Call {
  url: string;
  init: RequestInit;
}

/** fetch giả: trả lần lượt các phản hồi đã khai, ghi lại mọi lời gọi. */
function mockFetch(responses: (Response | Error)[]) {
  const calls: Call[] = [];
  let i = 0;
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses[Math.min(i, responses.length - 1)];
    i += 1;
    if (r instanceof Error) throw r;
    return r;
  });
  return { fn: fn as unknown as typeof fetch, calls };
}

const json = (body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", "X-KitGen-Protocol": "1", ...(init.headers ?? {}) },
  });

const errBody = (code: string, message = "kỹ thuật") => ({ error: { code, message } });

beforeEach(() => {
  _resetClient();
  configureClient({ location: { hostname: "127.0.0.1", pathname: "/app/", protocol: "http:", origin: "http://127.0.0.1:8765" } });
});

describe("§6.1 — header bắt buộc & cấm cookie/Authorization", () => {
  it("gửi X-KitGen-Client: 1 và Content-Type cho MỌI request, kể cả GET", async () => {
    const { fn, calls } = mockFetch([json({ ok: true })]);
    configureClient({ fetchImpl: fn });
    await httpGet("/api/projects");
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h["X-KitGen-Client"]).toBe("1");
    expect(h["Content-Type"]).toBe("application/json");
  });

  it("credentials: omit — không cookie, không phiên", async () => {
    const { fn, calls } = mockFetch([json({ ok: true })]);
    configureClient({ fetchImpl: fn });
    await httpGet("/health");
    expect(calls[0]!.init.credentials).toBe("omit");
  });

  it("LỌC BỎ Authorization/Cookie kể cả khi caller cố truyền vào (YC#7)", async () => {
    const { fn, calls } = mockFetch([json({ ok: true })]);
    configureClient({ fetchImpl: fn });
    await httpGet("/api/projects", {
      headers: { Authorization: "Bearer x", Cookie: "a=b", "If-None-Match": '"7"' },
    });
    const h = calls[0]!.init.headers as Record<string, string>;
    expect(h).not.toHaveProperty("Authorization");
    expect(h).not.toHaveProperty("Cookie");
    expect(h["If-None-Match"]).toBe('"7"'); // header hợp lệ vẫn đi qua
  });
});

describe("§6.1 — chính sách RETRY", () => {
  it("GET: retry ĐÚNG 1 LẦN khi lỗi mạng (tổng 2 lần gọi)", async () => {
    const { fn, calls } = mockFetch([new TypeError("Failed to fetch"), json({ items: [] })]);
    configureClient({ fetchImpl: fn });
    const r = await httpGet<{ items: unknown[] }>("/api/projects");
    expect(calls).toHaveLength(2);
    expect(r.items).toEqual([]);
  });

  it("GET: hỏng cả 2 lần thì ném, KHÔNG gọi lần thứ 3", async () => {
    const { fn, calls } = mockFetch([new TypeError("Failed to fetch")]);
    configureClient({ fetchImpl: fn });
    await expect(httpGet("/api/projects")).rejects.toBeInstanceOf(AgentError);
    expect(calls).toHaveLength(2);
  });

  it("POST: KHÔNG retry — tránh tạo project nhân đôi", async () => {
    const { fn, calls } = mockFetch([new TypeError("Failed to fetch")]);
    configureClient({ fetchImpl: fn });
    await expect(httpPost("/api/projects", { name: "x" })).rejects.toBeInstanceOf(AgentError);
    expect(calls).toHaveLength(1);
  });

  for (const [name, call] of [
    ["PUT", () => httpPut("/api/projects/p/contract", {})],
    ["PATCH", () => httpPatch("/api/projects/p", {})],
    ["DELETE", () => httpDelete("/api/projects/p")],
  ] as const) {
    it(`${name}: KHÔNG retry`, async () => {
      const { fn, calls } = mockFetch([new TypeError("Failed to fetch")]);
      configureClient({ fetchImpl: fn });
      await expect(call()).rejects.toBeInstanceOf(AgentError);
      expect(calls).toHaveLength(1);
    });
  }

  it("upload: KHÔNG retry", async () => {
    const { fn, calls } = mockFetch([new TypeError("Failed to fetch")]);
    configureClient({ fetchImpl: fn });
    await expect(httpUpload("/api/uploads", new FormData())).rejects.toBeInstanceOf(AgentError);
    expect(calls).toHaveLength(1);
  });

  it("/health: KHÔNG retry (1 lần gọi duy nhất)", async () => {
    const { fn, calls } = mockFetch([new TypeError("Failed to fetch")]);
    configureClient({ fetchImpl: fn });
    await expect(request("/health", { kind: "health" })).rejects.toBeInstanceOf(AgentError);
    expect(calls).toHaveLength(1);
  });

  it("GET 5xx: dùng nốt lần retry còn lại rồi mới ném", async () => {
    const { fn, calls } = mockFetch([json(errBody("AGENT_INTERNAL"), { status: 500 })]);
    configureClient({ fetchImpl: fn });
    await expect(httpGet("/api/projects")).rejects.toMatchObject({ status: 500 });
    expect(calls).toHaveLength(2);
  });

  it("GET 4xx (không phải 429): KHÔNG retry — lỗi của yêu cầu, thử lại cũng vậy", async () => {
    const { fn, calls } = mockFetch([json(errBody("PROJECT_NOT_FOUND"), { status: 404 })]);
    configureClient({ fetchImpl: fn });
    await expect(httpGet("/api/projects/x")).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    expect(calls).toHaveLength(1);
  });

  it("429 trên GET: chờ 2s rồi thử lại đúng 1 lần (§3.9 RATE_LIMITED)", async () => {
    vi.useFakeTimers();
    const { fn, calls } = mockFetch([json(errBody("RATE_LIMITED"), { status: 429 }), json({ items: [] })]);
    configureClient({ fetchImpl: fn });
    const p = httpGet<{ items: unknown[] }>("/api/projects");
    await vi.advanceTimersByTimeAsync(2100);
    await expect(p).resolves.toEqual({ items: [] });
    expect(calls).toHaveLength(2);
    vi.useRealTimers();
  });

  it("429 trên POST: KHÔNG tự retry (sẽ tạo nhân đôi)", async () => {
    const { fn, calls } = mockFetch([json(errBody("RATE_LIMITED"), { status: 429 })]);
    configureClient({ fetchImpl: fn });
    await expect(httpPost("/api/projects", {})).rejects.toMatchObject({ code: "RATE_LIMITED" });
    expect(calls).toHaveLength(1);
  });
});

describe("§6.1 — TIMEOUT theo bảng, có hạn cho mọi request trừ stream", () => {
  it("bảng timeout đúng nguyên văn spec", () => {
    expect(TIMEOUT.health).toBe(1200);
    expect(TIMEOUT.get).toBe(8000);
    expect(TIMEOUT.upload).toBe(60000);
    expect(TIMEOUT.stream).toBe(0); // 0 = KHÔNG đặt hạn
  });

  it("GET có signal của caller ⇒ VẪN tự huỷ khi quá hạn (lỗi B3 của INTEGRATION §0)", async () => {
    // Ép đi vào ĐƯỜNG LÙI AbortController+setTimeout — chính là nhánh mà bản trước
    // trả về signal của caller và ĐÁNH RƠI hạn thời gian, làm request treo vô hạn.
    const savedTimeout = AbortSignal.timeout;
    const savedAny = AbortSignal.any;
    // @ts-expect-error — cố ý gỡ để mô phỏng trình duyệt cũ
    AbortSignal.timeout = undefined;
    // @ts-expect-error — cố ý gỡ để mô phỏng trình duyệt cũ
    AbortSignal.any = undefined;
    vi.useFakeTimers();
    const fn = vi.fn(
      (_u: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_res, rej) => {
          init?.signal?.addEventListener("abort", () => {
            const e = new Error("aborted");
            e.name = "AbortError";
            rej(e);
          });
        }),
    ) as unknown as typeof fetch;
    configureClient({ fetchImpl: fn });
    const caller = new AbortController();
    const p = httpGet("/api/projects", { signal: caller.signal }).catch((e) => e);
    // GET retry 1 lần ⇒ có HAI lần chờ 8s. Phải đẩy đồng hồ qua cả hai, và đẩy làm
    // hai nhịp vì timer của lần 2 chỉ được tạo sau khi lần 1 đã huỷ.
    await vi.advanceTimersByTimeAsync(9000);
    await vi.advanceTimersByTimeAsync(9000);
    const e = await p;
    expect(e).toBeInstanceOf(AgentError);
    expect((e as AgentError).transport).toBe("timeout");
    vi.useRealTimers();
    AbortSignal.timeout = savedTimeout;
    AbortSignal.any = savedAny;
  });

  it("stream KHÔNG đặt hạn: signal truyền xuống là signal của caller", async () => {
    const { fn, calls } = mockFetch([json({ ok: true })]);
    configureClient({ fetchImpl: fn });
    const ac = new AbortController();
    await request("/api/runs/r-0001/stream", { kind: "stream", raw: true, signal: ac.signal });
    expect(calls[0]!.init.signal).toBe(ac.signal);
  });
});

describe("§6.1 — version negotiation qua X-KitGen-Protocol", () => {
  it("protocol lệch thấp ⇒ AGENT_PROTOCOL_OLD", async () => {
    const { fn } = mockFetch([json({ ok: true }, { headers: { "X-KitGen-Protocol": "0" } })]);
    configureClient({ fetchImpl: fn });
    await expect(httpGet("/api/projects")).rejects.toMatchObject({ code: "AGENT_PROTOCOL_OLD" });
  });
  it("protocol lệch cao ⇒ AGENT_PROTOCOL_NEW", async () => {
    const { fn } = mockFetch([json({ ok: true }, { headers: { "X-KitGen-Protocol": "2" } })]);
    configureClient({ fetchImpl: fn });
    await expect(httpGet("/api/projects")).rejects.toMatchObject({ code: "AGENT_PROTOCOL_NEW" });
  });
  it("thiếu header protocol thì bỏ qua, không tự suy diễn", async () => {
    const { fn } = mockFetch([new Response("{}", { status: 200, headers: { "content-type": "application/json" } })]);
    configureClient({ fetchImpl: fn });
    await expect(httpGet("/api/projects")).resolves.toBeTruthy();
  });
  it("protocolMismatch thuần khiết", () => {
    expect(protocolMismatch(1)).toBeNull();
    expect(protocolMismatch(0)).toBe("AGENT_PROTOCOL_OLD");
    expect(protocolMismatch(9)).toBe("AGENT_PROTOCOL_NEW");
    expect(protocolMismatch(null)).toBeNull();
  });
});

describe("envelope lỗi §6.1", () => {
  it("lấy code từ envelope, message giữ trong error (không lộ ra ngoài)", async () => {
    const { fn } = mockFetch([
      json({ error: { code: "CONTRACT_CONFLICT", message: "version 37 != 38", details: { serverVersion: 38 } } }, { status: 409 }),
    ]);
    configureClient({ fetchImpl: fn });
    const e = (await httpPut("/x", {}).catch((x) => x)) as AgentError;
    expect(e.code).toBe("CONTRACT_CONFLICT");
    expect(e.status).toBe(409);
    expect(e.details).toMatchObject({ serverVersion: 38 });
    expect(e.reachedAgent).toBe(true);
  });

  it("không có envelope ⇒ suy code từ status HTTP", async () => {
    const { fn } = mockFetch([new Response("nope", { status: 413, headers: { "X-KitGen-Protocol": "1" } })]);
    configureClient({ fetchImpl: fn });
    await expect(httpPost("/api/uploads", {})).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("304 trả cờ notModified thay vì ném lỗi", async () => {
    const { fn } = mockFetch([new Response(null, { status: 304, headers: { "X-KitGen-Protocol": "1", ETag: '"7"' } })]);
    configureClient({ fetchImpl: fn });
    await expect(httpGet("/api/projects")).resolves.toMatchObject({ notModified: true, etag: '"7"' });
  });
});

describe("§6.5-3 — base URL không nhận giá trị tự do", () => {
  it("chỉ nhận loopback với cổng ứng viên", () => {
    expect(isAllowedBase("http://127.0.0.1:8765")).toBe(true);
    expect(isAllowedBase("")).toBe(true); // same-origin tương đối
    expect(isAllowedBase("http://evil.example:8765")).toBe(false);
    expect(isAllowedBase("http://127.0.0.1:8125")).toBe(false); // chốt X2
  });
  it("setBase từ chối base lạ", () => {
    expect(setBase("http://evil.example:8765")).toBe(false);
    expect(setBase("http://127.0.0.1:8766")).toBe(true);
  });
});

describe("§6.5-5 — ảnh lưới LUÔN w=256", () => {
  it("thumbUrl có ?w=256, fullUrl không có", () => {
    setBase("http://127.0.0.1:8765");
    expect(thumbUrl("p1", "kits/tet/01.png")).toContain("?w=256");
    expect(fileUrl("p1", "kits/tet/01.png")).not.toContain("?w=");
  });
  it("TỪ CHỐI dựng URL có `..` — không để traversal thành request 400 âm thầm", () => {
    setBase("http://127.0.0.1:8765");
    // encodeURIComponent không mã hoá dấu chấm ⇒ nếu chỉ dựa vào nó thì `../../etc/passwd`
    // đi qua nguyên vẹn. Đây là ca đã tìm ra khi viết test, và đã vá ở fileUrl().
    expect(() => fileUrl("p1", "../../etc/passwd")).toThrow(AgentError);
    expect(() => fileUrl("p1", "raw/../../gen.sh")).toThrow(AgentError);
    expect(fileUrl("p1", "kits/tet/01-btn.png")).toBe(
      "http://127.0.0.1:8765/api/projects/p1/files/kits/tet/01-btn.png",
    );
  });
});

describe("mã xác nhận 4 số (arch §3.4 lớp 8)", () => {
  it("nhận đúng 4 chữ số", () => {
    expect(confirmHeader("4821")).toEqual({ "X-KitGen-Confirm": "4821" });
  });
  it("từ chối định dạng khác", () => {
    expect(() => confirmHeader("48")).toThrow(AgentError);
    expect(() => confirmHeader("abcd")).toThrow(AgentError);
  });
});

describe("detectEntry — nhận đúng đường vào", () => {
  it("/app/ trên loopback ⇒ mirror, same-origin", () => {
    const i = detectEntry({ hostname: "127.0.0.1", pathname: "/app/", protocol: "http:", origin: "http://127.0.0.1:8765" });
    expect(i.entry).toBe("mirror");
    expect(i.sameOrigin).toBe(true);
  });
  it("deep link /app/p/x/design vẫn là mirror", () => {
    const i = detectEntry({ hostname: "127.0.0.1", pathname: "/app/p/tet26/design", protocol: "http:", origin: "http://127.0.0.1:8765" });
    expect(i.entry).toBe("mirror");
  });
  it("HTTPS Pages ⇒ pages, KHÔNG same-origin", () => {
    const i = detectEntry({ hostname: "kitgen.pages.dev", pathname: "/", protocol: "https:", origin: "https://kitgen.pages.dev" });
    expect(i.entry).toBe("pages");
    expect(i.sameOrigin).toBe(false);
    expect(i.httpsPage).toBe(true);
  });
  it("dev server localhost:5173 ⇒ same-origin, gọi bằng đường dẫn tương đối (qua vite proxy)", () => {
    const i = detectEntry({ hostname: "localhost", pathname: "/", protocol: "http:", origin: "http://localhost:5173" });
    expect(i.sameOrigin).toBe(true);
    expect(i.base).toBe("");
  });
});
