import { Search, X, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BackdropPicker } from "./BackdropPicker";
import type { Backdrop } from "../lib/backdrop";
import type { AssetFilter } from "../lib/kit-model";

/**
 * Thanh công cụ tab Assets: số liệu · nền xem thử · zoom · tìm · lọc theo sheet.
 *
 * Ô tìm dùng `oninput` (gõ là lọc ngay) — đóng C6 của audit ("phải bấm Enter mới
 * lọc"). Lọc chạy trên mảng đã có trong RAM nên không có request nào phát ra.
 */
const ALL_SHEETS = "__all__";

export interface AssetsToolbarProps {
  totalLabel: string;
  backdrop: Backdrop;
  onBackdropChange: (b: Backdrop) => void;
  zoom: number;
  onZoomChange: (z: number) => void;
  zoomMin: number;
  zoomMax: number;
  filter: AssetFilter;
  onFilterChange: (f: AssetFilter) => void;
  sheetIds: readonly string[];
  problemCount: number;
}

export function AssetsToolbar(p: AssetsToolbarProps) {
  const set = (patch: Partial<AssetFilter>) => p.onFilterChange({ ...p.filter, ...patch });
  const dirty = p.filter.query !== "" || p.filter.sheet !== "" || p.filter.onlyProblems;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-caption text-fg" aria-live="polite">
          {p.totalLabel}
        </p>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <BackdropPicker value={p.backdrop} onChange={p.onBackdropChange} />
          <div className="flex items-center gap-1">
            <span className="text-caption text-fg-muted-raised">Cỡ ô</span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Thu nhỏ ô xem"
                  disabled={p.zoom <= p.zoomMin}
                  onClick={() => p.onZoomChange(p.zoom - 1)}
                >
                  <ZoomOut aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Thu nhỏ (phím -)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Phóng to ô xem"
                  disabled={p.zoom >= p.zoomMax}
                  onClick={() => p.onZoomChange(p.zoom + 1)}
                >
                  <ZoomIn aria-hidden />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Phóng to (phím +)</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex min-w-[200px] flex-1 flex-col gap-1">
          <Label htmlFor="kit-search">Tìm theo tên file</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-fg-muted" aria-hidden />
            <Input
              id="kit-search"
              value={p.filter.query}
              placeholder="01-btn…"
              className="pl-8"
              onChange={(e) => set({ query: e.target.value })}
            />
          </div>
        </div>

        <div className="flex w-[200px] flex-col gap-1">
          <Label htmlFor="kit-sheet">Sheet</Label>
          <Select
            value={p.filter.sheet === "" ? ALL_SHEETS : p.filter.sheet}
            onValueChange={(v) => set({ sheet: v === ALL_SHEETS ? "" : v })}
          >
            <SelectTrigger id="kit-sheet">
              <SelectValue placeholder="Tất cả sheet" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SHEETS}>Tất cả sheet</SelectItem>
              {p.sheetIds.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {p.problemCount > 0 && (
          <div className="flex items-center gap-2 pb-1.5">
            <Switch
              id="kit-problems"
              checked={p.filter.onlyProblems}
              onCheckedChange={(v) => set({ onlyProblems: v })}
            />
            <Label htmlFor="kit-problems" className="cursor-pointer">
              Chỉ hiện {p.problemCount} file cần xem lại
            </Label>
          </div>
        )}

        {dirty && (
          <Button
            variant="ghost"
            size="sm"
            className="mb-0.5"
            onClick={() => p.onFilterChange({ query: "", sheet: "", onlyProblems: false })}
          >
            <X aria-hidden />
            Xoá bộ lọc
          </Button>
        )}
      </div>
    </div>
  );
}
