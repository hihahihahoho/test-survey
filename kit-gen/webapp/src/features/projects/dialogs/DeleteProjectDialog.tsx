import * as React from "react";
import { ConfirmDestructive } from "@/components/common";
import { ActiveRunGuard } from "@/features/runs";
import { useDeleteProject, useRestoreProject } from "@/lib/hooks";
import type { Project } from "@/lib/types";
import { bytes, count } from "../lib/format";
import { errorDetail, toastError, toastSuccess, toastUndo } from "../lib/feedback";
import { forgetThumbs } from "../lib/agent-blob";
import { InlineError } from "./parts";

/**
 * §4.4 XOÁ MỀM vào thùng rác 30 ngày + toast [Hoàn tác] 10 giây.
 *
 * ═══ NHỮNG CHỖ DỄ LÀM SAI, ĐÃ THI CÔNG ĐÚNG ═══
 *
 * 1. KHÔNG bắt gõ tên project (chốt X6). Thao tác PHỤC HỒI ĐƯỢC thì thêm ma sát
 *    là phản tác dụng ⇒ dùng `ConfirmDestructive` KHÔNG truyền `confirmText`.
 *
 * 2. Nút phá huỷ KHÔNG phải mặc định của Enter: `ConfirmDestructive` của R0 đưa
 *    focus về nút HUỶ khi mở, nên Enter = Huỷ. Đúng §4.4.
 *
 * 3. XEM TRƯỚC CÁI GÌ SẼ MẤT — liệt kê từ `stats` THẬT, và nói rõ thứ nào
 *    "không tái tạo được" / "sinh lại tốn quota" / "cắt lại được" (§1.2).
 *
 * 4. Project ĐANG CHẠY ⇒ hiện dòng ⚠ "lượt đó sẽ bị dừng". Agent tự cancel
 *    trước khi move.
 *
 * 5. ⚠ HOÀN TÁC CÓ THỂ THẤT BẠI — đây là bài học C-01 của `teams/qa-web`:
 *    xoá project trong lúc đang sinh ảnh thì tiến trình nền dựng lại thư mục vừa
 *    xoá ⇒ restore trả **409 PROJECT_ID_TAKEN**. QA LEAD nói đã vá ở agent,
 *    nhưng UI KHÔNG ĐƯỢC coi Hoàn tác là chắc chắn thành công: bắt lỗi, nói thật
 *    "chưa phục hồi được", và chỉ đường sang Thùng rác (project vẫn còn ở đó).
 *
 * 6. Về "cấm xoá lạc quan" (§4.4 gạch cuối): câu đó nằm trong ngữ cảnh **agent
 *    chưa chạy** — và ca đó đã bị chặn từ trước bằng `gate` (nút Xoá disabled).
 *    Khi agent CÓ chạy thì §4.4 lại yêu cầu "thẻ biến mất + toast Hoàn tác 10s",
 *    tức là optimistic. `useDeleteProject` của R0 làm đúng vậy (có rollback).
 */
export function DeleteProjectDialog({
  projects,
  open,
  onOpenChange,
  onDeleted,
  onOpenTrash,
}: {
  /** 1 project (menu ⋯) hoặc nhiều (thanh chọn nhiều). */
  projects: readonly Project[];
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDeleted: (ids: string[]) => void;
  onOpenTrash: () => void;
}) {
  const del = useDeleteProject();
  const restore = useRestoreProject();
  const [failure, setFailure] = React.useState<unknown>(null);

  React.useEffect(() => {
    if (open) setFailure(null);
  }, [open]);

  if (projects.length === 0) return null;

  const many = projects.length > 1;
  const one = projects[0]!;
  const totalBytes = projects.reduce((n, p) => n + Number(p.stats?.diskBytes ?? 0), 0);
  const running = projects.filter((p) => {
    const jobs = Object.values(p.state?.jobs ?? {});
    return Boolean(p.state?.activeRun?.runId) || jobs.includes("running") || jobs.includes("queued");
  });

  const undo = (entries: { project: Project; trashId: string }[]) => {
    void (async () => {
      const ok: Project[] = [];
      const bad: { project: Project; error: unknown }[] = [];
      for (const e of entries) {
        try {
          const p = await restore.mutateAsync(e.trashId);
          ok.push(p);
        } catch (error) {
          bad.push({ project: e.project, error });
        }
      }
      if (ok.length > 0) {
        toastSuccess(
          ok.length === 1 ? `Đã phục hồi «${ok[0]!.name}»` : `Đã phục hồi ${ok.length} dự án`,
        );
      }
      for (const b of bad) {
        // C-01: nói THẬT là chưa phục hồi được, và chỉ đúng chỗ dữ liệu đang nằm.
        toastError(b.error, {
          titleOverride: "Không hoàn tác được — đã có dự án khác trùng chỗ.",
          descriptionOverride: "Dự án cũ vẫn nằm trong thùng rác; vào đó khôi phục với tên khác.",
          action: { label: "Vào thùng rác", onClick: onOpenTrash },
        });
      }
    })();
  };

  const confirm = async () => {
    setFailure(null);
    const done: { project: Project; trashId: string }[] = [];
    const failed: { project: Project; error: unknown }[] = [];
    let cancelledRuns = 0;

    // Tuần tự: lỗi ở giữa vẫn biết chính xác cái nào đã xoá, cái nào chưa.
    for (const p of projects) {
      try {
        const res = await del.mutateAsync(p.id);
        forgetThumbs(p.id);
        cancelledRuns += res.cancelledRuns.length;
        if (res.trashId) done.push({ project: p, trashId: res.trashId });
      } catch (error) {
        failed.push({ project: p, error });
      }
    }

    if (done.length > 0) {
      onDeleted(done.map((d) => d.project.id));
      /* P-SWEEP·5 — toast một dòng. "Bộ kit được giữ 30 ngày" đã nằm sẵn trong màn
         Thùng rác và trong chính dialog xác nhận vừa bấm; nhắc lại ở đây chỉ làm
         toast cao 2 dòng và phủ lên nút "Thùng rác (1)" ngay bên dưới (ảnh 27).
         Ca "đã dừng việc đang vẽ" thì GIỮ mô tả: đó là hệ quả người dùng CHƯA biết. */
      toastUndo({
        title: "Đã cho vào thùng rác",
        ...(cancelledRuns > 0 ? { description: "Việc đang vẽ đã dừng." } : {}),
        onUndo: () => undo(done),
      });
    }

    if (failed.length === 0) {
      onOpenChange(false);
      return;
    }
    // Còn cái chưa xoá được ⇒ GIỮ modal mở và hiện lỗi inline (§5.5).
    setFailure(failed[0]!.error);
  };

  const consequences = many
    ? projects.map((p) => `${p.name} — ${bytes(p.stats?.diskBytes ?? 0)}`)
    : [
        `Bộ khung (${count(one.stats?.sheets ?? 0, "sheet")} · ${count(one.stats?.components ?? 0, "thành phần")})`,
        ...((one.stats?.rawPresent ?? 0) > 0
          ? [`${count(one.stats?.rawPresent, "ảnh đã tạo")} — tạo lại sẽ tốn lượt`]
          : []),
        ...((one.stats?.kitsCut ?? 0) > 0 ? [`${count(one.stats?.kitsCut, "ảnh đã tách")} — có thể tách lại`] : []),
        `Tổng ${bytes(one.stats?.diskBytes ?? 0)}`,
      ];

  return (
    <ConfirmDestructive
      open={open}
      onOpenChange={onOpenChange}
      pending={del.isPending}
      title={many ? `Xoá ${projects.length} dự án?` : `Xoá dự án “${one.name}”?`}
      description={
        many
          ? `Tất cả dữ liệu và ảnh của ${projects.length} dự án sẽ vào thùng rác. Tự dọn sau 30 ngày. Tổng ${bytes(totalBytes)}.`
          : "Dự án và toàn bộ ảnh đã tạo sẽ vào thùng rác. Tự dọn sau 30 ngày."
      }
      actionLabel={many ? `Cho ${projects.length} dự án vào thùng rác` : "Cho vào thùng rác"}
      onConfirm={() => void confirm()}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 rounded-2 border border-line-subtle bg-canvas p-3">
          <p className="text-label text-fg-strong">Sẽ chuyển vào thùng rác</p>
          <ul className="flex flex-col gap-0.5">
            {consequences.map((c) => (
              <li key={c} className="text-caption text-fg">
                {c}
              </li>
            ))}
          </ul>
        </div>

        {/* C-01 (qa-func.md, tái hiện 6/8 lần): xoá khi đang gen ⇒ tiến trình nền dựng
            lại thư mục vừa xoá ⇒ [Hoàn tác] hỏng thật (409 PROJECT_ID_TAKEN). Dòng chữ
            cũ chỉ nói "lượt đó sẽ bị dừng" — KHÔNG nói hậu quả và không có đường đi tiếp.
            NEEDS-safety-runs §N7 đề nghị dùng `ActiveRunGuard` dùng chung: nó nhìn CẢ
            `state.activeRun.runId` LẪN `state.jobs` có running/queued (nguồn thứ hai bắt
            đúng khe hở đã tạo ra C-01: run vừa khởi động, `activeRun` còn rỗng) và có
            nút [Xem lượt đang chạy] để user tự dừng trước. INTEGRATION: nhận. */}
        {running.length > 0 && (
          <p role="alert" className="rounded-2 border border-line-subtle kg-tint-warn p-3 text-body text-on-tint-warn">
            Dự án này đang tạo ảnh. Xoá sẽ dừng việc đang chạy.
          </p>
        )}
        {running.map((p) => (
          <ActiveRunGuard key={p.id} project={p} />
        ))}

        {failure != null && <InlineError error={failure} detail={errorDetail(failure)} />}
      </div>
    </ConfirmDestructive>
  );
}
