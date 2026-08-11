/**
 * web/js/core/ndjson.js — đọc stream NDJSON của agent (UX-SPEC §6.3).
 * Một JSON/dòng, phân tách bằng \n. Đọc bằng ReadableStream reader + TextDecoder.
 *
 * Luật client (§6.3):
 *  - giữ lastSeq → mất kết nối thì gọi lại với ?from=<lastSeq+1>
 *  - 416 CURSOR_GONE → GET /api/runs/:id rồi stream lại từ đầu
 *  - heartbeat 15s; 40s không có gì → coi là đứt → chuyển poll 2s + badge "chế độ poll"
 * Dòng hỏng KHÔNG được làm vỡ stream: đẩy qua onBadLine rồi bỏ qua.
 */

import { STREAM_STALL_MS } from './constants.js';

/**
 * Tách một chuỗi thành các dòng hoàn chỉnh, giữ phần dư.
 * @returns {{lines: string[], rest: string}}
 */
export function splitLines(buffer) {
  const lines = [];
  let rest = buffer;
  let idx = rest.indexOf('\n');
  while (idx !== -1) {
    const line = rest.slice(0, idx).replace(/\r$/, '');
    if (line.trim() !== '') lines.push(line);
    rest = rest.slice(idx + 1);
    idx = rest.indexOf('\n');
  }
  return { lines, rest };
}

/**
 * Bộ phân tích NDJSON tăng dần — dùng được cả cho stream thật và cho test bằng chuỗi.
 * Không giữ tham chiếu tới DOM/fetch nên test được độc lập.
 */
export class NdjsonParser {
  constructor({ onEvent, onBadLine } = {}) {
    this.buffer = '';
    this.lastSeq = 0;
    this.count = 0;
    this.badLines = 0;
    this.onEvent = onEvent ?? (() => {});
    this.onBadLine = onBadLine ?? (() => {});
  }

  /** Nạp một mẩu text (có thể cắt giữa dòng). Trả về mảng event đã phân tích được. */
  push(chunk) {
    this.buffer += chunk;
    const { lines, rest } = splitLines(this.buffer);
    this.buffer = rest;
    const out = [];
    for (const line of lines) {
      const ev = this.#parse(line);
      if (ev !== null) { out.push(ev); this.onEvent(ev); }
    }
    return out;
  }

  /** Gọi khi stream kết thúc: xử lý dòng cuối không có \n. */
  flush() {
    const line = this.buffer.trim();
    this.buffer = '';
    if (line === '') return [];
    const ev = this.#parse(line);
    if (ev === null) return [];
    this.onEvent(ev);
    return [ev];
  }

  #parse(line) {
    let ev;
    try { ev = JSON.parse(line); }
    catch { this.badLines += 1; this.onBadLine(line); return null; }
    if (ev === null || typeof ev !== 'object' || Array.isArray(ev)) {
      this.badLines += 1; this.onBadLine(line); return null;
    }
    if (typeof ev.seq === 'number' && ev.seq > this.lastSeq) this.lastSeq = ev.seq;
    this.count += 1;
    return ev;
  }
}

/**
 * Đọc hết một ReadableStream (body của fetch) và bơm event ra callback.
 * @param {ReadableStream<Uint8Array>} body
 * @param {{onEvent, onBadLine, onStall, signal, stallMs}} opts
 * @returns {Promise<{lastSeq:number, count:number, badLines:number, stalled:boolean}>}
 */
export async function readNdjsonStream(body, opts = {}) {
  const { onEvent, onBadLine, onStall, signal, stallMs = STREAM_STALL_MS } = opts;
  const parser = new NdjsonParser({ onEvent, onBadLine });
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let stalled = false;
  let stallTimer = null;

  const armStall = () => {
    if (!stallMs || typeof setTimeout !== 'function') return;
    clearStall();
    stallTimer = setTimeout(() => {
      stalled = true;
      if (onStall) onStall({ lastSeq: parser.lastSeq });
      try { reader.cancel('stalled'); } catch { /* noop */ }
    }, stallMs);
  };
  const clearStall = () => { if (stallTimer !== null) { clearTimeout(stallTimer); stallTimer = null; } };

  const onAbort = () => { try { reader.cancel('aborted'); } catch { /* noop */ } };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  try {
    armStall();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      armStall();
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.flush();
  } finally {
    clearStall();
    if (signal) signal.removeEventListener('abort', onAbort);
  }
  return { lastSeq: parser.lastSeq, count: parser.count, badLines: parser.badLines, stalled };
}

/** Con trỏ tiếp theo để nối lại stream: ?from=<lastSeq+1> (§6.3). */
export function nextCursor(lastSeq) {
  return Number.isFinite(lastSeq) && lastSeq > 0 ? lastSeq + 1 : 0;
}
