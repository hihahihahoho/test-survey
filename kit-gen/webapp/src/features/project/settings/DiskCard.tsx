import * as React from "react";
import { Eraser, HardDrive, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ConfirmDestructive } from "@/components/common";
import { useCleanProject } from "@/lib/hooks";
import { bytes, count } from "@/features/projects/lib/format";
import { errorDetail, toastSuccess } from "@/features/projects/lib/feedback";
import { InlineError } from "@/features/projects/dialogs/parts";
import { ActiveRunGuard, activeRunWarning } from "@/features/runs";
import type { Gate } from "@/features/projects/lib/gate";
import type { Project } from "@/lib/types";
import { diskRows, diskRowsTotal, rawHistoryBytes } from "../lib/disk";

/**
 * KHỐI "DUNG LƯỢNG" của S2b (§3-S2b wireframe khối 2) — CÓ PHÂN RÃ THEO NHÓM.
 *
 * Nguồn: `stats.diskBreakdown` (#9). Agent tính bằng MỘT lần quét (đã đọc
 * `agent/lib/projects.mjs`), vì #17 chỉ trả `freedBytes` SAU khi dọn — quá muộn
 * để user quyết định có nên dọn hay không.
 *
 * BA LUẬT VỀ SỐ:
 *  · Agent cũ không trả `diskBreakdown` ⇒ hiện tổng + câu nói thật rằng chưa có
 *    phân rã. KHÔNG bịa tỉ lệ, KHÔNG hiện 0 B cho từng nhóm.
 *  · Thanh tỉ lệ chỉ để so sánh tương đối, luôn kèm SỐ THẬT bên cạnh (§5.8-A3:
 *    thông tin không bao giờ chỉ nằm ở hình).
 *  · "Ảnh AI đang dùng" và "Bản thiết kế" KHÔNG BAO GIỜ bị dọn ở đây (§4.5) ⇒ nói
 *    thẳng bằng một dòng có icon khiên, để user dám bấm Dọn.
 *
 * NÚT "DỌN ẢNH AI CŨ" (yêu cầu 2 của brief) dọn đúng `rawHistory` — 3 đời ảnh cũ.
 * Đây là thứ DUY NHẤT trong nhóm ảnh mà dọn được, và nó KHÔNG lấy lại được (nhóm
 * "tốn quota" của §1.2) nên phải qua `ConfirmDestructive` + nói rõ hậu quả.
 * Muốn dọn nhiều nhóm hơn thì dùng [Dọn cache…] (dialog của S1, dùng lại).
 *
 * C-01: dọn khi đang có lượt chạy ⇒ `409 RUN_ACTIVE`. Cảnh báo TRƯỚC bằng
 * `ActiveRunGuard` (dùng chung với modal xoá) thay vì để user bấm rồi ăn lỗi.
 */
export function DiskCard({
  project,
  gate,
  onOpenClean,
}: {
  project: Project;
  gate: Gate;
  /** Mở dialog [Dọn cache…] đầy đủ của S1 — nhiều lựa chọn hơn nút nhanh ở đây. */
  onOpenClean: () => void;
}) {
  const clean = useCleanProject(project.id);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [failure, setFailure] = React.useState<unknown>(null);

  const stats = project.stats;
  const total = Number(stats?.diskBytes ?? 0);
  const rows = React.useMemo(() => diskRows(stats), [stats]);
  const rowsTotal = diskRowsTotal(rows);
  const oldRaw = rawHistoryBytes(stats);
  const empty = total === 0;
  const busy = activeRunWarning(project);

  const purgeOldRaw = () => {
    setFailure(null);
    clean.mutate(["rawHistory"], {
      onSuccess: (res) => {
        setConfirmOpen(false);
        toastSuccess(`Đã giải phóng ${bytes(res.freedBytes)}`, "Ảnh AI đang dùng và bản thiết kế không bị đụng tới.");
      },
      onError: (e) => setFailure(e),
    });
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
        <CardTitle>Dung lượng</CardTitle>
        <span className="flex items-center gap-1.5 text-label text-fg-strong">
          <HardDrive className="size-4 text-fg-muted-raised" aria-hidden />
          {bytes(total)}
        </span>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {empty ? (
          <p className="text-caption text-fg-muted-raised">
            Chưa có file nào — sinh ảnh xong sẽ thấy ở đây.
          </p>
        ) : rows.length === 0 ? (
          <p className="flex items-start gap-2 text-caption text-fg">
            <Info className="mt-0.5 size-4 shrink-0 text-on-tint-accent" aria-hidden />
            <span>
              Công cụ local chưa trả phân rã theo nhóm, nên ở đây chỉ có tổng{" "}
              <strong className="text-fg-strong">{bytes(total)}</strong>. Cập nhật công cụ local để thấy
              chi tiết từng thư mục.
            </span>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => {
              const pct = rowsTotal > 0 ? Math.round((r.bytes / rowsTotal) * 100) : 0;
              return (
                <li key={r.key} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-label text-fg-strong">{r.label}</span>
                    <span className="text-caption text-fg-muted-raised">
                      {bytes(r.bytes)} · {pct}% · {r.hint}
                    </span>
                  </div>
                  {/* Thanh chỉ để so sánh tương đối; số thật đã nằm ngay trên. */}
                  <Progress value={pct} aria-hidden />
                </li>
              );
            })}
          </ul>
        )}

        {!empty && (
          <div className="flex flex-col gap-1 border-t border-line-subtle pt-3">
            <p className="text-caption text-fg-muted-raised">
              {count(Number(stats?.rawPresent ?? 0), "lượt")} đã có ảnh trong{" "}
              {count(Number(stats?.jobs ?? 0), "lượt")} của bản thiết kế ·{" "}
              {count(Number(stats?.kitsCut ?? 0), "file")} kit đã cắt
            </p>
          </div>
        )}

        <p className="flex items-start gap-2 rounded-2 border border-ok/60 bg-ok/[0.08] p-3 text-caption text-fg">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-on-tint-ok" aria-hidden />
          <span>
            Ảnh AI đang dùng và Bản thiết kế <strong className="text-fg-strong">không bao giờ</strong> bị
            dọn ở màn này.
          </span>
        </p>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={gate.readOnly || oldRaw === 0}
            aria-disabled={gate.readOnly || oldRaw === 0 || undefined}
            title={
              gate.readOnly
                ? gate.reason
                : oldRaw === 0
                  ? "Không có ảnh AI cũ nào để dọn"
                  : `Xoá ${bytes(oldRaw)} ảnh của các lần sinh trước`
            }
            onClick={() => {
              setFailure(null);
              setConfirmOpen(true);
            }}
          >
            <Eraser aria-hidden />
            {oldRaw > 0 ? `Dọn ảnh AI cũ (${bytes(oldRaw)})` : "Dọn ảnh AI cũ"}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={gate.readOnly || empty}
            aria-disabled={gate.readOnly || empty || undefined}
            title={gate.readOnly ? gate.reason : empty ? "Chưa có file nào để dọn" : undefined}
            onClick={onOpenClean}
          >
            Dọn cache…
          </Button>
        </div>
      </CardContent>

      {/*
        Dọn `rawHistory` KHÔNG lấy lại được ⇒ theo §1.2 nhóm "tốn quota" thì phải
        nêu rõ "phải gen lại, tốn quota". KHÔNG bắt gõ tên (chốt X6: ma sát phải
        đúng mức — đây không phải xoá project).
      */}
      <ConfirmDestructive
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pending={clean.isPending}
        title="Dọn ảnh AI cũ?"
        description={
          <>
            Sẽ xoá <strong className="text-fg-strong">{bytes(oldRaw)}</strong> ảnh của các lần sinh
            trước (mỗi lượt giữ 3 đời). Ảnh đang dùng ở lần sinh mới nhất{" "}
            <strong className="text-fg-strong">không</strong> bị xoá.
          </>
        }
        actionLabel="Dọn ảnh cũ"
        onConfirm={purgeOldRaw}
      >
        <div className="flex flex-col gap-3">
          <p className="rounded-2 border border-line-subtle bg-canvas p-3 text-caption text-fg">
            Sau khi dọn, bạn không khôi phục được bản ảnh cũ nữa — muốn có lại phải sinh lại và việc
            đó tiêu quota.
          </p>
          {busy.hasActiveRun && <ActiveRunGuard project={project} />}
          {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
        </div>
      </ConfirmDestructive>
    </Card>
  );
}
