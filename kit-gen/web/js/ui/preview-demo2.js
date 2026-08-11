/**
 * preview-demo2.js — phần 2 của trang xem thử: mục 9–14.
 * (overlay/confirm/drawer · toast · tooltip/menu · empty/error/banner ·
 *  spinner/skeleton · khung layout + ma trận tiến độ)
 * Không phải phần của design system.
 */
import {
  el, append, icon,
  createButton, createInput, createCheckbox,
  createBadge, createJobBadge, createRunBadge, createAgentPill, createMatrixCell,
  createList, openModal, createModalFooter,
  confirmDestructive, confirmLight, confirmChecklist,
  openDrawer, attachTooltip, createInfoPopover, attachMenu,
  createEmptyState, createErrorState, createBanner,
  createSpinner, createSpinnerRow, createSkeleton, createSkeletonGrid, createTopProgress,
  toast,
} from './index.js';
import { mount, label, row } from './preview-helpers.js';

/* ---------------- 9 · overlays ---------------- */
export function demoModal(size) {
  const f = createInput({ label: 'Tên project', value: 'Bản sao của Tết 2026', autofocus: true });
  const m = openModal({
    title: `Modal ${size} — thử Tab và Esc`,
    description: 'Focus bị bẫy trong panel này. Esc đóng. Đóng xong focus trả về đúng nút đã mở.',
    size, hasInput: true,
    body: el('div', {}, [
      f.el,
      el('p', { class: 'demo-note', style: { marginTop: 'var(--s-3)' }, text: 'Vì modal này có dữ liệu đang nhập, click ra nền KHÔNG đóng (§5.5).' }),
      createCheckbox({ label: 'Copy cả ảnh AI đã sinh (24 MB)', checked: true }).el,
    ]),
    footer: createModalFooter({
      extraLeft: createButton({ label: 'Vì sao?', variant: 'link', size: 'sm' }),
      cancel: createButton({ label: 'Huỷ', variant: 'secondary', onClick: () => m.close() }),
      confirm: createButton({ label: 'Nhân bản', variant: 'primary', onClick: () => {
        m.setBusy(true);
        toast.success({ title: 'Đã nhân bản → «Tết 2026 (bản sao)»' });
        setTimeout(() => m.close(), 400);
      } }),
    }),
  });
}
export async function demoDelete() {
  const ok = await confirmDestructive({
    title: 'Chuyển «Tết 2026» vào thùng rác?',
    message: 'Project vào thùng rác, giữ 30 ngày và phục hồi được.',
    consequences: ['1 lượt sinh ảnh đang chạy sẽ bị dừng (r-0031).', '176 MB gồm 8 ảnh AI và 96 file đã cắt.', 'Bản thiết kế và lịch sử 50 bản vẫn được giữ.'],
    confirmLabel: 'Xoá',
  });
  if (ok) {
    toast.success({
      title: 'Đã xoá «Tết 2026»',
      description: 'Giữ trong thùng rác 30 ngày.',
      undo: { onUndo: () => toast.info({ title: 'Đã phục hồi «Tết 2026»' }) },
    });
  }
}
export async function demoPurge() {
  const res = await confirmDestructive({
    title: 'Xoá vĩnh viễn «candy-old»?',
    message: 'Không phục hồi được. Nhập mã 4 số đang in ở cửa sổ Terminal.',
    consequences: ['Xoá hẳn 42 MB khỏi ổ đĩa.'],
    confirmLabel: 'Xoá vĩnh viễn', requireCode: true,
    onResendCode: () => toast.info({ title: 'Đã yêu cầu agent in mã mới ra Terminal' }),
  });
  if (res && res.code) {
    // giả lập agent trả CONFIRM_INVALID để thấy modal GIỮ MỞ + hiện lỗi
    setTimeout(() => res.setError('Sai mã. Hãy xem lại cửa sổ Terminal. Còn 2 lần thử.'), 700);
  }
}
export async function demoChecklist() {
  const picked = await confirmChecklist({
    title: 'Dọn cache của «Tết 2026»',
    items: [
      { id: 'skeleton', label: 'Khung xương (5 file · 2 MB)', detail: 'tái tạo trong ~3 giây', checked: true },
      { id: 'prompts', label: 'Prompt đã dựng (10 file · 60 KB)', detail: 'tái tạo trong ~1 giây', checked: true },
      { id: 'kits', label: 'Kit đã cắt (96 file · 24 MB)', detail: 'cắt lại ~40 giây' },
      { id: 'rawHistory', label: 'Lịch sử ảnh AI (24 file · 72 MB)', warn: 'mất bản gen cũ, không lấy lại' },
    ],
    footnote: 'Ảnh AI đang dùng và Bản thiết kế KHÔNG BAO GIỜ bị dọn ở đây.',
    summary: 'Sẽ giải phóng ~2 MB',
  });
  if (picked) toast.success({ title: `Đã giải phóng 2 MB`, description: `Đã dọn: ${picked.join(', ') || 'không chọn gì'}` });
}
export function demoDrawer(wide = true) {
  const lines = Array.from({ length: 30 }, (_, i) =>
    el('div', { class: 'kg-t-mono', style: i === 12 ? { background: 'var(--danger-tint)' } : null },
      [el('span', { class: 'kg-fg-muted-raised', text: `12:0${i % 10}:1${i % 9} ` }),
       el('span', { style: { color: 'var(--on-tint-accent)' }, text: 'tet-main ' }),
       el('span', { text: i === 12 ? 'lỗi: không ghi được ảnh (QUOTA_SUSPECTED)' : 'dựng khung xương ✓' })]));
  openDrawer({
    title: 'Nhật ký lượt chạy r-0031', wide, blocking: false,
    body: el('div', { role: 'log', 'aria-live': 'polite', 'aria-label': 'Nhật ký lượt chạy' }, lines),
    footer: row([createButton({ label: 'Về cuối', variant: 'secondary', size: 'sm', icon: '⏬' }),
                 createButton({ label: 'Chạy lại lượt lỗi', variant: 'primary', size: 'sm' })]),
  });
}
mount('overlays', row([
  createButton({ label: 'Modal sm', variant: 'secondary', onClick: () => demoModal('sm') }),
  createButton({ label: 'Modal md', variant: 'secondary', onClick: () => demoModal('md') }),
  createButton({ label: 'Modal lg', variant: 'secondary', onClick: () => demoModal('lg') }),
  createButton({ label: 'Confirm xoá (+ toast Hoàn tác)', variant: 'secondary', icon: '🗑', onClick: demoDelete }),
  createButton({ label: 'Confirm cần mã 4 số', variant: 'secondary', onClick: demoPurge }),
  createButton({ label: 'Confirm checklist', variant: 'secondary', onClick: demoChecklist }),
  createButton({ label: 'Confirm nhẹ', variant: 'ghost', onClick: async () => {
    const ok = await confirmLight({ title: 'Dựng lại khung xương?', message: 'Tái tạo rẻ, ~3 giây.' });
    toast.info({ title: ok ? 'Đang dựng lại…' : 'Đã huỷ' });
  } }),
  createButton({ label: 'Drawer log 640px', variant: 'secondary', onClick: () => demoDrawer(true) }),
  createButton({ label: 'Drawer 480px (chặn)', variant: 'secondary', onClick: () => openDrawer({
    title: 'Lịch sử bản thiết kế',
    body: createList({ ariaLabel: 'Lịch sử', items: [
      { main: 'v37 · 12:04 hôm nay', meta: '55 KB', onClick: () => {} },
      { main: 'v36 · 11:20 hôm nay', meta: '54 KB', onClick: () => {} },
    ] }),
  }) }),
]));

/* ---------------- 10 · toasts ---------------- */
mount('toasts', row([
  createButton({ label: 'success 4s', variant: 'secondary', onClick: () => toast.success({ title: 'Đã tạo «Tết 2026»' }) }),
  createButton({ label: 'success + Hoàn tác 10s', variant: 'secondary', onClick: () => toast.success({
    title: 'Đã xoá «Candy Lite»', description: 'Giữ trong thùng rác 30 ngày.',
    undo: { onUndo: () => toast.info({ title: 'Đã phục hồi' }) },
  }) }),
  createButton({ label: 'info 5s', variant: 'secondary', onClick: () => toast.info({ title: 'Đã kết nối lại — đã làm mới danh sách' }) }),
  createButton({ label: 'warning 8s', variant: 'secondary', onClick: () => toast.warning({ title: 'Có vẻ đã chạm giới hạn tạo ảnh của tài khoản', description: 'Sinh ảnh tiêu quota gấp 3–5 lần lượt hỏi thường.', actions: [{ label: 'Giảm số lượt song song', onClick: () => {} }] }) }),
  createButton({ label: 'error (không tự đóng)', variant: 'secondary', onClick: () => toast.error({
    title: 'Project này đang chạy một lượt khác', description: 'Chờ xong hoặc dừng lượt đó.',
    actions: [{ label: 'Xem lượt đang chạy', variant: 'secondary', onClick: () => demoDrawer() }, { label: 'Dừng lượt đó', onClick: () => {} }],
  }) }),
  createButton({ label: 'xếp 5 cái (giữ tối đa 3)', variant: 'ghost', onClick: () => {
    for (let i = 1; i <= 5; i += 1) toast.info({ title: `Thông báo số ${i}` });
  } }),
]));

/* ---------------- 11 · tooltip / popover / menu ---------------- */
const tipBtn = createButton({ label: 'Hover hoặc Tab tới đây', variant: 'secondary' });
attachTooltip(tipBtn, 'Hiện sau 400ms hover, ngay khi focus');
const menuBtn = createButton({ icon: '⋯', iconOnly: true, variant: 'secondary', ariaLabel: 'Menu ngữ cảnh demo', tooltip: 'Shift+F10 cũng mở được' });
attachMenu(menuBtn, () => [
  { label: 'Mục thường', icon: '→', onSelect: () => toast.info({ title: 'Đã chọn mục thường' }) },
  { label: 'Mục có phím tắt', icon: '✎', hint: '⌘D', onSelect: () => {} },
  { label: 'Mục disabled (không ẩn)', icon: '⬇', disabled: true, disabledReason: 'Cần công cụ local đang chạy' },
  'separator',
  { label: 'Mục phá huỷ', icon: '🗑', danger: true, onSelect: demoDelete },
]);
mount('tips', row([
  tipBtn, menuBtn,
  createInfoPopover({ label: 'Sheet', content: 'Một ảnh AI chứa nhiều element xếp theo lưới. Nội dung dài thì dùng Popover chứ không dùng tooltip (§5.5).', ariaLabel: 'Sheet là gì?' }),
  el('span', { class: 'kg-row kg-row--tight' }, [el('span', { class: 'kg-t-body', text: 'Phong cách' }), createInfoPopover({ label: 'Phong cách', content: 'Cùng bộ element, khác art style / màu brand / nhân vật.' })]),
]));

/* ---------------- 12 · empty / error / banner ---------------- */
mount('empties', [
  label('EmptyState đầy đủ (S1, 0 project)'),
  createEmptyState({
    icon: '▤', title: 'Chưa có project nào',
    description: 'Một project = một bộ kit cho một campaign.',
    primary: createButton({ label: '＋ Tạo project đầu tiên', variant: 'primary', size: 'lg' }),
    secondary: createButton({ label: 'Nhập từ styles.json cũ', variant: 'secondary', size: 'lg' }),
    steps: ['Chọn element', 'Sinh ảnh', 'Tải kit'],
  }),
  label('EmptyState inline (trong khung tab — không phá DOM cha, đóng D10)'),
  createEmptyState({ inline: true, icon: '✂', title: 'Chưa cắt sheet này', description: 'Có ảnh mới nhưng chưa cắt.', primary: createButton({ label: 'Cắt sheet này', variant: 'primary', size: 'sm' }) }),
  label('ErrorState + panel "Chi tiết cho lập trình viên" (gập lại, §1.1-5)'),
  createErrorState({
    title: 'Không đọc được project',
    description: 'File project.json có lỗi ở dòng 12.',
    actions: [createButton({ label: 'Mở thư mục', variant: 'primary' }), createButton({ label: 'Phục hồi từ lịch sử', variant: 'secondary' })],
    devDetails: 'PROJECT_BROKEN: Unexpected token } in JSON at position 431\n  at JSON.parse (<anonymous>)\n  file: projects/candy-old-11b2/project.json:12',
  }),
  label('Banner 4 loại (§5.5) — icon + 1 dòng + ≤2 nút'),
  createBanner({ kind: 'warning', title: 'Chưa thấy công cụ local — đây là dữ liệu bạn thấy lần cuối (12:04 hôm nay). Không sửa được.', actions: [createButton({ label: 'Copy lệnh', variant: 'secondary', size: 'sm' }), createButton({ label: 'Thử lại', variant: 'ghost', size: 'sm' })] }),
  createBanner({ kind: 'error', title: 'Trình duyệt đang chặn kết nối tới máy bạn', actions: [createButton({ label: 'Mở bản chạy tại máy', variant: 'primary', size: 'sm' }), createButton({ label: 'Vì sao?', variant: 'ghost', size: 'sm' })] }),
  createBanner({ kind: 'success', title: 'Đã kết nối lại — đã làm mới danh sách', live: true }),
  createBanner({ kind: 'info', title: '16/16 ô — thêm element nữa sẽ tạo sheet mới «main3»', onDismiss: () => toast.info({ title: 'Đã ẩn' }) }),
]);

/* ---------------- 13 · loaders ---------------- */
mount('loaders', [
  label('Spinner 3 cỡ + spinner có chữ'),
  row([createSpinner({ size: 'sm', label: 'Đang tải' }), createSpinner({ size: 'md', label: 'Đang tải' }), createSpinner({ size: 'lg', label: 'Đang tải' }),
       createSpinnerRow({ label: 'Đang chờ công cụ local…' })]),
  label('Đường progress 2px ở đỉnh (đã có cache, đang làm mới)'),
  createTopProgress(),
  label('Skeleton các biến thể'),
  el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-2)', width: '320px' } }, [
    createSkeleton({ variant: 'title', width: '70%' }),
    createSkeleton({ variant: 'text', count: 3 }),
    createSkeleton({ variant: 'block' }),
  ]),
  label('Skeleton grid — số lượng KHỚP số phần tử dự kiến (6 thẻ, §5.6)'),
  createSkeletonGrid({ expected: 3 }),
]);

/* ---------------- 14 · layout + matrix ---------------- */
const VARIANTS = ['Tết đỏ', 'Vàng kim'];
const SHEETS = ['main', 'main2', 'tall', 'bg-home', 'pose-lan'];
const STATES = [['ok', 'ok', 'stale', 'running', 'ok'], ['ok', 'uncut', 'never', 'never', 'failed']];
const matrix = el('div', { role: 'grid', 'aria-label': 'Tiến độ theo sheet và phong cách', style: { display: 'grid', gridTemplateColumns: `120px repeat(${SHEETS.length}, minmax(96px, 1fr))`, gap: 'var(--s-1)' } });
matrix.appendChild(el('div', { role: 'columnheader', class: 'kg-t-caption kg-fg-default', text: '' }));
for (const s of SHEETS) matrix.appendChild(el('div', { role: 'columnheader', class: 'kg-t-caption kg-fg-default', text: s }));
VARIANTS.forEach((v, vi) => {
  matrix.appendChild(el('div', { role: 'rowheader', class: 'kg-t-label kg-truncate', text: v }));
  SHEETS.forEach((s, si) => {
    matrix.appendChild(el('div', { role: 'gridcell' }, [createMatrixCell({
      state: STATES[vi][si], variantLabel: v, sheetLabel: s,
      selected: vi === 1 && si === 4,
      onClick: () => toast.info({ title: `Mở ${v} · ${s}` }),
    })]));
  });
});
mount('layout', [
  label('Header 40px + rail 168px (thu 48px < 1100px, thành drawer < 1100px) — thu nhỏ cửa sổ để kiểm 3 mốc'),
  (() => {
    const app = el('div', { class: 'kg-app', style: { minHeight: '260px', border: '1px solid var(--line-subtle)', borderRadius: 'var(--r-3)', overflow: 'hidden' } });
    const header = el('div', { class: 'kg-header' }, [
      el('span', { class: 'kg-header__logo' }, [icon('▣'), el('span', { text: 'kit-gen' })]),
      el('nav', { class: 'kg-header__crumbs', 'aria-label': 'Breadcrumb' }, [el('span', { text: 'Projects' }), icon('▸'), el('span', { class: 'kg-truncate', text: 'Tết 2026 — VietinBank iPay' })]),
      el('div', { class: 'kg-header__search' }, [createInput({ label: 'Tìm project', placeholder: 'Tìm project… ⌘K', size: 'sm' }).el]),
      el('div', { class: 'kg-header__right' }, [
        el('button', { class: 'kg-pill kg-pill--muted', type: 'button' }, [icon('▤'), el('span', { text: '~/KitGen' }), icon('▾')]),
        createAgentPill('connected', { onClick: () => toast.info({ title: 'Sheet trạng thái công cụ local' }) }),
      ]),
    ]);
    // nhãn của ô tìm trong header là ẩn về mặt thị giác
    header.querySelector('.kg-field__label').classList.add('kg-sr-only');
    const railItems = [['◧', 'Tổng quan', null], ['✎', 'Thiết kế', 'dot'], ['⚡', 'Sinh ảnh', '2'], ['▦', 'Thư viện', null], ['⚙', 'Cài đặt', null]];
    const rail = el('nav', { class: 'kg-rail', 'aria-label': 'Điều hướng trong project' }, railItems.map(([ic, txt, extra], i) =>
      el('button', { type: 'button', class: 'kg-rail__item', 'aria-current': i === 1 ? 'page' : null }, [
        icon(ic), el('span', { class: 'kg-rail__label', text: txt }),
        extra === 'dot' ? el('span', { class: 'kg-rail__dot', role: 'img', 'aria-label': 'có thay đổi chưa lưu' }) : null,
        extra && extra !== 'dot' ? el('span', { class: 'kg-rail__count' }, [createBadge({ state: 'running', text: extra, iconGlyph: '⏳' })]) : null,
      ])));
    append(app, [header, el('div', { class: 'kg-banner-slot' }, [createBanner({ kind: 'info', title: 'Đây là khung thật của app: header sticky + rail + vùng nội dung.' })]),
      el('div', { class: 'kg-body' }, [rail, el('div', { class: 'kg-main' }, [el('p', { class: 'kg-t-body', text: 'Vùng nội dung màn (kg-main).' })])])]);
    return app;
  })(),
  label('Ma trận tiến độ (S2) — mỗi ô là <button> có aria-label đủ nghĩa'),
  matrix,
]);

console.info('[preview-ui] dựng xong toàn bộ primitive — không có lỗi khi khởi tạo.');
