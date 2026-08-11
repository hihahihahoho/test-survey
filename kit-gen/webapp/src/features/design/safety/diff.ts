/**
 * features/design/safety/diff.ts — SO SÁNH KHÁC BIỆT TỐI THIỂU giữa hai bản thiết kế.
 *
 * Dùng ở 3 chỗ, cùng một hàm để ba chỗ không bao giờ nói khác nhau:
 *   · modal 409 CONTRACT_CONFLICT — "Bản của bạn" ↔ "Bản trên đĩa" (§3-S3 error 409)
 *   · banner khôi phục nháp — nút [So sánh] (§3.7)
 *   · drawer lịch sử — [Xem diff] (§3.7)
 *
 * PHẠM VI CÓ CHỦ ĐÍCH: đây là **so sánh tối thiểu** như brief yêu cầu — mức
 * sheet / element / phong cách. Diff dạng cây từng field là NICE (§7.2), không
 * làm ở đây. Cái người dùng cần trả lời trong 3 giây là: *"tôi mất cái gì nếu
 * chọn nhầm?"* — và câu đó chỉ cần biết sheet/element/phong cách nào thêm, mất,
 * hay đổi.
 *
 * Thuần khiết, không React, không I/O ⇒ test được độc lập.
 */
import { contractVariants, type Contract, type Sheet } from "@/lib/types";

export type ChangeKind = "added" | "removed" | "changed";

export interface DiffRow {
  kind: ChangeKind;
  /** "sheet" | "element" | "phong cách" — CHỮ TIẾNG VIỆT, hiện thẳng ra UI (§1.3). */
  what: string;
  label: string;
  /** giải thích ngắn cho dòng `changed`, vd "16 ô → 15 ô". */
  detail?: string;
}

export interface ContractDiff {
  rows: DiffRow[];
  added: number;
  removed: number;
  changed: number;
  /** true ⇒ hai bản giống nhau ở mức so sánh này. */
  identical: boolean;
}

export interface ContractSummary {
  sheets: number;
  components: number;
  variants: number;
}

/** Số liệu 1 dòng cho mỗi cột của modal so sánh. */
export function summarize(c: Contract | null | undefined): ContractSummary {
  if (!c) return { sheets: 0, components: 0, variants: 0 };
  return {
    sheets: c.sheets.length,
    components: c.sheets.reduce((n, s) => n + s.components.length, 0),
    variants: contractVariants(c).length,
  };
}

export function summaryText(c: Contract | null | undefined): string {
  const s = summarize(c);
  return `${s.sheets} sheet · ${s.components} element · ${s.variants} phong cách`;
}

/** Chữ ký của một sheet để phát hiện "đổi" mà không cần deep-equal cả cây. */
function sheetSignature(sh: Sheet): string {
  return JSON.stringify([
    sh.grid.cols,
    sh.grid.rows,
    sh.orient ?? "",
    sh.components.map((c) => `${c.file}|${c.vi ?? ""}|${c.spec ?? ""}|${JSON.stringify(c.skel ?? null)}`),
  ]);
}

const MAX_ROWS = 40;

/**
 * So `mine` với `theirs`. Chiều đọc: "nếu tôi lấy `mine` thay cho `theirs` thì gì đổi".
 * `added` = có trong `mine`, không có trong `theirs`.
 */
export function diffContracts(mine: Contract | null, theirs: Contract | null): ContractDiff {
  const rows: DiffRow[] = [];
  const a = mine ?? emptyContract();
  const b = theirs ?? emptyContract();

  const mineSheets = new Map(a.sheets.map((s) => [s.id, s]));
  const theirSheets = new Map(b.sheets.map((s) => [s.id, s]));

  for (const [id, sh] of mineSheets) {
    const other = theirSheets.get(id);
    if (!other) {
      rows.push({ kind: "added", what: "Sheet", label: id, detail: `${sh.components.length} element` });
      continue;
    }
    if (sheetSignature(sh) !== sheetSignature(other)) {
      const d =
        sh.components.length !== other.components.length
          ? `${other.components.length} → ${sh.components.length} element`
          : "nội dung element đã đổi";
      rows.push({ kind: "changed", what: "Sheet", label: id, detail: d });
    }
  }
  for (const [id, sh] of theirSheets) {
    if (!mineSheets.has(id)) {
      rows.push({ kind: "removed", what: "Sheet", label: id, detail: `${sh.components.length} element` });
    }
  }

  const mineVars = new Map(contractVariants(a).map((v) => [v.id, v]));
  const theirVars = new Map(contractVariants(b).map((v) => [v.id, v]));
  for (const [id, v] of mineVars) {
    const other = theirVars.get(id);
    if (!other) {
      rows.push({ kind: "added", what: "Phong cách", label: v.vi || id });
    } else if (JSON.stringify(v) !== JSON.stringify(other)) {
      rows.push({ kind: "changed", what: "Phong cách", label: v.vi || id });
    }
  }
  for (const [id, v] of theirVars) {
    if (!mineVars.has(id)) rows.push({ kind: "removed", what: "Phong cách", label: v.vi || id });
  }

  const added = rows.filter((r) => r.kind === "added").length;
  const removed = rows.filter((r) => r.kind === "removed").length;
  const changed = rows.filter((r) => r.kind === "changed").length;

  return {
    rows: rows.slice(0, MAX_ROWS),
    added,
    removed,
    changed,
    identical: rows.length === 0,
  };
}

function emptyContract(): Contract {
  return { sheets: [], variants: [], characterPoses: [] } as unknown as Contract;
}

/** Một câu cho banner/toast: "Bản của bạn có thêm 2 sheet, bớt 1, sửa 3." */
export function diffSentence(d: ContractDiff): string {
  if (d.identical) return "Hai bản giống nhau ở mức sheet, element và phong cách.";
  const parts: string[] = [];
  if (d.added > 0) parts.push(`thêm ${d.added}`);
  if (d.removed > 0) parts.push(`bớt ${d.removed}`);
  if (d.changed > 0) parts.push(`sửa ${d.changed}`);
  return `Khác biệt: ${parts.join(", ")} mục.`;
}
