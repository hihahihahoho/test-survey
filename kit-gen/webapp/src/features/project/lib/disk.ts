/**
 * features/project/lib/disk.ts — PHÂN RÃ DUNG LƯỢNG cho thẻ "Dung lượng" của S2b.
 *
 * Nguồn: `stats.diskBreakdown` (#9). Khoá do agent chốt trong
 * `agent/lib/projects.mjs:DISK_GROUPS` — đã đọc file thật, đúng 7 khoá:
 *   raw · rawHistory · kits · skeleton · runs · refs · prompts
 * (`runs` gộp cả `runs/` và `logs/`; `rawHistory` là `.history/raw`).
 *
 * HAI LUẬT, đều có lý do:
 *  1. Khoá LẠ do agent mới thêm → BỎ QUA, không làm vỡ màn (§6.5-6).
 *  2. Khoá THIẾU → KHÔNG hiện dòng đó, và KHÔNG hiện "0 B". "0 B" là một khẳng
 *     định sai ("thư mục này rỗng"), còn thiếu dòng chỉ là thiếu thông tin.
 *     Thà thiếu số hơn số sai.
 *
 * "Bản thiết kế" (contract.json + .history/contract) KHÔNG có trong breakdown của
 * agent. Ta không bịa ra nó: phần chênh giữa tổng và các nhóm được gộp vào dòng
 * "Khác" và nói rõ nó gồm gì.
 */
import type { DiskBreakdown, ProjectStats } from "@/lib/types";
import type { CleanTarget } from "@/lib/types";

export interface DiskRow {
  key: keyof DiskBreakdown | "other";
  label: string;
  /** Câu ngắn nói nhóm này có tái tạo được không — quyết mức xác nhận (§1.2). */
  hint: string;
  bytes: number;
  /** Mục tương ứng ở modal Dọn cache; `null` ⇒ không dọn được ở đây. */
  cleanTarget: CleanTarget | null;
}

/** Thứ tự hiển thị + nhãn VI — khớp 6 dòng wireframe §3-S2b, giọng theo §1.3. */
const GROUPS: { key: keyof DiskBreakdown; label: string; hint: string; cleanTarget: CleanTarget | null }[] = [
  { key: "raw", label: "Ảnh AI đã sinh", hint: "sinh lại sẽ tốn quota", cleanTarget: null },
  { key: "rawHistory", label: "Lịch sử ảnh AI", hint: "3 đời ảnh cũ, dọn được", cleanTarget: "rawHistory" },
  { key: "kits", label: "Kit đã cắt", hint: "cắt lại được", cleanTarget: "kits" },
  { key: "skeleton", label: "Khung xương", hint: "tái tạo trong vài giây", cleanTarget: "skeleton" },
  { key: "prompts", label: "Prompt đã dựng", hint: "tái tạo trong khoảng 1 giây", cleanTarget: "prompts" },
  { key: "runs", label: "Nhật ký & lượt chạy", hint: "bằng chứng chạy, dọn theo tuổi", cleanTarget: "oldLogs" },
  { key: "refs", label: "Ảnh tham khảo", hint: "không tái tạo được", cleanTarget: null },
];

/** Các dòng CÓ dữ liệu. Rỗng ⇒ agent chưa trả `diskBreakdown` (bản cũ). */
export function diskRows(stats: ProjectStats | null | undefined): DiskRow[] {
  const bd = stats?.diskBreakdown;
  if (!bd) return [];
  const rows: DiskRow[] = [];
  let sum = 0;
  for (const g of GROUPS) {
    const v = Number(bd[g.key]);
    if (!Number.isFinite(v) || v <= 0) continue;
    sum += v;
    rows.push({ key: g.key, label: g.label, hint: g.hint, bytes: v, cleanTarget: g.cleanTarget });
  }
  if (rows.length === 0) return [];

  // Phần chênh: contract.json, project.json, lịch sử bản thiết kế, file lạ user để trong
  // thư mục project. Chỉ hiện khi đáng kể (>1% và >64 KB) để không sinh dòng nhiễu.
  const total = Number(stats?.diskBytes ?? 0);
  const other = total - sum;
  if (Number.isFinite(total) && other > 65536 && other > total * 0.01) {
    rows.push({
      key: "other",
      label: "Bản thiết kế & phần khác",
      hint: "gồm bản thiết kế và lịch sử của nó — không dọn ở đây",
      bytes: other,
      cleanTarget: null,
    });
  }
  return rows;
}

/** Tổng của các dòng phân rã (để đối chiếu với `diskBytes`, không thay thế nó). */
export function diskRowsTotal(rows: readonly DiskRow[]): number {
  return rows.reduce((n, r) => n + r.bytes, 0);
}

/**
 * Có gì để "dọn ảnh cũ" không (nút [Dọn ảnh AI cũ] của S2b).
 * Chỉ tính `rawHistory`: đó là thứ duy nhất trong nhóm "ảnh" mà dọn được — ảnh
 * AI đang dùng thì §4.5 ghi rõ "KHÔNG BAO GIỜ bị dọn ở đây".
 */
export function rawHistoryBytes(stats: ProjectStats | null | undefined): number {
  const v = Number(stats?.diskBreakdown?.rawHistory);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** Tổng các nhóm tái tạo được — dùng cho câu "có thể giải phóng khoảng …". */
export function reclaimableBytes(stats: ProjectStats | null | undefined): number {
  const bd = stats?.diskBreakdown;
  if (!bd) return 0;
  return (["rawHistory", "kits", "skeleton", "prompts"] as const).reduce((n, k) => {
    const v = Number(bd[k]);
    return Number.isFinite(v) && v > 0 ? n + v : n;
  }, 0);
}
