import * as React from "react";
import { CreateModeDialog } from "./dialogs/CreateModeDialog";
import { FirstDocGate } from "./dialogs/CreateModeFirstDoc";
import { RenameProjectDialog } from "./dialogs/RenameProjectDialog";
import { DuplicateProjectDialog } from "./dialogs/DuplicateProjectDialog";
import { DeleteProjectDialog } from "./dialogs/DeleteProjectDialog";
import { CleanProjectDialog } from "./dialogs/CleanProjectDialog";
import { ExportProjectDialog } from "./dialogs/ExportProjectDialog";
import { ImportWizard } from "./dialogs/ImportWizard";
import { BrokenProjectDialog } from "./dialogs/BrokenProjectDialog";
import type { Project } from "@/lib/types";
import type { Gate } from "./lib/gate";
import type { ProjectNav } from "./lib/nav";
import type { DialogState } from "./lib/useProjectDialogs";
import { toastInfo, toastSuccess } from "./lib/feedback";
import { FIRST_DOC_NO_SHEETS_NOTE, firstDocCopy } from "./lib/create-mode-firstdoc";
import type { CreateIntent } from "./lib/create-mode";
import type { TemplateId } from "./dialogs/CreateParts";

/** Việc còn treo sau khi `POST /api/projects` thành công (FE-2·B2). */
interface PendingFirstDoc {
  projectId: string;
  projectName: string;
  template: TemplateId;
  intent: CreateIntent;
}

/**
 * Gom 8 overlay của S1 vào một chỗ để `ProjectsScreen.tsx` không phồng lên.
 * Mỗi dialog tự lo state của nó; ở đây chỉ nối dây `open`/`onOpenChange` và
 * xử lý điều hướng SAU khi thao tác xong (§4.1-4, §4.3).
 */
export function ProjectDialogs({
  dialogs,
  all,
  gate,
  nav,
  onDeleted,
}: {
  dialogs: DialogState;
  all: readonly Project[];
  gate: Gate;
  nav: ProjectNav;
  onDeleted: (ids: string[]) => void;
}) {
  /**
   * Project vừa tạo xong nhưng CHƯA có file con. Giữ ở đây (không ở trong dialog tạo)
   * vì dialog đó đã đóng — và vì việc tạo file phải sống sót qua việc đóng dialog.
   * `null` = không có việc gì đang treo.
   */
  const [pending, setPending] = React.useState<PendingFirstDoc | null>(null);

  /** Rời khỏi trạng thái treo và đi tới đích an toàn theo đúng luật §4.1-4. */
  const leave = React.useCallback(
    (p: PendingFirstDoc) => {
      setPending(null);
      if (p.template === "blank") nav.openDesign(p.projectId, "sheets");
      else nav.open(p.projectId);
    },
    [nav],
  );

  return (
    <>
      <CreateModeDialog
        open={dialogs.isOpen("create")}
        onOpenChange={dialogs.setOpen("create")}
        gate={gate}
        onCreated={(project, mode) => {
          // Dự án mới luôn bắt đầu bằng wizard. Canvas chưa phát hành.
          if (mode === "workflow") nav.openWizard(project.id);
        }}
      />

      <RenameProjectDialog
        project={dialogs.target}
        open={dialogs.isOpen("rename")}
        onOpenChange={dialogs.setOpen("rename")}
        existing={all}
      />

      <DuplicateProjectDialog
        project={dialogs.target}
        open={dialogs.isOpen("duplicate")}
        onOpenChange={dialogs.setOpen("duplicate")}
        existing={all}
        gate={gate}
        onDone={(created) => nav.open(created.id)}
        onBackToOld={(old) => nav.open(old.id)}
      />

      <DeleteProjectDialog
        projects={dialogs.targets}
        open={dialogs.isOpen("delete")}
        onOpenChange={dialogs.setOpen("delete")}
        onDeleted={onDeleted}
        onOpenTrash={() => nav.openTrash()}
      />

      <CleanProjectDialog
        project={dialogs.target}
        open={dialogs.isOpen("clean")}
        onOpenChange={dialogs.setOpen("clean")}
        gate={gate}
      />

      <ExportProjectDialog
        projects={dialogs.targets}
        open={dialogs.isOpen("export")}
        onOpenChange={dialogs.setOpen("export")}
        gate={gate}
      />

      <ImportWizard
        open={dialogs.isOpen("import")}
        onOpenChange={dialogs.setOpen("import")}
        gate={gate}
        {...(dialogs.importPreset ? { preset: dialogs.importPreset } : {})}
        onImported={(project) => nav.open(project.id)}
      />

      {pending && (
        <FirstDocGate
          projectId={pending.projectId}
          projectName={pending.projectName}
          intent={pending.intent}
          onOpenDoc={(docId, docName, withoutSheets) => {
            const p = pending;
            setPending(null);
            const copy = firstDocCopy(p.intent, p.projectName);
            /* `openFile` trả `false` khi route `/p/:id/f/:fileId` CHƯA tồn tại (nav.ts,
               NEEDS-fe2-b B1-1 — chủ: E1). Khi đó ta đã ở màn project và phải NÓI THẬT
               rằng file có thật nhưng chưa mở thẳng được, thay vì im lặng. */
            const opened = nav.openFile(p.projectId, docId);
            if (opened) {
              toastSuccess(copy.successTitle, withoutSheets ? FIRST_DOC_NO_SHEETS_NOTE : copy.successBody);
            } else {
              toastInfo(
                `Đã tạo file «${docName}» — chưa mở thẳng được`,
                "Màn hình dành cho file con chưa có trong bản này. Bạn đang ở màn project; file vẫn nằm trong danh sách file của project.",
              );
            }
          }}
          onSkip={() => leave(pending)}
        />
      )}

      <BrokenProjectDialog
        project={dialogs.target}
        open={dialogs.isOpen("broken")}
        onOpenChange={dialogs.setOpen("broken")}
        gate={gate}
      />
    </>
  );
}
