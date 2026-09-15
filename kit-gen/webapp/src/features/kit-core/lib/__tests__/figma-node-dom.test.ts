/* @vitest-environment jsdom */
/**
 * figma-node-dom.test.ts — CÂY DOM DÁN SANG FIGMA, VÀ CHUỖI THẬT SỰ ĐI VÀO CLIPBOARD.
 *
 * ╔══ VÌ SAO LÀ MỘT FILE RIÊNG ══════════════════════════════════════════════╗
 * ║ `figma-node.test.ts` chạy ở `environment: "node"` và CỐ Ý không chạm DOM  ║
 * ║ lẫn vendor (xem `vendor/figma-h2d/README.md`). Nhưng cấu trúc node mới —  ║
 * ║ hai frame lồng nhau, ảnh là image fill — chỉ tồn tại TRONG DOM và trong   ║
 * ║ chuỗi base64 cuối cùng. Nên phần đó ở đây, dưới jsdom.                    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ┌── TEST NÀY KHOÁ ĐƯỢC GÌ, VÀ KHÔNG KHOÁ ĐƯỢC GÌ ─────────────────────────┐
 * │ KHOÁ ĐƯỢC: `renderSpec` dựng đúng hai frame, ảnh là `background-image`,   │
 * │ cỡ/độ lệch viết bằng `%` và NHÂN NGƯỢC LẠI ra đúng sáu con số cũ, và mọi  │
 * │ thuộc tính ấy SỐNG SÓT qua `toFigmaClipboardHtml` (giải base64 ra đọc).   │
 * │ KHÔNG KHOÁ ĐƯỢC: Figma desktop có dịch `%` thành constraint SCALE,        │
 * │ `aspect-ratio` thành khoá tỉ lệ, `background-size:100% 100%` thành fill   │
 * │ Crop hay không — đó là mã của Figma, phải dán thật rồi nhìn. Test không   │
 * │ giả vờ biết.                                                             │
 * └──────────────────────────────────────────────────────────────────────────┘
 */
import { describe, expect, it } from "vitest";
import { kitFileSchema } from "@/lib/types/api";
import {
  IMAGE_LAYER_NAME, buildFigmaNodeForAsset, mountStage, renderSpec, STAGE_ID,
} from "../figma-node";
import { loadFigmaH2D, FIGH2D_OPEN, FIGH2D_CLOSE } from "@/vendor/figma-h2d";
import type { H2DDocument, H2DNode } from "@/vendor/figma-h2d";

/**
 * Ô THẬT, số đã đọc lại từ chính Figma (xem `figma-node.test.ts`, ca
 * "khớp ĐÚNG node thật đang nằm trong Figma"): frame 120.375×52.5, ảnh 192×127.875
 * đặt tại (−36, −37.875). Cấu trúc đổi thì sáu con số này KHÔNG được đổi.
 */
const asset = kitFileSchema.parse({
  file: "tight/01-btn-pill-red",
  path: "kits/crop-safe-v15/tight/01-btn-pill-red.png",
  w: 512, h: 341,
  safe: [96, 101, 321, 140], contentAt: [0, 0], content: [512, 341],
  canvas: [512, 341], cell: [512, 341], bleed: [0, 0],
});
const spec = buildFigmaNodeForAsset(asset, { scale: 0.375 });
const URL_IMG = "blob:http://localhost/aa-bb";

function render(at?: { x: number; y: number }): { frame: HTMLElement; stage: HTMLElement } {
  const stage = mountStage();
  return { frame: renderSpec(spec, URL_IMG, stage, at), stage };
}

/** `"106.78%"` → 106.78. Ném nếu không phải phần trăm — px là đúng cái ta bỏ. */
function pct(value: string): number {
  expect(value.endsWith("%")).toBe(true);
  return Number.parseFloat(value);
}

describe("renderSpec dựng HAI frame, ảnh là fill của frame trong", () => {
  it("frame ngoài = hitbox, tên ô, cỡ px, khai aspect-ratio", () => {
    const { frame, stage } = render();
    try {
      expect(frame.tagName).toBe("DIV");
      expect(frame.className).toBe("safe-frame");
      expect(frame.getAttribute("aria-label")).toBe("01-btn-pill-red");
      expect(frame.style.width).toBe("120.375px");
      expect(frame.style.height).toBe("52.5px");
      expect(frame.style.aspectRatio).toBe("120.375 / 52.5");
      expect(frame.style.position).toBe("relative");
    } finally { stage.remove(); }
  });

  it("KHÔNG còn node <img> nào — ảnh đi bằng image fill", () => {
    const { frame, stage } = render();
    try {
      expect(frame.querySelector("img")).toBeNull();
      expect(frame.children.length).toBe(1);
      const image = frame.firstElementChild as HTMLElement;
      expect(image.tagName).toBe("DIV");
      expect(image.getAttribute("aria-label")).toBe(IMAGE_LAYER_NAME);
      expect(image.style.backgroundImage).toContain(URL_IMG);
      /* `100% 100%` = trải kín khung, không tự giữ tỉ lệ — nghĩa của `Crop`.
         `cover`/`contain` mang nghĩa khác (`Fill`/`Fit`) nên không dùng. */
      expect(image.style.backgroundSize).toBe("100% 100%");
      expect(image.style.backgroundRepeat).toBe("no-repeat");
      expect(image.style.aspectRatio).toBe("192 / 127.875");
    } finally { stage.remove(); }
  });

  it("cỡ và độ lệch viết bằng %, nhân ngược lại ra ĐÚNG sáu con số cũ", () => {
    const { frame, stage } = render();
    try {
      const image = frame.firstElementChild as HTMLElement;
      expect(pct(image.style.left) / 100 * spec.frame.w).toBeCloseTo(-36, 9);
      expect(pct(image.style.top) / 100 * spec.frame.h).toBeCloseTo(-37.875, 9);
      expect(pct(image.style.width) / 100 * spec.frame.w).toBeCloseTo(192, 9);
      expect(pct(image.style.height) / 100 * spec.frame.h).toBeCloseTo(127.875, 9);
      /* Và spec vẫn là spec cũ — không ai lén đổi số học. */
      expect(spec.frame).toEqual({ w: 120.375, h: 52.5 });
      expect(spec.image).toEqual({ x: -36, y: -37.875, w: 192, h: 127.875 });
    } finally { stage.remove(); }
  });

  it("đường «Copy N ô» — `at` chỉ dời frame ngoài, % bên trong không đổi", () => {
    const a = render();
    const solo = (a.frame.firstElementChild as HTMLElement).style.cssText;
    a.stage.remove();
    const b = render({ x: 480, y: 1200 });
    try {
      expect(b.frame.style.position).toBe("absolute");
      expect(b.frame.style.left).toBe("480px");
      expect(b.frame.style.top).toBe("1200px");
      expect((b.frame.firstElementChild as HTMLElement).style.cssText).toBe(solo);
    } finally { b.stage.remove(); }
  });

  it("sân khấu chỉ có MỘT, và biến mất khi dọn", () => {
    const { stage } = render();
    expect(document.getElementById(STAGE_ID)).toBe(stage);
    mountStage().remove();
    expect(document.getElementById(STAGE_ID)).toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   CHUỖI THẬT SỰ ĐI VÀO CLIPBOARD
   ──────────────────────────────────────────────────────────────────────────
   `captureElement` cần layout thật nên không chạy được dưới jsdom; `toFigmaClipboard
   Html` thì KHÔNG cần — nó chỉ `JSON.stringify` + base64. Nên dựng IR đúng hình
   dạng `walkElement` phát ra (`figma-h2d.global.js:1103-1118`) TỪ CHÍNH cây DOM mà
   `renderSpec` vừa dựng, rồi giải lại base64 để xem thứ Figma sẽ đọc.

   `computedStyles` là chỗ encoder cất GIÁ TRỊ KHAI BÁO của width/height khi nó khác
   giá trị đã resolve (`:555-563`) — tức là chỗ chuỗi `%` sống sót. Đó là toàn bộ lý
   do file này tồn tại: nếu một ngày ai đó đổi `%` về `px`, ca dưới đây đỏ.
   ══════════════════════════════════════════════════════════════════════════ */
function irOf(el: HTMLElement, rect: { x: number; y: number; w: number; h: number }): H2DNode {
  const s = el.style;
  const styles: Record<string, string> = {};
  if (s.position) styles.position = s.position;
  if (s.aspectRatio) styles.aspectRatio = s.aspectRatio;
  if (s.backgroundImage) styles.backgroundImage = s.backgroundImage;
  if (s.backgroundSize) styles.backgroundSize = s.backgroundSize;
  if (s.backgroundRepeat) styles.backgroundRepeat = s.backgroundRepeat;
  /* Trình duyệt resolve mọi cỡ ra px trong `getComputedStyle` ⇒ `styles` mang px… */
  styles.width = `${rect.w}px`;
  styles.height = `${rect.h}px`;
  if (s.left) styles.left = `${rect.x}px`;
  if (s.top) styles.top = `${rect.y}px`;
  const node: H2DNode = {
    nodeType: 1, tag: "DIV",
    attributes: { "aria-label": el.getAttribute("aria-label") ?? "" },
    styles,
    rect: { x: rect.x, y: rect.y, width: rect.w, height: rect.h },
    childNodes: [],
  };
  /* …còn giá trị KHAI BÁO (`%`) đi riêng, đúng hai khoá `SIZING_PROPS` này. */
  const declared: Record<string, string> = {};
  if (s.width.endsWith("%")) declared.width = s.width;
  if (s.height.endsWith("%")) declared.height = s.height;
  if (Object.keys(declared).length > 0) node.computedStyles = declared;
  return node;
}

function docOf(frame: HTMLElement): H2DDocument {
  const image = frame.firstElementChild as HTMLElement;
  const root = irOf(frame, { x: 0, y: 0, w: spec.frame.w, h: spec.frame.h });
  root.childNodes = [irOf(image, {
    x: spec.image.x, y: spec.image.y, w: spec.image.w, h: spec.image.h,
  })];
  return {
    root,
    documentRect: { x: 0, y: 0, width: spec.frame.w, height: spec.frame.h },
    viewportRect: { x: 0, y: 0, width: spec.frame.w, height: spec.frame.h },
    devicePixelRatio: 2, version: 2,
    assets: new Map([[URL_IMG, { url: URL_IMG, blob: new Blob(["png"], { type: "image/png" }) }]]),
  } as H2DDocument;
}

describe("payload clipboard chở đủ thuộc tính của cấu trúc mới", () => {
  it("giải base64 ra thấy: fill CROP, cỡ %, aspect-ratio, tên lớp ảnh", async () => {
    const stage = mountStage();
    try {
      const frame = renderSpec(spec, URL_IMG, stage);
      const h2d = await loadFigmaH2D();
      const { html } = await h2d.toFigmaClipboardHtml([docOf(frame)], { source: "kitgen-test" });

      const open = html.indexOf(FIGH2D_OPEN) + FIGH2D_OPEN.length;
      const json = atob(html.slice(open, html.indexOf(FIGH2D_CLOSE)));

      expect(json).toContain('"backgroundSize":"100% 100%"');
      expect(json).toContain('"backgroundRepeat":"no-repeat"');
      expect(json).toContain('"backgroundImage":"url(');
      expect(json).toContain('"aspectRatio":"120.375 / 52.5"');
      expect(json).toContain('"aspectRatio":"192 / 127.875"');
      expect(json).toContain(`"aria-label":"${IMAGE_LAYER_NAME}"`);
      /* Cỡ khai báo bằng % — kênh duy nhất xin được constraint SCALE. */
      const declared = JSON.parse(json)[0].root.childNodes[0].computedStyles;
      expect(pct(declared.width) / 100 * spec.frame.w).toBeCloseTo(192, 9);
      expect(pct(declared.height) / 100 * spec.frame.h).toBeCloseTo(127.875, 9);
      /* Và không còn một node ảnh rời nào trong payload. */
      expect(json).not.toContain('"tag":"IMG"');
      /* Ảnh vẫn được nhúng thật, không phải cái vỏ url. */
      expect(json).toContain('"base64Blob":"data:image/png;base64,');
    } finally { stage.remove(); }
  });
});
