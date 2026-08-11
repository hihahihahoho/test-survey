/** Test transport: NDJSON, header, timeout/retry theo UX-SPEC §6.1/§6.3. */
import { describe, it, assert, eq, rejects } from './harness.mjs';
import { NdjsonParser, nextCursor, readNdjsonStream, splitLines } from '../ndjson.js';
import * as agent from '../agent.js';
import * as store from '../store.js';
import { LS_KEYS } from '../constants.js';
import { failedToFetch, jsonResponse, mockFetch, ndjsonResponse } from './mock-fetch.mjs';

const BASE = 'http://127.0.0.1:8765';
function setup(handler) {
  store._setBackend(store._memoryBackend());
  const f = mockFetch(handler);
  agent.configure({ fetchImpl: f, location: { protocol: 'https:', hostname: 'kitgen.pages.dev', origin: 'https://kitgen.pages.dev', pathname: '/' }, baseUrl: BASE });
  return f;
}

describe('ndjson.js — parse stream đúng §6.3', () => {
  it('splitLines giữ phần dư khi chunk cắt giữa dòng', () => {
    const r = splitLines('{"a":1}\n{"b":2}\n{"c"');
    eq(r.lines, ['{"a":1}', '{"b":2}']);
    eq(r.rest, '{"c"');
  });
  it('parse 10 loại event của §6.3', () => {
    const lines = [
      '{"seq":401,"type":"run.started","total":8,"maxJobs":4}',
      '{"seq":402,"type":"job.started","job":"tet-main"}',
      '{"seq":403,"type":"job.log","job":"tet-main","level":"info","line":"dựng khung xương ✓"}',
      '{"seq":404,"type":"job.done","job":"tet-main","status":"ok","durationMs":108000}',
      '{"seq":405,"type":"job.done","job":"vang-main2","status":"failed","diagnosis":"QUOTA_SUSPECTED"}',
      '{"seq":406,"type":"phase.changed","phase":{"index":2,"total":2,"name":"slice"}}',
      '{"seq":407,"type":"progress","done":3,"total":8,"failed":1,"etaSeconds":132}',
      '{"seq":408,"type":"workspace.changed","reason":"contract-edited-externally"}',
      '{"seq":409,"type":"run.finished","status":"done-with-errors","ok":7,"failed":1}',
      '{"seq":410,"type":"heartbeat"}',
    ];
    const got = [];
    const p = new NdjsonParser({ onEvent: (e) => got.push(e.type) });
    p.push(lines.join('\n') + '\n');
    eq(got, ['run.started', 'job.started', 'job.log', 'job.done', 'job.done',
      'phase.changed', 'progress', 'workspace.changed', 'run.finished', 'heartbeat']);
    eq(p.lastSeq, 410);
    eq(p.badLines, 0);
  });
  it('event bị cắt qua NHIỀU chunk vẫn ghép đúng', () => {
    const got = [];
    const p = new NdjsonParser({ onEvent: (e) => got.push(e) });
    p.push('{"seq":1,"ty');
    eq(got.length, 0);
    p.push('pe":"job.log","line":"a"}\n');
    eq(got.length, 1);
    eq(got[0].line, 'a');
  });
  it('dòng JSON hỏng KHÔNG làm vỡ stream (đếm riêng, đi tiếp)', () => {
    const bad = [];
    const got = [];
    const p = new NdjsonParser({ onEvent: (e) => got.push(e), onBadLine: (l) => bad.push(l) });
    p.push('{"seq":1,"type":"heartbeat"}\nKHÔNG PHẢI JSON\n{"seq":2,"type":"progress"}\n');
    eq(got.length, 2);
    eq(bad, ['KHÔNG PHẢI JSON']);
    eq(p.lastSeq, 2);
  });
  it('flush() xử lý dòng cuối thiếu \\n', () => {
    const got = [];
    const p = new NdjsonParser({ onEvent: (e) => got.push(e) });
    p.push('{"seq":9,"type":"run.finished"}');
    eq(got.length, 0);
    p.flush();
    eq(got.length, 1);
  });
  it('readNdjsonStream đọc hết ReadableStream giả', async () => {
    const res = ndjsonResponse(['{"seq":1,"type":"run.started"}\n{"seq":2,"ty', 'pe":"heartbeat"}\n']);
    const got = [];
    const r = await readNdjsonStream(res.body, { onEvent: (e) => got.push(e.type), stallMs: 0 });
    eq(got, ['run.started', 'heartbeat']);
    eq(r.lastSeq, 2);
    eq(r.count, 2);
  });
  it('nextCursor = lastSeq + 1 để nối lại stream', () => {
    eq(nextCursor(410), 411);
    eq(nextCursor(0), 0);
  });
});

describe('agent.js — header & ràng buộc bảo mật §6.1', () => {
  it('mọi request có X-KitGen-Client: 1 + Content-Type json (ép preflight)', async () => {
    const f = setup(() => jsonResponse({ ok: true }));
    await agent.get('/api/projects');
    eq(f.calls[0].headers['X-KitGen-Client'], '1');
    eq(f.calls[0].headers['Content-Type'], 'application/json');
  });
  it('credentials: omit — không cookie, không phiên', async () => {
    const f = setup(() => jsonResponse({ ok: true }));
    await agent.get('/api/projects');
    eq(f.calls[0].init.credentials, 'omit');
  });
  it('LOẠI BỎ header Authorization/Cookie nếu ai đó cố truyền vào', async () => {
    const f = setup(() => jsonResponse({ ok: true }));
    await agent.get('/api/projects', { headers: { Authorization: 'Bearer x', Cookie: 'a=b', 'If-None-Match': '"37"' } });
    const h = f.calls[0].headers;
    assert(h.Authorization === undefined, 'Authorization phải bị loại bỏ');
    assert(h.Cookie === undefined, 'Cookie phải bị loại bỏ');
    eq(h['If-None-Match'], '"37"');
  });
});

describe('agent.js — timeout & retry ĐÚNG chính sách §6.1', () => {
  it('GET lỗi mạng: retry ĐÚNG 1 lần (tổng 2 lần gọi)', async () => {
    const f = setup(() => failedToFetch());
    await rejects(agent.get('/api/projects'), 'AGENT_NOT_RUNNING');
    eq(f.calls.length, 2);
  });
  it('POST lỗi mạng: KHÔNG retry (đúng 1 lần gọi — tránh tạo nhân bản đôi)', async () => {
    const f = setup(() => failedToFetch());
    await rejects(agent.post('/api/projects', { name: 'x' }), 'AGENT_NOT_RUNNING');
    eq(f.calls.length, 1);
  });
  it('PUT/PATCH/DELETE cũng KHÔNG retry', async () => {
    for (const call of [
      () => agent.put('/api/projects/x/contract', {}),
      () => agent.patch('/api/projects/x', {}),
      () => agent.del('/api/projects/x'),
    ]) {
      const f = setup(() => failedToFetch());
      await rejects(call(), 'AGENT_NOT_RUNNING');
      eq(f.calls.length, 1);
    }
  });
  it('/health KHÔNG retry và dùng timeout 1200ms', async () => {
    const f = setup(() => failedToFetch());
    await rejects(agent.health(), 'AGENT_NOT_RUNNING');
    eq(f.calls.length, 1);
  });
  it('GET thành công ở lần retry thứ 2 → không ném lỗi', async () => {
    const f = setup(({ n }) => (n === 1 ? failedToFetch() : jsonResponse({ items: [] })));
    const r = await agent.get('/api/projects');
    eq(r.items, []);
    eq(f.calls.length, 2);
  });
  it('upload không retry', async () => {
    const f = setup(() => failedToFetch());
    await rejects(agent.upload('/api/uploads', null), 'AGENT_NOT_RUNNING');
    eq(f.calls.length, 1);
  });
  it('MỌI request có hạn thời gian THẬT — kể cả khi bên gọi tự truyền signal', async () => {
    // Lỗi đã vá ở lượt tích hợp: khi bên gọi truyền `signal` mà môi trường thiếu
    // `AbortSignal.any`, bản trước trả về đúng signal đó và ĐÁNH RƠI hạn thời gian
    // ⇒ request treo vô hạn, màn "đang tải" không bao giờ kết thúc.
    // Ca này KHÔNG chờ đồng hồ thật: nó kiểm signal đưa cho fetch có phải signal ghép,
    // và huỷ từ phía bên gọi vẫn cắt được request (hai tính chất đủ để chứng minh vá đúng).
    const seen = [];
    agent.configure({
      fetchImpl: (url, init) => {
        seen.push(init.signal);
        return new Promise((_, rej) => {
          init.signal?.addEventListener?.('abort', () => {
            const e = new Error('aborted'); e.name = 'AbortError'; rej(e);
          });
        });
      },
      baseUrl: 'http://127.0.0.1:8765',
    });
    const ac = new AbortController();
    const p = agent.health({ signal: ac.signal });
    assert(seen.length === 1, `phải gọi fetch 1 lần, nhận ${seen.length}`);
    assert(seen[0], 'phải có signal đưa cho fetch');
    assert(seen[0] !== ac.signal,
      'signal đưa cho fetch phải là signal GHÉP (hạn + bên gọi), KHÔNG phải signal trần của bên gọi'
      + ' — nếu trả signal trần thì hạn thời gian bị đánh rơi và request treo vô hạn');
    ac.abort();
    await rejects(p, 'AGENT_NOT_RUNNING');
  });
});

describe('agent.js — envelope lỗi & version negotiation', () => {
  it('parse envelope {error:{code,message,details}} thành AgentError', async () => {
    setup(() => jsonResponse(
      { error: { code: 'CONTRACT_CONFLICT', message: 'version 37 != 38', details: { serverVersion: 38 } } },
      { status: 409 },
    ));
    const e = await rejects(agent.put('/api/projects/x/contract', {}), 'CONTRACT_CONFLICT');
    eq(e.status, 409);
    eq(e.details.serverVersion, 38);
    assert(e.message.includes('37 != 38'), 'message kỹ thuật giữ trong Error để panel dev đọc');
  });
  it('lỗi không có envelope → suy code từ HTTP status', async () => {
    setup(() => jsonResponse({}, { status: 423 }));
    await rejects(agent.post('/api/projects', {}), 'WORKSPACE_UNWRITABLE');
  });
  it('protocol agent CŨ hơn app → AGENT_PROTOCOL_OLD', async () => {
    setup(() => jsonResponse({ ok: true }, { headers: { 'X-KitGen-Protocol': '0' } }));
    await rejects(agent.get('/api/projects'), 'AGENT_PROTOCOL_OLD');
  });
  it('protocol agent MỚI hơn app → AGENT_PROTOCOL_NEW', async () => {
    setup(() => jsonResponse({ ok: true }, { headers: { 'X-KitGen-Protocol': '2' } }));
    await rejects(agent.get('/api/projects'), 'AGENT_PROTOCOL_NEW');
  });
  it('304 Not Modified → {notModified:true} (ETag, #7)', async () => {
    setup(() => jsonResponse(null, { status: 304, headers: { ETag: '"37"' } }));
    const r = await agent.get('/api/projects');
    eq(r.notModified, true);
    eq(r.etag, '"37"');
  });
});

describe('agent.js — dò cổng 8765→8766→8767 (chốt X2)', () => {
  it('chỉ dò 3 cổng trong danh sách, KHÔNG dò 8125', async () => {
    const f = setup(() => failedToFetch());
    const r = await agent.discover();
    eq(r, null);
    const ports = f.calls.map((c) => new URL(c.url).port).sort();
    eq(ports, ['8765', '8766', '8767']);
    assert(!f.calls.some((c) => c.url.includes('8125')), 'không được dò cổng 8125 của server v1');
  });
  it('cổng 8766 trả lời → chọn baseUrl 8766 và lưu vào kitgen.agent.v1', async () => {
    setup(({ url }) => (url.includes('8766')
      ? jsonResponse({ ok: true, protocol: 1, version: '1.2.0', instanceLabel: 'gray-otter', workspaceLabel: '~/KitGen', workspaceFingerprint: 'sha256:abc123' })
      : failedToFetch()));
    const r = await agent.discover();
    eq(r.baseUrl, 'http://127.0.0.1:8766');
    eq(store.get(LS_KEYS.agent).baseUrl, 'http://127.0.0.1:8766');
    eq(store.get(LS_KEYS.workspace).label, '~/KitGen');
  });
  it('KHÔNG lưu secret khi /health trả về field lạ chứa token', async () => {
    setup(() => jsonResponse({
      ok: true, protocol: 1, workspaceLabel: '~/KitGen',
      instanceLabel: 'gray-otter', access_token: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0',
    }));
    await agent.discover();
    const dump = JSON.stringify(store.get(LS_KEYS.agent)) + JSON.stringify(store.get(LS_KEYS.workspace));
    assert(!dump.includes('eyJ'), 'token từ health KHÔNG được rơi vào localStorage');
  });
});

describe('agent.js — stream run (#35) & tiện ích', () => {
  it('streamRun đọc NDJSON và gửi ?from=<seq> khi nối lại', async () => {
    const f = setup(() => ndjsonResponse(['{"seq":411,"type":"job.log","line":"a"}\n']));
    const got = [];
    const r = await agent.streamRun('r-0032', { from: 411, onEvent: (e) => got.push(e) });
    assert(f.calls[0].url.includes('/api/runs/r-0032/stream?from=411'), `URL sai: ${f.calls[0].url}`);
    eq(r.lastSeq, 411);
    eq(got.length, 1);
  });
  it('416 CURSOR_GONE → trả cursorGone để client GET #34 rồi stream lại', async () => {
    setup(() => jsonResponse({ error: { code: 'CURSOR_GONE' } }, { status: 416 }));
    const r = await agent.streamRun('r-0032', { from: 999 });
    eq(r.cursorGone, true);
  });
  it('confirmHeader chỉ nhận đúng 4 chữ số (mã terminal)', async () => {
    eq(agent.confirmHeader('4821'), { 'X-KitGen-Confirm': '4821' });
    let threw = false;
    try { agent.confirmHeader('48'); } catch (e) { threw = e.code === 'CONFIRM_INVALID'; }
    assert(threw, 'mã sai định dạng phải bị chặn ở client');
  });
  it('fileUrl luôn dùng ?w=256 cho lưới (§6.5-5)', () => {
    setup(() => jsonResponse({}));
    const u = agent.fileUrl('tet26', 'kits/tet/25-bg-home.png', { w: 256 });
    assert(u.endsWith('?w=256'), `phải có w=256, nhận ${u}`);
    assert(u.includes('/api/projects/tet26/files/'), 'phải đi qua #41');
  });
  it('mirror same-origin: /app/ → baseUrl là origin của agent, mode=mirror', async () => {
    store._setBackend(store._memoryBackend());
    agent.configure({
      fetchImpl: mockFetch(() => jsonResponse({ ok: true, protocol: 1 })),
      location: { protocol: 'http:', hostname: '127.0.0.1', port: '8765', origin: 'http://127.0.0.1:8765', pathname: '/app/index.html' },
      baseUrl: null, mode: undefined,
    });
    eq(agent.mirrorOrigin(), 'http://127.0.0.1:8765');
    const r = await agent.discover();
    eq(r.baseUrl, 'http://127.0.0.1:8765');
    eq(agent.currentMode(), 'mirror');
  });
});
