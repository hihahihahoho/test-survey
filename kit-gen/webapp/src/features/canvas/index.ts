/**
 * API CÔNG KHAI của nhánh canvas (FE-2 · D1). E1/Q import từ đây, KHÔNG import sâu —
 * đường dẫn bên trong `components/**` và `lib/**` còn đổi nhiều ở FE-3.
 */
export { CanvasFileView, type CanvasFileViewProps } from "./CanvasFileView";
export { CanvasShell, type CanvasShellProps } from "./components/CanvasShell";
export { useCanvasDoc, useCanvasQuery, canvasKeys, type CanvasDocModel } from "./lib/use-canvas-doc";
/**
 * Hình học 5 tầng (UX-V3 §7.2). Q1 dùng chính bộ số này khi đo `getBoundingClientRect`
 * trên trình duyệt thật, để phép đo so với ĐẶC TẢ chứ không so với một con số chép tay.
 */
export {
  canvasLayerBoxes,
  cardFitsSafeArea,
  isCompactFrame,
  overlapsY,
  COMPACT_FRAME_MAX_H_PX,
  FLOAT_BOTTOM_PX,
  FLOAT_RESERVED_H_PX,
  SAFE_AREA_BOTTOM_PX,
  STRIP_BOTTOM_PX,
  STRIP_H_PX,
  type CanvasLayerBoxes,
  type LayerBox,
} from "./lib/canvas-layers";
export {
  canvasPhase,
  canvasErrorCopy,
  contentRectOf,
  saveCopy,
  showsViewport,
  type CanvasPhase,
  type CanvasSaveState,
} from "./lib/canvas-state";
