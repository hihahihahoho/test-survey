/**
 * features/kit/lib/export-scale.ts — QUY ƯỚC TỈ LỆ KHI XUẤT: mascot 1:1, UI 50%.
 *
 * ╔══ NGUỒN GỐC QUY ƯỚC (đọc code thật, không nghe truyền miệng) ══════════════╗
 * ║ `studio.html:715-723`:                                                     ║
 * ║   // Kích thước NHẤT QUÁN theo hệ toạ độ thiết kế: asset gen là @2x nên     ║
 * ║   // element UI + bg hiển thị 50% …; riêng MASCOT pose giữ 1:1 theo yêu cầu.║
 * ║   const scale = a.file.startsWith("pose-") ? 1 : 0.5;                      ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══ NHƯNG LUẬT CŨ SAI VỚI DỮ LIỆU THẬT — TÔI ĐO ĐƯỢC ═══════════════════════╗
 * ║ `startsWith("pose-")` chỉ bắt được tên kiểu `pose-taxi-idle`. Đếm trên      ║
 * ║ `kits/manifest.json` thật của repo:                                        ║
 * ║                                                                            ║
 * ║   kit    file mascot   luật cũ nhận đúng   SAI                             ║
 * ║   ipay        38              38            0                              ║
 * ║   candy        8               0            8   ← 27-pose-idle …            ║
 * ║   tet         16               8            8                              ║
 * ║   rnd         16               8            8                              ║
 * ║                                                                            ║
 * ║ ⇒ 24 file mascot (`27-pose-idle`, `28-pose-wave`, `30-pose-hold-gift`…)     ║
 * ║   bị luật cũ xuất ở 50%, tức nhân vật nhỏ đi một nửa so với ý muốn.         ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 *
 * SỬA: ưu tiên BẢN THIẾT KẾ (`skel.shape === "pose"` — đúng thứ `skeleton.py` và
 * `silhouettes.js` dùng để vẽ khung xương nhân vật), chỉ khi không có contract mới
 * rơi về tên file, và regex rộng hơn: `(^|[-_])pose(-|$)`.
 * Kiểm lại trên `styles.json` thật: 76 ô `shape:"pose"` (`pose-lan-idle`…) — khớp.
 */
import type { KitFile } from "@/lib/types";
import type { Contract } from "@/lib/types/contract";

/** Ảnh AI sinh ra ở @2x so với hệ toạ độ thiết kế ⇒ UI hiển thị 50%. */
export const UI_SCALE = 0.5;
/** Mascot giữ nguyên 1:1 (yêu cầu cũ của dự án, `studio.html:715`). */
export const MASCOT_SCALE = 1;

/** Tên file kiểu mascot: `pose-lan-idle`, `27-pose-idle`, `char_pose-wave`. */
const RE_POSE_NAME = /(^|[-_])pose(-|_|$)/i;

/** Tập tên file mà contract khai là ô nhân vật (`skel.shape === "pose"`). */
export function poseFileSet(contract: Contract | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const sh of contract?.sheets ?? []) {
    for (const c of sh.components) {
      if (c.skel?.shape === "pose" && c.file !== "") out.add(c.file);
    }
  }
  return out;
}

export type ExportKind = "mascot" | "ui";

export function kindOf(file: KitFile, poseFiles: ReadonlySet<string>): ExportKind {
  if (poseFiles.has(file.file)) return "mascot";
  // Không có contract (hoặc file cũ hơn contract hiện tại) ⇒ đoán theo tên, rộng hơn luật cũ.
  return RE_POSE_NAME.test(file.file) ? "mascot" : "ui";
}

export function scaleOf(file: KitFile, poseFiles: ReadonlySet<string>): number {
  return kindOf(file, poseFiles) === "mascot" ? MASCOT_SCALE : UI_SCALE;
}

export interface ExportSize {
  kind: ExportKind;
  scale: number;
  /** cỡ hiển thị (đã áp tỉ lệ) — làm tròn như `studio.html:723` */
  w: number | null;
  h: number | null;
  /** cỡ pixel thật của file */
  srcW: number | null;
  srcH: number | null;
  /** Câu giải thích cho tooltip/nhãn — nói cả 2 cỡ khi có scale. */
  label: string;
}

/**
 * @param forced Tỉ lệ ÉP cho riêng ô này, thay cho quy ước mascot/UI ở trên.
 *
 * Có một ca thật cần nó: màn prompt-first co ảnh sao cho lõi model vẽ ra vừa khít
 * hộp cỡ người dùng đã chọn, và tỉ lệ ấy là PHÉP ĐO của từng ô, không phải quy ước
 * (`prompt-canvas/lib/result/sheet-files.ts:contractFramed`). Vắng ⇒ không đổi một
 * hành vi nào của màn «Thư viện kit» cũ.
 */
export function exportSize(
  file: KitFile,
  poseFiles: ReadonlySet<string>,
  forced?: number,
): ExportSize {
  const kind = kindOf(file, poseFiles);
  const fit = typeof forced === "number" && Number.isFinite(forced) && forced > 0 ? forced : null;
  const scale = fit ?? (kind === "mascot" ? MASCOT_SCALE : UI_SCALE);
  const srcW = typeof file.w === "number" ? file.w : null;
  const srcH = typeof file.h === "number" ? file.h : null;
  const w = srcW === null ? null : Math.round(srcW * scale);
  const h = srcH === null ? null : Math.round(srcH * scale);
  const dims = w !== null && h !== null ? `${w}×${h}` : "chưa rõ cỡ";
  /* Tỉ lệ ép thì nhãn phải nói LÝ DO ép, và chỉ nói khi có gì để nói: ép đúng 1
     (ô không lệch cỡ) mà in ra «co về 100%» chỉ làm người đọc dừng lại hỏi. Cũng
     không mượn câu «(nhân vật)» của quy ước cũ — ô ép tỉ lệ có thể là ô bất kỳ. */
  const label = fit !== null
    ? Math.abs(fit - 1) > 0.005
      ? `${dims} · co về cỡ xuất đã chọn (${Math.round(fit * 100)}%)`
      : `${dims} · giữ nguyên 1:1`
    : scale === 1
      ? `${dims} · giữ nguyên 1:1 (nhân vật)`
      : `${dims}${srcW !== null && srcH !== null ? ` (ảnh gốc @2x ${srcW}×${srcH})` : ""} · thu 50%`;
  return { kind, scale, w, h, srcW, srcH, label };
}

export interface ScaleBreakdown {
  mascot: number;
  ui: number;
}

export function breakdown(files: readonly KitFile[], poseFiles: ReadonlySet<string>): ScaleBreakdown {
  let mascot = 0;
  for (const f of files) if (kindOf(f, poseFiles) === "mascot") mascot += 1;
  return { mascot, ui: files.length - mascot };
}
