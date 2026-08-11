/**
 * features/project/lib/matrix.ts — MA TRẬN TIẾN ĐỘ (phong cách × sheet) của S2.
 *
 * NGUỒN SỰ THẬT DUY NHẤT: `project.state.jobs` (§6.2-B) — map `<variant>-<sheet>`
 * → 1 trong 7 trạng thái §5.7, do agent tính bằng cách so mtime chuỗi
 * contract → prompts → raw → kits (đã đọc `agent/lib/projects.mjs:computeState`).
 * Client TUYỆT ĐỐI không tự suy từ exit code và không tự stat file — web tĩnh
 * không làm được, và §6.2 đã chốt "UI không được tự suy từ `rc`".
 *
 * ĐƯỜNG LÙI ĐÃ CÓ TRONG SPEC (§7.5-U2): nếu agent chưa trả `state.jobs` thì hiển
 * thị trạng thái mức SHEET suy từ `staleReason`, và ĐÁNH DẤU `degraded: true` để
 * màn NÓI THẬT ("chưa đọc được tiến độ từng lượt") thay vì vẽ ô xanh giả.
 *
 * File thuần khiết: không React, không I/O ⇒ test bằng Node.
 */
import { contractVariants, sheetVariantFilter, type Contract, type Project } from "@/lib/types";
import { JOB_STATUS, mergeJobStatus, type JobStatus } from "@/lib/status";

export interface MatrixVariant {
  id: string;
  /** nhãn hiện ra UI (`vi`), rơi về id khi phong cách chưa đặt tên. */
  label: string;
}

export interface MatrixSheet {
  id: string;
  cols: number;
  rows: number;
  /** số element thật trong sheet (để thẻ Bản thiết kế đối chiếu với cols×rows). */
  components: number;
}

export interface MatrixCell {
  /** khoá ô trong lưới: `<variantId>|<sheetId>`. */
  key: string;
  /** khoá lượt sinh ảnh `<variantId>-<sheetId>` — CHỈ dùng nội bộ, không hiện ra UI (§1.3). */
  job: string;
  variant: MatrixVariant;
  sheet: MatrixSheet;
  /** false ⇒ sheet này giới hạn `variants[]` và không áp cho phong cách này. */
  applies: boolean;
  status: JobStatus;
}

export interface ProgressMatrix {
  variants: MatrixVariant[];
  sheets: MatrixSheet[];
  cells: Map<string, MatrixCell>;
  /** đếm theo từng trạng thái — dùng cho chú giải; chỉ tính ô CÓ áp dụng. */
  counts: Record<JobStatus, number>;
  /** tổng số ô có áp dụng (= tổng số lượt sinh ảnh của bản thiết kế). */
  total: number;
  /** true ⇒ số liệu là suy đoán mức sheet, PHẢI nói ra với user (§7.5-U2). */
  degraded: boolean;
}

const ALL_STATUSES = Object.keys(JOB_STATUS) as JobStatus[];

function zeroCounts(): Record<JobStatus, number> {
  const out = {} as Record<JobStatus, number>;
  for (const s of ALL_STATUSES) out[s] = 0;
  return out;
}

/** Khoá lượt sinh ảnh — ĐÚNG `contractJobs()` của agent (`agent/lib/contract.mjs`). */
export function jobKey(variantId: string, sheetId: string): string {
  return `${variantId}-${sheetId}`;
}

/** Nhãn hiện ra UI cho một lượt: "Tết đỏ · main". Không bao giờ có chữ "job". */
export function jobLabel(variantLabel: string, sheetId: string): string {
  return `${variantLabel} · ${sheetId}`;
}

export function variantsOf(contract: Contract | null | undefined): MatrixVariant[] {
  if (!contract) return [];
  return contractVariants(contract)
    .filter((v) => typeof v.id === "string" && v.id !== "")
    .map((v) => ({ id: v.id, label: v.vi?.trim() ? v.vi.trim() : v.id }));
}

export function sheetsOf(contract: Contract | null | undefined): MatrixSheet[] {
  if (!contract) return [];
  return contract.sheets
    .filter((s) => typeof s.id === "string" && s.id !== "")
    .map((s) => ({
      id: s.id,
      cols: Number(s.grid?.cols) || 0,
      rows: Number(s.grid?.rows) || 0,
      components: s.components.length,
    }));
}

/**
 * Suy trạng thái mức SHEET khi thiếu `state.jobs` (§7.5-U2). Thà thô còn hơn sai:
 * thứ tự kiểm bám đúng thứ tự agent đẩy vào `staleReason`.
 */
function degradedStatus(project: Project | null | undefined): JobStatus {
  const reasons = project?.state?.staleReason ?? [];
  if (reasons.includes("contract>raw")) return "stale";
  if (reasons.includes("raw>kits")) return "uncut";
  if (project?.state?.stale === true) return "stale";
  return Number(project?.stats?.rawPresent ?? 0) > 0 ? "ok" : "never";
}

/** Dựng ma trận từ bản thiết kế + `project.state.jobs`. */
export function buildMatrix(
  contract: Contract | null | undefined,
  project: Project | null | undefined,
): ProgressMatrix {
  const variants = variantsOf(contract);
  const sheets = sheetsOf(contract);
  const stateJobs = project?.state?.jobs ?? {};
  const hasJobs = Object.keys(stateJobs).length > 0;
  const degraded = variants.length > 0 && sheets.length > 0 && !hasJobs;
  const fallback = degraded ? degradedStatus(project) : "never";

  const cells = new Map<string, MatrixCell>();
  const counts = zeroCounts();
  let total = 0;

  // Bộ lọc `variants[]` của từng sheet, tính TRƯỚC vòng lặp: tra map thay vì
  // `find()` lồng trong hai vòng (13 sheet × 4 phong cách của styles.json thật
  // là 52 lần quét mảng — không cần thiết).
  const filterBySheet = new Map<string, string[]>();
  for (const sh of contract?.sheets ?? []) filterBySheet.set(sh.id, sheetVariantFilter(sh));

  for (const variant of variants) {
    for (const sheet of sheets) {
      const only = filterBySheet.get(sheet.id) ?? [];
      const applies = only.length === 0 || only.includes(variant.id);
      const job = jobKey(variant.id, sheet.id);
      const key = `${variant.id}|${sheet.id}`;
      if (!applies) {
        cells.set(key, { key, job, variant, sheet, applies: false, status: "never" });
        continue;
      }
      const status = degraded ? fallback : (stateJobs[job] ?? "never");
      cells.set(key, { key, job, variant, sheet, applies: true, status });
      counts[status] += 1;
      total += 1;
    }
  }

  return { variants, sheets, cells, counts, total, degraded };
}

export function cellAt(m: ProgressMatrix, variantId: string, sheetId: string): MatrixCell | null {
  return m.cells.get(`${variantId}|${sheetId}`) ?? null;
}

/** Mọi ô đang ở một trạng thái (chỉ ô có áp dụng). */
export function cellsInStatus(m: ProgressMatrix, status: JobStatus): MatrixCell[] {
  return [...m.cells.values()].filter((c) => c.applies && c.status === status);
}

export function cellsOfJobs(m: ProgressMatrix, jobs: readonly string[]): MatrixCell[] {
  const want = new Set(jobs);
  return [...m.cells.values()].filter((c) => c.applies && want.has(c.job));
}

/**
 * Những lượt CẦN sinh ảnh: chưa có · cũ hơn thiết kế · lỗi (đúng tập
 * `[Chỉ thứ đã đổi]` của modal M1). Rỗng ⇒ nút chính chỉ mở modal để user tự chọn.
 */
export function pendingGenJobs(m: ProgressMatrix): string[] {
  return [...m.cells.values()]
    .filter((c) => c.applies && (c.status === "never" || c.status === "stale" || c.status === "failed"))
    .map((c) => c.job);
}

/** Những lượt đã có ảnh mới mà chưa cắt — thao tác RẺ, không tiêu quota. */
export function uncutJobs(m: ProgressMatrix): string[] {
  return cellsInStatus(m, "uncut").map((c) => c.job);
}

/** Có lượt nào đang chạy/đang chờ không (dùng để nhắc nhịp làm mới). */
export function hasBusyJobs(m: ProgressMatrix): boolean {
  return [...m.cells.values()].some((c) => c.applies && (c.status === "running" || c.status === "queued"));
}

/** Gộp một hàng (phong cách) thành 1 trạng thái đại diện — §5.7 thứ tự ưu tiên. */
export function rowStatus(m: ProgressMatrix, variantId: string): JobStatus | null {
  const list = m.sheets
    .map((s) => cellAt(m, variantId, s.id))
    .filter((c): c is MatrixCell => c !== null && c.applies)
    .map((c) => c.status);
  return list.length === 0 ? null : mergeJobStatus(list);
}

/** Nếu tất cả lượt đã chọn thuộc CÙNG một sheet thì trả id sheet đó, ngược lại null. */
export function singleSheetOf(m: ProgressMatrix, jobs: readonly string[]): string | null {
  const cells = cellsOfJobs(m, jobs);
  if (cells.length === 0) return null;
  const first = cells[0]!.sheet.id;
  return cells.every((c) => c.sheet.id === first) ? first : null;
}

/** Danh sách tên hiển thị của vài ô đầu + "+N" — dùng cho dòng phụ của thẻ Việc tiếp theo. */
export function cellNames(cells: readonly MatrixCell[], max = 4): string {
  const names = cells.slice(0, max).map((c) => jobLabel(c.variant.label, c.sheet.id));
  return cells.length > max ? `${names.join(" · ")} · +${cells.length - max}` : names.join(" · ");
}
