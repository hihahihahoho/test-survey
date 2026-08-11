import type { KeyboardEvent } from "react";
import { cn } from "@/lib/utils";
import type { StyleAxis } from "../lib/style-phrases";
import { sliderValueText } from "../lib/style-phrases";

/**
 * §SEGBAR — THANH ĐỨT KHÚC 7 KHÚC (kiểu "thanh máu" trong game), thay cho núm trượt.
 *
 * Đây là LỰA CHỌN CỦA CHỦ DỰ ÁN, nói nguyên văn khi nhìn màn Phong cách: *"đáng nhẽ
 * làm cái thanh bar như cái thanh máu đứt khúc ấy… bấm thì nó thay đổi thông số"*.
 *
 * Ghi để người sửa sau khỏi "sửa ngược": W2A từng đổi ray slider sang xám trung tính
 * với lý lẽ *"thang lưỡng cực thì tô-đầy-từ-trái là sai ngữ nghĩa"* (xem
 * `components/ui/slider.tsx`). Lý lẽ đó vẫn đúng trên sách vở, nhưng chủ dự án đã
 * xem tận mắt và CHỌN kiểu tô-từ-trái đứt khúc vì nó đọc ra ngay không cần học.
 * Ý chủ dự án thắng — đừng lặng lẽ trả về núm trượt.
 *
 * Chữ "nấc 4 trên 7 — ở giữa" cũng theo cùng phản hồi: *"còn bị lặp lại… nhìn là
 * biết"*. Nó KHÔNG bị xoá khỏi hệ, chỉ thôi hiện ra — nay sống trong
 * `aria-valuetext` để trình đọc màn hình vẫn nghe đủ nghĩa.
 *
 * Vì sao khúc rỗng là `bg-line` chứ không phải một mức alpha mới: `--kg-line` là
 * token "viền CONTROL ≥3:1 (WCAG 1.4.11)", đã đo PASS trên cả 4 lớp nền ở hai theme.
 * Chế `bg-fg/20` sẽ làm đỏ `npm run contrast` và đẻ thêm một mức alpha thứ 13 —
 * đúng thứ W2B vừa dọn xong.
 */

const MIN = 1;
const MAX = 7;
const STEPS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Phím → nấc kế tiếp; `null` = phím không thuộc về thanh, để nguyên cho trang. */
export function stepFromKey(key: string, value: number): number | null {
  const next =
    key === "ArrowLeft" || key === "ArrowDown" ? value - 1
    : key === "ArrowRight" || key === "ArrowUp" ? value + 1
    : key === "Home" ? MIN
    : key === "End" ? MAX
    : null;
  return next === null ? null : Math.min(MAX, Math.max(MIN, next));
}

export function SemanticSlider({ axis, value, onChange }: { axis: StyleAxis; value: number; onChange: (n: number) => void }) {
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const next = stepFromKey(e.key, value);
    if (next === null) return;
    e.preventDefault();
    if (next !== value) onChange(next);
  }
  return <div className="grid gap-2" data-axis={axis.id}>
    <div className="flex justify-between gap-4 text-caption text-fg"><span>{axis.left}</span><span className="text-right">{axis.right}</span></div>
    <div
      role="slider"
      tabIndex={0}
      aria-label={`${axis.left} đến ${axis.right}`}
      aria-valuemin={MIN}
      aria-valuemax={MAX}
      aria-valuenow={value}
      aria-valuetext={sliderValueText(axis, value)}
      onKeyDown={handleKeyDown}
      className="flex touch-none select-none items-center gap-1 rounded-full"
    >
      {STEPS.map((step) => {
        const on = step <= value;
        return <div
          key={step}
          data-step={step}
          data-on={on ? "true" : "false"}
          onClick={() => { if (step !== value) onChange(step); }}
          /* py-2.5 = vùng bấm cao 28px quanh khúc 8px — ngón tay không cần chính xác. */
          className="group flex-1 cursor-pointer py-2.5"
        >
          <div className={cn(
            "h-2 w-full rounded-full transition-colors duration-fast",
            on ? "bg-accent group-hover:bg-accent-hover" : "bg-line group-hover:bg-line-strong",
          )} />
        </div>;
      })}
    </div>
  </div>;
}
