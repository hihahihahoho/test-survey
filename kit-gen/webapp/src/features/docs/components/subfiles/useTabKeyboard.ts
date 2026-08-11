import * as React from "react";
import { isTypingTarget, matchTabShortcut, stepIndex, type TabItem } from "../../lib/subfile-model";
import {
  docIdFromDomId, focusTab, isContextMenuKey, tabForIndexShortcut,
} from "../../lib/subfile-a11y";

/**
 * BÀN PHÍM CHO THANH TAB — hai lớp tách bạch, cố ý:
 *
 *  ① Trong thanh tab (`onKeyDown` trên `role="tablist"`): APG Tabs — ←/→ chạy vòng,
 *     Home/End về đầu/cuối, roving tabindex nên phải TỰ `focus()` phần tử đích.
 *     C3 thêm: `Shift+F10` / phím `ContextMenu` mở menu ngữ cảnh của tab đang focus.
 *  ② Toàn cửa sổ (`useEffect` gắn `keydown`): `⌃Tab`, `⌃⇧Tab`, `Mod+1..9`, `Mod+⌥N`.
 *
 * BA CÁI KHÔNG LÀM, mỗi cái là một cách hỏng đã thấy trước:
 *  · KHÔNG `preventDefault()` khi tổ hợp không phải của ta ⇒ không nuốt phím trình duyệt.
 *  · KHÔNG bắt phím khi con trỏ đang ở ô nhập/vùng sửa được (`isTypingTarget`) ⇒
 *    người dùng gõ tên file có số vẫn gõ được.
 *  · KHÔNG dùng ⌘Tab trên macOS: đó là chuyển ứng dụng của hệ điều hành, web
 *    không nhận được. `⌃Tab` dùng chung cho cả hai hệ (đúng §4.3).
 *
 * HAI SỬA CỦA C3 (lý do đo được ở `fe2/C3-REPORT.md` §2):
 *  · **`Mod+1..9` đếm trên `allTabs`, không phải `tabs` đang hiện.** Trước đây hook chỉ
 *    nhận tập ĐANG HIỆN (≤8) nên với 11 file thì `Mod+9` im lặng, trái §4.3.
 *    Mũi tên ←/→ và `⌃Tab` vẫn chạy trên tập đang hiện — mắt thấy gì thì phím đi nấy.
 *  · **`Shift+F10` được bắt tường minh.** jsdom (và phím ☰ trên PC) không tự sinh sự
 *    kiện `contextmenu`, nên trước đây đường bàn phím tới menu chỉ là lời hứa.
 */
export interface UseTabKeyboardInput {
  /** danh sách tab ĐANG HIỆN (không gồm phần tràn) — ←/→ và ⌃Tab chạy trên tập này. */
  tabs: readonly TabItem[];
  /** TOÀN BỘ tab kể cả phần thu gọn — `Mod+1..9` đếm trên tập này (§4.3). */
  allTabs?: readonly TabItem[];
  activeId: string;
  onActivate: (id: string) => void;
  onCreate?: () => void;
  /** C3: mở menu ngữ cảnh bằng bàn phím (`Shift+F10` / phím ☰). */
  onContextMenu?: (id: string, e: React.KeyboardEvent) => void;
  listRef: React.RefObject<HTMLElement | null>;
}

function isMacLike(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");
}

export function useTabKeyboard(input: UseTabKeyboardInput) {
  const { tabs, allTabs, activeId, onActivate, onCreate, onContextMenu, listRef } = input;
  const all = allTabs ?? tabs;

  /** Chuyển tab rồi kéo focus theo — roving tabindex mà không focus thì bàn phím kẹt. */
  const goto = React.useCallback(
    (id: string) => {
      onActivate(id);
      // rAF: chờ React vẽ lại (tab vừa từ phần thu gọn ra thanh mới có trong DOM).
      // `focusTab` tự bỏ qua nếu thanh tab đã bị gỡ — xem rào chắn cướp tiêu điểm
      // trong `lib/subfile-a11y.ts`.
      requestAnimationFrame(() => focusTab(id, listRef.current));
    },
    [onActivate, listRef],
  );

  const onKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (isContextMenuKey(e) && onContextMenu) {
        // jsdom (và phím ☰ trên PC) KHÔNG tự sinh sự kiện `contextmenu` từ hai phím này
        // ⇒ không bắt tay thì đường bàn phím tới menu chỉ là lời hứa (đo được, §2 report).
        const docId = docIdFromDomId((e.target as HTMLElement | null)?.id) ?? activeId;
        e.preventDefault();
        onContextMenu(docId, e);
        return;
      }
      if (tabs.length === 0) return;
      const i = Math.max(0, tabs.findIndex((t) => t.id === activeId));
      let next: number | null = null;
      if (e.key === "ArrowRight") next = stepIndex(tabs.length, i, 1);
      else if (e.key === "ArrowLeft") next = stepIndex(tabs.length, i, -1);
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next === null) return;
      e.preventDefault();
      const t = tabs[next];
      if (t) goto(t.id);
    },
    [tabs, activeId, goto, onContextMenu],
  );

  React.useEffect(() => {
    const mac = isMacLike();
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const hit = matchTabShortcut(e, mac);
      if (!hit) return;
      if (hit.type === "new") {
        if (!onCreate) return; // không có hành động ⇒ để nguyên phím cho trình duyệt
        e.preventDefault();
        onCreate();
        return;
      }
      if (hit.type === "index") {
        // Đếm trên TOÀN BỘ tab: `Mod+9` phải tới được file thứ 9 kể cả khi nó đang thu gọn.
        const target = tabForIndexShortcut(all, hit.index);
        if (!target) return; // Mod+7 mà chỉ có 3 file: không làm gì, cũng không nuốt phím
        e.preventDefault();
        goto(target.id);
        return;
      }
      if (tabs.length === 0) return;
      const i = Math.max(0, tabs.findIndex((t) => t.id === activeId));
      const target = tabs[stepIndex(tabs.length, i, hit.type === "next" ? 1 : -1)];
      if (!target) return;
      e.preventDefault();
      goto(target.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tabs, all, activeId, onCreate, goto]);

  return { onKeyDown };
}
