/**
 * Cửa duy nhất của lab Pose & Sketch.
 *
 * ⭐ MẢNH ĐÁNG ĐI TIẾP NHẤT là `capturePoseRef` — hàm mà Prompt Composer sẽ gọi
 *    lúc người dùng bấm Gen để biến hai cái pill [dáng] + [góc] thành một PNG
 *    tham chiếu. Đọc khối chú thích đầu `lib/capture-pose-ref.ts` trước khi nối.
 *    Phần còn lại (viewport nắn khớp, tab sketch) là UI thử nghiệm, được phép vứt.
 */
export { PoseSketchLabScreen } from "./PoseSketchLabScreen";

export {
  capturePoseRef, canCapturePoseRef, poseRefLabel, PoseRefUnavailableError,
  POSE_REF_SIZE, POSE_REF_PREVIEW_SIZE,
} from "./lib/capture-pose-ref";
export { CAMERA_VIEWS, cameraView, DEFAULT_VIEW, type CameraView } from "./lib/pose-state";

export { POSE_PRESETS, presetById, presetLabel } from "./lib/pose-presets";
export { expandPose, setAxis, type PoseAngles } from "./lib/pose-state";
export { emptySketch, pushStroke, undo, redo, type SketchState } from "./lib/sketch-model";
export { makeShot, addShot, shotFileName, type Shot } from "./lib/shots";
