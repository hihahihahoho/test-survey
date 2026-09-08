/**
 * features/projects/lib/useProjectDialogs.ts — ĐIỀU PHỐI 6 DIALOG của trang chủ.
 *
 * Gom về một chỗ vì mỗi dialog cần biết "đang thao tác trên project nào"; để rải
 * trong màn thì màn phồng lên >400 dòng và không ai lần được luồng.
 *
 * 08/09/2026 — hai kind `export`/`import` đã bỏ cùng đường nhập/xuất dự án dạng .zip
 * (`ExportProjectDialog`, `ImportWizard`). `openImport` + `importPreset` — cái cầu
 * "Tạo → template `import` → mở wizard nhập" — đi theo, vì cả hai đầu cầu đều không
 * còn. Dự án nay chỉ ra/vào bằng thư mục trên đĩa.
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
  | "broken";

export interface DialogState {
  open: DialogKind | null;
  /** project đích cho rename/duplicate/clean/broken. */
  target: Project | null;
  /** danh sách đích cho delete (1 hoặc nhiều). */
  targets: Project[];

  openDialog: (kind: DialogKind, project?: Project) => void;
  openForMany: (kind: "delete", projects: Project[]) => void;
  close: () => void;
  /** true/false cho `<Dialog open>` — dùng để mỗi dialog tự đóng. */
  isOpen: (kind: DialogKind) => boolean;
  setOpen: (kind: DialogKind) => (v: boolean) => void;
}

export function useProjectDialogs(all: readonly Project[]): DialogState {
  const [open, setOpen] = React.useState<DialogKind | null>(null);
  const [targetId, setTargetId] = React.useState<string | null>(null);
  const [targetIds, setTargetIds] = React.useState<string[]>([]);

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
    setOpen(kind);
  }, []);

  const openForMany = React.useCallback((kind: "delete", projects: Project[]) => {
    if (projects.length === 0) return;
    setTargetIds(projects.map((p) => p.id));
    setTargetId(projects[0]!.id);
    setOpen(kind);
  }, []);


  const close = React.useCallback(() => setOpen(null), []);

  return {
    open,
    target,
    targets,
    openDialog,
    openForMany,
    close,
    isOpen: (kind) => open === kind,
    setOpen: (kind) => (v: boolean) => setOpen(v ? kind : null),
  };
}
