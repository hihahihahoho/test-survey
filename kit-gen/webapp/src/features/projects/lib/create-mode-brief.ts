/**
 * features/projects/lib/create-mode-brief.ts — ĐỌC ĐẦU BÀI KHÁCH cho dialog tạo project (FE-2 · B2).
 *
 * NGUỒN: UI-SPEC-V2 §1.3 (nhánh "✦ Từ brief khách") · FE2-PLAN §3-B2 · §4 (ranh giới mock).
 *
 * ╔═ RANH GIỚI CỦA FILE NÀY ════════════════════════════════════════════════════════════╗
 * ║ Đây là lớp TRÌNH BÀY mỏng đặt trên `features/docs/lib/brief-read.ts` (provider C2    ║
 * ║ của FE-1). Nó KHÔNG parse lại, KHÔNG tự nghĩ ra luật tin cậy, KHÔNG ánh xạ field →   ║
 * ║ contract, KHÔNG gọi LLM, KHÔNG chạm `build-styles.mjs`, KHÔNG đọc đĩa, KHÔNG fetch.  ║
 * ║ Mọi quyết định "field nào được phép chảy tiếp" nằm ở `prefillValues()` của C2 —      ║
 * ║ file này chỉ ĐẾM, NHÓM và ĐẶT CÂU CHỮ.                                              ║
 * ╚═════════════════════════════════════════════════════════════════════════════════════╝
 *
 * BỐN LUẬT:
 *  1. **`thap`/`trong` không bao giờ thành dữ liệu máy.** `briefPrefill()` chỉ lấy từ
 *     `projectPrefillHint()`, và `projectPrefillHint()` chỉ đọc field `prefillable`.
 *     Có thêm một cổng kiểm thừa (`prefillIsClean`) để test khoá được luật này ở tầng B.
 *  2. **Chọn brief GỢI Ý mode canvas, không ép.** §1.3 nói "ép mode = CANVAS … nhưng vẫn
 *     cho đổi"; ở đây gợi ý + nói lý do, quyền quyết định vẫn của người dùng (§1.1-1).
 *  3. **Mâu thuẫn giữ NGUYÊN VĂN.** Không tóm tắt, không sửa chính tả (LUẬT 2 của C2).
 *  4. **Lỗi nói bằng tiếng người; chi tiết kỹ thuật đi lối riêng** (`detail`) để UI đổ vào
 *     panel «Chi tiết cho lập trình viên». Thân UI không được thấy `error.message`.
 */
import {
  BriefReadError,
  bundleFromPrefill,
  noteOnlyItems,
  prefillValues,
  projectPrefillHint,
  readBrief,
  type BriefConflict,
  type BriefNote,
  type BriefReadResult,
} from "@/features/docs/lib/brief-read";
import type { CreateMode } from "./create-mode";

/* ═════════════ 1 · NGUỒN ═════════════ */

/** V1 chỉ hai nguồn, đều chạy 100% ở máy người dùng (§1.3). */
export const BRIEF_SOURCES = ["file", "paste"] as const;
export type BriefSource = (typeof BRIEF_SOURCES)[number];

/** Trần kích thước chuỗi JSON nhận vào. Bộ trả lời thật ~41 KB; 4 MB là rộng rãi. */
export const BRIEF_MAX_BYTES = 4 * 1024 * 1024;

/* ═════════════ 2 · KẾT QUẢ ĐỌC ═════════════ */

export interface BriefNoteGroup {
  section: string;
  /** Tên trang tiếng Việt nếu biết; không biết thì để NGUYÊN id, không bịa. */
  label: string;
  items: BriefNote[];
}

export interface BriefSummary {
  formId: string;
  /** Tên tệp người dùng chọn (nguồn `paste` thì `null`). */
  fileName: string | null;
  total: number;
  /** Đếm theo đúng bốn mức của form. */
  tally: { cao: number; tb: number; thap: number; trong: number };
  /** Số field ĐƯỢC PHÉP dùng làm dữ liệu (chỉ `cao`/`tb` và có giá trị). */
  usableCount: number;
  /** Số field chỉ được làm GHI CHÚ. */
  noteOnlyCount: number;
  /** Số câu chưa có câu trả lời — đếm theo GIÁ TRỊ, có thể lệch nhãn `trong` (xem C2). */
  missingCount: number;
  conflicts: BriefConflict[];
  noteGroups: BriefNoteGroup[];
  /** Bản ghi lệch schema bị bỏ qua — hiện ra, không giấu. */
  skippedCount: number;
  /** Câu một dòng của C2 ("Đầu bài còn N câu chưa trả lời và M điểm cần chốt lại."). */
  summaryLine: string;
  /** Thứ DUY NHẤT chảy vào form: tên dự án. `null` = brief không nói. */
  prefillName: string | null;
  suggestedMode: CreateMode;
  suggestReason: string;
}

/** 9 trang của form intake (INTAKE-SPEC §1). Không có trong bảng ⇒ hiện nguyên id. */
const SECTION_LABELS: Record<string, string> = {
  sec_meta: "Hạng mục & bối cảnh",
  sec_lb: "Look back",
  sec_game: "Game",
  sec_char: "Nhân vật",
  sec_style: "Phong cách",
  sec_scope: "Phạm vi màn hình",
  sec_brand: "Thương hiệu & điều cấm",
  sec_deliver: "Motion · âm thanh · bàn giao",
  sec_time: "Thời hạn & đơn giá",
};

export function sectionLabel(section: string): string {
  return SECTION_LABELS[section] ?? section;
}

/** Gom ghi chú theo trang, giữ NGUYÊN thứ tự trang mà file đưa ra. */
export function groupNotes(notes: readonly BriefNote[]): BriefNoteGroup[] {
  const order: string[] = [];
  const bucket = new Map<string, BriefNote[]>();
  for (const n of notes) {
    if (!bucket.has(n.section)) {
      bucket.set(n.section, []);
      order.push(n.section);
    }
    bucket.get(n.section)!.push(n);
  }
  return order.map((s) => ({ section: s, label: sectionLabel(s), items: bucket.get(s)! }));
}

/**
 * Gợi ý mode. §1.3: chọn brief ⇒ nghiêng về **canvas**, và phải NÓI LÝ DO bằng số thật
 * của chính bộ trả lời đang đọc, không phải một câu chung chung.
 */
export function suggestModeFor(res: BriefReadResult): { mode: CreateMode; reason: string } {
  const missing = res.missing.length;
  const conflicts = res.conflicts.length;
  if (missing === 0 && conflicts === 0) {
    return {
      mode: "workflow",
      reason: "Đầu bài đã trả lời đủ, nên đi thẳng quy trình chuẩn cũng được.",
    };
  }
  const parts: string[] = [];
  if (missing > 0) parts.push(`còn ${missing} câu chưa trả lời`);
  if (conflicts > 0) parts.push(`${conflicts} điểm cần chốt lại`);
  return {
    mode: "canvas",
    reason: `Đầu bài ${parts.join(" và ")} — bàn làm việc hợp hơn để bày ra rồi hỏi khách.`,
  };
}

/** Chuyển kết quả đọc của C2 sang thứ UI vẽ được. Không thêm dữ liệu nào không có sẵn. */
export function summarize(res: BriefReadResult, fileName: string | null): BriefSummary {
  const hint = projectPrefillHint(res);
  const notes = noteOnlyItems(res);
  const suggest = suggestModeFor(res);
  return {
    formId: res.formId,
    fileName,
    total: res.tally.total,
    tally: { cao: res.tally.cao, tb: res.tally.tb, thap: res.tally.thap, trong: res.tally.trong },
    usableCount: res.fields.filter((f) => f.prefillable).length,
    noteOnlyCount: notes.length,
    missingCount: hint.missingCount,
    conflicts: res.conflicts,
    noteGroups: groupNotes(notes),
    skippedCount: res.skipped.length,
    summaryLine: hint.summary,
    prefillName: hint.name,
    suggestedMode: suggest.mode,
    suggestReason: suggest.reason,
  };
}

/* ═════════════ 3 · ĐỌC MỘT CHUỖI JSON ═════════════ */

export interface BriefReadFailure {
  /** Câu cho THÂN UI — viết cho người thường. */
  title: string;
  /** Gợi ý việc tiếp theo. */
  hint: string;
  /** CHỈ cho panel «Chi tiết cho lập trình viên». KHÔNG hiện ở thân UI. */
  detail: string;
}

export type BriefParseOutcome =
  | { ok: true; summary: BriefSummary; result: BriefReadResult }
  | { ok: false; error: BriefReadFailure };

const TOO_BIG: BriefReadFailure = {
  title: "Tệp này quá lớn để đọc trong trình duyệt.",
  hint: "Bộ trả lời của form thường dưới 1 MB. Kiểm tra xem có chọn nhầm tệp không.",
  detail: `input > BRIEF_MAX_BYTES (${BRIEF_MAX_BYTES})`,
};

/**
 * Đọc chuỗi JSON người dùng đưa vào.
 *
 * Nhận **hai hình dạng**, vì trên thực tế tồn tại cả hai và người dùng không phân biệt được:
 *  · bộ trả lời đủ khung (`{formId, sections, conflicts}`) — dạng form xuất ra;
 *  · bộ điền sẵn `prefill-vcb.json` (9 khoá section ở mức gốc + khoá meta `_*`) —
 *    đưa qua `bundleFromPrefill()` của C2, hàm CHỈ đổi hình dạng chứ không đổi nội dung.
 * `conflicts` chỉ có ở dạng thứ nhất; dạng thứ hai trả 0 điểm mâu thuẫn và **đó là sự thật**,
 * không phải "brief không có mâu thuẫn" (C2 §5 nói rõ).
 */
export function parseBriefText(text: string, fileName: string | null = null): BriefParseOutcome {
  if (text.length > BRIEF_MAX_BYTES) return { ok: false, error: TOO_BIG };
  const trimmed = text.trim();
  if (trimmed === "") {
    return {
      ok: false,
      error: {
        title: "Chưa có nội dung để đọc.",
        hint: "Dán nội dung tệp answers.json vào ô, hoặc chọn tệp từ máy.",
        detail: "input rỗng",
      },
    };
  }

  let raw: unknown;
  let plainText = false;
  try {
    raw = JSON.parse(trimmed);
  } catch {
    raw = bundleFromPlainText(trimmed);
    plainText = true;
  }

  try {
    const shaped = looksLikeBundle(raw) ? raw : bundleFromPrefill(raw);
    const res = readBrief(shaped);
    /* JSON hợp lệ nhưng KHÔNG có câu trả lời nào. Ca này có thật: `bundleFromPrefill`
       chấp nhận mọi object và chỉ giữ những khoá là object con, nên `{"a": 1}` đi qua
       trót lọt và ra một bản brief RỖNG. Trả `ok:true` ở đây sẽ hiện "Đọc được 0 câu"
       như thể mọi thứ bình thường — đúng kiểu im lặng mà brief cấm. */
    if (res.fields.length === 0) {
      if (plainText) {
        return {
          ok: false,
          error: {
            title: "Nội dung này không phải JSON hợp lệ.",
            hint: "Dán brief chữ theo từng dòng hoặc JSON có câu trả lời bên trong.",
            detail: "SyntaxError: không nhận ra trường đầu bài",
          },
        };
      }
      return {
        ok: false,
        error: {
          title: "Tệp đọc được nhưng không có câu trả lời nào bên trong.",
          hint: "Kiểm tra xem có chọn nhầm tệp khác không. Tệp đúng có 9 nhóm câu hỏi và ~72 câu.",
          detail: `readBrief: 0 field, ${res.skipped.length} bản ghi bị bỏ qua`,
        },
      };
    }
    return { ok: true, summary: summarize(res, fileName), result: res };
  } catch (e) {
    if (e instanceof BriefReadError) {
      return {
        ok: false,
        error: {
          title: e.message,
          hint: "Chọn tệp do chính form intake xuất ra, hoặc tệp prefill của đội brief.",
          detail: `${e.code}: ${e.issues.join(" · ")}`,
        },
      };
    }
    return {
      ok: false,
      error: {
        title: "Không đọc được bộ trả lời đầu bài.",
        hint: "Thử lại với tệp khác. Project của bạn không bị ảnh hưởng.",
        detail: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
      },
    };
  }
}

/** Best-effort reader for the brief people actually paste: one field per line. */
function bundleFromPlainText(text: string): unknown {
  const fields: Record<string, unknown> = {};
  const aliases: Record<string, string> = {
    "ten bo kit": "project_name", "ten du an": "project_name", "ten": "project_name",
    "phong cach": "style_direction", "mau chinh": "color_primary", "mau phu": "color_secondary",
    "mon can co": "ui_components", "thanh phan giao dien": "ui_components",
    "nhan vat": "char_species", "co nhan vat": "need_mascot", "dieu khong muon": "style_avoid",
  };
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*([^:：-]{2,60})\s*[:：-]\s*(.+?)\s*$/);
    if (!match) continue;
    const key = normalizeBriefKey(match[1]!);
    const id = aliases[key] ?? key.replace(/\s+/g, "_");
    const value = match[2]!.trim();
    if (value) fields[id] = { question: match[1]!.trim(), value, confidence: "cao", source: "brief-tho" };
  }
  return { formId: "brief-tho", sections: { brief: fields }, conflicts: [] };
}

function normalizeBriefKey(value: string): string {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").trim();
}

function looksLikeBundle(raw: unknown): boolean {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return false;
  const o = raw as Record<string, unknown>;
  return typeof o["formId"] === "string" && typeof o["sections"] === "object" && o["sections"] !== null;
}

/* ═════════════ 4 · CỔNG KIỂM THỪA (LUẬT 1) ═════════════ */

/**
 * `true` khi mọi thứ sắp chảy vào form đều đến từ field `prefillable`.
 *
 * C2 đã chặn ở `prefillValues()`; đây là **lớp thứ hai ở phía tiêu thụ**, tồn tại để test
 * của nhánh B khoá được luật mà không phải tin vào file của nhánh khác. Nếu ai đó sau này
 * nối thêm trường vào form tạo project từ brief, họ phải đi qua đúng cổng này.
 */
export function prefillIsClean(res: BriefReadResult, used: Readonly<Record<string, unknown>>): boolean {
  const allowed = prefillValues(res);
  return Object.keys(used).every((k) => Object.prototype.hasOwnProperty.call(allowed, k));
}

/**
 * Ranh giới TRUNG THỰC hiện ra UI (§1.3 + FE2-PLAN §4): FE **đọc và soi**, không tự dựng
 * bản thiết kế. Bước `build-styles.mjs` (INTAKE-SPEC §1 bước 7a) CHƯA TỒN TẠI.
 */
export const BRIEF_LIMIT_NOTE =
  "Bản đọc này chỉ dùng để điền tên dự án và chọn cách bắt đầu. Nó KHÔNG tự tạo bản thiết kế, " +
  "không tự chọn element và không tự đặt màu — những câu chưa chắc chỉ được liệt kê ở đây để bạn hỏi lại khách.";
