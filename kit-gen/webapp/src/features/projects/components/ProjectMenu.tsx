import {
  ArrowUpRight, Copy, Download, FolderOpen, MoreHorizontal, Pencil, Trash2, Eraser,
} from "lucide-react";
import { useRevealProject } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuShortcut, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Project } from "@/lib/types";
import type { Gate } from "../lib/gate";
import { toastError, toastSuccess } from "../lib/feedback";

/**
 * Menu `⋯` của thẻ project — ĐÚNG 8 MỤC, THỨ TỰ CỐ ĐỊNH (§3-S1-3).
 * Không thêm, không bớt, không đổi chỗ: user học vị trí bằng cơ bắp.
 *
 * §2.5-2 + §4.9: agent chưa chạy ⇒ mục gây thay đổi `disabled` + NÓI LÝ DO ngay
 * trong mục ("Cần công cụ local đang chạy"), KHÔNG ẩn mục. Đây chính là yêu cầu
 * 3 của brief: "không phải bấm rồi mới lỗi".
 *
 * §5.8-A6: trigger là `<button>` THẬT có `aria-label`, mở được bằng `Enter`/`Space`/`↓`
 * (đây là những phím Radix thật sự xử lý — đã đọc `react-dropdown-menu/dist/index.mjs`).
 * QA-LEAD: KHÔNG hứa `Shift+F10` nữa. Phím đó sinh sự kiện `contextmenu` của HỆ ĐIỀU HÀNH,
 * Radix không có handler nào cho nó (`grep F10` trong dist = 0), nên trình duyệt sẽ mở
 * menu ngữ cảnh của chính nó. Hứa sai còn tệ hơn không hứa.
 */
export interface ProjectActions {
  open: (p: Project) => void;
  rename: (p: Project) => void;
  duplicate: (p: Project) => void;
  exportZip: (p: Project) => void;
  clean: (p: Project) => void;
  remove: (p: Project) => void;
}

export function ProjectMenu({
  project,
  actions,
  gate,
  className,
}: {
  project: Project;
  actions: ProjectActions;
  gate: Gate;
  className?: string;
}) {
  const ro = gate.readOnly;
  const label = (text: string) => (ro ? `${text} — ${gate.reason}` : text);

  // #21 `POST /api/projects/:id/reveal`. Hook của R0 nhận id LÚC TẠO, nên nó phải
  // được gọi ở đây — nơi mỗi menu thuộc về đúng một project — chứ không ở màn cha
  // (ở đó id chỉ biết lúc bấm, và gọi `api` thẳng là phá §6.5-1).
  const reveal = useRevealProject(project.id);
  const doReveal = () =>
    reveal.mutate(undefined, {
      onSuccess: () => toastSuccess(`Đã mở thư mục của «${project.name}»`),
      // 501 NOT_SUPPORTED là ca THẬT (agent trên máy không mở được trình quản lý
      // file). Bảng §3.9 có copy cho nó — không tự viết câu khác.
      onError: (e) => toastError(e),
    });

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className={className}
              aria-label={`Thao tác khác cho ${project.name}`}
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>Thao tác khác (Enter hoặc ↓)</TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-60" onClick={(e) => e.stopPropagation()}>
        {/* 1 */}
        <DropdownMenuItem disabled={project.broken} onSelect={() => actions.open(project)}>
          <ArrowUpRight aria-hidden />
          Mở
          <DropdownMenuShortcut>↵</DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* 2 */}
        <DropdownMenuItem disabled={ro} onSelect={() => actions.rename(project)}>
          <Pencil aria-hidden />
          {label("Đổi tên…")}
          <DropdownMenuShortcut>F2</DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* 3 */}
        <DropdownMenuItem disabled={ro || project.broken} onSelect={() => actions.duplicate(project)}>
          <Copy aria-hidden />
          {label("Nhân bản…")}
          <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
        </DropdownMenuItem>
        {/* 4 */}
        <DropdownMenuItem disabled={ro || project.broken} onSelect={() => actions.exportZip(project)}>
          <Download aria-hidden />
          {label("Xuất .zip")}
        </DropdownMenuItem>
        {/* 5 */}
        <DropdownMenuItem disabled={ro} onSelect={doReveal}>
          <FolderOpen aria-hidden />
          {label("Mở thư mục trên máy")}
        </DropdownMenuItem>
        {/* 6 */}
        <DropdownMenuItem disabled={ro || project.broken} onSelect={() => actions.clean(project)}>
          <Eraser aria-hidden />
          {label("Dọn cache dẫn xuất…")}
        </DropdownMenuItem>
        {/* 7 = đường kẻ */}
        <DropdownMenuSeparator />
        {/* 8 */}
        <DropdownMenuItem destructive disabled={ro} onSelect={() => actions.remove(project)}>
          <Trash2 aria-hidden />
          {label("Xoá…")}
          <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
