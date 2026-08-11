import * as React from "react";
import { useRun, useRuns, useRunStream } from "@/lib/hooks";
import { JobList } from "@/features/runs/components/JobList";
import { LogPanel } from "@/features/runs/components/LogPanel";
import { useRunLog } from "@/features/runs/lib/useRunLog";

/**
 * THEO DÕI TIẾN TRÌNH Ở BƯỚC ⑥ (§W3-9a).
 *
 * Bệnh: bấm "Cắt lại" xong người dùng **mù hoàn toàn** — không biết tấm nào xong,
 * tấm nào hỏng. `features/runs/` đã có sẵn `JobList` (badge ⏳/✅/❌ từng tấm) và
 * `LogPanel` (NDJSON, tự hạ xuống poll khi stream đứt); wave này chỉ **nhúng**, không
 * viết mới — đúng lời plan: *"hồi sinh, đừng viết lại"*.
 *
 * **0 đồng:** cả ba hook ở đây (`useRuns` #33, `useRun` #34, `useRunStream` #35) chỉ
 * ĐỌC `run.json` và log trên đĩa. Không hook nào TẠO run — nút tạo run duy nhất của
 * bước này là "Cắt lại" (`kind:"slice"`, PIL thuần).
 *
 * Chỉ hiện khi bộ kit ĐÃ có lượt chạy. Không có thì không dựng một khung rỗng nói
 * "chưa có gì" — bước ⑥ đã đủ đông.
 */
export function RunPanel({ projectId }: { projectId: string }) {
  const runs = useRuns(projectId, 1);
  const latest = runs.data?.items?.[0] ?? null;
  const runId = latest?.id ?? null;

  const live = latest?.status === "running" || latest?.status === "queued";
  const run = useRun(runId, { poll: false });
  useRunStream(runId, { enabled: live });
  const log = useRunLog({ runId: runId ?? "", projectId, enabled: Boolean(runId) });

  /* `JobList` memo hoá hàng theo `now`; cha phải nhịp mỗi giây KHI ĐANG CHẠY —
     và chỉ khi đang chạy, để run đã xong không giữ một timer sống mãi. */
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [live]);

  const [job, setJob] = React.useState<string | null>(null);

  if (!runId || !run.data) return null;

  return (
    <section className="run-panel">
      <div className="column-heading">
        <div>
          <span className="eyebrow">Lượt chạy gần nhất · {run.data.kind}</span>
          <h3>{run.data.progress.done}/{run.data.progress.total} tấm{run.data.progress.failed > 0 ? ` · ${run.data.progress.failed} hỏng` : ""}</h3>
        </div>
      </div>
      <JobList
        jobs={run.data.jobs}
        selectedJob={job}
        onSelect={setJob}
        onOpenLog={(j) => { setJob(j); log.setFilter({ job: j }); }}
        /* Chạy lại một tấm = sinh ảnh = TIÊU QUOTA ⇒ cửa đó là `GenerateDialog`,
           không phải chỗ này. `null` ẩn nút, đúng ý nghĩa mà JobList đã khai. */
        onRetry={null}
        readOnly
        readOnlyReason="Tạo lại từng sheet đang được hoàn thiện."
        now={now}
      />
      <LogPanel log={log} runId={runId} jobs={run.data.jobs.map((j) => j.job)} />
    </section>
  );
}
