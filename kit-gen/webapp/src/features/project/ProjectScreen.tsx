import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  FileInput,
  FileText,
  Images,
  LayoutGrid,
  Palette,
  Settings,
  UserRound,
  Box,
  Shapes,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/sonner";
import { ErrorState, LoadingState } from "@/components/common";
import type { ScreenProps } from "@/components/layout";
import { cn } from "@/lib/utils";
import { useAgentStatus, useContract, useElementLib, usePatchProject, useProject, useUserLibrary, useWorkflowDraft } from "@/lib/hooks";
import { contractJobs, type Contract, type JobStatusValue, type LibrarySettings } from "@/lib/types";
import { fromAgentLib } from "@/features/design/library/lib/source";
import { Route as ProjectRoute } from "@/routes/p.$projectId";
import { BriefStep } from "@/features/workflow-v4/steps/BriefStep";
import { StyleStep } from "@/features/workflow-v4/steps/StyleStep";
import { KitsetStep } from "@/features/workflow-v4/steps/KitsetStep";
import { MascotStep } from "@/features/workflow-v4/steps/MascotStep";
import { GeneratedResults } from "@/features/workflow-v4/components/GeneratedResults";
import { SkeletonPreview } from "@/features/design/preview";
import { categoryOfSheet, type ResultGroup } from "@/features/workflow-v4/lib/generated-results";
import { GenerateDialog } from "@/features/runs";
import { ContractSyncProvider, useContractSync } from "@/features/workflow-v4/lib/contract-sync";
import { importedElementsOf, workflowPatchFromContract } from "@/features/workflow-v4/lib/contract-import";
import { toKitsetRefs, useWorkflowRefs } from "@/features/workflow-v4/lib/refs-sync";
import {
  WorkflowStoreProvider, useWorkflowStore,
  type ProjectSheetLimits, type SheetLimitKey,
} from "@/features/workflow-v4/lib/model";
import { gateOf, useNarrowViewport } from "@/features/projects/lib/gate";
import { mergeElements, userUiElements } from "@/features/workflow-v4/lib/user-library";

const MANAGEMENT = [
  { id: "overview", label: "Tất cả thành phẩm", icon: LayoutGrid, category: "all" },
  { id: "mascot", label: "Mascot", icon: UserRound, category: "mascot" },
  { id: "background", label: "Nền", icon: Images, category: "background" },
  { id: "popup", label: "Popup", icon: Box, category: "popup" },
  { id: "ui", label: "UI kit", icon: Palette, category: "ui" },
  { id: "props", label: "Đạo cụ", icon: Shapes, category: "prop" },
] as const;

const SETTINGS_SECTIONS = [
  { id: "requirements", label: "Yêu cầu", icon: FileText },
  { id: "style", label: "Phong cách", icon: Palette },
  { id: "mascot", label: "Mascot", icon: UserRound },
  { id: "ui", label: "Bộ khung UI", icon: LayoutGrid },
  { id: "project", label: "Dự án", icon: Settings },
] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];
const SETTINGS_REGENERATE_GROUP: Partial<Record<SettingsSection, ResultGroup>> = { mascot: "mascot", ui: "ui" };

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
  const project = useProject(projectId);
  const draft = useWorkflowDraft(projectId);
  const { status } = useAgentStatus();
  const narrow = useNarrowViewport();
  const gate = React.useMemo(() => gateOf(status, narrow), [status, narrow]);
  const workflow = useWorkflowStore();
  const libQuery = useElementLib();
  const userLibrary = useUserLibrary();
  const diskContract = useContract(projectId);
  const refs = useWorkflowRefs(projectId);
  const settingsOpen = search.section === "settings";
  const activeSection = MANAGEMENT.some(item => item.id === search.section) ? search.section : "overview";
  const activeManagement = MANAGEMENT.find(item => item.id === activeSection) ?? MANAGEMENT[0];
  const [generateJobs, setGenerateJobs] = React.useState<string[] | null>(null);
  const setSettingsOpen = React.useCallback((open: boolean) => {
    void navigate({
      to: "/p/$projectId",
      params: { projectId },
      search: ((previous: Record<string, unknown>) => ({ ...previous, section: open ? "settings" : "overview" })) as never,
      replace: !open,
    });
  }, [navigate, projectId]);
  const [settingsSection, setSettingsSection] = React.useState<SettingsSection>("requirements");
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
    const project = workflow.sheetLimits;
    return {
      background: project.background ?? shared?.background,
      popup: project.popup ?? shared?.popup,
      small: project.small ?? shared?.small,
      mascot: project.mascot ?? shared?.mascot,
    };
  }, [userLibrary.data?.settings, workflow.sheetLimits]);
  const sync = useContractSync(projectId, workflow, status, {
    ...(library ? { lib: library } : {}),
    ...(contractRefs ? { refs: contractRefs } : {}),
    limits,
  });

  React.useEffect(() => {
    const name = project.data?.name?.trim();
    if (name && (workflow.kitName === "Dự án mới" || workflow.kitName === "Bộ quay may mắn")) {
      workflow.set({ kitName: name });
    }
  }, [project.data?.name, workflow.kitName, workflow.set]);



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
  return (
    <ContractSyncProvider value={sync}>
      <div className="flex min-h-[calc(100dvh-3.5rem)] min-w-0 bg-canvas">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 flex-col border-r border-line-subtle bg-surface/50 p-3 md:flex">
          <p className="px-3 py-3 text-caption font-medium uppercase tracking-wide text-fg-muted">Quản lý</p>
          <nav aria-label="Quản lý dự án" className="space-y-1">
            {MANAGEMENT.map(({ id, label, icon: Icon }) => (
              <button key={id} type="button" aria-current={id === activeSection ? "page" : undefined}
                onClick={() => void navigate({ to: "/p/$projectId", params: { projectId }, search: { section: id } } as never)}
                className={cn("flex min-h-10 w-full items-center gap-3 rounded-2 px-3 text-left text-label", id === activeSection ? "bg-raised text-fg-strong" : "text-fg hover:bg-raised")}>
                <Icon className="size-4" aria-hidden /><span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="kg-page py-6 sm:py-8">
            {sync.state === "foreign" ? <ImportedDesignNotice onConvert={() => { if (!sync.sourceContract) return; workflow.set(workflowPatchFromContract(sync.sourceContract, project.data.name)); sync.adoptForeign(); }} /> : null}
            {gate.readOnly && <p role="status" className="mb-4 rounded-2 border border-line-subtle bg-raised px-3 py-2 text-caption text-fg">{gate.longReason}</p>}
            <ProjectDeliverables projectId={projectId} category={activeManagement.category} title={activeManagement.label} contract={sync.contract} jobStates={project.data.state?.jobs ?? {}} readOnly={projectReadOnly} onGenerate={setGenerateJobs} />
          </div>
        </div>
      </div>
      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent size="xl" className="h-[min(48rem,calc(100dvh-2rem))]">
          <DialogHeader><DialogTitle>Cài đặt</DialogTitle><DialogDescription>Thông tin và cách tạo hình của dự án «{project.data.name}».</DialogDescription></DialogHeader>
          <DialogBody className="grid min-h-0 gap-5 md:grid-cols-[12rem_minmax(0,1fr)]">
            <nav aria-label="Các mục cài đặt dự án" className="flex gap-1 overflow-x-auto md:flex-col">
              {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => setSettingsSection(id)} aria-current={settingsSection === id ? "page" : undefined} className={cn("flex shrink-0 items-center gap-2 rounded-2 px-3 py-2 text-left text-label", settingsSection === id ? "bg-raised text-fg-strong" : "text-fg-muted hover:bg-raised")}><Icon className="size-4" aria-hidden />{label}</button>)}
            </nav>
            <fieldset disabled={projectReadOnly} className="min-w-0 overflow-y-auto border-0 p-0 pb-20">
              {settingsSection === "requirements" && <BriefStep />}
              {settingsSection === "style" && <StyleStep />}
              {settingsSection === "mascot" && <MascotStep />}
              {settingsSection === "ui" && <KitsetStep />}
              {settingsSection === "project" && <ProjectSettingsPanel projectId={projectId} currentName={project.data.name} librarySettings={userLibrary.data?.settings} sheetLimits={workflow.sheetLimits} onSheetLimits={(next) => workflow.set({ sheetLimits: next })} onRenamed={(name) => workflow.set({ kitName: name })} />}
              {settingsSection !== "project" ? <SettingsRegenerateBar section={settingsSection} contract={sync.contract} onGenerate={(jobs) => { setGenerateJobs(jobs); setSettingsOpen(false); }} /> : null}
            </fieldset>
          </DialogBody>
        </DialogContent>
      </Dialog>
      <GenerateDialog open={generateJobs !== null} onOpenChange={open=>{if(!open)setGenerateJobs(null)}} projectId={projectId} contract={sync.contract} jobStates={project.data.state?.jobs ?? {}} initialJobs={generateJobs} readOnly={projectReadOnly} readOnlyReason={gate.reason} />
    </ContractSyncProvider>
  );
}

function SettingsRegenerateBar({ section, contract, onGenerate }: { section: SettingsSection; contract: Contract; onGenerate: (jobs: string[]) => void }) {
  const group = SETTINGS_REGENERATE_GROUP[section];
  const jobs = contractJobs(contract).filter(job => !group || categoryOfSheet(job.sheet) === group).map(job => job.job);
  const label = group === "mascot" ? "Tạo lại mascot" : group === "ui" ? "Tạo lại UI kit" : "Tạo lại toàn bộ";
  return (
    <div className="sticky bottom-0 mt-6 flex items-center justify-between gap-3 border-t border-line-subtle bg-canvas/95 py-3 backdrop-blur">
      <p className="text-caption text-fg-muted">Thay đổi được lưu tự động. Tạo lại để áp dụng vào ảnh.</p>
      <Button type="button" disabled={jobs.length === 0} onClick={() => onGenerate(jobs)}><RefreshCw aria-hidden />{label}</Button>
    </div>
  );
}

function ProjectDeliverables({ projectId, category, title, contract, jobStates, readOnly, onGenerate }: {
  projectId: string;
  category: ResultGroup;
  title: string;
  contract: Contract;
  jobStates: Record<string, JobStatusValue>;
  readOnly: boolean;
  onGenerate: (jobs: string[]) => void;
}) {
  const sheets = React.useMemo(
    () => contract.sheets.filter(sheet => category === "all" || categoryOfSheet(sheet.id) === category),
    [category, contract.sheets],
  );
  const jobs = React.useMemo(
    () => contractJobs(contract).filter(job => category === "all" || categoryOfSheet(job.sheet) === category).map(job => job.job),
    [category, contract],
  );
  return <section className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><p className="eyebrow">Quản lý thành phẩm</p><h1 className="text-display text-fg-strong">{title}</h1><p className="mt-1 text-body text-fg-muted">Xem ảnh thật, kiểm tra skeleton và tạo lại đúng nhóm đang sửa.</p></div><Button type="button" disabled={readOnly || jobs.length === 0} onClick={()=>onGenerate(jobs)}><RefreshCw aria-hidden/>{category === "all" ? "Tạo lại toàn bộ" : `Tạo lại ${title.toLowerCase()}`}</Button></header>
    <Tabs defaultValue="images">
      <TabsList><TabsTrigger value="images">Ảnh thật</TabsTrigger><TabsTrigger value="skeleton">Skeleton</TabsTrigger></TabsList>
      <TabsContent value="images"><GeneratedResults projectId={projectId} contract={contract} jobStates={jobStates} category={category} readOnly={readOnly}/></TabsContent>
      <TabsContent value="skeleton"><div className="grid gap-4 lg:grid-cols-2">{sheets.map(sheet=><article key={sheet.id} className="overflow-hidden rounded-4 border border-line-subtle bg-surface"><div className="border-b border-line-subtle px-4 py-3"><h2 className="text-label text-fg-strong">{sheet.id.replaceAll("-"," ")}</h2><p className="text-caption text-fg-muted">{sheet.components.filter(component=>component.skel?.shape!=="empty").length} thành phần · {sheet.grid.cols} × {sheet.grid.rows}</p></div><div className="p-4"><SkeletonPreview sheet={sheet} showIndex showSafeFrame /></div></article>)}</div>{sheets.length===0?<p className="rounded-4 border border-dashed border-line-subtle p-8 text-center text-body text-fg-muted">Nhóm này chưa có skeleton trong bản thiết kế.</p>:null}</TabsContent>
    </Tabs>
  </section>;
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
  { key: "small", label: "UI nhỏ & đạo cụ", fallback: 16 },
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
