import * as React from "react";
import { ImagePlus, X } from "lucide-react";
import {
  Node,
  NodeViewWrapper,
  ReactNodeViewRenderer,
  mergeAttributes,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { NODE, type ImageRef } from "../lib/schema";
import { PillButton } from "../components/pill-ui";

/**
 * ImagePill — ô `[🖼 ⌄]` của ảnh mẫu: bấm vào là chọn ảnh, pill biến thành một
 * DÃY THUMBNAIL nhỏ nằm ngay trong câu, đúng như dãy emoji `[😂🎧🌴 ⌄]` ở ảnh
 * chủ sản phẩm gửi.
 *
 * ══ ẢNH SỐNG Ở ĐÂU — ĐỌC TRƯỚC KHI NỐI VÀO GÌ ══════════════════════════════
 * `URL.createObjectURL(file)` ⇒ một `blob:` chỉ có nghĩa trong TAB NÀY. Không
 * có byte nào rời khỏi máy, không có gì được ghi xuống đĩa. Với một lab thì đó
 * là lựa chọn đúng (không có backend để nói chuyện, và không được âm thầm gửi
 * ảnh của người dùng đi đâu cả). Hai hệ quả phải nói thẳng chứ không giấu:
 *   · F5 là mất sạch ảnh — JSON tài liệu còn `blob:` chết, thumbnail thành ô vỡ;
 *   · prompt copy ra KHÔNG mang ảnh theo, chỉ mang cái móc `[ảnh tham chiếu N]`;
 *     người dùng vẫn phải tự kéo N tấm ảnh vào khung chat.
 * Bản làm thật phải thay `url` bằng một id tài sản trong workspace KitGen.
 */
function readRefs(value: unknown): ImageRef[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ImageRef => {
    return typeof item === "object" && item !== null && typeof (item as ImageRef).url === "string";
  });
}

function ImagePillView({ node, updateAttributes }: ReactNodeViewProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const refs = readRefs(node.attrs["refs"]);

  /* Thu hồi object URL khi node biến mất khỏi tài liệu (undo, xoá cả câu).
     Không có nó thì mỗi lần chọn lại ảnh là một tab giữ thêm vài MB cho tới khi
     đóng tab — nhìn thấy được trong DevTools › Memory, không phải lo hão. */
  const liveUrls = React.useRef<string[]>([]);
  liveUrls.current = refs.map((ref) => ref.url);
  React.useEffect(() => {
    const urls = liveUrls;
    return () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
    };
  }, []);

  const pick = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: ImageRef[] = Array.from(files).map((file, index) => ({
      id: `${Date.now()}-${index}`,
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    /* Ảnh mới NỐI vào sau ảnh cũ, không thay thế: pill này là "bộ ảnh tham
       chiếu", chọn thêm một tấm không có nghĩa là bỏ mấy tấm trước. */
    updateAttributes({ refs: [...refs, ...next] });
  };

  const removeAt = (id: string) => {
    const gone = refs.find((ref) => ref.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    updateAttributes({ refs: refs.filter((ref) => ref.id !== id) });
  };

  return (
    <NodeViewWrapper as="span" className="relative inline-block">
      <PillButton
        muted={refs.length === 0}
        onClick={() => inputRef.current?.click()}
        aria-label={refs.length === 0 ? "Chọn ảnh tham chiếu" : `Đổi ảnh tham chiếu (${refs.length} ảnh)`}
      >
        {refs.length === 0 ? (
          <>
            <ImagePlus aria-hidden className="size-5 shrink-0" />
            <span>ảnh</span>
          </>
        ) : (
          <span className="inline-flex items-center gap-1">
            {refs.map((ref) => (
              /* Thumbnail nhỏ hơn cỡ chữ một chút để pill không đội dòng lên.
                 `size-7` ≈ 28px, vừa trong một dòng 26px có padding. */
              <span key={ref.id} className="relative inline-flex">
                <img
                  src={ref.url}
                  alt={ref.name}
                  title={ref.name}
                  className="size-7 shrink-0 rounded-1 border border-line-subtle object-cover"
                />
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Bỏ ảnh ${ref.name}`}
                  onClick={(event) => {
                    /* Không cho nổi bọt lên PillButton — nếu không, xoá một ảnh
                       sẽ đồng thời mở hộp chọn file. */
                    event.stopPropagation();
                    removeAt(ref.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    event.stopPropagation();
                    removeAt(ref.id);
                  }}
                  className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full border border-line bg-overlay text-fg-muted hover:text-fg-strong"
                >
                  <X aria-hidden className="size-3" />
                </span>
              </span>
            ))}
          </span>
        )}
      </PillButton>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          pick(event.target.files);
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
      refs: {
        default: [] as ImageRef[],
        parseHTML: (element) => {
          /* HTML round-trip chỉ để không nổ khi ai đó dán vào; `blob:` dán sang
             tài liệu khác vốn đã vô nghĩa. */
          try {
            return readRefs(JSON.parse(element.getAttribute("data-refs") ?? "[]"));
          } catch {
            return [];
          }
        },
        renderHTML: (attributes) => ({ "data-refs": JSON.stringify(readRefs(attributes["refs"])) }),
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
