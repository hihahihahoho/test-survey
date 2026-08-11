/**
 * XẾP TẦNG CANVAS — kiểm trên DOM THẬT (jsdom + @testing-library).
 * Đặc tả: FLOW-V3 §5 · UX-V3 §7.2/§7.3 · FE3-PLAN §3-C1.
 *
 * ══ GIỚI HẠN PHẢI NÓI TRƯỚC (không được đọc bảng xanh mà tưởng đã đo pixel) ══
 * jsdom **không có layout engine**: mọi `getBoundingClientRect()` trả 0×0. Vì thế bộ này
 * KHÔNG đo pixel trình duyệt. Nó chứng minh ba việc mà jsdom làm được thật:
 *   ① mỗi tầng là một PHẦN TỬ RỜI, ANH EM với nhau — không tầng nào nằm trong `flex-col`
 *      của tầng nào (đây chính là nguyên nhân gốc ở UX-V3 §7.1);
 *   ② mỗi tầng mang ĐÚNG class neo của đặc tả, và thẻ empty KHÔNG còn `inset-0`;
 *   ③ hành vi: thu gọn theo chiều cao khung, thứ tự Tab, thẻ ghim theo màn hình khi kéo bàn.
 * Phép cộng "hai hộp có giao nhau không" nằm ở `layering-geometry.test.ts` (thuần số).
 * Phép đo `getBoundingClientRect` THẬT trên trình duyệt là việc của **Q1** — C1 không
 * tự nhận đã làm. Xem `fe3/C1-REPORT.md` §5.
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

/**
 * Khung nhìn có kích thước ĐỔI ĐƯỢC giữa các ca: `useViewport` đo khung ngay trong
 * callback ref, nên chiều cao phải sẵn sàng TRƯỚC khi render (không thể set sau).
 */
let FRAME_W = 1280;
let FRAME_H = 720 - 56; // trừ header 56px của FloraShell
Element.prototype.getBoundingClientRect = function () {
  return {
    left: 0, top: 0, right: FRAME_W, bottom: FRAME_H, width: FRAME_W, height: FRAME_H,
    x: 0, y: 0, toJSON: () => ({}),
  } as DOMRect;
};

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { canvasDocSchema, type CanvasDoc, type DraftBadge } from "@/features/docs/lib";
import { CanvasShell, type CanvasShellProps } from "../components/CanvasShell";
import {
  COMPACT_FRAME_MAX_H_PX,
  LAYER_CLASS,
  canvasLayerBoxes,
  overlapsY,
} from "../lib/canvas-layers";

afterEach(cleanup);

const LOCAL: DraftBadge = {
  level: "info", label: "bản nháp cục bộ", tone: "muted",
  explain: "Bàn làm việc này đang được lưu trên máy bạn, chưa nằm trong thư mục dự án.",
};
const EMPTY: CanvasDoc = canvasDocSchema.parse({});

function mount(over: Partial<CanvasShellProps> = {}) {
  const props: CanvasShellProps = {
    docName: "Bàn ý tưởng Tết",
    phase: "empty",
    canvas: EMPTY,
    errorTitle: "",
    onRetry: vi.fn(),
    saveState: "idle",
    badge: LOCAL,
    ...over,
  };
  return render(
    <TooltipProvider>
      <CanvasShell {...props} />
    </TooltipProvider>,
  );
}

const card = () => screen.getByTestId("canvas-empty-card");
const safeArea = () => screen.getByTestId("canvas-safe-area");
const stripRow = () => screen.getByTestId("canvas-strip-row");
const floatRow = () => screen.getByTestId("canvas-float-row");

/* ═════════ ① Ba tầng là ANH EM RỜI — nguyên nhân gốc §7.1 ═════════ */

describe("§7.1 — ba tầng ghim đáy KHÔNG còn nằm chung một cột flex", () => {
  it("dải trạng thái và thanh nổi là hai phần tử ANH EM, không cái nào chứa cái nào", () => {
    mount();
    const strip = stripRow();
    const float = floatRow();
    expect(strip.contains(float)).toBe(false);
    expect(float.contains(strip)).toBe(false);
    expect(strip.parentElement).toBe(float.parentElement);
  });

  it("KHÔNG còn tổ tiên `flex-col` chung: đổi cao dải không đẩy thanh nổi", () => {
    mount();
    // leo từ dải lên tới khung overlay, dừng ở tổ tiên chung với floatbar
    const shared = stripRow().parentElement!;
    for (let el: HTMLElement | null = stripRow(); el && el !== shared; el = el.parentElement) {
      expect(el.className).not.toMatch(/\bflex-col\b/);
    }
    for (let el: HTMLElement | null = floatRow(); el && el !== shared; el = el.parentElement) {
      expect(el.className).not.toMatch(/\bflex-col\b/);
    }
  });

  it("thẻ empty KHÔNG nằm trong khung của dải hay của thanh nổi", () => {
    mount();
    expect(stripRow().contains(card())).toBe(false);
    expect(floatRow().contains(card())).toBe(false);
  });
});

/* ═════════ ② Class neo đúng đặc tả §7.2 ═════════ */

describe("§7.2 — mỗi tầng mang đúng class neo", () => {
  it("vùng an toàn dùng `bottom-[160px]`, và TUYỆT ĐỐI không còn `inset-0`", () => {
    mount();
    const cls = safeArea().className;
    expect(cls).toContain(LAYER_CLASS.safeArea.className);
    expect(cls).not.toMatch(/\binset-0\b/); // ← đúng dòng mã đã gây lỗi FLOW-V3 §5
  });

  it("dải trạng thái neo `bottom-[88px]` và cao CỐ ĐỊNH `h-7`", () => {
    mount();
    const cls = stripRow().className;
    expect(cls).toContain(LAYER_CLASS.stripBottom.className);
    expect(cls).toContain(LAYER_CLASS.stripHeight.className);
  });

  it("thanh nổi neo `bottom-4` và giữ chỗ `min-h-12`", () => {
    mount();
    const cls = floatRow().className;
    expect(cls).toContain(LAYER_CLASS.floatBottom.className);
    expect(cls).toContain(LAYER_CLASS.floatHeight.className);
  });

  it("thẻ có TRẦN chiều cao ⇒ chữ dài bất thường cũng không trườn ra khỏi vùng an toàn", () => {
    mount();
    expect(Number.parseInt(card().style.maxHeight, 10)).toBeGreaterThan(0);
    expect(card().className).toContain("overflow-y-auto");
  });
});

/* ═════════ ③ Bốn viewport bắt buộc của §7.3 ═════════ */

describe.each([
  ["1280×720", 1280, 720],
  ["1440×900", 1440, 900],
  ["1920×1080", 1920, 1080],
  ["1280×640 (thu cửa sổ)", 1280, 640],
])("§7.3 — %s: ba tầng dựng đủ và không chồng nhau", (_name, w, h) => {
  it("cả ba tầng có mặt, và hình học của chính bộ số đó không cho hai tầng giao nhau", () => {
    FRAME_W = w;
    FRAME_H = h - 56;
    mount();

    expect(safeArea()).toBeTruthy();
    expect(stripRow()).toBeTruthy();
    expect(floatRow()).toBeTruthy();

    const b = canvasLayerBoxes(FRAME_H);
    expect(b.safeArea.bottom).toBeLessThanOrEqual(b.float.top);
    expect(overlapsY(b.strip, b.safeArea)).toBe(false);
    expect(overlapsY(b.strip, b.float)).toBe(false);

    FRAME_W = 1280;
    FRAME_H = 720 - 56;
  });
});

describe("khung thấp ⇒ thẻ THU GỌN, không tràn", () => {
  it("khung 500px: bỏ dòng gợi ý, giữ tiêu đề + 1 câu", () => {
    FRAME_H = 500;
    mount();
    expect(card().getAttribute("data-compact")).toBe("true");
    expect(screen.getByRole("heading", { name: /Bàn còn trống/ })).toBeTruthy();
    expect(screen.getByText(/Bấm Nhờ máy vẽ ở thanh dưới/)).toBeTruthy();
    expect(screen.queryByText(/kéo ảnh tham khảo thả vào bàn/)).toBeNull();
    FRAME_H = 720 - 56;
  });

  it(`khung ${COMPACT_FRAME_MAX_H_PX}px (đúng ngưỡng): vẫn là thẻ đầy đủ, có dòng gợi ý`, () => {
    FRAME_H = COMPACT_FRAME_MAX_H_PX;
    mount();
    expect(card().getAttribute("data-compact")).toBe("false");
    expect(screen.getByText(/kéo ảnh tham khảo thả vào bàn/)).toBeTruthy();
    FRAME_H = 720 - 56;
  });
});

/* ═════════ ④ Tiêu đề lặp — lỗi thứ hai của FLOW-V3 §5 ═════════ */

describe("§7.3 — tên bộ kit KHÔNG còn lặp trong màn", () => {
  it("chuỗi «· bàn ý tưởng» đã biến mất khỏi phần nhìn thấy được", () => {
    const { container } = mount();
    expect(container.textContent).not.toContain("bàn ý tưởng");
  });

  it("tên bộ kit chỉ còn đúng MỘT lần, và nằm ở nhãn cho trình đọc màn hình", () => {
    const { container } = mount({ docName: "Ý tưởng hè" });
    const hits = (container.innerHTML.match(/Ý tưởng hè/g) ?? []).length;
    expect(hits).toBe(1);
    expect(screen.getByRole("application", { name: "Bàn làm việc Ý tưởng hè" })).toBeTruthy();
  });

  it("vùng mốc vẫn CÓ TÊN cho trình đọc màn hình (không bỏ h1 rồi thành «region» trống)", () => {
    mount();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.className).toContain("sr-only");
    expect(h1.textContent).toBe("Bàn làm việc");
    expect(h1.closest("section")!.getAttribute("aria-labelledby")).toBe(h1.id);
  });
});

/* ═════════ ⑤ Copy + một nút phát sáng ═════════ */

describe("copy chốt UX-V3 §4.1/§5.3", () => {
  it("thẻ empty dùng đúng chữ «Bàn còn trống» + câu chỉ xuống thanh dưới", () => {
    mount();
    expect(screen.getByRole("heading", { name: "Bàn còn trống" })).toBeTruthy();
    expect(screen.getByText("Bấm Nhờ máy vẽ ở thanh dưới để bắt đầu.")).toBeTruthy();
  });

  it("thẻ empty KHÔNG chứa nút nào (nút nằm ở thanh nổi — L1)", () => {
    mount();
    expect(card().querySelectorAll("button")).toHaveLength(0);
  });

  it("câu chỉ đường có ĐÍCH thật: thanh nổi mang món «Nhờ máy vẽ»", () => {
    mount();
    expect(screen.getByRole("button", { name: /Nhờ máy vẽ/ })).toBeTruthy();
  });

  /**
   * Từ cấm §5.4 soi trên **CẢ 5 CA** chứ không chỉ ca empty: lỗi copy hay trốn trong ca
   * error/agent-offline vì ít ai mở ra xem. Ca `error` được phép có mã kỹ thuật, nhưng
   * CHỈ trong `<details>` «Chi tiết cho lập trình viên» ⇒ bóc khối đó ra trước khi soi.
   */
  it("từ CẤM của §5.4 không xuất hiện ở BẤT KỲ ca nào (kể cả error, agent tắt)", () => {
    const BANNED = [
      "sheet", "element", "contract", "variant", "workflow", "canvas", "quota",
      "frame", "template", "skeleton", "quy trình chuẩn",
    ];
    /* Nhãn RIÊNG cho từng ca: `phase` không phân biệt được ca agent-offline (nó không phải
       một phase), mà đó lại đúng là ca bộ test này bắt được lỗi copy đầu tiên. */
    const CASES: Array<{ name: string; props: Partial<CanvasShellProps> }> = [
      { name: "empty", props: { phase: "empty" } },
      { name: "ready", props: { phase: "ready", canvas: canvasDocSchema.parse({ nodes: [{ id: "n1", type: "note", x: 0, y: 0, w: 10, h: 10 }] }) } },
      { name: "loading", props: { phase: "loading" } },
      { name: "timeout", props: { phase: "timeout" } },
      { name: "error", props: { phase: "error", errorTitle: "Chưa mở được bàn làm việc.", errorDetail: "DOC_BROKEN: sheet lệch schema", onOpenWorkflow: vi.fn() } },
      { name: "agent-offline", props: { agentOffline: true, agentCommand: "npm run agent" } },
    ];
    for (const { name, props } of CASES) {
      const { container, unmount } = mount(props);
      for (const details of Array.from(container.querySelectorAll("details"))) details.remove();
      const text = (container.textContent ?? "").toLowerCase();
      for (const banned of BANNED) {
        expect(`[${name}] có "${banned}"? ${text.includes(banned)}`).toBe(`[${name}] có "${banned}"? false`);
      }
      unmount();
    }
  });

  it("Copy sang Figma xuất hiện ĐÚNG MỘT chỗ (bỏ bản trùng ở rail)", () => {
    mount();
    expect(screen.getAllByRole("button", { name: /Copy sang Figma/ })).toHaveLength(1);
  });
});

/* ═════════ ⑥ Bàn phím ═════════ */

describe("§7.3 — bàn phím: rail → thẻ → dải → thanh nổi", () => {
  it("thứ tự DOM đúng chiều đọc; thẻ không có điểm dừng nên Tab đi rail → dải → thanh nổi", () => {
    const { container } = mount();
    const order = ["canvas-safe-area", "canvas-strip-row", "canvas-float-row"];
    const found = Array.from(container.querySelectorAll("[data-testid]"))
      .map((el) => el.getAttribute("data-testid")!)
      .filter((id) => order.includes(id));
    expect(found).toEqual(order);

    const rail = screen.getByRole("group", { name: /Công cụ bàn làm việc/ });
    const bar = screen.getByRole("toolbar", { name: "Công cụ bàn làm việc" });
    expect(rail.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("thanh nổi giữ ĐÚNG MỘT điểm dừng Tab và ←/→ đi trong thanh (APG)", () => {
    mount();
    const bar = screen.getByRole("toolbar", { name: "Công cụ bàn làm việc" });
    const items = Array.from(bar.querySelectorAll("button")).filter((b) => !b.disabled);
    expect(items.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    items[0]!.focus();
    fireEvent.keyDown(bar, { key: "ArrowRight" });
    expect(document.activeElement).toBe(items[1]);
  });

  it("badge nháp trong dải vẫn nhận được focus để đọc lời giải thích", () => {
    mount();
    const badge = screen.getByText("Chưa lưu").closest("[tabindex]") as HTMLElement;
    expect(badge.tabIndex).toBe(0);
    expect(stripRow().contains(badge)).toBe(true);
  });
});

/* ═════════ ⑦ Kéo bàn: thẻ ghim theo màn hình, thanh nổi bất động ═════════ */

describe("§7.3 — kéo bàn ra xa: thẻ vẫn ở giữa tầm mắt, thanh nổi bất động", () => {
  it("pan đổi transform của LỚP THẾ GIỚI, nhưng thẻ/dải/thanh nổi giữ nguyên class neo", () => {
    mount();
    const app = screen.getByRole("application", { name: /Bàn làm việc/ });
    const world = screen.getByTestId("canvas-world");
    const before = {
      world: world.style.transform,
      safe: safeArea().className,
      strip: stripRow().className,
      float: floatRow().className,
    };

    fireEvent.keyDown(app, { key: "ArrowRight" });
    fireEvent.keyDown(app, { key: "ArrowDown", shiftKey: true });

    expect(world.style.transform).not.toBe(before.world); // thế giới ĐÃ dời
    expect(safeArea().className).toBe(before.safe); // ba tầng ghim thì KHÔNG
    expect(stripRow().className).toBe(before.strip);
    expect(floatRow().className).toBe(before.float);
    // và thẻ vẫn nằm trong vùng an toàn, không bị lôi theo thế giới
    expect(world.contains(card())).toBe(false);
    expect(safeArea().contains(card())).toBe(true);
  });
});
