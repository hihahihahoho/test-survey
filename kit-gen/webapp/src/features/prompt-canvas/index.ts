/**
 * Cửa của Prompt Canvas — MÀN LÀM VIỆC CHÍNH của một dự án (route `/k/:projectId`).
 *
 * Tầng logic vẫn là những module tách rời, không trộn: LƯU (`composer-doc`), ẢNH
 * (`pill-image`), DỊCH RA CONTRACT (`composer-to-contract`), HÀNG ĐỢI VẼ
 * (`gen-queue`), XEM PROMPT (`block-prompt`), ẢNH DÁNG (`pose-refs`). Chúng hỏng
 * theo những kiểu khác nhau và phải test được riêng — đó là lý do không có một
 * `canvas-store` gộp tất cả.
 */
export { PromptCanvasScreen } from "./PromptCanvasScreen";
export { SheetResultSlot, type SheetResultSlotProps } from "./components/SheetResultSlot";
export { CanvasBlock, type CanvasBlockProps } from "./components/CanvasBlock";
export { jobIdOf, rawPathOf, sheetsHash } from "./lib/block-jobs";
export { useGenQueue, WAITING_COPY, type GenBlockState, type GenQueue, type GenStatus } from "./lib/gen-queue";
export { useBlockPrompts, type BlockPromptState, type BlockPrompts } from "./lib/block-prompt";
export { ensurePoseRefs, type PoseRefOutcome } from "./lib/pose-refs";
export { canComposePoseSheet, cellBoxes, composePoseSheet, fitBox, type PoseSheetBox } from "./lib/pose-sheet";
export {
  COMPOSER_DOC_VERSION,
  COMPOSER_SAVE_DEBOUNCE_MS,
  emptyComposerDoc,
  isLegacyWizardDraft,
  migrateComposerDoc,
  useComposerDoc,
  type ComposerDoc,
  type ComposerDocStore,
} from "./lib/composer-doc";
export {
  EMPTY_PILL_IMAGE,
  dataUrlToFile,
  hasPillImage,
  readPillImage,
  uploadPillImage,
  type PillImage,
  type PillImageSource,
} from "./lib/pill-image";
export {
  composerBlockSheets,
  composerToContract,
  narrowContractToSheets,
  type BlockSheets,
  type ComposerContractOptions,
} from "./lib/composer-to-contract";
export { PromptProjectContext, usePromptProjectId } from "./lib/project-context";
