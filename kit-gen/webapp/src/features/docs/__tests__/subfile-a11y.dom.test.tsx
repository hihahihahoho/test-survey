/**
 * C3 — A11Y, OVERFLOW và EDGE CASE của tầng file con, kiểm trên DOM THẬT.
 *
 * Bộ này KHÔNG lặp lại những gì C1/C2 đã khoá (aria tablist, ←/→, vòng đời CRUD).
 * Nó chỉ khoá đúng những chỗ mà PROBE của C3 ĐO ĐƯỢC là đang hỏng:
 *  ① tiêu điểm rơi về `<body>` sau khi menu/dialog/ô đổi tên đóng,
 *  ② `Shift+F10` và phím ☰ không mở được menu (đường bàn phím chỉ là lời hứa),
 *  ③ `aria-controls` trỏ vào một id không tồn tại,
 *  ④ `Mod+9` im lặng khi file thứ 9 đang nằm trong phần thu gọn,
 *  ⑤ file trong phần thu gọn không có đường nào tới đổi tên/xoá,
 *  ⑥ chép liên kết thất bại trong im lặng.
 * … và một hồi quy do CHÍNH C3 gây ra rồi bị bắt: cướp tiêu điểm (xem §3.2 report).
 *
 * Vá jsdom nằm NGAY ĐÂY: glob C (FE2-PLAN §1) không cấp `setupFiles` — NEEDS-fe2-c N3.
 */
if (!("ResizeObserver" in globalThis)) {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (typeof (globalThis as { CSS?: unknown }).CSS === "undefined") {
  (globalThis as Record<string, unknown>).CSS = { escape: (s: string) => s.replace(/([^\w-])/g, "\\$1") };
}
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { createFakeIdb, type FakeIdb } from "./fake-idb";
import { configureDocsIdb } from "../lib/docs-idb";
import { ALL_SHEETS_DOC_ID, docsRepo } from "../lib";
import { FileTabsBar, SubfileTabs } from "../components/subfiles";
import { buildTabs } from "../lib/subfile-model";
import { focusTab, tabDomId } from "../lib/subfile-a11y";
import { docSchema, type Doc, type DraftBadge } from "../lib";
import type { FileTabsModel } from "../hooks";

let idb: FakeIdb;
beforeEach(() => {
  idb = createFakeIdb();
  configureDocsIdb(idb);
});
afterEach(() => {
  configureDocsIdb(null);
  cleanup();
});

const SHEETS = ["main", "main2", "pose-lan"];
const BADGE: DraftBadge = {
  level: "info", label: "bản nháp cục bộ", tone: "muted",
  explain: "File này đang được lưu trên máy bạn.",
};

const D = (id: string, name: string, over: Partial<Doc> = {}): Doc =>
  docSchema.parse({
    id, name, kind: "workflow", createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z", color: "none", trashedAt: null, ...over,
  });

function model(docs: Doc[], over: Partial<FileTabsModel> = {}): FileTabsModel {
  const tabs = buildTabs({ docs, contractSheetIds: SHEETS });
  return {
    phase: "ready", tabs, activeId: tabs[0]!.id, activeFallback: false,
    errorTitle: "", refetch: () => {}, badge: BADGE, ...over,
  };
}

function Harness(props: { initialActive?: string; linkForDoc?: (id: string) => string }) {
  const [active, setActive] = React.useState(props.initialActive ?? ALL_SHEETS_DOC_ID);
  return (
    <TooltipProvider>
      <SubfileTabs
        projectId="p1"
        contractSheetIds={SHEETS}
        activeId={active}
        onActivate={setActive}
        linkForDoc={props.linkForDoc}
      />
      <span data-testid="active">{active}</span>
      <Toaster />
    </TooltipProvider>
  );
}

const mount = (ui: React.ReactElement) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
      {ui}
    </QueryClientProvider>,
  );

const ready = () => waitFor(() => expect(screen.getByRole("tablist")).toBeTruthy());
const tab = (name: string | RegExp) => screen.findByRole("tab", { name });

async function createFile(name: string) {
  fireEvent.click(screen.getByRole("button", { name: /Tạo file mới/ }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Tên file"), { target: { value: name } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Tạo file" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

/** rAF trong jsdom là macrotask; đợi hai nhịp để focus đã hẹn kịp chạy. */
async function settleFocus() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 40));
  });
}

/* ═════════ ① TIÊU ĐIỂM KHÔNG ĐƯỢC RƠI VỀ <body> ═════════ */

describe("người dùng bàn phím không bao giờ mất chỗ", () => {
  it("Esc đóng menu ngữ cảnh ⇒ tiêu điểm QUAY VỀ đúng tab, không rơi về <body>", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Alpha");

    const t = await tab(/Alpha/);
    t.focus();
    fireEvent.contextMenu(t);
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await settleFocus();

    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement).id).toBe(tabDomId("f-alpha"));
  });

  it("huỷ dialog xoá ⇒ tiêu điểm về tab, người dùng làm tiếp được ngay", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Beta");

    (await tab(/Beta/)).focus();
    fireEvent.keyDown(window, { key: "Delete" });
    const dlg = await screen.findByRole("alertdialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Huỷ" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await settleFocus();

    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement).getAttribute("role")).toBe("tab");
  });

  it("XOÁ file đang mở ⇒ tiêu điểm về tab an toàn («Tất cả sheet»), không phải <body>", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Gamma");
    fireEvent.click(await tab(/Gamma/));

    (await tab(/Gamma/)).focus();
    fireEvent.keyDown(window, { key: "Delete" });
    const dlg = await screen.findByRole("alertdialog");
    fireEvent.click(within(dlg).getByRole("button", { name: /Chuyển vào thùng rác/ }));
    await waitFor(async () => expect(await docsRepo().list("p1")).toHaveLength(0));
    await settleFocus();

    expect(document.activeElement).not.toBe(document.body);
    expect((document.activeElement as HTMLElement).id).toBe(tabDomId(ALL_SHEETS_DOC_ID));
  });

  it("Esc huỷ ô đổi tên ⇒ tiêu điểm về chính tab đó (không mất chỗ giữa chừng)", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Delta");

    (await tab(/Delta/)).focus();
    fireEvent.keyDown(window, { key: "F2" });
    const box = await screen.findByLabelText(/Đổi tên file/);
    fireEvent.keyDown(box, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText(/Đổi tên file/)).toBeNull());
    await settleFocus();

    expect((document.activeElement as HTMLElement).id).toBe(tabDomId("f-delta"));
  });
});

/* ═════════ HỒI QUY DO CHÍNH C3 GÂY RA (§3.2 report) ═════════ */

describe("KHÔNG cướp tiêu điểm của chỗ khác", () => {
  it("thanh tab đã unmount thì lời hẹn focus của nó phải im lặng", async () => {
    const { unmount } = render(
      <TooltipProvider>
        <FileTabsBar model={model([D("f-aa", "Alpha")], { activeId: ALL_SHEETS_DOC_ID })} onActivate={() => {}} />
      </TooltipProvider>,
    );
    const list = screen.getByRole("tablist");
    fireEvent.keyDown(list, { key: "ArrowRight" }); // hẹn một lần focus qua rAF
    unmount();

    const outside = document.createElement("input");
    document.body.appendChild(outside);
    outside.focus();
    await settleFocus();

    expect(document.activeElement).toBe(outside); // con trỏ KHÔNG bị giật đi
    outside.remove();
  });

  it("tab của THANH KHÁC không bị kéo focus: `focusTab` chỉ tìm trong phạm vi của mình", () => {
    // Hai thanh tab cùng tồn tại (app thật: preview/nhiều màn) ⇒ id tab trùng công thức.
    // Bản đầu của C3 tra thêm bằng `document.getElementById` nên thanh A focus được tab
    // của thanh B — đúng cách con trỏ tự nhảy đi giữa lúc gõ.
    render(
      <TooltipProvider>
        <div id="thanh-a" />
        <div id="thanh-b">
          <button type="button" role="tab" id={tabDomId("f-o-thanh-khac")} aria-selected={false}>
            Ở thanh khác
          </button>
        </div>
      </TooltipProvider>,
    );
    const a = document.getElementById("thanh-a")!;
    expect(focusTab("f-o-thanh-khac", a)).toBe(false);
    expect(document.activeElement).not.toBe(document.getElementById(tabDomId("f-o-thanh-khac")));
  });

  it("người dùng đã tự đi chỗ khác ⇒ KHÔNG kéo tiêu điểm về (nếu không sẽ đóng luôn lớp nổi họ vừa mở)", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Lambda");

    // mở rồi đóng menu ngữ cảnh (đây là lúc hook hẹn trả tiêu điểm) …
    const t = await tab(/Lambda/);
    t.focus();
    fireEvent.contextMenu(t);
    const menu = await screen.findByRole("menu");
    fireEvent.keyDown(menu, { key: "Escape" });
    // … nhưng người dùng lập tức bấm sang ô khác
    const elsewhere = document.createElement("input");
    document.body.appendChild(elsewhere);
    elsewhere.focus();
    await settleFocus();

    expect(document.activeElement).toBe(elsewhere);
    elsewhere.remove();
  });

  it("gõ trong ô tìm của popover «Tất cả N» không bị thanh tab giật tiêu điểm", async () => {
    render(
      <TooltipProvider>
        <FileTabsBar
          model={model([D("f-aa", "Alpha"), D("f-bb", "Ý tưởng Tết", { kind: "canvas" })])}
          onActivate={() => {}}
        />
      </TooltipProvider>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Tất cả 3/ }));
    const box = await screen.findByRole("combobox", { name: "Tìm file trong dự án" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    await settleFocus();
    expect(document.activeElement).toBe(box);
  });
});

/* ═════════ ② + ③ ĐƯỜNG BÀN PHÍM VÀ ARIA ═════════ */

describe("menu ngữ cảnh mở được BẰNG BÀN PHÍM (không chỉ chuột phải)", () => {
  it("Shift+F10 trên tab đang focus mở đúng menu của tab đó", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Epsilon");

    const t = await tab(/Epsilon/);
    t.focus();
    fireEvent.keyDown(t, { key: "F10", shiftKey: true });

    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: /Đổi tên/ })).toBeTruthy();
  });

  it("phím ☰ (ContextMenu) trên bàn phím PC cũng mở menu", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Zeta");

    const t = await tab(/Zeta/);
    t.focus();
    fireEvent.keyDown(t, { key: "ContextMenu" });
    expect(await screen.findByRole("menu")).toBeTruthy();
  });

  it("F10 TRẦN không mở menu — phím đó thuộc về trình duyệt", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Eta");
    const t = await tab(/Eta/);
    t.focus();
    fireEvent.keyDown(t, { key: "F10" });
    await settleFocus();
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

describe("aria-controls không được trỏ vào hư không", () => {
  it("không truyền panelId ⇒ KHÔNG có aria-controls (thà thiếu còn hơn hứa hão)", () => {
    render(
      <TooltipProvider>
        <FileTabsBar model={model([D("f-aa", "Alpha")])} onActivate={() => {}} />
      </TooltipProvider>,
    );
    for (const t of screen.getAllByRole("tab")) {
      expect(t.hasAttribute("aria-controls")).toBe(false);
    }
  });

  it("có panelId ⇒ aria-controls trỏ đúng phần tử CÓ THẬT trong tài liệu", () => {
    render(
      <TooltipProvider>
        <FileTabsBar model={model([D("f-aa", "Alpha")])} onActivate={() => {}} panelId="kg-panel-test" />
        <div id="kg-panel-test" role="tabpanel" />
      </TooltipProvider>,
    );
    const t = screen.getAllByRole("tab")[0]!;
    expect(t.getAttribute("aria-controls")).toBe("kg-panel-test");
    expect(document.getElementById("kg-panel-test")).toBeTruthy();
  });
});

/* ═════════ ④ + ⑤ TRÀN THANH TAB ═════════ */

describe("thanh tab tràn: không chức năng nào biến mất theo bề rộng", () => {
  const many = Array.from({ length: 11 }, (_, i) => D(`f-t${i}`, `File ${i}`));

  it("Mod+9 tới được file thứ 9 dù nó đang trong phần thu gọn", () => {
    const onActivate = vi.fn();
    const m = model(many, { activeId: ALL_SHEETS_DOC_ID });
    render(
      <TooltipProvider>
        <FileTabsBar model={m} onActivate={onActivate} />
      </TooltipProvider>,
    );
    expect(screen.getAllByRole("tab")).toHaveLength(8); // 4 tab đang bị thu gọn
    const mac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");
    fireEvent.keyDown(window, { key: "9", ...(mac ? { metaKey: true } : { ctrlKey: true }) });
    expect(onActivate).toHaveBeenCalledWith(m.tabs[8]!.id);
  });

  it("chuột phải trên một mục ĐANG THU GỌN vẫn mở menu ngữ cảnh của file đó", async () => {
    const onContextMenu = vi.fn();
    render(
      <TooltipProvider>
        <FileTabsBar
          model={model(many, { activeId: ALL_SHEETS_DOC_ID })}
          onActivate={() => {}}
          onContextMenu={onContextMenu}
        />
      </TooltipProvider>,
    );
    // Radix DropdownMenu mở bằng `pointerdown`, không phải `click` — và đây cũng là
    // đường bàn phím thật: Enter/Space/↓ trên trigger đều mở (ghi chú của R0 ở dropdown-menu.tsx).
    fireEvent.keyDown(screen.getByRole("button", { name: /Còn 4 file nữa đang thu gọn/ }), { key: "Enter" });
    const items = await screen.findAllByRole("menuitem");
    fireEvent.contextMenu(items[0]!);
    expect(onContextMenu).toHaveBeenCalledTimes(1);
    expect(onContextMenu.mock.calls[0]![0]).toMatch(/^f-t/);
  });

  it("tên file rất dài không phá bố cục: bị cắt bằng CSS nhưng tên ĐẦY ĐỦ vẫn tới được trình đọc màn hình", () => {
    // 48 ký tự = đúng trần `DOC_NAME_MAX` của §4.4 (schema từ chối dài hơn).
    const long = "Bộ kit Tết 2026 cho VietinBank iPay bản rất dài";
    render(
      <TooltipProvider>
        <FileTabsBar model={model([D("f-dai", long)])} onActivate={() => {}} />
      </TooltipProvider>,
    );
    const t = screen.getByRole("tab", { name: new RegExp(long.slice(0, 20)) });
    expect(t.getAttribute("aria-label")).toContain(long); // không bị cắt trong tên trợ năng
    expect(t.className).toMatch(/max-w-\[200px\]/);      // cắt bằng CSS, không cắt dữ liệu
    expect(t.querySelector(".truncate")).toBeTruthy();
  });
});

/* ═════════ ⑥ CHÉP LIÊN KẾT ═════════ */

describe("«Sao chép liên kết» nói thật", () => {
  const withClipboard = (impl: unknown) => {
    const saved = Object.getOwnPropertyDescriptor(navigator, "clipboard");
    Object.defineProperty(navigator, "clipboard", { value: impl, configurable: true });
    return () => {
      if (saved) Object.defineProperty(navigator, "clipboard", saved);
      else Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, "clipboard");
    };
  };

  it("chép được ⇒ báo đã chép, và chép đúng URL mà E1 cấp", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const restore = withClipboard({ writeText });
    try {
      mount(<Harness linkForDoc={(id) => `https://kg.local/p/p1/f/${id}`} />);
      await ready();
      await createFile("Theta");
      fireEvent.contextMenu(await tab(/Theta/));
      fireEvent.click(await screen.findByRole("menuitem", { name: /Sao chép liên kết/ }));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith("https://kg.local/p/p1/f/f-theta"));
      expect(await screen.findByText(/Đã chép liên kết/)).toBeTruthy();
    } finally {
      restore();
    }
  });

  it("trình duyệt CHẶN chép ⇒ KHÔNG im lặng: báo lỗi và đưa chuỗi để chép tay", async () => {
    const restore = withClipboard({
      writeText: vi.fn().mockRejectedValue(new DOMException("no", "NotAllowedError")),
    });
    try {
      mount(<Harness linkForDoc={(id) => `https://kg.local/p/p1/f/${id}`} />);
      await ready();
      await createFile("Iota");
      fireEvent.contextMenu(await tab(/Iota/));
      fireEvent.click(await screen.findByRole("menuitem", { name: /Sao chép liên kết/ }));
      expect(await screen.findByText(/không cho chép tự động/i)).toBeTruthy();
      expect(await screen.findByText(/https:\/\/kg\.local\/p\/p1\/f\/f-iota/)).toBeTruthy();
    } finally {
      restore();
    }
  });
});

/* ═════════ NHÃN CHO TRÌNH ĐỌC MÀN HÌNH ═════════ */

describe("mọi điều khiển đều có tên đọc được, không có nút chỉ-icon câm", () => {
  it("nút, tab và vùng đều có accessible name bằng CHỮ", async () => {
    mount(<Harness />);
    await ready();
    await createFile("Kappa");

    expect(screen.getByRole("tablist").getAttribute("aria-label")).toBe("File con của dự án");
    expect(screen.getByRole("button", { name: "Tạo file mới trong dự án" })).toBeTruthy();
    for (const b of screen.getAllByRole("button")) {
      const name = (b.getAttribute("aria-label") ?? b.textContent ?? "").trim();
      expect(name.length).toBeGreaterThan(0);
    }
  });

  it("phần tử ẩn khỏi trình đọc (chấm màu, icon) không mang thông tin duy nhất", () => {
    render(
      <TooltipProvider>
        <FileTabsBar
          model={model([D("f-mau", "Có nhãn", { color: "mint" })])}
          onActivate={() => {}}
        />
      </TooltipProvider>,
    );
    const t = screen.getByRole("tab", { name: /Có nhãn/ });
    expect(t.getAttribute("aria-label")).toContain("nhãn xanh VNPAY");
    for (const svg of Array.from(t.querySelectorAll("svg"))) {
      expect(svg.getAttribute("aria-hidden")).toBe("true");
    }
  });
});
