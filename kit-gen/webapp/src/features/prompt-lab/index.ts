/**
 * Cửa của `features/prompt-lab`.
 *
 * 07/09/2026 — hai màn demo (`PromptComposerScreen`, `PresetsScreen`) và ba route
 * `/lab/*` của chúng đã bị xoá. Thứ còn lại KHÔNG phải một lab nữa: nó là bộ
 * component + lib mà khu soạn prompt `/k/:id` (`features/prompt-canvas`) dùng
 * thật. Cửa này chỉ giữ bộ serialize — phần còn lại prompt-canvas import thẳng
 * theo đường dẫn con, đúng như nó vẫn làm.
 */
export { serializeComposer, countComposerImages } from "./lib/serialize-composer";
export { serializeDoc, type PromptDocNode } from "./lib/serialize";
