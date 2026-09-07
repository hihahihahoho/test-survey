import { NODE } from "./schema";
import { readPillImage } from "@/features/prompt-canvas/lib/pill-image";
import { INHERIT, phraseOf, type PillKind } from "./pill-registry";
import { describeBrandColors } from "./brand-colors";
import { getPresets, type PresetBundle } from "./presets-store";

/**
 * serialize.ts — MỘT TÀI LIỆU TIPTAP → một dòng chữ.
 *
 * Tầng dưới cùng: chỉ biết đọc JSON của MỘT block. Việc ghép cả màn thành prompt
 * nằm ở `serialize-composer.ts`. Tách hai tầng vì chúng hỏng theo hai kiểu khác
 * nhau — tầng này hỏng thì một pill ra sai chữ, tầng kia hỏng thì cả một block
 * biến mất khỏi prompt.
 *
 * Hàm THUẦN trên JSON: không chạm `Editor`, không chạm DOM ⇒ test được ở môi
 * trường `node`, và panel "xem trước" với nút "copy" dùng CHUNG một hàm nên
 * không có đường nào để cái nhìn thấy khác cái copy được.
 */

/**
 * Hình dạng TỐI THIỂU của một node JSON. Cố ý KHÔNG dùng `JSONContent` của
 * `@tiptap/core` ở tham số: hàm này phải gọi được từ test thuần logic mà không
 * kéo cả ProseMirror vào. `JSONContent` thật khớp cấu trúc nên truyền thẳng vẫn
 * đúng kiểu.
 */
export interface PromptDocNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  content?: PromptDocNode[];
}

/**
 * NGỮ CẢNH CHUNG mà pill để trống sẽ kế thừa.
 *
 * Truyền vào chứ không đọc biến toàn cục: một block không tự biết theme/phong
 * cách tổng là gì, và cái duy nhất biết là màn hình. Truyền tường minh thì test
 * dựng được mọi tổ hợp mà không phải giả lập store.
 */
export interface SerializeContext {
  /** Cụm EN của phong cách chung — thay cho pill `style` để trống. */
  styleEN: string;
  /** Cụm EN của CHỦ ĐỀ chung (mô-típ, màu, biểu tượng) — xem `ThemeOption.kitEN`. */
  themeEN: string;
  /**
   * Cụm TRANG PHỤC của chủ đề chung — thay cho pill `outfit` để trống.
   *
   * Tách khỏi `themeEN` từ 09/2026: hai chỗ dùng hai câu khác nhau cho cùng một
   * chủ đề ("Vietnamese Tết theme: red and gold, lanterns…" cho cả bộ kit,
   * "a Vietnamese Tết festive outfit…" cho quần áo của nhân vật). Dùng chung một
   * chuỗi thì một trong hai chỗ luôn đọc sai — và chỗ đọc sai là 15/16 tấm.
   */
  outfitEN: string;
  presets: PresetBundle;
  /** Bộ đếm ảnh, dùng CHUNG cho cả prompt để đánh số liên tục qua mọi block. */
  imageCounter: { count: number };
  /**
   * Màu thương hiệu, để dựng chữ cho node `brandPill`.
   *
   * Ở ĐÂY chứ không trong attrs của node — node ấy cố ý rỗng, xem `NODE.brandPill`.
   * Nhờ vậy câu chữ luôn tả đúng mảng màu HIỆN TẠI, kể cả khi người dùng sửa màu
   * sau lúc viết câu.
   */
  brandColors: readonly string[];
}

export function makeContext(partial: Partial<SerializeContext> = {}): SerializeContext {
  return {
    styleEN: partial.styleEN ?? "",
    themeEN: partial.themeEN ?? "",
    outfitEN: partial.outfitEN ?? "",
    presets: partial.presets ?? getPresets(),
    imageCounter: partial.imageCounter ?? { count: 0 },
    brandColors: partial.brandColors ?? [],
  };
}

function readAttr(attrs: Record<string, unknown> | null | undefined, key: string): string {
  const raw = attrs?.[key];
  return typeof raw === "string" ? raw : "";
}

/**
 * Cụm EN của một pill, đã tính cả luật "để trống = kế thừa".
 *
 * ╔══ CHỮ TỰ GÕ THẮNG PRESET, VÀ ĐI NGUYÊN VĂN ══════════════════════════════╗
 * ║ Không dịch, không bọc dấu nháy, không thêm nhãn kiểu `custom:` — mọi thứ   ║
 * ║ ta gói quanh câu của người dùng đều là chữ HỌ KHÔNG VIẾT mà vẫn bị gửi tới ║
 * ║ máy vẽ. Ngôn ngữ họ tự chịu: pill hiện sẵn cụm tiếng Anh của từng preset   ║
 * ║ ngay trong menu, nên ai gõ tay cũng đã thấy trước hàng xóm của câu mình.   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
function pillText(node: PromptDocNode, ctx: SerializeContext): string {
  const kind = readAttr(node.attrs, "kind") as PillKind;
  const value = readAttr(node.attrs, "value");
  const custom = readAttr(node.attrs, "custom").trim();
  if (custom) return custom;
  if (value === INHERIT) {
    if (kind === "style") return ctx.styleEN;
    if (kind === "outfit") return ctx.outfitEN;
    /* Các kind khác để trống là THẬT SỰ trống — không bịa gì vào prompt. */
    return "";
  }
  return phraseOf(kind, value, ctx.presets);
}

/** Cái móc đánh số cho một pill ảnh. Ảnh không đi vào chữ được — xem chú thích. */
function imageText(node: PromptDocNode, ctx: SerializeContext): string {
  /* ChatGPT nhận ảnh qua ô đính kèm chứ không qua chữ. Nên chỗ này để lại một
     CÁI MÓC CÓ SỐ để câu prompt còn trỏ được: "…tham chiếu [ảnh tham chiếu 1]".
     Người dùng kéo đúng số ảnh đó vào khung chat là khớp.

     Pill CHƯA có ảnh (hoặc ảnh đời `blob:` cũ đã chết) ra cái móc KHÔNG SỐ: đánh
     số cho một tấm không tồn tại là bảo người dùng đi tìm tấm thứ ba trong một
     danh sách hai tấm. */
  const image = readPillImage(node.attrs);
  if (!image.path) return "[ảnh tham chiếu]";
  return `[ảnh tham chiếu ${(ctx.imageCounter.count += 1)}]`;
}

function walkInline(nodes: PromptDocNode[] | undefined, ctx: SerializeContext): string {
  if (!nodes) return "";
  let out = "";
  for (const node of nodes) {
    switch (node.type) {
      case "text":
        out += node.text ?? "";
        break;
      case NODE.optionPill: {
        out += pillText(node, ctx);
        /* Pill CÓ ẢNH ⇒ cái móc có số đi NGAY SAU chữ của nó, y như hồi ảnh còn
           là một node rời đứng cạnh. Bỏ bước này thì prompt vẫn đúng chữ nhưng
           mất chỗ trỏ tới tấm ảnh sắp đính kèm, và `countImageRefs` (thanh nhắc
           "nhớ kèm N ảnh") đếm hụt — hai lời nói dối đối với người sắp dán prompt
           vào khung chat. */
        if (readPillImage(node.attrs).path) out += ` ${imageText(node, ctx)}`;
        break;
      }
      case NODE.imagePill:
        out += imageText(node, ctx);
        break;
      case NODE.brandPill:
        /* Node rỗng ⇒ chữ đến từ NGỮ CẢNH, không từ node. Cùng một hàm mô tả mà
           câu template đang dùng, nên gạt công tắc không làm đổi chữ gửi đi vẽ. */
        out += describeBrandColors(ctx.brandColors);
        break;
      case NODE.brandProfilePill:
        /* KHÔNG MỘT CHỮ NÀO. Tên riêng của một thương hiệu không giúp máy vẽ:
           "Bộ kit theme Tết phong cách Merge, thương hiệu Vinamilk" dạy model đi
           lục trí nhớ về một cái tên thay vì vẽ theo thứ đang được tả. Thứ THẬT
           SỰ nói lên thương hiệu đã đi bằng hai đường khác: bộ màu (mệnh đề của
           `brandPill` ngay cạnh) và logo đính kèm (`variant.brand.refs`). */
        break;
      case "hardBreak":
        out += " ";
        break;
      default:
        /* Node lạ (mark bọc, node đời sau) — vẫn đi vào ruột nó. Im lặng bỏ qua
           một nhánh là cách nhanh nhất để prompt thiếu chữ mà không ai thấy. */
        out += walkInline(node.content, ctx);
        break;
    }
  }
  return out;
}

/**
 * Dọn khoảng trắng của một dòng.
 *
 * Cần thật, không phải cho đẹp: bỏ trống một pill giữa câu để lại hai dấu cách
 * dính nhau, và "không khí  , tham chiếu" là chữ mà model đọc y như ta thấy.
 * Cũng vá dấu cách thừa TRƯỚC dấu câu và dấu câu dính chùm khi ô cuối bỏ trống.
 */
export function tidy(line: string): string {
  return line
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?)])/g, "$1")
    .replace(/([(])\s+/g, "$1")
    .replace(/([,;:])(?=[,.;:])/g, "")
    .trim();
}

/** Tài liệu của MỘT block → một dòng chữ đã dọn. */
export function serializeDoc(doc: PromptDocNode | null | undefined, ctx: SerializeContext): string {
  if (!doc) return "";
  return (doc.content ?? [])
    .map((block) => tidy(walkInline(block.content, ctx)))
    .filter(Boolean)
    .join(" ");
}

/** Toàn bộ chữ TRẦN của một tài liệu (không đổi pill thành EN) — xem `freeText`. */
export function plainText(doc: PromptDocNode | null | undefined): string {
  if (!doc) return "";
  let out = "";
  const walk = (node: PromptDocNode): void => {
    if (node.type === "text") out += node.text ?? "";
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return out;
}

/**
 * Chữ NGƯỜI DÙNG viết thêm, sau khi trừ đi phần khung của template.
 *
 * Dùng cho badge "tự do ✎" và cho việc hỏi trước khi quay về template. Cách đo:
 * trừ MỘT LẦN mỗi mẩu scaffolding khỏi chuỗi chữ trần. Nói thẳng giới hạn: nếu
 * người dùng sửa ĐÚNG GIỮA một mẩu khung ("Vẽ cảnh nền" → "Vẽ nền") thì mẩu đó
 * không trừ được và phần còn lại bị tính là chữ thêm — tức là ta HỎI THỪA chứ
 * không bao giờ ÂM THẦM XOÁ. Sai về phía an toàn là cố ý.
 */
export function freeText(doc: PromptDocNode | null | undefined, scaffold: readonly string[]): string {
  let rest = plainText(doc);
  for (const piece of scaffold) {
    const at = rest.indexOf(piece);
    if (at !== -1) rest = rest.slice(0, at) + rest.slice(at + piece.length);
  }
  return rest.trim();
}

/** Số ảnh tham chiếu trong một tài liệu — thanh dưới nhắc "nhớ đính kèm N ảnh". */
export function countImageRefs(doc: PromptDocNode | null | undefined): number {
  if (!doc) return 0;
  let total = 0;
  const walk = (node: PromptDocNode): void => {
    /* Đếm ảnh CÓ THẬT trên đĩa, không đếm pill trống: một pill chưa chọn ảnh là
       một chỗ để trống, không phải một tấm phải nhớ đính kèm. Hai loại node cùng
       mang ảnh từ 09/2026 — pill chọn-một giữ ảnh của chính nó (xem attr `path`
       ở `extensions/OptionPill.tsx`). */
    if (
      (node.type === NODE.imagePill || node.type === NODE.optionPill) &&
      readPillImage(node.attrs).path
    ) {
      total += 1;
    }
    for (const child of node.content ?? []) walk(child);
  };
  walk(doc);
  return total;
}
