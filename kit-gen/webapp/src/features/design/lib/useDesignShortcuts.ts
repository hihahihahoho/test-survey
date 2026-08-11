/**
 * features/design/lib/useDesignShortcuts.ts — phím tắt RIÊNG của S3 (§3-S3 cuối).
 *
 *   ⌘S lưu · ⌘Z / ⇧⌘Z hoàn tác-làm lại · ⌘L thư viện element · [ ] sheet trước/sau
 *
 * Shell (R1) đã giữ ⌘K / ⌘P / `?` / `g …` và CỐ Ý không giành phím của màn
 * (`components/layout/shortcuts.ts`: *"màn tự gắn phím riêng của mình"*). Đây là
 * chỗ duy nhất S3 gắn phím — nếu R2-P2 cần thêm, khai qua props thay vì gắn listener
 * thứ hai, kẻo hai nơi cùng nghe một phím.
 *
 * LUẬT SỐNG CÒN (§2.3): KHÔNG dùng phím ĐƠN khi con trỏ đang trong input. `[`/`]` là
 * phím đơn ⇒ bắt buộc đi qua `isTypingTarget()` của R1 — gõ "[" vào ô mô tả cho AI mà
 * bị nhảy sheet là lỗi rất khó truy.
 *
 * `⌘Z` thì NGƯỢC LẠI: khi đang ở trong input, để trình duyệt tự undo TEXT — cướp phím
 * này sẽ làm user không sửa nổi một ô nhập.
 */
import * as React from "react";
import { hasMod, isTypingTarget } from "@/components/layout";

export interface DesignShortcutHandlers {
  onSave: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onLibrary: () => void;
  onPrevSheet: () => void;
  onNextSheet: () => void;
  enabled: boolean;
}

export function useDesignShortcuts(h: DesignShortcutHandlers): void {
  const ref = React.useRef(h);
  ref.current = h;

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cur = ref.current;
      if (!cur.enabled) return;
      const typing = isTypingTarget(e.target);
      const mod = hasMod(e);

      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        cur.onSave();
        return;
      }
      if (mod && e.key.toLowerCase() === "l") {
        e.preventDefault();
        cur.onLibrary();
        return;
      }
      if (mod && e.key.toLowerCase() === "z") {
        // Trong input: nhường ⌘Z cho undo văn bản của trình duyệt.
        if (typing) return;
        e.preventDefault();
        if (e.shiftKey) cur.onRedo();
        else cur.onUndo();
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "[") {
        e.preventDefault();
        cur.onPrevSheet();
        return;
      }
      if (e.key === "]") {
        e.preventDefault();
        cur.onNextSheet();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
