/**
 * Ca tối thiểu bắt buộc: zod BẮT ĐƯỢC contract sai —
 *   · số component != cols×rows  (V-04)
 *   · shape lạ
 *   · w/h ngoài (0,1]            (V-06)
 *
 * Và điều quan trọng không kém: KHÔNG được báo sai trên DỮ LIỆU THẬT của dự án.
 * Hai file thật được nạp từ đĩa (không phải fixture tự chế):
 *   · ../../../../styles.json                      13 sheet · 122 component · 4 phong cách
 *   · ../../../../teams/t4-tichhop/styles-campaign.json  12 sheet · 78 component · 3 phong cách
 * `styles.json` có 2 id sheet TRÙNG (`pose-soc`, `pose-soc2`) — đúng lỗi audit K4/A6,
 * và schema phải bắt được nó. Đây là lý do file thật được đưa vào test chứ không chỉ mock.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  contractJobs, contractSchema, contractVariants, contractWarnings, componentSchema,
  issueRule, issueRules, normalizeContract, sheetSchema, skelSchema, slugify, toValidationErrors,
} from "../contract";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../../../../..");
const readJson = (rel: string) => JSON.parse(readFileSync(resolve(repo, rel), "utf8"));

const goodSkel = { shape: "rrect" as const, w: 0.8, h: 0.6 };
const cell = (n: number) => ({ file: `0${n}-btn-x${n}`, vi: "Nút", spec: "", skel: goodSkel });
const sheet2x1 = { id: "main", grid: { cols: 2, rows: 1 }, components: [cell(1), cell(2)] };
const baseContract = {
  schemaVersion: 4,
  sheets: [sheet2x1],
  variants: [{ id: "tet", vi: "Tết đỏ", style: "", bg: "magenta" }],
  characterPoses: [],
};

/** Lấy mã luật của issue để assert đúng LUẬT nào bắt được, không chỉ "có lỗi". */
const rules = (result: { success: boolean; error?: { issues: readonly unknown[] } }) =>
  result.success ? [] : issueRules(result.error);

describe("V-04 — số component phải bằng cols×rows", () => {
  it("bắt được thiếu ô (lưới 4×4 có 15 ô)", () => {
    const bad = {
      ...baseContract,
      sheets: [{ id: "main", grid: { cols: 4, rows: 4 }, components: Array.from({ length: 15 }, (_, i) => cell(i)) }],
    };
    const r = contractSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(rules(r)).toContain("V-04");
    const v04 = r.error!.issues.find((i) => issueRule(i) === "V-04")!;
    expect(v04.message).toContain("cần 16 ô, đang có 15");
  });

  it("bắt được thừa ô", () => {
    const bad = { ...baseContract, sheets: [{ ...sheet2x1, components: [cell(1), cell(2), cell(3)] }] };
    expect(rules(contractSchema.safeParse(bad))).toContain("V-04");
  });

  it("đủ ô thì qua", () => {
    expect(contractSchema.safeParse(baseContract).success).toBe(true);
  });
});

describe("shape lạ bị từ chối", () => {
  it("shape không có trong tập silhouettes.js/skeleton.py ⇒ lỗi", () => {
    const r = skelSchema.safeParse({ shape: "hexagon", w: 0.5, h: 0.5 });
    expect(r.success).toBe(false);
  });

  it("cả 11 shape hợp lệ đều qua", () => {
    for (const shape of ["empty", "pose", "pill", "bar", "rrect", "rect", "circle", "burst", "puzzle", "figure", "full"]) {
      expect(skelSchema.safeParse({ shape, w: 0.5, h: 0.5 }).success).toBe(true);
    }
  });

  it("thiếu shape ⇒ lỗi (không tự đoán hộ)", () => {
    expect(skelSchema.safeParse({ w: 0.5, h: 0.5 }).success).toBe(false);
  });
});

describe("V-06 — w/h phải nằm trong (0,1]", () => {
  const bad = [0, -0.1, 1.01, 2, Number.NaN];
  for (const v of bad) {
    it(`từ chối w=${v}`, () => {
      expect(skelSchema.safeParse({ shape: "pill", w: v, h: 0.5 }).success).toBe(false);
    });
    it(`từ chối h=${v}`, () => {
      expect(skelSchema.safeParse({ shape: "pill", w: 0.5, h: v }).success).toBe(false);
    });
  }
  it("nhận biên trên w=1, h=1 (ô nền full-bleed dùng đúng giá trị này)", () => {
    expect(skelSchema.safeParse({ shape: "full", w: 1, h: 1 }).success).toBe(true);
  });
  it("thông điệp lỗi là tiếng Việt người đọc được", () => {
    const r = skelSchema.safeParse({ shape: "pill", w: 0, h: 0.5 });
    expect(r.error!.issues[0]!.message).toBe("Giá trị từ 0.05 đến 1.00.");
  });
});

describe("V-01/V-02 — tên file element", () => {
  it("bắt tên sai dạng", () => {
    const r = componentSchema.safeParse({ file: "btn-close", vi: "", spec: "", skel: goodSkel });
    expect(rules(r)).toContain("V-01");
  });
  it("MIỄN cho ô trống và ô pose — dữ liệu thật của dự án dùng `pose-lan-idle`, `_empty-...`", () => {
    expect(componentSchema.safeParse({ file: "pose-lan-idle", vi: "", spec: "", skel: { shape: "pose", w: 0.5, h: 0.8 } }).success).toBe(true);
    expect(componentSchema.safeParse({ file: "_empty-pose-lan2-3", vi: "", spec: "", skel: { shape: "empty", w: 0.7, h: 0.7 } }).success).toBe(true);
  });
  it("V-02 bắt trùng tên file trong cùng sheet, chỉ đúng ô sau", () => {
    const r = sheetSchema.safeParse({ ...sheet2x1, components: [cell(1), cell(1)] });
    expect(rules(r)).toContain("V-02");
    expect(r.error!.issues.find((i) => issueRule(i) === "V-02")!.message).toContain("ô 1");
  });
});

describe("V-03/V-05 — id duy nhất", () => {
  it("V-03 bắt id sheet trùng", () => {
    const bad = { ...baseContract, sheets: [sheet2x1, { ...sheet2x1 }] };
    expect(rules(contractSchema.safeParse(bad))).toContain("V-03");
  });
  it("V-03 bắt id sheet sai dạng (chữ hoa, ký tự lạ)", () => {
    const bad = { ...baseContract, sheets: [{ ...sheet2x1, id: "Main Sheet" }] };
    expect(contractSchema.safeParse(bad).success).toBe(false);
  });
  it("V-05 bắt id phong cách trùng", () => {
    const bad = {
      ...baseContract,
      variants: [
        { id: "tet", vi: "A", style: "", bg: "magenta" },
        { id: "tet", vi: "B", style: "", bg: "magenta" },
      ],
    };
    expect(rules(contractSchema.safeParse(bad))).toContain("V-05");
  });
});

describe("cảnh báo (KHÔNG chặn lưu)", () => {
  it("V-07: sheet 0 element là CẢNH BÁO, contract vẫn hợp lệ", () => {
    const c = { ...baseContract, sheets: [{ id: "tall", grid: { cols: 1, rows: 1 }, components: [] }] };
    // cols×rows = 1 mà 0 ô ⇒ V-04 chặn. Dùng lưới hợp lệ 0 ô là không thể, nên
    // kiểm cảnh báo trên contract đã parse được với sheet rỗng hợp lệ về V-04.
    expect(contractSchema.safeParse(c).success).toBe(false);

    const ok = contractSchema.parse(baseContract);
    ok.sheets.push({ id: "tall", grid: { cols: 1, rows: 1 }, components: [] } as never);
    const w = contractWarnings(ok);
    expect(w.some((x) => x.rule === "V-07")).toBe(true);
  });

  it("đếm ô trống kèm % diện tích (dải cảnh báo S3.3)", () => {
    const c = contractSchema.parse({
      ...baseContract,
      sheets: [
        {
          id: "main", grid: { cols: 2, rows: 2 },
          components: [cell(1), cell(2), cell(3), { file: "_e", vi: "", spec: "", skel: { shape: "empty", w: 0.7, h: 0.7 } }],
        },
      ],
    });
    const w = contractWarnings(c);
    const empty = w.find((x) => x.rule === "EMPTY_CELLS");
    expect(empty?.message).toContain("1 ô trống");
    expect(empty?.message).toContain("25%");
  });

  it("sheet trỏ tới phong cách không tồn tại ⇒ cảnh báo, không chặn", () => {
    const c = contractSchema.parse({ ...baseContract, sheets: [{ ...sheet2x1, variants: ["khong-co"] }] });
    expect(contractWarnings(c).some((x) => x.rule === "UNKNOWN_VARIANT")).toBe(true);
  });
});

describe("contractJobs — phải khớp ĐÚNG contractJobs() của agent và gen.sh", () => {
  it("sheet không khai variants ⇒ áp cho MỌI phong cách", () => {
    const c = contractSchema.parse({
      ...baseContract,
      variants: [
        { id: "tet", vi: "A", style: "", bg: "m" },
        { id: "vang", vi: "B", style: "", bg: "m" },
      ],
    });
    expect(contractJobs(c).map((j) => j.job)).toEqual(["tet-main", "vang-main"]);
  });

  it("sheet khai variants ⇒ chỉ sinh cho phong cách được khai", () => {
    const c = contractSchema.parse({
      ...baseContract,
      variants: [
        { id: "tet", vi: "A", style: "", bg: "m" },
        { id: "vang", vi: "B", style: "", bg: "m" },
      ],
      sheets: [{ ...sheet2x1, variants: ["tet"] }],
    });
    expect(contractJobs(c).map((j) => j.job)).toEqual(["tet-main"]);
  });

  it("đọc được tên cũ `styles[]` trên đĩa (styles.json thật dùng tên này)", () => {
    const c = contractSchema.parse({
      schemaVersion: 4, characterPoses: [],
      styles: [{ id: "tet", vi: "A", style: "", bg: "m" }],
      sheets: [{ ...sheet2x1, styles: ["tet"] }],
    });
    expect(contractVariants(c)).toHaveLength(1);
    expect(contractJobs(c).map((j) => j.job)).toEqual(["tet-main"]);
  });

  it("normalizeContract đưa styles[] về variants[] trước khi PUT", () => {
    const c = contractSchema.parse({
      schemaVersion: 4, characterPoses: [],
      styles: [{ id: "tet", vi: "A", style: "", bg: "m" }],
      sheets: [{ ...sheet2x1, styles: ["tet"] }],
    });
    const n = normalizeContract(c);
    expect(n.variants).toHaveLength(1);
    expect(n.styles).toBeUndefined();
    expect(n.sheets[0]!.variants).toEqual(["tet"]);
    expect(n.sheets[0]!.styles).toBeUndefined();
  });
});

describe("DỮ LIỆU THẬT trên đĩa — schema không được báo sai", () => {
  it("styles-campaign.json (12 sheet · 78 component · 3 phong cách) parse SẠCH", () => {
    const raw = readJson("teams/t4-tichhop/styles-campaign.json");
    const r = contractSchema.safeParse(raw);
    if (!r.success) throw new Error(`Không parse được: ${JSON.stringify(r.error.issues.slice(0, 5), null, 2)}`);
    expect(r.data.sheets).toHaveLength(12);
    expect(contractVariants(r.data)).toHaveLength(3);
    expect(r.data.sheets.reduce((n, s) => n + s.components.length, 0)).toBe(78);
    // Mỗi sheet chỉ sinh cho phong cách được khai ⇒ 12 lượt, không phải 36.
    expect(contractJobs(r.data)).toHaveLength(12);
  });

  it("styles.json (13 sheet · 122 component) — schema BẮT ĐƯỢC 2 id sheet trùng (audit K4/A6)", () => {
    const raw = readJson("styles.json");
    const r = contractSchema.safeParse(raw);
    expect(r.success).toBe(false);
    const dupIssues = r.error!.issues.filter((i) => issueRule(i) === "V-03");
    expect(dupIssues).toHaveLength(2); // pose-soc và pose-soc2
    expect(dupIssues.map((i) => i.message).join(" ")).toContain("pose-soc");
    // Và KHÔNG có lỗi nào khác: 122 component thật, 76 ô pose + 4 ô trống đều hợp lệ.
    expect(r.error!.issues).toHaveLength(2);
  });

  it("styles.example.json parse sạch", () => {
    const raw = readJson("styles.example.json");
    const r = contractSchema.safeParse(raw);
    expect(r.success).toBe(true);
    expect(r.data!.characterPoses).toHaveLength(19);
  });
});

describe("slugify — khớp agent (§4.1-1, đóng E2)", () => {
  it("bỏ dấu tiếng Việt", () => {
    expect(slugify("Xuân 26")).toBe("xuan-26");
    expect(slugify("Tết 2026 — VietinBank iPay")).toBe("tet-2026-vietinbank-ipay");
  });
  it("chữ đ", () => {
    expect(slugify("Đập Trứng Vàng")).toBe("dap-trung-vang");
  });
  it("chuỗi rỗng/toàn ký tự lạ ⇒ 'project', KHÔNG từ chối im lặng", () => {
    expect(slugify("")).toBe("project");
    expect(slugify("!!!")).toBe("project");
  });
  it("cắt 40 ký tự, không để lại gạch nối thừa", () => {
    const s = slugify("a".repeat(60));
    expect(s.length).toBeLessThanOrEqual(40);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("toValidationErrors — nguyên liệu cho thanh Validate của S3", () => {
  it("đổi issue của zod thành {rule, path, message} có đường dẫn đọc được", () => {
    const bad = {
      schemaVersion: 4, characterPoses: [],
      variants: [{ id: "tet", vi: "A", style: "", bg: "m" }],
      sheets: [{ id: "main", grid: { cols: 4, rows: 4 }, components: [] }],
    };
    const r = contractSchema.safeParse(bad);
    const errs = toValidationErrors(r.error);
    const v04 = errs.find((e) => e.rule === "V-04")!;
    expect(v04.path).toBe("sheets[0].components");
    expect(v04.message).toContain("cần 16 ô");
  });

  it("issue không gắn luật vẫn có nhãn SCHEMA, không rơi mất", () => {
    const r = contractSchema.safeParse({ sheets: "sai kiểu" });
    expect(toValidationErrors(r.error).every((e) => e.rule.length > 0)).toBe(true);
  });

  it("không có lỗi ⇒ mảng rỗng, không ném", () => {
    expect(toValidationErrors(null)).toEqual([]);
    expect(toValidationErrors(undefined)).toEqual([]);
  });
});
