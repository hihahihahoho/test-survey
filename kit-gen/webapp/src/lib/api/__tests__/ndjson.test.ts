/** Ca tối thiểu bắt buộc: api parse NDJSON đúng (§6.3). */
import { describe, expect, it, vi } from "vitest";
import { NdjsonParser, nextCursor, readNdjsonStream, splitLines } from "../ndjson";
import type { StreamEvent } from "../../types/api";

/** 10 dòng đúng như ví dụ §6.3 của UX-SPEC. */
const SAMPLE = [
  '{"seq":401,"t":"2026-08-05T12:04:02.113Z","type":"run.started","total":8,"maxJobs":4}',
  '{"seq":402,"t":"2026-08-05T12:04:03Z","type":"job.started","job":"tet-main"}',
  '{"seq":403,"t":"2026-08-05T12:04:03Z","type":"job.log","job":"tet-main","level":"info","line":"dựng khung xương ✓"}',
  '{"seq":404,"t":"2026-08-05T12:05:51Z","type":"job.done","job":"tet-main","status":"ok","durationMs":108000,"bytes":3040192}',
  '{"seq":405,"t":"2026-08-05T12:06:04Z","type":"job.done","job":"vang-main2","status":"failed","diagnosis":"QUOTA_SUSPECTED"}',
  '{"seq":406,"t":"2026-08-05T12:06:05Z","type":"phase.changed","phase":{"index":2,"total":2,"name":"slice"}}',
  '{"seq":407,"t":"2026-08-05T12:06:06Z","type":"progress","done":3,"total":8,"failed":1,"etaSeconds":132}',
  '{"seq":408,"t":"2026-08-05T12:06:07Z","type":"workspace.changed","reason":"contract-edited-externally","projectId":"tet26-x"}',
  '{"seq":409,"t":"2026-08-05T12:08:14Z","type":"run.finished","status":"done-with-errors","ok":7,"failed":1,"durationMs":252000}',
  '{"seq":410,"t":"2026-08-05T12:08:29Z","type":"heartbeat"}',
].join("\n");

describe("splitLines", () => {
  it("giữ phần dư khi chunk cắt giữa dòng", () => {
    const r = splitLines('{"a":1}\n{"b":2');
    expect(r.lines).toEqual(['{"a":1}']);
    expect(r.rest).toBe('{"b":2');
  });
  it("bỏ dòng rỗng và \\r cuối dòng (CRLF)", () => {
    const r = splitLines('{"a":1}\r\n\n{"b":2}\n');
    expect(r.lines).toEqual(['{"a":1}', '{"b":2}']);
    expect(r.rest).toBe("");
  });
});

describe("NdjsonParser — parse đúng 10 loại event của §6.3", () => {
  it("đọc đủ 10 event và giữ lastSeq", () => {
    const got: StreamEvent[] = [];
    const p = new NdjsonParser({ onEvent: (e) => got.push(e) });
    p.push(SAMPLE);
    p.flush();
    expect(got).toHaveLength(10);
    expect(p.lastSeq).toBe(410);
    expect(p.badLines).toBe(0);
    expect(got.map((e) => e.type)).toEqual([
      "run.started", "job.started", "job.log", "job.done", "job.done",
      "phase.changed", "progress", "workspace.changed", "run.finished", "heartbeat",
    ]);
  });

  it("giữ nguyên payload từng loại event", () => {
    const got: Record<string, StreamEvent> = {};
    const p = new NdjsonParser({ onEvent: (e) => void (got[e.type] = e) });
    p.push(SAMPLE);
    p.flush();
    expect((got["job.log"] as { line: string }).line).toBe("dựng khung xương ✓");
    expect((got["progress"] as { etaSeconds: number }).etaSeconds).toBe(132);
    expect((got["phase.changed"] as { phase: { index: number } }).phase.index).toBe(2);
    expect((got["run.finished"] as { status: string }).status).toBe("done-with-errors");
  });

  it("ghép được khi chunk bị cắt tuỳ ý (mô phỏng TCP)", () => {
    const got: StreamEvent[] = [];
    const p = new NdjsonParser({ onEvent: (e) => got.push(e) });
    for (let i = 0; i < SAMPLE.length; i += 7) p.push(SAMPLE.slice(i, i + 7));
    p.flush();
    expect(got).toHaveLength(10);
    expect(p.lastSeq).toBe(410);
  });

  it("dòng cuối KHÔNG có \\n vẫn được flush ra", () => {
    const got: StreamEvent[] = [];
    const p = new NdjsonParser({ onEvent: (e) => got.push(e) });
    p.push('{"seq":1,"type":"heartbeat"}');
    expect(got).toHaveLength(0);
    p.flush();
    expect(got).toHaveLength(1);
  });

  it("dòng hỏng KHÔNG làm vỡ stream — đếm rồi bỏ qua (đóng D2/D3)", () => {
    const bad: string[] = [];
    const got: StreamEvent[] = [];
    const p = new NdjsonParser({ onEvent: (e) => got.push(e), onBadLine: (l) => bad.push(l) });
    p.push('{"seq":1,"type":"heartbeat"}\nKHÔNG PHẢI JSON\n[1,2,3]\nnull\n{"seq":2,"type":"heartbeat"}\n');
    expect(got).toHaveLength(2);
    expect(bad).toHaveLength(3); // chuỗi rác + mảng + null đều không phải event
    expect(p.badLines).toBe(3);
    expect(p.lastSeq).toBe(2);
  });

  it("event LẠ (agent bản mới) vẫn qua được, không vỡ UI (§6.5-6)", () => {
    const got: StreamEvent[] = [];
    const p = new NdjsonParser({ onEvent: (e) => got.push(e) });
    p.push('{"seq":99,"type":"quantum.teleported","payload":{"x":1}}\n');
    expect(got).toHaveLength(1);
    expect(got[0]!.type).toBe("quantum.teleported");
    expect(p.lastSeq).toBe(99); // con trỏ vẫn tiến ⇒ nối lại stream không mất dòng
  });

  it("lastSeq không lùi khi event tới không theo thứ tự", () => {
    const p = new NdjsonParser({});
    p.push('{"seq":50,"type":"heartbeat"}\n{"seq":10,"type":"heartbeat"}\n');
    expect(p.lastSeq).toBe(50);
  });
});

describe("readNdjsonStream", () => {
  const streamOf = (chunks: string[]) =>
    new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
        c.close();
      },
    });

  it("đọc hết stream thật và trả thống kê đúng", async () => {
    const got: StreamEvent[] = [];
    const r = await readNdjsonStream(streamOf([SAMPLE.slice(0, 120), SAMPLE.slice(120)]), {
      onEvent: (e) => got.push(e),
    });
    expect(got).toHaveLength(10);
    expect(r.lastSeq).toBe(410);
    expect(r.badLines).toBe(0);
    expect(r.stalled).toBe(false);
  });

  it("chuỗi UTF-8 bị cắt giữa ký tự nhiều byte vẫn ghép đúng", async () => {
    const bytes = new TextEncoder().encode('{"seq":1,"type":"job.log","line":"khung xương ✓"}\n');
    const cut = 40; // rơi vào giữa ký tự tiếng Việt
    const got: StreamEvent[] = [];
    await readNdjsonStream(
      new ReadableStream<Uint8Array>({
        start(c) {
          c.enqueue(bytes.slice(0, cut));
          c.enqueue(bytes.slice(cut));
          c.close();
        },
      }),
      { onEvent: (e) => got.push(e) },
    );
    expect((got[0] as { line: string }).line).toBe("khung xương ✓");
  });

  it("40s im lặng ⇒ gọi onStall để UI chuyển sang chế độ poll (chốt X10)", async () => {
    vi.useFakeTimers();
    const onStall = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        // enqueue rồi IM LẶNG — mô phỏng agent treo giữa chừng, không đóng kết nối.
        c.enqueue(new TextEncoder().encode('{"seq":1,"type":"heartbeat"}\n'));
      },
    });
    const p = readNdjsonStream(stream, { onStall, stallMs: 40_000 });
    await vi.advanceTimersByTimeAsync(41_000);
    const r = await p;
    expect(onStall).toHaveBeenCalledOnce();
    expect(r.stalled).toBe(true);
    expect(r.lastSeq).toBe(1); // con trỏ giữ được để nối lại `?from=2`
    vi.useRealTimers();
  });
});

describe("nextCursor — nối lại stream bằng ?from=lastSeq+1 (§6.3)", () => {
  it("trả lastSeq+1 khi đã nhận được event", () => {
    expect(nextCursor(410)).toBe(411);
  });
  it("trả 0 khi chưa nhận gì (stream từ đầu)", () => {
    expect(nextCursor(0)).toBe(0);
    expect(nextCursor(Number.NaN)).toBe(0);
  });
});
