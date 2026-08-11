/**
 * Bất biến §4.5: `∪ view.sheetIds ⊆ contract.sheets[].id`, và KHÔNG có sheet tàng hình.
 * Ca quan trọng nhất: **sheet bị xoá khỏi contract** ⇒ ra "mất liên kết", KHÔNG ném lỗi.
 */
import { describe, expect, it } from "vitest";
import {
  everySheetVisible,
  orphanSheetIds,
  reconcileView,
  virtualAllSheetsDoc,
} from "../lib/invariants";
import { ALL_SHEETS_DOC_ID, type Doc } from "../lib/types";

const T = "2026-08-06T09:00:00.000Z";
const doc = (id: string, sheetIds: string[], trashed = false): Doc => ({
  id,
  name: id,
  kind: "workflow",
  createdAt: T,
  updatedAt: T,
  color: "none",
  view: { sheetIds, variantIds: [] },
  trashedAt: trashed ? T : null,
});

describe("reconcileView", () => {
  it("bộ lọc hợp lệ đi qua nguyên vẹn", () => {
    const r = reconcileView({ sheetIds: ["main", "tall"], variantIds: ["tet"] }, ["main", "tall", "bg-home"]);
    expect(r.staleSheetIds).toEqual([]);
    expect(r.view.sheetIds).toEqual(["main", "tall"]);
    expect(r.view.variantIds).toEqual(["tet"]);
  });

  it("SHEET BỊ XOÁ KHỎI CONTRACT ⇒ staleSheetIds, KHÔNG ném, phần còn lại vẫn dùng được", () => {
    const r = reconcileView({ sheetIds: ["main", "da-xoa"], variantIds: [] }, ["main", "tall"]);
    expect(r.staleSheetIds).toEqual(["da-xoa"]);
    expect(r.view.sheetIds).toEqual(["main"]);
  });

  it("file canvas không có view ⇒ bộ lọc rỗng, không lỗi", () => {
    expect(reconcileView(undefined, ["main"])).toEqual({ staleSheetIds: [], view: { sheetIds: [], variantIds: [] } });
  });

  it("contract rỗng ⇒ mọi sheetIds đều stale, không ném", () => {
    expect(reconcileView({ sheetIds: ["a", "b"], variantIds: [] }, []).staleSheetIds).toEqual(["a", "b"]);
  });
});

describe("không có sheet tàng hình", () => {
  const sheets = ["main", "tall", "bg-home"];

  it("sheet không nằm trong file nào ⇒ orphan", () => {
    expect(orphanSheetIds([doc("f-a", ["main"])], sheets)).toEqual(["tall", "bg-home"]);
  });

  it("file trong thùng rác KHÔNG được tính là đang che sheet", () => {
    expect(orphanSheetIds([doc("f-a", ["main"], true)], sheets)).toEqual(sheets);
  });

  it("file ảo «Tất cả sheet» luôn phủ hết ⇒ bất biến đúng kể cả khi không có file con nào", () => {
    expect(virtualAllSheetsDoc(sheets, T).id).toBe(ALL_SHEETS_DOC_ID);
    expect(virtualAllSheetsDoc(sheets, T).view?.sheetIds).toEqual(sheets);
    expect(everySheetVisible([], sheets)).toBe(true);
    expect(everySheetVisible([doc("f-a", ["main"])], sheets)).toBe(true);
  });
});
