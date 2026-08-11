/**
 * READ MODEL của thanh tab — kiểm những BẤT BIẾN mà UI không được phép phá.
 * Không dựng DOM ở đây: mọi luật dưới đây là luật DỮ LIỆU, jsdom không làm nó
 * đúng hơn mà chỉ làm nó chậm hơn.
 */
import { describe, expect, it } from "vitest";
import { ALL_SHEETS_DOC_ID, docSchema, everySheetVisible, type Doc } from "../lib";
import {
  MAX_VISIBLE_TABS, buildTabs, foldVi, hasUserDocs, isTypingTarget, matchTabShortcut,
  queryTabs, resolveActiveId, splitTabs, stepIndex,
} from "../lib/subfile-model";

const D = (o: Partial<Doc> & { id: string; name: string }): Doc =>
  docSchema.parse({
    kind: "workflow", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    color: "none", trashedAt: null, ...o,
  });

const SHEETS = ["main", "main2", "pose-lan"];

describe("buildTabs", () => {
  it("luôn có tab ảo «Tất cả sheet» đứng đầu, kể cả khi chưa có file con nào", () => {
    const tabs = buildTabs({ docs: [], contractSheetIds: SHEETS });
    expect(tabs).toHaveLength(1);
    expect(tabs[0]!.id).toBe(ALL_SHEETS_DOC_ID);
    expect(tabs[0]!.virtual).toBe(true);
    expect(tabs[0]!.sheetCount).toBe(3);
    expect(hasUserDocs(tabs)).toBe(false);
  });

  it("bỏ file trong thùng rác dù chỗ gọi lỡ truyền includeTrashed", () => {
    const docs = [D({ id: "f-aa", name: "A" }), D({ id: "f-bb", name: "B", trashedAt: "2026-01-02T00:00:00.000Z" })];
    expect(buildTabs({ docs, contractSheetIds: SHEETS }).map((t) => t.id)).toEqual([ALL_SHEETS_DOC_ID, "f-aa"]);
  });

  it("đếm sheet còn sống và sheet MẤT LIÊN KẾT riêng, không ném lỗi", () => {
    const docs = [D({ id: "f-aa", name: "A", view: { sheetIds: ["main", "da-xoa"], variantIds: [] } })];
    const t = buildTabs({ docs, contractSheetIds: SHEETS })[1]!;
    expect(t.sheetCount).toBe(1);
    expect(t.staleCount).toBe(1);
  });

  it("chấm «chưa lưu» chỉ áp cho file thật, không áp cho tab hệ thống", () => {
    const docs = [D({ id: "f-aa", name: "A" })];
    const tabs = buildTabs({ docs, contractSheetIds: SHEETS, dirtyIds: ["f-aa", ALL_SHEETS_DOC_ID] });
    expect(tabs[0]!.dirty).toBe(false);
    expect(tabs[1]!.dirty).toBe(true);
  });

  it("agent chưa chạy / contract rỗng: tab ảo vẫn dựng được với 0 sheet", () => {
    const tabs = buildTabs({ docs: [D({ id: "f-aa", name: "A" })], contractSheetIds: [] });
    expect(tabs[0]!.sheetCount).toBe(0);
    expect(tabs).toHaveLength(2);
  });

  it("BẤT BIẾN §4.5: mọi sheet luôn thấy được nhờ tab ảo, kể cả khi mọi file lọc hẹp", () => {
    const docs = [
      D({ id: "f-aa", name: "A", view: { sheetIds: ["main"], variantIds: [] } }),
      D({ id: "f-bb", name: "B", view: { sheetIds: [], variantIds: [] } }),
    ];
    expect(everySheetVisible(docs, SHEETS)).toBe(true);
    const covered = new Set(buildTabs({ docs, contractSheetIds: SHEETS }).flatMap((t) => (t.virtual ? SHEETS : [])));
    expect(SHEETS.every((s) => covered.has(s))).toBe(true);
  });
});

describe("resolveActiveId", () => {
  const tabs = buildTabs({ docs: [D({ id: "f-aa", name: "A" })], contractSheetIds: SHEETS });
  it("id có thật thì giữ nguyên", () => expect(resolveActiveId(tabs, "f-aa")).toBe("f-aa"));
  it("id lạ / file bị xoá ⇒ rơi về tab ảo, KHÔNG undefined", () => {
    expect(resolveActiveId(tabs, "f-khong-co")).toBe(ALL_SHEETS_DOC_ID);
    expect(resolveActiveId(tabs, null)).toBe(ALL_SHEETS_DOC_ID);
  });
  it("danh sách rỗng (không bao giờ xảy ra qua buildTabs) vẫn trả id an toàn", () => {
    expect(resolveActiveId([], "x")).toBe(ALL_SHEETS_DOC_ID);
  });
});

describe("splitTabs — quá 8 tab thì thu gọn", () => {
  const many = buildTabs({
    docs: Array.from({ length: 11 }, (_, i) => D({ id: `f-t${i}`, name: `T${i}` })),
    contractSheetIds: SHEETS,
  });

  it("≤8 tab thì không có phần tràn", () => {
    const few = buildTabs({ docs: [D({ id: "f-aa", name: "A" })], contractSheetIds: SHEETS });
    expect(splitTabs(few, "f-aa").overflow).toEqual([]);
  });

  it("hiện đúng MAX_VISIBLE_TABS, phần còn lại vào menu, không mất/không nhân đôi", () => {
    const { visible, overflow } = splitTabs(many, ALL_SHEETS_DOC_ID);
    expect(visible).toHaveLength(MAX_VISIBLE_TABS);
    expect(visible.length + overflow.length).toBe(many.length);
    expect(new Set([...visible, ...overflow].map((t) => t.id)).size).toBe(many.length);
  });

  it("TAB ĐANG MỞ luôn nằm trong phần hiện, kể cả khi nó là tab cuối cùng", () => {
    const { visible, overflow } = splitTabs(many, "f-t10");
    expect(visible.map((t) => t.id)).toContain("f-t10");
    expect(overflow.map((t) => t.id)).not.toContain("f-t10");
  });

  it("tab ảo không bao giờ bị đẩy vào phần tràn", () => {
    for (const id of many.map((t) => t.id)) {
      expect(splitTabs(many, id).visible[0]!.id).toBe(ALL_SHEETS_DOC_ID);
    }
  });
});

describe("queryTabs — popover «Tất cả N»", () => {
  const docs = [
    D({ id: "f-y-tuong", name: "Ý tưởng Tết", kind: "canvas", updatedAt: "2026-03-01T00:00:00.000Z" }),
    D({ id: "f-lan", name: "Nhân vật Lan", kind: "canvas", updatedAt: "2026-02-01T00:00:00.000Z" }),
    D({ id: "f-kit", name: "Bộ kit chính", updatedAt: "2026-04-01T00:00:00.000Z" }),
  ];
  const tabs = buildTabs({ docs, contractSheetIds: SHEETS });

  it("bỏ dấu: gõ 'y tuong' vẫn ra 'Ý tưởng Tết'", () => {
    expect(foldVi("Ý tưởng Tết")).toBe("y tuong tet");
    expect(queryTabs(tabs, { q: "y tuong" }).map((t) => t.id)).toEqual(["f-y-tuong"]);
  });

  it("sắp theo sửa gần nhất là mặc định; tab ảo luôn đứng đầu", () => {
    expect(queryTabs(tabs).map((t) => t.id)).toEqual([ALL_SHEETS_DOC_ID, "f-kit", "f-y-tuong", "f-lan"]);
  });

  it("sắp theo tên và theo kiểu file đều tất định", () => {
    expect(queryTabs(tabs, { sort: "name" }).slice(1).map((t) => t.name)).toEqual(["Bộ kit chính", "Nhân vật Lan", "Ý tưởng Tết"]);
    expect(queryTabs(tabs, { sort: "kind" }).slice(1).map((t) => t.kind)).toEqual(["canvas", "canvas", "workflow"]);
  });

  it("không khớp gì thì trả rỗng (UI có ca empty riêng), không tự nới lỏng", () => {
    expect(queryTabs(tabs, { q: "zzz" })).toEqual([]);
  });
});

describe("phím tắt", () => {
  it("⌃Tab / ⌃⇧Tab dùng Ctrl trên CẢ hai hệ", () => {
    for (const mac of [true, false]) {
      expect(matchTabShortcut({ key: "Tab", ctrlKey: true }, mac)).toEqual({ type: "next" });
      expect(matchTabShortcut({ key: "Tab", ctrlKey: true, shiftKey: true }, mac)).toEqual({ type: "prev" });
    }
  });

  it("Mod+1..9 theo hệ: ⌘ trên mac, Ctrl nơi khác — không nhận nhầm phím của hệ kia", () => {
    expect(matchTabShortcut({ key: "3", metaKey: true }, true)).toEqual({ type: "index", index: 2 });
    expect(matchTabShortcut({ key: "3", ctrlKey: true }, true)).toBeNull();
    expect(matchTabShortcut({ key: "3", ctrlKey: true }, false)).toEqual({ type: "index", index: 2 });
    expect(matchTabShortcut({ key: "3", metaKey: true }, false)).toBeNull();
  });

  it("Mod+⌥N = file mới; phím lạ trả null để KHÔNG nuốt phím trình duyệt", () => {
    expect(matchTabShortcut({ key: "n", metaKey: true, altKey: true }, true)).toEqual({ type: "new" });
    expect(matchTabShortcut({ key: "r", metaKey: true }, true)).toBeNull();
    expect(matchTabShortcut({ key: "0", metaKey: true }, true)).toBeNull();
    expect(matchTabShortcut({ key: "a" }, true)).toBeNull();
  });

  it("đang gõ trong ô nhập thì không tính là mục tiêu bắt phím", () => {
    expect(isTypingTarget({ tagName: "INPUT" })).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", getAttribute: () => "textbox" })).toBe(true);
    expect(isTypingTarget({ tagName: "BUTTON", getAttribute: () => null })).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });

  it("stepIndex chạy vòng hai chiều và không chia cho 0", () => {
    expect(stepIndex(3, 2, 1)).toBe(0);
    expect(stepIndex(3, 0, -1)).toBe(2);
    expect(stepIndex(0, 0, 1)).toBe(0);
  });
});
