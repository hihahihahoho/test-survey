import { describe, expect, it } from "vitest";
import {
  CARD_COMPACT_MAX_H_PX,
  CARD_FULL_MAX_H_PX,
  COMPACT_FRAME_MAX_H_PX,
  FLOAT_BOTTOM_PX,
  FLOAT_RESERVED_H_PX,
  LAYER_CLASS,
  LAYER_Z,
  SAFE_AREA_BOTTOM_PX,
  STRIP_BOTTOM_PX,
  STRIP_H_PX,
  canvasLayerBoxes,
  cardFitsSafeArea,
  isCompactFrame,
  overlapsY,
} from "../lib/canvas-layers";

/**
 * HÌNH HỌC 5 TẦNG — kiểm bằng SỐ, không bằng "nhìn thấy ổn" (UX-V3 §7.3).
 *
 * ⚠️ GIỚI HẠN TRUNG THỰC, đọc trước khi tin bộ test này:
 * đây là test THUẦN TOÁN trên chính bộ số đặc tả, KHÔNG phải phép đo pixel trên trình
 * duyệt thật. Nó chứng minh: (a) bộ số của UX-V3 §7.2 tự nó không cho hai tầng giao nhau
 * ở 4 viewport bắt buộc, (b) class Tailwind trong mã khớp từng số đó. Việc trình duyệt có
 * dựng đúng như số hay không là phép đo `getBoundingClientRect` THẬT — thuộc Q1.
 * Xem `fe3/C1-REPORT.md` §5.
 */

/** Bốn khung bắt buộc của §7.3. Chiều cao KHUNG CANVAS = cao cửa sổ − header 56px. */
const HEADER_PX = 56;
const VIEWPORTS = [
  { name: "1280×720", frame: 720 - HEADER_PX },
  { name: "1440×900", frame: 900 - HEADER_PX },
  { name: "1920×1080", frame: 1080 - HEADER_PX },
  { name: "1280×640 (thu cửa sổ)", frame: 640 - HEADER_PX },
] as const;

describe("bộ số của UX-V3 §7.2 tự nó nhất quán", () => {
  it("vùng đáy dành riêng 160px = dải (88+28) + thanh nổi (16+48) không âm, còn chỗ thở", () => {
    const stripTopFromBottom = STRIP_BOTTOM_PX + STRIP_H_PX; // 116
    const floatTopFromBottom = FLOAT_BOTTOM_PX + FLOAT_RESERVED_H_PX; // 64
    expect(stripTopFromBottom).toBeLessThan(SAFE_AREA_BOTTOM_PX);
    expect(floatTopFromBottom).toBeLessThan(STRIP_BOTTOM_PX); // thanh nổi kết thúc DƯỚI dải
    /*
      KHOẢNG THỞ THẬT = 160 − (88 + 28) = **44px**, KHÔNG phải 24px như dòng ngoặc của
      UX-V3 §7.2 tầng 2 («dải + floatbar + thở 24px») gợi ý. Cộng theo cách đó ra
      28 + 48 + 24 = 100 ≠ 160. Ba số neo (160 / 88 / 28 / 16 / 48) đều là số CHỐT trong
      bảng, còn «24px» chỉ nằm trong dấu ngoặc giải thích ⇒ tôi giữ số neo và sửa lời
      giải thích, chứ không kéo 160 xuống 100 (làm thế thẻ sẽ sát thanh nổi hơn hẳn ý đồ).
      Đã hỏi lại UX ở `NEEDS-fe3-c.md` N6. Điều PHẢI đúng — không giao nhau — vẫn đúng,
      và còn dư hơn yêu cầu.
    */
    expect(SAFE_AREA_BOTTOM_PX - stripTopFromBottom).toBe(44);
    expect(SAFE_AREA_BOTTOM_PX - stripTopFromBottom).toBeGreaterThanOrEqual(24);
  });

  it("ngưỡng thu gọn 520px KHÔNG phải số bịa: 160 + 360 = 520", () => {
    expect(COMPACT_FRAME_MAX_H_PX).toBe(SAFE_AREA_BOTTOM_PX + CARD_FULL_MAX_H_PX);
    expect(COMPACT_FRAME_MAX_H_PX).toBe(520);
    expect(CARD_COMPACT_MAX_H_PX).toBeLessThan(CARD_FULL_MAX_H_PX);
  });

  it("thang z giữ đúng thứ tự thẻ < dải < rail < floatbar", () => {
    // `z-rail` = 110 và `z-floatbar` = 200 khai trong tailwind.config.ts (R0).
    const num = (cls: string) => Number(cls.replace("z-", ""));
    expect(num(LAYER_Z.card)).toBeLessThan(num(LAYER_Z.strip));
    expect(num(LAYER_Z.strip)).toBeLessThan(110);
  });
});

describe.each(VIEWPORTS)("$name — ba tầng ghim đáy không tầng nào giao tầng nào", ({ frame }) => {
  const boxes = canvasLayerBoxes(frame);

  it("thẻ giới thiệu kết thúc TRÊN thanh nổi (card.bottom ≤ float.top)", () => {
    expect(boxes.safeArea.bottom).toBeLessThanOrEqual(boxes.float.top);
  });

  it("dải trạng thái không giao thẻ VÀ không giao thanh nổi", () => {
    expect(overlapsY(boxes.strip, boxes.safeArea)).toBe(false);
    expect(overlapsY(boxes.strip, boxes.float)).toBe(false);
  });

  it("thẻ ở dạng đang chọn LỌT vùng an toàn (không phải cắt bớt mới vừa)", () => {
    expect(cardFitsSafeArea(frame)).toBe(true);
  });
});

describe("khung thấp ⇒ thu gọn, không tràn", () => {
  it("khung 500px (< 520) ⇒ compact, và thẻ thu gọn vẫn lọt vùng an toàn 340px", () => {
    expect(isCompactFrame(500)).toBe(true);
    expect(canvasLayerBoxes(500).safeArea.height).toBe(340);
    expect(cardFitsSafeArea(500)).toBe(true);
  });

  it("khung 520px (đúng ngưỡng) ⇒ CHƯA thu gọn, thẻ đầy đủ vừa khít 360px", () => {
    expect(isCompactFrame(520)).toBe(false);
    expect(canvasLayerBoxes(520).safeArea.height).toBe(CARD_FULL_MAX_H_PX);
  });

  it("khung chưa đo được (0 / NaN / âm) ⇒ KHÔNG thu gọn, và không sinh số âm/NaN", () => {
    for (const bad of [0, Number.NaN, -100]) {
      expect(isCompactFrame(bad)).toBe(false);
      const b = canvasLayerBoxes(bad);
      expect(Number.isFinite(b.safeArea.height)).toBe(true);
      expect(b.safeArea.height).toBeGreaterThanOrEqual(0);
    }
  });

  it("kể cả khung rất thấp 300px, dải và thanh nổi vẫn không giao nhau", () => {
    const b = canvasLayerBoxes(300);
    expect(overlapsY(b.strip, b.float)).toBe(false);
  });
});

describe("class Tailwind trong mã KHỚP số trong đặc tả (không trôi khỏi nhau)", () => {
  it("bottom-[160px] / bottom-[88px] / h-7 / bottom-4 / min-h-12 đúng px", () => {
    expect(LAYER_CLASS.safeArea).toEqual({ className: "bottom-[160px]", px: 160 });
    expect(LAYER_CLASS.stripBottom).toEqual({ className: "bottom-[88px]", px: 88 });
    expect(LAYER_CLASS.stripHeight).toEqual({ className: "h-7", px: 28 }); // 7 × 4px
    expect(LAYER_CLASS.floatBottom).toEqual({ className: "bottom-4", px: 16 }); // 4 × 4px
    expect(LAYER_CLASS.floatHeight).toEqual({ className: "min-h-12", px: 48 }); // 12 × 4px
  });

  it("class thang 4px được viết bằng BẬC có sẵn, chỉ hai số của §7.2 là arbitrary", () => {
    const arbitrary = Object.values(LAYER_CLASS).filter((l) => l.className.includes("["));
    expect(arbitrary.map((l) => l.className).sort()).toEqual(["bottom-[88px]", "bottom-[160px]"].sort());
  });
});
