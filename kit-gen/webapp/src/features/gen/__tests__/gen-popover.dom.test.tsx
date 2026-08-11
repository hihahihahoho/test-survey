/**
 * HỘP «✨ Nhờ máy vẽ» — kiểm trên DOM thật (jsdom + @testing-library).
 *
 * Vá jsdom nằm NGAY ĐÂY (không `setupFiles`): file setup dùng chung sẽ nằm ngoài glob C.
 * Cùng cách làm với `features/canvas/__tests__/*.dom.test.tsx` của C1.
 *
 * GIỚI HẠN PHẢI NÓI TRƯỚC: jsdom **không có layout engine** ⇒ bộ này không đo pixel,
 * không đo tương phản. Nó kiểm HÀNH VI: hai tầng của popover, bàn phím, khoá có lý do,
 * và ba câu nói thật có thật sự hiện ra trong thân panel hay không.
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

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { GenPopover, type GenPopoverProps } from "../GenPopover";
import { GEN_GROUP_NOTE, GEN_NEED_CHARACTER_REF } from "../lib/gen-kinds";

afterEach(cleanup);

function mount(over: Partial<GenPopoverProps> = {}) {
  const props: GenPopoverProps = {
    hasCharacterRef: true,
    selectedComponentCount: 4,
    boardItemCount: 5,
    ...over,
  };
  return render(
    <TooltipProvider>
      <GenPopover {...props} />
    </TooltipProvider>,
  );
}

const openBox = () => {
  fireEvent.click(screen.getByRole("button", { name: /Nhờ máy vẽ/ }));
};
const tile = (name: RegExp) => screen.getByRole("button", { name });

describe("tầng 1 — lưới 4 lệnh", () => {
  it("mở hộp thấy đủ 4 lệnh với giá của từng lệnh", () => {
    mount();
    openBox();
    expect(screen.getByRole("heading", { name: "Nhờ máy vẽ gì?" })).toBeTruthy();
    for (const label of ["Ảnh nền", "Tư thế nhân vật", "Món giao diện", "Cả bộ kit"]) {
      expect(tile(new RegExp(label))).toBeTruthy();
    }
    // «Cả bộ kit» phải nói số THẬT theo bàn (5 thứ), không phải chữ N.
    expect(tile(/Cả bộ kit/).textContent).toContain("~5 lượt");
  });

  it("chưa có ảnh nhân vật ⇒ «Tư thế nhân vật» KHOÁ, lý do đọc được cho screen reader", () => {
    mount({ hasCharacterRef: false });
    openBox();
    const pose = tile(/Tư thế nhân vật/);
    expect(pose.getAttribute("aria-disabled")).toBe("true");
    // Lý do nằm trong phần tử được `aria-describedby` trỏ tới ⇒ trình đọc màn hình đọc được.
    const desc = document.getElementById(pose.getAttribute("aria-describedby")!);
    expect(desc?.textContent).toBe(GEN_NEED_CHARACTER_REF);

    fireEvent.click(pose);
    // Bấm vào nút khoá KHÔNG được đi tiếp sang tầng 2.
    expect(screen.getByRole("heading", { name: "Nhờ máy vẽ gì?" })).toBeTruthy();
  });

  it("bàn trống ⇒ «Cả bộ kit» khoá có lý do, không hứa vẽ", () => {
    mount({ boardItemCount: 0 });
    openBox();
    const kit = tile(/Cả bộ kit/);
    expect(kit.getAttribute("aria-disabled")).toBe("true");
    expect(kit.textContent).toContain("Chọn object trên bàn rồi vẽ gộp thành bộ kit.");
  });

  it("lưới có ĐÚNG MỘT điểm dừng Tab; ←/→ và ↑/↓ đi trong lưới (APG)", () => {
    mount();
    openBox();
    const tiles = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-gen-kind]"));
    expect(tiles.filter((t) => t.tabIndex === 0)).toHaveLength(1);

    const grid = screen.getByRole("group", { name: "Chọn thứ muốn máy vẽ" });
    tiles[0]!.focus();
    fireEvent.keyDown(grid, { key: "ArrowRight" });
    expect(document.activeElement).toBe(tiles[1]);
    fireEvent.keyDown(grid, { key: "ArrowDown" }); // lưới 2 cột ⇒ nhảy 2
    expect(document.activeElement).toBe(tiles[3]);
    fireEvent.keyDown(grid, { key: "Home" });
    expect(document.activeElement).toBe(tiles[0]);
    fireEvent.keyDown(grid, { key: "End" });
    expect(document.activeElement).toBe(tiles[3]);
  });
});

describe("tầng 2 — panel điền", () => {
  it("«Ảnh nền»: có ô mô tả, chọn được khổ Dọc/Ngang, và dòng chi phí đúng chữ chốt", () => {
    mount();
    openBox();
    fireEvent.click(tile(/Ảnh nền/));
    expect(screen.getByLabelText("Tả cảnh bạn muốn")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Dọc" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Ngang" })).toBeTruthy();
    expect(screen.getByText("Tốn ~1 lượt hỏi · khoảng 1–2 phút")).toBeTruthy();
  });

  it("«Món giao diện»: câu «vẽ cả nhóm một lần» hiện NGAY TRONG PANEL, không trong tooltip", () => {
    mount();
    openBox();
    fireEvent.click(tile(/Món giao diện/));
    const note = screen.getByText(GEN_GROUP_NOTE);
    expect(note).toBeTruthy();
    expect(note.closest("[role='tooltip']")).toBeNull();
  });

  it("«Cả bộ kit»: không có ô mô tả, và câu ~N lượt dựng theo số thật của bàn", () => {
    mount({ boardItemCount: 3 });
    openBox();
    fireEvent.click(tile(/Cả bộ kit/));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Sẽ vẽ 3 thứ đang có trên bàn · ~3 lượt.")).toBeTruthy();
    expect(screen.getByText("Tốn ~3 lượt hỏi · khoảng 3–6 phút")).toBeTruthy();
  });

  it("nút «Vẽ» gọi callback thật với mô tả và khổ đã chọn", () => {
    const onGenerate = vi.fn();
    mount({ onGenerate });
    openBox();
    fireEvent.click(tile(/Ảnh nền/));
    fireEvent.change(screen.getByLabelText("Tả cảnh bạn muốn"), { target: { value: "chợ hoa" } });
    fireEvent.click(screen.getByRole("button", { name: "Vẽ" }));
    expect(onGenerate).toHaveBeenCalledWith(expect.objectContaining({ kind: "bg", prompt: "chợ hoa", orient: "portrait" }));
  });

  it("Esc ở tầng 2 lùi về lưới lệnh (không đóng thẳng hộp)", () => {
    mount();
    openBox();
    fireEvent.click(tile(/Ảnh nền/));
    expect(screen.queryByRole("heading", { name: "Nhờ máy vẽ gì?" })).toBeNull();
    fireEvent.keyDown(screen.getByLabelText("Tả cảnh bạn muốn"), { key: "Escape" });
    expect(screen.getByRole("heading", { name: "Nhờ máy vẽ gì?" })).toBeTruthy();
  });

  it("nút ← quay lại lưới và xoá mô tả đang gõ dở của lệnh cũ", () => {
    mount();
    openBox();
    fireEvent.click(tile(/Ảnh nền/));
    fireEvent.change(screen.getByLabelText("Tả cảnh bạn muốn"), { target: { value: "chợ hoa" } });
    fireEvent.click(screen.getByRole("button", { name: "Quay lại danh sách" }));
    fireEvent.click(tile(/Ảnh nền/));
    expect((screen.getByLabelText("Tả cảnh bạn muốn") as HTMLTextAreaElement).value).toBe("");
  });
});

describe("ca AGENT CHƯA CHẠY", () => {
  it("nút mở KHOÁ có lý do đọc được, và hộp không mở ra", () => {
    mount({ agentOffline: true });
    const btn = screen.getByRole("button", { name: /Nhờ máy vẽ — chưa dùng được/ });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(btn);
    expect(screen.queryByRole("heading", { name: "Nhờ máy vẽ gì?" })).toBeNull();
  });
});
