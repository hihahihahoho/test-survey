/**
 * Điểm import CHUẨN của tầng khung nhìn:
 *   import { useViewport } from "@/lib/viewport";
 *
 * Nội bộ tách 3 tầng để test được và để FE-3 thay cử chỉ chuột mà không đụng toán:
 *   viewport.ts (toán thuần) · keys.ts (bàn phím) · useViewport.ts (state + event React)
 */
export { useViewport, type UseViewportOptions, type UseViewportResult } from "./useViewport";
export {
  IDENTITY,
  MIN_K,
  MAX_K,
  ZOOM_STEP,
  FIT_PADDING,
  actualSize,
  applyCommand,
  centerOf,
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
  type CommandContext,
} from "./viewport";
export { PAN_STEP, PAN_STEP_FAST, VIEWPORT_SHORTCUTS, resolveViewportCommand } from "./keys";
export type { KeyLike, Point, Rect, Size, Viewport, ViewportCommand } from "./types";
