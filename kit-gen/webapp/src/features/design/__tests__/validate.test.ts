/**
 * VALIDATE 8 LUẬT — kiểm cả hai chiều:
 *  · bắt được lỗi thật (contract hỏng ⇒ chặn lưu, có target để nhảy tới chỗ sai)
 *  · KHÔNG chặn oan (contract thật của dự án phải lưu được)
 *
 * Ca quan trọng nhất: "client không nghiêm hơn agent". Nếu ta chặn thứ
 * `agent/lib/validate.mjs` chỉ cảnh báo, user ôm contract hợp lệ mà không lưu nổi.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contractSchema, type Contract } from "@/lib/types/contract";
import { blockingSummary, cellSeverity, countForSheet, issuesFor, messageFor, validateDesign } from "../lib/validate";
import { clone } from "../lib/ops";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../../");
const load = (p: string): Contract => contractSchema.parse(JSON.parse(readFileSync(resolve(REPO, p), "utf8")));

const campaign = () => load("teams/t4-tichhop/styles-campaign.json");
const rules = (list: { rule: string }[]) => list.map((f) => f.rule);

describe("không chặn oan dữ liệu thật", () => {
  it("styles-campaign.json (12 sheet · 78 element) LƯU ĐƯỢC — 0 lỗi chặn", () => {
    const r = validateDesign(campaign());
    expect(rules(r.errors)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(blockingSummary(r)).toBeNull();
  });

  it("styles.json thật CÓ lỗi V-03 (sheet trùng id) — đúng lỗi audit K4/A6 phải chặn", () => {
    const raw = JSON.parse(readFileSync(resolve(REPO, "styles.json"), "utf8")) as Contract;
    const r = validateDesign(raw);
    expect(rules(r.errors)).toContain("V-03");
    const dup = r.errors.find((f) => f.rule === "V-03")!;
    expect(dup.target.kind).toBe("sheet"); // click là nhảy tới đúng sheet
  });

  it("ô pose và ô trống được MIỄN luật tên file V-01 (đúng agent)", () => {
    const c = campaign();
    c.sheets[0]!.components[0] = { file: "pose-lan-idle", vi: "", spec: "x", skel: { shape: "pose", w: 0.6, h: 0.9 } };
    c.sheets[0]!.components[1] = { file: "", vi: "", spec: "", skel: { shape: "empty", w: 1, h: 1 } };
    expect(rules(validateDesign(c).errors)).not.toContain("V-01");
  });
});

describe("8 luật chặn đúng chỗ", () => {
  it("V-04 · số ô phải bằng cols×rows, kèm nút sửa 1 chạm", () => {
    const c = campaign();
    c.sheets[0]!.components.pop(); // 16 → 15 trong lưới 4×4
    const r = validateDesign(c);
    const f = r.errors.find((x) => x.rule === "V-04")!;
    expect(f.message).toContain("cần 16 ô, đang có 15");
    expect(f.fix?.kind).toBe("add-cells");
    expect(r.ok).toBe(false);
  });

  it("V-01 · tên file sai dạng ⇒ lỗi INLINE tại đúng field `file` của đúng ô", () => {
    const c = campaign();
    c.sheets[0]!.components[2]!.file = "Nút Đỏ";
    const r = validateDesign(c);
    const t = { kind: "element", sheetId: c.sheets[0]!.id, index: 2, field: "file" } as const;
    expect(issuesFor(r, t).some((f) => f.rule === "V-01")).toBe(true);
    expect(messageFor(r, t)?.severity).toBe("error");
    expect(cellSeverity(r, c.sheets[0]!.id, 2)).toBe("error");
    expect(cellSeverity(r, c.sheets[0]!.id, 3)).not.toBe("error");
  });

  it("V-02 · trùng tên file trong CÙNG sheet", () => {
    const c = campaign();
    c.sheets[0]!.components[1]!.file = c.sheets[0]!.components[0]!.file;
    expect(rules(validateDesign(c).errors)).toContain("V-02");
  });

  it("V-03 · mã sheet sai dạng, kèm gợi ý slug", () => {
    const c = campaign();
    c.sheets[1]!.id = "Sheet Của Tôi";
    const f = validateDesign(c).errors.find((x) => x.rule === "V-03")!;
    expect(f.fix?.kind).toBe("slug-sheet");
  });

  it("V-05 · mã phong cách trùng / sai dạng", () => {
    const c = campaign();
    const list = c.styles ?? c.variants ?? [];
    list[1]!.id = list[0]!.id;
    expect(rules(validateDesign(c).errors)).toContain("V-05");
  });

  it("V-06 · w,h phải thuộc (0,1]", () => {
    for (const bad of [0, -0.5, 1.2, 3]) {
      const c = campaign();
      c.sheets[0]!.components[0]!.skel.w = bad;
      expect(rules(validateDesign(c).errors), `w=${bad}`).toContain("V-06");
    }
    const okc = campaign();
    okc.sheets[0]!.components[0]!.skel.w = 1;
    expect(rules(validateDesign(okc).errors)).not.toContain("V-06");
  });

  it("V-07 · sheet 0 element chỉ CẢNH BÁO (không chặn lưu)", () => {
    const c = campaign();
    c.sheets[2]!.components = [];
    c.sheets[2]!.grid = { cols: 1, rows: 0 };
    const r = validateDesign(c);
    expect(rules(r.warnings)).toContain("V-07");
  });

  it("V-08 · ref bị xoá mà còn dùng ⇒ CHẶN; không truyền danh sách ref thì KHÔNG đoán bừa", () => {
    const c = campaign();
    c.sheets[0]!.ref = "refs/anh-mau.png";
    expect(rules(validateDesign(c).errors)).not.toContain("V-08"); // chưa biết đĩa có gì
    const r = validateDesign(c, { refNames: ["khac.png"] });
    expect(rules(r.errors)).toContain("V-08");
    expect(rules(validateDesign(c, { refNames: ["anh-mau.png"] }).errors)).not.toContain("V-08");
  });
});

describe("cỡ đầu ra (`out`) — gương của agent/lib/validate.mjs", () => {
  it("thiếu `out` là HỢP LỆ (kit đời cũ), có thì phải là số nguyên 8..4096", () => {
    const c = campaign();
    expect(rules(validateDesign(c).errors)).not.toContain("OUT_SIZE");
    const ok = campaign();
    (ok.sheets[0]!.components[0]! as { out?: unknown }).out = { w: 120, h: 52 };
    expect(rules(validateDesign(ok).errors)).not.toContain("OUT_SIZE");
    for (const bad of [{ w: 4, h: 52 }, { w: 120, h: 9999 }, { w: 120.5, h: 52 }]) {
      const c2 = campaign();
      (c2.sheets[0]!.components[0]! as { out?: unknown }).out = bad;
      expect(rules(validateDesign(c2).errors)).toContain("OUT_SIZE");
    }
  });

  it("`out` KHÔNG đụng tới V-06: nó là px đầu ra, không phải phân số ô", () => {
    /* Hai cỡ sống cạnh nhau trong một ô: `skel.w/h` là hộp VẼ (phân số ô, ≤ 1) còn
       `out` là cỡ ĐẦU RA tính bằng pixel. Gộp chúng làm một là quay lại đúng bệnh
       "chọn nút nhỏ ⇒ máy vẽ nhỏ ⇒ mất độ phân giải". */
    const c = campaign();
    (c.sheets[0]!.components[0]! as { out?: unknown }).out = { w: 1254, h: 1254 };
    c.sheets[0]!.components[0]!.skel.w = 0.8;
    const r = validateDesign(c);
    expect(rules(r.errors)).not.toContain("OUT_SIZE");
    expect(rules(r.errors)).not.toContain("V-06");
  });
});

describe("luật engine ngoài schema", () => {
  it("matte chỉ nhận glow|glass — sai là CHẶN (slice.py không hiểu giá trị khác)", () => {
    const c = campaign();
    (c.sheets[0]!.components[0]!.skel as Record<string, unknown>).matte = "neon";
    expect(rules(validateDesign(c).errors)).toContain("SKEL_MATTE");
    for (const good of ["glow", "glass"]) {
      const ok = campaign();
      (ok.sheets[0]!.components[0]!.skel as Record<string, unknown>).matte = good;
      expect(rules(validateDesign(ok).errors)).not.toContain("SKEL_MATTE");
    }
  });

  it("slice9 / free / plain phải là bool", () => {
    const c = campaign();
    (c.sheets[0]!.components[0]!.skel as Record<string, unknown>).slice9 = "yes";
    expect(rules(validateDesign(c).errors)).toContain("SKEL_FLAG");
  });

  it("shape lạ chỉ CẢNH BÁO — agent cũng chỉ cảnh báo, client không được nghiêm hơn", () => {
    const c = campaign();
    (c.sheets[0]!.components[0]!.skel as Record<string, unknown>).shape = "hexagon";
    const r = validateDesign(c);
    expect(rules(r.warnings)).toContain("SKEL_SHAPE");
    expect(rules(r.errors)).not.toContain("SKEL_SHAPE");
    // shape học được từ element-lib thì im lặng hẳn
    expect(rules(validateDesign(c, { extraShapes: ["hexagon"] }).warnings)).not.toContain("SKEL_SHAPE");
  });

  it("ô trống được đếm thành cảnh báo có % diện tích (đóng audit C5)", () => {
    const c = campaign();
    c.sheets[0]!.components[0] = { file: "", vi: "", spec: "", skel: { shape: "empty", w: 1, h: 1 } };
    const w = validateDesign(c).warnings.find((f) => f.rule === "EMPTY_CELLS")!;
    expect(w.message).toMatch(/1 ô trống.*≈6% diện tích/);
  });

  it("phong cách bị xoá mà sheet còn trỏ tới ⇒ cảnh báo UNKNOWN_VARIANT", () => {
    const c = campaign();
    c.sheets[0]!.styles = ["khong-ton-tai"];
    expect(rules(validateDesign(c).warnings)).toContain("UNKNOWN_VARIANT");
  });
});

describe("gom lỗi cho UI", () => {
  it("đếm theo sheet để cây thiết kế chấm dấu đỏ đúng nhánh", () => {
    const c = campaign();
    c.sheets[0]!.components[0]!.file = "SAI";
    const r = validateDesign(c);
    expect(countForSheet(r, c.sheets[0]!.id).errors).toBeGreaterThan(0);
    expect(countForSheet(r, c.sheets[1]!.id).errors).toBe(0);
  });

  it("không đếm đôi khi zod và luật thủ công cùng bắt một lỗi", () => {
    const c = campaign();
    c.sheets[0]!.components[0]!.file = "";
    const r = validateDesign(c);
    const v01 = r.errors.filter((f) => f.rule === "V-01" && f.target.kind === "element" && f.target.index === 0);
    expect(v01).toHaveLength(1);
  });

  it("contract rỗng hoặc null KHÔNG làm vỡ hàm (màn còn đang tải)", () => {
    expect(validateDesign(null).ok).toBe(true);
    expect(validateDesign(clone({ sheets: [], characterPoses: [] } as Contract)).ok).toBe(true);
  });
});
