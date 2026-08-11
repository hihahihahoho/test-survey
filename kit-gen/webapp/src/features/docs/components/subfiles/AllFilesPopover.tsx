import * as React from "react";
import { List, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { KIND_ICON, KIND_LABEL, COLOR_DOT } from "./doc-visuals";
import { DOC_SORTS, DOC_SORT_LABEL, queryTabs, type DocSort, type TabItem } from "../../lib/subfile-model";

/**
 * «▤ Tất cả N» — popover danh sách file (§4.3). Cần vì tab tràn khi >6 file.
 *
 * A11Y (APG Listbox có ô lọc — cùng khuôn "combobox with listbox popup"):
 *  · Ô tìm giữ focus; danh sách là `role="listbox"`, mục là `role="option"`.
 *  · Điều hướng bằng `aria-activedescendant` — KHÔNG di chuyển focus DOM sang mục,
 *    nếu không người dùng gõ tiếp một chữ là mất chỗ trong danh sách.
 *  · ↑/↓ đổi mục, Home/End nhảy đầu/cuối, Enter mở, Esc đóng (Radix lo Esc).
 *
 * Đây là màn duy nhất chắc chắn thấy được MỌI file, nên nó cũng là đường lùi khi
 * thanh tab tràn hoặc khi người dùng lạc: không có file nào bị giấu ở đây.
 */
export interface AllFilesPopoverProps {
  tabs: TabItem[];
  activeId: string;
  onActivate: (id: string) => void;
  /** nút phụ ở chân popover (Thùng rác của C2…) — C1 không tự dựng. */
  footer?: React.ReactNode;
}

export function AllFilesPopover({ tabs, activeId, onActivate, footer }: AllFilesPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<DocSort>("recent");
  const [cursor, setCursor] = React.useState(0);
  const listId = React.useId();

  const items = React.useMemo(() => queryTabs(tabs, { q, sort }), [tabs, q, sort]);
  const count = tabs.length;

  React.useEffect(() => setCursor(0), [q, sort, open]);
  const clamped = Math.min(cursor, Math.max(0, items.length - 1));
  const activeOption = items[clamped];

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (items.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setCursor(0); }
    else if (e.key === "End") { e.preventDefault(); setCursor(items.length - 1); }
    else if (e.key === "Enter" && activeOption) {
      e.preventDefault();
      onActivate(activeOption.id);
      setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" aria-label={`Tất cả ${count} file trong dự án`}>
          <List className="size-4" aria-hidden strokeWidth={1.5} />
          Tất cả {count}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 border-b border-line-subtle px-3 py-2">
          <Search className="size-4 shrink-0 text-fg-muted-raised" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm file…"
            aria-label="Tìm file trong dự án"
            role="combobox"
            aria-expanded
            aria-controls={listId}
            aria-activedescendant={activeOption ? `${listId}-${activeOption.id}` : undefined}
            autoComplete="off"
            className="h-8 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <div className="flex items-center gap-1 border-b border-line-subtle px-2 py-1.5" role="group" aria-label="Sắp xếp danh sách file">
          {DOC_SORTS.map((s) => (
            <Button
              key={s}
              variant="ghost"
              size="sm"
              aria-pressed={sort === s}
              onClick={() => setSort(s)}
              className={cn("h-7 px-2 text-caption", sort === s && "bg-raised text-fg-strong")}
            >
              {DOC_SORT_LABEL[s]}
            </Button>
          ))}
        </div>

        <ScrollArea className="max-h-64">
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-caption text-fg-muted-raised">
              Không có file nào khớp “{q}”. Thử bớt chữ, hoặc tạo file mới.
            </p>
          ) : (
            <ul id={listId} role="listbox" aria-label="Danh sách file con" className="p-1">
              {items.map((t, i) => {
                const Icon = KIND_ICON[t.kind];
                return (
                  <li
                    key={t.id}
                    id={`${listId}-${t.id}`}
                    role="option"
                    aria-selected={t.id === activeId}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => { onActivate(t.id); setOpen(false); }}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-2 px-2 py-2 text-label text-fg",
                      i === clamped && "bg-raised text-fg-strong",
                      t.id === activeId && "text-fg-strong",
                    )}
                  >
                    <Icon className="size-3.5 shrink-0 opacity-80" aria-hidden strokeWidth={1.5} />
                    {t.color !== "none" && <span className={cn("size-1.5 shrink-0 rounded-full", COLOR_DOT[t.color])} aria-hidden />}
                    <span className="min-w-0 flex-1 truncate">{t.name}</span>
                    <span className="shrink-0 text-caption text-fg-muted-raised">
                      {t.virtual ? "hệ thống" : KIND_LABEL[t.kind]}
                      {t.dirty ? " · chưa lưu" : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        {footer && <div className="border-t border-line-subtle p-2">{footer}</div>}
      </PopoverContent>
    </Popover>
  );
}
