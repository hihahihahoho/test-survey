import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Images, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDestructive, ErrorState, InlineBanner, LoadingState } from "@/components/common";
import { Progress } from "@/components/ui/progress";
import { toast, KG_TOAST_DURATION } from "@/components/ui/sonner";
import { SERIF } from "@/components/layout/flora";
import { devDetails, presentError } from "@/lib/api";
import { useAgentStatus, useCancelRun, useContract, useRun, useStartRun } from "@/lib/hooks";
import { gateOf, useNarrowViewport } from "@/features/projects/lib/gate";
import { JobDrawer } from "./components/JobDrawer";
import { SheetProgressGrid } from "./components/SheetProgressGrid";
import { approxTime, etaSeconds, isRunFinished, progressOf } from "./lib/format";
import { useRunLog } from "./lib/useRunLog";
import type { ScreenProps } from "@/components/layout";

export function RunDetailScreen({ projectId = "", runId = "" }: ScreenProps) {
  const navigate = useNavigate();
  const { status } = useAgentStatus({ hasActiveRun: true });
  const narrow = useNarrowViewport();
  const gate = React.useMemo(() => gateOf(status, narrow), [status, narrow]);
  const runQuery = useRun(runId);
  const run = runQuery.data ?? null;
  const contract = useContract(projectId);
  const cancelRun = useCancelRun(projectId);
  const startRun = useStartRun(projectId);
  const stream = useRunLog({ runId, projectId, enabled: !gate.readOnly });
  const [drawerJob, setDrawerJob] = React.useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const redirected = React.useRef(false);

  const finished = isRunFinished(run?.status);
  const success = run?.status === "done";
  React.useEffect(() => {
    if (!success || redirected.current) return;
    redirected.current = true;
    toast.success("Vẽ xong bộ kit", {
      duration: KG_TOAST_DURATION.success,
      action: { label: "Xem ngay", onClick: () => void navigate({ to: "/p/$projectId/kit", params: { projectId }, search: { tab: "assets" } }) },
    });
    const timer = setTimeout(() => void navigate({ to: "/p/$projectId/kit", params: { projectId }, search: { tab: "assets" } }), 1000);
    return () => clearTimeout(timer);
  }, [success, navigate, projectId]);

  const retry = React.useCallback((job: string) => {
    if (gate.readOnly) return;
    startRun.mutate({ kind: "gen", jobs: [job], maxJobs: run?.maxJobs ?? 4, autoSliceAfterGen: true }, {
      onSuccess: (result) => void navigate({ to: "/p/$projectId/runs/$runId", params: { projectId, runId: result.runId } }),
      onError: (error) => {
        const view = presentError(error);
        toast.error(view.title, { description: view.explain, duration: KG_TOAST_DURATION.error });
      },
    });
  }, [gate.readOnly, startRun, run?.maxJobs, navigate, projectId]);

  if (runQuery.isLoading && !run) return <div className="p-6"><LoadingState count={4} variant="cards" label="Đang xếp hàng…" /></div>;
  if (!run) {
    return <div className="p-6"><ErrorState title="Chưa mở được lượt vẽ" description="Hãy thử lại. Những ảnh đã vẽ xong vẫn còn trên máy." detail={runQuery.error ? devDetails(runQuery.error) : undefined} actions={<Button variant="primary" onClick={() => void runQuery.refetch()}>Thử lại</Button>} /></div>;
  }

  const progress = progressOf(run);
  const phase = run.phase?.index === 2 || success ? 2 : 1;
  const offline = !status.connected;
  const failedWholeRun = run.status === "env-failed";

  return (
    <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-8 p-6 lg:p-8">
      <header className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild><Link to="/p/$projectId" params={{ projectId }} aria-label="Về dự án"><ArrowLeft aria-hidden /></Link></Button>
          <div>
            <h1 className="text-display text-fg-strong">Máy đang <span className={SERIF}>vẽ</span></h1>
            <p className="text-caption text-fg-muted-raised">Bạn không cần bấm gì. Có thể rời màn này và quay lại sau.</p>
          </div>
          <span className="ml-auto rounded-full border border-line-subtle bg-surface px-3 py-1 text-label text-fg">{finished ? "Đã dừng" : "Đang vẽ"}</span>
        </div>

        <div className="rounded-4 border border-line-subtle bg-surface p-5">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <p className="text-label text-fg-strong">Bước 1/2 · Vẽ <span className="px-2 text-fg-muted-raised">→</span> Bước 2/2 · Tách nền</p>
              <p className="text-caption text-fg">{phase === 2 ? "Vẽ xong rồi, máy đang cắt từng món ra khỏi nền." : "Máy đang vẽ từng tấm theo bản thiết kế."}</p>
            </div>
            <p className="text-label text-fg-strong" role="status" aria-live="polite">Xong {progress.done}/{progress.total} tấm{!finished && ` · còn ${approxTime(etaSeconds(run))}`}</p>
          </div>
          <Progress value={phase === 2 && !success ? 90 : progress.percent} aria-label={`Xong ${progress.done} trên ${progress.total} tấm; bước ${phase} trên 2`} />
        </div>
      </header>

      {stream.polling && !offline && <InlineBanner tone="warning" title="Mất kết nối với công cụ trên máy" description="Vẫn đang theo dõi bằng cách hỏi lại mỗi 2 giây." />}
      {offline && <InlineBanner tone="warning" title="Công cụ trên máy đã dừng" description="Ảnh đã vẽ xong vẫn còn. Mở lại công cụ để tiếp tục theo dõi." />}
      {failedWholeRun && <ErrorState title="Máy chưa thể tiếp tục vẽ" description="Hãy kiểm tra công cụ trên máy rồi vẽ lại. Những tấm đã xong vẫn được giữ." actions={<Button variant="secondary" onClick={() => void runQuery.refetch()}>Thử lại</Button>} />}

      <SheetProgressGrid run={run} contract={contract.data?.contract ?? null} onLog={setDrawerJob} onRetry={retry} readOnly={gate.readOnly || startRun.isPending} />

      <footer className="flex justify-end">
        {!finished ? <Button variant="ghost" disabled={gate.readOnly} onClick={() => setConfirmCancel(true)}><Square aria-hidden /> Dừng lại</Button> : <Button variant="primary" asChild><Link to="/p/$projectId/kit" params={{ projectId }} search={{ tab: "assets" }}><Images aria-hidden /> Xem bộ kit</Link></Button>}
      </footer>

      <ConfirmDestructive open={confirmCancel} onOpenChange={setConfirmCancel} title="Dừng vẽ?" description="Những tấm đã vẽ xong vẫn giữ. Tấm đang vẽ dở sẽ bỏ." actionLabel="Dừng vẽ" cancelLabel="Tiếp tục vẽ" pending={cancelRun.isPending} onConfirm={() => cancelRun.mutate(runId, { onSuccess: () => setConfirmCancel(false), onError: (error) => { const view = presentError(error); toast.error(view.title, { description: view.explain }); } })} />
      <JobDrawer open={drawerJob !== null} onOpenChange={(open) => !open && setDrawerJob(null)} runId={runId} job={drawerJob} onRetry={retry} readOnly={gate.readOnly} readOnlyReason={gate.reason} />
    </main>
  );
}

export default RunDetailScreen;
