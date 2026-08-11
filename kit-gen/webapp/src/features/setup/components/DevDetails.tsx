import { ChevronDown } from "lucide-react";
import { CopyableCode } from "@/components/common";
import { devDetails } from "@/lib/api";
import { cn } from "@/lib/utils";
import { FLORA, FOCUS } from "@/components/layout/flora";

/**
 * Panel gập "Chi tiết cho lập trình viên ▾" — **NƠI DUY NHẤT** trong màn S0 được phép
 * hiện `error.message` kỹ thuật (§3.9, ràng buộc dự án).
 *
 * Chuỗi luôn đi qua `devDetails()` của R0 chứ không phải `String(err)`: hàm đó gom
 * code/status/url/message/hint có kiểm soát. Thân UI ở ngoài chỉ được dùng
 * `presentError()` — trả về object CỐ Ý không có field `message`.
 *
 * Dùng `<details>` gốc của HTML: gập/mở được bằng bàn phím và bằng screen reader mà
 * không cần một dòng JS nào. Đổi vỏ KHÔNG đụng tới ranh giới này.
 */
export function DevDetails({ error, className }: { error: unknown; className?: string }) {
  const text = devDetails(error);
  if (!text) return null;
  return (
    <details className={cn("group w-full", className)}>
      <summary
        className={cn(
          "inline-flex cursor-pointer list-none items-center gap-1.5 rounded-full text-caption",
          FLORA.fgMuted, FOCUS,
          "transition-colors duration-fast hover:text-fg-strong",
        )}
      >
        <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
        Chi tiết cho lập trình viên
      </summary>
      <CopyableCode className="mt-2.5" value={text} label="Chi tiết kỹ thuật của lỗi" />
    </details>
  );
}
