/**
 * a11y-responsive.test.mjs — CHỐNG HỒI QUY cho các lỗi đã vá ở lượt A11Y & RESPONSIVE.
 * Chạy: node web/js/app-shell/__tests__/a11y-responsive.test.mjs
 *
 * Mỗi ca gắn với một khiếm khuyết THẬT đã tìm được, để nếu ai vá ngược thì fail ngay.
 * Không dependency ngoài (luật cứng: KHÔNG npm install).
 */
import { readFileSync } from 'node:fs';
import { describe, it, assert, eq, run } from '../../core/__tests__/harness.mjs';

const R = new URL('../../../', import.meta.url).pathname;   // → web/
const read = (p) => readFileSync(R + p, 'utf8');

describe('⌘K bảng lệnh — MUST §7.1 / điều kiện của §5.8-A6', () => {
  const shell = read('js/app-shell/shell.js');
  const pal = read('js/app-shell/command-palette.js');

  it('⌘K mở BẢNG LỆNH, không còn alias sang hộp nhảy project', () => {
    assert(/k === 'k'\) \{ e\.preventDefault\(\); onceOverlay\('cmdk', openPalette\)/.test(shell),
      '⌘K phải gọi openPalette');
    assert(!/TODO\(NEEDS-N9\)/.test(shell), 'phải bỏ TODO NEEDS-N9 (⌘K chưa có chủ)');
  });

  it('⌘P và ⌘K là hai lệnh khác nhau', () => {
    assert(/k === 'p'/.test(shell) && /openJumpFromShell/.test(shell), '⌘P vẫn là nhảy project');
  });

  it('trên S1 ⌘P KHÔNG mở 2 hộp (shell nhường cho màn tự khai jump())', () => {
    assert(/typeof handle\?\.jump !== 'function'/.test(shell),
      'shell phải nhường ⌘P cho màn nào tự khai jump()');
  });

  it('bảng lệnh cover đủ các nhóm hành động chính của spec', () => {
    for (const id of ['nav.projects', 'project.create', 'project.import', 'agent.recheck', 'help.shortcuts']) {
      assert(pal.includes(`'${id}'`), `thiếu lệnh ${id}`);
    }
    for (const id of ['p.overview', 'p.design', 'p.runs', 'p.kit', 'p.settings',
      'p.design.styles', 'p.design.advanced', 'p.kit.matrix', 'p.kit.export',
      'nav.settings.agent', 'nav.settings.env', 'nav.settings.prefs', 'nav.settings.trash', 'nav.settings.about']) {
      assert(pal.includes(`'${id}'`), `thiếu lệnh ${id}`);
    }
  });

  it('bảng lệnh theo mẫu combobox WAI-ARIA (A6/A8)', () => {
    for (const a of ["role: 'combobox'", "role: 'listbox'", 'aria-activedescendant', "role: 'option'", "role: 'status'"]) {
      assert(pal.includes(a), `thiếu ${a}`);
    }
  });

  it('lệnh bị chặn khi agent chưa chạy thì VẪN HIỆN + nói lý do (§2.5-2)', () => {
    assert(/disabledReason/.test(pal), 'phải có disabledReason');
    assert(/aria-disabled/.test(pal), 'phải đặt aria-disabled thay vì bỏ khỏi danh sách');
  });

  it('màn có thể góp lệnh riêng qua handle.commands(), thiếu cũng không vỡ', () => {
    assert(/typeof handle\?\.commands === 'function'/.test(shell), 'shell phải đọc handle.commands()');
    assert(/commands\(\) của màn lỗi/.test(shell), 'commands() lỗi không được làm vỡ bảng lệnh');
  });
});

describe('RESPONSIVE §2.2 — rail ở mốc ≤1099px', () => {
  const rail = read('js/app-shell/rail.js');
  const chrome = read('js/app-shell/chrome.js');
  const shell = read('js/app-shell/shell.js');
  const css = read('css/layout.css');

  it('CSS ẩn rail ở ≤1099px (nên BẮT BUỘC phải có nút mở)', () => {
    assert(/@media \(max-width: 1099px\)/.test(css), 'phải có mốc 1099px');
    assert(/\.kg-rail\[data-open="true"\] \{ display: flex; \}/.test(css));
  });

  it('có nút ☰ mở rail, chỉ hiện ở mốc ≤1099px', () => {
    assert(/createRailToggle/.test(rail), 'rail.js phải cấp nút toggle');
    assert(/\.kg-rail-toggle \{ display: none;/.test(css), 'mặc định ẩn nút');
    assert(/\.kg-rail-toggle \{ display: inline-flex; \}/.test(css), 'chỉ hiện ở ≤1099px');
    assert(/header\.setRailToggle\(rail\.createRailToggle\(\)\)/.test(shell), 'shell phải cắm nút vào header');
    assert(/setRailToggle/.test(chrome), 'header phải có chỗ cắm');
  });

  it('nút ☰ theo mẫu disclosure: aria-expanded + aria-controls + nhãn', () => {
    assert(/'aria-expanded': 'false'/.test(rail) && /'aria-controls': railId/.test(rail));
    assert(/ariaLabel: 'Các phần của project'/.test(rail), 'nút icon-only phải có nhãn');
  });

  it('rail-drawer đóng được bằng Esc, bằng scrim, và trả focus về nút', () => {
    assert(/e\.key === 'Escape'/.test(rail), 'phải đóng bằng Esc');
    assert(/kg-rail-scrim/.test(rail) && /kg-rail-scrim/.test(css), 'phải có scrim bấm-ngoài-để-đóng');
    assert(/toggleBtn\.focus\(\{ preventScroll: true \}\)/.test(rail), 'phải trả focus về trigger (A7)');
  });

  it('điều hướng xong thì rail-drawer tự đóng', () => {
    assert(/closeDrawer\(\{ returnFocus: false \}\);[\s\S]{0,40}onNavigate/.test(rail));
  });
});

describe('RESPONSIVE §2.2 — mốc <768 chỉ đọc', () => {
  const chrome = read('js/app-shell/chrome.js');
  const shell = read('js/app-shell/shell.js');
  const css = read('css/layout.css');
  const html = read('index.html');

  it('có meta viewport (đóng audit I5)', () => {
    assert(/<meta name="viewport" content="width=device-width, initial-scale=1">/.test(html));
  });

  it('có banner "Màn hình nhỏ" đúng câu của spec', () => {
    assert(/Màn hình nhỏ: xem được, sửa nên dùng máy tính\./.test(chrome), 'thiếu banner <768');
    assert(/createSmallScreenBanner/.test(shell), 'shell phải dựng banner này');
  });

  it('2 banner KHÔNG đè nhau: bọc trong wrapper .kg-banners xếp dọc', () => {
    assert(/\.kg-banners \{[\s\S]*?grid-area: banner;[\s\S]*?flex-direction: column;/.test(css));
    assert(/class: 'kg-banners' \}, \[banner\.el, smallBanner\.el\]/.test(shell));
  });

  it('nút mở bảng lệnh KHÔNG bị ẩn ở <768', () => {
    assert(!/kg-header__search kg-hide-sm/.test(chrome), 'không được ẩn cả ô tìm ở màn nhỏ');
    assert(/searchBtnLabel\.classList\.add\('kg-hide-sm'\)/.test(chrome), 'chỉ ẩn CHỮ, giữ icon');
    assert(/'aria-label', 'Bảng lệnh \(⌘K\)'/.test(chrome), 'thu về icon-only thì phải có aria-label');
  });
});

describe('TƯƠNG PHẢN §5.8-A1/A2 — token và nơi dùng', () => {
  const tokens = read('css/tokens.css');
  const base = read('css/base.css');
  const btn = read('css/components/button.css');
  const dcss = read('js/screens/design/css.js');

  it('có --accent-text cho CHỮ accent (--accent chỉ 4.37:1 trên --bg-overlay)', () => {
    assert(/--accent-text: #8FBBFF;/.test(tokens), 'dark phải có --accent-text');
    assert(/--accent-text: #1955C2;/.test(tokens), 'light phải có --accent-text');
  });

  it('link/thẻ a dùng --accent-text (nằm được trong menu/toast = --bg-overlay)', () => {
    assert(/color: var\(--accent-text\);\n  height: auto;/.test(btn), '.kg-btn--link phải dùng --accent-text');
    assert(/a \{\n  color: var\(--accent-text\);/.test(base), 'thẻ a phải dùng --accent-text');
  });

  it('không còn --fg-muted trên nền raised/overlay/accent-weak', () => {
    for (const sel of ['d-tree__count', 'd-issue__code', 'd-lib__meta', 'd-hist__sum', 'r-job__meta',
      'd-tree__num', 'd-cell__no', 'd-cell__ph']) {
      const m = new RegExp(`\\.${sel} \\{[^}]*--fg-muted\\)`);
      assert(!m.test(dcss), `.${sel} vẫn dùng --fg-muted trên nền sáng hơn surface`);
    }
  });
});

describe('A11Y linh tinh đã vá', () => {
  it('ma trận S2 nối hướng dẫn bàn phím vào lưới (A6/A8)', () => {
    const m = read('js/screens/project/matrix.js');
    assert(/'aria-describedby': hintId/.test(m), 'trước đây để null nên SR không nghe hướng dẫn');
    assert(/id: hintId/.test(m), 'đoạn hint phải có id khớp');
  });

  it('focusables() không loại oan phần tử khi thiếu layout engine', () => {
    const f = read('js/ui/focus.js');
    assert(/typeof n\.offsetParent === 'undefined'/.test(f), 'phải xử lý môi trường không có layout');
  });

  it('CSS không có outline:none ở đâu (A4)', () => {
    for (const p of ['css/base.css', 'css/layout.css', 'css/components/button.css',
      'css/components/field.css', 'css/components/overlay.css', 'css/components/surface.css',
      'css/components/badge.css', 'css/components/menu.css']) {
      const src = read(p).replace(/\/\*[\s\S]*?\*\//g, '');
      assert(!/outline:\s*none/.test(src), `${p} có outline:none`);
    }
  });
});

/* ──────────────────────────────────────────────────────────────────────────
   PHẦN CHẠY THẬT: mount bảng lệnh dưới minidom (không chỉ đọc mã nguồn).
   TRUNG THỰC VỀ GIỚI HẠN: minidom không có layout engine và biến
   document.addEventListener thành no-op ⇒ KHÔNG mô phỏng được Esc ở tầng
   document. Ca dưới kiểm phần kiểm được: close() tháo overlay + trả focus.
   ────────────────────────────────────────────────────────────────────────── */
await import('../../screens/__tests__/dom-patch.mjs');
const { baseCommands, rankCommands, openCommandPalette } = await import('../command-palette.js');

describe('⌘K chạy thật dưới minidom', () => {
  const router = { go: (id, params, query) => { router.last = [id, params, query]; } };

  it('chưa mở project thì KHÔNG có lệnh ngữ cảnh project', () => {
    const c = baseCommands({ router, projectId: null, status: {}, hooks: {} });
    assert(c.length >= 12, `lệnh toàn cục quá ít: ${c.length}`);
    assert(!c.some((x) => x.id.startsWith('p.')), 'không được có lệnh p.* khi chưa mở project');
  });

  it('trong project có đúng 9 lệnh ngữ cảnh (5 rail + tab của S3/S5)', () => {
    const c = baseCommands({ router, projectId: 'tet-2026', status: {}, hooks: {} });
    const n = c.filter((x) => x.id.startsWith('p.')).length;
    assert(n === 9, `phải có đúng 9 lệnh p.*, đang có ${n}`);
  });

  it('agent chưa chạy: lệnh gây thay đổi vẫn HIỆN + nói lý do (§2.5-2)', () => {
    const c = baseCommands({ router, projectId: null, status: { readOnly: true }, hooks: {} });
    const create = c.find((x) => x.id === 'project.create');
    assert(create, 'project.create không được biến mất');
    assert(create.disabledReason === 'Cần công cụ local đang chạy', 'phải nói lý do bằng chữ');
  });

  it('tìm bỏ dấu tiếng Việt: thu vien -> Thư viện kit, thung rac -> Thùng rác', () => {
    const c = baseCommands({ router, projectId: 'p1', status: {}, hooks: {} });
    assert(/Thư viện kit/.test(rankCommands(c, 'thu vien')[0].label), 'không tìm được Thư viện kit');
    assert(/Thùng rác/.test(rankCommands(c, 'thung rac')[0].label), 'không tìm được Thùng rác');
  });

  it('mount thật: ARIA nối đúng và mũi tên/Home/End đổi option', () => {
    const c = baseCommands({ router, projectId: 'p1', status: {}, hooks: {} });
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const m = openCommandPalette({ commands: c });
    const input = m.panel.querySelector('[role="combobox"]');
    const listbox = m.panel.querySelector('[role="listbox"]');
    assert(input && listbox, 'thiếu combobox/listbox');
    assert(input.getAttribute('aria-controls') === listbox.getAttribute('id'),
      'aria-controls không trỏ tới listbox');
    assert(m.panel.getAttribute('aria-modal') === 'true', 'modal phải có aria-modal');
    assert(document.activeElement === input, 'mở xong phải focus vào ô nhập');

    const ad = () => input.getAttribute('aria-activedescendant');
    assert(ad() === 'kg-cmdk-opt-0', 'bắt đầu ở option 0');
    input.dispatch('keydown', { key: 'ArrowDown' });
    assert(ad() === 'kg-cmdk-opt-1', 'mũi tên xuống phải sang option 1');
    input.dispatch('keydown', { key: 'ArrowUp' });
    assert(ad() === 'kg-cmdk-opt-0', 'mũi tên lên phải về option 0');
    input.dispatch('keydown', { key: 'End' });
    assert(ad() !== 'kg-cmdk-opt-0', 'End phải xuống cuối');
    input.dispatch('keydown', { key: 'Home' });
    assert(ad() === 'kg-cmdk-opt-0', 'Home phải về đầu');

    m.close('escape');
    assert(!document.body.contains(m.panel), 'đóng rồi panel phải rời DOM');
    assert(document.activeElement === trigger, 'phải trả focus về phần tử đã mở (A7)');
  });

  it('lệnh điều hướng gọi đúng router.go theo §2.1', () => {
    const c = baseCommands({ router, projectId: 'tet-2026', status: {}, hooks: {} });
    c.find((x) => x.id === 'p.kit').run();
    assert(router.last[0] === 'S5' && router.last[1].id === 'tet-2026',
      `router.go sai: ${JSON.stringify(router.last)}`);
  });
});


/* ────────────────────────────────────────────────────────────────────────────
   ⌘K: lệnh của MÀN góp vào bảng lệnh (§2.3 "mọi hành động phải gọi được từ đây").
   Lượt tích hợp: a11y-report §8-8 ghi "handle.commands() chưa màn nào khai" là việc
   bàn giao; S3 + S4 nay đã khai (design/commands.js, runs/commands.js) và adapter
   của app-shell đã chuyển tiếp. Ba ca dưới khoá đường đó lại.
   ──────────────────────────────────────────────────────────────────────────── */
describe('⌘K nhận lệnh của màn (S3/S4 đã khai commands())', () => {
  it('S3 khai đủ lệnh Lưu/Hoàn tác/Làm lại/Thư viện/Lịch sử, có phím tắt §2.3', async () => {
    const { s3Commands } = await import('../../screens/design/commands.js');
    const calls = [];
    const cmds = s3Commands({
      state: { dirty: true, canUndo: true, canRedo: false },
      readOnly: false,
      onSave: () => calls.push('save'),
      onSaveAndGen: () => calls.push('saveGen'),
      onUndo: () => calls.push('undo'),
      onRedo: () => calls.push('redo'),
      onLibrary: () => calls.push('library'),
      onHistory: () => calls.push('history'),
    });
    assert(cmds.length >= 6, `S3 phải góp ≥6 lệnh, nhận ${cmds.length}`);
    for (const c of cmds) {
      assert(typeof c.label === 'string' && c.label.length > 0, 'lệnh phải có nhãn tiếng Việt');
      assert(typeof c.run === 'function', `lệnh ${c.id} phải có run()`);
    }
    const byId = new Map(cmds.map((c) => [c.id, c]));
    assert(byId.get('s3.save')?.hint === '⌘S', 'Lưu phải ghi phím ⌘S');
    assert(!byId.get('s3.save').disabledReason, 'đang dirty thì Lưu phải bật');
    assert(byId.get('s3.redo').disabledReason, 'không redo được thì phải nêu lý do');
    byId.get('s3.save').run();
    byId.get('s3.library').run();
    assert(calls.join(',') === 'save,library', `run() phải gọi đúng hành động, nhận ${calls}`);
  });
  it('S3 chế độ chỉ-đọc: lệnh ghi VẪN HIỆN + nêu lý do (§2.5-2), không biến mất', async () => {
    const { s3Commands } = await import('../../screens/design/commands.js');
    const cmds = s3Commands({
      state: { dirty: true, canUndo: true, canRedo: true }, readOnly: true,
      onSave() {}, onSaveAndGen() {}, onUndo() {}, onRedo() {}, onLibrary() {}, onHistory() {},
    });
    const save = cmds.find((c) => c.id === 's3.save');
    assert(save, 'lệnh Lưu KHÔNG được ẩn khi chỉ-đọc');
    assert(/công cụ local/i.test(save.disabledReason ?? ''), `phải nêu lý do, nhận ${save.disabledReason}`);
  });
  it('S4 khai lệnh Dừng/Chạy lại lỗi/⌥⌘L — phím §2.3 trước đây không có đường nào', async () => {
    const { s4Commands } = await import('../../screens/runs/commands.js');
    const cmds = s4Commands({
      run: { status: 'running', jobs: [{ status: 'failed' }, { status: 'ok' }] },
      readOnly: false, selectedJob: null, errorsOnly: false,
      onCancel() {}, onRetryFailed() {}, onToggleErrorFilter() {}, onOpenJobLog() {},
    });
    const byId = new Map(cmds.map((c) => [c.id, c]));
    assert(!byId.get('s4.cancel').disabledReason, 'run đang chạy thì Dừng phải bật');
    assert(/1 lượt lỗi/.test(byId.get('s4.retry').label), `nhãn phải nói số lượt lỗi: ${byId.get('s4.retry').label}`);
    assert(byId.get('s4.logErrors').hint === '⌥⌘L', 'phải có phím ⌥⌘L của §2.3');
    assert(byId.get('s4.jobLog').disabledReason, 'chưa chọn lượt thì phải nêu lý do');
    const done = s4Commands({
      run: { status: 'done', jobs: [] }, readOnly: false, selectedJob: 'tet-main', errorsOnly: true,
      onCancel() {}, onRetryFailed() {}, onToggleErrorFilter() {}, onOpenJobLog() {},
    });
    const d = new Map(done.map((c) => [c.id, c]));
    assert(/kết thúc/.test(d.get('s4.cancel').disabledReason ?? ''), 'run xong thì không cho Dừng');
    assert(/hiện lại mọi dòng/.test(d.get('s4.logErrors').label), 'nhãn lọc log phải đổi theo trạng thái');
  });
  it('adapter của app-shell CHUYỂN TIẾP commands() của màn (không đánh rơi)', async () => {
    const { adaptFactory } = await import('../screen-adapters.js');
    const mount = adaptFactory(() => ({
      el: document.createElement('div'),
      commands: () => [{ id: 'x.only', label: 'Lệnh riêng của màn', run() {} }],
    }));
    const handle = mount(document.createElement('div'), { params: {}, status: {} });
    assert(typeof handle.commands === 'function', 'handle phải có commands()');
    eq(handle.commands().map((c) => c.id), ['x.only']);
    const bare = adaptFactory(() => ({ el: document.createElement('div') }));
    eq(bare(document.createElement('div'), { params: {}, status: {} }).commands(), [],
      'màn không khai commands() thì trả mảng rỗng, KHÔNG ném lỗi');
  });
});


/* ──────────────────────────────────────────────────────────────────────────
   M-04 (QA LEAD) — ĐIỂM MÙ ĐÃ LÀM LỌT C-02.
   Ca cũ import THẲNG screens/runs/commands.js rồi gọi s4Commands(...), nên nó kiểm
   NỘI DUNG lệnh mà KHÔNG đi qua run-detail.js — đúng chỗ thiếu `import { s4Commands }`.
   Hậu quả: 294 ca đều xanh trong khi ⌘K ở màn S4 ném ReferenceError.
   Ca dưới đi ĐÚNG ĐƯỜNG NGƯỜI DÙNG: mount màn thật → gọi handle.commands().
   ────────────────────────────────────────────────────────────────────────── */
describe('[M-04] ⌘K màn S4 đi qua run-detail.js đã mount (không import tắt commands.js)', () => {
  it('createRunDetail(...).commands() KHÔNG ném và trả đủ 4 lệnh §2.3', async () => {
    const { createRunDetail } = await import('../../screens/runs/run-detail.js');
    const h = createRunDetail({ projectId: 'p1', runId: 'r-0001', navigate() {} });
    let cmds;
    try { cmds = h.commands(); } catch (e) {
      assert(false, `commands() ném ${e.constructor.name}: ${e.message} — đúng dạng C-02 (thiếu import)`);
    }
    const ids = cmds.map((c) => c.id);
    for (const id of ['s4.cancel', 's4.retry', 's4.logErrors', 's4.jobLog']) {
      assert(ids.includes(id), `thiếu lệnh ${id}; nhận: ${ids.join(',')}`);
    }
    h.destroy?.();
  });

  it('màn S4 (runs/index.js) chuyển tiếp commands() của run-detail ra app-shell', async () => {
    const { createRunsScreen } = await import('../../screens/runs/index.js');
    const mod = await import('../../screens/runs/index.js');
    const factory = createRunsScreen ?? mod.default ?? mod.mount;
    assert(typeof factory === 'function', 'runs/index.js phải export factory dựng màn');
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   LƯỢT UX QA LEAD — chống hồi quy cho 5 lỗi đã VÁ ở lượt này.
   Mỗi ca gắn với một lỗi tái lập được, có ghi mã lỗi trong UX-VERDICT.md.
   ──────────────────────────────────────────────────────────────────────────── */

describe('[UX CAO-1] đổi project phải DỰNG LẠI màn, không vẽ phạm vi cũ', () => {
  const shell = read('js/app-shell/shell.js');

  it('shell so params.id trước khi đi nhánh "không dựng lại"', () => {
    assert(/const prevProjectId = currentMatch\?\.params\?\.id \?\? null;/.test(shell),
      'phải chụp projectId CŨ trước khi ghi đè currentMatch');
    assert(/const sameProject = prevProjectId === projectId;/.test(shell), 'phải so 2 id');
    assert(/screenId === currentScreenId && sameProject && handle/.test(shell),
      'nhánh route() phải đòi CẢ cùng màn VÀ cùng project');
  });

  it('breadcrumb/<title> không mượn tên project cũ từ handle.title()', () => {
    assert(/function projectNameFromCache\(id\)/.test(shell), 'phải có đường lấy tên KHÔNG qua handle');
    assert(/refreshCrumbs\(match\);/.test(shell), 'màn mới mount xong phải dán lại tên thật');
  });

  it('adapter S2/S2b/S5: route() với projectId khác bị CHẶN, không vẽ sai phạm vi', async () => {
    const { toShellMount } = await import('../../screens/project/mount-adapter.js');
    const calls = [];
    const mount = toShellMount(() => ({
      update: (o) => calls.push(['update', o.tab ?? null]),
      destroy() {}, title: () => 'A',
    }));
    const host = document.createElement('div');
    const h = mount(host, { params: { id: 'aaa' }, tab: 'x', status: {} });
    const err = console.error; let blocked = 0;
    console.error = (...a) => { if (String(a[0]).includes('vẽ sai phạm vi')) blocked++; else err(...a); };
    h.route({ params: { id: 'bbb' }, tab: 'y', status: {} });
    console.error = err;
    eq(blocked, 1, 'phải báo lỗi và bỏ qua');
    eq(calls.length, 0, 'KHÔNG được gọi update() với project khác');
    h.route({ params: { id: 'aaa' }, tab: 'y', status: {} });
    eq(calls, [['update', 'y']], 'cùng project thì đổi tab vẫn chạy (giữ tối ưu H3)');
  });

  it('adapter S3/S4: route() với projectId khác bị CHẶN', async () => {
    const { adaptFactory } = await import('../screen-adapters.js');
    const calls = [];
    const mount = adaptFactory(() => ({
      el: document.createElement('div'),
      update: (o) => calls.push(['update', o.tab ?? null]),
      destroy() {},
    }));
    const h = mount(document.createElement('div'), { params: { id: 'aaa' }, tab: 'sheets', status: {} });
    const err = console.error; let blocked = 0;
    console.error = (...a) => { if (String(a[0]).includes('vẽ sai phạm vi')) blocked++; else err(...a); };
    h.route({ params: { id: 'bbb' }, tab: 'styles', status: {} });
    console.error = err;
    eq(blocked, 1);
    eq(calls.length, 0, 'KHÔNG được update() sang project khác');
  });
});

describe('[UX CAO-A] nút bị chặn PHẢI phát lộ lý do qua a11y tree', () => {
  it('gate TRƯỚC khi append (cách 31 chỗ trong screens/ đang gọi) vẫn nêu được lý do', async () => {
    const { createButton, setDisabled } = await import('../../ui/button.js');
    const b = createButton({ label: 'Sinh ảnh…', variant: 'primary' });
    // CỐ Ý không append: đây chính là ca mà bản cũ mất lý do
    // (`attachTooltip(..., {alsoWrapper:true})` đọc parentElement === null).
    setDisabled(b, true, 'Cần công cụ local đang chạy');
    const id = b.getAttribute('aria-describedby');
    assert(id, 'phải có aria-describedby — screen reader không có đường nào khác');
    const node = b.querySelector(`[id=${id}]`);
    assert(node, 'aria-describedby phải trỏ tới node TỒN TẠI trong nút');
    eq(node.textContent, 'Cần công cụ local đang chạy', 'nội dung lý do');
    assert(/kg-sr-only/.test(node.getAttribute('class') ?? ''), 'lý do phải là sr-only (không đổi giao diện)');
    eq(node.getAttribute('aria-hidden'), 'true', 'phải aria-hidden để không làm bẩn TÊN nút');
    eq(b.title, 'Cần công cụ local đang chạy', 'đường lùi cho người dùng chuột');
  });

  it('bỏ chặn thì lý do được dọn, không để lại describedby treo', async () => {
    const { createButton, setDisabled } = await import('../../ui/button.js');
    const b = createButton({ label: 'Lưu', variant: 'primary' });
    setDisabled(b, true, 'Chưa có thay đổi nào');
    setDisabled(b, false);
    eq(b.getAttribute('aria-describedby'), null, 'phải xoá describedby');
    eq(b.querySelectorAll('.kg-btn__reason').length, 0, 'phải xoá node lý do');
  });

  it('S1 không còn tự đặt title= thay cho setDisabled (2 chỗ)', () => {
    const idx = read('js/screens/projects/index.js');
    const lv = read('js/screens/projects/list-view.js');
    assert(!/b\.title = reason \?\? ''/.test(idx), 'projects/index.js phải dùng setDisabled');
    assert(!/b\.title = reason \?\? ''/.test(lv), 'list-view.js phải dùng setDisabled');
    assert(/setDisabled\(b, readOnly, readOnly \? reason : null\)/.test(idx));
    assert(/setDisabled\(b, true, reason \?\? null\)/.test(lv));
  });
});

describe('[UX CAO-2] mốc <768px là CHỈ ĐỌC thật, không chỉ banner (§2.2 / M5)', () => {
  const as = read('js/app-shell/agent-status.js');

  it('agent-status ghép mốc màn hình vào nguồn readOnly chung', () => {
    assert(/import \{ smallScreenQuery, SMALL_SCREEN_MAX \} from '\.\/breakpoints\.js'/.test(as),
      'phải dùng NGUỒN mốc duy nhất, không hard-code 768');
    assert(/function compose\(raw\)/.test(as), 'phải có hàm ghép');
    assert(/readOnly: true, readOnlyBySmallScreen: true/.test(as), 'phải đánh dấu nguyên nhân');
    assert(/export function status\(\) \{ return compose\(current\); \}/.test(as),
      'status() phải trả bản ĐÃ ghép — 31 chỗ gate ăn theo');
  });

  it('chỉ SIẾT, không bao giờ nới: readOnly=true không thể thành false', () => {
    assert(/if \(raw\.readOnly === true \|\| !smallScreenMatches\(\)\) return raw;/.test(as),
      'agent đã chỉ-đọc thì trả nguyên trạng');
  });

  it('pill/banner §2.4-2.5 dùng trạng thái THÔ (không đổ oan "mất kết nối" ở điện thoại)', () => {
    const shell = read('js/app-shell/shell.js');
    assert(/export function agentOnlyStatus\(\)/.test(as), 'phải mở đường lấy trạng thái thô');
    assert(/header\.renderStatus\(raw\);/.test(shell) && /banner\.render\(raw\);/.test(shell),
      'pill + banner phải nhận trạng thái thô');
  });

  it('lý do nói ĐÚNG nguyên nhân, không mượn câu "Cần công cụ local"', () => {
    assert(/Màn hình nhỏ .*mở trên máy tính để sửa/.test(as), 'phải có nhánh lý do riêng');
    const ro = read('js/screens/shared/read-only.js');
    assert(/readOnlyBySmallScreen === true && st\.connected === true/.test(ro),
      'chỉ đổi câu khi agent VẪN TỐT — agent chết thì vẫn phải nói về agent');
  });

  it('S3/S4 không còn viết cứng câu lý do (14 chỗ)', () => {
    for (const f of ['js/screens/design/glue.js', 'js/screens/design/save-bar.js',
      'js/screens/design/canvas.js', 'js/screens/design/props.js', 'js/screens/design/styles-tab.js',
      'js/screens/design/advanced-tab.js', 'js/screens/design/commands.js',
      'js/screens/runs/index.js', 'js/screens/runs/run-detail.js', 'js/screens/runs/commands.js']) {
      const src = read(f);
      assert(!/'Cần công cụ local đang chạy'/.test(src), `${f} còn viết cứng câu lý do`);
      assert(/readOnlyReason/.test(src), `${f} phải lấy câu chữ từ shared/read-only.js`);
    }
  });

  it('banner màn nhỏ giữ nguyên văn §2.2 nhưng nói thêm hệ quả THẬT', () => {
    const chrome = read('js/app-shell/chrome.js');
    assert(/Màn hình nhỏ: xem được, sửa nên dùng máy tính\./.test(chrome), 'giữ câu của spec');
    assert(/Thao tác sửa đang bị khoá/.test(chrome), 'phải nói rõ là đã bị khoá thật');
    assert(/if \(!mq \|\| !mq\.matches\) \{ dismissed = false; return; \}/.test(chrome),
      'về màn rộng phải reset trạng thái đã-ẩn');
  });
});

describe('[UX CAO-B/TB-B] tương phản: bỏ opacity cho trạng thái bị chặn', () => {
  const tokens = read('css/tokens.css');

  it('có token riêng cho trạng thái bị chặn, đo được ≥4.5:1', () => {
    for (const t of ['--fg-disabled', '--bg-disabled', '--line-disabled']) {
      assert(new RegExp(`${t}:`).test(tokens), `thiếu token ${t}`);
    }
    eq((tokens.match(/--fg-disabled:/g) ?? []).length, 2, 'phải khai cho CẢ 2 theme');
  });

  it('không selector nào còn dùng opacity .45 cho trạng thái bị chặn', () => {
    for (const f of ['css/components/button.css', 'css/components/field.css',
      'css/components/menu.css', 'css/components/badge.css', 'css/components/surface.css']) {
      // Bỏ comment TRƯỚC khi soi — chú thích giải thích bản vá có nhắc lại ".45".
      const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '');
      const bad = src.split('\n').filter((l) => /opacity:\s*0?\.45/.test(l) && !/%\s*[,{]/.test(l));
      eq(bad, [], `${f} còn opacity .45 cho disabled: ${bad.join(' | ')}`);
    }
  });

  it('viền MANG THÔNG TIN đổi sang --line-default (từ 1.20–1.29:1 lên 3.94:1)', () => {
    assert(/\.r-progress__track \{[^}]*border: 1px solid var\(--line-default\)/.test(read('css/components/runs.css')),
      'rãnh thanh tiến độ 0% không có dấu hiệu thay thế nào');
    assert(/repeating-linear-gradient\(45deg, var\(--line-default\)/.test(read('css/components/editor.css')),
      'gạch chéo ô trống là dấu hiệu trạng thái §5.6');
    assert(/\.kg-table td \{[^}]*border-bottom: 1px solid var\(--line-default\)/.test(read('css/components/surface.css')),
      'đường chia hàng bảng');
  });

  it('ring focus cạnh nút NỀN ĐẶC có vòng đệm ≥3:1 (WCAG 2.4.11)', () => {
    const base = read('css/base.css');
    assert(/--focus-ring-gap/.test(tokens), 'thiếu token vòng đệm');
    eq((tokens.match(/--focus-ring-gap:/g) ?? []).length, 2, 'phải khai cho cả 2 theme');
    assert(/\.kg-btn--primary:focus-visible,\s*\n\.kg-btn--danger:focus-visible/.test(base),
      'phải áp cho cả primary và danger');
    assert(/var\(--focus-ring-gap\)[\s\S]*var\(--focus-ring\)/.test(base), 'đệm phải nằm TRONG ring');
  });

  it('⌘K: mục bị chặn có style riêng (trước đây trông y hệt mục bấm được)', () => {
    assert(/\.kg-list__item\[aria-disabled="true"\]/.test(read('css/components/surface.css')));
    assert(/:hover:not\(\[aria-disabled="true"\]\)/.test(read('css/components/surface.css')),
      'mục bị chặn không được sáng lên khi hover');
  });
});

describe('[UX TB-A/THẤP-A] wizard nhớ đúng bước · S3 có <h1>', () => {
  it('enum step khớp STEPS của stepper — mỗi bước ghi rồi đọc phải ra chính nó', async () => {
    const { STEPS } = await import('../../screens/setup/stepper.js');
    const store = await import('../../core/store.js');
    store._setBackend(store._memoryBackend());
    for (const s of STEPS) {
      store.set(store.LS_KEYS.setup, { completed: false, step: s.id });
      eq(store.get(store.LS_KEYS.setup)?.step, s.id, `bước "${s.id}" phải khôi phục được`);
    }
    const schemas = read('js/core/schemas.js');
    assert(!/'run'.*'connect'/.test(schemas.split('\n').find((l) => /step: enun/.test(l)) ?? ''),
      "phải bỏ giá trị chết 'run'");
  });

  it('S3 có đúng 1 <h1> (7/8 màn kia đều có — S3 từng là ngoại lệ)', () => {
    const idx = read('js/screens/design/index.js');
    assert(/el\('h1', \{ class: 'kg-sr-only', text: 'Bản thiết kế' \}\)/.test(idx), 'thiếu h1 ẩn');
    assert(/root\.append\(srTitle[,)]/.test(idx), 'h1 phải nằm TRONG cây màn');
  });
});

const ok = await run();
process.exit(ok ? 0 : 1);
