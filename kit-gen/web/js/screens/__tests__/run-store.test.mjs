/**
 * Test S4: đọc stream NDJSON qua core/agent.js, KHÔNG MẤT DÒNG LOG, nối lại bằng
 * ?from=lastSeq+1, 416 → nạp lại, stall → poll 2s, ETA, và log lưu IDB để reload
 * giữa run vẫn đúng (đóng D2, D3, D5, U3, T8).
 */
import { describe, it, assert, eq } from '../../core/__tests__/harness.mjs';
import * as agent from '../../core/agent.js';
import * as idb from '../../core/idb.js';
import * as store from '../../core/store.js';
import { IDB_STORES } from '../../core/constants.js';
import { jsonResponse, mockFetch, ndjsonResponse } from '../../core/__tests__/mock-fetch.mjs';
import { createRunStore, fmtBytes, fmtClock, fmtDuration, isFinished, splitJob } from '../runs/run-store.js';
import { hhmmss } from '../runs/log-view.js';

function fakeIndexedDB() {
  const data = new Map(Object.values(IDB_STORES).map((s) => [s, new Map()]));
  return {
    _data: data,
    open() {
      const req = {};
      setTimeout(() => {
        req.result = {
          objectStoreNames: { contains: () => true },
          transaction(name) {
            const map = data.get(name);
            const t = {};
            const os = {
              put(v, k) { map.set(k, v); setTimeout(() => t.oncomplete?.(), 0); return {}; },
              get(k) { const r = { result: map.get(k) ?? null }; setTimeout(() => t.oncomplete?.(), 0); return r; },
              delete(k) { map.delete(k); setTimeout(() => t.oncomplete?.(), 0); return {}; },
              getAllKeys() { const r = { result: [...map.keys()] }; setTimeout(() => t.oncomplete?.(), 0); return r; },
            };
            t.objectStore = () => os;
            return t;
          },
        };
        req.onsuccess?.();
      }, 0);
      return req;
    },
  };
}

function setup(handler) {
  store._setBackend(store._memoryBackend());
  const db = fakeIndexedDB();
  idb.configure({ indexedDBImpl: db });
  const f = mockFetch(handler);
  agent.configure({
    fetchImpl: f, baseUrl: 'http://127.0.0.1:8765',
    location: { protocol: 'https:', hostname: 'kitgen.pages.dev', origin: 'https://kitgen.pages.dev', pathname: '/' },
  });
  return { f, db };
}

const RUN = (over = {}) => ({
  id: 'r-0032', projectId: 'p1', kind: 'gen', status: 'running',
  startedAt: '2026-08-05T12:04:00.000Z', maxJobs: 4,
  phase: { index: 1, total: 2, name: 'gen' },
  progress: { done: 0, total: 2, failed: 0 },
  jobs: [
    { job: 'tet-main', variant: 'tet', sheet: 'main', status: 'queued' },
    { job: 'tet-tall', variant: 'tet', sheet: 'tall', status: 'queued' },
  ],
  seq: 0, ...over,
});

const EVENTS = [
  '{"seq":401,"t":"2026-08-05T12:04:02.113Z","type":"run.started","total":2,"maxJobs":4}\n',
  '{"seq":402,"t":"2026-08-05T12:04:03.000Z","type":"job.started","job":"tet-main"}\n',
  '{"seq":403,"t":"2026-08-05T12:04:04.000Z","type":"job.log","job":"tet-main","level":"info","line":"dựng khung xương ✓"}\n',
  '{"seq":404,"t":"2026-08-05T12:05:51.000Z","type":"job.done","job":"tet-main","status":"ok","durationMs":108000,"bytes":3040192}\n',
  '{"seq":405,"t":"2026-08-05T12:06:04.000Z","type":"job.done","job":"tet-tall","status":"failed","diagnosis":"QUOTA_SUSPECTED"}\n',
  '{"seq":406,"t":"2026-08-05T12:06:05.000Z","type":"phase.changed","phase":{"index":2,"total":2,"name":"slice"}}\n',
  '{"seq":407,"t":"2026-08-05T12:06:06.000Z","type":"progress","done":1,"total":2,"failed":1,"etaSeconds":132}\n',
  '{"seq":408,"t":"2026-08-05T12:06:07.000Z","type":"heartbeat"}\n',
  '{"seq":409,"t":"2026-08-05T12:06:08.000Z","type":"run.finished","status":"done-with-errors","ok":1,"failed":1,"durationMs":128000}\n',
];

const settle = () => new Promise((r) => setTimeout(r, 30));

describe('đọc stream NDJSON: KHÔNG MẤT DÒNG (đóng D2/D3)', () => {
  it('nhận đủ 9 event, kể cả khi chunk cắt GIỮA DÒNG', async () => {
    // gộp tất cả rồi cắt thành mẩu 17 byte để mô phỏng TCP chia gói
    const blob = EVENTS.join('');
    const chunks = [];
    for (let i = 0; i < blob.length; i += 17) chunks.push(blob.slice(i, i + 17));
    setup(({ url }) => (url.includes('/stream') ? ndjsonResponse(chunks) : jsonResponse(RUN())));
    const lines = [];
    const s = createRunStore({ projectId: 'p1', runId: 'r-0032', onUpdate: () => {}, onLines: (b) => lines.push(...b) });
    await s.start();
    await settle();
    const snap = s.snapshot();
    eq(snap.run.status, 'done-with-errors');
    eq(snap.run.jobs.find((j) => j.job === 'tet-main').status, 'ok');
    eq(snap.run.jobs.find((j) => j.job === 'tet-tall').status, 'failed');
    eq(snap.run.jobs.find((j) => j.job === 'tet-tall').diagnosis, 'QUOTA_SUSPECTED');
    eq(snap.run.phase.index, 2, 'pha 2 (cắt) phải được ghi nhận');
    assert(snap.lines.length >= 6, `phải giữ log, nhận ${snap.lines.length}`);
    assert(snap.lines.some((l) => l.text.includes('dựng khung xương')), 'dòng log của job phải có');
    assert(snap.lines.some((l) => l.level === 'error'), 'job.done failed phải thành dòng lỗi');
    s.stop();
  });

  it('log NỐI THÊM chứ không ghi đè (mỗi lô là append)', async () => {
    setup(({ url }) => (url.includes('/stream') ? ndjsonResponse(EVENTS) : jsonResponse(RUN())));
    const batches = [];
    const s = createRunStore({ projectId: 'p1', runId: 'r-0032', onUpdate: () => {}, onLines: (b) => batches.push(b.length) });
    await s.start();
    await settle();
    const total = batches.reduce((a, b) => a + b, 0);
    eq(total, s.snapshot().lines.length, 'tổng dòng bơm ra = tổng dòng đang giữ');
    s.stop();
  });

  it('event type LẠ không làm vỡ store (§6.5-6)', async () => {
    const evs = ['{"seq":1,"type":"quantum.tunnel","x":1}\n', '{"seq":2,"type":"run.finished","status":"done","ok":1}\n'];
    setup(({ url }) => (url.includes('/stream') ? ndjsonResponse(evs) : jsonResponse(RUN())));
    const s = createRunStore({ projectId: 'p1', runId: 'r-0032', onUpdate: () => {}, onLines: () => {} });
    await s.start();
    await settle();
    eq(s.snapshot().run.status, 'done');
    s.stop();
  });

  it('dòng JSON hỏng bị bỏ qua, stream vẫn chạy tiếp', async () => {
    const evs = ['{"seq":1,"type":"job.log","job":"a","line":"ok"}\n', 'KHÔNG-PHẢI-JSON\n', '{"seq":3,"type":"run.finished","status":"done"}\n'];
    setup(({ url }) => (url.includes('/stream') ? ndjsonResponse(evs) : jsonResponse(RUN())));
    const s = createRunStore({ projectId: 'p1', runId: 'r-0032', onUpdate: () => {}, onLines: () => {} });
    await s.start();
    await settle();
    eq(s.snapshot().run.status, 'done');
    s.stop();
  });
});

describe('nối lại stream: ?from=lastSeq+1 và 416 CURSOR_GONE (§6.3)', () => {
  it('stream đóng giữa chừng → gọi lại với from=lastSeq+1', async () => {
    const urls = [];
    let streamCalls = 0;
    setup(({ url }) => {
      if (url.includes('/stream')) {
        urls.push(url);
        streamCalls += 1;
        if (streamCalls === 1) return ndjsonResponse(EVENTS.slice(0, 3));   // đứt sau seq 403
        return ndjsonResponse(EVENTS.slice(3));
      }
      return jsonResponse(RUN());
    });
    const s = createRunStore({ projectId: 'p1', runId: 'r-0032', onUpdate: () => {}, onLines: () => {} });
    await s.start();
    // nối lại có nghỉ 250ms (chặn vòng quay CPU) nên chờ dài hơn một nhịp
    await new Promise((r) => setTimeout(r, 800));
    assert(urls.length >= 2, `phải nối lại stream, nhận ${urls.length} lần`);
    assert(urls[1].includes('from=404'), `phải nối từ lastSeq+1=404, nhận ${urls[1]}`);
    eq(s.snapshot().run.status, 'done-with-errors', 'nối lại rồi phải nhận nốt event cuối');
    s.stop();
  });

  it('416 → nạp lại #34 rồi stream từ đầu (không kẹt vòng lặp)', async () => {
    let streamCalls = 0;
    let runCalls = 0;
    setup(({ url }) => {
      if (url.includes('/stream')) {
        streamCalls += 1;
        if (streamCalls === 1) return jsonResponse({ error: { code: 'CURSOR_GONE', message: 'gone' } }, { status: 416 });
        return ndjsonResponse(['{"seq":9,"type":"run.finished","status":"done","ok":2}\n']);
      }
      runCalls += 1;
      return jsonResponse(RUN());
    });
    const s = createRunStore({ projectId: 'p1', runId: 'r-0032', onUpdate: () => {}, onLines: () => {} });
    await s.start();
    await settle();
    assert(runCalls >= 2, `416 phải kéo theo GET run lại, nhận ${runCalls}`);
    eq(s.snapshot().run.status, 'done');
    s.stop();
  });

  it('stream lỗi hẳn → chuyển POLL, cờ pollMode bật để UI hiện badge (chốt X10)', async () => {
    let runCalls = 0;
    setup(({ url }) => {
      if (url.includes('/stream')) return new TypeError('Failed to fetch');
      runCalls += 1;
      return jsonResponse(RUN(runCalls > 1 ? { status: 'done', progress: { done: 2, total: 2, failed: 0 } } : {}));
    });
    const s = createRunStore({ projectId: 'p1', runId: 'r-0032', onUpdate: () => {}, onLines: () => {} });
    await s.start();
    await new Promise((r) => setTimeout(r, 2200));   // chờ 1 nhịp poll 2s
    const snap = s.snapshot();
    assert(snap.pollMode, 'phải bật chế độ poll');
    eq(snap.run.status, 'done');
    assert(runCalls >= 2, `phải poll #34, nhận ${runCalls} lần gọi`);
    s.stop();
  });
});

describe('reload giữa run vẫn đúng (đóng D5, T8) + log từ IDB khi agent tắt (§4.9)', () => {
  it('trạng thái đọc từ run.json nên reload không mất tiến độ', async () => {
    setup(({ url }) => (url.includes('/stream')
      ? ndjsonResponse([])
      : jsonResponse(RUN({ status: 'running', progress: { done: 3, total: 8, failed: 1 } }))));
    const s = createRunStore({ projectId: 'p1', runId: 'r-0032', onUpdate: () => {}, onLines: () => {} });
    await s.start();
    await settle();
    const pr = s.snapshot().run.progress;
    eq([pr.done, pr.total, pr.failed], [3, 8, 1]);
    s.stop();
  });

  it('log được ghi IDB; store mới đọc lại được khi agent TẮT, có cờ fromCache', async () => {
    const { db } = setup(({ url }) => (url.includes('/stream') ? ndjsonResponse(EVENTS) : jsonResponse(RUN())));
    const s1 = createRunStore({ projectId: 'p1', runId: 'r-0032', onUpdate: () => {}, onLines: () => {} });
    await s1.start();
    await settle();
    const saved = db._data.get('runlog').get('r-0032');
    assert(saved && saved.lines.length > 0, 'log phải được lưu vào IDB runlog');
    s1.stop();

    // agent tắt hoàn toàn
    agent.configure({ fetchImpl: mockFetch(() => new TypeError('Failed to fetch')) });
    const s2 = createRunStore({ projectId: 'p1', runId: 'r-0032', onUpdate: () => {}, onLines: () => {} });
    await s2.start();
    await settle();
    const snap = s2.snapshot();
    assert(snap.lines.length > 0, 'phải vẽ được log từ IDB');
    assert(snap.fromCache, 'phải đánh dấu là bản lưu tạm');
    assert(!snap.connected);
    s2.stop();
  });
});

describe('ETA + tiến độ (đóng D1)', () => {
  it('ETA = trung vị thời lượng × số lượt còn lại ÷ song song', async () => {
    const evs = [
      '{"seq":1,"type":"run.started","total":4,"maxJobs":2}\n',
      '{"seq":2,"type":"job.done","job":"a-1","status":"ok","durationMs":60000}\n',
      '{"seq":3,"type":"job.done","job":"a-2","status":"ok","durationMs":60000}\n',
    ];
    setup(({ url }) => (url.includes('/stream')
      ? ndjsonResponse(evs)
      : jsonResponse(RUN({ maxJobs: 2, progress: { done: 0, total: 4, failed: 0 },
          jobs: [
            { job: 'a-1', status: 'queued' }, { job: 'a-2', status: 'queued' },
            { job: 'a-3', status: 'queued' }, { job: 'a-4', status: 'queued' },
          ] }))));
    const s = createRunStore({ projectId: 'p1', runId: 'r-1', onUpdate: () => {}, onLines: () => {} });
    await s.start();
    await settle();
    // còn 2 lượt, 2 song song, trung vị 60s ⇒ ceil(2/2)*60 = 60s
    eq(s.snapshot().eta, 60);
    s.stop();
  });
  it('chưa có lượt nào xong → ETA null để UI hiện "đang tính…"', async () => {
    setup(({ url }) => (url.includes('/stream') ? ndjsonResponse([]) : jsonResponse(RUN({ progress: { done: 0, total: 2, failed: 0, etaSeconds: null } }))));
    const s = createRunStore({ projectId: 'p1', runId: 'r-1', onUpdate: () => {}, onLines: () => {} });
    await s.start();
    await settle();
    eq(s.snapshot().eta ?? null, null);
    s.stop();
  });
});

describe('tiện ích hiển thị', () => {
  it('isFinished đúng 4 trạng thái kết thúc', () => {
    for (const s of ['done', 'done-with-errors', 'cancelled', 'env-failed']) assert(isFinished(s), s);
    for (const s of ['running', 'queued']) assert(!isFinished(s), s);
  });
  it('splitJob tách variant-sheet, giữ được sheet có gạch nối', () => {
    eq(splitJob('tet-main'), { variant: 'tet', sheet: 'main' });
    eq(splitJob('tet-pose-lan'), { variant: 'tet', sheet: 'pose-lan' });
  });
  it('fmtBytes / fmtDuration / fmtClock — dùng chung định dạng với S1/S2/S5 (dấu phẩy VI, có bậc GB)', () => {
    eq(fmtBytes(3040192), '2,9 MB');
    eq(fmtBytes(2048), '2,0 KB');
    eq(fmtBytes(0), '');                 // S4 muốn RỖNG khi không có số, không phải "—"
    eq(fmtBytes(1.5e9), '1,4 GB');       // bản riêng cũ của S4 ra "1430.5 MB"
    eq(fmtDuration(108000), '1m48s');
    eq(fmtDuration(31000), '31s');
    eq(fmtDuration(-5), '');
    eq(fmtClock(72), '01:12');
  });
  it('hhmmss không vỡ với timestamp rác', () => {
    eq(hhmmss('không-phải-ngày'), '--:--:--');
  });
});
