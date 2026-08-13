import * as React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfirmDestructive, ErrorState, LoadingState } from "@/components/common";
import { useRegisterCommands, type ScreenProps } from "@/components/layout";
import { scopeSheetIds, useFileScope } from "@/components/layout/screen-contract"; // sâu: NEEDS-fe2-e N8
import { FileScopeNotice } from "@/components/layout/FloraShell"; // sâu: NEEDS-fe2-e N8
import { useAgentStatus, useDoctor } from "@/lib/hooks";
import { api as agentApi, devDetails, presentError } from "@/lib/api";
import { useEditorStore, type EditorTab } from "@/lib/store";
import { mergeJobStatus, type JobStatus } from "@/lib/status";
import { contractVariants } from "@/lib/types/contract";
import { toast } from "@/components/ui/sonner";

import { useDesignEditor } from "./lib/useDesignEditor";
import { useDesignActions, type ConfirmRequest } from "./lib/useDesignActions";
import { useDesignShortcuts } from "./lib/useDesignShortcuts";
import { findSheet, jobCountOfSheet } from "./lib/ops";
import { SheetsWorkspace } from "./components/SheetsWorkspace";
import { StylesTab } from "./components/StylesTab";
import { AdvancedTab } from "./components/AdvancedTab";
import { ResizeGridDialog } from "./components/ResizeGridDialog";
import { LibrarySlot, SafetySlot } from "./slots";
/* INTEGRATION — NEEDS-safety-runs.md §N6: `useLeaveGuard` + `LeaveGuardDialog` đã được
   R2-P2 nộp kèm mã mẫu "cắm 2 dòng vào DesignScreen", nhưng CHƯA AI CẮM. Không có nó,
   bấm từ S3 sang mục khác ở rail thì router đổi màn, editor unmount, thay đổi chưa lưu
   bốc hơi IM LẶNG (`beforeunload` chỉ cứu ca đóng tab/F5). Đây là lưới an toàn cuối của
   MUST "S3 an toàn dữ liệu" §7.1. */
import { LeaveGuardDialog, useLeaveGuard } from "./safety";
import { SaveBar } from "./components/SaveBar";
import { freeSlotsOf } from "./contracts";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * S3 · TRÌNH SOẠN BẢN THIẾT KẾ — `/p/:id/design` (UX-SPEC §3-S3, độ khó XL)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * File này CHỈ điều phối. Phần nặng đã tách:
 *   lib/useDesignEditor       nạp contract 1 lần · validate · lưu · beforeunload
 *   lib/useDesignActions      mọi thao tác CRUD + modal xác nhận
 *   lib/ops · lib/ops-style   hàm THUẦN biến đổi contract (có test trên dữ liệu thật)
 *   lib/validate              8 luật, mỗi lỗi có `target` để hiện INLINE đúng field
 *   components/SheetsWorkspace khung 3 vùng resizable
 *   slots.tsx                 chỗ cắm của R2-P2 (safety) và R2-P3 (library)
 *
 * BỐN TRẠNG THÁI + CA AGENT CHƯA CHẠY:
 *   loading  → skeleton 3 cột, KHÔNG trắng trang
 *   error    → ErrorState + [Thử lại]; chuỗi kỹ thuật CHỈ trong panel dev
 *   empty    → 0 sheet ⇒ khối hướng dẫn (trong SheetsWorkspace)
 *   success  → 3 vùng đầy đủ
 *   agent tắt→ contract còn trong cache thì VẪN mở và đọc được; mọi nút ghi xám KÈM
 *              LÝ DO (§2.5-2 cấm ẩn nút). Banner là việc của khung, màn không vẽ lại.
 *
 * TAB đọc từ SEARCH PARAM (`?tab=`) và render bằng nhánh điều kiện chứ không dùng
 * `TabsContent`: Radix unmount panel không active ⇒ quay lại tab Sheet sẽ mất vị trí
 * cuộn và selection — đúng bệnh audit #8 mà R1 đã tránh ở tầng route.
 */
/** @deprecated FE3-PLAN §3-E1: màn cũ chỉ còn qua mục Nâng cao hoặc deep link. */
export function DesignScreen({ projectId }: ScreenProps) {
  const navigate = useNavigate();
  const search = useSearch({ from: "/p/$projectId/design" });
  const { status } = useAgentStatus();
  const pid = projectId ?? "";

  const setTab = React.useCallback(
    (tab: EditorTab) => {
      void navigate({
        to: "/p/$projectId/design",
        params: { projectId: pid },
        search: (s: Record<string, unknown>) => ({ ...s, tab }),
        replace: true,
      });
    },
    [navigate, pid],
  );

  const ed = useDesignEditor(pid, status, search.tab, setTab);
  const { api } = ed;
  const contract = api.contract;

  const [confirm, setConfirm] = React.useState<ConfirmRequest | null>(null);
  const [resizeSheetId, setResizeSheetId] = React.useState<string | null>(null);
  const [libOpen, setLibOpen] = React.useState(false);

  // `/api/doctor` CẤM poll (mỗi lần ~1s CPU) ⇒ chỉ bật khi user thực sự mở tab Nâng cao.
  const doctor = useDoctor({ enabled: search.tab === "advanced" });

  const actions = useDesignActions(api, setConfirm, setResizeSheetId, () => setLibOpen(true));

  /* Deep-link `?sheet=` từ ma trận tiến độ S2 (§3-S2: click ô = sang S3 đúng sheet). */
  const wantSheet = search.sheet;
  const loaded = contract !== null;
  React.useEffect(() => {
    if (!wantSheet || !loaded) return;
    if (findSheet(api.contract, wantSheet)) api.setActiveSheet(wantSheet);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantSheet, loaded]);

  /* FE-2·E1 — phạm vi file con. ⛔ KHÔNG LỌC `api.contract` (thứ đem `PUT` lên đĩa; lọc rồi
     lưu = XOÁ SHEET, §4.2 cấm). Cây sheet thuộc glob R2-P1 ⇒ chỉ NÓI RA. NEEDS-fe2-e N2. */
  const scope = useFileScope();
  const shs = contract?.sheets ?? [];
  const hidden = shs.length - scopeSheetIds(shs, (sh) => sh.id, scope).length;
  const activeSheet = contract && api.activeSheetId ? findSheet(contract, api.activeSheetId) : null;
  const previewVariantId = useEditorStore((s) => s.previewVariantId);
  const canvasLayer = useEditorStore((s) => s.canvasLayer);

  /* Trạng thái tổng hợp mỗi sheet: gộp mọi phong cách theo thứ tự ưu tiên §5.7. */
  const sheetStatus = React.useMemo(() => {
    const out: Record<string, JobStatus> = {};
    if (!contract) return out;
    const variants = contractVariants(contract);
    for (const sh of contract.sheets) {
      const list = variants
        .filter((v) => {
          const only = sh.variants ?? sh.styles ?? [];
          return only.length === 0 || only.includes(v.id);
        })
        .map((v) => (ed.projectState.jobs[`${v.id}-${sh.id}`] ?? "never") as JobStatus);
      out[sh.id] = list.length === 0 ? "never" : mergeJobStatus(list);
    }
    return out;
  }, [contract, ed.projectState.jobs]);

  /* `save` khai bên dưới nên đi qua ref: guard giữ hàm lâu, phải luôn gọi bản mới nhất. */
  const saveRef = React.useRef<() => Promise<boolean>>(async () => false);
  const leaveGuard = useLeaveGuard({ dirty: api.dirty, save: () => saveRef.current() });
  const save = React.useCallback(async (): Promise<boolean> => {
    try {
      const ok = await api.save();
      const c = api.contract;
      if (ok && c) {
        toast.success("Đã lưu bản thiết kế", {
          description: `${c.sheets.length} sheet · ${c.sheets.reduce((n, s) => n + s.components.length, 0)} ô`,
        });
      }
      return ok;
    } catch (err) {
      // §3-S3 "error (lưu thất bại khác)": KHÔNG xoá state, nói rõ dữ liệu còn nguyên.
      toast.error("Chưa lưu được — thay đổi của bạn vẫn còn trên máy này", {
        description: presentError(err).explain,
        duration: 12_000,
        action: { label: "Thử lại", onClick: () => void save() },
      });
      return false;
    }
  }, [api]);
  saveRef.current = save;

  const stepSheet = React.useCallback(
    (delta: number) => {
      const c = api.contract;
      if (!c || c.sheets.length === 0) return;
      const i = c.sheets.findIndex((s) => s.id === api.activeSheetId);
      const next = c.sheets[Math.max(0, Math.min(c.sheets.length - 1, (i === -1 ? 0 : i) + delta))];
      if (next) api.setActiveSheet(next.id);
    },
    [api],
  );

  useDesignShortcuts({
    onSave: () => void save(),
    onUndo: ed.undo,
    onRedo: ed.redo,
    onLibrary: () => setLibOpen(true),
    onPrevSheet: () => stepSheet(-1),
    onNextSheet: () => stepSheet(1),
    enabled: ed.phase === "ready",
  });

  useRegisterCommands(
    () => [
      {
        id: "design.save",
        label: "Lưu bản thiết kế",
        hint: ["mod", "S"],
        run: () => void save(),
        disabledReason: api.readOnly ? api.readOnlyReason : api.dirty ? null : "Không có thay đổi nào để lưu",
      },
      { id: "design.library", label: "Mở thư viện element", hint: ["mod", "L"], run: () => setLibOpen(true) },
      { id: "design.undo", label: "Hoàn tác", hint: ["mod", "Z"], run: ed.undo, disabledReason: ed.canUndo ? null : "Chưa có gì để hoàn tác" },
      { id: "design.redo", label: "Làm lại", hint: ["mod", "shift", "Z"], run: ed.redo, disabledReason: ed.canRedo ? null : "Chưa có gì để làm lại" },
      { id: "design.tab.sheets", label: "Thiết kế: tab Sheet & element", run: () => setTab("sheets") },
      { id: "design.tab.styles", label: "Thiết kế: tab Phong cách", run: () => setTab("styles") },
      { id: "design.tab.advanced", label: "Thiết kế: tab Nâng cao", run: () => setTab("advanced") },
    ],
    [save, api.readOnly, api.readOnlyReason, api.dirty, ed.undo, ed.redo, ed.canUndo, ed.canRedo, setTab],
  );

  const refUrlFor = React.useCallback(
    (name: string | undefined) => (name && pid ? agentApi.files.thumbUrl(pid, `refs/${name}`) : null),
    [pid],
  );

  /**
   * Ảnh của một ô. Lớp `raw` là ảnh CẢ SHEET (engine sinh theo sheet) nên không có ảnh
   * riêng từng ô ⇒ trả null để ô hiện "chưa sinh ảnh", thay vì tải cùng một ảnh 16 lần.
   * Lớp `kit` mới có PNG rời từng element.
   */
  const imageFor = React.useCallback(
    (comp: { file: string }) => {
      if (canvasLayer !== "kit" || !previewVariantId || !comp.file) return null;
      return { src: agentApi.files.thumbUrl(pid, `kits/${previewVariantId}/${comp.file}.png`), alt: comp.file };
    },
    [canvasLayer, previewVariantId, pid],
  );

  /** Sinh/cắt là màn S4 (R2-P2). Ở đây chỉ chặn ca "còn thay đổi chưa lưu" rồi chuyển màn. */
  const goGen = React.useCallback(
    (sheetId: string) => {
      const openRuns = () => {
        const c = api.contract;
        const sh = c ? findSheet(c, sheetId) : null;
        const n = c && sh ? jobCountOfSheet(c, sh) : 0;
        void navigate({
          to: "/p/$projectId/runs",
          params: { projectId: pid },
          search: { sheet: sheetId, jobs: n } as never,
        });
      };
      if (api.dirty) {
        toast.warning("Bản thiết kế còn thay đổi chưa lưu", {
          description: "Engine đọc file trên đĩa. Lưu trước rồi sinh ảnh, nếu không sẽ sinh nhầm bản cũ.",
          action: { label: "Lưu rồi đi tiếp", onClick: () => void save().then((ok) => ok && openRuns()) },
        });
        return;
      }
      openRuns();
    },
    [api, navigate, pid, save],
  );

  /* ══════════════ loading / error ══════════════ */

  if (ed.phase === "loading") {
    return (
      <div className="flex h-full gap-3 p-4" aria-busy>
        <LoadingState count={6} variant="rows" className="w-tree shrink-0" label="Đang mở bản thiết kế…" />
        <LoadingState count={8} variant="cards" className="flex-1" label="" />
        <LoadingState count={5} variant="rows" className="w-props shrink-0" label="" />
      </div>
    );
  }

  if (ed.phase === "error" || !contract) {
    const v = presentError(ed.loadError);
    return (
      <div className="p-6">
        <ErrorState
          title={v.title}
          description={v.explain}
          detail={devDetails(ed.loadError)}
          actions={
            <Button variant="primary" onClick={ed.refetch}>
              Thử lại
            </Button>
          }
        />
      </div>
    );
  }

  /* ══════════════ success ══════════════ */

  return (
    <Tabs
      value={search.tab}
      onValueChange={(v) => setTab(v as EditorTab)}
      className="flex h-[calc(100dvh-var(--kg-header,56px))] flex-col"
    >
      <h1 className="sr-only">Bản thiết kế</h1>

      <div className="flex flex-wrap items-center gap-3 border-b border-line-subtle px-4 py-2">
        <TabsList>
          <TabsTrigger value="sheets">Sheet &amp; element</TabsTrigger>
          <TabsTrigger value="styles">Phong cách</TabsTrigger>
          <TabsTrigger value="advanced">Nâng cao</TabsTrigger>
        </TabsList>

        <div className="ml-auto">
          <SaveBar
            version={api.baseVersion}
            dirty={api.dirty}
            dirtyCount={api.dirtyCount}
            savedAt={ed.savedAt}
            saving={api.saving}
            canUndo={ed.canUndo}
            canRedo={ed.canRedo}
            undoLabel={ed.undoLabel}
            redoLabel={ed.redoLabel}
            blockedReason={
              api.readOnly
                ? api.readOnlyReason
                : api.validation.errors.length > 0
                  ? `Còn ${api.validation.errors.length} lỗi phải sửa trước khi lưu.`
                  : null
            }
            onUndo={ed.undo}
            onRedo={ed.redo}
            onSave={() => void save()}
            extra={
              <SafetySlot
                api={api}
                conflict={ed.conflict}
                resolveConflict={ed.resolveConflict}
                dismissConflict={ed.dismissConflict}
                onResolved={(fresh, version) => api.replaceContract(fresh, { markDirty: false, version })}
              />
            }
          />
        </div>
      </div>

      {scope && hidden > 0 && (
        <FileScopeNotice docName={scope.docName} hiddenCount={hidden} onShowAll={scope.openAllSheets} className="mx-4 mt-2" />
      )}
      {/* QA-LEAD: nội dung nằm trong `TabsContent` để mỗi tab có `role="tabpanel"` thật.
          Hành vi mount KHÔNG đổi: nhánh điều kiện cũ cũng unmount tab không hoạt động. */}
      <div className="min-h-0 flex-1">
        <TabsContent value="sheets" className="mt-0 h-full">
          <SheetsWorkspace
            api={api}
            contract={contract}
            actions={actions}
            sheetStatus={sheetStatus}
            extraShapes={ed.extraShapes}
            libIndex={ed.libIndex}
            stale={ed.projectState.stale}
            refUrlFor={refUrlFor}
            imageFor={imageFor}
            onOpenLibrary={() => setLibOpen(true)}
            onOpenResize={setResizeSheetId}
            onGenSheet={goGen}
            onGoStyles={() => setTab("styles")}
            onOpenProjectSettings={() => void navigate({ to: "/p/$projectId/settings", params: { projectId: pid } })}
          />
        </TabsContent>

        <TabsContent value="styles" className="mt-0 h-full">
          <div className="h-full overflow-auto">
            <StylesTab
              contract={contract}
              validation={api.validation}
              readOnly={api.readOnly}
              readOnlyReason={api.readOnlyReason}
              selectedVariantId={api.selection.kind === "variant" ? api.selection.variantId : null}
              onSelectVariant={(id) => api.select({ kind: "variant", variantId: id })}
              onAdd={actions.addVariant}
              onPatch={actions.patchVariant}
              onRenameId={actions.renameVariantId}
              onPatchBrand={actions.patchBrand}
              onDuplicate={actions.duplicateVariant}
              onRemove={actions.deleteVariant}
            />
          </div>
        </TabsContent>

        <TabsContent value="advanced" className="mt-0 h-full">
          <div className="h-full overflow-auto">
            <AdvancedTab
              contract={contract}
              readOnly={api.readOnly}
              readOnlyReason={api.readOnlyReason}
              deps={doctor.data?.python?.deps ?? null}
              onSetChroma={actions.setChroma}
              onPatchSlice={actions.patchSlice}
              onCheckMachine={() => void doctor.refetch()}
            />
          </div>
        </TabsContent>
      </div>

      <LibrarySlot
        open={libOpen}
        onOpenChange={setLibOpen}
        targetSheetId={api.activeSheetId}
        targetSheetLabel={activeSheet?.id ?? null}
        freeSlots={freeSlotsOf(activeSheet)}
        existingFiles={activeSheet?.components.map((x) => x.file) ?? []}
        readOnly={api.readOnly}
        readOnlyReason={api.readOnlyReason}
        onAdd={(elements, opts) => actions.addElements(api.activeSheetId ?? "", elements, opts)}
      />

      {resizeSheetId !== null && findSheet(contract, resizeSheetId) && (
        <ResizeGridDialog
          open
          onOpenChange={(o) => !o && setResizeSheetId(null)}
          sheet={findSheet(contract, resizeSheetId)!}
          onConfirm={(cols, rows, overflow) => actions.resizeGrid(resizeSheetId, cols, rows, overflow)}
        />
      )}

      {/* Chặn điều hướng TRONG APP khi còn thay đổi chưa lưu (NEEDS-safety-runs §N6).
          Nút mất-dữ-liệu KHÔNG phải mặc định, và nháp IDB vẫn được giữ. */}
      <LeaveGuardDialog
        open={leaveGuard.blocked !== null}
        dirtyCount={api.dirtyCount}
        saving={api.saving}
        canSave={!api.readOnly}
        onStay={() => leaveGuard.blocked?.reset()}
        onLeave={() => leaveGuard.blocked?.proceed()}
        onSaveAndLeave={() => void leaveGuard.saveAndLeave()}
      />

      <ConfirmDestructive
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description ?? ""}
        actionLabel={confirm?.actionLabel ?? "Xoá"}
        onConfirm={() => {
          confirm?.onConfirm();
          setConfirm(null);
        }}
      />
    </Tabs>
  );
}
