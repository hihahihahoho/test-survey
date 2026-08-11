/**
 * features/kit/lib/useCellKeys.ts — ĐIỀU HƯỚNG BÀN PHÍM 2 CHIỀU trên lưới ô kit.
 *
 * Mẫu composite widget (§5.8-A6): cả lưới MỘT tabstop; ←→↑↓ di chuyển, Home/End
 * về đầu/cuối, Enter mở lightbox. Nếu mỗi ô là một tabstop thì với kit 96 ảnh, user
 * chỉ-bàn-phím phải bấm Tab 96 lần mới ra khỏi lưới.
 *
 * SỐ CỘT ĐO THẬT từ `offsetTop` (lưới `auto-fill` nên số cột đổi theo bề rộng cửa sổ
 * và không tồn tại ở đâu trong JS). Cùng cách làm `useGridKeys` của S1 — tôi viết bản
 * riêng vì lưới của tôi có nhiều NHÓM (gom theo sheet), nên tập ô trải qua nhiều
 * container và `columnsOf` phải tính theo từng nhóm, không phải theo ô đầu tiên.
 */
import * as React from "react";
import { isTypingTarget } from "@/components/layout";

const NAV = new Set(["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"]);

/** Số ô cùng hàng với ô thứ `from` (dựa vào `offsetTop` trong CÙNG một nhóm lưới). */
export function columnsAt(cells: readonly HTMLElement[], from: number): number {
  const cur = cells[from];
  if (!cur) return 1;
  const parent = cur.parentElement;
  const top = cur.offsetTop;
  let n = 0;
  for (const c of cells) {
    if (c.parentElement === parent && c.offsetTop === top) n += 1;
  }
  return Math.max(1, n);
}

export interface CellKeysApi {
  containerRef: React.RefObject<HTMLDivElement>;
  tabIndexFor: (i: number) => 0 | -1;
  /** Đặt lại con trỏ khi danh sách đổi (lọc, cắt lại). */
  setActive: (i: number) => void;
  active: number;
}

export function useCellKeys(count: number, onOpen: (index: number) => void): CellKeysApi {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [active, setActive] = React.useState(0);
  const openRef = React.useRef(onOpen);
  openRef.current = onOpen;

  // Lọc làm danh sách ngắn lại ⇒ kéo con trỏ về trong biên.
  React.useEffect(() => {
    setActive((i) => (count === 0 ? 0 : Math.min(i, count - 1)));
  }, [count]);

  const cellsOf = React.useCallback(
    (): HTMLElement[] =>
      containerRef.current === null
        ? []
        : [...containerRef.current.querySelectorAll<HTMLElement>("[data-kit-cell]")],
    [],
  );

  const focusAt = React.useCallback(
    (i: number) => {
      const cells = cellsOf();
      if (cells.length === 0) return;
      const next = Math.min(Math.max(i, 0), cells.length - 1);
      setActive(next);
      cells[next]?.focus();
      // Ô nằm ngoài vùng nhìn ⇒ cuộn tới. Bệnh THẤP-F của QA-UX là mũi tên di chuyển
      // mà không `scrollIntoView`, focus chạy vào chỗ không thấy được.
      cells[next]?.scrollIntoView({ block: "nearest", inline: "nearest" });
    },
    [cellsOf],
  );

  React.useEffect(() => {
    const root = containerRef.current;
    if (root === null) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const cells = cellsOf();
      if (cells.length === 0) return;
      const el = document.activeElement as HTMLElement | null;
      const idx = el === null ? -1 : cells.indexOf(el);
      if (idx === -1) return; // focus không ở trong lưới ⇒ nhường phím

      if (NAV.has(e.key)) {
        e.preventDefault();
        const cols = columnsAt(cells, idx);
        if (e.key === "ArrowRight") focusAt(idx + 1);
        else if (e.key === "ArrowLeft") focusAt(idx - 1);
        else if (e.key === "ArrowDown") focusAt(idx + cols);
        else if (e.key === "ArrowUp") focusAt(idx - cols);
        else if (e.key === "Home") focusAt(0);
        else if (e.key === "End") focusAt(cells.length - 1);
        return;
      }
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        openRef.current(idx);
      }
    };

    // Bấm chuột vào ô nào thì tabstop chuyển về ô đó — nếu không, Tab ra rồi vào lại
    // sẽ nhảy về ô cũ, cảm giác app "quên" chỗ đang đứng.
    const onFocusIn = (e: FocusEvent) => {
      const cells = cellsOf();
      const i = cells.indexOf(e.target as HTMLElement);
      if (i !== -1) setActive(i);
    };

    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("focusin", onFocusIn);
    return () => {
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("focusin", onFocusIn);
    };
  }, [cellsOf, focusAt]);

  return {
    containerRef,
    tabIndexFor: (i) => (i === active ? 0 : -1),
    setActive,
    active,
  };
}
