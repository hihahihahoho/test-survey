/**
 * features/demo — MÀN DEMO HTML → FIGMA (backlog #21).
 *
 * Bốn tầng, ranh giới chép đúng `figma-node.ts`: ① spec + ② số học là **hàm thuần**
 * (test được bằng kit thật, không cần trình duyệt); ③ DOM + ④ encoder chạm trình duyệt
 * và **ném mọi lỗi ra ngoài** để nơi gọi nói đúng chuyện đã xảy ra.
 *
 *   ① `lib/screen-spec.ts` + `data/screens.default.ts` — bố cục màn (dữ liệu mới)
 *   ② `lib/resolve-scene.ts`  — spec ⋈ kit → px tuyệt đối, `missing`/`broken`/`glow`
 *   ③ `lib/scene-dom.ts`      — DOM dùng chung cho xem trước và cho lượt chụp
 *   ④ `lib/scene-figma.ts`    — `assertSceneDoc` · `encodeScenes` · copy clipboard
 *
 * Thiết kế đầy đủ (kèm giới hạn encoder đo bằng `file:dòng`):
 * `docs/design-demo-to-figma-2026-08.md`.
 */
export { DemoScreenButton } from "./components/DemoScreenButton";
export { DemoScreenDialog } from "./components/DemoScreenDialog";
export { DEMO_SCREENS, screenSpecById } from "./data/screens.default";
export { SCREEN_SIZE, type ScreenNode, type ScreenSpec, type ScreenTextSpec } from "./lib/screen-spec";
export {
  charactersOf, indexKitFiles, resolveScene, resolveScenes, sceneImageCount, sceneIsUsable,
  type ResolvedScene, type SceneBackground, type SceneGap, type SceneLayer,
} from "./lib/resolve-scene";
export {
  BACKGROUND_CLASS, FRAME_CLASS, SCREEN_CLASS, SCENE_FONT, TEXT_CLASS,
  buildSceneDom, mountSceneStage, scenePaths, waitForSceneImages, type SceneDom,
} from "./lib/scene-dom";
export {
  SCENE_CLIPBOARD_SOURCE, assertSceneDoc, copyScenesAsFigmaNodes, encodeScenes,
  type SceneCopyMode, type SceneCopyResult, type SceneDocExpectation, type SceneEncodeResult,
} from "./lib/scene-figma";
