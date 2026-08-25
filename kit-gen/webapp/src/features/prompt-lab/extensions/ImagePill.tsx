import * as React from "react";
import { ImagePlus, Loader2, TriangleAlert, X } from "lucide-react";
import {
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { NODE } from "../lib/schema";
import { PillButton } from "../components/pill-ui";
import { EMPTY_PILL_IMAGE, readPillImage, uploadPillImage } from "@/features/prompt-canvas/lib/pill-image";
import { usePromptProjectId } from "@/features/prompt-canvas/lib/project-context";
import { loadThumb } from "@/features/kit/lib/image-source";

/**
 * ImagePill — ô `[🖼 ⌄]` của ảnh mẫu: bấm vào là chọn ảnh, pill biến thành một
 * THUMBNAIL nhỏ nằm ngay trong câu.
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
 *  · KHÔNG CÓ DỰ ÁN THÌ KHÔNG CHỌN ĐƯỢC ẢNH (route lab `/lab/prompt-composer`).
 *    Pill nói ra điều đó bằng nhãn, thay vì bấm vào rồi không có gì xảy ra.
 */

/** Ảnh trong pill hiện qua transport (agent trả 403 cho `<img src>` — xem `image-source.ts`). */
function useRefThumb(projectId: string | null, path: string): string | null {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    setUrl(null);
    if (!projectId || !path) return;
    const handle = loadThumb(projectId, path);
    let alive = true;
    handle.promise.then((next) => { if (alive) setUrl(next); }).catch(() => { /* ô ảnh hỏng: giữ nhãn tên tệp */ });
    return () => {
      alive = false;
      handle.cancel();
    };
  }, [projectId, path]);
  return url;
}

function ImagePillView({ node, updateAttributes }: ReactNodeViewProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const projectId = usePromptProjectId();
  const image = readPillImage(node.attrs);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState("");
  const thumb = useRefThumb(projectId, image.path);

  const pick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !projectId) return;
    setBusy(true);
    setFailed("");
    try {
      const next = await uploadPillImage(projectId, file, { kind: "character", hintName: file.name });
      updateAttributes(next);
    } catch (error) {
      /* NÓI RA. Một pill im lặng quay về trạng thái rỗng là người dùng tưởng mình
         bấm hụt và bấm lại — cùng một lỗi, lần thứ hai. */
      setFailed(error instanceof Error ? error.message : "Không tải được ảnh lên dự án");
    } finally {
      setBusy(false);
    }
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
          <span className="relative inline-flex">
            {/* Thumbnail nhỏ hơn cỡ chữ một chút để pill không đội dòng lên.
                `size-7` ≈ 28px, vừa trong một dòng 26px có padding. Chưa tải xong
                bytes thì hiện TÊN ảnh — vẫn đọc được là đang trỏ vào tấm nào. */}
            {thumb ? (
              <img
                src={thumb}
                alt={image.refName}
                title={image.refName}
                className="size-7 shrink-0 rounded-1 border border-line-subtle object-cover"
              />
            ) : (
              <span className="max-w-40 truncate">{image.refName}</span>
            )}
            <span
              role="button"
              tabIndex={0}
              aria-label={`Bỏ ảnh ${image.refName}`}
              onClick={(event) => {
                /* Không cho nổi bọt lên PillButton — nếu không, xoá ảnh sẽ đồng
                   thời mở hộp chọn file. */
                event.stopPropagation();
                clear();
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.stopPropagation();
                clear();
              }}
              className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full border border-line bg-overlay text-fg-muted hover:text-fg-strong"
            >
              <X aria-hidden className="size-3" />
            </span>
          </span>
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
      /* HAI attr phẳng, không một object: ProseMirror so sánh attr bằng `===`
         cho giá trị nguyên thuỷ, nên hai chuỗi làm mọi phép undo/redo và mọi
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
