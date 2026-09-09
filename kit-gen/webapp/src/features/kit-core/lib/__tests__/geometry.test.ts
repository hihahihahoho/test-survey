/**
 * geometry.test.ts — KÍCH THƯỚC Ô/ELEMENT phải khớp ENGINE, không phải khớp trực giác.
 *
 * Đây là phần user tin để quyết định "có tốn lượt gen hay không". Sai số ở đây =
 * user tưởng nút 300px hoá ra 102px, gen xong mới biết, mất 2–5 phút + quota.
 * Vì vậy mọi ca dưới đây đối chiếu với MÃ NGUỒN THẬT chứ không phải với số tôi tự đặt.
 *
 * NGUỒN ĐỔI 27/08/2026 — BỎ SKELETON. Trước đó hình học engine nằm ở `skeleton-svg.js`
 * (bộ dựng ảnh khung xương đính kèm cho model), và các ca dưới đây đọc file đó. Khung
 * xương đã bỏ hẳn: prompt nay IN THẲNG toạ độ safe zone, `skeleton-svg.js` /
 * `skeleton.html` / `render-skeleton.mjs` đã xoá, và toàn bộ số học dời sang
 * **`geometry.py`** — module mà CẢ `gen.sh` (dựng prompt) lẫn `slice.py` (cắt asset)
 * cùng import. Đó là một cải thiện cho ca này chứ không phải một sự bất tiện: trước
 * đây "engine" có hai bản hình học lệch nhau 1px, nên đối chiếu với bản nào cũng
 * không đủ; nay chỉ có một bản để mà đối chiếu.
 *
 * Ý NGHĨA GIỮ NGUYÊN: hằng số của webapp phải khớp MÃ ENGINE THẬT, không phải khớp
 * trí nhớ. Chỉ đổi chỗ đọc.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BLEED_IS_FIXED, CANVAS_LANDSCAPE, CANVAS_PORTRAIT, CANVAS_SQUARE,
  CELL_MARGIN_RATIO, CELL_MARGIN_RATIO_DECOR, DRAW_SCALE_STEP, SLICE_BLEED,
  canvasOf, cellAspect, cellInner, cellMarginRatio, cellMetrics, drawBox, drawScale, effectiveCellHint,
  elementBox, elementMetrics, formatPx, gridOf, maxFitBox, sheetOrient, simpleRatio,
  suggestCellHint,
} from "../geometry";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../../../../");
const read = (p: string) => readFileSync(resolve(REPO, p), "utf8");

const sheet = (cols: number, rows: number, orient?: "landscape" | "portrait") => ({
  orient,
  grid: { cols, rows },
});

describe("khổ ảnh sinh — đúng bảng CANVAS của geometry.py", () => {
  it("con số 1536×1024 / 1024×1536 / 1254×1254 có THẬT trong mã engine", () => {
    /* Bảng nằm ở geometry.py và CHỈ ở đó. Mỗi dòng mang cả con số lẫn chuỗi header —
       header chính là dòng đầu prompt mà `run_one` (bash) grep ngược để biết phải xin
       model khổ nào, nên hai thứ đó phải đi cùng một dòng, không được tách. */
    const geo = read("geometry.py");
    expect(geo).toMatch(/"landscape":\s*\(1536,\s*1024,\s*"LANDSCAPE 1536x1024"/);
    expect(geo).toMatch(/"portrait":\s*\(1024,\s*1536,\s*"PORTRAIT 1024x1536"/);
    expect(geo).toMatch(/"square":\s*\(1254,\s*1254,\s*"SQUARE 1254x1254"/);
    // …và gen.sh phải THẬT SỰ dùng bảng đó, không dựng lại một bảng cục bộ.
    expect(read("gen.sh")).toContain("import geometry");
    expect(read("gen.sh")).toContain("canvas_of = geometry.canvas_of");
    expect(read("slice.py")).toContain("import geometry");
  });

  it("khớp hằng số trong code của tôi", () => {
    expect(CANVAS_LANDSCAPE).toEqual({ w: 1536, h: 1024 });
    expect(CANVAS_PORTRAIT).toEqual({ w: 1024, h: 1536 });
    expect(CANVAS_SQUARE).toEqual({ w: 1254, h: 1254 });
    expect(canvasOf(sheet(4, 4))).toEqual({ w: 1536, h: 1024 });
    expect(canvasOf(sheet(4, 4, "portrait"))).toEqual({ w: 1024, h: 1536 });
    expect(sheetOrient(undefined)).toBe("landscape");
  });

  it("canvas:'square' thắng orient cũ — preview vẽ đúng tấm 1:1 như engine", () => {
    expect(canvasOf({ orient: "landscape", canvas: "square" })).toEqual({ w: 1254, h: 1254 });
    expect(sheetOrient({ orient: "landscape", canvas: "square" })).toBe("square");
    expect(cellAspect({ orient: "landscape", canvas: "square", grid: { cols: 3, rows: 3 } })).toBe(1);
  });
});

describe("chia ô — `geometry.cell_size`, dùng chung bởi prompt và dao cắt", () => {
  it("công thức của engine chỉ còn MỘT bản, và tôi dùng đúng nó", () => {
    // Trước 27/08/2026 đây là ca đối chiếu HAI bản (skeleton-svg.js vs slice.py).
    // Nay chỉ còn một hàm; ca đổi thành "hàm đó đúng, và slice.py thật sự gọi nó".
    expect(read("geometry.py")).toMatch(/return round\(width \/ cols\), round\(height \/ rows\)/);
    expect(read("slice.py")).toMatch(/CW,\s*CH\s*=\s*geometry\.cell_size\(W,\s*H,\s*COLS,\s*ROWS\)/);
    const m = cellMetrics(sheet(4, 4));
    expect(m.cellPx).toEqual({ w: 384, h: 256 });
  });

  it("lưới 1×1 (sheet nền) = nguyên khổ ảnh", () => {
    expect(cellMetrics(sheet(1, 1)).cellPx).toEqual({ w: 1536, h: 1024 });
    expect(cellMetrics(sheet(1, 1, "portrait")).cellPx).toEqual({ w: 1024, h: 1536 });
  });

  it("tỉ lệ ô: 4×4 landscape ra đúng 3:2", () => {
    expect(cellAspect(sheet(4, 4))).toBeCloseTo(1.5);
    expect(cellAspect(sheet(4, 4, "portrait"))).toBeCloseTo(2 / 3);
  });

  it("lưới KHÔNG vuông thì tỉ lệ ô đổi theo — không cứng nhắc 3:2", () => {
    // 1536/2 = 768 rộng, 1024/4 = 256 cao ⇒ ô rất bẹt (3:1)
    expect(cellMetrics(sheet(2, 4)).cellPx).toEqual({ w: 768, h: 256 });
    expect(cellAspect(sheet(2, 4))).toBeCloseTo(3);
  });

  it("lưới hỏng/thiếu → 1×1, KHÔNG chia cho 0, không NaN", () => {
    expect(gridOf(null)).toEqual({ cols: 1, rows: 1 });
    expect(gridOf({ grid: { cols: 0, rows: -3 } })).toEqual({ cols: 1, rows: 1 });
    expect(Number.isFinite(cellMetrics(null).cellPx.w)).toBe(true);
  });
});

describe("KHÔNG CÒN vành bleed — canvas file cắt ra = ĐÚNG một ô (07/09/2026)", () => {
  it("slice.py không còn hằng số BLEED nào", () => {
    expect(read("slice.py")).not.toMatch(/^BLEED\s*=/m);
    expect(SLICE_BLEED).toBe(0);
    expect(BLEED_IS_FIXED).toBe(true);
  });

  it("dao cắt lấy ĐÚNG hộp ô, không nới sang ô bên", () => {
    /* Chính dòng crop của slice.py. Nới vùng cắt ra ngoài ranh giới ô là cách vệt
       vàng của ô dưới lọt vào `01-button` (dự án test-e0d4) — nên hình dạng của
       dòng này là thứ phải khoá, không phải một con số. */
    expect(read("slice.py")).toMatch(/crop\(\(cx0,\s*cy0,\s*cx0\s*\+\s*CW,\s*cy0\s*\+\s*CH\)\)/);
    const m = cellMetrics(sheet(4, 4));
    expect(m.bleedPx).toEqual({ x: 0, y: 0 });
    expect(m.exportPx).toEqual({ w: 384, h: 256 });
  });
});

describe("đặt element trong ô — geometry.safe_offset_in_cell", () => {
  it("công thức căn giữa + anchor bottom có thật trong geometry.py", () => {
    const src = read("geometry.py");
    /* 08/09/2026 — engine bỏ `contentSafe` (vùng chữ/hitbox khai riêng w/h của đời
       thử nghiệm): không nơi nào phát ra nó nữa, nên `safe_spec_of` biến mất và tham
       số đổi tên `spec` → `skel`. Công thức thì KHÔNG đổi, và đó là điều ca này canh. */
    expect(src).toMatch(/sw\s*=\s*round\(cell_w \* skel\["w"\]\)/);
    expect(src).toMatch(/sh\s*=\s*round\(cell_h \* skel\["h"\]\)/);
    expect(src).toMatch(/skel\.get\("anchor"\)\s*==\s*"bottom"/);
    expect(src).toMatch(/BOTTOM_ANCHOR_RATIO\s*=\s*0\.04/);
  });

  it("căn giữa: nút pill 0.78×0.4 trong ô 4×4 ra 300×102 px", () => {
    const m = elementMetrics(sheet(4, 4), { shape: "pill", w: 0.78, h: 0.4 });
    expect(m.elementPx).toEqual({ w: 300, h: 102 });
    const box = elementBox({ shape: "pill", w: 0.78, h: 0.4 }, 384, 256);
    expect(box.x).toBeCloseTo((384 - 384 * 0.78) / 2);
    expect(box.y).toBeCloseTo((256 - 256 * 0.4) / 2);
  });

  it("anchor bottom: dán đáy, chừa 4% chiều cao ô", () => {
    const box = elementBox({ shape: "figure", w: 0.5, h: 0.8, anchor: "bottom" }, 384, 256);
    expect(box.y).toBeCloseTo(256 - 256 * 0.8 - 256 * 0.04);
  });

  it("`full` phủ KÍN ô và KHÔNG có khung safe (geometry.cell_kind trả 'full' ⇒ safe = None)", () => {
    const box = elementBox({ shape: "full" }, 384, 256);
    expect([box.x, box.y, box.w, box.h]).toEqual([0, 0, 384, 256]);
    expect(box.isFull).toBe(true);
    expect(box.hasSafeFrame).toBe(false);
  });

  it("`free` là NHÃN TRƯNG BÀY của app — engine không còn nhánh nào cho nó", () => {
    /* 08/09/2026 — `cell_kind` của engine bỏ hẳn loại "free". Nó từng hứa "dao cắt
       bám lõi đo được của artwork", nhưng `slice.py` CHƯA BAO GIỜ có nhánh ấy: mọi ô
       không full-bleed đều cắt theo `safe_offset_in_cell`. Lời hứa ấy bị gỡ ở engine
       chứ không phải bị quên.
       Web GIỮ hành vi cũ ở đúng một điểm — không vẽ khung nét đứt cho ô `free` — và
       đó nay là một quyết định TRÌNH BÀY, không phải một bản sao của luật engine:
       khung nét đứt nói "hộp này là hộp cắt", mà với `free` thì tác giả element đã
       nói rằng mình không muốn người xem đọc nó như vậy. */
    const engine = read("geometry.py");
    expect(engine).toContain('KHÔNG CÒN "free"');
    expect(engine).not.toMatch(/return "free"/);
    expect(elementBox({ shape: "burst", w: 0.6, h: 0.9, free: true }, 384, 256).hasSafeFrame).toBe(false);
    expect(elementBox({ shape: "burst", w: 0.6, h: 0.9 }, 384, 256).hasSafeFrame).toBe(true);
  });

  it("ô trống không có khung safe", () => {
    expect(elementBox({ shape: "empty" }, 384, 256).hasSafeFrame).toBe(false);
  });

  it("w/h hỏng → rơi về 0.8/0.6 để ô vẫn vẽ được, không biến mất", () => {
    const box = elementBox({ shape: "pill", w: Number.NaN, h: -1 }, 100, 100);
    expect(box.w).toBeCloseTo(80);
    expect(box.h).toBeCloseTo(60);
  });

  it("% diện tích ô tính đúng", () => {
    const m = elementMetrics(sheet(4, 4), { shape: "pill", w: 0.5, h: 0.5 });
    expect(Math.round(m.areaPercent)).toBe(25);
  });
});

describe("định dạng cho người đọc", () => {
  it("tỉ lệ rút gọn: số nhỏ thì a:b, số to thì bỏ về dạng thập phân", () => {
    expect(simpleRatio(1536, 1024)).toBe("3:2");
    expect(simpleRatio(384, 256)).toBe("3:2");
    /* 300:102 rút gọn đúng ra là 50:17 — nhưng "50:17" không nói lên hình dáng gì
       cho người đọc, nên quá 24 thì chuyển sang "2.9:1". Ca này chốt lại lựa chọn đó
       (chính nó bắt được kỳ vọng sai của tôi lúc viết test lần đầu). */
    expect(simpleRatio(300, 102)).toBe("2.9:1");
    expect(simpleRatio(1000, 37)).toBe("27.0:1");
    expect(simpleRatio(102, 300)).toBe("1:2.9");
    expect(simpleRatio(0, 5)).toBe("—");
    expect(simpleRatio(Number.NaN, 5)).toBe("—");
  });

  it("px", () => {
    expect(formatPx(383.6, 256.4)).toBe("384 × 256 px");
  });
});

describe("cell_hint — câu ghép thẳng vào prompt (gen.sh dòng 43)", () => {
  it("gen.sh thật sự nhét `cell_hint` vào prompt", () => {
    expect(read("gen.sh")).toContain(`sh.get('cell_hint', 'cell')`);
  });

  it("sheet có hint thì dùng nguyên văn, không tự chế", () => {
    const r = effectiveCellHint({ ...sheet(4, 4), cell_hint: "landscape 3:2 cell" });
    expect(r).toEqual({ text: "landscape 3:2 cell", isSuggestion: false });
  });

  it("thiếu hint thì gợi ý theo tỉ lệ ô THẬT và nói rõ là gợi ý", () => {
    const r = effectiveCellHint(sheet(4, 4));
    expect(r.isSuggestion).toBe(true);
    expect(r.text).toBe("landscape 3:2 cell");
    expect(suggestCellHint(sheet(2, 4))).toBe("landscape 3:1 cell");
    expect(suggestCellHint(sheet(4, 4, "portrait"))).toBe("portrait 2:3 cell");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
   HỘP VẼ MAX-FIT — cùng bốn hàm với `geometry.py`

   Vì sao có cả một nhóm ca cho thứ trông như một phép chia: đây là chỗ CỠ NGƯỜI
   DÙNG CHỌN thôi làm cỡ vẽ. Nếu bản TS và bản python trôi khỏi nhau thì prompt
   hứa một hộp còn dao cắt cắt một hộp khác — đúng cái bệnh mà `geometry.py` sinh
   ra để chấm dứt, chỉ khác là lần này biên giới nằm giữa hai NGÔN NGỮ.
   ──────────────────────────────────────────────────────────────────────────── */
describe("hộp vẽ max-fit — gương của geometry.py", () => {
  it("hằng số lề và bước hệ số có THẬT trong geometry.py", () => {
    const src = read("geometry.py");
    expect(src).toMatch(/CELL_MARGIN_RATIO\s*=\s*0\.10/);
    expect(src).toMatch(/DRAW_SCALE_STEP\s*=\s*0\.25/);
    expect(src).toMatch(/DRAW_SHRINK_STEP\s*=\s*0\.05/);
    expect(CELL_MARGIN_RATIO).toBe(0.1);
    expect(DRAW_SCALE_STEP).toBe(0.25);
  });

  it("công thức max-fit có thật trong geometry.py và ô 313 ra khung trong 250", () => {
    const src = read("geometry.py");
    expect(src).toMatch(/def max_fit_box\(cell_w, cell_h, aspect, margin=CELL_MARGIN_RATIO\)/);
    expect(src).toMatch(/w = min\(aw, ah \* aspect\)/);
    expect(src).toMatch(/return round\(w\), round\(w \/ aspect\)/);
    /* Con số chủ sản phẩm nêu: ô 313px ⇒ hộp vuông ~250², thanh 3,9:1 ⇒ ~250×64. */
    expect(cellInner(313, 313)).toEqual({ w: 250, h: 250 });
    expect(maxFitBox(313, 313, 1)).toEqual({ w: 250, h: 250 });
    expect(maxFitBox(313, 313, 3.909)).toEqual({ w: 250, h: 64 });
  });

  it("hệ số phóng làm tròn XUỐNG bước 0,25 và hộp vẽ KHÔNG BAO GIỜ vượt lề", () => {
    expect(read("geometry.py")).toMatch(/raw = min\(aw \/ out_w, ah \/ out_h\)/);
    /* Nút 120×52 trong ô 627 (khung trong 502): 502/120 = 4,18 ⇒ 4,0 chẵn. */
    expect(drawScale(627, 627, 120, 52)).toBe(4);
    expect(drawBox(627, 627, 120, 52)).toEqual({ w: 480, h: 208, scale: 4 });
    /* Quét rộng: mọi cỡ đầu ra hợp lệ trên mọi lưới đều phải nằm gọn trong lề. */
    const inner = cellInner(313, 313);
    for (const out of [[120, 52], [195, 195], [304, 78], [8, 4096], [1254, 1254], [40, 40]]) {
      const box = drawBox(313, 313, out[0]!, out[1]!);
      expect(box.w).toBeLessThanOrEqual(inner.w);
      expect(box.h).toBeLessThanOrEqual(inner.h);
      /* Tỉ lệ được GIỮ — đó là thứ duy nhất ta thật sự yêu cầu ở máy vẽ. */
      expect(box.w / box.h).toBeCloseTo(out[0]! / out[1]!, 0);
    }
  });

  it("CỠ ĐẦU RA đi hết đường: contract → slice.py → manifest → route /kit", () => {
    /* Ba mắt xích, đứt một mắt là cả tính năng chết LẶNG LẼ: webapp không thấy
       `outSize` thì `sheet-files.ts` rơi về `contractSafe`, tức dán ra Figma đúng
       cỡ MÁY VẼ (hộp max-fit) chứ không đúng cỡ người dùng chọn — và không có gì
       đỏ ở đâu cả. Đọc mã thật của cả ba, không tin trí nhớ. */
    expect(read("slice.py")).toMatch(/asset\["outSize"\] = \[int\(out\["w"\]\), int\(out\["h"\]\)\]/);
    expect(read("agent/routes/files.mjs")).toMatch(/outSize: meta\?\.outSize/);
    /* Và engine phải CHẤP NHẬN trường ấy, không đánh nó là schema lạ. */
    expect(read("agent/lib/validate.mjs")).toContain("OUT_SIZE");
    /* ══ MẮT XÍCH THỨ TƯ — CÁI ĐÃ ĐỨT THẬT ═══════════════════════════════════
       Ba dòng trên xanh suốt, mà chủ sản phẩm vẫn báo "ra Figma không đúng size".
       Vì chuỗi có BỐN mắt, không phải ba: giữa contract và `slice.py` còn
       `contractToStylesV1` — nơi dựng `styles.json` cho engine đọc. Nó lọc
       `components` xuống một danh sách trắng, và `out`/`drawScale` không có tên
       trong đó ⇒ `styles.json` trống ⇒ `slice.py` không có gì để chép sang
       `outSize`, `gen.sh` không có gì để in ra cỡ thật cho máy vẽ. */
    const engine = read("agent/lib/engine.mjs");
    expect(engine).toMatch(/e\.out = \{ w: Math\.round\(ow\), h: Math\.round\(oh\) \}/);
    expect(engine).toMatch(/e\.drawScale = k/);
    /* Và `gen.sh` là nơi con số ấy thành câu nói với máy vẽ. */
    expect(read("gen.sh")).toContain("final size {ow}x{oh} px, drawn at {k:g}x");
  });

  /* ── LỀ CỦA Ô CÓ TRANG TRÍ ────────────────────────────────────────────────
     Đo trên dự án thật: lề 0,10 chừa 62px mỗi bên trên ô 627px, mà `overflowPx`
     của viền + đèn lồng đo được là 69 và 77 ⇒ `slice.py` (crop theo hộp ô) đã chém
     cụt. Nấc trang trí khác «Không» ⇒ lề gấp đôi, safe zone tụt từ ~78% xuống ~60%
     bề ngang ô. Hai bản (python & TS) phải khớp TỪNG SỐ, nếu không thì prompt hứa
     một hộp còn dao cắt cắt một hộp khác. */
  it("lề của ô có trang trí: cùng một con số ở geometry.py và ở đây", () => {
    const src = read("geometry.py");
    expect(src).toMatch(/CELL_MARGIN_RATIO_DECOR\s*=\s*0\.20/);
    expect(src).toContain("def cell_margin_ratio(skel):");
    expect(src).toContain('return CELL_MARGIN_RATIO_DECOR if (skel or {}).get("decor") else CELL_MARGIN_RATIO');
    expect(CELL_MARGIN_RATIO_DECOR).toBe(0.2);
  });

  it("thiếu khoá `decor` ⇒ lề THƯỜNG — contract đời cũ không đổi một pixel nào", () => {
    expect(cellMarginRatio(null)).toBe(CELL_MARGIN_RATIO);
    expect(cellMarginRatio(undefined)).toBe(CELL_MARGIN_RATIO);
    expect(cellMarginRatio({})).toBe(CELL_MARGIN_RATIO);
    expect(cellMarginRatio({ decor: false })).toBe(CELL_MARGIN_RATIO);
    expect(cellMarginRatio({ decor: true })).toBe(CELL_MARGIN_RATIO_DECOR);
  });

  it("ô 627 có trang trí: safe zone ~60% ô, chừa 125px mỗi bên thay vì 62", () => {
    const thuong = cellInner(627, 627, cellMarginRatio({}));
    const decor = cellInner(627, 627, cellMarginRatio({ decor: true }));
    expect(thuong).toEqual({ w: 502, h: 502 });
    expect(decor).toEqual({ w: 376, h: 376 });
    expect(Math.floor((627 - thuong.w) / 2)).toBe(62);
    expect(Math.floor((627 - decor.w) / 2)).toBe(125);
    /* Hộp vẽ nhỏ lại nhưng TỈ LỆ giữ nguyên — thứ duy nhất ta yêu cầu ở máy vẽ. */
    for (const out of [[245, 85], [195, 195], [270, 207]]) {
      const box = drawBox(627, 627, out[0]!, out[1]!, cellMarginRatio({ decor: true }));
      expect(box.w).toBeLessThanOrEqual(decor.w);
      expect(box.w / box.h).toBeCloseTo(out[0]! / out[1]!, 0);
    }
  });

  it("cỡ đầu ra LỚN HƠN ô ⇒ hệ số tụt dưới 1 nhưng tỉ lệ không méo", () => {
    /* Ca này từng được chốt là "k = 1, hộp = min(out, box)" — `min` theo từng trục
       biến thanh 3,9:1 thành 3,2:1. Xem khối chú thích của `draw_box`. */
    const box = drawBox(313, 313, 304, 78);
    expect(box.scale).toBeLessThan(1);
    expect(box.w).toBeLessThanOrEqual(cellInner(313, 313).w);
    expect(box.w / box.h).toBeCloseTo(304 / 78, 0);
  });
});
