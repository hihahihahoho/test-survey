/**
 * features/canvas/lib/canvas-layers.ts — HÌNH HỌC 5 TẦNG của bàn làm việc.
 *
 * ĐÂY LÀ NGUỒN SỐ DUY NHẤT cho lỗi FLOW-V3 §5 («thẻ giới thiệu đè thanh nổi, chữ đè chữ»).
 * Đặc tả: UX-V3 §7.2 (bảng 5 tầng có số đo) + §7.3 (6 tiêu chí đo được).
 *
 * VÌ SAO PHẢI CÓ FILE NÀY thay vì rải số vào JSX: lỗi cũ sinh ra đúng vì hai lớp
 * (`empty` và cụm `strip + floatbar`) **không lớp nào biết lớp kia** — mỗi lớp tự đoán
 * chỗ trống của mình. Ở đây số nằm một chỗ, component đọc số đó, và test đọc **cùng** số
 * đó rồi tự chứng minh các tầng không giao nhau. Đổi một số ⇒ test tính lại ngay.
 *
 * THUẦN HÀM: không React, không DOM ⇒ chạy được ở vitest environment "node".
 */

/* ═════════ 1. Số đo neo (UX-V3 §7.2) ═════════ */

/** Tầng 4 — floatbar: cách đáy 16px, chiều cao DÀNH RIÊNG 48px. */
export const FLOAT_BOTTOM_PX = 16;
export const FLOAT_RESERVED_H_PX = 48;

/** Tầng 3 — dải trạng thái: neo `bottom-[88px]`, cao cố định 28px. */
export const STRIP_BOTTOM_PX = 88;
export const STRIP_H_PX = 28;

/** Tầng 2 — vùng an toàn của thẻ giới thiệu: khung trừ 160px đáy. */
export const SAFE_AREA_BOTTOM_PX = 160;

/**
 * Chiều cao TỐI ĐA cho phép của thẻ giới thiệu ở hai dạng.
 * `COMPACT_MAX_H_PX` là bản thu gọn (tiêu đề + 1 câu, ẩn khối gợi ý).
 */
export const CARD_FULL_MAX_H_PX = 360;
export const CARD_COMPACT_MAX_H_PX = 200;

/**
 * Ngưỡng thu gọn = 520px, và nó KHÔNG phải số bịa: 520 − 160 (vùng đáy dành riêng)
 * = 360 = đúng `CARD_FULL_MAX_H_PX`. Dưới ngưỡng này, thẻ đầy đủ không còn chỗ ⇒ thu gọn.
 * Bất biến đó được test khẳng định lại, nên không ai đổi lệch một trong hai số.
 */
export const COMPACT_FRAME_MAX_H_PX = SAFE_AREA_BOTTOM_PX + CARD_FULL_MAX_H_PX; // 520

/* ═════════ 2. Class Tailwind ↔ số ═════════
 *
 * Class viết THẲNG dạng chuỗi (không ghép động) để Tailwind quét ra CSS thật — bài học
 * «class chết» của `scripts/check-dead-classes.mjs`. Test `layering-geometry` khẳng định
 * từng cặp `className ↔ px` khớp nhau, nên hai bên không thể trôi khỏi nhau trong im lặng.
 *
 * `bottom-[160px]` / `bottom-[88px]` là **giá trị arbitrary CÓ CHỦ Ý**: UX-V3 §7.2 viết
 * đúng hai số này, mà thang spacing mặc định của Tailwind không có bậc 88px (22) —
 * làm tròn xuống 80px là tự ý đổi đặc tả. Đã xin bậc token ở `NEEDS-fe3-c.md` N2.
 */
export const LAYER_CLASS = {
  /** Tầng 2 — KHÔNG dùng `inset-0` nữa (đó chính là nguyên nhân lỗi, UX-V3 §7.1). */
  safeArea: { className: "bottom-[160px]", px: SAFE_AREA_BOTTOM_PX },
  stripBottom: { className: "bottom-[88px]", px: STRIP_BOTTOM_PX },
  stripHeight: { className: "h-7", px: STRIP_H_PX },
  floatBottom: { className: "bottom-4", px: FLOAT_BOTTOM_PX },
  floatHeight: { className: "min-h-12", px: FLOAT_RESERVED_H_PX },
} as const;

/**
 * Thang z. CHƯA CÓ token `--kg-z-*` (đã xin: NEEDS-fe3-c.md N1) ⇒ dùng bậc số kèm chú
 * thích trỏ UX-V3 §7.2. Hai bậc cao hơn đã có tên trong `tailwind.config.ts`:
 * `z-rail` = 110, `z-floatbar` = 200 (FloatingToolbar của R0 tự đặt).
 * Thứ tự phải giữ: thế giới 0 < thẻ 10 < dải 20 < rail 110 < floatbar 200.
 */
export const LAYER_Z = {
  card: "z-10",
  strip: "z-20",
} as const;

/* ═════════ 3. Hình học ═════════ */

/** Hộp theo trục Y, gốc là MÉP TRÊN của khung canvas (cùng quy ước `getBoundingClientRect`). */
export interface LayerBox {
  top: number;
  bottom: number;
  height: number;
}

export interface CanvasLayerBoxes {
  /** Vùng an toàn — thẻ giới thiệu bị kẹp bên trong, không bao giờ ra ngoài. */
  safeArea: LayerBox;
  /** Dải trạng thái (hàng riêng, cao cố định). */
  strip: LayerBox;
  /** Thanh công cụ nổi (chiều cao là phần DÀNH RIÊNG, thực tế có thể thấp hơn). */
  float: LayerBox;
}

/**
 * Tính hộp của ba tầng ghim-theo-màn-hình từ chiều cao khung.
 *
 * `frameHeight` là chiều cao KHUNG CANVAS (`vp.containerSize.height`), không phải chiều
 * cao cửa sổ: header/banner agent nằm ngoài khung này. Test và Q1 phải dùng đúng số đó.
 */
export function canvasLayerBoxes(frameHeight: number): CanvasLayerBoxes {
  const h = Number.isFinite(frameHeight) && frameHeight > 0 ? frameHeight : 0;

  const floatTop = h - FLOAT_BOTTOM_PX - FLOAT_RESERVED_H_PX;
  const stripTop = h - STRIP_BOTTOM_PX - STRIP_H_PX;
  const safeBottom = h - SAFE_AREA_BOTTOM_PX;

  return {
    safeArea: { top: 0, bottom: safeBottom, height: Math.max(safeBottom, 0) },
    strip: { top: stripTop, bottom: h - STRIP_BOTTOM_PX, height: STRIP_H_PX },
    float: { top: floatTop, bottom: h - FLOAT_BOTTOM_PX, height: FLOAT_RESERVED_H_PX },
  };
}

/** Hai hộp có giao nhau theo trục Y không? (chạm mép KHÔNG tính là giao) */
export function overlapsY(a: LayerBox, b: LayerBox): boolean {
  return a.bottom > b.top && b.bottom > a.top;
}

/**
 * Khung thấp ⇒ thẻ giới thiệu thu gọn (UX-V3 §7.3: «giữ tiêu đề + 1 câu, ẩn 3 dòng gợi ý»).
 * Khung chưa đo được (0) ⇒ **không** thu gọn: thà hiện đủ một nhịp rồi co lại, còn hơn
 * nháy sang bản cụt ở mọi lần mount.
 */
export function isCompactFrame(frameHeight: number): boolean {
  return Number.isFinite(frameHeight) && frameHeight > 0 && frameHeight < COMPACT_FRAME_MAX_H_PX;
}

/** Thẻ (ở dạng đang chọn) có lọt vùng an toàn của khung này không. */
export function cardFitsSafeArea(frameHeight: number): boolean {
  const { safeArea } = canvasLayerBoxes(frameHeight);
  const need = isCompactFrame(frameHeight) ? CARD_COMPACT_MAX_H_PX : CARD_FULL_MAX_H_PX;
  return safeArea.height >= need;
}
