import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * ══ P-SWEEP · MỘT TÍN HIỆU "ĐANG CHỌN" CHO CẢ APP ═══════════════════════════
 *
 * Quét 30 ảnh đếm được BỐN cách nói cùng một điều "cái này đang được chọn":
 *   · ring accent + nút xanh ĐẶC        (kho món, ảnh 10/11)
 *   · ring accent mảnh                  (thẻ "Có mascot", ảnh 08/19)
 *   · chip nền xanh ĐẶC                 ("Dáng mặc định", ảnh 12)
 *   · pill nền accent nhạt              (`status-pill`, ảnh 10)
 * Bốn ngôn ngữ cho một khái niệm ⇒ người dùng phải học lại ở từng màn, và hai
 * trong bốn cái dùng nền ĐẶC nên trạng thái "đã chọn" trở thành vật nặng nhất
 * màn hình — nặng hơn cả việc còn phải làm.
 *
 * Chốt MỘT chuẩn: **viền accent 1px + chữ `fg-strong`**, nền giữ nguyên như lúc
 * chưa chọn. Đủ để đọc ra ngay (accent trên surface đo được 8.4:1, và viền là
 * thứ duy nhất đổi nên mắt bắt được sự khác biệt), mà không thêm một mảng màu.
 *
 * Vì sao là `secondary` chứ không `primary`: cả hai lựa chọn trong một cặp
 * loại-trừ-nhau đều NGANG HÀNG. `primary` (nền accent đặc) nói "đây là hành động
 * chính của màn" — sai nghĩa, và phá luật ≤1 nút primary mỗi màn (§5.4).
 *
 * A11y: nghĩa nằm ở `aria-pressed`, không nằm ở màu (§5.8-A3). Người gọi truyền
 * `role`/`aria-selected` riêng thì phần spread ở cuối thắng, không bị ghi đè.
 */
export interface SegChoiceProps extends Omit<ButtonProps, "variant"> {
  /** Đang được chọn hay không. */
  on: boolean;
}

export function SegChoice({ on, className, children, ...props }: SegChoiceProps) {
  return (
    <Button
      variant="secondary"
      aria-pressed={on}
      className={cn(on && "border-accent text-fg-strong", className)}
      {...props}
    >
      {children}
    </Button>
  );
}
