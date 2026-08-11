/**
 * WAVE 3 §W3-1 — bằng chứng cho hòn đá móng `kitset-to-contract.ts`.
 *
 * Luật của bộ test này: **đối chiếu với dữ liệu THẬT trên đĩa, không với trí nhớ.**
 * `styles.example.json` là contract mẫu mà `gen.sh` ăn được; `element-lib.json` là
 * catalogue 42 món mà agent phục vụ. Ca nào cũng phải trả lời được câu
 * *"nếu tôi sai thì `gen.sh` hỏng ở dòng nào?"*.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { contractJobs, contractSchema, normalizeContract, CHROMA_PRESETS } from "@/lib/types/contract";
import { loadBundledV2 } from "@/features/design/library/lib/source";
import type { LibElement } from "@/features/design/library/lib/types";
import { createWorkflowStore, resetWorkflowStores, type WorkflowState } from "../model";
import {
  CHARACTER_ID,
  MAIN_VARIANT_ID,
  buildKitsetContract,
  chunkKeepingGroups,
  refPath,
  resolveKitset,
} from "../kitset-to-contract";

/** Gốc repo `kit-gen/` — `process.cwd()` là `webapp/` khi chạy `npm test`. */
const REPO = resolve(process.cwd(), "..");
const stylesExample = JSON.parse(readFileSync(resolve(REPO, "styles.example.json"), "utf8")) as {
  sheets: unknown[];
  styles: { id: string; bg: string; brand: unknown }[];
  characterPoses: string[];
};

const LIB: LibElement[] = loadBundledV2().elements;

/** State mặc định THẬT của store (không phải một object tôi tự bịa cho vừa test). */
function defaultState(): WorkflowState {
  resetWorkflowStores();
  return createWorkflowStore("kit-mau-w3").getState();
}

const build = (patch: Partial<WorkflowState> = {}) =>
  buildKitsetContract({ ...defaultState(), ...patch }, { lib: LIB });

/* ══════════════════════════════════════════════════════════════════════════
   1. Luật của gen.sh — hai dòng làm nổ pipeline nếu adapter sai
   ══════════════════════════════════════════════════════════════════════════ */

describe("§W3-1 — contract sinh ra phải sống sót qua gen.sh", () => {
  it("mọi sheet thoả `assert len(comps) == cols*rows` (gen.sh:31)", () => {
    const c = build();
    expect(c.sheets.length).toBeGreaterThan(0);
    for (const sh of c.sheets) {
      expect(sh.components.length, `sheet ${sh.id}`).toBe(sh.grid.cols * sh.grid.rows);
    }
  });

  /**
   * ⚠️ CA QUAN TRỌNG NHẤT CỦA FILE NÀY — và nó ra đời vì TEST TÍCH HỢP bắt được,
   * không phải vì đọc code mà thấy.
   *
   * Schema zod của webapp MIỄN V-01 cho `shape:"pose"` (`contract.ts` nói rõ là cố ý,
   * vì `styles.json` thật dùng `pose-lan-idle`). **Agent thì không miễn**:
   * `agent/lib/validate.mjs:63` chỉ miễn `shape==="empty"`, còn
   * `agent/lib/contract.mjs:67-69` CHẶN HẲN lệnh ghi khi có error. Hệ quả: một
   * contract "hợp lệ" theo client mà **lưu không nổi** — client xanh, server 400.
   * Ca này soi theo LUẬT CỦA AGENT (chặt hơn), nên `npm test` bắt được mà không cần
   * dựng server.
   */
  it("mọi tên ô khớp V-01 THEO LUẬT CỦA AGENT (chỉ ô `empty` được miễn)", () => {
    const RE = /^[0-9]{2}-[a-z0-9-]+$/;
    const c = build();
    for (const sh of c.sheets) {
      for (const cp of sh.components) {
        if (cp.skel.shape === "empty") continue;
        expect(RE.test(cp.file), `sheet ${sh.id} · ô "${cp.file}" (shape ${cp.skel.shape})`).toBe(true);
      }
    }
    // Ô dáng cũng phải khớp — đây chính là chỗ đã sai và bị agent từ chối.
    const poseCells = c.sheets.flatMap((sh) => sh.components).filter((cp) => cp.skel.shape === "pose");
    expect(poseCells.length).toBeGreaterThan(0);
    for (const cp of poseCells) expect(cp.file).toMatch(RE);
    // …nhưng `skel.pose` vẫn phải giữ id dáng thật: slice.py:839 đọc CHỖ NÀY, không đọc tên file.
    for (const cp of poseCells) expect(typeof cp.skel.pose).toBe("string");
  });

  it("tên ô dáng KHÔNG trùng nhau kể cả khi tràn sang tấm thứ hai", () => {
    const many = Array.from({ length: 19 }, (_, i) => `p${i}`);
    const c = build({ mascotEnabled: true, mascotPoses: many });
    const files = c.sheets.flatMap((sh) => sh.components).filter((cp) => cp.skel.shape === "pose").map((cp) => cp.file);
    expect(files.length).toBe(19);
    expect(new Set(files).size).toBe(19);
  });

  it("`contractSchema.parse` không ném với state mặc định, và số job hữu hạn > 0", () => {
    const c = build();
    const jobs = contractJobs(c);
    expect(jobs.length).toBeGreaterThan(0);
    expect(Number.isFinite(jobs.length)).toBe(true);
    // 1 phong cách ⇒ job = đúng số sheet (job = phong cách × sheet).
    expect(jobs.length).toBe(c.sheets.length);
    for (const j of jobs) expect(j.job).toBe(`${MAIN_VARIANT_ID}-${j.sheet}`);
  });

  it("id job khớp RE_JOB của agent — nếu không, POST /runs bị 400 trước khi chạy", () => {
    const RE_JOB = /^[a-z0-9-]{2,24}-[a-z0-9-]{2,32}$/;
    for (const j of contractJobs(build())) expect(j.job, j.job).toMatch(RE_JOB);
  });

  it("KHÔNG món nào chọn ⇒ 0 sheet, 0 job, và VẪN parse được (không ném)", () => {
    const s = defaultState();
    const c = build({ elements: s.elements.map((e) => ({ ...e, selected: false })), mascotEnabled: false });
    expect(c.sheets).toEqual([]);
    expect(contractJobs(c)).toEqual([]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   2. ROUND-TRIP với styles.example.json — contract mẫu THẬT của repo
   ══════════════════════════════════════════════════════════════════════════ */

describe("§W3-1 — round-trip với styles.example.json", () => {
  it("chính styles.example.json parse sạch bằng contractSchema", () => {
    expect(() => contractSchema.parse(stylesExample)).not.toThrow();
  });

  it("`bg` sinh ra TRÙNG TỪNG KÝ TỰ với `bg` của bản mẫu (magenta)", () => {
    const built = contractSchema.parse(build());
    const mine = (built.variants ?? [])[0];
    expect(mine?.bg).toBe(stylesExample.styles[0]?.bg);
    expect(mine?.bg).toBe(CHROMA_PRESETS.magenta);
  });

  it("mọi dáng sinh ra đều nằm trong 19 `characterPoses` của bản mẫu", () => {
    const known = new Set(stylesExample.characterPoses);
    const c = build();
    expect(c.characterPoses.length).toBeGreaterThan(0);
    for (const p of c.characterPoses) expect(known, `pose ${p}`).toContain(p);
    for (const sh of c.sheets) {
      for (const cp of sh.components) {
        if (cp.skel.shape !== "pose") continue;
        expect(known, `skel.pose ${String(cp.skel.pose)}`).toContain(String(cp.skel.pose));
      }
    }
  });

  it("bộ khoá cấp cao khớp bản mẫu (sheets · phong cách · characterPoses)", () => {
    const built = build();
    expect(Object.keys(stylesExample)).toEqual(expect.arrayContaining(["sheets", "styles", "characterPoses"]));
    expect(built).toHaveProperty("sheets");
    expect(built).toHaveProperty("characterPoses");
    // Bản mẫu dùng tên CŨ `styles[]`; ta ghi tên CHỐT `variants[]` — cả hai đều hợp lệ,
    // và `normalizeContract` là chỗ quy về một mối trước khi PUT.
    expect(built.variants ?? built.styles).toBeDefined();
  });

  it("đi qua `normalizeContract` (đường PUT thật) rồi parse lại — không mất sheet, không đổi số job", () => {
    const once = contractSchema.parse(build());
    const twice = contractSchema.parse(normalizeContract(once));
    expect(twice.sheets.length).toBe(once.sheets.length);
    expect(contractJobs(twice).length).toBe(contractJobs(once).length);
    expect(twice.variants?.[0]?.id).toBe(MAIN_VARIANT_ID);
    // `styles[]` phải biến mất sau chuẩn hoá — nếu còn, agent thấy hai nguồn phong cách.
    expect(twice.styles).toBeUndefined();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   3. Ô trống — cái bẫy V-02 mà form-to-contract.ts đang dính
   ══════════════════════════════════════════════════════════════════════════ */

describe("§W3-1 — ô trống phải có tên riêng", () => {
  it("HAI ô trống `{file:\"\"}` trong một sheet LÀM `contractSchema.parse` NÉM (V-02)", () => {
    // Đây là lý do ô trống được đặt tên `_empty-N` chứ không để rỗng. Ca này khoá
    // hiểu biết đó lại: nếu ai đó "dọn" tên `_empty-N` đi thì ca này đỏ ngay.
    const twoBlank = {
      schemaVersion: 4,
      sheets: [{
        id: "thu", grid: { cols: 2, rows: 2 },
        components: [
          { file: "01-btn-pill-red", vi: "", spec: "", skel: { shape: "pill", w: 0.7, h: 0.4 } },
          { file: "02-btn-pill-blue", vi: "", spec: "", skel: { shape: "pill", w: 0.7, h: 0.4 } },
          { file: "", vi: "", spec: "", skel: { shape: "empty" } },
          { file: "", vi: "", spec: "", skel: { shape: "empty" } },
        ],
      }],
      variants: [], characterPoses: [],
    };
    expect(() => contractSchema.parse(twoBlank)).toThrow();
  });

  it("contract của ta có ô trống mang tên `_empty-N` và VẪN parse sạch", () => {
    // Kitset 5 món ngang ⇒ lưới 3×3 ⇒ 4 ô trống trong CÙNG một sheet.
    const five = LIB.filter((e) => e.skel.shape !== "full" && e.cell !== "portrait").slice(0, 5);
    const c = build({
      elements: five.map((e) => ({ file: e.file, label: e.vi, role: "", cell: "ngang", selected: true })),
      mascotEnabled: false,
    });
    const sheet = c.sheets.find((sh) => sh.id === "main");
    expect(sheet?.grid).toEqual({ cols: 3, rows: 3 });
    const blanks = sheet!.components.filter((cp) => cp.skel.shape === "empty");
    expect(blanks.length).toBe(4);
    expect(new Set(blanks.map((b) => b.file)).size).toBe(4); // tên đôi một khác nhau
    expect(blanks.every((b) => b.file.startsWith("_empty-"))).toBe(true);
    expect(() => contractSchema.parse(c)).not.toThrow();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   4. Xếp ô: nền riêng · ô dọc lưới 2:1 · group liền kề
   ══════════════════════════════════════════════════════════════════════════ */

describe("§W3-1 — hình dạng sheet", () => {
  it("mỗi nền một sheet 1×1 DỌC, id lấy từ `sheetHint` của thư viện", () => {
    const c = build();
    const bg = c.sheets.filter((sh) => sh.components.some((cp) => cp.skel.shape === "full"));
    expect(bg.map((sh) => sh.id).sort()).toEqual(["bg-home", "bg-play"]);
    for (const sh of bg) {
      expect(sh.grid).toEqual({ cols: 1, rows: 1 });
      expect(sh.orient).toBe("portrait");
      expect(sh.components.length).toBe(1);
    }
  });

  it("ô DỌC đi vào lưới cols = 2×rows (ô 3:4), KHÔNG vào lưới vuông", () => {
    const tall = LIB.filter((e) => e.cell === "portrait").slice(0, 6);
    const c = build({
      elements: tall.map((e) => ({ file: e.file, label: e.vi, role: "", cell: "dọc", selected: true })),
      mascotEnabled: false,
    });
    const sheet = c.sheets.find((sh) => sh.id === "tall");
    expect(sheet).toBeDefined();
    expect(sheet!.grid.cols).toBe(sheet!.grid.rows * 2);
    expect(sheet!.cell_hint).toBe("portrait 3:4 cell");
  });

  it("món cùng `group` nằm CÙNG sheet và LIỀN NHAU (cặp trạng thái không được tách)", () => {
    const grouped = LIB.filter((e) => typeof e.group === "string" && e.cell !== "portrait" && e.skel.shape !== "full");
    expect(grouped.length).toBeGreaterThan(4);
    const c = build({
      elements: grouped.map((e) => ({ file: e.file, label: e.vi, role: "", cell: "ngang", selected: true })),
      mascotEnabled: false,
    });
    const groupOf = new Map(LIB.map((e) => [e.file, e.group]));
    for (const sh of c.sheets) {
      const seen = new Map<string, number[]>();
      sh.components.forEach((cp, i) => {
        const g = groupOf.get(cp.file);
        if (!g) return;
        (seen.get(g) ?? seen.set(g, []).get(g)!).push(i);
      });
      for (const [g, idx] of seen) {
        expect(idx[idx.length - 1]! - idx[0]!, `group ${g} bị chèn ô lạ vào giữa`).toBe(idx.length - 1);
      }
    }
  });

  it("`chunkKeepingGroups` không bao giờ xé một group khi nó còn vừa một sheet", () => {
    const items = [
      { id: "a", group: "pair" }, { id: "b" }, { id: "c", group: "pair" }, { id: "d" }, { id: "e" },
    ];
    const chunks = chunkKeepingGroups(items, 3);
    const withPair = chunks.find((ch) => ch.some((x) => x.group === "pair"))!;
    expect(withPair.filter((x) => x.group === "pair").length).toBe(2);
    expect(chunks.flat().length).toBe(items.length);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   5. Món bỏ qua — phải NÓI RA, không nuốt (ước lượng đọc thẳng chỗ này)
   ══════════════════════════════════════════════════════════════════════════ */

describe("§W3-1 — món không vẽ được", () => {
  it("`wheel-board` (mock) bị loại và ĐƯỢC BÁO, không lọt vào contract", () => {
    const s = defaultState();
    const { drawable, skipped } = resolveKitset(s.elements, LIB);
    expect(skipped.map((x) => x.file)).toContain("wheel-board");
    expect(skipped.find((x) => x.file === "wheel-board")?.reason).toBe("mock");
    expect(drawable.some((e) => e.file === "wheel-board")).toBe(false);
    const files = build().sheets.flatMap((sh) => sh.components.map((cp) => cp.file));
    expect(files).not.toContain("wheel-board");
  });

  it("món KHÔNG có trong thư viện bị báo `unknown`, không âm thầm rơi", () => {
    const s = defaultState();
    const { skipped } = resolveKitset(
      [...s.elements, { file: "99-khong-ton-tai", label: "Món ma", role: "", cell: "ngang", selected: true }],
      LIB,
    );
    expect(skipped.find((x) => x.file === "99-khong-ton-tai")?.reason).toBe("unknown");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   6. Ổn định id + đường dẫn ref
   ══════════════════════════════════════════════════════════════════════════ */

describe("§W3-1 — id ổn định và ref đúng đường", () => {
  it("ĐỔI TÊN bộ kit / mascot KHÔNG đổi một id job nào (ảnh trên đĩa không mồ côi)", () => {
    const before = contractJobs(build()).map((j) => j.job);
    const after = contractJobs(build({ kitName: "Tên hoàn toàn khác", mascotName: "Mèo bạc hà" })).map((j) => j.job);
    expect(after).toEqual(before);
    // Tên người dùng gõ vẫn phải hiện ra — nó sống ở `vi`, không ở `id`.
    expect(build({ kitName: "Tên hoàn toàn khác" }).variants?.[0]?.vi).toBe("Tên hoàn toàn khác");
  });

  it("ref đi vào contract dưới dạng `refs/<name>` — khớp gen.sh và refUsage của agent", () => {
    const c = build({
      styleRefs: [{ name: "inspo-1.png", kind: "style" }],
      brandRefs: [{ name: "brand-1.png" }],
      mascotRef: { name: "char-meo.png" },
    });
    const v = c.variants![0]!;
    expect(v.inspo).toEqual(["refs/inspo-1.png"]);
    expect(v.brand?.refs).toEqual(["refs/brand-1.png"]);
    expect(v.characters?.[0]?.ref).toBe("refs/char-meo.png");
    expect(v.characters?.[0]?.id).toBe(CHARACTER_ID);
    // Sheet dáng phải ĐÍNH ảnh nhân vật, nếu không mỗi ô vẽ một con khác nhau.
    const pose = c.sheets.find((sh) => sh.id.startsWith("pose-"));
    expect(pose?.ref).toBe("refs/char-meo.png");
  });

  it("`refPath` idempotent và chặn đường dẫn ra ngoài project (REF_PATH)", () => {
    expect(refPath("inspo-1.png")).toBe("refs/inspo-1.png");
    expect(refPath("refs/inspo-1.png")).toBe("refs/inspo-1.png");
    expect(refPath("../../gen.sh")).toBe("");
    expect(refPath("/etc/passwd")).toBe("");
  });

  it("có ảnh brand ⇒ `brand.mode = \"image\"` (gen.sh:94 mới đính ảnh), không thì `colors`", () => {
    expect(build().variants?.[0]?.brand?.mode).toBe("colors");
    expect(build({ brandRefs: [{ name: "brand-1.png" }] }).variants?.[0]?.brand?.mode).toBe("image");
  });
});
