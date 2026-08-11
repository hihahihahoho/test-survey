import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Hiển thị phím tắt (§2.3). Tự đổi ⌘ ↔ Ctrl theo hệ điều hành để không
 * nói dối người dùng Windows.
 *
 * Dùng: <KeyboardHint keys={["mod","K"]} /> → ⌘K (mac) / Ctrl+K (win)
 */
const isMac = () =>
  typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

/**
 * P-SWEEP·bảng-11 — bảng phải phủ ĐỦ tên phím, nếu không nhánh lùi
 * `k.toUpperCase()` sẽ in ra "ARROWLEFT" trong một hộp kbd (ảnh 01): một chuỗi
 * IN HOA 9 ký tự cho một phím mũi tên. Bổ sung ←/→ và mấy phím hay dùng còn thiếu;
 * chỗ nào vẫn rơi vào nhánh lùi thì nay in nguyên văn chữ được truyền vào, không
 * ép hoa nữa — "P" vẫn ra "P", còn tên dài thì thôi hét.
 */
const PRETTY: Record<string, { mac: string; other: string }> = {
  mod: { mac: "⌘", other: "Ctrl" },
  shift: { mac: "⇧", other: "Shift" },
  alt: { mac: "⌥", other: "Alt" },
  enter: { mac: "↵", other: "Enter" },
  esc: { mac: "Esc", other: "Esc" },
  arrowup: { mac: "↑", other: "↑" },
  arrowdown: { mac: "↓", other: "↓" },
  arrowleft: { mac: "←", other: "←" },
  arrowright: { mac: "→", other: "→" },
  space: { mac: "Space", other: "Space" },
  tab: { mac: "Tab", other: "Tab" },
  backspace: { mac: "⌫", other: "Backspace" },
};

export interface KeyboardHintProps extends React.HTMLAttributes<HTMLElement> {
  keys: string[];
  /** true = các phím bấm LẦN LƯỢT (kiểu vim `g` `p`), hiện dấu cách thay vì liền nhau */
  sequence?: boolean;
}

export function KeyboardHint({ keys, sequence = false, className, ...props }: KeyboardHintProps) {
  const mac = isMac();
  const parts = keys.map((k) => {
    const p = PRETTY[k.toLowerCase()];
    return p ? (mac ? p.mac : p.other) : k.length === 1 ? k.toUpperCase() : k;
  });
  const aria = keys
    .map((k) => {
      const p = PRETTY[k.toLowerCase()];
      return p ? p.other : k.length === 1 ? k.toUpperCase() : k;
    })
    .join(sequence ? " rồi " : " + ");

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={`Phím tắt: ${aria}`} {...props}>
      {parts.map((p, i) => (
        <React.Fragment key={`${p}-${i}`}>
          {sequence && i > 0 && <span className="px-0.5 text-caption text-fg-muted" aria-hidden>rồi</span>}
          <kbd
            className={cn(
              "inline-flex h-5 min-w-5 items-center justify-center rounded-1 border border-line-subtle bg-overlay px-1.5",
              "font-mono text-caption text-fg-muted-raised"
            )}
            aria-hidden
          >
            {p}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  );
}
