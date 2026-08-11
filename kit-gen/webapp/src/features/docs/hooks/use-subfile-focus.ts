import * as React from "react";
import { focusTab } from "../lib/subfile-a11y";

/**
 * features/docs/hooks/use-subfile-focus.ts — TRẢ TIÊU ĐIỂM VỀ THANH TAB (C3).
 *
 * VẤN ĐỀ ĐO ĐƯỢC (`fe2/C3-REPORT.md` §2, PROBE 1 và 3): sau khi menu ngữ cảnh đóng
 * bằng `Esc`, và sau khi xác nhận xoá file, `document.activeElement` là `<body>`.
 * Với người dùng chuột thì vô hại; với người dùng bàn phím thì đó là **mất chỗ**:
 * họ phải bấm `Tab` lại từ đầu trang để quay về thanh tab. Radix trả focus về
 * *trigger*, nhưng trigger của menu này là một điểm neo `aria-hidden` 0×0 (C2 dựng
 * thế để chuột phải mở đúng vị trí con trỏ) nên không nhận được focus.
 *
 * CÁCH LÀM: nhớ tab nào đang là "chủ đề" của lớp nổi, và khi lớp nổi đóng thì đưa
 * focus về đúng tab đó. Nếu tab đó vừa bị xoá thì đưa về tab đang mở (id an toàn mà
 * `safeIdAfterDelete` của C2 đã tính) — **không bao giờ để rơi về `<body>`**.
 *
 * KHÔNG dùng `useEffect` chạy theo mỗi render: chỉ chạy đúng lúc chuyển từ "đang mở"
 * sang "đã đóng". Cướp focus không đúng lúc còn tệ hơn mất focus.
 *
 * ⚠️ BA RÀO CHẮN CHỐNG CƯỚP TIÊU ĐIỂM (tôi đã tự gây ra lỗi này và test bắt được —
 * `fe2/C3-REPORT.md` §3.2): chỉ tìm tab TRONG phạm vi `rootRef` của chính thanh tab
 * này · bỏ qua nếu component đã unmount · bỏ qua nếu cây DOM đã bị gỡ. Thiếu bất kỳ
 * cái nào thì một lời hẹn `requestAnimationFrame` cũ sẽ giật con trỏ khỏi ô người
 * dùng đang gõ ở chỗ khác.
 */
export interface SubfileFocusReturn {
  /** Gắn vào phần tử BAO thanh tab — phạm vi tìm kiếm duy nhất được phép. */
  rootRef: React.MutableRefObject<HTMLDivElement | null>;
  /** Ghi nhớ tab là chủ đề của lớp nổi sắp mở. */
  remember: (docId: string) => void;
  /**
   * Lớp nổi vừa đóng ⇒ trả focus. Dây chuyền ba bậc:
   * tab đã nhớ → `fallbackId` → tab đang được chọn trên thanh.
   * Bậc ba là bắt buộc: khi vừa XOÁ đúng file đang mở thì cả hai bậc đầu đều trỏ
   * vào một tab không còn tồn tại, và nếu dừng ở đó thì tiêu điểm rơi về `<body>` —
   * đúng cái lỗi mà lượt C3 phải sửa.
   */
  restore: (fallbackId?: string) => void;
}

/**
 * Tiêu điểm có đang "vô chủ" không: rơi về `<body>`/`<html>`, không còn phần tử nào,
 * hoặc đang nằm trong chính thanh tab (ca trả lại sau khi ô đổi tên đóng).
 */
function isFocusLost(root: ParentNode): boolean {
  const el = typeof document === "undefined" ? null : document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return true;
  if (!el.isConnected) return true;
  return root instanceof Node && root.contains(el);
}

export function useSubfileFocus(): SubfileFocusReturn {
  const last = React.useRef<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const remember = React.useCallback((docId: string) => {
    last.current = docId;
  }, []);

  const restore = React.useCallback((fallbackId?: string) => {
    const wanted = last.current;
    last.current = null;
    // Chờ một nhịp: Radix gỡ lớp nổi và tự set focus trong cùng vòng; đặt focus
    // trước nó thì bị đè. `requestAnimationFrame` chạy sau vòng dọn dẹp đó.
    const go = () => {
      if (!mounted.current) return;
      const root = rootRef.current;
      if (!root) return;
      // ⚠️ CHỈ nhận lại tiêu điểm khi nó đang VÔ CHỦ. Nếu người dùng đã tự đi chỗ khác
      // (mở popover «Tất cả N», bấm vào Thùng rác…) thì kéo về là CƯỚP — và nó làm
      // đóng luôn lớp nổi họ vừa mở. Bộ test của C2 bắt được đúng ca này khi bản đầu
      // của tôi trả focus vô điều kiện (`fe2/C3-REPORT.md` §3.3).
      if (!isFocusLost(root)) return;
      if (wanted && focusTab(wanted, root)) return;
      if (fallbackId && focusTab(fallbackId, root)) return;
      // Bậc ba: tab đang được chọn. Không tra id nữa vì id cũ có thể vừa bị xoá.
      root.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus();
    };
    // HAI nhịp: nhịp một để Radix gỡ lớp nổi và trả focus của nó, nhịp hai để React
    // vẽ xong danh sách tab mới (sau khi xoá, tab cũ chưa biến mất ở nhịp một).
    const twice = () => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(go);
      else setTimeout(go, 0);
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(twice);
    else setTimeout(twice, 0);
  }, []);

  return { rootRef, remember, restore };
}
