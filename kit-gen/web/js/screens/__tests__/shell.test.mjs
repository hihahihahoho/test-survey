/* app-shell: bảng mount point, adapter cho hợp đồng của team khác, agent pill 6 trạng thái,
   banner chỉ-đọc §2.5, và cam kết "màn chưa thi công thì app vẫn chạy" (§6.5-6). */
import { assert, describe, eq, it } from '../../core/__tests__/harness.mjs';
import { failedToFetch, jsonResponse, mockFetch } from '../../core/__tests__/mock-fetch.mjs';
import * as agent from '../../core/agent.js';
import { ROUTES } from '../../core/routes.js';
import { document } from './dom-patch.mjs';
import { HAS_RAIL, SCREENS, SCREEN_LABEL, loadScreen } from '../../app-shell/screen-registry.js';
import { adaptFactory, resolveMount } from '../../app-shell/screen-adapters.js';
import { createStatusBanner, createHeader } from '../../app-shell/chrome.js';
import { createRail } from '../../app-shell/rail.js';
import * as agentStatus from '../../app-shell/agent-status.js';

const text = (n) => String(n.textContent ?? '');

describe('MOUNT POINT · bảng màn phủ đúng sitemap §2.1', () => {
  it('mỗi route trong core/routes.js đều có chỗ mount', () => {
    for (const r of ROUTES) {
      assert(Object.hasOwn(SCREENS, r.screen), `thiếu mount point cho ${r.id} (${r.screen})`);
      assert(typeof SCREEN_LABEL[r.screen] === 'string', `thiếu nhãn cho ${r.screen}`);
    }
  });
  it('không khai màn nào ngoài sitemap (§2.1 "không có màn nào khác")', () => {
    const declared = new Set(ROUTES.map((r) => r.screen));
    for (const k of Object.keys(SCREENS)) assert(declared.has(k), `màn lạ: ${k}`);
  });
  it('S1 và S6 KHÔNG có rail; các màn trong project thì CÓ (§2.2)', () => {
    assert(!HAS_RAIL.has('projects'));
    assert(!HAS_RAIL.has('settings'));
    assert(!HAS_RAIL.has('setup'));
    for (const s of ['project', 'design', 'runs', 'run-detail', 'kit', 'project-settings']) {
      assert(HAS_RAIL.has(s), s);
    }
  });
  it('nạp được màn S0/S1 của tôi và các màn của team khác đang có mặt', async () => {
    for (const id of Object.keys(SCREENS)) {
      const mod = await loadScreen(id);
      assert(mod !== null && typeof mod.mount === 'function', `màn "${id}" chưa nạp được`);
    }
  });
  it('màn không tồn tại trong bảng → null, KHÔNG ném (app vẫn chạy, §6.5-6)', async () => {
    eq(await loadScreen('không-có-màn-này'), null);
  });
});

describe('ADAPTER · hợp đồng khác vẫn mount được mà không sửa file team khác', () => {
  it('module có mount() thì dùng nguyên', () => {
    const f = () => {};
    eq(resolveMount({ mount: f }), f);
  });
  it('module theo hợp đồng createDesignScreen/createRunsScreen được bọc tự động', () => {
    assert(typeof resolveMount({ createDesignScreen: () => ({ el: document.createElement('div') }) }) === 'function');
    assert(typeof resolveMount({ createRunsScreen: () => ({ el: document.createElement('div') }) }) === 'function');
  });
  it('module không theo hợp đồng nào → null (placeholder, không vỡ)', () => {
    eq(resolveMount({ somethingElse: 1 }), null);
    eq(resolveMount(null), null);
  });
  it('adapter chuyển route/status/destroy đúng và lấy được isDirty cho dấu • ở rail', () => {
    const calls = [];
    let dirty = false;
    const mount = adaptFactory((opts) => {
      calls.push(['create', opts.projectId, opts.tab, opts.readOnly]);
      return {
        el: document.createElement('div'),
        update: (o) => calls.push(['update', o.tab ?? null, o.readOnly ?? null]),
        destroy: () => calls.push(['destroy']),
        isDirty: () => dirty,
      };
    });
    const host = document.createElement('div');
    const h = mount(host, { params: { id: 'p1' }, tab: 'sheets', status: { readOnly: false }, navigate() {} });
    eq(calls[0], ['create', 'p1', 'sheets', false]);
    h.route({ tab: 'styles', status: { readOnly: false } });
    eq(calls[1], ['update', 'styles', false]);
    h.status({ readOnly: true });
    eq(calls[2], ['update', null, true]);
    eq(h.rail().dots.design, false);
    dirty = true;
    eq(h.rail().dots.design, true);
    h.destroy();
    eq(calls[calls.length - 1], ['destroy']);
    assert(host.children.length === 1, 'phải append el của màn vào host');
  });
});

describe('§2.4 · agent pill 6 trạng thái, LUÔN có chữ (audit I1)', () => {
  const cases = [
    [() => mockFetch(({ url }) => (url.endsWith('/health') ? jsonResponse({ ok: true, protocol: 1, version: '1.2.0', workspaceLabel: '~/KitGen' }) : jsonResponse({}))), 'Đã kết nối'],
    [() => mockFetch(() => failedToFetch()), 'Chưa thấy công cụ local'],
    [() => mockFetch(() => jsonResponse({ error: { code: 'ORIGIN_NOT_ALLOWED' } }, { status: 403 })), 'Trình duyệt đang chặn'],
    [() => mockFetch(({ url }) => (url.endsWith('/health') ? jsonResponse({ ok: true, protocol: 9 }, { 'X-KitGen-Protocol': '9' }) : jsonResponse({}))), 'Công cụ local'],
    [() => mockFetch(({ url }) => (url.endsWith('/health') ? jsonResponse({ ok: true, protocol: 1, imageGen: { available: false } }) : jsonResponse({}))), 'Chưa tạo được ảnh'],
  ];
  for (const [makeFetch, expect] of cases) {
    it(`pill hiện CHỮ "${expect}"`, async () => {
      agent.configure({ fetchImpl: makeFetch(), location: { protocol: 'https:', hostname: 'kitgen.pages.dev', pathname: '/', origin: 'https://kitgen.pages.dev' }, baseUrl: null });
      agentStatus._reset();
      agentStatus.configure({ doc: { hidden: false, addEventListener() {} }, win: { addEventListener() {} } });
      const st = await agentStatus.refresh();
      const header = createHeader({});
      header.renderStatus(st);
      const t = text(header.el);
      assert(t.includes(expect), `pill="${t}" mong có "${expect}" (pill=${st.pill})`);
    });
  }
});

describe('§2.5 · banner chế độ chỉ-đọc', () => {
  it('agent chưa chạy → banner vàng + [Copy lệnh] + [Thử lại] + [Vì sao?]', () => {
    const b = createStatusBanner();
    b.render({ pill: 'not-running', code: 'AGENT_NOT_RUNNING', readOnly: true, health: null, mirrorUrl: 'http://127.0.0.1:8765/app/' });
    const t = text(b.el);
    assert(t.includes('Chưa thấy công cụ local'), t);
    assert(t.includes('Copy lệnh') && t.includes('Thử lại') && t.includes('Vì sao?'), t);
    assert(b.el.querySelectorAll('.kg-banner--warning').length === 1, 'phải là banner vàng');
  });
  it('trình duyệt chặn → nút chính là [Mở bản chạy tại máy]', () => {
    const b = createStatusBanner();
    b.render({ pill: 'blocked-by-browser', code: 'AGENT_BLOCKED_BY_BROWSER', readOnly: true, mirrorUrl: 'http://127.0.0.1:8765/app/' });
    assert(text(b.el).includes('Mở bản chạy tại máy'), text(b.el));
  });
  it('đang kiểm tra → nói rõ đang chờ gì, không để trống', () => {
    const b = createStatusBanner();
    b.render({ pill: 'checking', readOnly: true });
    assert(text(b.el).includes('Đang tìm công cụ local'), text(b.el));
  });
  it('kết nối lại sau khi chỉ-đọc → banner xanh "Đã kết nối lại"', () => {
    const b = createStatusBanner();
    b.render({ pill: 'not-running', code: 'AGENT_NOT_RUNNING', readOnly: true });
    b.render({ pill: 'connected', readOnly: false });
    assert(text(b.el).includes('Đã kết nối lại'), text(b.el));
  });
  it('bình thường (chưa từng mất kết nối) → KHÔNG có banner nào', () => {
    const b = createStatusBanner();
    b.render({ pill: 'connected', readOnly: false });
    eq(text(b.el), '');
  });
});

describe('§2.2 · rail 5 mục', () => {
  it('đúng 5 mục, mục đang mở có aria-current="page"', () => {
    const r = createRail({ onNavigate() {} });
    r.render({ screenId: 'design', projectId: 'p1' });
    const btns = r.el.querySelectorAll('button');
    eq(btns.length, 5);
    const cur = [...btns].filter((b) => b.getAttribute('aria-current') === 'page');
    eq(cur.length, 1);
    assert(text(cur[0]).includes('Thiết kế'), text(cur[0]));
  });
  it('chi tiết lượt chạy vẫn sáng ở mục "Sinh ảnh"', () => {
    const r = createRail({ onNavigate() {} });
    r.render({ screenId: 'run-detail', projectId: 'p1' });
    const cur = [...r.el.querySelectorAll('button')].find((b) => b.getAttribute('aria-current') === 'page');
    assert(text(cur).includes('Sinh ảnh'), text(cur));
  });
  it('dấu • chưa lưu có kèm CHỮ cho screen reader (§5.8-A3)', () => {
    const r = createRail({ onNavigate() {} });
    r.render({ screenId: 'design', projectId: 'p1', dots: { design: true } });
    assert(text(r.el).includes('(có thay đổi chưa lưu)'), text(r.el));
  });
  it('không có project → rail rỗng (S1/S6 full width)', () => {
    const r = createRail({ onNavigate() {} });
    r.render({ screenId: 'projects', projectId: null });
    eq(r.el.querySelectorAll('button').length, 0);
  });
});
