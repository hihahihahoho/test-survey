import type { JSONContent } from "@tiptap/react";
import { EXPRESSIONS } from "@/features/kit-core/lib/poses";
import { DEFAULT_VIEW } from "@/features/pose-lab/lib/pose-state";
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

/**
 * Block có một câu mad-lib do TipTap giữ.
 *
 * ══ CHỈ CÒN CẢNH NỀN, VÀ ĐÓ LÀ MỘT QUYẾT ĐỊNH ĐÃ ĐẢO ══════════════════════
 * `kind` từng có cả `"mascot"`: một thẻ Nhân vật là MỘT câu sinh ra MỘT ô. Lời
 * chủ sản phẩm đảo nó: *"nhân vật cũng nên để sprite sheet nhé, bỏ cái «hoặc» đi
 * vì mỗi nhân vật 1 pose 1 góc camera riêng"* — tức là một thẻ Nhân vật giờ là
 * một DANH SÁCH DÒNG y như Bộ UI, không phải một câu. Xem `MascotBlock`.
 */
export interface DocBlock {
  id: string;
  kind: "background";
  mode: BlockMode;
  doc: JSONContent;
}

/**
 * MỘT DÒNG DÁNG của thẻ Nhân vật — một ô trên tấm sprite sheet nhân vật.
 *
 * ╔══ VÌ SAO GÓC MÁY NAY LÀ MỘT TRƯỜNG NGANG HÀNG VỚI DÁNG ══════════════════╗
 * ║ Đời trước góc máy nằm rời ở `DocBlock.poseView`, và chú thích ở đó giải     ║
 * ║ thích rằng nó KHÔNG đi vào prompt: nó chỉ chọn tấm ảnh manơcanh, còn tấm    ║
 * ║ ảnh mới là thứ tới máy vẽ. Lập luận ấy đứng được khi mỗi thẻ đúng MỘT dáng  ║
 * ║ và tấm nào cũng đính được ảnh manơcanh của riêng nó.                       ║
 * ║ Nay một thẻ ra một tấm NHIỀU Ô, mà `image_gen` chỉ nhận một danh sách ảnh   ║
 * ║ dùng chung cho cả tấm — ảnh manơcanh phải được GHÉP thành một tấm duy nhất  ║
 * ║ (xem `sheet.poseRef`). Nên mỗi ô buộc phải tự nói ra góc của mình bằng chữ, ║
 * ║ và câu prompt của ô phải đứng được cả khi máy người dùng không dựng nổi ảnh.║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export interface MascotPose {
  id: string;
  /** Id dáng trong `POSES` (`kit-core/lib/poses.ts`). */
  pose: string;
  /** Id góc máy trong `CAMERA_VIEWS` (`pose-lab/lib/pose-state.ts`). */
  view: string;
  /** Cụm EN của nét mặt — quy ước `PhraseOption`: value CHÍNH LÀ cụm EN. */
  expression: string;
  /** Ghi chú tự do của người dùng cho riêng dòng này. */
  note: string;
  /** Câu tự do của dòng — chỉ có nghĩa ở chế độ `free`. Cùng luật với `UiCell.doc`. */
  doc?: JSONContent;
  /**
   * ẢNH MANƠCANH đã chụp cho ĐÚNG cặp (`pose`, `view`) hiện tại — `refs/<tên>`.
   *
   * ╔══ VÌ SAO KHÔNG CÓ BẢNG CACHE THEO CẶP NHƯ ĐỜI TRƯỚC ═════════════════════╗
   * ║ `DocBlock.poseRefs` cũ là một `Record<"<dáng>|<góc>", path>` nằm trên      ║
   * ║ block, để đổi dáng qua lại không đẻ ra hai tệp y hệt nhau trong `refs/`.   ║
   * ║ Ở mô hình dòng thì bảng ấy trả lời sai câu hỏi quan trọng hơn: "ảnh đang   ║
   * ║ nằm trên DÒNG NÀY có còn đúng dáng/góc của dòng này không". Nên luật nay   ║
   * ║ đơn giản và không có trạng thái thứ hai để lệch: **đổi `pose` hoặc `view`  ║
   * ║ là XOÁ `refPath`** (xem `retakePose`), và ảnh chỉ được coi là hợp lệ khi   ║
   * ║ nó còn nằm đó.                                                            ║
   * ║ ĐÁNH ĐỔI, NÓI THẲNG: đổi dáng rồi đổi ngược lại là chụp + tải lên lần nữa. ║
   * ║ Đổi lại, hai dòng CÙNG cặp trong một thẻ vẫn dùng chung đúng một tệp —     ║
   * ║ `ensurePoseRefs` gom theo cặp trong một lượt (đó mới là ca thường gặp:     ║
   * ║ một tấm turnaround hay lặp lại một dáng ở nhiều góc).                      ║
   * ╚═══════════════════════════════════════════════════════════════════════════╝
   */
  refPath?: string;
}

/**
 * Thẻ Nhân vật = MỘT DANH SÁCH DÁNG + một câu nói về DANH TÍNH.
 *
 * ┌── HAI TẦNG, VÀ RANH GIỚI GIỮA CHÚNG LÀ "CHUNG HAY RIÊNG" ────────────────┐
 * │ `doc` (câu đầu thẻ) chỉ chứa thứ ĐÚNG CHO CẢ BỘ: ảnh nhân vật + trang     │
 * │ phục. `poses[]` chứa thứ mỗi ô một khác: dáng, góc máy, nét mặt.         │
 * │ Cụm «(hoặc ảnh dáng […])» của câu cũ đã bị BỎ HẲN — nó mời người dùng    │
 * │ đưa một ảnh dáng cho cả thẻ, trong khi giờ mỗi dòng có dáng riêng.       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
export interface MascotBlock {
  id: string;
  kind: "mascot";
  /** CÙNG hai chế độ với mọi thẻ khác — xem `BlockMode` và `UiKitBlock.mode`. */
  mode: BlockMode;
  /** Câu đầu thẻ: `Tạo nhân vật [ảnh], trang phục [⌄].` — xem `mascotDoc()`. */
  doc: JSONContent;
  /** Thứ tự trong mảng CHÍNH LÀ thứ tự ô trên tấm — xem `moveRow`. */
  poses: MascotPose[];
  /**
   * ẢNH DÁNG ĐÃ GHÉP của thẻ này: một tấm manơcanh cùng lưới với tấm sẽ vẽ.
   *
   * ╔══ VÌ SAO NÓ PHẢI ĐƯỢC LƯU, CHỨ KHÔNG DỰNG LẠI MỖI LƯỢT ══════════════════╗
   * ║ `composerBlockSheets()` là hàm THUẦN và ĐỒNG BỘ — màn hình gọi nó ở mỗi   ║
   * ║ nhịp render để biết thẻ này sinh ra tấm nào. Ghép ảnh thì cần canvas +     ║
   * ║ một vòng tải lên, tức là bất đồng bộ và tốn tiền băng thông. Nên đường     ║
   * ║ dẫn tấm đã ghép phải nằm TRONG TÀI LIỆU: `ensurePoseRefs()` ghi nó lúc     ║
   * ║ bấm Vẽ, còn bộ dịch chỉ đọc.                                              ║
   * ╚═══════════════════════════════════════════════════════════════════════════╝
   *
   * `key` là VÂN TAY của bộ dòng đã ghép nên tấm ấy. Lệch ⇒ tấm cũ tả một bố cục
   * khác với tấm sắp vẽ, và một ảnh tham chiếu sai lưới còn hại hơn không có ảnh.
   * `paths[i]` ứng với tấm thứ i của thẻ (thẻ nhiều dáng bị chia tấm — xem
   * `mascotSheets`); chuỗi rỗng = tấm đó không dựng được ảnh nào.
   */
  poseSheet?: { key: string; paths: string[] };
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
  /**
   * ĐỤC NỀN — id trong `GLAZE_PRESETS`; rỗng = nền đặc.
   *
   * Thay cho `materialId` từ 08/2026. Không phải đổi tên cho đẹp: pill cũ hỏi
   * "ô này làm bằng gì" (thẩm mỹ, đã có prompt tổng lo), pill mới hỏi "ô này trong
   * tới đâu" — và câu trả lời quyết định `skel.matte`, thứ `slice.py` đọc để cắt.
   * Bản nháp cũ mang `materialId` được dịch sang lúc ĐỌC (`composer-doc.readCell`).
   */
  glazeId: string;
  /**
   * CỠ SAFE ZONE — id preset hoặc `"<w>x<h>"` px; rỗng = theo hệ thống.
   *
   * Nằm NGOÀI câu chữ (không có pill nào cho nó trong `uiCellDoc`) vì nó không đi
   * vào prompt một chữ nào: nó thành `skel.w`/`skel.h` của ô. Nhét nó vào câu là
   * hứa với người đọc rằng prompt có nhắc tới kích thước — mà không.
   */
  sizeId: string;
  /** Ghi chú tự do của người dùng cho riêng ô này. */
  note: string;
  /**
   * CÂU TỰ DO CỦA RIÊNG DÒNG NÀY — chỉ có nghĩa khi block đang ở chế độ `free`.
   *
   * ╔══ VÌ SAO MỘT TÀI LIỆU TIPTAP CHO MỖI DÒNG, TRÁI VỚI CHÚ THÍCH ĐỜI TRƯỚC ═╗
   * ║ Bản trước viết thẳng trong `UiKitBlockView.tsx` rằng dòng element KHÔNG   ║
   * ║ đáng một instance ProseMirror: "một dòng cần đúng bốn thứ… không có chỗ   ║
   * ║ nào để chèn pill GIỮA câu". Lập luận ấy đúng với CHẾ ĐỘ TEMPLATE và nó    ║
   * ║ vẫn còn nguyên hiệu lực ở đó — template vẫn là React thuần, không editor. ║
   * ║ Nhưng nó trả lời sai một câu hỏi khác: "người ta có muốn viết câu KHÁC     ║
   * ║ cho một element không". Chủ sản phẩm hỏi thẳng: *"sao tôi không thấy      ║
   * ║ tiptap edit được, tôi bảo có mode select-only + mode editor mà?"* — và    ║
   * ║ câu trả lời trung thực là: block Bộ UI đã bị bỏ quên một nửa cơ chế.      ║
   * ║                                                                          ║
   * ║ CÁI GIÁ ĐÃ ĐO, KHÔNG PHẢI ĐÃ QUÊN: một bộ kit 16 element ở chế độ tự do   ║
   * ║ = 16 instance ProseMirror trong một block. Nên chế độ tự do là thứ người  ║
   * ║ dùng PHẢI TỰ BẬT; mặc định vẫn là `template`, và ở template không editor  ║
   * ║ nào được mount. Ai bật tự do là đã chọn trả cái giá đó cho block của mình.║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   *
   * Thiếu (`undefined`) = dòng chưa từng vào chế độ tự do. Xem `uiCellDoc()`.
   */
  doc?: JSONContent;
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
  /**
   * CÙNG hai chế độ với block có câu chữ — xem `BlockMode`.
   *
   * Chế độ nằm ở BLOCK chứ không ở từng dòng, giống hệt block Cảnh nền/Nhân vật:
   * một công tắc cho cả thẻ thì nhìn phát biết thẻ này đang ở khuôn hay đã bị
   * chế. Để mỗi dòng một chế độ riêng là mười sáu trạng thái trên một thẻ, và
   * không có chỗ nào đủ rộng để nói ra cả mười sáu.
   */
  mode: BlockMode;
  /** Thứ tự trong mảng CHÍNH LÀ thứ tự ô đi vào contract — xem `moveRow`. */
  cells: UiCell[];
}

/**
 * Đổi chỗ một dòng trong một danh sách có thứ tự. Hàm THUẦN, và đó là điểm quan
 * trọng nhất của nó.
 *
 * ╔══ THỨ TỰ DÒNG LÀ DỮ LIỆU, KHÔNG PHẢI HIỆU ỨNG KÉO THẢ ═══════════════════╗
 * ║ `uiKitSheets()` xếp `block.cells` vào `components[]` theo đúng thứ tự mảng,║
 * ║ `mascotSheets()` xếp `block.poses` y hệt, rồi `gen.sh` vẽ ô theo đúng thứ  ║
 * ║ tự ấy. Nên "kéo dòng #2 lên trên #1" KHÔNG phải một chuyện trang trí — nó  ║
 * ║ đổi vị trí món đồ trên tấm ảnh sẽ vẽ ra. Vì thế phép đổi chỗ được tách     ║
 * ║ thành một hàm thuần test được, thay vì nằm trong một trình xử lý `onDrop`  ║
 * ║ mà chỉ chuột mới chạm tới.                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * TỔNG QUÁT theo `T` chứ không riêng cho ô UI (tên cũ: `moveCell`): hai loại thẻ
 * có danh sách dòng, và luật đổi chỗ của chúng phải là MỘT — hai bản sao là hai
 * chỗ để một cái được sửa còn cái kia thì không.
 *
 * Chỉ số ngoài khoảng ⇒ trả về mảng CŨ, không cắt xén: `splice` với chỉ số âm
 * đếm ngược từ cuối mảng, nên một lỗi đánh chỉ số sẽ âm thầm ném dòng sang tận
 * đầu bên kia thay vì báo hỏng.
 */
export function moveRow<T>(rows: readonly T[], from: number, to: number): T[] {
  if (from === to) return [...rows];
  if (from < 0 || from >= rows.length || to < 0 || to >= rows.length) return [...rows];
  const next = [...rows];
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return [...rows];
  next.splice(to, 0, moved);
  return next;
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

export type Block = DocBlock | UiKitBlock | MascotBlock;

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
  /**
   * Chế độ của khối NGỮ CẢNH CHUNG — cùng hai chế độ với mọi block khác.
   *
   * ╔══ VÌ SAO KHỐI NÀY CŨNG PHẢI CÓ, DÙ NÓ "CHỈ CÓ HAI LỰA CHỌN" ═════════════╗
   * ║ Lập luận cũ (ghi ở `PromptComposerScreen`) là: khối này không có câu chữ  ║
   * ║ để soạn, chỉ hai dropdown, nên mount một ProseMirror cho nó là trả giá    ║
   * ║ một editor để lấy về hai cái select. Lập luận ấy đúng về CHI PHÍ và sai   ║
   * ║ về NHU CẦU: câu này đi vào `variant.style` — mệnh đề mà `gen.sh` chèn vào ║
   * ║ MỌI tấm của bộ kit. Nó là câu có sức nặng nhất trong cả tài liệu, và cho  ║
   * ║ tới lượt này nó là câu DUY NHẤT người dùng không được viết lại.           ║
   * ║ `template` vẫn là mặc định, nên ai không cần thì không trả giá gì.        ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  contextMode: BlockMode;
  /** Câu ngữ cảnh tự do. Chỉ có nghĩa khi `contextMode === "free"` — xem `contextDoc`. */
  contextDoc?: JSONContent;
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

export function newDocBlock(kind: "background" = "background"): DocBlock {
  return { id: newId(kind), kind, mode: "template", doc: backgroundDoc() };
}

/** Dáng mặc định của một dòng mới — cùng id với `DEFAULT_POSE` của bộ dịch. */
export const DEFAULT_MASCOT_POSE = "idle";

/**
 * Một dòng dáng mới.
 *
 * Mặc định là dáng đứng chờ + góc mặc định của pose-lab + nét mặt ĐẦU danh mục:
 * bấm «+ Dáng» phải ra một dòng VẼ ĐƯỢC NGAY, không phải ba ô trống bắt người
 * dùng điền trước khi thấy được gì.
 */
export function newMascotPose(
  pose: string = DEFAULT_MASCOT_POSE,
  view: string = DEFAULT_VIEW,
  expression: string = EXPRESSIONS[0]?.value ?? "",
): MascotPose {
  return { id: newId("pose"), pose, view, expression, note: "" };
}

/**
 * Đổi dáng hoặc góc của một dòng ⇒ ẢNH MANƠCANH CŨ HẾT HIỆU LỰC.
 *
 * Một hàm riêng chứ không phải một cú `{...row, pose}` rải ở ba chỗ trong UI:
 * quên xoá `refPath` ở đúng một chỗ là tấm dáng đính kèm tả một dáng khác với
 * chữ trong prompt — hai nguồn nói ngược nhau, và ảnh thì luôn thắng chữ.
 */
export function retakePose(row: MascotPose, patch: Partial<Pick<MascotPose, "pose" | "view">>): MascotPose {
  const next = { ...row, ...patch };
  if (next.pose === row.pose && next.view === row.view) return next;
  const { refPath: _stale, ...rest } = next;
  return rest;
}

/** Thẻ Nhân vật mới: có câu danh tính, CHƯA có dáng nào — cùng nhịp với thẻ Bộ UI. */
export function newMascotBlock(): MascotBlock {
  return { id: newId("mascot"), kind: "mascot", mode: "template", doc: mascotDoc(), poses: [] };
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
    glazeId: preset?.glazeId ?? "",
    sizeId: preset?.sizeId ?? "",
    note: "",
  };
}

export function newUiKitBlock(): UiKitBlock {
  /* `template` là mặc định — xem khối chú thích của `UiCell.doc`: chế độ tự do
     mount một editor cho MỖI dòng, và không ai được trả cái giá ấy vì lỡ tay. */
  return { id: newId("uikit"), kind: "uikit", mode: "template", cells: [] };
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
    contextMode: "template",
    blocks: [],
  };
}
