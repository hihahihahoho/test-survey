/**
 * preview-demo.js — script cho web/preview-ui.html.
 * KHÔNG phải phần của design system: chỉ dựng trang xem thử mọi primitive ở
 * mọi trạng thái, để QA và các team sau soi bằng mắt (yêu cầu mục 5 của brief).
 * Tách làm nhiều file cho dưới 400 dòng/file:
 *   preview-demo.js     — mục 1–8 (token, chữ, nút, badge, field, card, table, tabs)
 *   preview-demo2.js    — mục 9–14 (overlay, toast, tooltip, empty, loader, layout)
 *   preview-helpers.js  — mount/label/row
 */
import {
  el, append, icon, uid,
  createButton, setLoading, setDisabled,
  createInput, createSelect, createTextarea, createCheckbox, createSegmented, createCodeBlock,
  createBadge, createJobBadge, createRunBadge, createAgentPill, createTag, createStatusDot,
  createMatrixCell, worstJobState, JOB_STATES, RUN_STATES, AGENT_STATES,
  createCard, createSection, createThumb,
  createTable, createList, createTabs,
  openModal, createModalFooter, confirmDestructive, confirmLight, confirmChecklist,
  openDrawer, attachTooltip, createInfoPopover, attachMenu,
  createEmptyState, createErrorState, createBanner, createDevDetails,
  createSpinner, createSpinnerRow, createSkeleton, createSkeletonCard, createSkeletonGrid, createTopProgress,
  toast,
} from './index.js';

import { mount, label, row } from './preview-helpers.js';
import { demoDelete, demoChecklist, demoDrawer } from './preview-demo2.js';

/* ---------------- theme switch ---------------- */
mount('theme-switch', createSegmented({
  label: 'Chọn theme',
  items: [{ value: 'dark', label: 'Dark (mặc định)' }, { value: 'light', label: 'Light (khung sẵn)' }],
  value: 'dark',
  onChange: (v) => document.documentElement.setAttribute('data-theme', v),
}).el);

/* ---------------- 1 · swatches ---------------- */
const SWATCHES = [
  ['--bg-canvas', 'nền app'], ['--bg-surface', 'thẻ, panel'], ['--bg-raised', 'input, modal'],
  ['--bg-overlay', 'menu, tooltip'], ['--fg-strong', '15.29:1'], ['--fg-default', '7.22:1'],
  ['--fg-muted', '4.52:1 (chỉ trên surface)'], ['--fg-muted-raised', '6.98:1 (trên raised/overlay)'],
  ['--line-subtle', 'chia khối'], ['--line-default', '3.94:1'], ['--line-strong', '5.93:1'],
  ['--accent', '5.65:1'], ['--focus-ring', '8.24:1'], ['--ok', '10.97:1'], ['--warn', '11.27:1'],
  ['--danger', '8.95:1'], ['--danger-solid', 'chữ trắng 6.53:1'], ['--running', '6.73:1'],
];
mount('swatches', SWATCHES.map(([tok, note]) => el('div', { class: 'demo-chip' }, [
  el('i', { style: { background: `var(${tok})` } }),
  el('span', {}, [el('code', { text: tok }), el('br'), el('span', { class: 'kg-fg-default', text: note })]),
])));

/* ---------------- 2 · type scale ---------------- */
mount('type-scale', [
  ['--t-display', 'display 24/32 · tiêu đề màn'], ['--t-title', 'title 18/26 · tiêu đề modal'],
  ['--t-subtitle', 'subtitle 15/22 · tên project trên thẻ'], ['--t-body', 'body 14/21 · chữ chính'],
  ['--t-label', 'label 13/18 · nhãn, nút sm'], ['--t-caption', 'caption 12/16 · SÀN, số liệu thứ cấp'],
  ['--t-mono', 'mono 13/20 · log, đường dẫn, id'],
].map(([tok, txt]) => el('div', { style: { font: `var(${tok})` }, text: txt })));

/* ---------------- 3 · buttons ---------------- */
const variants = ['primary', 'secondary', 'ghost', 'danger', 'link'];
mount('buttons', [
  label('5 biến thể × 3 cỡ'),
  ...['sm', 'md', 'lg'].map((size) => row(variants.map((v) =>
    createButton({ label: `${v} ${size}`, variant: v, size, icon: v === 'primary' ? '⚡' : null })))),
  label('trạng thái: default · hover (trỏ chuột) · focus (Tab) · disabled · loading · icon-only'),
  row([
    createButton({ label: 'Bình thường', variant: 'primary' }),
    createButton({ label: 'Disabled có lý do', variant: 'primary', disabled: true, tooltip: 'Cần công cụ local đang chạy' }),
    createButton({ label: 'Đang lưu…', variant: 'primary', loading: true }),
    createButton({ label: 'Secondary disabled', variant: 'secondary', disabled: true }),
    createButton({ icon: '⋯', iconOnly: true, variant: 'ghost', ariaLabel: 'Thao tác khác', tooltip: 'Thao tác khác' }),
    createButton({ label: 'Bấm để loading 1.5s', variant: 'secondary', onClick: (e) => {
      const b = e.currentTarget; setLoading(b, true); setTimeout(() => setLoading(b, false), 1500);
    } }),
  ]),
  el('p', { class: 'demo-note', text: 'Mỗi màn tối đa 1 primary và tối đa 1 danger (§5.4). Nút danger chỉ dùng trong modal xác nhận.' }),
]);

/* ---------------- 4 · badges ---------------- */
function badgeSets() {
  return [
    label('7 trạng thái JOB (§5.7) — icon + chữ, không bao giờ chỉ màu'),
    row(Object.keys(JOB_STATES).map((s) => createJobBadge(s))),
    label('5 trạng thái LƯỢT CHẠY — done-with-errors KHÔNG dùng ✓, không nói "xong" trơn'),
    row([
      createRunBadge('running', { done: 3, total: 8 }),
      createRunBadge('done', { done: 8, total: 8 }),
      createRunBadge('done-with-errors', { done: 5, total: 8, failed: 3 }),
      createRunBadge('cancelled', { done: 3, total: 8 }),
      createRunBadge('env-failed'),
    ]),
    label('6 trạng thái AGENT PILL (§2.4) — luôn có chữ'),
    row(Object.keys(AGENT_STATES).map((s) => createAgentPill(s, { onClick: () => toast.info({ title: `Mở sheet trạng thái: ${AGENT_STATES[s].text}` }) }))),
    label('gộp nhiều job vào 1 badge = lấy trạng thái xấu nhất'),
    row([
      el('code', { class: 'kg-t-mono', text: "worstJobState(['ok','stale','failed']) → " }),
      createJobBadge(worstJobState(['ok', 'stale', 'failed'])),
      el('code', { class: 'kg-t-mono', text: "['ok','uncut'] → " }),
      createJobBadge(worstJobState(['ok', 'uncut'])),
    ]),
    label('tag · StatusDot · badge có số'),
    row([
      createTag('tet', { onRemove: (t) => toast.info({ title: `Đã bỏ tag ${t}` }) }),
      createTag('banking', { onRemove: () => {} }),
      createStatusDot('ok', 'Đã kết nối'),
      createStatusDot('running', 'Đang sinh ảnh (pulse)'),
      createStatusDot('muted', 'Chưa bắt đầu'),
      createJobBadge('failed', { count: 3 }),
      createBadge({ state: 'info', text: 'chế độ poll', iconGlyph: 'ⓘ' }),
      createBadge({ state: 'neutral', text: 'cache', iconGlyph: '▤' }),
    ]),
  ];
}
mount('badges', badgeSets());
mount('badges-overlay', [
  row(Object.keys(JOB_STATES).map((s) => createJobBadge(s))),
  row([createBadge({ state: 'info', text: 'accent trên overlay', iconGlyph: 'ⓘ' }),
       createBadge({ state: 'running', text: 'running trên overlay', iconGlyph: '⏳' })]),
]);

/* ---------------- 5 · fields ---------------- */
const nameField = createInput({ label: 'Tên project', value: 'Tết 2026 — VietinBank iPay', hint: 'Tên hiển thị, có dấu và khoảng trắng đều được.' });
const slugField = createInput({ label: 'Tên file khi xuất (slug)', value: 'tet26 vietinbank', mono: true, error: 'Chỉ chữ thường, số, gạch nối. Gợi ý: tet26-vietinbank' });
const specField = createTextarea({ label: 'Mô tả cho AI', rows: 3, value: 'glossy 3D candy-red capsule button, soft studio light', hint: 'Sửa được — bản copy trong project này (§0.2-X8).' });
const bgSelect = createSelect({ label: 'Màu nền tách', value: 'magenta', options: [{ value: 'magenta', label: 'Magenta #FF00FF' }, { value: 'green', label: 'Green #00FF00' }] });
const disabledField = createInput({ label: 'Thư mục trên máy (không đổi được)', value: '~/KitGen/projects/tet26-vietinbank-a7f3', mono: true, disabled: true });
mount('fields', [
  label('input · select · textarea — có nhãn thật, trạng thái lỗi, disabled'),
  el('div', { class: 'demo-grid3' }, [nameField.el, slugField.el, bgSelect.el, disabledField.el]),
  specField.el,
  row([
    createButton({ label: 'Bật lỗi trên "Tên project"', variant: 'secondary', size: 'sm', onClick: () => nameField.setError('Đã có project tên này.') }),
    createButton({ label: 'Xoá lỗi', variant: 'ghost', size: 'sm', onClick: () => { nameField.setError(null); slugField.setError(null); } }),
  ]),
  label('checkbox / radio — <label> bọc control thật (đóng audit I4)'),
  row([
    createCheckbox({ label: 'Tự động cắt sau khi sinh xong', checked: true, sublabel: 'prefs.autoSliceAfterGen' }).el,
    createCheckbox({ label: 'Kit đã cắt (96 file · 24 MB)', sublabel: 'cắt lại ~40 giây' }).el,
    createCheckbox({ label: 'Không bấm được', disabled: true }).el,
  ]),
  label('SegmentedControl — có dòng ⓘ khi nhánh không chọn vẫn có dữ liệu (đóng C3)'),
  createSegmented({
    label: 'Nguồn art style',
    items: [{ value: 'text', label: 'Gõ mô tả' }, { value: 'ref', label: 'Dùng ảnh tham khảo' }],
    value: 'text',
    note: '2 ảnh brand bạn đã tải đang KHÔNG được dùng (vì đang chọn "Gõ mô tả").',
  }).el,
  label('CodeBlock — nút Copy, tabindex=0, ⌘C khi focus'),
  createCodeBlock({ code: 'shasum -a 256 ~/Downloads/kit-gen-setup.sh\nbash ~/Downloads/kit-gen-setup.sh', ariaLabel: 'Lệnh cài công cụ local' }).el,
]);

/* ---------------- 6 · cards ---------------- */
function fakeThumb(txt) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="%231A1F2A"/><text x="160" y="105" font-size="16" fill="%239AA4B8" text-anchor="middle">${txt}</text></svg>`;
  return el('img', { src: `data:image/svg+xml;utf8,${svg}`, alt: '' });
}
const cardMenuBtn = createButton({ icon: '⋯', iconOnly: true, variant: 'ghost', size: 'sm', ariaLabel: 'Thao tác với Tết 2026', tooltip: 'Thao tác khác' });
attachMenu(cardMenuBtn, () => [
  { label: 'Mở', icon: '→', onSelect: () => toast.info({ title: 'Mở project' }) },
  { label: 'Đổi tên…', icon: '✎', hint: 'F2', onSelect: () => toast.info({ title: 'Đổi tên' }) },
  { label: 'Nhân bản…', icon: '⧉', hint: '⌘D', onSelect: () => toast.info({ title: 'Nhân bản' }) },
  { label: 'Xuất .zip', icon: '⬇', onSelect: () => toast.info({ title: 'Xuất zip' }) },
  { label: 'Mở thư mục trên máy', icon: '▤', onSelect: () => {} },
  { label: 'Dọn cache dẫn xuất…', icon: '⌫', onSelect: () => demoChecklist() },
  'separator',
  { label: 'Xoá…', icon: '🗑', danger: true, onSelect: () => demoDelete() },
]);
mount('cards', [
  createCard({
    title: 'Tết 2026 — VietinBank iPay',
    media: fakeThumb('ảnh bìa 16:10'),
    badges: [createRunBadge('running', { done: 2, total: 8 })],
    rows: ['2 phong cách · 5 sheet', '42 element · 96 file đã cắt', row([createJobBadge('stale'), createButton({ label: 'Sinh 3 sheet', variant: 'ghost', size: 'sm', icon: '⚡' })])],
    tags: [createTag('tet'), createTag('banking')],
    footLeft: 'sửa 4 phút trước', footRight: '176 MB',
    actions: row([createButton({ label: 'Mở', variant: 'secondary', size: 'sm' }), cardMenuBtn]),
    onOpen: () => toast.info({ title: 'Bấm cả thẻ = Mở' }),
    ariaLabel: 'Project Tết 2026 — VietinBank iPay',
  }),
  createCard({
    title: 'Mid-Autumn 2026', media: fakeThumb('▨ chưa có ảnh'),
    rows: ['1 phong cách · 0 sheet', row([createJobBadge('never')])],
    footLeft: 'tạo hôm nay', footRight: '0 MB',
    actions: createButton({ label: 'Mở', variant: 'secondary', size: 'sm' }),
  }),
  createCard({
    title: 'candy-old-11b2', variant: 'error',
    rows: [row([createBadge({ state: 'failed', text: 'project.json lỗi', iconGlyph: '⛔' })]), 'Dòng 12: dấu , thừa'],
    actions: row([createButton({ label: 'Mở thư mục', variant: 'secondary', size: 'sm' }), createButton({ label: 'Chi tiết', variant: 'ghost', size: 'sm' })]),
    ariaLabel: 'Project lỗi candy-old-11b2',
  }),
  createCard({
    title: 'Candy Lite (dữ liệu cache)', variant: 'cache', cacheLabel: true,
    rows: ['1 phong cách · 3 sheet', '24 element · 24 file'],
    footLeft: 'sửa hôm qua', footRight: '42 MB',
    actions: createButton({ label: 'Mở', variant: 'secondary', size: 'sm', disabled: true, tooltip: 'Cần công cụ local đang chạy' }),
  }),
  createSection({
    title: 'Việc tiếp theo', children: [
      row([createJobBadge('stale'), el('span', { class: 'kg-t-body', text: '3 sheet đã sửa thiết kế sau lần sinh ảnh cuối' }), createButton({ label: 'Sinh 3 sheet này', variant: 'primary', size: 'sm', icon: '⚡' })]),
      row([createJobBadge('uncut'), el('span', { class: 'kg-t-body', text: '2 sheet có ảnh mới nhưng chưa cắt' }), createButton({ label: 'Cắt 2 sheet', variant: 'secondary', size: 'sm', icon: '✂' })]),
    ],
  }),
  el('div', { class: 'kg-card', style: { padding: 'var(--s-4)' } }, [
    el('div', { class: 'kg-section__title', text: 'Thumb — nền checkerboard, alt bắt buộc' }),
    el('div', { class: 'kg-grid--thumbs', style: { display: 'grid', gap: 'var(--s-3)' } }, [
      createThumb({ src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><circle cx="40" cy="40" r="28" fill="%23FF9AA0"/></svg>', alt: 'Nút đỏ (CTA)', onClick: () => toast.info({ title: 'Mở lightbox' }) }),
      createThumb({ src: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect x="12" y="26" width="56" height="28" rx="14" fill="%235CE0AE"/></svg>', alt: 'Nút pill xanh' }),
    ]),
  ]),
]);

/* ---------------- 7 · table & list ---------------- */
const runsTable = createTable({
  caption: 'Danh sách project (chế độ list)',
  selectable: true,
  sort: { key: 'updated', dir: 'desc' },
  onSort: (s) => toast.info({ title: `Sắp xếp: ${s.key} ${s.dir}` }),
  columns: [
    { key: 'name', label: 'Project', sortable: true },
    { key: 'variants', label: 'Phong cách', align: 'right' },
    { key: 'sheets', label: 'Sheet', align: 'right' },
    { key: 'state', label: 'Trạng thái', render: (r) => r.state },
    { key: 'updated', label: 'Sửa', sortable: true },
    { key: 'size', label: 'Dung lượng', align: 'right', sortable: true },
  ],
  rows: [
    { __label: 'Tết 2026', name: 'Tết 2026 — VietinBank iPay', variants: 2, sheets: 5, state: createRunBadge('running', { done: 2, total: 8 }), updated: '4 phút', size: '176 MB' },
    { __label: 'Candy Lite', name: 'Candy Lite', variants: 1, sheets: 3, state: createJobBadge('uncut', { count: 3 }), updated: 'hôm qua', size: '42 MB' },
    { __label: 'Mid-Autumn', name: 'Mid-Autumn 2026', variants: 1, sheets: 0, state: createJobBadge('never'), updated: 'hôm nay', size: '0 MB' },
  ],
  onSelectionChange: (sel) => { selInfo.textContent = sel.length ? `${sel.length} project đã chọn` : 'chưa chọn gì'; },
});
const selInfo = el('span', { class: 'demo-note', text: 'chưa chọn gì' });
mount('tables', [
  label('Table — th có scope + aria-sort, checkbox có nhãn thật'),
  runsTable.el, selInfo,
  label('List — mỗi dòng là <button>, có aria-current'),
  createList({
    ariaLabel: 'Lượt chạy gần đây',
    items: [
      { badge: createRunBadge('running', { done: 2, total: 8 }), main: 'r-0031', sub: '2 phút trước', meta: 'đang chạy', current: true, onClick: () => demoDrawer() },
      { badge: createRunBadge('done', { done: 8, total: 8 }), main: 'r-0030', sub: 'hôm qua 18:04', meta: '4m12s', onClick: () => demoDrawer() },
      { badge: createRunBadge('done-with-errors', { done: 5, total: 8, failed: 3 }), main: 'r-0029', sub: 'hôm qua 17:31', meta: '3 lỗi', onClick: () => demoDrawer() },
    ],
  }),
]);

/* ---------------- 8 · tabs ---------------- */
const tabs = createTabs({
  ariaLabel: 'Bản thiết kế',
  tabs: [
    { id: 'sheets', label: 'Sheet & element', icon: '▦', panel: el('p', { class: 'kg-t-body', text: 'Panel 1 — vùng cây + lưới ô + thuộc tính (S3).' }) },
    { id: 'styles', label: 'Phong cách', icon: '●', badge: createBadge({ state: 'neutral', text: '2', iconGlyph: '·' }), panel: el('p', { class: 'kg-t-body', text: 'Panel 2 — variant, brand, nhân vật (S3.5).' }) },
    { id: 'advanced', label: 'Nâng cao', icon: '⚙', panel: el('p', { class: 'kg-t-body', text: 'Panel 3 — tham số cắt, màu nền tách (S3.6).' }) },
    { id: 'off', label: 'Tab disabled', disabled: true, panel: el('p', { text: 'không tới được' }) },
  ],
  onChange: (id) => { tabInfo.textContent = `onChange → ${id}`; },
});
const tabInfo = el('span', { class: 'demo-note', text: 'onChange → sheets' });
mount('tabs', [tabs.el, tabInfo]);
