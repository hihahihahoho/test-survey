import * as React from "react";
import { AlertCircle, Check, Clock, Image as ImageIcon, Loader2, RefreshCw, Square, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KitImage } from "@/features/kit/components/KitImage";
import { diagnosisText } from "@/features/runs/lib/format";
import {
  generatedRuns, groupLabel, isRunLive, jobsForGroup, resultProgress, sheetLabel,
  type GeneratedResultItem, type GeneratedRunGroup, type ResultGroup,
} from "../lib/generated-results";
import { CutAssetGrid } from "./CutAssetGrid";
import { GenerateDialog } from "@/features/runs";
import type { Contract, JobStatusValue } from "@/lib/types";
import { useCancelRun, useRun, useRuns, useRunStream } from "@/lib/hooks";
import { toastError, toastInfo } from "@/features/projects/lib/feedback";

/**
 * ══ MÀN "ẢNH ĐÃ TẠO" ════════════════════════════════════════════════════════
 *
 * Hai tab, hai vai trò khác nhau — không phải hai cách xem cùng một thứ:
 *  · **Ảnh thật** (mặc định) — ô ĐÃ CẮT trong `kits/`, tức sản phẩm. §12 của
 *    PRODUCT-SITEMAP: chroma và lưới bị loại bằng hậu xử lý deterministic.
 *  · **Ảnh gốc** — sheet thô `raw/` còn nguyên nền chroma, để đối chiếu khi ô cắt
 *    ra trông sai. Đây là ảnh trung gian, nên nó là tab PHỤ.
 *
 * Trạng thái từng sheet ở tab "Ảnh gốc" đọc theo VÒNG ĐỜI THẬT của run
 * (`resultStateOf`), không đọc theo "có file hay không": vừa bấm Tạo ảnh mà mọi thẻ
 * đã đỏ "Chưa tạo được ảnh" là lời nói dối, không phải trạng thái.
 */

const STATE_UI = {
  queued: { icon: Clock, tone: "text-fg-muted", label: "Đang chờ" },
  running: { icon: Loader2, tone: "text-accent-text", label: "Đang tạo" },
  done: { icon: Check, tone: "text-ok", label: "Xong" },
  failed: { icon: AlertCircle, tone: "text-danger", label: "Lỗi" },
  cancelled: { icon: Square, tone: "text-warn", label: "Đã dừng" },
} as const;

export function GeneratedResults({ projectId, contract, jobStates, category = "all", readOnly = false }: {
  projectId: string;
  contract: Contract | null;
  jobStates: Record<string, JobStatusValue>;
  category?: ResultGroup;
  readOnly?: boolean;
}) {
  const query = useRuns(projectId, 20);
  const items = query.data?.items ?? [];

  /* Lượt gen mới nhất là lượt DUY NHẤT có thể còn sống. Mở stream cho đúng nó ⇒
     thẻ đổi trạng thái ngay khi agent phát `job.started`/`job.done`, không phải đợi
     người dùng F5. `useRun` giữ cache cho stream đổ dữ liệu vào (một nguồn duy nhất). */
  const newest = items.find((run) => run.kind === "gen") ?? null;
  const liveId = newest && isRunLive(newest.status) ? newest.id : null;
  const detail = useRun(liveId, { poll: false });
  useRunStream(liveId, { enabled: Boolean(liveId) });

  const merged = React.useMemo(
    () => items.map((run) => (detail.data && detail.data.id === run.id ? detail.data : run)),
    [items, detail.data],
  );
  const groups = generatedRuns(merged);

  const [versionId, setVersionId] = React.useState<string>("");
  const [selection, setSelection] = React.useState<{ jobs: string[]; label: string } | null>(null);
  React.useEffect(() => {
    if (groups.length && !groups.some((group) => group.id === versionId)) setVersionId(groups[0]!.id);
  }, [groups, versionId]);
  const visibleRuns = groups.filter((group) => group.id === (versionId || groups[0]?.id));
  const liveGroup = groups.find((group) => group.live) ?? null;

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
    <div className="space-y-6">
      {liveGroup ? <RunProgressBar projectId={projectId} group={liveGroup} readOnly={readOnly} /> : null}

      <Tabs defaultValue="cut">
        {/* `aria-label` để phân biệt với hàng tab BÊN NGOÀI của màn quản lý dự án
            ("Ảnh thật" / "Skeleton") — hai hàng tab lồng nhau có một nhãn trùng. */}
        <TabsList aria-label="Chế độ xem ảnh">
          <TabsTrigger value="cut">Ảnh thật</TabsTrigger>
          <TabsTrigger value="raw">Ảnh gốc</TabsTrigger>
        </TabsList>

        <TabsContent value="cut">
          <CutAssetGrid projectId={projectId} contract={contract} category={category} />
        </TabsContent>

        <TabsContent value="raw" className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-3 bg-surface p-3">
            <div>
              <p className="text-label text-fg-strong">Sheet gốc theo phiên bản</p>
              <p className="text-caption text-fg-muted">Ảnh còn nguyên nền chroma, dùng để đối chiếu. Ảnh cũ vẫn được giữ.</p>
            </div>
            <Select value={versionId || groups[0]?.id} onValueChange={setVersionId}>
              <SelectTrigger aria-label="Phiên bản ảnh" className="w-64"><SelectValue /></SelectTrigger>
              <SelectContent>
                {groups.map((group, index) => (
                  <SelectItem key={group.id} value={group.id}>
                    {index === 0 ? "Mới nhất" : `Phiên bản ${groups.length - index}`} · {group.at ? new Date(group.at).toLocaleString("vi-VN") : group.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {visibleRuns.map((run, runIndex) => {
            const visibleItems = run.items.filter((item) => category === "all" || item.category === category);
            const categories = [...new Set(visibleItems.map((item) => item.category))];
            return (
              <section key={run.id} className="space-y-4" aria-label={`Lần tạo ${run.id}`}>
                <header className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="eyebrow">{runIndex === 0 ? "Lần tạo gần nhất" : "Lần tạo trước"}</p>
                    <h3 className="text-subtitle text-fg-strong">{run.at ? new Date(run.at).toLocaleString("vi-VN") : run.id}</h3>
                  </div>
                  <Button
                    variant="secondary" size="sm" disabled={readOnly || run.live}
                    onClick={() => request(
                      visibleItems.map((item) => item.job),
                      category === "all" ? "toàn bộ thành phẩm" : `nhóm ${groupLabel(category)}`,
                    )}
                  >
                    <RefreshCw aria-hidden />{category === "all" ? "Tạo lại toàn bộ" : "Tạo lại nhóm này"}
                  </Button>
                </header>
                {categories.map((itemCategory) => {
                  const sheets = visibleItems.filter((item) => item.category === itemCategory);
                  return (
                    <div key={itemCategory} className="rounded-4 border border-line-subtle bg-surface p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h4 className="text-label text-fg-strong">{groupLabel(itemCategory)}</h4>
                        <Button
                          variant="ghost" size="sm" disabled={readOnly || run.live}
                          onClick={() => request(jobsForGroup(run.items, itemCategory), `nhóm ${groupLabel(itemCategory)}`)}
                        >
                          <RefreshCw aria-hidden />Tạo lại nhóm
                        </Button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {sheets.map((item) => (
                          <SheetCard
                            key={`${run.id}-${item.job}`} projectId={projectId} item={item} readOnly={readOnly}
                            onRegenerate={() => request([item.job], `tấm ${sheetLabel(item.sheet)}`)}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </TabsContent>
      </Tabs>

      <GenerateDialog
        open={selection !== null}
        onOpenChange={(open) => { if (!open) setSelection(null); }}
        projectId={projectId} contract={contract} jobStates={jobStates}
        initialJobs={selection?.jobs ?? null} readOnly={readOnly}
        readOnlyReason="Công cụ local chưa sẵn sàng"
      />
    </div>
  );
}

/**
 * DẢI TIẾN TRÌNH + NÚT DỪNG.
 *
 * Nút Dừng gọi `#36 POST /api/runs/:runId/cancel` — agent giết cả process group của
 * `gen.sh` và **giữ nguyên ảnh của những lượt đã xong** (`run-handle.mjs:285`). Job dở
 * bị đưa về `queued` trong một run `cancelled`, nên UI đọc ra "Đã dừng", không phải lỗi.
 */
function RunProgressBar({ projectId, group, readOnly }: {
  projectId: string;
  group: GeneratedRunGroup;
  readOnly: boolean;
}) {
  const progress = resultProgress(group.items);
  const cancel = useCancelRun(projectId);
  const [confirm, setConfirm] = React.useState(false);
  const percent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <>
      <section
        className="rounded-4 border border-line-subtle bg-surface p-4"
        role="status"
        aria-label="Tiến trình tạo ảnh"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-label text-fg-strong">
              <Loader2 className="size-4 animate-spin text-accent-text" aria-hidden />
              Đang tạo ảnh · {progress.done}/{progress.total} sheet xong
            </p>
            <p className="mt-1 text-caption text-fg-muted">
              {progress.running > 0 ? `${progress.running} sheet đang vẽ` : "Đang xếp hàng"}
              {progress.failed > 0 ? ` · ${progress.failed} sheet lỗi` : ""}
              {" · ảnh của sheet đã xong được giữ lại nếu bạn dừng"}
            </p>
          </div>
          <Button
            variant="secondary" size="sm" disabled={readOnly || cancel.isPending}
            onClick={() => setConfirm(true)}
          >
            <StopCircle aria-hidden />{cancel.isPending ? "Đang dừng…" : "Dừng"}
          </Button>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-raised">
          <div className="h-full rounded-full bg-accent transition-[width] duration-2" style={{ width: `${percent}%` }} />
        </div>
      </section>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Dừng lượt tạo ảnh?</AlertDialogTitle>
            <AlertDialogDescription>
              {progress.done > 0
                ? `${progress.done} sheet đã xong vẫn được giữ. Các sheet còn lại sẽ dừng và có thể tạo lại sau.`
                : "Chưa sheet nào xong. Các sheet đang chờ sẽ dừng và có thể tạo lại sau."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Tiếp tục tạo</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => cancel.mutate(group.id, {
                onSuccess: () => toastInfo("Đã dừng lượt tạo ảnh", "Ảnh của sheet đã xong vẫn được giữ."),
                onError: (err) => toastError(err, {}),
              })}
            >
              Dừng tạo ảnh
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Một sheet THÔ của một lần tạo — ảnh còn nền chroma, trạng thái theo vòng đời run. */
function SheetCard({ projectId, item, readOnly, onRegenerate }: {
  projectId: string;
  item: GeneratedResultItem;
  readOnly: boolean;
  onRegenerate: () => void;
}) {
  const ui = STATE_UI[item.state];
  const Icon = ui.icon;
  const label = sheetLabel(item.sheet);
  return (
    <article className="overflow-hidden rounded-3 border border-line-subtle bg-raised">
      {item.path ? (
        <KitImage projectId={projectId} path={item.path} alt={label} backdrop="checker" eager className="aspect-[16/10] rounded-none border-0" />
      ) : (
        <div className="flex aspect-[16/10] items-center justify-center bg-canvas text-center">
          <span>
            <Icon className={`mx-auto size-5 ${ui.tone}${item.state === "running" ? " animate-spin" : ""}`} aria-hidden />
            <span className="mt-2 block text-caption text-fg-muted">{stateCopy(item)}</span>
          </span>
        </div>
      )}
      <div className="flex items-center gap-2 p-3">
        <Icon className={`size-4 shrink-0 ${ui.tone}${item.state === "running" ? " animate-spin" : ""}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-label text-fg-strong">{label}</p>
          <p className="truncate text-caption text-fg-muted">{detailCopy(item)}</p>
        </div>
        <Button
          variant="ghost" size="icon-sm" aria-label={`Tạo lại ${label}`}
          disabled={readOnly || item.state === "running" || item.state === "queued"}
          onClick={onRegenerate}
        >
          <RefreshCw aria-hidden />
        </Button>
      </div>
    </article>
  );
}

/** Câu trong ô ảnh khi chưa có ảnh — mỗi trạng thái một câu, không dùng chung câu lỗi. */
export function stateCopy(item: Pick<GeneratedResultItem, "state">): string {
  switch (item.state) {
    case "queued": return "Đang chờ tới lượt";
    case "running": return "Đang tạo ảnh…";
    case "cancelled": return "Đã dừng";
    case "done": return "Đã xong";
    default: return "Chưa tạo được ảnh";
  }
}

/** Dòng phụ dưới tên sheet: chỉ nói lý do khi THẬT SỰ lỗi. */
export function detailCopy(item: Pick<GeneratedResultItem, "state" | "diagnosis" | "geometryOk" | "invalidCells" | "variant">): string {
  if (item.state === "failed") return diagnosisText(item.diagnosis);
  if (item.state === "cancelled") return "Bạn đã dừng lượt này · tạo lại khi cần";
  if (item.state === "queued") return "Chưa tiêu lượt nào";
  if (item.state === "running") return "Đang gửi cho công cụ tạo ảnh";
  if (item.geometryOk === false) return `${item.invalidCells} ô lệch bộ khung · Cần tạo lại`;
  return item.variant || "Phong cách chính";
}
