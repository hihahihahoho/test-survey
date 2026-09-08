import { CreateModeDialog } from "./dialogs/CreateModeDialog";
import { RenameProjectDialog } from "./dialogs/RenameProjectDialog";
import { DuplicateProjectDialog } from "./dialogs/DuplicateProjectDialog";
import { DeleteProjectDialog } from "./dialogs/DeleteProjectDialog";
import { CleanProjectDialog } from "./dialogs/CleanProjectDialog";
import { BrokenProjectDialog } from "./dialogs/BrokenProjectDialog";
import type { Project } from "@/lib/types";
import type { Gate } from "./lib/gate";
import type { ProjectNav } from "./lib/nav";
import type { DialogState } from "./lib/useProjectDialogs";

/**
 * Gom 6 overlay của trang chủ vào một chỗ để `ProjectsScreen.tsx` không phồng lên.
 * Mỗi dialog tự lo state của nó; ở đây chỉ nối dây `open`/`onOpenChange` và xử lý
 * điều hướng SAU khi thao tác xong (§4.1-4, §4.3).
 *
 * ══ 08/09/2026 — BA OVERLAY ĐÃ RỜI KHỎI ĐÂY ═══════════════════════════════
 *  · `ExportProjectDialog` + `ImportWizard` — đường nhập/xuất dự án dạng .zip bị bỏ.
 *    Dự án là một THƯ MỤC trên đĩa; đóng gói nó thành zip rồi mở lại là một bản sao
 *    thứ hai của cùng dữ liệu, và bản sao ấy lệch ngay lần sinh ảnh kế tiếp.
 *  · `FirstDocGate` — cửa "tạo file con đầu tiên" của tầng file-trong-dự-án
 *    (`features/docs`, đã xoá). Khối `pending` quanh nó vốn đã là mã chết trước đợt
 *    này: `CreateModeDialog.onCreated` không bao giờ đặt `pending`, nên cửa ấy chưa
 *    từng mở trong bản đang chạy.
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
  return (
    <>
      <CreateModeDialog
        open={dialogs.isOpen("create")}
        onOpenChange={dialogs.setOpen("create")}
        gate={gate}
        onCreated={(project, mode) => {
          // Dự án mới luôn bắt đầu bằng khu soạn prompt.
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

      <BrokenProjectDialog
        project={dialogs.target}
        open={dialogs.isOpen("broken")}
        onOpenChange={dialogs.setOpen("broken")}
        gate={gate}
      />
    </>
  );
}
