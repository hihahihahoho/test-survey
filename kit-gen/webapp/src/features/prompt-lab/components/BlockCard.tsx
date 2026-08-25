import * as React from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlockMode } from "../lib/composer-model";

/**
 * BlockCard — CÁI VỎ chung của mọi block.
 *
 * Vỏ do React vẽ, không do TipTap: tiêu đề, badge chế độ, công tắc, nút xoá đều
 * là chrome quanh nội dung chứ không phải nội dung. Nhét chúng vào schema
 * ProseMirror (như bản trước từng làm với node "Hàng") là ép một cái thanh công
 * cụ trở thành văn bản — rồi phải đi chặn con trỏ khỏi nó bằng
 * `contentEditable={false}` ở từng chỗ.
 */
export function BlockCard({
  title,
  badge,
  onDelete,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  onDelete: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="group relative rounded-3 border border-line-subtle bg-surface p-5">
      <header className="mb-3 flex items-center gap-2">
        <h3 className="text-label uppercase tracking-wide text-fg-muted">{title}</h3>
        {badge}
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Xoá block ${title}`}
          /* Hiện mờ, rõ lên khi trỏ vào card hoặc khi chính nút được focus bằng
             bàn phím. `opacity-0` mà thiếu `focus-visible:opacity-100` là một
             nút bấm Tab tới được nhưng không nhìn thấy. */
          className="ml-auto inline-flex size-8 items-center justify-center rounded-1 text-fg-muted opacity-0 transition-opacity duration-fast hover:bg-raised hover:text-fg-strong focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring group-hover:opacity-100"
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </header>
      {children}
    </section>
  );
}

/** Badge nhìn lướt biết block nào đã bị chế. */
export function ModeBadge({ mode }: { mode: BlockMode }) {
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-caption",
        mode === "free" ? "border-accent text-accent-text" : "border-line-subtle text-fg-muted",
      )}
    >
      {mode === "free" ? "tự do ✎" : "template"}
    </span>
  );
}

/** Công tắc hai chế độ. Hai nút thật, không phải một switch — xem chú thích. */
export function ModeToggle({ mode, onPick }: { mode: BlockMode; onPick: (next: BlockMode) => void }) {
  /* Không dùng `<Switch>`: một công tắc bật/tắt buộc người đọc phải đoán "bật là
     cái gì". Hai nút có TÊN thì đọc phát biết ngay mình đang ở đâu và bấm sang
     đâu — và chỗ này là quyết định có hậu quả (quay về template có thể bỏ chữ
     đã viết), không phải chỗ để tiết kiệm hai chữ. */
  return (
    <div className="inline-flex rounded-full border border-line-subtle p-0.5">
      {(["template", "free"] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          onClick={() => onPick(value)}
          className={cn(
            "rounded-full px-2.5 py-0.5 text-caption transition-colors duration-fast",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
            mode === value ? "bg-raised text-fg-strong" : "text-fg-muted hover:text-fg",
          )}
        >
          {value === "template" ? "Theo template" : "Tự do"}
        </button>
      ))}
    </div>
  );
}
