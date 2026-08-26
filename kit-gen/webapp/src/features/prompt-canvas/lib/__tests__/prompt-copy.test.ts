import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { copyPromptWithImage, fullPromptText } from "../prompt-copy";

/**
 * Test của NÚT «Copy prompt + ảnh».
 *
 * ╔══ VÌ SAO PHẢI KHOÁ CHỖ NÀY BẰNG TEST ════════════════════════════════════╗
 * ║ Bộ nhớ tạm là thứ KHÔNG TỰ TỐ CÁO khi hỏng: nút vẫn sáng, toast vẫn xanh, ║
 * ║ và người dùng chỉ biết mình mất công khi đã dán sang ChatGPT và thấy một   ║
 * ║ nửa hợp đồng. Nên hai điều duy nhất đáng khoá cũng chính là hai lời hứa   ║
 * ║ của file `prompt-copy.ts`:                                                ║
 * ║   ① máy đủ sức ⇒ CHỮ VÀ ẢNH cùng vào trong ĐÚNG MỘT `ClipboardItem`;      ║
 * ║   ② máy thiếu sức (hoặc ảnh tải hụt) ⇒ vẫn copy được CHỮ, và NÓI RA rằng  ║
 * ║      ảnh chưa vào — không bao giờ im lặng báo thành công.                 ║
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

/** Một `ClipboardItem` giả GIỮ LẠI các MIME được đưa vào — thứ test cần soi. */
class FakeClipboardItem {
  readonly types: string[];
  constructor(readonly items: Record<string, Blob>) {
    this.types = Object.keys(items);
  }
}

interface ClipboardSpy {
  write: ReturnType<typeof vi.fn>;
  writeText: ReturnType<typeof vi.fn>;
}

/** Dựng `navigator.clipboard` + `ClipboardItem` giả. `withImage=false` = trình duyệt cũ. */
function installClipboard(withImage: boolean): ClipboardSpy {
  const spy: ClipboardSpy = { write: vi.fn(async () => {}), writeText: vi.fn(async () => {}) };
  /* Gán thẳng vào `globalThis` chứ không `vi.stubGlobal("navigator")`: môi trường
     test là "node", ở đó `navigator` có sẵn và chỉ đọc — ta chỉ cần cắm thêm
     `clipboard` vào nó. */
  Object.defineProperty(globalThis, "navigator", {
    value: { clipboard: withImage ? spy : { writeText: spy.writeText } },
    configurable: true,
    writable: true,
  });
  if (withImage) vi.stubGlobal("ClipboardItem", FakeClipboardItem);
  else vi.stubGlobal("ClipboardItem", undefined);
  return spy;
}

beforeEach(() => {
  loadFull.mockReset();
  loadFull.mockImplementation(() => ({ promise: Promise.resolve(PNG_1PX) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("copy prompt kèm ảnh — một item, hai kiểu dữ liệu", () => {
  it("máy đủ sức: chữ và PNG đi cùng MỘT ClipboardItem", async () => {
    const clip = installClipboard(true);

    const out = await copyPromptWithImage("p1", "prompt của tấm", ["skeleton/01-ui.png"]);

    expect(out.outcome).toBe("text+image");
    expect(out.remainingImages).toBe(0);
    expect(clip.writeText).not.toHaveBeenCalled();
    /* ĐÚNG MỘT item — Chrome chỉ nhận một, gửi hai là mất im lặng cái thứ hai. */
    const written = clip.write.mock.calls[0]?.[0] as FakeClipboardItem[];
    expect(written).toHaveLength(1);
    expect(written[0]!.types.sort()).toEqual(["image/png", "text/plain"]);

    const png = written[0]!.items["image/png"]!;
    expect(png.type).toBe("image/png");
    expect(png.size).toBeGreaterThan(0);
    await expect(written[0]!.items["text/plain"]!.text()).resolves.toBe("prompt của tấm");
  });

  it("nhiều ảnh: ảnh đầu đi kèm, số ảnh CÒN LẠI được trả về cho UI mọc nút", async () => {
    installClipboard(true);

    const out = await copyPromptWithImage("p1", "x", ["skeleton/01.png", "refs/a.png", "refs/b.png"]);

    expect(out.outcome).toBe("text+image");
    expect(out.remainingImages).toBe(2);
    expect(loadFull).toHaveBeenCalledTimes(1);
    expect(loadFull).toHaveBeenCalledWith("p1", "skeleton/01.png");
  });

  it("không ảnh nào: vẫn là một lượt copy chữ trọn vẹn, không kêu ca gì", async () => {
    const clip = installClipboard(true);

    const out = await copyPromptWithImage("p1", "chỉ có chữ", []);

    expect(out).toEqual({ outcome: "text", remainingImages: 0 });
    const written = clip.write.mock.calls[0]?.[0] as FakeClipboardItem[];
    expect(written[0]!.types).toEqual(["text/plain"]);
  });
});

describe("lùi về chữ — và PHẢI nói ra vì sao", () => {
  it("trình duyệt không có ClipboardItem: copy chữ, đếm ĐỦ số ảnh chưa vào, có lý do", async () => {
    const clip = installClipboard(false);

    const out = await copyPromptWithImage("p1", "prompt", ["skeleton/01.png", "refs/a.png"]);

    expect(out.outcome).toBe("text");
    /* 2 chứ không phải 1: lượt này KHÔNG ảnh nào vào cả, nên cả hai đều còn lại. */
    expect(out.remainingImages).toBe(2);
    expect(out.reason).toBeTruthy();
    expect(clip.writeText).toHaveBeenCalledWith("prompt");
  });

  it("trình duyệt cũ mà cũng không có ảnh nào: không bịa ra lý do để dọa người dùng", async () => {
    installClipboard(false);
    const out = await copyPromptWithImage("p1", "prompt", []);
    expect(out).toEqual({ outcome: "text", remainingImages: 0 });
  });

  it("ảnh tải hụt: chữ vẫn vào bộ nhớ tạm, lý do là lời của lỗi thật", async () => {
    const clip = installClipboard(true);
    loadFull.mockImplementation(() => ({ promise: Promise.reject(new Error("agent trả 403")) }));

    const out = await copyPromptWithImage("p1", "prompt", ["skeleton/01.png"]);

    expect(out.outcome).toBe("text");
    expect(out.remainingImages).toBe(1);
    expect(out.reason).toContain("403");
    expect(clip.writeText).toHaveBeenCalledWith("prompt");
  });
});

describe("prompt tổng phong cách đứng ở ĐẦU — và chỉ MỘT lần", () => {
  it("engine bản cũ chưa có câu phong cách ⇒ nối lên đầu", () => {
    const out = fullPromptText("flat vector, mint palette", "Draw a 4x4 sheet of UI parts.");
    expect(out).toBe("flat vector, mint palette\n\nDraw a 4x4 sheet of UI parts.");
  });

  it("engine bản mới đã tự đặt câu ấy ⇒ KHÔNG nói lại lần hai", () => {
    const style = "flat vector illustration with a mint and cream palette, soft shadows";
    const prompt = `${style}. Draw a 4x4 sheet of UI parts.`;
    expect(fullPromptText(style, prompt)).toBe(prompt);
  });

  it("không có phong cách nào ⇒ prompt đi nguyên vẹn, không mọc dòng trống", () => {
    expect(fullPromptText("   ", "prompt")).toBe("prompt");
  });
});
