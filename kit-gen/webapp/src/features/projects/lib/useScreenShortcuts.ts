/**
 * features/projects/lib/useScreenShortcuts.ts — PHÍM TẮT RIÊNG CỦA S1 (§3-S1).
 *
 *   n    tạo project      · /   focus ô tìm
 *   v    đổi grid/list    · Esc bỏ chọn tất cả
 *
 * (↑↓←→ / Enter / ⌫ / F2 / ⌘D nằm ở `useGridKeys` vì chúng thuộc về lưới thẻ.)
 *
 * LUẬT SỐNG CÒN §2.3 câu cuối: "Không dùng phím đơn nào khi con trỏ đang ở trong
 * input/textarea/contenteditable". Nếu quên, user gõ chữ "n" vào ô tên project
 * sẽ mở thêm một modal Tạo project. `isTypingTarget()` của R1-P1 là cửa duy nhất
 * kiểm việc đó — không tự viết lại.
 *
 * Esc là ngoại lệ CÓ CHỦ Ý: nó được xử lý TRƯỚC `isTypingTarget` vì "bỏ chọn"
 * phải chạy được ngay cả khi con trỏ đang nằm trong ô tìm.
 */
import * as React from "react";
import { isTypingTarget } from "@/components/layout";

export function useProjectsShortcuts({
  enabled,
  readOnly,
  hasSelection,
  onCreate,
  onFocusSearch,
  onToggleView,
  onClearSelection,
}: {
  /** false khi đang mở dialog — dialog tự lo phím của nó. */
  enabled: boolean;
  readOnly: boolean;
  hasSelection: boolean;
  onCreate: () => void;
  onFocusSearch: () => void;
  onToggleView: () => void;
  onClearSelection: () => void;
}): void {
  const ref = React.useRef({ onCreate, onFocusSearch, onToggleView, onClearSelection });
  ref.current = { onCreate, onFocusSearch, onToggleView, onClearSelection };

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape" && hasSelection) {
        ref.current.onClearSelection();
        return;
      }
      if (!enabled) return;
      if (isTypingTarget(e.target)) return;

      if (e.key === "n") {
        if (readOnly) return; // §4.9: agent chưa chạy thì không mở modal tạo
        e.preventDefault();
        ref.current.onCreate();
      } else if (e.key === "/") {
        e.preventDefault();
        ref.current.onFocusSearch();
      } else if (e.key === "v") {
        e.preventDefault();
        ref.current.onToggleView();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled, readOnly, hasSelection]);
}
