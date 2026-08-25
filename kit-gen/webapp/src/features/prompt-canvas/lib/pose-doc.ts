import type { JSONContent } from "@tiptap/react";
import { NODE } from "@/features/prompt-lab/lib/schema";
import type { DocBlock } from "@/features/prompt-lab/lib/composer-model";
import { DEFAULT_VIEW, type CameraView } from "@/features/pose-lab/lib/pose-state";
import type { PillImage } from "./pill-image";

/**
 * pose-doc.ts — ĐỌC/GHI hai thứ của block Nhân vật NẰM TRONG tài liệu TipTap.
 *
 * ╔══ VÌ SAO KHÔNG DỰNG MỘT TRƯỜNG `pose` RIÊNG TRÊN BLOCK ══════════════════╗
 * ║ Vì `mascotSheet()` (bộ dịch contract) lấy dáng từ PILL trong câu, không    ║
 * ║ từ đâu khác. Thêm `block.pose` cạnh cái pill là hai nguồn sự thật cho một  ║
 * ║ thông tin, và cái đi tới máy vẽ là cái người dùng KHÔNG bấm.               ║
 * ║ Nên thanh pill trên thẻ ở màn thật đọc và ghi THẲNG vào pill trong câu:    ║
 * ║ bấm trên thanh hay bấm trong câu đều sửa đúng một chỗ.                     ║
 * ║ Ngược lại `poseView` KHÔNG có mặt trong câu (nó không đi vào prompt), nên  ║
 * ║ nó là một trường của block — xem chú thích ở `composer-model.ts`.          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

/** Dáng dùng khi câu chưa có pill dáng nào — cùng giá trị với `DEFAULT_POSE` bộ dịch. */
export const FALLBACK_POSE = "idle";

function walk(node: JSONContent, visit: (n: JSONContent) => JSONContent | null): JSONContent {
  const replaced = visit(node);
  if (replaced) return replaced;
  if (!node.content) return node;
  return { ...node, content: node.content.map((child) => walk(child, visit)) };
}

/** Giá trị của pill [dáng] ĐẦU TIÊN trong câu. Rỗng ⇒ câu không có pill dáng nào. */
export function readPosePill(doc: JSONContent | null | undefined): string {
  let found = "";
  const scan = (node: JSONContent | null | undefined): void => {
    if (!node || found) return;
    if (node.type === NODE.optionPill && node.attrs?.["kind"] === "pose") {
      found = typeof node.attrs["value"] === "string" ? node.attrs["value"] : "";
      return;
    }
    for (const child of node.content ?? []) scan(child);
  };
  scan(doc);
  return found;
}

/** Ghi giá trị vào pill [dáng] đầu tiên. Câu không có pill dáng ⇒ trả về nguyên bản. */
export function writePosePill(doc: JSONContent, value: string): JSONContent {
  let done = false;
  return walk(doc, (node) => {
    if (done) return null;
    if (node.type !== NODE.optionPill || node.attrs?.["kind"] !== "pose") return null;
    done = true;
    return { ...node, attrs: { ...node.attrs, value } };
  });
}

/**
 * Ghi ảnh dáng vừa chụp vào ĐÚNG pill ảnh của nó.
 *
 * ╔══ CHỌN PILL ẢNH NÀO — VÀ VÌ SAO KHÔNG PHẢI PILL ĐẦU ═════════════════════╗
 * ║ Câu mẫu Nhân vật có HAI pill ảnh: "Tạo nhân vật [ảnh] với dáng […] (hoặc   ║
 * ║ ảnh dáng [ảnh])". Pill thứ nhất là ẢNH NHÂN VẬT do người dùng đưa vào —    ║
 * ║ khuôn mặt, trang phục, danh tính. Pill thứ hai mới là chỗ của ảnh dáng.    ║
 * ║ Đè lên pill thứ nhất là XOÁ ảnh nhân vật của họ để thay bằng một hình      ║
 * ║ manơcanh xám, và họ không hề bấm gì để yêu cầu điều đó.                    ║
 * ║                                                                          ║
 * ║ Hệ quả nói thẳng: `mascotSheet()` đặt `sheet.ref` = ảnh ĐẦU TIÊN có đường  ║
 * ║ dẫn. Nên khi người dùng CHƯA đưa ảnh nhân vật, ảnh dáng thành `sheet.ref`  ║
 * ║ (đúng ý wave này); khi họ ĐÃ có ảnh nhân vật, ảnh nhân vật thắng — và đó   ║
 * ║ là thứ tự ưu tiên đúng, vì danh tính nhân vật quan trọng hơn góc chụp.     ║
 * ║ Câu chỉ có một pill ảnh (người dùng xoá bớt ở chế độ tự do) ⇒ ghi vào nó.  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export function writePoseRefPill(doc: JSONContent, image: PillImage): JSONContent {
  const total = countImagePills(doc);
  const target = total >= 2 ? 1 : 0;
  let seen = -1;
  return walk(doc, (node) => {
    if (node.type !== NODE.imagePill) return null;
    seen += 1;
    if (seen !== target) return null;
    return { ...node, attrs: { ...node.attrs, refName: image.refName, path: image.path } };
  });
}

function countImagePills(node: JSONContent | null | undefined): number {
  if (!node) return 0;
  if (node.type === NODE.imagePill) return 1;
  return (node.content ?? []).reduce((sum, child) => sum + countImagePills(child), 0);
}

/** Góc máy đang chọn của một block Nhân vật. Thiếu/lạ ⇒ góc mặc định của pose-lab. */
export function poseViewOf(block: DocBlock): CameraView {
  return (block.poseView || DEFAULT_VIEW) as CameraView;
}

/** Khoá cache của một cặp (dáng, góc) trong `block.poseRefs`. */
export function poseRefKey(pose: string, view: string): string {
  return `${pose}|${view}`;
}
