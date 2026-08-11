/** Thành phần CÔNG KHAI của tầng UI file con — E1/Q import từ đây, không import sâu. */
export { FileTabsBar, type FileTabsBarProps } from "./FileTabsBar";
export { FileTab, type FileTabProps } from "./FileTab";
export { AllFilesPopover, type AllFilesPopoverProps } from "./AllFilesPopover";
export { TabOverflowMenu, type TabOverflowMenuProps } from "./TabOverflowMenu";
export { DraftBadgeChip } from "./DraftBadgeChip";
export { useTabKeyboard, type UseTabKeyboardInput } from "./useTabKeyboard";
export { KIND_ICON, KIND_LABEL, COLOR_DOT, COLOR_LABEL } from "./doc-visuals";

/* ─── C2: CRUD + thùng rác + Hoàn tác 10s ─── */
export { SubfileTabs, type SubfileTabsProps } from "./SubfileTabs";
export { CreateFileDialog, type CreateFileDialogProps } from "./CreateFileDialog";
export { DeleteFileDialog, type DeleteFileDialogProps } from "./DeleteFileDialog";
export { TabContextMenu, type TabContextMenuProps } from "./TabContextMenu";
export { TabRenameInput, type TabRenameInputProps } from "./TabRenameInput";
export { TrashPopover, type TrashPopoverProps } from "./TrashPopover";

/* ─── C3: a11y + overflow + edge case ───
   `subfile-a11y.ts` nằm ở `lib/` nên KHÔNG re-export ở đây (barrel này là tầng
   component). E1 import trực tiếp: `import { FILE_PANEL_ID } from "@/features/docs/lib/subfile-a11y"`.
   Lý do không đụng `lib/index.ts`: đó là barrel của provider FE-1, ngoài glob C. */
