/**
 * webapp/src/lib/api/ndjson.ts — đọc stream NDJSON của agent (§6.3, chốt X10).
 * Một JSON/dòng, phân tách `\n`, đọc qua `ReadableStream.getReader()` + TextDecoder.
 *
 * Luật client (§6.3):
 *  · giữ `lastSeq` → mất kết nối thì gọi lại `?from=lastSeq+1`
 *  · 416 CURSOR_GONE → GET #34 rồi stream lại từ đầu
 *  · heartbeat 15s; 40s im lặng ⇒ coi là đứt → poll #34 mỗi 2s + badge "chế độ poll"
 *  · dòng hỏng KHÔNG được làm vỡ stream: đếm rồi bỏ qua (đóng D2/D3)
 */
import { STREAM_STALL_MS } from "./constants";
import { streamEventSchema, type StreamEvent } from "../types/api";

/** Tách chuỗi thành dòng hoàn chỉnh, giữ phần dư (chunk có thể cắt giữa dòng). */
export function splitLines(buffer: string): { lines: string[]; rest: string } {
  const lines: string[] = [];
  let rest = buffer;
  let idx = rest.indexOf("\n");
  while (idx !== -1) {
    const line = rest.slice(0, idx).replace(/\r$/, "");
    if (line.trim() !== "") lines.push(line);
    rest = rest.slice(idx + 1);
    idx = rest.indexOf("\n");
  }
  return { lines, rest };
}

export interface NdjsonHandlers {
  onEvent?: (ev: StreamEvent) => void;
  /** dòng không parse được — dùng để đếm/ghi log dev, KHÔNG hiện ra UI. */
  onBadLine?: (line: string) => void;
}

/** Bộ phân tích tăng dần — test được độc lập, không cần fetch hay DOM. */
export class NdjsonParser {
  buffer = "";
  lastSeq = 0;
  count = 0;
  badLines = 0;
  private readonly onEvent: (ev: StreamEvent) => void;
  private readonly onBadLine: (line: string) => void;

  constructor({ onEvent, onBadLine }: NdjsonHandlers = {}) {
    this.onEvent = onEvent ?? (() => {});
    this.onBadLine = onBadLine ?? (() => {});
  }

  push(chunk: string): StreamEvent[] {
    this.buffer += chunk;
    const { lines, rest } = splitLines(this.buffer);
    this.buffer = rest;
    const out: StreamEvent[] = [];
    for (const line of lines) {
      const ev = this.parseLine(line);
      if (ev !== null) {
        out.push(ev);
        this.onEvent(ev);
      }
    }
    return out;
  }

  /** Gọi khi stream kết thúc: xử lý dòng cuối không có `\n`. */
  flush(): StreamEvent[] {
    const line = this.buffer.trim();
    this.buffer = "";
    if (line === "") return [];
    const ev = this.parseLine(line);
    if (ev === null) return [];
    this.onEvent(ev);
    return [ev];
  }

  private parseLine(line: string): StreamEvent | null {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      this.badLines += 1;
      this.onBadLine(line);
      return null;
    }
    // Event lạ vẫn đi qua vì schema có nhánh cuối `type: z.string()` (§6.5-6).
    const parsed = streamEventSchema.safeParse(raw);
    if (!parsed.success) {
      this.badLines += 1;
      this.onBadLine(line);
      return null;
    }
    const ev = parsed.data;
    if (typeof ev.seq === "number" && ev.seq > this.lastSeq) this.lastSeq = ev.seq;
    this.count += 1;
    return ev;
  }
}

export interface NdjsonResult {
  lastSeq: number;
  count: number;
  badLines: number;
  /** true ⇒ 40s không có gì: UI phải chuyển sang poll 2s + badge "chế độ poll". */
  stalled: boolean;
}

export interface ReadStreamOptions extends NdjsonHandlers {
  onStall?: (info: { lastSeq: number }) => void;
  signal?: AbortSignal;
  stallMs?: number;
}

/** Đọc hết một ReadableStream và bơm event ra callback. */
export async function readNdjsonStream(
  body: ReadableStream<Uint8Array>,
  opts: ReadStreamOptions = {},
): Promise<NdjsonResult> {
  const { onEvent, onBadLine, onStall, signal, stallMs = STREAM_STALL_MS } = opts;
  const parser = new NdjsonParser({ onEvent, onBadLine });
  const reader = body.getReader();
  const decoder = new TextDecoder("utf-8");
  let stalled = false;
  let stallTimer: ReturnType<typeof setTimeout> | null = null;

  const clearStall = () => {
    if (stallTimer !== null) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
  };
  const armStall = () => {
    if (!stallMs) return;
    clearStall();
    stallTimer = setTimeout(() => {
      stalled = true;
      onStall?.({ lastSeq: parser.lastSeq });
      void reader.cancel("stalled").catch(() => {});
    }, stallMs);
  };

  const onAbort = () => void reader.cancel("aborted").catch(() => {});
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
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
    signal?.removeEventListener("abort", onAbort);
  }
  return { lastSeq: parser.lastSeq, count: parser.count, badLines: parser.badLines, stalled };
}

/** Con trỏ nối lại stream: `?from=lastSeq+1` (§6.3). */
export function nextCursor(lastSeq: number): number {
  return Number.isFinite(lastSeq) && lastSeq > 0 ? lastSeq + 1 : 0;
}
