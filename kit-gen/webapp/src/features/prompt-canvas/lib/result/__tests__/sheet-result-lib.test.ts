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
import { cellName, cellsOfSheet, contractFramed, rawSheetImagePath, sheetDownloadName } from "../sheet-files";
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

  /**
   * ══ HAI TẤM CỦA CÙNG MỘT THẺ KHÔNG ĐƯỢC ĐÈ NHAU ═════════════════════════
   * Từ 14/09/2026 một thẻ Bộ UI chia tấm theo nấc «tối đa mỗi tấm», nên `ui` và
   * `ui2` là chuyện THƯỜNG chứ không còn là ca hiếm của một thẻ 20 món. Hai chỗ
   * dễ đè nhau nhất đều nằm ngay đây: danh sách ô đem dán sang Figma, và TÊN
   * node/tệp tải về. `ui` là TIỀN TỐ của `ui2`, nên một phép lọc bằng
   * `startsWith` sẽ kéo ô của tấm sau vào tấm trước — im lặng và đúng một nửa.
   */
  it("`ui` và `ui2` là hai tấm RIÊNG — không tấm nào nuốt ô của tấm kia", () => {
    const two = [
      cell("tight/01-btn-pill", "ui", { cellIndex: 0 }),
      cell("tight/05-popover", "ui2", { cellIndex: 0 }),
      cell("tight/06-trophy", "ui2", { cellIndex: 1 }),
    ];
    expect(cellsOfSheet(two, "ui").map(cellName)).toEqual(["01-btn-pill"]);
    expect(cellsOfSheet(two, "ui2").map(cellName)).toEqual(["05-popover", "06-trophy"]);
  });

  it("node Figma của hai tấm mang HAI TÊN — dán ra không chồng lên nhau", () => {
    const one = figmaNodeForSheet(SHEET_W, SHEET_H, "chinh-ui");
    const two = figmaNodeForSheet(SHEET_W, SHEET_H, "chinh-ui2");
    expect(one.name).toBe("chinh-ui");
    expect(two.name).toBe("chinh-ui2");
    expect(one.name).not.toBe(two.name);
    /* Tên tệp tải về đi cùng một tên job, nên nó cũng tách đôi theo. */
    expect(sheetDownloadName("chinh-ui")).not.toBe(sheetDownloadName("chinh-ui2"));
  });
});

/* ═════════ ②b Lõi để co: CHỌN THEO BẰNG CHỨNG ═════════
   Số dưới đây chép NGUYÊN từ hai manifest thật, và chúng KHÔNG đồng ý với nhau —
   đó chính là lý do luật phải đo chứ không được chọn sẵn một hộp:

     · `test-e0d4/chinh-ui` (ô 627×627, cắt bằng `slice.py` có `CONTENT_ALPHA = 4`):
       hộp hứa khớp thân nút (`sizeDeviation.maxEdgePx = 0`), nhưng lõi đo được
       586×249 ôm cả hoa lẫn đèn lồng. Lấy hộp hứa làm lõi ⇒ ảnh dán ra 139×98 nằm
       trong một khung 112×39.
     · `test-vcb-d6fd/chinh-ui`, lượt r-0021: prompt dặn model "stays inside
       x=0..627" nên model vẽ TO HẾT Ô, hộp hứa thành hư cấu. Lấy hộp hứa làm lõi ⇒
       03-progress ra ảnh 462×103 trong khung 270×57 và đè lên ô bên cạnh.

   LUẬT: mỗi cạnh, phần lõi đo được thò ra ngoài hộp hứa ≤ max(15px, 10% cạnh hứa)
   ⇒ hộp hứa ĐƯỢC CHỨNG THỰC, lõi = hộp hứa. Quá dung sai ⇒ lõi = hộp đo được và
   nói ra tên ô. 15px = `SIZE_DEVIATION_THRESHOLD_PX` của `slice.py`. */
describe("contractFramed — hộp hứa chỉ được làm lõi khi ẢNH CHỨNG THỰC nó", () => {
  /* ── Ô THẬT của lượt r-0021: máy vẽ to hơn hộp đã hứa ───────────────────── */
  const nutR = cell("tight/01-button", "ui", {
    w: 592, h: 176, cellIndex: 0,
    canvas: [627, 627], content: [592, 176], contentAt: [34, 274],
    safe: [38, 281, 587, 168],
    contractSafe: [129, 249, 368, 128],
    outSize: [245, 85],
    drawScale: 1.5,
  });
  const avatarR = cell("tight/02-avatar-frame", "ui", {
    w: 559, h: 513, cellIndex: 1,
    canvas: [627, 627], content: [559, 513], contentAt: [39, 106],
    safe: [49, 134, 538, 461],
    contractSafe: [143, 143, 341, 341],
    outSize: [195, 195],
    drawScale: 1.75,
  });
  const progressR = cell("tight/03-progress", "ui", {
    w: 579, h: 129, cellIndex: 2,
    canvas: [627, 627], content: [579, 129], contentAt: [32, 233],
    safe: [34, 236, 575, 124],
    contractSafe: [144, 278, 338, 71],
    outSize: [270, 57],
    drawScale: 1.25,
  });

  /* ── Ô THẬT của `test-e0d4`: hộp hứa khớp thân, nhưng trang trí tràn 39% ── */
  const nutE0D4 = cell("tight/01-button", "ui", {
    w: 591, h: 417, cellIndex: 0,
    canvas: [627, 627], content: [591, 417], contentAt: [34, 210],
    safe: [37, 212, 586, 249],
    contractSafe: [75, 230, 476, 166],
    outSize: [112, 39],
    drawScale: 4.25,
  });

  /**
   * ── Ô ĐƯỢC CHỨNG THỰC: cùng hộp hứa của `test-e0d4`, nhưng trang trí chỉ là một
   * quầng sáng 40px hai bên (8,4% của 476 — dưới dung sai 47,6) và 15px trên dưới
   * (đúng vạch 16,6 của cạnh 166). Đây là hình dạng mà nhánh "giữ hộp hứa" phục vụ:
   * thân lấp khung, quầng sáng tràn ra ngoài đúng như thiết kế muốn.
   */
  const nutHua = cell("tight/01-button", "ui", {
    ...nutE0D4, safe: [35, 215, 556, 196],
  } as Partial<KitFile>);
  /** Cạnh chặt nhất là chiều cao: 39/166 < 112/476. */
  const S_HUA = 39 / 166;

  const avatarHua = cell("tight/03-avatar-frame", "ui", {
    w: 604, h: 574, cellIndex: 2,
    canvas: [627, 627], content: [604, 574], contentAt: [23, 0],
    safe: [35, 35, 556, 556],
    contractSafe: [69, 69, 488, 488],
    outSize: [195, 195],
    drawScale: 2.5,
  });

  /* ═══ Nhánh 1: hộp hứa được chứng thực ═══ */

  it("tràn trong dung sai ⇒ lõi = hộp hứa, tỉ lệ khớp `drawScale` engine đã xin", () => {
    const out = contractFramed([nutHua]);
    expect(out.scales.get(nutHua.path)).toBeCloseTo(S_HUA, 6);
    /* `drawScale` là con số engine dùng để phóng hộp hứa ra cho model vẽ, nên phép
       co ngược lại PHẢI xấp xỉ nghịch đảo của nó. Lệch quá 1% là dấu hiệu lõi đang
       lấy nhầm hộp. */
    expect(out.scales.get(nutHua.path)!).toBeCloseTo(1 / 4.25, 2);
    expect(out.fitted).toEqual([{ name: "01-button", percent: 23, w: 112, h: 39 }]);
    expect(out.wholeFitted).toEqual([]);
    expect(out.measured).toEqual([]);
  });

  it("hộp ảo = cỡ đầu ra ÷ tỉ lệ, tâm trùng tâm HỘP HỨA", () => {
    const safe = contractFramed([nutHua]).files[0]!.safe!;
    /* 39/s = 166 ⇒ trục dọc khít đúng hộp hứa; trục ngang nở ra 112/s ≈ 476,72 và
       phần dư 0,72px chia đều hai bên quanh tâm x = 75 + 476/2 = 313. */
    expect(safe[2]).toBeCloseTo(112 / S_HUA, 6); // ≈ 476,718
    expect(safe[3]).toBeCloseTo(166, 6);
    expect(safe[0]).toBeCloseTo(313 - 112 / S_HUA / 2, 6); // ≈ 74,641
    expect(safe[1]).toBeCloseTo(230, 6);
  });

  it("giữ hộp hứa ⇒ khung 112×39, ảnh 139×98, trang trí tràn RA NGOÀI khung", () => {
    const out = contractFramed([nutHua]);
    const spec = buildFigmaNodeForAsset(out.files[0]!, { scale: out.scales.get(nutHua.path)! });
    expect(spec.frame.w).toBeCloseTo(112, 6);
    expect(spec.frame.h).toBeCloseTo(39, 6);
    expect(Math.round(spec.image.w)).toBe(139);
    expect(Math.round(spec.image.h)).toBe(98);
    /* Phần thò ra là quầng sáng + sương α < 128, và `clipsContent` tắt nên Figma
       không cắt chúng. Nhưng phần ĐỤC thì có trần: 556 × s = 130,6 ≤ 1,2 × 112. */
    expect(556 * S_HUA).toBeLessThanOrEqual(112 * 1.2);
    expect(spec.image.x).toBeCloseTo((34 - (313 - 112 / S_HUA / 2)) * S_HUA, 6); // ≈ −9,55
    expect(spec.image.y).toBeCloseTo((210 - 230) * S_HUA, 6); // ≈ −4,70
    expect(spec.clipsContent).toBe(false);
  });

  it("ô vuông được chứng thực: hộp ảo TRÙNG hộp hứa, không dư trục nào", () => {
    const out = contractFramed([avatarHua]);
    expect(out.scales.get(avatarHua.path)).toBeCloseTo(195 / 488, 6);
    /* `toBeCloseTo` từng số chứ không `toEqual` cả mảng: hộp ảo đi qua một phép chia
       rồi một phép nhân, nên nó về đúng 488 sai số dấu phẩy động (487,99999999999994). */
    const safe = out.files[0]!.safe!;
    for (const [got, want] of [[safe[0], 69], [safe[1], 69], [safe[2], 488], [safe[3], 488]]) {
      expect(got!).toBeCloseTo(want!, 6);
    }
    expect(out.fitted).toEqual([{ name: "03-avatar-frame", percent: 40, w: 195, h: 195 }]);
    expect(out.wholeFitted).toEqual([]);
  });

  /* ═══ Nhánh 2: hộp hứa là hư cấu ⇒ co CẢ MÓN ═══ */

  /**
   * CA CHỐT của lượt sửa này — ba con số chủ sản phẩm đo được ở lượt r-0021.
   * Lõi đo được 587px thò ra khỏi hộp hứa 368px những 91px bên trái (24,7%, gấp 2,5
   * lần dung sai 36,8) ⇒ hộp hứa không có gì chứng thực, lõi = hộp đo được.
   */
  it("r-0021 «01-button»: lõi = hộp ĐO ĐƯỢC, khung 245×85, lõi lấp đúng bề ngang khung", () => {
    const out = contractFramed([nutR]);
    const s = out.scales.get(nutR.path)!;
    expect(s).toBeCloseTo(245 / 587, 6); // ≈ 0,4174 — trục ngang là trục chặt
    /* Luật cũ (lõi = hộp hứa) cho 245/368 = 0,666 ⇒ ảnh rộng 394px trong khung 245.
       Ghi ra đây để không ai vô tình quay lại nó. */
    expect(592 * (245 / 368)).toBeGreaterThan(245 * 1.5);

    const spec = buildFigmaNodeForAsset(out.files[0]!, { scale: s });
    expect(spec.frame.w).toBeCloseTo(245, 6);
    expect(spec.frame.h).toBeCloseTo(85, 6);
    /* Trục co: lõi đục 587 × s = ĐÚNG 245 — cả món ôm khít bề ngang khung. */
    expect(587 * s).toBeCloseTo(245, 6);
    /* Ảnh `tight/` chỉ vượt khung ĐÚNG phần sương α < 128 (592 − 587 = 5px). */
    expect(spec.image.w - spec.frame.w).toBeCloseTo((592 - 587) * s, 6); // ≈ 2,09
    expect(spec.image.w).toBeCloseTo(247.09, 2);
    /* Trục còn lại nằm gọn trong khung, căn giữa. */
    expect(spec.image.h).toBeCloseTo(73.46, 2);
    expect(spec.image.h).toBeLessThan(spec.frame.h);
    expect(out.fitted).toEqual([{ name: "01-button", percent: 42, w: 245, h: 85 }]);
  });

  it("r-0021: hai ô từng ĐÈ nhau nay cùng ôm vào khung của mình", () => {
    const out = contractFramed([avatarR, progressR]);
    const sA = out.scales.get(avatarR.path)!;
    const sP = out.scales.get(progressR.path)!;
    /* Luật cũ: avatar ra ảnh 320×293 trong khung 195×195, progress ra 462×103 trong
       khung 270×57 — đó là lúc ô nọ phủ lên ô kia trên bàn Figma. */
    expect(559 * (195 / 341)).toBeGreaterThan(195 * 1.6);
    expect(579 * (270 / 338)).toBeGreaterThan(270 * 1.7);
    /* Luật mới: lõi đục khít cạnh chặt, ảnh chỉ dôi ra phần sương. */
    expect(538 * sA).toBeCloseTo(195, 6);
    expect(559 * sA - 195).toBeCloseTo((559 - 538) * sA, 6); // ≈ 7,6px sương
    expect(124 * sP).toBeCloseTo(57, 6);
    expect(579 * sP).toBeLessThan(270 * 1.05);
  });

  /**
   * ══ CA `test-e0d4` ĐỔI KẾT QUẢ SO VỚI LUẬT CŨ — NÓI THẲNG ═════════════════
   * Cạnh dưới tràn 65px trên hộp hứa cao 166 (39%), gấp gần 4 lần dung sai 16,6 ⇒
   * theo luật mới ô này rơi vào nhánh "co cả món": thân nút lại chỉ chiếm ~2/3
   * khung 112×39 như lời than cũ. ĐÂY LÀ MỘT ĐÁNH ĐỔI CÓ CHỦ Ý, không phải sót:
   * cái giá của luật cũ là ảnh 139×98 trong khung cao 39 — thò 30px trên và dưới,
   * tức đúng cái "ô đè ô" mà lượt r-0021 phải trả. Thuốc thật cho ca này nằm ở
   * prompt (dặn model hộp hứa thay vì cả ô), không nằm ở phép co.
   */
  it("test-e0d4 «01-button» tràn 39% cạnh dưới ⇒ QUÁ dung sai, co cả món (đổi so với luật cũ)", () => {
    const out = contractFramed([nutE0D4]);
    expect(out.scales.get(nutE0D4.path)).toBeCloseTo(39 / 249, 6); // ≈ 0,1566
    expect(out.scales.get(nutE0D4.path)).not.toBeCloseTo(39 / 166, 3); // luật cũ: 0,2349
    expect(out.wholeFitted).toEqual([
      { name: "01-button", reason: "máy vẽ to hơn hộp đã hứa, đã co cả món vào khung" },
    ]);
    const spec = buildFigmaNodeForAsset(out.files[0]!, { scale: out.scales.get(nutE0D4.path)! });
    expect(spec.frame.w).toBeCloseTo(112, 6);
    expect(spec.frame.h).toBeCloseTo(39, 6);
    /* Cả món nằm gọn bề ngang khung; chỉ sương α < 128 dôi theo chiều dọc. */
    expect(spec.image.w).toBeLessThan(spec.frame.w);
    expect(586 * (39 / 249)).toBeLessThan(112);
  });

  /* ═══ Vạch dung sai ═══ */

  it("tràn ĐÚNG vạch dung sai ⇒ vẫn là hộp hứa; hơn một pixel ⇒ co cả món", () => {
    const base = {
      w: 300, h: 300, canvas: [627, 627], content: [300, 300], contentAt: [80, 80],
      contractSafe: [100, 100, 200, 200], outSize: [100, 100],
    };
    /* Hộp hứa 200px ⇒ dung sai = max(15, 20) = 20px mỗi cạnh. */
    const dung = cell("tight/01-vach", "ui", { ...base, safe: [80, 80, 240, 240] });
    expect(contractFramed([dung]).scales.get(dung.path)).toBeCloseTo(100 / 200, 6);
    expect(contractFramed([dung]).wholeFitted).toEqual([]);

    const qua = cell("tight/01-vach", "ui", { ...base, safe: [79, 80, 241, 240] });
    expect(contractFramed([qua]).scales.get(qua.path)).toBeCloseTo(100 / 241, 6);
    expect(contractFramed([qua]).wholeFitted.map((c) => c.name)).toEqual(["01-vach"]);
  });

  /**
   * SÀN 15px CÓ VIỆC RIÊNG: trên một hộp hứa nhỏ, 10% chỉ là vài pixel — đúng bề
   * dày viền răng cưa mà ngưỡng α = 128 để lại. Sàn này lấy đúng
   * `SIZE_DEVIATION_THRESHOLD_PX` của `slice.py` để hai đầu app gọi "khớp hộp" bằng
   * cùng một con số.
   */
  it("hộp hứa nhỏ: tràn 15px vẫn là khớp, vì 10% của nó chỉ có 6px", () => {
    const nho = cell("tight/02-chip", "ui", {
      w: 125, h: 85, canvas: [627, 627], content: [125, 85], contentAt: [0, 0],
      safe: [0, 0, 125, 85], contractSafe: [10, 10, 100, 60], outSize: [50, 30],
    });
    /* Cạnh dưới tràn 15px = 25% của cạnh 60 — vẫn dưới sàn 15px nên KHÔNG bị coi là
       hư cấu; đổi 15 thành 16 là sang nhánh kia. */
    const out = contractFramed([nho]);
    expect(out.scales.get(nho.path)).toBeCloseTo(30 / 60, 6);
    expect(out.wholeFitted).toEqual([]);
    const qua = cell("tight/02-chip", "ui", {
      w: 125, h: 86, canvas: [627, 627], content: [125, 86], contentAt: [0, 0],
      safe: [0, 0, 125, 86], contractSafe: [10, 10, 100, 60], outSize: [50, 30],
    });
    expect(contractFramed([qua]).wholeFitted.map((c) => c.name)).toEqual(["02-chip"]);
  });

  /* ═══ Danh sách báo cáo ═══ */

  it("danh sách báo ĐÚNG ô nào phải co cả món, theo thứ tự vào, kèm lý do đọc được", () => {
    const out = contractFramed([nutR, nutHua, avatarR, avatarHua, progressR]);
    expect(out.wholeFitted.map((c) => c.name)).toEqual(["01-button", "02-avatar-frame", "03-progress"]);
    /* Câu lý do đi thẳng vào toast nên nó phải là tiếng Việt của người dùng, không
       phải tên khoá: không «element», không «frame», không «safe zone». */
    for (const c of out.wholeFitted) {
      expect(c.reason).toBe("máy vẽ to hơn hộp đã hứa, đã co cả món vào khung");
    }
    expect(out.fitted.map((f) => f.name)).toEqual([
      "01-button", "01-button", "02-avatar-frame", "03-avatar-frame", "03-progress",
    ]);
  });

  /* ═══ Đường lùi: thiếu hộp thì không có gì để đối chiếu ═══ */

  /**
   * ══ `outSize` THẮNG `contractSafe` — HAI CON SỐ, HAI VIỆC ══════════════════
   * Cỡ người dùng chọn là CỠ ĐẦU RA; hộp hứa thì CỐ Ý to hơn (xin model vẽ to rồi
   * thu nhỏ cho nét). Vắng `outSize` thì đích chính là hộp hứa — mà lõi (đã được
   * chứng thực) cũng là nó, nên câu trả lời đúng là "không co gì cả".
   */
  it("thiếu `outSize` (kit cắt bằng bản cũ) ⇒ khung = hộp hứa, tỉ lệ 1", () => {
    const nut = cell("tight/01-button", "ui", {
      w: 591, h: 417, canvas: [627, 627], content: [591, 417], contentAt: [34, 210],
      safe: [35, 215, 556, 196], contractSafe: [75, 230, 476, 166],
    });
    const out = contractFramed([nut]);
    expect(out.scales.get(nut.path)).toBe(1);
    expect(out.files[0]!.safe).toEqual([75, 230, 476, 166]);
    expect(out.fitted).toEqual([]);
    expect(out.measured).toEqual([]);
  });

  it("`outSize` rác (một số, số 0) ⇒ rơi về hộp hứa, không dựng khung 0×0", () => {
    for (const rac of [[112], [0, 39]]) {
      const nut = cell("tight/01-button", "ui", {
        w: 591, h: 417, canvas: [627, 627], content: [591, 417], contentAt: [34, 210],
        safe: [35, 215, 556, 196], contractSafe: [75, 230, 476, 166], outSize: rac,
      });
      expect(contractFramed([nut]).scales.get(nut.path)).toBe(1);
      expect(contractFramed([nut]).files[0]!.safe).toEqual([75, 230, 476, 166]);
    }
  });

  /**
   * THIẾU HỘP HỨA ⇒ không có gì để đối chiếu, và cũng không có gì để chọn: lõi là
   * hộp đo được, y như trước. Không báo vào danh sách "co cả món" — ở đây không có
   * lời hứa nào bị phá, chỉ là kit cắt bằng bản `slice.py` chưa ghi hộp hứa.
   */
  it("có `outSize` mà THIẾU hộp hứa ⇒ lõi lùi về `safe` đo được, KHÔNG báo gì", () => {
    const nut = cell("tight/01-button", "ui", {
      w: 591, h: 417, canvas: [627, 627], content: [591, 417], contentAt: [34, 210],
      safe: [37, 212, 586, 249], outSize: [120, 120],
    });
    const out = contractFramed([nut]);
    expect(out.measured).toEqual([]);
    expect(out.wholeFitted).toEqual([]);
    expect(out.scales.get(nut.path)).toBeCloseTo(120 / 586, 6);
  });

  it("cỡ đầu ra TO hơn hộp hứa ⇒ giãn lên chứ không bỏ mặc — cùng một công thức", () => {
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

  it("cỡ đầu ra ĐÚNG BẰNG hộp hứa ⇒ tỉ lệ 1 và KHÔNG báo gì", () => {
    const khit = cell("tight/03-ok", "ui", {
      w: 50, h: 50, canvas: [627, 627], content: [50, 50], contentAt: [5, 5],
      safe: [5, 5, 90, 90], contractSafe: [0, 0, 100, 100], outSize: [100, 100],
    });
    const out = contractFramed([khit]);
    expect(out.scales.get(khit.path)).toBe(1);
    expect(out.fitted).toEqual([]); // không ai muốn đọc «đã co về 100%»
    expect(out.wholeFitted).toEqual([]);
  });

  it("có hộp hứa nhưng KHÔNG đo được lõi ⇒ khung = hộp hứa, tỉ lệ 1", () => {
    const khongLoi = cell("tight/04-mo", "ui", { contractSafe: [75, 230, 476, 166] });
    const out = contractFramed([khongLoi]);
    expect(out.files[0]!.safe).toEqual([75, 230, 476, 166]);
    expect(out.scales.get(khongLoi.path)).toBe(1);
    expect(out.fitted).toEqual([]);
    expect(out.measured).toEqual([]);
    expect(out.wholeFitted).toEqual([]);
  });

  it("thiếu hộp hứa và cả `outSize` ⇒ giữ lõi đo được, tỉ lệ 1, VÀ nói ra tên ô", () => {
    const old = cell("tight/03-avatar-frame", "ui", { safe: [35, 1, 590, 546] });
    const out = contractFramed([old]);
    expect(out.files[0]!.safe).toEqual([35, 1, 590, 546]);
    expect(out.measured).toEqual(["03-avatar-frame"]);
    /* Tỉ lệ 1 chứ KHÔNG phải quy ước 50% của màn kit cũ: màn này vẫn hứa 1:1 cho ô
       không đo được, và `scaleOf` sẽ lặng lẽ chia đôi nếu để nó tự quyết. */
    expect(out.scales.get(old.path)).toBe(1);
  });

  it("hộp hứa rác (thiếu số, cạnh 0) ⇒ coi như không có, không dựng khung 0×0", () => {
    for (const rac of [[75, 230], [75, 230, 0, 166]]) {
      const out = contractFramed([cell("tight/x", "ui", { safe: [1, 2, 3, 4], contractSafe: rac })]);
      expect(out.files[0]!.safe).toEqual([1, 2, 3, 4]);
      expect(out.measured).toEqual(["x"]);
      expect(out.wholeFitted).toEqual([]);
    }
  });

  it("KHÔNG sửa gốc — mảng vào ra là hai object khác nhau", () => {
    const out = contractFramed([avatarHua]);
    expect(avatarHua.safe).toEqual([35, 35, 556, 556]);
    expect(out.files[0]).not.toBe(avatarHua);
  });

  it("mỗi ô một tỉ lệ RIÊNG — một số chung cho cả tấm là dựng lại đúng cái sai vừa gỡ", () => {
    const out = contractFramed([nutHua, avatarHua]);
    expect(out.scales.get(nutHua.path)!).not.toBeCloseTo(out.scales.get(avatarHua.path)!, 3);
    expect(out.scales.get(avatarHua.path)).toBeCloseTo(195 / 488, 6);
    expect(out.fitted.map((f) => f.name)).toEqual(["01-button", "03-avatar-frame"]);
  });

  it("KHÔNG đổi quy ước 50% của màn kit cũ: không truyền tỉ lệ ⇒ vẫn là `scaleOf`", () => {
    const spec = buildFigmaNodeForAsset(contractFramed([avatarHua]).files[0]!);
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

/**
 * ══ BA NẤC «KHỚP KHUNG» — QUYỀN CHỌN, KHÔNG PHẢI BA THUẬT TOÁN MỚI ══════════
 *
 * Chủ sản phẩm dán tấm ra Figma rồi hỏi: *"giờ làm sao để chỉnh cái khung bắn ra
 * và cỡ của ảnh bên trong, cho vào tâm?"*. Trước lượt này câu ấy không có chỗ trả
 * lời: lõi để co do một luật dung sai tự chọn, người dùng không thấy và không đổi
 * được. Ba nấc dưới đây khoá đúng bốn lời hứa của cái nút mới:
 *  ① mỗi nấc chọn LÕI nào — và hai nấc tay phải ra kết quả KHÁC nhau ở đúng cái
 *    ô mà luật tự động phải phân vân, nếu không thì cái nút chỉ để trang trí;
 *  ② tỉ lệ thêm nhân vào ẢNH, KHÔNG đụng khung;
 *  ③ tâm ảnh = tâm khung, neo theo hộp ĐO ĐƯỢC ở nấc «cả món»;
 *  ④ không truyền gì ⇒ y hệt hành vi trước khi có nút.
 */
describe("contractFramed — ba nấc «khớp khung» của thẻ", () => {
  /** Máy vẽ LỐ: lõi đo được tràn xa khỏi hộp đã hứa (ô thật của lượt r-0021). */
  const lo = cell("tight/01-button", "ui", {
    w: 592, h: 176, cellIndex: 0,
    canvas: [627, 627], content: [592, 176], contentAt: [34, 274],
    safe: [38, 281, 587, 168],
    contractSafe: [129, 249, 368, 128],
    outSize: [245, 85],
  });
  /** Máy vẽ NGOAN: chỉ quầng sáng tràn, trong dung sai (ô thật của `test-e0d4`). */
  const ngoan = cell("tight/01-button", "ui", {
    w: 591, h: 417, cellIndex: 0,
    canvas: [627, 627], content: [591, 417], contentAt: [34, 210],
    safe: [35, 215, 556, 196],
    contractSafe: [75, 230, 476, 166],
    outSize: [112, 39],
  });

  /** Tỉ lệ nếu lấy hộp ĐO ĐƯỢC làm lõi (cả món ôm vào khung). */
  const sDo = (c: typeof lo) => {
    const [, , w, h] = c.safe as number[];
    const [ow, oh] = c.outSize as number[];
    return Math.min(ow! / w!, oh! / h!);
  };
  /** Tỉ lệ nếu lấy hộp ĐÃ HỨA làm lõi (thân lấp khung). */
  const sHua = (c: typeof lo) => {
    const [, , w, h] = c.contractSafe as number[];
    const [ow, oh] = c.outSize as number[];
    return Math.min(ow! / w!, oh! / h!);
  };

  it("«cả món vừa khung» luôn lấy hộp ĐO ĐƯỢC, kể cả khi máy vẽ ngoan", () => {
    expect(contractFramed([lo], { mode: "whole" }).scales.get(lo.path)).toBeCloseTo(sDo(lo), 6);
    expect(contractFramed([ngoan], { mode: "whole" }).scales.get(ngoan.path)).toBeCloseTo(sDo(ngoan), 6);
    /* Và nó PHẢI khác nhánh kia ở ô ngoan — nếu bằng nhau thì nấc này thừa. */
    expect(sDo(ngoan)).not.toBeCloseTo(sHua(ngoan), 3);
  });

  it("«thân lấp khung» luôn lấy hộp ĐÃ HỨA, kể cả khi máy vẽ lố", () => {
    expect(contractFramed([lo], { mode: "body" }).scales.get(lo.path)).toBeCloseTo(sHua(lo), 6);
    expect(contractFramed([ngoan], { mode: "body" }).scales.get(ngoan.path)).toBeCloseTo(sHua(ngoan), 6);
    expect(sDo(lo)).not.toBeCloseTo(sHua(lo), 3);
  });

  it("«tự động» giữ nguyên luật dung sai: ô lố theo hộp đo, ô ngoan theo hộp hứa", () => {
    expect(contractFramed([lo], { mode: "auto" }).scales.get(lo.path)).toBeCloseTo(sDo(lo), 6);
    expect(contractFramed([ngoan], { mode: "auto" }).scales.get(ngoan.path)).toBeCloseTo(sHua(ngoan), 6);
  });

  /**
   * Câu «đã co cả món vào khung» có LÝ DO đi kèm: *máy vẽ to hơn hộp đã hứa*. Ở
   * nấc tay, co cả món là do NGƯỜI DÙNG chọn chứ không phải do máy vẽ lố — nói
   * câu ấy lúc máy vẽ ngoan là đổ oan cho một lượt vẽ tử tế.
   */
  it("chỉ báo «co cả món» khi lời hứa THẬT SỰ vỡ, không báo vì người dùng chọn tay", () => {
    expect(contractFramed([lo], { mode: "whole" }).wholeFitted.map((c) => c.name)).toEqual(["01-button"]);
    expect(contractFramed([ngoan], { mode: "whole" }).wholeFitted).toEqual([]);
    /* Nấc «thân lấp khung» KHÔNG co cả món ô nào, nên danh sách ấy luôn rỗng. */
    expect(contractFramed([lo], { mode: "body" }).wholeFitted).toEqual([]);
  });

  it("tỉ lệ thêm 120% ⇒ ẢNH ×1,2, KHUNG không đổi một pixel", () => {
    const goc = contractFramed([lo], { mode: "whole" });
    const to = contractFramed([lo], { mode: "whole", scalePercent: 120 });
    const s0 = goc.scales.get(lo.path)!;
    const s1 = to.scales.get(lo.path)!;
    expect(s1).toBeCloseTo(s0 * 1.2, 6);

    /* KHUNG = hộp ảo × tỉ lệ xuất (đúng phép nhân của `buildFigmaNodeForAsset`).
       Cả hai nấc phải ra đúng `outSize` — đó là con số người dùng đã đặt. */
    for (const [out, s] of [[goc, s0], [to, s1]] as const) {
      const box = out.files[0]!.safe as number[];
      expect(box[2]! * s).toBeCloseTo(245, 6);
      expect(box[3]! * s).toBeCloseTo(85, 6);
    }
  });

  it("tỉ lệ thêm 50% và 150% đều đi thẳng vào tỉ lệ ảnh", () => {
    const s0 = contractFramed([ngoan], { mode: "body" }).scales.get(ngoan.path)!;
    expect(contractFramed([ngoan], { mode: "body", scalePercent: 50 }).scales.get(ngoan.path))
      .toBeCloseTo(s0 * 0.5, 6);
    expect(contractFramed([ngoan], { mode: "body", scalePercent: 150 }).scales.get(ngoan.path))
      .toBeCloseTo(s0 * 1.5, 6);
  });

  /**
   * TÂM ẢNH = TÂM KHUNG, và mốc là hộp ĐO ĐƯỢC ở nấc «cả món».
   *
   * Hộp ảo căn giữa quanh tâm lõi ⇒ khi nhân ngược ra khung, lõi nằm đúng giữa.
   * Neo nhầm sang hộp đã hứa ở nấc này là đẩy cả món lệch sang một bên đúng bằng
   * khoảng cách giữa hai tâm — và không có gì trên màn nói ra chuyện đó.
   */
  it("nấc «cả món»: tâm hộp ảo TRÙNG tâm hộp đo được, ở mọi tỉ lệ thêm", () => {
    const tamX = 38 + 587 / 2;
    const tamY = 281 + 168 / 2;
    for (const pct of [100, 50, 120, 150]) {
      const box = contractFramed([lo], { mode: "whole", scalePercent: pct }).files[0]!.safe as number[];
      expect(box[0]! + box[2]! / 2).toBeCloseTo(tamX, 6);
      expect(box[1]! + box[3]! / 2).toBeCloseTo(tamY, 6);
    }
  });

  it("không truyền gì ⇒ ĐÚNG hành vi cũ («tự động», 100%)", () => {
    for (const c of [lo, ngoan]) {
      const cu = contractFramed([c]);
      const ro = contractFramed([c], { mode: "auto", scalePercent: 100 });
      expect(cu.files).toEqual(ro.files);
      expect([...cu.scales]).toEqual([...ro.scales]);
      expect(cu.fitted).toEqual(ro.fitted);
      expect(cu.wholeFitted).toEqual(ro.wholeFitted);
      expect(cu.measured).toEqual(ro.measured);
    }
  });

  it("tỉ lệ thêm rác (0, âm, NaN) ⇒ coi như 100%, không dựng khung 0×0", () => {
    const chuan = contractFramed([lo], { mode: "whole" }).scales.get(lo.path)!;
    for (const pct of [0, -20, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(contractFramed([lo], { mode: "whole", scalePercent: pct }).scales.get(lo.path))
        .toBeCloseTo(chuan, 6);
    }
  });

  it("kit cắt bằng bản cũ (thiếu cỡ đầu ra) ⇒ nấc nào cũng giữ nguyên, tỉ lệ 1", () => {
    const cu = cell("tight/01-button", "ui", { safe: [10, 10, 100, 100] });
    for (const mode of ["whole", "body", "auto"] as const) {
      const out = contractFramed([cu], { mode, scalePercent: 130 });
      expect(out.scales.get(cu.path)).toBe(1);
      expect(out.measured).toEqual(["01-button"]);
    }
  });
});
