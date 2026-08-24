import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useCodexAccount, useUsage } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { usageView } from "../lib/usage-meter";

/**
 * THANH "QUOTA CODEX CÒN LẠI" — bản web của dòng mà Codex CLI vẽ ở chân TUI
 * ("Weekly usage limit · 98% remaining · Resets Aug 20, 2026 1:30 PM").
 *
 * NGUỒN SỐ: `GET /api/usage`. Agent đọc lại `rate_limits` mà lượt chạy Codex gần nhất
 * đã nhận về (ghi sẵn trong file rollout của `$CODEX_HOME`) — KHÔNG spawn codex, KHÔNG
 * gọi mạng, KHÔNG tốn quota. Hệ quả phải nói ra chứ không giấu: **số này cũ bằng lượt
 * chạy cuối**, nên nhãn chi tiết luôn kèm "số đọc lúc …".
 *
 * ẨN HẲN KHI CHƯA BIẾT. Agent tắt, chưa chạy lượt nào, hoặc dùng model_provider riêng
 * không trả rate limit ⇒ `usageView()` trả `null` ⇒ component trả `null`. Đây là số
 * liệu THAM KHẢO: không được chiếm chỗ, không được vẽ 0%, không được báo lỗi đỏ.
 * (Cùng luật với `UpdateSidebarButton` ngay bên cạnh.)
 *
 * A3 — màu KHÔNG BAO GIỜ là thông tin duy nhất: phần trăm luôn hiện thành CHỮ, `tone`
 * chỉ thêm sắc thái. Thanh vẽ là `aria-hidden`, con số mới là thứ screen reader đọc.
 *
 * Hai dáng:
 *  · `sidebar` — thanh mảnh + "còn N%", dùng ở chân sidebar Home, ngay trên "Cài đặt".
 *  · `compact` — chip một dòng cho topbar/header màn dự án (chưa mount, xem README).
 */
export function UsageMeter({ variant = "sidebar", className }: {
  variant?: "sidebar" | "compact";
  className?: string;
}) {
  const usage = useUsage();
  const account = useCodexAccount();
  const view = usageView(usage.data);

  /* "LÚC HIỆN LÚC KHÔNG" LÀ MỘT BUG UX CÓ THẬT (báo cáo 24/08): nguồn số là lượt
     chạy Codex GẦN NHẤT, nên máy mới cài / vừa đổi hồ sơ / chưa gen lần nào thì
     thanh biến mất không một lời — người dùng Windows tưởng app hỏng. Nay: đã
     ĐĂNG NHẬP mà chưa có số ⇒ vẫn hiện dòng "chưa có số liệu" nói rõ vì sao
     (sidebar thôi; chip topbar chật chỗ, giữ luật ẩn cũ). Luật 1 của
     `usage-meter.ts` không bị phá: vẫn không bịa số, không vẽ 0%. */
  if (!view) {
    if (variant !== "sidebar" || !account.data?.loggedIn) return null;
    const explain =
      "Số quota đọc từ lượt chạy Codex gần nhất trên máy (không gọi mạng). Chạy một lượt tạo ảnh là có số.";
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div role="status" aria-label={explain} className={cn("cursor-default rounded-2 px-3 py-2", className)}>
            <div className="flex items-baseline justify-between gap-2">
              <span className="truncate text-caption text-fg-muted">Hạn mức Codex</span>
              <span className="shrink-0 text-caption text-fg-muted">chưa có số liệu</span>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent>{explain}</TooltipContent>
      </Tooltip>
    );
  }

  const barTone =
    view.tone === "danger" ? "bg-danger"
      : view.tone === "warn" ? "bg-warn"
        : "bg-accent";
  const textTone =
    view.tone === "danger" ? "text-danger"
      : view.tone === "warn" ? "text-warn"
        : "text-fg-muted";

  const bar = (
    <div className="h-1 w-full overflow-hidden rounded-full bg-raised" aria-hidden>
      <div className={cn("h-full rounded-full transition-all duration-2", barTone)} style={{ width: `${view.remainingPercent}%` }} />
    </div>
  );

  if (variant === "compact") {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            role="status"
            aria-label={view.detail}
            className={cn(
              "flex h-8 shrink-0 items-center gap-2 rounded-full border border-line-subtle px-3 text-caption",
              "cursor-default tabular-nums",
              textTone,
              className,
            )}
          >
            <span className="h-1 w-10 overflow-hidden rounded-full bg-raised" aria-hidden>
              <span className={cn("block h-full rounded-full", barTone)} style={{ width: `${view.remainingPercent}%` }} />
            </span>
            {view.remainingLabel}
          </span>
        </TooltipTrigger>
        <TooltipContent>{view.detail}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          role="status"
          aria-label={view.detail}
          className={cn("cursor-default space-y-1 rounded-2 px-3 py-2", className)}
        >
          <div className="flex items-baseline justify-between gap-2">
            <span className="truncate text-caption text-fg-muted">{view.title}</span>
            <span className={cn("shrink-0 text-caption tabular-nums", textTone)}>{view.remainingLabel}</span>
          </div>
          {bar}
        </div>
      </TooltipTrigger>
      <TooltipContent>{view.detail}</TooltipContent>
    </Tooltip>
  );
}
