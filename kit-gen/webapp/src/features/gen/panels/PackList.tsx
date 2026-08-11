import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FLORA, FOCUS } from "@/components/layout/flora";
import { cn } from "@/lib/utils";
import type { PackItem } from "../lib/pack-model";

/**
 * DANH SÁCH THỨ TRÊN BÀN có ô tick — thân của lớp phủ «Đóng gói» (UX-V3 §4.2).
 *
 * ══ TƯƠNG PHẢN Ô TICK (UX-V3 §8.3, cặp mới thứ ba) ══
 * Wireframe vẽ ô tick **đè lên ảnh**. Ảnh sáng thì viền ô tick có thể tụt dưới 3:1
 * (WCAG 1.4.11). Cách tránh ở đây không phải đổi màu (wave này cấm đổi token) mà là
 * **không bao giờ đặt ô tick trực tiếp lên ảnh**: mỗi thứ là một hàng nền `raised` đặc,
 * ô tick nằm trên nền đó. Số đo của cặp `line` trên `raised` do `npm run contrast` báo —
 * xem `C2-REPORT.md` §3.
 * (Object của hộp GEN hiện là khung giữ chỗ, **chưa có ảnh nào** — nói rõ ở nhãn từng hàng.)
 *
 * A11y: `Checkbox` của R0 là control thật, có nhãn liên kết; hàng bị khoá dùng
 * `aria-disabled` + `aria-describedby` trỏ vào lý do ⇒ trình đọc màn hình đọc được
 * «Ghi chú chỉ để trên bàn, không vào bộ kit.» thay vì im lặng.
 */
export interface PackListProps {
  items: readonly PackItem[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Nhãn «bản xem trước — chưa gọi máy vẽ» của S1, hiện trên thứ chưa vẽ. */
  previewBadge: string;
}

export function PackList({ items, selected, onToggle, previewBadge }: PackListProps) {
  return (
    <ul className="flex flex-col gap-2" aria-label="Những thứ đang có trên bàn">
      {items.map((item) => (
        <PackRow
          key={item.id}
          item={item}
          checked={selected.has(item.id)}
          onToggle={onToggle}
          previewBadge={previewBadge}
        />
      ))}
    </ul>
  );
}

function PackRow({
  item, checked, onToggle, previewBadge,
}: {
  item: PackItem;
  checked: boolean;
  onToggle: (id: string) => void;
  previewBadge: string;
}) {
  const boxId = React.useId();
  const reasonId = React.useId();
  const locked = !item.selectable;

  const row = (
    <li
      className={cn(
        "flex items-center gap-3 border bg-raised p-3",
        FLORA.r16,
        FLORA.hair,
        locked && "opacity-80",
      )}
    >
      <Checkbox
        id={boxId}
        checked={checked}
        disabled={locked}
        aria-disabled={locked || undefined}
        aria-describedby={locked ? reasonId : undefined}
        onCheckedChange={() => onToggle(item.id)}
        className={FOCUS}
      />
      <label htmlFor={boxId} className={cn("flex min-w-0 flex-1 flex-col gap-0.5", !locked && "cursor-pointer")}>
        <span className="truncate text-body text-fg-strong">{item.label}</span>
        <span id={locked ? reasonId : undefined} className="text-caption text-fg-muted-raised">
          {locked ? item.lockedReason : item.drawn ? "đã vẽ xong" : previewBadge}
        </span>
      </label>
    </li>
  );

  if (!locked) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent className="max-w-xs whitespace-normal">{item.lockedReason}</TooltipContent>
    </Tooltip>
  );
}
