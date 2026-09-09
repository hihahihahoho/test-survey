/* @vitest-environment jsdom */
/**
 * THANH PHIÊN BẢN — CHỌN LÀ ĐỔI, VÀ CÓ NÚT XOÁ CÓ CHỮ.
 *
 * ╔══ VÌ SAO CA NÀY ĐÁNG MỘT FILE TEST RIÊNG ════════════════════════════════╗
 * ║ Chủ sản phẩm 09/09/2026 gạch đi đúng hai thứ của bản trước: nút «Khôi phục ║
 * ║ bản này» kèm hộp xác nhận ("user select là được mà"), và cái nút xoá chỉ có║
 * ║ hình thùng rác lại còn trốn đi khi đang đứng ở bản đang dùng ("VẪN KO CÓ   ║
 * ║ NÚT XOÁ PHIÊN BẢN À???"). Cả hai đều là thứ một ca đếm-số-nút sẽ bỏ lọt,   ║
 * ║ nên ở đây gọi ĐÍCH DANH: cái đã bỏ phải không quay lại, và cú chọn phải    ║
 * ║ gọi thẳng `#40` — không qua một nhịp bấm nào nữa.                          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} } as never;
}

const restoreMutate = vi.fn();
const deleteMutate = vi.fn();
let restorePending = false;
let historyItems: Array<{ id: string; at: string | null; current: boolean }> = [];

vi.mock("@/lib/hooks", () => ({
  useRawHistory: () => ({ data: { items: historyItems }, isLoading: false }),
  useRestoreRaw: () => ({ mutate: restoreMutate, isPending: restorePending }),
  useDeleteRawHistory: () => ({ mutate: deleteMutate, isPending: false }),
}));
const toastInfo = vi.fn();
vi.mock("@/features/projects/lib/feedback", () => ({
  toastSuccess: vi.fn(), toastInfo: (...a: unknown[]) => toastInfo(...a), toastError: vi.fn(),
}));

const { SheetVersionBar } = await import("../SheetVersionBar");

const CURRENT = { id: "current", at: "2026-08-24T10:00:00.000Z", current: true };
const OLD_1 = { id: "r-1756000000000", at: "2026-08-24T09:00:00.000Z", current: false };
const OLD_2 = { id: "r-1755000000000", at: "2026-08-23T09:00:00.000Z", current: false };

const mount = (props: Partial<React.ComponentProps<typeof SheetVersionBar>> = {}) =>
  render(<SheetVersionBar projectId="p1" job="chinh-ui" {...props} />);
const picker = () => screen.getByRole<HTMLElement>("combobox");
/** Mở danh sách rồi bấm một mục — đúng đường người dùng đi, không gọi tay `onValueChange`. */
const choose = (label: string | RegExp) => {
  fireEvent.keyDown(picker(), { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: label }));
};
const trash = () => screen.getByRole<HTMLButtonElement>("button", { name: /^Xoá/ });

beforeEach(() => {
  restoreMutate.mockReset();
  deleteMutate.mockReset();
  toastInfo.mockReset();
  restorePending = false;
  historyItems = [CURRENT, OLD_1, OLD_2];
});
afterEach(cleanup);

describe("thanh phiên bản v1 · v2 · v3", () => {
  it("mở ra là đứng ở bản ĐANG DÙNG", () => {
    mount();
    expect(picker().textContent).toContain("v3");
    expect(picker().textContent).toContain("đang dùng");
  });

  it("chưa gen lần nào ⇒ không vẽ thanh nào cả", () => {
    historyItems = [];
    const { container } = mount();
    expect(container.textContent).toBe("");
  });

  it("KHÔNG có bản đang dùng ⇒ trỏ vào bản mới nhất, nhưng KHÔNG tự đổi gì", () => {
    /* Ảnh gốc bị cổng alpha loại ⇒ chỉ còn lịch sử. Con trỏ phải đứng ở đâu đó, nhưng
       một cú mở panel thì không được phép ghi đè ảnh gốc của người dùng. */
    historyItems = [OLD_1, OLD_2];
    mount();
    expect(picker().textContent).toContain("v2");
    expect(restoreMutate).not.toHaveBeenCalled();
  });
});

/* ══ CHỌN LÀ ĐỔI ═══════════════════════════════════════════════════════════
   "ko cần nút khôi phục phiên bản này, user select là được mà, nó chỉ swap hiển
   thị + copy figma thôi" (chủ sản phẩm, 09/09/2026). `#40` nay cắt lại `kits/`
   ngay trong cùng request, nên một cú chọn đổi cả ba bề mặt cùng lúc. */
describe("chọn một bản = đổi ngay", () => {
  it("nút «Khôi phục bản này» và hộp xác nhận ĐÃ BỎ — không đường nào gọi lại", () => {
    mount();
    expect(screen.queryByRole("button", { name: /Khôi phục/ })).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByText(/chưa xem trước được/)).toBeNull();
  });

  it("chọn một bản cũ ⇒ gọi thẳng #40, đúng tấm + đúng bản, không qua nhịp bấm nào", () => {
    mount();
    choose(/^v1/);
    expect(restoreMutate).toHaveBeenCalledTimes(1);
    expect(restoreMutate.mock.calls[0]?.[0]).toEqual({ job: "chinh-ui", historyId: OLD_2.id });
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("chọn lại đúng bản ĐANG DÙNG ⇒ không gọi gì (agent sẽ 404 cho một việc chẳng đổi gì)", () => {
    mount();
    choose(/đang dùng/);
    expect(restoreMutate).not.toHaveBeenCalled();
  });

  it("cắt lại hỏng ⇒ NÓI RA, không để hai tab lệch nhau trong im lặng", () => {
    mount();
    choose(/^v1/);
    const onSuccess = restoreMutate.mock.calls[0]?.[1]?.onSuccess as (r: unknown) => void;
    onSuccess({ restored: true, sliced: false });
    expect(toastInfo).toHaveBeenCalled();
    expect(String(toastInfo.mock.calls[0]?.[1])).toMatch(/bản trước/);
  });

  it("đổi trót lọt ⇒ IM LẶNG, và báo cho panel cha nạp lại ảnh", () => {
    const onSwapped = vi.fn();
    mount({ onSwapped });
    choose(/^v1/);
    const onSuccess = restoreMutate.mock.calls[0]?.[1]?.onSuccess as (r: unknown) => void;
    onSuccess({ restored: true, sliced: true });
    expect(onSwapped).toHaveBeenCalledTimes(1);
    expect(toastInfo).not.toHaveBeenCalled();
  });

  it("đang đổi ⇒ ô chọn khoá và nói đang làm gì", () => {
    restorePending = true;
    mount();
    expect(picker().getAttribute("data-disabled")).not.toBeNull();
    expect(screen.getByText(/Đang đổi ảnh gốc/)).toBeTruthy();
  });

  it("đang có lượt chạy ⇒ ô chọn khoá, vì #40 trả 409 RUN_ACTIVE", () => {
    mount({ busy: true });
    expect(picker().getAttribute("data-disabled")).not.toBeNull();
  });
});

/* ══ XOÁ PHIÊN BẢN — "VẪN KO CÓ NÚT XOÁ PHIÊN BẢN À???" ═════════════════════
   Bản trước có nút, nhưng nó chỉ là một hình thùng rác không chữ VÀ nó biến mất
   khi đang đứng ở bản đang dùng — tức là ở đúng chỗ người dùng nhìn vào đầu tiên
   thì không có gì cả. Nay nút có chữ, luôn có mặt, và xoá được cả bản đang dùng. */
describe("xoá phiên bản", () => {
  it("nút xoá CÓ CHỮ và có mặt ngay cả khi đang đứng ở bản đang dùng", () => {
    mount();
    expect(trash().textContent).toContain("Xoá bản này");
  });

  it("bấm lần đầu CHỈ hỏi lại, chưa gọi API", () => {
    mount();
    fireEvent.click(trash());
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Xoá v3?" })).toBeTruthy();
  });

  it("bấm lần hai mới xoá thật — BẢN ĐANG DÙNG cũng xoá được", () => {
    mount();
    fireEvent.click(trash());
    fireEvent.click(screen.getByRole("button", { name: "Xoá v3?" }));
    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate.mock.calls[0]?.[0]).toEqual({ job: "chinh-ui", historyId: "current" });
  });

  it("xoá một bản cũ ⇒ đúng id của bản đó", () => {
    historyItems = [OLD_1, OLD_2];
    mount();
    fireEvent.click(trash());
    fireEvent.click(screen.getByRole("button", { name: "Xoá v2?" }));
    expect(deleteMutate.mock.calls[0]?.[0]).toEqual({ job: "chinh-ui", historyId: OLD_1.id });
  });

  it("xoá bản đang dùng xong ⇒ panel cha phải nạp lại ảnh (ảnh gốc vừa đổi chủ)", () => {
    const onSwapped = vi.fn();
    mount({ onSwapped });
    fireEvent.click(trash());
    fireEvent.click(screen.getByRole("button", { name: "Xoá v3?" }));
    const onSuccess = deleteMutate.mock.calls[0]?.[1]?.onSuccess as () => void;
    onSuccess();
    expect(onSwapped).toHaveBeenCalledTimes(1);
  });

  it("rời khỏi nút ⇒ lời hỏi tự huỷ, không treo một cú bấm chờ sẵn", () => {
    mount();
    fireEvent.click(trash());
    fireEvent.blur(screen.getByRole("button", { name: "Xoá v3?" }));
    expect(screen.queryByRole("button", { name: "Xoá v3?" })).toBeNull();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("đang có lượt chạy ⇒ nút xoá khoá (agent cũng trả 409 RUN_ACTIVE)", () => {
    mount({ busy: true });
    expect(trash().disabled).toBe(true);
  });
});

/* ══ ĐÁNH SỐ ĐI THEO CÁC BẢN CÒN LẠI ═══════════════════════════════════════
   Xoá một bản giữa chừng thì số bị đánh lại — v3 cũ thành v2. Đó là chủ ý (số lớn
   nhất luôn bằng số bản, không có lỗ), nhưng nó là thứ người dùng phải được BÁO,
   nếu không họ sẽ tưởng mình vừa xoá nhầm bản khác. Câu báo nằm ở `title` của ô chọn. */
describe("đánh số sau khi xoá", () => {
  it("số thứ tự luôn liền mạch v1..vN theo các bản CÒN LẠI", () => {
    historyItems = [CURRENT, OLD_1, OLD_2];
    mount();
    expect(picker().textContent).toContain("v3");
    cleanup();
    historyItems = [CURRENT, OLD_2];   // xoá mất bản Ở GIỮA, không phải bản cuối
    mount();
    expect(picker().textContent).toContain("v2");
  });

  it("NÓI RA việc đánh số lại VÀ việc chọn là đổi ngay", () => {
    mount();
    const title = picker().getAttribute("title") ?? "";
    expect(title).toMatch(/đánh số lại/);
    expect(title).toMatch(/đổi ngay/);
  });
});
