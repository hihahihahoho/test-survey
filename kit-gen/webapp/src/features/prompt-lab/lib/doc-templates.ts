import type { JSONContent } from "@tiptap/react";
import { NODE } from "./schema";
import { INHERIT, type PillKind } from "./pill-registry";

/**
 * doc-templates.ts — CÂU MAD-LIB của từng loại block, dựng bằng JSON.
 *
 * TipTap nhận cả chuỗi HTML, nhưng lúc đó pill phải được `parseHTML` dựng lại từ
 * `data-*` — thêm một vòng dịch có thể sai mà không báo. JSON đi thẳng vào
 * schema: sai tên node là ProseMirror ném lỗi NGAY LÚC NẠP, không phải lúc copy.
 *
 * ══ SCAFFOLDING LÀ HẰNG SỐ, KHÔNG PHẢI CHỮ RẢI TRONG CODE ══════════════════
 * Phần chữ cố định của mỗi câu ("Vẽ cảnh nền ", ", không khí "…) được khai
 * thành mảng `SCAFFOLD_*` vì nó có việc thứ hai: ở chế độ TỰ DO, bộ serialize
 * cần biết đâu là chữ của template và đâu là chữ NGƯỜI DÙNG viết thêm. Trừ
 * chuỗi khỏi chuỗi thì cần đúng những mẩu này. Rải chữ trong code là đảm bảo
 * hai nơi sẽ lệch nhau sau đúng một lượt sửa câu chữ.
 */

const text = (value: string): JSONContent => ({ type: "text", text: value });

const pill = (kind: PillKind, value: string): JSONContent => ({
  type: NODE.optionPill,
  attrs: { kind, value },
});

/* Pill ảnh RỖNG: chưa có ảnh nào trên đĩa. Hai trường rỗng chứ không phải
   `null` — đúng giá trị mặc định của attr, xem `EMPTY_PILL_IMAGE`. */
const imagePill = (): JSONContent => ({ type: NODE.imagePill, attrs: { refName: "", path: "" } });

/* ── Block BACKGROUND ─────────────────────────────────────────────────────── */

export const SCAFFOLD_BACKGROUND = ["Vẽ cảnh nền ", ", không khí ", ", tham chiếu ", "."] as const;

export function backgroundDoc(): JSONContent {
  const [a, b, c, d] = SCAFFOLD_BACKGROUND;
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          text(a),
          pill("scene", "main-menu"),
          text(b),
          pill("mood", "festive"),
          text(c),
          imagePill(),
          text(d),
        ],
      },
    ],
  };
}

/* ── Block MASCOT ─────────────────────────────────────────────────────────── */

export const SCAFFOLD_MASCOT = [
  "Tạo nhân vật ",
  " với dáng ",
  " (hoặc ảnh dáng ",
  "), biểu cảm ",
  ", trang phục ",
  ".",
] as const;

export function mascotDoc(): JSONContent {
  const [a, b, c, d, e, f] = SCAFFOLD_MASCOT;
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          text(a),
          imagePill(),
          text(b),
          pill("pose", "idle"),
          text(c),
          imagePill(),
          text(d),
          pill("expression", "a big bright smile"),
          text(e),
          /* Rỗng = kế thừa theme tổng ở đầu tài liệu. Mặc định đúng ngay, và
             người dùng vẫn bấm để ghi đè cho riêng nhân vật này. */
          pill("outfit", INHERIT),
          text(f),
        ],
      },
    ],
  };
}

/** Scaffolding theo loại block — bộ serialize chế độ TỰ DO dùng để trừ chuỗi. */
export const SCAFFOLDS: Record<"background" | "mascot", readonly string[]> = {
  background: SCAFFOLD_BACKGROUND,
  mascot: SCAFFOLD_MASCOT,
};
