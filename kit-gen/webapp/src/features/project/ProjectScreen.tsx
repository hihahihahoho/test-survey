import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  FileInput,
  FileText,
  Image,
  LayoutGrid,
  Palette,
  Save,
  Settings,
  UserRound,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
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
import { useAgentStatus, useContract, useElementLib, usePatchProject, useProject, useUserLibrary } from "@/lib/hooks";
import type { LibrarySettings } from "@/lib/types";
import { fromAgentLib } from "@/features/design/library/lib/source";
import { Route as ProjectRoute } from "@/routes/p.$projectId";
import type { ProjectSection } from "@/routes/search-schemas";
import { BriefStep } from "@/features/workflow-v4/steps/BriefStep";
import { StyleStep } from "@/features/workflow-v4/steps/StyleStep";
import { KitsetStep } from "@/features/workflow-v4/steps/KitsetStep";
import { MascotStep } from "@/features/workflow-v4/steps/MascotStep";
import { ResultStep } from "@/features/workflow-v4/steps/ResultStep";
import { SyncBadge } from "@/features/workflow-v4/components/SyncBadge";
import { ContractSyncProvider, useContractSync } from "@/features/workflow-v4/lib/contract-sync";
import { importedElementsOf, workflowPatchFromContract } from "@/features/workflow-v4/lib/contract-import";
import { toKitsetRefs, useWorkflowRefs } from "@/features/workflow-v4/lib/refs-sync";
import {
  WorkflowStoreProvider, useWorkflowStore,
  type ProjectSheetLimits, type SheetLimitKey,
} from "@/features/workflow-v4/lib/model";
import { gateOf, useNarrowViewport } from "@/features/projects/lib/gate";
import { mergeElements, userUiElements } from "@/features/workflow-v4/lib/user-library";

const SECTIONS: ReadonlyArray<{
  id: ProjectSection;
  label: string;
  icon: LucideIcon;
  disabled?: boolean;
}> = [
  { id: "requirements", label: "Yêu cầu", icon: FileText },
  { id: "style", label: "Phong cách", icon: Palette },
  { id: "ui", label: "Bộ khung UI", icon: LayoutGrid },
  { id: "mascot", label: "Mascot", icon: UserRound },
  { id: "images", label: "Ảnh đã tạo", icon: Image },
  { id: "canvas", label: "Canvas", icon: WandSparkles, disabled: true },
  { id: "settings", label: "Cài đặt dự án", icon: Settings },
];

export function ProjectScreen({ projectId = "" }: ScreenProps) {
  return (
    <WorkflowStoreProvider projectId={projectId}>
      <ProjectManager projectId={projectId} />
    </WorkflowStoreProvider>
  );
}

function ProjectManager({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const { section } = ProjectRoute.useSearch();
  const project = useProject(projectId);
  const { status } = useAgentStatus();
  const narrow = useNarrowViewport();
  const gate = React.useMemo(() => gateOf(status, narrow), [status, narrow]);
  const workflow = useWorkflowStore();
  const libQuery = useElementLib();
  const userLibrary = useUserLibrary();
  const diskContract = useContract(projectId);
  const refs = useWorkflowRefs(projectId);
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

  const select = React.useCallback(
    (next: ProjectSection) => {
      if (next === "canvas") return;
      void navigate({
        to: "/p/$projectId",
        params: { projectId },
        search: { section: next },
        replace: true,
      });
    },
    [navigate, projectId],
  );

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
  const showSaveState = sync.state === "pending" || sync.state === "saving"
    || sync.state === "error" || sync.state === "conflict";

  return (
    <ContractSyncProvider value={sync}>
      <div className="flex min-h-[calc(100dvh-3.5rem)] min-w-0 bg-canvas">
        <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-56 shrink-0 flex-col overflow-y-auto border-r border-line-subtle bg-surface/50 p-3 md:flex">
          <div className="mb-4 px-3 py-2">
            <p className="truncate text-label text-fg-strong" title={project.data.name}>{project.data.name}</p>
            <p className="mt-0.5 text-caption text-fg-muted">Dự án</p>
          </div>
          <nav aria-label="Quản lý dự án" className="space-y-1">
            {SECTIONS.map(({ id, label, icon: Icon, disabled }) => (
              <button
                key={id}
                type="button"
                disabled={disabled}
                aria-current={!disabled && section === id ? "page" : undefined}
                onClick={() => select(id)}
                className={cn(
                  "flex min-h-10 w-full items-center gap-3 rounded-2 px-3 text-left text-label transition-colors",
                  !disabled && section === id ? "bg-raised text-fg-strong" : "text-fg hover:bg-raised",
                  disabled && "cursor-not-allowed bg-transparent text-fg-muted hover:bg-transparent",
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="truncate">{label}</span>
                {disabled && <span className="ml-auto text-caption text-fg-muted">Đang phát triển</span>}
              </button>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1">
          <nav aria-label="Quản lý dự án trên màn hình nhỏ" className="flex gap-1 overflow-x-auto border-b border-line-subtle px-4 py-3 md:hidden">
              {SECTIONS.map(({ id, label, disabled }) => (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  onClick={() => select(id)}
                  className={cn(
                    "shrink-0 rounded-2 border border-line-subtle px-3 py-1.5 text-caption",
                    section === id && !disabled ? "border-accent text-fg-strong" : "text-fg",
                    disabled && "cursor-not-allowed bg-raised text-fg-muted",
                  )}
                >
                  {label}{disabled ? " · Sắp có" : ""}
                </button>
              ))}
          </nav>

          <div className="kg-page py-6 sm:py-8">
            {showSaveState && (
              <div className="mb-4 flex items-center justify-end gap-2">
                <SyncBadge sync={sync} />
                {(sync.state === "pending" || sync.state === "error") && (
                  <Button size="sm" variant="secondary" onClick={() => void sync.saveNow()}>
                    <Save aria-hidden />Lưu
                  </Button>
                )}
              </div>
            )}
            {sync.state === "foreign" ? (
              <ImportedDesignNotice
                onConvert={() => {
                  if (!sync.sourceContract) return;
                  workflow.set(workflowPatchFromContract(sync.sourceContract, project.data.name));
                  sync.adoptForeign();
                  toast.success("Đã chuyển sang bản chỉnh sửa");
                }}
              />
            ) : gate.readOnly && (
              <p role="status" className="mb-4 rounded-2 border border-line-subtle bg-raised px-3 py-2 text-caption text-fg">
                {gate.longReason}
              </p>
            )}
            <fieldset disabled={projectReadOnly} className="min-w-0 border-0 p-0">
              {section === "requirements" && <BriefStep />}
              {section === "style" && <StyleStep />}
              {section === "ui" && <KitsetStep />}
              {section === "mascot" && <MascotStep />}
              {section === "images" && <ResultStep />}
              {section === "canvas" && (
                <section className="workflow-panel">
                  <header className="workflow-heading">
                    <h2>Canvas</h2>
                    <p>Đang phát triển.</p>
                  </header>
                </section>
              )}
              {section === "settings" && (
                <ProjectSettingsPanel
                  projectId={projectId}
                  currentName={project.data.name}
                  librarySettings={userLibrary.data?.settings}
                  sheetLimits={workflow.sheetLimits}
                  onSheetLimits={(next) => workflow.set({ sheetLimits: next })}
                  onRenamed={(name) => workflow.set({ kitName: name })}
                />
              )}
            </fieldset>
          </div>
        </div>
      </div>
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
