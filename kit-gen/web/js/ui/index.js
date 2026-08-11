/**
 * index.js — cửa vào DUY NHẤT của design system (UX-SPEC §5).
 * Team sau chỉ cần:
 *     import { createButton, openModal, toast } from '../ui/index.js';
 * và trong HTML: <link rel="stylesheet" href="./css/app.css">
 *
 * KHÔNG có framework, KHÔNG build step, KHÔNG npm, KHÔNG CDN. ES modules thuần,
 * chạy được cả khi mở từ Cloudflare Pages và khi agent phục vụ same-origin
 * tại http://127.0.0.1:8765/app/ (đường dẫn tương đối ở mọi import).
 *
 * 12 primitive theo §5.5–5.6:
 *   1  button              -> createButton, setLoading, setDisabled
 *   2  input/select/textarea -> createInput, createSelect, createTextarea, createCheckbox
 *      + dropzone         -> createDropzone (gộp 3 bản tự dựng của các team màn)
 *   3  modal               -> openModal (focus trap, Esc, trả focus)
 *   4  toast               -> toast.success/info/warning/error (có Hoàn tác, aria-live)
 *   5  badge/pill          -> createJobBadge (7), createRunBadge (5), createAgentPill (6)
 *   6  card                -> createCard, createSection, createThumb
 *   7  table/list          -> createTable, createList
 *   8  tabs                -> createTabs
 *   9  drawer              -> openDrawer
 *  10  tooltip             -> attachTooltip, createInfoPopover
 *  11  empty-state         -> createEmptyState, createErrorState, createBanner
 *  12  spinner/skeleton    -> createSpinner, createSkeleton*, createTopProgress
 *  +   confirm-dialog      -> confirmDestructive, confirmLight, confirmChecklist
 *  +   menu                -> attachMenu (⋯, mở bằng Shift+F10)
 */

export { el, append, clear, icon, srOnly, uid, cx, on, disposers, prefersReducedMotion } from './dom.js';
export { focusables, focusFirst, trapFocus, createOverlayController, overlayCount } from './focus.js';

export { createButton, createButtonGroup, setLoading, setDisabled } from './button.js';
export { createInput, createSelect, createTextarea, createCheckbox, createSegmented, createCodeBlock } from './field.js';
export { createDropzone } from './dropzone.js';
export {
  createBadge, createJobBadge, createRunBadge, createAgentPill, createTag,
  createStatusDot, createMatrixCell, worstJobState,
  JOB_STATES, JOB_PRIORITY, RUN_STATES, AGENT_STATES,
} from './badge.js';
export { createCard, createSection, createThumb } from './card.js';
export { createTable, createList } from './table.js';
export { createTabs } from './tabs.js';
export { openModal, createModalFooter } from './modal.js';
export { confirmDestructive, confirmLight, confirmChecklist } from './confirm-dialog.js';
export { openDrawer } from './drawer.js';
export { attachTooltip, createInfoPopover } from './tooltip.js';
export { attachMenu } from './menu.js';
export { createEmptyState, createErrorState, createBanner, createDevDetails } from './empty-state.js';
export { createSpinner, createSpinnerRow, createSkeleton, createSkeletonCard, createSkeletonGrid, createTopProgress } from './spinner.js';
export { toast } from './toast.js';
