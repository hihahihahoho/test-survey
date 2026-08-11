import * as React from "react";
import { CheckerboardImage } from "@/components/common";
import { loadThumb } from "@/features/projects/lib/agent-blob";
import type { KitFile } from "@/lib/types";

/**
 * DẢI THUMBNAIL kit đã cắt (thẻ "Kit đã cắt" của S2, §3-S2 mục 4).
 *
 * ╔══ VÌ SAO KHÔNG GẮN THẲNG `api.files.thumbUrl()` VÀO `<img src>` ═══════════╗
 * ║ Điều hướng/subresource của TRÌNH DUYỆT không gửi được header tuỳ biến      ║
 * ║ `X-KitGen-Client: 1` (§6.1 bắt buộc cho MỌI request) ⇒ agent trả 403.      ║
 * ║ S1 đã ĐO THẬT bằng curl (xem đầu file `features/projects/lib/agent-blob.ts`),║
 * ║ nên tôi DÙNG LẠI `loadThumb()` của họ thay vì viết bản thứ hai — hai bản   ║
 * ║ cache object URL song song sẽ nhân đôi bộ nhớ và lệch nhau khi đổi ảnh bìa.║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 * TODO(N1 của NEEDS-s2-project.md): khi R0 bổ sung `api.files.blob()` thì đổi
 * import ở đây (và ở S1) sang tầng lib dùng chung, xoá phụ thuộc chéo feature.
 *
 * Ảnh LUÔN là bản `?w=256` — `loadThumb` tự thêm (§6.5-5, đóng H4: v1 nạp PNG
 * 3.1 MB vào lưới). `+N` cho phần còn lại, không nạp 96 ảnh cho một thẻ tóm tắt.
 */
export function KitStrip({
  projectId,
  files,
  offline,
  max = 8,
}: {
  projectId: string;
  files: readonly KitFile[];
  /** agent không sẵn sàng ⇒ đừng cả thử tải (§2.5-3). */
  offline: boolean;
  max?: number;
}) {
  const shown = files.slice(0, max);
  const rest = files.length - shown.length;

  return (
    <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8">
      {shown.map((f) => (
        <li key={f.path}>
          <KitThumb projectId={projectId} file={f} offline={offline} />
        </li>
      ))}
      {rest > 0 && (
        <li className="flex aspect-square items-center justify-center rounded-2 border border-dashed border-line text-label text-fg-muted-raised">
          +{rest}
        </li>
      )}
    </ul>
  );
}

function KitThumb({
  projectId,
  file,
  offline,
}: {
  projectId: string;
  file: KitFile;
  offline: boolean;
}) {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (offline) return;
    let alive = true;
    loadThumb(projectId, file.path).then(
      (u) => {
        if (alive) setUrl(u);
      },
      () => {
        /* CheckerboardImage tự vẽ khung "Ảnh nằm trên máy bạn" khi không có src */
      },
    );
    return () => {
      alive = false;
    };
  }, [projectId, file.path, offline]);

  return (
    <CheckerboardImage
      className="aspect-square w-full"
      // §5.8-A9: alt là NHÃN CÓ NGHĨA, không phải tên file trần.
      alt={`Element ${file.file}${file.sheet ? ` của sheet ${file.sheet}` : ""}`}
      {...(url ? { src: url } : {})}
      fallbackText={offline ? "Ảnh trên máy bạn" : "Chưa tải được"}
      title={file.file}
    />
  );
}
