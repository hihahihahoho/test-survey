import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { FLORA, FOCUS } from "@/components/layout/flora";

/**
 * Accordion một mục ("Script sẽ làm gì trên máy tôi?", "Vì sao lại thế?").
 *
 * Dùng `<details>/<summary>` gốc thay vì dựng bằng state React: mở/gập chạy được kể cả
 * khi JS lỗi, đúng semantics cho screen reader, và Ctrl+F của trình duyệt tìm được chữ
 * bên trong ở các trình duyệt hiện đại. Không có lý do gì để tự viết lại thứ này.
 *
 * VỎ FLORA: đây là **chỗ chứa chi tiết** để thân bước chỉ còn 1–2 câu dẫn (brief mục 2 —
 * "giảm chữ đặc, chi tiết đưa vào phần gập"). Nên nó phải NHẸ về thị giác: nền trong
 * suốt + hairline, bo 16px, không phải một khối surface cạnh tranh với card chính.
 */
export function Disclosure({
  summary,
  children,
  className,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <details className={cn("group border bg-transparent", FLORA.hair, FLORA.r16, className)}>
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2.5 p-4 text-label",
          FLORA.r16, FLORA.fg, FOCUS,
          "transition-colors duration-fast hover:text-fg-strong",
        )}
      >
        <ChevronRight
          className="size-4 shrink-0 text-fg-muted transition-transform group-open:rotate-90"
          aria-hidden
        />
        {summary}
      </summary>
      <div className={cn("flex flex-col gap-2.5 px-4 pb-4 pl-[42px] text-body", FLORA.fg)}>
        {children}
      </div>
    </details>
  );
}
