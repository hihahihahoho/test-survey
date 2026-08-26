/**
 * webapp/src/features/design/preview/geometry.ts
 * ────────────────────────────────────────────────────────────────────────────
 * KÍCH THƯỚC THẬT (px) của ô và element — mục 3 của brief: "user biết element sẽ
 * to nhỏ ra sao" TRƯỚC KHI tốn lượt sinh ảnh.
 *
 * MỌI CON SỐ Ở ĐÂY ĐỀU RÚT TỪ ENGINE, KHÔNG TỰ ĐẶT:
 *
 *  · Khổ ảnh sinh — `gen.sh` dòng 35 và `skeleton.py` dòng 26 + `skeleton.html`:
 *        landscape 1536×1024 · portrait 1024×1536
 *  · Ô = chia đều khổ ảnh — `skeleton.py` dòng 95 (`cw, ch = SW/cols, SH/rows`)
 *    và `slice.py` dòng 661 (`cell_w, cell_h = W/COLS, H/ROWS`).
 *  · Element = ô × (skel.w, skel.h), CĂN GIỮA; `anchor:"bottom"` thì dán đáy
 *    chừa 4% chiều cao ô — `skeleton.py` dòng 105–107, `skeleton.html` dòng 52–54.
 *  · Canvas file PNG cắt ra = ô + vành bleed mỗi phía — `slice.py` dòng 788–789:
 *        BX = round(cell_w × BLEED), BY = round(cell_h × BLEED), BLEED = 0.18
 *
 * ⚠ GHI CHÚ TRUNG THỰC (teams/design/INTEGRATION.md §5 mốc M4): `BLEED` là HẰNG SỐ
 * MODULE trong `slice.py` (dòng 66). Tham số "Vành ngoài ô" ở tab Nâng cao được ghi
 * vào contract nhưng **không đổi được kết quả cắt thật**. Vì vậy hàm ở đây dùng đúng
 * hằng số 0.18 và `bleedIsFixed` = true để UI nói thật với user, không hứa suông.
 *
 * KHÔNG CHÉP LẠI HÌNH KHỐI Ở ĐÂY. Bản chép `silhouettes.js` là của R2-P1
 * (`../lib/shapes.ts` + `shape-data.generated.ts`, sinh bằng `scripts/extract-shapes.mjs`
 * và khoá bằng `__tests__/shape-source.test.ts`). Lượt đầu tôi có dựng một bản chép
 * thứ hai trong `preview/`; đã BỎ khi thấy R2-P1 nộp bản sinh-tự-động — hai bản chép
 * của cùng một file engine chính là lỗi mà INTEGRATION.md §1.6 đã ghi.
 * `SLICE_CONST.bleed` cũng lấy từ đó thay vì gõ lại số 0.18.
 */
import type { Sheet, Skel } from "@/lib/types/contract";
import { SLICE_CONST, type SkelLike as ShapeSkelLike } from "../lib/shapes";

/**
 * Kiểu vào của mọi hàm vẽ: nhận `Skel` (đã validate) LẪN dữ liệu chưa validate —
 * UI phải vẽ được cả `shape` lạ mà không vỡ (§6.5-6). Dùng lại `SkelLike` của
 * R2-P1 để hai bên không trôi khỏi nhau.
 */
export type SkelLike = ShapeSkelLike;
export type AnySkel = Skel | SkelLike;

/** Khổ ảnh sinh — bản sao có nhãn của bảng `CANVAS` trong gen.sh (nguồn sự thật).
 *  Vuông là 1254×1254 chứ không phải 1024²: tool image_gen của codex không có
 *  tham số size, luôn trả ~1,57 triệu pixel — đo 685 ảnh thật, ảnh vuông đều 1254. */
export const CANVAS_LANDSCAPE = { w: 1536, h: 1024 } as const;
export const CANVAS_PORTRAIT = { w: 1024, h: 1536 } as const;
export const CANVAS_SQUARE = { w: 1254, h: 1254 } as const;

/** `slice.py` dòng 66 — HẰNG SỐ MODULE, UI không đổi được (M4).
 *  Số lấy từ `SLICE_CONST` (rút tự động từ slice.py), KHÔNG gõ lại. */
export const SLICE_BLEED = SLICE_CONST.bleed;
export const BLEED_IS_FIXED = SLICE_CONST.bleedIsModuleConstant;

export type Orient = "landscape" | "portrait" | "square";

/** `canvas` (mới, có "square") thắng `orient` (cũ, chỉ 2 khổ) — cùng thứ tự ưu tiên
 *  với `sheetSize()` trong skeleton-svg.js, kẻo preview vẽ khác tấm thật. */
export function sheetOrient(sheet: Pick<Sheet, "orient" | "canvas"> | null | undefined): Orient {
  const c = sheet?.canvas;
  if (c === "square" || c === "portrait" || c === "landscape") return c;
  return sheet?.orient === "portrait" ? "portrait" : "landscape";
}

/** Tỉ lệ ngang/dọc của MỘT Ô (§3-S3.3: landscape 3:2 · portrait 2:3).
 *  Tính từ khổ ảnh ÷ lưới nên lưới không vuông vẫn ra đúng tỉ lệ thật. */
export function cellAspect(sheet: Pick<Sheet, "orient" | "canvas" | "grid"> | null | undefined): number {
  const g = gridOf(sheet);
  const c = canvasOf(sheet);
  return c.w / g.cols / (c.h / g.rows);
}

export function canvasOf(sheet: Pick<Sheet, "orient" | "canvas"> | null | undefined): { w: number; h: number } {
  const o = sheetOrient(sheet);
  if (o === "square") return { ...CANVAS_SQUARE };
  return o === "portrait" ? { ...CANVAS_PORTRAIT } : { ...CANVAS_LANDSCAPE };
}

/** Lưới an toàn: thiếu/hỏng thì về 1×1 thay vì chia cho 0. */
export function gridOf(sheet: Pick<Sheet, "grid"> | null | undefined): { cols: number; rows: number } {
  const cols = Number(sheet?.grid?.cols);
  const rows = Number(sheet?.grid?.rows);
  return {
    cols: Number.isFinite(cols) && cols > 0 ? Math.floor(cols) : 1,
    rows: Number.isFinite(rows) && rows > 0 ? Math.floor(rows) : 1,
  };
}

export interface CellMetrics {
  /** khổ ảnh sinh của cả sheet */
  canvas: { w: number; h: number };
  grid: { cols: number; rows: number };
  /** ô = khổ ảnh ÷ lưới (px thật, chưa làm tròn) */
  cell: { w: number; h: number };
  /** ô làm tròn — đúng `CW, CH = round(cell_w), round(cell_h)` của slice.py dòng 662 */
  cellPx: { w: number; h: number };
  /** vành bleed mỗi phía (px) — slice.py dòng 788 */
  bleedPx: { x: number; y: number };
  /** canvas của FILE PNG cắt ra = ô + 2×bleed — slice.py dòng 789 */
  exportPx: { w: number; h: number };
  /** hằng số, UI không đổi được (M4) */
  bleedIsFixed: boolean;
}

/** Số đo của một Ô trong sheet. Không phụ thuộc element nào. */
export function cellMetrics(sheet: Pick<Sheet, "orient" | "grid"> | null | undefined): CellMetrics {
  const canvas = canvasOf(sheet);
  const grid = gridOf(sheet);
  const cw = canvas.w / grid.cols;
  const ch = canvas.h / grid.rows;
  const CW = Math.round(cw);
  const CH = Math.round(ch);
  const BX = Math.round(cw * SLICE_BLEED);
  const BY = Math.round(ch * SLICE_BLEED);
  return {
    canvas,
    grid,
    cell: { w: cw, h: ch },
    cellPx: { w: CW, h: CH },
    bleedPx: { x: BX, y: BY },
    exportPx: { w: CW + 2 * BX, h: CH + 2 * BY },
    bleedIsFixed: BLEED_IS_FIXED,
  };
}

/** `w`/`h` hợp lệ là (0,1] (V-06). Giá trị hỏng → 0.8/0.6 như bản vanilla,
 *  để ô vẫn vẽ được thay vì biến mất (lỗi vẫn được panel thuộc tính báo riêng). */
export function clampFrac(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(1, n);
}

export interface ElementBox {
  /** vị trí + cỡ của KHUNG SAFE trong hệ toạ độ ô (đơn vị: cùng đơn vị boxW/boxH) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** `full` phủ kín ô ⇒ không vẽ khung safe (skeleton.py dòng 101–103) */
  isFull: boolean;
  /** `free` = khung động theo art ⇒ KHÔNG vẽ khung safe (skeleton.py dòng 114) */
  hasSafeFrame: boolean;
}

/**
 * Hộp của element trong một ô cỡ `boxW × boxH`.
 * Chép đúng `skeleton.py` dòng 104–107 / `skeleton.html` dòng 51–54:
 *   ew, eh = cw*w, ch*h · ex = (cw-ew)/2 · ey = anchor bottom ? ch-eh-ch*0.04 : (ch-eh)/2
 */
export function elementBox(skel: AnySkel | null | undefined, boxW: number, boxH: number): ElementBox {
  const shape = String(skel?.shape ?? "");
  const isFull = shape === "full";
  const w = isFull ? boxW : boxW * clampFrac(skel?.w, 0.8);
  const h = isFull ? boxH : boxH * clampFrac(skel?.h, 0.6);
  const x = (boxW - w) / 2;
  const y = skel?.anchor === "bottom" ? boxH - h - boxH * 0.04 : (boxH - h) / 2;
  return {
    x,
    y,
    w,
    h,
    isFull,
    hasSafeFrame: !isFull && skel?.free !== true && shape !== "empty",
  };
}

export interface ElementMetrics extends CellMetrics {
  /** cỡ THẬT của element trên ảnh sinh (px), đã làm tròn để hiện cho user */
  elementPx: { w: number; h: number };
  /** % diện tích ô mà element chiếm */
  areaPercent: number;
  /** tỉ lệ rút gọn kiểu "3:1" — nói lên hình dáng nhanh hơn số px */
  ratio: string;
}

/** Số đo của MỘT element trong ô: dùng cho dòng "ô 384×256 · element 300×102". */
export function elementMetrics(
  sheet: Pick<Sheet, "orient" | "grid"> | null | undefined,
  skel: AnySkel | null | undefined,
): ElementMetrics {
  const m = cellMetrics(sheet);
  const box = elementBox(skel, m.cell.w, m.cell.h);
  const w = Math.round(box.w);
  const h = Math.round(box.h);
  return {
    ...m,
    elementPx: { w, h },
    areaPercent: m.cell.w * m.cell.h > 0 ? (box.w * box.h * 100) / (m.cell.w * m.cell.h) : 0,
    ratio: simpleRatio(w, h),
  };
}

/** "1536×1024" → "3:2". Ước bằng UCLN, hai số quá lệch thì làm tròn 1 chữ số thập phân. */
export function simpleRatio(w: number, h: number): string {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "—";
  const g = gcd(Math.round(w), Math.round(h));
  const a = Math.round(w) / g;
  const b = Math.round(h) / g;
  if (a <= 24 && b <= 24) return `${a}:${b}`;
  return w >= h ? `${(w / h).toFixed(1)}:1` : `1:${(h / w).toFixed(1)}`;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y > 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

/** "384 × 256 px" — một chỗ duy nhất định dạng, để mọi nơi hiện giống nhau. */
export function formatPx(w: number, h: number): string {
  return `${Math.round(w)} × ${Math.round(h)} px`;
}

/**
 * `cell_hint` là câu tiếng Anh nhét thẳng vào prompt (`gen.sh` dòng 43:
 * `f"Each cell is a {sh.get('cell_hint','cell')}."`). Khi sheet chưa có hint thì
 * gợi ý câu khớp tỉ lệ ô thật, đúng cách `studio.html`/`ops.js` đặt.
 */
export function suggestCellHint(sheet: Pick<Sheet, "orient" | "canvas" | "grid"> | null | undefined): string {
  const m = cellMetrics(sheet);
  return `${sheetOrient(sheet)} ${simpleRatio(m.cell.w, m.cell.h)} cell`;
}

/** Hint đang dùng thật (của sheet) hoặc câu gợi ý — cùng chỗ để UI không tự chế. */
export function effectiveCellHint(sheet: Pick<Sheet, "orient" | "grid" | "cell_hint"> | null | undefined): {
  text: string;
  isSuggestion: boolean;
} {
  const raw = typeof sheet?.cell_hint === "string" ? sheet.cell_hint.trim() : "";
  if (raw !== "") return { text: raw, isSuggestion: false };
  return { text: suggestCellHint(sheet), isSuggestion: true };
}
