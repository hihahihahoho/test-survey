/** Test phát hiện đường vào + 6 trạng thái pill (UX-SPEC §2.4, arch §5.3). */
import { describe, it, assert, eq } from './harness.mjs';
import * as detect from '../detect.js';
import * as agent from '../agent.js';
import * as store from '../store.js';
import { PILL } from '../constants.js';
import { failedToFetch, jsonResponse, mockFetch } from './mock-fetch.mjs';

const PAGES = { protocol: 'https:', hostname: 'kitgen.pages.dev', origin: 'https://kitgen.pages.dev', pathname: '/' };
const MIRROR = { protocol: 'http:', hostname: '127.0.0.1', port: '8765', origin: 'http://127.0.0.1:8765', pathname: '/app/' };

function setup(loc, handler) {
  store._setBackend(store._memoryBackend());
  agent.configure({ fetchImpl: mockFetch(handler), location: loc, baseUrl: null, mode: 'remote', entry: undefined });
  detect.configure({ location: loc, windowRef: null });
}

describe('detect.js — phân biệt đường vào', () => {
  it('Pages HTTPS → entry=pages, không same-origin', () => {
    detect.configure({ location: PAGES });
    const e = detect.detectEntry();
    eq(e.entry, 'pages');
    eq(e.sameOrigin, false);
    eq(e.httpsPage, true);
  });
  it('agent phục vụ /app/ → entry=mirror, same-origin (miễn nhiễm mixed-content)', () => {
    detect.configure({ location: MIRROR });
    const e = detect.detectEntry();
    eq(e.entry, 'mirror');
    eq(e.sameOrigin, true);
    eq(e.mirrorBase, 'http://127.0.0.1:8765');
  });
  it('URL cầu dò và URL mirror đúng dạng', () => {
    detect.configure({ location: PAGES });
    eq(detect.mirrorUrl(8765), 'http://127.0.0.1:8765/app/');
    assert(detect.bridgeUrl(8765).startsWith('http://127.0.0.1:8765/bridge.html?o='), 'bridge phải kèm origin');
    assert(detect.bridgeUrl(8765).includes(encodeURIComponent('https://kitgen.pages.dev')), 'phải truyền pages origin');
  });
});

describe('detect.js — 6 trạng thái agent pill (§2.4)', () => {
  it('1/6 ● Đã kết nối: health 200 + protocol khớp', async () => {
    setup(PAGES, () => jsonResponse({ ok: true, protocol: 1, version: '1.2.0', workspaceLabel: '~/KitGen', instanceLabel: 'gray-otter' }));
    const st = await detect.probe();
    eq(st.pill, PILL.connected);
    eq(st.readOnly, false);
    eq(st.workspaceLabel, '~/KitGen');
    eq(detect.pillView(st).text, 'Đã kết nối');
  });
  it('2/6 ◐ Đang kiểm tra: trạng thái khởi đầu, pill không bấm được', () => {
    detect.configure({ location: PAGES });
    const st = detect.checkingStatus();
    eq(st.pill, PILL.checking);
    eq(detect.pillView(st).clickable, false);
    eq(detect.pillView(st).text, 'Đang kiểm tra…');
  });
  it('3/6 ○ Chưa thấy công cụ local: fetch fail + cầu dò refused', async () => {
    setup(PAGES, () => failedToFetch());
    const st = await detect.probe({ bridgeResult: { alive: false } });
    eq(st.pill, PILL.notRunning);
    eq(st.code, 'AGENT_NOT_RUNNING');
    eq(st.readOnly, true);
  });
  it('4/6 ▲ Trình duyệt đang chặn: fetch fail + cầu dò OK (agent SỐNG)', async () => {
    setup(PAGES, () => failedToFetch());
    const st = await detect.probe({ bridgeResult: { alive: true, info: { version: '1.2.0', workspaceLabel: '~/KitGen' } } });
    eq(st.pill, PILL.blocked);
    eq(st.code, 'AGENT_BLOCKED_BY_BROWSER');
    eq(st.readOnly, true);
    eq(st.workspaceLabel, '~/KitGen');
    assert(st.mirrorUrl.includes('/app/'), 'phải có đường sang bản mirror');
  });
  it('5/6 ▲ Công cụ local cũ: protocol lệch', async () => {
    setup(PAGES, () => jsonResponse({ ok: true, protocol: 0 }, { headers: { 'X-KitGen-Protocol': '0' } }));
    const st = await detect.probe();
    eq(st.pill, PILL.protocolMismatch);
    eq(st.code, 'AGENT_PROTOCOL_OLD');
    eq(st.readOnly, true);
  });
  it('6/6 ⚠ Chưa tạo được ảnh: doctor imageGen.available=false, VẪN kết nối', async () => {
    setup(PAGES, () => jsonResponse({ ok: true, protocol: 1, workspaceLabel: '~/KitGen', imageGen: { available: false, reason: 'NOT_LOGGED_IN' } }));
    const st = await detect.probe();
    eq(st.pill, PILL.imagegenUnavailable);
    eq(st.code, 'IMAGEGEN_UNAVAILABLE');
    eq(st.connected, true);
    eq(st.readOnly, false, 'không tạo được ảnh KHÔNG khoá cả app (chỉ chặn mềm ở M1)');
  });
  it('403 ORIGIN_NOT_ALLOWED là bằng chứng agent sống → pill "đang chặn"', async () => {
    setup(PAGES, () => jsonResponse({ error: { code: 'ORIGIN_NOT_ALLOWED' } }, { status: 403 }));
    const st = await detect.probe();
    eq(st.pill, PILL.blocked);
    eq(st.code, 'ORIGIN_NOT_ALLOWED');
  });
  it('421 BAD_HOST (chống DNS-rebinding) → pill "đang chặn"', async () => {
    setup(PAGES, () => jsonResponse({ error: { code: 'BAD_HOST' } }, { status: 421 }));
    eq((await detect.probe()).code, 'BAD_HOST');
  });
  it('trên Pages, fetch fail chưa có cầu dò → needsBridgeProbe=true (mơ hồ, phải hỏi thêm)', async () => {
    setup(PAGES, () => failedToFetch());
    const st = await detect.probe();
    eq(st.needsBridgeProbe, true);
    eq(st.ambiguous, true);
  });
  it('trên mirror same-origin, fetch fail KHÔNG mơ hồ (không cần cầu dò)', async () => {
    setup(MIRROR, () => failedToFetch());
    const st = await detect.probe();
    eq(st.needsBridgeProbe, false);
    eq(st.ambiguous, false);
  });
  it('mọi pill đều có CHỮ, không bao giờ chỉ có màu (audit I1)', () => {
    for (const p of Object.values(PILL)) {
      const v = detect.PILL_LABEL[p];
      assert(v && typeof v.text === 'string' && v.text.length > 0, `pill ${p} thiếu chữ`);
      assert(typeof v.icon === 'string' && v.icon.length > 0, `pill ${p} thiếu icon`);
    }
    eq(Object.keys(detect.PILL_LABEL).length, 6);
  });
  it('chế độ mirror: workspace pill thêm hậu tố "(bản tại máy)"', async () => {
    setup(MIRROR, () => jsonResponse({ ok: true, protocol: 1 }));
    const st = await detect.probe();
    eq(detect.pillView(st).workspaceSuffix, '(bản tại máy)');
  });
});

describe('detect.js — cầu dò popup + nhịp probe', () => {
  it('bridgeProbe: nhận postMessage từ loopback → agent SỐNG', async () => {
    let handler = null;
    const fakeWin = {
      open: () => ({ close() {} }),
      addEventListener: (t, fn) => { if (t === 'message') handler = fn; },
      removeEventListener: () => {},
    };
    detect.configure({ location: PAGES, windowRef: fakeWin });
    const p = detect.bridgeProbe({ timeoutMs: 500 });
    handler({ origin: 'http://127.0.0.1:8765', data: { ok: true, protocol: 1, version: '1.2.0', workspaceLabel: '~/KitGen' } });
    const r = await p;
    eq(r.alive, true);
    eq(r.info.version, '1.2.0');
  });
  it('bridgeProbe: BỎ QUA message từ origin lạ (chống mạo danh)', async () => {
    let handler = null;
    const fakeWin = {
      open: () => ({ close() {} }),
      addEventListener: (t, fn) => { if (t === 'message') handler = fn; },
      removeEventListener: () => {},
    };
    detect.configure({ location: PAGES, windowRef: fakeWin });
    const p = detect.bridgeProbe({ timeoutMs: 150 });
    handler({ origin: 'https://evil.example', data: { ok: true, protocol: 1 } });
    eq((await p).alive, false);
  });
  it('bridgeProbe: popup bị chặn → báo blockedPopup', async () => {
    detect.configure({ location: PAGES, windowRef: { open: () => null, addEventListener() {}, removeEventListener() {} } });
    const r = await detect.bridgeProbe({ timeoutMs: 100 });
    eq(r, { alive: false, blockedPopup: true });
  });
  it('nhịp probe: backoff 1.5→3→6→15s, run đang chạy thì cố định 1.5s', () => {
    const s = detect.createProbeSchedule();
    eq([s.next(), s.next(), s.next(), s.next(), s.next()], [1500, 3000, 6000, 15000, 15000]);
    eq(s.next({ hasActiveRun: true }), 1500);
    s.reset();
    eq(s.next(), 1500);
  });
});
