import { Copy, Link2, Palette, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { COLOR_DOT, COLOR_LABEL } from "./doc-visuals";
import { DOC_COLORS, type Doc, type DocColor } from "../../lib";
import { isEditableDoc } from "../../lib/subfile-actions";

/**
 * MENU NGỮ CẢNH của tab (§4.3): Đổi tên `F2` · Nhân bản `⌘D` · Sao chép liên kết ·
 * Đổi màu nhãn · Xoá `⌫`.
 *
 * VÌ SAO LÀ MENU "KHÔNG CÓ NÚT": chuột phải và `Shift+F10` đều xảy ra TRÊN TAB, không
 * trên một nút `⋯` nào. Nên trigger ở đây là một điểm neo 0×0 đặt đúng toạ độ chuột;
 * `FileTab` của C1 đã chuyển sự kiện lên qua `onContextMenu` và **không phải sửa**.
 *
 * `Shift+F10`: Radix KHÔNG bắt phím này (bài học đã ghi trong `ProjectMenu.tsx` của S1:
 * `grep F10` trong dist = 0). Nhưng trình duyệt sinh sự kiện `contextmenu` thật khi bấm
 * `Shift+F10`, và chính handler `onContextMenu` của `FileTab` nhận được nó ⇒ đường bàn
 * phím có thật, không phải lời hứa suông. Có test DOM bắn `contextmenu` để khoá điều này.
 *
 * MỤC BỊ KHOÁ CHỨ KHÔNG ẨN (§2.5-2): file hệ thống «Tất cả sheet» không đổi tên/xoá
 * được — mục vẫn hiện, `disabled`, và NÓI LÝ DO ngay trong mục.
 */
export interface TabContextMenuProps {
  doc: Doc | null;
  at: { x: number; y: number } | null;
  onClose: () => void;
  onRename: (docId: string) => void;
  onDuplicate: (docId: string) => void;
  onCopyLink: (docId: string) => void;
  onSetColor: (docId: string, color: DocColor) => void;
  onDelete: (docId: string) => void;
}

export function TabContextMenu(props: TabContextMenuProps) {
  const { doc, at, onClose, onRename, onDuplicate, onCopyLink, onSetColor, onDelete } = props;
  const open = Boolean(doc && at);
  const editable = doc ? isEditableDoc(doc.id) : false;
  const lockNote = " — file hệ thống, không sửa được";

  return (
    <DropdownMenu open={open} onOpenChange={(v) => !v && onClose()}>
      <DropdownMenuTrigger asChild>
        {/* Neo vô hình đặt đúng chỗ chuột phải. `aria-hidden` vì nó không phải nút thật:
            đường bàn phím đi qua Shift+F10 trên chính tab, không qua phần tử này. */}
        <span
          aria-hidden
          className="pointer-events-none fixed size-0"
          style={at ? { left: at.x, top: at.y } : undefined}
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuItem
          disabled={!editable}
          onSelect={() => doc && onRename(doc.id)}
        >
          <Pencil className="mr-2 size-4" aria-hidden strokeWidth={1.5} />
          {editable ? "Đổi tên" : `Đổi tên${lockNote}`}
          <DropdownMenuShortcut>F2</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuItem disabled={!editable} onSelect={() => doc && onDuplicate(doc.id)}>
          <Copy className="mr-2 size-4" aria-hidden strokeWidth={1.5} />
          {editable ? "Nhân bản" : `Nhân bản${lockNote}`}
          <DropdownMenuShortcut>⌘D</DropdownMenuShortcut>
        </DropdownMenuItem>

        <DropdownMenuItem onSelect={() => doc && onCopyLink(doc.id)}>
          <Link2 className="mr-2 size-4" aria-hidden strokeWidth={1.5} />
          Sao chép liên kết
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!editable}>
            <Palette className="mr-2 size-4" aria-hidden strokeWidth={1.5} />
            Đổi màu nhãn
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {DOC_COLORS.map((c) => (
              <DropdownMenuItem key={c} onSelect={() => doc && onSetColor(doc.id, c)}>
                <span
                  className={cn(
                    "mr-2 size-2 shrink-0 rounded-full",
                    c === "none" ? "border border-line" : COLOR_DOT[c],
                  )}
                  aria-hidden
                />
                {COLOR_LABEL[c]}
                {doc?.color === c ? " · đang dùng" : ""}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={!editable}
          onSelect={() => doc && onDelete(doc.id)}
          className="text-danger focus:text-danger"
        >
          <Trash2 className="mr-2 size-4" aria-hidden strokeWidth={1.5} />
          {editable ? "Xoá file" : `Xoá file${lockNote}`}
          <DropdownMenuShortcut>⌫</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
