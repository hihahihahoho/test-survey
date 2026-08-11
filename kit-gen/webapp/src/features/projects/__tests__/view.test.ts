/**
 * Test tầng LOGIC của S1 — thuần hàm, không cần DOM.
 * Trọng tâm là những chỗ mà sai một ly là user thấy số liệu nói dối:
 * đếm chip phải KHỚP kết quả lọc, và tìm bỏ dấu phải ra kết quả.
 */
import { describe, expect, it } from "vitest";
import { projectSchema, type Project } from "@/lib/types";
import { allTags, applyView, chipCounts, fuzzyScore, projectState } from "../lib/view";
import { copyName, duplicateNameWarning, slugify, validateName, validateSlug, variantId } from "../lib/slug";
import { bytes, count, exportFileName, foldCase, relTime } from "../lib/format";

/** Dựng Project qua zod: input là JSON thô như agent trả, không phải type đã suy. */
const P = (over: Record<string, unknown> & { id: string }): Project =>
  projectSchema.parse({ name: over.id, ...over });

const fixtures: Project[] = [
  P({ id: "tet26", name: "Tết 2026 — VietinBank iPay", tags: ["tet", "banking"], updatedAt: "2026-08-06T10:00:00Z",
      stats: { diskBytes: 176_000_000 }, state: { jobs: { "tet-main": "running", "tet-tall": "ok" } } }),
  P({ id: "candy", name: "Candy Lite", tags: ["candy"], updatedAt: "2026-08-05T10:00:00Z",
      stats: { diskBytes: 42_000_000 }, state: { jobs: { "c-main": "uncut" } } }),
  P({ id: "mid", name: "Mid-Autumn 2026", tags: [], updatedAt: "2026-08-04T10:00:00Z",
      stats: { diskBytes: 0 }, state: { jobs: {} } }),
  P({ id: "broken1", name: "candy-old-11b2", broken: true, error: { file: "project.json", line: 12 } }),
  P({ id: "failed1", name: "Xuân 2027", tags: ["tet"], state: { jobs: { "x-main": "failed", "x-tall": "ok" } } }),
];

describe("projectState — gộp theo thứ tự ưu tiên §5.7", () => {
  it("broken thắng mọi thứ", () => expect(projectState(fixtures[3]!)).toBe("broken"));
  it("failed thắng ok", () => expect(projectState(fixtures[4]!)).toBe("failed"));
  it("running thắng ok", () => expect(projectState(fixtures[0]!)).toBe("running"));
  it("không có job nào ⇒ empty (chưa bắt đầu), KHÔNG phải ok", () =>
    expect(projectState(fixtures[2]!)).toBe("empty"));
});

describe("chipCounts phải KHỚP applyView — nếu lệch thì UI nói dối", () => {
  const counts = chipCounts(fixtures);
  for (const chip of ["all", "need-gen", "running", "failed", "unfinished"] as const) {
    it(`chip «${chip}»: số đếm = số thẻ thật sự hiện ra`, () => {
      expect(applyView(fixtures, { chip }).length).toBe(counts[chip]);
    });
  }
  it("project HỎNG thuộc nhóm Lỗi, KHÔNG tính vào Chưa xong", () => {
    expect(applyView(fixtures, { chip: "failed" }).map((p) => p.id)).toContain("broken1");
    expect(applyView(fixtures, { chip: "unfinished" }).map((p) => p.id)).not.toContain("broken1");
  });
});

describe("tìm kiếm", () => {
  it("gõ KHÔNG DẤU vẫn ra tên CÓ DẤU", () => {
    expect(applyView(fixtures, { query: "tet 2026" }).map((p) => p.id)).toContain("tet26");
    expect(applyView(fixtures, { query: "xuan" }).map((p) => p.id)).toContain("failed1");
  });
  it("tìm theo tag và theo id thư mục", () => {
    expect(applyView(fixtures, { query: "banking" }).map((p) => p.id)).toContain("tet26");
    expect(applyView(fixtures, { query: "candy-old" }).map((p) => p.id)).toContain("broken1");
  });
  it("không khớp ⇒ rỗng (để màn hiện empty-no-match)", () => {
    expect(applyView(fixtures, { query: "zzzzz" })).toHaveLength(0);
  });
  it("khớp liên tiếp được điểm cao hơn khớp rời", () => {
    expect(fuzzyScore("Candy Lite", "candy")).toBeGreaterThan(fuzzyScore("Candy Lite", "cdl"));
  });
});

describe("lọc theo tag = AND (chọn 2 tag thì phải có CẢ HAI)", () => {
  it("tet + banking chỉ ra Tết 2026", () => {
    expect(applyView(fixtures, { tags: ["tet", "banking"] }).map((p) => p.id)).toEqual(["tet26"]);
  });
  it("chỉ tet ra 2 project", () => {
    expect(applyView(fixtures, { tags: ["tet"] })).toHaveLength(2);
  });
});

describe("sắp xếp", () => {
  it("mặc định: sửa gần nhất trước", () => {
    expect(applyView(fixtures, { sortBy: "updated" })[0]!.id).toBe("tet26");
  });
  it("dung lượng giảm dần", () => {
    expect(applyView(fixtures, { sortBy: "size" })[0]!.id).toBe("tet26");
  });
  it("tên A→Z theo tiếng Việt", () => {
    expect(applyView(fixtures, { sortBy: "name" })[0]!.name).toBe("Candy Lite");
  });
  it("KHÔNG làm biến đổi mảng gốc (nó là cache của TanStack Query)", () => {
    const snapshot = fixtures.map((p) => p.id);
    applyView(fixtures, { sortBy: "name" });
    expect(fixtures.map((p) => p.id)).toEqual(snapshot);
  });
});

describe("allTags — chỉ tag CÓ THẬT, kèm số đếm", () => {
  it("đếm đúng và sắp theo độ phổ biến", () => {
    expect(allTags(fixtures)).toEqual([["tet", 2], ["banking", 1], ["candy", 1]]);
  });
});

describe("slug (§4.1-1) — không bao giờ từ chối im lặng", () => {
  it("bỏ dấu tiếng Việt đúng, kể cả đ/Đ", () => {
    expect(slugify("Xuân 26")).toBe("xuan-26");
    expect(slugify("Tết 2026 — VietinBank iPay")).toBe("tet-2026-vietinbank-ipay");
    expect(slugify("Đường phố")).toBe("duong-pho");
    expect(foldCase("chủ")).toBe("chu");
  });
  it("cắt 40 ký tự và không để lại gạch nối ở cuối", () => {
    const s = slugify("a".repeat(60));
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });
  it("mọi chuỗi slug sai đều có CÂU LỖI, không trả null im lặng", () => {
    for (const bad of ["", "ab", "-abc", "abc-", "Có Dấu", "a".repeat(49)]) {
      expect(validateSlug(bad), `slug ${JSON.stringify(bad)}`).toBeTypeOf("string");
    }
    expect(validateSlug("tet-2026-vietinbank")).toBeNull();
  });
  it("tên rỗng / quá dài đều có câu lỗi", () => {
    expect(validateName("   ")).toBeTypeOf("string");
    expect(validateName("x".repeat(121))).toBeTypeOf("string");
    expect(validateName("Tết 2026")).toBeNull();
  });
  it("variantId luôn hợp lệ, kể cả khi tên toàn ký tự lạ", () => {
    expect(variantId("Tết đỏ")).toBe("tet-do");
    expect(variantId("!!!")).toBe("v1");
    expect(variantId("A")).toBe("v1"); // 1 ký tự không đạt tối thiểu 2
  });
});

describe("trùng tên: CHO PHÉP + gợi ý (§4.1-2)", () => {
  it("cảnh báo và gợi ý (2)", () => {
    const w = duplicateNameWarning("Candy Lite", fixtures);
    expect(w?.suggestion).toBe("Candy Lite (2)");
    expect(w?.warn).toContain("Vẫn tạo được");
  });
  it("không trùng ⇒ không cảnh báo", () => {
    expect(duplicateNameWarning("Tên mới toanh", fixtures)).toBeNull();
  });
  it("tên bản sao nhảy số khi đã có (bản sao)", () => {
    const list = [{ name: "A (bản sao)" }, { name: "A (bản sao 2)" }];
    expect(copyName("A", list)).toBe("A (bản sao 3)");
  });
});

describe("format", () => {
  it("dung lượng dùng dấu phẩy thập phân kiểu VI", () => {
    expect(bytes(0)).toBe("0 B");
    expect(bytes(176_000_000)).toBe("168 MB");
    expect(bytes(2_500_000)).toBe("2,4 MB");
    expect(bytes(-1)).toBe("—");
  });
  it("thời gian tương đối", () => {
    const now = Date.parse("2026-08-06T12:00:00Z");
    expect(relTime("2026-08-06T11:56:00Z", now)).toBe("4 phút trước");
    expect(relTime(null, now)).toBe("—");
    expect(relTime("không-phải-ngày", now)).toBe("—");
  });
  it("tên file zip theo §4.7", () => {
    expect(exportFileName("tet-2026", new Date("2026-08-06T00:00:00"))).toBe("kitgen-tet-2026-20260806.zip");
  });
  it("count không biến đổi danh từ (tiếng Việt)", () => {
    expect(count(0, "sheet")).toBe("0 sheet");
    expect(count(5, "sheet")).toBe("5 sheet");
  });
});
