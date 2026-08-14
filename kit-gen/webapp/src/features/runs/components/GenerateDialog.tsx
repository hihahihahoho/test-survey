import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ExternalLink, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { devDetails, imageGenReasonText, presentError } from "@/lib/api";
import { useDoctor, useRuns, useStartRun } from "@/lib/hooks";
import { usePrefsStore } from "@/lib/store";
import { contractJobs, contractVariants, type Contract, type JobStatusValue } from "@/lib/types";
import { estimateRun, needsGen, quotaWarning, rangeMinutes } from "../lib/estimate";
import { isRunFinished } from "../lib/format";
import { JobPickMatrix } from "./JobPickMatrix";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MODAL M1 "BẮT ĐẦU SINH ẢNH" (§4.8) — CỬA DUY NHẤT TIÊU QUOTA.
 * "Không có đường nào chạy gen mà không qua modal này" (§1.1-2, chốt X11).
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * NĂM CHỐT, và chốt nào cũng từng là một bug thật của bản v1:
 *
 * ① SELECTION SỐNG TRONG MODAL (đóng C1). v1 để `genPick` là biến TOÀN CỤC nên
 *    tick ở kit này rò sang kit khác ⇒ đốt quota nhầm rồi ảnh sinh ra lại không
 *    được cắt. Ở đây `picked` là `useState` của chính component, đóng modal là mất.
 *
 * ② BA CON SỐ TRƯỚC KHI BẤM: số lượt · thời gian · CẢNH BÁO QUOTA (§4.8, D8).
 *    Nguồn hệ số 3–5×: `teams/t3-auth/PLAN.md` §A.3 — xem `lib/estimate.ts`.
 *
 * ③ CHẶN TRƯỚC KHI CHẠY khi `doctor.imageGen.available === false` (đóng E1 tại
 *    gốc). v1 chạy tuốt rồi in "✅ xong — không sheet nào gen thành công". Ở đây
 *    nút chính bị khoá và chỉ đường sang S6?tab=env.
 *
 * ④ ĐANG CÓ RUN ⇒ nút chính đổi thành [Xem lượt đang chạy] (đóng E5), thay vì
 *    để user bấm rồi ăn 409 RUN_CONFLICT.
 *
 * ⑤ Ô TICK LÀ CHECKBOX THẬT CÓ NHÃN (§5.8-A5, đóng I2/I4), trạng thái chọn có
 *    dấu ✓ + nền, không chỉ màu viền (đóng I1).
 *
 * ⑥ `beforeStart` — CHỐT GHI ĐĨA NẰM Ở NÚT XÁC NHẬN, không ở nút mở modal. Xem
 *    khối chú thích của prop bên dưới; đây là §BUG-2 của blind-test 2.1.17.
 */
export function GenerateDialog({
  open,
  onOpenChange,
  projectId,
  contract,
  jobStates,
  /** Chỉ sinh cho một sheet (nút [⚡ Sinh sheet này…] của S3). */
  onlySheetId = null,
  initialJobs = null,
  readOnly,
  readOnlyReason,
  beforeStart = null,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  contract: Contract | null;
  /** `project.state.jobs` — map `job → 1 trong 7 trạng thái §5.7`. */
  jobStates: Record<string, JobStatusValue>;
  onlySheetId?: string | null;
  initialJobs?: readonly string[] | null;
  readOnly: boolean;
  readOnlyReason: string;
  /**
   * §BUG-2 — việc phải làm XONG ngay trước khi tiêu lượt đầu tiên, thường là "ghi
   * bản thiết kế đang sửa xuống đĩa". Trả `false` ⇒ **không** chạy run (nơi gọi đã
   * tự nói lý do).
   *
   * Vì sao nó ở đây chứ không ở nơi mở modal: mở modal KHÔNG phải là một sự đồng ý.
   * Bản cũ để màn dự án lưu trước rồi mới bật modal, nên người dùng đóng modal lại
   * vẫn bị ghi ngầm một thay đổi họ chưa hoàn tất — và vì đã ghi nên nút "Lưu và
   * tạo lại ảnh" tắt luôn, không còn đường quay lại. Ở đây thì đúng một cú bấm
   * [Sinh N lượt] mới ghi.
   */
  beforeStart?: (() => Promise<boolean>) | null;
}) {
  const navigate = useNavigate();
  const maxJobsPref = usePrefsStore((s) => s.maxJobs);
  const setMaxJobsPref = usePrefsStore((s) => s.setMaxJobs);
  const autoSlicePref = usePrefsStore((s) => s.autoSliceAfterGen);
  const setAutoSlicePref = usePrefsStore((s) => s.setAutoSlice);

  const jobs = React.useMemo(() => (contract ? contractJobs(contract) : []), [contract]);
  const variants = React.useMemo(() => (contract ? contractVariants(contract) : []), [contract]);
  const sheets = contract?.sheets ?? [];

  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [submitError, setSubmitError] = React.useState<unknown>(null);
  /** Đang chạy `beforeStart` (ghi bản thiết kế) — chưa tiêu lượt nào, nhưng đã bấm. */
  const [preparing, setPreparing] = React.useState(false);

  // §6.2: doctor CẤM poll — chỉ gọi khi modal mở (cache 60s ở tầng hook).
  const doctor = useDoctor({ enabled: open });
  const runsQuery = useRuns(open ? projectId : null, 5);
  const startRun = useStartRun(projectId);

  const activeRun = React.useMemo(
    () => (runsQuery.data?.items ?? []).find((r) => !isRunFinished(r.status)) ?? null,
    [runsQuery.data],
  );

  /* Mỗi lần mở: dựng lại selection từ đầu (chốt ①). Mặc định = thứ cần sinh. */
  React.useEffect(() => {
    if (!open) return;
    setSubmitError(null);
    const next = new Set<string>();
    const initial = initialJobs ? new Set(initialJobs) : null;
    for (const j of jobs) {
      if (initial !== null) {
        if (initial.has(j.job)) next.add(j.job);
      } else if (onlySheetId !== null) {
        if (j.sheet === onlySheetId) next.add(j.job);
      } else if (needsGen(jobStates[j.job])) {
        next.add(j.job);
      }
    }
    setPicked(next);
  }, [open, jobs, jobStates, onlySheetId, initialJobs]);

  const est = estimateRun(picked.size, maxJobsPref);
  const imageGenBlocked = doctor.data?.imageGen?.available === false;
  const doctorLoading = doctor.isLoading || doctor.isFetching;

  const toggle = (job: string, on: boolean) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(job);
      else next.delete(job);
      return next;
    });

  const openRun = (runId: string) => {
    onOpenChange(false);
    void navigate({ to: "/p/$projectId/runs/$runId", params: { projectId, runId } });
  };

  const submit = () => {
    if (activeRun) {
      openRun(activeRun.id);
      return;
    }
    setSubmitError(null);
    void (async () => {
      /* ⑥ Ghi bản thiết kế TRƯỚC lượt đầu tiên: run đọc contract trên ĐĨA, nên chạy
         khi đĩa còn giữ bản cũ là sinh ảnh cho một thiết kế người dùng tưởng đã đổi. */
      if (beforeStart) {
        setPreparing(true);
        let ok = false;
        try { ok = await beforeStart(); } finally { setPreparing(false); }
        if (!ok) return;
      }
      startRun.mutate(
        {
          kind: "gen",
          jobs: [...picked],
          maxJobs: maxJobsPref,
          autoSliceAfterGen: autoSlicePref,
        },
        {
          onSuccess: (res) => {
            if (res.runId) openRun(res.runId);
            else onOpenChange(false);
          },
          onError: (err) => setSubmitError(err),
        },
      );
    })();
  };

  /* 409 RUN_CONFLICT trả kèm `details.runId` ⇒ dựng được nút [Xem lượt đó] (E5). */
  const conflictRunId = React.useMemo(() => {
    const v = presentError(submitError);
    if (v.code !== "RUN_CONFLICT") return null;
    const d = v.details as { runId?: string } | null;
    return typeof d?.runId === "string" ? d.runId : null;
  }, [submitError]);

  const busy = startRun.isPending || preparing;
  const canSubmit =
    !readOnly && !busy && picked.size > 0 && !imageGenBlocked && !doctorLoading;

  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Sinh ảnh</DialogTitle>
          <DialogDescription>
            Mỗi lượt là một lần gọi AI cho một sheet của một phong cách.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-4">
          {/* ── ③ Chặn khi chưa tạo được ảnh (đóng E1) ─────────────────── */}
          {doctorLoading && (
            <p className="flex items-center gap-2 text-caption text-fg">
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Đang kiểm tra xem máy bạn tạo được ảnh chưa…
            </p>
          )}

          {imageGenBlocked && (
            <div role="alert" className="flex flex-col gap-2 rounded-2 border border-danger/60 bg-danger/10 p-3">
              <p className="flex items-center gap-2 text-body text-fg-strong">
                <AlertTriangle className="size-4 shrink-0 text-danger" aria-hidden />
                Chưa tạo được ảnh AI — {imageGenReasonText(doctor.data?.imageGen?.reason)}
              </p>
              <p className="text-caption text-fg">
                Bấm sinh ảnh lúc này sẽ hỏng toàn bộ lượt mà vẫn mất thời gian chờ. Hãy khắc phục trước.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    onOpenChange(false);
                    void navigate({ to: "/settings", search: { tab: "env" } });
                  }}
                >
                  <ExternalLink aria-hidden />
                  Khắc phục ngay
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void doctor.refetch()}>
                  Kiểm tra lại
                </Button>
              </div>
            </div>
          )}

          {/* ── ④ Đang có lượt chạy (đóng E5) ──────────────────────────── */}
          {activeRun && (
            <div role="status" className="flex flex-wrap items-center gap-2 rounded-2 border border-warn/60 bg-warn/10 p-3">
              <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden />
              <span className="flex-1 text-body text-fg">
                Project này đang chạy lượt <span className="font-mono">{activeRun.id}</span> (
                {activeRun.progress?.done ?? 0}/{activeRun.progress?.total ?? 0}). Chờ xong hoặc dừng lượt
                đó rồi hãy sinh tiếp.
              </span>
              <Button variant="secondary" size="sm" onClick={() => openRun(activeRun.id)}>
                Xem lượt đang chạy
              </Button>
            </div>
          )}

          {/* ── ① Ma trận phong cách × sheet ────────────────────────────── */}
          <section className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-label text-fg-strong">Chọn lượt cần sinh</h3>
              <div className="ml-auto flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setPicked(new Set(jobs.map((j) => j.job)))}>
                  Tất cả
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setPicked(new Set(jobs.filter((j) => needsGen(jobStates[j.job])).map((j) => j.job)))}
                >
                  Chỉ thứ đã đổi
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setPicked(new Set())}>
                  Bỏ chọn
                </Button>
              </div>
            </div>

            <JobPickMatrix
              variants={variants}
              sheets={sheets}
              jobs={jobs}
              jobStates={jobStates}
              picked={picked}
              onToggle={toggle}
            />
          </section>

          {/* ── ② Ba con số (chốt X11) ──────────────────────────────────── */}
          <section className="flex flex-col gap-2 rounded-2 border border-line-subtle bg-canvas p-3">
            <p className="text-body text-fg-strong">
              {picked.size === 0
                ? "Chưa chọn lượt nào."
                : `Đã chọn ${picked.size} lượt · ước lượng ${rangeMinutes(est.seconds)} với ${maxJobsPref} lượt song song`}
            </p>
            {picked.size > 0 && (
              <>
                <p className="flex gap-2 rounded-1 bg-warn/10 p-2 text-caption text-fg">
                  <AlertTriangle className="size-3.5 shrink-0 text-warn" aria-hidden />
                  <span>{quotaWarning(est)}</span>
                </p>
                <p className="text-caption text-fg-muted-raised">
                  Ảnh cũ của các lượt này được giữ trong lịch sử (3 đời), khôi phục lại được.
                </p>
              </>
            )}
          </section>

          {/* ── Tuỳ chọn ────────────────────────────────────────────────── */}
          <section className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="m1-maxjobs">Số lượt song song</Label>
              <Select value={String(maxJobsPref)} onValueChange={(v) => setMaxJobsPref(Number(v))}>
                <SelectTrigger id="m1-maxjobs" className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-caption text-fg-muted-raised">Càng cao càng dễ chạm giới hạn tài khoản.</p>
            </div>

            <div className="flex items-center gap-2 pb-1">
              <Checkbox
                id="m1-autoslice"
                checked={autoSlicePref}
                onCheckedChange={(c) => setAutoSlicePref(c === true)}
              />
              <Label htmlFor="m1-autoslice" className="cursor-pointer">
                Tự động cắt sau khi sinh xong
              </Label>
            </div>
          </section>

          {/* Lỗi hiện INLINE trong modal, không chỉ toast (§5.5). */}
          {submitError != null && (
            <div role="alert" className="flex flex-col gap-2 rounded-2 border border-danger/60 bg-danger/10 p-3">
              <p className="text-body text-fg-strong">{presentError(submitError).title}</p>
              <p className="text-caption text-fg">{presentError(submitError).explain}</p>
              {conflictRunId && (
                <div>
                  <Button variant="secondary" size="sm" onClick={() => openRun(conflictRunId)}>
                    Xem lượt đang chạy
                  </Button>
                </div>
              )}
              <details className="text-caption">
                <summary className="cursor-pointer text-fg-muted-raised">Chi tiết cho lập trình viên</summary>
                <pre className="mt-1 overflow-auto overscroll-contain whitespace-pre-wrap rounded-1 bg-canvas p-2 font-mono text-fg">
                  {devDetails(submitError)}
                </pre>
              </details>
            </div>
          )}
        </DialogBody>

        <DialogFooter className="border-t border-line-subtle">
          <Button variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          {activeRun ? (
            <Button variant="primary" onClick={() => openRun(activeRun.id)}>
              Xem lượt đang chạy
            </Button>
          ) : (
            <Button
              variant="primary"
              loading={busy}
              disabled={!canSubmit}
              aria-disabled={!canSubmit || undefined}
              title={readOnly ? readOnlyReason : imageGenBlocked ? "Cần khắc phục phần tạo ảnh trước" : undefined}
              onClick={submit}
            >
              <Zap aria-hidden />
              {picked.size === 0 ? "Sinh ảnh" : `Sinh ${picked.size} lượt`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
