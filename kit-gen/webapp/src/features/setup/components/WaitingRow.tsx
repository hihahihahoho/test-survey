import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { FLORA } from "@/components/layout/flora";

/**
 * Dòng "đang chờ" của §3-S0: `◐ Đang chờ công cụ local… (tự phát hiện, không cần bấm gì)`.
 *
 * Ba điều bắt buộc, GIỮ NGUYÊN khi đổi vỏ:
 *  · NÓI RÕ ĐANG CHỜ GÌ. "Đang tải…" trơn là thứ làm user không biết nên chờ hay nên bỏ đi.
 *  · `aria-live="polite"` để screen reader biết trạng thái đổi, nhưng KHÔNG `assertive` —
 *    nhịp probe 1.5→15s mà cắt lời liên tục thì không dùng được (§5.8-A8).
 *  · Spinner chỉ quay khi `motion-safe` (§5.8-A10 prefers-reduced-motion).
 *
 * VỎ FLORA: spinner mảnh màu accent xanh VNPAY, chữ trắng, gợi ý xám nhỏ.
 */
export function WaitingRow({
  label,
  hint,
  className,
}: {
  label: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)} role="status" aria-live="polite">
      <span className="inline-flex items-center gap-2.5 text-body text-fg-strong">
        <Loader2
          className={cn("size-4 shrink-0 motion-safe:animate-spin", FLORA.accentText)}
          strokeWidth={1.75}
          aria-hidden
        />
        {label}
      </span>
      {hint && <span className={cn("pl-[26px] text-caption", FLORA.fgMuted)}>{hint}</span>}
    </div>
  );
}
