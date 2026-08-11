/**
 * features/gen/lib/gen-cost.ts — GIÁ MỘT LỆNH GEN, tính theo BA-V3 §3.2.
 *
 * LUẬT SỐ MỘT: **user chỉ thấy "lượt hỏi"**, không thấy tấm/lưới/ô (§5.4 cấm các chữ đó).
 * Nhưng con số phải đúng mô hình chi phí thật của hệ thống, nếu không hộp GEN sẽ nói dối
 * về tiền:
 *   · ảnh nền        → 1 lần gọi máy vẽ  ⇒ ~1 lượt
 *   · tư thế nhân vật → 1 lần gọi        ⇒ ~1 lượt
 *   · nhóm món       → **cả nhóm một lần** ⇒ ~1 lượt, dù 1 món hay 9 món
 *   · cả bộ kit      → mỗi thứ trên bàn một lần ⇒ ~N lượt
 *
 * THUẦN HÀM: không React, không DOM, không mạng, **không import `lib/api/**`**
 * (có test tĩnh canh — FE3-PLAN §3-C2).
 */
import { GEN_GROUP_NOTE, type GenKind } from "./gen-kinds";

/**
 * Phút cho MỘT lượt vẽ. Số này lấy **nguyên văn** từ UX-V3 §4.1
 * («Tốn ~1 lượt hỏi · khoảng 1–2 phút»).
 *
 * ⚠️ NÓI THẲNG MỘT CHỖ LỆCH: `features/runs/lib/estimate.ts` (glob R) đang dùng
 * `SECONDS_PER_JOB = [90, 150]` ⇒ nếu quy ra phút thì là «2–3 phút», không phải «1–2 phút».
 * Hai con số này do hai tài liệu khác nhau đặt ra và **chưa ai đo thật**. Tôi giữ chữ của
 * UX-V3 vì đây là copy đã chốt cho màn này, và ghi mâu thuẫn ở `NEEDS-fe3-c.md` N7 để
 * người có số đo thật chốt một bộ duy nhất. Không tự chọn bên rồi im lặng.
 */
export const GEN_MINUTES_PER_JOB: readonly [number, number] = [1, 2];

export interface GenCostInput {
  kind: GenKind;
  /** Số món đang chọn (chỉ có nghĩa với lệnh «Món giao diện»). */
  componentCount?: number;
  /** Số thứ đang có trên bàn sẽ được vẽ lại (chỉ có nghĩa với «Cả bộ kit»). */
  boardItemCount?: number;
}

export interface GenCost {
  /** Số lượt hỏi ước lượng. Luôn ≥ 0; 0 nghĩa là **chưa có gì để vẽ**. */
  units: number;
  /** «Tốn ~1 lượt hỏi · khoảng 1–2 phút» — chuỗi chốt, màn KHÔNG tự ghép. */
  line: string;
  /** Câu nói thật kèm theo (nhóm món / cả bộ kit). Rỗng = không có câu bắt buộc. */
  note: string;
}

function nonNegInt(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/** Số lượt cho một lệnh. Đây là hàm CHỐT của mô hình chi phí, mọi chỗ khác gọi nó. */
export function genUnits(input: GenCostInput): number {
  switch (input.kind) {
    case "bg":
    case "pose":
      return 1;
    case "element":
      // ĐÚNG chỗ dễ nói dối nhất: 1 món cũng 1 lượt, 9 món cũng 1 lượt.
      // Chưa chọn món nào ⇒ 0 (nút Vẽ phải khoá, không phải "miễn phí").
      return nonNegInt(input.componentCount) > 0 ? 1 : 0;
    case "kit":
      /*
       * TODO(wave nối thật · NEEDS-fe3-c N10): ở FE-3 đây là **số thứ trên bàn**, vì bàn
       * chỉ có object mock, chưa cái nào là một tấm thật. Đúng về MÔ HÌNH (mỗi thứ một
       * lượt), chưa chắc đúng về LƯỢNG khi nối thật — lúc đó phải đếm theo `contractJobs()`.
       */
      return nonNegInt(input.boardItemCount);
    default:
      return 0;
  }
}

/** Khoảng phút cho `units` lượt. Trả `[lo, hi]` đã làm tròn, tối thiểu 1 phút. */
export function genMinutes(units: number): [number, number] {
  const n = nonNegInt(units);
  if (n === 0) return [0, 0];
  return [
    Math.max(1, n * GEN_MINUTES_PER_JOB[0]),
    Math.max(1, n * GEN_MINUTES_PER_JOB[1]),
  ];
}

/** «khoảng 1–2 phút» · «khoảng 5 phút» khi hai đầu bằng nhau. */
export function minutesPhrase(units: number): string {
  const [lo, hi] = genMinutes(units);
  if (lo === 0) return "";
  return lo === hi ? `khoảng ${lo} phút` : `khoảng ${lo}–${hi} phút`;
}

/**
 * Dòng chi phí của UX-V3 §4.1. Giữ chữ «~» và «khoảng» ở mọi ca — đây là **ước lượng**,
 * không phải giá niêm yết (luật N5 «sự thật hơn sự mượt»).
 */
export function genCostLine(units: number): string {
  const n = nonNegInt(units);
  if (n === 0) return "Chưa có gì để vẽ.";
  return `Tốn ~${n} lượt hỏi · ${minutesPhrase(n)}`;
}

/** «Sẽ vẽ 5 thứ đang có trên bàn · ~5 lượt.» — câu thứ ba bắt buộc của §4.1. */
export function wholeKitNote(boardItemCount: number): string {
  const n = nonNegInt(boardItemCount);
  if (n === 0) return "Bàn chưa có gì để vẽ lại.";
  return `Sẽ vẽ ${n} thứ đang có trên bàn · ~${n} lượt.`;
}

/** Gói đủ ba thứ cho panel: số lượt + dòng chi phí + câu nói thật. */
export function genCost(input: GenCostInput): GenCost {
  const units = genUnits(input);
  let note = "";
  if (input.kind === "element") note = GEN_GROUP_NOTE;
  if (input.kind === "kit") note = wholeKitNote(input.boardItemCount ?? 0);
  return { units, line: genCostLine(units), note };
}
