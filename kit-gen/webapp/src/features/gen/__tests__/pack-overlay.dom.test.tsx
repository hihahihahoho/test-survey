/**
 * LỚP PHỦ «📦 Đóng gói» (C2) — kiểm trên DOM thật.
 *
 * Ba thứ quan trọng nhất bộ này canh:
 *   ① ghi chú bị khoá tick VÀ lý do đọc được;
 *   ② đang có lượt vẽ ⇒ hiện dải cảnh báo **trước** khi chuyển màn, **không** huỷ gì (C-01);
 *   ③ ô tick KHÔNG bao giờ nằm trực tiếp trên ảnh (chống lỗi tương phản UX-V3 §8.3).
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
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { canvasDocSchema } from "@/features/docs/lib";
import { MSG } from "@/features/kitfile";
import { PackOverlay, type PackOverlayProps } from "../PackOverlay";
import { PACK_NOTE_LOCKED, PACK_WHILE_RUNNING, packItems } from "../lib/pack-model";

afterEach(cleanup);

const BOARD = packItems(
  canvasDocSchema.parse({
    nodes: [
      { id: "mock-bg-1", type: "frame", x: 0, y: 0, w: 10, h: 10 },
      { id: "mock-pose-1", type: "frame", x: 0, y: 0, w: 10, h: 10 },
      { id: "note-1", type: "note", x: 0, y: 0, w: 10, h: 10, text: "nhớ đổi màu" },
    ],
  }),
);

function mount(over: Omit<Partial<PackOverlayProps>, "onPack" | "onClose"> = {}) {
  const onPack = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <TooltipProvider>
      <PackOverlay items={BOARD} {...over} onPack={onPack} onClose={onClose} />
    </TooltipProvider>,
  );
  return { ...utils, onPack, onClose };
}

const boxes = () => screen.getAllByRole("checkbox");

describe("① ghi chú không đóng gói được", () => {
  it("ô tick của ghi chú bị KHOÁ và mang lý do nguyên văn, đọc được cho screen reader", () => {
    mount();
    const note = boxes()[2]!;
    expect(note.getAttribute("data-disabled")).not.toBeNull();
    const reason = document.getElementById(note.getAttribute("aria-describedby")!);
    expect(reason?.textContent).toBe(PACK_NOTE_LOCKED);
  });

  it("mặc định chọn sẵn mọi thứ tick được, KHÔNG chọn ghi chú", () => {
    mount();
    expect(screen.getByText("Đã chọn 2 nhóm · 2 món")).toBeTruthy();
  });

  it("bỏ tick một thứ thì dòng tổng đổi theo", () => {
    mount();
    fireEvent.click(boxes()[0]!);
    expect(screen.getByText("Đã chọn 1 nhóm · 1 món")).toBeTruthy();
  });

  it("bỏ hết tick ⇒ nút «Đóng thành bộ kit» khoá, hiện câu hướng dẫn tick", () => {
    mount();
    fireEvent.click(boxes()[0]!);
    fireEvent.click(boxes()[1]!);
    const btn = screen.getByRole("button", { name: "Đóng thành bộ kit" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText("Tick vào thứ bạn muốn đưa vào bộ kit.")).toBeTruthy();
  });
});

describe("② C-01 — đang vẽ thì CẢNH BÁO, không chặn, không huỷ", () => {
  it("hiện đúng dải vàng nguyên văn BA-V3 §3.4", () => {
    mount({ runActive: true });
    expect(screen.getByText(PACK_WHILE_RUNNING)).toBeTruthy();
  });

  it("vẫn đóng gói được (không chặn) và KHÔNG có nút huỷ lượt vẽ nào trên lớp phủ", () => {
    const { onPack } = mount({ runActive: true });
    const btn = screen.getByRole("button", { name: "Đóng thành bộ kit" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onPack).toHaveBeenCalledTimes(1);
    expect(onPack.mock.calls[0]![0]).toEqual(["mock-bg-1", "mock-pose-1"]);

    for (const b of screen.getAllByRole("button")) {
      expect(b.textContent ?? "").not.toMatch(/Dừng vẽ|Huỷ lượt|Dừng lại/);
    }
  });

  it("KHÔNG có lượt nào chạy ⇒ không hiện dải vàng thừa", () => {
    mount();
    expect(screen.queryByText(PACK_WHILE_RUNNING)).toBeNull();
  });
});

describe("③ ô tick không đặt trực tiếp lên ảnh (UX-V3 §8.3)", () => {
  it("mỗi hàng là khối nền đặc `bg-raised`, và KHÔNG có thẻ <img> nào phía sau ô tick", () => {
    const { container } = mount();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    for (const box of boxes()) {
      const row = box.closest("li")!;
      expect(row.className).toContain("bg-raised");
    }
  });
});

describe("bốn ca trạng thái + agent chưa chạy", () => {
  it("empty — bàn chưa có gì tick được", () => {
    render(
      <TooltipProvider>
        <PackOverlay items={[]} onPack={vi.fn()} onClose={vi.fn()} />
      </TooltipProvider>,
    );
    expect(screen.getByRole("heading", { name: "Chưa chọn gì" })).toBeTruthy();
  });

  it("error — câu đời thường + nút Thử lại, KHÔNG lộ chuỗi kỹ thuật", () => {
    const onRetry = vi.fn();
    mount({ errorTitle: "Chưa đóng gói được.", onRetry });
    expect(screen.getByText("Chưa đóng gói được.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("agent chưa chạy — nút khoá VÀ nói rõ lý do bằng chữ, không khoá im lặng", () => {
    mount({ agentOffline: true, agentCommand: "npm run agent" });
    const btn = screen.getByRole("button", { name: /Đóng thành bộ kit —/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText("Công cụ trên máy chưa chạy nên chưa đóng gói được.")).toBeTruthy();
    expect(screen.getByText(MSG.AGENT_OFF_TITLE)).toBeTruthy();
  });

  it("màn kết quả chưa nối ⇒ khoá có lý do riêng, vẫn không im lặng", () => {
    mount({ disabledReason: "Màn kết quả chưa mở ở bản này, nên chưa đóng gói được." });
    expect(screen.getByText("Màn kết quả chưa mở ở bản này, nên chưa đóng gói được.")).toBeTruthy();
  });
});

describe("bàn phím và aria", () => {
  it("là dialog có nhãn, focus rơi vào tiêu đề khi mở", () => {
    mount();
    const dlg = screen.getByRole("dialog");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    const title = within(dlg).getByRole("heading", { level: 2 });
    expect(document.activeElement).toBe(title);
  });

  it("Esc đóng lớp phủ", () => {
    const { onClose } = mount();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("mọi ô tick là control THẬT và có nhãn <label for> riêng (không <div onClick>)", () => {
    const { container } = mount();
    for (const box of boxes()) {
      // Radix render `button[role=checkbox]` — control thật, nhận focus và phím Space.
      expect(box.tagName.toLowerCase()).toBe("button");
      const label = container.querySelector<HTMLLabelElement>(`label[for="${box.id}"]`);
      expect(label).not.toBeNull();
      expect((label!.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
    expect(boxes()).toHaveLength(3);
  });
});
