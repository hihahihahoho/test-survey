import * as React from "react";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extension-placeholder";

import { OptionPill } from "../extensions/OptionPill";
import { ImagePill } from "../extensions/ImagePill";
import { SlashCommand } from "../extensions/SlashCommand";
import type { BlockMode } from "../lib/composer-model";

/**
 * BlockEditor — MỘT instance TipTap cho MỘT block.
 *
 * ╔══ HAI CHẾ ĐỘ, MỘT EDITOR ════════════════════════════════════════════════╗
 * ║ `template` (mặc định): `editable: false`. Chữ khung KHOÁ — không gõ, không║
 * ║   xoá, không dán. Nhưng PILL VẪN BẤM ĐƯỢC.                                ║
 * ║ `free`: mở khoá, cả câu thành văn bản gõ thoải mái, `/` chèn thêm pill.   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO PILL VẪN BẤM ĐƯỢC KHI `editable: false` — ĐÃ KIỂM TRÊN TRÌNH DUYỆT
 * `editable: false` chỉ bỏ `contenteditable` trên vùng soạn thảo; nó KHÔNG vô
 * hiệu hoá DOM bên trong. Pill là node view React render ra một `<button>` thật,
 * và node view khai `stopEvent: () => true` nên ProseMirror không hề chạm vào
 * sự kiện của nó. Còn `updateAttributes()` thì đi thẳng qua `dispatch` chứ không
 * qua bàn phím, nên nó vẫn áp được lên một editor đang khoá.
 *
 * Đây là điều PHẢI kiểm bằng tay chứ không được suy: nếu ProseMirror có chặn thì
 * phương án hai đã là "chữ template render bằng React thuần, chỉ chế độ tự do
 * mới mount TipTap". Phương án một chạy được, nên giữ nó — nhờ vậy chuyển chế độ
 * KHÔNG phải dựng lại editor, và nội dung không thể mất trong lúc chuyển.
 *
 * ══ VÌ SAO KHÔNG DÙNG `deps` CỦA `useEditor` ĐỂ ĐỔI `editable` ═════════════
 * `useEditor(options, deps)` HUỶ và dựng lại editor khi deps đổi — tức là mỗi
 * lần gạt công tắc là một editor mới, mất undo và (nếu `content` prop đã cũ)
 * mất luôn chữ vừa gõ. Gọi `setEditable()` trong effect thì chỉ đổi đúng cái cần
 * đổi.
 */
/**
 * BẬC CHỮ CỦA VÙNG SOẠN — hai bậc, và chúng ứng với hai thứ khác nhau.
 *
 * ╔══ VÌ SAO KHÔNG ĐỂ MỘT BẬC DUY NHẤT ══════════════════════════════════════╗
 * ║ `prose` (20px) là bậc của MỘT CÂU LÀ CẢ MỘT THẺ — block Cảnh nền / Nhân   ║
 * ║ vật, nơi câu ấy là toàn bộ nội dung và xứng đáng cỡ chữ ấy.               ║
 * ║ `row` (text-body) là bậc của MỘT DÒNG TRONG DANH SÁCH — dòng element của  ║
 * ║ block Bộ UI. Soi tận mắt trên trình duyệt: để nguyên `prose` ở đó thì gạt ║
 * ║ công tắc «Tự do» làm chữ trong CÙNG MỘT THẺ nhảy một bậc, dòng tràn thành ║
 * ║ hai hàng, và nhãn "#1 Nút bấm" bên trái tụt hẳn khỏi hàng chữ nó chú.     ║
 * ║ Đúng cái "to nhỏ không đều" mà chủ sản phẩm chỉ ra ở đợt trước.           ║
 * ║ Pill KHÔNG khai cỡ riêng (xem `pill-ui.tsx`) nên nó tự đi theo bậc này —  ║
 * ║ đổi một chỗ, cả dòng theo, không có chỗ nào lệch lại.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
const SCALE: Record<"prose" | "row", string> = {
  prose: "text-prose text-fg-strong",
  row: "text-body text-fg-strong",
};

export function BlockEditor({
  doc,
  mode,
  onChange,
  resetToken,
  placeholder,
  scale = "prose",
}: {
  doc: JSONContent;
  mode: BlockMode;
  onChange: (next: JSONContent) => void;
  /** Bậc chữ của vùng soạn — xem `SCALE`. */
  scale?: "prose" | "row";
  /**
   * Đổi số này = "nạp lại `doc` vào editor".
   *
   * Cần một tín hiệu RIÊNG chứ không so sánh `doc`: `doc` đổi sau MỌI lần gõ
   * (chính editor bắn ra), nên lấy nó làm điều kiện nạp lại là editor tự nạp
   * lại chính mình sau mỗi ký tự — con trỏ nhảy về đầu bài mỗi lần gõ.
   */
  resetToken: number;
  placeholder: string;
}) {
  const editor = useEditor({
    /* `immediatelyRender: false` — editor dựng ở effect sau lần render đầu. Cần
       cho hai chuyện: render phía server / trong test không chạm DOM, và React
       18 StrictMode không dựng-huỷ-dựng editor hai lần. Đổi lại `editor` có thể
       là `null` ở nhịp đầu, nên mọi chỗ dùng đều phải chịu được null. */
    immediatelyRender: false,
    editable: mode === "free",
    extensions: [
      StarterKit.configure({
        /* Cắt gần hết StarterKit. Đây là một PROMPT, không phải tài liệu: đậm,
           nghiêng, tiêu đề, danh sách, blockquote đều không đi vào prompt được
           (bộ serialize chỉ đọc chữ trần), nên để chúng bật là hứa một thứ mà
           lúc copy sẽ im lặng biến mất. */
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        link: false,
        listItem: false,
        listKeymap: false,
        orderedList: false,
        strike: false,
        underline: false,
        /* Không có node cuối tự thêm: mỗi block là MỘT câu, không phải một bài. */
        trailingNode: false,
      }),
      Placeholder.configure({ placeholder }),
      /* Pill đi theo bậc chữ của vùng soạn — xem `SCALE` và `addOptions()` của
         `OptionPill`. Cấu hình MỘT LẦN lúc dựng editor là đủ: `scale` là hằng của
         từng chỗ gọi, không đổi lúc chạy. */
      OptionPill.configure({ compact: scale === "row" }),
      ImagePill,
      SlashCommand,
    ],
    content: doc,
    onUpdate: ({ editor: instance }) => onChange(instance.getJSON()),
    editorProps: {
      attributes: {
        /* Cỡ chữ to đặt Ở ĐÂY (trên chính vùng contenteditable) chứ không ở thẻ
           bọc: caret cao bao nhiêu là do thẻ editable quyết định. Đặt sai chỗ ⇒
           con nháy cao 14px giữa dòng 24px.

           `text-prose` (20px, weight 400) — bậc dựng RIÊNG cho câu mad-lib. Bản
           trước mượn `text-display` (24px/650) rồi gỡ đậm bằng `font-normal`: hai
           lần chữa cho một bậc vốn dành cho tiêu đề, và câu soạn hoá ra to gần
           bằng H1 của trang. Vẫn KHÔNG được gõ `text-[20px]` — repo có cổng cấm
           cỡ chữ ngoặc vuông (`src/__tests__/w2b-dosage.test.ts`); cách đúng là
           thêm một bậc có tên, và đó là việc đã làm.

           Bậc CỤ THỂ do `scale` chọn — xem khối chú thích của `SCALE`. */
        class: SCALE[scale],
      },
    },
  });

  React.useEffect(() => {
    editor?.setEditable(mode === "free");
  }, [editor, mode]);

  React.useEffect(() => {
    if (!editor || resetToken === 0) return;
    /* `emitUpdate: false`: lần nạp lại này là do CHÍNH ta gây ra và `doc` đã là
       thứ vừa đưa vào state. Cho nó bắn `onUpdate` là một vòng state thừa. */
    editor.commands.setContent(doc, { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ nạp lại theo TÍN HIỆU, xem chú thích `resetToken`
  }, [editor, resetToken]);

  if (!editor) {
    /* Khung giữ chỗ cao bằng một dòng để card không giật khi editor dựng xong. */
    return <div className="min-h-10" aria-hidden />;
  }

  return <EditorContent editor={editor} />;
}
