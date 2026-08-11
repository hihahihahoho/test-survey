import {
  ArrowUpRight, Copy, Download, FolderOpen, MoreHorizontal, Pencil, Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuShortcut, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useRevealProject } from "@/lib/hooks";
import { BTN } from "@/features/kitfile";
import type { Project } from "@/lib/types";
import type { Gate } from "@/features/projects/lib/gate";
import { toastError, toastSuccess } from "@/features/projects/lib/feedback";

/**
 * MENU `⋯` CỦA THẺ BỘ KIT — 6 mục, thứ tự cố định theo UX-V3 §1.3:
 *   Mở · Đổi tên · Tạo bộ kit từ bộ này · Tải về máy (.zip) · Mở thư mục trên máy · ─ · Xoá
 *
 * ══ RANH GIỚI H1 / H2 — nói rõ để không ai tưởng đã xong ═════════════════════════
 * H1 dựng **khung menu + chữ đúng §1.3 + trạng thái khoá**. Ba thứ thuộc H2
 * (FE3-PLAN §3-H2) và ở lượt này chỉ được NỐI VÀO DIALOG SẴN CÓ của FE-1:
 *   · toast «Ảnh đã vẽ thì không chép.» của Tạo-bộ-kit-từ-bộ-này;
 *   · toast **Hoàn tác 10s** + ba ca nói thật của Xoá (C-01 / `RUN_ACTIVE` / `PROJECT_ID_TAKEN`);
 *   · ca `409 RUN_ACTIVE` khi tải .zip.
 * Nghĩa là: bấm vào MỞ ĐÚNG dialog, nhưng CHỮ BÊN TRONG dialog vẫn là chữ cũ của FE-1
 * cho tới khi H2 chạy. Tôi cố ý KHÔNG sửa các dialog đó ở lượt này — chúng nằm trong
 * glob H nhưng thuộc task H2, và sửa nửa vời sẽ để lại hai bản copy chồng nhau.
 *
 * §2.5-2 + §4.9: agent chưa chạy ⇒ mục gây thay đổi `disabled` + NÓI LÝ DO ngay trong
 * mục, KHÔNG ẩn mục (ẩn làm user tưởng mất tính năng).
 *
 * A11y: trigger là `<button>` THẬT có `aria-label`; Radix mở bằng Enter/Space/↓.
 * KHÔNG hứa `Shift+F10` (Radix không có handler cho nó — bài học FE-1).
 */
export interface KitActions {
  open: (p: Project) => void;
  rename: (p: Project) => void;
  duplicate: (p: Project) => void;
  exportZip: (p: Project) => void;
  remove: (p: Project) => void;
}

export function KitCardMenu({
  kit,
  actions,
  gate,
  className,
}: {
  /** Tên prop là `kit` chứ không phải `project`: ở IA mới user chỉ biết «bộ kit». */
  kit: Project;
  actions: KitActions;
  gate: Gate;
  className?: string;
}) {
  const ro = gate.readOnly;
  const label = (text: string) => (ro ? `${text} — ${gate.reason}` : text);

  // #21 `POST /api/projects/:id/reveal`. Hook của R0 nhận id LÚC TẠO ⇒ phải gọi ở đây,
  // nơi mỗi menu thuộc về đúng một bộ kit.
  const reveal = useRevealProject(kit.id);
  const doReveal = () =>
    reveal.mutate(undefined, {
      onSuccess: () => toastSuccess(`Đã mở thư mục của «${kit.name}»`),
      onError: (e) => toastError(e),
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className={className}
          aria-label={`Thao tác khác cho ${kit.name}`}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-64" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem disabled={kit.broken} onSelect={() => actions.open(kit)}>
          <ArrowUpRight aria-hidden />
          {BTN.OPEN}
          <DropdownMenuShortcut>↵</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuItem disabled={ro} onSelect={() => actions.rename(kit)}>
          <Pencil aria-hidden />
          {label(BTN.RENAME)}
          <DropdownMenuShortcut>F2</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuItem disabled={ro || kit.broken} onSelect={() => actions.duplicate(kit)}>
          <Copy aria-hidden />
          {label("Nhân bản dự án")}
          <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuItem disabled={ro || kit.broken} onSelect={() => actions.exportZip(kit)}>
          <Download aria-hidden />
          {label(BTN.DOWNLOAD_ZIP)}
        </DropdownMenuItem>

        <DropdownMenuItem disabled={ro} onSelect={doReveal}>
          <FolderOpen aria-hidden />
          {label(BTN.REVEAL)}
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem destructive disabled={ro} onSelect={() => actions.remove(kit)}>
          <Trash2 aria-hidden />
          {label(BTN.DELETE)}
          <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
