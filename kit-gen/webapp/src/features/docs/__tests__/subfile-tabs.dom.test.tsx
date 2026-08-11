/**
 * FileTabsBar — kiểm bằng DOM THẬT (jsdom + @testing-library).
 *
 * Vá jsdom nằm NGAY ĐÂY chứ không ở `setupFiles`: glob C của FE2-PLAN §1 không cấp
 * file setup, và tạo thêm file ngoài glob chính là lỗi ownership của B2 ở FE-1.
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

import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FileTabsBar } from "../components/subfiles";
import { buildTabs, type TabItem } from "../lib/subfile-model";
import { ALL_SHEETS_DOC_ID, docSchema, type Doc, type DraftBadge } from "../lib";
import type { FileTabsModel } from "../hooks";

afterEach(cleanup);

const D = (o: Partial<Doc> & { id: string; name: string }): Doc =>
  docSchema.parse({
    kind: "workflow", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    color: "none", trashedAt: null, ...o,
  });

const SHEETS = ["main", "main2"];
const LOCAL_BADGE: DraftBadge = {
  level: "info", label: "bản nháp cục bộ", tone: "muted",
  explain: "File này đang được lưu trên máy bạn, chưa nằm trong thư mục dự án.",
};

function model(over: Partial<FileTabsModel> = {}, docs: Doc[] = []): FileTabsModel {
  const tabs: TabItem[] = over.tabs ?? buildTabs({ docs, contractSheetIds: SHEETS });
  return {
    phase: "ready", tabs, activeId: tabs[0]?.id ?? ALL_SHEETS_DOC_ID, activeFallback: false,
    errorTitle: "", refetch: () => {}, badge: LOCAL_BADGE, ...over,
  };
}

function mount(m: FileTabsModel, props: Partial<React.ComponentProps<typeof FileTabsBar>> = {}) {
  const onActivate = props.onActivate ?? vi.fn();
  const utils = render(
    <TooltipProvider>
      <FileTabsBar model={m} onActivate={onActivate} {...props} />
    </TooltipProvider>,
  );
  return { ...utils, onActivate };
}

describe("năm trạng thái — không ca nào trắng trang", () => {
  it("empty: chưa có file con nhưng VẪN có tab «Tất cả sheet» + lời mời tạo file", () => {
    const onCreate = vi.fn();
    mount(model(), { onCreate });
    expect(screen.getByRole("tablist", { name: "File con của dự án" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.getByText(/chưa có file con nào/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Tạo file đầu tiên" }));
    expect(onCreate).toHaveBeenCalled();
  });

  it("loading: có skeleton + nhãn cho trình đọc màn hình, KHÔNG có tablist giả", () => {
    mount(model({ phase: "loading" }));
    expect(screen.getByText("Đang mở danh sách file…")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("error: câu đời thường + [Thử lại]; mã lỗi CHỈ nằm trong «Chi tiết cho lập trình viên»", () => {
    const refetch = vi.fn();
    mount(model({
      phase: "error", refetch,
      errorTitle: "Trình duyệt đang không cho lưu nháp trên máy này.",
      errorDetail: "STORAGE_UNAVAILABLE: indexedDB không dùng được",
    }));
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText(/Trình duyệt đang không cho lưu nháp/)).toBeTruthy();
    // thân UI (ngoài <details>) không được chứa chuỗi kỹ thuật
    const details = alert.querySelector("details")!;
    expect(details.textContent).toContain("STORAGE_UNAVAILABLE");
    const body = alert.cloneNode(true) as HTMLElement;
    body.querySelector("details")?.remove();
    expect(body.textContent).not.toContain("STORAGE_UNAVAILABLE");
    fireEvent.click(within(alert).getByRole("button", { name: "Thử lại" }));
    expect(refetch).toHaveBeenCalled();
  });

  it("timeout 20s: đổi copy sang «mở lâu bất thường», không quay mãi", () => {
    mount(model({ phase: "timeout" }));
    expect(screen.getByText(/mở lâu bất thường/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
  });

  it("agent chưa chạy: tab vẫn dùng được và nói rõ lý do", () => {
    mount(model({}, [D({ id: "f-kit", name: "Bộ kit chính" })]), { agentOffline: true });
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.getByText(/Công cụ trên máy chưa chạy/)).toBeTruthy();
  });

  it("deep link hỏng: nói ra chuyện đã rơi về «Tất cả sheet», không im lặng", () => {
    mount(model({ activeFallback: true }, [D({ id: "f-kit", name: "Bộ kit chính" })]));
    expect(screen.getByText(/Không tìm thấy file bạn vừa mở/)).toBeTruthy();
  });
});

describe("badge «bản nháp cục bộ»", () => {
  it("hiện khi backend là local", () => {
    mount(model());
    expect(screen.getByText("bản nháp cục bộ")).toBeTruthy();
  });
  it("biến mất khi level = none (đã có backend thật)", () => {
    mount(model({ badge: { level: "none", label: "", explain: "", tone: "muted" } }));
    expect(screen.queryByText("bản nháp cục bộ")).toBeNull();
  });
});

describe("a11y + bàn phím (APG Tabs)", () => {
  const docs = [
    D({ id: "f-kit", name: "Bộ kit chính" }),
    D({ id: "f-y-tuong", name: "Ý tưởng Tết", kind: "canvas" }),
  ];

  it("aria đúng: tablist/tab/aria-selected + roving tabindex (đúng MỘT tabstop)", () => {
    mount(model({ activeId: "f-kit" }, docs));
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    const selected = tabs.filter((t) => t.getAttribute("aria-selected") === "true");
    expect(selected).toHaveLength(1);
    expect(tabs.filter((t) => t.getAttribute("tabindex") === "0")).toHaveLength(1);
    expect(selected[0]!.getAttribute("tabindex")).toBe("0");
  });

  it("←/→ chạy vòng, Home/End nhảy biên — mỗi lần gọi onActivate đúng một id", () => {
    const onActivate = vi.fn();
    mount(model({ activeId: "f-kit" }, docs), { onActivate });
    const list = screen.getByRole("tablist");
    fireEvent.keyDown(list, { key: "ArrowRight" });
    expect(onActivate).toHaveBeenLastCalledWith("f-y-tuong");
    fireEvent.keyDown(list, { key: "ArrowLeft" });
    expect(onActivate).toHaveBeenLastCalledWith(ALL_SHEETS_DOC_ID);
    fireEvent.keyDown(list, { key: "End" });
    expect(onActivate).toHaveBeenLastCalledWith("f-y-tuong");
    fireEvent.keyDown(list, { key: "Home" });
    expect(onActivate).toHaveBeenLastCalledWith(ALL_SHEETS_DOC_ID);
  });

  it("Ctrl+Tab / Ctrl+Shift+Tab đổi tab ở mức cửa sổ", () => {
    const onActivate = vi.fn();
    mount(model({ activeId: ALL_SHEETS_DOC_ID }, docs), { onActivate });
    fireEvent.keyDown(window, { key: "Tab", ctrlKey: true });
    expect(onActivate).toHaveBeenLastCalledWith("f-kit");
    fireEvent.keyDown(window, { key: "Tab", ctrlKey: true, shiftKey: true });
    expect(onActivate).toHaveBeenLastCalledWith("f-y-tuong");
  });

  it("Mod+2 nhảy tab thứ 2; Mod+9 khi chỉ có 3 tab thì KHÔNG làm gì và không nuốt phím", () => {
    const onActivate = vi.fn();
    mount(model({ activeId: ALL_SHEETS_DOC_ID }, docs), { onActivate });
    const mac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");
    const chord = mac ? { metaKey: true } : { ctrlKey: true };
    fireEvent.keyDown(window, { key: "2", ...chord });
    expect(onActivate).toHaveBeenLastCalledWith("f-kit");
    onActivate.mockClear();
    const ev = new KeyboardEvent("keydown", { key: "9", bubbles: true, cancelable: true, ...chord });
    window.dispatchEvent(ev);
    expect(onActivate).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it("đang gõ trong ô nhập thì phím tắt KHÔNG cướp phím", () => {
    const onActivate = vi.fn();
    mount(model({ activeId: ALL_SHEETS_DOC_ID }, docs), { onActivate });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: "Tab", ctrlKey: true });
    expect(onActivate).not.toHaveBeenCalled();
    input.remove();
  });

  it("Mod+Alt+N gọi tạo file mới; không truyền onCreate thì không nuốt phím", () => {
    const onCreate = vi.fn();
    const mac = /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent || "");
    const chord = mac ? { metaKey: true, altKey: true } : { ctrlKey: true, altKey: true };
    const { unmount } = mount(model({}, docs), { onCreate });
    fireEvent.keyDown(window, { key: "n", ...chord });
    expect(onCreate).toHaveBeenCalledTimes(1);
    unmount();
    mount(model({}, docs));
    const ev = new KeyboardEvent("keydown", { key: "n", bubbles: true, cancelable: true, ...chord });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("chuột phải trên tab phát tín hiệu menu ngữ cảnh cho C2, không tự dựng menu", () => {
    const onContextMenu = vi.fn();
    mount(model({ activeId: "f-kit" }, docs), { onContextMenu });
    fireEvent.contextMenu(screen.getByRole("tab", { name: /Bộ kit chính/ }));
    expect(onContextMenu).toHaveBeenCalledWith("f-kit", expect.anything());
  });

  it("thông tin của chấm màu/chấm chưa lưu được nói lại bằng CHỮ (luật A3)", () => {
    const docs2 = [D({ id: "f-y-tuong", name: "Ý tưởng Tết", kind: "canvas", color: "mint" })];
    mount(model({ tabs: buildTabs({ docs: docs2, contractSheetIds: SHEETS, dirtyIds: ["f-y-tuong"] }) }));
    const tab = screen.getByRole("tab", { name: /Ý tưởng Tết/ });
    const label = tab.getAttribute("aria-label")!;
    expect(label).toContain("có thay đổi chưa lưu");
    expect(label).toContain("nhãn xanh VNPAY");
    expect(label).toContain("bàn ý tưởng");
  });
});

describe(">8 tab: thu gọn mà tab đang mở vẫn thấy", () => {
  const many = Array.from({ length: 11 }, (_, i) => D({ id: `f-t${i}`, name: `File ${i}` }));

  it("hiện 8 tab + nút menu mang SỐ file bị giấu", () => {
    mount(model({ activeId: ALL_SHEETS_DOC_ID }, many));
    expect(screen.getAllByRole("tab")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Còn 4 file nữa đang thu gọn" })).toBeTruthy();
  });

  it("tab đang mở nằm cuối danh sách vẫn RENDER ra thanh, không bị nhốt trong menu", () => {
    mount(model({ activeId: "f-t10" }, many));
    const tab = screen.getByRole("tab", { name: /File 10/ });
    expect(tab.getAttribute("aria-selected")).toBe("true");
  });
});

describe("popover «Tất cả N»", () => {
  const docs = [
    D({ id: "f-kit", name: "Bộ kit chính", updatedAt: "2026-04-01T00:00:00.000Z" }),
    D({ id: "f-y-tuong", name: "Ý tưởng Tết", kind: "canvas", updatedAt: "2026-03-01T00:00:00.000Z" }),
  ];

  it("nút mang đúng số file (gồm cả tab hệ thống)", () => {
    mount(model({}, docs));
    expect(screen.getByRole("button", { name: "Tất cả 3 file trong dự án" })).toBeTruthy();
  });

  it("listbox dùng aria-activedescendant, ↑/↓ đổi mục mà focus vẫn ở ô tìm", async () => {
    const onActivate = vi.fn();
    mount(model({}, docs), { onActivate });
    fireEvent.click(screen.getByRole("button", { name: /Tất cả 3/ }));
    const box = await screen.findByRole("combobox", { name: "Tìm file trong dự án" });
    await waitFor(() => expect(box.getAttribute("aria-activedescendant")).toBeTruthy());
    const first = box.getAttribute("aria-activedescendant");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    await waitFor(() => expect(box.getAttribute("aria-activedescendant")).not.toBe(first));
    expect(document.activeElement).toBe(box);
    fireEvent.keyDown(box, { key: "Enter" });
    expect(onActivate).toHaveBeenCalledWith("f-kit");
  });

  it("gõ không dấu vẫn tìm ra tên có dấu; không khớp thì có copy chỉ đường", async () => {
    mount(model({}, docs));
    fireEvent.click(screen.getByRole("button", { name: /Tất cả 3/ }));
    const box = await screen.findByRole("combobox", { name: "Tìm file trong dự án" });
    fireEvent.change(box, { target: { value: "y tuong" } });
    await waitFor(() => expect(screen.getAllByRole("option")).toHaveLength(1));
    expect(screen.getByRole("option").textContent).toContain("Ý tưởng Tết");
    fireEvent.change(box, { target: { value: "zzz" } });
    await waitFor(() => expect(screen.queryAllByRole("option")).toHaveLength(0));
    expect(screen.getByText(/Không có file nào khớp/)).toBeTruthy();
  });

  it("không sheet tàng hình: «Tất cả sheet» luôn có mặt trong danh sách", async () => {
    mount(model({}, docs));
    fireEvent.click(screen.getByRole("button", { name: /Tất cả 3/ }));
    const opts = await screen.findAllByRole("option");
    expect(opts[0]!.textContent).toContain("Tất cả sheet");
  });
});
