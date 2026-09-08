/**
 * Ca test CÓ TÁC DỤNG THẬT: đối chiếu `shape-data.generated.ts` + `shapes.ts` với MÃ
 * NGUỒN ENGINE, không phải với chính nó.
 *
 * ══ 08/09/2026 — `silhouettes.js` KHÔNG CÒN, VÀ ĐÂY LÀ HỆ QUẢ ═══════════════
 * Bản gốc nạp `kit-gen/silhouettes.js` vào một scope riêng rồi so TỪNG KÝ TỰ markup
 * với `silhouetteMarkup()` của web (bài học `teams/design/INTEGRATION.md §1.6`: bản
 * mirror của web vanilla so bằng `globalThis.KITSIL` — so hàm thật với chính nó, luôn
 * PASS vô nghĩa, trong khi mirror LỆCH 10/11 shape).
 *
 * Engine đã BỎ khung xương: prompt in thẳng toạ độ safe zone bằng số, không đính ảnh
 * silhouette nào nữa, và `silhouettes.js` bị xoá khỏi repo. Nghĩa là `shapes.ts` +
 * `shape-data.generated.ts` nay là BẢN DUY NHẤT của hình học ấy — chúng chỉ còn vẽ
 * cho THƯ VIỆN ELEMENT trên web (`home/LibraryScreen`), không còn bản nào để đối
 * chiếu, nên hai describe so-từng-ký-tự ĐÃ XOÁ thay vì để chúng so với chính mình.
 *
 * Những gì Ở LẠI vẫn đối chiếu với mã nguồn THẬT — whitelist shape của
 * `agent/lib/validate.mjs` và các hằng số cắt của `slice.py`. Đó vẫn là chỗ webapp
 * có thể trôi khỏi engine một cách lặng lẽ.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  POSE_META, SHAPE_META, SLICE_CONST,
  cellAspect, elementPixels, isKnownShape, poseSvgMarkup, shapeOptions, silhouetteMarkup,
} from "../shapes";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../../../");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

describe("whitelist shape rút từ mã nguồn, không gõ tay", () => {
  it("khớp ĐÚNG tập SHAPES của agent (client không được hẹp hơn agent)", () => {
    const m = read("agent/lib/validate.mjs").match(/const SHAPES = new Set\(\[([\s\S]*?)\]\)/);
    expect(m).toBeTruthy();
    const agent = [...m![1]!.matchAll(/"([a-z0-9]+)"/g)].map((x) => x[1]);
    expect(SHAPE_META.map((s) => s.id).sort()).toEqual([...agent].sort());
    for (const s of agent) expect(isKnownShape(s), `agent cho phép «${s}»`).toBe(true);
  });

  it("cờ drawableSvg khớp với thứ `silhouetteMarkup` VẼ ĐƯỢC THẬT", () => {
    /* Cờ này quyết định select «Hình khối» đánh dấu shape nào là "không xem trước
       được". Nó từng được đối chiếu với `silhouettes.js`; file ấy không còn, nên nay
       đối chiếu với chính bộ vẽ đang chạy — không phải một bản chép tay. */
    for (const meta of SHAPE_META) {
      const out = silhouetteMarkup(meta.id, 100, 60, "t", { shape: meta.id, pose: "idle" });
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

describe("bảng dáng — 19 dáng, mỗi dáng 13 khớp", () => {
  it("đủ 19 dáng và không dáng nào thiếu khớp", () => {
    expect(POSE_META).toHaveLength(19);
    for (const p of POSE_META) {
      expect(Object.keys(p.j), `dáng «${p.id}»`).toHaveLength(13);
      expect(p.vi, `dáng «${p.id}» phải có nhãn tiếng Việt`).toBeTruthy();
    }
  });

  it("dáng không tồn tại rơi về `idle` thay vì trả chuỗi rỗng", () => {
    expect(poseSvgMarkup("khong-co-that", 80, 80)).toBe(poseSvgMarkup("idle", 80, 80));
    expect(poseSvgMarkup("khong-co-that", 80, 80)).not.toBe("");
  });
});

describe("hằng số engine rút từ slice.py", () => {
  /* GUARD ÂM (08/09/2026). `skel.matte` từng là cờ mà CẢ HAI tầng cùng đọc — gen.sh
     in thêm một khối "LIGHT EFFECT…"/"SEE-THROUGH ELEMENT…", slice.py chọn nhánh giải
     ngược. Cả hai vế đã bỏ: độ trong của một ô nay CHỈ là chữ nằm trong `spec`. Ca này
     canh cái cờ ấy không lặng lẽ mọc lại ở tầng engine — mọc lại là có ngay hai bản
     của cùng một luật, đúng thứ đợt dọn này gỡ đi.
     Quét LỜI GỌI chứ không quét chữ: docstring của cả hai file cố ý kể lại lịch sử. */
  it("engine KHÔNG còn đọc `skel.matte` — cả gen.sh lẫn slice.py", () => {
    for (const f of ["gen.sh", "slice.py"]) {
      const src = read(f);
      expect(src, f).not.toMatch(/get\("matte"\)/);
      expect(src, f).not.toMatch(/\["matte"\]/);
    }
    // …và không câu prompt nào của engine còn tự phát ra hợp đồng alpha của riêng nó.
    const gen = read("gen.sh");
    expect(gen).not.toMatch(/LIGHT EFFECT/);
    expect(gen).not.toMatch(/SEE-THROUGH ELEMENT/);
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
