/**
 * CỬA VÀO ENGINE THẬT CHO TEST — `agent/engine/*.mjs`, nạp và chạy chứ không đọc chữ.
 *
 * ══ 16/09/2026 — VÌ SAO FILE NÀY RA ĐỜI ═══════════════════════════════════════
 * Engine đã port sang JS: `geometry.py` → `agent/engine/geometry.mjs`, `gen.sh` →
 * `gen.mjs` + `prompt.mjs`, `slice.py` → `slice.mjs`. Trước đó các ca đối chiếu
 * engine phải làm một trong hai việc xấu:
 *   · `execFileSync("python3", …)` — bộ test đòi một runtime mà SẢN PHẨM KHÔNG CÒN
 *     dùng; máy không có python thì ca đỏ vì lý do chẳng liên quan gì tới sản phẩm;
 *   · so CHỮ trong mã nguồn python — khoá được cách viết, không khoá được KẾT QUẢ.
 *
 * Nay engine và webapp CÙNG một ngôn ngữ, nên ca mạnh nhất là gọi thẳng hàm của
 * engine và so TỪNG SỐ. Đó đúng là thứ cần khoá: lệch một pixel giữa hộp webapp hứa
 * và hộp dao cắt cắt thì không có gì đỏ ở đâu cả — prompt vẫn hợp lệ, ảnh vẫn về.
 *
 * ⚠️ `import()` ĐỘNG với một URL dựng lúc chạy, KHÔNG phải `import` tĩnh. Hai lý do:
 *   · `agent/engine` nằm NGOÀI `webapp/`, ngoài `include` của `tsconfig.json`, và
 *     `allowJs` đang tắt — một specifier tĩnh sẽ làm `tsc --noEmit` đỏ (TS2307);
 *   · bật `allowJs` chỉ để test đọc được engine là kéo cả `scripts/*.mjs` vào diện
 *     typecheck, một cái giá không ai xin.
 * `/* @vite-ignore *\/` giữ vite/vitest khỏi cố gom file ngoài root vào bundle test.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Gốc repo `kit-gen/` — webapp/src/__tests__ → src → webapp → kit-gen. */
export const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

/** Đọc NGUYÊN VĂN một file của repo (đường dẫn tính từ `kit-gen/`). */
export function readRepo(path: string): string {
  return readFileSync(resolve(REPO, path), "utf8");
}

/** Bộ số học của engine — `agent/engine/geometry.mjs`, chỉ phần webapp soi tới. */
export interface EngineGeometry {
  /** làm tròn KIỂU PYTHON (nửa chừng về số chẵn) — 1254/4 = 313,5 là ca có thật. */
  pyRound(x: number, ndigits?: number): number;
  CANVAS: Record<string, [number, number, string, string]>;
  BOTTOM_ANCHOR_RATIO: number;
  CELL_MARGIN_RATIO: number;
  CELL_MARGIN_RATIO_DECOR: number;
  DRAW_SCALE_STEP: number;
  DRAW_SHRINK_STEP: number;
  canvas_of(sheet: unknown): [number, number, string, string];
  cell_size(w: number, h: number, cols: number, rows: number): [number, number];
  cell_origin(w: number, h: number, cols: number, rows: number, index: number): [number, number];
  cell_box(w: number, h: number, cols: number, rows: number, index: number): [number, number, number, number];
  safe_offset_in_cell(cellW: number, cellH: number, skel: unknown): [number, number, number, number];
  cell_margin_ratio(skel: unknown): number;
  cell_inner(cellW: number, cellH: number, margin?: number): [number, number];
  max_fit_box(cellW: number, cellH: number, aspect: number, margin?: number): [number, number];
  draw_scale(cellW: number, cellH: number, outW: number, outH: number, margin?: number): number;
  draw_box(cellW: number, cellH: number, outW: number, outH: number, margin?: number): [number, number, number];
  cell_kind(skel: unknown): "empty" | "full" | "safe";
}

let cached: Promise<EngineGeometry> | null = null;

/** Nạp `agent/engine/geometry.mjs` THẬT (một lần cho cả file test). */
export function engineGeometry(): Promise<EngineGeometry> {
  cached ??= import(/* @vite-ignore */ pathToFileURL(resolve(REPO, "agent/engine/geometry.mjs")).href) as Promise<EngineGeometry>;
  return cached;
}
