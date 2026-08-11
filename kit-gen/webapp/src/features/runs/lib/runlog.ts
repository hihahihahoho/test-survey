/**
 * features/runs/lib/runlog.ts — NHẬT KÝ CỦA MỘT LƯỢT CHẠY: nối thêm, không mất dòng.
 * Đóng D2 (v1 GHI ĐÈ log), D3, và phần "đọc lại log khi agent đã tắt" của §4.9.
 *
 * ╔═ VÌ SAO KHÔNG ĐỂ LOG TRONG useState ════════════════════════════════════════╗
 * ║ Log tới theo cụm, có lúc hàng chục dòng/giây. Mỗi dòng một `setState` là     ║
 * ║ hàng chục lần render/giây cho một danh sách vài nghìn phần tử — màn hình sẽ  ║
 * ║ đứng hình đúng lúc user cần nhìn nhất. Ở đây: bộ đệm ngoài React, gom nhóm   ║
 * ║ 120ms rồi mới báo. React chỉ render 8 lần/giây dù log tới 500 dòng/giây.     ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * BA LUẬT CỦA §3-S4-5, thi công đúng:
 *  1. **Nối thêm, không ghi đè.** `push` chỉ `array.push`. Không có hàm nào thay
 *     cả danh sách bằng "8000 ký tự cuối" như v1 (`genLog.slice(-8000)` — thứ đã
 *     cắt giữa dòng và tạo ra chuỗi rác, audit #5).
 *  2. **Giữ ≤5000 dòng** (arch §4.2). Vượt thì bỏ dòng CŨ NHẤT, theo DÒNG chứ
 *     không theo ký tự — cắt theo ký tự chính là bug của v1.
 *  3. **Ghi IDB `runlog`** để mở lại xem được khi agent đã tắt, nhãn "bản lưu tạm".
 */
import { IDB_LIMITS, IDB_STORES, idbGet, idbPrune, idbSet } from "@/features/design/safety";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogLine {
  /** con trỏ stream — dùng để CHỐNG TRÙNG khi nối lại `?from=` (§6.3). */
  seq: number;
  t: string;
  job: string | null;
  level: LogLevel;
  text: string;
}

const MAX_LINES = IDB_LIMITS.runlogMaxLines;
/** Gom nhóm trước khi báo cho React. 120ms ≈ 8 khung/giây: mắt thấy liên tục, CPU thở được. */
const FLUSH_MS = 120;

export interface RunLogBuffer {
  /** Thêm một lô dòng. Bỏ qua dòng có `seq` đã thấy (stream nối lại gửi trùng). */
  push: (lines: readonly LogLine[]) => void;
  /** Nạp đè từ IDB khi mở lại màn. Chỉ dùng lúc khởi tạo. */
  hydrate: (lines: readonly LogLine[]) => void;
  all: () => LogLine[];
  count: () => number;
  lastSeq: () => number;
  /** Bơm ngay lô đang chờ — gọi khi run kết thúc / rời màn, để KHÔNG MẤT ĐUÔI log. */
  flush: () => void;
  dispose: () => void;
}

export function createRunLogBuffer({
  runId,
  projectId,
  onChange,
  persist = true,
}: {
  runId: string;
  projectId: string;
  /** Gọi sau mỗi lần gom nhóm. Nhận toàn bộ danh sách (đã cắt ≤5000). */
  onChange: (lines: LogLine[]) => void;
  persist?: boolean;
}): RunLogBuffer {
  let lines: LogLine[] = [];
  const seen = new Set<number>();
  let pending: LogLine[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const emit = () => {
    timer = null;
    if (pending.length === 0) return;
    const batch = pending;
    pending = [];
    onChange(lines);
    if (persist) void persistBatch(runId, projectId, batch);
  };

  const schedule = () => {
    if (timer !== null || disposed) return;
    timer = setTimeout(emit, FLUSH_MS);
  };

  return {
    push(incoming) {
      if (disposed || incoming.length === 0) return;
      let added = false;
      for (const l of incoming) {
        // Nối lại stream có thể phát lại vài event: bỏ dòng đã có để log không
        // nhân đôi. `seq <= 0` (dòng do client tự sinh) thì luôn nhận.
        if (l.seq > 0) {
          if (seen.has(l.seq)) continue;
          seen.add(l.seq);
        }
        lines.push(l);
        added = true;
      }
      if (!added) return;
      if (lines.length > MAX_LINES) lines = lines.slice(lines.length - MAX_LINES);
      pending = pending.concat(incoming);
      schedule();
    },
    hydrate(incoming) {
      lines = incoming.slice(-MAX_LINES);
      seen.clear();
      for (const l of lines) if (l.seq > 0) seen.add(l.seq);
      onChange(lines);
    },
    all: () => lines,
    count: () => lines.length,
    lastSeq: () => lines.reduce((m, l) => (l.seq > m ? l.seq : m), 0),
    flush() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      emit();
    },
    dispose() {
      disposed = true;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      pending = [];
    },
  };
}

/* ═════════ IndexedDB `runlog` (arch §4.2) ═════════ */

interface RunLogRecord {
  projectId: string;
  lines: LogLine[];
  updatedAt: string;
}

async function persistBatch(runId: string, projectId: string, batch: readonly LogLine[]): Promise<void> {
  if (batch.length === 0) return;
  try {
    const cur = await idbGet<RunLogRecord>(IDB_STORES.runlog, runId);
    const merged = [...(cur?.lines ?? []), ...batch].slice(-MAX_LINES);
    await idbSet(IDB_STORES.runlog, runId, {
      projectId,
      lines: merged,
      updatedAt: new Date().toISOString(),
    } satisfies RunLogRecord);
    // Giữ 20 run gần nhất. Chạy sau khi ghi để không chặn đường log.
    void idbPrune(IDB_STORES.runlog);
  } catch {
    // IDB đầy / bị chặn / bộ dò secret chặn ⇒ mất cache log, KHÔNG vỡ UI (arch §4.2).
    // Log trên màn vẫn đầy đủ vì nó nằm trong RAM.
  }
}

/** Đọc log đã lưu (mở lại màn, hoặc agent đã tắt → nhãn "bản lưu tạm"). */
export async function readStoredLog(runId: string): Promise<LogLine[]> {
  const rec = await idbGet<RunLogRecord>(IDB_STORES.runlog, runId);
  if (!rec || !Array.isArray(rec.lines)) return [];
  return rec.lines.filter(isLogLine);
}

function isLogLine(v: unknown): v is LogLine {
  if (!v || typeof v !== "object") return false;
  const l = v as Record<string, unknown>;
  return typeof l.text === "string" && typeof l.seq === "number";
}

/* ═════════ Lọc & xuất ═════════ */

export interface LogFilter {
  errorsOnly: boolean;
  /** `null` = mọi lượt. */
  job: string | null;
}

export function filterLines(lines: readonly LogLine[], f: LogFilter): LogLine[] {
  if (!f.errorsOnly && f.job === null) return lines as LogLine[];
  return lines.filter((l) => {
    if (f.errorsOnly && l.level !== "error") return false;
    if (f.job !== null && l.job !== f.job) return false;
    return true;
  });
}

/** Nội dung file [⬇ Tải log]. Blob same-origin, không gửi gì ra ngoài. */
export function logToText(lines: readonly LogLine[]): string {
  return lines
    .map((l) => {
      const t = l.t ? new Date(l.t).toISOString() : "";
      return [t, l.job ?? "", l.level === "error" ? "ERROR" : "", l.text]
        .filter((x) => x !== "")
        .join(" ");
    })
    .join("\n");
}
