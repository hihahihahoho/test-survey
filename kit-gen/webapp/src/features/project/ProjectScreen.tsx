import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { Images, Pencil, RefreshCw, Scissors, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/common";
import { useRegisterCommands, type ScreenProps } from "@/components/layout";
/* Import SÂU có chủ ý: `components/layout/index.ts` không nằm trong glob E (FE2-PLAN §1)
   nên E1 không thêm export vào đó. Đề nghị gom vào barrel: `NEEDS-fe2-e.md` N8. */
import { scopeSheetIds, useFileScope } from "@/components/layout/screen-contract";
import { FileScopeNotice } from "@/components/layout/FloraShell";
import { devDetails, presentError } from "@/lib/api";
import { useAgentStatus } from "@/lib/hooks";
import { gateOf, useNarrowViewport } from "@/features/projects/lib/gate";
import { GenerateDialog } from "@/features/runs";
import { HistoryDrawer, useContractHistory } from "@/features/design/safety";

import { NextActionsCard } from "./components/NextActionsCard";
import { OnboardingSteps } from "./components/OnboardingSteps";
import { DesignCard, KitCard, RunsCard, StatsCard } from "./components/OverviewCards";
import { ProgressMatrix, MatrixLegend } from "./components/ProgressMatrix";
import { ProjectHeader } from "./components/ProjectHeader";
import { ProjectError, ProjectLoading, ProjectMissing } from "./components/ScreenStates";
import { SelectionBar } from "./components/SelectionBar";
import { StaleBanner } from "./components/StaleBanner";
import { createProjectNav } from "./lib/nav";
import { pendingGenJobs, singleSheetOf, uncutJobs, type MatrixCell } from "./lib/matrix";
import { nextActions, staleWarning, type NextAction } from "./lib/next-actions";
import { useProjectData } from "./lib/useProjectData";
import { useSliceRun } from "./lib/useSliceRun";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * S2 · CHI TIẾT PROJECT — TỔNG QUAN (`/p/:id`) — UX-SPEC §3-S2
 * Đóng audit A7, C2, D1 · tiêu chí đo R24-(3),(5).
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * MỤC ĐÍCH DUY NHẤT (§3-S2): trong 5 giây trả lời được *project này đang ở đâu,
 * việc tiếp theo là gì, bấm đâu để làm.* Bố cục vì thế xếp theo thứ tự câu hỏi:
 *   ① dải cảnh báo stale (nếu có)  — "có gì sai không?"
 *   ② thẻ VIỆC TIẾP THEO           — "làm gì bây giờ?" (mỗi dòng 1 nút đi thẳng)
 *   ③ MA TRẬN phong cách × sheet   — "cụ thể chỗ nào?" (bấm ô = tới đúng chỗ)
 *   ④ 4 thẻ số liệu + lối vào màn con
 *
 * ĐỦ 4 TRẠNG THÁI + CA AGENT CHƯA CHẠY:
 *   loading → skeleton đúng số thẻ, giữ khung (không trắng trang)
 *   empty   → 0 sheet: khối 3 bước, MA TRẬN KHÔNG HIỆN (§3-S2 bảng trạng thái)
 *   error   → copy từ bảng §3.9; `PROJECT_IN_TRASH`/`NOT_FOUND` có màn riêng;
 *             message kỹ thuật CHỈ trong panel "Chi tiết cho lập trình viên"
 *   success → ma trận + thẻ
 *   agent tắt → vẽ từ cache của S1, nhãn `dữ liệu đã lưu trên máy này`, mọi nút
 *             ghi bị khoá KÈM LÝ DO tại nút (§2.5-2 — KHÔNG ẩn nút). Banner chung
 *             là việc của khung (AppLayout), màn KHÔNG vẽ lại để tránh 2 thông báo.
 *
 * MỘT NÚT PRIMARY DUY NHẤT trên màn (§5.4): [⚡ Sinh ảnh…] ở header. Mọi nút khác
 * là secondary/ghost.
 */
/** @deprecated FE3-PLAN §3-E1: màn cũ chỉ còn qua mục Nâng cao hoặc deep link. */
export function ProjectScreen({ projectId = "" }: ScreenProps) {
  const navigate = useNavigate();
  const nav = React.useMemo(() => createProjectNav(navigate, projectId), [navigate, projectId]);
  const { status } = useAgentStatus();
  const narrow = useNarrowViewport();
  const gate = React.useMemo(() => gateOf(status, narrow), [status, narrow]);

  const data = useProjectData(projectId, status);
  const { project } = data;

  /* ══════════ FE-2·E1 — LỌC MA TRẬN THEO FILE CON ĐANG MỞ (§4.5) ══════════
     `scope` là bộ lọc HIỂN THỊ, không phải dữ liệu: `data.matrix` vẫn được dựng từ
     contract ĐẦY ĐỦ, ta chỉ bỏ bớt hàng sheet khi vẽ. Vì sao quan trọng: mọi số liệu
     và mọi `job` dưới đây suy ra từ ma trận này, nên nếu lọc ở tầng dữ liệu thì
     [Sinh ảnh] cũng lặng lẽ chỉ sinh phần đang thấy — đúng loại "làm thay người dùng"
     mà §4.8 cấm. Lọc ở tầng vẽ thì nút vẫn nói đúng số thật.

     Tab ảo «Tất cả sheet» / file canvas ⇒ `sheetIds === null` ⇒ `scopeSheetIds` trả
     nguyên vẹn ⇒ màn hành xử y như trước lượt E1. */
  const scope = useFileScope();
  const matrix = React.useMemo(() => {
    const sheets = scopeSheetIds(data.matrix.sheets, (sh) => sh.id, scope);
    if (sheets.length === data.matrix.sheets.length) return data.matrix;
    const keep = new Set(sheets.map((sh) => sh.id));
    const cells = new Map([...data.matrix.cells].filter(([, c]) => keep.has(c.sheet.id)));
    return { ...data.matrix, sheets, cells };
  }, [data.matrix, scope]);
  const hiddenSheets = data.matrix.sheets.length - matrix.sheets.length;

  const [selected, setSelected] = React.useState<string[]>([]);
  const [genOpen, setGenOpen] = React.useState(false);
  /** Tập lượt tick sẵn khi mở modal M1 — `null` ⇒ để modal tự chọn "thứ cần sinh". */
  const [genSheet, setGenSheet] = React.useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const renameRef = React.useRef<(() => void) | null>(null);

  const slice = useSliceRun(projectId, nav);
  const history = useContractHistory(projectId, data.contractVersion ?? 0);

  const actions = React.useMemo(() => nextActions(matrix), [matrix]);
  const warning = React.useMemo(() => staleWarning(project, matrix), [project, matrix]);
  const pending = React.useMemo(() => pendingGenJobs(matrix), [matrix]);
  const designEmpty = matrix.sheets.length === 0;

  // Bỏ chọn những ô đã biến mất (bản thiết kế đổi trong lúc màn đang mở).
  React.useEffect(() => {
    setSelected((prev) => prev.filter((job) => [...matrix.cells.values()].some((c) => c.applies && c.job === job)));
  }, [matrix]);

  /**
   * Mở modal M1. `onlySheetId` là cách DUY NHẤT modal của R2-P2 nhận tập chọn sẵn
   * (xem `GenerateDialog`: nó tick theo `onlySheetId`, còn lại tự tick "thứ cần
   * sinh"). Nên: chọn nhiều ô cùng một sheet ⇒ tick đúng sheet đó; chọn lẫn nhiều
   * sheet ⇒ để modal tự tick thứ cần sinh, và user vẫn thấy rõ mình đang tick gì
   * trước khi bấm. Không tự ý chạy gen thay user.
   * TODO(N2 của NEEDS-s2-project.md): đề nghị R2-P2 thêm prop `preselectJobs`.
   */
  const openGenerate = React.useCallback(
    (jobs: readonly string[] | null) => {
      setGenSheet(jobs && jobs.length > 0 ? singleSheetOf(matrix, jobs) : null);
      setGenOpen(true);
    },
    [matrix],
  );

  const onNextAction = (a: NextAction) => {
    switch (a.kind) {
      case "design-sheets": return nav.toDesign("sheets");
      case "design-styles": return nav.toDesign("styles");
      case "runs": return nav.toRuns();
      case "slice": return slice.run(a.jobs);
      case "gen": return openGenerate(a.jobs);
    }
  };

  const onOpenCell = (cell: MatrixCell) => nav.toDesign("sheets", cell.sheet.id, cell.variant.id);

  /* ── ⌘K: mọi hành động của màn phải gọi được từ bảng lệnh (§2.3) ─────── */
  useRegisterCommands(
    () => [
      {
        id: "s2.generate",
        label: "Sinh ảnh…",
        icon: Zap,
        hint: ["mod", "enter"],
        keywords: "gen sinh anh tao anh quota",
        disabledReason: gate.readOnly ? gate.reason : designEmpty ? "Cần ít nhất 1 sheet" : null,
        run: () => openGenerate(null),
      },
      {
        id: "s2.slice-uncut",
        label: "Cắt những lượt chưa cắt",
        icon: Scissors,
        keywords: "cat slice png trong suot",
        disabledReason: gate.readOnly ? gate.reason : uncutJobs(matrix).length === 0 ? "Không có lượt nào cần cắt" : null,
        run: () => slice.run(uncutJobs(matrix)),
      },
      {
        id: "s2.rename",
        label: "Đổi tên project…",
        icon: Pencil,
        hint: ["F2"],
        keywords: "doi ten rename",
        disabledReason: gate.readOnly ? gate.reason : null,
        run: () => renameRef.current?.(),
      },
      {
        id: "s2.history",
        label: "Lịch sử bản thiết kế",
        icon: Images,
        keywords: "lich su ban luu phuc hoi history",
        disabledReason: gate.readOnly ? gate.reason : null,
        run: () => setHistoryOpen(true),
      },
      {
        id: "s2.refresh",
        label: "Làm mới tổng quan project",
        icon: RefreshCw,
        keywords: "reload refresh lam moi",
        run: data.refetch,
      },
    ],
    [gate.readOnly, gate.reason, designEmpty, matrix, slice, data.refetch, openGenerate],
  );

  /* ── Phím tắt của màn (§3-S2): ⌘Enter mở modal Sinh ảnh · F2 đổi tên ──
     `e`/`r`/`k`/`s` là chuỗi `g`+phím của khung (§2.3) — màn KHÔNG giành phím đơn,
     nếu không thì gõ "r" trong ô tìm nào đó cũng nhảy màn. */
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing =
        t !== null &&
        (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable === true);
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!gate.readOnly && !designEmpty) openGenerate(selected.length > 0 ? selected : null);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "F2") {
        e.preventDefault();
        renameRef.current?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gate.readOnly, designEmpty, selected, openGenerate]);

  /* ── Bốn trạng thái ───────────────────────────────────────────────────── */
  if (data.isLoading) {
    return (
      <Shell>
        <ProjectLoading cards={4} label="Đang tải tổng quan project…" />
      </Shell>
    );
  }
  if (data.notFound || data.inTrash) {
    return (
      <Shell>
        <ProjectMissing inTrash={data.inTrash} />
      </Shell>
    );
  }
  if (project === null) {
    return (
      <Shell>
        <ProjectError
          projectId={projectId}
          error={data.fatalError}
          onRetry={data.refetch}
          onOpenHistory={() => setHistoryOpen(true)}
        />
      </Shell>
    );
  }

  const contractErrorView = data.contractError != null ? presentError(data.contractError) : null;

  return (
    <Shell>
      <ProjectHeader
        project={project}
        gate={gate}
        pendingJobCount={pending.length}
        designEmpty={designEmpty}
        fromCache={data.fromCache}
        onGenerate={() => openGenerate(selected.length > 0 ? selected : null)}
        renameRef={renameRef}
      />

      {/* ① Cảnh báo ảnh cũ hơn bản thiết kế — cũng hiện ở S2b (yêu cầu 3). */}
      <StaleBanner
        warning={warning}
        gate={gate}
        onGen={warning.staleJobs.length > 0 ? () => openGenerate(warning.staleJobs) : null}
        onSlice={warning.uncutJobs.length > 0 ? () => slice.run(warning.uncutJobs) : null}
        pending={slice.pending}
      />

      {/* Bản thiết kế không đọc được: ma trận sẽ thiếu ⇒ nói ra, đừng vẽ lưới rỗng
          rồi để user tưởng project mình trống. */}
      {contractErrorView && (
        <ErrorState
          variant="inline"
          title="Chưa đọc được bản thiết kế"
          description={`${contractErrorView.explain} Ma trận tiến độ và số liệu sheet có thể thiếu.`}
          detail={devDetails(data.contractError)}
          actions={
            <button
              type="button"
              onClick={data.refetch}
              className="rounded-1 text-label text-accent-text underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              Thử lại
            </button>
          }
        />
      )}

      {/* ② Việc tiếp theo */}
      <NextActionsCard
        actions={actions}
        degraded={matrix.degraded && !designEmpty}
        gate={gate}
        pending={slice.pending}
        onAction={onNextAction}
        onOpenKit={() => nav.toKit(data.firstVariantId)}
      />

      {/* Đang lọc theo file con ⇒ NÓI RA + cho đường ra một bước (§4.5). */}
      {scope && (
        <FileScopeNotice
          docName={scope.docName}
          hiddenCount={hiddenSheets}
          onShowAll={scope.openAllSheets}
        />
      )}

      {/* ③ Ma trận — KHÔNG hiện khi project chưa có sheet (§3-S2 empty) */}
      {designEmpty ? (
        <OnboardingSteps projectId={projectId} gate={gate} />
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-3 pb-2">
            <CardTitle>Tiến độ theo phong cách × sheet</CardTitle>
            <MatrixLegend matrix={matrix} />
          </CardHeader>
          <CardContent>
            <ProgressMatrix
              matrix={matrix}
              selected={new Set(selected)}
              onSelectedChange={setSelected}
              onOpenCell={onOpenCell}
            />
          </CardContent>
        </Card>
      )}

      {/* ④ Thẻ số liệu + lối vào màn con */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DesignCard
          projectId={projectId}
          matrix={matrix}
          contractVersion={data.contractVersion}
          updatedAt={project.updatedAt}
          gate={gate}
          onOpenHistory={() => setHistoryOpen(true)}
        />
        <RunsCard
          projectId={projectId}
          runs={data.runs}
          unavailable={data.fromCache}
          onOpenRun={nav.toRun}
        />
        <StatsCard project={project} projectId={projectId} />
        <KitCard
          projectId={projectId}
          kit={data.kit}
          offline={data.fromCache || gate.readOnly}
          variantId={data.firstVariantId}
        />
      </div>

      <SelectionBar
        selectedCount={selected.length}
        total={matrix.total}
        gate={gate}
        pending={slice.pending}
        onGen={() => openGenerate(selected)}
        onSlice={() => slice.run(selected)}
        onClear={() => setSelected([])}
      />

      {/* Modal M1 — CỬA DUY NHẤT tiêu quota (§4.8). Màn này không tự gọi useStartRun
          cho `kind:"gen"`; xem lib/useSliceRun.ts. */}
      <GenerateDialog
        open={genOpen}
        onOpenChange={setGenOpen}
        projectId={projectId}
        contract={data.contract}
        jobStates={project.state?.jobs ?? {}}
        onlySheetId={genSheet}
        readOnly={gate.readOnly}
        readOnlyReason={gate.reason}
      />

      {/* Drawer lịch sử bản thiết kế — overlay toàn cục §2.1, dùng lại của R2-P2.
          Ở S2 không có editor nên không bao giờ "bẩn": dirty=false, dirtyCount=0. */}
      <HistoryDrawer
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        history={history}
        currentVersion={data.contractVersion ?? 0}
        dirty={false}
        dirtyCount={0}
        onRestore={async (snapshot) => {
          const res = await history.restore(snapshot);
          if (res) data.refetch();
          return res !== null;
        }}
      />
    </Shell>
  );
}

/** Bọc chung: cùng chiều rộng + khoảng cách ở mọi trạng thái ⇒ đổi trạng thái không "nhảy" layout. */
function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 p-6">{children}</div>;
}

export default ProjectScreen;
