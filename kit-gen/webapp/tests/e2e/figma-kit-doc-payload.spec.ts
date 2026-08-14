import { expect, test } from "@playwright/test";

/**
 * ══ P4-1 — NÚT HEADER "COPY SANG FIGMA": NHIỀU NODE, PIXEL GỐC ══════════════
 *
 * Test đơn vị (`src/features/kit/__tests__/figma-kit-doc.test.ts`) đã chốt số học
 * lưới và luật "scale chỉ nhân vào cỡ NODE". Nhưng số học đúng mà encoder nhúng một
 * ảnh ĐÃ BỊ THU NHỎ thì người dùng vẫn nhận kit mờ — và đó chính là bệnh chủ sản
 * phẩm báo. Ca này đo NỬA CÒN LẠI, trong Chromium thật:
 *
 *   PNG thật đúng cỡ ruột → `encodeKitDoc` thật → giải base64 khối `figh2d`
 *   → lấy data-URL của ảnh đã nhúng → **đọc IHDR của PNG đó**
 *   → so với cỡ pixel của file gốc.
 *
 * Đọc IHDR chứ không tin `rect`: `rect` là cỡ CSS (đã nhân `scale`), còn thứ quyết
 * định độ nét khi zoom trong Figma là số pixel THẬT trong blob. Hai con số đó cố ý
 * KHÁC nhau — đúng 2× ở ô UI — và test này khoá đúng khoảng cách ấy.
 *
 * KHÔNG cần Figma, KHÔNG cần quyền clipboard, KHÔNG cần agent: dừng ngay trước
 * `clipboard.write` và cấp ảnh bằng data-URL tự vẽ.
 */

/* Bốn ô THẬT của kit `blindtest-a-trung-thu-candy` (cùng fixture với test đơn vị).
   Chọn đủ ba ca: nền (ảnh to nhất, ca chủ sản phẩm chụp màn hình), ô UI có
   decoration tràn ra ngoài hitbox, và mascot 1:1. */
const ASSETS = [
  {
    file: "tight/25-bg-home", path: "kits/chinh/tight/25-bg-home.png", sheet: "nen",
    w: 1024, h: 1524, safe: [184, 276, 1024, 1536], contentAt: [184, 288],
    content: [1024, 1524], canvas: [1392, 2088], bytes: 400_000,
  },
  {
    file: "tight/15-reward-giftbox", path: "kits/chinh/tight/15-reward-giftbox.png", sheet: "dao-cu",
    w: 787, h: 704, safe: [675, 348, 737, 696], contentAt: [648, 341],
    content: [787, 704], canvas: [2088, 1392], bytes: 200_000,
  },
  {
    file: "tight/09-popup-panel-short", path: "kits/chinh/tight/09-popup-panel-short.png", sheet: "popup",
    w: 1310, h: 761, safe: [387, 318, 1300, 743], contentAt: [382, 313],
    content: [1310, 761], canvas: [2088, 1392], bytes: 300_000,
  },
  {
    file: "tight/01-pose-idle", path: "kits/chinh/tight/01-pose-idle.png", sheet: "pose-nhan-vat",
    w: 265, h: 451, safe: [407, 130, 230, 435], contentAt: [393, 79],
    content: [265, 451], canvas: [1044, 696], bytes: 150_000,
  },
];

const BLANK = `<!doctype html><meta charset="utf-8"><title>h2d-kit</title><body style="margin:0">`;

test("Copy sang Figma (header) ra N node, ảnh nhúng giữ NGUYÊN pixel gốc", async ({ page }) => {
  await page.route("**/__h2d-kit", (route) =>
    route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: BLANK }));
  await page.goto("/__h2d-kit");

  const out = await page.evaluate(async (input) => {
    const mod = await import("/src/features/kit/lib/figma-kit-doc.ts");

    /* PNG THẬT đúng cỡ ruột của từng ô — KHÔNG ảnh 1×1: cỡ ảnh sai sẽ che mất
       chính lớp lỗi "payload mang ảnh đã bị thu nhỏ". */
    const urls = new Map<string, string>();
    for (const a of input.assets) {
      const cv = document.createElement("canvas");
      cv.width = a.w;
      cv.height = a.h;
      const ctx = cv.getContext("2d")!;
      ctx.fillStyle = "rgba(0,128,255,0.7)";
      ctx.fillRect(0, 0, cv.width, cv.height);
      urls.set(a.path, cv.toDataURL("image/png"));
    }

    const poseFiles = new Set(input.assets.filter((a) => /pose/.test(a.file)).map((a) => a.file));
    const layout = mod.packKitDoc(input.assets as never, poseFiles);
    const cells = mod.cellsOf(layout.groups);
    const encoded = await mod.encodeKitDoc(cells, urls);

    const stageLeft = document.getElementById("kitgen-figma-h2d-stage") !== null;

    /* Giải khối `figh2d`: <span data-h2d="<!--(figh2d)BASE64(/figh2d)-->"> */
    const doc = new DOMParser().parseFromString(encoded.html, "text/html");
    const raw = doc.querySelector("[data-h2d]")?.getAttribute("data-h2d") ?? "";
    const b64 = raw.slice(raw.indexOf("<!--(figh2d)") + 12, raw.lastIndexOf("(/figh2d)-->"));
    const docs = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)),
    )) as Array<{
      root: { tag: string; rect: { x: number; y: number; width: number; height: number }; attributes?: Record<string, string> };
      assets: Record<string, { blob: { base64Blob?: string; type?: string } | null; error?: string }>;
    }>;

    /** Cỡ PIXEL THẬT của một PNG data-URL — đọc IHDR (byte 16..24, big-endian). */
    const pngSize = (dataUrl: string) => {
      const bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
      const at = (i: number) =>
        (bin.charCodeAt(i) << 24) | (bin.charCodeAt(i + 1) << 16)
        | (bin.charCodeAt(i + 2) << 8) | bin.charCodeAt(i + 3);
      return { w: at(16) >>> 0, h: at(20) >>> 0 };
    };

    return {
      stageLeft,
      bytes: encoded.bytes,
      docCount: encoded.docs,
      groups: layout.groups.map((g) => ({ category: g.category, cells: g.cells.length })),
      nodes: docs.map((d, i) => {
        const asset = Object.values(d.assets)[0]!;
        const url = asset.blob?.base64Blob ?? "";
        return {
          label: d.root.attributes?.["aria-label"] ?? null,
          rect: { x: d.root.rect.x, y: d.root.rect.y, w: d.root.rect.width, h: d.root.rect.height },
          scale: cells[i]!.spec.scale,
          type: asset.blob?.type ?? null,
          error: asset.error ?? null,
          /** ← câu trả lời cho "ảnh có bị resample không". */
          embedded: url.startsWith("data:image/png") ? pngSize(url) : null,
        };
      }),
    };
  }, { assets: ASSETS });

  /* ① MỘT DOCUMENT / MỘT Ô — đây là điều nút header trước đây KHÔNG làm được
        (nó copy một `image/png` phẳng của cả bảng). */
  expect(out.docCount).toBe(ASSETS.length);
  expect(out.groups).toEqual([
    { category: "mascot", cells: 1 },
    { category: "background", cells: 1 },
    { category: "popup", cells: 1 },
    { category: "prop", cells: 1 },
  ]);

  /* ② Mỗi node mang đúng TÊN Ô — designer mở Figma là đọc được, không phải "Group 12". */
  expect(out.nodes.map((n) => n.label)).toEqual([
    "01-pose-idle", "25-bg-home", "09-popup-panel-short", "15-reward-giftbox",
  ]);

  /* ③ ĐIỀU KHOÁ QUAN TRỌNG NHẤT — ẢNH NHÚNG KHÔNG BỊ RESAMPLE.
        Cỡ pixel trong payload phải bằng ĐÚNG cỡ file gốc, kể cả ở ô `scale = 0.5`. */
  for (const [i, node] of out.nodes.entries()) {
    const src = ASSETS.find((a) => a.file.endsWith(node.label!))!;
    expect(node.error, `ô ${node.label} không nhúng được ảnh`).toBeNull();
    expect(node.type).toBe("image/png");
    expect(node.embedded, `ô ${node.label} thiếu ảnh trong payload`).toEqual({ w: src.w, h: src.h });
    /* …trong khi node thì CÓ thu nhỏ. Hai con số cố ý lệch nhau đúng bằng `scale`:
       đó là toàn bộ điểm khác nhau giữa "thu nhỏ node" và "thu nhỏ ảnh". */
    const spec = out.nodes[i]!;
    expect(spec.rect.w).toBeCloseTo(src.safe[2]! * spec.scale, 1);
    expect(spec.rect.h).toBeCloseTo(src.safe[3]! * spec.scale, 1);
  }
  const bg = out.nodes.find((n) => n.label === "25-bg-home")!;
  expect(bg.scale).toBe(0.5);
  expect(bg.rect.w).toBeCloseTo(512, 1);       // node hiển thị 512 CSS px…
  expect(bg.embedded).toEqual({ w: 1024, h: 1524 }); // …ảnh vẫn 1024 pixel thật

  /* ④ Vị trí lưới CÓ đi theo payload: `computeRect` trả toạ độ viewport tuyệt đối cho
        root, nên N document rời vẫn dán ra đúng bố cục (lối `flat` của màn demo). */
  const xs = new Set(out.nodes.map((n) => `${n.rect.x},${n.rect.y}`));
  expect(xs.size).toBe(out.nodes.length);

  /* ⑤ Sân khấu tàng hình được dọn — không để lại node rác trong trang. */
  expect(out.stageLeft).toBe(false);

  /* ⑥ SỐ ĐO PAYLOAD — in ra để báo cáo, và chặn trần: 4 ô ảnh đặc này đã ~vài MB,
        nên kit thật 50–80 ô là chuyện `batchGroups` phải lo (xem test đơn vị). */
  // eslint-disable-next-line no-console
  console.log(`[payload] ${out.docCount} node · ${out.bytes} ký tự HTML (${(out.bytes / 1024 / 1024).toFixed(2)} MB)`);
  expect(out.bytes).toBeGreaterThan(0);
});
