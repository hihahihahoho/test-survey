import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyImageBlob, copyProjectImage, copyPromptText, referenceImages, toPngBlob } from "../prompt-copy";

/**
 * Test của HAI ĐƯỜNG COPY ở tab Prompt: chữ đi một đường, ảnh đi một đường.
 *
 * ╔══ VÌ SAO PHẢI KHOÁ CHỖ NÀY BẰNG TEST ════════════════════════════════════╗
 * ║ Bộ nhớ tạm là thứ KHÔNG TỰ TỐ CÁO khi hỏng: nút vẫn sáng, hộp báo vẫn      ║
 * ║ xanh, và người dùng chỉ biết mình mất công khi đã dán sang chỗ khác. Bản   ║
 * ║ trước nhét chữ và ảnh vào cùng một `ClipboardItem` và test cũ khoá đúng    ║
 * ║ hành vi ấy — test xanh, hiện trường vẫn mất ảnh, vì nơi dán chỉ lấy chữ.   ║
 * ║ Nên nay khoá đúng ba lời hứa CÒN LẠI, mỗi cái nhỏ nhưng kiểm được thật:   ║
 * ║   ① `referenceImages` giữ NGUYÊN thứ tự engine đã chọn, khử trùng lặp,    ║
 * ║      và không bao giờ để lọt một tấm khung xương ra màn hình;             ║
 * ║   ② copy chữ mà trình duyệt không cho ghi ⇒ NÉM, không im lặng báo xong;  ║
 * ║   ③ lấy ảnh vẫn đi qua `loadFull` (đường có header, agent mới không 403). ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO GIẢ LẬP `loadFull` CHỨ KHÔNG GIẢ LẬP `fetch` ════════════════════
 * `fetchProjectImage` đi qua `loadFull` để có header `X-KitGen-Client` (agent trả
 * 403 nếu thiếu). Ở test ta thay `loadFull` bằng một `data:` URL — `fetch` thật
 * của Node đọc được `data:` mà KHÔNG ra mạng, nên đường đi từ URL → Blob vẫn là
 * đường thật, chỉ có nguồn URL là giả. Giả luôn `fetch` thì phần ấy không còn
 * được kiểm nữa.
 */

const loadFull = vi.hoisted(() => vi.fn());
vi.mock("@/features/kit/lib/image-source", () => ({ loadFull }));

/** PNG 1×1 hợp lệ — đủ để `fetch('data:…')` dựng ra một Blob `image/png` thật. */
const PNG_1PX =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/** Dựng `navigator.clipboard` giả. `ok=false` = trình duyệt không cho ghi. */
function installClipboard(ok: boolean) {
  const writeText = vi.fn(async () => {});
  /* Gán thẳng vào `globalThis` chứ không `vi.stubGlobal("navigator")`: môi trường
     test là "node", ở đó `navigator` có sẵn và chỉ đọc — ta chỉ cần cắm thêm
     `clipboard` vào nó. */
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: ok ? { writeText } : {} },
    configurable: true,
    writable: true,
  });
  return writeText;
}

beforeEach(() => {
  loadFull.mockReset();
  loadFull.mockImplementation(() => ({ promise: Promise.resolve(PNG_1PX) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("referenceImages — chỉ lọc, KHÔNG dựng lại thứ tự", () => {
  it("giữ nguyên thứ tự engine đã ghi ra: ảnh nhân vật → ảnh dáng → bố cục → thương hiệu → gợi hứng", () => {
    const att = [
      "refs/mascot.png",
      "refs/pose-mascot.png",
      "refs/layout.png",
      "refs/logo.png",
      "refs/inspo.png",
    ];
    /* So bằng `toEqual` trên CẢ MẢNG chứ không `toContain` từng cái: thứ tự chính
       là thứ đang được khoá, và `toContain` sẽ xanh kể cả khi ta xáo tung nó. */
    expect(referenceImages(att)).toEqual(att);
  });

  it("một ảnh đóng hai vai (vừa là ảnh của tấm vừa là ảnh thương hiệu) chỉ hiện MỘT lần", () => {
    expect(referenceImages(["refs/logo.png", "refs/a.png", "refs/logo.png"])).toEqual([
      "refs/logo.png",
      "refs/a.png",
    ]);
  });

  it("engine bản cũ còn gửi tấm khung xương ⇒ không được bày ra cho người dùng dán", () => {
    expect(referenceImages(["skeleton/ui.png", "refs/mascot.png"])).toEqual(["refs/mascot.png"]);
  });

  it("dòng rỗng và khoảng trắng thừa của file trên đĩa không đẻ ra một ô ảnh trống", () => {
    /* `.att` được ghi kèm một dấu xuống dòng ở cuối, và agent tách theo "\n" —
       một chuỗi rỗng lọt vào đây sẽ thành một ô ảnh hỏng trên màn. */
    expect(referenceImages(["  refs/a.png  ", "", "   "])).toEqual(["refs/a.png"]);
  });

  it("không có ảnh nào ⇒ mảng rỗng, không phải null (nơi gọi đếm thẳng `.length`)", () => {
    expect(referenceImages([])).toEqual([]);
  });
});

describe("copy chữ — và PHẢI nói ra khi không copy được", () => {
  it("máy đủ sức: chữ vào bộ nhớ tạm NGUYÊN VĂN, không thêm bớt gì", async () => {
    const writeText = installClipboard(true);
    await copyPromptText("prompt của tấm");
    expect(writeText).toHaveBeenCalledWith("prompt của tấm");
  });

  it("trình duyệt không cho ghi: NÉM ra chữ người đọc hiểu được, không im lặng báo xong", async () => {
    installClipboard(false);
    await expect(copyPromptText("x")).rejects.toThrow(/bộ nhớ tạm/);
  });
});

describe("lấy ảnh lẻ — vẫn đi đường có header", () => {
  it("copyProjectImage gọi loadFull đúng dự án + đường dẫn, và trả về PNG thật", async () => {
    const blob = await copyProjectImage("p1", "refs/mascot.png");
    expect(loadFull).toHaveBeenCalledWith("p1", "refs/mascot.png");
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });
});

describe("copy ảnh — bộ nhớ tạm chỉ nhận PNG, ảnh JPG phải được vẽ lại", () => {
  /* Hiện trường 10/09/2026: «Copy ảnh» trên ảnh nhân vật JPG ⇒ Chrome ném
     "Type image/png does not match the blob's type image/jpeg" và người dùng thấy
     nguyên câu ấy trong toast. Hai ca dưới giả lập đúng phần trình duyệt làm
     (createImageBitmap + OffscreenCanvas) để kiểm phần ta làm: JPG đi qua canvas
     ra PNG, PNG đi thẳng không nén lại. */
  const g = globalThis as Record<string, unknown>;
  let saved: Record<string, unknown>;
  beforeEach(() => {
    saved = { createImageBitmap: g["createImageBitmap"], OffscreenCanvas: g["OffscreenCanvas"] };
    g["createImageBitmap"] = vi.fn(async () => ({ width: 2, height: 1, close: vi.fn() }));
    g["OffscreenCanvas"] = class {
      constructor(public width: number, public height: number) {}
      getContext() { return { drawImage: vi.fn() }; }
      async convertToBlob() { return new Blob(["png"], { type: "image/png" }); }
    };
  });
  afterEach(() => {
    g["createImageBitmap"] = saved["createImageBitmap"];
    g["OffscreenCanvas"] = saved["OffscreenCanvas"];
  });

  it("JPG ⇒ đi qua canvas, ra Blob image/png", async () => {
    const out = await toPngBlob(new Blob(["jpg"], { type: "image/jpeg" }));
    expect(out.type).toBe("image/png");
    expect(g["createImageBitmap"]).toHaveBeenCalledTimes(1);
  });

  it("PNG ⇒ trả về NGUYÊN blob, không giải mã lại (giữ alpha, giữ byte)", async () => {
    const png = new Blob(["png"], { type: "image/png" });
    expect(await toPngBlob(png)).toBe(png);
    expect(g["createImageBitmap"]).not.toHaveBeenCalled();
  });

  it("copyImageBlob ghi PNG đã chuyển vào ClipboardItem, không ghi blob JPG gốc", async () => {
    const write = vi.fn(async () => undefined);
    const savedClip = { ClipboardItem: g["ClipboardItem"], clipboard: navigator.clipboard };
    g["ClipboardItem"] = class { constructor(public items: Record<string, Blob>) {} };
    Object.defineProperty(navigator, "clipboard", { value: { write }, configurable: true });
    try {
      const res = await copyImageBlob(new Blob(["jpg"], { type: "image/jpeg" }), "a.jpg");
      expect(res.outcome).toBe("clipboard");
      const item = (write.mock.calls[0] as unknown as [Array<{ items: Record<string, Blob> }>])[0][0];
      expect(item?.items["image/png"]?.type).toBe("image/png");
    } finally {
      g["ClipboardItem"] = savedClip.ClipboardItem;
      Object.defineProperty(navigator, "clipboard", { value: savedClip.clipboard, configurable: true });
    }
  });
});
