/* @vitest-environment jsdom */
/**
 * figma-lab-dom.test.ts — CHÍN CÁCH VIẾT, VÀ CHUỖI THẬT SỰ ĐI VÀO BỘ NHỚ TẠM.
 *
 * ╔══ TEST NÀY KHOÁ ĐƯỢC GÌ ═════════════════════════════════════════════════╗
 * ║ · Sân khấu dựng đủ chín hộp, tên không trùng, xếp hàng ngang cách đều.    ║
 * ║ · Mỗi hộp khai ĐÚNG lá bài của riêng nó (đó là toàn bộ giá trị của phép   ║
 * ║   đo: hai hộp khai giống nhau thì ảnh chụp không nói được gì).            ║
 * ║ · Hộp A là ĐÚNG bản đang chạy — mốc so sánh, không phải bản chép tay.     ║
 * ║ · Cả chín mã sống sót qua `toFigmaClipboardHtml` (giải base64 ra đọc).    ║
 * ║ · `assertDocShape` KHÔNG được gác thí nghiệm — nó đo một hình cố định và   ║
 * ║   sẽ giết đúng những biến thể sinh ra để hỏi.                             ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * KHÔNG khoá được (và không giả vờ): Figma desktop dịch từng lá bài ấy thành cái
 * gì. Đó là mã của Figma — phải dán thật rồi chụp màn.
 */
import { describe, expect, it } from "vitest";
import { kitFileSchema } from "@/lib/types";
import {
  IMAGE_LAYER_NAME, assertDocShape, buildFigmaNodeForAsset, mountStage, renderSpec,
} from "../figma-node";
import {
  LAB_GAP, LAB_SOURCE, LAB_VARIANTS, assertLabDoc, encodeFigmaLab, renderLab,
} from "../figma-lab";
import { FIGH2D_CLOSE, FIGH2D_OPEN, loadFigmaH2D } from "@/vendor/figma-h2d";
import type { H2DDocument, H2DNode } from "@/vendor/figma-h2d";

/** Cùng ô thật, cùng sáu con số với `figma-node-dom.test.ts` — thí nghiệm phải chạy trên số đời thật. */
const asset = kitFileSchema.parse({
  file: "tight/01-btn-pill-red",
  path: "kits/crop-safe-v15/tight/01-btn-pill-red.png",
  w: 512, h: 341,
  safe: [96, 101, 321, 140], contentAt: [0, 0], content: [512, 341],
  canvas: [512, 341], cell: [512, 341], bleed: [0, 0],
});
const spec = buildFigmaNodeForAsset(asset, { scale: 0.375 });
const URL_IMG = "blob:http://localhost/aa-bb";

function lab(): { frames: ReturnType<typeof renderLab>; stage: HTMLElement } {
  const stage = mountStage();
  return { frames: renderLab(spec, URL_IMG, stage), stage };
}

/** Hộp mang mã này, hoặc ném — đọc dễ hơn một chuỗi `find(...)!` ở mỗi ca. */
function boxOf(frames: ReturnType<typeof renderLab>, code: string): HTMLElement {
  const hit = frames.find((f) => f.variant.code === code);
  if (hit === undefined) throw new Error(`Không có biến thể ${code}`);
  return hit.el;
}

const innerOf = (el: HTMLElement) => el.firstElementChild as HTMLElement;

describe("sân khấu thí nghiệm", () => {
  it("đủ chín hộp, tên đọc được trong Layers, mỗi hộp đúng một lớp ảnh", () => {
    const { frames, stage } = lab();
    try {
      expect(frames.length).toBe(LAB_VARIANTS.length);
      expect(stage.children.length).toBe(LAB_VARIANTS.length);
      for (const f of frames) {
        expect(f.el.getAttribute("aria-label")).toBe(f.variant.label);
        expect(f.el.children.length).toBe(1);
        expect(innerOf(f.el).getAttribute("aria-label")).toBe(IMAGE_LAYER_NAME);
      }
    } finally { stage.remove(); }
  });

  it("xếp HÀNG NGANG, cách đều, không hộp nào chồng lên hộp nào", () => {
    const { frames, stage } = lab();
    try {
      const step = spec.frame.w + LAB_GAP;
      for (const [i, f] of frames.entries()) {
        expect(f.at).toEqual({ x: i * step, y: 0 });
        expect(f.el.style.position).toBe("absolute");
        expect(f.el.style.left).toBe(`${i * step}px`);
      }
      expect(LAB_GAP).toBeGreaterThan(0);
    } finally { stage.remove(); }
  });

  it("hộp A là ĐÚNG bản đang chạy, không phải bản chép tay", () => {
    /* Dựng lại `renderSpec` ở đúng toạ độ của hộp A rồi so từng ký tự: nếu mai này
       đường thật đổi cách viết mà mốc so sánh đứng yên thì cả phép đo lệch chuẩn. */
    const { frames, stage } = lab();
    const real = mountStage();
    try {
      const want = renderSpec({ ...spec, name: "A pct" }, URL_IMG, real, { x: 0, y: 0 });
      const got = boxOf(frames, "A");
      expect(got.style.cssText).toBe(want.style.cssText);
      expect(innerOf(got).style.cssText).toBe(innerOf(want).style.cssText);
      expect(got.getAttribute("aria-label")).toBe("A pct");
    } finally { real.remove(); stage.remove(); }
  });
});

describe("mỗi hộp khai ĐÚNG lá bài của riêng nó", () => {
  it("B — bốn mép px, KHÔNG khai cỡ (encoder xoá `width:auto` khỏi payload)", () => {
    const { frames, stage } = lab();
    try {
      const s = innerOf(boxOf(frames, "B")).style;
      expect(s.left).toBe("-36px");
      expect(s.top).toBe("-37.875px");
      expect(s.right).toBe(`${spec.frame.w - (spec.image.x + spec.image.w)}px`);
      expect(s.bottom).toBe(`${spec.frame.h - (spec.image.y + spec.image.h)}px`);
      expect(s.width).toBe("");
      expect(s.height).toBe("");
    } finally { stage.remove(); }
  });

  it("C — cùng hình học B nhưng viết bằng `inset` theo %", () => {
    const { frames, stage } = lab();
    try {
      const s = innerOf(boxOf(frames, "C")).style;
      expect(s.inset).toContain("%");
      expect(s.width).toBe("");
      expect(s.height).toBe("");
    } finally { stage.remove(); }
  });

  it("D — cỡ px kèm ma trận đơn vị", () => {
    const { frames, stage } = lab();
    try {
      const s = innerOf(boxOf(frames, "D")).style;
      expect(s.width).toBe("192px");
      expect(s.height).toBe("127.875px");
      expect(s.transform).toBe("scale(1)");
      expect(s.transformOrigin).toBe("0 0");
    } finally { stage.remove(); }
  });

  it("E — neo bằng TÂM THẬT của ảnh, không phải 50% cho tiện", () => {
    const { frames, stage } = lab();
    try {
      const s = innerOf(boxOf(frames, "E")).style;
      expect(s.transform).toBe("translate(-50%, -50%)");
      /* Tâm ảnh của ô này lệch khỏi tâm hộp ⇒ một hộp khai `50% 50%` sẽ vẽ ảnh
         SAI CHỖ và ảnh chụp không còn đem so với A được nữa. */
      expect(Number.parseFloat(s.left) / 100 * spec.frame.w)
        .toBeCloseTo(spec.image.x + spec.image.w / 2, 9);
      expect(Number.parseFloat(s.top) / 100 * spec.frame.h)
        .toBeCloseTo(spec.image.y + spec.image.h / 2, 9);
      expect(s.left).not.toBe("50%");
    } finally { stage.remove(); }
  });

  it("F và G — node ảnh THẬT, hai chế độ trải khác nhau", () => {
    const { frames, stage } = lab();
    try {
      const f = innerOf(boxOf(frames, "F"));
      const g = innerOf(boxOf(frames, "G"));
      expect(f.tagName).toBe("IMG");
      expect(g.tagName).toBe("IMG");
      expect(f.style.objectFit).toBe("cover");
      expect(g.style.objectFit).toBe("contain");
      expect((f as HTMLImageElement).src).toBe(URL_IMG);
      /* Hình học y hệt A: hai hộp chỉ được khác nhau đúng MỘT thứ đang đo. */
      expect(f.style.left).toBe(innerOf(boxOf(frames, "A")).style.left);
      expect(f.style.width).toBe(innerOf(boxOf(frames, "A")).style.width);
    } finally { stage.remove(); }
  });

  it("H — nền `cover`; I — nền khai cỡ và chỗ đặt bằng px trên MỘT tầng hộp", () => {
    const { frames, stage } = lab();
    try {
      expect(innerOf(boxOf(frames, "H")).style.backgroundSize).toBe("cover");
      const i = innerOf(boxOf(frames, "I")).style;
      expect(i.width).toBe("100%");
      expect(i.height).toBe("100%");
      expect(i.backgroundSize).toBe("192px 127.875px");
      expect(i.backgroundPosition).toBe("-36px -37.875px");
    } finally { stage.remove(); }
  });

  it("J — hộp NGOÀI không khai chiều cao, chỉ có bề rộng + tỉ lệ", () => {
    const { frames, stage } = lab();
    try {
      const j = boxOf(frames, "J");
      expect(j.style.width).toBe(`${spec.frame.w}px`);
      expect(j.style.height).toBe("");
      expect(j.style.aspectRatio).toBe(`${spec.frame.w} / ${spec.frame.h}`);
      /* Và mọi hộp còn lại vẫn khai đủ cả hai cạnh — J phải là ca DUY NHẤT. */
      const khac = frames.filter((f) => f.variant.code !== "J");
      expect(khac.every((f) => f.el.style.height === `${spec.frame.h}px`)).toBe(true);
    } finally { stage.remove(); }
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   CHUỖI ĐI VÀO BỘ NHỚ TẠM
   ──────────────────────────────────────────────────────────────────────────
   `captureElement` đòi layout thật nên không chạy dưới jsdom (`vendor/figma-h2d/
   README.md`, ràng buộc 1) — đó là lý do `encodeFigmaLab` nhận một cửa `capture`.
   Cửa ấy CHỈ thay bước đo; phần còn lại (xếp hộp, cổng kiểm, gói payload) là mã
   chạy thật. IR dưới đây chép đúng những khoá `walkElement` phát ra, và lấy CSS từ
   chính cây DOM vừa dựng, nên thứ được canh là lá bài THẬT của từng biến thể.
   ══════════════════════════════════════════════════════════════════════════ */
const camel = (dash: string) => dash.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());

function irOf(el: HTMLElement): H2DNode {
  const styles: Record<string, string> = {};
  for (let i = 0; i < el.style.length; i += 1) {
    const dash = el.style.item(i);
    styles[camel(dash)] = el.style.getPropertyValue(dash);
  }
  return {
    nodeType: 1,
    tag: el.tagName,
    attributes: { "aria-label": el.getAttribute("aria-label") ?? "" },
    styles,
    rect: { x: 0, y: 0, width: spec.frame.w, height: spec.frame.h },
    childNodes: [...el.children].map((c) => irOf(c as HTMLElement)),
  };
}

function docOf(el: HTMLElement): H2DDocument {
  return {
    root: irOf(el),
    documentRect: { x: 0, y: 0, width: spec.frame.w, height: spec.frame.h },
    viewportRect: { x: 0, y: 0, width: spec.frame.w, height: spec.frame.h },
    devicePixelRatio: 2, version: 2,
    assets: new Map([[URL_IMG, { url: URL_IMG, blob: new Blob(["png"], { type: "image/png" }) }]]),
  } as H2DDocument;
}

describe("payload chở đủ chín kiểu", () => {
  it("giải base64 ra: chín document rời, đủ chín tên hộp, đủ lá bài của từng hộp", async () => {
    const res = await encodeFigmaLab(spec, URL_IMG, { capture: (el) => Promise.resolve(docOf(el)) });

    expect(res.codes).toEqual(LAB_VARIANTS.map((v) => v.code));
    const open = res.html.indexOf(FIGH2D_OPEN) + FIGH2D_OPEN.length;
    const json = atob(res.html.slice(open, res.html.indexOf(FIGH2D_CLOSE)));

    /* MỘT DOCUMENT / MỘT HỘP — ràng buộc 3 của `vendor/figma-h2d/README.md`. */
    expect(JSON.parse(json).length).toBe(LAB_VARIANTS.length);
    for (const v of LAB_VARIANTS) expect(json).toContain(`"aria-label":"${v.label}"`);

    expect(json).toContain('"objectFit":"cover"');
    expect(json).toContain('"objectFit":"contain"');
    expect(json).toContain('"backgroundSize":"cover"');
    expect(json).toContain('"backgroundSize":"192px 127.875px"');
    expect(json).toContain('"backgroundPosition":"-36px -37.875px"');
    expect(json).toContain('"transform":"scale(1)"');
    expect(json).toContain('"transform":"translate(-50%, -50%)"');
    expect(json).toContain('"inset":');
    /* Ảnh vẫn được nhúng thật — chín hộp rỗng thì chụp màn cũng vô nghĩa. */
    expect(json).toContain('"base64Blob":"data:image/png;base64,');
    /* Sân khấu tự dọn: không để lại rác cho lượt dán thật ngay sau đó. */
    expect(document.querySelector("[aria-label='A pct']")).toBeNull();
  });

  it("đánh dấu nguồn RIÊNG — một lượt dán thử không được đọc nhầm thành lượt dán thật", async () => {
    const h2d = await loadFigmaH2D();
    const stage = mountStage();
    try {
      const { html } = await h2d.toFigmaClipboardHtml([docOf(renderLab(spec, URL_IMG, stage)[0]!.el)], {
        source: LAB_SOURCE,
      });
      expect(html).toContain("figmeta");
      expect(LAB_SOURCE).not.toBe("kitgen-cut-asset");
    } finally { stage.remove(); }
  });
});

describe("`assertDocShape` KHÔNG được gác thí nghiệm", () => {
  it("nó đo MỘT hình cố định ⇒ ném ngay ở hộp dùng node ảnh thật", () => {
    const { frames, stage } = lab();
    try {
      /* Đây chính là lý do `encodeFigmaLab` có cổng kiểm riêng: cái cổng của đường
         thật bắt "con đầu phải là một hộp mang nền ảnh", mà F/G cố ý không như thế. */
      expect(() => assertDocShape(docOf(boxOf(frames, "F")), spec)).toThrow();
      expect(() => assertLabDoc(docOf(boxOf(frames, "F")), LAB_VARIANTS[5]!)).not.toThrow();
    } finally { stage.remove(); }
  });

  it("cổng của thí nghiệm chỉ hỏi ĐÚNG một câu: ảnh có vào được payload không", () => {
    const { frames, stage } = lab();
    try {
      const doc = docOf(boxOf(frames, "A"));
      const rong = { ...doc, assets: new Map() } as H2DDocument;
      expect(() => assertLabDoc(rong, LAB_VARIANTS[0]!)).toThrow(/hộp rỗng/);
      const hong = {
        ...doc,
        assets: new Map([[URL_IMG, { url: URL_IMG, blob: null, error: "CORS" }]]),
      } as H2DDocument;
      expect(() => assertLabDoc(hong, LAB_VARIANTS[0]!)).toThrow(/CORS/);
    } finally { stage.remove(); }
  });
});
