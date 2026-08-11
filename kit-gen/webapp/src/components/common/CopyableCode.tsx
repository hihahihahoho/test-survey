import * as React from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * §5.6 CodeBlock — nền canvas, viền line-subtle, chữ mono, nút [Copy] góc
 * phải trên, tabIndex=0, ⌘C khi focus copy toàn bộ. KHÔNG wrap — cuộn ngang.
 *
 * BẢO MẬT: component này chỉ hiển thị chuỗi được truyền vào. TUYỆT ĐỐI
 * không truyền API key / token / nội dung auth.json vào đây — và không có
 * chỗ nào trong app được log chúng ra console.
 */
export interface CopyableCodeProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  value: string;
  /** nhãn cho screen reader, vd "Lệnh chạy công cụ local" */
  label?: string;
}

export const CopyableCode = React.forwardRef<HTMLDivElement, CopyableCodeProps>(
  ({ value, label = "Khối lệnh", className, ...props }, ref) => {
    const [copied, setCopied] = React.useState(false);
    const timer = React.useRef<ReturnType<typeof setTimeout>>();

    React.useEffect(() => () => clearTimeout(timer.current), []);

    const copy = React.useCallback(async () => {
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        // Trình duyệt từ chối clipboard (không HTTPS / chưa cấp quyền):
        // vẫn cho user tự bôi đen — nội dung đang hiện nguyên văn trên màn.
        return;
      }
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2000);
    }, [value]);

    // ⌘C / Ctrl+C khi khối đang focus mà user chưa bôi đen gì
    const onKeyDown = (e: React.KeyboardEvent<HTMLPreElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c" && !window.getSelection()?.toString()) {
        e.preventDefault();
        void copy();
      }
    };

    return (
      <div
        ref={ref}
        className={cn("group relative rounded-2 border border-line-subtle bg-canvas", className)}
        {...props}
      >
        <pre
          tabIndex={0}
          onKeyDown={onKeyDown}
          aria-label={label}
          className={cn(
            "overflow-x-auto p-3 pr-12 font-mono text-mono text-fg-strong",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          )}
        >
          <code>{value}</code>
        </pre>
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute right-2 top-2"
          onClick={copy}
          aria-label={copied ? "Đã copy" : "Copy"}
        >
          {copied ? <Check className="text-on-tint-ok" aria-hidden /> : <Copy aria-hidden />}
        </Button>
        {/* thông báo cho screen reader, không chiếm chỗ */}
        <span role="status" aria-live="polite" className="sr-only">
          {copied ? "Đã copy vào clipboard" : ""}
        </span>
      </div>
    );
  }
);
CopyableCode.displayName = "CopyableCode";
