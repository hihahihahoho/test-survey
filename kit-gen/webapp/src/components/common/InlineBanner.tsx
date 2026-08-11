import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { CARD, FLORA } from "@/components/layout/flora";

/**
 * §5.5 "Inline banner": 4 màu theo trạng thái, LUÔN có icon + tiêu đề 1 dòng + ≤2 nút.
 *
 * NGUỒN GỐC (INTEGRATION): bản đầu do R1-P2 viết tạm ở `features/setup/components/
 * InlineBanner.tsx` kèm NEEDS-s0-setup §N2 ("nếu ≥2 màn cần, nâng lên components/common").
 * Điều kiện đó đã thoả: S0 dùng 5 chỗ, S5 (tab Assets) dùng 3 chỗ dưới tên `InlineNotice`
 * — một component thứ hai làm đúng cùng việc, và nó CHƯA TỪNG TỒN TẠI (import chết,
 * làm gãy `tsc`). Integration gộp về đây, thêm 2 khả năng mà bản S5 cần: đổi icon và
 * alias tone "warn"/"error" (S5 gọi tên khác).
 *
 * VỎ FLORA (§2.4 accent dùng RẤT tiết chế): nền là surface `#131416` bo 20px + hairline
 * như mọi khối khác; MÀU chỉ nằm ở icon và tiêu đề.
 *
 * ══ P-SWEEP·1b · BA LỚP MÀU RÚT CÒN MỘT ═════════════════════════════════════
 * Bản trước cộng dồn BA tín hiệu cho cùng một tin: nền tint + viền trái 2px đặc màu
 * + icon màu. Kết quả ở màn workflow là một khối vàng cao 78px đứng TRÊN nội dung
 * suốt 6 bước (ảnh 08/10/12/13/15/19/21/30) — vật nặng nhất, vàng nhất, cao nhất
 * trang, mà chỉ nói một câu phụ. Nay banner mang đúng vỏ của mọi thẻ khác
 * (`CARD` = surface + hairline 1px + bo 20px); tông trạng thái chỉ còn ở ICON và
 * TIÊU ĐỀ. Cảnh báo vẫn đọc ra ngay, nhưng thôi hét át nội dung nó đứng cạnh.
 * Tương phản: `warn`/`danger` trên `surface` đã có sẵn phép đo trong §5.3 của
 * `check-contrast.mjs` (≥4.5:1) — đổi nền từ tint sang surface không tạo cặp mới.
 *
 * A11y: `role="status"` cho info/success (không cắt lời screen reader),
 * `role="alert"` cho warning/danger. Icon `aria-hidden`, ý nghĩa nằm ở CHỮ (§5.8-A3).
 */
export type BannerTone = "info" | "success" | "warning" | "danger";

/** Tên gọi khác mà các màn đã dùng — nhận cả hai để không phải sửa 8 chỗ gọi. */
export type BannerToneInput = BannerTone | "warn" | "error";

const TONE_ALIAS: Record<BannerToneInput, BannerTone> = {
  info: "info", success: "success", warning: "warning", danger: "danger",
  warn: "warning", error: "danger",
};

const TONE: Record<BannerTone, { icon: LucideIcon; ink: string }> = {
  info:    { icon: Info,          ink: "text-accent-text" },
  success: { icon: CheckCircle2,  ink: "text-accent-text" },
  warning: { icon: AlertTriangle, ink: "text-warn" },
  danger:  { icon: XCircle,       ink: "text-danger" },
};

export interface InlineBannerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: BannerToneInput;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Đổi icon mặc định của tone (S5 dùng RefreshCw/Scissors cho ý nghĩa cụ thể hơn). */
  icon?: LucideIcon;
  /** Tối đa 2 nút (§5.5). Nhiều hơn thì thứ tự ưu tiên đã sai, xem lại thiết kế bước đó. */
  actions?: React.ReactNode;
}

export function InlineBanner({
  tone = "info",
  title,
  description,
  icon,
  actions,
  className,
  ...props
}: InlineBannerProps) {
  const key = TONE_ALIAS[tone] ?? "info";
  const t = TONE[key];
  const Icon = icon ?? t.icon;
  return (
    <div
      role={key === "warning" || key === "danger" ? "alert" : "status"}
      className={cn("flex gap-3 p-4", CARD, className)}
      {...props}
    >
      <Icon className={cn("mt-0.5 size-4 shrink-0", t.ink)} strokeWidth={1.5} aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="text-body font-medium text-fg-strong">{title}</p>
        {description && (
          <div className={cn("max-w-[62ch] text-body", FLORA.fg)}>{description}</div>
        )}
        {actions && <div className="mt-1 flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
