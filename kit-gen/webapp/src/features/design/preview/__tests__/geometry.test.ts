/**
 * geometry.test.ts — KÍCH THƯỚC Ô/ELEMENT phải khớp ENGINE, không phải khớp trực giác.
 *
 * Đây là phần user tin để quyết định "có tốn lượt gen hay không". Sai số ở đây =
 * user tưởng nút 300px hoá ra 102px, gen xong mới biết, mất 2–5 phút + quota.
 * Vì vậy mọi ca dưới đây đối chiếu với MÃ NGUỒN THẬT (`gen.sh`, `skeleton.py`,
 * `slice.py`) chứ không phải với số tôi tự đặt.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BLEED_IS_FIXED, CANVAS_LANDSCAPE, CANVAS_PORTRAIT, SLICE_BLEED,
  canvasOf, cellAspect, cellMetrics, effectiveCellHint, elementBox, elementMetrics,
  formatPx, gridOf, sheetOrient, simpleRatio, suggestCellHint,
} from "../geometry";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../../../");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

const sheet = (cols: number, rows: number, orient?: "landscape" | "portrait") => ({
  orient,
  grid: { cols, rows },
});

describe("khổ ảnh sinh — đúng gen.sh dòng 35 và skeleton.py", () => {
  it("con số 1536×1024 / 1024×1536 có THẬT trong mã engine", () => {
    expect(read("gen.sh")).toContain("PORTRAIT 1024x1536");
    expect(read("gen.sh")).toContain("LANDSCAPE 1536x1024");
    expect(read("skeleton.py")).toMatch(/SW,\s*SH\s*=\s*\(1024,\s*1536\)\s*if/);
  });

  it("khớp hằng số trong code của tôi", () => {
    expect(CANVAS_LANDSCAPE).toEqual({ w: 1536, h: 1024 });
    expect(CANVAS_PORTRAIT).toEqual({ w: 1024, h: 1536 });
    expect(canvasOf(sheet(4, 4))).toEqual({ w: 1536, h: 1024 });
    expect(canvasOf(sheet(4, 4, "portrait"))).toEqual({ w: 1024, h: 1536 });
    expect(sheetOrient(undefined)).toBe("landscape");
  });
});

describe("chia ô — `cw, ch = SW/cols, SH/rows` (skeleton.py) = `W/COLS, H/ROWS` (slice.py)", () => {
  it("hai công thức của engine giống nhau, và tôi dùng đúng nó", () => {
    expect(read("skeleton.py")).toMatch(/cw,\s*ch\s*=\s*SW\s*\/\s*cols,\s*SH\s*\/\s*rows/);
    expect(read("slice.py")).toMatch(/cell_w,\s*cell_h\s*=\s*W\s*\/\s*COLS,\s*H\s*\/\s*ROWS/);
    const m = cellMetrics(sheet(4, 4));
    expect(m.cellPx).toEqual({ w: 384, h: 256 });
  });

  it("lưới 1×1 (sheet nền) = nguyên khổ ảnh", () => {
    expect(cellMetrics(sheet(1, 1)).cellPx).toEqual({ w: 1536, h: 1024 });
    expect(cellMetrics(sheet(1, 1, "portrait")).cellPx).toEqual({ w: 1024, h: 1536 });
  });

  it("tỉ lệ ô: 4×4 landscape ra đúng 3:2", () => {
    expect(cellAspect(sheet(4, 4))).toBeCloseTo(1.5);
    expect(cellAspect(sheet(4, 4, "portrait"))).toBeCloseTo(2 / 3);
  });

  it("lưới KHÔNG vuông thì tỉ lệ ô đổi theo — không cứng nhắc 3:2", () => {
    // 1536/2 = 768 rộng, 1024/4 = 256 cao ⇒ ô rất bẹt (3:1)
    expect(cellMetrics(sheet(2, 4)).cellPx).toEqual({ w: 768, h: 256 });
    expect(cellAspect(sheet(2, 4))).toBeCloseTo(3);
  });

  it("lưới hỏng/thiếu → 1×1, KHÔNG chia cho 0, không NaN", () => {
    expect(gridOf(null)).toEqual({ cols: 1, rows: 1 });
    expect(gridOf({ grid: { cols: 0, rows: -3 } })).toEqual({ cols: 1, rows: 1 });
    expect(Number.isFinite(cellMetrics(null).cellPx.w)).toBe(true);
  });
});

describe("vành bleed — slice.py dòng 66 + 788–789", () => {
  it("BLEED = 0.18 là HẰNG SỐ MODULE (căn cứ cảnh báo M4)", () => {
    expect(read("slice.py")).toMatch(/^BLEED\s*=\s*0\.18/m);
    expect(SLICE_BLEED).toBe(0.18);
    expect(BLEED_IS_FIXED).toBe(true);
  });

  it("canvas file cắt ra = ô + 2×bleed, đúng `CVW, CVH = CW + 2*BX, CH + 2*BY`", () => {
    expect(read("slice.py")).toMatch(/CVW,\s*CVH\s*=\s*CW\s*\+\s*2\s*\*\s*BX,\s*CH\s*\+\s*2\s*\*\s*BY/);
    const m = cellMetrics(sheet(4, 4));
    // BX = round(384*0.18) = 69 · BY = round(256*0.18) = 46
    expect(m.bleedPx).toEqual({ x: 69, y: 46 });
    expect(m.exportPx).toEqual({ w: 384 + 138, h: 256 + 92 });
  });
});

describe("đặt element trong ô — skeleton.py dòng 104–107", () => {
  it("công thức căn giữa + anchor bottom có thật trong skeleton.py", () => {
    const src = read("skeleton.py");
    expect(src).toMatch(/ew,\s*eh\s*=\s*cw\s*\*\s*sk\["w"\],\s*ch\s*\*\s*sk\["h"\]/);
    expect(src).toMatch(/anchor"\)\s*==\s*"bottom"/);
  });

  it("căn giữa: nút pill 0.78×0.4 trong ô 4×4 ra 300×102 px", () => {
    const m = elementMetrics(sheet(4, 4), { shape: "pill", w: 0.78, h: 0.4 });
    expect(m.elementPx).toEqual({ w: 300, h: 102 });
    const box = elementBox({ shape: "pill", w: 0.78, h: 0.4 }, 384, 256);
    expect(box.x).toBeCloseTo((384 - 384 * 0.78) / 2);
    expect(box.y).toBeCloseTo((256 - 256 * 0.4) / 2);
  });

  it("anchor bottom: dán đáy, chừa 4% chiều cao ô", () => {
    const box = elementBox({ shape: "figure", w: 0.5, h: 0.8, anchor: "bottom" }, 384, 256);
    expect(box.y).toBeCloseTo(256 - 256 * 0.8 - 256 * 0.04);
  });

  it("`full` phủ KÍN ô và KHÔNG có khung safe (skeleton.py vẽ riêng, không kẻ khung)", () => {
    const box = elementBox({ shape: "full" }, 384, 256);
    expect([box.x, box.y, box.w, box.h]).toEqual([0, 0, 384, 256]);
    expect(box.isFull).toBe(true);
    expect(box.hasSafeFrame).toBe(false);
  });

  it("`free` KHÔNG vẽ khung safe — đúng `if not sk.get(\"free\")` của skeleton.py", () => {
    expect(read("skeleton.py")).toContain('not sk.get("free")');
    expect(elementBox({ shape: "burst", w: 0.6, h: 0.9, free: true }, 384, 256).hasSafeFrame).toBe(false);
    expect(elementBox({ shape: "burst", w: 0.6, h: 0.9 }, 384, 256).hasSafeFrame).toBe(true);
  });

  it("ô trống không có khung safe", () => {
    expect(elementBox({ shape: "empty" }, 384, 256).hasSafeFrame).toBe(false);
  });

  it("w/h hỏng → rơi về 0.8/0.6 để ô vẫn vẽ được, không biến mất", () => {
    const box = elementBox({ shape: "pill", w: Number.NaN, h: -1 }, 100, 100);
    expect(box.w).toBeCloseTo(80);
    expect(box.h).toBeCloseTo(60);
  });

  it("% diện tích ô tính đúng", () => {
    const m = elementMetrics(sheet(4, 4), { shape: "pill", w: 0.5, h: 0.5 });
    expect(Math.round(m.areaPercent)).toBe(25);
  });
});

describe("định dạng cho người đọc", () => {
  it("tỉ lệ rút gọn: số nhỏ thì a:b, số to thì bỏ về dạng thập phân", () => {
    expect(simpleRatio(1536, 1024)).toBe("3:2");
    expect(simpleRatio(384, 256)).toBe("3:2");
    /* 300:102 rút gọn đúng ra là 50:17 — nhưng "50:17" không nói lên hình dáng gì
       cho người đọc, nên quá 24 thì chuyển sang "2.9:1". Ca này chốt lại lựa chọn đó
       (chính nó bắt được kỳ vọng sai của tôi lúc viết test lần đầu). */
    expect(simpleRatio(300, 102)).toBe("2.9:1");
    expect(simpleRatio(1000, 37)).toBe("27.0:1");
    expect(simpleRatio(102, 300)).toBe("1:2.9");
    expect(simpleRatio(0, 5)).toBe("—");
    expect(simpleRatio(Number.NaN, 5)).toBe("—");
  });

  it("px", () => {
    expect(formatPx(383.6, 256.4)).toBe("384 × 256 px");
  });
});

describe("cell_hint — câu ghép thẳng vào prompt (gen.sh dòng 43)", () => {
  it("gen.sh thật sự nhét `cell_hint` vào prompt", () => {
    expect(read("gen.sh")).toContain(`sh.get('cell_hint', 'cell')`);
  });

  it("sheet có hint thì dùng nguyên văn, không tự chế", () => {
    const r = effectiveCellHint({ ...sheet(4, 4), cell_hint: "landscape 3:2 cell" });
    expect(r).toEqual({ text: "landscape 3:2 cell", isSuggestion: false });
  });

  it("thiếu hint thì gợi ý theo tỉ lệ ô THẬT và nói rõ là gợi ý", () => {
    const r = effectiveCellHint(sheet(4, 4));
    expect(r.isSuggestion).toBe(true);
    expect(r.text).toBe("landscape 3:2 cell");
    expect(suggestCellHint(sheet(2, 4))).toBe("landscape 3:1 cell");
    expect(suggestCellHint(sheet(4, 4, "portrait"))).toBe("portrait 2:3 cell");
  });
});
