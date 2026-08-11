/**
 * features/gen — HỘP «✨ Nhờ máy vẽ» + lớp phủ «📦 Đóng gói».
 *
 * Chỗ dùng import TỪ ĐÂY, không import sâu: đường dẫn bên trong `panels/**` sẽ đổi khi
 * wave sau nối máy vẽ thật.
 *
 * LUẬT CỦA FEATURE NÀY:
 *  · `lib/**` thuần hàm — không React, không DOM, **không `lib/api/**`** (test tĩnh canh).
 *  · Màn cha sở hữu contract và gọi run gateway; feature này chỉ thu yêu cầu UI.
 *  · Không có bất kỳ lời gọi huỷ lượt vẽ nào (bài học C-01).
 */
export { GenPopover, type GenPopoverProps } from "./GenPopover";
export { PackOverlay, type PackOverlayProps } from "./PackOverlay";
export {
  GEN_KINDS,
  GEN_KIND_LIST,
  GEN_KIND_SPEC,
  GEN_GROUP_NOTE,
  GEN_NEED_CHARACTER_REF,
  GEN_ORIENTS,
  ORIENT_LABEL,
  isGenKind,
  type GenKind,
  type GenKindSpec,
  type GenOrient,
} from "./lib/gen-kinds";
export {
  GEN_MINUTES_PER_JOB,
  genCost,
  genCostLine,
  genMinutes,
  genUnits,
  minutesPhrase,
  wholeKitNote,
  type GenCost,
  type GenCostInput,
} from "./lib/gen-cost";
export {
  PACK_NOTE_LOCKED,
  PACK_WHILE_RUNNING,
  isPackable,
  kindOfNode,
  packItems,
  packSummary,
  selectAllPackable,
  toggleSelection,
  type PackItem,
  type PackSummary,
} from "./lib/pack-model";
