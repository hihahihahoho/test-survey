/**
 * Cửa vào DUY NHẤT của panel kết quả — thứ cắm vào `SheetResultSlot` của
 * `PromptCanvasScreen`. Xuất cả kiểu props để nơi cắm không phải đoán hình dạng.
 *
 * KHÔNG chạm `features/prompt-canvas/index.ts`: file đó đang do màn Prompt Canvas
 * giữ; nơi cắm import thẳng `./components/result` là đủ và không đụng ai.
 */
export { SheetResultPanel, type SheetResultPanelProps } from "./SheetResultPanel";
export { SheetCellGrid, type SheetCellGridProps } from "./SheetCellGrid";
export { SheetVersionBar, type SheetVersionBarProps } from "./SheetVersionBar";
export { SheetGridOverlay, type SheetGridOverlayProps } from "./SheetGridOverlay";
export { SheetFitPicker, fitSummary, FIT_MODE_LABEL, FIT_MODE_HINT, type SheetFitPickerProps } from "./SheetFitPicker";
