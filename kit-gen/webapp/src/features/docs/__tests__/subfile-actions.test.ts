/**
 * Luật CRUD file con — test THUẦN LOGIC (environment "node", chạy trong `npm test`).
 * Mọi thứ ở đây kiểm được mà không cần DOM; ca cần DOM nằm ở `subfile-crud.dom.test.tsx`.
 */
import { describe, expect, it } from "vitest";
import {
  DAY_MS, UNDO_WINDOW_MS, checkDocName, deleteDocDescription, isEditableDoc,
  runNoticeForDoc, safeIdAfterDelete, suggestDocName, trashCountdown, trashEntries,
  undoStillOpen,
} from "../lib/subfile-actions";
import { ALL_SHEETS_DOC_ID, DOC_NAME_MAX, TRASH_KEEP_DAYS, docSchema, type Doc } from "../lib";

const D = (o: Partial<Doc> & { id: string; name: string }): Doc =>
  docSchema.parse({
    kind: "workflow", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    color: "none", trashedAt: null, ...o,
  });

describe("checkDocName — cùng luật với docs-repo-local, không lỏng hơn cũng không chặt hơn", () => {
  const docs = [D({ id: "f-aa", name: "Bộ kit chính" }), D({ id: "f-bb", name: "Ý tưởng Tết" })];

  it("tên rỗng / chỉ khoảng trắng bị chặn với câu đời thường", () => {
    expect(checkDocName("   ", docs).ok).toBe(false);
    expect(checkDocName("   ", docs).error).toMatch(/Đặt tên/);
  });

  it(`quá ${DOC_NAME_MAX} ký tự bị chặn, đúng ${DOC_NAME_MAX} thì qua`, () => {
    expect(checkDocName("x".repeat(DOC_NAME_MAX), docs).ok).toBe(true);
    expect(checkDocName("x".repeat(DOC_NAME_MAX + 1), docs).ok).toBe(false);
  });

  it("xuống dòng bị chặn", () => {
    expect(checkDocName("a\nb", docs).ok).toBe(false);
  });

  it("trùng tên KHÔNG phân biệt hoa thường (giống assertNameFree của repo)", () => {
    expect(checkDocName("bộ KIT chính", docs).ok).toBe(false);
    expect(checkDocName("bộ KIT chính", docs).error).toMatch(/trùng tên/i);
  });

  it("đổi tên chính nó thì không tự coi là trùng", () => {
    expect(checkDocName("Bộ kit chính", docs, "f-aa").ok).toBe(true);
  });

  it("file trong thùng rác KHÔNG chiếm tên", () => {
    const withTrash = [...docs, D({ id: "f-cc", name: "Đã xoá", trashedAt: "2026-01-02T00:00:00.000Z" })];
    expect(checkDocName("Đã xoá", withTrash).ok).toBe(true);
  });

  it("trả về tên ĐÃ TRIM — đúng thứ sẽ được lưu", () => {
    expect(checkDocName("  Tên mới  ", docs).value).toBe("Tên mới");
  });
});

describe("suggestDocName", () => {
  it("theo mode, và tránh trùng bằng hậu tố số", () => {
    expect(suggestDocName("canvas", [])).toBe("Bàn ý tưởng");
    expect(suggestDocName("workflow", [])).toBe("Bộ kit chính");
    const docs = [D({ id: "f-aa", name: "Bàn ý tưởng" }), D({ id: "f-bb", name: "Bàn ý tưởng 2" })];
    expect(suggestDocName("canvas", docs)).toBe("Bàn ý tưởng 3");
  });

  it("tên trong thùng rác không chặn gợi ý", () => {
    const docs = [D({ id: "f-aa", name: "Bàn ý tưởng", trashedAt: "2026-02-01T00:00:00.000Z" })];
    expect(suggestDocName("canvas", docs)).toBe("Bàn ý tưởng");
  });
});

describe("file hệ thống không sửa được", () => {
  it("tab ảo bị khoá, file thường thì không", () => {
    expect(isEditableDoc(ALL_SHEETS_DOC_ID)).toBe(false);
    expect(isEditableDoc("f-y-tuong")).toBe(true);
  });
});

describe("cửa sổ Hoàn tác ĐÚNG 10 giây (§4.4)", () => {
  const e = { docId: "f-aa", name: "A", at: 1_000_000 };

  it("hằng số là 10 000 ms", () => {
    expect(UNDO_WINDOW_MS).toBe(10_000);
  });

  it("biên: đúng 10 000 ms vẫn hoàn tác được, 10 001 ms thì hết", () => {
    expect(undoStillOpen(e, e.at + 9_999)).toBe(true);
    expect(undoStillOpen(e, e.at + 10_000)).toBe(true);
    expect(undoStillOpen(e, e.at + 10_001)).toBe(false);
  });

  it("không có gì để hoàn tác ⇒ false, không nổ", () => {
    expect(undoStillOpen(null, Date.now())).toBe(false);
  });
});

describe(`thùng rác ${TRASH_KEEP_DAYS} ngày`, () => {
  const now = Date.parse("2026-03-01T00:00:00.000Z");
  const docs = [
    D({ id: "f-aa", name: "Xoá hôm nay", trashedAt: "2026-03-01T00:00:00.000Z" }),
    D({ id: "f-bb", name: "Xoá 10 ngày trước", trashedAt: "2026-02-19T00:00:00.000Z" }),
    D({ id: "f-cc", name: "Quá hạn", trashedAt: "2026-01-01T00:00:00.000Z" }),
    D({ id: "f-dd", name: "Đang dùng" }),
  ];

  it("chỉ liệt kê file đã xoá, mới nhất lên đầu", () => {
    const e = trashEntries(docs, now);
    expect(e.map((x) => x.doc.id)).toEqual(["f-aa", "f-bb", "f-cc"]);
  });

  it("đếm ngược đúng số ngày còn lại", () => {
    const e = trashEntries(docs, now);
    expect(e[0]!.daysLeft).toBe(TRASH_KEEP_DAYS);
    expect(e[1]!.daysLeft).toBe(TRASH_KEEP_DAYS - 10);
    expect(e[2]!.expired).toBe(true);
    expect(e[2]!.daysLeft).toBe(0);
  });

  it("câu đếm ngược nói bằng tiếng người, không phải timestamp", () => {
    const e = trashEntries(docs, now);
    expect(trashCountdown(e[1]!)).toBe("Còn 20 ngày");
    expect(trashCountdown(e[2]!)).toMatch(/Hết hạn/);
    const almost = trashEntries(
      [D({ id: "f-xx", name: "x", trashedAt: new Date(now - (TRASH_KEEP_DAYS - 1) * DAY_MS).toISOString() })],
      now,
    );
    expect(trashCountdown(almost[0]!)).toBe("Còn dưới 1 ngày");
  });
});

describe("câu chữ của dialog xoá — spec §4.4 viết sẵn, không được diễn đạt lại lỏng hơn", () => {
  it("nói rõ SHEET, ẢNH và KIT không bị xoá, và nói hạn thùng rác", () => {
    const s = deleteDocDescription("Ý tưởng Tết");
    expect(s).toContain("«Ý tưởng Tết»");
    expect(s).toContain("KHÔNG bị xoá");
    expect(s).toMatch(/Sheet, ảnh đã sinh và kit/);
    expect(s).toContain(`${TRASH_KEEP_DAYS} ngày`);
  });
});

describe("C-01 áp cho file con: cảnh báo run, TUYỆT ĐỐI không huỷ run", () => {
  const doc = D({ id: "f-aa", name: "A", view: { sheetIds: ["main", "pose-lan"], variantIds: [] } });

  it("không dính lượt nào ⇒ không có câu thừa", () => {
    expect(runNoticeForDoc(doc, ["khac"]).affected).toBe(false);
    expect(runNoticeForDoc(doc, []).message).toBeNull();
  });

  it("dính 1 sheet ⇒ nói ĐÚNG câu «lượt này vẫn chạy tiếp» (không phải «sẽ bị dừng»)", () => {
    const n = runNoticeForDoc(doc, ["main"]);
    expect(n.affected).toBe(true);
    expect(n.message).toContain("«main»");
    expect(n.message).toContain("vẫn chạy tiếp");
    expect(n.message).not.toMatch(/bị dừng|huỷ|hủy/i);
  });

  it("dính nhiều sheet ⇒ liệt kê hết", () => {
    const n = runNoticeForDoc(doc, ["main", "pose-lan"]);
    expect(n.sheetIds).toEqual(["main", "pose-lan"]);
    expect(n.message).toContain("2 lượt");
  });

  it("file canvas (không có view) ⇒ không bao giờ báo run", () => {
    expect(runNoticeForDoc(D({ id: "f-cc", name: "C", kind: "canvas" }), ["main"]).affected).toBe(false);
  });
});

describe("xoá file đang mở KHÔNG được để trắng trang", () => {
  const docs = [D({ id: "f-aa", name: "A" }), D({ id: "f-bb", name: "B" })];

  it("xoá file KHÔNG mở ⇒ giữ nguyên tab đang mở", () => {
    expect(safeIdAfterDelete("f-bb", "f-aa", docs, ALL_SHEETS_DOC_ID)).toBe("f-aa");
  });

  it("xoá file đang mở ⇒ nhảy sang file còn lại", () => {
    expect(safeIdAfterDelete("f-aa", "f-aa", docs, ALL_SHEETS_DOC_ID)).toBe("f-bb");
  });

  it("xoá file CUỐI CÙNG ⇒ rơi về «Tất cả sheet», không phải undefined", () => {
    expect(safeIdAfterDelete("f-aa", "f-aa", [docs[0]!], ALL_SHEETS_DOC_ID)).toBe(ALL_SHEETS_DOC_ID);
  });
});
