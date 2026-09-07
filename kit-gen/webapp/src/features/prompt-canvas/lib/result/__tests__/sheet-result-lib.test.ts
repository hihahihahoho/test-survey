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
   Số dưới đây chép NGUYÊN từ `kits/manifest.json` thật của dự án `test`
   (`~/KitGen-dev/projects/test-e0d4`, tấm `ui` 2×2 trên canvas vuông) — đúng ba ô
   mà chủ sản phẩm chụp màn Figma và đo được frame 151,5×131,5. */
describe("contractFramed — khung là cỡ ĐÃ CHỌN, không phải lõi model vẽ ra", () => {
  const avatar = cell("tight/03-avatar-frame", "ui", {
    w: 392, h: 328, cellIndex: 2,
    canvas: [853, 853], content: [392, 328], contentAt: [233, 253],
    safe: [276, 294, 303, 263],
    contractSafe: [301, 332, 251, 188],
  });

  /**
   * Ô «01-button» mà chủ sản phẩm dán thử và đo được ở Figma: xin 195×195, model
   * trả về lõi 263×262. Đây là ca ĐIỂN HÌNH, không phải ca hỏng — máy vẽ không bao
   * giờ vẽ đúng pixel, nên mọi con số dưới đây là con số của một lượt vẽ BÌNH THƯỜNG.
   */
  const button = cell("tight/01-button", "ui", {
    w: 392, h: 328, cellIndex: 0,
    canvas: [853, 853], content: [392, 328], contentAt: [233, 253],
    safe: [276, 294, 263, 262],
    contractSafe: [301, 332, 195, 195],
  });
  /** `s` của ô nút: chiều cao là cạnh chặt hơn (195/262 < 195/263). */
  const S_BUTTON = 195 / 263;

  it("lõi to hơn hộp ⇒ tỉ lệ co = cạnh CHẶT NHẤT, và nói ra bằng phần trăm", () => {
    const out = contractFramed([button]);
    expect(out.scales.get(button.path)).toBeCloseTo(S_BUTTON, 6);
    expect(out.fitted).toEqual([{ name: "01-button", percent: 74, w: 195, h: 195 }]);
    expect(out.measured).toEqual([]);
  });

  it("hộp ảo = hộp hợp đồng ÷ tỉ lệ, tâm trùng tâm lõi ⇒ trục dư chia đều hai bên", () => {
    const safe = contractFramed([button]).files[0]!.safe!;
    /* 195/s = 263 ⇒ hộp ảo vuông 263: trục ngang khít đúng lõi (263), trục dọc dư
       1px so với lõi 262 nên lõi lùi xuống nửa pixel. */
    expect(safe[2]).toBeCloseTo(263, 6);
    expect(safe[3]).toBeCloseTo(263, 6);
    expect(safe[0]).toBeCloseTo(276, 6);
    expect(safe[1]).toBeCloseTo(293.5, 6);
  });

  /**
   * CA CHỐT của cả lượt sửa này: ba con số mà chủ sản phẩm sẽ đo lại trong Figma.
   * Khung đúng cỡ đã chọn, ảnh co theo cùng một tỉ lệ, lệch âm giữ nguyên hướng.
   */
  it("nối vào `buildFigmaNodeForAsset` ⇒ khung 195×195, ảnh co còn ~291×243", () => {
    const out = contractFramed([button]);
    const spec = buildFigmaNodeForAsset(out.files[0]!, { scale: out.scales.get(button.path)! });
    expect(spec.frame.w).toBeCloseTo(195, 6);
    expect(spec.frame.h).toBeCloseTo(195, 6);
    expect(spec.image.w).toBeCloseTo(392 * S_BUTTON, 6); // ≈ 290,6
    expect(spec.image.h).toBeCloseTo(328 * S_BUTTON, 6); // ≈ 243,2
    expect(Math.round(spec.image.w)).toBe(291);
    expect(Math.round(spec.image.h)).toBe(243);
    /* Ảnh vẫn đặt lệch `content_at − safe`, nay ĐÃ NHÂN tỉ lệ ⇒ trang trí tràn ra
       ngoài khung đúng chỗ thay vì tràn theo px gốc. */
    expect(spec.image.x).toBeCloseTo((233 - 276) * S_BUTTON, 6);
    expect(spec.image.y).toBeCloseTo((253 - 293.5) * S_BUTTON, 6);
    expect(spec.clipsContent).toBe(false);
  });

  /**
   * ══ `outSize` THẮNG `contractSafe` — HAI CON SỐ, HAI VIỆC ══════════════════
   *
   * Luật chủ sản phẩm chốt: cỡ người dùng chọn là CỠ ĐẦU RA, còn máy vẽ luôn được
   * xin vẽ to hết ô (max-fit) để tối đa độ phân giải. Nên `contractSafe` CỐ Ý to hơn
   * `outSize` và chỉ còn là số đo QA; lấy nhầm nó làm đích là dán ra Figma một ô to
   * hơn cỡ người dùng đã chọn — đúng loại sai mà không ai nhìn ra ngay.
   */
  it("có `outSize` ⇒ co về CỠ ĐẦU RA, không phải hộp max-fit trong ô", () => {
    const nut = cell("tight/01-button", "ui", {
      w: 392, h: 328, canvas: [853, 853], content: [392, 328], contentAt: [233, 253],
      safe: [276, 294, 263, 262],
      contractSafe: [301, 332, 195, 195],
      outSize: [120, 120],
    });
    const out = contractFramed([nut]);
    const s = 120 / 263; // min(120/263, 120/262) — cạnh chặt nhất
    expect(out.scales.get(nut.path)).toBeCloseTo(s, 6);
    expect(out.fitted).toEqual([{ name: "01-button", percent: 46, w: 120, h: 120 }]);

    const spec = buildFigmaNodeForAsset(out.files[0]!, { scale: out.scales.get(nut.path)! });
    expect(spec.frame.w).toBeCloseTo(120, 6);
    expect(spec.frame.h).toBeCloseTo(120, 6);
    expect(spec.image.w).toBeCloseTo(392 * s, 6);
  });

  it("`outSize` rác (một số, số 0) ⇒ rơi về `contractSafe`, không dựng khung 0×0", () => {
    for (const rac of [[120], [0, 120]]) {
      const nut = cell("tight/01-button", "ui", {
        w: 392, h: 328, canvas: [853, 853], content: [392, 328], contentAt: [233, 253],
        safe: [276, 294, 263, 262], contractSafe: [301, 332, 195, 195], outSize: rac,
      });
      expect(contractFramed([nut]).scales.get(nut.path)).toBeCloseTo(S_BUTTON, 6);
    }
  });

  it("có `outSize` mà THIẾU `contractSafe` (kit mới, hộp QA vắng) ⇒ vẫn co đúng", () => {
    const nut = cell("tight/01-button", "ui", {
      w: 392, h: 328, canvas: [853, 853], content: [392, 328], contentAt: [233, 253],
      safe: [276, 294, 263, 262], outSize: [120, 120],
    });
    const out = contractFramed([nut]);
    expect(out.measured).toEqual([]);
    expect(out.scales.get(nut.path)).toBeCloseTo(120 / 263, 6);
  });

  it("lõi NHỎ hơn hộp ⇒ giãn lên chứ không bỏ mặc — cùng một công thức", () => {
    const nho = cell("tight/02-chip", "ui", {
      w: 100, h: 100, canvas: [853, 853], content: [100, 100], contentAt: [10, 10],
      safe: [10, 10, 100, 100], contractSafe: [0, 0, 200, 150],
    });
    const out = contractFramed([nho]);
    expect(out.scales.get(nho.path)).toBeCloseTo(1.5, 6); // min(200/100, 150/100)
    const spec = buildFigmaNodeForAsset(out.files[0]!, { scale: out.scales.get(nho.path)! });
    expect(spec.frame.w).toBeCloseTo(200, 6);
    expect(spec.frame.h).toBeCloseTo(150, 6);
    expect(spec.image.w).toBeCloseTo(150, 6);
  });

  it("lõi ĐÃ khít hộp ⇒ tỉ lệ 1 và KHÔNG báo gì (không ai muốn đọc «đã co về 100%»)", () => {
    const khit = cell("tight/03-ok", "ui", {
      w: 50, h: 50, canvas: [853, 853], content: [50, 50], contentAt: [5, 5],
      safe: [5, 5, 100, 100], contractSafe: [0, 0, 100, 100],
    });
    const out = contractFramed([khit]);
    expect(out.scales.get(khit.path)).toBe(1);
    expect(out.fitted).toEqual([]);
  });

  it("có hộp hợp đồng nhưng KHÔNG đo được lõi ⇒ khung = hộp hợp đồng, tỉ lệ 1", () => {
    const khongLoi = cell("tight/04-mo", "ui", { contractSafe: [301, 332, 251, 188] });
    const out = contractFramed([khongLoi]);
    expect(out.files[0]!.safe).toEqual([301, 332, 251, 188]);
    expect(out.scales.get(khongLoi.path)).toBe(1);
    expect(out.fitted).toEqual([]);
    expect(out.measured).toEqual([]);
  });

  it("thiếu `contractSafe` (kit cắt bằng bản cũ) ⇒ giữ lõi đo được, tỉ lệ 1, VÀ nói ra tên ô", () => {
    const old = cell("tight/03-avatar-frame", "ui", { safe: [276, 294, 303, 263] });
    const out = contractFramed([old]);
    expect(out.files[0]!.safe).toEqual([276, 294, 303, 263]);
    expect(out.measured).toEqual(["03-avatar-frame"]);
    /* Tỉ lệ 1 chứ KHÔNG phải quy ước 50% của màn kit cũ: màn này vẫn hứa 1:1 cho ô
       không đo được, và `scaleOf` sẽ lặng lẽ chia đôi nếu để nó tự quyết. */
    expect(out.scales.get(old.path)).toBe(1);
  });

  it("`contractSafe` rác (thiếu số, cạnh 0) ⇒ coi như không có, không dựng khung 0×0", () => {
    for (const rac of [[301, 332], [301, 332, 0, 188]]) {
      const out = contractFramed([cell("tight/x", "ui", { safe: [1, 2, 3, 4], contractSafe: rac })]);
      expect(out.files[0]!.safe).toEqual([1, 2, 3, 4]);
      expect(out.measured).toEqual(["x"]);
    }
  });

  it("KHÔNG sửa gốc — mảng vào ra là hai object khác nhau", () => {
    const out = contractFramed([avatar]);
    expect(avatar.safe).toEqual([276, 294, 303, 263]);
    expect(out.files[0]).not.toBe(avatar);
  });

  it("mỗi ô một tỉ lệ RIÊNG — một số chung cho cả tấm là dựng lại đúng cái sai vừa gỡ", () => {
    const out = contractFramed([button, avatar]);
    const sButton = out.scales.get(button.path)!;
    const sAvatar = out.scales.get(avatar.path)!;
    expect(sButton).not.toBeCloseTo(sAvatar, 3);
    expect(sAvatar).toBeCloseTo(Math.min(251 / 303, 188 / 263), 6);
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
