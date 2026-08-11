/**
 * C2 — test cho `brief-read.ts`. Ba tiêu chí của FE-PLAN §3-C2 được khoá tại đây:
 *  ① chạy trên `teams/brief-intake/prefill-vcb.json` THẬT, đúng số field và đúng phân bố tin cậy;
 *  ② field `thap`/`trong` là `note-only` — KHÔNG có đường nào biến chúng thành dữ liệu máy;
 *  ③ 5 điểm mâu thuẫn giữ nguyên văn + nguồn.
 * Cộng hai fixture: bộ ĐỦ và bộ THIẾU 22 field.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertNoSecret } from "@/lib/store";
import {
  BriefReadError,
  bundleFromPrefill,
  noteOnlyItems,
  prefillValues,
  projectPrefillHint,
  readBrief,
} from "../lib/brief-read";

const WEBAPP = join(new URL("../../../../", import.meta.url).pathname); // webapp/
const FIX = join(WEBAPP, "fixtures");
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const full = read(join(FIX, "brief-intake-vcb-full.json"));
const missing22 = read(join(FIX, "brief-intake-vcb-missing22.json"));
/** File THẬT của team brief-intake — không phải bản sao. */
const PREFILL = join(WEBAPP, "../teams/brief-intake/prefill-vcb.json");

describe("① đọc file THẬT prefill-vcb.json", () => {
  const res = readBrief(bundleFromPrefill(read(PREFILL)));

  it("đúng 72 field, 9 section", () => {
    expect(res.tally.total).toBe(72);
    expect(res.fields).toHaveLength(72);
    expect(Object.keys(res.byConfidence).length).toBe(4);
    expect(new Set(res.fields.map((f) => f.section)).size).toBe(9);
    expect(res.skipped).toEqual([]);
  });

  it("đúng phân bố độ tin cậy của INTAKE-SPEC §1: cao 27 · tb 18 · thấp 5 · trống 22", () => {
    expect({ cao: res.tally.cao, tb: res.tally.tb, thap: res.tally.thap, trong: res.tally.trong }).toEqual({
      cao: 27,
      tb: 18,
      thap: 5,
      trong: 22,
    });
  });

  /**
   * ⚠ PHÁT HIỆN THẬT khi chạy trên file gốc: nhãn `trong` có 22 field, nhưng field CÓ GIÁ TRỊ
   * RỖNG là 23 — `milestone_list` được gắn `thap` mà `value: null`. Test giữ nguyên con số thật
   * (23) thay vì sửa cho khớp §1, và ghi lại ca lệch nhãn này để đội brief-intake biết.
   */
  it("23 câu chưa có câu trả lời = 22 nhãn `trong` + `milestone_list` (nhãn `thap` nhưng value null)", () => {
    expect(res.missing).toHaveLength(23);
    expect(res.missing.filter((f) => f.confidence !== "trong").map((f) => f.id)).toEqual(["milestone_list"]);
    expect(res.byId["badge_list"]!.empty).toBe(true);
    expect(res.byId["wish_count"]!.empty).toBe(true);
  });

  it("bundleFromPrefill bỏ khoá meta `_*`, không bịa thêm field", () => {
    const b = bundleFromPrefill(read(PREFILL));
    expect(Object.keys(b.sections).some((k) => k.startsWith("_"))).toBe(false);
    expect(Object.keys(b.sections)).toEqual([
      "sec_meta", "sec_lb", "sec_game", "sec_char", "sec_style", "sec_scope", "sec_brand", "sec_deliver", "sec_time",
    ]);
    expect(b.conflicts).toEqual([]); // file prefill KHÔNG chứa mâu thuẫn — nói thật, không giả vờ
  });
});

describe("② `thap`/`trong` là note-only — không có đường ra dạng máy", () => {
  const res = readBrief(missing22);

  it("mọi field thấp/trống đều noteOnly và KHÔNG prefillable", () => {
    for (const f of [...res.byConfidence.thap, ...res.byConfidence.trong]) {
      expect(f.noteOnly).toBe(true);
      expect(f.prefillable).toBe(false);
    }
    expect(res.byConfidence.thap).toHaveLength(5);
    expect(res.byConfidence.trong).toHaveLength(22);
  });

  it("prefillValues() KHÔNG chứa một id thấp/trống nào", () => {
    const vals = prefillValues(res);
    const banned = [...res.byConfidence.thap, ...res.byConfidence.trong].map((f) => f.id);
    for (const id of banned) expect(vals).not.toHaveProperty(id);
    expect(Object.keys(vals)).toHaveLength(27 + 18);
  });

  it("field `cao`/`tb` nhưng giá trị RỖNG vẫn bị hạ xuống note-only", () => {
    const r = readBrief({
      formId: "t",
      sections: { s: { a: { question: "q", value: "", source: null, confidence: "cao" },
                       b: { question: "q", value: [], source: null, confidence: "tb" },
                       c: { question: "q", value: "x", source: null, confidence: "cao" } } },
      conflicts: [],
    });
    expect(r.byId["a"]!.prefillable).toBe(false);
    expect(r.byId["b"]!.prefillable).toBe(false);
    expect(r.byId["c"]!.prefillable).toBe(true);
    expect(Object.keys(prefillValues(r))).toEqual(["c"]);
  });

  it("noteOnlyItems() phân biệt 'chưa trả lời' (blocking) với 'có nhưng tin cậy thấp'", () => {
    const items = noteOnlyItems(res);
    expect(items).toHaveLength(27); // 5 thấp + 22 trống
    expect(items.filter((i) => i.blocking)).toHaveLength(23); // + milestone_list rỗng
    const era = items.find((i) => i.id === "sc_era")!;
    expect(era.blocking).toBe(false);
    expect(era.note).toContain("MÂU THUẪN #3");
  });

  it("KHÔNG map sang contract: module chỉ trả về hai trường chữ cho ô tên dự án", () => {
    const hint = projectPrefillHint(res);
    expect(hint.name).toBe("VCB Look back 2025 & Chợ Tết 2026");
    expect(hint.missingCount).toBe(23);
    expect(hint.conflictCount).toBe(5);
    expect(Object.keys(hint).sort()).toEqual(["conflictCount", "missingCount", "name", "summary"]);
    // không có sheet/style/màu nào rò ra
    expect(JSON.stringify(hint)).not.toMatch(/sheet|style|#[0-9a-f]{6}/i);
  });
});

describe("③ 5 điểm mâu thuẫn giữ nguyên văn + nguồn", () => {
  const res = readBrief(missing22);
  /** Nguyên văn lấy từ form thật `surveys/vcb-brief-intake-2026.json` item q0001. */
  const FORM = join(WEBAPP, "../../surveys/vcb-brief-intake-2026.json");

  it("đúng 5 điểm, đánh số 1..5, mỗi điểm có nguồn", () => {
    expect(res.conflicts.map((c) => c.index)).toEqual([1, 2, 3, 4, 5]);
    for (const c of res.conflicts) expect(c.source).toContain("q0001");
  });

  it("từng chữ khớp NGUYÊN VĂN khối NOTE trong form thật", () => {
    const form = read(FORM) as { items: { itemId: string; description?: string }[] };
    const note = form.items.find((i) => i.itemId === "q0001")!;
    const lines = note.description!.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(lines).toHaveLength(5);
    for (const [i, line] of lines.entries()) {
      expect(line).toBe(`${i + 1}. ${res.conflicts[i]!.text}`);
    }
  });
});

describe("fixture đủ / thiếu", () => {
  it("bộ ĐỦ: 72 field, 0 field trống, vẫn giữ 5 mâu thuẫn", () => {
    const res = readBrief(full);
    expect(res.tally.total).toBe(72);
    expect(res.missing).toHaveLength(0);
    expect(res.conflicts).toHaveLength(5);
    expect(projectPrefillHint(res).missingCount).toBe(0);
    // 22 field bịa phải TỰ NHẬN là bịa
    const faked = res.fields.filter((f) => f.source?.startsWith("FIXTURE — "));
    expect(faked).toHaveLength(22);
    // `milestone_list` được điền nhưng GIỮ độ tin cậy `thap` ⇒ vẫn note-only
    expect(res.byId["milestone_list"]!.confidence).toBe("thap");
    expect(res.byId["milestone_list"]!.prefillable).toBe(false);
  });

  it("bộ ĐỦ vẫn không cho `thap` chảy vào prefillValues", () => {
    const res = readBrief(full);
    expect(res.byConfidence.thap).toHaveLength(5);
    for (const f of res.byConfidence.thap) expect(prefillValues(res)).not.toHaveProperty(f.id);
  });

  it("hai fixture không chứa secret / đường dẫn tuyệt đối", () => {
    expect(() => assertNoSecret(full, "brief-intake-vcb-full.json")).not.toThrow();
    expect(() => assertNoSecret(missing22, "brief-intake-vcb-missing22.json")).not.toThrow();
  });
});

describe("hỏng thì không sập", () => {
  it("field lẻ hỏng ⇒ vào `skipped`, các field còn lại vẫn đọc được", () => {
    const r = readBrief({
      formId: "t",
      sections: { s: { ok: { question: "q", value: 1, source: null, confidence: "cao" },
                       bad: { question: "q", value: { deep: 1 }, source: null, confidence: "cao" },
                       bad2: { question: "q", value: "x", confidence: "khong-co-muc-nay" } } },
      conflicts: [],
    });
    expect(r.fields.map((f) => f.id)).toEqual(["ok"]);
    expect(r.skipped.map((s) => s.path)).toEqual(["s.bad", "s.bad2"]);
  });

  it("khung ngoài hỏng ⇒ BriefReadError, message KHÔNG chứa thuật ngữ kỹ thuật", () => {
    let err: unknown;
    try { readBrief({ nope: true }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(BriefReadError);
    const e = err as BriefReadError;
    expect(e.message).toBe("Không đọc được bộ trả lời đầu bài. Có thể file được xuất từ phiên bản form khác.");
    expect(e.message).not.toMatch(/zod|schema|undefined|Expected/i);
    expect(e.issues.length).toBeGreaterThan(0); // chi tiết chỉ nằm ở panel dev
  });

  it("bundleFromPrefill từ chối input không phải object", () => {
    expect(() => bundleFromPrefill([])).toThrow(BriefReadError);
    expect(() => bundleFromPrefill(null)).toThrow(BriefReadError);
  });
});

describe("module này KHÔNG được sinh contract / gọi API", () => {
  it("grep chính source: không import api/hook, không có chữ `contract`", () => {
    const src = readFileSync(join(WEBAPP, "src/features/docs/lib/brief-read.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""); // bỏ comment
    expect(code).not.toMatch(/from\s+["']@\/lib\/(api|hooks)/);
    expect(code).not.toMatch(/\bfetch\s*\(/);
    expect(code).not.toMatch(/contractSchema|sheets\s*:/);
    expect(code).not.toMatch(/localStorage|indexedDB/);
  });
});
