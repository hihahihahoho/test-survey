import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JOB_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { jobLabel, type MatrixCell, type ProgressMatrix as Matrix } from "../lib/matrix";

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * MA TRẬN TIẾN ĐỘ (phong cách × sheet) — THÀNH PHẦN CỐT LÕI CỦA S2 (§3-S2 mục 3).
 * Đóng audit D1 ("không biết sheet nào cần gen lại") và tiêu chí đo R24-(3).
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Mỗi ô trả lời được 3 câu mà §1.1-3 đòi: đã gen chưa · đã cắt chưa · có cũ hơn
 * thiết kế không. Trạng thái lấy TỪ `lib/status.ts` (§5.7) — component này không
 * tự chế nhãn, không tự chọn màu.
 *
 * BỐN CHỐT A11Y, mỗi chốt vá một lỗi thật của bản v1:
 *
 * ① `role="grid"` + MỘT TABSTOP + mũi tên di chuyển (§5.8-A6). Lưới 4×13 của
 *    `styles.json` thật là 52 ô; nếu mỗi ô là một tabstop thì user bàn phím phải
 *    bấm Tab 52 lần để đi qua một khối. Con trỏ (`cursor`) là ô duy nhất có
 *    `tabIndex=0`, đúng mẫu WAI-ARIA cho composite widget.
 *
 * ② Ô là `<button>` THẬT, không `<div onClick>` (§5.8-A5, đóng I2/I4), có
 *    `aria-label` đủ nghĩa: "Tết đỏ, sheet tall, Thiết kế đã đổi sau lần sinh ảnh
 *    cuối" — đúng ví dụ trong §3-S2.
 *
 * ③ Ô đang chọn có NỀN + VIỀN 2px + `aria-pressed`, không chỉ đổi màu viền
 *    (đóng I1: viền chọn của v1 đo được 2.72:1, dưới ngưỡng 3:1 của WCAG 1.4.11).
 *
 * ④ Ô "không áp dụng" nói bằng CHỮ ("— không áp"), không để ô trống bí ẩn.
 *
 * TƯƠNG TÁC (đúng §3-S2 mục 3): click = mở sheet đó ở S3 · ⇧click = chọn dải chữ
 * nhật như bảng tính · ⌘/Ctrl+click = bật/tắt một ô · Space = bật/tắt ô dưới con
 * trỏ · Enter = mở sheet.
 */
export interface ProgressMatrixProps {
  matrix: Matrix;
  /** Tập lượt đang chọn (do màn giữ — thanh nổi cần đọc chung). */
  selected: ReadonlySet<string>;
  onSelectedChange: (jobs: string[]) => void;
  /** Click 1 ô = mở đúng sheet đó ở trình soạn. */
  onOpenCell: (cell: MatrixCell) => void;
}

interface Pos {
  r: number;
  c: number;
}

export function ProgressMatrix({ matrix, selected, onSelectedChange, onOpenCell }: ProgressMatrixProps) {
  const { variants, sheets } = matrix;
  const [cursor, setCursor] = React.useState<Pos>({ r: 0, c: 0 });
  const anchorRef = React.useRef<Pos | null>(null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  const hintId = React.useId();

  // Bản thiết kế đổi (thêm/bớt sheet) ⇒ con trỏ cũ có thể trỏ ra ngoài lưới.
  React.useEffect(() => {
    setCursor((p) => ({
      r: Math.min(p.r, Math.max(0, variants.length - 1)),
      c: Math.min(p.c, Math.max(0, sheets.length - 1)),
    }));
  }, [variants.length, sheets.length]);

  const cellAt = React.useCallback(
    (r: number, c: number): MatrixCell | null => {
      const v = variants[r];
      const s = sheets[c];
      if (!v || !s) return null;
      return matrix.cells.get(`${v.id}|${s.id}`) ?? null;
    },
    [matrix, variants, sheets],
  );

  const focusCell = (r: number, c: number) => {
    const el = gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${r}-${c}"]`);
    el?.focus();
  };

  const toggle = (cell: MatrixCell) => {
    const next = new Set(selected);
    if (next.has(cell.job)) next.delete(cell.job);
    else next.add(cell.job);
    onSelectedChange([...next]);
  };

  /** ⇧: chọn dải hình chữ nhật từ mốc tới (r,c) — giống bảng tính, dễ đoán. */
  const extendTo = (r: number, c: number) => {
    const a = anchorRef.current ?? { r, c };
    anchorRef.current = a;
    const next = new Set<string>();
    for (let i = Math.min(a.r, r); i <= Math.max(a.r, r); i += 1) {
      for (let j = Math.min(a.c, c); j <= Math.max(a.c, c); j += 1) {
        const cell = cellAt(i, j);
        if (cell?.applies) next.add(cell.job);
      }
    }
    onSelectedChange([...next]);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const maxR = variants.length - 1;
    const maxC = sheets.length - 1;
    let { r, c } = cursor;

    switch (e.key) {
      case "ArrowRight": c = Math.min(maxC, c + 1); break;
      case "ArrowLeft": c = Math.max(0, c - 1); break;
      case "ArrowDown": r = Math.min(maxR, r + 1); break;
      case "ArrowUp": r = Math.max(0, r - 1); break;
      case "Home": c = 0; if (e.ctrlKey || e.metaKey) r = 0; break;
      case "End": c = maxC; if (e.ctrlKey || e.metaKey) r = maxR; break;
      case " ": {
        e.preventDefault();
        const cell = cellAt(cursor.r, cursor.c);
        if (cell?.applies) {
          anchorRef.current = cursor;
          toggle(cell);
        }
        return;
      }
      case "Enter": {
        e.preventDefault();
        const cell = cellAt(cursor.r, cursor.c);
        if (cell) onOpenCell(cell);
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    setCursor({ r, c });
    if (e.shiftKey) extendTo(r, c);
    // Focus phải chạy SAU khi tabIndex đổi, nếu không trình duyệt bỏ focus vào ô
    // đang có tabIndex=-1 và người dùng bàn phím mất dấu con trỏ.
    requestAnimationFrame(() => focusCell(r, c));
  };

  if (variants.length === 0 || sheets.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div
          ref={gridRef}
          role="grid"
          aria-label="Tiến độ theo phong cách và sheet"
          aria-describedby={hintId}
          onKeyDown={onKeyDown}
          className="grid min-w-max gap-1"
          style={{
            gridTemplateColumns: `minmax(112px, max-content) repeat(${sheets.length}, minmax(104px, 1fr))`,
          }}
        >
          {/* hàng tiêu đề */}
          <div role="row" className="col-span-full grid gap-1" style={{ gridTemplateColumns: "subgrid" }}>
            <span role="columnheader" className="px-2 py-1 text-caption uppercase tracking-label text-fg-muted-raised">
              Phong cách
            </span>
            {sheets.map((s) => (
              <span
                key={s.id}
                role="columnheader"
                title={`sheet ${s.id} · lưới ${s.cols}×${s.rows}`}
                className="truncate px-2 py-1 font-mono text-caption text-fg-muted-raised"
              >
                {s.id}
              </span>
            ))}
          </div>

          {variants.map((v, r) => (
            <div key={v.id} role="row" className="col-span-full grid items-center gap-1" style={{ gridTemplateColumns: "subgrid" }}>
              <span
                role="rowheader"
                title={v.label}
                className="truncate px-2 text-label text-fg-strong"
              >
                {v.label}
              </span>
              {sheets.map((s, c) => {
                const cell = matrix.cells.get(`${v.id}|${s.id}`);
                if (!cell) return <span key={s.id} role="gridcell" />;
                return (
                  <div key={s.id} role="gridcell" className="min-w-0">
                    <MatrixCellButton
                      cell={cell}
                      pos={`${r}-${c}`}
                      isCursor={cursor.r === r && cursor.c === c}
                      isSelected={selected.has(cell.job)}
                      onActivate={(e) => {
                        setCursor({ r, c });
                        if (e.shiftKey) {
                          extendTo(r, c);
                          return;
                        }
                        if (e.metaKey || e.ctrlKey) {
                          anchorRef.current = { r, c };
                          toggle(cell);
                          return;
                        }
                        onOpenCell(cell);
                      }}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <p id={hintId} className="text-caption text-fg-muted-raised">
        Bấm một ô để mở sheet đó · ⇧+bấm để chọn nhiều ô · dùng mũi tên để di chuyển, dấu cách để
        chọn, Enter để mở.
      </p>
    </div>
  );
}

/**
 * Một ô. Nhãn cho screen reader ghép đủ ba phần (phong cách, sheet, trạng thái) vì
 * khi nhảy thẳng vào ô, screen reader không "nhìn" được tiêu đề hàng/cột.
 */
function MatrixCellButton({
  cell,
  pos,
  isCursor,
  isSelected,
  onActivate,
}: {
  cell: MatrixCell;
  pos: string;
  isCursor: boolean;
  isSelected: boolean;
  onActivate: (e: React.MouseEvent) => void;
}) {
  if (!cell.applies) {
    return (
      <span
        className="block px-2 py-1.5 text-center text-caption text-fg-muted"
        aria-label={`${cell.variant.label}, sheet ${cell.sheet.id}, không áp dụng cho phong cách này`}
      >
        — không áp
      </span>
    );
  }

  const meta = JOB_STATUS[cell.status];
  const Icon = meta.icon;
  const full = `${cell.variant.label}, sheet ${cell.sheet.id}, ${meta.long}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          data-cell={pos}
          tabIndex={isCursor ? 0 : -1}
          aria-pressed={isSelected}
          aria-label={full}
          onClick={onActivate}
          className={cn(
            "flex h-8 w-full items-center gap-1.5 rounded-1 border px-2 text-caption transition-colors duration-fast",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
            isSelected
              ? "border-2 border-accent bg-accent/[var(--kg-tint-a)] text-fg-strong"
              : "border-line-subtle bg-canvas text-fg hover:border-line-strong hover:bg-raised",
          )}
        >
          <Badge tone={meta.tone} className="pointer-events-none px-1" aria-hidden>
            <Icon className={cn(cell.status === "running" && "motion-safe:animate-kg-pulse")} aria-hidden />
          </Badge>
          <span className="min-w-0 flex-1 truncate text-left">{meta.label}</span>
          {isSelected && <span className="shrink-0 text-accent-text" aria-hidden>✓</span>}
        </button>
      </TooltipTrigger>
      <TooltipContent>{full}</TooltipContent>
    </Tooltip>
  );
}

/** Chú giải: chỉ hiện những trạng thái CÓ MẶT, kèm số đếm (§5.7). */
export function MatrixLegend({ matrix }: { matrix: Matrix }) {
  const items = (Object.keys(JOB_STATUS) as (keyof typeof JOB_STATUS)[]).filter((k) => matrix.counts[k] > 0);
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap items-center gap-2">
      {items.map((k) => {
        const meta = JOB_STATUS[k];
        const Icon = meta.icon;
        return (
          <li key={k}>
            <Badge tone={meta.tone}>
              <Icon aria-hidden />
              <span>
                {meta.label} {matrix.counts[k]}
              </span>
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

/** Nhãn gộp một hàng — export để thẻ tóm tắt dùng chung một cách gọi tên. */
export { jobLabel };
