/**
 * C3 — LUẬT a11y/edge-case của tầng file con, kiểm bằng test THUẦN NODE.
 * Không jsdom: mọi thứ ở đây là hàm, và hàm sai thì phải đỏ trước khi dựng DOM.
 */
import { describe, expect, it, vi } from "vitest";
import {
  COPY_FAIL_TITLE, TAB_ID_PREFIX, anchorForTab, copyFailDescription, copyText,
  cssEscape, docIdFromDomId, focusTab, isContextMenuKey, tabDomId, tabForIndexShortcut,
} from "../lib/subfile-a11y";
import {
  fallbackLinkText, resolveDocLink,
  type SubfileIntent, type SubfileIntentHandler,
} from "../lib/subfile-intent";
import { buildTabs } from "../lib/subfile-model";
import { docSchema, type Doc } from "../lib";

const D = (id: string, name: string): Doc =>
  docSchema.parse({
    id, name, kind: "workflow", createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z", color: "none", trashedAt: null,
  });

describe("id DOM của tab — HỢP ĐỒNG với phím tắt của C2", () => {
  it("công thức id không đổi: C2 cắt đúng tiền tố này để biết đang đứng ở tab nào", () => {
    expect(TAB_ID_PREFIX).toBe("kg-tab-");
    expect(tabDomId("f-y-tuong")).toBe("kg-tab-f-y-tuong");
    expect(docIdFromDomId(tabDomId("f-y-tuong"))).toBe("f-y-tuong");
  });

  it("phần tử KHÔNG phải tab thì trả null — không đoán bừa", () => {
    expect(docIdFromDomId("kg-cell-3")).toBeNull();
    expect(docIdFromDomId("")).toBeNull();
    expect(docIdFromDomId(null)).toBeNull();
    expect(docIdFromDomId(undefined)).toBeNull();
    expect(docIdFromDomId("kg-tab-")).toBeNull(); // tiền tố trơ, không có id
  });
});

describe("phím mở menu ngữ cảnh bằng bàn phím", () => {
  it("Shift+F10 và phím ☰ (ContextMenu) đều được nhận", () => {
    expect(isContextMenuKey({ key: "F10", shiftKey: true })).toBe(true);
    expect(isContextMenuKey({ key: "ContextMenu" })).toBe(true);
  });

  it("F10 TRẦN không được nhận — đó là phím menu của trình duyệt", () => {
    expect(isContextMenuKey({ key: "F10" })).toBe(false);
    expect(isContextMenuKey({ key: "F10", shiftKey: true, ctrlKey: true })).toBe(false);
    expect(isContextMenuKey({ key: "F10", shiftKey: true, altKey: true })).toBe(false);
  });

  it("phím thường không bị nhận nhầm", () => {
    for (const key of ["a", "Enter", "F2", "Tab", "Escape"]) {
      expect(isContextMenuKey({ key, shiftKey: true })).toBe(false);
    }
  });
});

describe("Mod+1..9 đếm trên TOÀN BỘ tab, kể cả tab đang thu gọn (§4.3)", () => {
  // 11 file ⇒ 12 tab (kèm tab ảo) ⇒ thanh chỉ hiện 8, còn 4 nằm trong menu `»`.
  const tabs = buildTabs({
    docs: Array.from({ length: 11 }, (_, i) => D(`f-t${i}`, `File ${i}`)),
    contractSheetIds: ["main"],
  });

  it("Mod+9 tới được file thứ 9 dù nó đang nằm trong phần thu gọn", () => {
    expect(tabs.length).toBe(12);
    const t = tabForIndexShortcut(tabs, 8);
    expect(t?.name).toBe("File 7"); // index 0 là tab ảo «Tất cả sheet»
    // và nó THẬT SỰ nằm ngoài 8 tab đầu? không — kiểm bằng chỉ số để nói đúng sự thật:
    expect(tabs.indexOf(t!)).toBe(8);
  });

  it("Mod+n vượt số tab ⇒ null để chỗ gọi KHÔNG nuốt phím trình duyệt", () => {
    expect(tabForIndexShortcut(tabs.slice(0, 3), 8)).toBeNull();
    expect(tabForIndexShortcut([], 0)).toBeNull();
  });
});

describe("focusTab — rào chắn CƯỚP TIÊU ĐIỂM", () => {
  it("không có root ⇒ không đụng gì (đây là lỗi tôi đã tự gây ra, xem §3.2 report)", () => {
    expect(focusTab("f-a", null)).toBe(false);
    expect(focusTab("f-a", undefined)).toBe(false);
  });

  it("root đã bị gỡ khỏi tài liệu ⇒ KHÔNG cả tra cứu, chứ đừng nói focus", () => {
    const querySelector = vi.fn();
    const detached = { isConnected: false, querySelector } as unknown as ParentNode;
    expect(focusTab("f-a", detached)).toBe(false);
    expect(querySelector).not.toHaveBeenCalled();
  });

  it("chạy được trong environment «node» — `instanceof Element` sẽ ném ReferenceError", () => {
    // Đây chính là lỗi bản đầu của tôi: dùng `root instanceof Element` làm rào chắn.
    expect(typeof (globalThis as { Element?: unknown }).Element).toBe("undefined");
    expect(() => focusTab("f-a", { querySelector: () => null } as unknown as ParentNode)).not.toThrow();
  });

  it("root không chứa tab đó ⇒ false, KHÔNG đi tìm ở nơi khác trong tài liệu", () => {
    const root = { querySelector: () => null } as unknown as ParentNode;
    expect(focusTab("f-khong-co", root)).toBe(false);
  });

  it("tìm thấy ⇒ focus + kéo vào khung nhìn (thanh tab cuộn ngang)", () => {
    const focus = vi.fn();
    const scrollIntoView = vi.fn();
    const root = { querySelector: () => ({ focus, scrollIntoView }) } as unknown as ParentNode;
    expect(focusTab("f-a", root)).toBe(true);
    expect(focus).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });
});

describe("cssEscape", () => {
  it("chạy được kể cả khi môi trường không có CSS.escape", () => {
    const g = globalThis as { CSS?: unknown };
    const saved = g.CSS;
    g.CSS = undefined;
    expect(cssEscape("f-a.b")).toBe("f-a\\.b");
    g.CSS = saved;
  });
});

describe("anchorForTab — neo menu khi mở bằng bàn phím", () => {
  it("không có DOM/không tìm thấy ⇒ (0,0) chứ không nổ; menu vẫn mở ra được", () => {
    const root = { querySelector: () => null } as unknown as ParentNode;
    expect(anchorForTab("f-a", root)).toEqual({ x: 0, y: 0 });
  });

  it("có phần tử ⇒ neo vào góc dưới-trái của chính tab đó", () => {
    const root = {
      querySelector: () => ({ getBoundingClientRect: () => ({ left: 120, bottom: 44 }) }),
    } as unknown as ParentNode;
    expect(anchorForTab("f-a", root)).toEqual({ x: 120, y: 44 });
  });
});

describe("copyText — KHÔNG nuốt lỗi clipboard", () => {
  const withNavigator = async (nav: unknown, fn: () => Promise<void>) => {
    const g = globalThis as { navigator?: unknown };
    const saved = Object.getOwnPropertyDescriptor(g, "navigator");
    Object.defineProperty(g, "navigator", { value: nav, configurable: true, writable: true });
    try {
      await fn();
    } finally {
      if (saved) Object.defineProperty(g, "navigator", saved);
    }
  };

  it("không có clipboard API (trang http) ⇒ báo rõ, KHÔNG giả vờ đã chép", async () => {
    await withNavigator({}, async () => {
      const r = await copyText("/p/x/f/y");
      expect(r.ok).toBe(false);
      expect(r).toMatchObject({ reason: "NO_CLIPBOARD_API", text: "/p/x/f/y" });
    });
  });

  it("quyền bị từ chối ⇒ trả thất bại kèm lý do", async () => {
    const clipboard = { writeText: vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError")) };
    await withNavigator({ clipboard }, async () => {
      const r = await copyText("abc");
      expect(r.ok).toBe(false);
      expect((r as { reason: string }).reason).toBe("NotAllowedError");
    });
  });

  it("thành công ⇒ ok + đúng chuỗi đã chép", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    await withNavigator({ clipboard: { writeText } }, async () => {
      const r = await copyText("/p/x/f/y");
      expect(r).toEqual({ ok: true, text: "/p/x/f/y" });
      expect(writeText).toHaveBeenCalledWith("/p/x/f/y");
    });
  });

  it("câu báo hỏng đưa THẲNG chuỗi để người dùng chép tay — không cụt lủn", () => {
    expect(COPY_FAIL_TITLE).toMatch(/không cho chép/i);
    expect(copyFailDescription("/p/x/f/y")).toContain("/p/x/f/y");
  });
});

/* ═════════ ROUTER-AGNOSTIC — hợp đồng deep-link với E1 (FE2-PLAN §3-C3) ═════════ */

describe("tầng file con KHÔNG được tự biết router", () => {
  it("`linkForDoc` trả rỗng/undefined ⇒ chép id file, không chép chuỗi rỗng vô nghĩa", () => {
    expect(resolveDocLink("f-abc")).toBe("f-abc");
    expect(resolveDocLink("f-abc", () => "")).toBe("f-abc");
    expect(resolveDocLink("f-abc", () => "   ")).toBe("f-abc");
    expect(fallbackLinkText("f-abc")).toBe("f-abc");
  });

  it("có URL thật ⇒ dùng đúng URL của E1, không tự ghép đường dẫn", () => {
    expect(resolveDocLink("f-abc", (id) => `https://kg.local/p/p1/f/${id}`))
      .toBe("https://kg.local/p/p1/f/f-abc");
  });

  it("mọi ý định deep-link đều là DỮ LIỆU typed, E1 dịch sang URL", () => {
    const seen: SubfileIntent[] = [];
    const handle: SubfileIntentHandler = (i) => seen.push(i);
    handle({ type: "open", docId: "f-a" });
    handle({ type: "created", docId: "f-b" });
    handle({ type: "moved-after-delete", docId: "f-all-sheets", deletedId: "f-b" });
    expect(seen.map((i) => i.type)).toEqual(["open", "created", "moved-after-delete"]);
  });
});

describe("không có đường nào tới router hay window.location trong tầng file con", () => {
  it("mã nguồn của C KHÔNG import router và KHÔNG đọc window.location", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { join } = await import("node:path");
    const roots = [
      new URL("../components/subfiles/", import.meta.url).pathname,
      new URL("../lib/", import.meta.url).pathname,
      new URL("../hooks/", import.meta.url).pathname,
    ];
    const offenders: string[] = [];
    for (const dir of roots) {
      for (const f of readdirSync(dir)) {
        if (!/\.tsx?$/.test(f)) continue;
        const src = readFileSync(join(dir, f), "utf8");
        // bỏ dòng chú thích: các file này NÓI về router rất nhiều, nhưng không DÙNG.
        const code = src.split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
        if (/from ["\']@tanstack\/react-router["\']/.test(code)) offenders.push(`${f}: import router`);
        if (/window\.location|history\.pushState/.test(code)) offenders.push(`${f}: đọc/ghi URL`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
