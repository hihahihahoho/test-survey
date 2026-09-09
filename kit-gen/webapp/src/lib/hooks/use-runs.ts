/**
 * webapp/src/lib/hooks/use-runs.ts — hook cho lượt chạy (#32–#40) + thư viện kit (#42).
 *
 * `useRunStream` là hook phức tạp nhất của tầng này vì nó phải làm đúng chốt X10:
 *   · stream NDJSON là ĐƯỜNG CHÍNH
 *   · đứt (40s im lặng, hoặc lỗi mạng) ⇒ tự chuyển POLL #34 mỗi 2s + cờ `polling`
 *     để UI hiện badge nhỏ "chế độ poll" — **giao diện phải giống hệt ở cả hai chế độ**
 *   · nối lại bằng `?from=lastSeq+1`; gặp 416 CURSOR_GONE ⇒ GET #34 rồi stream lại từ đầu
 *   · log NỐI THÊM, không ghi đè (đóng D2), giữ ≤5000 dòng
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/endpoints";
import { AgentError } from "../api/client";
import { LIMITS, STREAM_POLL_FALLBACK_MS } from "../api/constants";
import { qk, keysAfterRun } from "./keys";
/* Id của BẢN ĐANG DÙNG mà `#39` phát ra. Nhập từ chỗ khai duy nhất thay vì gõ lại chuỗi:
   agent (`routes/runs.mjs`) và web phải đồng ý từng ký tự, lệch là mời lại sai bộ khoá. */
import { CURRENT_ID } from "@/features/prompt-canvas/lib/result/sheet-versions";
import { GC, STALE } from "./query-client";
import type { Run, StartRunInput, StreamEvent } from "../types/api";

/** #33 */
export function useRuns(projectId: string | undefined | null, limit = 20) {
  return useQuery({
    queryKey: qk.runs.ofProject(projectId ?? ""),
    queryFn: () => api.runs.list(projectId!, limit),
    enabled: Boolean(projectId),
    staleTime: STALE.runsList,
  });
}

/**
 * #34 — chi tiết một lượt chạy. Đọc từ `run.json` phía agent nên **reload giữa chừng vẫn
 * đúng** (đóng D5). `refetchInterval` chỉ bật khi run đang chạy VÀ stream không hoạt động;
 * bình thường stream lo việc cập nhật.
 */
export function useRun(runId: string | undefined | null, opts: { poll?: boolean } = {}) {
  return useQuery({
    queryKey: qk.runs.detail(runId ?? ""),
    queryFn: () => api.runs.get(runId!),
    enabled: Boolean(runId),
    staleTime: STALE.runActive,
    gcTime: GC.runFinished,
    refetchInterval: opts.poll ? STREAM_POLL_FALLBACK_MS : false,
  });
}

/** #32 — bắt đầu lượt chạy. 409 RUN_CONFLICT có `details.runId` để dựng nút [Xem lượt đó]. */
export function useStartRun(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: StartRunInput) => api.runs.start(projectId, input),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: qk.runs.ofProject(projectId) });
      void qc.invalidateQueries({ queryKey: qk.projects.detail(projectId) });
      // Danh sách cũng đổi: thẻ S1 phải hiện badge `⚡ Đang sinh 0/N` ngay.
      void qc.invalidateQueries({ queryKey: qk.projects.lists() });
      return res;
    },
  });
}

/** #36 — dừng lượt chạy (đóng D6). */
export function useCancelRun(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: string) => api.runs.cancel(runId),
    onSuccess: (_r, runId) => {
      void qc.invalidateQueries({ queryKey: qk.runs.detail(runId) });
      for (const key of keysAfterRun(projectId)) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/* `useJobLog` (#37) và `useJobPrompt` (#38) đã bị gỡ ở Đợt 2 cùng màn lượt chạy: tiến độ
   mà màn soạn cần đã nằm trong stream #35, không màn nào còn mở nhật ký từng tấm. */

/** #39 — 3 đời ảnh gần nhất của một lượt (đóng B7). */
export function useRawHistory(projectId: string | null, job: string | null) {
  return useQuery({
    queryKey: qk.runs.rawHistory(projectId ?? "", job ?? ""),
    queryFn: () => api.runs.rawHistory(projectId!, job!),
    enabled: Boolean(projectId && job),
    staleTime: STALE.runsList,
  });
}

/**
 * #39.1 — XOÁ một phiên bản, kể cả bản ĐANG DÙNG.
 *
 * Hai mức mời lại, vì hai việc khác hẳn nhau:
 *   · bản CŨ — chỉ mất một file trong `.history/`. `raw/`, `kits/`, hạn mức, trạng thái
 *     tấm đều không đổi, nên chỉ mời lại LỊCH SỬ; mời lại tất cả là bắt cả màn dựng lại
 *     để lấy về y hệt dữ liệu cũ (đúng cái "lưới lác lác" đã phải chữa một lần).
 *   · bản ĐANG DÙNG — agent xoá ảnh gốc, dọn ô đã cắt, rồi đưa bản mới nhất còn lại lên
 *     thay chỗ. Ảnh, kho ô, và trạng thái tấm («chưa vẽ» khi hết bản) đều đổi cùng lúc,
 *     nên phải mời lại đúng bộ khoá của một lượt chạy.
 */
export function useDeleteRawHistory(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ job, historyId }: { job: string; historyId: string }) =>
      api.runs.rawHistoryDelete(projectId, job, historyId),
    onSuccess: (_res, { historyId }) => {
      if (historyId === CURRENT_ID) {
        for (const key of keysAfterRun(projectId)) void qc.invalidateQueries({ queryKey: key });
        return;
      }
      void qc.invalidateQueries({ queryKey: qk.runs.rawHistoryOf(projectId) });
    },
  });
}

/** #40 — khôi phục ảnh cũ. */
export function useRestoreRaw(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ job, historyId }: { job: string; historyId: string }) =>
      api.runs.rawRestore(projectId, job, historyId),
    onSuccess: () => {
      for (const key of keysAfterRun(projectId)) void qc.invalidateQueries({ queryKey: key });
    },
  });
}

/** #42 — thư viện kit đã cắt. */
export function useKit(projectId: string | undefined | null, variant?: string) {
  return useQuery({
    queryKey: qk.kit.variant(projectId ?? "", variant),
    queryFn: () => api.files.kit(projectId!, variant),
    enabled: Boolean(projectId),
    staleTime: STALE.kit,
  });
}

/* ═════════════ Stream NDJSON (#35) ═════════════ */

export interface LogLine {
  seq: number;
  t: string;
  job: string | null;
  level: "debug" | "info" | "warn" | "error";
  line: string;
}

export interface RunStreamState {
  /** Dòng log — NỐI THÊM, không bao giờ ghi đè (đóng D2). Giữ ≤5000 dòng. */
  lines: LogLine[];
  lastSeq: number;
  /** true ⇒ stream đứt, đang poll #34 mỗi 2s. UI hiện badge nhỏ "chế độ poll" (X10). */
  polling: boolean;
  connected: boolean;
  clear: () => void;
}

const MAX_LINES = LIMITS.runlogMaxLines;

/**
 * Mở stream cho một run. Tự nối lại, tự hạ xuống poll khi đứt.
 * Trả về log + cờ `polling`; dữ liệu run vẫn lấy từ `useRun` (cache của Query), nên
 * hai chế độ cho ra CÙNG một hình dạng dữ liệu — đúng yêu cầu "UI phải giống nhau".
 */
export function useRunStream(runId: string | null, opts: { enabled?: boolean } = {}): RunStreamState {
  const qc = useQueryClient();
  const enabled = (opts.enabled ?? true) && Boolean(runId);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [polling, setPolling] = useState(false);
  const [connected, setConnected] = useState(false);
  const lastSeqRef = useRef(0);
  const stoppedRef = useRef(false);

  const clear = useCallback(() => {
    setLines([]);
    lastSeqRef.current = 0;
  }, []);

  useEffect(() => {
    if (!enabled || !runId) return;
    stoppedRef.current = false;
    const ac = new AbortController();
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const stopPoll = () => {
      if (pollTimer !== null) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      setPolling(false);
    };

    /** Chế độ dự phòng: #34 mỗi 2s. Trạng thái run vẫn đúng vì agent giữ ở `run.json`. */
    const startPoll = () => {
      if (pollTimer !== null) return;
      setPolling(true);
      setConnected(false);
      pollTimer = setInterval(() => {
        void qc.invalidateQueries({ queryKey: qk.runs.detail(runId) });
      }, STREAM_POLL_FALLBACK_MS);
    };

    const onEvent = (ev: StreamEvent) => {
      if (typeof ev.seq === "number" && ev.seq > lastSeqRef.current) lastSeqRef.current = ev.seq;

      if (ev.type === "job.log") {
        const e = ev as Extract<StreamEvent, { type: "job.log" }>;
        setLines((prev) => {
          const next = [...prev, {
            seq: e.seq,
            t: e.t ?? "",
            job: e.job ?? null,
            level: e.level,
            line: e.line,
          }];
          return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
        });
        return;
      }
      // Mọi event làm đổi trạng thái run ⇒ đẩy thẳng vào cache của Query để một
      // nguồn dữ liệu duy nhất nuôi cả màn (không có state song song đá nhau).
      if (ev.type === "job.started" || ev.type === "job.done" || ev.type === "progress" || ev.type === "phase.changed") {
        qc.setQueryData<Run>(qk.runs.detail(runId), (old) => (old ? applyEvent(old, ev) : old));
        return;
      }
      if (ev.type === "sheet.image") {
        /* NHỊP 1 — ẢNH VỪA CÓ. Gắn `artifact` vào job là đủ để thẻ sheet hiện ảnh
           (RawSheetsPanel đọc `job.artifact.path`), và đó là toàn bộ việc ở đây.
           CỐ Ý KHÔNG `invalidateQueries(kit)`: tấm này CHƯA cắt, kho kit chưa đổi một
           file nào — mời lại chỉ làm lưới ô đã cắt tháo ra dựng lại (đúng cái "lác
           lác" đang phải chữa) để lấy về y hệt dữ liệu cũ. Kho kit đợi `sheet.ready`. */
        qc.setQueryData<Run>(qk.runs.detail(runId), (old) => (old ? applyEvent(old, ev) : old));
        return;
      }
      if (ev.type === "sheet.ready") {
        // Tấm này đã snapshot + cắt xong trên đĩa GIỮA lượt: gắn artifact vào job
        // (ô "Đã xong" hiện ảnh ngay) và mời lại kho kit vì asset cắt đã đổi.
        qc.setQueryData<Run>(qk.runs.detail(runId), (old) => (old ? applyEvent(old, ev) : old));
        const projectId = qc.getQueryData<Run>(qk.runs.detail(runId))?.projectId;
        if (projectId) {
          void qc.invalidateQueries({ queryKey: qk.kit.all(projectId) });
          /* LỊCH SỬ ẢNH GỐC cũng vừa đổi: `run-handle` đã đẩy đời ảnh trước vào
             `.history/raw/` ngay trước khi engine vẽ tấm này. Không mời lại thì thanh
             phiên bản vẫn hiện đúng một mục và người dùng kết luận "gen lại không lên
             ver 2" — đúng câu chủ sản phẩm báo. Mời ở đây (giữa lượt) chứ không đợi
             `run.finished`: một lượt 20 tấm chạy cả chục phút. */
          void qc.invalidateQueries({ queryKey: qk.runs.rawHistoryOf(projectId) });
        }
        /* GIỮA LƯỢT, KHÔNG ĐỢI TỚI CUỐI. Một tấm xong = một lượt hỏi Codex đã tiêu và
           agent vừa dọn cache hạn mức. Lượt 20 tấm chạy cả chục phút; đợi `run.finished`
           mới cập nhật thì suốt chừng ấy phút thanh hạn mức nói dối một con số cũ.
           Rẻ: `/api/usage` chỉ đọc một file local, không gọi mạng, không tốn hạn mức. */
        void qc.invalidateQueries({ queryKey: qk.usage() });
        return;
      }
      if (ev.type === "run.finished") {
        void qc.invalidateQueries({ queryKey: qk.runs.detail(runId) });
        const projectId = qc.getQueryData<Run>(qk.runs.detail(runId))?.projectId;
        if (projectId) for (const key of keysAfterRun(projectId)) void qc.invalidateQueries({ queryKey: key });
        /* KHÔNG nằm trong nhánh `if (projectId)`: hạn mức là số của cả MÁY, không của
           project nào. Cache thiếu `runs.detail` (vào thẳng bằng link, F5 giữa lượt)
           là ca có thật — và đó đúng là ca người dùng cần con số mới nhất. */
        void qc.invalidateQueries({ queryKey: qk.usage() });
        stoppedRef.current = true;
      }
      if (ev.type === "workspace.changed") {
        // Contract bị sửa ngoài app ⇒ §3.4 "error (file đổi bên ngoài)".
        void qc.invalidateQueries({ queryKey: qk.projects.all() });
      }
    };

    const loop = async () => {
      while (!stoppedRef.current && !ac.signal.aborted) {
        try {
          setConnected(true);
          stopPoll();
          const r = await api.runs.stream(runId, {
            from: lastSeqRef.current > 0 ? lastSeqRef.current + 1 : 0,
            onEvent,
            onStall: () => startPoll(),
            signal: ac.signal,
          });
          if (r.cursorGone) {
            // 416: log đầu đã bị dọn. Lấy trạng thái đầy đủ rồi stream LẠI TỪ ĐẦU (§6.3).
            await qc.invalidateQueries({ queryKey: qk.runs.detail(runId) });
            lastSeqRef.current = 0;
            setLines([]);
            continue;
          }
          if (r.stalled) {
            startPoll();
            await sleep(STREAM_POLL_FALLBACK_MS);
            continue;
          }
          // Stream đóng bình thường: run đã xong hoặc agent đóng kết nối.
          const run = qc.getQueryData<Run>(qk.runs.detail(runId));
          if (run && run.status !== "running" && run.status !== "queued") break;
          await sleep(500);
        } catch (e) {
          if (ac.signal.aborted) break;
          setConnected(false);
          // Agent tắt giữa chừng: hạ xuống poll. Poll cũng fail thì Query tự vào chế độ
          // lỗi và §2.5 lo phần hiển thị — tầng này không dựng thông điệp riêng.
          if (e instanceof AgentError) startPoll();
          await sleep(STREAM_POLL_FALLBACK_MS);
        }
      }
      setConnected(false);
    };

    void loop();
    return () => {
      stoppedRef.current = true;
      ac.abort();
      stopPoll();
    };
  }, [enabled, runId, qc]);

  return { lines, lastSeq: lastSeqRef.current, polling, connected, clear };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Áp một event lên bản `Run` đang có trong cache. Thuần khiết, không đụng mạng —
 * tách ra để test được và để đảm bảo stream và poll cho cùng một hình dạng dữ liệu.
 */
export function applyEvent(run: Run, ev: StreamEvent): Run {
  switch (ev.type) {
    case "job.started": {
      const e = ev as Extract<StreamEvent, { type: "job.started" }>;
      return { ...run, seq: ev.seq, jobs: run.jobs.map((j) => (j.job === e.job ? { ...j, status: "running" } : j)) };
    }
    case "job.done": {
      const e = ev as Extract<StreamEvent, { type: "job.done" }>;
      return {
        ...run,
        seq: ev.seq,
        jobs: run.jobs.map((j) =>
          j.job === e.job
            ? {
                ...j,
                status: e.status,
                durationMs: e.durationMs ?? j.durationMs ?? null,
                diagnosis: e.diagnosis ?? j.diagnosis ?? null,
              }
            : j,
        ),
      };
    }
    case "progress": {
      const e = ev as Extract<StreamEvent, { type: "progress" }>;
      return {
        ...run,
        seq: ev.seq,
        progress: { done: e.done, total: e.total, failed: e.failed, etaSeconds: e.etaSeconds ?? null },
      };
    }
    case "phase.changed": {
      const e = ev as Extract<StreamEvent, { type: "phase.changed" }>;
      return { ...run, seq: ev.seq, phase: e.phase };
    }
    /* Hai nhịp, MỘT phép áp: cả hai đều chỉ nói "job này đã có ảnh ở đường dẫn kia".
       `sheet.image` tới trước (ngay khi engine ghi xong), `sheet.ready` tới sau khi đã
       cắt — và mang lại ĐÚNG artifact đó, nên áp lần hai là phép gán trùng, vô hại.
       `?? j.artifact` giữ ảnh cũ nếu event sau vì lý do nào đó không mang artifact:
       thà giữ ảnh đang hiện còn hơn cho ô đang có ảnh tự đen lại. */
    case "sheet.image":
    case "sheet.ready": {
      const e = ev as Extract<StreamEvent, { type: "sheet.image" | "sheet.ready" }>;
      return {
        ...run,
        seq: ev.seq,
        jobs: run.jobs.map((j) => (j.job === e.job ? { ...j, artifact: e.artifact ?? j.artifact ?? null } : j)),
      };
    }
    default:
      return run;
  }
}
