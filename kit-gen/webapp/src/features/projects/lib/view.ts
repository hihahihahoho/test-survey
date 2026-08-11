/**
 * features/projects/lib/view.ts — LỌC · TÌM · SẮP XẾP cho S1 (§3-S1-1).
 *
 * Thuần hàm, không đụng React/DOM ⇒ test được và không kéo theo render.
 * Port nghiệp vụ từ `web/js/screens/projects/data.js` (đã qua QA chức năng).
 *
 * Chú ý một chốt nghiệp vụ dễ sai: project HỎNG (`broken`) thuộc nhóm **Lỗi**,
 * KHÔNG tính vào "Chưa xong" — nếu không thì số của chip đếm và kết quả lọc lệch
 * nhau, và user sẽ thấy "Chưa xong 3" nhưng bấm vào chỉ ra 2 thẻ.
 */
import type { Project } from "@/lib/types";
import { JOB_STATUS_PRIORITY, type JobStatus } from "@/lib/status";
import type { FilterChip, SortBy, SortDir } from "@/lib/store";
import { foldCase } from "./format";

/** Trạng thái tổng hợp của 1 project. `broken`/`empty` là 2 ca ngoài 7 trạng thái §5.7. */
export type ProjectState = JobStatus | "broken" | "empty";

export const CHIPS: readonly { id: FilterChip; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "need-gen", label: "Cần sinh ảnh" },
  { id: "running", label: "Đang chạy" },
  { id: "failed", label: "Lỗi" },
  { id: "unfinished", label: "Chưa xong" },
] as const;

export const SORTS: readonly { id: SortBy; label: string }[] = [
  { id: "updated", label: "Sửa gần nhất" },
  { id: "name", label: "Tên A→Z" },
  { id: "size", label: "Dung lượng" },
  { id: "created", label: "Ngày tạo" },
] as const;

/** Gộp `state.jobs` thành 1 trạng thái đại diện, đúng thứ tự ưu tiên §5.7. */
export function projectState(p: Project): ProjectState {
  if (p.broken) return "broken";
  const values = Object.values(p.state?.jobs ?? {});
  if (values.length === 0) return "empty";
  for (const s of JOB_STATUS_PRIORITY) if (values.includes(s)) return s;
  return "ok";
}

export type ChipCounts = Record<FilterChip, number>;

/** Đếm THẬT trên dữ liệu đang có — không đoán, không hardcode. */
export function chipCounts(items: readonly Project[]): ChipCounts {
  const c: ChipCounts = { all: items.length, "need-gen": 0, running: 0, failed: 0, unfinished: 0 };
  for (const p of items) {
    const st = projectState(p);
    if (st === "broken") { c.failed += 1; continue; }
    if (st === "failed") { c.failed += 1; c.unfinished += 1; continue; }
    if (st === "running" || st === "queued") { c.running += 1; c.unfinished += 1; continue; }
    if (st === "stale" || st === "never" || st === "empty") { c["need-gen"] += 1; c.unfinished += 1; continue; }
    if (st === "uncut") c.unfinished += 1;
  }
  return c;
}

function matchChip(p: Project, chip: FilterChip): boolean {
  const st = projectState(p);
  switch (chip) {
    case "need-gen": return st === "stale" || st === "never" || st === "empty";
    case "running": return st === "running" || st === "queued";
    case "failed": return st === "broken" || st === "failed";
    case "unfinished": return st !== "ok" && st !== "broken";
    default: return true;
  }
}

/**
 * Tìm mờ trên tên + tag + id. Cho gõ thiếu dấu ("xuan" ra "Xuân") và gõ rời
 * ("tvb" ra "Tết VietinBank"). Điểm càng cao càng khớp; 0 = không khớp.
 */
export function fuzzyScore(haystack: string, needle: string): number {
  const h = foldCase(haystack);
  const n = foldCase(needle);
  if (n === "") return 1;
  const at = h.indexOf(n);
  if (at !== -1) return 100 - Math.min(at, 60);
  let i = 0;
  let hits = 0;
  for (const ch of n) {
    const found = h.indexOf(ch, i);
    if (found === -1) return 0;
    i = found + 1;
    hits += 1;
  }
  return Math.max(1, 40 - (i - hits));
}

export interface ViewOptions {
  query?: string;
  chip?: FilterChip;
  tags?: readonly string[];
  sortBy?: SortBy;
  dir?: SortDir;
}

function cmp(a: Project, b: Project, key: SortBy): number {
  if (key === "name") return -String(a.name ?? "").localeCompare(String(b.name ?? ""), "vi");
  if (key === "size") return (a.stats?.diskBytes ?? 0) - (b.stats?.diskBytes ?? 0);
  if (key === "created") return String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? ""));
  return String(a.updatedAt ?? "").localeCompare(String(b.updatedAt ?? ""));
}

/** Lọc + sắp xếp. KHÔNG đổi mảng gốc (nó là cache của TanStack Query). */
export function applyView(items: readonly Project[], opts: ViewOptions = {}): Project[] {
  const { query = "", chip = "all", tags = [], sortBy = "updated", dir = "desc" } = opts;
  let out = items.filter((p) => matchChip(p, chip));
  if (tags.length > 0) out = out.filter((p) => tags.every((t) => (p.tags ?? []).includes(t)));

  const q = query.trim();
  if (q !== "") {
    // Đã sắp theo ĐỘ KHỚP thì không sort lại theo tiêu chí khác — người gõ tìm
    // muốn thấy cái khớp nhất trước, không phải cái mới sửa nhất.
    return out
      .map((p) => ({ p, s: fuzzyScore(`${p.name} ${(p.tags ?? []).join(" ")} ${p.id}`, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.p);
  }
  const sign = dir === "asc" ? 1 : -1;
  return [...out].sort((a, b) => sign * cmp(a, b, sortBy));
}

/** Tập tag CÓ THẬT trong danh sách + số đếm — để chip tag không bịa ra tag không tồn tại. */
export function allTags(items: readonly Project[]): [string, number][] {
  const m = new Map<string, number>();
  for (const p of items) for (const t of p.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "vi"));
}

/** Dòng trạng thái trên thẻ (§3-S1-2 vùng 6). `action` ⇒ có nút hành động ngay cạnh (§5.7). */
export const STATE_ROW: Record<ProjectState, { badge: JobStatus; text: string; action?: string }> = {
  ok: { badge: "ok", text: "Mọi thứ đã đồng bộ" },
  stale: { badge: "stale", text: "Thiết kế đã đổi sau lần sinh ảnh cuối", action: "Xem việc cần làm" },
  uncut: { badge: "uncut", text: "Có ảnh mới nhưng chưa cắt", action: "Xem việc cần làm" },
  never: { badge: "never", text: "Chưa sinh ảnh lần nào", action: "Bắt đầu" },
  queued: { badge: "queued", text: "Đang chờ tới lượt" },
  running: { badge: "running", text: "Đang sinh ảnh" },
  failed: { badge: "failed", text: "Có lượt sinh ảnh bị lỗi", action: "Xem lỗi" },
  empty: { badge: "never", text: "Chưa bắt đầu", action: "Chọn element" },
  broken: { badge: "failed", text: "Không đọc được project" },
};
