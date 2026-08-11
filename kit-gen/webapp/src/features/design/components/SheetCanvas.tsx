import * as React from "react";
import { AlertTriangle, Grid3x3, Info, LibraryBig, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { EmptyState } from "@/components/common";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { contractVariants, sheetVariantFilter, type Component, type Contract, type Sheet } from "@/lib/types/contract";
import { cellCount, realCount } from "../lib/ops";
import type { ValidationResult } from "../lib/validate";
import { CellGrid } from "./CellGrid";
import { DOTGRID } from "@/components/layout/flora";
import { cn } from "@/lib/utils";

/**
 * VÙNG ② — KHUNG SHEET (§3-S3.3): header + lưới ô + dải cảnh báo tại chỗ.
 *
 * 3 lớp xem (Khung xương / Ảnh đã sinh / Đã cắt). Lớp nào chưa có dữ liệu thì hiện
 * empty state RIÊNG TRONG KHUNG, KHÔNG phá DOM cha (đóng audit D10) — cụ thể là ta
 * vẫn render lưới, chỉ từng ô hiện "chưa có ảnh"; nhờ vậy vị trí cuộn và ô đang chọn
 * không nhảy khi đổi lớp.
 *
 * Cảnh báo tại chỗ tối đa 2 dòng (§3.3) — nhiều hơn thì thành tường chữ, user bỏ qua hết.
 */
export interface SheetCanvasProps {
  contract: Contract;
  sheet: Sheet;
  validation: ValidationResult;
  selectedIndex: number | null;
  layer: "skeleton" | "raw" | "kit";
  onLayerChange: (l: "skeleton" | "raw" | "kit") => void;
  previewVariantId: string | null;
  onPreviewVariantChange: (id: string) => void;
  readOnly: boolean;
  readOnlyReason: string;
  /** `null` = chưa có ảnh cho lớp này ⇒ ô hiện khung "chưa có ảnh". */
  imageFor?: ((comp: Component, index: number) => { src: string; alt: string } | null) | undefined;
  /** Thiết kế đã đổi sau lần sinh ảnh cuối (§5.7 `stale`). */
  stale?: boolean;
  onSelect: (index: number) => void;
  onActivate: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onDelete: (index: number) => void;
  onResize: () => void;
  onOpenLibrary: () => void;
  onGenSheet: () => void;
}

const LAYER_LABEL = {
  skeleton: "Khung xương",
  raw: "Ảnh đã sinh",
  kit: "Đã cắt",
} as const;

export function SheetCanvas(props: SheetCanvasProps) {
  const { contract, sheet, validation, layer, readOnly, readOnlyReason } = props;
  const variants = contractVariants(contract);
  const only = sheetVariantFilter(sheet);
  const applicable = only.length === 0 ? variants : variants.filter((v) => only.includes(v.id));
  const total = cellCount(sheet);
  const used = realCount(sheet);
  const empties = total - used;
  const disProps = readOnly ? { disabled: true, title: readOnlyReason } : {};

  // §3.3 tối đa 2 dòng cảnh báo — xếp theo mức khẩn cấp, cắt phần dư.
  const notes: React.ReactNode[] = [];
  if (props.stale) {
    notes.push(
      <Note key="stale" tone="warn" icon={RefreshCw}>
        <span>Ảnh đã sinh cũ hơn thiết kế.</span>
        <Button variant="secondary" size="sm" className="ml-auto shrink-0" {...disProps} onClick={props.onGenSheet}>
          Sinh lại sheet này
        </Button>
      </Note>,
    );
  }
  if (empties > 0) {
    notes.push(
      <Note key="empty" tone="warn" icon={AlertTriangle}>
        <span>
          {empties} ô trống — vẫn tính vào ảnh (≈{Math.round((empties / Math.max(1, total)) * 100)}% diện tích).
        </span>
        <Button variant="secondary" size="sm" className="ml-auto shrink-0" {...disProps} onClick={props.onOpenLibrary}>
          Thêm element
        </Button>
      </Note>,
    );
  } else if (used > 0) {
    notes.push(
      <Note key="full" tone="info" icon={Info}>
        <span>
          {used}/{total} ô — thêm element nữa sẽ nới lưới thành {sheet.grid.cols}×{sheet.grid.rows + 1}.
        </span>
      </Note>,
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header sheet */}
      <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-4 py-2">
        <h2 className="text-subtitle text-fg-strong">{sheet.id}</h2>
        <span className="text-caption text-fg-muted-raised">
          lưới {sheet.grid.cols}×{sheet.grid.rows} · {used}/{total} ô · {sheet.orient === "portrait" ? "dọc" : "ngang"}
        </span>
        <Button variant="ghost" size="sm" className="gap-1.5" {...disProps} onClick={props.onResize}>
          <Grid3x3 className="size-3.5" aria-hidden />
          Đổi lưới…
        </Button>

        <div className="ml-auto flex items-center gap-2">
          {applicable.length > 0 && (
            <Select
              value={props.previewVariantId ?? applicable[0]?.id}
              onValueChange={props.onPreviewVariantChange}
            >
              <SelectTrigger className="h-ctl-sm w-[180px]" aria-label="Phong cách đang xem">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {applicable.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.vi || v.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <ToggleGroup
            type="single"
            value={layer}
            onValueChange={(v) => v && props.onLayerChange(v as "skeleton" | "raw" | "kit")}
            aria-label="Lớp đang xem"
          >
            {(["skeleton", "raw", "kit"] as const).map((l) => (
              <ToggleGroupItem key={l} value={l} size="sm">
                {LAYER_LABEL[l]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      {/* Lưới ô — nền dot-grid rất mờ (FLORA-REF §2.7): S3 là màn DUY NHẤT có canvas,
          đúng chỗ hoa văn này phải xuất hiện. Chấm alpha .07, không cạnh tranh nội dung. */}
      <ScrollArea className={cn("min-h-0 flex-1", DOTGRID)}>
        <div className="p-4">
          {sheet.components.length === 0 ? (
            <EmptyState
              icon={LibraryBig}
              title="Sheet này chưa có element"
              description="Thêm element từ thư viện, hoặc đổi lưới rồi tự tạo từng ô."
              action={
                <Button variant="primary" size="lg" {...disProps} onClick={props.onOpenLibrary}>
                  Mở thư viện element
                </Button>
              }
            />
          ) : (
            <CellGrid
              sheet={sheet}
              validation={validation}
              selectedIndex={props.selectedIndex}
              onSelect={props.onSelect}
              onActivate={props.onActivate}
              onMove={props.onMove}
              onDelete={props.onDelete}
              readOnly={readOnly}
              imageFor={layer === "skeleton" ? undefined : props.imageFor}
              layerEmptyHint={
                layer === "raw" ? "Chưa sinh ảnh cho ô này" : layer === "kit" ? "Chưa cắt ô này" : undefined
              }
            />
          )}
        </div>
      </ScrollArea>

      {notes.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-line-subtle p-2">{notes.slice(0, 2)}</div>
      )}
    </div>
  );
}

function Note({
  tone, icon: Icon, children,
}: {
  tone: "warn" | "info";
  icon: typeof Info;
  children: React.ReactNode;
}) {
  return (
    <p
      className={
        tone === "warn"
          ? "flex items-center gap-2 rounded-2 kg-tint-warn px-3 py-1.5 text-caption text-on-tint-warn"
          : "flex items-center gap-2 rounded-2 bg-raised px-3 py-1.5 text-caption text-fg"
      }
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {children}
    </p>
  );
}
