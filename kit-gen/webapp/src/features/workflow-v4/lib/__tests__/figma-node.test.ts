/**
 * figma-node.test.ts — SỐ HỌC SAFE ZONE, KIỂM BẰNG KIT THẬT.
 *
 * ╔══ VÌ SAO KHÔNG DÙNG SỐ BỊA ═══════════════════════════════════════════════╗
 * ║ Cả lớp lỗi ở đây là "lệch vài chục pixel mà không có gì báo". Số bịa       ║
 * ║ (safe 100×100, content 100×100, offset 0) sẽ ĐI QUA mọi công thức sai —    ║
 * ║ kể cả công thức bỏ hẳn `contentAt`. Vì vậy fixture là `kits/manifest.json` ║
 * ║ THẬT của dự án `blindtest-a-trung-thu-candy`, chép nguyên từ               ║
 * ║ `~/KitGen/.kitgen/trash/20260814-032314-blindtest-a-trung-thu-candy-83fe/` ║
 * ║ (chỉ đọc, không sửa gì trong workspace của người dùng).                    ║
 * ║                                                                            ║
 * ║ Sáu ô của kit đó đã được ĐO LẠI TRÊN ĐĨA bằng header PNG, cả hai bản:      ║
 * ║   tight/<file>.png  ≡ `content`   (6/6 khớp)                               ║
 * ║   <file>.png        ≡ `canvas`    (6/6 khớp)                               ║
 * ║ ⇒ hai công thức offset trong `figma-node.ts` đứng trên số đo, không đứng   ║
 * ║ trên phỏng đoán.                                                           ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
import { describe, expect, it } from "vitest";
import { kitFileSchema } from "@/lib/types/api";
import type { KitFile } from "@/lib/types";
import {
  FigmaNodeUnsupported, assertDocShape, buildFigmaNodeForAsset, geometryOf,
} from "../figma-node";
import type { H2DDocument } from "@/vendor/figma-h2d";
import manifest from "./fixtures/kit-blindtest-a.manifest.json";

/* ── Dựng lại ĐÚNG thứ #42 `GET /api/projects/:id/kit` trả về ────────────────
   `agent/routes/files.mjs:76-98` đọc `kits/manifest.json` rồi phát ra một bản ghi
   cho MỖI file trên đĩa, dùng chung meta của ô: bản canvas và bản `tight/`. Ở đây
   dựng lại đúng phép biến đổi đó rồi cho qua `kitFileSchema` thật — nếu schema đổi
   thì test này đỏ trước, không phải người dùng phát hiện. */
type Asset = {
  file: string; sheet: string;
  canvas: number[]; cell: number[]; bleed: number[];
  content: number[]; content_at: number[]; safe: number[];
};
const assets = manifest.styles.chinh.assets as Asset[];

function kitFile(a: Asset, tight: boolean): KitFile {
  const bare = a.file.replace(/\.png$/, "");
  const [w, h] = tight ? a.content : a.canvas;
  return kitFileSchema.parse({
    file: tight ? `tight/${bare}` : bare,
    path: `kits/chinh/${tight ? "tight/" : ""}${a.file}`,
    w, h, bytes: 1234, sheet: a.sheet, cellIndex: null,
    safe: a.safe, contentAt: a.content_at, content: a.content,
    canvas: a.canvas, cell: a.cell, bleed: a.bleed,
  });
}

const byName = (name: string): Asset => {
  const hit = assets.find((a) => a.file === name);
  if (hit === undefined) throw new Error(`fixture thiếu ô ${name}`);
  return hit;
};

describe("hình học safe zone lấy đúng bộ số của bản PNG đang dán", () => {
  it("bản tight/ ⇒ ruột đã crop, gốc tại contentAt", () => {
    // 15-reward-giftbox: safe [675,348,737,696] · content [787,704] · at [648,341]
    expect(geometryOf(kitFile(byName("15-reward-giftbox.png"), true))).toEqual({
      source: "tight",
      safe: { x: 675, y: 348, w: 737, h: 696 },
      pixels: { w: 787, h: 704 },
      origin: { x: 648, y: 341 },
    });
  });

  it("bản canvas ⇒ cả canvas, gốc tại (0,0)", () => {
    expect(geometryOf(kitFile(byName("15-reward-giftbox.png"), false))).toEqual({
      source: "canvas",
      safe: { x: 675, y: 348, w: 737, h: 696 },
      pixels: { w: 2088, h: 1392 },
      origin: { x: 0, y: 0 },
    });
  });

  it("cỡ pixel thật là trọng tài, không phải đường dẫn", () => {
    // Đặt tên `tight/` nhưng ảnh lại đúng cỡ canvas ⇒ phải chọn công thức canvas.
    const a = byName("01-pose-idle.png");
    const lying = kitFileSchema.parse({
      ...kitFile(a, true), w: a.canvas[0], h: a.canvas[1],
    });
    expect(geometryOf(lying).source).toBe("canvas");
  });

  it("ảnh không khớp bộ số nào ⇒ NÉM chứ không dán lệch", () => {
    const a = byName("01-pose-idle.png");
    const stale = kitFileSchema.parse({ ...kitFile(a, true), w: 999, h: 999 });
    expect(() => geometryOf(stale)).toThrow(FigmaNodeUnsupported);
    expect(() => geometryOf(stale)).toThrow(/999×999/);
  });

  it("kit cũ chưa có safe zone ⇒ lỗi có tên riêng để nơi gọi rơi về bitmap", () => {
    const old = kitFileSchema.parse({ file: "01-btn", path: "kits/chinh/01-btn.png", w: 10, h: 10 });
    expect(() => geometryOf(old)).toThrow(FigmaNodeUnsupported);
  });

  it("contentAt = [0, y] vẫn là toạ độ hợp lệ, không bị coi là thiếu số", () => {
    const a = byName("15-reward-giftbox.png");
    const atOrigin = kitFileSchema.parse({ ...kitFile(a, true), contentAt: [0, 0] });
    expect(geometryOf(atOrigin)).toMatchObject({ source: "tight", origin: { x: 0, y: 0 } });
  });
});

/**
 * ┌── BẰNG CHỨNG SỐ: BỐN DÒNG CỦA `copy-sprite-images.mjs:41-48` ─────────────┐
 * │   frame = safe.w×safe.h × scale                                           │
 * │   image = (contentAt − safe) × scale, cỡ = content × scale                │
 * │ Mọi số kỳ vọng dưới đây tính TAY từ manifest thật, không lấy lại từ code. │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
describe("frame = hitbox, ảnh lệch âm, không kéo méo (handoff §3.3)", () => {
  it("ô UI 50% — giftbox: ruột 787×704 TO HƠN hitbox 737×696 ⇒ offset âm cả hai trục", () => {
    const spec = buildFigmaNodeForAsset(kitFile(byName("15-reward-giftbox.png"), true));
    expect(spec.scale).toBe(0.5);
    expect(spec.frame).toEqual({ w: 368.5, h: 348 });        // 737×0.5 · 696×0.5
    expect(spec.image).toEqual({ x: -13.5, y: -3.5, w: 393.5, h: 352 });
    //                            (648−675)×.5  (341−348)×.5   787×.5   704×.5
    expect(spec.clipsContent).toBe(false);
    // decoration THẬT SỰ tràn ra: 393.5 > 368.5 ⇒ bật clip là cắt cụt hình.
    expect(spec.image.w).toBeGreaterThan(spec.frame.w);
  });

  it("ô mascot 1:1 — pose-idle giữ nguyên pixel, offset (−14, −51)", () => {
    const file = kitFile(byName("01-pose-idle.png"), true);
    const spec = buildFigmaNodeForAsset(file, { poseFiles: new Set([file.file]) });
    expect(spec.scale).toBe(1);
    expect(spec.frame).toEqual({ w: 230, h: 435 });          // safe [407,130,230,435]
    expect(spec.image).toEqual({ x: -14, y: -51, w: 265, h: 451 });
    //                            393−407  79−130   content [265,451]
  });

  it("ô nền — ruột NẰM GỌN trong hitbox ⇒ offset dương, vẫn đúng công thức", () => {
    // 25-bg-home: safe [184,276,1024,1536] · content [1024,1524] · at [184,288]
    const spec = buildFigmaNodeForAsset(kitFile(byName("25-bg-home.png"), true));
    expect(spec.frame).toEqual({ w: 512, h: 768 });
    expect(spec.image).toEqual({ x: 0, y: 6, w: 512, h: 762 });
  });

  it("bản canvas của cùng ô ⇒ ảnh lệch đúng −safe, cùng một frame", () => {
    const tight = buildFigmaNodeForAsset(kitFile(byName("52-envelope-body.png"), true));
    const full = buildFigmaNodeForAsset(kitFile(byName("52-envelope-body.png"), false));
    expect(full.frame).toEqual(tight.frame);                 // hitbox không đổi
    expect(full.image).toEqual({ x: -155.5, y: -189, w: 522, h: 696 });
    //                           (0−311)×.5 (0−378)×.5  canvas [1044,1392]×.5
  });

  it("KHÔNG kéo méo: frame và ảnh dùng CHUNG một tỉ lệ, mọi ô, cả hai bản", () => {
    for (const a of assets) {
      for (const tight of [true, false]) {
        const file = kitFile(a, tight);
        const spec = buildFigmaNodeForAsset(file, { scale: 0.375 });
        const geo = geometryOf(file);
        expect(spec.frame.w / geo.safe.w).toBeCloseTo(spec.frame.h / geo.safe.h, 12);
        expect(spec.image.w / geo.pixels.w).toBeCloseTo(spec.image.h / geo.pixels.h, 12);
        expect(spec.image.w / geo.pixels.w).toBeCloseTo(spec.frame.w / geo.safe.w, 12);
      }
    }
  });

  it("hitbox của một ô KHÔNG phụ thuộc bản PNG được chọn — 6/6 ô của kit thật", () => {
    for (const a of assets) {
      const t = buildFigmaNodeForAsset(kitFile(a, true));
      const c = buildFigmaNodeForAsset(kitFile(a, false));
      expect(c.frame).toEqual(t.frame);
      // và hai bản phải đặt ảnh sao cho ĐIỂM (contentAt) rơi vào cùng một chỗ:
      // canvas.image.x + contentAt.x×scale  ==  tight.image.x
      const scale = t.scale;
      expect(c.image.x + a.content_at[0]! * scale).toBeCloseTo(t.image.x, 9);
      expect(c.image.y + a.content_at[1]! * scale).toBeCloseTo(t.image.y, 9);
    }
  });

  it("tên frame mặc định là tên ô, đã bỏ tiền tố tight/", () => {
    expect(buildFigmaNodeForAsset(kitFile(byName("02-pose-wave.png"), true)).name).toBe("02-pose-wave");
  });

  /**
   * ╔══ SỰ THẬT MẶT ĐẤT: SỐ ĐỌC TỪ CHÍNH FIGMA ════════════════════════════════╗
   * ║ Mọi ca ở trên tính tay từ manifest — vẫn có thể sai HỆ THỐNG nếu tôi hiểu ║
   * ║ nhầm hợp đồng. Ca này thì không: nó so với node ĐANG NẰM TRONG Figma      ║
   * ║ desktop của người dùng, dán từ đường đã kiểm chứng                        ║
   * ║ (`copy-sprite-images.mjs` + `manifest-nine-elements-crop-safe-v15.json`,  ║
   * ║ `figmaScale = 0.375`), đọc lại ngày 2026-08-14 bằng Figma MCP:            ║
   * ║                                                                           ║
   * ║   <frame "01-btn-pill-red"                    width=120.375 height=52.5>  ║
   * ║     <frame "Image (Image · 01-btn-pill-red)"  x=-36  y=-37.875            ║
   * ║                                               width=192 height=127.875>  ║
   * ║                                                                           ║
   * ║ Manifest của ô đó: safe [96,101,321,140] · content [512,341] · at [0,0].  ║
   * ║ Sáu con số của `buildFigmaNodeForAsset` khớp SÁU con số Figma đo được.    ║
   * ╚═══════════════════════════════════════════════════════════════════════════╝
   */
  it("khớp ĐÚNG node thật đang nằm trong Figma (01-btn-pill-red, scale 0.375)", () => {
    const asset = kitFileSchema.parse({
      file: "tight/01-btn-pill-red",
      path: "kits/crop-safe-v15/tight/01-btn-pill-red.png",
      w: 512, h: 341,
      safe: [96, 101, 321, 140], contentAt: [0, 0], content: [512, 341],
      canvas: [512, 341], cell: [512, 341], bleed: [0, 0],
    });
    const spec = buildFigmaNodeForAsset(asset, { scale: 0.375 });
    expect(spec.frame).toEqual({ w: 120.375, h: 52.5 });
    expect(spec.image).toEqual({ x: -36, y: -37.875, w: 192, h: 127.875 });
  });
});

/* ── Kiểm cấu trúc payload: soi IR trước khi ghi clipboard ──────────────────
   Không cần Figma thật — chỉ cần chắc rằng thứ đi vào clipboard là một frame DIV
   có IMG bên trong, clip tắt, ảnh đã nhúng được, và kích thước đo được khớp hitbox. */
describe("gác cổng payload — hỏng thì phải NÉM để nơi gọi rơi về bitmap", () => {
  const spec = buildFigmaNodeForAsset(kitFile(byName("15-reward-giftbox.png"), true));
  const ok = (over: Record<string, unknown> = {}): H2DDocument => ({
    root: {
      nodeType: 1, tag: "DIV",
      attributes: { "aria-label": spec.name },
      styles: { overflow: "visible" },
      rect: { x: 0, y: 0, width: spec.frame.w, height: spec.frame.h },
      childNodes: [{
        nodeType: 1, tag: "IMG",
        rect: { x: spec.image.x, y: spec.image.y, width: spec.image.w, height: spec.image.h },
      }],
    },
    documentRect: { x: 0, y: 0, width: spec.frame.w, height: spec.frame.h },
    viewportRect: { x: 0, y: 0, width: spec.frame.w, height: spec.frame.h },
    devicePixelRatio: 2, version: 2,
    assets: new Map([["blob:x", { url: "blob:x", blob: new Blob(["x"]) }]]),
    ...over,
  });

  it("payload đúng hình dạng thì đi qua", () => {
    expect(() => assertDocShape(ok(), spec)).not.toThrow();
  });

  it("root không phải frame DIV ⇒ ném", () => {
    const doc = ok();
    doc.root.tag = "IMG";
    expect(() => assertDocShape(doc, spec)).toThrow(/không phải frame DIV/);
  });

  it("thiếu node ảnh raster ⇒ ném (dán ra sẽ là frame rỗng)", () => {
    const doc = ok();
    doc.root.childNodes = [];
    expect(() => assertDocShape(doc, spec)).toThrow(/thiếu node ảnh/);
  });

  it("frame bật clip ⇒ ném — sai đúng điều §3.3 cấm", () => {
    const doc = ok();
    doc.root.styles = { overflow: "hidden" };
    expect(() => assertDocShape(doc, spec)).toThrow(/clip content/);
  });

  it("ảnh không nhúng được ⇒ ném, KHÔNG im lặng dán frame rỗng", () => {
    const doc = ok({
      assets: new Map([["blob:x", { url: "blob:x", blob: null, error: "404" }]]),
    });
    expect(() => assertDocShape(doc, spec)).toThrow(/404/);
  });

  it("frame đo được lệch hitbox ⇒ ném", () => {
    const doc = ok();
    doc.root.rect = { x: 0, y: 0, width: spec.frame.w + 40, height: spec.frame.h };
    expect(() => assertDocShape(doc, spec)).toThrow(/lệch so với safe zone/);
  });
});
