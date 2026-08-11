/**
 * webapp/src/features/design/library/** — ĐIỂM IMPORT DUY NHẤT.
 *
 * Chủ sở hữu: R2-P3. Màn S3 KHÔNG cần import từ đây: `slots.tsx` của R2-P1 tự nạp
 * `./library/ElementLibraryDrawer.tsx` bằng `import.meta.glob` và lấy export tên
 * `ElementLibraryDrawer` — đúng đường dẫn + đúng tên đã khai ở `contracts.ts`.
 *
 * File này dành cho ai cần dùng lại phần logic (ca test, màn khác muốn tra thư viện).
 */
export { ElementLibraryDrawer, type ElementLibraryDrawerProps } from "./ElementLibraryDrawer";

export { libToComponent, orientFor, suggestedSheetId } from "./lib/contract";

export {
  LIB_SOURCES, LIB_CELLS, GROUP_LABELS, CELL_LABELS, NO_GROUP, NO_GROUP_LABEL,
  groupLabel, cellLabel, skelFlags, libElementStrictSchema,
  type LibElement, type LibElementView, type LibSourceId, type LibSourceMeta, type LibCell, type SkelFlag,
} from "./lib/types";

export {
  normalizeLib, loadBundledV2, fromAgentLib, buildViews, groupOptions, filterViews,
  usedByFileMap, invalidFileName, sourceAvailability, foldVi,
  type NormalizedLib, type GroupOption, type FilterInput,
} from "./lib/source";

export { useLibrary, type UseLibraryOptions, type UseLibraryResult } from "./lib/useLibrary";
