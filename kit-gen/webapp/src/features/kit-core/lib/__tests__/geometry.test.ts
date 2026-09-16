/**
 * geometry.test.ts — KÍCH THƯỚC Ô/ELEMENT phải khớp ENGINE, không phải khớp trực giác.
 *
 * Đây là phần user tin để quyết định "có tốn lượt gen hay không". Sai số ở đây =
 * user tưởng nút 300px hoá ra 102px, gen xong mới biết, mất 2–5 phút + quota.
 * Vì vậy mọi ca dưới đây đối chiếu với MÃ NGUỒN THẬT chứ không phải với số tôi tự đặt.
 *
 * NGUỒN ĐỔI 27/08/2026 — BỎ SKELETON. Trước đó hình học engine nằm ở `skeleton-svg.js`
 * (bộ dựng ảnh khung xương đính kèm cho model), và các ca dưới đây đọc file đó. Khung
 * xương đã bỏ hẳn: prompt nay IN THẲNG toạ độ safe zone, và toàn bộ số học dời sang
 * MỘT module dùng chung bởi cả bên dựng prompt lẫn bên cắt asset. Đó là một cải thiện
 * cho ca này chứ không phải một sự bất tiện: trước đây "engine" có hai bản hình học
 * lệch nhau 1px, nên đối chiếu với bản nào cũng không đủ; nay chỉ có một bản.
 *
 * NGUỒN ĐỔI LẦN HAI, 16/09/2026 — ENGINE SANG JS. `geometry.py` → `agent/engine/
 * geometry.mjs`, `gen.sh` → `gen.mjs` + `prompt.mjs`, `slice.py` → `slice.mjs`.
 * Và cách ĐỐI CHIẾU đổi theo, mạnh hơn hẳn: trước đây ca này chỉ so được CHỮ trong
 * mã python (khoá cách viết, không khoá kết quả); nay engine cùng ngôn ngữ với
 * webapp nên ca GỌI THẲNG hàm của engine và so TỪNG SỐ. Vài ca vẫn đọc mã nguồn,
 * nhưng chỉ cho câu hỏi mà con số không trả lời được: *"engine có THẬT SỰ gọi module
 * chung không, hay đã lặng lẽ dựng lại một bảng cục bộ?"*.
 *
 * Ý NGHĨA GIỮ NGUYÊN: hằng số của webapp phải khớp ENGINE THẬT, không phải khớp trí nhớ.
 */
import { describe, expect, it } from "vitest";
import { engineGeometry, readRepo as read } from "@/__tests__/engine-geometry";
import {
  BLEED_IS_FIXED, CANVAS_LANDSCAPE, CANVAS_PORTRAIT, CANVAS_SQUARE,
  CELL_MARGIN_RATIO, CELL_MARGIN_RATIO_DECOR, DRAW_SCALE_STEP, SLICE_BLEED,
  canvasOf, cellAspect, cellInner, cellMarginRatio, cellMetrics, drawBox, drawScale, effectiveCellHint,
  elementBox, elementMetrics, formatPx, gridOf, maxFitBox, sheetOrient, simpleRatio,
  suggestCellHint,
} from "../geometry";

const sheet = (cols: number, rows: number, orient?: "landscape" | "portrait") => ({
  orient,
  grid: { cols, rows },
});

describe("khổ ảnh sinh — đúng bảng CANVAS của geometry.mjs", () => {
  it("con số 1536×1024 / 1024×1536 / 1254×1254 là con số ENGINE thật sự trả về", async () => {
    /* Bảng nằm ở `geometry.mjs` và CHỈ ở đó. Mỗi dòng mang cả con số lẫn chuỗi header —
       header chính là dòng đầu prompt mà `gen.mjs` đọc ngược để biết phải xin model
       khổ nào, nên hai thứ đó phải đi cùng một hàng, không được tách. */
    const geo = await engineGeometry();
    expect(geo.CANVAS.landscape?.slice(0, 3)).toEqual([1536, 1024, "LANDSCAPE 1536x1024"]);
    expect(geo.CANVAS.portrait?.slice(0, 3)).toEqual([1024, 1536, "PORTRAIT 1024x1536"]);
    expect(geo.CANVAS.square?.slice(0, 3)).toEqual([1254, 1254, "SQUARE 1254x1254"]);
    /* …và hai bên của engine phải THẬT SỰ dùng bảng đó, không dựng lại một bảng cục
       bộ. Câu này con số không trả lời được — một bản sao trùng số hôm nay vẫn trôi
       khỏi nhau ngày mai — nên ở đây (và chỉ ở đây) ca đọc mã nguồn. */
    expect(read("agent/engine/prompt.mjs")).toContain('import * as geometry from "./geometry.mjs"');
    expect(read("agent/engine/prompt.mjs")).toContain("const canvas_of = geometry.canvas_of");
    expect(read("agent/engine/slice.mjs")).toContain('import * as geometry from "./geometry.mjs"');
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
  it("công thức của engine chỉ còn MỘT bản, và tôi dùng đúng nó", async () => {
    // Trước 27/08/2026 đây là ca đối chiếu HAI bản (skeleton-svg.js vs slice.py).
    // Nay chỉ còn một hàm; ca đổi thành "hàm đó đúng, và dao cắt thật sự gọi nó".
    const geo = await engineGeometry();
    expect(geo.cell_size(1536, 1024, 4, 4)).toEqual([384, 256]);
    expect(read("agent/engine/slice.mjs")).toMatch(
      /\[CW,\s*CH\]\s*=\s*geometry\.cell_size\(W,\s*H,\s*COLS,\s*ROWS\)/,
    );
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
  it("slice.mjs không còn hằng số BLEED nào", () => {
    expect(read("agent/engine/slice.mjs")).not.toMatch(/^(?:export )?const BLEED\s*=/m);
    expect(SLICE_BLEED).toBe(0);
    expect(BLEED_IS_FIXED).toBe(true);
  });

  it("dao cắt lấy ĐÚNG hộp ô, không nới sang ô bên", () => {
    /* Chính dòng crop của slice.mjs. Nới vùng cắt ra ngoài ranh giới ô là cách vệt
       vàng của ô dưới lọt vào `01-button` (dự án test-e0d4) — nên hình dạng của
       dòng này là thứ phải khoá, không phải một con số. */
    expect(read("agent/engine/slice.mjs")).toMatch(/crop\(\[cx0,\s*cy0,\s*cx0\s*\+\s*CW,\s*cy0\s*\+\s*CH\]\)/);
    const m = cellMetrics(sheet(4, 4));
    expect(m.bleedPx).toEqual({ x: 0, y: 0 });
    expect(m.exportPx).toEqual({ w: 384, h: 256 });
  });
});

describe("đặt element trong ô — geometry.safe_offset_in_cell", () => {
  it("engine đặt hộp safe ĐÚNG chỗ webapp vẽ nó — căn giữa, và neo đáy chừa 4%", async () => {
    /* 08/09/2026 — engine bỏ `contentSafe` (vùng chữ/hitbox khai riêng w/h của đời
       thử nghiệm): không nơi nào phát ra nó nữa, nên `safe_spec_of` biến mất và tham
       số đổi tên `spec` → `skel`. Công thức thì KHÔNG đổi, và đó là điều ca này canh —
       nay canh bằng CHÍNH SỐ engine trả về, không bằng hình dạng câu lệnh. */
    const geo = await engineGeometry();
    expect(geo.BOTTOM_ANCHOR_RATIO).toBe(0.04);
    // Nút pill 0,78×0,4 trong ô 384×256: hộp 300×102, canh giữa ⇒ lệch 42 / 77.
    expect(geo.safe_offset_in_cell(384, 256, { w: 0.78, h: 0.4 })).toEqual([42, 77, 300, 102]);
    // Cùng ô, `anchor:"bottom"`: hộp 192×205 dán đáy, chừa 10px (= round(256 × 0,04)).
    expect(geo.safe_offset_in_cell(384, 256, { w: 0.5, h: 0.8, anchor: "bottom" }))
      .toEqual([96, 41, 192, 205]);
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

  it("`free` là NHÃN TRƯNG BÀY của app — engine không còn nhánh nào cho nó", async () => {
    /* 08/09/2026 — `cell_kind` của engine bỏ hẳn loại "free". Nó từng hứa "dao cắt
       bám lõi đo được của artwork", nhưng `slice.py` CHƯA BAO GIỜ có nhánh ấy: mọi ô
       không full-bleed đều cắt theo `safe_offset_in_cell`. Lời hứa ấy bị gỡ ở engine
       chứ không phải bị quên.
       Web GIỮ hành vi cũ ở đúng một điểm — không vẽ khung nét đứt cho ô `free` — và
       đó nay là một quyết định TRÌNH BÀY, không phải một bản sao của luật engine:
       khung nét đứt nói "hộp này là hộp cắt", mà với `free` thì tác giả element đã
       nói rằng mình không muốn người xem đọc nó như vậy. */
    const geo = await engineGeometry();
    for (const shape of ["burst", "pill", "figure", "icon"]) {
      expect(geo.cell_kind({ shape, free: true }), shape).toBe("safe");
    }
    expect(geo.cell_kind({ shape: "full" })).toBe("full");
    expect(geo.cell_kind({ shape: "empty" })).toBe("empty");
    expect(read("agent/engine/geometry.mjs")).not.toMatch(/return "free"/);
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

describe("cell_hint — câu ghép thẳng vào prompt (`prompt.mjs`)", () => {
  it("engine thật sự nhét `cell_hint` vào prompt", () => {
    const src = read("agent/engine/prompt.mjs");
    expect(src).toContain("sh.cell_hint");
    expect(src).toContain("cell_sentence(cell_hint)");
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
   HỘP VẼ MAX-FIT — cùng bốn hàm với `agent/engine/geometry.mjs`

   Vì sao có cả một nhóm ca cho thứ trông như một phép chia: đây là chỗ CỠ NGƯỜI
   DÙNG CHỌN thôi làm cỡ vẽ. Nếu bản của webapp và bản của engine trôi khỏi nhau thì
   prompt hứa một hộp còn dao cắt cắt một hộp khác — đúng cái bệnh mà module hình học
   dùng chung sinh ra để chấm dứt, chỉ khác là lần này biên giới nằm giữa HAI GÓI.
   ──────────────────────────────────────────────────────────────────────────── */
describe("hộp vẽ max-fit — gương của geometry.mjs", () => {
  it("hằng số lề và bước hệ số: cùng một con số ở engine và ở đây", async () => {
    const geo = await engineGeometry();
    expect(geo.CELL_MARGIN_RATIO).toBe(0.1);
    expect(geo.DRAW_SCALE_STEP).toBe(0.25);
    expect(geo.DRAW_SHRINK_STEP).toBe(0.05);
    expect(CELL_MARGIN_RATIO).toBe(geo.CELL_MARGIN_RATIO);
    expect(DRAW_SCALE_STEP).toBe(geo.DRAW_SCALE_STEP);
  });

  it("max-fit của webapp = max-fit của engine, TỪNG SỐ; ô 313 ra khung trong 250", async () => {
    const geo = await engineGeometry();
    /* Con số chủ sản phẩm nêu: ô 313px ⇒ hộp vuông ~250², thanh 3,9:1 ⇒ ~250×64. */
    expect(cellInner(313, 313)).toEqual({ w: 250, h: 250 });
    expect(maxFitBox(313, 313, 1)).toEqual({ w: 250, h: 250 });
    expect(maxFitBox(313, 313, 3.909)).toEqual({ w: 250, h: 64 });
    /* …và ĐÚNG những con số ấy là thứ engine trả về. Khung trong khớp tuyệt đối. */
    for (const [cw, ch] of [[313, 313], [384, 256], [627, 627], [250, 64], [768, 256]] as const) {
      expect(cellInner(cw, ch), `inner ${cw}×${ch}`).toEqual({
        w: geo.cell_inner(cw, ch)[0], h: geo.cell_inner(cw, ch)[1],
      });
      for (const aspect of [1, 1.5, 3.909, 0.5]) {
        const mine = maxFitBox(cw, ch, aspect);
        const [ew, eh] = geo.max_fit_box(cw, ch, aspect);
        expect(Math.abs(mine.w - ew), `maxfit ${cw}×${ch} @${aspect} lệch bề ngang`).toBeLessThanOrEqual(1);
        expect(Math.abs(mine.h - eh), `maxfit ${cw}×${ch} @${aspect} lệch chiều cao`).toBeLessThanOrEqual(1);
      }
    }
  });

  /**
   * ⚠️ MỘT PIXEL LỆCH CÓ THẬT — VÀ NÓ CÓ TRƯỚC LƯỢT PORT SANG JS, KHÔNG PHẢI DO NÓ.
   *
   * Engine làm tròn KIỂU PYTHON: nửa chừng về số CHẴN (`pyRound`, di sản đúng-từng-số
   * của `geometry.py`). Webapp dùng `Math.round`: nửa chừng LÊN. Hai phép ấy CHỈ tách
   * nhau ở ca đúng .5 — đo được: ô 384×256, tỉ lệ 0,5 ⇒ bề ngang thật 102,5 ⇒ engine
   * trả 102, webapp trả 103. Bản python cũ cũng trả 102, nên đây là một lệch nằm sẵn
   * ở đó từ lâu; bộ ca cũ chỉ so CHỮ trong mã python nên không có cách nào thấy.
   *
   * GHI RA CHỨ KHÔNG LÀM NGƠ, và cũng KHÔNG tự ý chữa: đổi phép làm tròn của webapp là
   * đổi con số hiện cho người dùng ở mọi ô, một quyết định của chủ sản phẩm chứ không
   * phải hệ quả phụ của một lượt dọn. Ca này khoá đúng điều đang đúng — lệch không bao
   * giờ quá 1px (ca trên), và ca hoà thì mỗi bên đi về một phía ĐÃ BIẾT (ca này). Ngày
   * ai đó chỉnh phép làm tròn, một trong hai ca sẽ nói ra ngay.
   */
  it("ca hoà đúng nửa pixel: engine về số chẵn, webapp làm tròn lên — lệch 1px, đã biết", async () => {
    const geo = await engineGeometry();
    expect(geo.max_fit_box(384, 256, 0.5)[0]).toBe(102);
    expect(maxFitBox(384, 256, 0.5).w).toBe(103);
    expect(geo.pyRound(102.5)).toBe(102);
    expect(Math.round(102.5)).toBe(103);
  });

  it("hệ số phóng làm tròn XUỐNG bước 0,25 và hộp vẽ KHÔNG BAO GIỜ vượt lề", async () => {
    const geo = await engineGeometry();
    /* Nút 120×52 trong ô 627 (khung trong 502): 502/120 = 4,18 ⇒ 4,0 chẵn. */
    expect(geo.draw_box(627, 627, 120, 52)).toEqual([480, 208, 4]);
    expect(drawScale(627, 627, 120, 52)).toBe(4);
    expect(drawBox(627, 627, 120, 52)).toEqual({ w: 480, h: 208, scale: 4 });
    /* Quét rộng: mọi cỡ đầu ra hợp lệ trên mọi lưới đều phải nằm gọn trong lề —
       VÀ phải là đúng hộp engine tính, kể cả ở nhánh thu nhỏ (bước 0,05). */
    const inner = cellInner(313, 313);
    for (const out of [[120, 52], [195, 195], [304, 78], [8, 4096], [1254, 1254], [40, 40]]) {
      const box = drawBox(313, 313, out[0]!, out[1]!);
      expect(box.w).toBeLessThanOrEqual(inner.w);
      expect(box.h).toBeLessThanOrEqual(inner.h);
      /* Tỉ lệ được GIỮ — đó là thứ duy nhất ta thật sự yêu cầu ở máy vẽ. */
      expect(box.w / box.h).toBeCloseTo(out[0]! / out[1]!, 0);
      const [ew, eh, ek] = geo.draw_box(313, 313, out[0]!, out[1]!);
      expect([box.w, box.h, box.scale], `draw_box 313 ← ${out[0]}×${out[1]}`).toEqual([ew, eh, ek]);
    }
  });

  it("CỠ ĐẦU RA đi hết đường: contract → slice.mjs → manifest → route /kit", () => {
    /* Ba mắt xích, đứt một mắt là cả tính năng chết LẶNG LẼ: webapp không thấy
       `outSize` thì `sheet-files.ts` rơi về `contractSafe`, tức dán ra Figma đúng
       cỡ MÁY VẼ (hộp max-fit) chứ không đúng cỡ người dùng chọn — và không có gì
       đỏ ở đâu cả. Đọc mã thật của cả ba, không tin trí nhớ. */
    expect(read("agent/engine/slice.mjs"))
      .toMatch(/asset\.set\("outSize", \[pyInt\(get\(out, "w"\)\), pyInt\(get\(out, "h"\)\)\]\)/);
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
    /* Và `prompt.mjs` là nơi con số ấy thành câu nói với máy vẽ. Từ 14/09/2026 câu ấy
       KHÔNG còn là một hộp pixel: đo r-0021 cho thấy model vẽ đúng tâm mà lõi 587px
       nằm trong hộp hứa 368px — mọi ô lệch 1,5–1,7 lần, qua codex lẫn qua web
       ChatGPT. Nên `out` nay đi vào prompt theo hai lối model đọc được: TỈ LỆ W:H
       (`core_aspect`) và bề ngang trên màn bằng lời. Mắt xích vẫn phải liền —
       `out` không tới `prompt.mjs` thì cả hai câu biến mất, lặng lẽ. */
    const prompt = read("agent/engine/prompt.mjs");
    expect(prompt).toContain("export function core_aspect(out)");
    expect(prompt).toContain('spec += " — " + aspect');
    expect(prompt).toContain("about ${ow} px wide on screen");
    expect(prompt).not.toContain("final size ${ow}x${oh} px, drawn at");
  });

  /* ── LỀ CỦA Ô CÓ TRANG TRÍ ────────────────────────────────────────────────
     Đo trên dự án thật: lề 0,10 chừa 62px mỗi bên trên ô 627px, mà `overflowPx`
     của viền + đèn lồng đo được là 69 và 77 ⇒ dao cắt (crop theo hộp ô) đã chém
     cụt. Nấc trang trí khác «Không» ⇒ lề gấp đôi, safe zone tụt từ ~78% xuống ~60%
     bề ngang ô. Hai bản (engine & webapp) phải khớp TỪNG SỐ, nếu không thì prompt
     hứa một hộp còn dao cắt cắt một hộp khác. */
  it("lề của ô có trang trí: cùng một con số ở geometry.mjs và ở đây", async () => {
    const geo = await engineGeometry();
    expect(geo.CELL_MARGIN_RATIO_DECOR).toBe(0.2);
    expect(CELL_MARGIN_RATIO_DECOR).toBe(geo.CELL_MARGIN_RATIO_DECOR);
    /* Và cùng một LUẬT chọn lề, không chỉ cùng một con số: thiếu khoá `decor` ⇒ lề
       thường ở CẢ HAI bên, nếu không thì contract đời cũ cắt lệch một cách lặng lẽ. */
    for (const skel of [null, undefined, {}, { decor: false }, { decor: true }]) {
      expect(cellMarginRatio(skel), JSON.stringify(skel)).toBe(geo.cell_margin_ratio(skel));
    }
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
