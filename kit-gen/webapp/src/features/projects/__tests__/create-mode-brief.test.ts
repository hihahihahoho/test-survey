/**
 * B2 — test THUẦN LOGIC cho lớp đọc đầu bài (`lib/create-mode-brief.ts`).
 *
 * Chạy: `npx vitest run src/features/projects/__tests__/create-mode-brief.test.ts`
 * (nằm trong `npm test` của R0 vì config đã nhận `src/** /__tests__/**`).
 *
 * Ba tiêu chí của FE2-PLAN §3-B2 được khoá tại đây:
 *  ① dữ liệu THẬT: 72 = 27/18/5/22 và 5 điểm mâu thuẫn khi nguồn có truyền;
 *  ② KHÔNG field `thap`/`trong` nào chảy ra dạng máy;
 *  ③ lỗi đọc không ném ra ngoài và không rò chuỗi kỹ thuật vào câu cho người dùng.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readBrief } from "@/features/docs/lib/brief-read";
import {
  BRIEF_LIMIT_NOTE,
  BRIEF_MAX_BYTES,
  groupNotes,
  parseBriefText,
  prefillIsClean,
  sectionLabel,
  suggestModeFor,
} from "../lib/create-mode-brief";

const WEBAPP = join(new URL("../../../../", import.meta.url).pathname);
const FIX = join(WEBAPP, "fixtures");
const text = (p: string) => readFileSync(p, "utf8");

/** File THẬT của đội brief-intake — không phải bản sao trong webapp. */
const PREFILL_REAL = join(WEBAPP, "../teams/brief-intake/prefill-vcb.json");
const MISSING22 = join(FIX, "brief-intake-vcb-missing22.json");
const FULL = join(FIX, "brief-intake-vcb-full.json");

describe("① đọc được cả hai hình dạng dữ liệu thật", () => {
  it("prefill-vcb.json THẬT (9 section ở gốc, không có formId): 72 câu · 27/18/5/22 · 0 mâu thuẫn", () => {
    const out = parseBriefText(text(PREFILL_REAL), "prefill-vcb.json");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const s = out.summary;
    expect(s.total).toBe(72);
    expect(s.tally).toEqual({ cao: 27, tb: 18, thap: 5, trong: 22 });
    // Không có khối mâu thuẫn trong file prefill ⇒ 0, và ĐÓ LÀ SỰ THẬT (C2 §5).
    expect(s.conflicts).toEqual([]);
    expect(s.skippedCount).toBe(0);
    expect(s.fileName).toBe("prefill-vcb.json");
  });

  it("fixture THIẾU 22 câu (có khung formId + conflicts): 5 điểm mâu thuẫn giữ NGUYÊN VĂN + nguồn", () => {
    const out = parseBriefText(text(MISSING22), "brief-intake-vcb-missing22.json");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.summary.conflicts).toHaveLength(5);
    const raw = JSON.parse(text(MISSING22)) as { conflicts: { index: number; text: string; source: string }[] };
    expect(out.summary.conflicts).toEqual(raw.conflicts);
    expect(out.summary.formId).toBe("vcb-brief-intake-2026");
  });

  it("fixture ĐỦ: 0 câu trống, nhưng 5 câu nhãn `thap` VẪN chỉ là ghi chú", () => {
    const out = parseBriefText(text(FULL), "full.json");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.summary.missingCount).toBe(0);
    expect(out.summary.tally).toEqual({ cao: 49, tb: 18, thap: 5, trong: 0 });
    expect(out.summary.noteOnlyCount).toBe(5);
    expect(out.summary.usableCount).toBe(67);
    expect(out.summary.usableCount + out.summary.noteOnlyCount).toBe(72);
  });

  it("con số lệch nhãn CÓ THẬT được giữ nguyên: 22 nhãn `trong` nhưng 23 câu không có giá trị", () => {
    const out = parseBriefText(text(PREFILL_REAL), null);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.summary.tally.trong).toBe(22);
    expect(out.summary.missingCount).toBe(23); // `milestone_list` nhãn `thap` mà value null
  });
});

describe("② `thap`/`trong` KHÔNG có đường ra dạng máy", () => {
  const res = readBrief(JSON.parse(text(MISSING22)));

  it("mọi mục trong danh sách ghi chú đều là field noteOnly, và chúng KHÔNG prefillable", () => {
    const out = parseBriefText(text(MISSING22), null);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const noteIds = out.summary.noteGroups.flatMap((g) => g.items.map((i) => i.id));
    expect(noteIds.length).toBe(out.summary.noteOnlyCount);
    for (const id of noteIds) {
      expect(res.byId[id]!.prefillable).toBe(false);
      expect(res.byId[id]!.noteOnly).toBe(true);
    }
  });

  it("thứ DUY NHẤT chảy vào form là tên dự án, và nó đến từ field độ tin cậy `cao`", () => {
    const out = parseBriefText(text(MISSING22), null);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.summary.prefillName).toBe("VCB Look back 2025 & Chợ Tết 2026");
    expect(res.byId["project_name"]!.confidence).toBe("cao");
    // cổng kiểm thừa: tên là giá trị của một field prefillable
    expect(prefillIsClean(res, { project_name: out.summary.prefillName })).toBe(true);
  });

  it("cổng `prefillIsClean` BẮT được nếu ai đó nối thêm field thấp/trống vào form", () => {
    expect(prefillIsClean(res, { style_direction: "gì đó" })).toBe(false); // nhãn `trong`
    expect(prefillIsClean(res, { sc_era: 5 })).toBe(false); // nhãn `thap`
    expect(prefillIsClean(res, { color_primary: "#d42a1e" })).toBe(true); // nhãn `tb`, có giá trị
  });

  it("bản đọc KHÔNG chứa sheet / element / màu để đưa vào contract — ranh giới nói thẳng ra UI", () => {
    const out = parseBriefText(text(MISSING22), null);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(Object.keys(out.summary)).not.toContain("sheets");
    expect(Object.keys(out.summary)).not.toContain("contract");
    expect(BRIEF_LIMIT_NOTE).toMatch(/KHÔNG tự tạo bản thiết kế/);
  });
});

describe("③ lỗi đọc — không ném, không rò chuỗi kỹ thuật ra câu cho người dùng", () => {
  it("JSON hỏng ⇒ ok:false với câu đời thường; chi tiết nằm riêng ở `detail`", () => {
    const out = parseBriefText("{ đây không phải json", "x.json");
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.title).toBe("Nội dung này không phải JSON hợp lệ.");
    expect(out.error.title).not.toMatch(/SyntaxError|JSON\.parse|Unexpected token/);
    expect(out.error.detail).toMatch(/SyntaxError|Error/);
  });

  it("khung ngoài hỏng ⇒ câu của BriefReadError, mã lỗi chỉ ở `detail`", () => {
    // `conflicts` phải là mảng; ở đây là chuỗi ⇒ `readBrief` ném BriefReadError.
    const out = parseBriefText(
      JSON.stringify({ formId: "f", sections: { sec_meta: {} }, conflicts: "năm điểm" }),
      null,
    );
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.title).toMatch(/Không đọc được bộ trả lời đầu bài/);
    expect(out.error.title).not.toMatch(/BRIEF_UNREADABLE/);
    expect(out.error.detail).toMatch(/BRIEF_UNREADABLE/);
  });

  /**
   * LỖ HỔNG THẬT do test này tìm ra (không phải ca giả định): `bundleFromPrefill` nhận
   * MỌI object và chỉ giữ khoá nào có giá trị là object ⇒ `{"a":1}` đi lọt và ra bản
   * brief RỖNG. Trước khi sửa, UI hiện "Đọc được 0 câu" như thể bình thường.
   */
  it("JSON hợp lệ nhưng không chứa câu trả lời nào ⇒ báo lỗi, KHÔNG hiện «đọc được 0 câu»", () => {
    for (const raw of ['{"a": 1}', "{}", '{"sections": {}}']) {
      const out = parseBriefText(raw, null);
      expect(out.ok).toBe(false);
      if (out.ok) continue;
      expect(out.error.title).toMatch(/không có câu trả lời nào/);
    }
  });

  it("chuỗi rỗng và chuỗi quá lớn có câu riêng, không rơi vào catch-all", () => {
    const empty = parseBriefText("   ", null);
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error.title).toMatch(/Chưa có nội dung/);
    const big = parseBriefText("x".repeat(BRIEF_MAX_BYTES + 1), null);
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.error.title).toMatch(/quá lớn/);
  });

  it("field lẻ hỏng KHÔNG giết cả bản brief — chỉ bị đếm vào `skippedCount`", () => {
    const raw = JSON.parse(text(MISSING22)) as { sections: Record<string, Record<string, unknown>> };
    raw.sections["sec_meta"]!["rac"] = { question: "", value: {} };
    const out = parseBriefText(JSON.stringify(raw), null);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.summary.skippedCount).toBe(1);
    expect(out.summary.total).toBe(72);
  });
});

describe("gợi ý mode — GỢI Ý chứ không ép, và lý do là số THẬT", () => {
  it("brief còn lỗ hổng ⇒ gợi ý canvas, câu lý do chứa đúng số câu thiếu và số mâu thuẫn", () => {
    const res = readBrief(JSON.parse(text(MISSING22)));
    const s = suggestModeFor(res);
    expect(s.mode).toBe("canvas");
    expect(s.reason).toContain("23 câu chưa trả lời");
    expect(s.reason).toContain("5 điểm cần chốt lại");
  });

  /**
   * ĐÍNH CHÍNH so với dự đoán ban đầu của tôi: fixture "ĐỦ" **vẫn mang 5 điểm mâu thuẫn**
   * (nó chỉ điền hết 22 câu trống, không giải quyết mâu thuẫn). Nên gợi ý đúng vẫn là
   * canvas, và câu lý do chỉ được nói về mâu thuẫn — KHÔNG được nói "còn 0 câu chưa trả lời".
   */
  it("brief đủ câu nhưng CÒN mâu thuẫn ⇒ vẫn gợi ý canvas, lý do chỉ nhắc mâu thuẫn", () => {
    const res = readBrief(JSON.parse(text(FULL)));
    const s = suggestModeFor(res);
    expect(s.mode).toBe("canvas");
    expect(s.reason).toContain("5 điểm cần chốt lại");
    expect(s.reason).not.toContain("chưa trả lời");
  });

  it("brief đủ câu VÀ hết mâu thuẫn ⇒ không đẩy người dùng sang canvas", () => {
    const raw = JSON.parse(text(FULL)) as Record<string, unknown>;
    raw["conflicts"] = [];
    const res = readBrief(raw);
    const s = suggestModeFor(res);
    expect(s.mode).toBe("workflow");
    expect(s.reason).toMatch(/đi thẳng quy trình chuẩn/);
  });
});

describe("nhóm ghi chú theo trang", () => {
  it("giữ NGUYÊN thứ tự trang mà file đưa ra, không sắp xếp lại", () => {
    const out = parseBriefText(text(MISSING22), null);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const order = out.summary.noteGroups.map((g) => g.section);
    expect(order).toEqual([...new Set(order)]);
    expect(order[0]).toBe("sec_meta");
  });

  it("section lạ hiện NGUYÊN id, không bịa tên tiếng Việt", () => {
    expect(sectionLabel("sec_style")).toBe("Phong cách");
    expect(sectionLabel("sec_moi_toanh")).toBe("sec_moi_toanh");
  });

  it("groupNotes không làm mất mục nào", () => {
    const out = parseBriefText(text(MISSING22), null);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const items = out.summary.noteGroups.flatMap((g) => g.items);
    expect(items).toHaveLength(out.summary.noteOnlyCount);
    expect(groupNotes([])).toEqual([]);
  });
});
