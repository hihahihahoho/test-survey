import type { ReactNode } from "react";

/**
 * Hàng chip chọn nhóm — MỘT hình thái cho cả wizard (UI-FIX §3a).
 *
 * Trước đây bước "Bộ khung UI" dùng chip viền bo, còn bước Mascot dùng tab gạch chân
 * (`.pose-group-tabs`): hai ngôn ngữ cho đúng một việc "lọc kho theo nhóm", ở hai bước
 * liền nhau. Markup của bước Bộ khung UI được nâng lên thành component này và bước
 * Mascot dùng lại y nguyên — không có bản sao thứ hai để lệch dần.
 */
export interface GroupChip {
  id: string;
  label: string;
  /** Số món ĐANG CHỌN trong nhóm; `0` thì không hiện số (đỡ nhiễu). */
  count: number;
}

export function GroupChips({ groups, value, onChange, trailing }: {
  groups: readonly GroupChip[];
  value: string;
  onChange: (id: string) => void;
  /** Chữ căn phải cuối hàng (ví dụ "42 đã chọn"). */
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      {groups.map((group) => (
        <button
          key={group.id}
          type="button"
          aria-pressed={value === group.id}
          onClick={() => onChange(group.id)}
          className={`rounded-2 border px-3 py-2 text-label transition-colors ${value === group.id ? "border-accent bg-accent/[var(--kg-tint-a)] text-fg-strong" : "border-line-subtle text-fg hover:bg-raised"}`}
        >
          {group.label}{group.count > 0 ? ` · ${group.count}` : ""}
        </button>
      ))}
      {trailing ? <span className="ml-auto text-caption tabular-nums text-fg-muted">{trailing}</span> : null}
    </div>
  );
}
