import { expect, test } from "@playwright/test";

/**
 * ══ P3-14 — PAYLOAD CLIPBOARD FIGMA, ĐO TRONG CHROMIUM THẬT ═════════════════
 *
 * Test đơn vị (`src/features/workflow-v4/lib/__tests__/figma-node.test.ts`) đã chốt
 * SỐ HỌC safe zone bằng kit thật. Nhưng số học đúng mà encoder không chạy, hoặc chạy
 * ra một cây khác, thì người dùng vẫn nhận rác. Ca này chạy ĐƯỜNG THẬT:
 *
 *   DOM thật → `figmaH2D.captureElement` thật → `toFigmaClipboardHtml` thật
 *   → giải base64 khối `figh2d` → soi lại từng con số trong IR.
 *
 * KHÔNG cần Figma và KHÔNG cần quyền clipboard: dừng ngay trước `clipboard.write`,
 * vì thứ cần chứng minh là **nội dung** payload, không phải cơ chế ghi bộ nhớ tạm.
 *
 * Trang thử là một trang trống do `page.route` phục vụ, CÙNG ORIGIN với dev server,
 * nên `import("/src/…")` đi qua Vite như trong app thật mà không phải dựng cả React
 * shell (và không phụ thuộc agent có chạy hay không).
 */

/* Ô THẬT của kit `blindtest-a-trung-thu-candy` — `15-reward-giftbox`, bản `tight/`.
   Chọn ô này vì nó là ca khó nhất: ruột 787×704 TO HƠN hitbox 737×696 ⇒ ảnh phải
   lệch ÂM cả hai trục và tràn ra ngoài frame. */
const ASSET = {
  file: "tight/15-reward-giftbox",
  path: "kits/chinh/tight/15-reward-giftbox.png",
  w: 787, h: 704,
  safe: [675, 348, 737, 696],
  contentAt: [648, 341],
  content: [787, 704],
  canvas: [2088, 1392],
  cell: [1536, 1024],
  bleed: [276, 184],
};
/** UI ⇒ 50% (`export-scale.ts`). Tính tay: frame 368.5×348, ảnh (−13.5,−3.5) 393.5×352. */
const EXPECTED = {
  frame: { w: 368.5, h: 348 },
  image: { x: -13.5, y: -3.5, w: 393.5, h: 352 },
};

const BLANK = `<!doctype html><meta charset="utf-8"><title>h2d</title><body style="margin:0">`;

test("Copy to Figma dựng node thật: frame = safe zone, ảnh lệch âm, clip tắt", async ({ page }) => {
  await page.route("**/__h2d-payload", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: BLANK }));
  await page.goto("/__h2d-payload");

  const out = await page.evaluate(async (input) => {
    const mod = await import("/src/features/workflow-v4/lib/figma-node.ts");

    /* PNG THẬT đúng cỡ ruột (787×704) — không dùng ảnh 1×1, vì cỡ ảnh sai sẽ che
       mất chính lớp lỗi "encoder tự suy kích thước từ ảnh thay vì từ CSS". */
    const cv = document.createElement("canvas");
    cv.width = input.asset.w;
    cv.height = input.asset.h;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "rgba(255,0,0,0.6)";
    ctx.fillRect(0, 0, cv.width, cv.height);
    const url = cv.toDataURL("image/png");

    const spec = mod.buildFigmaNodeForAsset(input.asset as never);
    const { html } = await mod.encodeFigmaNode(spec, url);

    /* Sân khấu phải được dọn sạch — không để lại rác trong DOM của app. */
    const stageLeft = document.getElementById(mod.STAGE_ID) !== null;

    /* Giải khối `figh2d`: <span data-h2d="<!--(figh2d)BASE64(/figh2d)-->"> */
    const doc = new DOMParser().parseFromString(html, "text/html");
    const rawH2d = doc.querySelector("[data-h2d]")?.getAttribute("data-h2d") ?? "";
    const rawMeta = doc.querySelector("[data-metadata]")?.getAttribute("data-metadata") ?? "";
    const b64 = (s: string, open: string, close: string) =>
      s.slice(s.indexOf(open) + open.length, s.lastIndexOf(close));
    const decode = (s: string) =>
      JSON.parse(new TextDecoder().decode(
        Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
      ));

    const docs = decode(b64(rawH2d, "<!--(figh2d)", "(/figh2d)-->"));
    const meta = decode(b64(rawMeta, "<!--(figmeta)", "(/figmeta)-->"));
    const root = docs[0].root;
    const img = root.childNodes.find((n: { tag?: string }) => n.tag === "IMG");

    return {
      spec, stageLeft, meta,
      markers: {
        figmeta: html.includes("<!--(figmeta)") && html.includes("(/figmeta)-->"),
        figh2d: html.includes("<!--(figh2d)") && html.includes("(/figh2d)-->"),
      },
      docCount: docs.length,
      root: {
        tag: root.tag, rect: root.rect,
        label: root.attributes?.["aria-label"],
        overflow: root.styles?.overflow,
      },
      img: { tag: img?.tag, rect: img?.rect, alt: img?.attributes?.alt },
      /* offset của ảnh SO VỚI frame — đây mới là con số hợp đồng nói tới. */
      offset: { x: img.rect.x - root.rect.x, y: img.rect.y - root.rect.y },
      /* `serializeDocument` phát `assets` là OBJECT khoá theo URL ảnh, không phải mảng. */
      assets: Object.values(
        docs[0].assets as Record<string, { blob: { base64Blob?: string; type?: string } | null; error?: string }>,
      ).map((a) => ({
        type: a.blob?.type ?? null,
        isDataUrl: Boolean(a.blob?.base64Blob?.startsWith("data:")),
        error: a.error ?? null,
      })),
    };
  }, { asset: ASSET });

  /* ① Số học đi qua trình duyệt vẫn đúng như test đơn vị tính tay. */
  expect(out.spec.frame).toEqual(EXPECTED.frame);
  expect(out.spec.image).toEqual(EXPECTED.image);
  expect(out.spec.clipsContent).toBe(false);
  expect(out.spec.source).toBe("tight");

  /* ② Payload đúng định dạng Figma đọc được: hai khối, một document. */
  expect(out.markers).toEqual({ figmeta: true, figh2d: true });
  expect(out.meta.dataType).toBe("h2d");
  expect(out.docCount).toBe(1);

  /* ③ ROOT là frame safe zone — Figma chỉ giữ wrapper trong suốt khi nó là root. */
  expect(out.root.tag).toBe("DIV");
  expect(out.root.label).toBe("15-reward-giftbox");
  expect(out.root.rect.width).toBeCloseTo(EXPECTED.frame.w, 1);
  expect(out.root.rect.height).toBeCloseTo(EXPECTED.frame.h, 1);

  /* ④ Clip content = OFF ⇒ decoration tràn ra ngoài frame vẫn thấy (§3.3). */
  expect(out.root.overflow).not.toBe("hidden");

  /* ⑤ Ảnh là IMG raster, đặt LỆCH ÂM đúng `contentAt − safe`, KHÔNG bị kéo méo. */
  expect(out.img.tag).toBe("IMG");
  expect(out.offset.x).toBeCloseTo(EXPECTED.image.x, 1);
  expect(out.offset.y).toBeCloseTo(EXPECTED.image.y, 1);
  expect(out.img.rect.width).toBeCloseTo(EXPECTED.image.w, 1);
  expect(out.img.rect.height).toBeCloseTo(EXPECTED.image.h, 1);
  // tràn thật: ảnh rộng hơn frame ⇒ nếu clip bật thì hình bị cắt cụt
  expect(out.img.rect.width).toBeGreaterThan(out.root.rect.width);

  /* ⑥ Ảnh ĐÃ NHÚNG vào payload dưới dạng `{ base64Blob, type }` — đúng thứ trình
        phân tích H2D của Figma đòi (chú thích cuối `figma-h2d.global.js`). */
  expect(out.assets).toHaveLength(1);
  expect(out.assets[0]).toEqual({ type: "image/png", isDataUrl: true, error: null });

  /* ⑦ Sân khấu tàng hình được dọn — không để lại node rác trong trang. */
  expect(out.stageLeft).toBe(false);
});
