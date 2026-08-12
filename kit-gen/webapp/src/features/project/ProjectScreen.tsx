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
  ListChecks,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/sonner";
import { ErrorState, LoadingState } from "@/components/common";
import type { ScreenProps } from "@/components/layout";
import { cn } from "@/lib/utils";
import { useAgentStatus, useContract, useElementLib, usePatchProject, useProject, useUserLibrary } from "@/lib/hooks";
import type { LibrarySettings } from "@/lib/types";
import { fromAgentLib } from "@/features/design/library/lib/source";
import { Route as ProjectRoute } from "@/routes/p.$projectId";
import { BriefStep } from "@/features/workflow-v4/steps/BriefStep";
import { StyleStep } from "@/features/workflow-v4/steps/StyleStep";
import { KitsetStep } from "@/features/workflow-v4/steps/KitsetStep";
import { MascotStep } from "@/features/workflow-v4/steps/MascotStep";
import { ResultStep } from "@/features/workflow-v4/steps/ResultStep";
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
  { id: "overview", label: "Tổng quan", icon: LayoutGrid, to: "/p/$projectId" },
  { id: "design", label: "Thiết kế ảnh", icon: Images, to: "/p/$projectId/design" },
  { id: "runs", label: "Lượt tạo", icon: Zap, to: "/p/$projectId/runs" },
  { id: "library", label: "Thành phẩm", icon: ListChecks, to: "/p/$projectId/kit" },
] as const;

const SETTINGS_SECTIONS = [
  { id: "requirements", label: "Yêu cầu", icon: FileText },
  { id: "style", label: "Phong cách", icon: Palette },
  { id: "mascot", label: "Mascot pose", icon: UserRound },
  { id: "ui", label: "Bộ khung UI", icon: LayoutGrid },
  { id: "project", label: "Dự án", icon: Settings },
] as const;
type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

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
  const { status } = useAgentStatus();
  const narrow = useNarrowViewport();
  const gate = React.useMemo(() => gateOf(status, narrow), [status, narrow]);
  const workflow = useWorkflowStore();
  const libQuery = useElementLib();
  const userLibrary = useUserLibrary();
  const diskContract = useContract(projectId);
  const refs = useWorkflowRefs(projectId);
  const settingsOpen = search.section === "settings";
  const setSettingsOpen = React.useCallback((open: boolean) => {
    void navigate({
      to: "/p/$projectId",
      params: { projectId },
      search: ((previous: Record<string, unknown>) => ({ ...previous, section: open ? "settings" : "overview" })) as never,
      replace: !open,
    });
  }, [navigate, projectId]);
  const [settingsSection, setSettingsSection] = React.useState<SettingsSection>("requirements");
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



  if (project.isLoading) return <LoadingState count={4} label="Đang mở dự án…" />;
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

  const projectReadOnly = gate.readOnly || sync.state === "foreign";
  return (
    <ContractSyncProvider value={sync}>
      <div className="flex min-h-[calc(100dvh-3.5rem)] min-w-0 bg-canvas">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 flex-col border-r border-line-subtle bg-surface/50 p-3 md:flex">
          <p className="px-3 py-3 text-caption font-medium uppercase tracking-wide text-fg-muted">Quản lý</p>
          <nav aria-label="Quản lý dự án" className="space-y-1">
            {MANAGEMENT.map(({ id, label, icon: Icon, to }) => (
              <button key={id} type="button" aria-current={id === "overview" ? "page" : undefined}
                onClick={() => id !== "overview" && void navigate({ to, params: { projectId } } as never)}
                className={cn("flex min-h-10 w-full items-center gap-3 rounded-2 px-3 text-left text-label", id === "overview" ? "bg-raised text-fg-strong" : "text-fg hover:bg-raised")}>
                <Icon className="size-4" aria-hidden /><span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <div className="kg-page py-6 sm:py-8">
            {sync.state === "foreign" ? <ImportedDesignNotice onConvert={() => { if (!sync.sourceContract) return; workflow.set(workflowPatchFromContract(sync.sourceContract, project.data.name)); sync.adoptForeign(); }} /> : null}
            {gate.readOnly && <p role="status" className="mb-4 rounded-2 border border-line-subtle bg-raised px-3 py-2 text-caption text-fg">{gate.longReason}</p>}
            <ResultStep />
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
            <fieldset disabled={projectReadOnly} className="min-w-0 overflow-y-auto border-0 p-0">
              {settingsSection === "requirements" && <BriefStep />}
              {settingsSection === "style" && <StyleStep />}
              {settingsSection === "mascot" && <MascotStep />}
              {settingsSection === "ui" && <KitsetStep />}
              {settingsSection === "project" && <ProjectSettingsPanel projectId={projectId} currentName={project.data.name} librarySettings={userLibrary.data?.settings} sheetLimits={workflow.sheetLimits} onSheetLimits={(next) => workflow.set({ sheetLimits: next })} onRenamed={(name) => workflow.set({ kitName: name })} />}
            </fieldset>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </ContractSyncProvider>
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
