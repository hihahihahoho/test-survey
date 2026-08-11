import * as React from "react";
import { ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { KIND_ICON } from "./doc-visuals";
import type { TabItem } from "../../lib/subfile-model";

/**
 * Menu `»` cho tab bị thu gọn khi >8 tab (§4.3).
 *
 * Nút mang SỐ (`» 3`) chứ không phải chỉ mũi tên: người dùng phải biết còn bao
 * nhiêu file bị giấu mà không cần mở ra. `aria-label` nói đầy đủ bằng chữ.
 * Bất biến do `splitTabs` bảo đảm: tab ĐANG MỞ không bao giờ nằm trong menu này.
 *
 * C3 — **file thu gọn vẫn phải sửa/xoá được.** Trước đây mục trong menu `»` chỉ có
 * một hành động là "mở". Với 11 file thì 3 file cuối không có đường nào tới đổi tên/
 * nhân bản/xoá trừ khi mở chúng ra trước; đó là chức năng biến mất theo bề rộng màn
 * hình. Giờ mục nhận cả chuột phải và chuyển tiếp lên `onContextMenu` như tab thật.
 */
export interface TabOverflowMenuProps {
  items: TabItem[];
  onActivate: (id: string) => void;
  /** chuột phải trên một mục thu gọn ⇒ mở đúng menu ngữ cảnh của file đó (C3). */
  onContextMenu?: (id: string, e: React.MouseEvent | React.KeyboardEvent) => void;
}

export function TabOverflowMenu({ items, onActivate, onContextMenu }: TabOverflowMenuProps) {
  if (items.length === 0) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 shrink-0 gap-1 rounded-t-2 px-2 text-caption"
          aria-label={`Còn ${items.length} file nữa đang thu gọn`}
        >
          <ChevronsRight className="size-4" aria-hidden strokeWidth={1.5} />
          {items.length}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        {items.map((t) => {
          const Icon = KIND_ICON[t.kind];
          return (
            <DropdownMenuItem
              key={t.id}
              onSelect={() => onActivate(t.id)}
              onContextMenu={(e) => {
                if (!onContextMenu) return;
                e.preventDefault();
                onContextMenu(t.id, e);
              }}
              className="gap-2"
            >
              <Icon className={cn("size-3.5 shrink-0 opacity-80")} aria-hidden strokeWidth={1.5} />
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              {t.dirty && <span className="shrink-0 text-caption text-fg-muted-raised">chưa lưu</span>}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
