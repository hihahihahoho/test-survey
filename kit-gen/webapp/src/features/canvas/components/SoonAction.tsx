import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * HÀNH ĐỘNG CHƯA MỞ — khoá rõ ràng, nói rõ lý do, KHÔNG giả vờ chạy được.
 *
 * FE2-PLAN §3-D1 ranh giới cứng: «CTA chưa làm phải disabled + tooltip "Sắp có"».
 * Rủi ro §6 nói thẳng nỗi lo: canvas shell bị hiểu nhầm là canvas hoàn chỉnh. Nút bấm
 * vào không làm gì là cách nhanh nhất để tạo hiểu lầm đó, nên ở đây mọi thứ chưa có
 * đều `disabled` + có câu giải thích.
 *
 * A11y: `Button` của R0 giữ `aria-disabled` bên cạnh `disabled` để trình đọc màn hình
 * vẫn đọc được nút; `span` bọc để tooltip mở được trên nút khoá (nút khoá không phát
 * pointer event). Nhãn nói luôn trạng thái để người dùng screen-reader không phải đoán.
 */
export interface SoonActionProps {
  icon: LucideIcon;
  label: string;
  /** Một câu nói rõ khi nào có. Không dùng chữ "TODO"/"WIP". */
  reason: string;
  /**
   * `icon` = chỉ icon trong một nút PILL (dùng cho nút rời trên nền panel);
   * `full` = icon + chữ;
   * `rail` = ICON TRẦN, không nền lúc nghỉ — dành cho thanh công cụ dọc.
   */
  variant?: "icon" | "full" | "rail";
}

/* ══ POLISH-RAIL-DOT · VÌ SAO `rail` PHẢI GHI ĐÈ NHIỀU CLASS ĐẾN THẾ ══════════
 * Chủ dự án nhìn app thật: «2 cái sidebar cục tròn thô, đáng nhẽ bỏ cái cục tròn
 * đi thì đẹp hơn». "Cục tròn" không phải do rail vẽ ra — nó là TỔNG của hai luật
 * ở `components/ui/button.tsx`:
 *   1. base có `rounded-full` ⇒ mọi nút icon là hình TRÒN tuyệt đối;
 *   2. `DISABLED_NEUTRAL` (B1/B2) ép `disabled:bg-raised` + `disabled:border-line-subtle`
 *      ⇒ nút khoá có nền ĐẶC + viền. Cả 5 món trong rail đều `disabled`.
 * Ghép lại: 5 đĩa #1A1B1E viền xám xếp dọc trên nền đen — mắt đọc ra 5 CỤC, không
 * đọc ra một thanh công cụ.
 *
 * KHÔNG sửa `button.tsx`: nền đặc lúc khoá là chủ ý và đang đúng ở chỗ khác — nút
 * có CHỮ (`Nhờ máy vẽ`, `Copy sang Figma` ở thanh nổi) cần khối nền để chữ mờ không
 * trôi vào nền, và B1/B2 dựng nó chính vì `disabled:opacity-45` làm chữ biến mất.
 * Vấn đề chỉ nằm ở nút CHỈ-CÓ-ICON trên nền trần. Nên ghi đè tại chỗ dùng.
 *
 * Trạng thái đọc bằng MÀU ICON + nền rất mờ, và chỉ hiện khi có tương tác:
 *   nghỉ  → không nền, không viền, icon `fg-muted`;
 *   hover → nền `fg-strong/.07` bo `rounded-1` (8px), icon lên `fg-strong`;
 *   focus → vòng focus của base giữ nguyên (a11y bàn phím);
 *   chọn  → `data-[selected=true]` cho icon `accent` + nền `accent/.12` (chưa nút nào
 *           bật, để sẵn cho FE-3 khi tool thật chạy — chép lại luật ở một chỗ khác
 *           sau này là cách class rail lệch nhau).
 * Vùng bấm 40px (`icon-lg`) ≥ 36px yêu cầu, icon 18px thay 16px vì mất nền tròn thì
 * icon phải tự gánh việc "có mặt".
 */
const RAIL_CLS = cn(
  "size-ctl-lg rounded-1 border-transparent bg-transparent text-fg-muted shadow-none",
  // Ba dòng dưới HUỶ `DISABLED_NEUTRAL` của base. Phải liệt kê cả `disabled:` lẫn
  // `aria-[disabled=true]:` vì base đặt cả hai; thiếu một là cục tròn quay lại.
  "disabled:border-transparent disabled:bg-transparent disabled:text-fg-muted disabled:shadow-none",
  "aria-[disabled=true]:border-transparent aria-[disabled=true]:bg-transparent",
  "aria-[disabled=true]:text-fg-muted aria-[disabled=true]:shadow-none",
  "hover:bg-fg-strong/[0.07] hover:text-fg-strong active:bg-fg-strong/[0.12]",
  // Liều tint đi qua BIẾN, không gõ số: W2B-2 chốt đúng hai bậc (`--kg-tint-a/-b`) và
  // có cổng canh (`w2b-dosage.test.ts`). Bậc A = bậc "đang chọn", cùng liều với
  // `.choice-card.selected`, để trạng thái chọn đọc GIỐNG NHAU ở mọi màn.
  "data-[selected=true]:bg-accent/[var(--kg-tint-a)] data-[selected=true]:text-accent-text",
  "[&_svg]:size-[18px]",
);

export function SoonAction({ icon: Icon, label, reason, variant = "full" }: SoonActionProps) {
  const rail = variant === "rail";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <Button
            variant="ghost"
            size={rail ? "icon-lg" : variant === "icon" ? "icon-sm" : "sm"}
            className={rail ? RAIL_CLS : undefined}
            disabled
            aria-label={`${label} — sắp có`}
          >
            <Icon aria-hidden strokeWidth={1.5} />
            {variant === "full" && label}
          </Button>
        </span>
      </TooltipTrigger>
      <TooltipContent>{reason}</TooltipContent>
    </Tooltip>
  );
}
