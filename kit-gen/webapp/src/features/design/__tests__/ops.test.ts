/**
 * Thao tác CRUD — kiểm trên DỮ LIỆU THẬT `teams/t4-tichhop/styles-campaign.json`
 * (12 sheet · 78 element · 3 phong cách), không phải trên fixture tự bịa.
 *
 * Bất biến phải giữ sau MỌI thao tác:
 *   I1. `components.length === cols*rows` (V-04 — chính là assert của gen.sh/slice.py)
 *   I2. contract cũ KHÔNG bị sửa tại chỗ (undo stack mới đúng)
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { contractSchema, contractVariants, type Contract } from "@/lib/types/contract";
import * as ops from "../lib/ops";
import * as style from "../lib/ops-style";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../../");

function realContract(): Contract {
  const raw = JSON.parse(readFileSync(resolve(REPO, "teams/t4-tichhop/styles-campaign.json"), "utf8"));
  const p = contractSchema.safeParse(raw);
  expect(p.success, `styles-campaign.json phải parse sạch: ${JSON.stringify(p.error?.issues?.slice(0, 3))}`).toBe(true);
  return p.data as Contract;
}

const gridOk = (c: Contract) =>
  c.sheets.every((s) => s.components.length === s.grid.cols * s.grid.rows);

describe("dữ liệu thật styles-campaign.json", () => {
  it("đúng 12 sheet · 78 element · 3 phong cách", () => {
    const c = realContract();
    expect(c.sheets).toHaveLength(12);
    expect(c.sheets.reduce((n, s) => n + s.components.length, 0)).toBe(78);
    expect(contractVariants(c)).toHaveLength(3);
    expect(gridOk(c)).toBe(true);
  });
});

describe("CRUD sheet", () => {
  it("thêm sheet: id không đụng, đủ cols×rows ô trống, KHÔNG sửa bản cũ", () => {
    const c = realContract();
    const before = JSON.stringify(c);
    const r = ops.addSheet(c, { id: "mo-qua-main", cols: 3, rows: 2 });
    expect(JSON.stringify(c)).toBe(before); // I2
    expect(r.contract.sheets).toHaveLength(13);
    const added = r.contract.sheets.at(-1)!;
    expect(added.id).toBe("mo-qua-main-2"); // né trùng thay vì ghi đè
    expect(added.components).toHaveLength(6);
    expect(added.components.every((x) => ops.isEmptyCell(x))).toBe(true);
    expect(gridOk(r.contract)).toBe(true);
  });

  it("nhân bản / xoá / đổi thứ tự giữ nguyên bất biến lưới", () => {
    let c = realContract();
    c = ops.duplicateSheet(c, "mo-qua-tall").contract;
    expect(c.sheets.map((s) => s.id)).toContain("mo-qua-tall-2");
    c = ops.moveSheet(c, "mo-qua-tall-2", -1).contract;
    expect(c.sheets[1]!.id).toBe("mo-qua-tall-2");
    c = ops.removeSheet(c, "mo-qua-tall-2").contract;
    expect(c.sheets.map((s) => s.id)).not.toContain("mo-qua-tall-2");
    expect(gridOk(c)).toBe(true);
  });

  it("thao tác trên sheet không tồn tại KHÔNG tạo bước undo rỗng", () => {
    const c = realContract();
    for (const r of [ops.removeSheet(c, "xxx"), ops.moveSheet(c, "xxx", 1), ops.patchCell(c, "xxx", 0, {})]) {
      expect(r.label).toBe("");
      expect(r.contract).toBe(c);
    }
  });
});

describe("ĐỔI LƯỚI và hệ quả (yêu cầu §3 của brief)", () => {
  it("lưới TO ra ⇒ tự bù ô trống, không hỏi gì", () => {
    const c = realContract();
    const r = ops.resizeGrid(c, "mo-qua-tall", 4, 4); // 4×2=8 → 4×4=16
    const sh = ops.findSheet(r.contract, "mo-qua-tall")!;
    expect(sh.components).toHaveLength(16);
    expect(sh.components.slice(8).every((x) => ops.isEmptyCell(x))).toBe(true);
    expect(ops.realCount(sh)).toBe(8); // không mất element nào
  });

  it("lưới NHỎ đi: overflowOf() báo trước ĐÚNG số element sẽ mất", () => {
    const c = realContract();
    const sh = ops.findSheet(c, "mo-qua-main")!; // 4×4, 16 element thật
    expect(ops.overflowOf(sh, 3, 3)).toHaveLength(7);
    expect(ops.overflowOf(sh, 4, 4)).toHaveLength(0);
  });

  it('"drop" bỏ hẳn · "move" chuyển sang sheet mới · "grow" không mất gì', () => {
    const c = realContract();

    const drop = ops.resizeGrid(c, "mo-qua-main", 3, 3, { overflow: "drop" });
    expect(ops.findSheet(drop.contract, "mo-qua-main")!.components).toHaveLength(9);
    expect(drop.label).toContain("bỏ 7 element");
    expect(gridOk(drop.contract)).toBe(true);

    const move = ops.resizeGrid(c, "mo-qua-main", 3, 3, { overflow: "move" });
    const spill = ops.findSheet(move.contract, "mo-qua-main-2")!;
    expect(spill.components.filter((x) => !ops.isEmptyCell(x))).toHaveLength(7);
    // Tổng element THẬT không đổi ⇒ "move" đúng nghĩa không mất dữ liệu.
    expect(ops.countRealComponents(move.contract)).toBe(ops.countRealComponents(c));
    expect(gridOk(move.contract)).toBe(true);

    const grow = ops.resizeGrid(c, "mo-qua-main", 3, 3, { overflow: "grow" });
    expect(ops.findSheet(grow.contract, "mo-qua-main")!.grid).toEqual({ cols: 3, rows: 6 });
    expect(ops.countRealComponents(grow.contract)).toBe(ops.countRealComponents(c));
    expect(gridOk(grow.contract)).toBe(true);
  });
});

describe("CRUD element", () => {
  it("xoá element ⇒ ô thành TRỐNG, không dồn ô (bố cục ảnh không xô lệch)", () => {
    const c = realContract();
    const sh0 = ops.findSheet(c, "mo-qua-main")!;
    const keepLast = sh0.components.at(-1)!.file;
    const r = ops.clearCell(c, "mo-qua-main", 0);
    const sh = ops.findSheet(r.contract, "mo-qua-main")!;
    expect(sh.components).toHaveLength(16);
    expect(ops.isEmptyCell(sh.components[0])).toBe(true);
    expect(sh.components.at(-1)!.file).toBe(keepLast);
    expect(r.label).toContain("Bỏ");
  });

  it("đổi vị trí 2 ô (⌥←→) chỉ hoán đổi, không đổi số ô", () => {
    const c = realContract();
    const sh0 = ops.findSheet(c, "mo-qua-main")!;
    const [a, b] = [sh0.components[0]!.file, sh0.components[5]!.file];
    const sh = ops.findSheet(ops.swapCells(c, "mo-qua-main", 0, 5).contract, "mo-qua-main")!;
    expect(sh.components[0]!.file).toBe(b);
    expect(sh.components[5]!.file).toBe(a);
    expect(sh.components).toHaveLength(16);
  });

  it("swap ra ngoài biên / vào chính nó = không làm gì", () => {
    const c = realContract();
    expect(ops.swapCells(c, "mo-qua-main", 0, 99).label).toBe("");
    expect(ops.swapCells(c, "mo-qua-main", 3, 3).label).toBe("");
  });

  it("patchCell merge skel chứ không thay cả cục (giữ field lạ của agent mới)", () => {
    const c = realContract();
    const r = ops.patchCell(c, "mo-qua-main", 0, { skel: { w: 0.5 } });
    const sk = ops.findSheet(r.contract, "mo-qua-main")!.components[0]!.skel;
    expect(sk.w).toBe(0.5);
    expect(sk.shape).toBe(ops.findSheet(c, "mo-qua-main")!.components[0]!.skel.shape);
  });

  it("thêm element: điền ô trống trước; hết chỗ thì NỚI thêm hàng, không ghi đè", () => {
    const c = realContract();
    const full = ops.findSheet(c, "mo-qua-main")!; // 16/16, không còn ô trống
    const r = ops.addElements(c, "mo-qua-main", [{ vi: "Nút mới" }, { vi: "Nút nữa" }]);
    const sh = ops.findSheet(r.contract, "mo-qua-main")!;
    expect(sh.grid).toEqual({ cols: 4, rows: 5 });
    expect(sh.components).toHaveLength(20);
    expect(sh.components.slice(0, 16).map((x) => x.file)).toEqual(full.components.map((x) => x.file));
    // tên file tự sinh đúng dạng V-01 để element mới không đỏ ngay
    expect(sh.components[16]!.file).toMatch(/^[0-9]{2}-[a-z0-9-]+$/);
    expect(sh.components[17]!.file).toMatch(/^[0-9]{2}-[a-z0-9-]+$/);
    expect(sh.components[16]!.file).not.toBe(sh.components[17]!.file);
    expect(gridOk(r.contract)).toBe(true);
  });
});

describe("phong cách · nhân vật · tham số cắt", () => {
  it("ghi variants[] chuẩn hoá: xoá khoá cũ styles[] để không có hai nguồn sự thật", () => {
    const c = realContract();
    expect(c.styles, "dữ liệu thật dùng khoá cũ").toBeTruthy();
    const r = style.addVariant(c, { vi: "Tết đỏ" });
    expect(r.contract.styles).toBeUndefined();
    expect(r.contract.variants).toHaveLength(4);
    expect(r.contract.variants!.at(-1)!.id).toBe("tet-do"); // slug từ tên có dấu (E2)
  });

  it("đổi mã phong cách kéo theo mọi sheet.variants[] — không để sheet mồ côi", () => {
    const c = realContract();
    const usedBy = c.sheets.filter((s) => (s.styles ?? s.variants ?? []).includes("mo-qua")).length;
    expect(usedBy).toBeGreaterThan(0);
    const r = style.renameVariantId(c, "mo-qua", "mo-qua-v2");
    const after = r.contract.sheets.filter((s) => (s.variants ?? []).includes("mo-qua-v2")).length;
    expect(after).toBe(usedBy);
    expect(r.contract.sheets.some((s) => (s.variants ?? []).includes("mo-qua"))).toBe(false);
  });

  it("xoá phong cách: gỡ id khỏi sheet, không để lại tham chiếu chết", () => {
    const c = realContract();
    const r = style.removeVariant(c, "mo-qua");
    expect(contractVariants(r.contract).map((v) => v.id)).not.toContain("mo-qua");
    expect(r.contract.sheets.some((s) => (s.variants ?? []).includes("mo-qua"))).toBe(false);
  });

  it("số lượt sinh ảnh = phong cách × sheet, khớp contractJobs() của agent", () => {
    const c = realContract();
    const bySheet = c.sheets.reduce((n, sh) => n + ops.jobCountOfSheet(c, sh), 0);
    const byVariant = contractVariants(c).reduce((n, v) => n + ops.jobCountOfVariant(c, v.id), 0);
    expect(bySheet).toBe(byVariant);
  });

  it("threshold ghi được vào từng phong cách (slice.py đọc thật); bleed chỉ nằm ở contract.slice", () => {
    const c = realContract();
    const r = style.patchSliceParams(c, { threshold: 90, bleed: 0.3 }, { scope: "project" });
    expect(r.contract.slice?.threshold).toBe(90);
    expect(r.contract.slice?.bleed).toBe(0.3);
    for (const v of contractVariants(r.contract)) expect((v as { threshold?: number }).threshold).toBe(90);
    // bleed KHÔNG được rải xuống variant: slice.py không đọc nó ở đâu cả.
    for (const v of contractVariants(r.contract)) expect((v as { bleed?: number }).bleed).toBeUndefined();
  });

  it("nhân vật: thêm / bật dáng / xoá, và dáng thuộc PROJECT (đóng A3)", () => {
    let c = realContract();
    const vid = contractVariants(c)[0]!.id;
    c = style.addCharacter(c, vid, { vi: "Lan" }).contract;
    const ch = style.findVariant(c, vid)!.characters!.at(-1)!;
    expect(ch.id).toBe("lan");
    c = style.toggleCharacterPose(c, vid, "lan", "wave").contract;
    expect(style.findVariant(c, vid)!.characters!.at(-1)!.poses).toEqual(["wave"]);
    c = style.toggleCharacterPose(c, vid, "lan", "wave").contract;
    expect(style.findVariant(c, vid)!.characters!.at(-1)!.poses).toEqual([]);
    c = style.removeCharacter(c, vid, "lan").contract;
    expect((style.findVariant(c, vid)!.characters ?? []).some((x) => x.id === "lan")).toBe(false);
  });
});
