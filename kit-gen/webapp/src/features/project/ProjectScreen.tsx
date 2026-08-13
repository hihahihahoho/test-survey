import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { FileInput, Images, LayoutGrid, Settings, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { ErrorState, LoadingState } from "@/components/common";
import type { ScreenProps } from "@/components/layout";
import { cn } from "@/lib/utils";
import { useAgentStatus, useContract, useElementLib, usePatchProject, useProject, useUserLibrary, useWorkflowDraft } from "@/lib/hooks";
import { contractJobs, type LibrarySettings } from "@/lib/types";
import { fromAgentLib } from "@/features/design/library/lib/source";
import { Route as ProjectRoute } from "@/routes/p.$projectId";
import {
  resolveProjectView,
  type ProjectImageGroup, type ProjectSection, type ProjectSettingsTab,
} from "@/routes/search-schemas";
import { KitsetStep } from "@/features/workflow-v4/steps/KitsetStep";
import { MascotStep } from "@/features/workflow-v4/steps/MascotStep";
import { categoryOfSheet } from "@/features/workflow-v4/lib/generated-results";
import { GenerateDialog } from "@/features/runs";
import { ContractSyncProvider, useContractSync } from "@/features/workflow-v4/lib/contract-sync";
import { importedElementsOf, workflowPatchFromContract } from "@/features/workflow-v4/lib/contract-import";
import { toKitsetRefs, useWorkflowRefs } from "@/features/workflow-v4/lib/refs-sync";
import {
  WorkflowStoreProvider, useWorkflowStore, useWorkflowStoreApi,
  type ProjectSheetLimits, type SheetLimitKey,
} from "@/features/workflow-v4/lib/model";
import { gateOf, useNarrowViewport } from "@/features/projects/lib/gate";
import { mergeElements, userUiElements } from "@/features/workflow-v4/lib/user-library";
import { ImagesSection } from "./sections/ImagesSection";
import { ProjectSettingsDialog } from "./components/ProjectSettingsDialog";
import { SaveBar } from "./components/SaveBar";
import { UnsavedGuardDialog } from "./components/UnsavedGuardDialog";
import { useProjectBuffer } from "./lib/useProjectBuffer";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MÀN QUẢN LÝ DỰ ÁN — bốn đích, một bản nháp, không autosave
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * ① **Sidebar bốn mục**: Ảnh đã tạo · Skeleton UI · Mascot · Cài đặt. Sáu mục cũ
 *    (Tất cả thành phẩm / Mascot / Nền / Popup / UI nhỏ / Đạo cụ) đều là *bộ lọc của
 *    một trang*, nên chúng xuống làm hàng chip trong trang "Ảnh đã tạo".
 *
 * ② **Sửa là buffer**. `useContractSync(..., { autosave: false })` ⇒ không có đường
 *    nào ghi đĩa ngoài nút Lưu. Xem `lib/useProjectBuffer.ts` để biết vì sao autosave
 *    là một cái bẫy ở màn này ("15 ô lệch bộ khung · Cần tạo lại" hiện ra khi người
 *    dùng mới chỉ chạm thử một ô).
 *
 * ③ **Mở Cài đặt không được đụng màn nền** (lỗi #5). Dialog có tham số URL riêng
 *    (`?settings=`), `?section=`/`?group=` giữ nguyên — xem `routes/search-schemas.ts`.
 *
 * RANH GIỚI: file này là KHUNG. Ruột của thẻ kết quả, trạng thái run, và form ảnh
 * tham chiếu của mascot đều thuộc component khác; ở đây chỉ đổi chỗ mount của chúng.
 */

const SIDEBAR: ReadonlyArray<{ id: ProjectSection; label: string; icon: typeof Images }> = [
  { id: "images", label: "Ảnh đã tạo", icon: Images },
  { id: "skeleton", label: "Skeleton UI", icon: LayoutGrid },
  { id: "mascot", label: "Mascot", icon: UserRound },
];

/** Nhóm job bị ảnh hưởng khi bấm "Lưu và tạo lại ảnh" ở từng nơi sửa. */
type RegenerateScope = "all" | "ui" | "mascot";

export function ProjectScreen({ projectId = "" }: ScreenProps) {
  return (
    <WorkflowStoreProvider projectId={projectId}>
      <ProjectManager projectId={projectId} />
    </WorkflowStoreProvider>
  );
}

function ProjectManager({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const search = ProjectRoute.useSearch();
  const view = resolveProjectView(search);
  const project = useProject(projectId);
  const draft = useWorkflowDraft(projectId);
  const { status } = useAgentStatus();
  const narrow = useNarrowViewport();
  const gate = React.useMemo(() => gateOf(status, narrow), [status, narrow]);
  const workflow = useWorkflowStore();
  const store = useWorkflowStoreApi();
  const libQuery = useElementLib();
  const userLibrary = useUserLibrary();
  const diskContract = useContract(projectId);
  const refs = useWorkflowRefs(projectId);
  const [generateJobs, setGenerateJobs] = React.useState<string[] | null>(null);
  /** Điều hướng đang bị chặn vì còn thay đổi chưa lưu. */
  const [pendingNav, setPendingNav] = React.useState<(() => void) | null>(null);

  const workflowIncomplete = draft.data?.completed === false;
  React.useEffect(() => {
    if (workflowIncomplete) void navigate({ to: "/k/$projectId", params: { projectId }, replace: true });
  }, [navigate, projectId, workflowIncomplete]);

  const library = React.useMemo(() => {
    const imported = importedElementsOf(diskContract.data?.contract);
    const catalogue = libQuery.data ? fromAgentLib(libQuery.data).elements : [];
    const custom = userUiElements(userLibrary.data?.items ?? []);
    const merged = mergeElements(imported, custom, catalogue);
    return merged.length ? merged : undefined;
  }, [diskContract.data?.contract, libQuery.data, userLibrary.data?.items]);
  const contractRefs = React.useMemo(
    () => (refs.ready ? toKitsetRefs(refs.groups) : undefined),
    [refs.groups, refs.ready],
  );
  const limits = React.useMemo(() => {
    const shared = userLibrary.data?.settings;
    const own = workflow.sheetLimits;
    return {
      background: own.background ?? shared?.background,
      popup: own.popup ?? shared?.popup,
      small: own.small ?? shared?.small,
      props: own.props ?? shared?.props,
      mascot: own.mascot ?? shared?.mascot,
    };
  }, [userLibrary.data?.settings, workflow.sheetLimits]);

  /* ⚠️ `autosave: false` là CẢ MỤC ④ của đợt này. Đừng bật lại "cho tiện". */
  const sync = useContractSync(projectId, workflow, status, {
    autosave: false,
    ...(library ? { lib: library } : {}),
    ...(contractRefs ? { refs: contractRefs } : {}),
    limits,
  });

  const buffer = useProjectBuffer({
    projectId,
    store,
    state: workflow,
    sync,
    ready: !project.isLoading && !draft.isLoading && !diskContract.isLoading,
  });

  React.useEffect(() => {
    const name = project.data?.name?.trim();
    if (name && (workflow.kitName === "Dự án mới" || workflow.kitName === "Bộ quay may mắn")) {
      workflow.set({ kitName: name });
    }
  }, [project.data?.name, workflow.kitName, workflow.set]);

  /**
   * NHẬN BẢN THIẾT KẾ CŨ ⇒ GHI NGAY, không chờ nút Lưu.
   *
   * "Chuyển và chỉnh sửa" là một xác nhận rõ ràng của người dùng, và cho tới khi bản
   * workflow được ghi đè thì `sync` vẫn coi đĩa là `foreign` ⇒ mọi nút Lưu sau đó đều
   * vô hiệu. Không ghi ở đây là để dự án kẹt ở trạng thái chỉ-đọc.
   *
   * Phải chờ một vòng render: `adoptForeign()` chỉ đặt cờ, `canWrite` mới thoát khỏi
   * `foreign` ở lần render sau. `saveRef` để effect không phụ thuộc `buffer` (object mới
   * mỗi render ⇒ effect chạy vô hạn).
   */
  const [adopting, setAdopting] = React.useState(false);
  const saveRef = React.useRef(buffer.save);
  saveRef.current = buffer.save;
  React.useEffect(() => {
    if (!adopting || sync.state === "foreign") return;
    setAdopting(false);
    void saveRef.current();
  }, [adopting, sync.state]);

  /** Ghi search mới, giữ nguyên mọi tham số khác. */
  const patchSearch = React.useCallback((patch: Record<string, unknown>, replace = false) => {
    void navigate({
      to: "/p/$projectId",
      params: { projectId },
      search: ((previous: Record<string, unknown>) => ({ ...previous, ...patch })) as never,
      replace,
    });
  }, [navigate, projectId]);

  /**
   * Đổi mục sidebar. Còn thay đổi chưa lưu ⇒ HỎI trước, và giữ lại ý định để làm nốt
   * sau khi người dùng chọn lưu hay bỏ. Bộ lọc nhóm ảnh và tab dialog KHÔNG đi qua đây:
   * chúng không rời khỏi bản nháp nên chặn chúng chỉ gây phiền.
   */
  const goSection = React.useCallback((section: ProjectSection) => {
    const run = () => patchSearch({ section, settings: undefined });
    if (buffer.dirty) { setPendingNav(() => run); return; }
    run();
  }, [buffer.dirty, patchSearch]);

  const setSettingsTab = React.useCallback((tab: ProjectSettingsTab | null) => {
    patchSearch({ settings: tab ?? undefined }, tab === null);
  }, [patchSearch]);

  const closeSettings = React.useCallback(() => {
    const run = () => setSettingsTab(null);
    if (buffer.dirty) { setPendingNav(() => run); return; }
    run();
  }, [buffer.dirty, setSettingsTab]);

  const jobsOf = React.useCallback((scope: RegenerateScope): string[] => contractJobs(sync.contract)
    .filter((job) => {
      if (scope === "all") return true;
      const category = categoryOfSheet(job.sheet);
      return scope === "mascot" ? category === "mascot" : category !== "mascot";
    })
    .map((job) => job.job), [sync.contract]);

  /**
   * [Lưu và tạo lại ảnh] — LƯU TRƯỚC, mở dialog sinh ảnh SAU.
   *
   * Thứ tự này là cả điểm của mục ④: dialog sinh ảnh đọc `sync.contract`, nên mở nó khi
   * đĩa còn giữ bản cũ là tạo ảnh cho một bản thiết kế người dùng tưởng đã đổi. Lưu hỏng
   * ⇒ dừng hẳn, `save()` đã nói lý do bằng toast.
   */
  const saveAndRegenerate = React.useCallback((scope: RegenerateScope) => {
    void (async () => {
      const jobs = jobsOf(scope);
      if (!(await buffer.save())) return;
      if (jobs.length === 0) {
        toast.info("Đã lưu — chưa có tấm nào để tạo lại.");
        return;
      }
      setSettingsTab(null);
      setGenerateJobs(jobs);
    })();
  }, [buffer, jobsOf, setSettingsTab]);

  const saveOnly = React.useCallback(() => {
    void (async () => { if (await buffer.save()) toast.success("Đã lưu cài đặt dự án"); })();
  }, [buffer]);

  if (project.isLoading || draft.isLoading) return <LoadingState count={4} label="Đang mở dự án…" />;
  if (project.error || !project.data) {
    return (
      <div className="kg-page py-8">
        <ErrorState
          title="Chưa mở được dự án"
          description="Dữ liệu trên máy vẫn được giữ nguyên."
          actions={<Button onClick={() => void project.refetch()}>Thử lại</Button>}
        />
      </div>
    );
  }
  if (workflowIncomplete) return <LoadingState count={4} label="Đang mở lại wizard chưa hoàn tất…" />;

  const projectReadOnly = gate.readOnly || sync.state === "foreign";
  const saveBar = (scope: RegenerateScope, saveLabel: string, regenerateLabel: string, className?: string) => (
    <SaveBar
      className={className}
      dirty={buffer.dirty}
      saving={buffer.saving}
      saveLabel={saveLabel}
      regenerateLabel={regenerateLabel}
      canRegenerate={!projectReadOnly}
      onSave={saveOnly}
      onSaveAndRegenerate={() => saveAndRegenerate(scope)}
      onRevert={buffer.revert}
    />
  );

  return (
    <ContractSyncProvider value={sync}>
      <div className="flex min-h-[calc(100dvh-3.5rem)] min-w-0 bg-canvas">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 flex-col border-r border-line-subtle bg-surface/50 p-3 md:flex">
          <p className="px-3 py-3 text-caption font-medium uppercase tracking-wide text-fg-muted">Quản lý</p>
          <nav aria-label="Quản lý dự án" className="space-y-1">
            {SIDEBAR.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                aria-current={id === view.section ? "page" : undefined}
                onClick={() => goSection(id)}
                className={cn(
                  "flex min-h-10 w-full items-center gap-3 rounded-2 px-3 text-left text-label",
                  id === view.section ? "bg-raised text-fg-strong" : "text-fg hover:bg-raised",
                )}
              >
                <Icon className="size-4" aria-hidden /><span>{label}</span>
              </button>
            ))}
            {/* Cài đặt là mục thứ tư của sidebar và mở DIALOG — cùng một cửa với nút Cài
                đặt trên topbar, nên hai đường không thể lệch nội dung. */}
            <button
              type="button"
              aria-current={view.settingsTab !== null ? "page" : undefined}
              onClick={() => setSettingsTab("requirements")}
              className={cn(
                "flex min-h-10 w-full items-center gap-3 rounded-2 px-3 text-left text-label",
                view.settingsTab !== null ? "bg-raised text-fg-strong" : "text-fg hover:bg-raised",
              )}
            >
              <Settings className="size-4" aria-hidden /><span>Cài đặt</span>
            </button>
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <div className="kg-page py-6 sm:py-8">
            {sync.state === "foreign"
              ? <ImportedDesignNotice onConvert={() => {
                  if (!sync.sourceContract) return;
                  workflow.set(workflowPatchFromContract(sync.sourceContract, project.data.name));
                  sync.adoptForeign();
                  setAdopting(true);
                }} />
              : null}
            {gate.readOnly && <p role="status" className="mb-4 rounded-2 border border-line-subtle bg-raised px-3 py-2 text-caption text-fg">{gate.longReason}</p>}

            {view.section === "images" && (
              <ImagesSection
                projectId={projectId}
                kitName={workflow.kitName}
                group={view.group}
                onGroupChange={(group: ProjectImageGroup) => patchSearch({ group })}
                contract={sync.contract}
                jobStates={project.data.state?.jobs ?? {}}
                readOnly={projectReadOnly}
                onGenerate={setGenerateJobs}
              />
            )}

            {view.section === "skeleton" && (
              <ManageSection
                eyebrow="Bộ khung của dự án"
                title="Skeleton UI"
                copy="Chọn thành phần, chỉnh kích thước ô và xem prompt sẽ gửi đi."
                readOnly={projectReadOnly}
                saveBar={saveBar("ui", "Lưu", "Lưu + Gen lại")}
              >
                <KitsetStep variant="manage" detailFooter={saveBar("ui", "Lưu", "Lưu + Gen lại", "w-full")} />
              </ManageSection>
            )}

            {view.section === "mascot" && (
              <ManageSection
                eyebrow="Nhân vật của dự án"
                title="Mascot"
                copy="Quản lý nhân vật, bộ dáng và prompt của từng dáng."
                readOnly={projectReadOnly}
                saveBar={saveBar("mascot", "Lưu", "Lưu + Gen lại")}
              >
                <MascotStep variant="manage" detailFooter={saveBar("mascot", "Lưu", "Lưu + Gen lại", "w-full")} />
              </ManageSection>
            )}
          </div>
        </div>
      </div>

      <ProjectSettingsDialog
        open={view.settingsTab !== null}
        onOpenChange={(open) => { if (!open) closeSettings(); }}
        projectName={project.data.name}
        tab={view.settingsTab ?? "requirements"}
        onTabChange={setSettingsTab}
        readOnly={projectReadOnly}
        projectPanel={
          <ProjectSettingsPanel
            projectId={projectId}
            currentName={project.data.name}
            librarySettings={userLibrary.data?.settings}
            sheetLimits={workflow.sheetLimits}
            onSheetLimits={(next) => workflow.set({ sheetLimits: next })}
            onRenamed={(name) => workflow.set({ kitName: name })}
          />
        }
        footer={saveBar("all", "Lưu cài đặt", "Lưu và tạo lại ảnh", "w-full")}
      />

      <UnsavedGuardDialog
        open={pendingNav !== null}
        onOpenChange={(open) => { if (!open) setPendingNav(null); }}
        saving={buffer.saving}
        onSaveAndLeave={() => {
          const run = pendingNav;
          void (async () => { if (await buffer.save()) { setPendingNav(null); run?.(); } })();
        }}
        onDiscardAndLeave={() => {
          const run = pendingNav;
          buffer.revert();
          setPendingNav(null);
          run?.();
        }}
      />

      <GenerateDialog
        open={generateJobs !== null}
        onOpenChange={(open) => { if (!open) setGenerateJobs(null); }}
        projectId={projectId}
        contract={sync.contract}
        jobStates={project.data.state?.jobs ?? {}}
        initialJobs={generateJobs}
        readOnly={projectReadOnly}
        readOnlyReason={gate.reason}
      />
    </ContractSyncProvider>
  );
}

/**
 * Khung chung của hai trang sửa được (Skeleton UI · Mascot): tiêu đề + hàng nút Lưu ở
 * TRÊN và DƯỚI nội dung. Trên vì lưới 42 món dài hơn một màn hình và người ta không nên
 * phải cuộn xuống đáy mới thấy nút Lưu; dưới vì đó là nơi tay đang ở sau khi sửa xong.
 */
function ManageSection({ eyebrow, title, copy, readOnly, saveBar, children }: {
  eyebrow: string;
  title: string;
  copy: string;
  readOnly: boolean;
  saveBar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-5">
      <header>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="text-display text-fg-strong">{title}</h1>
        <p className="mt-1 text-body text-fg-muted">{copy}</p>
      </header>
      <div className="rounded-3 border border-line-subtle bg-surface p-3">{saveBar}</div>
      <fieldset disabled={readOnly} className="min-w-0 border-0 p-0">{children}</fieldset>
      <div className="rounded-3 border border-line-subtle bg-surface p-3">{saveBar}</div>
    </section>
  );
}

function ImportedDesignNotice({ onConvert }: { onConvert: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-2 border border-line-subtle bg-raised px-3 py-2 text-caption text-fg">
        <FileInput className="size-4 shrink-0 text-fg-muted" aria-hidden />
        <span className="min-w-0 flex-1">Dự án này được tạo bằng phiên bản cũ.</span>
        <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>Chỉnh sửa dự án</Button>
      </div>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chuyển sang trình quản lý mới?</AlertDialogTitle>
            <AlertDialogDescription>Dữ liệu hiện có sẽ được giữ lại để bạn tiếp tục chỉnh sửa và tạo ảnh.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={onConvert}>Chuyển và chỉnh sửa</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProjectSettingsPanel({
  projectId,
  currentName,
  librarySettings,
  sheetLimits,
  onSheetLimits,
  onRenamed,
}: {
  projectId: string;
  currentName: string;
  librarySettings?: LibrarySettings;
  sheetLimits: ProjectSheetLimits;
  onSheetLimits: (limits: ProjectSheetLimits) => void;
  onRenamed: (name: string) => void;
}) {
  const patch = usePatchProject(projectId);
  const [name, setName] = React.useState(currentName);
  React.useEffect(() => setName(currentName), [currentName]);
  const clean = name.trim();
  const changed = clean.length > 0 && clean !== currentName;

  return (
    <section className="workflow-panel">
      <header className="workflow-heading">
        <h2>Cài đặt dự án</h2>
      </header>
      <div className="max-w-xl space-y-3">
        <Label htmlFor="project-manager-name">Tên dự án</Label>
        {/* Đổi tên đi thẳng xuống agent (`PATCH /api/projects/:id`) chứ không qua bản
            nháp: tên dự án là dữ liệu của agent, không nằm trong contract, nên nút Lưu
            chung không có gì để ghi cho nó. */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="project-manager-name"
            value={name}
            maxLength={100}
            onChange={(event) => setName(event.target.value)}
          />
          <Button
            type="button"
            variant="secondary"
            disabled={!changed || patch.isPending}
            onClick={() => patch.mutate({ name: clean }, {
              onSuccess: () => {
                onRenamed(clean);
                toast.success("Đã đổi tên dự án");
              },
              onError: () => toast.error("Chưa đổi được tên dự án"),
            })}
          >
            {patch.isPending ? "Đang lưu…" : "Lưu tên"}
          </Button>
        </div>
      </div>
      <div className="mt-8 border-t border-line-subtle pt-6">
        <h3 className="text-label text-fg-strong">Tối đa trên một sheet</h3>
        <p className="mt-1 text-caption text-fg-muted">Để trống để dùng cài đặt của thư viện.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PROJECT_LIMITS.map(({ key, label, fallback }) => (
            <ProjectLimitInput
              key={key}
              label={label}
              value={sheetLimits[key]}
              fallback={librarySettings?.[key] ?? fallback}
              onChange={(value) => onSheetLimits({ ...sheetLimits, [key]: value })}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

const PROJECT_LIMITS: ReadonlyArray<{ key: SheetLimitKey; label: string; fallback: number }> = [
  { key: "background", label: "Nền", fallback: 2 },
  { key: "popup", label: "Popup", fallback: 4 },
  { key: "small", label: "UI nhỏ", fallback: 16 },
  { key: "props", label: "Đạo cụ", fallback: 16 },
  { key: "mascot", label: "Dáng mascot", fallback: 4 },
];

function ProjectLimitInput({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string;
  value: number | null;
  fallback: number;
  onChange: (value: number | null) => void;
}) {
  const id = `project-limit-${label.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="space-y-2 rounded-3 border border-line-subtle bg-raised p-3">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={1}
        max={32}
        value={value ?? ""}
        placeholder={String(fallback)}
        onChange={(event) => {
          if (event.target.value === "") {
            onChange(null);
            return;
          }
          onChange(Math.max(1, Math.min(32, Number(event.target.value) || 1)));
        }}
        aria-description={value === null ? `Đang dùng mặc định ${fallback}` : undefined}
      />
    </div>
  );
}
