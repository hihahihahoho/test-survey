import * as React from "react";
import type { Component, Sheet } from "@/lib/types/contract";
import { cn } from "@/lib/utils";
import { canvasOf, cellMetrics, gridOf } from "./geometry";
import { SilhouetteGroup } from "./Silhouette";

/**
 * webapp/src/features/design/preview/SkeletonPreview.tsx
 * ────────────────────────────────────────────────────────────────────────────
 * PREVIEW KHUNG XƯƠNG của sheet đang soạn (mục 2 của brief).
 *
 * Mục đích rất cụ thể: user THẤY BỐ CỤC TRƯỚC KHI TỐN LƯỢT GEN. Một lượt gen mất
 * 2–5 phút và tốn quota; nhìn preview 1 giây là biết ô nào trống, element nào bị
 * bẹp, sheet nào lệch hàng.
 *
 * Vẽ đúng thứ engine vẽ, KHÔNG tự bịa:
 *   · khổ ảnh + chia ô           → geometry.ts (rút từ gen.sh / skeleton.py / slice.py)
 *   · hình khối + khung safe     → silhouette.ts (bản chép có ca test khoá vào silhouettes.js)
 *   · lưới kẻ SAU CÙNG, nét mảnh → skeleton.py dòng 117–120 / skeleton.html
 *
 * MỘT `<svg>` cho cả sheet (không phải mỗi ô một svg): 16–64 ô mà mỗi ô một svg thì
 * DOM phình và cuộn giật. Ô là `<g>`, đổi 1 element chỉ re-render `<g>` đó nhờ memo.
 *
 * A11y: đây là HÌNH MINH HOẠ, không phải widget. `role="img"` + `aria-label` mô tả
 * bố cục bằng lời (§5.8-A9); phần điều khiển bàn phím thuộc lưới ô của R2-P1, không
 * nhân đôi tabstop ở đây.
 */

export interface SkeletonPreviewProps {
  sheet: Pick<Sheet, "id" | "grid" | "orient" | "components" | "cell_hint"> | null | undefined;
  /** ô đang chọn — tô sáng để nối với lưới ô của vùng ②. */
  selectedIndex?: number | null;
  /** ô đang bôi chọn (⇧click nhiều ô). */
  markedIndexes?: readonly number[];
  /** hiện số thứ tự ô (mặc định có; ảnh gen thật KHÔNG có số — chỉ để user định vị). */
  showIndex?: boolean;
  /** hiện khung safe zone nét đứt. */
  showSafeFrame?: boolean;
  /** bấm vào ô — tuỳ chọn; không truyền thì preview thuần xem. */
  onSelect?: (index: number) => void;
  className?: string;
}

/** Ô trống vẽ gạch chéo — pattern id phải duy nhất khi có nhiều preview trên trang. */
let hatchSeq = 0;

export const SkeletonPreview = React.memo(function SkeletonPreview({
  sheet,
  selectedIndex = null,
  markedIndexes,
  showIndex = true,
  showSafeFrame = true,
  onSelect,
  className,
}: SkeletonPreviewProps): React.ReactElement {
  const uidBase = React.useMemo(() => {
    hatchSeq += 1;
    return `skp${hatchSeq.toString(36)}`;
  }, []);

  const grid = gridOf(sheet);
  const canvas = canvasOf(sheet);
  const m = cellMetrics(sheet);
  const comps: readonly (Component | undefined)[] = Array.isArray(sheet?.components) ? sheet.components : [];
  const total = grid.cols * grid.rows;
  const marked = React.useMemo(() => new Set(markedIndexes ?? []), [markedIndexes]);

  const filled = comps.filter((c) => c !== undefined && String(c.skel?.shape ?? "") !== "empty").length;
  const label =
    sheet == null
      ? "Chưa chọn sheet nào"
      : `Khung xương sheet ${sheet.id}: lưới ${grid.cols} cột × ${grid.rows} hàng, ${filled} trên ${total} ô có element, ` +
        `ảnh sinh ra ${canvas.w}×${canvas.h} pixel, mỗi ô ${m.cellPx.w}×${m.cellPx.h} pixel.`;

  return (
    <svg
      viewBox={`0 0 ${canvas.w} ${canvas.h}`}
      className={cn("h-auto w-full select-none text-fg-muted", className)}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={label}
    >
      {/* nền của KHUNG XEM, không phải của ảnh. Ảnh khung xương thật (engine) nay
          KHÔNG có nền: nó phải trong suốt thì model mới trả về alpha thật — xem
          khối "NỀN SHEET" trong skeleton-svg.js. Ở đây vẫn tô một nền vì đây là
          giao diện, và trong suốt trên nền app thì không nhìn ra hình. Hình khối
          bên trong vẫn giữ nguyên màu thật của engine. */}
      <rect x={0} y={0} width={canvas.w} height={canvas.h} className="fill-surface" />

      <defs>
        <pattern id={`${uidBase}-hatch`} width={16} height={16} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={16} stroke="currentColor" strokeWidth={2} opacity={0.35} />
        </pattern>
      </defs>

      {Array.from({ length: total }, (_, i) => {
        const r = Math.floor(i / grid.cols);
        const c = i % grid.cols;
        return (
          <PreviewCell
            key={i}
            index={i}
            comp={comps[i]}
            x={c * m.cell.w}
            y={r * m.cell.h}
            w={m.cell.w}
            h={m.cell.h}
            uid={`${uidBase}c${i}`}
            hatchId={`${uidBase}-hatch`}
            selected={selectedIndex === i}
            marked={marked.has(i)}
            showIndex={showIndex}
            showSafeFrame={showSafeFrame}
            onSelect={onSelect}
          />
        );
      })}

      {/* lưới kẻ SAU CÙNG cho nét mảnh đè lên trên — skeleton.py dòng 117–120 */}
      <g className="stroke-line" strokeWidth={2} opacity={0.5}>
        {Array.from({ length: Math.max(0, grid.cols - 1) }, (_, k) => (
          <line key={`v${k}`} x1={(k + 1) * m.cell.w} y1={0} x2={(k + 1) * m.cell.w} y2={canvas.h} />
        ))}
        {Array.from({ length: Math.max(0, grid.rows - 1) }, (_, k) => (
          <line key={`h${k}`} x1={0} y1={(k + 1) * m.cell.h} x2={canvas.w} y2={(k + 1) * m.cell.h} />
        ))}
      </g>
    </svg>
  );
});

interface PreviewCellProps {
  index: number;
  comp: Component | undefined;
  x: number;
  y: number;
  w: number;
  h: number;
  uid: string;
  hatchId: string;
  selected: boolean;
  marked: boolean;
  showIndex: boolean;
  showSafeFrame: boolean;
  onSelect?: ((index: number) => void) | undefined;
}

/** Một ô. `memo` để sửa 1 element không vẽ lại 63 ô còn lại (đóng audit H3). */
const PreviewCell = React.memo(function PreviewCell({
  index, comp, x, y, w, h, uid, hatchId, selected, marked, showIndex, showSafeFrame, onSelect,
}: PreviewCellProps): React.ReactElement {
  const shape = String(comp?.skel?.shape ?? "");
  const isEmpty = comp === undefined || shape === "empty";
  const clickable = onSelect !== undefined;

  return (
    <g
      transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}
      onClick={clickable ? () => onSelect(index) : undefined}
      className={cn(clickable && "cursor-pointer")}
      /* Ô ở preview KHÔNG nhận tabstop: lưới ô thật của vùng ② (R2-P1) mới là
         composite widget điều khiển bằng bàn phím. Hai tabstop cho cùng một việc
         là bẫy bàn phím, đúng thứ §5.8-A6 cấm. */
      aria-hidden
    >
      {isEmpty ? (
        <rect x={0} y={0} width={w} height={h} fill={`url(#${hatchId})`} className="text-fg-muted" />
      ) : (
        <SilhouetteGroup skel={comp?.skel} boxW={w} boxH={h} uid={uid} showSafeFrame={showSafeFrame} />
      )}

      {(selected || marked) && (
        <rect
          x={2}
          y={2}
          width={Math.max(0, w - 4)}
          height={Math.max(0, h - 4)}
          fill="none"
          className={selected ? "stroke-accent" : "stroke-line-strong"}
          strokeWidth={selected ? 6 : 4}
          strokeDasharray={selected ? undefined : "10 8"}
        />
      )}

      {showIndex && (
        <text
          x={10}
          y={Math.min(h - 6, 34)}
          className="fill-fg-muted font-mono"
          fontSize={Math.max(14, Math.min(w, h) * 0.09)}
        >
          {index + 1}
        </text>
      )}
    </g>
  );
});
