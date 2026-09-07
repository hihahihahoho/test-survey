/**
 * Ca test CÓ TÁC DỤNG THẬT: đối chiếu `shape-data.generated.ts` + `shapes.ts` với MÃ
 * NGUỒN ENGINE, không phải với chính nó.
 *
 * Bài học `teams/design/INTEGRATION.md §1.6`: bản mirror của web vanilla so bằng
 * `globalThis.KITSIL` — tức là so hàm thật với chính nó, luôn PASS một cách vô nghĩa,
 * trong khi mirror LỆCH 10/11 shape. Ở đây `silhouettes.js` được nạp vào một scope
 * RIÊNG (biến `window` cục bộ), rồi so TỪNG KÝ TỰ markup.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  MATTE_VALUES, POSE_META, SHAPE_META, SLICE_CONST,
  cellAspect, elementPixels, isKnownShape, poseSvgMarkup, shapeOptions, silhouetteMarkup,
} from "../lib/shapes";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../../");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

interface Kitsil {
  silhouette: (shape: string, w: number, h: number, uid: string, skel?: Record<string, unknown>) => string;
  poseSVG: (id: string, w: number, h: number) => string;
  POSES: Record<string, { vi: string; j: Record<string, [number, number]> }>;
}

/** Nạp silhouettes.js THẬT vào scope riêng — KHÔNG đụng globalThis. */
function loadKitsil(): Kitsil {
  const src = read("silhouettes.js");
  const fn = new Function(`const window = {};\n${src}\nreturn window.KITSIL;`) as () => Kitsil;
  const k = fn();
  expect(k, "nạp được silhouettes.js thật").toBeTruthy();
  return k;
}

describe("whitelist shape rút từ mã nguồn, không gõ tay", () => {
  it("khớp ĐÚNG tập SHAPES của agent (client không được hẹp hơn agent)", () => {
    const m = read("agent/lib/validate.mjs").match(/const SHAPES = new Set\(\[([\s\S]*?)\]\)/);
    expect(m).toBeTruthy();
    const agent = [...m![1]!.matchAll(/"([a-z0-9]+)"/g)].map((x) => x[1]);
    expect(SHAPE_META.map((s) => s.id).sort()).toEqual([...agent].sort());
    for (const s of agent) expect(isKnownShape(s), `agent cho phép «${s}»`).toBe(true);
  });

  it('cờ drawableSvg nói ĐÚNG sự thật: "rect" và "empty" không được silhouettes.js vẽ', () => {
    const k = loadKitsil();
    for (const meta of SHAPE_META) {
      const out = k.silhouette(meta.id, 100, 60, "t", { shape: meta.id, pose: "idle" });
      expect(out !== "", `drawableSvg của «${meta.id}»`).toBe(meta.drawableSvg);
    }
  });

  it("select Hình khối không chào bán ô trống, và đánh dấu shape không vẽ được", () => {
    const opts = shapeOptions();
    expect(opts.some((o) => o.value === "empty")).toBe(false);
    expect(opts.find((o) => o.value === "rect")?.drawable).toBe(false);
    expect(opts.find((o) => o.value === "pill")?.drawable).toBe(true);
  });

  it("shape lạ của element-lib được chấp nhận khi truyền vào (không chặn oan)", () => {
    expect(isKnownShape("hexagon")).toBe(false);
    expect(isKnownShape("hexagon", ["hexagon"])).toBe(true);
  });
});

describe("silhouette SVG khớp TỪNG KÝ TỰ với silhouettes.js", () => {
  const k = loadKitsil();
  const sizes: [number, number][] = [
    [100, 60],
    [37, 91],
    [240, 160],
  ];

  for (const meta of SHAPE_META) {
    it(`shape «${meta.id}»`, () => {
      for (const [w, h] of sizes) {
        for (const plain of [false, true]) {
          const skel = { shape: meta.id, plain, pose: "wave" };
          expect(silhouetteMarkup(meta.id, w, h, "u1", skel)).toBe(k.silhouette(meta.id, w, h, "u1", skel));
        }
      }
    });
  }

  it("cả 19 dáng + 13 khớp mỗi dáng", () => {
    expect(POSE_META).toHaveLength(19);
    expect(Object.keys(k.POSES)).toEqual(POSE_META.map((p) => p.id));
    for (const p of POSE_META) {
      expect(Object.keys(p.j)).toHaveLength(13);
      expect(p.vi).toBe(k.POSES[p.id]!.vi);
      for (const [w, h] of sizes) {
        expect(poseSvgMarkup(p.id, w, h)).toBe(k.poseSVG(p.id, w, h));
      }
    }
  });

  it("dáng không tồn tại rơi về idle — y như bản gốc", () => {
    expect(poseSvgMarkup("khong-co-that", 80, 80)).toBe(k.poseSVG("khong-co-that", 80, 80));
  });
});

describe("hằng số engine rút từ slice.py", () => {
  it("matte đúng 2 giá trị — và nguồn nay là gen.sh, không phải slice.py", () => {
    expect([...MATTE_VALUES].sort()).toEqual(["glass", "glow"]);
    // `matte` chỉ còn đổi CÂU CHỮ của prompt. Hai nhánh đó phải có thật trong gen.sh…
    const gen = read("gen.sh");
    expect(gen).toMatch(/skel"\]\.get\("matte"\) == "glow"/);
    expect(gen).toMatch(/skel"\]\.get\("matte"\) == "glass"/);
    /* …và slice.py TUYỆT ĐỐI không được ĐỌC lại khoá đó: nhánh `matte:"glow"` chính
       là nhánh vẽ trên nền đen. Quét LỜI GỌI chứ không quét chữ — docstring của
       slice.py cố ý kể lại tên cỗ máy đã bỏ. */
    const slice = read("slice.py");
    expect(slice).not.toMatch(/get\("matte"\)/);
    expect(slice).not.toMatch(/\["matte"\]/);
  });

  it("KHÔNG còn tham số cắt nào — slice.py chỉ crop theo toạ độ", () => {
    const src = read("slice.py");
    // Vành ngoài ô: bỏ hẳn. Nó từng nới vùng cắt sang đất ô hàng xóm rồi phải dựng
    // mask sở hữu khối để đuổi lại — và vẫn lọt rác (`01-button`, dự án test-e0d4).
    expect(src).not.toMatch(/^BLEED\s*=/m);
    expect(SLICE_CONST.bleed).toBe(0);
    expect(SLICE_CONST.bleedIsModuleConstant).toBe(true);
    // Hai ngưỡng của mask tách nền: bỏ cùng cỗ máy tách nền.
    expect(src).not.toMatch(/^DEFAULT_THRESHOLD\s*=/m);
    expect(src).not.toMatch(/^GROW_OFFSET\s*=/m);
    expect(src).not.toMatch(/style\.get\("threshold"/);
    expect(src).not.toMatch(/style\.get\("grow_threshold"/);
    expect(SLICE_CONST.threshold).toBeNull();
    expect(SLICE_CONST.growOffset).toBeNull();
  });
});

describe("kích thước ô thật", () => {
  it("tỉ lệ landscape 3:2 · portrait 2:3", () => {
    expect(cellAspect("landscape")).toBeCloseTo(1.5);
    expect(cellAspect("portrait")).toBeCloseTo(2 / 3);
    expect(cellAspect(undefined)).toBeCloseTo(1.5); // mặc định của skeleton.py
  });

  it("px của element khớp cách skeleton.py tính (SW/cols × w)", () => {
    // skeleton.py: SW,SH = (1024,1536) nếu portrait, ngược lại (1536,1024)
    expect(elementPixels("landscape", { cols: 4, rows: 4 }, { w: 0.78, h: 0.4 })).toEqual({ w: 300, h: 102 });
    expect(elementPixels("portrait", { cols: 1, rows: 1 }, { shape: "full" })).toEqual({ w: 1024, h: 1536 });
  });
});
