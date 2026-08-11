/**
 * features/docs/lib/subfile-a11y.ts — LUẬT A11Y/EDGE-CASE của tầng file con (C3).
 *
 * Tách khỏi component vì bốn thứ dễ sai nhất của lượt C3 đều kiểm được không cần jsdom:
 * id DOM của tab, tab nào nhận `Mod+1..9` khi thanh đã tràn, phím nào là phím "mở menu
 * ngữ cảnh bằng bàn phím", và **quay focus về đâu** sau khi một lớp nổi đóng lại.
 *
 * NGUỒN: UI-SPEC-V2 §4.3 (phím tắt, listbox) · FE2-PLAN §3-C3 (context menu chuột phải/
 * `Shift+F10`, `F2`, `Mod+D`, `Mod+⌥N`; deep-link là callback typed) · §5.8 UX-SPEC (a11y).
 *
 * BỐN QUYẾT ĐỊNH, mỗi cái vá một lỗi ĐO ĐƯỢC ở bản C1+C2 (bằng chứng: `fe2/C3-REPORT.md` §2):
 *
 * ① **`Mod+1..9` đếm trên TOÀN BỘ tab, không phải tab đang hiện.** C1 truyền `visible`
 *    (tối đa 8) vào hook phím ⇒ với 11 file thì `Mod+9` **không làm gì**. Người dùng đọc
 *    §4.3 ("⌘1..9 nhảy tab thứ n") sẽ tưởng phím hỏng. Mũi tên ←/→ thì vẫn chạy trên
 *    tập ĐANG HIỆN — đó là đúng APG: mũi tên đi theo cái mắt thấy.
 *
 * ② **`Shift+F10` và phím `ContextMenu` phải được bắt TƯỜNG MINH.** jsdom không tự sinh
 *    sự kiện `contextmenu` từ hai phím này (đo được: PROBE in "KHÔNG MỞ"), và trên
 *    Windows/Linux phím `ContextMenu` cũng không đi qua Radix. Không bắt tay = đường bàn
 *    phím tới menu chỉ là lời hứa.
 *
 * ③ **Focus phải QUAY VỀ tab.** Sau khi menu ngữ cảnh đóng (Esc) hoặc sau khi xoá file,
 *    focus rơi về `<body>` (đo được) ⇒ người dùng bàn phím mất chỗ, phải Tab lại từ đầu
 *    trang. `focusTab` là một cửa duy nhất để mọi chỗ trả focus về đúng tab.
 *
 * ④ **Sao chép liên kết KHÔNG được im lặng.** `navigator.clipboard` vắng mặt (http, quyền
 *    bị chặn) là ca THẬT. Hàm trả kết quả để chỗ gọi nói ra sự thật — thành công thì báo,
 *    thất bại thì đưa thẳng chuỗi cho người dùng tự chép.
 */
import type { TabItem } from "./subfile-model";

/* ═════════ 1. Id DOM của tab — HỢP ĐỒNG với C2 ═════════ */

/**
 * `useSubfileActions` (C2) đọc `document.activeElement.id` và cắt tiền tố này để biết
 * đang đứng ở tab nào. Đổi công thức ở đây là gãy F2/Mod+D/⌫ ⇒ có test khoá.
 */
export const TAB_ID_PREFIX = "kg-tab-";

export function tabDomId(docId: string): string {
  return `${TAB_ID_PREFIX}${docId}`;
}

/** `null` nếu phần tử không phải một tab file con. */
export function docIdFromDomId(domId: string | null | undefined): string | null {
  if (!domId || !domId.startsWith(TAB_ID_PREFIX)) return null;
  const id = domId.slice(TAB_ID_PREFIX.length);
  return id.length > 0 ? id : null;
}

/** Id vùng nội dung mà thanh tab điều khiển (`aria-controls` ⇄ `role="tabpanel"`). */
export const FILE_PANEL_ID = "kg-file-panel";

/* ═════════ 2. Phím ═════════ */

export interface KeyLikeA11y {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/**
 * Có phải tổ hợp "mở menu ngữ cảnh bằng bàn phím" không.
 * `Shift+F10` (chuẩn Windows/Linux/macOS-VoiceOver) và phím `ContextMenu` (phím ☰ trên
 * bàn phím PC). KHÔNG nhận `F10` trần: đó là phím menu của trình duyệt.
 */
export function isContextMenuKey(e: KeyLikeA11y): boolean {
  if (e.key === "ContextMenu") return true;
  return e.key === "F10" && e.shiftKey === true && !e.ctrlKey && !e.metaKey && !e.altKey;
}

/**
 * Tab nào nhận `Mod+n`. Đếm trên TOÀN BỘ danh sách (quyết định ①).
 * Trả `null` khi không có tab thứ n — chỗ gọi phải KHÔNG `preventDefault()` để
 * không nuốt phím của trình duyệt.
 */
export function tabForIndexShortcut(all: readonly TabItem[], index: number): TabItem | null {
  return all[index] ?? null;
}

/* ═════════ 3. Focus ═════════ */

/**
 * Kéo focus về một tab. Trả `true` nếu tìm thấy phần tử và đã focus.
 *
 * `scrollIntoView({inline:"nearest"})`: thanh tab là `overflow-x-auto`, tab được focus
 * có thể nằm ngoài khung nhìn ⇒ focus "vô hình" là kiểu hỏng đã thấy ở `useCellKeys`
 * của S4 (cùng cách chữa). jsdom không có hàm này ⇒ gọi phòng thủ.
 *
 * ⚠️ HAI RÀO CHẮN CHỐNG **CƯỚP TIÊU ĐIỂM** — đây không phải phòng xa, tôi đã tự gây ra
 * đúng lỗi này trong lượt C3 và bộ test bắt được (`fe2/C3-REPORT.md` §3.2):
 *
 *  · **Bắt buộc có `root`, và `root` phải còn nằm trong tài liệu.** Bản đầu của tôi
 *    tra cứu bằng `document.getElementById` khi không thấy trong `root`. Hệ quả: một
 *    lời gọi đã hẹn qua `requestAnimationFrame` từ thanh tab **đã bị gỡ** vẫn tìm thấy
 *    một tab của thanh khác (cùng công thức id) rồi giật tiêu điểm khỏi ô người dùng
 *    đang gõ. Trong test nó làm đóng popover «Tất cả N»; trong app thật nó là con trỏ
 *    tự nhảy đi giữa lúc gõ.
 *  · **Chỉ focus phần tử THẬT SỰ nằm trong `root`.** Không quét ra ngoài phạm vi
 *    thanh tab gọi hàm.
 */
export function focusTab(docId: string, root: ParentNode | null | undefined): boolean {
  if (!root) return false;
  // `root` có thể là một cây đã bị React gỡ ⇒ không được đụng tới tiêu điểm nữa.
  // Đọc `isConnected` bằng duck-typing chứ không `instanceof Element`: tầng này còn
  // chạy trong vitest environment "node", nơi `Element` không tồn tại (ReferenceError).
  if ((root as { isConnected?: boolean }).isConnected === false) return false;
  const el = root.querySelector<HTMLElement>(`#${cssEscape(tabDomId(docId))}`);
  if (!el) return false;
  el.focus();
  el.scrollIntoView?.({ block: "nearest", inline: "nearest" });
  return true;
}

/** `CSS.escape` không có ở mọi môi trường (jsdom cũ) — tự lo, không để nổ. */
export function cssEscape(s: string): string {
  const g = globalThis as { CSS?: { escape?: (v: string) => string } };
  if (typeof g.CSS?.escape === "function") return g.CSS.escape(s);
  return s.replace(/([^\w-])/g, "\\$1");
}

/**
 * Toạ độ neo menu ngữ cảnh khi mở bằng BÀN PHÍM (không có con trỏ chuột):
 * góc dưới-trái của chính tab đang focus. `0,0` là đường lùi khi không đo được —
 * menu vẫn mở ra ở góc màn, còn hơn không mở.
 */
export function anchorForTab(docId: string, root?: ParentNode | null): { x: number; y: number } {
  const scope = root ?? (typeof document === "undefined" ? null : document);
  if (!scope) return { x: 0, y: 0 };
  const el = scope.querySelector<HTMLElement>(`#${cssEscape(tabDomId(docId))}`);
  const r = el?.getBoundingClientRect();
  return { x: r?.left ?? 0, y: r?.bottom ?? 0 };
}

/* ═════════ 4. Sao chép liên kết ═════════ */

export type CopyOutcome = { ok: true; text: string } | { ok: false; text: string; reason: string };

/**
 * Chép `text` vào clipboard. KHÔNG nuốt lỗi (quyết định ④): trả kết quả để chỗ gọi
 * nói ra. Ba ca thật: không có `navigator.clipboard` (trang http), quyền bị từ chối,
 * và thành công.
 */
export async function copyText(text: string): Promise<CopyOutcome> {
  const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (t: string) => Promise<void> } } }).navigator;
  const write = nav?.clipboard?.writeText;
  if (typeof write !== "function") {
    return { ok: false, text, reason: "NO_CLIPBOARD_API" };
  }
  try {
    await write.call(nav!.clipboard, text);
    return { ok: true, text };
  } catch (err) {
    return { ok: false, text, reason: err instanceof Error ? err.name : "COPY_DENIED" };
  }
}

/** Câu báo cho người dùng khi chép hỏng — đưa thẳng chuỗi để họ tự chép tay. */
export const COPY_FAIL_TITLE = "Trình duyệt không cho chép tự động";
export function copyFailDescription(text: string): string {
  return `Bạn chép tay giúp nhé: ${text}`;
}
