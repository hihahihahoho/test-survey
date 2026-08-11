/**
 * Test tầng TOÁN của khung nhìn (B1 — FE-PLAN §3).
 * Ba tiêu chí nghiệm thu được kiểm ở đây: zoom quanh con trỏ sai số <0.5px · clamp ·
 * `fit` với bbox rỗng. Chạy environment "node", không cần DOM.
 */
import { describe, expect, it } from "vitest";
import {
  IDENTITY,
  MAX_K,
  MIN_K,
  actualSize,
  clampScale,
  fitRect,
  isEmptyRect,
  panBy,
  sameViewport,
  toScreen,
  toWorld,
  unionRects,
  zoomAt,
  zoomByFactor,
} from "../viewport";
import type { Viewport } from "../types";

const SIZE = { width: 1200, height: 800 };
/** Sai số cho phép của điểm neo, tính bằng pixel màn hình (tiêu chí ①: <0.5px). */
const ANCHOR_TOL = 0.5;

describe("đổi toạ độ", () => {
  it("toWorld và toScreen là hai chiều nghịch nhau", () => {
    const vp: Viewport = { x: -137.5, y: 92.25, k: 2.75 };
    const p = { x: 613.4, y: -21.8 };
    const back = toScreen(vp, toWorld(vp, p));
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it("panBy cộng thẳng pixel MÀN HÌNH, không chia cho k", () => {
    expect(panBy({ x: 10, y: 20, k: 3 }, 5, -7)).toEqual({ x: 15, y: 13, k: 3 });
  });
});

describe("zoomAt — giữ đúng điểm dưới con trỏ", () => {
  const anchors = [
    { x: 0, y: 0 },
    { x: 1, y: 799 },
    { x: 613.4, y: 221.7 },
    { x: 1200, y: 800 },
    { x: -50, y: 933.3 }, // con trỏ đi ra ngoài khung khi kéo vẫn phải đúng
  ];
  const scales = [0.13, 0.5, 1, 1.37, 2.5, 3.99];

  it("điểm thế giới dưới con trỏ không xê dịch quá 0.5px với mọi cặp (neo, k)", () => {
    let worst = 0;
    for (const anchor of anchors) {
      for (const from of scales) {
        for (const to of scales) {
          const vp: Viewport = { x: -321.5, y: 77.25, k: from };
          const world = toWorld(vp, anchor);
          const next = zoomAt(vp, to, anchor);
          const after = toScreen(next, world);
          worst = Math.max(worst, Math.abs(after.x - anchor.x), Math.abs(after.y - anchor.y));
        }
      }
    }
    expect(worst).toBeLessThan(ANCHOR_TOL);
    // Thực tế phải nhỏ hơn nhiều lần ngưỡng — nếu chỉ vừa đủ là công thức đã sai kiểu khác.
    expect(worst).toBeLessThan(1e-9);
  });

  it("100 bước zoom liên tiếp quanh cùng một điểm không trôi (tích luỹ sai số)", () => {
    const anchor = { x: 411.3, y: 268.9 };
    let vp: Viewport = { x: 12, y: -34, k: 1 };
    const world = toWorld(vp, anchor);
    for (let i = 0; i < 100; i++) vp = zoomByFactor(vp, i % 2 === 0 ? 1.2 : 1 / 1.2, anchor);
    const after = toScreen(vp, world);
    expect(Math.abs(after.x - anchor.x)).toBeLessThan(ANCHOR_TOL);
    expect(Math.abs(after.y - anchor.y)).toBeLessThan(ANCHOR_TOL);
  });

  it("chạm trần/sàn thì GIỮ NGUYÊN khung nhìn, không dời ảnh", () => {
    const top: Viewport = { x: 5, y: 6, k: MAX_K };
    expect(zoomAt(top, 99, { x: 10, y: 10 })).toBe(top);
    const bottom: Viewport = { x: 5, y: 6, k: MIN_K };
    expect(zoomAt(bottom, 0.001, { x: 10, y: 10 })).toBe(bottom);
  });
});

describe("clamp k ∈ [0.1, 4]", () => {
  it("kẹp hai đầu và chặn giá trị không hữu hạn", () => {
    expect(clampScale(0)).toBe(MIN_K);
    expect(clampScale(-3)).toBe(MIN_K);
    expect(clampScale(1000)).toBe(MAX_K);
    expect(clampScale(2.5)).toBe(2.5);
    // Số không hữu hạn = dữ liệu hỏng ⇒ về 1, KHÔNG vọt lên trần 400%.
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(1);
    expect(clampScale(Number.NEGATIVE_INFINITY)).toBe(1);
  });

  it("zoomAt không bao giờ trả k ngoài khoảng", () => {
    for (const k of [-10, 0, 0.05, 0.1, 1, 4, 4.0001, 50]) {
      const out = zoomAt({ x: 0, y: 0, k: 1 }, k, { x: 100, y: 100 });
      expect(out.k).toBeGreaterThanOrEqual(MIN_K);
      expect(out.k).toBeLessThanOrEqual(MAX_K);
    }
  });
});

describe("fit", () => {
  it("bbox thường: canh giữa và vừa khít trong lề", () => {
    const rect = { x: 0, y: 0, width: 1000, height: 500 };
    const vp = fitRect(rect, SIZE);
    // Tâm bbox rơi đúng tâm khung
    const c = toScreen(vp, { x: 500, y: 250 });
    expect(c.x).toBeCloseTo(600, 6);
    expect(c.y).toBeCloseTo(400, 6);
    // Nội dung nằm trọn trong khung
    const tl = toScreen(vp, { x: 0, y: 0 });
    const br = toScreen(vp, { x: 1000, y: 500 });
    expect(tl.x).toBeGreaterThanOrEqual(0);
    expect(tl.y).toBeGreaterThanOrEqual(0);
    expect(br.x).toBeLessThanOrEqual(SIZE.width);
    expect(br.y).toBeLessThanOrEqual(SIZE.height);
  });

  it("bbox rỗng (null) ⇒ IDENTITY, không NaN, không ném lỗi", () => {
    expect(fitRect(null, SIZE)).toEqual(IDENTITY);
    expect(fitRect(undefined, SIZE)).toEqual(IDENTITY);
  });

  it("bbox kích thước 0 nhưng có toạ độ ⇒ 100% và canh giữa điểm đó", () => {
    const vp = fitRect({ x: 300, y: -120, width: 0, height: 0 }, SIZE);
    expect(vp.k).toBe(1);
    expect(Number.isFinite(vp.x)).toBe(true);
    const p = toScreen(vp, { x: 300, y: -120 });
    expect(p.x).toBeCloseTo(600, 6);
    expect(p.y).toBeCloseTo(400, 6);
  });

  it("bbox chứa NaN/Infinity ⇒ IDENTITY", () => {
    expect(fitRect({ x: Number.NaN, y: 0, width: 10, height: 10 }, SIZE)).toEqual(IDENTITY);
    expect(fitRect({ x: 0, y: 0, width: Number.POSITIVE_INFINITY, height: 10 }, SIZE)).toEqual(IDENTITY);
  });

  it("khung chứa chưa đo được (0×0) ⇒ IDENTITY, chờ ResizeObserver", () => {
    expect(fitRect({ x: 0, y: 0, width: 10, height: 10 }, { width: 0, height: 0 })).toEqual(IDENTITY);
  });

  it("bbox tí hon không làm k vượt trần 4; bbox khổng lồ không xuống dưới 0.1", () => {
    expect(fitRect({ x: 0, y: 0, width: 1, height: 1 }, SIZE).k).toBe(MAX_K);
    expect(fitRect({ x: 0, y: 0, width: 1e6, height: 1e6 }, SIZE).k).toBe(MIN_K);
  });

  it("khung rất hẹp: lề tự thu, không âm kích thước", () => {
    const vp = fitRect({ x: 0, y: 0, width: 100, height: 100 }, { width: 60, height: 60 });
    expect(vp.k).toBeGreaterThan(0);
    expect(Number.isFinite(vp.x) && Number.isFinite(vp.y)).toBe(true);
  });

  it("isEmptyRect nhận đúng các ca rỗng", () => {
    expect(isEmptyRect(null)).toBe(true);
    expect(isEmptyRect({ x: 0, y: 0, width: 0, height: 5 })).toBe(true);
    expect(isEmptyRect({ x: 0, y: 0, width: -5, height: 5 })).toBe(true);
    expect(isEmptyRect({ x: 0, y: 0, width: 5, height: 5 })).toBe(false);
  });
});

describe("unionRects", () => {
  it("gộp đúng và bỏ qua bbox rỗng", () => {
    expect(
      unionRects([
        { x: 0, y: 0, width: 10, height: 10 },
        { x: 100, y: -20, width: 5, height: 5 },
        { x: 50, y: 50, width: 0, height: 0 },
      ]),
    ).toEqual({ x: 0, y: -20, width: 105, height: 30 });
  });

  it("mảng rỗng / toàn rỗng ⇒ null (đi vào ca fit bbox rỗng)", () => {
    expect(unionRects([])).toBeNull();
    expect(unionRects([{ x: 1, y: 1, width: 0, height: 0 }])).toBeNull();
  });
});

describe("actualSize (⌘0)", () => {
  it("về k=1 mà giữ nguyên điểm thế giới ở tâm khung", () => {
    const vp: Viewport = { x: -400, y: 133, k: 2.4 };
    const centerWorld = toWorld(vp, { x: 600, y: 400 });
    const next = actualSize(vp, SIZE);
    expect(next.k).toBe(1);
    const after = toScreen(next, centerWorld);
    expect(Math.abs(after.x - 600)).toBeLessThan(ANCHOR_TOL);
    expect(Math.abs(after.y - 400)).toBeLessThan(ANCHOR_TOL);
  });
});

describe("sameViewport", () => {
  it("so sánh có dung sai để chặn re-render vô ích", () => {
    expect(sameViewport({ x: 1, y: 2, k: 3 }, { x: 1 + 1e-12, y: 2, k: 3 })).toBe(true);
    expect(sameViewport({ x: 1, y: 2, k: 3 }, { x: 1.01, y: 2, k: 3 })).toBe(false);
  });
});
