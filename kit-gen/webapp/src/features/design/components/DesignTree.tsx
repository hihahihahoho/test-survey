import * as React from "react";
import {
  ChevronRight, LayoutGrid, Plus, MoreHorizontal, Users, Palette, AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { JobStatusBadge } from "@/components/common";
import { useUiStore } from "@/lib/store";
import type { JobStatus } from "@/lib/status";
import { cn } from "@/lib/utils";
import { contractVariants, type Contract } from "@/lib/types/contract";
import { cellCount, jobCountOfSheet, realCount } from "../lib/ops";
import { countForSheet, type ValidationResult } from "../lib/validate";
import type { Selection } from "@/lib/store";

/**
 * VÙNG ① — CÂY THIẾT KẾ (§3-S3.2): 3 nhóm gập được Sheet · Nhân vật · Phong cách.
 *
 * Trạng thái gập lưu ở `kitgen.ui.v1.collapsedSections` (store của R0) ⇒ F5 không mất.
 * Menu ⋯ mở được bằng bàn phím: Enter/Space/↓ trên trigger (3 phím Radix thật sự xử lý).
 * `Shift+F10` KHÔNG được Radix bắt — nó là phím của hệ điều hành, xem ProjectMenu.tsx.
 *
 * Badge mỗi sheet = trạng thái XẤU NHẤT trong các phong cách (§3.2), lấy từ
 * `project.state.jobs` — màn truyền xuống, cây không tự gọi API.
 */
export interface DesignTreeProps {
  contract: Contract;
  validation: ValidationResult;
  selection: Selection;
  activeSheetId: string | null;
  /** trạng thái tổng hợp mỗi sheet, đã gộp theo §5.7 ở tầng màn. */
  sheetStatus: Record<string, JobStatus>;
  readOnly: boolean;
  readOnlyReason: string;
  onSelect: (s: Selection) => void;
  onAddSheet: (kind: "blank" | "library" | "bg" | "pose") => void;
  onSheetMenu: (sheetId: string, action: SheetMenuAction) => void;
  onMoveSheet: (sheetId: string, delta: number) => void;
  onAddCharacter: () => void;
  onGoStyles: () => void;
}

export type SheetMenuAction = "rename" | "duplicate" | "resize" | "variants" | "delete";

const SECTIONS = { sheets: "s3.sheets", characters: "s3.characters", variants: "s3.variants" } as const;

export function DesignTree(props: DesignTreeProps) {
  const { contract, validation, selection, activeSheetId, sheetStatus, readOnly, readOnlyReason } = props;
  const collapsed = useUiStore((s) => s.collapsedSections);
  const toggleSection = useUiStore((s) => s.toggleSection);
  const variants = contractVariants(contract);
  const characters = variants.flatMap((v) => (v.characters ?? []).map((c) => ({ ...c, variantId: v.id })));

  const dis = readOnly ? { disabled: true, "aria-disabled": true, title: readOnlyReason } : {};

  return (
    <ScrollArea className="h-full">
      <div className="flex flex-col gap-1 p-2">
        {/* ── Nhóm SHEET ── */}
        <Section
          id={SECTIONS.sheets}
          label="Sheet"
          count={contract.sheets.length}
          collapsed={collapsed.includes(SECTIONS.sheets)}
          onToggle={() => toggleSection(SECTIONS.sheets)}
        >
          <ul className="flex flex-col" role="list">
            {contract.sheets.map((sh, i) => {
              const counts = countForSheet(validation, sh.id);
              const active = activeSheetId === sh.id;
              const selected = selection.kind === "sheet" && selection.sheetId === sh.id;
              return (
                <li key={`${sh.id}-${i}`} className="group/row flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => props.onSelect({ kind: "sheet", sheetId: sh.id })}
                    onKeyDown={(e) => {
                      // ⌥↑/⌥↓ đổi thứ tự sheet (§3-S3.2) — bàn phím làm được mọi thứ.
                      if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
                        e.preventDefault();
                        if (!readOnly) props.onMoveSheet(sh.id, e.key === "ArrowUp" ? -1 : 1);
                      }
                    }}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex h-row min-w-0 flex-1 items-center gap-2 rounded-2 px-2 text-left text-body",
                      "transition-colors duration-fast hover:bg-raised",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                      (active || selected) && "bg-overlay text-fg-strong",
                    )}
                  >
                    <LayoutGrid className={cn("size-3.5 shrink-0", active ? "text-accent-text" : "text-fg-muted")} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{sh.id}</span>
                    <span className="shrink-0 font-mono text-caption text-fg-muted-raised">
                      {realCount(sh)}/{cellCount(sh)}
                    </span>
                    {counts.errors > 0 && (
                      <span className="inline-flex shrink-0 items-center gap-0.5 text-caption text-danger">
                        <AlertCircle className="size-3" aria-hidden />
                        <span className="sr-only">{counts.errors} lỗi</span>
                        {counts.errors}
                      </span>
                    )}
                    <JobStatusBadge status={sheetStatus[sh.id] ?? "never"} compact />
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Thao tác với sheet ${sh.id}`}
                        className="shrink-0 opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"
                      >
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem {...dis} onSelect={() => props.onSheetMenu(sh.id, "rename")}>Đổi mã sheet…</DropdownMenuItem>
                      <DropdownMenuItem {...dis} onSelect={() => props.onSheetMenu(sh.id, "duplicate")}>Nhân bản sheet</DropdownMenuItem>
                      <DropdownMenuItem {...dis} onSelect={() => props.onSheetMenu(sh.id, "resize")}>Đổi lưới…</DropdownMenuItem>
                      <DropdownMenuItem {...dis} onSelect={() => props.onSheetMenu(sh.id, "variants")}>Chỉ áp cho phong cách…</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem {...dis} onSelect={() => props.onMoveSheet(sh.id, -1)}>Chuyển lên (⌥↑)</DropdownMenuItem>
                      <DropdownMenuItem {...dis} onSelect={() => props.onMoveSheet(sh.id, 1)}>Chuyển xuống (⌥↓)</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem {...dis} destructive onSelect={() => props.onSheetMenu(sh.id, "delete")}>
                        Xoá sheet…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="mt-1 w-full justify-start gap-2" {...dis}>
                <Plus className="size-3.5" aria-hidden />
                Thêm sheet
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => props.onAddSheet("blank")}>Sheet trống (chọn lưới)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => props.onAddSheet("library")}>Từ thư viện element…</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => props.onAddSheet("bg")}>Sheet nền full-bleed (1×1)</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => props.onAddSheet("pose")}>Sheet dáng nhân vật…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </Section>

        {/* ── Nhóm NHÂN VẬT ── */}
        <Section
          id={SECTIONS.characters}
          label="Nhân vật"
          count={characters.length}
          collapsed={collapsed.includes(SECTIONS.characters)}
          onToggle={() => toggleSection(SECTIONS.characters)}
        >
          {characters.length === 0 ? (
            <p className="px-2 py-1 text-caption text-fg-muted-raised">
              Chưa có nhân vật. Nhân vật và bộ dáng chỉ áp dụng cho project này.
            </p>
          ) : (
            <ul className="flex flex-col" role="list">
              {characters.map((ch) => (
                <li key={`${ch.variantId}-${ch.id}`}>
                  <button
                    type="button"
                    onClick={() => props.onSelect({ kind: "character", characterId: ch.id })}
                    className={cn(
                      "flex h-row w-full items-center gap-2 rounded-2 px-2 text-left text-body hover:bg-raised",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                      selection.kind === "character" && selection.characterId === ch.id && "bg-overlay text-fg-strong",
                    )}
                  >
                    <Users className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{ch.vi || ch.id}</span>
                    <span className="shrink-0 text-caption text-fg-muted-raised">{(ch.poses ?? []).length} dáng</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start gap-2" {...dis} onClick={props.onAddCharacter}>
            <Plus className="size-3.5" aria-hidden />
            Thêm nhân vật
          </Button>
        </Section>

        {/* ── Nhóm PHONG CÁCH ── */}
        <Section
          id={SECTIONS.variants}
          label="Phong cách"
          count={variants.length}
          collapsed={collapsed.includes(SECTIONS.variants)}
          onToggle={() => toggleSection(SECTIONS.variants)}
        >
          <ul className="flex flex-col" role="list">
            {variants.map((v) => {
              const color = typeof v.brand?.primary === "string" && /^#[0-9a-f]{3,8}$/i.test(v.brand.primary) ? v.brand.primary : null;
              return (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => {
                      props.onSelect({ kind: "variant", variantId: v.id });
                      props.onGoStyles();
                    }}
                    className={cn(
                      "flex h-row w-full items-center gap-2 rounded-2 px-2 text-left text-body hover:bg-raised",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                      selection.kind === "variant" && selection.variantId === v.id && "bg-overlay text-fg-strong",
                    )}
                  >
                    {color ? (
                      <span
                        className="size-3 shrink-0 rounded-full border border-line"
                        style={{ background: color }}
                        aria-hidden
                      />
                    ) : (
                      <Palette className="size-3.5 shrink-0 text-fg-muted" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 truncate">{v.vi || v.id}</span>
                    <span className="shrink-0 text-caption text-fg-muted-raised">
                      {contract.sheets.filter((sh) => jobCountOfSheet(contract, sh) > 0).length > 0
                        ? `${contract.sheets.filter((sh) => {
                            const only = sh.variants ?? sh.styles ?? [];
                            return only.length === 0 || only.includes(v.id);
                          }).length} lượt`
                        : "0 lượt"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <Button variant="ghost" size="sm" className="mt-1 w-full justify-start gap-2" onClick={props.onGoStyles}>
            <Palette className="size-3.5" aria-hidden />
            Mở tab Phong cách
          </Button>
        </Section>
      </div>
    </ScrollArea>
  );
}

function Section({
  id, label, count, collapsed, onToggle, children,
}: {
  id: string;
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const bodyId = `${id}-body`;
  return (
    <section className="flex flex-col">
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          className={cn(
            "flex h-ctl-sm w-full items-center gap-1 rounded-2 px-2 text-label uppercase tracking-label text-fg-muted-raised",
            "hover:text-fg-strong",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          )}
        >
          <ChevronRight className={cn("size-3 transition-transform duration-fast", !collapsed && "rotate-90")} aria-hidden />
          {label}
          <Badge tone="never" className="ml-1">{count}</Badge>
        </button>
      </h2>
      <div id={bodyId} hidden={collapsed} className="pb-2">
        {children}
      </div>
    </section>
  );
}
