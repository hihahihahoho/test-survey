/**
 * tab-prefs.js — S6 tab **Ưu tiên** (§3-S6).
 * Mọi thứ ở đây ghi qua core/store.js (`kitgen.prefs.v1` + `kitgen.ui.v1`) — cửa duy nhất
 * được chạm localStorage (§6.5-2). Không lưu gì ngoài allowlist; store.js tự loại field lạ.
 *
 * [Xoá dữ liệu ứng dụng trong trình duyệt này] LIỆT KÊ ĐÚNG những gì sẽ xoá (8 khoá + 3 store)
 * trước khi xoá — không có nút "xoá bí ẩn".
 */

import {
  el, createSelect, createCheckbox, createSegmented, createButton, createBanner,
  confirmDestructive, toast, icon,
} from '../../ui/index.js';
import { panel, statRow } from '../project/shared/screen.js';
import * as store from '../../core/store.js';
import * as idb from '../../core/idb.js';
import { LS_KEYS, IDB_STORES } from '../../core/constants.js';

const PARALLEL = [1, 2, 3, 4, 5, 6, 7, 8];

export function renderPrefsTab({ onThemeChange = null } = {}) {
  const root = el('div', { class: 'kg-stack', style: { gap: 'var(--s-4)' } });
  const prefs = safeGet(LS_KEYS.prefs);
  const ui = safeGet(LS_KEYS.ui);

  /* ── Sinh ảnh ── */
  const maxJobs = createSelect({
    label: 'Số lượt sinh ảnh chạy song song',
    value: String(prefs.maxJobs ?? 4),
    options: PARALLEL.map((n) => ({ value: String(n), label: String(n) })),
    hint: 'Mặc định 4. Càng cao càng nhanh nhưng càng dễ chạm giới hạn tài khoản.',
    onChange: () => savePrefs({ maxJobs: Number(maxJobs.value) }),
  });
  const autoSlice = createCheckbox({
    label: 'Tự động cắt sau khi sinh ảnh',
    sublabel: 'Chỉ cắt đúng những lượt vừa sinh xong, không cắt lại cả project.',
    checked: prefs.autoSliceAfterGen !== false,
    onChange: () => savePrefs({ autoSliceAfterGen: autoSlice.checked }),
  });
  const confirmDel = createCheckbox({
    label: 'Luôn hỏi trước khi xoá',
    sublabel: 'Tắt cũng vẫn có thùng rác 30 ngày, nhưng nên để bật.',
    checked: prefs.confirmDestructive !== false,
    onChange: () => savePrefs({ confirmDestructive: confirmDel.checked }),
  });
  const showEmpty = createCheckbox({
    label: 'Hiện ô trống trên lưới sheet',
    sublabel: 'Ô không có element sẽ hiện dấu ␀ thay vì bị ẩn.',
    checked: prefs.showEmptyCells === true,
    onChange: () => savePrefs({ showEmptyCells: showEmpty.checked }),
  });
  const logTail = createSelect({
    label: 'Số dòng nhật ký giữ lại',
    value: String(prefs.logTail ?? 2000),
    options: [200, 500, 1000, 2000, 5000].map((n) => ({ value: String(n), label: `${n} dòng` })),
    onChange: () => savePrefs({ logTail: Number(logTail.value) }),
  });

  root.appendChild(panel({
    title: 'Sinh ảnh',
    children: [
      maxJobs.el,
      createBanner({ kind: 'info', title: 'Sinh ảnh là thao tác duy nhất tiêu quota tài khoản — luôn có bước xác nhận trước khi chạy.' }),
      autoSlice.el, confirmDel.el, showEmpty.el, logTail.el,
    ],
  }));

  /* ── Giao diện ── */
  const theme = createSegmented({
    label: 'Giao diện',
    value: ui.theme ?? 'dark',
    items: [
      { value: 'dark', label: 'Tối', icon: '◐' },
      { value: 'light', label: 'Sáng', icon: '○' },
      { value: 'system', label: 'Theo hệ thống', icon: '▣' },
    ],
    note: 'Bản Sáng mới đo tương phản, chưa soi kỹ bằng mắt — gặp chỗ khó đọc hãy báo lại.',
    onChange: (v) => { saveUi({ theme: v }); applyTheme(v); onThemeChange?.(v); },
  });
  const density = createSegmented({
    label: 'Mật độ',
    value: ui.density ?? 'comfortable',
    items: [
      { value: 'comfortable', label: 'Thoải mái' },
      { value: 'compact', label: 'Gọn' },
    ],
    onChange: (v) => saveUi({ density: v }),
  });
  const locale = createSegmented({
    label: 'Ngôn ngữ',
    value: ui.locale ?? 'vi',
    items: [{ value: 'vi', label: 'Tiếng Việt' }, { value: 'en', label: 'English' }],
    note: 'Bản English chưa dịch xong (hạng mục NICE) — chọn cũng vẫn hiện tiếng Việt.',
    onChange: (v) => saveUi({ locale: v }),
  });

  root.appendChild(panel({ title: 'Giao diện', children: [theme.el, density.el, locale.el] }));

  /* ── Dữ liệu trong trình duyệt ── */
  root.appendChild(panel({
    title: 'Dữ liệu ứng dụng trong trình duyệt này',
    children: [
      el('p', { class: 'kg-t-body kg-fg-default',
        text: 'Trình duyệt chỉ giữ tuỳ chọn giao diện và bộ nhớ tạm để app mở nhanh và xem được khi công cụ local tắt. Không có thông tin đăng nhập, không có đường dẫn tuyệt đối.' }),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' } },
        storageInventory().map((line) => el('div', { class: 'kg-t-mono kg-fg-default', text: line }))),
      el('div', { class: 'kg-row kg-row--tight' }, [
        createButton({
          label: 'Xoá dữ liệu ứng dụng trong trình duyệt này', variant: 'danger', icon: '⌫',
          onClick: () => { void wipe(); },
        }),
      ]),
      el('p', { class: 'kg-t-caption kg-fg-default' }, [
        icon('ⓘ'),
        el('span', { text: ' Xoá ở đây KHÔNG xoá project trên máy bạn — project nằm trong thư mục làm việc, do công cụ local quản.' }),
      ]),
    ],
  }));

  return root;
}

/** Liệt kê đúng những gì sẽ bị xoá (§3-S6: "kèm liệt kê đúng 8 key + 3 store"). */
function storageInventory() {
  const keys = Object.values(LS_KEYS);
  return [
    ...keys.map((k) => `localStorage · ${k}`),
    ...Object.values(IDB_STORES).map((s) => `IndexedDB · kitgen/${s}`),
  ];
}

async function wipe() {
  const ok = await confirmDestructive({
    title: 'Xoá dữ liệu ứng dụng trong trình duyệt này?',
    message: 'Sẽ xoá các mục dưới đây. Project trên máy bạn KHÔNG bị ảnh hưởng.',
    consequences: [
      ...Object.values(LS_KEYS).map((k) => k),
      ...Object.values(IDB_STORES).map((s) => `IndexedDB kitgen/${s}`),
      'Bạn sẽ phải chạy lại hướng dẫn cài lần đầu.',
    ],
    confirmLabel: 'Xoá dữ liệu',
  });
  if (ok !== true) return;
  let lsOk = true;
  try { store.clearAll(); } catch { lsOk = false; }
  let idbOk = true;
  for (const s of Object.values(IDB_STORES)) {
    try {
      const keys = await idb.keys(s);
      for (const k of keys) await idb.del(s, k);
    } catch { idbOk = false; }
  }
  if (lsOk && idbOk) toast.success({ title: 'Đã xoá dữ liệu ứng dụng trong trình duyệt này' });
  else toast.warning({ title: 'Đã xoá phần lớn dữ liệu', description: 'Một phần bộ nhớ tạm bị trình duyệt chặn, sẽ tự hết khi bạn đóng tab.' });
}

function applyTheme(v) {
  try {
    const el2 = document.documentElement;
    if (v === 'system') {
      const dark = typeof matchMedia === 'function' ? !matchMedia('(prefers-color-scheme: light)').matches : true;
      el2.setAttribute('data-theme', dark ? 'dark' : 'light');
    } else el2.setAttribute('data-theme', v);
  } catch { /* không có DOM (test) */ }
}

function safeGet(key) {
  try { return store.get(key) ?? {}; } catch { return {}; }
}
function savePrefs(patch) {
  try { store.patch(LS_KEYS.prefs, patch); toast.success({ title: 'Đã lưu tuỳ chọn', duration: 2000 }); }
  catch { toast.error({ title: 'Không lưu được tuỳ chọn', description: 'Trình duyệt đang chặn bộ nhớ cục bộ (chế độ riêng tư?).' }); }
}
function saveUi(patch) {
  try { store.patch(LS_KEYS.ui, patch); }
  catch { toast.error({ title: 'Không lưu được tuỳ chọn giao diện', description: 'Trình duyệt đang chặn bộ nhớ cục bộ.' }); }
}

export { statRow };
