import type { JSONContent } from "@tiptap/react";
import { getPresets, type PresetBundle } from "./presets-store";
import { INHERIT } from "./pill-registry";
import { backgroundDoc, mascotDoc } from "./doc-templates";

/**
 * composer-model.ts — HÌNH DẠNG của cả màn, dưới dạng dữ liệu thuần.
 *
 * ╔══ VÌ SAO KHÔNG NHÉT TẤT CẢ VÀO MỘT TÀI LIỆU TIPTAP ══════════════════════╗
 * ║ Cách "đúng sách vở" của một rich-text editor là một `doc` duy nhất, block ║
 * ║ là node của schema. Lab này CỐ Ý không làm vậy, và đây là lý do:          ║
 * ║                                                                          ║
 * ║  ① Template không được lây. Ba loại block có ba câu mẫu khác nhau; trong  ║
 * ║    một doc chung, gõ Enter cuối block này là ProseMirror tự tạo một node  ║
 * ║    cùng loại — người dùng vô tình đẻ ra block mà không hề bấm "thêm".     ║
 * ║  ② Xoá block = unmount một editor. Trong doc chung, xoá là một            ║
 * ║    transaction phải tính vị trí, và mọi node view lân cận dựng lại.       ║
 * ║  ③ Thứ tự block là một mảng React — kéo thả / sắp lại là đổi mảng, không  ║
 * ║    phải viết lệnh di chuyển node trong ProseMirror.                       ║
 * ║  ④ Lưới ô của UI Kit KHÔNG phải văn bản. Ép nó thành node text là bịa ra  ║
 * ║    một schema cho một cái bảng — trong khi nó chỉ cần là một mảng ô.      ║
 * ║                                                                          ║
 * ║ Ranh giới rút ra: **TipTap lo phần CÂU CHỮ, React lo phần CẤU TRÚC.**     ║
 * ║ Giá phải trả (nói thẳng): mỗi block là một instance ProseMirror thật —    ║
 * ║ xem phần nhận xét kỹ thuật trong báo cáo về ngưỡng hiệu năng.             ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

export type BlockKind = "background" | "uikit" | "mascot";

/**
 * Hai chế độ của một block CÓ CÂU CHỮ.
 *
 * ┌── Ý ĐỒ SẢN PHẨM, ghi lại để đời sau đừng bỏ mất một nửa ─────────────────┐
 * │ `template` để làm NHANH và quản lý ĐỀU TAY: mọi block cùng một khuôn,    │
 * │ prompt sinh ra đồng dạng, người mới không phải nghĩ gì ngoài việc chọn.  │
 * │ `free` để SÁNG TẠO KHÔNG BỊ TRÓI: phản hồi thật của user Dũng là         │
 * │ "background composition bị fix quá" — template là điểm xuất phát, không  │
 * │ phải cái lồng.                                                          │
 * │ HAI CHẾ ĐỘ TRÊN CÙNG MỘT BLOCK, không phải hai loại block: người ta bắt  │
 * │ đầu bằng khuôn rồi phá khuôn khi cần, không phải chọn phe từ đầu.        │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export type BlockMode = "template" | "free";

/** Block có một câu mad-lib do TipTap giữ. */
export interface DocBlock {
  id: string;
  kind: "background" | "mascot";
  mode: BlockMode;
  doc: JSONContent;
  /**
   * GÓC MÁY của ảnh dáng — chỉ có nghĩa với block Nhân vật. Rỗng/thiếu = góc mặc
   * định của pose-lab (`DEFAULT_VIEW`).
   *
   * Vì sao KHÔNG là một pill trong `doc` như [dáng]: góc máy không đi vào prompt
   * một chữ nào. Nó chỉ quyết định tấm ảnh manơcanh chụp ra trông thế nào, rồi
   * chính TẤM ẢNH mới đi tới máy vẽ. Nhét nó vào câu là hứa với người đọc rằng
   * câu prompt có nhắc tới góc máy — mà không.
   */
  poseView?: string;
  /**
   * ẢNH DÁNG ĐÃ CHỤP, khoá theo cặp `"<dáng>|<góc>"` → đường dẫn `refs/<tên>`.
   *
   * Đây là bộ nhớ đệm, và nó nằm TRONG TÀI LIỆU (chứ không trong RAM của tab) vì
   * cái đắt không phải phép render 10ms mà là VÒNG TẢI LÊN: mỗi lần chụp lại là
   * một tệp mới trong `refs/` của dự án. Đổi dáng rồi đổi lại là hai tệp y hệt
   * nhau nằm trên đĩa mãi mãi nếu không có bảng này.
   */
  poseRefs?: Record<string, string>;
}

/** Một ô của lưới spritesheet. */
export interface UiCell {
  id: string;
  /** Id trong `presets.elements`. */
  elementId: string;
  /** Rỗng = theo phong cách chung ở đầu tài liệu. */
  styleId: string;
  /** "1".."7" — xem `DECOR_LEVELS`. */
  decor: string;
  /** Id trong MATERIAL_PRESETS; rỗng = không nói gì về chất liệu. */
  materialId: string;
  /** Ghi chú tự do của người dùng cho riêng ô này. */
  note: string;
}

/**
 * Block UI kit = MỘT DANH SÁCH element, không phải một cái bảng.
 *
 * ┌── LƯỚI LÀ VIỆC CỦA HỆ THỐNG, KHÔNG PHẢI CỦA NGƯỜI DÙNG ─────────────────┐
 * │ Engine KitGen tự dựng skeleton và tự xếp ô vào spritesheet. Nên state ở  │
 * │ đây KHÔNG có `cols`/`rows`/toạ độ: không có kéo-thả, không chỉnh khổ ô,  │
 * │ không có gì để người dùng xếp sai. Họ chỉ thêm và bớt element.           │
 * │                                                                          │
 * │ Cái lưới nhìn thấy trên màn chỉ là HIỂN THỊ SỨC CHỨA — nó suy ra từ SỐ Ô │
 * │ (`gridFor`), không phải một trường được lưu. Lưu nó là mời gọi hai nguồn │
 * │ sự thật lệch nhau, và mời gọi người sau tưởng rằng có thể xếp tay.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface UiKitBlock {
  id: string;
  kind: "uikit";
  cells: UiCell[];
}

/**
 * Khung lưới hiển thị cho N ô. Rẻ nhất mà vẫn đúng tinh thần "hệ thống tự lo":
 * 3 cột cho tới 9 ô, nở sang 4 cột khi đông hơn; luôn hiện tối thiểu 3 hàng để
 * ô đầu tiên không lơ lửng một mình trên một khung dẹt.
 */
export function gridFor(cellCount: number): { cols: number; rows: number } {
  const cols = cellCount > 9 ? 4 : 3;
  return { cols, rows: Math.max(3, Math.ceil(cellCount / cols)) };
}

export type Block = DocBlock | UiKitBlock;

export interface ComposerState {
  /** Cụm EN của chủ đề chung (theo quy ước `OUTFIT_THEMES`: value CHÍNH LÀ cụm EN). */
  themeValue: string;
  /** Id phong cách chung, tra trong `presets.styles`. */
  styleId: string;
  /**
   * Màu thương hiệu, `#rrggbb` thường, THEO THỨ TỰ VAI TRÒ: [0] là màu chủ đạo,
   * [1] là màu nhấn, còn lại là màu phụ. Thứ tự mảng CHÍNH LÀ ngữ nghĩa — xem
   * `describeBrandColors()`. Nên không có trường `role` riêng để hai nguồn sự
   * thật lệch nhau; đổi vai trò = đổi chỗ trong mảng.
   */
  brandColors: string[];
  blocks: Block[];
}

/**
 * Id duy nhất trong phiên. `Date.now()` một mình KHÔNG đủ: bấm "+ Nút bấm" ba
 * lần liên tiếp trong cùng một mili-giây là ba ô trùng key React, và React sẽ
 * tái dùng nhầm DOM giữa chúng.
 */
let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function newDocBlock(kind: "background" | "mascot"): DocBlock {
  return {
    id: newId(kind),
    kind,
    mode: "template",
    doc: kind === "background" ? backgroundDoc() : mascotDoc(),
  };
}

export function newCell(elementId: string, presets: PresetBundle = getPresets()): UiCell {
  const preset = presets.elements.find((element) => element.id === elementId);
  return {
    id: newId("cell"),
    elementId,
    /* Kế thừa phong cách chung là mặc định — một ô vừa thêm KHÔNG được tự ý
       tách khỏi phong cách của cả bộ kit. */
    styleId: INHERIT,
    decor: String(preset?.decor ?? 4),
    materialId: preset?.materialId ?? "",
    note: "",
  };
}

export function newUiKitBlock(): UiKitBlock {
  return { id: newId("uikit"), kind: "uikit", cells: [] };
}

/** Trạng thái lúc mở màn: chỉ có ngữ cảnh chung, chưa block nào. */
export function initialComposer(presets: PresetBundle = getPresets()): ComposerState {
  return {
    themeValue: "a Vietnamese Tết festive outfit with red and gold",
    styleId: presets.styles[0]?.id ?? "",
    /* Mở màn có SẴN hai màu chứ không phải một ô trống: demo này để người ta
       thấy màu đi vào prompt ra chữ gì, mà một danh sách rỗng thì không thấy
       gì cả. Hai màu cũng là hình dạng thật của phần lớn bộ nhận diện. */
    brandColors: ["#ff5533", "#112233"],
    blocks: [],
  };
}
