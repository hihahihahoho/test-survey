import * as React from "react";
import { AlertTriangle, ChevronDown, Info } from "lucide-react";
import { CopyableCode } from "@/components/common";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { presentError } from "../lib/feedback";

/**
 * Mảnh dùng chung của các dialog CRUD. Ba thứ lặp lại ở 7 dialog nên gom về đây
 * để không có 7 phiên bản hơi khác nhau (đúng bệnh của bản v1).
 */

/** Dải vàng "agent chưa chạy" đặt ĐẦU modal — giải thích TRƯỚC khi user bấm (§4.1-5). */
export function OfflineNotice({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2 rounded-2 border border-warn/60 bg-warn/10 p-3" role="status">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-on-tint-warn" aria-hidden />
      <p className="text-caption text-fg-strong">{text}</p>
    </div>
  );
}

/** Dải xanh thông tin — dùng cho những câu trấn an ("file gốc không bị đổi"). */
export function InfoNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-2 border border-accent/60 bg-accent/[var(--kg-tint-b)] p-3">
      <Info className="mt-0.5 size-4 shrink-0 text-on-tint-accent" aria-hidden />
      <div className="text-caption text-fg">{children}</div>
    </div>
  );
}

/**
 * Lỗi INLINE trong modal (§5.5: "toast không bao giờ là nơi DUY NHẤT báo lỗi").
 * Câu chữ lấy từ bảng §3.9; `detail` kỹ thuật nằm trong panel GẬP LẠI.
 */
export function InlineError({ error, detail }: { error: unknown; detail?: string }) {
  const v = presentError(error);
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-2 border border-danger/60 bg-danger/10 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0">
          <p className="text-body text-fg-strong">{v.title}</p>
          <p className="text-caption text-fg">{v.explain}</p>
        </div>
      </div>
      {detail && (
        <details className="group">
          <summary
            className={cn(
              "inline-flex cursor-pointer list-none items-center gap-1 rounded-1 text-label text-fg-muted-raised hover:text-fg-strong",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-raised",
            )}
          >
            <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
            Chi tiết cho lập trình viên
          </summary>
          <CopyableCode className="mt-2" value={detail} />
        </details>
      )}
    </div>
  );
}

/**
 * Một dòng tick trong danh sách "copy những gì / dọn những gì / xuất những gì".
 * `locked` = luôn bật, không bỏ được (vd Bản thiết kế khi nhân bản).
 * `warn` = hệ quả nặng, hiện chữ vàng cạnh nhãn.
 */
export function CheckRow({
  id,
  checked,
  onCheckedChange,
  label,
  hint,
  warn,
  locked,
  disabled,
}: {
  id: string;
  checked: boolean;
  onCheckedChange?: (v: boolean) => void;
  label: string;
  hint?: string;
  warn?: string;
  locked?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-2 px-1 py-1.5">
      <Checkbox
        id={id}
        checked={checked}
        disabled={locked || disabled}
        onCheckedChange={(v) => onCheckedChange?.(v === true)}
        className="mt-0.5"
      />
      <div className="flex min-w-0 flex-col">
        <Label htmlFor={id} className={cn("cursor-pointer", (locked || disabled) && "cursor-default")}>
          {label}
          {locked && <span className="ml-2 font-normal text-caption text-fg-muted-raised">luôn copy</span>}
        </Label>
        {hint && <span className="text-caption text-fg-muted-raised">{hint}</span>}
        {warn && <span className="text-caption text-on-tint-warn">⚠ {warn}</span>}
      </div>
    </div>
  );
}
