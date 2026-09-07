import * as React from "react";
import {
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { NODE } from "../lib/schema";
import { INHERIT, refRoleOf, type PillKind } from "../lib/pill-registry";
import { OptionPill as OptionPillControl } from "../components/pill-ui";
import { uploadPillImage } from "@/features/prompt-canvas/lib/pill-image";
import { usePromptProjectId } from "@/features/prompt-canvas/lib/project-context";

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
function OptionPillView({ node, updateAttributes, editor, getPos, extension }: ReactNodeViewProps) {
  const kind = (typeof node.attrs["kind"] === "string" ? node.attrs["kind"] : "style") as PillKind;
  const value = typeof node.attrs["value"] === "string" ? node.attrs["value"] : INHERIT;
  const custom = typeof node.attrs["custom"] === "string" ? node.attrs["custom"] : "";
  /* Hình dạng pill đến từ CẤU HÌNH EXTENSION, không từ attrs của node: "pill này
     to hay nhỏ" là thuộc tính của CHỖ ĐẶT (một câu cả thẻ hay một dòng danh sách),
     không phải của nội dung. Nhét nó vào attrs là ghi một quyết định trình bày
     xuống đĩa cùng tài liệu, rồi tài liệu ấy mở ở chỗ khác vẫn mang cỡ cũ. */
  const compact = extension.options["compact"] === true;
  const projectId = usePromptProjectId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [attaching, setAttaching] = React.useState(false);

  /**
   * Ảnh chỉ được mời ở CÂU CÓ ĐƯỜNG RA — xem `refRoleOf` và option `refs`.
   *
   * Hai điều kiện, và điều kiện thứ hai không thừa: pill `style` cũng đứng trong
   * câu của MỘT DÒNG ELEMENT (`uiCellDoc`), mà ảnh trong câu ấy không có ô nào
   * trong contract để đi tới — `uiKitSheets` chỉ đọc chữ. Bày nút đính ảnh ở đó
   * là mời người dùng tải một tấm ảnh lên rồi im lặng vứt nó đi.
   */
  const role = extension.options["refs"] === true ? refRoleOf(kind) : "";

  const attach = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !projectId || !role) return;
    setAttaching(true);
    try {
      const image = await uploadPillImage(projectId, file, { kind: "inspo", hintName: `${role}-ref-${file.name}` });
      const at = getPos();
      if (at === undefined) return;
      /* Chèn NGAY SAU pill này, không nối vào cuối câu: câu phải đọc được thành
         "theme [Tết][🖼]" — tấm ảnh đứng cạnh thứ nó minh hoạ. Nối vào cuối là
         một tấm ảnh mồ côi mà không ai biết nó nói về pill nào. */
      editor
        .chain()
        .insertContentAt(at + node.nodeSize, { type: NODE.imagePill, attrs: { ...image, role } })
        .run();
    } finally {
      setAttaching(false);
    }
  };

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
     * `data-custom` đi cùng bộ, và nó còn ĐẮT HƠN hai cái kia: `kind`/`value` cứu
     * hộ lại được bằng `repairPills` (vị trí trong câu nói ra chúng là gì), còn
     * chữ người dùng tự gõ thì không có bảng tra nào dựng lại nổi.
     */
    <NodeViewWrapper
      as="span"
      className="relative inline-block"
      data-kg-node={NODE.optionPill}
      data-kind={kind}
      data-value={value}
      data-custom={custom}
    >
      <OptionPillControl
        kind={kind}
        value={value}
        custom={custom}
        compact={compact}
        attaching={attaching}
        onChange={(next) => updateAttributes({ value: next })}
        onCustom={(next) => updateAttributes({ custom: next })}
        {...(role && projectId ? { onAttachRef: () => inputRef.current?.click() } : {})}
      />

      {role && projectId && (
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            void attach(event.target.files);
            /* Xoá value để chọn LẠI ĐÚNG tấm vừa chọn vẫn bắn `change`. */
            event.target.value = "";
          }}
        />
      )}
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
   *
   * `refs` — câu này CÓ ĐƯỜNG đưa ảnh tới contract hay không. Mặc định KHÔNG:
   * chỉ câu Ngữ cảnh chung có (`variant.inspo`). Xem `role` ở node view.
   */
  addOptions() {
    return { compact: false, refs: false };
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
      /**
       * CHỮ NGƯỜI DÙNG TỰ GÕ cho pill này — rỗng = dùng lựa chọn trong `value`.
       *
       * Có chữ ⇒ nó đi NGUYÊN VĂN vào prompt thay cụm EN của preset (xem
       * `pillText` ở `serialize.ts`). Không bọc dấu nháy, không thêm nhãn nào:
       * người dùng viết cho máy vẽ đọc, và mọi thứ ta gói quanh câu của họ đều là
       * chữ họ không viết mà vẫn bị gửi đi.
       *
       * `value` KHÔNG bị xoá khi có `custom`: bỏ chữ đi là quay về đúng lựa chọn
       * cũ, không phải rơi về một pill trống.
       */
      custom: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-custom") ?? "",
        renderHTML: (attributes) => ({ "data-custom": String(attributes["custom"] ?? "") }),
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
