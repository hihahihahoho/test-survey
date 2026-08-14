import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

/**
 * ══ #21 LÁT 1 — PAYLOAD CỦA CẢ MỘT MÀN, ĐO TRONG CHROMIUM THẬT ══════════════
 *
 * Test đơn vị đã chốt SỐ HỌC (`features/demo/__tests__/resolve-scene.test.ts`) và
 * HÌNH DẠNG DOM (`scene-dom.test.ts`). Ca này chạy nốt đoạn không giả lập được:
 *
 *   spec + manifest thật → DOM thật → `figmaH2D.captureElement` thật
 *   → `toFigmaClipboardHtml` thật → giải base64 khối `figh2d` → soi lại từng con số.
 *
 * KHÔNG cần Figma, KHÔNG cần quyền clipboard, KHÔNG cần agent: dừng ngay trước
 * `clipboard.write` (thứ cần chứng minh là NỘI DUNG payload), trang thử do
 * `page.route` phục vụ cùng origin với dev server nên `import("/src/…")` đi qua Vite
 * như trong app thật.
 *
 * ⚠️ Ảnh ở đây là canvas một màu đúng cỡ pixel thật, KHÔNG phải PNG của kit. Vì vậy
 * `bytes` đo được ở cuối KHÔNG phải ngân sách payload thật (~6.3 MB cho một màn, đo
 * trên kit `ipay` — `docs/design-demo-to-figma-2026-08.md` §4.8); ở đây nó chỉ chứng
 * minh chuỗi clipboard được dựng ra và mọi ảnh đã nhúng thành công.
 */

type Asset = {
  file: string; canvas: number[]; cell: number[]; bleed: number[];
  content: number[]; content_at: number[]; safe: number[];
};

/* Manifest THẬT của kit `ipay` — cùng fixture với test đơn vị, không có số bịa nào. */
const FIXTURE = fileURLToPath(
  new URL("../../src/features/demo/__tests__/fixtures/kits-4.manifest.json", import.meta.url),
);
const assets = (JSON.parse(readFileSync(FIXTURE, "utf8")) as {
  styles: Record<string, { assets: Asset[] }>;
}).styles["ipay"]!.assets;

/** Dựng bản ghi như #42 `GET /api/projects/:id/kit` phát ra cho bản `tight/`. */
const FILES = assets.map((a) => {
  const bare = a.file.replace(/\.png$/, "");
  return {
    file: `tight/${bare}`,
    path: `kits/chinh/tight/${a.file}`,
    w: a.content[0], h: a.content[1], bytes: 1, sheet: "main", cellIndex: null,
    safe: a.safe, contentAt: a.content_at, content: a.content,
    canvas: a.canvas, cell: a.cell, bleed: a.bleed, empty: false,
  };
});

/** Tính tay từ manifest — xem đối chiếu từng bước ở `resolve-scene.test.ts`. */
const CTA = {
  name: "01-btn-pill-red",
  frame: { w: 300, h: 102 },
  /** vị trí frame trong khung màn 400×600 */
  at: { x: 50, y: 495 },
  /** ảnh lệch so với frame: dương trên trục x, ÂM trên trục y (trang trí tràn lên) */
  image: { x: 26, y: -3, w: 248, h: 110 },
};
const LAYER_NAMES = [
  "50-counter-pill", "04-btn-circle", "10-popup-ribbon", "pose-taxi-wave",
  "07-progress-track", "08-progress-fill", "01-btn-pill-red",
];

const BLANK = `<!doctype html><meta charset="utf-8"><title>demo</title><body style="margin:0">`;

interface Probe {
  mode: string;
  bytes: number;
  docCount: number;
  stageLeft: boolean;
  markers: { figmeta: boolean; figh2d: boolean };
  docs: Array<{
    label: string | undefined;
    tag: string | undefined;
    rect: { x: number; y: number; width: number; height: number };
    overflow: string | undefined;
    images: number;
    /** nhãn của các frame con trực tiếp */
    children: Array<string | undefined>;
    texts: string[];
    borderImages: number;
    transforms: number;
    assets: Array<{ type: string | null; isDataUrl: boolean; error: string | null }>;
    /** ô nút chơi: rect tuyệt đối của frame và của ảnh bên trong */
    cta: { frame: { x: number; y: number; width: number; height: number }; image: { x: number; y: number; width: number; height: number } } | null;
  }>;
}

async function probe(page: import("@playwright/test").Page, mode: "nested" | "flat"): Promise<Probe> {
  return page.evaluate(async (input) => {
    const resolve = await import("/src/features/demo/lib/resolve-scene.ts");
    const figma = await import("/src/features/demo/lib/scene-figma.ts");
    const dom = await import("/src/features/demo/lib/scene-dom.ts");
    const data = await import("/src/features/demo/data/screens.default.ts");
    const node = await import("/src/features/workflow-v4/lib/figma-node.ts");

    const scene = resolve.resolveScene(
      data.screenSpecById("home")!, input.files as never, { char: "taxi" },
    );

    /* PNG THẬT đúng cỡ ruột của từng ô — không dùng ảnh 1×1, vì cỡ ảnh sai sẽ che mất
       lớp lỗi "encoder tự suy kích thước từ ảnh thay vì từ CSS". */
    const sizeOf = new Map(input.files.map((f) => [f.path, { w: f.w, h: f.h }]));
    const urls = new Map<string, string>();
    for (const path of dom.scenePaths(scene)) {
      const size = sizeOf.get(path)!;
      const cv = document.createElement("canvas");
      cv.width = size.w;
      cv.height = size.h;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "rgba(255,0,0,0.6)";
      ctx.fillRect(0, 0, cv.width, cv.height);
      urls.set(path, cv.toDataURL("image/png"));
    }

    const out = await figma.encodeScenes([scene], urls, input.mode as "nested" | "flat");
    const stageLeft = document.getElementById(node.STAGE_ID) !== null;

    /* Giải khối `figh2d`: <span data-h2d="<!--(figh2d)BASE64(/figh2d)-->"> */
    const parsed = new DOMParser().parseFromString(out.html, "text/html");
    const raw = parsed.querySelector("[data-h2d]")?.getAttribute("data-h2d") ?? "";
    const slice = (s: string, open: string, close: string) =>
      s.slice(s.indexOf(open) + open.length, s.lastIndexOf(close));
    const docs = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(slice(raw, "<!--(figh2d)", "(/figh2d)-->")), (c) => c.charCodeAt(0)),
    )) as Array<Record<string, never>>;

    type N = { tag?: string; nodeType: number; text?: string; attributes?: Record<string, string>; styles?: Record<string, string>; rect?: { x: number; y: number; width: number; height: number }; childNodes?: N[] };
    const walk = (n: N | undefined, visit: (x: N) => void) => {
      if (!n) return;
      visit(n);
      for (const c of n.childNodes ?? []) walk(c, visit);
    };

    return {
      mode: out.mode,
      bytes: out.bytes,
      docCount: docs.length,
      stageLeft,
      markers: {
        figmeta: out.html.includes("<!--(figmeta)") && out.html.includes("(/figmeta)-->"),
        figh2d: out.html.includes("<!--(figh2d)") && out.html.includes("(/figh2d)-->"),
      },
      docs: docs.map((d) => {
        const root = (d as unknown as { root: N }).root;
        let images = 0, borderImages = 0, transforms = 0;
        const texts: string[] = [];
        let cta: Probe["docs"][number]["cta"] = null;
        walk(root, (n) => {
          if (n.tag === "IMG") images += 1;
          /* Text node của encoder mang chữ ở khoá `text` (`walkText:1049-1055`),
             KHÔNG phải `content` — nhầm khoá thì mảng rỗng mà không ai biết. */
          if (n.nodeType === 3 && typeof n.text === "string" && n.text.trim() !== "") {
            texts.push(n.text.trim());
          }
          const s = n.styles ?? {};
          if (typeof s["borderImageSource"] === "string" && s["borderImageSource"] !== "none") borderImages += 1;
          if (typeof s["transform"] === "string" && s["transform"] !== "none") transforms += 1;
          if (n.attributes?.["aria-label"] === input.ctaName) {
            const im = (n.childNodes ?? []).find((c) => c.tag === "IMG");
            if (n.rect && im?.rect) cta = { frame: n.rect, image: im.rect };
          }
        });
        return {
          label: root.attributes?.["aria-label"],
          tag: root.tag,
          rect: root.rect!,
          overflow: root.styles?.["overflow"],
          images,
          children: (root.childNodes ?? []).filter((c) => c.nodeType === 1).map((c) => c.attributes?.["aria-label"]),
          texts,
          borderImages,
          transforms,
          assets: Object.values(
            (d as unknown as { assets: Record<string, { blob: { base64Blob?: string; type?: string } | null; error?: string }> }).assets,
          ).map((a) => ({
            type: a.blob?.type ?? null,
            isDataUrl: Boolean(a.blob?.base64Blob?.startsWith("data:")),
            error: a.error ?? null,
          })),
          cta,
        };
      }),
    };
  }, { files: FILES, mode, ctaName: CTA.name });
}

test.beforeEach(async ({ page }) => {
  await page.route("**/__demo-payload", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: BLANK }));
  await page.goto("/__demo-payload");
});

test("màn Home ra MỘT document: frame màn clip ON, mỗi ô một frame con đúng hitbox", async ({ page }, testInfo) => {
  const out = await probe(page, "nested");
  const doc = out.docs[0]!;

  /* ① Payload đúng định dạng Figma đọc được, đúng MỘT document. */
  expect(out.markers).toEqual({ figmeta: true, figh2d: true });
  expect(out.docCount).toBe(1);
  expect(out.stageLeft).toBe(false);

  /* ② ROOT là frame MÀN: tên đến từ `aria-label`, cỡ đúng khung, clip BẬT. */
  expect(doc.tag).toBe("DIV");
  expect(doc.label).toBe("Màn HOME");
  expect(doc.rect.width).toBeCloseTo(400, 1);
  expect(doc.rect.height).toBeCloseTo(600, 1);
  expect(doc.overflow).toBe("hidden");

  /* ③ Cây LỒNG NHAU đi qua nguyên vẹn: nền + 7 ô, mỗi ô một frame có tên riêng.
        (Figma bên nhận có giữ đúng cấu trúc này không là rủi ro R1 — chỉ đo được
        bằng cách dán thật; xem mục #21 trong `docs/BACKLOG.md`.) */
  expect(doc.children).toEqual(["Nền · Màn HOME", ...LAYER_NAMES]);
  expect(doc.images).toBe(8);

  /* ④ Chữ ra TEXT NODE thật, không bị nướng vào ảnh. */
  expect(doc.texts).toEqual(["1.250", "SĂN QUÀ MAY MẮN", "CHƠI NGAY"]);

  /* ⑤ Ô nút chơi: frame đúng hitbox, ảnh lệch ÂM trục y và KHÔNG bị co về vừa khung. */
  const cta = doc.cta!;
  expect(cta.frame.width).toBeCloseTo(CTA.frame.w, 1);
  expect(cta.frame.height).toBeCloseTo(CTA.frame.h, 1);
  expect(cta.frame.x - doc.rect.x).toBeCloseTo(CTA.at.x, 1);
  expect(cta.frame.y - doc.rect.y).toBeCloseTo(CTA.at.y, 1);
  expect(cta.image.x - cta.frame.x).toBeCloseTo(CTA.image.x, 1);
  expect(cta.image.y - cta.frame.y).toBeCloseTo(CTA.image.y, 1);
  expect(cta.image.width).toBeCloseTo(CTA.image.w, 1);
  expect(cta.image.height).toBeCloseTo(CTA.image.h, 1);

  /* ⑥ Hai thứ bị cấm không có mặt trong payload (xem `scene-dom.ts` §luật). */
  expect(doc.borderImages).toBe(0);
  expect(doc.transforms).toBe(0);

  /* ⑦ TÁM ảnh đã NHÚNG thật dưới dạng `{ base64Blob, type }` — không ô nào lỗi. */
  expect(doc.assets).toHaveLength(8);
  for (const a of doc.assets) expect(a).toEqual({ type: "image/png", isDataUrl: true, error: null });

  testInfo.annotations.push({ type: "payload", description: `nested · 1 doc · ${out.bytes} byte (ảnh thử là canvas một màu)` });
});

test("chế độ flat: N+1 document rời mà VỊ TRÍ vẫn đúng — đường lùi cho R1", async ({ page }, testInfo) => {
  const out = await probe(page, "flat");

  /* Nền + 7 ô = 8 document, thứ tự dán giữ nền nằm dưới. */
  expect(out.docCount).toBe(8);
  expect(out.docs.map((d) => d.label)).toEqual(["Nền · Màn HOME", ...LAYER_NAMES]);
  expect(out.docs.every((d) => d.tag === "DIV")).toBe(true);

  /* Mỗi ô một ảnh, và ô lẻ thì clip TẮT (trang trí tràn ra ngoài hitbox vẫn thấy). */
  for (const d of out.docs.slice(1)) {
    expect(d.images).toBe(1);
    expect(d.overflow).not.toBe("hidden");
    expect(d.assets).toHaveLength(1);
    expect(d.assets[0]!.error).toBeNull();
  }

  /**
   * ĐIỀU PHẢI CHỨNG MINH của đường lùi: root không có ma trận cha nên `computeRect`
   * trả toạ độ viewport tuyệt đối (`figma-h2d.global.js:858-861`) ⇒ tám document rời
   * vẫn giữ NGUYÊN vị trí tương đối của chúng trên màn. Mất một tầng nhóm, không mất
   * bố cục — người dùng tự Ctrl/Cmd+G.
   */
  const bg = out.docs[0]!;
  const cta = out.docs.find((d) => d.label === CTA.name)!;
  expect(cta.rect.x - bg.rect.x).toBeCloseTo(CTA.at.x, 1);
  expect(cta.rect.y - bg.rect.y).toBeCloseTo(CTA.at.y, 1);
  expect(cta.rect.width).toBeCloseTo(CTA.frame.w, 1);
  expect(bg.rect.width).toBeCloseTo(400, 1);
  expect(bg.rect.height).toBeCloseTo(600, 1);

  testInfo.annotations.push({ type: "payload", description: `flat · 8 doc · ${out.bytes} byte (ảnh thử là canvas một màu)` });
});
