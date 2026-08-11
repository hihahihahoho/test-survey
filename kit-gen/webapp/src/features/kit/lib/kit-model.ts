/**
 * features/kit/lib/kit-model.ts — HÀM THUẦN của S5: lọc, gom nhóm, phán STALE, dựng ma trận.
 * Không React, không I/O ⇒ test được bằng Node (xem `__tests__/kit-model.test.ts`).
 *
 * NGUỒN DỮ LIỆU (đã đối chiếu agent thật, không đoán):
 *   · #42 `GET /api/projects/:id/kit?variant=` → `{variant, cutAt, files[], sheets{}}`
 *     `files[i] = {file, path, w, h, bytes, sheet, cellIndex, empty, mtime}`
 *     — `mtime` KHÔNG có trong schema §6.2 nhưng agent CÓ trả (agent/routes/files.mjs
 *       dòng cuối), và `kitFileSchema` của R0 là `looseObject` nên nó đi qua nguyên vẹn.
 *       Tôi đọc nó qua `fileMtime()` có phòng hờ, không phụ thuộc cứng.
 *   · `project.state.jobs` → map `<variant>-<sheet>` → 1 trong 7 trạng thái §5.7.
 *     Đây là nguồn CHÍNH của cảnh báo stale, vì chỉ agent stat được cả chuỗi
 *     contract→prompts→raw→kits.
 */
import type { Kit, KitFile, Project } from "@/lib/types";
import { contractVariants, sheetVariantFilter, type Contract, type Variant } from "@/lib/types/contract";

/* ═════════ Phong cách ═════════ */

export interface VariantOption {
  id: string;
  /** Nhãn hiện ra UI — tên tiếng Việt, rơi về id nếu chưa đặt tên (§1.3). */
  label: string;
}

export function variantOptions(contract: Contract | null | undefined): VariantOption[] {
  if (!contract) return [];
  return contractVariants(contract).map((v: Variant) => ({ id: v.id, label: v.vi || v.id }));
}

/** Sheet nào áp cho phong cách này (rỗng = mọi phong cách) — khớp `contractJobs` của agent. */
export function sheetsOfVariant(contract: Contract | null | undefined, variantId: string): string[] {
  if (!contract) return [];
  return contract.sheets
    .filter((sh) => {
      const only = sheetVariantFilter(sh);
      return only.length === 0 || only.includes(variantId);
    })
    .map((sh) => sh.id);
}

/** `<variant>-<sheet>` — DANH TỪ đối chiếu contract, không phải substring filter (đóng E7). */
export function jobKey(variantId: string, sheetId: string): string {
  return `${variantId}-${sheetId}`;
}

/* ═════════ STALE ═════════ */

export type StaleReason = "design-changed" | "uncut" | "failed" | null;

/**
 * Tập sheet cần làm lại của một phong cách, kèm LÝ DO.
 *
 * Vì sao phân biệt `stale` với `uncut`: hành động khắc phục KHÁC NHAU.
 *   · `stale` (thiết kế đổi sau lần sinh cuối) ⇒ phải SINH LẠI (tốn quota) ⇒ qua modal M1.
 *   · `uncut` (có ảnh mới, chưa cắt)           ⇒ chỉ cần CẮT (miễn phí, §1.2 "tái tạo rẻ").
 * Bản vanilla gộp cả hai vào một Set và luôn mời [Cắt lại] — với ca `stale` thì cắt lại
 * KHÔNG sửa được gì (ảnh raw vẫn là ảnh cũ), user cắt xong vẫn thấy cảnh báo. Đây là chỗ
 * tôi cố ý làm khác bản vanilla.
 */
export function staleMap(
  project: Project | null | undefined,
  contract: Contract | null | undefined,
  variantId: string | null,
): Map<string, StaleReason> {
  const out = new Map<string, StaleReason>();
  if (!variantId) return out;
  const jobs = project?.state?.jobs ?? {};
  for (const sheetId of sheetsOfVariant(contract, variantId)) {
    const st = jobs[jobKey(variantId, sheetId)];
    if (st === "stale") out.set(sheetId, "design-changed");
    else if (st === "uncut") out.set(sheetId, "uncut");
    else if (st === "failed") out.set(sheetId, "failed");
  }
  return out;
}

export interface StaleSummary {
  /** Sheet cần SINH LẠI — nút phải mở modal M1 (tốn quota). */
  needGen: string[];
  /** Sheet chỉ cần CẮT — miễn phí. */
  needSlice: string[];
  /** Sheet có lượt lỗi — mời xem nhật ký. */
  failed: string[];
  /** Số FILE bị ảnh hưởng, để viết đúng câu "N file cũ hơn ảnh đã sinh". */
  staleFiles: number;
}

export function summarizeStale(files: readonly KitFile[], map: Map<string, StaleReason>): StaleSummary {
  const needGen: string[] = [];
  const needSlice: string[] = [];
  const failed: string[] = [];
  for (const [sheetId, reason] of map) {
    if (reason === "design-changed") needGen.push(sheetId);
    else if (reason === "uncut") needSlice.push(sheetId);
    else if (reason === "failed") failed.push(sheetId);
  }
  const affected = new Set([...needGen, ...needSlice]);
  return {
    needGen: needGen.sort(),
    needSlice: needSlice.sort(),
    failed: failed.sort(),
    staleFiles: files.filter((f) => f.sheet !== undefined && f.sheet !== null && affected.has(f.sheet)).length,
  };
}

export function isStaleFile(f: KitFile, map: Map<string, StaleReason>): boolean {
  if (f.sheet === undefined || f.sheet === null) return false;
  const r = map.get(f.sheet);
  return r === "design-changed" || r === "uncut";
}

/* ═════════ Lọc & gom nhóm ═════════ */

export interface AssetFilter {
  query: string;
  sheet: string;
  /** true ⇒ chỉ hiện file có vấn đề (rỗng / cũ hơn thiết kế). */
  onlyProblems: boolean;
}

export const EMPTY_FILTER: AssetFilter = { query: "", sheet: "", onlyProblems: false };

/** Bỏ dấu + hạ chữ để "sao" tìm được "01-icon-sao". Cùng thuật toán `foldCase` của S1. */
export function fold(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export function filterFiles(
  files: readonly KitFile[],
  filter: AssetFilter,
  stale: Map<string, StaleReason>,
): KitFile[] {
  const q = fold(filter.query.trim());
  return files.filter((f) => {
    if (filter.sheet !== "" && f.sheet !== filter.sheet) return false;
    if (filter.onlyProblems && !f.empty && !isStaleFile(f, stale)) return false;
    if (q !== "" && !fold(f.file).includes(q)) return false;
    return true;
  });
}

export interface SheetGroup {
  sheetId: string;
  /** Nhãn hiện ra UI. Sheet không rõ nguồn thì nói thẳng, không để chuỗi rỗng. */
  label: string;
  files: KitFile[];
  reason: StaleReason;
}

/** Gom theo sheet, giữ THỨ TỰ XUẤT HIỆN của file (agent đã sort theo tên). */
export function groupBySheet(files: readonly KitFile[], stale: Map<string, StaleReason>): SheetGroup[] {
  const map = new Map<string, KitFile[]>();
  for (const f of files) {
    const key = f.sheet ?? "";
    const list = map.get(key);
    if (list) list.push(f);
    else map.set(key, [f]);
  }
  return [...map.entries()].map(([sheetId, list]) => ({
    sheetId,
    label: sheetId === "" ? "Không rõ sheet nguồn" : sheetId,
    files: list,
    reason: sheetId === "" ? null : (stale.get(sheetId) ?? null),
  }));
}

/* ═════════ Tổng hợp số liệu ═════════ */

export interface KitTotals {
  files: number;
  bytes: number;
  emptyFiles: number;
  cutAt: string | null;
}

export function kitTotals(kit: Kit | null | undefined): KitTotals {
  const files = kit?.files ?? [];
  return {
    files: files.length,
    bytes: files.reduce((n, f) => n + (Number(f.bytes) || 0), 0),
    emptyFiles: files.filter((f) => f.empty).length,
    cutAt: kit?.cutAt ?? null,
  };
}

/**
 * `mtime` để CACHE-BUST theo từng file, KHÔNG theo tick toàn cục (§3-S5 success:
 * "cache-bust theo mtime, không theo tick toàn cục" — bệnh H4 của v1 là `?rawTick`
 * làm cả lưới tải lại từ đầu sau mỗi lượt).
 */
export function fileMtime(f: KitFile): string | null {
  const v = (f as { mtime?: unknown }).mtime;
  return typeof v === "string" && v !== "" ? v : null;
}

/** Khoá React ổn định cho một ô: đổi khi file trên đĩa đổi, giữ nguyên khi chỉ lọc lại. */
export function cellKey(f: KitFile): string {
  return `${f.path}@${fileMtime(f) ?? f.bytes ?? 0}`;
}

/* ═════════ Ma trận element × phong cách ═════════ */

export interface MatrixRow {
  /** tên element, vd `01-btn-primary` */
  name: string;
  sheet: string | null;
  /** variantId → file, thiếu = chưa có ảnh */
  byVariant: Map<string, KitFile>;
  /** số phong cách CÓ ảnh dùng được (không rỗng) */
  present: number;
  /** true ⇒ chưa đủ ảnh ở mọi phong cách ⇒ thuộc "chỗ khác nhau" */
  differs: boolean;
}

/**
 * Dựng ma trận: hàng = element, cột = phong cách.
 * Hợp MỌI tên element xuất hiện ở BẤT KỲ phong cách nào — nếu chỉ lấy theo phong cách
 * đầu thì element chỉ có ở phong cách thứ hai sẽ biến mất khỏi bảng so sánh, đúng loại
 * "thiếu mà không ai biết" mà J1 nói tới (v1: 18/78 ảnh 404 câm).
 */
export function buildMatrix(
  variants: readonly VariantOption[],
  kits: ReadonlyMap<string, Kit | null>,
): MatrixRow[] {
  const rows = new Map<string, { sheet: string | null; byVariant: Map<string, KitFile> }>();
  for (const v of variants) {
    for (const f of kits.get(v.id)?.files ?? []) {
      let row = rows.get(f.file);
      if (!row) {
        row = { sheet: f.sheet ?? null, byVariant: new Map() };
        rows.set(f.file, row);
      }
      if (row.sheet === null && f.sheet) row.sheet = f.sheet;
      row.byVariant.set(v.id, f);
    }
  }
  return [...rows.entries()]
    .map(([name, r]) => {
      const present = variants.filter((v) => {
        const f = r.byVariant.get(v.id);
        return f !== undefined && !f.empty;
      }).length;
      return {
        name,
        sheet: r.sheet,
        byVariant: r.byVariant,
        present,
        differs: present !== variants.length,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

export function filterMatrix(rows: readonly MatrixRow[], opts: { diffOnly: boolean; query: string }): MatrixRow[] {
  const q = fold(opts.query.trim());
  return rows.filter((r) => {
    if (opts.diffOnly && !r.differs) return false;
    if (q !== "" && !fold(r.name).includes(q)) return false;
    return true;
  });
}
