import * as React from "react";
import { AlertCircle, Check, Image as ImageIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { KitImage } from "@/features/kit/components/KitImage";
import { generatedRuns, jobsForGroup, sheetLabel, type ResultGroup } from "../lib/generated-results";
import { GenerateDialog } from "@/features/runs";
import type { Contract, JobStatusValue } from "@/lib/types";
import { useRuns } from "@/lib/hooks";

const LABEL: Record<Exclude<ResultGroup, "all">, string> = {
  background: "Nền", popup: "Popup", small: "UI nhỏ & đạo cụ", mascot: "Mascot", other: "Khác",
};

export function GeneratedResults({ projectId, contract, jobStates, readOnly = false }: { projectId: string; contract: Contract | null; jobStates: Record<string, JobStatusValue>; readOnly?: boolean }) {
  const query = useRuns(projectId, 20);
  const groups = generatedRuns(query.data?.items ?? []);
  const [selection, setSelection] = React.useState<{ jobs: string[]; label: string } | null>(null);

  const request = (jobs: string[], label: string) => {
    if (jobs.length) setSelection({ jobs, label });
  };

  if (query.isLoading) return <p className="text-body text-fg-muted">Đang mở ảnh đã tạo…</p>;
  if (!groups.length) return (
    <div className="rounded-4 border border-dashed border-line-subtle bg-surface p-8 text-center">
      <ImageIcon className="mx-auto size-6 text-fg-muted" aria-hidden />
      <p className="mt-3 text-label text-fg-strong">Chưa có ảnh nào</p>
      <p className="mt-1 text-body text-fg-muted">Ảnh sẽ xuất hiện ở đây sau lượt tạo đầu tiên.</p>
    </div>
  );

  return (
    <div className="space-y-8">
      {groups.map((run, runIndex) => {
        const categories = [...new Set(run.items.map((item) => item.category))];
        return (
          <section key={run.id} className="space-y-4" aria-label={`Lần tạo ${run.id}`}>
            <header className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="eyebrow">{runIndex === 0 ? "Lần tạo gần nhất" : "Lần tạo trước"}</p>
                <h3 className="text-subtitle text-fg-strong">{run.at ? new Date(run.at).toLocaleString("vi-VN") : run.id}</h3>
              </div>
              <Button variant="secondary" size="sm" disabled={readOnly} onClick={() => request(run.items.map((item) => item.job), "toàn bộ lần tạo")}>
                <RefreshCw aria-hidden />Tạo lại tất cả
              </Button>
            </header>
            {categories.map((category) => {
              const items = run.items.filter((item) => item.category === category);
              return (
                <div key={category} className="rounded-4 border border-line-subtle bg-surface p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h4 className="text-label text-fg-strong">{LABEL[category]}</h4>
                    <Button variant="ghost" size="sm" disabled={readOnly} onClick={() => request(jobsForGroup(run.items, category), `nhóm ${LABEL[category]}`)}>
                      <RefreshCw aria-hidden />Tạo lại nhóm
                    </Button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {items.map((item) => (
                      <article key={`${run.id}-${item.job}`} className="overflow-hidden rounded-3 border border-line-subtle bg-raised">
                        {item.path ? <KitImage projectId={projectId} path={item.path} alt={`${LABEL[item.category]} ${sheetLabel(item.sheet)}`} backdrop="checker" eager className="aspect-[16/10] rounded-none border-0" /> : (
                          <div className="flex aspect-[16/10] items-center justify-center bg-canvas text-center">
                            <span><AlertCircle className="mx-auto size-5 text-danger" aria-hidden /><span className="mt-2 block text-caption text-fg-muted">Chưa tạo được ảnh</span></span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 p-3">
                          {item.status === "ok" ? <Check className="size-4 text-ok" aria-hidden /> : <AlertCircle className="size-4 text-danger" aria-hidden />}
                          <div className="min-w-0 flex-1"><p className="truncate text-label text-fg-strong">{sheetLabel(item.sheet)}</p><p className="truncate text-caption text-fg-muted">{item.geometryOk === false ? `${item.invalidCells} ô lệch bộ khung · Cần tạo lại` : (item.variant || "Phong cách chính")}</p></div>
                          <Button variant="ghost" size="icon-sm" aria-label={`Tạo lại ${sheetLabel(item.sheet)}`} disabled={readOnly} onClick={() => request([item.job], `tấm ${sheetLabel(item.sheet)}`)}><RefreshCw aria-hidden /></Button>
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
      <GenerateDialog open={selection !== null} onOpenChange={(open) => { if (!open) setSelection(null); }} projectId={projectId} contract={contract} jobStates={jobStates} initialJobs={selection?.jobs ?? null} readOnly={readOnly} readOnlyReason="Công cụ local chưa sẵn sàng" />
    </div>
  );
}
