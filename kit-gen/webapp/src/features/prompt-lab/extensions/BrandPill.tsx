import * as React from "react";
import { Node, NodeViewWrapper, ReactNodeViewRenderer, mergeAttributes } from "@tiptap/react";
import { NODE } from "../lib/schema";
import { BrandColorPills } from "../components/BrandColorPills";

/**
 * BrandPill — DÃY MÀU THƯƠNG HIỆU đứng inline trong câu Ngữ cảnh chung tự do.
 *
 * ╔══ NODE RỖNG + MÀU ĐỌC QUA CONTEXT: VÌ SAO KHÔNG NHÉT MÀU VÀO ATTRS ══════╗
 * ║ Xem khối chú thích của `NODE.brandPill` trong `schema.ts` — tóm tắt: hex  ║
 * ║ phải đi tới `variant.brand.primary/.secondary`, và thứ tự mảng chính là   ║
 * ║ vai trò. Nhét chúng vào attrs là dựng nguồn sự thật thứ hai cho cùng một  ║
 * ║ dữ liệu, đúng cái hố mà lượt này vừa phải lấp ở pill của dòng element.    ║
 * ║ Nên node chỉ là cái MỐC VỊ TRÍ; màu sống nằm trong `ComposerState` và đi  ║
 * ║ xuống đây bằng React context.                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO CONTEXT CHẠY ĐƯỢC XUYÊN QUA PROSEMIRROR ═════════════════════════
 * `ReactNodeViewRenderer` không render ra một cây React riêng: nó đăng ký một
 * PORTAL trên chính component `EditorContent`. Portal ấy là con của `EditorContent`
 * trong CÂY REACT (dù nằm chỗ khác trong cây DOM), nên mọi Provider bọc ngoài
 * `<BlockEditor>` vẫn tới được đây. Đó cũng là cách `usePresets()` chạy được
 * trong node view của `OptionPill`.
 */

interface BrandColorsBinding {
  colors: string[];
  onChange: (updater: (prev: string[]) => string[]) => void;
}

/* `null` = chưa có Provider nào. Phân biệt với "có Provider mà mảng rỗng" (một
   bộ kit chưa chọn màu nào) — hai chuyện khác nhau, và node view phải im lặng ở
   ca đầu thay vì vẽ một nút "+ màu" không nối vào đâu cả. */
const BrandColorsContext = React.createContext<BrandColorsBinding | null>(null);

export function BrandColorsProvider({
  colors,
  onChange,
  children,
}: BrandColorsBinding & { children: React.ReactNode }) {
  /* `useMemo` để identity của value không đổi sau mỗi lần gõ một ký tự vào
     editor — nếu không, mọi node view đọc context đều render lại theo. */
  const value = React.useMemo(() => ({ colors, onChange }), [colors, onChange]);
  return <BrandColorsContext.Provider value={value}>{children}</BrandColorsContext.Provider>;
}

function BrandPillView() {
  const bound = React.useContext(BrandColorsContext);

  return (
    <NodeViewWrapper as="span" className="inline-flex flex-wrap items-center gap-2" data-kg-node={NODE.brandPill}>
      {bound ? (
        <BrandColorPills colors={bound.colors} onChange={bound.onChange} />
      ) : (
        /* Không có Provider ⇒ nói ra bằng chữ thay vì vẽ một control chết. Ca này
           chỉ xảy ra khi ai đó mount `BlockEditor` ở một màn chưa bọc Provider —
           một lỗi lập trình, và nó phải NHÌN THẤY ĐƯỢC chứ không im lặng. */
        <span className="text-fg-muted">[màu thương hiệu]</span>
      )}
    </NodeViewWrapper>
  );
}

export const BrandPill = Node.create({
  name: NODE.brandPill,
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,

  parseHTML() {
    return [{ tag: `span[data-kg-node="${NODE.brandPill}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-kg-node": NODE.brandPill })];
  },

  addNodeView() {
    /* `stopEvent: () => true` — cùng lý do với `OptionPill`: không có nó thì cú
       bấm mở ô chỉnh màu bị ProseMirror diễn giải thành "đặt selection vào node",
       node view dựng lại, và popover đóng ngay khi vừa mở. */
    return ReactNodeViewRenderer(BrandPillView, { stopEvent: () => true });
  },
});
