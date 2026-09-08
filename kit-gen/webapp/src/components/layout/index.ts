/**
 * Điểm import CHUẨN cho team màn:
 *     import { useRegisterCommands, type ScreenProps } from "@/components/layout";
 *
 * Team màn thường chỉ cần 2 thứ ở đây:
 *   · `ScreenProps`            — bộ props router truyền xuống
 *   · `useRegisterCommands`    — khai lệnh riêng cho ⌘K
 * Phần còn lại là việc của khung; màn KHÔNG tự dựng header/rail/banner.
 */
export { AppLayout, type AppLayoutProps } from "./AppLayout";
export { AppBreadcrumb } from "./AppBreadcrumb";
export { AgentBanner, AgentDiagnosticBody } from "./AgentBanner";
export { CommandPalette } from "./CommandPalette";
export { ProjectJump } from "./ProjectJump";
export { ProjectRail, type RailBadges } from "./ProjectRail";
export { ShortcutsDialog } from "./ShortcutsDialog";
export { ErrorBoundary, type ErrorBoundaryProps } from "./ErrorBoundary";
export { ScreenPlaceholder } from "./ScreenPlaceholder";
export { UpdateOverlay } from "./UpdateOverlay";
export { UpdateResultNotice, announceUpdateResult } from "./UpdateResultNotice";
export { LazyScreen, KitFormRouteScreen, isScreenAvailable, availableScreens } from "./lazy-screen";
export {
  useRegisterCommands, useScreenCommands, COMMAND_GROUPS,
  type Command, type CommandFactory, type CommandGroup,
} from "./command-registry";
export {
  useGlobalShortcuts, isTypingTarget, hasMod, isMacLike, SHORTCUT_TABLE,
} from "./shortcuts";
export { RUN_CMD, RUN_CMD_REPO, ADD_WORKSPACE_CMD, updateCmd } from "./agent-commands";
export {
  SCREEN_LABEL, SCREEN_PATH, SCREEN_EXPORT, HAS_RAIL,
  type ScreenId, type ScreenProps, type ScreenComponent,
} from "./screen-contract";
