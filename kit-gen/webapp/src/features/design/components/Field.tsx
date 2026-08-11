import * as React from "react";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { messageFor, type Target, type ValidationResult } from "../lib/validate";

/**
 * Ô nhập + LỖI INLINE — yêu cầu §4 của brief: "hiện lỗi INLINE tại chỗ chứ không chỉ toast".
 *
 * Ba thứ phải đi cùng nhau, và đó là lý do gói lại thành một component thay vì
 * lặp lại 20 lần: `<label for>` thật (đóng audit I4), `aria-invalid` +
 * `aria-describedby` trỏ tới đúng câu lỗi (A5/A8), và câu lỗi hiện NGAY DƯỚI field
 * chứ không chỉ nằm trong toast.
 *
 * Lỗi (đỏ, chặn lưu) và cảnh báo (vàng, không chặn) khác nhau cả icon lẫn chữ —
 * không dùng màu làm dấu hiệu duy nhất (A3).
 */
export interface FieldProps {
  id: string;
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** Nếu truyền, lỗi/cảnh báo được tra tự động từ kết quả validate. */
  validation?: ValidationResult | undefined;
  target?: Target | undefined;
  /** Lỗi tự đặt (dùng khi không đến từ validate contract, vd form dialog). */
  error?: string | null | undefined;
  required?: boolean;
  children: (a: { id: string; describedBy: string | undefined; invalid: boolean }) => React.ReactNode;
  className?: string;
}

export function Field({ id, label, hint, validation, target, error, required, children, className }: FieldProps) {
  const auto = validation && target ? messageFor(validation, target) : null;
  const msg = error ? { text: error, severity: "error" as const } : auto;
  const msgId = msg ? `${id}-msg` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [msgId, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label htmlFor={id} className="flex items-center gap-1">
        {label}
        {required && (
          <span className="text-danger" aria-hidden>
            *
          </span>
        )}
      </Label>
      {children({ id, describedBy, invalid: msg?.severity === "error" })}
      {hint && (
        <p id={hintId} className="text-caption text-fg-muted-raised">
          {hint}
        </p>
      )}
      {msg && (
        <p
          id={msgId}
          role={msg.severity === "error" ? "alert" : undefined}
          className={cn(
            "flex items-start gap-1 text-caption",
            msg.severity === "error" ? "text-danger" : "text-on-tint-warn",
          )}
        >
          {msg.severity === "error" ? (
            <AlertCircle className="mt-px size-3 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="mt-px size-3 shrink-0" aria-hidden />
          )}
          <span>
            <span className="sr-only">{msg.severity === "error" ? "Lỗi: " : "Cảnh báo: "}</span>
            {msg.text}
          </span>
        </p>
      )}
    </div>
  );
}

/** Tiêu đề nhóm trong panel — dùng chung để khoảng cách nhất quán (§5.1). */
export function PanelSection({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-line-subtle pt-4 first:border-0 first:pt-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-label uppercase tracking-label text-fg-muted-raised">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
