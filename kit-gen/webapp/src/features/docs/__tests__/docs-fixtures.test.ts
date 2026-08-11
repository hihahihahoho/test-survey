/**
 * Fixture phải ĐÚNG THẬT, nếu không nó chỉ là niềm tin giả:
 *  ① `project-basic.json` khớp template `basic` THẬT của agent (3 sheet · 25 ô) và parse sạch
 *     bằng chính `contractSchema` của R0 (kể cả 8 luật V-01…V-05);
 *  ② `docs-3files.json` nạp được qua đúng `docsRepo` local rồi đọc lại ra y nguyên;
 *  ③ bất biến `sheetIds ⊆ contract.sheets[].id` đúng trên cặp fixture này;
 *  ④ không fixture nào chứa secret / đường dẫn tuyệt đối (quét bằng `assertNoSecret` của R0);
 *  ⑤ fixture KHÔNG bị import từ code chạy thật (FE-PLAN §4).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { contractSchema } from "@/lib/types";
import { assertNoSecret } from "@/lib/store";
import { createFakeIdb } from "./fake-idb";
import { configureDocsIdb } from "../lib/docs-idb";
import { localDocsRepo as repo } from "../lib/docs-repo-local";
import { canvasDocSchema, docRecordSchema } from "../lib/types";
import { everySheetVisible, orphanSheetIds, reconcileView } from "../lib/invariants";

const ROOT = join(new URL("../../../../", import.meta.url).pathname); // webapp/
const FIX = join(ROOT, "fixtures");
const read = (n: string) => JSON.parse(readFileSync(join(FIX, n), "utf8"));

beforeEach(() => configureDocsIdb(createFakeIdb()));
afterEach(() => configureDocsIdb(null));

describe("project-basic.json", () => {
  const raw = read("project-basic.json");
  const tpl = JSON.parse(readFileSync(join(ROOT, "../agent/templates/basic.json"), "utf8"));

  it("parse sạch bằng contractSchema của R0", () => {
    const r = contractSchema.safeParse(raw);
    expect(r.success ? [] : r.error.issues).toEqual([]);
  });

  it("khớp ĐÚNG template `basic` thật của agent: 3 sheet, 25 ô, cùng thứ tự element", () => {
    expect(raw.sheets.map((s: { id: string }) => s.id)).toEqual(tpl.sheets.map((s: { id: string }) => s.id));
    expect(raw.sheets.reduce((n: number, s: { components: unknown[] }) => n + s.components.length, 0)).toBe(25);
    for (const [i, sh] of tpl.sheets.entries()) {
      expect(raw.sheets[i].components.map((c: { file: string }) => c.file)).toEqual(sh.components);
      expect(raw.sheets[i].grid).toEqual(sh.grid);
    }
  });
});

describe("docs-3files.json", () => {
  const fx = read("docs-3files.json");

  it("đúng 3 bản ghi hợp schema: 1 workflow + 2 canvas", () => {
    expect(fx.records).toHaveLength(3);
    for (const rec of fx.records) expect(docRecordSchema.safeParse(rec).success).toBe(true);
    expect(fx.records.filter((r: { doc: { kind: string } }) => r.doc.kind === "canvas")).toHaveLength(2);
  });

  it("nạp vào repo local rồi đọc lại ra y nguyên", async () => {
    for (const rec of fx.records) {
      const d = await repo.create(fx.projectId, { name: rec.doc.name, kind: rec.doc.kind, ...(rec.doc.view ? { view: rec.doc.view } : {}) });
      if (rec.canvas) await repo.save(fx.projectId, d.id, canvasDocSchema.parse(rec.canvas), 0);
    }
    const list = await repo.list(fx.projectId);
    expect(list.map((d) => d.name).sort()).toEqual(["Bộ kit chính", "Nhân vật Lân", "Ý tưởng Tết"].sort());
    const canvasDoc = list.find((d) => d.name === "Ý tưởng Tết")!;
    const loaded = await repo.load(fx.projectId, canvasDoc.id);
    expect(loaded.canvas.nodes).toHaveLength(4);
    expect(loaded.canvas.viewport.k).toBeCloseTo(0.9);
  });

  it("bất biến §4.5 đúng với contract của project-basic", () => {
    const sheetIds = read("project-basic.json").sheets.map((s: { id: string }) => s.id);
    for (const rec of fx.records) {
      expect(reconcileView(rec.doc.view, sheetIds).staleSheetIds).toEqual([]);
    }
    // `bg-home` cố ý không thuộc file con nào ⇒ phải là orphan, và vẫn thấy được nhờ file ảo.
    const docs = fx.records.map((r: { doc: unknown }) => r.doc);
    expect(orphanSheetIds(docs, sheetIds)).toEqual(["bg-home"]);
    expect(everySheetVisible(docs, sheetIds)).toBe(true);
  });

  it("mọi `bind.kind:\"ref\"` là đường dẫn TƯƠNG ĐỐI trong project", () => {
    for (const rec of fx.records) {
      for (const n of rec.canvas?.nodes ?? []) {
        if (n.bind?.kind === "ref") {
          expect(n.bind.id.startsWith("/")).toBe(false);
          expect(n.bind.id.includes("..")).toBe(false);
        }
      }
    }
  });
});

describe("canvas-200nodes.json", () => {
  const fx = read("canvas-200nodes.json");
  it("đúng 200 node hợp schema, ghi/đọc được qua repo", async () => {
    expect(canvasDocSchema.parse(fx.canvas).nodes).toHaveLength(200);
    const d = await repo.create(fx.projectId, { name: fx.doc.name, kind: "canvas" });
    const res = await repo.save(fx.projectId, d.id, canvasDocSchema.parse(fx.canvas), 0);
    expect(res.version).toBe(1);
    expect((await repo.load(fx.projectId, d.id)).canvas.nodes).toHaveLength(200);
  });
});

describe("vệ sinh fixture", () => {
  const names = readdirSync(FIX).filter((n) => n.endsWith(".json"));

  // C1 đẻ 3 fixture file-con; C2 thêm 2 fixture brief intake ⇒ danh sách chốt là 5.
  it("có đủ 5 fixture", () => {
    expect(names.sort()).toEqual([
      "brief-intake-vcb-full.json",
      "brief-intake-vcb-missing22.json",
      "canvas-200nodes.json",
      "docs-3files.json",
      "project-basic.json",
    ]);
  });

  it("không fixture nào chứa secret / đường dẫn tuyệt đối", () => {
    for (const n of names) expect(() => assertNoSecret(read(n), n)).not.toThrow();
  });

  it("KHÔNG bị import từ code chạy thật (chỉ test được đụng vào)", () => {
    const srcFiles = (function walk(dir: string): string[] {
      return readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) return n === "__tests__" ? [] : walk(p);
        return /\.tsx?$/.test(p) ? [p] : [];
      });
    })(join(ROOT, "src"));
    const dirty = srcFiles.filter((p) => /["'][^"']*fixtures\//.test(readFileSync(p, "utf8")));
    expect(dirty).toEqual([]);
  });
});
