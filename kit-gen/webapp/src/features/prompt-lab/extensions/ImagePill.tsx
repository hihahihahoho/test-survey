import * as React from "react";
import { ImagePlus, Loader2, TriangleAlert } from "lucide-react";
import {
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { NODE } from "../lib/schema";
import { PillButton } from "../components/pill-ui";
import { RefImageBody } from "../components/RefImagePill";
import {
  EMPTY_PILL_IMAGE,
  readPillImage,
  readPillImageRole,
  uploadPillImage,
} from "@/features/prompt-canvas/lib/pill-image";
import { usePromptProjectId } from "@/features/prompt-canvas/lib/project-context";

/**
 * ImagePill — ô `[🖼 ⌄]` của ảnh mẫu: bấm vào là mở menu chọn ảnh, pill biến
 * thành một THUMBNAIL nhỏ nằm ngay trong câu.
 *
 * ══ ẢNH SỐNG Ở ĐÂU — ĐÃ ĐỔI, ĐỌC TRƯỚC KHI SỬA ═════════════════════════════
 * KHÔNG còn `URL.createObjectURL(file)`. Ảnh được TẢI LÊN dự án ngay lúc chọn
 * (`POST /api/projects/:id/refs`), và pill chỉ giữ `{ refName, path }` — thứ mà
 * `sheet.ref` của contract nhận và `gen.sh` đính kèm được. Lý do đầy đủ nằm ở
 * `prompt-canvas/lib/pill-image.ts`; tóm tắt: `blob:` không sống qua F5 và không
 * có nghĩa với bất kỳ ai ngoài tab đang mở.
 *
 * Hai hệ quả kèm theo, nói thẳng:
 *  · CHỌN ẢNH = MỘT VÒNG MẠNG. Nên pill có trạng thái ĐANG TẢI thật, và trạng
 *    thái đó nằm trong React state chứ KHÔNG trong attr của node: attr được ghi
 *    xuống đĩa, mà một tài liệu lưu vĩnh viễn chữ "đang tải" là một lời nói dối
 *    không bao giờ tự hết.
 *  · KHÔNG CÓ DỰ ÁN THÌ KHÔNG CHỌN ĐƯỢC ẢNH (`PromptProjectContext` là `null`).
 *    Pill nói ra điều đó bằng nhãn, thay vì bấm vào rồi không có gì xảy ra.
 *
 * ╔══ PILL NÀY NAY CHỈ CÒN MỘT VIỆC: CHỌN MỘT TỆP ═══════════════════════════╗
 * ║ Nó từng bày một menu để mời linh vật của thương hiệu (pill ảnh NHÂN VẬT),  ║
 * ║ và mời ảnh chủ đề/phong cách cho câu Ngữ cảnh chung. Cả hai vai ấy đã dọn  ║
 * ║ sang `optionPill`: ảnh nay nằm TRONG chính pill nó minh hoạ, và hộp chọn   ║
 * ║ nguồn dùng chung (`SourcePicker`) là chỗ duy nhất mời preset · ảnh · chữ.  ║
 * ║ Còn lại đúng một chỗ dùng nó: ảnh tham chiếu của thẻ Cảnh nền — nơi câu    ║
 * ║ hỏi thật sự chỉ là "tấm nào", không có nguồn nào khác để chọn. Bày một     ║
 * ║ menu một-mục ở đó là thêm một cú bấm cho đúng cái việc nút này vẫn làm.    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

function ImagePillView({ node, updateAttributes }: ReactNodeViewProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const projectId = usePromptProjectId();
  const image = readPillImage(node.attrs);
  const role = readPillImageRole(node.attrs);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState("");

  const adopt = async (work: () => Promise<{ refName: string; path: string }>) => {
    setBusy(true);
    setFailed("");
    try {
      updateAttributes(await work());
    } catch (error) {
      /* NÓI RA. Một pill im lặng quay về trạng thái rỗng là người dùng tưởng mình
         bấm hụt và bấm lại — cùng một lỗi, lần thứ hai. */
      setFailed(error instanceof Error ? error.message : "Không tải được ảnh lên dự án");
    } finally {
      setBusy(false);
    }
  };

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !projectId) return;
    await adopt(() =>
      uploadPillImage(projectId, file, {
        kind: role === "theme" || role === "style" ? "inspo" : "character",
        hintName: file.name,
      }),
    );
  };

  const clear = () => {
    setFailed("");
    /* CHỈ bỏ ảnh khỏi câu, KHÔNG xoá tệp trong `refs/`: tấm ảnh ấy có thể đang
       được block khác dùng, và agent đã có đường xoá riêng có kiểm V-08. */
    updateAttributes(EMPTY_PILL_IMAGE);
  };

  const label = !projectId
    ? "Chưa gắn dự án — chưa chọn được ảnh"
    : busy
      ? "Đang tải ảnh lên…"
      : failed
        ? `Lỗi: ${failed}`
        : image.path
          ? `Đổi ảnh tham chiếu (${image.refName})`
          : "Chọn ảnh tham chiếu";

  return (
    <NodeViewWrapper as="span" className="relative inline-block">
      <PillButton
        muted={!image.path}
        onClick={() => {
          if (!projectId || busy) return;
          inputRef.current?.click();
        }}
        aria-label={label}
        title={label}
      >
        {busy ? (
          <>
            <Loader2 aria-hidden className="size-5 shrink-0 animate-spin" />
            <span>đang tải…</span>
          </>
        ) : failed ? (
          <>
            <TriangleAlert aria-hidden className="size-5 shrink-0" />
            <span>lỗi ảnh</span>
          </>
        ) : image.path ? (
          <RefImageBody projectId={projectId} image={image} onRemove={clear} />
        ) : (
          <>
            <ImagePlus aria-hidden className="size-5 shrink-0" />
            <span>ảnh</span>
          </>
        )}
      </PillButton>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(event) => {
          void pick(event.target.files);
          /* Xoá value để chọn LẠI ĐÚNG tấm vừa chọn vẫn bắn `change`. */
          event.target.value = "";
        }}
      />
    </NodeViewWrapper>
  );
}

export const ImagePill = Node.create({
  name: NODE.imagePill,
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      /* BA attr phẳng, không một object: ProseMirror so sánh attr bằng `===`
         cho giá trị nguyên thuỷ, nên ba chuỗi làm mọi phép undo/redo và mọi
         phép so tài liệu ("có gì đổi không") chạy đúng mà không cần luật riêng. */
      refName: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-ref-name") ?? "",
        renderHTML: (attributes) => ({ "data-ref-name": String(attributes["refName"] ?? "") }),
      },
      path: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-ref-path") ?? "",
        renderHTML: (attributes) => ({ "data-ref-path": String(attributes["path"] ?? "") }),
      },
      /**
       * VAI TRÒ — `""` (ảnh của thẻ) · `"theme"` · `"style"` · `"character"`.
       *
       * Mặc định RỖNG, đúng thứ mọi tài liệu đời trước đang là: ảnh của một thẻ,
       * đi vào `sheet.ref` của chính tấm ấy. Xem `PillImageRole` để biết vì sao
       * vai trò phải được ghi ra thay vì suy từ chỗ đứng trong câu.
       */
      role: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-ref-role") ?? "",
        renderHTML: (attributes) => ({ "data-ref-role": String(attributes["role"] ?? "") }),
      },
    };
  },

  parseHTML() {
    return [{ tag: `span[data-kg-node="${NODE.imagePill}"]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-kg-node": NODE.imagePill })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImagePillView, { stopEvent: () => true });
  },
});
