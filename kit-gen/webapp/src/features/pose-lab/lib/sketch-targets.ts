/**
 * sketch-targets.ts — «SKETCH NÀY LÀ CỦA MÓN NÀO?».
 *
 * ╔══ MỘT SKETCH = MỘT ELEMENT, KHÔNG PHẢI MỘT CẢNH ══════════════════════════╗
 * ║ Quyết định của chủ sản phẩm, và nó đổi luôn hình dạng của công cụ: khổ vẽ  ║
 * ║ VUÔNG (đúng tinh thần một ô của spritesheet) chứ không phải khổ dọc/ngang  ║
 * ║ theo canvas 1536×1024 của engine. Lý do sâu hơn: ảnh tham chiếu chỉ có ích ║
 * ║ khi máy vẽ biết nó tham chiếu cho CÁI GÌ. Một tấm "cả bố cục" nguệch ngoạc ║
 * ║ đính vào sheet chỉ làm nhiễu mọi ô còn lại trong sheet đó.                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * DANH MỤC LẤY TỪ THƯ VIỆN THẬT (`design/library/lib/source` — 42 element đóng
 * gói sẵn), CHỈ ĐỌC. Không chép tay ~8 mục như phương án dự phòng: chép tay thì
 * nhãn sẽ lệch khỏi kho ngay lần kho được cập nhật, và khi nối vào block Mascot /
 * spritesheet thật thì không có `file` để đính ảnh vào đúng ô.
 */
import { loadBundledV2 } from "@/features/design/library/lib/source";
import { NO_GROUP, groupLabel } from "@/features/design/library/lib/types";

/** Mục ĐẶC BIỆT: dáng nhân vật không phải element giao diện nên không có trong
 *  kho — nhưng nó chính là thứ tab "Pose 3D" bên cạnh đang làm, nên phải có mặt.
 *  Cũng là mục DUY NHẤT được hiện người que gợi ý (xem `SketchTab`). */
export const MASCOT_POSE_TARGET = "mascot-pose";

/** Mục "tự gõ" — kho 42 món không bao giờ đủ cho một demo. */
export const CUSTOM_TARGET = "__custom__";

export interface SketchTarget {
  /** `file` của element trong kho, hoặc một trong hai khoá đặc biệt trên. */
  id: string;
  label: string;
  /** Nhãn nhóm để đổ vào `<optgroup>` — 42 mục phẳng thì không tìm nổi. */
  group: string;
}

let cache: SketchTarget[] | null = null;

/** Danh mục đích vẽ: dáng nhân vật → 42 element của kho → ô tự gõ. */
export function sketchTargets(): SketchTarget[] {
  if (cache) return cache;
  const lib = loadBundledV2().elements.map((e): SketchTarget => ({
    id: e.file,
    label: e.vi || e.file,
    group: groupLabel(e.group || NO_GROUP),
  }));
  cache = [
    { id: MASCOT_POSE_TARGET, label: "Dáng nhân vật (mascot)", group: "Nhân vật" },
    ...lib,
    { id: CUSTOM_TARGET, label: "Khác — tự gõ tên…", group: "Khác" },
  ];
  return cache;
}

/** Thứ tự nhóm ĐÚNG như thứ tự xuất hiện trong danh mục — để `<optgroup>` không
 *  phải sort lại và "Nhân vật" luôn nằm trên cùng. */
export function targetGroups(): { group: string; items: SketchTarget[] }[] {
  const out: { group: string; items: SketchTarget[] }[] = [];
  for (const t of sketchTargets()) {
    const last = out[out.length - 1];
    if (last && last.group === t.group) last.items.push(t);
    else out.push({ group: t.group, items: [t] });
  }
  return out;
}

/**
 * Nhãn cuối cùng dán lên ảnh. `custom` chỉ được dùng khi đang chọn ô tự gõ, và
 * ô tự gõ rỗng thì rơi về nhãn dự phòng — KHÔNG để nhãn rỗng, vì nhãn rỗng
 * chính là thứ làm cả dải thumbnail thành vô nghĩa sau 5 tấm.
 */
export function targetLabel(id: string, custom: string): string {
  if (id === CUSTOM_TARGET) return custom.trim() || "món chưa đặt tên";
  return sketchTargets().find((t) => t.id === id)?.label ?? id;
}
