import { Download, X } from "lucide-react";

import { cn } from "@/lib/utils";

import { KIND_LABELS, shotFileName, type Shot } from "../lib/shots";

/**
 * ShotStrip — dải ảnh đã chụp, DÙNG CHUNG cho cả hai tab.
 *
 * Mỗi thumbnail mang NHÃN LOẠI (`pose-3d` / `sketch`) vì hai loại ảnh này đi vào
 * hai chỗ khác nhau khi nối thật: ảnh 3D thành pose reference của block Mascot,
 * bản phác thành reference của đúng một element trong spritesheet. Không phân biệt
 * được ở đây thì lúc đính sẽ phải đoán.
 */
export interface ShotStripProps {
  shots: readonly Shot[];
  onRemove: (id: string) => void;
}

export function ShotStrip({ shots, onRemove }: ShotStripProps) {
  if (shots.length === 0) {
    return (
      <p className="rounded-3 border border-dashed border-line px-3 py-6 text-center text-caption text-fg-muted">
        Chưa có ảnh nào. Chụp pose ở tab 3D hoặc lưu một bản phác ở tab Sketch — cả hai đổ về đây.
      </p>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {shots.map((shot) => (
        <figure key={shot.id} className="relative w-40 shrink-0">
          <img
            src={shot.dataUrl}
            alt={shot.label}
            className={cn(
              "aspect-square w-full rounded-2 border border-line bg-[rgb(255_255_255)] object-contain",
              /* `object-contain` chứ không `cover`: ảnh 3D khổ ngang của viewport và
                 sketch khổ vuông không cùng tỉ lệ, `cover` sẽ CẮT mất tay chân. */
            )}
          />
          <span className="absolute left-1.5 top-1.5 rounded-full bg-[rgb(17_20_24_/_0.72)] px-2 py-0.5 font-mono text-caption text-[rgb(255_255_255)]">
            {KIND_LABELS[shot.kind]}
          </span>
          <button
            type="button"
            onClick={() => onRemove(shot.id)}
            aria-label={`Xoá ảnh ${shot.label}`}
            className="absolute right-1.5 top-1.5 rounded-full bg-[rgb(17_20_24_/_0.72)] p-1 text-[rgb(255_255_255)] hover:bg-danger-solid"
          >
            <X className="size-3" aria-hidden />
          </button>
          <figcaption className="mt-1 flex items-center justify-between gap-1">
            <span className="truncate text-caption text-fg-muted" title={shot.label}>{shot.label}</span>
            <a
              href={shot.dataUrl}
              download={shotFileName(shot)}
              className="shrink-0 rounded-1 p-1 text-fg-muted hover:bg-raised hover:text-fg-strong"
              aria-label={`Tải ${shotFileName(shot)}`}
            >
              <Download className="size-3.5" aria-hidden />
            </a>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
