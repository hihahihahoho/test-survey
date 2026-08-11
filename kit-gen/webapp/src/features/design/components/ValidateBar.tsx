import * as React from "react";
import { AlertTriangle, CheckCircle2, ChevronUp, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Finding, Target, ValidationResult } from "../lib/validate";

/**
 * THANH VALIDATE ở đáy vùng ② (§3-S3.4 cuối).
 *
 * `✓ Hợp lệ` hoặc `⛔ 2 lỗi · ⚠ 3 cảnh báo`; bấm để bung danh sách, click từng dòng
 * NHẢY TỚI CHỖ SAI. Đây là điều kiện để lỗi không chỉ nằm trong toast: user luôn có
 * một chỗ nhìn thấy toàn cảnh và một đường đi tới nơi phải sửa.
 *
 * Nút [Sửa nhanh] chỉ hiện với `finding.fix` — những luật mà máy sửa đúng được 100%
 * (slug hoá id, bù/cắt ô cho khớp lưới). Không đoán bừa những cái khác.
 */
export interface ValidateBarProps {
  validation: ValidationResult;
  onGoTo: (t: Target) => void;
  onQuickFix: (f: Finding) => void;
  readOnly: boolean;
}

export function ValidateBar({ validation, onGoTo, onQuickFix, readOnly }: ValidateBarProps) {
  const [open, setOpen] = React.useState(false);
  const { errors, warnings } = validation;
  const total = errors.length + warnings.length;
  const listId = React.useId();

  // Hết lỗi thì tự đóng danh sách — để lại một panel rỗng là rác thị giác.
  React.useEffect(() => {
    if (total === 0) setOpen(false);
  }, [total]);

  return (
    <div className="border-t border-line-subtle bg-surface">
      <div className="flex items-center gap-2 px-4 py-2">
        {errors.length === 0 ? (
          <span className="flex items-center gap-1.5 text-caption text-on-tint-ok">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Hợp lệ — lưu được
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-caption text-danger">
            <ShieldAlert className="size-3.5" aria-hidden />
            {errors.length} lỗi phải sửa trước khi lưu
          </span>
        )}
        {warnings.length > 0 && (
          <span className="flex items-center gap-1.5 text-caption text-on-tint-warn">
            <AlertTriangle className="size-3.5" aria-hidden />
            {warnings.length} cảnh báo (vẫn lưu được)
          </span>
        )}
        {total > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((v) => !v)}
          >
            <ChevronUp className={cn("size-3.5 transition-transform duration-fast", open && "rotate-180")} aria-hidden />
            {open ? "Ẩn danh sách" : `Xem ${total} mục`}
          </Button>
        )}
      </div>

      {open && total > 0 && (
        <ScrollArea className="max-h-48 border-t border-line-subtle" id={listId}>
          <ul className="flex flex-col p-1" role="list">
            {[...errors, ...warnings].map((f, i) => (
              <li key={`${f.rule}-${i}`} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onGoTo(f.target)}
                  className={cn(
                    "flex min-w-0 flex-1 items-center gap-2 rounded-2 px-2 py-1.5 text-left text-caption hover:bg-raised",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                  )}
                >
                  {f.severity === "error" ? (
                    <ShieldAlert className="size-3.5 shrink-0 text-danger" aria-hidden />
                  ) : (
                    <AlertTriangle className="size-3.5 shrink-0 text-on-tint-warn" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate text-fg">{f.message}</span>
                  <span className="shrink-0 text-fg-muted-raised">{describeTarget(f.target)}</span>
                </button>
                {f.fix && !readOnly && (
                  <Button variant="secondary" size="sm" className="mr-1 shrink-0" onClick={() => onQuickFix(f)}>
                    {f.fix.label}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </div>
  );
}

/** Chỗ sai, nói bằng tiếng người — không hiện `sheets[2].components[5].file`. */
export function describeTarget(t: Target): string {
  if (t.kind === "element") return `sheet ${t.sheetId} · ô ${t.index + 1}`;
  if (t.kind === "sheet") return `sheet ${t.sheetId}`;
  if (t.kind === "variant") return `phong cách ${t.variantId}`;
  if (t.kind === "character") return `nhân vật ${t.characterId}`;
  return "bản thiết kế";
}
