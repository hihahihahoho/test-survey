/**
 * Cửa duy nhất của lab Prompt Composer.
 *
 * Route chỉ được biết tới hai màn; extension, node view và kho preset là chuyện
 * bên trong. Xuất thêm bộ serialize vì đó là mảnh DUY NHẤT của lab này đáng đi
 * tiếp nếu ý tưởng được chốt — phần còn lại là UI thử nghiệm.
 */
export { PromptComposerScreen } from "./PromptComposerScreen";
export { PresetsScreen } from "./PresetsScreen";
export { serializeComposer, countComposerImages } from "./lib/serialize-composer";
export { serializeDoc, type PromptDocNode } from "./lib/serialize";
