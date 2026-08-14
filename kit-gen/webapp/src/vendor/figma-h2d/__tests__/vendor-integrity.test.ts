/**
 * vendor-integrity.test.ts — CHỨNG MINH encoder chưa bị sửa một byte nào.
 *
 * Vendor một bundle 49 KB của bên thứ ba là chuyện dễ trôi: ai đó "sửa nhanh một
 * dòng cho chạy" rồi không ai biết bản trong `webapp/` đã khác bản gốc. Test này
 * băm lại phần encoder và so với sha256 đã ghi trong `README.md`. Sai một byte ⇒ đỏ.
 *
 * Nó KHÔNG đọc `kit-gen/figma-export/figma-h2d.global.js` (file gốc có thể bị đổi,
 * và webapp phải tự đứng được) — nó chốt bằng chính con số đã công bố.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

/** `kit-gen/figma-export/figma-h2d.global.js` @ commit 7fe471f. */
const ORIGIN_BYTES = 49_115;
const ORIGIN_SHA256 = "735886cc915e8b0be3c366c75ece67c736fe2e227704304a4d4c4c28f00aec01";

const VENDORED = new URL("../figma-h2d.global.js", import.meta.url);

describe("vendor/figma-h2d giữ nguyên bản gốc", () => {
  it("49 115 byte đầu tiên băm đúng sha256 của bản gốc", async () => {
    const buf = await readFile(VENDORED);
    expect(buf.byteLength).toBeGreaterThan(ORIGIN_BYTES);
    const head = buf.subarray(0, ORIGIN_BYTES);
    expect(createHash("sha256").update(head).digest("hex")).toBe(ORIGIN_SHA256);
  });

  it("phần thêm vào CHỈ là một câu lệnh export, không có mã chạy được nào khác", async () => {
    const tail = (await readFile(VENDORED)).subarray(ORIGIN_BYTES).toString("utf8");
    const code = tail.replace(/\/\*[\s\S]*?\*\//g, "").trim();
    expect(code).toBe("export default figmaH2D;");
  });

  it("README công bố đúng con số mà test này đang chốt", async () => {
    const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
    expect(readme).toContain(ORIGIN_SHA256);
    expect(readme).toContain("49 115 byte");
  });
});
