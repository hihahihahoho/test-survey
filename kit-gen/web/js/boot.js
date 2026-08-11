/**
 * boot.js — điểm khởi động duy nhất được `web/index.html` nạp.
 * Cố ý mỏng: mọi thứ khác nằm trong app-shell/** và screens/**.
 *
 * Việc ở đây: áp theme đã lưu (§5.3 dark mặc định) rồi bật shell.
 * Lỗi khi khởi động cũng KHÔNG được để trang trắng (§1.1-6) → vẽ khối lỗi có đường thoát.
 */

import { store } from './core/index.js';

const { LS_KEYS } = store;

function applyTheme() {
  try {
    const ui = store.get(LS_KEYS.ui);
    const t = ui.theme === 'system'
      ? (matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'light' : 'dark')
      : (ui.theme ?? 'dark');
    document.documentElement.setAttribute('data-theme', t);
  } catch {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

async function main() {
  applyTheme();
  const root = document.getElementById('app');
  if (!root) throw new Error('index.html thiếu #app');
  const { startShell } = await import('./app-shell/shell.js');
  startShell({ root });
}

main().catch((e) => {
  console.error('[boot] không khởi động được giao diện', e);
  const root = document.getElementById('app');
  if (!root) return;
  // Không dùng innerHTML (§5.8-A12). Dựng tay vài node — đây là đường cứu hộ cuối cùng.
  const wrap = document.createElement('div');
  wrap.style.padding = 'var(--s-8)';
  wrap.setAttribute('role', 'alert');
  const h = document.createElement('h1');
  h.textContent = 'Giao diện chưa khởi động được';
  const p = document.createElement('p');
  p.textContent = 'Hãy tải lại trang. Nếu vẫn lỗi, mở Console của trình duyệt để xem chi tiết kỹ thuật. '
    + 'Dữ liệu project của bạn nằm trên máy và không bị ảnh hưởng.';
  const btn = document.createElement('button');
  btn.className = 'kg-btn kg-btn--primary kg-btn--md';
  btn.type = 'button';
  btn.textContent = 'Tải lại trang';
  btn.addEventListener('click', () => window.location.reload());
  wrap.append(h, p, btn);
  root.replaceChildren(wrap);
});
