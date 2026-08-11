/**
 * webapp/src/features/design/preview/** — ĐIỂM IMPORT DUY NHẤT.
 *
 * Chủ sở hữu: R2-P3 (thư viện element + preview khung xương).
 * R2-P1 (khung + CRUD) nhúng `SheetPreviewPanel` vào tab "Khung xương" của vùng ②;
 * panel thuộc tính ③ dùng `ElementMetricsLine` để hiện cỡ px thật của element.
 *
 * KHÔNG import sâu vào file bên trong: mọi thứ dùng được đều nằm ở đây.
 */
export { SheetPreviewPanel, type SheetPreviewPanelProps } from "./SheetPreviewPanel";
export { SkeletonPreview, type SkeletonPreviewProps } from "./SkeletonPreview";
export { Silhouette, SilhouetteGroup, type SilhouetteProps, type SilhouetteGroupProps } from "./Silhouette";
export { SheetMetricsLine, ElementMetricsLine, type SheetMetricsLineProps, type ElementMetricsLineProps } from "./CellMetrics";

/* Hình khối + whitelist + 19 dáng là của R2-P1 (`../lib/shapes.ts`, sinh tự động từ
   engine). Re-export để `preview/` vẫn là một cửa import duy nhất, KHÔNG chép lại. */
export {
  shapeLabel, shapeOptions, poseOptions, poseLabel, isKnownShape, shapeWhitelist,
  silhouetteMarkup, poseSvgMarkup, SIL_FILL, SIL_EDGE, SHAPE_META, POSE_META, SLICE_CONST, MATTE_VALUES,
  type SkelLike as ShapeSkelLike,
} from "../lib/shapes";

export {
  CANVAS_LANDSCAPE, CANVAS_PORTRAIT, SLICE_BLEED, BLEED_IS_FIXED,
  cellAspect, canvasOf, gridOf, cellMetrics, elementBox, elementMetrics,
  sheetOrient, clampFrac, simpleRatio, formatPx, suggestCellHint, effectiveCellHint,
  type Orient, type CellMetrics, type ElementBox, type ElementMetrics, type SkelLike, type AnySkel,
} from "./geometry";
