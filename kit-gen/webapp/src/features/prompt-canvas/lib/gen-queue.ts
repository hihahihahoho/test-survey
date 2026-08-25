import * as React from "react";
import { AgentError } from "@/lib/api/client";
import { presentError } from "@/lib/api/errors";
import { useRun, useRunStream } from "@/lib/hooks";
import { useGenerateRun } from "@/features/runs";
import { isRunLive } from "@/features/workflow-v4/lib/generated-results";

/**
 * gen-queue.ts — HÀNG ĐỢI VẼ PHÍA WEB, vì agent chỉ cho MỘT lượt mỗi dự án.
 *
 * ╔══ LUẬT CỦA AGENT, VÀ HỆ QUẢ KHÔNG TRÁNH ĐƯỢC ════════════════════════════╗
 * ║ `agent/lib/runs.mjs:104` — dự án đã có lượt chưa kết thúc thì lượt thứ hai ║
 * ║ nhận thẳng 409 `RUN_CONFLICT`. Nhưng màn prompt-first có nút Gen TRÊN TỪNG ║
 * ║ THẺ: người ta soạn xong ba thẻ rồi bấm Gen cả ba trong mười giây. Không có ║
 * ║ hàng đợi thì hai cú bấm sau là hai hộp lỗi đỏ — và người dùng học được      ║
 * ║ đúng một điều sai: "bấm nhanh là hỏng".                                    ║
 * ║                                                                          ║
 * ║ Hàng đợi này KHÔNG phải một hàng đợi ở server, và không giả vờ là vậy:     ║
 * ║ nó sống trong tab. Đóng tab là mất phần chưa phóng — nói thẳng ở UI bằng   ║
 * ║ chữ "đang chờ tấm trước", không hứa gì về lúc vắng mặt.                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO CŨNG BÁM CẢ RUN CỦA NGƯỜI KHÁC ═════════════════════════════════
 * Lượt đang chạy có thể không phải do màn này phóng (tab thứ hai, màn wizard cũ,
 * lượt còn sót từ trước khi mở trang). Khi POST trả 409, `details.runId` cho biết
 * lượt nào đang giữ chỗ — ta bám theo ĐÚNG lượt đó và thử lại khi nó xong, thay
 * vì thử lại theo đồng hồ. Không có vòng retry nào ở đây; mỗi lần thử là một sự
 * kiện có thật (một lượt vừa kết thúc).
 */

export type GenStatus = "idle" | "queued" | "running" | "done" | "fail";

export interface GenBlockState {
  status: GenStatus;
  /** Câu hiện dưới nút — lý do chờ, tiến trình, hoặc lỗi. Rỗng khi không có gì để nói. */
  message: string;
  /** Lượt chạy của thẻ này (khi đã phóng). */
  runId: string | null;
  done: number;
  total: number;
}

const IDLE: GenBlockState = { status: "idle", message: "", runId: null, done: 0, total: 0 };

/** Câu DUY NHẤT cho ca "phải đợi tấm trước" — hai chỗ nói hai kiểu là hai sự thật. */
export const WAITING_COPY = "Đang chờ tấm trước";

interface Entry {
  blockId: string;
  jobs: string[];
  /** Lượt của chính thẻ này; `null` = chưa phóng được (đang xếp hàng). */
  runId: string | null;
  message: string;
}

export interface GenQueue {
  stateOf: (blockId: string) => GenBlockState;
  /** Đưa một thẻ vào cuối hàng. Thẻ đã ở trong hàng ⇒ không làm gì. */
  enqueue: (blockId: string) => void;
  /** Bỏ một thẻ ĐANG CHỜ khỏi hàng. Thẻ đang chạy thì không bỏ được (đã tiêu lượt). */
  dequeue: (blockId: string) => void;
  /** Số thẻ đang chờ tới lượt (không kể thẻ đang chạy). */
  waiting: number;
  activeRunId: string | null;
}

/**
 * @param prepare Việc phải làm NGAY TRƯỚC khi phóng một thẻ: chụp ảnh dáng nếu
 *   thiếu, dựng contract mới nhất, PUT lên server — rồi trả về danh sách job của
 *   thẻ ấy. Ném ⇒ thẻ vào trạng thái lỗi và hàng đợi đi tiếp.
 *   Nó chạy ở ĐÚNG lúc phóng chứ không lúc bấm: thẻ thứ ba có thể đợi vài phút,
 *   và trong lúc ấy người dùng còn sửa chữ — thứ được vẽ phải là bản mới nhất.
 */
export function useGenQueue(
  projectId: string,
  prepare: (blockId: string) => Promise<string[]>,
): GenQueue {
  const [entries, setEntries] = React.useState<Entry[]>([]);
  const [settled, setSettled] = React.useState<Record<string, GenBlockState>>({});
  const [activeRunId, setActiveRunId] = React.useState<string | null>(null);

  const gen = useGenerateRun(projectId);
  const run = useRun(activeRunId, { poll: false });
  /* Stream để tiến trình chạy MƯỢT: nó đẩy `progress`/`job.done` thẳng vào cache
     của Query, tức chính chỗ `useRun` ở trên đọc. Không có state song song. */
  useRunStream(activeRunId, { enabled: Boolean(activeRunId) });

  const entriesRef = React.useRef(entries);
  entriesRef.current = entries;
  const prepareRef = React.useRef(prepare);
  prepareRef.current = prepare;
  const startRef = React.useRef(gen.startJobs);
  startRef.current = gen.startJobs;
  /* Một lượt phóng đang bay. `useRef` chứ không `useState`: nó là cái KHOÁ, và
     một cái khoá đặt bằng state thì hai effect chạy trong cùng một nhịp render
     đều thấy nó chưa khoá. */
  const launchingRef = React.useRef(false);

  const head = entries[0] ?? null;

  /* ── Phóng thẻ đầu hàng ────────────────────────────────────────────────── */
  React.useEffect(() => {
    if (!head || head.runId || activeRunId || launchingRef.current) return;
    launchingRef.current = true;
    const blockId = head.blockId;

    void (async () => {
      try {
        const jobs = await prepareRef.current(blockId);
        if (jobs.length === 0) throw new Error("Thẻ này chưa có gì để vẽ — thêm nội dung trước đã.");
        const res = await startRef.current(jobs);
        setEntries((prev) => prev.map((e) => (e.blockId === blockId ? { ...e, jobs, runId: res.runId, message: "" } : e)));
        setActiveRunId(res.runId);
      } catch (error) {
        const conflictRun = runIdOfConflict(error);
        if (conflictRun) {
          /* Có lượt khác đang giữ chỗ. Giữ thẻ NGUYÊN VỊ TRÍ trong hàng và bám
             theo lượt kia — khi nó xong, effect này chạy lại đúng một lần. */
          setEntries((prev) => prev.map((e) => (e.blockId === blockId ? { ...e, message: WAITING_COPY } : e)));
          setActiveRunId(conflictRun);
          return;
        }
        setSettled((prev) => ({ ...prev, [blockId]: { ...IDLE, status: "fail", message: failCopy(error) } }));
        setEntries((prev) => prev.filter((e) => e.blockId !== blockId));
      } finally {
        launchingRef.current = false;
      }
    })();
  }, [head, activeRunId]);

  /* ── Lượt kết thúc ⇒ chốt sổ thẻ đó và mở đường cho thẻ kế ─────────────── */
  React.useEffect(() => {
    const data = run.data;
    if (!activeRunId || !data || data.id !== activeRunId || isRunLive(data.status)) return;

    const owner = entriesRef.current.find((e) => e.runId === activeRunId);
    if (owner) {
      const failed = data.jobs.filter((job) => job.status === "failed");
      setSettled((prev) => ({
        ...prev,
        [owner.blockId]: failed.length
          ? {
              ...IDLE,
              status: "fail",
              runId: activeRunId,
              total: data.jobs.length,
              message:
                data.status === "cancelled"
                  ? "Lượt vẽ đã bị dừng."
                  : `${failed.length}/${data.jobs.length} tấm không vẽ được.`,
            }
          : { ...IDLE, status: "done", runId: activeRunId, done: data.jobs.length, total: data.jobs.length },
      }));
      setEntries((prev) => prev.filter((e) => e.blockId !== owner.blockId));
    }
    setActiveRunId(null);
  }, [run.data, activeRunId]);

  const stateOf = React.useCallback(
    (blockId: string): GenBlockState => {
      const entry = entries.find((e) => e.blockId === blockId);
      if (!entry) return settled[blockId] ?? IDLE;
      if (!entry.runId) {
        return { ...IDLE, status: "queued", message: entry.message || WAITING_COPY };
      }
      const progress = run.data?.id === entry.runId ? run.data.progress : null;
      /* Tên pha rút ra TRƯỚC khi ghép câu — xem chú thích cùng kiểu ở `OnePrompt`
         (`CanvasBlock.tsx`): cổng từ cấm quét cả biểu thức trong chuỗi mẫu. */
      const phase = run.data?.phase?.name ?? "";
      return {
        status: "running",
        message: phase ? `Đang vẽ · ${phase}` : "Đang vẽ…",
        runId: entry.runId,
        done: progress?.done ?? 0,
        total: progress?.total ?? entry.jobs.length,
      };
    },
    [entries, settled, run.data],
  );

  const enqueue = React.useCallback((blockId: string) => {
    setSettled((prev) => {
      if (!(blockId in prev)) return prev;
      const next = { ...prev };
      delete next[blockId];
      return next;
    });
    setEntries((prev) => (prev.some((e) => e.blockId === blockId) ? prev : [...prev, { blockId, jobs: [], runId: null, message: WAITING_COPY }]));
  }, []);

  const dequeue = React.useCallback((blockId: string) => {
    /* CHỈ bỏ được thẻ chưa phóng. Thẻ đang chạy đã tiêu lượt rồi — muốn dừng thì
       đó là chuyện của nút Dừng ở màn lượt chạy, không phải "bỏ khỏi hàng". */
    setEntries((prev) => prev.filter((e) => e.blockId !== blockId || e.runId !== null));
  }, []);

  return {
    stateOf,
    enqueue,
    dequeue,
    waiting: entries.filter((e) => e.runId === null).length,
    activeRunId,
  };
}

/** `runId` của 409 RUN_CONFLICT / RUN_ACTIVE; rỗng ⇒ không phải ca chờ lượt. */
function runIdOfConflict(error: unknown): string | null {
  if (!(error instanceof AgentError)) return null;
  if (error.code !== "RUN_CONFLICT" && error.code !== "RUN_ACTIVE") return null;
  const details = error.details;
  if (!details || typeof details !== "object") return null;
  const runId = (details as Record<string, unknown>)["runId"];
  return typeof runId === "string" && runId ? runId : null;
}

/** Câu lỗi cho thẻ. Lỗi của agent đi qua bảng chung; lỗi của ta thì nói nguyên văn. */
function failCopy(error: unknown): string {
  if (error instanceof AgentError) {
    const v = presentError(error);
    return `${v.title}. ${v.explain}`;
  }
  return error instanceof Error ? error.message : String(error);
}
