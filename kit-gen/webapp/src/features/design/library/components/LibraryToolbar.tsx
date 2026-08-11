import * as React from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LIB_SOURCES, type LibSourceId } from "../lib/types";
import type { GroupOption } from "../lib/source";

/**
 * Thanh công cụ của drawer: chọn NGUỒN thư viện · tìm kiếm · lọc nhóm.
 *
 * Ô tìm kiếm là `<input type="search">` có `<Label>` thật (không dùng placeholder
 * thay nhãn — §5.8-A5). Bộ lọc nhóm là `<Select>` của R0, kèm số lượng từng nhóm
 * để user biết bấm vào có gì trước khi bấm.
 */

export interface LibraryToolbarProps {
  source: LibSourceId;
  onSourceChange: (s: LibSourceId) => void;
  sourceAvailable: Record<LibSourceId, boolean>;
  query: string;
  onQueryChange: (q: string) => void;
  group: string;
  onGroupChange: (g: string) => void;
  groups: readonly GroupOption[];
  total: number;
  searchInputRef?: React.Ref<HTMLInputElement>;
}

export function LibraryToolbar({
  source, onSourceChange, sourceAvailable, query, onQueryChange, group, onGroupChange, groups, total, searchInputRef,
}: LibraryToolbarProps): React.ReactElement {
  const searchId = React.useId();
  const groupId = React.useId();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label className="text-caption uppercase tracking-label text-fg-muted-raised">Nguồn thư viện</Label>
        <ToggleGroup
          type="single"
          value={source}
          onValueChange={(v) => {
            if (v === "agent" || v === "v2") onSourceChange(v);
          }}
          className="w-fit"
        >
          {(Object.keys(LIB_SOURCES) as LibSourceId[]).map((id) => {
            const meta = LIB_SOURCES[id];
            const disabled = !sourceAvailable[id];
            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value={id} size="sm" disabled={disabled} aria-label={`${meta.label}: ${meta.hint}`}>
                    {meta.label}
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  {meta.hint}
                  {disabled && <p className="mt-1 text-fg-muted-raised">Chưa nạp được nguồn này.</p>}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </ToggleGroup>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Label htmlFor={searchId}>Tìm element</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-muted-raised" aria-hidden />
            <Input
              id={searchId}
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="tên file, nhãn tiếng Việt, mô tả…"
              className="px-9"
              autoComplete="off"
            />
            {query !== "" && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onQueryChange("")}
                className="absolute right-1 top-1/2 -translate-y-1/2"
                aria-label="Xoá từ khoá tìm kiếm"
              >
                <X className="size-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex w-full flex-col gap-1.5 sm:w-52">
          <Label htmlFor={groupId}>Nhóm</Label>
          <Select value={group} onValueChange={onGroupChange}>
            <SelectTrigger id={groupId}>
              <SelectValue placeholder="Tất cả nhóm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả nhóm ({total})</SelectItem>
              {groups.map((g) => (
                <SelectItem key={g.key} value={g.key}>
                  {g.label} ({g.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}
