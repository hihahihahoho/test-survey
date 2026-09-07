import * as React from "react";
import {
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { NODE } from "../lib/schema";
import { INHERIT, takesImage, type PillKind } from "../lib/pill-registry";
import { OptionPill as OptionPillControl } from "../components/pill-ui";
import type { SourceGroup } from "../components/SourcePicker";
import { EMPTY_PILL_IMAGE, readPillImage, uploadPillImage } from "@/features/prompt-canvas/lib/pill-image";
import { usePromptProjectId } from "@/features/prompt-canvas/lib/project-context";
import { useBrandBinding } from "./BrandProfilePill";

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
  const custom = typeof node.attrs["custom"] === "string" ? node.attrs["custom"] : "";
  const image = readPillImage(node.attrs);
  /* Hình dạng pill đến từ CẤU HÌNH EXTENSION, không từ attrs của node: "pill này
     to hay nhỏ" là thuộc tính của CHỖ ĐẶT (một câu cả thẻ hay một dòng danh sách),
     không phải của nội dung. Nhét nó vào attrs là ghi một quyết định trình bày
     xuống đĩa cùng tài liệu, rồi tài liệu ấy mở ở chỗ khác vẫn mang cỡ cũ. */
  const compact = extension.options["compact"] === true;
  const projectId = usePromptProjectId();
  const brand = useBrandBinding();
  const [attaching, setAttaching] = React.useState(false);

  /**
   * Ảnh chỉ được mời ở PILL CÓ ĐƯỜNG RA — xem `takesImage` và option `refs`.
   *
   * Hai luật, và luật thứ hai không thừa: pill `style` cũng đứng trong câu của
   * MỘT DÒNG ELEMENT (`uiCellDoc`), mà ảnh trong câu ấy không có ô nào trong
   * contract để đi tới — `uiKitSheets` chỉ đọc chữ. Bày nút đính ảnh ở đó là mời
   * người dùng tải một tấm ảnh lên rồi im lặng vứt nó đi.
   * Pill `mascot` thì KHÔNG cần option `refs`: ảnh của nó là `sheet.ref` của
   * chính tấm dáng, một cửa luôn có mặt ở thẻ Nhân vật.
   */
  const canAttach = takesImage(kind) && (kind === "mascot" || extension.options["refs"] === true);

  /**
   * Linh vật của thương hiệu đang chọn, mời ở ĐẦU danh sách nhân vật.
   *
   * GỢI Ý chứ không tự điền: một thương hiệu có thể có nhiều linh vật, và tự
   * chọn hộ là đặt một nhân vật người dùng chưa từng bấm vào tấm ảnh sắp tiêu
   * tiền. Chưa chọn thương hiệu ⇒ nhóm này vắng mặt, hộp chỉ còn thư viện.
   */
  const brandMascots = kind === "mascot" ? (brand?.mascots ?? []) : [];
  const extraGroups: SourceGroup[] =
    brandMascots.length > 0
      ? [
          {
            title: `Linh vật của ${brand?.name || "thương hiệu"}`,
            options: brandMascots.map((item) => ({ value: assetValue(item.assetId), vi: item.name })),
          },
        ]
      : [];

  const adopt = async (work: () => Promise<{ refName: string; path: string }>) => {
    setAttaching(true);
    try {
      updateAttributes(await work());
    } finally {
      setAttaching(false);
    }
  };

  const attach = (file: File) => {
    if (!projectId) return;
    void adopt(() =>
      uploadPillImage(projectId, file, {
        /* Phân loại của agent chỉ để nó xếp thư mục; vai trò THẬT của tấm ảnh
           trong prompt do chỗ đặt quyết định. */
        kind: kind === "mascot" ? "character" : "inspo",
        hintName: `${kind}-ref-${file.name}`,
      }),
    );
  };

  /**
   * Chọn một mục.
   *
   * Mục LINH VẬT THƯƠNG HIỆU không phải một giá trị preset — nó là một asset
   * trong kho dùng chung, và thứ pill giữ được là tấm ảnh đã chép sang dự án.
   * Nên nhánh này đi qua `copyAsset` (có nhớ, xem `brand-binding.ts`) rồi ghi
   * xuống ĐÚNG hai trường ảnh, còn `value` để rỗng: giữ một id kho trong `value`
   * là dựng nguồn sự thật thứ hai cho một thứ đã nằm trong `path`.
   */
  const choose = (next: string) => {
    const assetId = readAssetValue(next);
    if (assetId && brand) {
      updateAttributes({ value: INHERIT, custom: "" });
      void adopt(() => brand.copyAsset(assetId));
      return;
    }
    updateAttributes({ value: next });
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
     * chữ người dùng tự gõ thì không có bảng tra nào dựng lại nổi. Hai attr ảnh
     * cũng vậy — mất chúng là mất một tệp người dùng đã tải lên.
     */
    <NodeViewWrapper
      as="span"
      className="relative inline-block"
      data-kg-node={NODE.optionPill}
      data-kind={kind}
      data-value={value}
      data-custom={custom}
      data-ref-path={image.path}
      data-ref-name={image.refName}
    >
      <OptionPillControl
        kind={kind}
        value={value}
        custom={custom}
        compact={compact}
        attaching={attaching}
        image={image}
        projectId={projectId}
        extraGroups={extraGroups}
        {...(extraGroups.length > 0 ? { listTitle: "Thư viện nhân vật" } : {})}
        onChange={choose}
        onCustom={(next) => updateAttributes({ custom: next })}
        {...(canAttach && projectId ? { onAttach: attach } : {})}
        {...(image.path ? { onDropImage: () => updateAttributes(EMPTY_PILL_IMAGE) } : {})}
      />
    </NodeViewWrapper>
  );
}

/**
 * Một asset của kho dùng chung, đội lốt một `value` của hộp chọn.
 *
 * Tiền tố `asset:` chứ không phải một trường thứ hai trong `SourceOption`: hộp
 * chọn là thứ dùng chung cho bốn chỗ, và thêm một trường chỉ MỘT chỗ hiểu là bắt
 * ba chỗ kia mang theo một khái niệm chúng không có. Tiền tố thì chỉ nơi dựng
 * danh sách và nơi nhận lựa chọn phải biết — hai chỗ nằm cạnh nhau ngay đây.
 */
const ASSET_PREFIX = "asset:";

function assetValue(assetId: string): string {
  return `${ASSET_PREFIX}${assetId}`;
}

function readAssetValue(value: string): string {
  return value.startsWith(ASSET_PREFIX) ? value.slice(ASSET_PREFIX.length) : "";
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
      /**
       * ẢNH CỦA CHÍNH PILL NÀY — `refs/<tên>` + tên tệp, đúng hình dạng
       * `PillImage`.
       *
       * ╔══ VÌ SAO ẢNH VÀO ĐÂY, KHÔNG CÒN LÀ MỘT NODE `imagePill` ĐỨNG CẠNH ═════╗
       * ║ Bản trước: đính ảnh cho pill theme thì chèn một `imagePill` NGAY SAU nó ║
       * ║ trong câu. Câu đọc được ("theme [Tết][🖼]") nhưng nó là HAI vật cho MỘT ║
       * ║ câu trả lời: xoá nhầm một cái là câu còn lại nói dở dang, và người dùng ║
       * ║ phải tự hiểu rằng chúng thuộc về nhau. Nay một pill = một nguồn, và     ║
       * ║ "nguồn" là preset · chữ · ảnh — ba thứ nằm trong cùng một node.         ║
       * ║ Tên attr trùng `imagePill` (`path`/`refName`) là CỐ Ý: `readPillImage`  ║
       * ║ và `EMPTY_PILL_IMAGE` đọc được cả hai node mà không cần một nhánh riêng.║
       * ╚════════════════════════════════════════════════════════════════════════╝
       */
      path: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-ref-path") ?? "",
        renderHTML: (attributes) => ({ "data-ref-path": String(attributes["path"] ?? "") }),
      },
      refName: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-ref-name") ?? "",
        renderHTML: (attributes) => ({ "data-ref-name": String(attributes["refName"] ?? "") }),
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
