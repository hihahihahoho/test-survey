/**
 * features/projects/lib/useGridKeys.ts — ĐIỀU HƯỚNG BÀN PHÍM 2 CHIỀU giữa các thẻ
 * (§3-S1 "Phím tắt" + §5.8-A6 "mọi thao tác làm được không cần chuột").
 *
 * Mẫu COMPOSITE WIDGET (đúng khuyến nghị của WAI-ARIA cho lưới thẻ):
 * cả lưới chỉ có MỘT tabstop; ←→↑↓ di chuyển giữa thẻ, Home/End về đầu/cuối,
 * Enter mở, ⌫/Delete xoá (mở modal xác nhận), F2 đổi tên, ⌘D nhân bản.
 * Nếu mỗi thẻ là một tabstop thì user phải bấm Tab 7 lần để qua 7 project rồi
 * mới tới nút [Tạo project] — đó là lý do có luật một-tabstop.
 *
 * SỐ CỘT ĐO THẬT từ `offsetTop` của các thẻ, không đoán từ CSS: lưới dùng
 * `auto-fill` nên số cột đổi theo bề rộng cửa sổ và không có ở đâu trong JS.
 * (Port từ `web/js/screens/projects/grid-keys.js`, logic đã qua QA.)
 */
import * as React from "react";
import { isTypingTarget } from "@/components/layout/shortcuts";

export interface GridKeyHandlers {
  onOpen?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRename?: (id: string) => void;
  onDuplicate?: (id: string) => void;
}

const NAV_KEYS = new Set(["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"]);

/** Số cột = số thẻ có cùng `offsetTop` với thẻ đầu tiên (tối thiểu 1). */
export function columnsOf(cards: readonly HTMLElement[]): number {
  const first = cards[0];
  if (!first) return 1;
  const top = first.offsetTop;
  let n = 0;
  for (const c of cards) {
    if (c.offsetTop === top) n += 1;
    else break;
  }
  return Math.max(1, n);
}

export interface GridKeysApi {
  /** Gắn vào phần tử bọc lưới/bảng. */
  containerRef: React.RefObject<HTMLDivElement>;
  /** tabIndex cho thẻ thứ `index` — đúng 1 thẻ có 0, còn lại -1. */
  tabIndexFor: (index: number) => 0 | -1;
  /** Đưa focus về thẻ đầu (dùng cho lệnh ⌘K "Về danh sách"). */
  focusFirst: () => void;
}

/**
 * @param ids danh sách id theo ĐÚNG thứ tự đang hiển thị.
 */
export function useGridKeys(ids: readonly string[], handlers: GridKeyHandlers): GridKeysApi {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState(0);
  const h = React.useRef(handlers);
  h.current = handlers;

  // Danh sách rút ngắn (lọc/xoá) ⇒ kéo con trỏ về trong biên, không để trỏ ra ngoài.
  React.useEffect(() => {
    setActive((i) => (ids.length === 0 ? 0 : Math.min(i, ids.length - 1)));
  }, [ids.length]);

  const cards = React.useCallback((): HTMLElement[] => {
    const root = containerRef.current;
    if (!root) return [];
    return [...root.querySelectorAll<HTMLElement>("[data-project-card]")];
  }, []);

  const focusAt = React.useCallback(
    (i: number) => {
      const list = cards();
      if (list.length === 0) return;
      const next = ((i % list.length) + list.length) % list.length;
      setActive(next);
      list[next]?.focus();
    },
    [cards],
  );

  React.useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const list = cards();
      if (list.length === 0) return;
      // Đang gõ trong ô nhập (vd ô sửa tên inline) ⇒ nhường hết phím.
      if (isTypingTarget(e.target)) return;

      if (NAV_KEYS.has(e.key)) {
        const cols = columnsOf(list);
        e.preventDefault();
        if (e.key === "ArrowRight") focusAt(active + 1);
        else if (e.key === "ArrowLeft") focusAt(active - 1);
        else if (e.key === "ArrowDown") focusAt(Math.min(active + cols, list.length - 1));
        else if (e.key === "ArrowUp") focusAt(Math.max(active - cols, 0));
        else if (e.key === "Home") focusAt(0);
        else if (e.key === "End") focusAt(list.length - 1);
        return;
      }

      // Các phím dưới CHỈ áp cho thẻ đang focus — không cướp phím của nút [Mở]/[⋯]
      // nằm bên trong thẻ (chúng cần Enter/Space cho chính chúng).
      const el = document.activeElement as HTMLElement | null;
      if (!el || !list.includes(el)) return;
      const id = ids[list.indexOf(el)];
      if (id === undefined) return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        h.current.onDuplicate?.(id);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Enter") {
        e.preventDefault();
        h.current.onOpen?.(id);
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        h.current.onDelete?.(id);
      } else if (e.key === "F2") {
        e.preventDefault();
        h.current.onRename?.(id);
      }
    };

    // Chuột bấm vào thẻ nào thì tabstop chuyển về thẻ đó — nếu không, Tab ra rồi
    // Tab vào lại sẽ nhảy về thẻ cũ, cảm giác như app "quên" chỗ đang đứng.
    const onFocusIn = (e: FocusEvent) => {
      const list = cards();
      const target = e.target as HTMLElement | null;
      const card = list.find((c) => c === target || c.contains(target as Node));
      if (card) setActive(list.indexOf(card));
    };

    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("focusin", onFocusIn);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("focusin", onFocusIn);
    };
  }, [active, cards, focusAt, ids]);

  return {
    containerRef,
    tabIndexFor: (index) => (index === active ? 0 : -1),
    focusFirst: () => focusAt(0),
  };
}
