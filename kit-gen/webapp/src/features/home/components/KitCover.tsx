import * as React from "react";
import { ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadThumb } from "@/features/projects/lib/agent-blob";

/**
 * ẢNH BÌA 16:10 của thẻ bộ kit (UX-V3 §1.1: «ảnh bo 16px, nền ô cờ»).
 *
 * Ba ca phải vẽ được, không ca nào là ô trống bí ẩn:
 *   · có ảnh            → thumbnail 256px (`#41 ?w=256`, BA-V3 §1.4)
 *   · chưa có ảnh bìa   → khung + CHỮ «Chưa vẽ ảnh nào»
 *   · agent tắt/ảnh hỏng→ khung + CHỮ «Ảnh nằm trên máy bạn»
 *
 * Vì sao không dùng `<img src>` thẳng tới agent: bị 403 ở CẢ HAI đường vào (FE-1 đo bằng
 * curl thật). `loadThumb` đi qua transport, có cache object URL — dùng lại nguyên vẹn,
 * KHÔNG viết bộ tải ảnh thứ hai.
 *
 * `kg-checkerboard` chỉ bật khi ẢNH THẬT đã có: ô cờ dưới một khung rỗng trông như lỗi render.
 */
export function KitCover({
  projectId,
  coverPath,
  kitName,
  offline,
  className,
}: {
  projectId: string;
  coverPath: string | null | undefined;
  kitName: string;
  /** agent không sẵn sàng ⇒ đừng cả thử tải, hiện luôn khung «ảnh nằm trên máy bạn» */
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
      data-kit-cover
      className={cn(
        "relative aspect-[16/10] w-full overflow-hidden rounded-3 border border-line-subtle",
        showPlaceholder ? "bg-raised" : "kg-checkerboard",
        className,
      )}
    >
      {showPlaceholder ? (
        <div className="flex size-full flex-col items-center justify-center gap-1.5">
          <ImageIcon className="size-5 text-fg-muted" aria-hidden strokeWidth={1.5} />
          <span className="text-caption text-fg-muted">
            {empty ? "Chưa vẽ ảnh nào" : "Ảnh nằm trên máy bạn"}
          </span>
        </div>
      ) : (
        <img
          src={url}
          alt={`Ảnh bìa của dự án ${kitName}`}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      )}
    </div>
  );
}
