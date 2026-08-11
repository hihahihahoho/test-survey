import { describe, expect, it } from "vitest";
import type { Contract, KitFile } from "@/lib/types";
import { editItem, itemCount, locateItem } from "../lib/item-edit";

const contract = { version: 2, characterPoses: [], variants: [{ id: "main", vi: "Chính", style: "flat", bg: "magenta" }], sheets: [{ id: "ui", grid: { cols: 2, rows: 1 }, components: [{ file: "01-a", vi: "A", spec: "old", skel: { shape: "rrect", w: 1, h: 1 } }, { file: "02-b", vi: "B", spec: "b", skel: { shape: "rrect", w: 1, h: 1 } }] }] } as unknown as Contract;
const file = { file: "01-a.png", path: "kits/main/01-a.png", sheet: "ui", cellIndex: 0 } as KitFile;

describe("panel sửa món", () => {
  it("lấy N từ số món thật của tấm", () => expect(itemCount(locateItem(contract, file))).toBe(2));
  it("chỉ sửa đúng món và không đổi bản gốc", () => {
    const location = locateItem(contract, file)!;
    const next = editItem(contract, location, { spec: "new" });
    expect(next.sheets[0]!.components[0]!.spec).toBe("new");
    expect(contract.sheets[0]!.components[0]!.spec).toBe("old");
  });
  it("bỏ trống vẫn giữ đủ số ô của tấm", () => {
    const next = editItem(contract, locateItem(contract, file)!, { spec: "", empty: true });
    expect(next.sheets[0]!.components).toHaveLength(2);
    expect(next.sheets[0]!.components[0]).toMatchObject({ file: "", skel: { shape: "empty" } });
  });
});
