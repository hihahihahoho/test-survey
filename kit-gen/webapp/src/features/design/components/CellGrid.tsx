import * as React from "react";
import { Ban, Sparkles, GalleryVerticalEnd, Move } from "lucide-react";
import { cn } from "@/lib/utils";
import { CheckerboardImage } from "@/components/common";
import type { Component, Sheet } from "@/lib/types/contract";
import { cellAspect } from "../lib/shapes";
import { isEmptyCell } from "../lib/ops";
import { cellSeverity, type ValidationResult } from "../lib/validate";
import { Silhouette } from "./Silhouette";

/**
 * VÙNG ② — LƯỚI Ô (§3-S3.3 + `CellGrid` §5.6).
 *
 * A11y §5.8-A6: đây là COMPOSITE WIDGET, không phải một đống nút.
 *   · `role=grid` / `row` / `gridcell`, MỘT tabstop duy nhất (roving tabindex)
 *   · ←→↑↓ di chuyển · Home/End đầu/cuối hàng · ⌥←→↑↓ ĐỔI VỊ TRÍ element
 *   · Space/Enter chọn · ⌫ xoá (màn tự hỏi xác nhận)
 *   · ô là `<button>` THẬT, không `<div onClick>` (đóng audit I2/A5)
 *
 * Hiệu năng (đóng audit H3): mỗi ô là `React.memo`, so props nông. Sửa 1 element chỉ
 * vẽ lại đúng ô đó — không vẽ lại cả lưới, không mất vị trí cuộn.
 *
 * §5.6 quy định 5 trạng thái ô và cấm dùng MÀU làm dấu hiệu duy nhất (A3): ô chọn có
 * viền accent 2px + nền + **dấu ✓**; ô trống có nét đứt + gạch chéo + **␀**; ô lỗi có
 * viền danger + **chấm cảnh báo**.
 */
export interface CellGridProps {
  sheet: Sheet;
  validation: ValidationResult;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  /** Enter / double-click — mở panel thuộc tính và đưa focus vào field đầu. */
  onActivate?: (index: number) => void;
  /** ⌥ + mũi tên, hoặc kéo-thả chuột. */
  onMove: (from: number, to: number) => void;
  onDelete?: (index: number) => void;
  readOnly?: boolean;
  /** Lớp đang xem: khung xương (SVG) hay ảnh thật. Ảnh do màn cấp URL. */
  imageFor?: ((comp: Component, index: number) => { src: string; alt: string } | null) | undefined;
  /** Nhãn empty riêng cho tab "Ảnh đã sinh"/"Đã cắt" khi chưa có ảnh. */
  layerEmptyHint?: string | undefined;
}

export function CellGrid({
  sheet, validation, selectedIndex, onSelect, onActivate, onMove, onDelete,
  readOnly = false, imageFor, layerEmptyHint,
}: CellGridProps) {
  const cols = Math.max(1, Number(sheet.grid.cols) || 1);
  const rows = Math.max(1, Number(sheet.grid.rows) || 1);
  const aspect = cellAspect(sheet.orient);
  const cells = sheet.components;
  const cur = selectedIndex ?? 0;
  const gridRef = React.useRef<HTMLDivElement>(null);

  /** Giữ focus bám theo ô đang chọn sau khi ⌥-di chuyển (nếu không, focus rơi về body). */
  const focusCell = React.useCallback((index: number) => {
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${index}"]`);
    el?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const n = cells.length;
    if (n === 0) return;
    const alt = e.altKey;
    let to: number | null = null;

    switch (e.key) {
      case "ArrowRight": to = cur + 1; break;
      case "ArrowLeft": to = cur - 1; break;
      case "ArrowDown": to = cur + cols; break;
      case "ArrowUp": to = cur - cols; break;
      case "Home": to = Math.floor(cur / cols) * cols; break;
      case "End": to = Math.min(n - 1, Math.floor(cur / cols) * cols + cols - 1); break;
      case " ":
      case "Enter":
        e.preventDefault();
        if (e.key === "Enter") onActivate?.(cur);
        else onSelect(cur);
        return;
      case "Backspace":
      case "Delete":
        if (!readOnly && onDelete) {
          e.preventDefault();
          onDelete(cur);
        }
        return;
      default:
        return;
    }
    if (to === null || to < 0 || to >= n) return;
    e.preventDefault();
    if (alt) {
      // ⌥ + mũi tên = ĐỔI VỊ TRÍ (§3-S3.3). Chỉ-đọc thì chỉ di chuyển con trỏ.
      if (readOnly) {
        onSelect(to);
        requestAnimationFrame(() => focusCell(to!));
        return;
      }
      onMove(cur, to);
      requestAnimationFrame(() => focusCell(to!));
      return;
    }
    onSelect(to);
    requestAnimationFrame(() => focusCell(to!));
  };

  /* Kéo-thả chuột (NICE của §7-U1 nhưng rẻ vì đã có sẵn onMove). Bàn phím vẫn là
     đường chính thức; HTML5 DnD chỉ là lối tắt cho chuột. */
  const dragFrom = React.useRef<number | null>(null);

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={`Lưới ô của sheet ${sheet.id}, ${cols} cột ${rows} hàng`}
      aria-rowcount={rows}
      aria-colcount={cols}
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      onKeyDown={onKeyDown}
    >
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} role="row" className="contents">
          {Array.from({ length: cols }).map((__, k) => {
            const index = r * cols + k;
            const comp = cells[index];
            return (
              <div key={index} role="gridcell" className="contents">
                <Cell
                  index={index}
                  row={r}
                  col={k}
                  comp={comp}
                  aspect={aspect}
                  orient={sheet.orient}
                  sheetId={sheet.id}
                  selected={index === cur}
                  severity={cellSeverity(validation, sheet.id, index)}
                  image={comp && imageFor ? imageFor(comp, index) : null}
                  layerEmptyHint={layerEmptyHint}
                  readOnly={readOnly}
                  onSelect={onSelect}
                  {...(onActivate ? { onActivate } : {})}
                  onDragStart={(i) => {
                    dragFrom.current = i;
                  }}
                  onDropOn={(i) => {
                    const from = dragFrom.current;
                    dragFrom.current = null;
                    if (from !== null && from !== i && !readOnly) onMove(from, i);
                  }}
                />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

interface CellProps {
  index: number;
  row: number;
  col: number;
  comp: Component | undefined;
  aspect: number;
  orient: string | undefined;
  sheetId: string;
  selected: boolean;
  severity: "error" | "warn" | null;
  image: { src: string; alt: string } | null;
  layerEmptyHint: string | undefined;
  readOnly: boolean;
  onSelect: (i: number) => void;
  onActivate?: (i: number) => void;
  onDragStart: (i: number) => void;
  onDropOn: (i: number) => void;
}

const Cell = React.memo(function Cell({
  index, row, col, comp, aspect, orient, sheetId, selected, severity, image,
  layerEmptyHint, readOnly, onSelect, onActivate, onDragStart, onDropOn,
}: CellProps) {
  const empty = isEmptyCell(comp);
  const name = comp?.file ?? "";
  const vi = comp?.vi ?? "";
  const skel = comp?.skel;
  const matte = typeof skel?.matte === "string" ? skel.matte : null;
  const flags = [
    matte ? { key: "matte", label: matte, icon: Sparkles, title: `Tách nền kiểu ${matte}` } : null,
    skel?.slice9 ? { key: "slice9", label: "9", icon: GalleryVerticalEnd, title: "Cắt 9 lát (co giãn giữ góc)" } : null,
    skel?.free ? { key: "free", label: "tự do", icon: Move, title: "Khung tự do — không vẽ khung safe" } : null,
  ].filter(Boolean) as { key: string; label: string; icon: typeof Sparkles; title: string }[];

  // aria-label phải ĐỦ NGHĨA khi đọc một mình (A9): người dùng screen reader không
  // thấy được cột/hàng, nên nói luôn vị trí, nội dung, cờ và tình trạng lỗi.
  const ariaLabel = [
    `Ô ${index + 1}`,
    empty ? "trống" : vi || name || "element",
    flags.length > 0 ? flags.map((f) => f.title).join(", ") : null,
    severity === "error" ? "có lỗi" : severity === "warn" ? "có cảnh báo" : null,
    selected ? "đang chọn" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <button
      type="button"
      data-cell={index}
      tabIndex={selected ? 0 : -1}
      aria-selected={selected}
      aria-rowindex={row + 1}
      aria-colindex={col + 1}
      aria-label={ariaLabel}
      draggable={!readOnly && !empty}
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => {
        if (!readOnly) e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDropOn(index);
      }}
      onClick={() => onSelect(index)}
      onDoubleClick={() => onActivate?.(index)}
      className={cn(
        "group relative flex w-full flex-col justify-between overflow-hidden rounded-2 p-2 text-left",
        "transition-colors duration-fast",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
        // §5.6 · 5 trạng thái. Màu KHÔNG BAO GIỜ là dấu hiệu duy nhất (A3).
        empty
          ? "border border-dashed border-line bg-canvas/40"
          : "border border-line bg-surface hover:border-line-strong",
        selected && "border-2 border-accent bg-accent/[var(--kg-tint-a)]",
        severity === "error" && "border-danger",
        severity === "warn" && !selected && "border-warn/70",
      )}
      style={{ aspectRatio: String(aspect) }}
    >
      <span className="pointer-events-none flex w-full items-start justify-between gap-1">
        <span className="font-mono text-caption text-fg-muted-raised">{String(index + 1).padStart(2, "0")}</span>
        <span className="flex items-center gap-1">
          {flags.map((f) => (
            <span
              key={f.key}
              title={f.title}
              className="inline-flex h-4 items-center gap-0.5 rounded-full bg-overlay px-1 text-caption leading-none text-on-tint-accent"
            >
              <f.icon className="size-2.5" aria-hidden />
              {f.label}
            </span>
          ))}
          {selected && <span className="text-caption text-accent-text" aria-hidden>✓</span>}
          {severity === "error" && !selected && <span className="text-caption text-danger" aria-hidden>⛔</span>}
        </span>
      </span>

      <span className="pointer-events-none relative flex min-h-0 flex-1 items-center justify-center py-1">
        {empty ? (
          <span className="flex flex-col items-center gap-1 text-fg-muted">
            {/* nét gạch chéo của ô trống — §5.6 */}
            <Ban className="size-4" aria-hidden strokeWidth={1.5} />
            <span className="text-caption" aria-hidden>␀</span>
          </span>
        ) : image ? (
          <CheckerboardImage src={image.src} alt="" className="size-full border-0 bg-transparent" fallbackText={layerEmptyHint ?? "Ảnh nằm trên máy bạn"} />
        ) : (
          <Silhouette skel={skel} orient={orient} uid={`${sheetId}-${index}`} className="h-full w-full" />
        )}
      </span>

      <span className="pointer-events-none block w-full truncate text-caption text-fg-muted-raised">
        {empty ? "trống" : name || vi || "—"}
      </span>
    </button>
  );
});
