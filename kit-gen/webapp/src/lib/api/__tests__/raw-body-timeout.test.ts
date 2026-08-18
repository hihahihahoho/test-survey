/**
 * HỒI QUY QA-BLIND §4 — HẠN THỜI GIAN KHÔNG ĐƯỢC ĐẾM TRÊN THÂN RESPONSE ĐÃ TRAO TAY.
 *
 * Triệu chứng người test mù #2 báo: ảnh tham chiếu phong cách hiện ô xám câm, trong khi
 * server trả `200 image/png` với đúng `content-length`. Tái hiện được bằng cách bóp
 * băng thông xuống 40 KB/s: header về sau 151ms, còn `response.blob()` ném `AbortError`
 * ở đúng giây thứ 8 — `TIMEOUT.get`.
 *
 * Cơ chế: `request()` đặt hạn bằng `AbortSignal.timeout(ms)`, thứ KHÔNG TẮT ĐƯỢC, rồi
 * `if (raw) return res` trao thân response cho nơi gọi trong khi đồng hồ vẫn chạy. Với
 * `raw` thì "nhận xong header" chưa phải "xong việc": `refsApi.blob` mới là chỗ gọi
 * `.blob()`. Ảnh lớn hoặc agent đang bận vì một lượt gen là quá đủ để vượt hạn.
 *
 * Cùng vết ấy có ở mọi chỗ `raw: true`: file thư viện, log job, và `image-source.ts`
 * (ảnh gốc mà [Copy sang Figma] tải về).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { _resetClient, configureClient, httpGet } from "../client";
import { TIMEOUT } from "../constants";

let captured: AbortSignal | undefined;

/** fetch giả: ghi lại signal đã nhận rồi trả header ngay, thân để nguyên cho nơi gọi. */
function stubFetch(body: string) {
  captured = undefined;
  const fn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    captured = init?.signal ?? undefined;
    return new Response(body, {
      status: 200,
      headers: { "content-type": "image/png", "X-KitGen-Protocol": "1" },
    });
  });
  configureClient({ fetchImpl: fn as unknown as typeof fetch });
}

beforeEach(() => {
  _resetClient();
  configureClient({ location: { hostname: "127.0.0.1", pathname: "/app/", protocol: "http:", origin: "http://127.0.0.1:8765" } });
  vi.useFakeTimers();
});

afterEach(() => vi.useRealTimers());

describe("`raw: true` — nơi gọi làm chủ thân response", () => {
  it("hạn của request TẮT ngay khi trao thân đi, dù đồng hồ chưa tới hạn", async () => {
    stubFetch("PNGDATA");
    const res = await httpGet<Response>("/api/projects/p1/refs/inspo-1.png/file", { raw: true });

    // Quá hạn GET rất xa — nếu đồng hồ còn chạy, `captured` đã abort.
    vi.advanceTimersByTime(TIMEOUT.get * 3);
    expect(captured?.aborted).toBe(false);

    // …và thân vẫn đọc được, đúng thứ `refsApi.blob` làm sau khi `request()` trả về.
    expect(await res.text()).toBe("PNGDATA");
  });

  it("đọc thân MUỘN hơn hạn vẫn ra đủ byte — đây là ca ảnh 700 KB qua đường chậm", async () => {
    stubFetch("X".repeat(4096));
    const res = await httpGet<Response>("/api/projects/p1/refs/big.png/file", { raw: true });
    vi.advanceTimersByTime(TIMEOUT.get + 5000);
    await expect(res.text()).resolves.toHaveLength(4096);
  });

  it("signal của CALLER vẫn huỷ được — bỏ hạn không đồng nghĩa bỏ quyền huỷ", async () => {
    stubFetch("PNGDATA");
    const ac = new AbortController();
    await httpGet<Response>("/api/projects/p1/refs/x.png/file", { raw: true, signal: ac.signal });
    expect(captured?.aborted).toBe(false);
    ac.abort();
    expect(captured?.aborted).toBe(true);
  });
});

describe("đường KHÔNG raw giữ nguyên hạn như cũ", () => {
  it("JSON đọc trong cùng nhịp ⇒ hạn vẫn được đặt và vẫn nổ nếu quá giờ", async () => {
    const fn = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      captured = init?.signal ?? undefined;
      // Không đọc thân ở đây; giữ signal để đo xem hạn có còn sống không.
      return new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json", "X-KitGen-Protocol": "1" },
      });
    });
    configureClient({ fetchImpl: fn as unknown as typeof fetch });
    await httpGet("/api/projects");
    /* Không gọi `done()` ở nhánh JSON: thân đã đọc xong trong `request()`, nhưng hạn
       vẫn phải phủ quãng đọc ấy — nên sau khi trả về, signal ĐÃ hết hạn là đúng. */
    vi.advanceTimersByTime(TIMEOUT.get + 1);
    expect(captured?.aborted).toBe(true);
  });
});
