/**
 * Test bản `local` của `DocsRepo` — vòng đời đầy đủ + các ca hỏng mà FE-PLAN §3-C1 đòi:
 * quota đầy, schema hỏng, chỗ lưu bị chặn, xung đột version, chặn secret.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeIdb, type FakeIdb } from "./fake-idb";
import { configureDocsIdb, docKey, docsIdbAvailable } from "../lib/docs-idb";
import { localDocsRepo as repo, TRASH_KEEP_DAYS } from "../lib/docs-repo-local";
import { DocsRepoError } from "../lib/docs-errors";
import { ALL_SHEETS_DOC_ID, duplicateName, makeDocId, RE_DOC_ID } from "../lib/types";

const P = "tet26-vietinbank-a7f3";
let idb: FakeIdb;

beforeEach(() => {
  idb = createFakeIdb();
  configureDocsIdb(idb);
});
afterEach(() => configureDocsIdb(null));

describe("vòng đời: ghi → đọc → sửa → xoá → khôi phục", () => {
  it("tạo rồi liệt kê được", async () => {
    const d = await repo.create(P, { name: "Bộ kit chính", kind: "workflow", view: { sheetIds: ["main"], variantIds: ["tet"] } });
    expect(RE_DOC_ID.test(d.id)).toBe(true);
    expect(d.view?.sheetIds).toEqual(["main"]);
    const list = await repo.list(P);
    expect(list.map((x) => x.name)).toEqual(["Bộ kit chính"]);
  });

  it("đổi tên, đổi màu, đổi bộ lọc", async () => {
    const d = await repo.create(P, { name: "Ý tưởng", kind: "canvas" });
    expect((await repo.rename(P, d.id, "Ý tưởng Tết")).name).toBe("Ý tưởng Tết");
    expect((await repo.setColor(P, d.id, "amber")).color).toBe("amber");
    const v = await repo.setView(P, d.id, { sheetIds: ["tall"], variantIds: [] });
    expect(v.view?.sheetIds).toEqual(["tall"]);
  });

  it("nhân bản chép node nhưng KHÔNG chép contract/ảnh, tên có hậu tố (bản sao)", async () => {
    const src = await repo.create(P, { name: "Ý tưởng Tết", kind: "canvas" });
    await repo.save(P, src.id, { nodes: [{ id: "n1", type: "note", x: 1, y: 2, w: 10, h: 10, z: 0, text: "hi", bind: null }], viewport: { x: 0, y: 0, k: 1 } }, 0);
    const copy = await repo.duplicate(P, src.id);
    expect(copy.name).toBe("Ý tưởng Tết (bản sao)");
    const loaded = await repo.load(P, copy.id);
    expect(loaded.canvas.nodes).toHaveLength(1);
    expect(loaded.version).toBe(0); // bản sao bắt đầu lại từ version 0
    // sửa bản sao KHÔNG đụng bản gốc
    await repo.save(P, copy.id, { nodes: [], viewport: { x: 0, y: 0, k: 1 } }, 0);
    expect((await repo.load(P, src.id)).canvas.nodes).toHaveLength(1);
  });

  it("xoá là XOÁ MỀM, khôi phục lại đúng nội dung", async () => {
    const d = await repo.create(P, { name: "Nhân vật Lân", kind: "canvas" });
    await repo.save(P, d.id, { nodes: [{ id: "n1", type: "frame", x: 0, y: 0, w: 4, h: 4, z: 0, text: "", bind: { kind: "sheet", id: "tall" } }], viewport: { x: 0, y: 0, k: 1 } }, 0);
    const { trashedAt } = await repo.remove(P, d.id);
    expect(trashedAt).toMatch(/^\d{4}-/);
    expect(await repo.list(P)).toHaveLength(0);
    expect(await repo.list(P, { includeTrashed: true })).toHaveLength(1);
    const back = await repo.restore(P, d.id);
    expect(back.trashedAt).toBeNull();
    expect((await repo.load(P, d.id)).canvas.nodes).toHaveLength(1); // nội dung còn nguyên
  });

  it("khôi phục khi tên đã bị file khác chiếm ⇒ DOC_NAME_TAKEN, KHÔNG đè", async () => {
    const a = await repo.create(P, { name: "Ý tưởng", kind: "canvas" });
    await repo.remove(P, a.id);
    await repo.create(P, { name: "Ý tưởng", kind: "canvas" });
    await expect(repo.restore(P, a.id)).rejects.toMatchObject({ code: "DOC_NAME_TAKEN" });
  });

  it("thùng rác quá 30 ngày mới bị dọn hẳn", async () => {
    const d = await repo.create(P, { name: "Cũ", kind: "canvas" });
    await repo.remove(P, d.id);
    expect(await repo.purgeExpired(P, new Date(Date.now() + (TRASH_KEEP_DAYS - 1) * 86400000))).toBe(0);
    expect(await repo.purgeExpired(P, new Date(Date.now() + (TRASH_KEEP_DAYS + 1) * 86400000))).toBe(1);
    expect(await repo.list(P, { includeTrashed: true })).toHaveLength(0);
  });

  it("dữ liệu của hai project không lẫn nhau", async () => {
    await repo.create(P, { name: "A", kind: "canvas" });
    await repo.create("khac-project", { name: "B", kind: "canvas" });
    expect((await repo.list(P)).map((d) => d.name)).toEqual(["A"]);
    expect((await repo.list("khac-project")).map((d) => d.name)).toEqual(["B"]);
  });
});

describe("tên file (§4.4)", () => {
  it("trùng tên trong project ⇒ DOC_NAME_TAKEN", async () => {
    await repo.create(P, { name: "Bộ kit chính", kind: "workflow" });
    await expect(repo.create(P, { name: "bộ KIT chính", kind: "canvas" })).rejects.toMatchObject({ code: "DOC_NAME_TAKEN" });
  });
  it("tên rỗng / quá 48 ký tự / có xuống dòng ⇒ INVALID_NAME", async () => {
    for (const bad of ["", "   ", "x".repeat(49), "a\nb"]) {
      await expect(repo.create(P, { name: bad, kind: "canvas" })).rejects.toMatchObject({ code: "INVALID_NAME" });
    }
  });
  it("id sinh ra luôn khớp regex của §8.2 kể cả tên tiếng Việt/emoji", () => {
    expect(makeDocId("Ý tưởng Tết 2026")).toMatch(RE_DOC_ID);
    expect(makeDocId("🎉🎉🎉")).toMatch(RE_DOC_ID);
    expect(makeDocId("x".repeat(48))).toMatch(RE_DOC_ID);
    const taken = [makeDocId("Ý tưởng")];
    expect(makeDocId("Ý tưởng", taken)).not.toBe(taken[0]);
    expect(makeDocId("Ý tưởng", taken)).toMatch(RE_DOC_ID);
  });
  it("tên bản sao cắt đúng 48 ký tự và không trùng", () => {
    const long = "y".repeat(48);
    const n1 = duplicateName(long, []);
    expect(n1.length).toBeLessThanOrEqual(48);
    expect(duplicateName("A", ["A (bản sao)"])).toBe("A (bản sao 2)");
  });
});

describe("file hệ thống «Tất cả sheet» không sửa/xoá được", () => {
  it("mọi lệnh ghi lên file ảo ⇒ DOC_READONLY", async () => {
    for (const fn of [
      () => repo.rename(P, ALL_SHEETS_DOC_ID, "x"),
      () => repo.remove(P, ALL_SHEETS_DOC_ID),
      () => repo.restore(P, ALL_SHEETS_DOC_ID),
      () => repo.save(P, ALL_SHEETS_DOC_ID, { nodes: [], viewport: { x: 0, y: 0, k: 1 } }, 0),
    ]) {
      await expect(fn()).rejects.toMatchObject({ code: "DOC_READONLY" });
    }
  });
});

describe("ghi canvas theo version (If-Match của #49)", () => {
  it("version tăng dần và trả bytes", async () => {
    const d = await repo.create(P, { name: "C", kind: "canvas" });
    const r1 = await repo.save(P, d.id, { nodes: [], viewport: { x: 0, y: 0, k: 1 } }, 0);
    expect(r1.version).toBe(1);
    expect(r1.bytes).toBeGreaterThan(0);
    expect((await repo.load(P, d.id)).version).toBe(1);
  });
  it("version lệch ⇒ DOC_CONFLICT và KHÔNG ghi đè", async () => {
    const d = await repo.create(P, { name: "C", kind: "canvas" });
    await repo.save(P, d.id, { nodes: [{ id: "n1", type: "note", x: 0, y: 0, w: 1, h: 1, z: 0, text: "giữ", bind: null }], viewport: { x: 0, y: 0, k: 1 } }, 0);
    await expect(repo.save(P, d.id, { nodes: [], viewport: { x: 0, y: 0, k: 1 } }, 0)).rejects.toMatchObject({ code: "DOC_CONFLICT" });
    expect((await repo.load(P, d.id)).canvas.nodes[0]?.text).toBe("giữ");
  });
  it("canvas sai hình dạng ⇒ DOC_BROKEN", async () => {
    const d = await repo.create(P, { name: "C", kind: "canvas" });
    await expect(repo.save(P, d.id, { nodes: [{ id: "", type: "note" }] } as never, 0)).rejects.toMatchObject({ code: "DOC_BROKEN" });
  });
  it("zoom ngoài [0.1,4] bị chặn ngay ở schema", async () => {
    const d = await repo.create(P, { name: "C", kind: "canvas" });
    await expect(repo.save(P, d.id, { nodes: [], viewport: { x: 0, y: 0, k: 99 } }, 0)).rejects.toMatchObject({ code: "DOC_BROKEN" });
  });
});

describe("ca hỏng của chỗ lưu", () => {
  it("QUOTA ĐẦY một lần ⇒ dọn + thử lại ⇒ vẫn ghi được", async () => {
    idb._failQuota(1);
    const d = await repo.create(P, { name: "Q", kind: "canvas" });
    expect((await repo.list(P)).map((x) => x.id)).toEqual([d.id]);
  });
  it("QUOTA ĐẦY vĩnh viễn ⇒ STORAGE_FULL, thông điệp KHÔNG lộ chi tiết kỹ thuật", async () => {
    idb._failQuota(Number.POSITIVE_INFINITY);
    const err = await repo.create(P, { name: "Q", kind: "canvas" }).catch((e) => e);
    expect(err).toBeInstanceOf(DocsRepoError);
    expect(err.code).toBe("STORAGE_FULL");
    expect(err.message).toBe("Máy đã hết chỗ lưu nháp. Xoá bớt file cũ rồi thử lại.");
    expect(err.message).not.toMatch(/quota|idb|IndexedDB|Error/i);
    expect(err.detail).toMatch(/docsIdbSet/); // chi tiết chỉ nằm ở `detail`
  });
  /**
   * P2-8 — HAI NGUYÊN NHÂN, HAI CÂU KHÁC NHAU.
   *
   * Bản trước map MỌI cú ghi hụt thành `STORAGE_FULL` ("Máy đã hết chỗ lưu nháp. Xoá
   * bớt file cũ rồi thử lại"), kể cả khi thủ phạm là lớp bảo mật chặn giá trị. Người
   * dùng làm đúng lời khuyên đó thì mất file thật mà vẫn không lưu được. Ca dưới đây
   * khoá cả MÃ lẫn CÂU CHỮ, và khoá luôn việc câu chữ KHÔNG chép lại đoạn bị chặn.
   */
  it("GIÁ TRỊ BỊ CHẶN ⇒ WRITE_BLOCKED, không nói nhầm là hết chỗ", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const d = await repo.create(P, { name: "Ghi chú", kind: "canvas" });
    const leak = "sk-abcdefghijklmnop0123456789";
    const err = await repo
      .save(P, d.id, { nodes: [{ id: "n1", type: "note", x: 0, y: 0, w: 1, h: 1, z: 0, text: leak, bind: null }], viewport: { x: 0, y: 0, k: 1 } }, 0)
      .catch((e) => e);
    warn.mockRestore();

    expect(err).toBeInstanceOf(DocsRepoError);
    expect(err.code).toBe("WRITE_BLOCKED");
    expect(err.message).not.toMatch(/hết chỗ|Xoá bớt/i); // KHÔNG phải câu của STORAGE_FULL
    expect(err.message).not.toContain(leak); // câu hiện ở thân UI ⇒ không chép giá trị
    expect(err.message).toMatch(/không được lưu/);
    // và nội dung cũ không bị đè bởi bản chứa secret
    expect((await repo.load(P, d.id)).canvas.nodes).toHaveLength(0);
  });
  it("IndexedDB bị chặn ⇒ list rỗng (không trắng trang), ghi ⇒ STORAGE_UNAVAILABLE", async () => {
    idb._openFails(true);
    expect(await repo.list(P)).toEqual([]);
    expect(await repo.purgeExpired(P)).toBe(0);
    await expect(repo.create(P, { name: "X", kind: "canvas" })).rejects.toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    expect(docsIdbAvailable()).toBe(false);
  });
  it("BẢN GHI HỎNG SCHEMA: bị bỏ qua khi liệt kê, báo DOC_BROKEN khi mở", async () => {
    const ok = await repo.create(P, { name: "Tốt", kind: "canvas" });
    idb._poke(docKey(P, "f-rac-cu"), { doc: { id: "f-rac-cu", name: 42 }, version: "x" });
    idb._poke(docKey(P, "f-rac-2"), "chuỗi rác");
    const list = await repo.list(P);
    expect(list.map((d) => d.id)).toEqual([ok.id]); // file tốt KHÔNG chết theo
    await expect(repo.load(P, "f-rac-cu")).rejects.toMatchObject({ code: "DOC_BROKEN" });
  });
  it("mở file không tồn tại ⇒ DOC_NOT_FOUND", async () => {
    await expect(repo.load(P, "f-khong-co")).rejects.toMatchObject({ code: "DOC_NOT_FOUND" });
  });
});
