// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/**
 * MỘT ĐIỀU DUY NHẤT: «Prompt» có mặt trong thanh bên và bấm được.
 *
 * Vì sao đáng một file riêng: màn «Thư viện prompt» chạy đúng, route khớp đúng, và
 * KHÔNG AI TÌM RA NÓ nếu mục điều hướng bị quên. Đó là kiểu hỏng không test nào
 * khác bắt được — mọi ca của màn ấy đều render thẳng component, bỏ qua lớp vỏ.
 */

/* Hai mảnh chân thanh bên tự mở query và probe `/health` — không liên quan gì ở đây. */
vi.mock("../components/UsageMeter", () => ({ UsageMeter: () => null }));
vi.mock("../components/UpdateSidebarButton", () => ({ UpdateSidebarButton: () => null }));

const { HomeSidebar } = await import("../components/HomeSidebar");

afterEach(() => cleanup());

function mount(onPromptLibrary = vi.fn()) {
  render(
    <HomeSidebar
      section="all"
      active="prompt-library"
      trashCount={0}
      onSection={vi.fn()}
      onTrash={vi.fn()}
      onSettings={vi.fn()}
      onBrands={vi.fn()}
      onUiLibrary={vi.fn()}
      onMascotLibrary={vi.fn()}
      onPromptLibrary={onPromptLibrary}
      onReferences={vi.fn()}
    />,
  );
  return onPromptLibrary;
}

describe("thanh bên — thư viện thứ năm", () => {
  it("«Prompt» đứng trong nhóm Quản lý, cạnh bốn thư viện kia", () => {
    mount();
    const group = screen.getByRole("navigation", { name: "Quản lý" });
    expect(screen.getByText("Prompt")).toBeTruthy();
    expect(group.contains(screen.getByText("Prompt"))).toBe(true);
  });

  it("bấm vào nó gọi đúng đường đi, và mục đang mở được đánh dấu", () => {
    const go = mount();
    const button = screen.getByText("Prompt").closest("button")!;
    expect(button.getAttribute("aria-current")).toBe("page");
    fireEvent.click(button);
    expect(go).toHaveBeenCalledTimes(1);
  });
});
