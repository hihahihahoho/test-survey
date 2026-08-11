/**
 * runs/run-store.js — NGUỒN SỰ THẬT của một lượt chạy ở phía client (§3-S4, §6.3).
 * Đóng D2, D3, D5, U3.
 *
 * Nhiệm vụ:
 *  1. Đọc STREAM NDJSON qua core/agent.js (api.runs.stream) — KHÔNG fetch trực tiếp.
 *  2. Giữ `lastSeq`; mất kết nối → nối lại `?from=lastSeq+1`; `416 CURSOR_GONE` → GET #34 rồi stream lại.
 *  3. Stream đứt/stall 40s → chuyển POLL #34 mỗi 2s + cờ `pollMode` để UI hiện badge `chế độ poll`.
 *  4. Log NỐI THÊM, không ghi đè, giữ ≤5000 dòng, ghi vào IDB `runlog` để đọc lại khi agent đã tắt.
 *  5. ETA = trung vị thời lượng các lượt đã xong × số lượt còn lại ÷ số song song.
 */

import { api, idb, ndjson } from '../../core/index.js';
import { bytes as sharedBytes, duration as sharedDuration } from '../shared/format.js';

const MAX_LINES = 5000;
const POLL_MS = 2000;
/** Nghỉ giữa hai lần nối lại stream — chặn vòng quay CPU khi agent đóng kết nối liên tục. */
const RECONNECT_DELAY_MS = 250;

function sleep(ms) {
  return new Promise((r) => { setTimeout(r, ms); });
}

export function createRunStore({ projectId, runId, onUpdate, onLines }) {
  const state = {
    run: null,
    lines: [],          // [{ seq, t, job, level, text }]
    lastSeq: 0,
    pollMode: false,
    connected: false,
    fromCache: false,   // log đọc từ IDB (agent đã tắt) → nhãn "bản lưu tạm"
    error: null,
    finished: false,
  };
  let abort = null;
  let pollTimer = null;
  let stopped = false;
  let pendingLines = [];
  let flushTimer = null;
  let reconnectEmpty = 0;
  let appliedThisPass = 0;

  /* ── log ───────────────────────────────────────────────────────────────── */

  function pushLine(line) {
    state.lines.push(line);
    if (state.lines.length > MAX_LINES) state.lines.splice(0, state.lines.length - MAX_LINES);
    pendingLines.push(line);
    if (flushTimer === null && typeof setTimeout === 'function') {
      // gom nhóm 120ms: log có thể tới rất nhanh, không vẽ lại từng dòng
      flushTimer = setTimeout(() => {
        flushTimer = null;
        const batch = pendingLines;
        pendingLines = [];
        if (onLines) onLines(batch);
        persistLines(batch);
      }, 120);
    }
  }

  async function persistLines(batch) {
    if (batch.length === 0) return;
    try { await idb.runlog.append(runId, projectId, batch); } catch { /* IDB đầy thì thôi (§4.2) */ }
  }

  /** Bơm ngay lô đang chờ — gọi khi run kết thúc / rời màn, để không mất ĐUÔI log. */
  function flushLines() {
    if (flushTimer !== null) { clearTimeout(flushTimer); flushTimer = null; }
    if (pendingLines.length === 0) return;
    const batch = pendingLines;
    pendingLines = [];
    if (onLines) onLines(batch);
    persistLines(batch);
  }

  /* ── áp event NDJSON vào state (§6.3, 10 loại) ─────────────────────────── */

  function applyEvent(ev) {
    // Nối lại stream có thể gửi trùng: BỎ QUA event đã xử lý để không đếm đôi tiến độ.
    if (typeof ev.seq === 'number') {
      if (ev.seq <= state.lastSeq) return;
      state.lastSeq = ev.seq;
    }
    appliedThisPass += 1;
    const t = ev.t ?? new Date().toISOString();

    switch (ev.type) {
      case 'run.started':
        ensureRun();
        state.run.status = 'running';
        state.run.progress = { ...(state.run.progress ?? {}), total: ev.total ?? state.run.progress?.total ?? 0 };
        state.run.maxJobs = ev.maxJobs ?? state.run.maxJobs ?? 4;
        pushLine({ seq: ev.seq, t, job: null, level: 'info', text: `bắt đầu ${ev.total ?? '?'} lượt, ${ev.maxJobs ?? '?'} song song` });
        break;
      case 'job.started':
        patchJob(ev.job, { status: 'running', startedAt: t });
        pushLine({ seq: ev.seq, t, job: ev.job, level: 'info', text: 'bắt đầu' });
        break;
      case 'job.log':
        pushLine({ seq: ev.seq, t, job: ev.job ?? null, level: ev.level ?? 'info', text: String(ev.line ?? '') });
        break;
      case 'job.done':
        patchJob(ev.job, {
          status: ev.status ?? 'ok',
          durationMs: ev.durationMs ?? null,
          diagnosis: ev.diagnosis ?? null,
          recovered: ev.recovered === true,
          artifact: ev.bytes ? { path: `raw/${ev.job}.png`, bytes: ev.bytes } : undefined,
        });
        pushLine({
          seq: ev.seq, t, job: ev.job,
          level: ev.status === 'failed' ? 'error' : 'info',
          text: ev.status === 'failed'
            ? `thất bại${ev.diagnosis ? ` · ${ev.diagnosis}` : ''}`
            : `xong${ev.bytes ? ` · ${fmtBytes(ev.bytes)}` : ''}`,
        });
        recomputeProgress();
        break;
      case 'phase.changed':
        ensureRun();
        state.run.phase = ev.phase ?? state.run.phase;
        pushLine({ seq: ev.seq, t, job: null, level: 'info', text: `chuyển sang pha ${ev.phase?.index ?? '?'}/${ev.phase?.total ?? '?'} (${ev.phase?.name ?? ''})` });
        break;
      case 'progress':
        ensureRun();
        state.run.progress = {
          done: ev.done ?? state.run.progress?.done ?? 0,
          total: ev.total ?? state.run.progress?.total ?? 0,
          failed: ev.failed ?? state.run.progress?.failed ?? 0,
          etaSeconds: ev.etaSeconds ?? null,
        };
        break;
      case 'run.finished':
        ensureRun();
        state.run.status = ev.status ?? 'done';
        state.run.finishedAt = t;
        state.finished = true;
        pushLine({
          seq: ev.seq, t, job: null,
          level: ev.status === 'done' ? 'info' : 'error',
          text: `kết thúc: ${ev.status ?? '?'} · ${ev.ok ?? 0} xong, ${ev.failed ?? 0} lỗi`,
        });
        break;
      case 'workspace.changed':
        pushLine({ seq: ev.seq, t, job: null, level: 'warn', text: `thư mục làm việc đổi (${ev.reason ?? ''})` });
        break;
      case 'heartbeat':
      default:
        break;   // §6.5-6: event lạ KHÔNG được làm vỡ UI
    }
    if (onUpdate) onUpdate(snapshot());
  }

  /**
   * Trộn run.json của agent với trạng thái đã dựng từ stream.
   * VÌ SAO: sau khi stream đóng ta gọi lại #34; nếu ghi đè thẳng thì một run.json
   * chậm hơn stream sẽ ĐẨY TIẾN ĐỘ LÙI (lượt đã xong lại thành "đang chờ").
   * Quy tắc: lấy run.json làm nền, nhưng giữ trạng thái job & số đếm TIẾN XA HƠN.
   */
  function mergeRun(prev, next) {
    if (!next) return prev;
    if (!prev) return next;
    const rank = (st) => ({ queued: 0, never: 0, running: 1, uncut: 2, stale: 2, ok: 3, failed: 3 }[String(st)] ?? 0);
    const byName = new Map((prev.jobs ?? []).map((j) => [j.job, j]));
    const jobs = (next.jobs ?? []).map((j) => {
      const old = byName.get(j.job);
      if (!old) return j;
      return rank(old.status) > rank(j.status) ? { ...j, ...old } : { ...old, ...j };
    });
    for (const [name, old] of byName) {
      if (!jobs.some((j) => j.job === name)) jobs.push(old);
    }
    const pa = prev.progress ?? {};
    const pb = next.progress ?? {};
    return {
      ...prev, ...next, jobs,
      progress: {
        done: Math.max(Number(pa.done ?? 0), Number(pb.done ?? 0)),
        total: Math.max(Number(pa.total ?? 0), Number(pb.total ?? 0)),
        failed: Math.max(Number(pa.failed ?? 0), Number(pb.failed ?? 0)),
        etaSeconds: pb.etaSeconds ?? pa.etaSeconds ?? null,
      },
      // pha chỉ tiến, không lùi (pha 2 = cắt, X9)
      phase: (Number(next.phase?.index ?? 0) >= Number(prev.phase?.index ?? 0)) ? (next.phase ?? prev.phase) : prev.phase,
    };
  }

  function ensureRun() {
    if (!state.run) {
      state.run = { id: runId, projectId, kind: 'gen', status: 'running', jobs: [], progress: { done: 0, total: 0, failed: 0 } };
    }
    return state.run;
  }

  function patchJob(jobName, patch) {
    ensureRun();
    if (!Array.isArray(state.run.jobs)) state.run.jobs = [];
    const j = state.run.jobs.find((x) => x.job === jobName);
    if (j) Object.assign(j, patch);
    else state.run.jobs.push({ job: jobName, ...splitJob(jobName), status: 'queued', ...patch });
  }

  function recomputeProgress() {
    const jobs = state.run?.jobs ?? [];
    const done = jobs.filter((j) => j.status === 'ok').length;
    const failed = jobs.filter((j) => j.status === 'failed').length;
    const total = Math.max(state.run?.progress?.total ?? 0, jobs.length);
    state.run.progress = { ...(state.run.progress ?? {}), done, failed, total, etaSeconds: estimateEta() };
  }

  /** ETA = trung vị thời lượng lượt đã xong × số lượt còn lại ÷ số song song (§3-S4-2). */
  function estimateEta() {
    const jobs = state.run?.jobs ?? [];
    const durations = jobs.map((j) => j.durationMs).filter((d) => typeof d === 'number' && d > 0).sort((a, b) => a - b);
    if (durations.length === 0) return null;
    const median = durations[Math.floor(durations.length / 2)];
    const remaining = jobs.filter((j) => j.status === 'queued' || j.status === 'running').length;
    if (remaining === 0) return 0;
    const par = Math.max(1, Number(state.run?.maxJobs ?? 4));
    return Math.round((median * Math.ceil(remaining / par)) / 1000);
  }

  function snapshot() {
    return {
      run: state.run,
      lines: state.lines,
      pollMode: state.pollMode,
      connected: state.connected,
      fromCache: state.fromCache,
      error: state.error,
      finished: state.finished,
      eta: state.run?.progress?.etaSeconds ?? estimateEta(),
    };
  }

  /* ── vòng đời: GET #34 → stream #35 → (đứt) poll #34 ───────────────────── */

  async function loadRun() {
    try {
      const run = await api.runs.get(runId);
      state.run = mergeRun(state.run, run);
      state.connected = true;
      state.error = null;
      if (typeof run?.seq === 'number' && state.lastSeq === 0) {
        // Log trước con trỏ hiện tại lấy từ IDB (agent chỉ stream từ seq trở đi).
        await hydrateFromCache();
      }
      state.finished = isFinished(run?.status);
      if (onUpdate) onUpdate(snapshot());
      return run;
    } catch (e) {
      state.connected = false;
      state.error = e;
      await hydrateFromCache();
      if (onUpdate) onUpdate(snapshot());
      return null;
    }
  }

  /** Đọc log đã lưu trong IDB — để reload giữa run / agent tắt vẫn thấy log (§4.9). */
  async function hydrateFromCache() {
    if (state.lines.length > 0) return;
    try {
      const cached = await idb.runlog.get(runId);
      const lines = Array.isArray(cached?.lines) ? cached.lines : [];
      if (lines.length > 0) {
        state.lines = lines.slice(-MAX_LINES);
        state.fromCache = !state.connected;
        state.lastSeq = lines.reduce((m, l) => (typeof l.seq === 'number' && l.seq > m ? l.seq : m), 0);
        if (onLines) onLines(state.lines);
      }
    } catch { /* không có IDB thì thôi */ }
  }

  async function streamLoop() {
    while (!stopped && !state.finished) {
      abort = typeof AbortController === 'function' ? new AbortController() : null;
      appliedThisPass = 0;
      let res = null;
      try {
        res = await api.runs.stream(runId, {
          from: ndjson.nextCursor(state.lastSeq),
          onEvent: (ev) => applyEvent(ev),
          onStall: () => { state.pollMode = true; if (onUpdate) onUpdate(snapshot()); },
          signal: abort?.signal,
        });
        state.connected = true;
        state.fromCache = false;
      } catch (e) {
        state.connected = false;
        state.error = e;
        if (onUpdate) onUpdate(snapshot());
        // Stream không dùng được → poll (UI giống nhau, chỉ khác badge — chốt X10)
        startPoll();
        return;
      }
      if (res?.cursorGone) {
        // 416: con trỏ đã bị dọn → lấy lại trạng thái rồi stream từ đầu
        state.lastSeq = 0;
        await loadRun();
        continue;
      }
      if (state.finished || stopped) break;
      if (res?.stalled) { startPoll(); return; }
      // Stream đóng bình thường mà run CHƯA xong: nối lại từ ?from=lastSeq+1 (§6.3).
      // Chỉ khi nối lại vẫn không nhận được gì mới thì mới hạ xuống poll 2s.
      await loadRun();
      if (state.finished || stopped) break;
      // Đếm event MỚI (đã trừ trùng), KHÔNG đếm dòng thô: một agent phát lại
      // event cũ sẽ làm vòng lặp này quay vô hạn nếu tính theo dòng thô.
      if (appliedThisPass === 0) { reconnectEmpty += 1; } else { reconnectEmpty = 0; }
      if (reconnectEmpty >= 2) { startPoll(); return; }
      await sleep(RECONNECT_DELAY_MS);   // không bao giờ nối lại thành vòng quay CPU
    }
    flushLines();
  }

  function startPoll() {
    if (stopped || pollTimer !== null) return;
    state.pollMode = true;
    if (onUpdate) onUpdate(snapshot());
    const tick = async () => {
      if (stopped) return;
      const run = await loadRun();
      if (isFinished(run?.status)) { stopPoll(); return; }
      pollTimer = setTimeout(tick, POLL_MS);
    };
    pollTimer = setTimeout(tick, POLL_MS);
  }

  function stopPoll() {
    if (pollTimer !== null) { clearTimeout(pollTimer); pollTimer = null; }
  }

  async function start() {
    await loadRun();
    if (state.finished) {
      // Run đã xong: không stream, chỉ cần log (IDB + #37 khi mở drawer)
      flushLines();
      if (onUpdate) onUpdate(snapshot());
      return;
    }
    if (state.connected) streamLoop();
    else startPoll();
  }

  function stop() {
    stopped = true;
    stopPoll();
    flushLines();
    try { abort?.abort(); } catch { /* noop */ }
  }

  return {
    start, stop, snapshot, flushLines,
    reload: () => loadRun(),
    get lines() { return state.lines; },
    get run() { return state.run; },
  };
}

export function isFinished(status) {
  return ['done', 'done-with-errors', 'cancelled', 'env-failed'].includes(String(status));
}

export function splitJob(job) {
  const s = String(job ?? '');
  const i = s.indexOf('-');
  return i === -1 ? { variant: s, sheet: '' } : { variant: s.slice(0, i), sheet: s.slice(i + 1) };
}

/* Định dạng dùng CHUNG với S1/S2/S5/S6 (`screens/shared/format.js`) — gộp ở lượt tích hợp.
   Bản riêng trước đây của S4 thiếu bậc GB (1,4 GB hiện thành "1430.5 MB") và dùng dấu chấm
   thập phân thay vì dấu phẩy kiểu VI ⇒ cùng một số byte hiện KHÁC nhau giữa S2 và S4.
   Điểm khác duy nhất được GIỮ: dòng meta của S4 muốn RỖNG khi không có số, chứ không phải "—". */
export function fmtBytes(n) {
  const b = Number(n);
  if (!Number.isFinite(b) || b <= 0) return '';
  return sharedBytes(b);
}

export function fmtDuration(ms) {
  const v = Number(ms);
  if (!Number.isFinite(v) || v < 0) return '';
  return sharedDuration(v);
}

export function fmtClock(seconds) {
  const s = Math.max(0, Math.round(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
