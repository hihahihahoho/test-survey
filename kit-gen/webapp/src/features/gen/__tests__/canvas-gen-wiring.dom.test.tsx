/**
 * NỐI DÂY vào bàn làm việc — hộp GEN nằm ở thanh nổi, lớp phủ đóng gói nằm ở tầng 5.
 *
 * Bộ này canh đúng chỗ dễ vỡ khi C2 cắm vào công trình của C1: **xếp tầng phải giữ nguyên**.
 * Nếu ai đó nhét popover/lớp phủ vào trong `CanvasSafeArea` hay vào cùng cột flex với dải
 * trạng thái, lỗi FLOW-V3 §5 sẽ quay lại. Ba tầng của C1 vẫn được kiểm ở
 * `features/canvas/__tests__/layering-canvas.dom.test.tsx`; ở đây kiểm phần C2 thêm vào.
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
const FRAME_W = 1280;
const FRAME_H = 720 - 56;
Element.prototype.getBoundingClientRect = function () {
  return {
    left: 0, top: 0, right: FRAME_W, bottom: FRAME_H, width: FRAME_W, height: FRAME_H,
    x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect;
};
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { canvasDocSchema, type CanvasDoc, type DraftBadge } from "@/features/docs/lib";
import { CanvasShell, type CanvasShellProps } from "@/features/canvas/components/CanvasShell";
import { GenPopover } from "../GenPopover";
import { PackOverlay } from "../PackOverlay";
import { packItems } from "../lib/pack-model";

afterEach(cleanup);

const LOCAL: DraftBadge = {
  level: "info", label: "bản nháp cục bộ", tone: "muted",
  explain: "Bàn làm việc này đang được lưu trên máy bạn, chưa nằm trong thư mục dự án.",
};
const EMPTY: CanvasDoc = canvasDocSchema.parse({});

function mount(over: Partial<CanvasShellProps> = {}) {
  const props: CanvasShellProps = {
    docName: "Ý tưởng hè",
    phase: "empty",
    canvas: EMPTY,
    errorTitle: "",
    onRetry: vi.fn(),
    saveState: "idle",
    badge: LOCAL,
    genSlot: <GenPopover hasCharacterRef selectedComponentCount={0} boardItemCount={2} />,
    ...over,
  };
  return render(
    <TooltipProvider>
      <CanvasShell {...props} />
    </TooltipProvider>,
  );
}

describe("hộp GEN nằm đúng chỗ: THANH NỔI, không phải trong thẻ empty", () => {
  it("nút «Nhờ máy vẽ» nằm trong thanh nổi (tầng 4)", () => {
    mount();
    const btn = screen.getByRole("button", { name: /Nhờ máy vẽ/ });
    expect(screen.getByTestId("canvas-float-row").contains(btn)).toBe(true);
  });

  it("thẻ empty VẪN không có nút nào — câu chữ chỉ xuống thanh dưới, đúng L1", () => {
    mount();
    expect(screen.getByTestId("canvas-empty-card").querySelectorAll("button")).toHaveLength(0);
  });

  it("câu «Bấm Nhờ máy vẽ ở thanh dưới» nay có ĐÍCH BẤM ĐƯỢC thật (không còn nút khoá)", () => {
    mount();
    expect(screen.getByText("Bấm Nhờ máy vẽ ở thanh dưới để bắt đầu.")).toBeTruthy();
    const btn = screen.getByRole("button", { name: /Nhờ máy vẽ/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it("ba tầng của C1 vẫn là ANH EM RỜI sau khi cắm hộp GEN", () => {
    mount();
    const strip = screen.getByTestId("canvas-strip-row");
    const float = screen.getByTestId("canvas-float-row");
    expect(strip.parentElement).toBe(float.parentElement);
    expect(strip.contains(float)).toBe(false);
    expect(screen.getByTestId("canvas-safe-area").className).not.toMatch(/\binset-0\b/);
  });
});

describe("nút «Đóng gói» mở lớp phủ C2", () => {
  it("có `onPack` ⇒ nút bấm được; bấm thì gọi đúng một lần", () => {
    const onPack = vi.fn();
    mount({ onPack });
    const btn = screen.getByRole("button", { name: /Đóng gói/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onPack).toHaveBeenCalledTimes(1);
  });

  it("KHÔNG có `onPack` ⇒ giữ nút «sắp có» khoá có lý do, không bấm vào chẳng làm gì", () => {
    mount();
    const btn = screen.getByRole("button", { name: /Đóng gói — sắp có/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("lớp phủ phủ KÍN khung và nằm NGOÀI ba tầng của C1 (không chui vào vùng an toàn)", () => {
    mount({
      packLayer: (
        <PackOverlay
          items={packItems(canvasDocSchema.parse({ nodes: [{ id: "mock-bg-1", type: "frame", x: 0, y: 0, w: 1, h: 1 }] }))}
          onPack={vi.fn()}
          onClose={vi.fn()}
        />
      ),
    });
    const overlay = screen.getByTestId("pack-overlay");
    expect(screen.getByTestId("canvas-safe-area").contains(overlay)).toBe(false);
    expect(screen.getByTestId("canvas-float-row").contains(overlay)).toBe(false);
    expect(overlay.className).toContain("inset-0");
  });
});

describe("ca AGENT CHƯA CHẠY trên bàn làm việc", () => {
  it("bàn vẫn mở, chỉ «Nhờ máy vẽ» khoá — không trắng trang, không overlay chặn màn", () => {
    mount({
      agentOffline: true,
      agentCommand: "npm run agent",
      genSlot: <GenPopover hasCharacterRef selectedComponentCount={0} boardItemCount={2} agentOffline />,
    });
    expect(screen.getByRole("application", { name: /Bàn làm việc/ })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Nhờ máy vẽ — chưa dùng được/ }) as HTMLButtonElement).disabled).toBe(true);
    // zoom vẫn dùng được: bàn nằm trên máy, không phụ thuộc công cụ.
    expect((screen.getByRole("button", { name: "Phóng to" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
