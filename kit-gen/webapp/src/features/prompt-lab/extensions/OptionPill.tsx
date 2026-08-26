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
function OptionPillView({ node, updateAttributes, extension }: ReactNodeViewProps) {
  const kind = (typeof node.attrs["kind"] === "string" ? node.attrs["kind"] : "style") as PillKind;
  const value = typeof node.attrs["value"] === "string" ? node.attrs["value"] : INHERIT;
  /* Hình dạng pill đến từ CẤU HÌNH EXTENSION, không từ attrs của node: "pill này
     to hay nhỏ" là thuộc tính của CHỖ ĐẶT (một câu cả thẻ hay một dòng danh sách),
     không phải của nội dung. Nhét nó vào attrs là ghi một quyết định trình bày
     xuống đĩa cùng tài liệu, rồi tài liệu ấy mở ở chỗ khác vẫn mang cỡ cũ. */
  const compact = extension.options["compact"] === true;

  return (
    /**
     * ⚠️ DATA-ATTR PHẢI CÓ MẶT NGAY TRÊN VỎ NODE VIEW, KHÔNG CHỈ Ở `renderHTML`.
     *
     * `renderHTML()` chỉ được dùng khi ProseMirror tự vẽ node; có node view thì
     * DOM thật là cái vỏ này, và nó KHÔNG mang `data-kind`/`data-value`. Mọi lượt
     * dựng lại tài liệu TỪ DOM vì thế đọc ra một pill không có kind, không có
     * value — quy tắc `parseHTML` (`span[data-kg-node="optionPill"]`) cũng không
     * khớp nổi cái vỏ trần.
     *
     * Đã bắt được tận tay: một lượt HMR giữa phiên dev làm editor dựng lại từ DOM,
     * và tài liệu ĐÃ LƯU của dự án biến thành `attrs: {kind: null, value: null}` —
     * cả ba pill của mọi dòng tụt về nhãn mặc định "theo phong cách chung". Đây là
     * MẤT DỮ LIỆU, chỉ tình cờ là mất trong lúc dev. Dán vào một editor khác, hay
     * bất kỳ đường DOM→doc nào của đời sau, đều đi qua đúng cái cửa ấy.
     *
     * Ba dòng attr này làm cái vỏ tự mô tả được, nên đường DOM→doc phục hồi đúng.
     */
    <NodeViewWrapper
      as="span"
      className="relative inline-block"
      data-kg-node={NODE.optionPill}
      data-kind={kind}
      data-value={value}
    >
      <OptionPillControl
        kind={kind}
        value={value}
        compact={compact}
        onChange={(next) => updateAttributes({ value: next })}
      />
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

  /**
   * `compact` — pill cỡ dòng danh sách thay vì cỡ câu.
   *
   * Cần thật, không phải cho đẹp: dòng element của block Bộ UI chạy ở bậc chữ
   * `text-body`, còn pill mặc định mang `px-3 py-1` của một câu 20px. Để nguyên
   * thì trong CÙNG MỘT thẻ, pill của dòng tự do cao hơn pill của dòng template
   * gần 8px — đúng kiểu "to nhỏ không đều" mà chủ sản phẩm chỉ ra.
   */
  addOptions() {
    return { compact: false };
  },

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
