/* @vitest-environment jsdom */
/**
 * PHẦN THUẦN CỦA PANEL KẾT QUẢ — số học và luật lọc, kiểm bằng số thật.
 *
 * Ba nhóm ca, mỗi nhóm khoá một thứ đã từng sai ở chỗ khác trong app:
 *  ① `figmaNodeForSheet` — spec cả tấm phải ĐI QUA ĐƯỢC chính cái cổng mà encoder
 *    dùng (`assertDocShape`), và phải dựng ra đúng cây DOM mà vendor chờ đợi.
 *    Không mock cổng đó: nó là thứ duy nhất chặn "dán ra Figma thành frame rỗng".
 *  ② `cellsOfSheet` — lọc theo tấm. Panel nằm dưới chân MỘT block; kéo nhầm ô của
 *    tấm khác là nói dối về chỗ đứng.
 *  ③ `sheetVersions` — đánh số v1…vN và QUYỀN khôi phục. `#39` trả mới-nhất-trước,
 *    đánh số xuôi mảng là gọi "v1" cho bản vừa gen.
 */
import { describe, expect, it } from "vitest";
import { kitFileSchema, type KitFile } from "@/lib/types";
import {
  assertDocShape, buildFigmaNodeForAsset, renderSpec, FigmaNodeUnsupported,
} from "@/features/kit-core/lib/figma-node";
import type { H2DDocument } from "@/vendor/figma-h2d";
import { figmaNodeForSheet } from "../sheet-figma";
import { cellName, cellsOfSheet, contractFramed, rawSheetImagePath } from "../sheet-files";
import { currentVersion, sheetVersions } from "../sheet-versions";

/* ═════════ ① Spec cho CẢ TẤM ═════════ */

/** Khổ thật của một sheet ngang do engine sinh (`gen.sh`): 1536×1024. */
const SHEET_W = 1536;
const SHEET_H = 1024;

describe("figmaNodeForSheet — cả tấm là MỘT ảnh chữ nhật, không mượn safe zone của ô nào", () => {
  it("frame ≡ ảnh, đặt tại (0,0), clip tắt, nguồn canvas", () => {
    const spec = figmaNodeForSheet(SHEET_W, SHEET_H, "chinh-ui");
    expect(spec.frame).toEqual({ w: 1536, h: 1024 });
    expect(spec.image).toEqual({ x: 0, y: 0, w: 1536, h: 1024 });
    expect(spec.clipsContent).toBe(false);
    expect(spec.source).toBe("canvas");
    expect(spec.scale).toBe(1);
    expect(spec.name).toBe("chinh-ui");
  });

  it("tỉ lệ áp cho CẢ frame lẫn ảnh — không bao giờ lệch trục", () => {
    const spec = figmaNodeForSheet(SHEET_W, SHEET_H, "chinh-ui", { scale: 0.5 });
    expect(spec.frame).toEqual({ w: 768, h: 512 });
    expect(spec.image).toEqual({ x: 0, y: 0, w: 768, h: 512 });
  });

  it("chưa đo được cỡ ảnh ⇒ NÉM, không dựng frame 0×0", () => {
    expect(() => figmaNodeForSheet(0, SHEET_H, "chinh-ui")).toThrow(FigmaNodeUnsupported);
    expect(() => figmaNodeForSheet(Number.NaN, SHEET_H, "chinh-ui")).toThrow(/Chưa đo được cỡ thật/);
    expect(() => figmaNodeForSheet(SHEET_W, SHEET_H, "chinh-ui", { scale: 0 })).toThrow(/Tỉ lệ xuất/);
  });

  /**
   * Ca ĐẮT NHẤT: spec này có encode được không.
   *
   * `encodeFigmaNode` = `renderSpec` (dựng DOM) → vendor chụp → `assertDocShape` (soi IR).
   * Vendor cần trình duyệt thật để đo layout nên không chạy ở đây; hai đầu CÒN LẠI thì
   * chạy được, và chúng chính là hai chỗ spec sai sẽ lộ ra. Nên: dựng DOM thật bằng
   * `renderSpec`, đọc lại số từ chính DOM đó, rồi cho qua `assertDocShape` thật.
   */
  it("dựng được cây DOM đúng hợp đồng và đi qua cổng assertDocShape", () => {
    const spec = figmaNodeForSheet(SHEET_W, SHEET_H, "chinh-ui");
    const stage = document.createElement("div");
    document.body.appendChild(stage);
    try {
      const frame = renderSpec(spec, "blob:sheet", stage);
      expect(frame.tagName).toBe("DIV");
      expect(frame.getAttribute("aria-label")).toBe("chinh-ui");
      expect(frame.style.width).toBe("1536px");
      expect(frame.style.height).toBe("1024px");

      const img = frame.querySelector("img");
      expect(img).not.toBeNull();
      expect(img?.style.left).toBe("0px");
      expect(img?.style.top).toBe("0px");
      expect(img?.style.width).toBe("1536px");
      /* `max-width:none` — thiếu nó thì ảnh to hơn frame bị CSS co lại và dán ra sai cỡ. */
      expect(img?.style.maxWidth).toBe("none");
      /* Tấm thường không phải vật liệu cộng ⇒ KHÔNG được dính mix-blend-mode. */
      expect(img?.style.mixBlendMode).toBe("");

      const doc = docFrom(frame, spec.frame);
      expect(() => assertDocShape(doc, spec)).not.toThrow();
    } finally {
      stage.remove();
    }
  });

  it("frame đo được lệch spec ⇒ cổng vẫn ném (không có đường tắt nào cho cả tấm)", () => {
    const spec = figmaNodeForSheet(SHEET_W, SHEET_H, "chinh-ui");
    const stage = document.createElement("div");
    document.body.appendChild(stage);
    try {
      const frame = renderSpec(spec, "blob:sheet", stage);
      const doc = docFrom(frame, { w: SHEET_W + 40, h: SHEET_H });
      expect(() => assertDocShape(doc, spec)).toThrow(/lệch so với safe zone/);
    } finally {
      stage.remove();
    }
  });
});

/**
 * IR tối thiểu mà vendor sẽ sinh ra từ `frame`. jsdom không có layout engine nên
 * `getBoundingClientRect()` luôn trả 0 — số đo lấy từ tham số `measured`, đúng vai
 * "đây là thứ trình duyệt thật sẽ đo được".
 */
function docFrom(frame: HTMLElement, measured: { w: number; h: number }): H2DDocument {
  const img = frame.querySelector("img");
  return {
    root: {
      nodeType: 1, tag: "DIV",
      attributes: { "aria-label": frame.getAttribute("aria-label") ?? "" },
      styles: { overflow: "visible" },
      rect: { x: 0, y: 0, width: measured.w, height: measured.h },
      childNodes: [{
        nodeType: 1, tag: "IMG",
        rect: {
          x: Number.parseFloat(img?.style.left ?? "0"),
          y: Number.parseFloat(img?.style.top ?? "0"),
          width: Number.parseFloat(img?.style.width ?? "0"),
          height: Number.parseFloat(img?.style.height ?? "0"),
        },
      }],
    },
    documentRect: { x: 0, y: 0, width: measured.w, height: measured.h },
    viewportRect: { x: 0, y: 0, width: measured.w, height: measured.h },
    devicePixelRatio: 2, version: 2,
    assets: new Map([["blob:sheet", { url: "blob:sheet", blob: new Blob(["x"]) }]]),
  } as H2DDocument;
}

/* ═════════ ② Lọc ô theo tấm ═════════ */

function cell(file: string, sheet: string, over: Partial<KitFile> = {}): KitFile {
  return kitFileSchema.parse({
    file, path: `kits/chinh/${file}.png`, w: 512, h: 341, bytes: 100,
    sheet, cellIndex: null, ...over,
  });
}

describe("cellsOfSheet — panel của MỘT block chỉ được hiện ô của tấm đó", () => {
  const files = [
    cell("tight/01-btn-pill", "ui", { cellIndex: 1 }),
    cell("01-btn-pill", "ui", { cellIndex: 1 }),
    cell("tight/02-btn-ghost", "ui", { cellIndex: 0 }),
    cell("25-bg-home", "nen", { cellIndex: 0 }),
    cell("_empty-03", "ui", { cellIndex: 3 }),
    cell("tight/04-chip", "ui", { cellIndex: 4, empty: true }),
  ];

  it("bỏ ô của tấm khác", () => {
    expect(cellsOfSheet(files, "ui").map(cellName)).not.toContain("25-bg-home");
    expect(cellsOfSheet(files, "nen").map(cellName)).toEqual(["25-bg-home"]);
  });

  it("mỗi ô đúng MỘT lần — bản tight/ thắng bản canvas", () => {
    const names = cellsOfSheet(files, "ui").map(cellName);
    expect(names.filter((n) => n === "01-btn-pill")).toHaveLength(1);
    expect(cellsOfSheet(files, "ui").map((f) => f.file)).toContain("tight/01-btn-pill");
    expect(cellsOfSheet(files, "ui").map((f) => f.file)).not.toContain("01-btn-pill");
  });

  it("ô rỗng và chỗ trống `_empty` không phải thành phẩm", () => {
    const names = cellsOfSheet(files, "ui").map(cellName);
    expect(names).not.toContain("_empty-03");
    expect(names).not.toContain("04-chip");
  });

  it("xếp theo cellIndex — thứ tự khớp số ô trên khung xương", () => {
    expect(cellsOfSheet(files, "ui").map(cellName)).toEqual(["02-btn-ghost", "01-btn-pill"]);
  });

  it("tấm không có ô nào ⇒ mảng rỗng, không ném", () => {
    expect(cellsOfSheet(files, "khong-co")).toEqual([]);
    expect(cellsOfSheet([], "ui")).toEqual([]);
  });
});

/* ═════════ ②b Khung Figma = hộp HỢP ĐỒNG ═════════
   Số dưới đây chép NGUYÊN từ `kits/manifest.json` của dự án `test-e0d4`
   (`~/KitGen-dev/projects/test-e0d4`, tấm `chinh-ui`, lưới 2×2, ô 627×627), cắt lại
   bằng `slice.py` có `CONTENT_ALPHA = 4` — đúng ba ô mà chủ sản phẩm dán sang Figma
   và báo *"chất lượng crop kém hơn cũ, ảnh thì vuông … xong lại còn frame ko đúng
   safe zone"*.

   HAI CON SỐ PHẢI ĐỌC CÙNG NHAU, VÀ ĐÂY LÀ CHỖ CHÚNG TỪNG BỊ TRỘN:
     `safe`        = bbox α ≥ 128 do `slice.py:measure_cell` đo — ÔM CẢ TRANG TRÍ
                     (hoa góc, đèn lồng). Ô nút: 586×249.
     `contractSafe` = hộp mà prompt đã HỨA, tức thân element. Ô nút: 476×166, và QA
                     của chính nó đọc `sizeDeviation.maxEdgePx = 0` ⇒ model vẽ khớp.
   Lấy `safe` làm lõi ⇒ s = 0,157 và thân nút chỉ chiếm ~2/3 khung 112×39. */
describe("contractFramed — lõi để co là hộp HỢP ĐỒNG, không phải hộp đo được", () => {
  /**
   * Ô «01-button» của `test-e0d4`: người dùng chọn cỡ đầu ra 112×39, engine xin model
   * vẽ to gấp `drawScale` = 4,25 lần trong ô ⇒ hộp hợp đồng 476×166. Tỉ lệ co ĐÚNG
   * phải là 1/4,25 ≈ 0,235; lấy nhầm `safe` thì ra 0,157.
   */
  const button = cell("tight/01-button", "ui", {
    w: 591, h: 417, cellIndex: 0,
    canvas: [627, 627], content: [591, 417], contentAt: [34, 210],
    safe: [37, 212, 586, 249],
    contractSafe: [75, 230, 476, 166],
    outSize: [112, 39],
    drawScale: 4.25,
  });
  /** Cạnh chặt nhất là chiều cao: 39/166 < 112/476. */
  const S_BUTTON = 39 / 166;

  const avatar = cell("tight/03-avatar-frame", "ui", {
    w: 604, h: 574, cellIndex: 2,
    canvas: [627, 627], content: [604, 574], contentAt: [23, 0],
    safe: [35, 1, 590, 546],
    contractSafe: [69, 69, 488, 488],
    outSize: [195, 195],
    drawScale: 2.5,
  });

  it("tỉ lệ co = cỡ đầu ra ÷ hộp hợp đồng ⇒ khớp `drawScale` engine đã xin", () => {
    const out = contractFramed([button]);
    expect(out.scales.get(button.path)).toBeCloseTo(S_BUTTON, 6);
    /* Đây là câu chốt: `drawScale` là con số engine dùng để phóng hộp hợp đồng ra
       cho model vẽ, nên phép co ngược lại PHẢI xấp xỉ nghịch đảo của nó. Lệch quá
       1% là dấu hiệu lõi đang lấy nhầm hộp. */
    expect(out.scales.get(button.path)!).toBeCloseTo(1 / 4.25, 2);
    expect(out.fitted).toEqual([{ name: "01-button", percent: 23, w: 112, h: 39 }]);
    expect(out.measured).toEqual([]);
  });

  /**
   * ══ HỒI QUY TRỰC TIẾP CỦA BỆNH ĐANG CHỮA ═══════════════════════════════════
   * `safe` là một PHÉP ĐO trên ảnh model vừa vẽ: thêm một cái đèn lồng thò ra là nó
   * đổi. Nếu nó còn tham gia vào phép co thì cỡ khung ở Figma nhảy theo trang trí —
   * đúng thứ chủ sản phẩm nhìn thấy. Ca này bơm `safe` phình to gấp đôi và đòi tỉ lệ
   * ĐỨNG YÊN.
   */
  it("trang trí phình `safe` ra bao nhiêu cũng KHÔNG đổi tỉ lệ co", () => {
    const denLong = cell("tight/01-button", "ui", {
      ...button, safe: [0, 0, 627, 627],
    } as Partial<KitFile>);
    expect(contractFramed([denLong]).scales.get(denLong.path)).toBeCloseTo(S_BUTTON, 6);
    /* Và con số SAI mà bản trước trả về, ghi ra đây để không ai vô tình quay lại nó. */
    expect(Math.min(112 / 586, 39 / 249)).toBeCloseTo(0.1566, 4);
  });

  it("hộp ảo = cỡ đầu ra ÷ tỉ lệ, tâm trùng tâm HỘP HỢP ĐỒNG", () => {
    const safe = contractFramed([button]).files[0]!.safe!;
    /* 39/s = 166 ⇒ trục dọc khít đúng hộp hợp đồng; trục ngang nở ra 112/s ≈ 476,72
       và phần dư 0,72px chia đều hai bên quanh tâm x = 75 + 476/2 = 313. */
    expect(safe[2]).toBeCloseTo(112 / S_BUTTON, 6); // ≈ 476,718
    expect(safe[3]).toBeCloseTo(166, 6);
    expect(safe[0]).toBeCloseTo(313 - 112 / S_BUTTON / 2, 6); // ≈ 74,641
    expect(safe[1]).toBeCloseTo(230, 6);
  });

  /**
   * CA CHỐT: ba con số chủ sản phẩm sẽ đo lại trong Figma sau lượt sửa này.
   * Khung đúng cỡ đã chọn, ảnh `tight/` co theo cùng tỉ lệ, trang trí tràn RA NGOÀI
   * khung (lệch âm) thay vì bị tính vào trong.
   */
  it("nối vào `buildFigmaNodeForAsset` ⇒ khung 112×39, ảnh co còn ~139×98", () => {
    const out = contractFramed([button]);
    const spec = buildFigmaNodeForAsset(out.files[0]!, { scale: out.scales.get(button.path)! });
    expect(spec.frame.w).toBeCloseTo(112, 6);
    expect(spec.frame.h).toBeCloseTo(39, 6);
    expect(spec.image.w).toBeCloseTo(591 * S_BUTTON, 6); // ≈ 138,85
    expect(spec.image.h).toBeCloseTo(417 * S_BUTTON, 6); // ≈ 97,97
    expect(Math.round(spec.image.w)).toBe(139);
    expect(Math.round(spec.image.h)).toBe(98);
    /* Ảnh RỘNG hơn khung (139 > 112) và đặt lệch âm: phần thò ra chính là hoa + đèn
       lồng, và `clipsContent` tắt nên Figma không cắt chúng. */
    expect(spec.image.w).toBeGreaterThan(spec.frame.w);
    expect(spec.image.x).toBeCloseTo((34 - (313 - 112 / S_BUTTON / 2)) * S_BUTTON, 6); // ≈ −9,55
    expect(spec.image.y).toBeCloseTo((210 - 230) * S_BUTTON, 6); // ≈ −4,70
    expect(spec.clipsContent).toBe(false);
  });

  it("ô vuông: hộp ảo TRÙNG hộp hợp đồng, không dư trục nào", () => {
    const out = contractFramed([avatar]);
    expect(out.scales.get(avatar.path)).toBeCloseTo(195 / 488, 6);
    /* `toBeCloseTo` từng số chứ không `toEqual` cả mảng: hộp ảo đi qua một phép chia
       rồi một phép nhân, nên nó về đúng 488 sai số dấu phẩy động (487,99999999999994).
       Khoá bằng đẳng thức chính xác là khoá luôn cả thứ tự phép tính. */
    const safe = out.files[0]!.safe!;
    for (const [got, want] of [[safe[0], 69], [safe[1], 69], [safe[2], 488], [safe[3], 488]]) {
      expect(got!).toBeCloseTo(want!, 6);
    }
    expect(out.fitted).toEqual([{ name: "03-avatar-frame", percent: 40, w: 195, h: 195 }]);
  });

  /**
   * ══ `outSize` THẮNG `contractSafe` — HAI CON SỐ, HAI VIỆC ══════════════════
   * Cỡ người dùng chọn là CỠ ĐẦU RA; hộp hợp đồng thì CỐ Ý to hơn (xin model vẽ to
   * rồi thu nhỏ cho nét). Vắng `outSize` thì đích chính là hộp hợp đồng — mà lõi
   * cũng là nó, nên câu trả lời đúng là "không co gì cả", không phải một tỉ lệ bịa.
   */
  it("thiếu `outSize` (kit cắt bằng bản cũ) ⇒ khung = hộp hợp đồng, tỉ lệ 1", () => {
    const nut = cell("tight/01-button", "ui", {
      w: 591, h: 417, canvas: [627, 627], content: [591, 417], contentAt: [34, 210],
      safe: [37, 212, 586, 249], contractSafe: [75, 230, 476, 166],
    });
    const out = contractFramed([nut]);
    expect(out.scales.get(nut.path)).toBe(1);
    expect(out.files[0]!.safe).toEqual([75, 230, 476, 166]);
    expect(out.fitted).toEqual([]);
    expect(out.measured).toEqual([]);
  });

  it("`outSize` rác (một số, số 0) ⇒ rơi về hộp hợp đồng, không dựng khung 0×0", () => {
    for (const rac of [[112], [0, 39]]) {
      const nut = cell("tight/01-button", "ui", {
        w: 591, h: 417, canvas: [627, 627], content: [591, 417], contentAt: [34, 210],
        safe: [37, 212, 586, 249], contractSafe: [75, 230, 476, 166], outSize: rac,
      });
      expect(contractFramed([nut]).scales.get(nut.path)).toBe(1);
      expect(contractFramed([nut]).files[0]!.safe).toEqual([75, 230, 476, 166]);
    }
  });

  /**
   * ĐƯỜNG LÙI, và là lý do DUY NHẤT `safe` còn được đọc ở đây: kit cắt bằng bản
   * `slice.py` chưa ghi `contractSafe`. Hộp đo được không đúng bằng thân element,
   * nhưng nó là thứ duy nhất còn lại — và co theo nó vẫn hơn dán nguyên px gốc.
   */
  it("có `outSize` mà THIẾU `contractSafe` ⇒ lõi lùi về `safe` đo được", () => {
    const nut = cell("tight/01-button", "ui", {
      w: 591, h: 417, canvas: [627, 627], content: [591, 417], contentAt: [34, 210],
      safe: [37, 212, 586, 249], outSize: [120, 120],
    });
    const out = contractFramed([nut]);
    expect(out.measured).toEqual([]);
    expect(out.scales.get(nut.path)).toBeCloseTo(120 / 586, 6);
  });

  it("cỡ đầu ra TO hơn hộp hợp đồng ⇒ giãn lên chứ không bỏ mặc — cùng một công thức", () => {
    const nho = cell("tight/02-chip", "ui", {
      w: 100, h: 100, canvas: [627, 627], content: [100, 100], contentAt: [10, 10],
      safe: [10, 10, 100, 100], contractSafe: [0, 0, 100, 100], outSize: [200, 150],
    });
    const out = contractFramed([nho]);
    expect(out.scales.get(nho.path)).toBeCloseTo(1.5, 6); // min(200/100, 150/100)
    const spec = buildFigmaNodeForAsset(out.files[0]!, { scale: out.scales.get(nho.path)! });
    expect(spec.frame.w).toBeCloseTo(200, 6);
    expect(spec.frame.h).toBeCloseTo(150, 6);
    expect(spec.image.w).toBeCloseTo(150, 6);
  });

  it("cỡ đầu ra ĐÚNG BẰNG hộp hợp đồng ⇒ tỉ lệ 1 và KHÔNG báo gì", () => {
    const khit = cell("tight/03-ok", "ui", {
      w: 50, h: 50, canvas: [627, 627], content: [50, 50], contentAt: [5, 5],
      safe: [5, 5, 90, 90], contractSafe: [0, 0, 100, 100], outSize: [100, 100],
    });
    const out = contractFramed([khit]);
    expect(out.scales.get(khit.path)).toBe(1);
    expect(out.fitted).toEqual([]); // không ai muốn đọc «đã co về 100%»
  });

  it("có hộp hợp đồng nhưng KHÔNG đo được lõi ⇒ khung = hộp hợp đồng, tỉ lệ 1", () => {
    const khongLoi = cell("tight/04-mo", "ui", { contractSafe: [75, 230, 476, 166] });
    const out = contractFramed([khongLoi]);
    expect(out.files[0]!.safe).toEqual([75, 230, 476, 166]);
    expect(out.scales.get(khongLoi.path)).toBe(1);
    expect(out.fitted).toEqual([]);
    expect(out.measured).toEqual([]);
  });

  it("thiếu `contractSafe` và cả `outSize` ⇒ giữ lõi đo được, tỉ lệ 1, VÀ nói ra tên ô", () => {
    const old = cell("tight/03-avatar-frame", "ui", { safe: [35, 1, 590, 546] });
    const out = contractFramed([old]);
    expect(out.files[0]!.safe).toEqual([35, 1, 590, 546]);
    expect(out.measured).toEqual(["03-avatar-frame"]);
    /* Tỉ lệ 1 chứ KHÔNG phải quy ước 50% của màn kit cũ: màn này vẫn hứa 1:1 cho ô
       không đo được, và `scaleOf` sẽ lặng lẽ chia đôi nếu để nó tự quyết. */
    expect(out.scales.get(old.path)).toBe(1);
  });

  it("`contractSafe` rác (thiếu số, cạnh 0) ⇒ coi như không có, không dựng khung 0×0", () => {
    for (const rac of [[75, 230], [75, 230, 0, 166]]) {
      const out = contractFramed([cell("tight/x", "ui", { safe: [1, 2, 3, 4], contractSafe: rac })]);
      expect(out.files[0]!.safe).toEqual([1, 2, 3, 4]);
      expect(out.measured).toEqual(["x"]);
    }
  });

  it("KHÔNG sửa gốc — mảng vào ra là hai object khác nhau", () => {
    const out = contractFramed([avatar]);
    expect(avatar.safe).toEqual([35, 1, 590, 546]);
    expect(out.files[0]).not.toBe(avatar);
  });

  it("mỗi ô một tỉ lệ RIÊNG — một số chung cho cả tấm là dựng lại đúng cái sai vừa gỡ", () => {
    const out = contractFramed([button, avatar]);
    expect(out.scales.get(button.path)!).not.toBeCloseTo(out.scales.get(avatar.path)!, 3);
    expect(out.scales.get(avatar.path)).toBeCloseTo(195 / 488, 6);
    expect(out.fitted.map((f) => f.name)).toEqual(["01-button", "03-avatar-frame"]);
  });

  it("KHÔNG đổi quy ước 50% của màn kit cũ: không truyền tỉ lệ ⇒ vẫn là `scaleOf`", () => {
    const spec = buildFigmaNodeForAsset(contractFramed([avatar]).files[0]!);
    expect(spec.scale).toBe(0.5);
  });
});

describe("đường dẫn ảnh — runs/ là bản BẤT BIẾN, raw/ là bản bị ghi đè", () => {
  it("không có runId ⇒ raw/<job>.png", () => {
    expect(rawSheetImagePath("chinh-ui")).toBe("raw/chinh-ui.png");
    expect(rawSheetImagePath("chinh-ui", null)).toBe("raw/chinh-ui.png");
    expect(rawSheetImagePath("chinh-ui", "")).toBe("raw/chinh-ui.png");
  });

  it("có runId ⇒ artifact của đúng lượt đó", () => {
    expect(rawSheetImagePath("chinh-ui", "r-42")).toBe("runs/r-42/artifacts/chinh-ui.png");
  });

  it("thiếu tên lượt vẽ ⇒ ném ngay, không dựng đường dẫn cụt", () => {
    expect(() => rawSheetImagePath("")).toThrow(/thiếu tên lượt vẽ/);
  });

  /* Ca «khung xương đọc từ thư mục skeleton/» ĐÃ BỎ cùng `skeletonImagePath` —
     engine thôi dựng ảnh khung xương, xem chú thích trong `sheet-files.ts`. */
});

/* ═════════ ③ Phiên bản ═════════ */

describe("sheetVersions — v LỚN NHẤT là bản MỚI NHẤT", () => {
  /** Đúng hình dạng `#39` trả về: đã sort giảm dần theo `at`, bản hiện hành id `current`. */
  const items = [
    { id: "current", at: "2026-08-24T10:00:00.000Z", bytes: 300, current: true },
    { id: "r-1756000000000", at: "2026-08-24T09:00:00.000Z", bytes: 280, current: false },
    { id: "r-1755000000000", at: "2026-08-23T09:00:00.000Z", bytes: 260, current: false },
  ];

  it("bản mới nhất mang số lớn nhất", () => {
    expect(sheetVersions(items).map((v) => v.label)).toEqual(["v3", "v2", "v1"]);
  });

  it("bản đang dùng KHÔNG khôi phục được — #40 sẽ 404 vì không có file lịch sử nào tên @current", () => {
    const [now] = sheetVersions(items);
    expect(now?.current).toBe(true);
    expect(now?.restorable).toBe(false);
    expect(currentVersion(sheetVersions(items))?.id).toBe("current");
  });

  it("bản lịch sử thật thì khôi phục được", () => {
    expect(sheetVersions(items).filter((v) => v.restorable).map((v) => v.label)).toEqual(["v2", "v1"]);
  });

  it("id lạ ⇒ nút phải im, vì #40 chỉ nhận dạng r-<số>", () => {
    const odd = sheetVersions([{ id: "restore-1756000000000", at: null, current: false }]);
    expect(odd[0]?.restorable).toBe(false);
  });

  it("chưa gen lần nào ⇒ không có phiên bản nào, không ném", () => {
    expect(sheetVersions([])).toEqual([]);
    expect(sheetVersions(undefined)).toEqual([]);
    expect(currentVersion([])).toBeNull();
  });
});
