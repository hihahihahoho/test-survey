/**
 * design/shortcuts.js — PHÍM TẮT của S3 (§2.3 + §3-S3 "Phím tắt").
 *
 * ⌘S lưu (chặn mặc định trình duyệt) · ⌘Z/⇧⌘Z hoàn tác/làm lại ·
 * ⌘⏎ Lưu rồi mở modal Sinh ảnh · ⌘L thư viện element · [ ] sheet trước/sau.
 *
 * LUẬT §2.3: KHÔNG dùng phím đơn khi con trỏ đang ở trong input/textarea/contenteditable.
 * Mũi tên trong lưới ô do cell-grid.js xử lý (composite widget, không bắt ở đây).
 */

const isTyping = (t) => {
  if (!t) return false;
  const tag = String(t.tagName ?? '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || t.isContentEditable === true;
};

export function bindShortcuts(h = {}, target = null) {
  const node = target ?? (typeof window !== 'undefined' ? window : null);
  if (!node) return () => {};

  const onKey = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const key = String(e.key ?? '').toLowerCase();

    if (mod && key === 's') { e.preventDefault(); h.onSave?.(); return; }
    if (mod && key === 'enter') { e.preventDefault(); h.onSaveAndGen?.(); return; }
    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) h.onRedo?.(); else h.onUndo?.();
      return;
    }
    if (mod && key === 'l') { e.preventDefault(); h.onLibrary?.(); return; }

    if (isTyping(e.target)) return;         // §2.3: phím đơn chỉ khi không đang gõ
    if (e.key === '[') { e.preventDefault(); h.onPrevSheet?.(); return; }
    if (e.key === ']') { e.preventDefault(); h.onNextSheet?.(); }
  };

  node.addEventListener('keydown', onKey);
  return () => node.removeEventListener('keydown', onKey);
}

/** Phím tắt của S4 (§3-S4): ⌘. dừng · ⌘⏎ chạy lại lượt lỗi · j/k · Enter · f. */
export function bindRunShortcuts(h = {}, target = null) {
  const node = target ?? (typeof window !== 'undefined' ? window : null);
  if (!node) return () => {};

  const onKey = (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const key = String(e.key ?? '').toLowerCase();
    if (mod && key === '.') { e.preventDefault(); h.onCancel?.(); return; }
    if (mod && key === 'enter') { e.preventDefault(); h.onRetryFailed?.(); return; }
    if (mod && e.altKey && key === 'l') { e.preventDefault(); h.onToggleLog?.(); return; }

    if (isTyping(e.target)) return;
    if (key === 'j') { e.preventDefault(); h.onNextJob?.(); return; }
    if (key === 'k') { e.preventDefault(); h.onPrevJob?.(); return; }
    if (key === 'f') { e.preventDefault(); h.onToggleErrorFilter?.(); return; }
    if (e.key === 'Enter') { h.onOpenJobLog?.(); }
  };

  node.addEventListener('keydown', onKey);
  return () => node.removeEventListener('keydown', onKey);
}
