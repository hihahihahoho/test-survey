/* screens.test.mjs — S2 (tổng quan) · S2b (cài đặt project) · S5 (thư viện kit)
   + hợp đồng mount với app-shell + checklist bảo mật §8.2.
   S6 nằm ở settings.test.mjs (giữ mỗi file <400 dòng).
   Test THẬT cho các màn của team này: chạy mount() dưới minidom với agent giả,
   rồi kiểm DOM/ARIA/luồng dữ liệu. Báo pass/fail TỪNG CA (không tự nhận vống). */
import { flush, mountPoint, textOf, storageMap } from './env.mjs';
import { makeMockFetch, defaultRoutes, PROJECT, DOCTOR_NO_IMAGEGEN, TRASH as TRASH_JSON } from './mock-agent.mjs';

import * as agent from '../../core/agent.js';
import * as store from '../../core/store.js';
import * as router from '../../core/router.js';
import { LS_KEYS } from '../../core/constants.js';

let pass = 0; let fail = 0;
const fails = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? ` · ${extra}` : ''}`); }
  else { fail += 1; fails.push(name); console.log(`  \x1b[31m✗\x1b[0m ${name}${extra ? ` · ${extra}` : ''}`); }
};
const group = (n) => console.log(`\n\x1b[1m${n}\x1b[0m`);

/* ── setup: agent giả + đã hoàn tất setup để router không ép về /setup ── */
const reqLog = [];
function useRoutes(routes) {
  agent.configure({ fetchImpl: makeMockFetch(routes, reqLog), baseUrl: 'http://127.0.0.1:8765' });
}
useRoutes(defaultRoutes());
store.set(LS_KEYS.setup, { completed: true, step: 'done' });
router.start();

const CONNECTED = Object.freeze({
  pill: 'connected', code: null, readOnly: false, connected: true,
  baseUrl: 'http://127.0.0.1:8765', mode: 'remote',
  health: { version: '1.2.0', protocol: 1, instanceLabel: 'gray-otter', workspaceLabel: '~/KitGen', activeRuns: 1, uptimeMs: 3600000, buildId: 'b1' },
  workspaceLabel: '~/KitGen', checkedAt: new Date().toISOString(), mirrorUrl: 'http://127.0.0.1:8765/app/',
});
const OFFLINE = Object.freeze({
  pill: 'not-running', code: 'AGENT_NOT_RUNNING', readOnly: true, connected: false,
  baseUrl: null, mode: 'remote', health: null, checkedAt: new Date().toISOString(),
  mirrorUrl: 'http://127.0.0.1:8765/app/',
});

/* ═════════════════ S2 · TỔNG QUAN ═════════════════ */
group('S2 · /p/:id — tổng quan project');
{
  const { mountOverview } = await import('../project/overview.js');
  const host = mountPoint();
  const scr = mountOverview(host, { projectId: PROJECT.id, status: CONNECTED });

  // loading trước, có thông báo cho screen reader
  ok('loading: có vùng aria-busy khi chưa có dữ liệu', host.querySelectorAll('[aria-busy=true]').length > 0);

  await flush();
  const t = textOf(host);
  ok('hiện tên project qua textContent', t.includes('Tết 2026 — VietinBank iPay'));
  ok('có thẻ VIỆC TIẾP THEO', t.includes('Việc tiếp theo'));
  ok('có thẻ ma trận tiến độ', t.includes('Tiến độ theo sheet × phong cách'));

  // ma trận: role=grid, 1 tabstop
  const grid = host.querySelector('[role=grid]');
  ok('ma trận là composite widget role=grid (§5.8-A6)', !!grid);
  const cells = host.querySelectorAll('.kg-matrix-cell');
  ok('ma trận dựng đủ ô 2 phong cách × 3 sheet', cells.length === 6, `${cells.length} ô`);
  const tabstops = cells.filter((c) => String(c.getAttribute('tabindex')) === '0');
  ok('ma trận có ĐÚNG 1 tabstop', tabstops.length === 1, `${tabstops.length}`);
  ok('mọi ô ma trận là <button>', cells.every((c) => c.tagName === 'BUTTON'));
  ok('mọi ô có aria-label đủ nghĩa', cells.every((c) => (c.getAttribute('aria-label') ?? '').length > 10),
    cells[0]?.getAttribute('aria-label'));
  ok('mọi ô có CHỮ, không chỉ màu (§5.8-A3)', cells.every((c) => textOf(c).trim().length > 0),
    cells.map((c) => textOf(c).trim()).join('|'));

  // trạng thái đọc từ state.jobs, không tự đoán
  // nhãn ô = icon + CHỮ (§5.7) nên so bằng "chứa", không so bằng bằng nhau
  const labels = cells.map((c) => textOf(c).trim()).join('|');
  ok('ô stale hiện "Cần sinh lại"', labels.includes('Cần sinh lại'), labels);
  ok('ô failed hiện "Lỗi"', labels.includes('Lỗi'));
  ok('ô never hiện "Chưa có"', labels.includes('Chưa có'));
  ok('ô running hiện "Đang sinh"', labels.includes('Đang sinh'));

  // Việc tiếp theo: có dòng hành động thật
  ok('Việc tiếp theo nêu lượt lỗi', t.includes('lượt sinh ảnh bị lỗi'));
  ok('Việc tiếp theo nêu sheet cần sinh lại', t.includes('nên sinh lại'));

  // nút chính
  const primaries = host.querySelectorAll('.kg-btn--primary');
  ok('màn có ĐÚNG 1 nút primary (§5.4)', primaries.length === 1, `${primaries.length}`);
  ok('nút chính là Sinh ảnh…', textOf(primaries[0]).includes('Sinh ảnh'));

  // chọn nhiều bằng bàn phím: Space bật chọn → thanh nổi hiện
  grid.dispatch('keydown', { key: ' ', preventDefault() {}, stopPropagation() {} });
  ok('Space chọn 1 ô → aria-pressed=true', cells.some((c) => c.getAttribute('aria-pressed') === 'true'));
  ok('chọn xong hiện thanh "Đang chọn N/M" (§1.1-4)', textOf(host).includes('Đang chọn 1/6'));

  // chuyển sang chế độ chỉ-đọc
  scr.update({ status: OFFLINE });
  await flush(2);
  const t2 = textOf(host);
  ok('chỉ-đọc: có banner chưa thấy công cụ local (§2.5-1)', t2.includes('Chưa thấy công cụ local'));
  const genBtns = host.querySelectorAll('.kg-btn').filter((b) => textOf(b).includes('Sinh ảnh'));
  ok('chỉ-đọc: nút Sinh ảnh bị disabled + aria-disabled (§2.5-2)',
    genBtns.length > 0 && genBtns.every((b) => b.disabled === true && b.getAttribute('aria-disabled') === 'true'));
  ok('chỉ-đọc: KHÔNG ẩn nút (vẫn còn trong DOM)', genBtns.length > 0);

  scr.destroy();
  ok('destroy() dọn sạch container', host.childNodes.length === 0);
}

/* ═════════════════ S2 · lỗi và empty ═════════════════ */
group('S2 · trạng thái error + empty');
{
  const { mountOverview } = await import('../project/overview.js');
  useRoutes([[`/api/projects/${PROJECT.id}`, { status: 404, json: { error: { code: 'PROJECT_NOT_FOUND', message: 'ENOENT: /Users/x/KitGen/projects/... no such file' } } }]]);
  store.remove(LS_KEYS.projectsCache);
  const host = mountPoint();
  const scr = mountOverview(host, { projectId: PROJECT.id, status: CONNECTED });
  await flush();
  const t = textOf(host);
  ok('PROJECT_NOT_FOUND: hiện copy tiếng Việt từ bảng §3.9', t.includes('Project không còn ở đây') || t.includes('không còn'));
  ok('KHÔNG hiện message kỹ thuật ENOENT ra thân UI (§3.9 điều cấm 1)', !t.includes('ENOENT'));
  ok('có nút Về danh sách', t.includes('Về danh sách'));
  ok('có nút Xem thùng rác', t.includes('thùng rác') || t.includes('Thùng rác'));
  scr.destroy();

  // empty: project 0 sheet
  const emptyProject = { ...PROJECT, stats: { ...PROJECT.stats, sheets: 0, components: 0, jobs: 0, kitsCut: 0 }, state: { stale: false, staleReason: [], jobs: {} } };
  useRoutes([
    [`/api/projects/${PROJECT.id}/contract`, { status: 200, json: { version: 0, contract: { schemaVersion: 4, variants: [{ id: 'tet', vi: 'Tết đỏ' }], sheets: [] } } }],
    [`/api/projects/${PROJECT.id}/runs`, { status: 200, json: { items: [] } }],
    [`/api/projects/${PROJECT.id}/kit`, { status: 404, json: { error: { code: 'KIT_NOT_CUT', message: 'nothing cut' } } }],
    [`/api/projects/${PROJECT.id}`, { status: 200, json: { project: emptyProject } }],
  ]);
  const host2 = mountPoint();
  const scr2 = mountOverview(host2, { projectId: PROJECT.id, status: CONNECTED });
  await flush();
  const t2 = textOf(host2);
  ok('empty: hiện hướng dẫn 3 bước', t2.includes('Bước 1') && t2.includes('Bước 2') && t2.includes('Bước 3'));
  ok('empty: KHÔNG vẽ ma trận', host2.querySelectorAll('.kg-matrix-cell').length === 0);
  ok('empty: nút bước 2 xám và nói lý do "Cần ≥1 sheet"', t2.includes('Cần ≥1 sheet'));
  scr2.destroy();
}

/* ═════════════════ S2b · CÀI ĐẶT PROJECT ═════════════════ */
group('S2b · /p/:id/settings');
{
  useRoutes(defaultRoutes());
  const { mountProjectSettings } = await import('../project/settings.js');
  const host = mountPoint();
  const scr = mountProjectSettings(host, { projectId: PROJECT.id, status: CONNECTED });
  await flush();
  const t = textOf(host);
  ok('có 3 khối: Thông tin · Dung lượng · Vùng nguy hiểm', t.includes('Thông tin') && t.includes('Dung lượng') && t.includes('Vùng nguy hiểm'));
  ok('form nạp đúng tên project', host.querySelectorAll('input').some((i) => i.value === PROJECT.name));
  ok('form nạp đúng slug', host.querySelectorAll('input').some((i) => i.value === PROJECT.slug));
  ok('hiện tag hiện có', t.includes('tet') && t.includes('banking'));
  ok('hiện tên file khi xuất', /kitgen-tet26-vietinbank-\d{8}\.zip/.test(t), t.match(/kitgen-[^\s]*\.zip/)?.[0]);
  ok('hiện dung lượng đã định dạng', t.includes('176 MB') || /\d+ MB/.test(t), t.match(/\d+([,.]\d+)? MB/)?.[0]);

  const saveBtn = host.querySelectorAll('.kg-btn--primary').find((b) => textOf(b).includes('Lưu'));
  ok('nút Lưu disabled khi form còn sạch', !!saveBtn && saveBtn.disabled === true);

  // mọi control có <label for> thật (§5.8-A5/I4)
  const inputs = host.querySelectorAll('input').filter((i) => i.getAttribute('type') !== 'checkbox' && i.getAttribute('type') !== 'radio');
  const labelled = inputs.every((i) => {
    const id = i.getAttribute('id');
    return id && host.querySelectorAll(`label[for=${id}]`).length === 1;
  });
  ok('mọi input có <label for> khớp id', labelled);

  // Vùng nguy hiểm dùng class `.kg-danger-zone` của design system (viền var(--danger)
  // khai trong overlay.css) — trước đây đặt borderColor inline, xem INTEGRATION.md.
  const danger = host.querySelectorAll('.kg-card').find((c) => textOf(c).includes('Vùng nguy hiểm'));
  ok('Vùng nguy hiểm dùng class .kg-danger-zone của design system',
    String(danger?.className ?? '').includes('kg-danger-zone'), String(danger?.className));
  ok('có nút Xoá biến thể danger (≤1 mỗi màn §5.4)', host.querySelectorAll('.kg-btn--danger').length === 1);

  // đổi tên → nút Lưu bật
  const nameInput = inputs.find((i) => i.value === PROJECT.name);
  nameInput.value = 'Tết 2026 mới';
  nameInput.dispatch('input');
  ok('sửa form → nút Lưu bật lên', saveBtn.disabled === false);
  ok('sửa form → isDirty() = true (chặn mất dữ liệu)', scr.isDirty() === true);

  scr.update({ status: OFFLINE });
  await flush(2);
  const offInputs = host.querySelectorAll('input').filter((i) => i.getAttribute('type') === 'text' || !i.getAttribute('type'));
  ok('chỉ-đọc: input bị disabled', offInputs.length === 0 || offInputs.every((i) => i.disabled === true));
  scr.destroy();
}

/* ═════════════════ S5 · THƯ VIỆN KIT ═════════════════ */
group('S5 · /p/:id/kit');
{
  useRoutes(defaultRoutes());
  const { mountKit } = await import('../kit/index.js');
  const host = mountPoint();
  const scr = mountKit(host, { projectId: PROJECT.id, status: CONNECTED, tab: 'assets' });
  await flush();
  const t = textOf(host);
  ok('có 3 tab Assets / Ma trận so sánh / Xuất', t.includes('Assets') && t.includes('Ma trận so sánh') && t.includes('Xuất'));
  const tabs = host.querySelectorAll('[role=tab]');
  ok('tabs đúng 3 và có aria-selected', tabs.length === 3 && tabs.some((x) => x.getAttribute('aria-selected') === 'true'));
  const tabstops = tabs.filter((x) => String(x.getAttribute('tabindex')) === '0');
  ok('tabs có ĐÚNG 1 tabstop (§5.8-A6)', tabstops.length === 1);

  ok('lưới có nền checkerboard (.kg-checker) để thấy alpha', host.querySelectorAll('.kg-checker').length > 0);
  const imgs = host.querySelectorAll('img');
  ok('ảnh lưới LUÔN dùng ?w=256 (§6.5-5, đóng H4)',
    imgs.length > 0 && imgs.every((i) => String(i.getAttribute('src')).includes('w=256')),
    imgs[0]?.getAttribute('src'));
  ok('mọi ảnh có alt ý nghĩa (§5.8-A9)', imgs.every((i) => (i.getAttribute('alt') ?? '').length > 0));
  ok('ô kit là <button> có aria-label (§5.8-A5)',
    host.querySelectorAll('button').some((b) => (b.getAttribute('aria-label') ?? '').startsWith('Xem lớn')));
  ok('cảnh báo file rỗng nói rõ ra chữ', t.includes('rỗng'));
  ok('có nền xem thử 3 chế độ', t.includes('Ô vuông') && t.includes('Đen') && t.includes('Trắng'));

  // STALE: tet-tall là stale ⇒ file của sheet tall phải bị cảnh báo
  ok('cảnh báo STALE khi ảnh cũ hơn thiết kế', t.includes('cũ hơn') || t.includes('cần cắt lại'));

  // tab Xuất
  scr.update({ tab: 'export' });
  await flush(2);
  const te = textOf(host);
  ok('tab Xuất có 4 khối', te.includes('Tải .zip kit') && te.includes('atlas.png') && te.includes('manifest.json') && te.includes('Copy cho Figma'));
  ok('Copy cho Figma nói THẬT là chưa thi công', te.includes('Chưa thi công'));
  ok('mỗi khối xuất có dòng "Cho ai"', (te.match(/Cho ai:/g) ?? []).length >= 3);

  scr.destroy();
}

/* ═════════════════ Hợp đồng mount với app-shell ═════════════════ */
group('Hợp đồng mount(host, ctx) của web/js/app-shell/screen-registry.js');
{
  useRoutes(defaultRoutes());
  const mods = {
    project: await import('../project/index.js'),
    'project-settings': await import('../project/settings.js'),
    kit: await import('../kit/index.js'),
    settings: await import('../settings/index.js'),
  };
  for (const [id, mod] of Object.entries(mods)) {
    ok(`${id}: export function mount`, typeof mod.mount === 'function');
  }
  // mount thật qua hợp đồng của shell rồi thử route()/status()/title()/destroy()
  const host = mountPoint();
  const h = mods.kit.mount(host, {
    route: { id: 'S5', screen: 'kit' }, params: { id: PROJECT.id }, query: {}, tab: 'assets',
    status: CONNECTED, navigate() {}, go() {},
  });
  await flush();
  ok('handle có destroy/route/status/title', ['destroy', 'route', 'status', 'title'].every((k) => typeof h[k] === 'function'));
  ok('title() trả tên project cho breadcrumb + <title> (§5.8-A13)', h.title() === PROJECT.name, String(h.title()));
  h.route({ tab: 'export', status: CONNECTED });
  await flush(2);
  ok('route({tab}) đổi tab mà KHÔNG dựng lại màn (giữ cuộn, đóng H3)', textOf(host).includes('Tải .zip kit'));
  h.status(OFFLINE);
  await flush(2);
  ok('status(st) đưa màn vào chế độ chỉ-đọc', textOf(host).includes('Chưa thấy công cụ local'));
  h.destroy();
  ok('destroy() dọn container', host.childNodes.length === 0);

  // S6 không cần projectId; S5 thiếu projectId phải THROW rõ ràng (không vẽ màn rỗng bí ẩn)
  const host2 = mountPoint();
  const h2 = mods.settings.mount(host2, { route: { id: 'S6' }, params: {}, query: {}, tab: 'prefs', status: CONNECTED });
  await flush();
  ok('S6 mount được không cần projectId', textOf(host2).includes('Cài đặt'));
  h2.destroy();
  let threw = false;
  try { mods.kit.mount(mountPoint(), { route: { id: 'S5' }, params: {}, query: {}, status: CONNECTED }); }
  catch { threw = true; }
  ok('thiếu projectId → throw để shell hiện placeholder, không vẽ màn sai', threw);
}

/* ═════════════════ Bảo mật storage (YC#7 / §8.2) ═════════════════ */
group('§8.2 · Kiểm tra bảo mật storage sau khi chạy hết 4 màn');
{
  const dump = storageMap ? Object.fromEntries(storageMap) : {};
  const keys = Object.keys(dump);
  const allowed = new Set(Object.values(LS_KEYS));
  ok('tập khoá ⊆ 8 khoá allowlist', keys.every((k) => !k.startsWith('kitgen.') || allowed.has(k)), keys.join(','));
  const blob = JSON.stringify(dump);
  ok('không có chuỗi kiểu sk-…', !/\bsk-[A-Za-z0-9_-]{16,}/.test(blob));
  ok('không có JWT eyJ…', !/\beyJ[A-Za-z0-9_-]{8,}\./.test(blob));
  ok('không có "Bearer "', !/bearer\s+\S{12,}/i.test(blob));
  ok('không có đường dẫn tuyệt đối /Users/', !blob.includes('/Users/'));
  ok('không có field mã xác nhận nào bị lưu', !/confirm(ation)?[_.-]?code/i.test(blob));
  ok('store không có khoá lạ nào (auditForeignKeys)', store.auditForeignKeys().length === 0, store.auditForeignKeys().join(','));
}

/* ═════════════════ Mã 4 số của purge KHÔNG được lưu (arch §4.3-7) ═════════════════ */
group('§4.4 · mã xác nhận 4 số đi thẳng vào header, không lưu ở đâu');
{
  const CODE = '4821';
  const purgeLog = [];
  useRoutes([
    ['/api/trash/20260805-121003-candy-old-11b2/code', { status: 202, json: { expiresInMs: 60000 } }],
    ['/api/trash/20260805-121003-candy-old-11b2?purge=1', (u, init) => {
      purgeLog.push(init.headers ?? {});
      return { status: 204, json: null };
    }],
    ['/api/trash', { status: 200, json: TRASH_JSON }],
  ]);
  const { mountSettings } = await import('../settings/index.js');
  const host = mountPoint();
  const scr = mountSettings(host, { status: CONNECTED, tab: 'trash' });
  await flush();
  const purgeBtn = host.querySelectorAll('.kg-btn').find((b) => textOf(b).includes('Xoá vĩnh viễn'));
  ok('có nút Xoá vĩnh viễn để mở luồng mã', !!purgeBtn);
  purgeBtn.click();
  await flush();
  const codeInput = document.body.querySelectorAll('input').find((i) => String(i.getAttribute('maxlength')) === '4');
  ok('modal purge có ô nhập mã 4 số', !!codeInput);
  ok('modal purge nói mã in ở Terminal', textOf(document.body).includes('Terminal'));
  codeInput.value = CODE;
  const confirmBtn = document.body.querySelectorAll('.kg-btn--danger').find((b) => textOf(b).includes('Xoá vĩnh viễn'));
  confirmBtn.click();
  await flush();
  ok('mã được gửi qua header X-KitGen-Confirm',
    purgeLog.some((h) => h['X-KitGen-Confirm'] === CODE), JSON.stringify(purgeLog[0] ?? {}));
  const blob2 = JSON.stringify(Object.fromEntries(storageMap));
  ok('mã 4 số KHÔNG lọt vào localStorage (arch §4.3-7)', !blob2.includes(CODE), blob2.includes(CODE) ? 'LỌT' : 'sạch');
  scr.destroy();
}

/* ═════════════════ Không fetch trực tiếp (§6.5-1) ═════════════════ */
group('§6.5 · ràng buộc client');
{
  ok('mọi request đều mang header X-KitGen-Client',
    reqLog.length > 0 && reqLog.every((r) => (r.headers['X-KitGen-Client'] ?? r.headers['x-kitgen-client']) === '1'),
    `${reqLog.length} request`);
  ok('không request nào ra domain thứ ba',
    reqLog.every((r) => r.url.startsWith('http://127.0.0.1:')),
    [...new Set(reqLog.map((r) => r.url.split('/api')[0]))].join(','));
  ok('KHÔNG poll /api/doctor (gọi ≤3 lần cho cả phiên test)',
    reqLog.filter((r) => r.url.includes('/api/doctor')).length <= 3,
    String(reqLog.filter((r) => r.url.includes('/api/doctor')).length));
}

console.log(`\n${'─'.repeat(70)}`);
console.log(`Tổng: ${pass + fail} ca · \x1b[32m${pass} pass\x1b[0m · ${fail ? `\x1b[31m${fail} fail\x1b[0m` : '0 fail'}`);
if (fail) { console.log('\nCa thất bại:'); fails.forEach((f) => console.log(`  · ${f}`)); }
process.exit(fail ? 1 : 0);
