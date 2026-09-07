import * as React from "react";
import { Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from "@tiptap/react";
import { NODE } from "../lib/schema";
import { BrandPickerPill, type BrandBinding } from "../components/BrandPickerPill";

/**
 * BrandProfilePill — pill «thương hiệu» đứng inline trong câu Ngữ cảnh chung.
 *
 * ╔══ CÙNG LUẬT "NODE RỖNG" VỚI `brandPill` (dãy màu) ═══════════════════════╗
 * ║ Thương hiệu đang chọn là một THỰC THỂ nằm trong kho dùng chung, và thứ    ║
 * ║ tài liệu này giữ chỉ là một id (`ComposerState.brandId`). Nhét id ấy vào  ║
 * ║ attrs của node là dựng nguồn sự thật thứ hai cho cùng một dữ liệu — đúng  ║
 * ║ cái hố mà `NODE.brandPill` đã tránh và mà pill của dòng element đã ngã    ║
 * ║ xuống một lần (xem `PILL_SLOTS`). Nên node này chỉ là CÁI MỐC: "chỗ này   ║
 * ║ trong câu là thương hiệu". Xoá node = thôi nhắc thương hiệu trong câu;    ║
 * ║ màu và ảnh của nó vẫn đi tới contract như thường, vì đó là đường khác.    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO CONTEXT CHẠY XUYÊN QUA PROSEMIRROR ═════════════════════════════
 * `ReactNodeViewRenderer` đăng ký một PORTAL trên chính `EditorContent`, và
 * portal ấy là con của `EditorContent` trong CÂY REACT — nên mọi Provider bọc
 * ngoài `<BlockEditor>` vẫn tới được đây. Xem `BrandPill.tsx`.
 */

/**
 * `null` = chưa có Provider nào (route lab, ca test dựng editor trần).
 *
 * Phân biệt với "có Provider mà kho rỗng": ở ca đầu pill phải im lặng bằng chữ
 * thay vì vẽ một control không nối vào đâu — cùng luật với `BrandColorsContext`.
 */
const BrandBindingContext = React.createContext<BrandBinding | null>(null);

export function BrandBindingProvider({ value, children }: { value: BrandBinding; children: React.ReactNode }) {
  return <BrandBindingContext.Provider value={value}>{children}</BrandBindingContext.Provider>;
}

/**
 * Dây thương hiệu đang treo trên cây React, hoặc `null`.
 *
 * Công khai vì `ImagePill` cũng đọc nó — pill ảnh nhân vật mời «Mascot của …»
 * lấy từ đúng thương hiệu này. Hai chỗ đọc, MỘT dây: nếu pill ảnh tự đi hỏi kho
 * thư viện lần nữa thì có ngày nó mời linh vật của một thương hiệu khác với cái
 * đang ghi trong câu.
 */
export function useBrandBinding(): BrandBinding | null {
  return React.useContext(BrandBindingContext);
}

function BrandProfilePillView() {
  const bound = useBrandBinding();

  return (
    <NodeViewWrapper as="span" className="relative inline-block" data-kg-node={NODE.brandProfilePill}>
      {bound ? (
        <BrandPickerPill binding={bound} />
      ) : (
        <span className="text-fg-muted">[thương hiệu]</span>
      )}
    </NodeViewWrapper>
  );
}

export const BrandProfilePill = Node.create({
  name: NODE.brandProfilePill,
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: `span[data-kg-node="${NODE.brandProfilePill}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-kg-node": NODE.brandProfilePill })];
  },

  addNodeView() {
    /* `stopEvent: () => true` — cùng lý do với `OptionPill`: không có nó thì cú
       bấm mở menu bị ProseMirror diễn giải thành "đặt selection vào node", node
       view dựng lại, và menu đóng ngay khi vừa mở. */
    return ReactNodeViewRenderer(BrandProfilePillView, { stopEvent: () => true });
  },
});
