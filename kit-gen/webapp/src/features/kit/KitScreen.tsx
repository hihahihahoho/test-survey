import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { RefreshCw, Scissors } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { EmptyState, ErrorState, InlineBanner } from "@/components/common";
import { DISPLAY } from "@/components/layout/flora";
import type { ScreenProps } from "@/components/layout";
import type { KitFile } from "@/lib/types";
import { devDetails, presentError } from "@/lib/api";
import { useAgentStatus, useRevealProject } from "@/lib/hooks";
import { gateOf, useNarrowViewport } from "@/features/projects/lib/gate";
import { BTN, EMPTY, TRUTH } from "@/features/kitfile";
import { GenerateDialog } from "@/features/runs";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";
import { ResultActions } from "./components/ResultActions";
import { ResultGrid } from "./components/ResultGrid";
import { ItemEditPanel } from "./components/ItemEditPanel";
import { savePath, exportZipPath, zipFallbackName } from "./lib/download";
import { useKitScreenData, useSliceRun } from "./lib/useKitData";

export function KitScreen({ projectId = "" }: ScreenProps) {
  const navigate = useNavigate();
  const { status } = useAgentStatus();
  const narrow = useNarrowViewport();
  const gate = gateOf(status, narrow);
  const data = useKitScreenData(projectId, undefined);
  const { projectQuery, contractQuery, kitQuery, contract, variantId } = data;
  const project = projectQuery.data ?? null;
  const files = kitQuery.data?.files ?? [];
  const slice = useSliceRun(projectId);
  const reveal = useRevealProject(projectId);
  const [redraw, setRedraw] = React.useState(false);
  const [redrawSheet, setRedrawSheet] = React.useState<string | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<KitFile | null>(null);
  const [downloading, setDownloading] = React.useState(false);
  const missing = kitQuery.error && presentError(kitQuery.error).code === "KIT_NOT_CUT";
  const loading = projectQuery.isLoading || contractQuery.isLoading || kitQuery.isLoading;
  const hasRaw = (project?.stats?.rawPresent ?? 0) > 0;
  const jobStates = project?.state?.jobs ?? {};
  const jobs = Object.keys(jobStates);

  const startSlice = () => slice.sliceJobs(jobs).then(() => toastSuccess("Đã bắt đầu tách nền")).catch((e: unknown) => toastError(e));
  const download = (raw: boolean) => {
    setDownloading(true);
    savePath(exportZipPath(projectId, raw ? ["kits", "raw"] : ["kits"], variantId), zipFallbackName(project?.slug ?? projectId))
      .then(() => toastSuccess("Đã tải bộ kit về máy"))
      .catch((e: unknown) => toastError(presentError(e).code === "RUN_ACTIVE" ? { code: "RUN_ACTIVE" } : e))
      .finally(() => setDownloading(false));
  };

  if (kitQuery.error && !missing) return <main className="p-6"><ErrorState title="Chưa mở được bộ kit." description="Thử lại. Ảnh trên máy vẫn được giữ nguyên." detail={devDetails(kitQuery.error)} actions={<Button onClick={() => void kitQuery.refetch()}><RefreshCw aria-hidden />{BTN.RETRY}</Button>} /></main>;

  return <main className="relative min-h-[calc(100vh-var(--kg-header))] px-6 pb-32 pt-6 lg:px-12">
    {gate.readOnly && <InlineBanner className="mb-6" tone="warn" title="Công cụ trên máy chưa chạy" description="Mở Terminal và chạy npm run agent, rồi bấm Thử lại. Bạn vẫn xem được ảnh đã lưu lần trước." />}
    <header className="mb-12"><h1 className={DISPLAY}>Bộ kit</h1><p className="mt-2 text-body text-fg-muted">{project?.name ?? "Dự án"} · {files.length} món{kitQuery.data?.cutAt ? " · đã hoàn tất" : ""}</p></header>
    <Tabs value="result">
      <TabsContent value="result" className="mt-0">
        {loading ? <ResultSkeleton count={project?.stats?.kitsCut ?? 12} /> : missing || files.length === 0 ? hasRaw
          ? <EmptyState icon={Scissors} title={EMPTY.w3NotCut.title} description={EMPTY.w3NotCut.body} action={<Button variant="primary" disabled={gate.readOnly} title={gate.readOnly ? gate.reason : undefined} onClick={startSlice}>{BTN.CUT_NOW}</Button>} />
          : <EmptyState icon={RefreshCw} title={EMPTY.w3NotDrawn.title} description={EMPTY.w3NotDrawn.body} action={<Button variant="primary" disabled={gate.readOnly} title={gate.readOnly ? gate.reason : undefined} onClick={() => setRedraw(true)}>{BTN.START_GEN}</Button>} />
          : <><ResultGrid projectId={projectId} files={files} offline={gate.readOnly} onOpen={(group, index) => setSelectedFile(group[index] ?? null)} /><p className="mt-12 text-caption text-fg-muted">{TRUTH.NO_OLD_VERSION}</p><ResultActions disabledReason={gate.readOnly ? gate.reason : null} downloading={downloading} onDownload={download} onRedraw={() => setRedraw(true)} onDesign={() => void navigate({ to: "/p/$projectId/design", params: { projectId } })} onHistory={() => void navigate({ to: "/p/$projectId/runs", params: { projectId } })} onReveal={() => reveal.mutate(undefined)} /></>}
      </TabsContent>
    </Tabs>
    <ItemEditPanel open={selectedFile !== null} onOpenChange={(open) => { if (!open) setSelectedFile(null); }} projectId={projectId} file={selectedFile} contract={contract} version={contractQuery.data?.version ?? 0} offline={gate.readOnly} readOnlyReason={gate.reason} onRedraw={(sheetId) => { setRedrawSheet(sheetId); setRedraw(true); }} />
    <GenerateDialog open={redraw} onOpenChange={(open) => { setRedraw(open); if (!open) setRedrawSheet(null); }} projectId={projectId} contract={contract} jobStates={jobStates} onlySheetId={redrawSheet} readOnly={gate.readOnly} readOnlyReason={gate.reason} />
  </main>;
}

function ResultSkeleton({ count }: { count: number }) {
  return <div aria-label="Đang mở bộ kit" aria-busy="true" className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">{Array.from({ length: Math.min(Math.max(count, 6), 18) }, (_, i) => <div key={i} className="aspect-square animate-pulse rounded-3 border border-line-subtle bg-raised" />)}</div>;
}
