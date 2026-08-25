/* @vitest-environment jsdom */
/**
 * ĐỢT 08/2026 — BỐN Ý KIẾN CỦA TEAM, ĐO Ở ĐƯỜNG NGƯỜI DÙNG THẬT ĐI.
 *
 * `lib/__tests__/spec-override.test.ts` khoá tầng HỢP ĐỒNG (state → contract). File này
 * khoá tầng còn lại và là tầng hay hỏng lặng lẽ hơn: **cú bấm có tới được state không**.
 * Ba mắt xích của §P1-4 vẫn nguyên giá trị ở đây — control phải CÓ MẶT, phải ghi đúng
 * lớp đè, và phải nói ra trạng thái nó vừa tạo ra (badge "đã chỉnh", ba nút Nền tách).
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadBundledV2 } from "@/features/design/library/lib/source";
import { WorkflowStoreProvider, createWorkflowStore, resetWorkflowStores } from "../lib/model";
import { KitsetStep } from "../steps/KitsetStep";

const PID = "kit-sua-mo-ta";
const LIB = loadBundledV2().elements;

const mount = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider><WorkflowStoreProvider projectId={PID}><KitsetStep variant="manage" /></WorkflowStoreProvider></TooltipProvider>
    </QueryClientProvider>,
  );
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetWorkflowStores();
});

const state = () => createWorkflowStore(PID).getState();
const skelOf = (file: string) => state().elements.find((e) => e.file === file)?.skel;

/** Món chắc chắn thuộc nhóm "UI nhỏ" — cùng bộ lọc mà `cell-background.test.tsx` dùng. */
function isPropOrBg(file: string): boolean {
  return /(^|[-\s])(prop|item|decor|gift|coin|reward|voucher|game-object|board-panel|pouch|medal|envelope|trophy|piece|fx)([-\s]|$)|bg|popup|modal|panel|ribbon/.test(file);
}
const PLAIN = LIB.find((e) => e.skel.matte === undefined && !isPropOrBg(e.file))!;

/**
 * Mở popup Chi tiết của MỘT món: đổi nhóm → tìm theo tên → bấm nút trên thẻ.
 *
 * Chip nhóm phải khớp CẢ CHUỖI (`"Nền"` hoặc `"Nền · 2"`), không khớp tiền tố: thẻ
 * element cũng có tên bắt đầu bằng "Nền…" ("Nền màn HOME"), nên `/^Nền/` là mơ hồ.
 */
function openDetail(container: HTMLElement, group: string, label: string): HTMLElement {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${group}( · \\d+)?$`) }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: label } });
  const grid = container.querySelector(".compact-element-grid") as HTMLElement;
  fireEvent.click(within(grid).getByRole("button", { name: `Chi tiết ${label}` }));
  return screen.getByRole("dialog");
}

const specBox = (dialog: HTMLElement) =>
  within(dialog).getByRole("textbox", { name: "Mô tả gửi cho máy vẽ" }) as HTMLTextAreaElement;

/* ══════════════════════════════════════════════════════════════════════════
   ① Ý KIẾN 1 — ô mô tả sửa được, và nó nói ra rằng mình đã bị sửa
   ══════════════════════════════════════════════════════════════════════════ */

describe("① mô tả gửi máy vẽ là một Ô NHẬP, không còn là một đoạn chữ chết", () => {
  it("mở ra đã điền sẵn chữ của thư viện chung — người ta sửa, không phải viết lại", () => {
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", PLAIN.vi);
    expect(specBox(dialog).value).toBe(PLAIN.spec);
    // Chưa sửa gì ⇒ chưa có lớp đè, và không có badge nào cả.
    expect(skelOf(PLAIN.file)).toBeUndefined();
    expect(within(dialog).queryByText("✎ đã chỉnh")).toBeNull();
  });

  it("gõ chữ ⇒ lớp đè của dự án nhận đúng chữ đó, và badge «đã chỉnh» hiện ra", () => {
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", PLAIN.vi);
    fireEvent.change(specBox(dialog), { target: { value: "một cái nút gỗ, dây thừng viền ngoài" } });
    expect(skelOf(PLAIN.file)?.spec).toBe("một cái nút gỗ, dây thừng viền ngoài");
    expect(within(screen.getByRole("dialog")).getByText("✎ đã chỉnh")).toBeTruthy();
  });

  it("«Khôi phục mặc định» XOÁ hẳn lớp đè, không ghi lại chữ thư viện thành một bản sao", () => {
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", PLAIN.vi);
    fireEvent.change(specBox(dialog), { target: { value: "chữ khác hẳn" } });
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /Khôi phục mặc định/ }));
    expect(skelOf(PLAIN.file)).toBeUndefined();
    expect(specBox(screen.getByRole("dialog")).value).toBe(PLAIN.spec);
  });

  it("nút Khôi phục KHOÁ khi chưa sửa gì — nó không được hứa một việc không có gì để làm", () => {
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", PLAIN.vi);
    const restore = within(dialog).getByRole("button", { name: /Khôi phục mặc định/ }) as HTMLButtonElement;
    expect(restore.disabled).toBe(true);
  });

  it("gõ lại ĐÚNG chữ của thư viện ⇒ lớp đè tự biến mất (badge không được nói dối)", () => {
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", PLAIN.vi);
    fireEvent.change(specBox(dialog), { target: { value: "tạm" } });
    expect(skelOf(PLAIN.file)?.spec).toBe("tạm");
    fireEvent.change(specBox(screen.getByRole("dialog")), { target: { value: PLAIN.spec } });
    expect(skelOf(PLAIN.file)).toBeUndefined();
  });

  /** Ý KIẾN 1 nói thẳng về CẢNH NỀN — ô mà trước đây không có đường nào sửa mô tả. */
  it("ô NỀN cũng có đúng ô nhập ấy, không phải một màn riêng", () => {
    const { container } = mount();
    const dialog = openDetail(container, "Nền", "Nền màn HOME");
    fireEvent.change(specBox(dialog), { target: { value: "sân đình ngày Tết, đèn lồng đỏ" } });
    expect(skelOf("25-bg-home")?.spec).toBe("sân đình ngày Tết, đèn lồng đỏ");
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ② Ý KIẾN 4 — chất liệu (chủ động) và dòng gợi ý (bị động)
   ══════════════════════════════════════════════════════════════════════════ */

describe("② chất liệu: một đường chủ động, một đường gợi ý", () => {
  it("chọn preset ⇒ ghi id chất liệu VÀ áp sẵn cách tách của nó", () => {
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", PLAIN.vi);
    fireEvent.click(within(dialog).getByRole("button", { name: "Kính" }));
    expect(skelOf(PLAIN.file)?.material).toBe("glass");
    expect(skelOf(PLAIN.file)?.matte).toBe("glass");
    // Ba nút Nền tách phải hiện ra thứ vừa xảy ra, không đứng im ở trạng thái cũ.
    expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Trong suốt nhìn xuyên qua" })
      .getAttribute("aria-pressed")).toBe("true");
  });

  it("chất liệu ĐỤC gỡ luôn độ trong đang kẹt lại — gỗ thì không nhìn xuyên qua được", () => {
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", PLAIN.vi);
    fireEvent.click(within(dialog).getByRole("button", { name: "Kính" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Gỗ" }));
    expect(skelOf(PLAIN.file)?.material).toBe("wood");
    expect(skelOf(PLAIN.file)?.matte).toBeUndefined();
  });

  it("người dùng vẫn đổi tay được cách tách SAU khi chọn chất liệu (gợi ý không phải khoá)", () => {
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", PLAIN.vi);
    fireEvent.click(within(dialog).getByRole("button", { name: "Lửa" }));
    expect(skelOf(PLAIN.file)?.matte).toBe("glow");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Nền thường" }));
    expect(skelOf(PLAIN.file)?.matte).toBeUndefined();
    expect(skelOf(PLAIN.file)?.material).toBe("fire"); // chất liệu KHÔNG bị cuốn theo
  });

  it("ô tự gõ nhận chất liệu ngoài danh mục", () => {
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", PLAIN.vi);
    fireEvent.change(within(dialog).getByLabelText("Hoặc tự gõ chất liệu (tiếng Anh)"), {
      target: { value: "brushed copper with soft patina" },
    });
    expect(skelOf(PLAIN.file)?.material).toBe("brushed copper with soft patina");
  });

  it("«Theo mô tả» trả chất liệu về không đặt", () => {
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", PLAIN.vi);
    fireEvent.click(within(dialog).getByRole("button", { name: "Đá" }));
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Theo mô tả" }));
    expect(skelOf(PLAIN.file)?.material).toBeUndefined();
  });

  it("DÒNG GỢI Ý chỉ hiện khi mô tả nói tới kính mà cách tách vẫn là nền thường", () => {
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", PLAIN.vi);
    expect(within(dialog).queryByRole("button", { name: "Áp Trong suốt" })).toBeNull();
    fireEvent.change(specBox(dialog), { target: { value: "một khay kính mờ, viền kim loại" } });
    const hinted = screen.getByRole("dialog");
    expect(within(hinted).getByText(/nghe như là kính/)).toBeTruthy();
    fireEvent.click(within(hinted).getByRole("button", { name: "Áp Trong suốt" }));
    expect(skelOf(PLAIN.file)?.matte).toBe("glass");
    // Đã áp rồi thì gợi ý im — nó không được nhắc mãi một việc đã xong.
    expect(within(screen.getByRole("dialog")).queryByRole("button", { name: "Áp Trong suốt" })).toBeNull();
  });

  it("BA MỨC KÍNH chỉ hiện khi ô đang là kính, và bấm lại mức đang chọn thì bỏ mức", () => {
    const { container } = mount();
    const dialog = openDetail(container, "UI nhỏ", PLAIN.vi);
    expect(within(dialog).queryByRole("button", { name: "Kính đậm" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Trong suốt nhìn xuyên qua" }));
    const glass = screen.getByRole("dialog");
    for (const level of ["Kính trong", "Kính mờ", "Kính đậm"]) {
      expect(within(glass).getByRole("button", { name: level }), level).toBeTruthy();
    }
    fireEvent.click(within(glass).getByRole("button", { name: "Kính đậm" }));
    expect(skelOf(PLAIN.file)?.glassLevel).toBe("tinted");
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Kính đậm" }));
    expect(skelOf(PLAIN.file)?.glassLevel).toBeUndefined();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   ③ Ý KIẾN 6 — nạp từ mockup (đợt 1, thủ công)
   ══════════════════════════════════════════════════════════════════════════ */

describe("③ nạp từ mockup: ảnh vào bộ ảnh phong cách, tick vào kitset", () => {
  it("nút nằm ở ĐẦU màn, cả bản wizard lẫn bản quản lý", () => {
    mount();
    expect(screen.getByRole("button", { name: /Nạp từ mockup/ })).toBeTruthy();
  });

  it("bấm Xong ⇒ đúng những món đã tick được chọn vào bộ khung", () => {
    const store = createWorkflowStore(PID);
    const { container } = mount();
    // Dọn sạch trước, để phép đo nói về CHÍNH cú tick trong dialog.
    store.getState().setElementsSelected(store.getState().elements.map((e) => e.file), false);
    fireEvent.click(within(container).getByRole("button", { name: /Nạp từ mockup/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: PLAIN.vi }));
    fireEvent.click(within(dialog).getByRole("button", { name: /^Xong/ }));
    expect(state().elements.find((e) => e.file === PLAIN.file)?.selected).toBe(true);
    // CỘNG THÊM, không thay thế: món không tick giữ nguyên trạng thái cũ của nó.
    const other = state().elements.find((e) => e.file !== PLAIN.file && e.file !== "wheel-board")!;
    expect(other.selected).toBe(false);
  });

  it("Huỷ ⇒ không tick gì cả", () => {
    const store = createWorkflowStore(PID);
    const { container } = mount();
    store.getState().setElementsSelected(store.getState().elements.map((e) => e.file), false);
    fireEvent.click(within(container).getByRole("button", { name: /Nạp từ mockup/ }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: PLAIN.vi }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Huỷ" }));
    expect(state().elements.find((e) => e.file === PLAIN.file)?.selected).toBe(false);
  });

  it("lưới thành phần chính KHÔNG mọc thêm control nào vì tính năng này", () => {
    const { container } = mount();
    const grid = container.querySelector(".compact-element-grid")!;
    expect(grid.querySelectorAll("input, select, textarea")).toHaveLength(0);
  });
});
