/**
 * webapp/src/lib/viewport/viewport.ts — TOÁN thuần của khung nhìn.
 *
 * Không React, không DOM, không side-effect ⇒ test được bằng vitest environment "node".
 * Hook `useViewport()` chỉ là lớp vỏ state + event quanh các hàm ở đây.
 */
import type { Point, Rect, Size, Viewport, ViewportCommand } from "./types";

/** Giới hạn phóng: UI-SPEC-V2 §2.4 "Zoom 10–400%" ⇒ k ∈ [0.1, 4]. */
export const MIN_K = 0.1;
export const MAX_K = 4;

/** Khung nhìn gốc: không dời, 100%. */
export const IDENTITY: Viewport = { x: 0, y: 0, k: 1 };

/** Bước zoom của `⌘=`/`⌘-` — 1.2 cho ~4 nhấn là gấp đôi, đủ mượt mà không lạc chỗ. */
export const ZOOM_STEP = 1.2;

/** Lề chừa khi `fit`, tính theo pixel màn hình. */
export const FIT_PADDING = 48;

/** Ngưỡng coi hai khung nhìn là "một" (tránh setState vô ích gây re-render). */
const EPS = 1e-6;

/**
 * Kẹp hệ số phóng. `NaN`/`±Infinity` là dữ liệu hỏng (chia cho 0 ở tầng trên) ⇒ trả
 * **1**, không trả MAX_K: phóng vọt lên 400% vì một phép chia sai là hành vi tệ hơn
 * nhiều so với về 100%.
 */
export const clampScale = (k: number): number => {
  if (!Number.isFinite(k)) return 1;
  return Math.min(MAX_K, Math.max(MIN_K, k));
};

export const sameViewport = (a: Viewport, b: Viewport): boolean =>
  Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS && Math.abs(a.k - b.k) < EPS;

/** screen = world * k + (x, y) */
export const toScreen = (vp: Viewport, world: Point): Point => ({
  x: world.x * vp.k + vp.x,
  y: world.y * vp.k + vp.y,
});

/** world = (screen - (x, y)) / k */
export const toWorld = (vp: Viewport, screen: Point): Point => ({
  x: (screen.x - vp.x) / vp.k,
  y: (screen.y - vp.y) / vp.k,
});

/** Dời khung nhìn theo delta PIXEL MÀN HÌNH (đúng bằng quãng con trỏ đi). */
export const panBy = (vp: Viewport, dx: number, dy: number): Viewport => ({
  x: vp.x + dx,
  y: vp.y + dy,
  k: vp.k,
});

/**
 * Phóng về hệ số `nextK` NHƯNG giữ nguyên điểm thế giới đang nằm dưới `anchor`
 * (toạ độ màn hình, tương đối với khung chứa).
 *
 * Suy ra: gọi w = toWorld(vp, anchor). Muốn toScreen(vp', w) === anchor
 *   ⇒ w * k' + x' = anchor  ⇒ x' = anchor - w * k'.
 * Vì k bị clamp nên khi đã chạm trần/sàn, hàm trả về đúng vp cũ (không trôi ảnh).
 */
export const zoomAt = (vp: Viewport, nextK: number, anchor: Point): Viewport => {
  const k = clampScale(nextK);
  if (Math.abs(k - vp.k) < EPS) return vp;
  const world = toWorld(vp, anchor);
  return { k, x: anchor.x - world.x * k, y: anchor.y - world.y * k };
};

/** Nhân hệ số hiện tại với `factor`, neo tại `anchor`. */
export const zoomByFactor = (vp: Viewport, factor: number, anchor: Point): Viewport =>
  zoomAt(vp, vp.k * factor, anchor);

/** Tâm khung chứa — mặc định làm điểm neo cho zoom bằng BÀN PHÍM (không có con trỏ). */
export const centerOf = (size: Size): Point => ({ x: size.width / 2, y: size.height / 2 });

/**
 * Bbox rỗng = không có gì để fit: null, kích thước ≤ 0, hoặc chứa số không hữu hạn.
 * Trả `boolean` chứ KHÔNG dùng type-predicate `rect is null`: nó sẽ thu hẹp nhánh
 * else thành `never` cho ca `Rect|null` và làm tsc báo lỗi sai chỗ.
 */
export const isEmptyRect = (rect: Rect | null | undefined): boolean =>
  !rect ||
  !Number.isFinite(rect.x) ||
  !Number.isFinite(rect.y) ||
  !Number.isFinite(rect.width) ||
  !Number.isFinite(rect.height) ||
  rect.width <= 0 ||
  rect.height <= 0;

/**
 * Đưa `rect` (hệ thế giới) vào giữa khung chứa `size`.
 *
 * CA BBOX RỖNG (tiêu chí nghiệm thu B1): KHÔNG chia cho 0, KHÔNG trả NaN, KHÔNG ném lỗi.
 *  - rect rỗng nhưng có toạ độ hợp lệ ⇒ về 100% và **canh giữa điểm đó** (người dùng
 *    vẫn "đi tới chỗ đó" được — hợp lý cho node kích thước 0 hoặc file mới trống).
 *  - rect null/không hữu hạn ⇒ về `IDENTITY`.
 * Khung chứa chưa đo được (0×0, xảy ra ở lần render đầu) ⇒ giữ nguyên `IDENTITY`,
 * người gọi sẽ fit lại khi ResizeObserver báo kích thước thật.
 */
export const fitRect = (
  rect: Rect | null | undefined,
  size: Size,
  padding: number = FIT_PADDING,
): Viewport => {
  if (!Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0) {
    return IDENTITY;
  }
  if (isEmptyRect(rect)) {
    // Chỉ canh-giữa-điểm khi bbox SUY BIẾN nhưng còn lành (w/h = 0 hoặc âm).
    // Bbox có số không hữu hạn = DỮ LIỆU HỎNG ⇒ về IDENTITY, không đoán ý.
    const point =
      rect &&
      Number.isFinite(rect.x) &&
      Number.isFinite(rect.y) &&
      Number.isFinite(rect.width) &&
      Number.isFinite(rect.height)
        ? rect
        : null;
    if (!point) return IDENTITY;
    const c = centerOf(size);
    return { k: 1, x: c.x - point.x, y: c.y - point.y };
  }
  // Tới đây `rect` chắc chắn là bbox lành (isEmptyRect ở trên đã loại hết ca hỏng),
  // nhưng tsc không suy ra được từ một hàm trả boolean ⇒ kiểm lại một dòng, rẻ và thật.
  if (!rect) return IDENTITY;
  // Lề không được ăn hết khung: khung hẹp hơn 4×padding thì thu lề lại.
  const pad = Math.max(0, Math.min(padding, Math.min(size.width, size.height) / 4));
  const inner = { width: size.width - pad * 2, height: size.height - pad * 2 };
  const k = clampScale(Math.min(inner.width / rect.width, inner.height / rect.height));
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const c = centerOf(size);
  return { k, x: c.x - cx * k, y: c.y - cy * k };
};

/** Gộp nhiều bbox thành một; mảng rỗng ⇒ `null` (đi vào ca bbox rỗng ở trên). */
export const unionRects = (rects: readonly Rect[]): Rect | null => {
  let out: { x1: number; y1: number; x2: number; y2: number } | null = null;
  for (const r of rects) {
    if (isEmptyRect(r)) continue;
    const x2 = r.x + r.width;
    const y2 = r.y + r.height;
    out = out
      ? { x1: Math.min(out.x1, r.x), y1: Math.min(out.y1, r.y), x2: Math.max(out.x2, x2), y2: Math.max(out.y2, y2) }
      : { x1: r.x, y1: r.y, x2, y2 };
  }
  return out ? { x: out.x1, y: out.y1, width: out.x2 - out.x1, height: out.y2 - out.y1 } : null;
};

/** Về 100% nhưng GIỮ NGUYÊN điểm thế giới ở tâm khung (⌘0 không được làm lạc chỗ). */
export const actualSize = (vp: Viewport, size: Size): Viewport => zoomAt(vp, 1, centerOf(size));

/** Bối cảnh cần để thi hành một lệnh khung nhìn (hook cấp qua ref/DOM, test cấp trực tiếp). */
export interface CommandContext {
  size: Size;
  /** bbox thế giới của TOÀN BỘ nội dung; `null` = trống. */
  contentRect?: Rect | null;
  /** bbox thế giới của vật đang chọn; `null` = chưa chọn gì. */
  selectionRect?: Rect | null;
  fitPadding?: number;
}

/**
 * Thi hành một `ViewportCommand` — **thuần**, không React.
 * Hook `useViewport().run()` chỉ gọi hàm này rồi commit kết quả, nhờ vậy toàn bộ
 * đường BÀN PHÍM test được ở environment "node" (repo chưa có jsdom — xem vitest.config.ts).
 */
export const applyCommand = (vp: Viewport, cmd: ViewportCommand, ctx: CommandContext): Viewport => {
  const center = centerOf(ctx.size);
  switch (cmd.type) {
    case "pan":
      return panBy(vp, cmd.dx, cmd.dy);
    case "zoomStep":
      return zoomAt(vp, vp.k * (cmd.direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP), center);
    case "actualSize":
      return actualSize(vp, ctx.size);
    case "fitAll":
      return fitRect(ctx.contentRect ?? null, ctx.size, ctx.fitPadding);
    case "fitSelection":
      // Chưa chọn gì ⇒ hành xử như ⌘1. Không có "phím chết" (a11y §5.8).
      return fitRect(ctx.selectionRect ?? ctx.contentRect ?? null, ctx.size, ctx.fitPadding);
  }
};
