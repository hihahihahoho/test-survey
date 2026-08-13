/**
 * Lớp bảo mật + kỷ luật lưu trữ của tầng file con:
 *  ① chặn secret bằng chính `assertNoSecret` của R0 (không viết bộ dò thứ hai);
 *  ② store lạ ⇒ throw (allowlist đóng);
 *  ③ `grep localStorage` trong `features/docs/` = 0 — kiểm bằng đọc file thật, không bằng lời hứa.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeIdb, type FakeIdb } from "./fake-idb";
import { configureDocsIdb, docsIdbSet, DocsIdbStoreError, DOCS_STORE } from "../lib/docs-idb";
import { localDocsRepo as repo } from "../lib/docs-repo-local";
import { docsRepo, getDocsBackend, httpDocsRepo, isLocalDraftBackend, setDocsBackend } from "../lib/docs-repo";
import { draftBadge } from "../lib/draft-badge";

const P = "p1";
let idb: FakeIdb;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  idb = createFakeIdb();
  configureDocsIdb(idb);
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  configureDocsIdb(null);
  setDocsBackend("http");
});

const warnText = () => warn.mock.calls.map((c) => c.map(String).join(" ")).join("\n");

/**
 * CHẶN nhưng KHÔNG NÉM (hotfix 2.1.17): `docsIdbSet` là `async`, ném ở đây thành
 * unhandled rejection ở những chỗ gọi không `catch`. Trả `false` là mã "không ghi được"
 * mà tầng repo đã xử lý sẵn. Điều bắt buộc giữ: không ghi gì, không log giá trị.
 */
describe("chặn secret ở cửa ghi", () => {
  it("giá trị hình dạng API key ⇒ chặn, KHÔNG ghi gì, KHÔNG ném", async () => {
    await expect(docsIdbSet("p1/f-x", { note: "sk-abcdefghijklmnop0123456789" })).resolves.toBe(false);
    expect(idb._dump()).toEqual({});
    expect(warnText()).toContain("idb.docs");
  });
  it("TÊN field nghi secret cũng bị chặn", async () => {
    await expect(docsIdbSet("p1/f-x", { access_token: "gì đó" })).resolves.toBe(false);
    expect(idb._dump()).toEqual({});
  });
  it("đường dẫn tuyệt đối (PII) bị chặn — file con chỉ được giữ đường dẫn tương đối", async () => {
    await expect(docsIdbSet("p1/f-x", { ref: "/Users/an/KitGen/refs/a.png" })).resolves.toBe(false);
    expect(warnText()).toContain("V-ABSPATH");
  });
  it("dòng cảnh báo KHÔNG chứa chính giá trị bị chặn", async () => {
    await docsIdbSet("p1/f-x", { note: "sk-abcdefghijklmnop0123456789" });
    expect(warnText()).not.toContain("sk-abcdefghijklmnop0123456789");
    expect(warnText()).toContain("V-SK");
  });
  it("nội dung ghi chú bình thường thì ghi được", async () => {
    const d = await repo.create(P, { name: "OK", kind: "canvas" });
    await repo.save(P, d.id, { nodes: [{ id: "n1", type: "note", x: 0, y: 0, w: 1, h: 1, z: 0, text: "Nút CTA đỏ cam", bind: { kind: "ref", id: "refs/tet-01.jpg" } }], viewport: { x: 0, y: 0, k: 1 } }, 0);
    expect((await repo.load(P, d.id)).canvas.nodes).toHaveLength(1);
  });
});

/**
 * Regression 2.1.17 — `doc.id` là `f-<slug>` cắt 34 ký tự (`agent/lib/docs.mjs newId`).
 * Tên file tiếng Việt đủ dài ⇒ id 34 ký tự, entropy > 4.0 ⇒ TRƯỚC hotfix bị luật
 * V-ENTROPY chặn, tức là đặt tên file hơi dài là mất luôn chỗ lưu file con.
 */
describe("mã file con do app sinh KHÔNG phải secret", () => {
  const LONG_DOC_ID = "f-mau-6-nhan-vat-quy-4-2025-b7k3ws"; // 34 ký tự, entropy 4.065
  const record = (id: string) => ({
    doc: {
      id,
      name: "Mẫu 6 nhân vật quý 4",
      kind: "workflow" as const,
      createdAt: "2026-08-13T00:00:00Z",
      updatedAt: "2026-08-13T00:00:00Z",
      color: "none" as const,
      view: { sheetIds: ["nhan-vat-chinh-tu-the-dung-2026a"], variantIds: ["phong-cach-tet-co-truyen-2026"] },
    },
    version: 0,
  });

  it("ghi được bản ghi có docId dài + sheetIds/variantIds dài", async () => {
    await expect(docsIdbSet(`${P}/${LONG_DOC_ID}`, record(LONG_DOC_ID))).resolves.toBe(true);
    expect(Object.keys(idb._dump())).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it("tạo file con qua repo với TÊN DÀI vẫn lưu được (đúng đường người dùng đi)", async () => {
    const d = await repo.create(P, { name: "Mô tả chi tiết yêu cầu design 2026", kind: "canvas" });
    expect(d.id.startsWith("f-")).toBe(true);
    expect((await repo.list(P)).map((x) => x.id)).toContain(d.id);
    expect(warn).not.toHaveBeenCalled();
  });

  it("TOKEN THẬT đặt vào chính field `id` vẫn BỊ CHẶN", async () => {
    for (const s of [
      "sk-proj-AAAABBBBCCCCDDDDEEEEFFFFGGGG1234",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gF",
      "Xk29fLp84QmZa71RtVbNw35YcJd06HsE",
    ]) {
      warn.mockClear();
      await expect(docsIdbSet(`${P}/f-x`, record(s))).resolves.toBe(false);
      expect(warnText()).not.toContain(s);
    }
    expect(idb._dump()).toEqual({});
  });

  it("miễn trừ KHÔNG lây sang `name` — chữ người dùng gõ vẫn chịu đủ luật", async () => {
    const rec = record(LONG_DOC_ID);
    await expect(
      docsIdbSet(`${P}/${LONG_DOC_ID}`, { ...rec, doc: { ...rec.doc, name: "sk-abcdefghijklmnop0123456789" } }),
    ).resolves.toBe(false);
    expect(warnText()).toContain("V-SK");
  });
});

describe("allowlist store", () => {
  it("chỉ có đúng một store `docs`", () => {
    expect(DOCS_STORE).toBe("docs");
    expect(new DocsIdbStoreError("linh-tinh").code).toBe("IDB_STORE_NOT_ALLOWED");
  });
});

describe("bộ chọn adapter + badge «bản nháp cục bộ»", () => {
  it("mặc định dùng backend HTTP nên không hiện badge nháp cục bộ", () => {
    expect(getDocsBackend()).toBe("http");
    expect(docsRepo().kind).toBe("http");
    expect(isLocalDraftBackend()).toBe(false);
    expect(draftBadge(true).level).toBe("none");
  });
  it("backend HTTP không dùng badge trạng thái IndexedDB", () => {
    expect(draftBadge(false).level).toBe("none");
  });
  it("adapter HTTP đã triển khai và tự nhận là khả dụng", async () => {
    setDocsBackend("http");
    expect(docsRepo()).toBe(httpDocsRepo);
    expect(await httpDocsRepo.available()).toBe(true);
  });
});

/* ── Kiểm tĩnh trên chính mã nguồn ─────────────────────────────────────────── */

function filesOf(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? filesOf(p) : p.endsWith(".ts") || p.endsWith(".tsx") ? [p] : [];
  });
}
const DOCS_DIR = new URL("../", import.meta.url).pathname;
const SUBFILE_SRC = filesOf(join(DOCS_DIR, "lib")).filter((p) =>
  /(types|docs-idb|docs-repo|docs-repo-local|docs-errors|invariants|draft-badge|index)\.ts$/.test(p),
);

/**
 * Bỏ chú thích trước khi soi. Các file này CÓ NHẮC tới `localStorage` trong phần giải thích
 * "vì sao KHÔNG dùng localStorage" — cấm nhắc đến nó trong tài liệu là vô lý; cái phải cấm là
 * MÃ THỰC THI. Hàm này cắt `/* … *\/` và `//…` rồi mới grep, nên luật vẫn chặt đúng chỗ cần chặt.
 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("kỷ luật mã nguồn (đọc file thật)", () => {
  it("KHÔNG có `localStorage`/`sessionStorage` ở bất kỳ file nào của tầng file con", () => {
    const dirty = SUBFILE_SRC.filter((p) => /\b(local|session)Storage\b/.test(code(p)));
    expect(dirty).toEqual([]);
  });
  it("KHÔNG fetch trực tiếp (mọi lời gọi mạng phải qua src/lib/api)", () => {
    const dirty = SUBFILE_SRC.filter((p) => /\bfetch\s*\(/.test(code(p)));
    expect(dirty).toEqual([]);
  });
  it("KHÔNG hard-code mã màu — badge chỉ trả tên token", () => {
    const dirty = SUBFILE_SRC.filter((p) => /#[0-9a-fA-F]{6}\b|rgba?\(/.test(code(p)));
    expect(dirty).toEqual([]);
  });
  it("tầng file con KHÔNG đụng contract/artifact ⇒ xoá file con không thể mất sản phẩm", () => {
    const dirty = SUBFILE_SRC.filter((p) => /\b(contract\.json|kits\/|raw\/|slice\.py|gen\.sh)\b/.test(code(p)));
    expect(dirty).toEqual([]);
  });
  it("mỗi file dưới 400 dòng (brief)", () => {
    const tooLong = SUBFILE_SRC.filter((p) => readFileSync(p, "utf8").split("\n").length > 400);
    expect(tooLong).toEqual([]);
  });
});
