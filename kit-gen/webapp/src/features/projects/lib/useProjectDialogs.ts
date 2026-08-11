/**
 * features/projects/lib/useProjectDialogs.ts — ĐIỀU PHỐI 7 DIALOG của S1.
 *
 * Gom về một chỗ vì mỗi dialog cần biết "đang thao tác trên project nào" và vài
 * đường dây liên thông (Tạo → chọn template `from-project` → mở Nhân bản;
 * Tạo → `import` → mở Wizard nhập). Để rải trong màn thì màn phồng lên >400 dòng
 * và không ai lần được luồng.
 *
 * Một chốt an toàn: `target` giữ **id**, không giữ object project. Sau khi đổi
 * tên / xoá / refetch, object cũ là dữ liệu chết; tra lại theo id thì dialog luôn
 * hiện số liệu mới nhất.
 */
import * as React from "react";
import type { Project } from "@/lib/types";

export type DialogKind =
  | "create"
  | "rename"
  | "duplicate"
  | "delete"
  | "clean"
  | "export"
  | "import"
  | "broken";

export interface DialogState {
  open: DialogKind | null;
  /** project đích cho rename/duplicate/clean/broken. */
  target: Project | null;
  /** danh sách đích cho delete/export (1 hoặc nhiều). */
  targets: Project[];
  /** preset chuyển từ modal Tạo sang wizard Nhập. */
  importPreset: { name: string; tags: string[] } | undefined;

  openDialog: (kind: DialogKind, project?: Project) => void;
  openForMany: (kind: "delete" | "export", projects: Project[]) => void;
  openImport: (preset?: { name: string; tags: string[] }) => void;
  close: () => void;
  /** true/false cho `<Dialog open>` — dùng để mỗi dialog tự đóng. */
  isOpen: (kind: DialogKind) => boolean;
  setOpen: (kind: DialogKind) => (v: boolean) => void;
}

export function useProjectDialogs(all: readonly Project[]): DialogState {
  const [open, setOpen] = React.useState<DialogKind | null>(null);
  const [targetId, setTargetId] = React.useState<string | null>(null);
  const [targetIds, setTargetIds] = React.useState<string[]>([]);
  const [importPreset, setImportPreset] = React.useState<{ name: string; tags: string[] } | undefined>(undefined);

  // Tra lại theo id ⇒ dialog luôn thấy số liệu mới nhất, không phải bản chụp cũ.
  const target = React.useMemo(
    () => (targetId ? (all.find((p) => p.id === targetId) ?? null) : null),
    [targetId, all],
  );
  const targets = React.useMemo(
    () => targetIds.map((id) => all.find((p) => p.id === id)).filter((p): p is Project => Boolean(p)),
    [targetIds, all],
  );

  const openDialog = React.useCallback((kind: DialogKind, project?: Project) => {
    setTargetId(project?.id ?? null);
    setTargetIds(project ? [project.id] : []);
    if (kind !== "import") setImportPreset(undefined);
    setOpen(kind);
  }, []);

  const openForMany = React.useCallback((kind: "delete" | "export", projects: Project[]) => {
    if (projects.length === 0) return;
    setTargetIds(projects.map((p) => p.id));
    setTargetId(projects[0]!.id);
    setOpen(kind);
  }, []);

  const openImport = React.useCallback((preset?: { name: string; tags: string[] }) => {
    setImportPreset(preset);
    setOpen("import");
  }, []);

  const close = React.useCallback(() => setOpen(null), []);

  return {
    open,
    target,
    targets,
    importPreset,
    openDialog,
    openForMany,
    openImport,
    close,
    isOpen: (kind) => open === kind,
    setOpen: (kind) => (v: boolean) => setOpen(v ? kind : null),
  };
}
