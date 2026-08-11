/**
 * grid-keys.js — điều hướng BÀN PHÍM 2 chiều giữa các thẻ project (§3-S1 phím tắt,
 * §5.8-A6 "mọi thao tác làm được không cần chuột").
 *
 * Mẫu composite widget: lưới chỉ có MỘT tabstop; ←→↑↓ di chuyển, Enter mở,
 * ⌫ xoá (mở modal), F2 đổi tên, ⌘D nhân bản. Số cột đo THẬT từ vị trí thẻ
 * (grid auto-fill nên không thể đoán bằng CSS).
 */

const NAV_KEYS = new Set(['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']);

/** Số cột = số thẻ có cùng `offsetTop` với thẻ đầu (≥1). */
function columns(cards) {
  if (cards.length === 0) return 1;
  const top = cards[0].offsetTop;
  let n = 0;
  for (const c of cards) { if (c.offsetTop === top) n += 1; else break; }
  return Math.max(1, n);
}

/**
 * @returns {() => void} hàm dọn listener
 */
export function attachGridKeys(grid, { onOpen, onDelete, onRename, onDuplicate } = {}) {
  const cards = () => Array.from(grid.children).filter((n) => n.dataset && n.dataset.projectId);
  let index = 0;

  function sync() {
    const list = cards();
    if (list.length === 0) return;
    index = Math.max(0, Math.min(index, list.length - 1));
    list.forEach((c, i) => { c.tabIndex = i === index ? 0 : -1; });
  }
  sync();

  function focusAt(i) {
    const list = cards();
    if (list.length === 0) return;
    index = (i + list.length) % list.length;
    sync();
    list[index].focus({ preventScroll: false });
  }

  function currentId() {
    const list = cards();
    return list[index]?.dataset.projectId ?? null;
  }

  function onKeyDown(e) {
    const list = cards();
    if (list.length === 0) return;
    // Chỉ xử lý khi focus đang ở trong lưới, và không phải đang gõ trong field.
    const active = document.activeElement;
    if (!grid.contains(active)) return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    // Đang focus vào nút bên trong thẻ ([Mở]/[⋯]) → để nút tự xử lý Enter/Space.
    const onCard = list.includes(active);

    if (NAV_KEYS.has(e.key)) {
      const cols = columns(list);
      e.preventDefault();
      if (e.key === 'ArrowRight') focusAt(index + 1);
      else if (e.key === 'ArrowLeft') focusAt(index - 1);
      else if (e.key === 'ArrowDown') focusAt(index + cols);
      else if (e.key === 'ArrowUp') focusAt(index - cols);
      else if (e.key === 'Home') focusAt(0);
      else if (e.key === 'End') focusAt(list.length - 1);
      return;
    }
    if (!onCard) return;      // các phím dưới chỉ dành cho thẻ đang focus

    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); onDuplicate?.(currentId()); return; }
    if (e.metaKey || e.ctrlKey) return;
    if (e.key === 'Enter') { e.preventDefault(); onOpen?.(currentId()); }
    else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); onDelete?.(currentId()); }
    else if (e.key === 'F2') { e.preventDefault(); onRename?.(currentId()); }
  }

  function onFocusIn(e) {
    const list = cards();
    const card = list.find((c) => c === e.target || c.contains(e.target));
    if (card) { index = list.indexOf(card); sync(); }
  }

  grid.addEventListener('keydown', onKeyDown);
  grid.addEventListener('focusin', onFocusIn);
  return () => {
    grid.removeEventListener('keydown', onKeyDown);
    grid.removeEventListener('focusin', onFocusIn);
  };
}

export const _columns = columns;
