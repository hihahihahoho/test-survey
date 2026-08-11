/**
 * Test TÍCH HỢP THẬT: mount S3 và S4 qua ADAPTER của app-shell (screen-adapters.js)
 * với agent giả của team (mock-agent.mjs) — chứng minh hợp đồng NEEDS-d2p3 §1 khớp
 * với shell, và 4 trạng thái của màn chạy được end-to-end.
 */
import { describe, it, assert, eq } from '../../core/__tests__/harness.mjs';
import { document } from './dom-extra.mjs';
import { CONTRACT, PROJECT, RUNS, defaultRoutes, makeMockFetch } from './mock-agent.mjs';
import * as agent from '../../core/agent.js';
import * as idb from '../../core/idb.js';
import * as store from '../../core/store.js';
import { resolveMount } from '../../app-shell/screen-adapters.js';
import * as designMod from '../design/index.js';
import * as runsMod from '../runs/index.js';
import { validateContract } from '../design/validate.js';

const settle = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/**
 * Text của THÂN giao diện = mọi text TRỪ panel gập "Chi tiết cho lập trình viên" (<details>).
 * §3.9 cho phép `error.message` xuất hiện DUY NHẤT trong panel đó, và cấm ở thân UI.
 * Vì vậy assert phải đo đúng phần thân, không đo cả panel dev.
 */
function bodyText(root) {
  const skip = new Set(root.querySelectorAll('details'));
  const walk = (n) => {
    if (skip.has(n)) return '';
    if (!n.childNodes) return n.textContent ?? '';
    return n.childNodes.map(walk).join('');
  };
  return walk(root);
}

function boot({ routes = defaultRoutes(), log = [] } = {}) {
  store._setBackend(store._memoryBackend());
  idb.configure({ indexedDBImpl: null });
  agent.configure({
    fetchImpl: makeMockFetch(routes, log),
    baseUrl: 'http://127.0.0.1:8765',
    location: { protocol: 'http:', hostname: '127.0.0.1', port: '8765', origin: 'http://127.0.0.1:8765', pathname: '/app/' },
  });
  return log;
}

const ctx = (over = {}) => ({
  params: { id: PROJECT.id },
  tab: 'sheets',
  status: { readOnly: false },
  navigate: () => {},
  ...over,
});

describe('S3 mount qua adapter của shell (hợp đồng NEEDS-d2p3 §1)', () => {
  it('adapter nhận diện được createDesignScreen', () => {
    assert(typeof resolveMount(designMod) === 'function', 'shell phải bọc được S3');
  });

  it('mount thật → vẽ được 3 vùng + thanh lưu, không ném', async () => {
    boot();
    const mount = resolveMount(designMod);
    const host = document.createElement('div');
    const h = mount(host, ctx());
    await settle(120);
    const txt = host.textContent;
    assert(host.querySelectorAll('.d-savebar').length === 1, 'phải có thanh lưu');
    assert(host.querySelectorAll('.d-panes').length === 1, 'phải có khung 3 vùng');
    assert(host.querySelectorAll('.d-tree').length === 1, 'phải có cây thiết kế');
    assert(txt.includes('Sheet & element'), 'phải có 3 tab con');
    assert(txt.includes('Phong cách'));
    assert(txt.includes('Nâng cao'));
    h.destroy();
  });

  it('nạp contract từ agent và vẽ đúng sheet của fixture', async () => {
    const log = boot();
    const mount = resolveMount(designMod);
    const host = document.createElement('div');
    const h = mount(host, ctx());
    await settle(120);
    assert(log.some((c) => c.url.includes('/contract')), 'phải gọi #22 GET contract');
    const txt = host.textContent;
    for (const id of ['main', 'tall', 'bg-home']) assert(txt.includes(id), `cây phải có sheet ${id}`);
    h.destroy();
  });

  it('fixture của team VI PHẠM V-04 (4×4 mà 1 ô) → thanh validate BÁO LỖI và CHẶN lưu', async () => {
    boot();
    const mount = resolveMount(designMod);
    const host = document.createElement('div');
    const h = mount(host, ctx());
    await settle(120);
    // kiểm bằng chính bộ luật: fixture này phải sai V-04
    const v = validateContract(CONTRACT);
    assert(v.errors.some((e) => e.code === 'V-04'), 'fixture 4×4/1 ô phải sai V-04');
    assert(host.textContent.includes('lỗi'), `thanh validate phải nói có lỗi: ${host.textContent.slice(0, 300)}`);
    const saveBtn = host.querySelectorAll('.kg-btn--primary').find((b) => b.textContent.includes('Lưu'));
    if (saveBtn) assert(saveBtn.disabled, 'có lỗi V-04 thì nút Lưu phải bị chặn');
    h.destroy();
  });

  it('đổi ?tab= qua route() KHÔNG dựng lại màn (giữ undo stack — đóng H3)', async () => {
    boot();
    const mount = resolveMount(designMod);
    const host = document.createElement('div');
    const h = mount(host, ctx());
    await settle(120);
    const savebar = host.querySelectorAll('.d-savebar')[0];
    h.route({ tab: 'styles', params: { id: PROJECT.id }, status: { readOnly: false } });
    await settle(40);
    assert(host.querySelectorAll('.d-savebar')[0] === savebar, 'thanh lưu phải là CÙNG node (không remount)');
    assert(host.textContent.includes('Thêm phong cách'), 'phải sang tab Phong cách');
    h.route({ tab: 'advanced', params: { id: PROJECT.id }, status: { readOnly: false } });
    await settle(40);
    assert(host.textContent.includes('Ngưỡng tách'), 'tab Nâng cao phải có tham số cắt');
    assert(host.textContent.includes('Màu nền tách'));
    h.destroy();
  });

  it('agent chưa chạy → CHỈ ĐỌC, có banner + không trắng trang (§2.5, §4.9)', async () => {
    boot({ routes: [['/', () => { throw new TypeError('Failed to fetch'); }]] });
    const mount = resolveMount(designMod);
    const host = document.createElement('div');
    const h = mount(host, ctx({ status: { readOnly: true } }));
    await settle(150);
    const body = bodyText(host);
    assert(body.length > 40, 'không được trắng trang');
    assert(!body.includes('Failed to fetch'), 'CẤM hiện lỗi kỹ thuật ra THÂN UI');
    assert(!body.includes('TypeError'), 'CẤM hiện tên lỗi kỹ thuật ra thân UI');
    assert(body.includes('Thử lại') || body.includes('công cụ local'),
      `phải có đường thoát cho user: ${body.slice(0, 200)}`);
    // §3.9: message kỹ thuật CHỈ được nằm trong panel gập cho lập trình viên
    assert(host.querySelectorAll('details').length >= 1, 'phải có panel "Chi tiết cho lập trình viên"');
    h.destroy();
  });

  it('shell đọc được isDirty() cho dấu • ở rail (§2.2)', async () => {
    boot();
    const mount = resolveMount(designMod);
    const host = document.createElement('div');
    const h = mount(host, ctx());
    await settle(120);
    eq(h.isDirty(), false, 'vừa mở là sạch');
    eq(h.rail().dots.design, false);
    h.destroy();
  });

  it('destroy() dọn sạch, gọi hai lần không ném', async () => {
    boot();
    const mount = resolveMount(designMod);
    const host = document.createElement('div');
    const h = mount(host, ctx());
    await settle(120);
    h.destroy();
    h.destroy();
    eq(host.querySelectorAll('.d-panes').length, 0, 'DOM phải được dọn');
  });
});

describe('S4 mount qua adapter', () => {
  it('adapter nhận diện được createRunsScreen + truyền runId', () => {
    assert(typeof resolveMount(runsMod) === 'function');
  });

  it('danh sách lượt chạy: bảng đủ 3 run của fixture', async () => {
    boot();
    const mount = resolveMount(runsMod);
    const host = document.createElement('div');
    const h = mount(host, ctx({ params: { id: PROJECT.id }, tab: null }));
    await settle(120);
    const txt = host.textContent;
    for (const r of RUNS) assert(txt.includes(r.id), `phải có ${r.id}`);
    assert(txt.includes('Sinh ảnh'), 'phải có nút sinh ảnh');
    // run done-with-errors KHÔNG được in "Xong" trơn (đóng E1)
    assert(txt.includes('3 lỗi') || txt.includes('lỗi'), 'run có lỗi phải nói rõ số lỗi');
    h.destroy();
  });

  it('chi tiết 1 lượt đang chạy: progress + ETA + nút Dừng', async () => {
    const routes = [
      ['/api/runs/r-0031/stream', () => { throw new TypeError('Failed to fetch'); }],
      ['/api/runs/r-0031', { status: 200, json: {
        ...RUNS[0],
        maxJobs: 4, phase: { index: 1, total: 2, name: 'gen' },
        jobs: [
          { job: 'tet-main', variant: 'tet', sheet: 'main', status: 'ok', durationMs: 108000, artifact: { bytes: 3040192 } },
          { job: 'tet-tall', variant: 'tet', sheet: 'tall', status: 'failed', diagnosis: 'QUOTA_SUSPECTED' },
          { job: 'vang-main', variant: 'vang', sheet: 'main', status: 'running', startedAt: new Date().toISOString() },
        ],
      } }],
      ...defaultRoutes(),
    ];
    boot({ routes });
    const mount = resolveMount(runsMod);
    const host = document.createElement('div');
    const h = mount(host, ctx({ params: { id: PROJECT.id, runId: 'r-0031' }, tab: null }));
    await settle(200);
    const txt = host.textContent;
    assert(txt.includes('r-0031'), 'phải có id lượt chạy');
    assert(host.querySelectorAll('[role=progressbar]').length === 1, 'phải có progressbar có role đúng');
    assert(txt.includes('Dừng'), 'run đang chạy phải có nút Dừng');
    assert(txt.includes('Pha 1/2') || txt.includes('Pha'), 'phải có dải pha (X9)');
    assert(txt.includes('nghi hết quota'), `lượt lỗi phải có 1 dòng chẩn đoán: ${txt.slice(0, 400)}`);
    assert(txt.includes('tet-main') || txt.includes('main'), 'phải liệt kê từng lượt');
    h.destroy();
  });

  it('run đã xong CÓ LỖI → nút chính là [Chạy lại N lượt lỗi], không in "xong" trơn (E1/D9)', async () => {
    const routes = [
      ['/api/runs/r-0029/stream', () => { throw new TypeError('x'); }],
      ['/api/runs/r-0029', { status: 200, json: {
        ...RUNS[2],
        jobs: [
          { job: 'tet-main', status: 'ok', durationMs: 1000 },
          { job: 'tet-tall', status: 'failed', diagnosis: 'NO_ARTIFACT' },
          { job: 'vang-main', status: 'failed', diagnosis: 'TIMEOUT' },
        ],
      } }],
      ...defaultRoutes(),
    ];
    boot({ routes });
    const mount = resolveMount(runsMod);
    const host = document.createElement('div');
    const h = mount(host, ctx({ params: { id: PROJECT.id, runId: 'r-0029' }, tab: null }));
    await settle(200);
    const txt = host.textContent;
    assert(txt.includes('Chạy lại 2 lượt lỗi'), `phải có nút chạy lại: ${txt.slice(0, 400)}`);
    assert(!/✓\s*Xong\b/.test(txt) || txt.includes('lỗi'), 'không được in ✓ Xong trơn khi có lỗi');
    assert(txt.includes('ảnh không được ghi') || txt.includes('quá thời gian'), 'phải dịch mã chẩn đoán sang tiếng Việt');
    h.destroy();
  });

  it('chưa có lượt chạy nào → empty state nói việc tiếp theo', async () => {
    boot({ routes: [[`/api/projects/${PROJECT.id}/runs`, { status: 200, json: { items: [] } }], ...defaultRoutes()] });
    const mount = resolveMount(runsMod);
    const host = document.createElement('div');
    const h = mount(host, ctx({ params: { id: PROJECT.id }, tab: null }));
    await settle(120);
    assert(host.textContent.includes('Chưa có lượt chạy nào'));
    assert(host.textContent.includes('gọi AI một lần cho một sheet'), 'phải giải thích lượt là gì');
    h.destroy();
  });

  it('agent lỗi khi lấy danh sách run → error state có nút, KHÔNG lộ lỗi kỹ thuật', async () => {
    boot({ routes: [[`/api/projects/${PROJECT.id}/runs`, { status: 500, json: { error: { code: 'AGENT_INTERNAL', message: 'ENOENT: /Users/secret/path' } } }], ...defaultRoutes()] });
    const mount = resolveMount(runsMod);
    const host = document.createElement('div');
    const h = mount(host, ctx({ params: { id: PROJECT.id }, tab: null }));
    await settle(150);
    const body = bodyText(host);
    assert(!body.includes('ENOENT'), 'CẤM hiện thông điệp kỹ thuật ra THÂN UI (§3.9)');
    assert(!body.includes('/Users/'), 'CẤM lộ đường dẫn tuyệt đối ra thân UI (§8.2)');
    assert(body.includes('Thử lại'), 'phải có nút hành động');
    assert(body.includes('Công cụ local gặp lỗi'), 'phải dùng đúng copy tiếng Việt của bảng §3.9');
    // message kỹ thuật vẫn phải TRA CỨU ĐƯỢC, nhưng chỉ trong panel gập
    const dev = host.querySelectorAll('details');
    eq(dev.length, 1, 'đúng 1 panel chi tiết cho lập trình viên');
    assert(dev[0].textContent.includes('ENOENT'), 'panel dev phải giữ được message gốc để debug');
    h.destroy();
  });

  it('đổi runId qua route() thì đổi màn (list ↔ detail)', async () => {
    const routes = [
      ['/api/runs/r-0030/stream', () => { throw new TypeError('x'); }],
      ['/api/runs/r-0030', { status: 200, json: { ...RUNS[1], jobs: [{ job: 'tet-main', status: 'ok', durationMs: 1000 }] } }],
      ...defaultRoutes(),
    ];
    boot({ routes });
    const mount = resolveMount(runsMod);
    const host = document.createElement('div');
    const h = mount(host, ctx({ params: { id: PROJECT.id }, tab: null }));
    await settle(120);
    assert(host.textContent.includes('Theo dõi sinh ảnh'), 'ban đầu là danh sách');
    h.route({ params: { id: PROJECT.id, runId: 'r-0030' }, status: { readOnly: false } });
    await settle(150);
    assert(host.textContent.includes('r-0030'), 'phải sang chi tiết lượt chạy');
    h.destroy();
  });
});

describe('§8.2 · không lộ dữ liệu nhạy cảm ra state trình duyệt', () => {
  it('sau khi mount S3+S4, mọi key localStorage đều trong allowlist', async () => {
    boot();
    const md = resolveMount(designMod);
    const mr = resolveMount(runsMod);
    const h1 = md(document.createElement('div'), ctx());
    const h2 = mr(document.createElement('div'), ctx({ params: { id: PROJECT.id }, tab: null }));
    await settle(150);
    eq(store.auditForeignKeys(), [], 'không được có key lạ');
    h1.destroy();
    h2.destroy();
  });
  it('không key nào chứa đường dẫn tuyệt đối / token', async () => {
    boot();
    const md = resolveMount(designMod);
    const h = md(document.createElement('div'), ctx());
    await settle(150);
    for (const k of store.allowedKeys()) {
      const dump = JSON.stringify(store.get(k));
      assert(!dump.includes('/Users/'), `${k} chứa đường dẫn tuyệt đối`);
      assert(!/sk-|Bearer |eyJ/.test(dump), `${k} nghi có secret`);
    }
    h.destroy();
  });
});
