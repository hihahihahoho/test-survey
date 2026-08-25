/**
 * features/kit/lib/figma-board.ts — "COPY CHO FIGMA": 4 pha CÓ TIẾN TRÌNH, HUỶ ĐƯỢC (đóng H5).
 *
 * ╔══ BỆNH CŨ ĐANG CHỮA (audit H5) ═══════════════════════════════════════════╗
 * ║ `studio.html:699-738`: bấm 📋 → có thể âm thầm chạy slice 1–2 phút, chèn    ║
 * ║ `<div>` rộng 2400px vào DOM, decode hàng chục ảnh, rồi mới copy. Không có   ║
 * ║ tiến trình, không huỷ được. Người dùng không biết máy treo hay đang chạy.   ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * BỐN PHA Ở ĐÂY, mỗi pha báo tiến trình và kiểm cờ huỷ giữa từng bước:
 *   1/4 Chuẩn bị  — tính bố cục + tỉ lệ (mascot 1:1, UI 50% — `export-scale.ts`)
 *   2/4 Tải ảnh   — qua transport, hàng đợi 6 request (`image-source.ts`), N/M
 *   3/4 Ghép bảng — vẽ lên `<canvas>` kèm nhãn tên + cỡ
 *   4/4 Copy      — `ClipboardItem` image/png
 *
 * ╔══ TRUNG THỰC VỀ GIỚI HẠN — ĐỌC TRƯỚC KHI HỨA VỚI AI ══════════════════════╗
 * ║ ① Dán vào Figma ra MỘT ẢNH BITMAP của cả bảng, KHÔNG phải từng layer rời.  ║
 * ║   Điều đó VẪN ĐÚNG với file này và không định sửa: đây là đường "cả bảng   ║
 * ║   một lần", và là ĐƯỜNG LÙI khi encoder hỏng.                              ║
 * ║   Node Figma thật (frame safe zone + image fill, clip off) nay đã có, cho   ║
 * ║   TỪNG Ô: `features/kit-core/lib/figma-node.ts` + encoder đã vendored    ║
 * ║   ở `@/vendor/figma-h2d` (P3-14, 2026-08-14 — chủ sản phẩm duyệt; trước đó  ║
 * ║   bundle nằm ngoài `webapp/` nên chỗ này từng ghi là không copy vào).       ║
 * ║ ② `navigator.clipboard.write` + `ClipboardItem` cần HTTPS/localhost và một  ║
 * ║   cử chỉ user; tôi KHÔNG kiểm chứng được ở môi trường này (không có trình   ║
 * ║   duyệt). Vì vậy code có ĐƯỜNG LÙI: clipboard hỏng ⇒ tải bảng thành file    ║
 * ║   .png và nói rõ cho user, KHÔNG báo "đã copy" khi chưa copy được.          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
import type { KitFile } from "@/lib/types";
import { loadFull } from "./image-source";
import { exportSize } from "./export-scale";

export type BoardPhase = 1 | 2 | 3 | 4;

export interface BoardProgress {
  phase: BoardPhase;
  /** Câu tiếng Việt cho thanh tiến trình — KHÔNG chứa thuật ngữ kỹ thuật (§1.3). */
  label: string;
  done: number;
  total: number;
}

export const PHASE_LABEL: Record<BoardPhase, string> = {
  1: "Chuẩn bị danh sách",
  2: "Tải ảnh từ máy bạn",
  3: "Ghép bảng element",
  4: "Đưa vào bộ nhớ tạm",
};

export interface BoardCell {
  file: KitFile;
  x: number;
  y: number;
  w: number;
  h: number;
  caption: string;
}

export interface BoardLayout {
  cells: BoardCell[];
  width: number;
  height: number;
}

const PAD = 24;
const GAP = 24;
const CAPTION_H = 18;
const BOARD_W = 2400; // giữ đúng bề rộng bảng của studio.html:721

/**
 * Bố cục kiểu "kệ" (shelf packing): xếp ngang tới khi hết bề rộng thì xuống dòng,
 * chiều cao dòng = ô cao nhất của dòng đó. Hàm THUẦN ⇒ test được không cần canvas.
 */
export function packBoard(
  files: readonly KitFile[],
  poseFiles: ReadonlySet<string>,
  boardWidth: number = BOARD_W,
): BoardLayout {
  const cells: BoardCell[] = [];
  let x = PAD;
  let y = PAD;
  let rowH = 0;
  const inner = Math.max(boardWidth - PAD * 2, 1);

  for (const f of files) {
    const size = exportSize(f, poseFiles);
    // Ảnh thiếu w/h (agent không đọc được cỡ) vẫn phải có ô — đừng bỏ file đi im lặng.
    const w = Math.max(size.w ?? 96, 24);
    const h = Math.max(size.h ?? 96, 24);
    if (x > PAD && x - PAD + w > inner) {
      x = PAD;
      y += rowH + GAP;
      rowH = 0;
    }
    cells.push({ file: f, x, y, w, h, caption: `${f.file} · ${size.label}` });
    x += w + GAP;
    rowH = Math.max(rowH, h + CAPTION_H);
  }
  return { cells, width: boardWidth, height: y + rowH + PAD };
}

export interface BoardResult {
  /** "clipboard" = đã vào bộ nhớ tạm · "download" = đường lùi, đã tải file .png */
  outcome: "clipboard" | "download";
  files: number;
  width: number;
  height: number;
  /** Lý do phải dùng đường lùi — hiện trong panel "Chi tiết cho lập trình viên". */
  fallbackReason?: string;
}

export class BoardCancelled extends Error {
  constructor() {
    super("Đã huỷ theo yêu cầu");
    this.name = "BoardCancelled";
  }
}

export interface BoardOptions {
  projectId: string;
  files: readonly KitFile[];
  poseFiles: ReadonlySet<string>;
  variantLabel: string;
  onProgress: (p: BoardProgress) => void;
  signal: AbortSignal;
}

const throwIfAborted = (signal: AbortSignal) => {
  if (signal.aborted) throw new BoardCancelled();
};

/**
 * Chạy cả 4 pha. Huỷ giữa pha 2 sẽ bỏ luôn các request còn trong hàng đợi
 * (`LoadHandle.cancel`), không để chúng chạy tiếp và ăn băng thông vô ích.
 */
export async function buildFigmaBoard(opts: BoardOptions): Promise<BoardResult> {
  const { projectId, files, poseFiles, onProgress, signal } = opts;

  /* ── 1/4 Chuẩn bị ───────────────────────────────────────────────────── */
  onProgress({ phase: 1, label: PHASE_LABEL[1], done: 0, total: files.length });
  throwIfAborted(signal);
  const usable = files.filter((f) => !f.empty);
  const layout = packBoard(usable, poseFiles);
  onProgress({ phase: 1, label: PHASE_LABEL[1], done: usable.length, total: usable.length });

  /* ── 2/4 Tải ảnh ────────────────────────────────────────────────────── */
  const handles = layout.cells.map((c) => loadFull(projectId, c.file.path));
  const onAbort = () => handles.forEach((h) => h.cancel());
  signal.addEventListener("abort", onAbort, { once: true });

  const bitmaps: (ImageBitmap | HTMLImageElement | null)[] = [];
  try {
    for (let i = 0; i < handles.length; i += 1) {
      throwIfAborted(signal);
      onProgress({ phase: 2, label: PHASE_LABEL[2], done: i, total: handles.length });
      try {
        const url = await handles[i]!.promise;
        bitmaps.push(await decode(url));
      } catch {
        // Một ảnh lỗi KHÔNG được giết cả bảng: để trống ô đó, vẫn copy phần còn lại.
        bitmaps.push(null);
      }
    }
    onProgress({ phase: 2, label: PHASE_LABEL[2], done: handles.length, total: handles.length });

    /* ── 3/4 Ghép bảng ────────────────────────────────────────────────── */
    throwIfAborted(signal);
    onProgress({ phase: 3, label: PHASE_LABEL[3], done: 0, total: 1 });
    const blob = await drawBoard(layout, bitmaps, signal);
    onProgress({ phase: 3, label: PHASE_LABEL[3], done: 1, total: 1 });

    /* ── 4/4 Copy ─────────────────────────────────────────────────────── */
    throwIfAborted(signal);
    onProgress({ phase: 4, label: PHASE_LABEL[4], done: 0, total: 1 });
    const outcome = await toClipboardOrDownload(blob, opts.variantLabel);
    onProgress({ phase: 4, label: PHASE_LABEL[4], done: 1, total: 1 });

    return {
      outcome: outcome.ok ? "clipboard" : "download",
      files: usable.length,
      width: layout.width,
      height: layout.height,
      ...(outcome.reason ? { fallbackReason: outcome.reason } : {}),
    };
  } finally {
    signal.removeEventListener("abort", onAbort);
    for (const b of bitmaps) if (b !== null && "close" in b) b.close();
  }
}

async function decode(url: string): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    const res = await fetch(url); // object URL nội bộ — KHÔNG ra mạng, không cần header
    return createImageBitmap(await res.blob());
  }
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("không giải mã được ảnh"));
    img.src = url;
  });
}

async function drawBoard(
  layout: BoardLayout,
  bitmaps: readonly (ImageBitmap | HTMLImageElement | null)[],
  signal: AbortSignal,
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext("2d");
  if (ctx === null) throw new Error("trình duyệt không cho vẽ canvas");

  // Nền TRẮNG có chủ đích: bảng này để dán vào Figma, nền trong suốt làm designer
  // không thấy element sáng màu. Bản thân file PNG trong kit vẫn giữ alpha.
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";
  ctx.font = "11px ui-sans-serif, -apple-system, sans-serif";

  for (let i = 0; i < layout.cells.length; i += 1) {
    throwIfAborted(signal);
    const cell = layout.cells[i]!;
    const bmp = bitmaps[i] ?? null;
    if (bmp !== null) {
      ctx.drawImage(bmp as CanvasImageSource, cell.x, cell.y, cell.w, cell.h);
    } else {
      // B3: viền ô trống trước đây là xám ÁM XANH DƯƠNG, nay là xám trung tính
      // (bảng xuất ra file PNG nền trắng nên giá trị này cố ý không dùng token).
      ctx.strokeStyle = "#C6C6C6";
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(cell.x + 0.5, cell.y + 0.5, cell.w - 1, cell.h - 1);
      ctx.setLineDash([]);
    }
    ctx.fillStyle = "#333333";
    ctx.fillText(cell.caption, cell.x, cell.y + cell.h + 3, Math.max(cell.w, 120));
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("không tạo được ảnh bảng"))), "image/png");
  });
}

/** Copy thật; không được thì TẢI FILE và nói rõ — không bao giờ báo "đã copy" khi chưa. */
async function toClipboardOrDownload(
  blob: Blob,
  variantLabel: string,
): Promise<{ ok: boolean; reason?: string }> {
  const name = `kit-figma-${slug(variantLabel)}.png`;
  try {
    if (typeof ClipboardItem === "function" && navigator.clipboard?.write) {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return { ok: true };
    }
    download(blob, name);
    return { ok: false, reason: "Trình duyệt này không cho ghi ảnh vào bộ nhớ tạm (thiếu ClipboardItem)." };
  } catch (e) {
    download(blob, name);
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
}

function slug(s: string): string {
  return (
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "kit"
  );
}
