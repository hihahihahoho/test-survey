/**
 * features/docs/lib/brief-read.ts — ĐỌC bộ trả lời form intake đầu bài (FE-1 · task C2).
 *
 * ╔═ RANH GIỚI CỦA FILE NÀY — đọc trước khi thêm bất cứ hàm nào ═════════════════════════╗
 * ║ CHỈ ĐỌC. File này KHÔNG sinh contract, KHÔNG gọi API, KHÔNG gọi LLM, KHÔNG ghi đĩa.  ║
 * ║ FE-PLAN §3-C2 nói thẳng: "KHÔNG ánh xạ sang contract, KHÔNG gọi LLM, KHÔNG code      ║
 * ║ build-styles.mjs". INTAKE-SPEC §1 cũng ghi bước 7a/7b/7c CHƯA TỒN TẠI.               ║
 * ║ Vì vậy đầu ra lớn nhất mà file này dám trả về là `ProjectPrefillHint` — đúng hai      ║
 * ║ trường chữ để prefill Ô TÊN dự án ở FE-2, không hơn.                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * NGUỒN DỮ LIỆU: `teams/brief-intake/prefill-vcb.json` (thật, 72 field: cao 27 · tb 18 ·
 * thấp 5 · trống 22 — INTAKE-SPEC §1) và khối 5 điểm mâu thuẫn đặt đầu form
 * `surveys/vcb-brief-intake-2026.json` (item `q0001`).
 *
 * BA LUẬT KHÔNG ĐƯỢC PHÁ:
 *  1. **`thap` và `trong` ⇒ `noteOnly`.** Ở tầng dữ liệu KHÔNG có đường nào biến field độ tin
 *     cậy thấp/trống thành đầu vào máy móc: `prefillable` là `false`, và `prefillValues()` lọc
 *     chúng ra trước khi trả. Lý do: cùng một tính năng đã ra 3 bản estimate 52/33.5/30 man-day
 *     vì đoán hộ khách (INTAKE-SPEC §0).
 *  2. **5 điểm mâu thuẫn giữ NGUYÊN VĂN + nguồn.** Không tóm tắt, không sửa chính tả, không
 *     xếp lại thứ tự. `conflicts[i].text` phải bằng đúng chuỗi trong form.
 *  3. **Bản ghi hỏng ⇒ bỏ qua và ĐẾM, không ném ra UI** (cùng tinh thần `docs-repo-local.ts`
 *     luật 1). Một field rác không được giết cả bản brief.
 */
import { z } from "zod";

/* ────────────────────────────── 1 · SCHEMA ────────────────────────────── */

/** Bốn mức tin cậy — đúng `_confidence_legend` của `prefill-vcb.json`. */
export const BRIEF_CONFIDENCES = ["cao", "tb", "thap", "trong"] as const;
export type BriefConfidence = (typeof BRIEF_CONFIDENCES)[number];

/** Mức nào được phép chảy tiếp vào form tạo dự án. Đây là hiện thân của LUẬT 1. */
const PREFILLABLE: ReadonlySet<BriefConfidence> = new Set<BriefConfidence>(["cao", "tb"]);

/**
 * Giá trị một câu trả lời. Cố ý KHÔNG dùng `z.any()`: chỉ nhận đúng các kiểu mà form sinh ra
 * (chữ · số · chọn nhiều). Object lồng nhau bị loại ⇒ không ai lén nhét payload lạ vào brief.
 */
export const briefValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
  z.null(),
]);
export type BriefValue = z.infer<typeof briefValueSchema>;

/** Một field như nó nằm trong file JSON. */
export const briefFieldRawSchema = z.object({
  question: z.string().min(1),
  value: briefValueSchema,
  source: z.string().nullable().default(null),
  confidence: z.enum(BRIEF_CONFIDENCES),
  note: z.string().optional(),
});

/** Một điểm mâu thuẫn — `text` là NGUYÊN VĂN, không được biến đổi (LUẬT 2). */
export const briefConflictSchema = z.object({
  index: z.number().int().positive(),
  text: z.string().min(1),
  source: z.string().min(1),
});
export type BriefConflict = z.infer<typeof briefConflictSchema>;

/** Cả bộ trả lời. `sections` giữ nguyên thứ tự trang của form (9 trang). */
export const briefBundleSchema = z.object({
  formId: z.string().min(1),
  sections: z.record(z.string(), z.record(z.string(), z.unknown())),
  conflicts: z.array(briefConflictSchema).default([]),
});

/* ─────────────────────── 2 · CẤU TRÚC TRUNG GIAN ─────────────────────── */

/** Field đã đọc xong — thêm `id`, `section` và hai cờ quyết định (LUẬT 1). */
export interface BriefField {
  id: string;
  section: string;
  question: string;
  value: BriefValue;
  source: string | null;
  confidence: BriefConfidence;
  note?: string;
  /** `true` khi độ tin cậy là `thap`/`trong` HOẶC giá trị rỗng ⇒ chỉ được hiện làm ghi chú. */
  noteOnly: boolean;
  /** Nghịch đảo có kiểm tra giá trị: chỉ `cao`/`tb` VÀ có giá trị thật mới được prefill. */
  prefillable: boolean;
  /** Không có giá trị (null / chuỗi rỗng / mảng rỗng). */
  empty: boolean;
}

export type BriefConfidenceTally = Record<BriefConfidence, number> & { total: number };

export interface BriefReadResult {
  formId: string;
  fields: BriefField[];
  /** Tra nhanh theo `field_id`. */
  byId: Record<string, BriefField>;
  /** Nhóm theo độ tin cậy — dùng để vẽ 4 nhóm trong UI FE-2. */
  byConfidence: Record<BriefConfidence, BriefField[]>;
  /** Đếm từng mức + tổng. Đây là con số phải khớp INTAKE-SPEC §1. */
  tally: BriefConfidenceTally;
  /** Field còn trống — chính là danh sách "câu đang chặn estimate". */
  missing: BriefField[];
  /** 5 điểm mâu thuẫn, nguyên văn + nguồn. */
  conflicts: BriefConflict[];
  /** Bản ghi không hợp schema: bỏ qua nhưng phải đếm được (LUẬT 3). */
  skipped: { path: string; reason: string }[];
}

/* ───────────────────────────── 3 · HÀM ĐỌC ───────────────────────────── */

function isEmptyValue(v: BriefValue): boolean {
  if (v === null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

const emptyTally = (): BriefConfidenceTally => ({ cao: 0, tb: 0, thap: 0, trong: 0, total: 0 });
const emptyGroups = (): Record<BriefConfidence, BriefField[]> => ({ cao: [], tb: [], thap: [], trong: [] });

/**
 * Đọc bộ trả lời intake → cấu trúc trung gian typed.
 *
 * @param input JSON đã `JSON.parse` (KHÔNG nhận đường dẫn file — file này không đụng đĩa).
 * @throws {BriefReadError} chỉ khi khung ngoài (`formId`/`sections`/`conflicts`) hỏng. Field
 *         hỏng lẻ thì rơi vào `skipped`, không ném.
 */
export function readBrief(input: unknown): BriefReadResult {
  const outer = briefBundleSchema.safeParse(input);
  if (!outer.success) {
    throw new BriefReadError(outer.error.issues.map((i) => `${i.path.join(".") || "$"}: ${i.message}`));
  }
  const bundle = outer.data;

  const fields: BriefField[] = [];
  const skipped: { path: string; reason: string }[] = [];

  for (const [section, rawFields] of Object.entries(bundle.sections)) {
    for (const [id, raw] of Object.entries(rawFields)) {
      const parsed = briefFieldRawSchema.safeParse(raw);
      if (!parsed.success) {
        skipped.push({ path: `${section}.${id}`, reason: parsed.error.issues[0]?.message ?? "không hợp schema" });
        continue;
      }
      const f = parsed.data;
      const empty = isEmptyValue(f.value);
      const noteOnly = !PREFILLABLE.has(f.confidence) || empty;
      fields.push({
        id,
        section,
        question: f.question,
        value: f.value,
        source: f.source,
        confidence: f.confidence,
        ...(f.note ? { note: f.note } : {}),
        noteOnly,
        prefillable: !noteOnly,
        empty,
      });
    }
  }

  const byId: Record<string, BriefField> = {};
  const byConfidence = emptyGroups();
  const tally = emptyTally();
  for (const f of fields) {
    byId[f.id] = f;
    byConfidence[f.confidence].push(f);
    tally[f.confidence] += 1;
    tally.total += 1;
  }

  return {
    formId: bundle.formId,
    fields,
    byId,
    byConfidence,
    tally,
    missing: fields.filter((f) => f.empty),
    conflicts: bundle.conflicts,
    skipped,
  };
}

/** Khung ngoài hỏng. Message viết cho NGƯỜI THƯỜNG; chi tiết nằm ở `issues` (panel dev). */
export class BriefReadError extends Error {
  readonly name = "BriefReadError";
  readonly code = "BRIEF_UNREADABLE";
  constructor(readonly issues: string[]) {
    super("Không đọc được bộ trả lời đầu bài. Có thể file được xuất từ phiên bản form khác.");
  }
}

/* ─────────────────── 4 · LỌC RA THỨ ĐƯỢC PHÉP DÙNG TIẾP ─────────────────── */

/**
 * Map `field_id → value` CHỈ gồm field `prefillable`. Đây là cổng duy nhất mà dữ liệu brief
 * được phép đi ra khỏi file này ở dạng máy đọc. Field `thap`/`trong` bị chặn TẠI ĐÂY, không
 * phải ở tầng UI — UI quên kiểm thì vẫn không rò được (LUẬT 1).
 */
export function prefillValues(res: BriefReadResult): Record<string, BriefValue> {
  const out: Record<string, BriefValue> = {};
  for (const f of res.fields) if (f.prefillable) out[f.id] = f.value;
  return out;
}

/** Ghi chú hiện cho người dùng đọc — mọi field `noteOnly`, kèm nguồn/cảnh báo. */
export interface BriefNote {
  id: string;
  section: string;
  question: string;
  confidence: BriefConfidence;
  source: string | null;
  note?: string;
  /** `true` = chưa có câu trả lời (đang chặn estimate); `false` = có nhưng tin cậy thấp. */
  blocking: boolean;
}

export function noteOnlyItems(res: BriefReadResult): BriefNote[] {
  return res.fields
    .filter((f) => f.noteOnly)
    .map((f) => ({
      id: f.id,
      section: f.section,
      question: f.question,
      confidence: f.confidence,
      source: f.source,
      ...(f.note ? { note: f.note } : {}),
      blocking: f.empty,
    }));
}

/**
 * Gợi ý prefill cho màn TẠO DỰ ÁN của FE-2 — cố ý NGHÈO NÀN.
 *
 * Chỉ hai trường chữ, đều lấy từ field độ tin cậy `cao`. KHÔNG có sheet, KHÔNG có style,
 * KHÔNG có màu, KHÔNG có số lượng ô — những thứ đó là contract, và contract không thuộc C2.
 * Ai muốn thêm trường vào đây phải sửa FE-PLAN §3-C2 trước.
 */
export interface ProjectPrefillHint {
  /** Điền vào ô "Tên dự án". `null` khi brief không nói. */
  name: string | null;
  /** Câu một dòng để hiện dưới ô tên: brief này còn thiếu bao nhiêu câu. */
  summary: string;
  /** Số field đang trống — hiện thành cảnh báo, KHÔNG chặn tạo dự án. */
  missingCount: number;
  /** Số điểm mâu thuẫn giữ nguyên văn. */
  conflictCount: number;
}

export function projectPrefillHint(res: BriefReadResult): ProjectPrefillHint {
  const nameField = res.byId["project_name"];
  const name =
    nameField && nameField.prefillable && typeof nameField.value === "string" ? nameField.value.trim() : null;
  const missingCount = res.missing.length;
  const conflictCount = res.conflicts.length;
  const summary =
    missingCount === 0 && conflictCount === 0
      ? `Đầu bài đã đủ ${res.tally.total} câu.`
      : `Đầu bài còn ${missingCount} câu chưa trả lời và ${conflictCount} điểm cần chốt lại.`;
  return { name, summary, missingCount, conflictCount };
}

/* ───────── 5 · ĐỌC THẲNG `prefill-vcb.json` (hình dạng khác, cùng nội dung) ───────── */

/**
 * `teams/brief-intake/prefill-vcb.json` không có `formId`/`conflicts`: nó là 9 khoá section ở
 * mức gốc, cộng các khoá meta bắt đầu bằng `_`. Hàm này chỉ ĐỔI HÌNH DẠNG, không đổi nội dung
 * (không thêm field, không suy giá trị) để `readBrief` chạy được trên chính file thật —
 * tiêu chí ① của FE-PLAN §3-C2.
 *
 * `conflicts` phải truyền từ ngoài vào vì file prefill KHÔNG chứa chúng; nguyên văn 5 điểm nằm
 * trong `surveys/vcb-brief-intake-2026.json` item `q0001`. Không truyền ⇒ mảng rỗng, và đó là
 * sự thật chứ không phải "không có mâu thuẫn".
 */
export function bundleFromPrefill(
  raw: unknown,
  opts: { formId?: string; conflicts?: BriefConflict[] } = {},
): { formId: string; sections: Record<string, unknown>; conflicts: BriefConflict[] } {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new BriefReadError(["$: bộ prefill phải là một object"]);
  }
  const sections: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (k.startsWith("_")) continue; // khoá meta: _about, _form, _sources…
    if (v !== null && typeof v === "object" && !Array.isArray(v)) sections[k] = v;
  }
  return { formId: opts.formId ?? "vcb-brief-intake-2026", sections, conflicts: opts.conflicts ?? [] };
}
