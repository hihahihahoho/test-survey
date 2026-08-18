import { describe, expect, it } from "vitest";
import { kitFileSchema, kitSchema } from "../api";

/**
 * HỒI QUY QA-BLIND §1 — SỐ ĐO QA CỦA `slice.py` PHẢI SỐNG SÓT QUA SCHEMA.
 *
 * Ba người test mù độc lập cùng trúng một lỗi: engine tự chấm `validation.ok:false`
 * (lệch tới 70px trên ngưỡng 15) mà tab "Ảnh thật" — tab MẶC ĐỊNH, và cũng là nguồn
 * của [Tải .zip] / [Copy sang Figma] — không có một dấu hiệu nào.
 *
 * Nguyên nhân KHÔNG nằm ở agent: `agent/routes/files.mjs:105` gửi `sizeDeviation` cho
 * từng file và `:121` gửi `qa` tổng. Nó nằm ở đây — `kitFileSchema`/`kitSchema` không
 * khai hai khoá ấy, và `z.looseObject` cho khoá lạ đi qua mà KHÔNG đưa vào kiểu, nên
 * `CutAssetGrid` không có đường nào đọc được.
 *
 * Hình dạng dưới đây chép từ dữ liệu THẬT trong báo cáo `teams/blind-qa-1/REPORT.md`
 * và từ `slice.py:920-925` (mỗi ô) + `slice.py:1372-1383` (tổng manifest).
 */
describe("#42 GET …/kit — sổ đo QA đi tới được webapp", () => {
  it("`sizeDeviation` của một ô BỊ GẮN CỜ giữ nguyên số đo", () => {
    const r = kitFileSchema.safeParse({
      file: "01-btn-pill-red",
      path: "kits/chinh/tight/01-btn-pill-red.png",
      w: 520, h: 218,
      sizeDeviation: {
        maxEdgePx: 70, flagged: true, threshold: 15,
        edgesPx: { left: -30, top: -23, right: 60, bottom: 70 },
      },
    });
    expect(r.success).toBe(true);
    expect(r.data?.sizeDeviation?.flagged).toBe(true);
    expect(r.data?.sizeDeviation?.maxEdgePx).toBe(70);
    expect(r.data?.sizeDeviation?.threshold).toBe(15);
    expect(r.data?.sizeDeviation?.edgesPx?.bottom).toBe(70);
  });

  it("ô `shape:\"full\"` không đo được ⇒ `maxEdgePx:null`, KHÔNG phải 0 và không gắn cờ", () => {
    const r = kitFileSchema.safeParse({
      file: "25-bg-home", path: "kits/chinh/25-bg-home.png",
      sizeDeviation: { maxEdgePx: null, flagged: false, threshold: 15, edgesPx: null },
    });
    expect(r.success).toBe(true);
    expect(r.data?.sizeDeviation?.maxEdgePx).toBeUndefined();
    expect(r.data?.sizeDeviation?.flagged).toBe(false);
  });

  /* Kit cắt bằng `slice.py` đời trước không có khối này. Ném ở đây = giết cả danh mục
     kit = khoá vĩnh viễn [Tải .zip] và [Copy sang Figma] — đúng lớp lỗi mà
     `agent-null-shapes.test.ts` đã ghi một lần. */
  it("kit CŨ không có `sizeDeviation` vẫn mở được", () => {
    const r = kitFileSchema.safeParse({ file: "01-btn", path: "kits/chinh/01-btn.png" });
    expect(r.success).toBe(true);
    expect(r.data?.sizeDeviation).toBeUndefined();
  });

  it("`sizeDeviation: null` (agent gửi null khi chưa biết) không ném", () => {
    const r = kitFileSchema.safeParse({ file: "01-btn", path: "p.png", sizeDeviation: null });
    expect(r.success).toBe(true);
    expect(r.data?.sizeDeviation).toBeUndefined();
  });

  it("`qa` tổng của manifest giữ đủ `flaggedCount` và danh sách ô bị gắn cờ", () => {
    const r = kitSchema.safeParse({
      variant: "chinh",
      files: [],
      qa: {
        sizeDeviation: {
          threshold: 15, measured: 1, flagged: true, flaggedCount: 1, maxEdgePx: 70,
          flaggedAssets: [{ style: "chinh", file: "01-btn-pill-red.png", maxEdgePx: 70 }],
        },
      },
    });
    expect(r.success).toBe(true);
    expect(r.data?.qa?.sizeDeviation?.flaggedCount).toBe(1);
    expect(r.data?.qa?.sizeDeviation?.flaggedAssets[0]?.file).toBe("01-btn-pill-red.png");
  });

  it("kit không có khoá `qa` (agent cũ) vẫn parse được", () => {
    const r = kitSchema.safeParse({ variant: "chinh", files: [] });
    expect(r.success).toBe(true);
    expect(r.data?.qa).toBeUndefined();
  });
});
