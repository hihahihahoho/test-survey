import type { JSONContent } from "@tiptap/react";
import { EXPRESSIONS } from "@/features/kit-core/lib/poses";
import { glazeOrSolid } from "@/features/kit-core/lib/glaze";
import { DEFAULT_VIEW } from "@/features/prompt-lab/lib/pose/pose-state";
import { DECOR_PLACE_DEFAULT, decorLevelOf, getPresets, type PresetBundle } from "./presets-store";
import { INHERIT } from "./pill-registry";
import { defaultSizeOf } from "./cell-size";
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
  /**
   * GHI CHÚ CẤP THẺ — một dòng người thiết kế nói thêm cho cả tấm.
   *
   * ╔══ VÌ SAO NÓ LÀ MỘT TRƯỜNG RIÊNG, KHÔNG PHẢI CHỮ GÕ THÊM VÀO CÂU ════════╗
   * ║ Ở chế độ KHUÔN, câu mad-lib là bất di bất dịch — người dùng chỉ bấm pill, ║
   * ║ không gõ được vào giữa. Nghĩa là mọi thứ template không hỏi tới ("vẽ thêm ║
   * ║ mưa xuân", "đừng có người trong khung") đều KHÔNG có chỗ nào để nói, trừ  ║
   * ║ khi bỏ khuôn đi. Dòng element và dòng dáng đã có ô ghi chú của riêng      ║
   * ║ chúng (`UiCell.note`, `MascotPose.note`); thẻ Background thì chưa, và đó  ║
   * ║ là thẻ DUY NHẤT mà cả thẻ chỉ sinh ra một ô — tức là chỗ thiếu ô ghi chú  ║
   * ║ đau nhất.                                                                ║
   * ║ Nó đi vào `sheet.directive` (`gen.sh` in ra dưới `## Direction`), sống    ║
   * ║ song song với câu — nên nó CÒN NGUYÊN cả khi gạt sang chế độ tự do rồi    ║
   * ║ quay về, và không bao giờ bị bộ serialize trừ nhầm vào scaffolding.       ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  note: string;
  /**
   * KHỚP KHUNG lúc copy sang Figma — dùng chung cho MỌI tấm của thẻ.
   *
   * Thiếu (bản nháp trước 14/09/2026) ⇒ `DEFAULT_FIGMA_FIT`. Xem `FigmaFit`.
   */
  figmaFit?: FigmaFit;
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
  /** Id góc máy trong `CAMERA_VIEWS` (`prompt-lab/lib/pose/pose-state.ts`). */
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
   * TỐI ĐA Ô MỖI TẤM — `1` · `4` · `9`; thiếu ⇒ `DEFAULT_MAX_PER_SHEET`.
   *
   * Nằm trên THẺ chứ không phải một cài đặt chung của dự án: một thẻ «nút bấm»
   * 9 món nhỏ và một thẻ «khung popup» 2 món to cần hai nấc khác nhau, và cả hai
   * sống cạnh nhau trong cùng một bộ kit. Xem `maxPerSheetOf`.
   */
  maxPerSheet?: number;
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
  /**
   * KHỚP KHUNG lúc copy sang Figma — dùng chung cho MỌI tấm của thẻ.
   *
   * Thiếu (bản nháp trước 14/09/2026) ⇒ `DEFAULT_FIGMA_FIT`. Xem `FigmaFit`.
   */
  figmaFit?: FigmaFit;
}

/** Một ô của lưới spritesheet. */
export interface UiCell {
  id: string;
  /** Id trong `presets.elements`. */
  elementId: string;
  /** Rỗng = theo phong cách chung ở đầu tài liệu. */
  styleId: string;
  /**
   * LƯỢNG TRANG TRÍ — id của `DECOR_LEVELS` (`none` · `light` · `medium` · `rich`).
   *
   * Trước 09/2026 trường này là một con số "1".."7" (độ dày viền). Bản nháp đời cũ
   * được dịch ngay lúc ĐỌC (`decorLevelOf` trong `composer-doc.readCell`): một con
   * số lọt vào thang mới không tra ra mục nào, và dòng element sẽ mất câu trang trí
   * mà không ai báo.
   */
  decor: string;
  /**
   * BỐ TRÍ chỗ trang trí — id của `DECOR_PLACES`. LUÔN CÓ GIÁ TRỊ; mặc định `balanced`.
   *
   * CHỈ ĐI VÀO PROMPT khi `decor` khác «Không» — xem `hasDecorPlacement`. Trường vẫn
   * được GIỮ khi ô về «Không» (không xoá theo): kéo trang trí xuống rồi kéo lên lại
   * mà mất cách bố trí đã chọn là một đường mất dữ liệu câm.
   */
  decorPlace: string;
  /**
   * ĐỤC NỀN — id trong `GLAZE_PRESETS`. LUÔN CÓ GIÁ TRỊ; mặc định là `auto`.
   *
   * Thay cho `materialId` từ 08/2026. Không phải đổi tên cho đẹp: pill cũ hỏi
   * "ô này làm bằng gì" (thẩm mỹ, đã có prompt tổng lo), pill mới hỏi "ô này trong
   * tới đâu" — và câu trả lời là MỘT CÂU tả cách vẽ alpha, nối thẳng vào `spec` của ô.
   * Bản nháp cũ mang `materialId` được dịch sang lúc ĐỌC (`composer-doc.readCell`).
   *
   * RỖNG KHÔNG CÒN LÀ MỘT LỰA CHỌN (08/09/2026). Nó từng nghĩa "chưa chọn / nền
   * đặc"; nay "nền đặc" có id riêng (`solid`) và "chưa chọn" là `auto` — nấc mà
   * máy vẽ tự quyết theo vật liệu. Bản nháp cũ mang rỗng được vá lúc ĐỌC
   * (`glazeOrSolid` trong `composer-doc.readCell`), y hệt cách `sizeId` được vá.
   */
  glazeId: string;
  /**
   * CỠ SAFE ZONE — id preset hoặc `"<w>x<h>"` px. LUÔN CÓ GIÁ TRỊ.
   *
   * Rỗng vẫn ĐỌC được (bản nháp trước 07/09/2026), nhưng `readCell` vá nó ngay lúc
   * đọc và `newCell` không bao giờ sinh ra rỗng nữa — xem `defaultSizeOf`.
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
  /**
   * TỐI ĐA Ô MỖI TẤM — `1` · `4` · `9`; thiếu ⇒ `DEFAULT_MAX_PER_SHEET`.
   *
   * Nằm trên THẺ chứ không phải một cài đặt chung của dự án: một thẻ «nút bấm»
   * 9 món nhỏ và một thẻ «khung popup» 2 món to cần hai nấc khác nhau, và cả hai
   * sống cạnh nhau trong cùng một bộ kit. Xem `maxPerSheetOf`.
   */
  maxPerSheet?: number;
  /**
   * KHỚP KHUNG lúc copy sang Figma — dùng chung cho MỌI tấm của thẻ.
   *
   * Thiếu (bản nháp trước 14/09/2026) ⇒ `DEFAULT_FIGMA_FIT`. Xem `FigmaFit`.
   */
  figmaFit?: FigmaFit;
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

/* ══════════════════════════════════════════════════════════════════════════
   TỐI ĐA MỖI TẤM — một cài đặt của THẺ, và phép chia đi theo nó
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * Ba nấc người dùng chọn được: **1 · 4 · 9**.
 *
 * ╔══ VÌ SAO LÀ BA SỐ CHÍNH PHƯƠNG, KHÔNG PHẢI MỘT Ô GÕ SỐ ══════════════════╗
 * ║ Tấm vuông chia lưới n×n (xem `UI_CANVAS` ở bộ dịch contract), nên sức     ║
 * ║ chứa thật của một tấm chỉ nhận được các giá trị 1, 4, 9, 16. Cho gõ «5»   ║
 * ║ là hứa một thứ hình học không tồn tại: năm ô vẫn phải nằm trên lưới 3×3   ║
 * ║ và bốn ô trống còn lại vẫn ăn chỗ. Ba nấc thì mỗi nấc là một lưới có      ║
 * ║ thật, và người dùng đọc ra ngay mình đang đổi cái gì.                     ║
 * ║ 16 không có trong danh sách vì đó là TRẦN CŨ — một tấm 16 ô đã được đo là ║
 * ║ quá chật cho một món đồ (xem `MAX_CELLS_SQUARE`); nó vẫn là trần kỹ thuật ║
 * ║ của bộ dịch, không còn là một lựa chọn bày ra.                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export const SHEET_MAX_CHOICES = [1, 4, 9] as const;

/**
 * MẶC ĐỊNH 4 — lời chủ sản phẩm: *«mặc định là MAX 4 cái 1 sheet gen»*.
 *
 * Đây cũng là giá trị của bản nháp ĐỜI CŨ (trước 14/09/2026) khi đọc lên: bản
 * nháp ấy được vẽ bằng trần 16, nhưng 16 không còn là một lựa chọn bày ra, và
 * một thẻ cũ mở lại phải hành xử như một thẻ mới — không có nấc "16" bí ẩn chỉ
 * tồn tại ở những thẻ đủ già.
 */
export const DEFAULT_MAX_PER_SHEET = 4;

/** Giá trị lưu trên đĩa → một nấc CÓ THẬT. Lạ / thiếu ⇒ mặc định. */
export function maxPerSheetOf(value: unknown): number {
  const asked = Number(value);
  return (SHEET_MAX_CHOICES as readonly number[]).includes(asked) ? asked : DEFAULT_MAX_PER_SHEET;
}

/* ══════════════════════════════════════════════════════════════════════════
   KHỚP KHUNG — cách ảnh được đặt vào khung lúc copy sang Figma
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * BA CÁCH KHỚP, và cả ba đều là những thứ ĐÃ CHẠY — không có nấc nào mới toanh.
 *
 * ╔══ VÌ SAO PHẢI CÓ NÚT, TRONG KHI ĐÃ CÓ MỘT LUẬT TỰ ĐỘNG ══════════════════╗
 * ║ Phép khớp (xem `contractFramed` ở `result/sheet-files.ts`) phải chọn một   ║
 * ║ trong hai hộp làm lõi để co, và KHÔNG có phép đo nào tách được thân món    ║
 * ║ khỏi trang trí. Luật tự động đoán bằng dung sai, và nó đoán ĐÚNG phần lớn  ║
 * ║ lượt — nhưng "phần lớn" nghĩa là có lượt nó đoán sai, và lúc ấy người dùng ║
 * ║ không có cửa nào ngoài việc ngồi co tay từng ô trong Figma.                ║
 * ║ Ba nấc này biến một phép đoán câm thành một lựa chọn nói ra được:          ║
 * ║  · `whole` — toàn bộ phần đục (α ≥ 128) nằm gọn trong khung. An toàn tuyệt ║
 * ║    đối (không ô nào đè ô nào), giá phải trả là thân món nhỏ hơn khung.     ║
 * ║  · `body`  — thân món (hộp mà prompt đã hứa) lấp đầy khung, trang trí tràn ║
 * ║    ra ngoài. Đẹp hơn khi máy vẽ ngoan, nhưng máy vẽ lố thì ô đè sang ô.    ║
 * ║  · `auto`  — luật dung sai cũ tự chọn giữa hai nấc trên cho từng ô.        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * MẶC ĐỊNH LÀ `whole`, không phải `auto`: nấc an toàn phải là nấc người dùng
 * nhận được khi chưa từng bấm gì. Một bản nháp cũ (chưa có trường này) vì thế
 * cũng mở ra ở `whole` — xem `figmaFitOf`.
 */
export type FigmaFitMode = "whole" | "body" | "auto";

/** Ba nấc, đúng thứ tự bày ra cho người dùng. */
export const FIGMA_FIT_MODES: readonly FigmaFitMode[] = ["whole", "body", "auto"];

/**
 * TỈ LỆ THÊM (phần trăm) — nhân vào SAU khi cách khớp đã chọn xong lõi.
 *
 * Khung KHÔNG đổi theo nó (khung vẫn là cỡ đầu ra người dùng đặt); chỉ ẢNH bên
 * trong to/nhỏ đi. Đây là cái van tay cho hai ca mà không phép đo nào bắt được:
 * món vẽ ra có quầng sáng dày (muốn thu nhỏ), hoặc thân món quá khiêm tốn trong
 * khung (muốn nới ra). 100 = đúng như phép tính, tức là không can thiệp.
 */
export const FIT_SCALE_MIN = 50;
export const FIT_SCALE_MAX = 150;
export const FIT_SCALE_STEP = 5;
export const DEFAULT_FIT_SCALE = 100;

/**
 * CÀI ĐẶT KHỚP KHUNG CỦA MỘT THẺ — dùng chung cho MỌI tấm của thẻ.
 *
 * Per-thẻ chứ không per-ô: một thẻ là một lượt vẽ, một phong cách, một kiểu
 * trang trí — nếu ô này cần nấc khác ô kia thì chuyện phải sửa là mô tả, không
 * phải mười sáu cái núm. Và mười sáu núm thì không ai chỉnh, không ai kiểm được.
 */
export interface FigmaFit {
  mode: FigmaFitMode;
  /** Phần trăm, `FIT_SCALE_MIN`..`FIT_SCALE_MAX`, bước `FIT_SCALE_STEP`. */
  scale: number;
}

export const DEFAULT_FIGMA_FIT: FigmaFit = { mode: "whole", scale: DEFAULT_FIT_SCALE };

/** Kẹp một tỉ lệ thêm về nấc CÓ THẬT: trong khoảng, và đúng bước 5. */
export function fitScalePercentOf(value: unknown): number {
  const asked = Number(value);
  if (!Number.isFinite(asked)) return DEFAULT_FIT_SCALE;
  const stepped = Math.round(asked / FIT_SCALE_STEP) * FIT_SCALE_STEP;
  return Math.min(FIT_SCALE_MAX, Math.max(FIT_SCALE_MIN, stepped));
}

/**
 * Giá trị lưu trên đĩa → một cài đặt DÙNG ĐƯỢC. Thiếu / rác ⇒ mặc định.
 *
 * Vá ngay tại cửa đọc, cùng luật với `maxPerSheetOf` và `sizeId` của ô: một giá
 * trị lạ lọt vào trong ruột app sẽ đi rất xa trước khi có ai nhận ra.
 */
/**
 * Đặt nấc khớp khung cho một thẻ, giữ nguyên mọi thứ khác.
 *
 * Generic theo `T` để thẻ vào kiểu gì thì ra đúng kiểu ấy: vỏ thẻ cầm một `Block`
 * hợp nhất ba loại, và một phép trải thẳng ở chỗ gọi sẽ làm TypeScript mất dấu
 * loại thẻ — rồi chỗ nào đó phải chữa bằng một cú ép kiểu không ai kiểm được.
 */
export function withFigmaFit<T extends Block>(block: T, fit: FigmaFit): T {
  return { ...block, figmaFit: fit };
}

export function figmaFitOf(value: unknown): FigmaFit {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_FIGMA_FIT };
  const raw = value as Record<string, unknown>;
  const asked = raw["mode"];
  const mode = FIGMA_FIT_MODES.includes(asked as FigmaFitMode)
    ? (asked as FigmaFitMode)
    : DEFAULT_FIGMA_FIT.mode;
  return { mode, scale: fitScalePercentOf(raw["scale"]) };
}

/**
 * CHIA DÒNG THÀNH TẤM — N dòng, trần M ⇒ `ceil(N/M)` tấm, **theo đúng thứ tự dòng**.
 *
 * ╔══ BỘ GHÉP KHÔNG BỊ CẮT NGANG, VÀ CHỈ KHI CÒN CHỖ ════════════════════════╗
 * ║ Một bộ ghép (khung thanh máu + phần đầy) chỉ có nghĩa khi hai phần được   ║
 * ║ vẽ CÙNG MỘT LƯỢT: hai lượt gọi máy vẽ là hai lần nó tự chọn lại độ bo,    ║
 * ║ độ dày viền, sắc độ — và cái khung không còn ôm được cái ruột. Nên khi    ║
 * ║ chỗ trống của tấm đang gom không đủ cho cả cụm, cụm ấy sang tấm sau       ║
 * ║ NGUYÊN VẸN thay vì bị xé.                                                 ║
 * ║ Cụm to hơn cả một tấm thì buộc phải cắt — nhưng cắt SAU CÙNG, và cắt      ║
 * ║ đúng theo thứ tự, chứ không cắt bừa.                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ CHỈ GOM DÒNG LIỀN KỀ ══════════════════════════════════════════════════
 * `groupOf` chỉ gom những dòng **đứng cạnh nhau** cùng khoá, không đi gom cả
 * danh sách. Gom toàn danh sách thì hai phần cùng bộ nằm ở dòng #1 và dòng #9 sẽ
 * bị KÉO LẠI VỚI NHAU — tức là thứ tự ô trên tấm không còn là thứ tự dòng người
 * dùng nhìn thấy, và họ không có cách nào đoán được vì sao. Thêm một bộ ghép vốn
 * đẻ ra các dòng liền nhau, nên luật liền kề phủ đúng ca thật.
 */
export function splitRows<T>(
  rows: readonly T[],
  max: number,
  groupOf?: (row: T) => string,
): T[][] {
  const cap = Math.max(1, Math.floor(max));
  /* ── Gom dòng liền kề cùng khoá thành từng CỤM ─────────────────────────── */
  const runs: T[][] = [];
  let lastKey = "";
  for (const row of rows) {
    const key = groupOf?.(row) ?? "";
    const tail = runs[runs.length - 1];
    if (tail && key !== "" && key === lastKey) tail.push(row);
    else runs.push([row]);
    lastKey = key;
  }

  /* ── Xếp cụm vào tấm ───────────────────────────────────────────────────── */
  const out: T[][] = [];
  let cur: T[] = [];
  for (const run of runs) {
    if (run.length > cap) {
      if (cur.length) { out.push(cur); cur = []; }
      for (let i = 0; i < run.length; i += cap) out.push(run.slice(i, i + cap));
      continue;
    }
    if (cur.length + run.length > cap) { out.push(cur); cur = []; }
    cur.push(...run);
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * BỘ GHÉP MÀ MỘT Ô THUỘC VỀ — khoá gom cho `splitRows`, hoặc rỗng.
 *
 * ╔══ VÌ SAO CHỈ BỘ `composition`, VÀ VÌ SAO PHẢI ĐÁNH SỐ LƯỢT ══════════════╗
 * ║ `composition` là loại bộ mà các phần CHỈ CÓ NGHĨA KHI ĐI CÙNG NHAU (khung ║
 * ║ thanh máu + phần đầy) — xem `ElementSetRef.kind`. Bộ `variants` thì mỗi   ║
 * ║ phần đứng một mình được (nút primary không cần nút disabled ở cạnh), nên  ║
 * ║ xé nó ra hai tấm không mất gì; giữ nó liền chỉ làm phép chia chật thêm.   ║
 * ║                                                                          ║
 * ║ SỐ LƯỢT (`#1`, `#2`) là thứ phân biệt HAI LẦN thêm cùng một bộ. Thiếu nó, ║
 * ║ hai cái thanh máu liền nhau thành một cụm bốn phần — và một cụm to hơn    ║
 * ║ trần thì bị cắt, đúng cái ta đang tránh. Lượt mới bắt đầu khi gặp lại một ║
 * ║ phần đã có trong lượt đang gom: một bộ không bao giờ có hai phần trùng    ║
 * ║ tên, nên dấu hiệu ấy chắc chắn là "người dùng thêm bộ này lần nữa".       ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export function compositionGroupOf(
  cells: readonly UiCell[],
  presets: PresetBundle,
): (cell: UiCell) => string {
  const keys = new Map<UiCell, string>();
  const inRun = new Set<string>();
  let runId = "";
  let runNo = 0;
  for (const cell of cells) {
    const set = presets.elements.find((preset) => preset.id === cell.elementId)?.set;
    const id = set && set.kind === "composition" ? set.id : "";
    if (!id) {
      runId = "";
      inRun.clear();
      continue;
    }
    if (id !== runId || inRun.has(cell.elementId)) {
      runNo += 1;
      runId = id;
      inRun.clear();
    }
    inRun.add(cell.elementId);
    keys.set(cell, `${id}#${runNo}`);
  }
  return (cell) => keys.get(cell) ?? "";
}

/**
 * DÒNG CỦA TỪNG TẤM cho một thẻ Bộ UI — **nguồn duy nhất** của phép chia ấy.
 *
 * Badge trên thẻ («6 element · 2 tấm (4 + 2)») và `uiKitSheets()` của bộ dịch
 * contract đều gọi hàm này. Hai bản sao của một phép chia là hai câu trả lời có
 * quyền lệch nhau cho câu hỏi "món cuối nằm ở tấm nào" — mà người dùng đọc câu
 * trên badge rồi bấm Vẽ theo câu ấy.
 */
export function uiKitSplit(
  block: UiKitBlock,
  presets: PresetBundle = getPresets(),
  max: number = maxPerSheetOf(block.maxPerSheet),
): UiCell[][] {
  return splitRows(block.cells, max, compositionGroupOf(block.cells, presets));
}

/**
 * Dòng của từng tấm cho một thẻ Nhân vật — cùng vai trò với `uiKitSplit`.
 *
 * Dáng KHÔNG có bộ ghép nào để giữ liền: mỗi dòng là một dáng đứng độc lập, nên
 * đây chỉ còn là phép chia theo thứ tự.
 */
export function mascotSplit(
  block: MascotBlock,
  max: number = maxPerSheetOf(block.maxPerSheet),
): MascotPose[][] {
  return splitRows(block.poses, max);
}

/**
 * CHỮ TRÊN BADGE nói kết quả chia: «1 tấm» · «2 tấm (4 + 2)».
 *
 * Nói SỐ Ô CỦA TỪNG TẤM chứ không chỉ số tấm: đó là thứ trả lời được câu hỏi duy
 * nhất người dùng có lúc đổi nấc — *«đổi xong thì món cuối nằm ở đâu»*. Một tấm
 * thì không có gì để liệt kê, nên không bày ra dấu ngoặc rỗng.
 */
export function sheetSplitNote(sizes: readonly number[]): string {
  if (sizes.length === 0) return "chưa có tấm nào";
  if (sizes.length === 1) return "1 tấm";
  return `${sizes.length} tấm (${sizes.join(" + ")})`;
}

/**
 * RANH GIỚI TẤM trong một danh sách dòng — mỗi tấm bắt đầu ở DÒNG nào.
 *
 * ╔══ VÌ SAO LÀ MỘT HÀM CHUNG, KHÔNG PHẢI HAI VÒNG LẶP TRONG HAI THẺ ════════╗
 * ║ Vạch ranh giới vẽ trên màn phải nằm ĐÚNG chỗ mà `splitRows` cắt — nếu     ║
 * ║ lệch một dòng thì người dùng kéo một món qua vạch, thấy nó "sang tấm 2",  ║
 * ║ rồi bấm Vẽ và nhận về một tấm 1 vẫn còn nó. Nên chỗ cắt chỉ được TÍNH RA  ║
 * ║ TỪ kết quả chia thật (`sizes` của `uiKitSplit`/`mascotSplit`), không bao   ║
 * ║ giờ từ một phép `index % max` dựng lại ở tầng hiển thị.                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Bộ ghép làm cho một tấm ngắn hơn trần (cụm không đủ chỗ thì sang tấm sau
 * NGUYÊN VẸN), nên `at` KHÔNG phải bội số của trần — đó chính là ca mà phép
 * `index % max` nói sai và hàm này nói đúng.
 */
export interface SheetBreakAt {
  /** Số thứ tự tấm, đếm từ 1 — đúng con số hiện trên nhãn. */
  no: number;
  /** Chỉ số DÒNG mở đầu tấm này trong danh sách phẳng. */
  at: number;
  /** Số ô của tấm này. */
  size: number;
}

export function sheetBreaks(sizes: readonly number[]): SheetBreakAt[] {
  const out: SheetBreakAt[] = [];
  let at = 0;
  for (const size of sizes) {
    out.push({ no: out.length + 1, at, size });
    at += size;
  }
  return out;
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

/**
 * MỘT TẤM ẢNH của câu ngữ cảnh chung, đã nằm trên đĩa dự án.
 *
 * ╔══ VÌ SAO CÓ MỘT MẢNG RIÊNG, KHÔNG NHÉT ẢNH VÀO `contextDoc` ═════════════╗
 * ║ Khối Ngữ cảnh chung có HAI chế độ, và ở chế độ khuôn nó là React thuần —   ║
 * ║ không có tài liệu TipTap nào để chứa một node ảnh. Nên mảng này là nguồn   ║
 * ║ sự thật cho CẢ HAI chế độ: ở khuôn nó là thứ duy nhất; ở tự do câu chữ vẫn ║
 * ║ là nguồn, nhưng `adoptContextDoc` rút ảnh trong câu ra đây ngay sau mỗi    ║
 * ║ nhịp gõ (đúng cách `themeValue`/`styleId` được rút ra). Nhờ vậy bộ dịch    ║
 * ║ contract chỉ phải đọc MỘT chỗ, không phải rẽ nhánh theo chế độ.            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export interface ContextRef {
  /** `refs/<tên>` trong dự án — thứ `gen.sh` đính kèm được. */
  path: string;
  /**
   * ẢNH NÀY NÓI VỀ CÁI GÌ, và vì thế nó đi vào đâu của contract:
   *  · `theme` / `style` → `variant.inspo[]` (ảnh tả bối cảnh, hoặc tả lối vẽ);
   *  · `logo`            → `variant.brand.refs[]`.
   * Hai đường khác nhau vì `gen.sh` nói về chúng bằng hai câu khác nhau.
   */
  role: "theme" | "style" | "logo";
  /**
   * Id asset trong THƯ VIỆN đã sinh ra tấm này; vắng = người dùng tự đính.
   *
   * Không phải để truy vết cho vui: đổi thương hiệu phải THAY đúng những tấm do
   * thương hiệu cũ mang tới và không được đụng vào tấm người dùng tự đính. Không
   * có dấu này thì phép thay ấy chỉ còn cách so đường dẫn với một bảng cache —
   * hai nguồn sự thật cho một câu hỏi.
   */
  assetId?: string;
}

export interface ComposerState {
  /** Cụm EN của chủ đề chung (theo quy ước `OUTFIT_THEMES`: value CHÍNH LÀ cụm EN). */
  themeValue: string;
  /**
   * MÔ TẢ CHỦ ĐỀ DO NGƯỜI DÙNG TỰ GÕ — thắng `themeValue` khi có chữ.
   *
   * ╔══ VÌ SAO MỘT TRƯỜNG RIÊNG, KHÔNG GHI ĐÈ THẲNG VÀO `themeValue` ══════════╗
   * ║ `theme` là kind lưu THẲNG cụm tiếng Anh (`phraseOf` trả về nguyên văn khi ║
   * ║ giá trị không có trong danh mục), nên về mặt kỹ thuật gõ thẳng vào        ║
   * ║ `themeValue` là chạy được. Nhưng lúc đó lựa chọn preset của người dùng bị ║
   * ║ NUỐT MẤT: bỏ chữ tự gõ đi thì không còn gì để quay về, và menu không biết ║
   * ║ đang chọn mục nào. Tách hai trường thì «Gõ mô tả riêng…» là một lớp phủ   ║
   * ║ tháo ra được, đúng như người dùng hiểu khi họ bấm vào nó.                 ║
   * ║ Và nó phải đúng cho MỌI kind, kể cả `style` — nơi value là một id, không   ║
   * ║ phải chữ (`phraseOf` trả rỗng cho id lạ ⇒ chữ tự gõ sẽ rơi khỏi prompt).   ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  themeCustom: string;
  /** Id phong cách chung, tra trong `presets.styles`. */
  styleId: string;
  /** Mô tả phong cách do người dùng tự gõ — thắng `styleId`. Xem `themeCustom`. */
  styleCustom: string;
  /**
   * THƯƠNG HIỆU đang theo (`brands[]` của thư viện dùng chung); rỗng = không theo.
   *
   * Là một THỰC THỂ được trỏ tới, không phải một túi thuộc tính chép vào tài
   * liệu: màu và asset của thương hiệu vẫn sống trong thư viện, ở đây chỉ giữ id.
   * Thứ ĐƯỢC chép sang là hệ quả của việc chọn (màu đổ vào `brandColors`, ảnh
   * chép vào `refs/` của dự án) — và chúng chép được vì người dùng còn phải sửa
   * chúng riêng cho bộ kit này.
   */
  brandId: string;
  /**
   * Ảnh của câu ngữ cảnh chung: ảnh người dùng tự đính + ảnh của thương hiệu.
   * Xem `ContextRef`.
   */
  contextRefs: ContextRef[];
  /**
   * BẢNG CHỐNG TẢI LẠI: id asset thư viện → `refs/<tên>` đã chép vào dự án.
   *
   * Asset của thư viện nằm ở kho dùng chung, KHÔNG nằm trong `refs/` của dự án,
   * mà `gen.sh` chỉ đính được tệp trong dự án. Nên chọn thương hiệu là một vòng
   * tải xuống + tải lên cho mỗi asset. Bảng này để lần chọn thứ hai (đổi đi rồi
   * đổi lại, mở lại dự án hôm sau) không trả lại cái giá ấy.
   * Nó CHỈ là cache: vai trò của từng tấm nằm ở `contextRefs`, không ở đây.
   */
  brandAssets: Record<string, string>;
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
 * Id duy nhất trong phiên. `Date.now()` một mình KHÔNG đủ: bấm "+ Element" ba
 * lần liên tiếp trong cùng một mili-giây là ba ô trùng key React, và React sẽ
 * tái dùng nhầm DOM giữa chúng.
 */
let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function newDocBlock(kind: "background" = "background"): DocBlock {
  return { id: newId(kind), kind, mode: "template", doc: backgroundDoc(), note: "", figmaFit: { ...DEFAULT_FIGMA_FIT } };
}

/** Dáng mặc định của một dòng mới — cùng id với `DEFAULT_POSE` của bộ dịch. */
export const DEFAULT_MASCOT_POSE = "idle";

/**
 * Một dòng dáng mới.
 *
 * Mặc định là dáng đứng chờ + góc mặc định của manơcanh + nét mặt ĐẦU danh mục:
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
  return { id: newId("mascot"), kind: "mascot", mode: "template", doc: mascotDoc(), poses: [], maxPerSheet: DEFAULT_MAX_PER_SHEET, figmaFit: { ...DEFAULT_FIGMA_FIT } };
}

export function newCell(elementId: string, presets: PresetBundle = getPresets()): UiCell {
  const preset = presets.elements.find((element) => element.id === elementId);
  return {
    id: newId("cell"),
    elementId,
    /* Kế thừa phong cách chung là mặc định — một ô vừa thêm KHÔNG được tự ý
       tách khỏi phong cách của cả bộ kit. */
    styleId: INHERIT,
    decor: decorLevelOf(preset?.decor),
    /* «Cân đối» cho mọi ô mới, kể cả ô «Không trang trí»: trường sống độc lập với
       việc nó có được in ra hay không (xem `UiCell.decorPlace`). */
    decorPlace: DECOR_PLACE_DEFAULT,
    /* MẶC ĐỊNH `solid` («Đục hoàn toàn», từ 11/09/2026), kể cả khi preset của loại
       element để rỗng: rỗng là di sản, không phải một lựa chọn (xem `UiCell.glazeId`).
       `glazeOrSolid` là chỗ DUY NHẤT biết nấc mặc định là nấc nào — đừng gõ `?? "solid"`
       ở đây, sẽ có chỗ thứ hai quên vào lần đổi sau. */
    glazeId: glazeOrSolid(preset?.glazeId),
    /* CỠ LUÔN CỤ THỂ, và cụ thể THEO LOẠI: `defaultSizeOf` đo từ `skel` của chính
       loại element (thanh máu ra hộp rộng-mỏng, khung avatar ra hộp vuông). Element
       người dùng tự thêm không khai hình dạng ⇒ hộp trung tính — xem `cell-size.ts`. */
    sizeId: defaultSizeOf(preset),
    note: "",
  };
}

export function newUiKitBlock(): UiKitBlock {
  /* `template` là mặc định — xem khối chú thích của `UiCell.doc`: chế độ tự do
     mount một editor cho MỖI dòng, và không ai được trả cái giá ấy vì lỡ tay. */
  return { id: newId("uikit"), kind: "uikit", mode: "template", cells: [], maxPerSheet: DEFAULT_MAX_PER_SHEET, figmaFit: { ...DEFAULT_FIGMA_FIT } };
}

/** Trạng thái lúc mở màn: chỉ có ngữ cảnh chung, chưa block nào. */
export function initialComposer(presets: PresetBundle = getPresets()): ComposerState {
  return {
    /**
     * CHỦ ĐỀ MỞ MÀN = RỖNG, và đó là một bản vá chứ không phải một lựa chọn thẩm mỹ.
     *
     * ╔══ MỘT CHỦ ĐỀ KHÔNG AI CHỌN LÀ MỘT CHỦ ĐỀ KHÔNG AI GỠ ĐƯỢC ═════════════╗
     * ║ Tới 18/09/2026 chỗ này gieo sẵn chủ đề Tết. Hệ quả đo trên prompt thật:║
     * ║ `## Art style` của MỌI tấm — kể cả tấm 16 nút bấm — mang câu           ║
     * ║ «Vietnamese Tết theme: red and gold, lanterns, apricot and peach        ║
     * ║ blossom motifs», trong khi người dùng chưa từng bấm vào pill chủ đề và ║
     * ║ không có lý do nào để đi tìm cái cần tắt. Một giá trị mặc định thì phải ║
     * ║ là thứ ĐÚNG cho mọi bộ kit; "Tết" thì đúng cho đúng một mùa của đúng    ║
     * ║ một nước.                                                              ║
     * ║ Rỗng thì pill hiện chữ «chủ đề» (placeholder) — màn hình và prompt nói  ║
     * ║ CÙNG một điều: chưa chọn chủ đề nào, nên không có câu chủ đề nào cả.    ║
     * ║ Phong cách thì GIỮ mặc định: preset đầu bảng hiện rõ TÊN trên pill, nên ║
     * ║ nó là một lựa chọn người dùng nhìn thấy và đổi được ngay.               ║
     * ╚═══════════════════════════════════════════════════════════════════════╝
     */
    themeValue: "",
    styleId: presets.styles[0]?.id ?? "",
    /* Mở màn có SẴN hai màu chứ không phải một ô trống: demo này để người ta
       thấy màu đi vào prompt ra chữ gì, mà một danh sách rỗng thì không thấy
       gì cả. Hai màu cũng là hình dạng thật của phần lớn bộ nhận diện. */
    brandColors: ["#ff5533", "#112233"],
    themeCustom: "",
    styleCustom: "",
    brandId: "",
    contextRefs: [],
    brandAssets: {},
    contextMode: "template",
    blocks: [],
  };
}
