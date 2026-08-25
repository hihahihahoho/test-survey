/**
 * result-copy.ts — ba thao tác copy của menu ⋯ trên một ô kết quả đã cắt.
 *
 * ┌── VÌ SAO TỌA ĐỘ Ô LẤY TỪ CONTRACT, KHÔNG SUY TỪ ẢNH ──────────────────────┐
 * │ PRODUCT-SITEMAP §12: "Tọa độ safe zone lấy trực tiếp từ contract; không    │
 * │ suy ngược từ ảnh AI để làm nguồn sự thật." Sheet gốc là một lưới           │
 * │ `grid.cols × grid.rows` đều nhau trên canvas, nên ô thứ `i` cắt được bằng  │
 * │ số học thuần — không cần dò biên, không cần đọc manifest.                  │
 * └───────────────────────────────────────────────────────────────────────────┘
 *
 * Clipboard ảnh cần `ClipboardItem` + cử chỉ người dùng. Không có thì TẢI FILE và
 * nói đúng chuyện đã xảy ra — không bao giờ báo "đã copy" khi chưa copy được
 * (cùng luật với `features/kit/lib/figma-board.ts`).
 */
import type { Contract, Sheet } from "@/lib/types";

export type CopyOutcome = "clipboard" | "download";

export interface CopyResult {
  outcome: CopyOutcome;
  /** Lý do phải dùng đường lùi — hiện trong toast, không nuốt. */
  reason?: string;
}

export interface CellRect { x: number; y: number; w: number; h: number }

/** Ô thứ `index` của lưới `cols × rows` trên ảnh `width × height`. */
export function cellRect(
  grid: { cols: number; rows: number },
  index: number,
  width: number,
  height: number,
): CellRect {
  const cols = Math.max(1, grid.cols);
  const rows = Math.max(1, grid.rows);
  const cw = width / cols;
  const ch = height / rows;
  const col = index % cols;
  const row = Math.min(rows - 1, Math.floor(index / cols));
  return { x: Math.round(col * cw), y: Math.round(row * ch), w: Math.round(cw), h: Math.round(ch) };
}

export interface ComponentLocation {
  sheet: Sheet;
  index: number;
}

/**
 * Tìm ô nào của sheet nào sinh ra file đã cắt `<file>.png`.
 *
 * `slice.py:963` đặt tên file cắt ra **đúng bằng** `component.file` + `.png`, nên đối
 * chiếu theo tên là chính xác chứ không phải phỏng đoán. `sheetId` (nếu biết, do agent
 * trả trong `kits/manifest.json`) chỉ dùng để thu hẹp — hai sheet có thể trùng tên ô
 * `_empty-1`, và ô trống thì không có gì để copy.
 */
export function locateComponent(
  contract: Pick<Contract, "sheets">,
  file: string,
  sheetId?: string | null,
): ComponentLocation | null {
  const wanted = String(file ?? "").replace(/\.png$/i, "");
  const sheets = sheetId ? contract.sheets.filter((s) => s.id === sheetId) : contract.sheets;
  for (const sheet of sheets.length > 0 ? sheets : contract.sheets) {
    const index = sheet.components.findIndex((c) => c.file === wanted);
    if (index >= 0) return { sheet, index };
  }
  return null;
}

/** Job sinh ra một sheet — `gen.sh` ghi ảnh thô ra `raw/<variant>-<sheet>.png`. */
export function rawSheetPath(variant: string, sheetId: string): string {
  return `raw/${variant}-${sheetId}.png`;
}

/* ══════════════════════════════════════════════════════════════════════════
   Phần chạm DOM — tách khỏi phần thuần ở trên để test được số học mà không
   cần canvas.
   ══════════════════════════════════════════════════════════════════════════ */

async function decode(url: string): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    const res = await fetch(url); // object URL nội bộ, không ra mạng
    return createImageBitmap(await res.blob());
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("không giải mã được ảnh"));
    img.src = url;
  });
}

const sizeOf = (bmp: ImageBitmap | HTMLImageElement) =>
  "naturalWidth" in bmp ? { w: bmp.naturalWidth, h: bmp.naturalHeight } : { w: bmp.width, h: bmp.height };

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("không tạo được ảnh"))), "image/png");
  });
}

/** Ảnh nguyên tấm từ object URL → PNG blob (giữ alpha). */
export async function blobOfImage(url: string): Promise<Blob> {
  const bmp = await decode(url);
  const { w, h } = sizeOf(bmp);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("trình duyệt không cho vẽ canvas");
  ctx.drawImage(bmp as CanvasImageSource, 0, 0);
  if ("close" in bmp) bmp.close();
  return toBlob(canvas);
}

/**
 * Cắt một ô ra khỏi sheet thô. Tỉ lệ lưới tính theo KÍCH THƯỚC THẬT của ảnh, vì
 * `raw/*.png` do model trả về không luôn đúng 1536×1024 (handoff §8.1 đã ghi ca
 * 1254×1254). Chia theo ảnh thật ⇒ vẫn đúng ô, và tuyệt đối không scale lệch trục.
 */
export async function cropCellBlob(url: string, grid: { cols: number; rows: number }, index: number): Promise<Blob> {
  const bmp = await decode(url);
  const { w, h } = sizeOf(bmp);
  const rect = cellRect(grid, index, w, h);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, rect.w);
  canvas.height = Math.max(1, rect.h);
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("trình duyệt không cho vẽ canvas");
  ctx.drawImage(bmp as CanvasImageSource, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
  if ("close" in bmp) bmp.close();
  return toBlob(canvas);
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Copy ảnh vào bộ nhớ tạm; hỏng thì tải file và TRẢ VỀ SỰ THẬT đó. */
export async function copyImageBlob(blob: Blob, fileName: string): Promise<CopyResult> {
  try {
    if (typeof ClipboardItem === "function" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return { outcome: "clipboard" };
    }
    download(blob, fileName);
    return { outcome: "download", reason: "Trình duyệt này không cho ghi ảnh vào bộ nhớ tạm." };
  } catch (e) {
    download(blob, fileName);
    return { outcome: "download", reason: e instanceof Error ? e.message : String(e) };
  }
}
