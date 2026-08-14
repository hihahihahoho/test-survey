/**
 * NÚT "Tải .zip" — KHOÁ ĐÚNG ĐƯỜNG DẪN NÓ GỌI RA.
 *
 * Hồi quy đã xảy ra thật (blind-test: bấm nút, không có file nào rơi xuống, không có
 * lỗi nào đọc được): `KitExits` ghép `exportZipPath()` — vốn đã là ĐƯỜNG DẪN API đầy
 * đủ — vào `saveProjectFile()` — vốn nhận đường dẫn TƯƠNG ĐỐI TRONG DỰ ÁN rồi tự bọc
 * `/api/projects/<id>/files/…`. Kết quả gửi đi là
 *   /api/projects/p1/files/api/projects/p1/export.zip%3Finclude%3Dkits%26variant%3Dchinh
 * ⇒ agent trả 400 PATH_ESCAPE (`routes/files.mjs` chỉ cho đọc raw/kits/refs/skeleton/
 * prompts/export/runs/cover; `api` không nằm trong đó).
 *
 * Vì sao test Ở ĐÂY chứ không phải test DOM của nút: config vitest mặc định chạy
 * `environment: "node"` và loại `*.dom.test.tsx` (jsdom chưa có trong devDependencies —
 * món nợ hạ tầng đã ghi ở `vitest.config.ts`). Mà thứ hỏng KHÔNG phải cái nút, là
 * **đường dẫn**. Nên khoá ở tầng gọi được từ node: `saveExportZip` — cửa duy nhất mà
 * `KitExits` dùng — và bắt đúng chuỗi đã gửi cho transport.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const httpGet = vi.fn<(path: string, opts: unknown) => Promise<unknown>>();

/* Mock TỪNG PHẦN: `@/lib/api/client` còn xuất `streamRun`, `AgentError`… mà
   `lib/api/endpoints.ts` nạp kèm theo chuỗi import. Thay cả module là gãy ở chỗ khác. */
vi.mock("@/lib/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/client")>()),
  httpGet: (path: string, opts: unknown) => httpGet(path, opts),
}));

const { saveExportZip, exportZipPath, zipFallbackName } = await import("../lib/download");

/** Response giả đủ dùng cho `savePath`: `.blob()` + `headers.get`. */
function fakeResponse(disposition: string | null, bytes = 9) {
  return {
    headers: { get: (k: string) => (k.toLowerCase() === "content-disposition" ? disposition : null) },
    blob: async () => ({ size: bytes }) as unknown as Blob,
  };
}

let clicked: number;
let downloadAttr: string | null;

beforeEach(() => {
  httpGet.mockReset();
  clicked = 0;
  downloadAttr = null;
  // `saveBlob` chạm DOM thật; ở môi trường node phải dựng đúng ba thứ nó dùng.
  vi.stubGlobal("document", {
    createElement: () => ({
      href: "", rel: "", download: "",
      click() { clicked += 1; downloadAttr = (this as { download: string }).download; },
      remove() {},
    }),
    body: { appendChild: () => {} },
  });
  vi.stubGlobal("URL", Object.assign(globalThis.URL, {
    createObjectURL: () => "blob:test",
    revokeObjectURL: () => {},
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("saveExportZip — đường dẫn gửi cho agent", () => {
  it("gọi ĐÚNG route export.zip của agent, KHÔNG lồng dưới /files/", async () => {
    httpGet.mockResolvedValue(fakeResponse('attachment; filename="kitgen-tet-20260814.zip"'));

    await saveExportZip("tet-2026", ["kits"]);

    expect(httpGet).toHaveBeenCalledTimes(1);
    const [path, opts] = httpGet.mock.calls[0]!;
    expect(path).toBe("/api/projects/tet-2026/export.zip?include=kits");
    // Hồi quy: đây là hình dạng SAI đã từng gửi đi. Không được quay lại.
    expect(path).not.toContain("/files/");
    expect(path).not.toContain("%3F");
    expect(path).not.toContain("%26");
    // `raw` để đọc được Content-Disposition; `upload` = timeout 60s, KHÔNG retry (§6.1).
    expect(opts).toMatchObject({ raw: true, kind: "upload" });
  });

  it("KHÔNG khoá cứng phong cách — mặc định là mọi phong cách (tránh 422 UNKNOWN_VARIANT)", async () => {
    httpGet.mockResolvedValue(fakeResponse(null));
    await saveExportZip("p1", ["kits"]);
    expect(httpGet.mock.calls[0]![0]).not.toContain("variant=");
  });

  it("vẫn lọc được phong cách khi nơi gọi CHỦ ĐỘNG khai", async () => {
    httpGet.mockResolvedValue(fakeResponse(null));
    await saveExportZip("p1", ["kits", "raw"], "vang");
    expect(httpGet.mock.calls[0]![0]).toBe("/api/projects/p1/export.zip?include=kits%2Craw&variant=vang");
  });

  it("tên file lấy từ Content-Disposition của agent (§4.7), không phải do web bịa", async () => {
    httpGet.mockResolvedValue(fakeResponse('attachment; filename="kitgen-tet-2026-20260814.zip"', 4345));
    const saved = await saveExportZip("tet-2026", ["kits"]);
    expect(saved).toEqual({ fileName: "kitgen-tet-2026-20260814.zip", bytes: 4345 });
    expect(clicked).toBe(1);
    expect(downloadAttr).toBe("kitgen-tet-2026-20260814.zip");
  });

  it("agent không gửi Content-Disposition ⇒ vẫn tải, tên rơi về `kitgen-<id>-<ngày>.zip`", async () => {
    httpGet.mockResolvedValue(fakeResponse(null));
    const saved = await saveExportZip("p1", ["kits"]);
    expect(saved.fileName).toBe(zipFallbackName("p1"));
    expect(clicked).toBe(1);
  });

  it("lỗi của agent KHÔNG bị nuốt — nơi gọi phải hiện toast lỗi được", async () => {
    httpGet.mockRejectedValue(new Error("400 PATH_ESCAPE"));
    await expect(saveExportZip("p1", ["kits"])).rejects.toThrow("PATH_ESCAPE");
    expect(clicked).toBe(0);
  });
});

/**
 * Chốt chặn thứ hai, đọc THẲNG mã nguồn của nút.
 * Bốn ca trên khoá `saveExportZip`; nhưng hồi quy thật nằm ở chỗ NƠI GỌI tự ghép hai
 * hàm không được phép nối tiếp. Cùng lối `review.test.tsx` đã dùng để canh
 * `<DownloadKitButton` trong `ImagesSection.tsx` (test DOM chưa chạy được, xem đầu file).
 */
describe("KitExits — nút chỉ được đi qua cửa saveExportZip", () => {
  it("KHÔNG bọc đường dẫn export.zip vào saveProjectFile/filePath nữa", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(
      new URL("../../workflow-v4/components/KitExits.tsx", import.meta.url),
      "utf8",
    );
    // Kiểm LỜI GỌI, không kiểm chữ: chú thích của file có nhắc tên hai hàm cũ để kể
    // lại bug — cấm cả chữ thì phải xoá luôn lời giải thích, đắt hơn cái nó bảo vệ.
    expect(src).toMatch(/saveExportZip\(/);
    expect(src).not.toMatch(/saveProjectFile\(/);
    expect(src).not.toMatch(/\bfilePath\(/);
    expect(src).not.toMatch(/exportZipPath\(/);
  });
});

describe("exportZipPath", () => {
  it("include rỗng/nhiều mục và variant rỗng đều sinh URL hợp lệ", () => {
    expect(exportZipPath("p1", ["kits"], null)).toBe("/api/projects/p1/export.zip?include=kits");
    expect(exportZipPath("p1", ["kits"], "")).toBe("/api/projects/p1/export.zip?include=kits");
    expect(exportZipPath("a b", ["contract", "refs"], null))
      .toBe("/api/projects/a%20b/export.zip?include=contract%2Crefs");
  });
});
