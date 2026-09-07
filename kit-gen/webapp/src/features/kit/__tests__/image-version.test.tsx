/* @vitest-environment jsdom */
/**
 * ẢNH MỚI PHẢI HIỆN RA NGAY — KHÔNG ĐỢI F5.
 *
 * ╔══ BỆNH, NGUYÊN VĂN LỜI CHỦ SẢN PHẨM (07/09/2026) ═════════════════════════╗
 * ║ "GEN ẢNH MỚI XONG BỊ CACHE MẤY ẢNH CŨ, KHÔNG HIỆN RA LUÔN, REFRESH MỚI    ║
 * ║ ĐƯỢC."                                                                    ║
 * ║                                                                           ║
 * ║ Gốc KHÔNG nằm ở header của agent — `sendFile` đã đặt `Cache-Control:       ║
 * ║ no-cache` + ETag cho mọi file sống, chỉ ảnh của một lượt chạy mới bất biến.║
 * ║ Gốc nằm ở chỗ ảnh trong app không đi qua `<img src>` chút nào: chúng đi    ║
 * ║ qua transport (agent trả 403 cho `<img>` vì thiếu header) rồi thành object ║
 * ║ URL, và `image-source.ts` giữ một LRU khoá theo (dự án, đường dẫn, bề      ║
 * ║ rộng). Mà đường dẫn thì KHÔNG ĐỔI giữa hai lượt vẽ:                        ║
 * ║   · một tấm luôn là `raw/<tấm>.png`                                        ║
 * ║   · một ô  luôn là `kits/<phong cách>/<tên>.png`                           ║
 * ║ ⇒ ảnh mới ghi đè lên đúng chỗ cũ, khoá không đổi, cache trả lại bytes cũ.  ║
 * ║ F5 chữa được vì nó xoá cả module — đó là lý do "refresh mới được".         ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Bản trước chữa bằng `forgetProject()` (dọn cả dự án) gọi khi nghe tin ảnh mới về.
 * Không đủ, và file này khoá cả hai nửa của cách chữa thật:
 *   ① `filePath`/`loadImage` nhận `version` (là `mtime` của chính file) ⇒ file đổi thì
 *      khoá đổi VÀ url đổi; file không đổi thì vẫn là cache hit, không tải thừa.
 *   ② `KitImage` truyền nó xuống và tải lại khi nó đổi.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { filePath } from "../lib/image-source";

describe("filePath mang khoá phiên bản", () => {
  it("cùng đường dẫn, mtime khác ⇒ URL KHÁC NHAU", () => {
    const a = filePath("p1", "kits/chinh/01-btn.png", null, "2026-09-07T10:00:00.000Z");
    const b = filePath("p1", "kits/chinh/01-btn.png", null, "2026-09-07T11:00:00.000Z");
    expect(a).not.toBe(b);
    expect(a).toContain("v=");
  });

  it("KHÔNG có phiên bản ⇒ URL y hệt bản trước (không xấu đi ca nào)", () => {
    expect(filePath("p1", "raw/chinh-ui.png", null)).toBe("/api/projects/p1/files/raw/chinh-ui.png");
    expect(filePath("p1", "raw/chinh-ui.png", 256)).toBe("/api/projects/p1/files/raw/chinh-ui.png?w=256");
  });

  it("bề rộng + phiên bản đứng chung một chuỗi truy vấn hợp lệ", () => {
    /* `w` phải còn nguyên: agent đọc nó để chọn bản thu nhỏ. Nếu `v` nuốt mất `w` thì
       lưới lặng lẽ nhận ảnh gốc — đúng bệnh H4 (nạp PNG nhiều MB vào lưới). */
    const u = filePath("p1", "kits/chinh/01-btn.png", 256, "2026-09-07T10:00:00.000Z");
    expect(u).toContain("?w=256&v=");
    expect(new URL(u, "http://x").searchParams.get("w")).toBe("256");
  });

  it("phiên bản được mã hoá — dấu `:` của mốc ISO không được cắt vỡ chuỗi truy vấn", () => {
    const u = filePath("p1", "raw/chinh-ui.png", null, "2026-09-07T10:00:00.000Z");
    expect(new URL(u, "http://x").searchParams.get("v")).toBe("2026-09-07T10:00:00.000Z");
  });

  it("vẫn chặn `..` — khoá phiên bản không mở thêm đường thoát thư mục nào", () => {
    expect(() => filePath("p1", "kits/../../etc", null, "v1")).toThrow();
  });
});

/* ── KitImage: đổi phiên bản ⇒ XIN LẠI ẢNH ────────────────────────────────── */
const calls: Array<{ path: string; version: string | null }> = [];
vi.mock("@/features/kit/lib/image-source", async (orig) => ({
  ...(await orig<typeof import("../lib/image-source")>()),
  loadImage: (_pid: string, path: string, _w: number | null, version: string | null = null) => {
    calls.push({ path, version });
    return { promise: Promise.resolve("blob:x"), cancel: () => {} };
  },
}));
const { KitImage } = await import("../components/KitImage");

afterEach(() => { calls.length = 0; cleanup(); });

describe("KitImage tải lại khi file trên đĩa đổi", () => {
  const draw = (version: string | null) =>
    render(<KitImage projectId="p1" path="kits/chinh/01-btn.png" alt="Nút" backdrop="checker" version={version} />);

  it("mtime đổi ⇒ xin lại ảnh, và xin bằng ĐÚNG phiên bản mới", async () => {
    const { rerender } = draw("t1");
    await waitFor(() => expect(calls.length).toBe(1));
    rerender(<KitImage projectId="p1" path="kits/chinh/01-btn.png" alt="Nút" backdrop="checker" version="t2" />);
    await waitFor(() => expect(calls.length).toBe(2));
    expect(calls.map((c) => c.version)).toEqual(["t1", "t2"]);
  });

  it("mtime KHÔNG đổi ⇒ không xin lại — sửa cache cũ không được phép biến thành tải lại mọi lúc", async () => {
    const { rerender } = draw("t1");
    await waitFor(() => expect(calls.length).toBe(1));
    rerender(<KitImage projectId="p1" path="kits/chinh/01-btn.png" alt="Nút" backdrop="checker" version="t1" />);
    await waitFor(() => expect(calls.length).toBe(1));
  });
});
