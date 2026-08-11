import * as React from "react";
import { ArrowDownUp, LayoutGrid, List, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FilterChip, ProjectsView, SortBy } from "@/lib/store";
import { CHIPS, SORTS, type ChipCounts } from "../lib/view";

/**
 * TOOLBAR của S1 (§3-S1-1). Toàn bộ lựa chọn lưu ở `kitgen.ui.v1` (store của R0)
 * ⇒ F5 không mất, đúng yêu cầu "nhớ lựa chọn" của brief.
 *
 * Chi tiết đúng spec, dễ bị làm sai:
 *  · ô tìm debounce 120ms — nhưng debounce ở TẦNG CHA (ProjectsScreen), ở đây ô
 *    là controlled thuần để gõ không bị giật.
 *  · chip filter LUÔN kèm SỐ ĐẾM thật. Chip có 0 kết quả vẫn hiện (trừ "Đang chạy")
 *    để user không tưởng bộ lọc biến mất.
 *  · chip tag bấm bỏ được, và chỉ liệt kê tag CÓ THẬT trong danh sách.
 *  · `/` focus ô tìm — gắn ở ProjectsScreen, ở đây chỉ nhận `searchRef`.
 *
 * A11y: chip là `<button>` có `aria-pressed`; nhóm grid/list là `radiogroup` của
 * Radix ToggleGroup (mũi tên di chuyển, 1 tabstop).
 */
export function ProjectsToolbar({
  query,
  onQueryChange,
  chip,
  onChipChange,
  counts,
  tags,
  activeTags,
  onToggleTag,
  sortBy,
  onSortChange,
  view,
  onViewChange,
  onClearFilters,
  searchRef,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  chip: FilterChip;
  onChipChange: (c: FilterChip) => void;
  counts: ChipCounts;
  tags: readonly [string, number][];
  activeTags: readonly string[];
  onToggleTag: (t: string) => void;
  sortBy: SortBy;
  onSortChange: (s: SortBy) => void;
  view: ProjectsView;
  onViewChange: (v: ProjectsView) => void;
  onClearFilters: () => void;
  searchRef: React.RefObject<HTMLInputElement>;
}) {
  const hasFilter = query !== "" || chip !== "all" || activeTags.length > 0;

  return (
    <div className="sticky top-[4.5rem] z-floatbar flex flex-col gap-3 rounded-4 border border-line-subtle bg-overlay/90 p-3 shadow-3 backdrop-blur-xl">
      <div className="flex flex-wrap items-center gap-2">
        {/* Ô tìm */}
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted-raised" aria-hidden />
          <Input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Tìm theo tên, tag hoặc thư mục…"
            aria-label="Tìm project"
            className="rounded-full bg-canvas pl-9"
          />
        </div>

        {/* Sắp xếp */}
        <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortBy)}>
          <SelectTrigger className="w-[168px] rounded-full bg-canvas" aria-label="Sắp xếp danh sách">
            <ArrowDownUp className="size-3.5 text-fg-muted-raised" aria-hidden />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* grid / list — nhớ lựa chọn qua kitgen.ui.v1 */}
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && onViewChange(v as ProjectsView)}
          aria-label="Kiểu hiển thị"
        >
          <ToggleGroupItem value="grid" size="sm" aria-label="Xem dạng lưới">
            <LayoutGrid aria-hidden />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" size="sm" aria-label="Xem dạng danh sách">
            <List aria-hidden />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {/* Chip trạng thái — LUÔN có số đếm thật */}
        <ul className="flex flex-wrap items-center gap-1.5">
          {CHIPS.map((c) => {
            // "Đang chạy" là trạng thái nhất thời: không có lượt nào chạy thì chip
            // này chỉ làm nhiễu. Các chip còn lại giữ nguyên kể cả khi bằng 0.
            if (c.id === "running" && counts.running === 0 && chip !== "running") return null;
            const on = chip === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onChipChange(c.id)}
                  className={cn(
                    "inline-flex h-ctl-sm items-center gap-1.5 rounded-full border px-3 text-label transition-colors duration-fast",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                    on
                      ? "border-accent bg-overlay text-fg-strong"
                      : "border-line-subtle bg-surface text-fg hover:bg-raised hover:text-fg-strong",
                  )}
                >
                  {c.label}
                  <span className={cn("font-mono text-caption", on ? "text-accent-text" : "text-fg-muted-raised")}>
                    {counts[c.id]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        {/* Chip tag — chỉ tag CÓ THẬT, bấm bỏ được */}
        {tags.length > 0 && (
          <ul className="flex flex-wrap items-center gap-1.5">
            {tags.slice(0, 10).map(([tag, n]) => {
              const on = activeTags.includes(tag);
              return (
                <li key={tag}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => onToggleTag(tag)}
                    className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    title={on ? `Bỏ lọc tag ${tag}` : `Lọc theo tag ${tag} (${n} project)`}
                  >
                    <Badge tone={on ? "accent" : "outline"}>
                      <span>{tag}</span>
                      {on ? <X aria-hidden /> : <span className="font-mono text-fg-muted">{n}</span>}
                    </Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {hasFilter && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" onClick={onClearFilters} className="ml-auto">
                <X aria-hidden />
                Xoá bộ lọc
              </Button>
            </TooltipTrigger>
            <TooltipContent>Về lại toàn bộ danh sách</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
