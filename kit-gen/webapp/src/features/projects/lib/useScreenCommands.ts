/**
 * features/projects/lib/useScreenCommands.ts — KHAI LỆNH CỦA S1 VÀO ⌘K.
 *
 * §2.3: "Mọi hành động trong spec này phải gọi được từ bảng lệnh". Registry là
 * `useRegisterCommands` của R1-P1: đăng ký khi mount, tự gỡ khi unmount.
 *
 * LUẬT §2.5-2 áp cả ở đây: lệnh không dùng được thì đặt `disabledReason` —
 * **KHÔNG bỏ khỏi danh sách**. Ẩn lệnh làm user tưởng tính năng biến mất, và
 * họ sẽ đi tìm nó ở chỗ khác.
 */
import { Copy, FolderPlus, LayoutGrid, List, RefreshCw, Trash2, Upload } from "lucide-react";
import { useRegisterCommands } from "@/components/layout";
import type { ProjectsView } from "@/lib/store";
import type { Project } from "@/lib/types";
import type { Gate } from "./gate";
import type { DialogState } from "./useProjectDialogs";

export function useProjectsCommands({
  gate,
  view,
  setView,
  selected,
  dialogs,
  onRefresh,
  onOpenTrash,
}: {
  gate: Gate;
  view: ProjectsView;
  setView: (v: ProjectsView) => void;
  selected: readonly Project[];
  dialogs: DialogState;
  onRefresh: () => void;
  onOpenTrash: () => void;
}): void {
  const noSelection = selected.length === 0 ? "Chọn ít nhất một dự án trong danh sách" : null;

  useRegisterCommands(
    () => [
      {
        id: "s1.create",
        label: "Tạo bộ kit mới",
        icon: FolderPlus,
        hint: ["N"],
        keywords: "new project tao moi them",
        disabledReason: gate.readOnly ? gate.reason : null,
        run: () => dialogs.openDialog("create"),
      },
      {
        id: "s1.import",
        label: "Nhập bộ kit từ tệp",
        icon: Upload,
        keywords: "import zip styles json nhap migrate",
        disabledReason: gate.readOnly ? gate.reason : null,
        run: () => dialogs.openImport(),
      },
      {
        id: "s1.refresh",
        label: "Làm mới danh sách bộ kit",
        icon: RefreshCw,
        keywords: "reload refresh lam moi quet lai",
        run: onRefresh,
      },
      {
        id: "s1.toggle-view",
        label: view === "grid" ? "Xem dạng danh sách" : "Xem dạng lưới",
        icon: view === "grid" ? List : LayoutGrid,
        hint: ["V"],
        keywords: "grid list view hien thi luoi bang",
        run: () => setView(view === "grid" ? "list" : "grid"),
      },
      {
        id: "s1.export-selected",
        label:
          selected.length > 0 ? `Xuất .zip ${selected.length} dự án đã chọn` : "Xuất .zip dự án đã chọn",
        icon: Copy,
        keywords: "export zip xuat tai ve",
        disabledReason: gate.readOnly ? gate.reason : noSelection,
        run: () => dialogs.openForMany("export", [...selected]),
      },
      {
        id: "s1.delete-selected",
        label: selected.length > 0 ? `Xoá ${selected.length} dự án đã chọn` : "Xoá dự án đã chọn",
        icon: Trash2,
        keywords: "delete remove xoa thung rac",
        disabledReason: gate.readOnly ? gate.reason : noSelection,
        run: () => dialogs.openForMany("delete", [...selected]),
      },
      {
        id: "s1.trash",
        label: "Mở thùng rác",
        icon: Trash2,
        keywords: "trash thung rac restore phuc hoi khoi phuc",
        run: onOpenTrash,
      },
    ],
    [gate.readOnly, gate.reason, view, selected, dialogs, onRefresh, onOpenTrash, setView, noSelection],
  );
}
