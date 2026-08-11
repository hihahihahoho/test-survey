/**
 * e2e-agent.test.mjs — NỐI THẬT: màn S1 + CRUD của tôi ↔ AGENT THẬT ↔ ổ đĩa thật.
 *
 * Không mock agent. Ta dựng `createAgent()` của team agent rồi lái đúng `http.Server`
 * thật của họ qua cặp duplex trong bộ nhớ (harness của họ đã làm sẵn — môi trường này
 * chặn bind TCP, xem agent/test/harness.mjs). Request đi qua NGUYÊN pipeline:
 * Host → Origin → header ép preflight → rate limit → router → fs.
 * Vì vậy ca dưới đây chứng minh hợp đồng §6 khớp thật, không phải khớp với mock của tôi.
 *
 * Giới hạn trung thực: tầng vận chuyển TCP và hành vi thật của trình duyệt
 * (mixed-content/PNA) KHÔNG kiểm được ở đây.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assert, describe, eq, it } from '../../core/__tests__/harness.mjs';
import { createAgent } from '../../../../agent/server.mjs';
import { apiFor, fakeDoctor, CLIENT, PORT, PAGES } from '../../../../agent/test/harness.mjs';
import * as agent from '../../core/agent.js';
import * as store from '../../core/store.js';
import * as agentStatus from '../../app-shell/agent-status.js';
import { document } from './dom-patch.mjs';

process.env.KITGEN_DOCTOR_LITE = '1';

const tmp = await mkdtemp(join(tmpdir(), 'kitgen-e2e-'));
const wsRoot = join(tmp, 'KitGen');
const live = await createAgent({
  workspaces: [wsRoot], port: PORT, origins: [PAGES], print: () => {},
  rateLimit: 500, doctor: fakeDoctor(true),
});
live.state.port = PORT;
const { call } = apiFor(live.server);

/** Đóng gói FormData thành multipart/form-data thật (agent kiểm cả magic bytes). */
async function encodeFormData(fd) {
  const b = `----kitgene2e${Math.random().toString(16).slice(2)}`;
  const parts = [];
  for (const [name, value] of fd.entries()) {
    const isFile = typeof value === 'object' && value !== null && typeof value.arrayBuffer === 'function';
    const filename = isFile ? (value.name ?? 'file') : null;
    parts.push(Buffer.from(
      `--${b}\r\nContent-Disposition: form-data; name="${name}"`
      + (filename ? `; filename="${filename}"` : '') + '\r\n'
      + (isFile ? `Content-Type: ${value.type || 'application/octet-stream'}\r\n` : '')
      + '\r\n',
    ));
    parts.push(isFile ? Buffer.from(await value.arrayBuffer()) : Buffer.from(String(value)));
    parts.push(Buffer.from('\r\n'));
  }
  parts.push(Buffer.from(`--${b}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${b}` };
}

/** fetch() giả LẬP TRANSPORT: chuyển Request của core/agent.js sang HTTP thật của agent. */
function liveFetch() {
  return async (url, init = {}) => {
    const u = new URL(url);
    const headers = { ...CLIENT, ...(init.headers ?? {}) };
    // Client thật gửi Origin qua trình duyệt; ở đây ta gắn tay để qua allowlist §3.4 lớp 2.
    headers.origin = PAGES;
    headers.host = `127.0.0.1:${PORT}`;
    let body = init.body ?? null;
    // fetch thật tự đóng gói FormData; transport test phải làm tay (multipart/form-data).
    if (body !== null && typeof FormData !== 'undefined' && body instanceof FormData) {
      const enc = await encodeFormData(body);
      body = enc.body;
      headers['content-type'] = enc.contentType;
      delete headers['Content-Type'];
    }
    const r = await call(init.method ?? 'GET', u.pathname + u.search, { headers, body });
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      statusText: '',
      headers: { get: (k) => r.headers[String(k).toLowerCase()] ?? null },
      json: async () => { if (r.json === null) throw new Error('không phải JSON'); return r.json; },
      text: async () => r.text,
      blob: async () => ({ size: r.body.length }),
    };
  };
}

const LIVE_FETCH = liveFetch();

/**
 * Gắn transport THẬT cho core/agent.js.
 * Phải gọi ở ĐẦU MỖI CA: các suite khác trong cùng lần chạy cũng `configure()` vào
 * cùng module core/agent.js (state dùng chung), và thân `it()` chạy SAU khi mọi
 * module đã import xong — nên cấu hình đặt ở tầng module sẽ bị suite khác ghi đè.
 */
async function useLive() {
  agent.configure({
    fetchImpl: LIVE_FETCH,
    location: { protocol: 'https:', hostname: 'kitgen.pages.dev', pathname: '/', origin: PAGES },
    baseUrl: `http://127.0.0.1:${PORT}`,
    mode: 'remote',
  });
  agentStatus._reset();
  agentStatus.configure({ doc: { hidden: false, addEventListener() {} }, win: { addEventListener() {} } });
  await agentStatus.refresh();
}

/** api của core, đã bọc để mọi ca đều chắc chắn nói với agent thật. */
async function liveApi() {
  await useLive();
  return (await import('../../core/api.js')).default;
}

const text = (n) => String(n.textContent ?? '');
const projectsDir = join(wsRoot, 'projects');
const dirs = () => (existsSync(projectsDir) ? readdirSync(projectsDir) : []);
let uploadId = null;

describe('E2E · nối thật với agent (không mock)', () => {
  it('/health qua transport thật → pill "Đã kết nối", đọc được nhãn workspace', async () => {
    await useLive();
    store.clearAll();
    const st = agentStatus.status();
    eq(st.pill, 'connected');
    eq(st.workspaceLabel, live.registry.active.label);
    assert(!String(st.workspaceLabel).startsWith('/'), 'nhãn phải rút gọn, không phải path tuyệt đối');
  });
});

describe('E2E · §4.1 tạo project THẬT (template basic) → có thư mục trên đĩa', () => {
  let created = null;
  it('POST /api/projects tạo đúng 3 sheet · 25 ô và slug bỏ dấu', async () => {
    const api = await liveApi();
    const res = await api.projects.create({
      name: 'Tết 2026 — VietinBank iPay',
      template: 'basic',
      firstVariant: { id: 'tet-do', vi: 'Tết đỏ', bg: 'magenta' },
      tags: ['tet', 'banking'],
    });
    created = res.project;
    assert(/^tet-2026-vietinbank-ipay-[0-9a-f]{4}$/.test(created.id), `id: ${created.id}`);
    eq(created.stats.sheets, 3);
    eq(created.stats.components, 25);
    eq(created.name, 'Tết 2026 — VietinBank iPay');
  });
  it('thư mục thật tồn tại trên đĩa + contract.json đọc được', () => {
    assert(created !== null, 'ca tạo project phải chạy trước');
    assert(dirs().includes(created.id), `thư mục: ${dirs().join(',')}`);
    const c = JSON.parse(readFileSync(join(projectsDir, created.id, 'contract.json'), 'utf8'));
    eq(c.sheets.length, 3);
  });
  it('S1 mount THẬT → thẻ project hiện đúng số liệu do agent trả', async () => {
    await useLive();
    store.clearAll();
    const mod = await import('../projects/index.js');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const h = mod.mount(host, { route: { screen: 'projects' }, params: {}, query: {}, tab: null, status: agentStatus.status(), navigate() {}, go() {}, shell: {} });
    await new Promise((r) => setTimeout(r, 60));
    const t = text(host);
    assert(t.includes('Tết 2026 — VietinBank iPay'), t.slice(0, 300));
    assert(t.includes('1 phong cách') && t.includes('3 sheet'), t.slice(0, 400));
    assert(t.includes('25 element'), t.slice(0, 400));
    assert(t.includes('Chưa sinh ảnh lần nào') || t.includes('Chưa có'), 'phải hiện trạng thái never (§5.7)');
    h.destroy();
  });
});

describe('E2E · §4.3 nhân bản có chọn lọc', () => {
  it('duplicate contract+refs → project mới trên đĩa, contract giữ 3 sheet', async () => {
    const api = await liveApi();
    const before = dirs().length;
    const src = dirs()[0];
    const res = await api.projects.duplicate(src, {
      name: 'Tết 2026 (bản sao)', include: ['contract', 'refs'], variants: 'all',
    });
    eq(dirs().length, before + 1);
    const c = JSON.parse(readFileSync(join(projectsDir, res.project.id, 'contract.json'), 'utf8'));
    eq(c.sheets.length, 3);
    eq(res.project.stats.sheets, 3);
  });
  it('nhân bản chỉ giữ 1 phong cách thì contract chỉ còn phong cách đó', async () => {
    const api = await liveApi();
    const src = dirs()[0];
    const res = await api.projects.duplicate(src, {
      name: 'Chỉ Tết đỏ', include: ['contract'], variants: ['tet-do'],
    });
    const c = JSON.parse(readFileSync(join(projectsDir, res.project.id, 'contract.json'), 'utf8'));
    eq(c.variants.map((v) => v.id), ['tet-do']);
  });
});

describe('E2E · §4.4 xoá = vào thùng rác, Hoàn tác phục hồi được (đóng B3)', () => {
  it('DELETE → thư mục biến khỏi projects/, xuất hiện trong .kitgen/trash/', async () => {
    const api = await liveApi();
    const target = dirs().find((d) => d.startsWith('chi-tet-do'));
    assert(target, `không thấy project để xoá: ${dirs().join(',')}`);
    const res = await api.projects.remove(target);
    assert(typeof res.trashId === 'string' && res.trashId.length > 0, 'phải trả trashId để Hoàn tác');
    assert(!dirs().includes(target), 'đã rời projects/');
    const trash = readdirSync(join(wsRoot, '.kitgen', 'trash'));
    assert(trash.some((t) => t.endsWith(target)), `trash: ${trash.join(',')}`);
    // Hoàn tác 10s của toast gọi đúng endpoint này:
    const back = await api.trash.restore(res.trashId);
    eq(back.project.id, target);
    assert(dirs().includes(target), 'phục hồi phải trả lại thư mục — 0 mất dữ liệu (mốc T5 §8.1)');
  });
  it('xoá vĩnh viễn KHÔNG làm được mà không có mã 4 số (arch §3.4 lớp 8)', async () => {
    const api = await liveApi();
    const target = dirs().find((d) => d.startsWith('chi-tet-do'));
    const res = await api.projects.remove(target);
    let code = null;
    try { await api.trash.purge(res.trashId, '0000'); } catch (e) { code = e.code; }
    assert(code === 'CONFIRM_INVALID' || code === 'CONFIRM_REQUIRED' || code === 'CONFIRM_LOCKED', `code=${code}`);
    const trash = readdirSync(join(wsRoot, '.kitgen', 'trash'));
    assert(trash.some((t) => t.endsWith(target)), 'sai mã thì KHÔNG được xoá thật');
  });
});

describe('E2E · §4.6 import — bảng đối chiếu lấy số liệu THẬT từ /api/import/preview', () => {
  /** Upload multipart thật: `api.uploads.create` cần File; ở Node ta dựng File tối giản
   *  và để core/api.js tự đóng FormData. FormData/File có sẵn từ Node 18. */
  async function uploadStylesJson() {
    const raw = readFileSync(join(process.cwd(), 'teams/t4-tichhop/styles-campaign.json'));
    const api = await liveApi();
    const file = new File([raw], 'styles-campaign.json', { type: 'application/json' });
    return api.uploads.create(file);
  }

  let report = null;
  it('POST /api/uploads nhận file styles.json cũ', async () => {
    const up = await uploadStylesJson();
    assert(typeof up.uploadId === 'string' && up.uploadId.length > 0, JSON.stringify(up));
    eq(up.kind, 'json');
    uploadId = up.uploadId;
  });
  it('preview KHÔNG lọc bớt: đúng 12 sheet / 78 element (mốc T6 §8.1, đóng issue #2)', async () => {
    const api = await liveApi();
    const res = await api.importer.preview({ source: 'stylesJson', uploadId });
    report = res.report;
    eq(report.sheets, 12);
    eq(report.components, 78);
    assert(report.variants >= 1, `variants=${report.variants}`);
  });
  it('báo cáo nêu rõ element lạ được GIỮ NGUYÊN (không tái sinh sheet từ lib)', () => {
    assert(report.unknownComponents > 0, `unknownComponents=${report.unknownComponents}`);
    const w = (report.warnings ?? []).find((x) => x.code === 'UNKNOWN_COMPONENTS');
    assert(w && /GIỮ NGUYÊN/.test(w.message), JSON.stringify(report.warnings));
  });
  it('nhập thật → project mới có ĐỦ 12 sheet / 78 element trên đĩa', async () => {
    const api = await liveApi();
    const up = await uploadStylesJson();          // uploadId dùng 1 lần
    const res = await api.projects.create({
      name: 'styles-campaign (nhập)', template: 'import',
      firstVariant: { vi: 'Phong cách 1', bg: 'magenta' },
      import: { source: 'stylesJson', uploadId: up.uploadId },
    });
    const c = JSON.parse(readFileSync(join(projectsDir, res.project.id, 'contract.json'), 'utf8'));
    eq(c.sheets.length, 12);
    eq(c.sheets.reduce((n, sh) => n + (sh.components?.length ?? 0), 0), 78);
    eq(res.project.stats.sheets, 12);
    eq(res.project.stats.components, 78);
  });
});

describe('E2E · dọn dẹp', () => {
  it('gỡ workspace tạm', async () => {
    await rm(tmp, { recursive: true, force: true });
    eq(existsSync(tmp), false);
  });
});
