import * as React from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { RefreshCw, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, LoadingState, RunStatusBadge } from "@/components/common";
import { useRegisterCommands, type ScreenProps } from "@/components/layout";
import { devDetails, presentError } from "@/lib/api";
import { useAgentStatus, useContract, useProject, useRuns } from "@/lib/hooks";
import { SERIF } from "@/components/layout/flora";
import { gateOf, useNarrowViewport } from "@/features/projects/lib/gate";
import { relTime } from "@/features/projects/lib/format";
import { GenerateDialog } from "./components/GenerateDialog";
import { clock, elapsedSeconds, isRunFinished, kindLabel, progressOf, runStatusOf, runSummary } from "./lib/format";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * S4 · THEO DÕI SINH ẢNH — DANH SÁCH LƯỢT CHẠY (`/p/:id/runs`), §3-S4 thành phần 7.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Bảng 20 lượt gần nhất: `run · thời điểm · loại · N/M · thời lượng · trạng thái`.
 * Đóng "§3.3 lịch sử gen" của audit — v1 không có chỗ nào xem lại lượt đã chạy.
 *
 * ĐỦ 4 TRẠNG THÁI + CA AGENT CHƯA CHẠY:
 *   empty    → "Chưa có lượt chạy nào" + [⚡ Sinh ảnh…] + 3 bước giải thích
 *   loading  → skeleton hàng (không trắng trang)
 *   error    → copy từ bảng §3.9 + [Thử lại], KHÔNG in message kỹ thuật ra thân UI
 *   success  → bảng
 *   agent tắt→ nút ghi bị khoá KÈM LÝ DO ngay tại nút (§2.5-2, không ẩn nút);
 *              banner chung là việc của khung, màn KHÔNG vẽ lại (tránh 2 thông báo)
 *
 * ĐÓNG E1 NGAY Ở ĐÂY: cột trạng thái dùng `RunStatusBadge` + `runSummary` — run
 * có lượt lỗi hiện "Xong · có lỗi · 5/8 xong · 3 lỗi", KHÔNG BAO GIỜ dấu ✓ trơn.
 */
export function RunsScreen({ projectId = "" }: ScreenProps) {
  const navigate = useNavigate();
  const { status } = useAgentStatus();
  const narrow = useNarrowViewport();
  const gate = React.useMemo(() => gateOf(status, narrow), [status, narrow]);

  const runs = useRuns(projectId, 20);
  const project = useProject(projectId);
  const contract = useContract(projectId);
  const [genOpen, setGenOpen] = React.useState(false);

  const items = runs.data?.items ?? [];
  const jobStates = project.data?.state?.jobs ?? {};

  useRegisterCommands(
    () => [
      {
        id: "s4.generate",
        label: "Sinh ảnh…",
        icon: Zap,
        keywords: "gen sinh anh tao anh chay",
        disabledReason: gate.readOnly ? gate.reason : null,
        run: () => setGenOpen(true),
      },
      {
        id: "s4.refresh",
        label: "Làm mới danh sách lượt chạy",
        icon: RefreshCw,
        keywords: "reload refresh lam moi",
        run: () => void runs.refetch(),
      },
    ],
    [gate.readOnly, gate.reason, runs],
  );

  const openRun = (runId: string) =>
    void navigate({ to: "/p/$projectId/runs/$runId", params: { projectId, runId } });

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex flex-col">
          <h1 className="text-display text-fg-strong">
            Theo dõi <span className={SERIF}>sinh ảnh</span>
          </h1>
          <p className="text-caption text-fg-muted-raised">
            {items.length > 0
              ? `${items.length} lượt chạy gần nhất của dự án này`
              : "Mỗi lượt sinh ảnh gọi AI một lần cho một sheet của một phong cách."}
          </p>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => void runs.refetch()} loading={runs.isFetching}>
            <RefreshCw aria-hidden />
            Làm mới
          </Button>
          <Button
            variant="primary"
            disabled={gate.readOnly}
            aria-disabled={gate.readOnly || undefined}
            title={gate.readOnly ? gate.reason : undefined}
            onClick={() => setGenOpen(true)}
          >
            <Zap aria-hidden />
            Sinh ảnh…
          </Button>
        </div>
      </header>

      {runs.isLoading ? (
        <LoadingState count={4} variant="rows" label="Đang đọc danh sách lượt chạy…" />
      ) : runs.error ? (
        <ErrorState
          title={presentError(runs.error).title}
          description={presentError(runs.error).explain}
          detail={devDetails(runs.error)}
          actions={
            <>
              <Button variant="primary" onClick={() => void runs.refetch()}>
                Thử lại
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/p/$projectId" params={{ projectId }}>
                  Về tổng quan project
                </Link>
              </Button>
            </>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Chưa có lượt chạy nào"
          description="Mỗi lượt sinh ảnh gọi AI một lần cho một sheet của một phong cách."
          steps={[
            "Chọn phong cách và sheet cần sinh",
            "Xem số lượt và ước lượng quota trước khi chạy",
            "Theo dõi tiến độ, dừng hoặc chạy lại lượt lỗi tại đây",
          ]}
          action={
            <Button
              variant="primary"
              size="lg"
              disabled={gate.readOnly}
              aria-disabled={gate.readOnly || undefined}
              title={gate.readOnly ? gate.reason : undefined}
              onClick={() => setGenOpen(true)}
            >
              <Zap aria-hidden />
              Sinh ảnh…
            </Button>
          }
        />
      ) : (
        <div className="rounded-3 border border-line-subtle bg-surface">
          <Table>
            <caption className="sr-only">Danh sách {items.length} lượt chạy gần nhất</caption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Lượt chạy</TableHead>
                <TableHead scope="col">Thời điểm</TableHead>
                <TableHead scope="col">Loại</TableHead>
                <TableHead scope="col">Tiến độ</TableHead>
                <TableHead scope="col">Thời lượng</TableHead>
                <TableHead scope="col">Trạng thái</TableHead>
                <TableHead scope="col">
                  <span className="sr-only">Hành động</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((run) => {
                const p = progressOf(run);
                const elapsed = elapsedSeconds(run);
                return (
                  <TableRow
                    key={run.id}
                    className="cursor-pointer"
                    onClick={() => openRun(run.id)}
                  >
                    <TableCell className="font-mono text-accent-text">{run.id}</TableCell>
                    <TableCell className="whitespace-nowrap text-fg" title={run.startedAt ?? undefined}>
                      {relTime(run.startedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-fg">{kindLabel(run.kind)}</TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-fg">
                      {p.done}/{p.total}
                      {p.failed > 0 && <span className="text-danger"> · {p.failed} lỗi</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap font-mono text-fg-muted-raised">
                      {elapsed !== null ? clock(elapsed) : "—"}
                    </TableCell>
                    <TableCell>
                      {/* §5.7 + E1: có lỗi ⇒ badge cảnh báo, không phải ✓ */}
                      <RunStatusBadge status={runStatusOf(run.status)} progress={runSummary(run)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          openRun(run.id);
                        }}
                      >
                        {isRunFinished(run.status) ? "Xem" : "Theo dõi"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <GenerateDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        projectId={projectId}
        contract={contract.data?.contract ?? null}
        jobStates={jobStates}
        readOnly={gate.readOnly}
        readOnlyReason={gate.reason}
      />
    </div>
  );
}

export default RunsScreen;
