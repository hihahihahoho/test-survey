/**
 * Lớp bảo mật + kỷ luật lưu trữ của tầng file con:
 *  ① chặn secret bằng chính `assertNoSecret` của R0 (không viết bộ dò thứ hai);
 *  ② store lạ ⇒ throw (allowlist đóng);
 *  ③ `grep localStorage` trong `features/docs/` = 0 — kiểm bằng đọc file thật, không bằng lời hứa.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SecretLeakError } from "@/lib/store";
import { createFakeIdb, type FakeIdb } from "./fake-idb";
import { configureDocsIdb, docsIdbSet, DocsIdbStoreError, DOCS_STORE } from "../lib/docs-idb";
import { localDocsRepo as repo } from "../lib/docs-repo-local";
import { docsRepo, getDocsBackend, httpDocsRepo, isLocalDraftBackend, setDocsBackend } from "../lib/docs-repo";
import { draftBadge } from "../lib/draft-badge";

const P = "p1";
let idb: FakeIdb;
beforeEach(() => {
  idb = createFakeIdb();
  configureDocsIdb(idb);
});
afterEach(() => {
  configureDocsIdb(null);
  setDocsBackend("http");
});

describe("chặn secret ở cửa ghi", () => {
  it("giá trị hình dạng API key ⇒ SecretLeakError, KHÔNG ghi gì", async () => {
    await expect(docsIdbSet("p1/f-x", { note: "sk-abcdefghijklmnop0123456789" })).rejects.toBeInstanceOf(SecretLeakError);
    expect(idb._dump()).toEqual({});
  });
  it("TÊN field nghi secret cũng bị chặn", async () => {
    await expect(docsIdbSet("p1/f-x", { access_token: "gì đó" })).rejects.toBeInstanceOf(SecretLeakError);
  });
  it("đường dẫn tuyệt đối (PII) bị chặn — file con chỉ được giữ đường dẫn tương đối", async () => {
    await expect(docsIdbSet("p1/f-x", { ref: "/Users/an/KitGen/refs/a.png" })).rejects.toBeInstanceOf(SecretLeakError);
  });
  it("thông điệp lỗi KHÔNG chứa chính giá trị bị chặn", async () => {
    const err = await docsIdbSet("p1/f-x", { note: "sk-abcdefghijklmnop0123456789" }).catch((e) => e);
    expect(String(err.message)).not.toContain("sk-abcdefghijklmnop0123456789");
  });
  it("nội dung ghi chú bình thường thì ghi được", async () => {
    const d = await repo.create(P, { name: "OK", kind: "canvas" });
    await repo.save(P, d.id, { nodes: [{ id: "n1", type: "note", x: 0, y: 0, w: 1, h: 1, z: 0, text: "Nút CTA đỏ cam", bind: { kind: "ref", id: "refs/tet-01.jpg" } }], viewport: { x: 0, y: 0, k: 1 } }, 0);
    expect((await repo.load(P, d.id)).canvas.nodes).toHaveLength(1);
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
