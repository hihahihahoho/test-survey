import * as React from "react";
import { cellBadge, type OverlayCell, type SheetOverlay } from "../../lib/result/sheet-geometry";

/**
 * LỚP PHỦ SOI Ô — vẽ đúng cái lưới và cái hộp mà máy đã được dặn, lên chính ảnh nó vẽ ra.
 *
 * ╔══ CÂU HỎI NÓ TRẢ LỜI ════════════════════════════════════════════════════╗
 * ║ Chủ sản phẩm nhìn một tấm vừa gen và thấy các món «hơi lệch» so với ô,     ║
 * ║ rồi hỏi: do máy vẽ hay do mình đặt số sai? Mắt thường không tách được hai  ║
 * ║ nguyên nhân ấy, vì cái ô và cái hộp vùng an toàn đều VÔ HÌNH trên ảnh —    ║
 * ║ chúng chỉ tồn tại dưới dạng con số trong prompt. Đặt hai hình ấy chồng lên ║
 * ║ ảnh là biến một câu hỏi cảm tính thành một phép so hai đường kẻ.           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ VÌ SAO `viewBox` LÀ KHỔ ẢNH GỐC, KHÔNG PHẢI CỠ TRÊN MÀN ═══════════════╗
 * ║ Ảnh hiện ra bằng `object-contain` trong một khung cao tối đa 320px, và cỡ  ║
 * ║ thật của nó tuỳ khung cửa sổ. Nếu lớp phủ tự quy đổi ra pixel màn hình thì ║
 * ║ nó phải đo lại cái `<img>` sau mỗi lần đổi cỡ — và mọi lần đo trượt là một ║
 * ║ cái lưới lệch, tức đúng thứ lỗi mà người dùng đang đi tìm.                 ║
 * ║ Thay vào đó: `viewBox` = khổ ảnh gốc, SVG nằm ĐÚNG hộp của `<img>`, và     ║
 * ║ `preserveAspectRatio` mặc định (`xMidYMid meet`) khớp từng pixel với       ║
 * ║ `object-contain`. Trình duyệt tự lo phép co — không có con số nào để sai.  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Trợ năng: lớp phủ là HÌNH, nghĩa của nó nằm ở dòng chú giải bên dưới ảnh (do panel
 * vẽ). Nên `aria-hidden` — đọc to một danh sách toạ độ không giúp được ai, và một
 * `role="img"` thứ hai trong panel sẽ lẫn với ảnh thật ngay dưới nó.
 */
export interface SheetGridOverlayProps {
  overlay: SheetOverlay;
  className?: string;
}

/** Nét kẻ luôn dày đúng ngần này pixel MÀN HÌNH, bất kể ảnh đang co bao nhiêu. */
const HAIRLINE = 1;
const BOX_STROKE = 2;

export function SheetGridOverlay({ overlay, className }: SheetGridOverlayProps) {
  const { width, height, cols, rows, cells } = overlay;
  /* Chữ thì KHÔNG dùng nét-không-co được: nó phải lớn nhỏ theo ảnh, nếu không thì ở
     khung xem trước 320px nhãn sẽ to hơn cả ô nó đang chú thích. */
  const unit = Math.max(width, height);
  const font = Math.max(12, Math.round(unit / 28));
  const pad = Math.round(font * 0.32);

  /* `vector-effect` KHÔNG thừa kế từ thẻ cha (khác hẳn `stroke`), nên nó phải nằm trên
     từng đường một — đặt ở nhóm thì mọi nét lại co theo ảnh và biến mất ở cỡ xem trước. */
  const lines: React.ReactElement[] = [];
  for (let c = 1; c < cols; c += 1) {
    const x = Math.round((c * width) / cols);
    lines.push(<line key={`c${c}`} x1={x} y1={0} x2={x} y2={height} vectorEffect="non-scaling-stroke" />);
  }
  for (let r = 1; r < rows; r += 1) {
    const y = Math.round((r * height) / rows);
    lines.push(<line key={`r${r}`} x1={0} y1={y} x2={width} y2={y} vectorEffect="non-scaling-stroke" />);
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      data-testid="sheet-overlay"
      aria-hidden
      focusable="false"
    >
      {/* ĐƯỜNG CHIA Ô — mảnh và mờ: nó là khung tham chiếu, không phải thứ cần đọc. */}
      <g style={{ stroke: "rgb(var(--kg-line-strong) / 0.55)", strokeWidth: HAIRLINE }}>
        {lines}
      </g>
      {cells.map((cell) => (
        <CellMarks key={`${cell.index}-${cell.name}`} cell={cell} font={font} pad={pad} />
      ))}
    </svg>
  );
}

function CellMarks({ cell, font, pad }: { cell: OverlayCell; font: number; pad: number }) {
  const hot = cell.regenerate;
  const measured = hot ? "rgb(var(--kg-danger))" : "rgb(var(--kg-ok))";
  const badge = cellBadge(cell);
  /* Bề ngang của chữ trong SVG không đo được trước khi vẽ; 0,54 em mỗi ký tự là số
     đã đo trên chính font hệ thống của app, và nền chỉ cần đủ để chữ không dính vào
     ảnh — hụt vài pixel không làm hỏng nghĩa. */
  const badgeW = badge.length * font * 0.54 + pad * 2;

  return (
    <g data-testid="overlay-cell" data-cell={cell.index}>
      {/* HỘP ĐÃ HỨA — nét đứt, màu nhấn. Đây là con số engine ghi vào prompt. */}
      {cell.expectedAt !== null && (
        <rect
          x={cell.expectedAt.x}
          y={cell.expectedAt.y}
          width={cell.expectedAt.w}
          height={cell.expectedAt.h}
          fill="none"
          vectorEffect="non-scaling-stroke"
          data-testid="overlay-expected"
          style={{
            stroke: "rgb(var(--kg-accent-text))",
            strokeWidth: BOX_STROKE,
            strokeDasharray: "6 5",
          }}
        />
      )}
      {/* HỘP MÁY VẼ RA — nét liền. Đỏ khi máy tự chấm là cần vẽ lại. */}
      {cell.actualAt !== null && (
        <rect
          x={cell.actualAt.x}
          y={cell.actualAt.y}
          width={cell.actualAt.w}
          height={cell.actualAt.h}
          fill="none"
          vectorEffect="non-scaling-stroke"
          data-testid="overlay-actual"
          style={{ stroke: measured, strokeWidth: BOX_STROKE }}
        />
      )}
      {badge !== "" && (
        <>
          {/* NỀN MỜ DƯỚI CHỮ — ảnh bên dưới có thể là bất cứ màu gì, nên chữ phải mang
              theo nền của chính nó thay vì trông cậy vào nền ngẫu nhiên. */}
          <rect
            x={cell.cell.x + pad}
            y={cell.cell.y + pad}
            width={badgeW}
            height={font + pad * 2}
            rx={pad}
            style={{ fill: "rgb(var(--kg-overlay) / 0.88)" }}
          />
          <text
            x={cell.cell.x + pad * 2}
            y={cell.cell.y + pad * 2 + font * 0.78}
            fontSize={font}
            style={{ fill: hot ? "rgb(var(--kg-danger))" : "rgb(var(--kg-fg-strong))" }}
          >
            {badge}
          </text>
        </>
      )}
    </g>
  );
}
