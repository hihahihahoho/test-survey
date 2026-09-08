import * as React from "react";
import { X } from "lucide-react";
import { loadThumb } from "@/features/kit/lib/image-source";
import type { PillImage } from "@/features/prompt-canvas/lib/pill-image";

/**
 * RefImagePill — MỘT TẤM ẢNH ĐÃ NẰM TRÊN ĐĨA, hiện thành thumbnail trong câu.
 *
 * ┌── VÌ SAO TÁCH KHỎI `extensions/ImagePill.tsx` ───────────────────────────┐
 * │ Cùng lý do đã ghi ở đầu `pill-ui.tsx`: một tấm ảnh trong câu nay xuất     │
 * │ hiện ở HAI chỗ có bản chất khác nhau — node ProseMirror của câu tự do, và │
 * │ React thuần của câu Ngữ cảnh chung ở chế độ khuôn (chỗ đó không có tài    │
 * │ liệu TipTap nào để chứa node). Chép phần nhìn sang chỗ thứ hai là hai     │
 * │ hình dạng cho cùng một vật, và hai chỗ để quên khi sửa.                   │
 * │ Phần KHÁC NHAU vẫn ở lại mỗi bên: node view lo hộp chọn tệp + tải lên +   │
 * │ menu; khối này chỉ lo VẼ tấm ảnh và cái nút bỏ ảnh.                       │
 * └──────────────────────────────────────────────────────────────────────────┘
 */

/**
 * Ảnh trong pill hiện qua transport, KHÔNG qua `<img src="/api/…">`.
 *
 * Agent trả 403 cho một thẻ `<img>` trỏ thẳng vào endpoint tệp (xem
 * `kit/lib/image-source.ts`), nên byte phải đi qua tầng transport rồi mới thành
 * object URL. `handle.cancel()` để rời màn giữa chừng không để lại một lượt tải.
 */
export function useRefThumb(projectId: string | null, path: string): string | null {
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

/**
 * Thumbnail + nút bỏ ảnh. Không tự bấm được — vỏ ngoài quyết định bấm ra gì.
 *
 * Thumbnail nhỏ hơn cỡ chữ một chút để pill không đội dòng lên (`size-7` ≈ 28px,
 * vừa trong một dòng 26px có đệm). Chưa tải xong bytes thì hiện TÊN ảnh — vẫn
 * đọc được là đang trỏ vào tấm nào, thay vì một ô xám không nói gì.
 */
export function RefImageBody({
  projectId,
  image,
  onRemove,
}: {
  projectId: string | null;
  image: PillImage;
  onRemove: () => void;
}) {
  const thumb = useRefThumb(projectId, image.path);

  return (
    <span className="relative inline-flex">
      {thumb ? (
        <img
          src={thumb}
          alt={image.refName}
          title={image.refName}
          className="size-7 shrink-0 rounded-1 border border-line-subtle object-cover"
        />
      ) : (
        /* Ảnh chưa về (hoặc hỏng) ⇒ ô giữ chỗ cùng cỡ, KHÔNG phải tên tệp: chữ
           đứng cạnh đã là nhãn của pill, in tên tệp nữa là hai nhãn cho một ảnh. */
        <span
          aria-hidden
          title={image.refName}
          className="size-7 shrink-0 rounded-1 border border-line-subtle bg-raised"
        />
      )}
      <span
        role="button"
        tabIndex={0}
        aria-label={`Bỏ ảnh ${image.refName}`}
        onClick={(event) => {
          /* Không cho nổi bọt lên nút bọc ngoài — nếu không, xoá ảnh sẽ đồng thời
             kích hoạt hành động của chính cái pill (mở hộp chọn tệp, mở menu). */
          event.stopPropagation();
          onRemove();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          event.stopPropagation();
          onRemove();
        }}
        className="absolute -right-1 -top-1 inline-flex size-4 items-center justify-center rounded-full border border-line bg-overlay text-fg-muted hover:text-fg-strong"
      >
        <X aria-hidden className="size-3" />
      </span>
    </span>
  );
}
