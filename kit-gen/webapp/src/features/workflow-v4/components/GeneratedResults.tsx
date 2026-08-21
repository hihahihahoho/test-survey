import * as React from "react";
import { Image as ImageIcon, Loader2, PlayCircle, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  generatedRuns, isRunLive, resultProgress, resumeInvite,
  type GeneratedRunGroup, type ResultGroup,
} from "../lib/generated-results";
import { GenerateDialog } from "@/features/runs";
import { CutAssetGrid } from "./CutAssetGrid";
import { RawSheetsPanel } from "./RawSheetsPanel";
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
 * Bên trong MỖI tab, trang là MỘT dải cuộn dọc chia khối theo nhóm (Mascot · Nền ·
 * Popup · UI nhỏ · Đạo cụ). Hàng chip lọc nhóm đã bỏ theo yêu cầu của chủ sản phẩm
 * ("BỎ CÁI ĐOẠN BUTTON PILL Ở TẤT CẢ THÀNH PHẨM"): sáu chip nghĩa là năm nhóm luôn bị
 * giấu sau một cú bấm, trong khi cuộn xuống là thấy hết. Link cũ `?group=` không gãy —
 * nó cuộn tới đúng khối, xem `groupAnchorId` và `ImagesSection`.
 *
 * Ruột của hai tab nằm ở `CutAssetGrid` và `RawSheetsPanel`; ở đây chỉ có hàng tab và
 * dải tiến trình của lượt đang chạy.
 */
export function GeneratedResults({ projectId, contract, jobStates, category = "all", sectioned = false, readOnly = false }: {
  projectId: string;
  contract: Contract | null;
  jobStates: Record<string, JobStatusValue>;
  category?: ResultGroup;
  /** true ⇒ tab "Ảnh thật" chia khối theo nhóm và gắn anchor cho `?group=`. */
  sectioned?: boolean;
  readOnly?: boolean;
}) {
  const query = useRuns(projectId, 20);
  const items = query.data?.items ?? [];

  /* Lượt gen mới nhất là lượt DUY NHẤT có thể còn sống. Mở stream cho đúng nó ⇒
     dải tiến trình đổi ngay khi agent phát `job.started`/`job.done`, không phải đợi
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
  const liveGroup = groups.find((group) => group.live) ?? null;

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
      {liveGroup
        ? <RunProgressBar projectId={projectId} group={liveGroup} readOnly={readOnly} />
        : (
          <ResumeBar
            projectId={projectId} contract={contract} jobStates={jobStates}
            group={groups[0] ?? null} readOnly={readOnly}
          />
        )}

      <Tabs defaultValue="cut">
        {/* `aria-label` để phân biệt với hàng tab của trang UI Elements / Mascot. Hai
            hàng tab nay nói CÙNG một nghĩa — "Ảnh thật" là thành phẩm đã cắt ở cả hai
            nơi — nhưng vẫn là hai hàng khác nhau trong cây a11y. */}
        <TabsList aria-label="Chế độ xem ảnh">
          <TabsTrigger value="cut">Ảnh thật</TabsTrigger>
          <TabsTrigger value="raw">Ảnh gốc</TabsTrigger>
        </TabsList>

        <TabsContent value="cut">
          <CutAssetGrid projectId={projectId} contract={contract} category={category} sectioned={sectioned} />
        </TabsContent>

        <TabsContent value="raw" className="space-y-6">
          <RawSheetsPanel
            projectId={projectId} contract={contract} jobStates={jobStates}
            category={category} readOnly={readOnly}
          />
        </TabsContent>
      </Tabs>
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
                /* Nói NGAY hai điều mà người dùng vừa mất quyền nhìn thấy: cái đã xong
                   còn nguyên, và còn bao nhiêu tấm nợ lại — dải "Chạy tiếp N tấm còn
                   thiếu" sẽ hiện ngay dưới đây khi run đóng sổ. */
                onSuccess: (res) => toastInfo(
                  "Đã dừng lượt tạo ảnh",
                  res.missing.length
                    ? `${res.kept} tấm đã xong được giữ và cắt xong · còn ${res.missing.length} tấm chưa vẽ, chạy tiếp lúc nào cũng được.`
                    : "Ảnh của sheet đã xong vẫn được giữ.",
                ),
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

/**
 * DẢI "ĐÃ DỪNG — CHẠY TIẾP PHẦN THIẾU".
 *
 * Đây là vế thứ hai của cặp Dừng/Chạy tiếp. Vế thứ nhất (nút Dừng) đã có từ lâu; vế
 * này thì trước bản 16/08 KHÔNG tồn tại: dừng xong màn hình chỉ còn "Tạo lại toàn bộ",
 * nên muốn vẽ nốt 4 tấm thiếu người dùng phải tự mở modal rồi tick bỏ 6 tấm đã xong —
 * và tick sót một ô là **đốt lại quota của tấm đã trả tiền**. Nút ở đây mở đúng modal ấy
 * nhưng đã chọn sẵn ĐÚNG tập còn thiếu (`resumeInvite`), nên đường mặc định là đường rẻ nhất.
 *
 * Vẫn đi qua `GenerateDialog` chứ không gọi thẳng API: §4.8 — "không có đường nào chạy
 * gen mà không qua modal này". Ba con số (số lượt · thời gian · cảnh báo quota) phải
 * được nhìn thấy trước khi tiêu lượt đầu tiên, kể cả khi lượt ấy là "chạy tiếp".
 */
function ResumeBar({ projectId, contract, jobStates, group, readOnly }: {
  projectId: string;
  contract: Contract | null;
  jobStates: Record<string, JobStatusValue>;
  group: GeneratedRunGroup | null;
  readOnly: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const invite = resumeInvite(group);
  if (!invite) return null;

  return (
    <>
      <section
        className="flex flex-wrap items-center justify-between gap-3 rounded-4 border border-line-subtle bg-surface p-4"
        role="status"
        aria-label="Lượt tạo ảnh đã dừng"
      >
        <div className="min-w-0">
          <p className="text-label text-fg-strong">
            Đã dừng giữa chừng · còn {invite.jobs.length}/{invite.total} tấm chưa vẽ
          </p>
          <p className="mt-1 text-caption text-fg-muted">
            {invite.done > 0
              ? `${invite.done} tấm đã xong được giữ nguyên và đã cắt — chạy tiếp sẽ KHÔNG vẽ lại chúng.`
              : "Chưa tấm nào kịp xong, chạy tiếp sẽ vẽ lại từ đầu danh sách."}
          </p>
        </div>
        <Button variant="primary" size="sm" disabled={readOnly} onClick={() => setOpen(true)}>
          <PlayCircle aria-hidden />Chạy tiếp {invite.jobs.length} tấm còn thiếu
        </Button>
      </section>

      <GenerateDialog
        open={open} onOpenChange={setOpen}
        projectId={projectId} contract={contract} jobStates={jobStates}
        initialJobs={invite.jobs} readOnly={readOnly}
        readOnlyReason="Công cụ local chưa sẵn sàng"
      />
    </>
  );
}

/* Câu trạng thái của một sheet thô sống ở `RawSheetsPanel` — re-export để nơi gọi cũ
   (và `lib/next-actions.ts` khi nó nhắc tên) không phải đi tìm. */
export { detailCopy, stateCopy } from "./RawSheetsPanel";
