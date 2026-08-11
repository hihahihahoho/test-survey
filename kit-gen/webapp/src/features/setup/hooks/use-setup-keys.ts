/**
 * features/setup/hooks/use-setup-keys.ts — PHÍM TẮT của màn S0 (§3-S0 "Phím tắt").
 *
 * Spec chốt đúng ba điều:
 *   `Enter` = nút chính của bước hiện tại
 *   `⌘C` khi focus khối lệnh = copy   (đã do `CopyableCode` của R0 lo, không làm lại ở đây)
 *   `Esc`  = KHÔNG đóng được wizard nếu chưa xong (chỉ "Bỏ qua" mới rời)
 *
 * Thêm cho đủ bàn phím (§5.8-A6), không mâu thuẫn spec:
 *   `Alt+←` / `Alt+→` = lùi/tiến bước. Dùng Alt vì mũi tên trơn đã thuộc về stepper và
 *   các nhóm radio; cướp mũi tên trơn sẽ làm hỏng điều hướng bên trong chúng.
 *
 * §2.3 nói rõ: **không bắt phím đơn khi con trỏ đang ở trong input/textarea/contenteditable**.
 * `Enter` cũng không được cướp khi focus đang ở một `<button>`, `<a>` hay `<summary>` —
 * người dùng đang định bấm đúng thứ họ chọn, không phải nút chính của màn.
 */
import * as React from "react";

/** Nút chính của bước được đánh dấu bằng `data-kg-primary` (xem các file steps/*). */
export const PRIMARY_ATTR = "data-kg-primary";

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable ||
    el.getAttribute("role") === "textbox"
  );
}

function isOwnActivatable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return Boolean(el.closest("button, a[href], summary, [role='radio'], [role='button']"));
}

export function useSetupKeys(opts: {
  containerRef: React.RefObject<HTMLElement>;
  onBack: () => void;
  onNext: () => void;
  /** true khi có overlay đang mở — khi đó nhường phím cho overlay. */
  disabled?: boolean;
}): void {
  const { containerRef, onBack, onNext, disabled = false } = opts;

  React.useEffect(() => {
    if (disabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;

      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isTypingTarget(e.target) || isOwnActivatable(e.target)) return;
        const primary = containerRef.current?.querySelector<HTMLElement>(`[${PRIMARY_ATTR}]`);
        if (primary && !primary.hasAttribute("disabled")) {
          e.preventDefault();
          primary.click();
        }
        return;
      }

      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        if (isTypingTarget(e.target)) return;
        e.preventDefault();
        if (e.key === "ArrowLeft") onBack();
        else onNext();
      }

      /* `Esc`: cố ý KHÔNG làm gì. Wizard chưa xong thì không đóng được — chỉ nút
         "Bỏ qua, tôi đã cài rồi" mới rời được (§3-S0). Ghi ra đây để lần sau không ai
         "bổ sung cho đủ" một handler Esc rồi phá đúng ràng buộc này. */
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [containerRef, onBack, onNext, disabled]);
}
