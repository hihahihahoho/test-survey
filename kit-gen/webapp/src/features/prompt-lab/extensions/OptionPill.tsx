import {
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { NODE } from "../lib/schema";
import { INHERIT, type PillKind } from "../lib/pill-registry";
import { OptionPill as OptionPillControl } from "../components/pill-ui";

/**
 * OptionPill — MỘT node cho MỌI pill chọn-một trong câu mad-lib.
 *
 * ══ VÌ SAO LÀ `atom` ═══════════════════════════════════════════════════════
 * `atom: true` nói với ProseMirror: node này KHÔNG có ruột soạn thảo được, hãy
 * coi nó như một ký tự. Đó chính là hành vi ta muốn và là lý do dùng TipTap thay
 * vì một hàng `<select>` nhét giữa hai đoạn text: con trỏ đi qua pill bằng một
 * nhịp mũi tên, Backspace xoá trọn cả pill, bôi đen cả câu rồi copy thì pill đi
 * theo. Không atom thì người dùng gõ được chữ VÀO GIỮA nhãn "Chibi" — mà cái
 * nhãn đó là dữ liệu, không phải chữ.
 *
 * ══ VÌ SAO MỘT NODE CHO CHÍN LOẠI PILL ═════════════════════════════════════
 * Chín loại khác nhau đúng ở DANH SÁCH lựa chọn (`kind` tra trong
 * `pill-registry.ts`). Chín node là chín bản sao của cùng một node view — và
 * chín chỗ để quên khi sửa. Xem chú thích đầu `schema.ts`.
 */
function OptionPillView({ node, updateAttributes }: ReactNodeViewProps) {
  const kind = (typeof node.attrs["kind"] === "string" ? node.attrs["kind"] : "style") as PillKind;
  const value = typeof node.attrs["value"] === "string" ? node.attrs["value"] : INHERIT;

  return (
    <NodeViewWrapper as="span" className="relative inline-block">
      <OptionPillControl kind={kind} value={value} onChange={(next) => updateAttributes({ value: next })} />
    </NodeViewWrapper>
  );
}

export const OptionPill = Node.create({
  name: NODE.optionPill,
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      kind: {
        default: "style",
        parseHTML: (element) => element.getAttribute("data-kind") ?? "style",
        renderHTML: (attributes) => ({ "data-kind": String(attributes["kind"] ?? "style") }),
      },
      value: {
        default: INHERIT,
        parseHTML: (element) => element.getAttribute("data-value") ?? INHERIT,
        renderHTML: (attributes) => ({ "data-value": String(attributes["value"] ?? "") }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[data-kg-node="${NODE.optionPill}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-kg-node": NODE.optionPill })];
  },

  addNodeView() {
    /* `stopEvent: () => true` — ProseMirror ĐỪNG đụng vào sự kiện trong pill.
       Không có dòng này thì cú bấm mở menu bị PM diễn giải thành "đặt selection
       vào node", nó dựng lại node view và menu đóng ngay khi vừa mở.
       Đây cũng chính là thứ giữ cho pill BẤM ĐƯỢC ở chế độ "theo template"
       (`editable: false`) — xem chú thích trong `BlockEditor.tsx`. */
    return ReactNodeViewRenderer(OptionPillView, { stopEvent: () => true });
  },
});
