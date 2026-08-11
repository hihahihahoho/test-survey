/**
 * features/runs/lib/useRunLog.ts — NỐI STREAM NDJSON CỦA R0 VÀO PANEL NHẬT KÝ.
 * Đóng D2 (log ghi đè), D3, D5 (reload giữa chừng vẫn đúng), U3 (mất log khi reconnect).
 *
 * ╔═ CHIA VIỆC VỚI R0, KHÔNG LÀM LẠI ══════════════════════════════════════════╗
 * ║ `useRunStream()` của R0 (`lib/hooks/use-runs.ts`) đã lo phần khó của §6.3:  ║
 * ║ đọc stream, nối lại bằng `?from=lastSeq+1`, 416 → stream lại từ đầu, 40s im ║
 * ║ lặng → hạ xuống poll 2s + cờ `polling`, và đẩy trạng thái run vào cache      ║
 * ║ Query. Tôi KHÔNG viết lại bất cứ thứ nào trong đó.                          ║
 * ║                                                                             ║
 * ║ Việc CỦA TÔI là ba thứ R0 cố ý không làm (chúng thuộc về màn):              ║
 * ║   1. gom nhóm dòng để không render 500 lần/giây  → `createRunLogBuffer`     ║
 * ║   2. ghi/đọc IDB `runlog` để reload và agent-tắt vẫn xem được log           ║
 * ║   3. HYDRATE: nạp log cũ TRƯỚC khi stream chạy, rồi khử trùng theo `seq`    ║
 * ╚═════════════════════════════════════════════════════════════════════════════╝
 *
 * ĐIỂM TINH TẾ (D5 + U3): `useRunStream` trả `lines` tính từ lúc hook mount. Reload
 * giữa run ⇒ những dòng trước đó KHÔNG có trong stream nữa (agent chỉ gửi từ
 * `?from=` trở đi). Nếu chỉ hiện `lines` của R0, user reload xong sẽ thấy log
 * cụt đầu và tưởng mất. Nên: đọc IDB trước, hydrate vào bộ đệm, rồi mới trộn
 * dòng mới — khử trùng bằng `seq` để đoạn chồng lấn không bị nhân đôi.
 */
import * as React from "react";
import { useRunStream } from "@/lib/hooks";
import {
  createRunLogBuffer, filterLines, readStoredLog,
  type LogFilter, type LogLine, type RunLogBuffer,
} from "./runlog";

export interface RunLogApi {
  /** Dòng đã lọc — thứ panel render. */
  lines: LogLine[];
  /** Tổng số dòng trước khi lọc (hiện "đang lọc 12/431 dòng"). */
  total: number;
  filter: LogFilter;
  setFilter: (patch: Partial<LogFilter>) => void;
  /** true ⇒ stream đứt, đang poll 2s: hiện badge nhỏ "chế độ poll" (X10). */
  polling: boolean;
  connected: boolean;
  /** true ⇒ log đang đọc từ bản lưu trên máy, không phải trực tiếp (§4.9). */
  fromCache: boolean;
  /** Toàn bộ dòng CHƯA lọc — cho [⬇ Tải log]. */
  allLines: () => LogLine[];
}

export function useRunLog({
  runId,
  projectId,
  enabled = true,
}: {
  runId: string;
  projectId: string;
  /** false khi agent chưa chạy: KHÔNG mở stream, chỉ đọc bản lưu (§4.9). */
  enabled?: boolean;
}): RunLogApi {
  const [lines, setLines] = React.useState<LogLine[]>([]);
  const [filter, setFilterState] = React.useState<LogFilter>({ errorsOnly: false, job: null });
  const [fromCache, setFromCache] = React.useState(false);
  const bufferRef = React.useRef<RunLogBuffer | null>(null);

  // Bộ đệm sống theo runId. `onChange` nhận danh sách mới → một `setState` cho cả lô.
  React.useEffect(() => {
    const buf = createRunLogBuffer({
      runId,
      projectId,
      onChange: (next) => setLines([...next]),
    });
    bufferRef.current = buf;
    setLines([]);
    setFromCache(false);

    // Hydrate từ IDB TRƯỚC. Đây là thứ làm cho "reload giữa chừng vẫn đúng" (D5).
    let alive = true;
    void (async () => {
      const stored = await readStoredLog(runId);
      if (!alive || stored.length === 0) return;
      buf.hydrate(stored);
      // Agent chưa chạy ⇒ đây là tất cả những gì ta có: nói thật bằng nhãn.
      if (!enabled) setFromCache(true);
    })();

    return () => {
      alive = false;
      buf.flush(); // KHÔNG mất đuôi log khi rời màn
      buf.dispose();
      bufferRef.current = null;
    };
  }, [runId, projectId, enabled]);

  const stream = useRunStream(enabled ? runId : null, { enabled });

  // Đẩy dòng mới của R0 vào bộ đệm. `push` tự khử trùng theo `seq` nên việc
  // `stream.lines` là mảng tích luỹ (không phải delta) hoàn toàn vô hại.
  React.useEffect(() => {
    const buf = bufferRef.current;
    if (!buf || stream.lines.length === 0) return;
    buf.push(
      stream.lines.map((l) => ({
        seq: l.seq,
        t: l.t,
        job: l.job,
        level: l.level,
        text: l.line,
      })),
    );
  }, [stream.lines]);

  const setFilter = React.useCallback((patch: Partial<LogFilter>) => {
    setFilterState((f) => ({ ...f, ...patch }));
  }, []);

  const visible = React.useMemo(() => filterLines(lines, filter), [lines, filter]);

  return {
    lines: visible,
    total: lines.length,
    filter,
    setFilter,
    polling: stream.polling,
    connected: stream.connected,
    fromCache,
    allLines: () => lines,
  };
}
