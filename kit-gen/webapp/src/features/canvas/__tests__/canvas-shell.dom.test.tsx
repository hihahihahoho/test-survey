/**
 * CanvasShell — kiểm bằng DOM THẬT (jsdom + @testing-library).
 *
 * Vá jsdom nằm NGAY ĐÂY chứ không ở `setupFiles`: glob D của FE2-PLAN §1 không cấp file
 * setup, và tạo thêm file ngoài glob chính là lỗi ownership của B2 ở FE-1.
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
/**
 * jsdom KHÔNG có layout engine: mọi `getBoundingClientRect()` trả 0×0. `useViewport` đo
 * khung chứa NGAY trong callback ref, nên nếu không vá TRƯỚC khi render thì khung luôn
 * 0×0 và `fitRect` (đúng theo thiết kế của B1) trả về IDENTITY — ta sẽ test một cái vỏ
 * rỗng chứ không phải phép fit. Vá ở tầng prototype để phép đo lúc mount đã có số thật.
 */
const VIEW_W = 800;
const VIEW_H = 600;
Element.prototype.getBoundingClientRect = function () {
  return { left: 0, top: 0, right: VIEW_W, bottom: VIEW_H, width: VIEW_W, height: VIEW_H, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
};
if (typeof (globalThis as { CSS?: unknown }).CSS === "undefined") {
  (globalThis as Record<string, unknown>).CSS = { escape: (s: string) => s.replace(/([^\w-])/g, "\\$1") };
}
(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, describe, expect, it, vi } from "vitest";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { canvasDocSchema, type CanvasDoc, type DraftBadge } from "@/features/docs/lib";
import { CanvasShell, type CanvasShellProps } from "../components/CanvasShell";

afterEach(cleanup);

const LOCAL: DraftBadge = {
  level: "info", label: "bản nháp cục bộ", tone: "muted",
  explain: "Bàn làm việc này đang được lưu trên máy bạn, chưa nằm trong thư mục dự án.",
};
const EMPTY: CanvasDoc = canvasDocSchema.parse({});
const WITH_NODE: CanvasDoc = canvasDocSchema.parse({
  nodes: [{ id: "n1", type: "note", x: 0, y: 0, w: 200, h: 100 }],
});

function mount(over: Partial<CanvasShellProps> = {}) {
  const onRetry = over.onRetry ?? vi.fn();
  const props: CanvasShellProps = {
    docName: "Bàn ý tưởng Tết",
    phase: "empty",
    canvas: EMPTY,
    errorTitle: "",
    onRetry,
    saveState: "idle",
    badge: LOCAL,
    ...over,
  };
  const utils = render(
    <TooltipProvider>
      <CanvasShell {...props} />
    </TooltipProvider>,
  );
  return { ...utils, onRetry };
}

const world = () => screen.getByTestId("canvas-world");
const viewport = () => screen.getByRole("application", { name: /Bàn làm việc/ });

/** Khung nhìn đã được đo sẵn nhờ bản vá prototype ở đầu file. */
const sizeViewport = () => viewport();

describe("năm trạng thái + agent chưa chạy — không ca nào trắng trang", () => {
  /**
   * ══ CA ĐỔI Ở C1 — nêu rõ theo luật NEEDS-fe3-s0 N1 ══
   * CA CŨ: «empty … kèm thẻ mời và **ba gợi ý đang khoá**» (3 nút trong thẻ).
   * ĐỔI THEO: UX-V3 §5.3 + §4.1 + luật L1 — thẻ empty **không có nút nào**, câu chữ chỉ
   * thẳng xuống «✨ Nhờ máy vẽ» ở thanh nổi; và tiêu đề đổi «Bàn làm việc trống» →
   * «Bàn còn trống». Ba nút cũ chính là phần chữ đặc làm thẻ cao tới mức tràn xuống đè
   * floatbar (FLOW-V3 §5), nên giữ chúng là giữ nguyên lỗi.
   * THAY BẰNG: ca dưới đây (thẻ không nút + câu chỉ đường có đích thật) và bộ
   * `layering-canvas.dom.test.tsx` §⑤. Không ca nào bị xoá mà không có ca thay thế.
   */
  it("empty: khung nhìn VẪN có, thẻ mời KHÔNG có nút, chỉ đường xuống thanh nổi", () => {
    mount();
    expect(viewport()).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Bàn còn trống/ })).toBeTruthy();
    expect(screen.getByTestId("canvas-empty-card").querySelectorAll("button")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /Nhờ máy vẽ/ })).toBeTruthy();
  });

  it("loading: có aria-busy + nhãn đọc được, KHÔNG dựng khung nhìn giả", () => {
    mount({ phase: "loading" });
    expect(screen.getByText("Đang mở bàn làm việc…")).toBeTruthy();
    expect(document.querySelector("[aria-busy='true']")).toBeTruthy();
    expect(screen.queryByRole("application")).toBeNull();
  });

  it("timeout: đổi sang lối lỗi có [Thử lại], không quay mãi", () => {
    const onRetry = vi.fn();
    mount({ phase: "timeout", onRetry });
    expect(screen.getByText(/mở lâu bất thường/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thử lại" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("error: thân UI KHÔNG chứa mã lỗi; mã chỉ nằm trong «Chi tiết cho lập trình viên»", () => {
    mount({
      phase: "error",
      errorTitle: "Nội dung file lưu trên máy bị hỏng nên không mở được.",
      errorDetail: "DOC_BROKEN: canvas f-x lệch schema",
      onOpenWorkflow: vi.fn(),
    });
    const alert = screen.getByRole("alert");
    const details = alert.querySelector("details")!;
    expect(details.textContent).toContain("DOC_BROKEN");
    // bóc panel kỹ thuật ra khỏi thân: phần còn lại không được có mã lỗi
    details.remove();
    expect(alert.textContent).not.toContain("DOC_BROKEN");
    expect(alert.textContent).toContain("Nội dung file lưu trên máy bị hỏng");
    expect(screen.getByRole("button", { name: "Mở dạng form" })).toBeTruthy();
  });

  it("ready: có nội dung ⇒ nút «vừa khít tất cả» BẬT; empty ⇒ nút đó KHOÁ", () => {
    mount({ phase: "ready", canvas: WITH_NODE });
    expect((screen.getByRole("button", { name: "Xem vừa khít tất cả" }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    mount();
    expect((screen.getByRole("button", { name: "Xem vừa khít tất cả" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("agent chưa chạy: banner nói rõ vẫn dùng được, khung nhìn KHÔNG bị khoá", () => {
    mount({ agentOffline: true, agentCommand: "npx kitgen agent" });
    expect(screen.getByText(/Công cụ trên máy chưa chạy/)).toBeTruthy();
    expect(screen.getByText(/vẫn xem và sắp xếp bàn làm việc được/)).toBeTruthy();
    expect(viewport()).toBeTruthy();
    // vẫn pan được bằng bàn phím
    const before = world().style.transform;
    fireEvent.keyDown(viewport(), { key: "ArrowRight" });
    expect(world().style.transform).not.toBe(before);
  });
});

describe("pan/zoom THẬT SỰ đổi transform (tiêu chí D1)", () => {
  it("mũi tên pan 40px, Shift pan 200px", () => {
    mount();
    const el = sizeViewport();
    expect(world().style.transform).toBe("translate(0px, 0px) scale(1)");
    fireEvent.keyDown(el, { key: "ArrowRight" });
    expect(world().style.transform).toBe("translate(-40px, 0px) scale(1)");
    fireEvent.keyDown(el, { key: "ArrowDown", shiftKey: true });
    expect(world().style.transform).toBe("translate(-40px, -200px) scale(1)");
  });

  it("⌘+ / ⌘- / ⌘0 đổi mức phóng và con số trên thanh công cụ đi theo", () => {
    mount();
    const el = sizeViewport();
    fireEvent.keyDown(el, { key: "=", metaKey: true });
    expect(screen.getByRole("button", { name: /Mức phóng 120 phần trăm/ })).toBeTruthy();
    fireEvent.keyDown(el, { key: "-", metaKey: true });
    expect(screen.getByRole("button", { name: /Mức phóng 100 phần trăm/ })).toBeTruthy();
    fireEvent.keyDown(el, { key: "=", metaKey: true });
    fireEvent.keyDown(el, { key: "0", metaKey: true });
    expect(screen.getByRole("button", { name: /Mức phóng 100 phần trăm/ })).toBeTruthy();
  });

  it("Ctrl cũng chạy như ⌘ (người dùng Windows không phải học phím Mac)", () => {
    mount();
    const el = sizeViewport();
    fireEvent.keyDown(el, { key: "=", ctrlKey: true });
    expect(screen.getByRole("button", { name: /Mức phóng 120 phần trăm/ })).toBeTruthy();
  });

  it("⌘1 «vừa khít tất cả» dời khung tới nội dung; canvas rỗng thì KHÔNG nổ", () => {
    mount({ phase: "ready", canvas: WITH_NODE });
    const el = sizeViewport();
    fireEvent.keyDown(el, { key: "1", metaKey: true });
    const t = world().style.transform;
    expect(t).not.toBe("translate(0px, 0px) scale(1)");
    expect(t).not.toMatch(/NaN|Infinity/);

    cleanup();
    mount();
    const el2 = sizeViewport();
    fireEvent.keyDown(el2, { key: "1", metaKey: true });
    expect(world().style.transform).not.toMatch(/NaN|Infinity/);
  });

  it("nút −/+/100% trên thanh công cụ chạy đúng như phím", () => {
    mount();
    sizeViewport();
    fireEvent.click(screen.getByRole("button", { name: "Phóng to" }));
    expect(screen.getByRole("button", { name: /Mức phóng 120 phần trăm/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Thu nhỏ" }));
    expect(screen.getByRole("button", { name: /Mức phóng 100 phần trăm/ })).toBeTruthy();
  });

  it("kéo bằng chuột giữa dời khung nhìn đúng bằng quãng con trỏ đi", () => {
    mount();
    const el = sizeViewport();
    fireEvent.pointerDown(el, { button: 1, pointerId: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 130, clientY: 90 });
    expect(world().style.transform).toBe("translate(30px, -10px) scale(1)");
    fireEvent.pointerUp(el, { pointerId: 1 });
    fireEvent.pointerMove(el, { pointerId: 1, clientX: 400, clientY: 400 });
    expect(world().style.transform).toBe("translate(30px, -10px) scale(1)"); // nhả rồi thì không kéo nữa
  });

  it("dot-grid TRÔI theo khung nhìn (không phải nền dán cứng)", () => {
    mount();
    const el = sizeViewport();
    // jsdom chuẩn hoá "0.00px" → "0px" khi ghi vào CSSOM ⇒ so bằng số, không so chuỗi thô.
    const pos = () => el.style.backgroundPosition.split(" ").map(parseFloat);
    expect(pos()).toEqual([0, 0]);
    expect(el.style.backgroundAttachment).toBe("scroll");
    fireEvent.keyDown(el, { key: "ArrowLeft" });
    expect(pos()).toEqual([40, 0]);
  });
});

describe("a11y §5.8", () => {
  it("khung nhìn là widget nhận phím: role=application + nhãn + Tab tới được + có mô tả phím", () => {
    mount();
    const el = viewport();
    expect(el.getAttribute("role")).toBe("application");
    expect(el.getAttribute("aria-label")).toBe("Bàn làm việc Bàn ý tưởng Tết");
    expect(el.tabIndex).toBe(0);
    const describedBy = el.getAttribute("aria-describedby")!;
    const hint = document.getElementById(describedBy.split(" ")[0]!)!;
    expect(hint.textContent).toMatch(/mũi tên/);
    expect(hint.textContent).toMatch(/phím cách/);
  });

  it("thanh công cụ nổi dùng FloatingToolbar của R0: role=toolbar + một điểm dừng Tab + ←/→", () => {
    mount({ phase: "ready", canvas: WITH_NODE });
    const bar = screen.getByRole("toolbar", { name: "Công cụ bàn làm việc" });
    const items = within(bar).getAllByRole("button").filter((b) => !(b as HTMLButtonElement).disabled);
    expect(items.length).toBeGreaterThan(1);
    expect(items.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    items[0]!.focus();
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(bar, { key: "End" });
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  /**
   * `FloatingToolbar` cố ý KHÔNG đặt `tabindex="-1"` lên nút khoá: thuộc tính `disabled`
   * đã loại nó khỏi thứ tự Tab của trình duyệt rồi, và đặt thêm sẽ làm nút vĩnh viễn không
   * quay lại được vòng khi nó bật lên. Điều PHẢI đúng là: nút khoá không nhận focus và
   * mũi tên nhảy QUA nó — kiểm đúng hai điều đó thay vì kiểm giá trị `tabIndex`.
   */
  it("nút khoá bị loại khỏi vòng di chuyển của thanh (APG)", () => {
    mount(); // empty ⇒ «vừa khít» và «Copy ra Figma» đều khoá
    const bar = screen.getByRole("toolbar", { name: "Công cụ bàn làm việc" });
    const all = within(bar).getAllByRole("button");
    const disabled = all.filter((b) => (b as HTMLButtonElement).disabled);
    expect(disabled.length).toBeGreaterThan(0);

    for (const b of disabled) {
      b.focus();
      expect(document.activeElement).not.toBe(b);
    }

    // đi hết một vòng bằng mũi tên: không lần nào dừng ở nút khoá
    const enabled = all.filter((b) => !(b as HTMLButtonElement).disabled);
    enabled[0]!.focus();
    for (let i = 0; i < enabled.length + 1; i++) {
      fireEvent.keyDown(bar, { key: "ArrowRight" });
      expect(disabled).not.toContain(document.activeElement);
    }
  });

  it("phím khung nhìn KHÔNG bị bắt khi đang gõ trong ô nhập liệu", () => {
    mount();
    const el = sizeViewport();
    const input = document.createElement("input");
    el.appendChild(input);
    input.focus();
    const before = world().style.transform;
    // event bubble từ input lên khung: handler của khung nhận `target` là input
    const ev = new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true });
    input.dispatchEvent(ev);
    expect(world().style.transform).toBe(before);
    expect(ev.defaultPrevented).toBe(false);
  });

  /**
   * ══ CA ĐỔI Ở C1 ══ số món rail: `>= 6` → **đúng 5**.
   * ĐỔI THEO: UX-V3 §4.1 chốt rail đúng 5 món (chọn · khung · ảnh · ghi chú · link) và
   * đặt «Copy sang Figma» ở **thanh nổi**. Món thứ 6 cũ là bản trùng của Copy — cùng một
   * việc nằm hai chỗ. Điều PHẢI đúng (mọi món khoá + có lý do bằng chữ) giữ nguyên.
   */
  it("rail công cụ khai đúng sự thật: đúng 5 món, đều khoá và có lý do bằng chữ", () => {
    mount();
    const rail = screen.getByRole("group", { name: /Công cụ bàn làm việc — sắp có/ });
    const buttons = within(rail).getAllByRole("button");
    expect(buttons).toHaveLength(5);
    expect(buttons).toHaveLength(5);
    expect((buttons.at(-1) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("trạng thái lưu + badge nháp cục bộ", () => {
  it("badge luôn hiện và nói rõ dữ liệu đang nằm trên máy", () => {
    mount();
    expect(screen.getByText("Chưa lưu")).toBeTruthy();
  });

  it("ghi hỏng ⇒ role=alert; đang lưu ⇒ role=status (không cắt lời trình đọc màn hình)", () => {
    mount({ saveState: "error" });
    expect(screen.getByRole("alert").textContent).toContain("Chưa lưu được thay đổi");
    cleanup();
    mount({ saveState: "saving" });
    expect(screen.getByRole("status").textContent).toContain("Đang lưu…");
  });
});

describe("ranh giới cứng FE-2 — không có canvas thật", () => {
  it("lớp thế giới render object thật từ canvas", () => {
    mount({ phase: "ready", canvas: WITH_NODE });
    const children = Array.from(world().children);
    expect(children[0]!.getAttribute("data-testid")).toBe("canvas-origin");
    expect(children).toHaveLength(2);
    expect(screen.getByRole("button", { name: "note" })).toBeTruthy();
  });

  /**
   * ══ CA ĐỔI Ở C1 ══ «Copy ra Figma khoá ở **cả hai** chỗ (2 nút)» → **đúng 1 chỗ**.
   * ĐỔI THEO: UX-V3 §4.1 (Copy thuộc thanh nổi) + §5.1 (chữ chốt là «⧉ Copy sang Figma»,
   * không phải «Copy ra Figma»). Ràng buộc THẬT SỰ quan trọng — hành động chưa chạy được
   * thì phải KHOÁ và nói rõ lý do — được giữ và kiểm chặt hơn: nay còn kiểm cả «Đóng gói».
   */
  it("Copy sang Figma, Đóng gói và Nhờ máy vẽ: mỗi việc đúng MỘT nút", () => {
    mount({ phase: "ready", canvas: WITH_NODE });
    for (const name of [/Copy sang Figma/, /Đóng gói/, /Nhờ máy vẽ/]) {
      expect(screen.getAllByRole("button", { name })).toHaveLength(1);
    }
  });
});
