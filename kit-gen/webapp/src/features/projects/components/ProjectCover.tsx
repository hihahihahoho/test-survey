import * as React from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadThumb } from "../lib/agent-blob";

/**
 * Ảnh bìa 16:10 của thẻ project (§3-S1-2 vùng 1).
 *
 * Ba ca phải vẽ được, không ca nào là ô trống bí ẩn:
 *  · có ảnh          → thumbnail 256px (§6.5-5, đóng H4: v1 nạp PNG 3.1 MB vào lưới)
 *  · chưa có ảnh bìa → khung xám + CHỮ "Chưa có ảnh bìa"
 *  · agent tắt/ảnh lỗi → khung xám + CHỮ "Ảnh nằm trên máy bạn" (§2.5-3)
 *
 * Tải qua transport (xem lib/agent-blob.ts): `<img src>` thẳng tới agent bị 403
 * ở CẢ HAI đường vào — đã đo bằng curl thật, không suy đoán.
 *
 * `loading="lazy"` + `decoding="async"`: danh sách 50 project không được nạp 50
 * ảnh cùng lúc.
 */
export function ProjectCover({
  projectId,
  coverPath,
  projectName,
  offline,
  className,
}: {
  projectId: string;
  coverPath: string | null | undefined;
  projectName: string;
  /** agent không sẵn sàng ⇒ đừng cả thử tải, hiện luôn khung "ảnh nằm trên máy bạn" */
  offline: boolean;
  className?: string;
}) {
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!coverPath || offline) return;
    let alive = true;
    setFailed(false);
    loadThumb(projectId, coverPath).then(
      (u) => alive && setUrl(u),
      () => alive && setFailed(true),
    );
    return () => {
      alive = false;
    };
  }, [projectId, coverPath, offline]);

  const empty = !coverPath;
  const showPlaceholder = empty || failed || offline || url === null;

  return (
    <div
      className={cn(
        "relative mx-3 aspect-[16/10] w-[calc(100%-1.5rem)] overflow-hidden rounded-3 border border-line-subtle",
        showPlaceholder ? "bg-raised" : "kg-checkerboard",
        className,
      )}
    >
      {showPlaceholder ? (
        <div className="flex size-full flex-col items-center justify-center gap-1.5">
          <ImageIcon className="size-5 text-fg-muted" aria-hidden strokeWidth={1.5} />
          <span className="text-caption text-fg-muted-raised">
            {empty ? "Chưa có ảnh bìa" : "Ảnh nằm trên máy bạn"}
          </span>
        </div>
      ) : (
        <img
          src={url}
          alt={`Ảnh bìa của dự án ${projectName}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
    </div>
  );
}
