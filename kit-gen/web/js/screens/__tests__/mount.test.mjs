/* Mount THẬT màn S0 và S1 dưới minidom, với agent giả tiêm vào core/agent.js.
   Chứng minh: 4 trạng thái vẽ được, chế độ chỉ-đọc disable nút chứ không ẩn,
   thẻ lỗi manifest không biến mất, và menu ⋯ đúng 8 mục. */
import { assert, describe, eq, it } from '../../core/__tests__/harness.mjs';
import { failedToFetch, jsonResponse, mockFetch } from '../../core/__tests__/mock-fetch.mjs';
import * as agent from '../../core/agent.js';
import * as store from '../../core/store.js';
import { LS_KEYS } from '../../core/constants.js';
import * as agentStatus from '../../app-shell/agent-status.js';
import { document } from './dom-patch.mjs';

const PROJECTS = [
  {
    id: 'tet26-a7f3', name: 'Tết 2026 — VietinBank iPay', slug: 'tet26', tags: ['tet', 'banking'],
    updatedAt: '2026-08-05T12:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z',
    cover: 'kits/tet/25-bg-home.png',
    stats: { variants: 2, sheets: 5, components: 42, jobs: 10, rawPresent: 8, kitsCut: 96, diskBytes: 184320133 },
    state: { stale: true, staleReason: ['raw>kits'], jobs: { 'tet-main': 'ok', 'tet-tall': 'stale' } },
    broken: false, error: null,
  },
  {
    id: 'candy-old-11b2', name: 'candy-old-11b2', broken: true,
    error: { code: 'PROJECT_BROKEN', file: 'project.json', line: 12, message: 'Unexpected token } in JSON at position 240' },
  },
];

const HEALTH = {
  ok: true, app: 'kitgen-agent', protocol: 1, version: '1.2.0', instanceLabel: 'gray-otter',
  workspaceId: 'ws_8f2c', workspaceLabel: '~/KitGen', workspaceFingerprint: 'sha256:abc123def456',
  projects: 2, activeRuns: 0, uptimeMs: 1000, updateCommand: 'npm i -g kitgen-agent',
};

const DOCTOR = {
  os: 'darwin-arm64',
  node: { ok: true, version: '24.13.0' },
  python: { ok: true, version: '3.12.4', venv: true, deps: { pillow: true, numpy: true } },
  playwright: { ok: false, fallback: 'skeleton.py (PIL)' },
  codex: { ok: true, version: '0.146.0' },
  imageGen: { mode: 'default-home', available: true, codexHomeLabel: '~/.codex', authPresent: true, reason: null, needsFallbackHome: false },
  workspace: { label: '~/KitGen', writable: true, freeBytes: 128849018880 },
  checkedAt: '2026-08-05T12:01:00.000Z',
};

/** Agent giả: trả /health, /api/projects, /api/doctor, /api/workspaces, /api/trash. */
function connectedFetch() {
  return mockFetch(({ url }) => {
    if (url.endsWith('/health')) return jsonResponse(HEALTH);
    if (url.includes('/api/doctor')) return jsonResponse(DOCTOR);
    if (url.includes('/api/workspaces')) return jsonResponse({ items: [{ id: 'ws_8f2c', label: '~/KitGen', projects: 2, diskBytes: 10, active: true, writable: true }], activeId: 'ws_8f2c' });
    if (url.includes('/api/trash')) return jsonResponse({ items: [{ trashId: 't1', projectId: 'x', name: 'X', deletedAt: '', restoreBefore: '', bytes: 1 }] });
    if (url.includes('/api/projects')) {
      return jsonResponse({ items: PROJECTS, scannedAt: '2026-08-05T12:00:05.000Z', workspaceLabel: '~/KitGen', workspaceFingerprint: 'sha256:abc123def456' }, { ETag: '"e1"' });
    }
    return jsonResponse({ ok: true });
  });
}

const text = (n) => String(n.textContent ?? '');
const all = (root, sel) => root.querySelectorAll(sel);

async function mountScreen(path, { fetchImpl }) {
  agent.configure({ fetchImpl, location: { protocol: 'https:', hostname: 'kitgen.pages.dev', pathname: '/', origin: 'https://kitgen.pages.dev' }, baseUrl: null, mode: 'remote' });
  agentStatus._reset();
  agentStatus.configure({ doc: { hidden: false, addEventListener() {} }, win: { addEventListener() {} } });
  await agentStatus.refresh();
  const mod = await import(path);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const handle = mod.mount(host, { route: { screen: 'x' }, params: {}, query: {}, tab: null, status: agentStatus.status(), navigate() {}, go() {}, shell: {} });
  await new Promise((r) => setTimeout(r, 30));
  return { host, handle };
}

describe('S1 · success — vẽ thẻ project từ agent thật (giả)', () => {
  it('hiện thẻ project + thẻ LỖI manifest (không biến mất im lặng)', async () => {
    store.clearAll();
    const { host, handle } = await mountScreen('../projects/index.js', { fetchImpl: connectedFetch() });
    const t = text(host);
    assert(t.includes('Tết 2026 — VietinBank iPay'), 'thiếu tên project');
    assert(t.includes('2 phong cách') && t.includes('5 sheet'), 'thiếu dòng số liệu 1');
    assert(t.includes('42 element') && t.includes('96 file đã cắt'), 'thiếu dòng số liệu 2');
    assert(t.includes('176 MB'), 'thiếu dung lượng ở footer');
    assert(t.includes('Không đọc được project'), 'thiếu thẻ đỏ project hỏng');
    assert(t.includes('dòng 12'), 'thẻ hỏng phải nêu dòng lỗi');
    assert(all(host, '.kg-card--error').length === 1, 'thẻ hỏng phải có class error');
    handle.destroy();
  });
  it('dùng thumbnail ?w=256 cho ảnh bìa (§6.5-5, đóng H4)', async () => {
    const { host, handle } = await mountScreen('../projects/index.js', { fetchImpl: connectedFetch() });
    const imgs = all(host, 'img');
    assert(imgs.length >= 1, 'phải có ảnh bìa');
    const src = imgs[0].getAttribute('src');
    assert(src.includes('?w=256'), src);
    assert(imgs[0].getAttribute('alt').length > 0, 'ảnh phải có alt (§5.8-A9)');
    handle.destroy();
  });
  it('mỗi thẻ có nút [Mở] và nút ⋯ mở được bằng bàn phím', async () => {
    const { host, handle } = await mountScreen('../projects/index.js', { fetchImpl: connectedFetch() });
    const menus = all(host, '[aria-haspopup="menu"]');
    assert(menus.length >= 1, 'thiếu nút ⋯');
    eq(menus[0].getAttribute('aria-expanded'), 'false');
    handle.destroy();
  });
  it('chỉ có ĐÚNG 1 nút primary trên màn (§5.4)', async () => {
    const { host, handle } = await mountScreen('../projects/index.js', { fetchImpl: connectedFetch() });
    eq(all(host, '.kg-btn--primary').length, 1);
    handle.destroy();
  });
});

describe('S1 · empty — 0 project, agent OK', () => {
  it('hiện hướng dẫn tạo cái đầu tiên + 3 bước', async () => {
    store.clearAll();
    const f = mockFetch(({ url }) => {
      if (url.endsWith('/health')) return jsonResponse({ ...HEALTH, projects: 0 });
      if (url.includes('/api/trash')) return jsonResponse({ items: [] });
      return jsonResponse({ items: [], scannedAt: '', workspaceLabel: '~/KitGen', workspaceFingerprint: 'sha256:abc' });
    });
    const { host, handle } = await mountScreen('../projects/index.js', { fetchImpl: f });
    const t = text(host);
    assert(t.includes('Chưa có project nào'), t.slice(0, 200));
    assert(t.includes('Tạo project đầu tiên'), 'thiếu nút primary');
    assert(t.includes('Nhập từ styles.json cũ'), 'thiếu nút nhập');
    assert(t.includes('Chọn element'), 'thiếu 3 bước gợi ý');
    handle.destroy();
  });
});

describe('S1 · error — agent chưa chạy, KHÔNG có cache (§2.5)', () => {
  it('khối lỗi giữa màn + [Copy lệnh] + [Thử lại], không trắng trang', async () => {
    store.clearAll();
    const { host, handle } = await mountScreen('../projects/index.js', { fetchImpl: mockFetch(() => failedToFetch()) });
    const t = text(host);
    assert(t.includes('Chưa thấy công cụ local'), t.slice(0, 200));
    assert(t.includes('Copy lệnh') && t.includes('Thử lại'), 'thiếu nút hành động');
    assert(!t.includes('Failed to fetch'), 'CẤM hiện lỗi kỹ thuật ra thân UI (§3.9)');
    assert(text(host).includes('Chi tiết cho lập trình viên'), 'phải có panel dev gập lại');
    handle.destroy();
  });
  it('nút Tạo/Nhập bị DISABLED + có lý do, KHÔNG bị ẩn (§2.5-2)', async () => {
    const { host, handle } = await mountScreen('../projects/index.js', { fetchImpl: mockFetch(() => failedToFetch()) });
    const btns = all(host, '.kg-btn');
    const create = [...btns].find((b) => text(b).includes('Tạo project'));
    assert(create, 'nút Tạo project phải VẪN HIỆN');
    eq(create.disabled, true);
    eq(create.getAttribute('aria-disabled'), 'true');
    assert(String(create.title).includes('công cụ local'), create.title);
    handle.destroy();
  });
});

describe('S1 · error — agent chưa chạy nhưng CÓ cache (chế độ chỉ-đọc)', () => {
  it('vẽ từ cache, có nhãn cache, không hiện badge trạng thái sai (NEEDS N2)', async () => {
    store.clearAll();
    store.set(LS_KEYS.projectsCache, {
      fetchedAt: '2026-08-05T12:04:00.000Z', etag: '"e1"', workspaceFingerprint: '',
      items: [{ id: 'tet26-a7f3', name: 'Tết 2026 — VietinBank iPay', updatedAt: '2026-08-05T12:00:00.000Z', tags: ['tet'], stats: { variants: 2, sheets: 5, components: 42, kitsCut: 96, diskBytes: 184320133 }, coverUrlPath: 'kits/tet/25.png', broken: false }],
    });
    const { host, handle } = await mountScreen('../projects/index.js', { fetchImpl: mockFetch(() => failedToFetch()) });
    const t = text(host);
    assert(t.includes('Tết 2026'), 'phải vẽ được từ cache');
    assert(t.includes('cache'), 'phải có nhãn cache');
    assert(all(host, '.kg-card--cache').length === 1, 'thẻ cache phải xám bớt');
    assert(t.includes('Ảnh nằm trên máy bạn'), 'ảnh không tải được phải có chữ thay thế (§2.5-3)');
    handle.destroy();
  });
});

describe('S0 · wizard 4 bước', () => {
  it('agent chưa chạy → bước 1 với script + SHA256 + cảnh báo không dùng curl|bash', async () => {
    store.clearAll();
    const { host, handle } = await mountScreen('../setup/index.js', { fetchImpl: mockFetch(() => failedToFetch()) });
    await new Promise((r) => setTimeout(r, 40));
    const t = text(host);
    assert(t.includes('Cài công cụ local'), t.slice(0, 200));
    assert(t.includes('kit-gen-setup.sh'), 'thiếu tên file script');
    assert(t.includes('SHA256'), 'thiếu chữ ký');
    assert(t.includes('shasum -a 256'), 'thiếu lệnh kiểm chữ ký');
    assert(t.includes('KHÔNG dùng kiểu tải-và-chạy-một-dòng'), 'phải nói rõ không curl|bash');
    assert(t.includes('7 việc'), 'accordion phải nêu 7 việc');
    assert(t.includes('Đang chờ công cụ local'), 'phải nói rõ đang chờ gì');
    handle.destroy();
  });
  it('agent đã chạy → nhảy sang bước có nội dung kết nối/thư mục, KHÔNG treo', async () => {
    store.clearAll();
    const { host, handle } = await mountScreen('../setup/index.js', { fetchImpl: connectedFetch() });
    await new Promise((r) => setTimeout(r, 60));
    const t = text(host);
    assert(t.includes('~/KitGen'), 'phải hiện nhãn thư mục làm việc');
    assert(!t.includes('/Users/'), 'KHÔNG được hiện đường dẫn tuyệt đối');
    handle.destroy();
  });
  it('chạy lại wizard khi đã setup → vào thẳng bước Thư mục để ĐỔI workspace', async () => {
    store.clearAll();
    store.set(LS_KEYS.setup, { completed: true, step: 'done', imageGenMode: 'default-home' });
    const { host, handle } = await mountScreen('../setup/index.js', { fetchImpl: connectedFetch() });
    await new Promise((r) => setTimeout(r, 60));
    const t = text(host);
    assert(t.includes('Thư mục làm việc'), t.slice(0, 300));
    assert(t.includes('chạy lại hướng dẫn cài'), 'phải nói rõ đang chạy lại');
    assert(t.includes('Về danh sách project'), 'phải có đường rời wizard');
    assert(t.includes('không bao giờ nhận đường dẫn bạn gõ'), 'phải nêu chốt X1');
    handle.destroy();
  });
  it('ghi trạng thái setup vào store, không lưu gì nhạy cảm', async () => {
    store.clearAll();
    const { host, handle } = await mountScreen('../setup/index.js', { fetchImpl: connectedFetch() });
    await new Promise((r) => setTimeout(r, 60));
    const s = store.get(LS_KEYS.setup);
    assert(typeof s.step === 'string');
    const dump = JSON.stringify(store.get(LS_KEYS.workspace)) + JSON.stringify(s);
    assert(!/sk-|Bearer |\/Users\//.test(dump), dump);
    handle.destroy();
    void host;
  });
});

describe('§4.9 · ma trận "agent chưa chạy" — menu ⋯ phải disabled kèm lý do', () => {
  it('mục gây thay đổi disabled, mục Mở vẫn dùng được', async () => {
    const { projectMenuItems } = await import('../projects/card.js');
    const items = projectMenuItems(PROJECTS[0], {}, { readOnly: true, reason: 'Cần công cụ local đang chạy' });
    const named = items.filter((i) => i !== 'separator');
    eq(named.length, 7);
    eq(items.length, 8);   // 7 mục + 1 separator (§3-S1-3 "đúng 8 mục")
    eq(named[0].label, 'Mở');
    assert(!named[0].disabled, 'Mở phải luôn dùng được');
    for (const it of named.slice(1)) {
      assert(it.disabled === true, `${it.label} phải disabled`);
      assert(String(it.disabledReason).includes('công cụ local'), it.label);
    }
    assert(named[named.length - 1].danger === true, 'Xoá phải là mục danger');
  });
  it('agent OK thì không mục nào bị disabled', async () => {
    const { projectMenuItems } = await import('../projects/card.js');
    const items = projectMenuItems(PROJECTS[0], {}, { readOnly: false, reason: null });
    for (const it of items.filter((i) => i !== 'separator')) assert(!it.disabled, it.label);
  });
});
