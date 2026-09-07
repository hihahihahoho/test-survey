/* @vitest-environment jsdom */
/**
 * THANH PHIÊN BẢN — KHÔI PHỤC PHẢI HỎI LẠI.
 *
 * ╔══ VÌ SAO CA NÀY ĐÁNG MỘT FILE TEST RIÊNG ════════════════════════════════╗
 * ║ `#40` chép đè thẳng lên `raw/<job>.png` — đầu vào của bước cắt. Bấm nhầm   ║
 * ║ một lần thì tab «Ảnh gốc» và tab «Đã crop» nói hai chuyện khác nhau cho    ║
 * ║ tới khi cắt lại, mà KHÔNG có gì báo. Đây đúng là loại thao tác không được  ║
 * ║ phép xảy ra sau một cú bấm — nên test phải chứng minh hai điều:            ║
 * ║   ① bấm nút KHÔNG gọi API, chỉ mở hộp hỏi lại;                            ║
 * ║   ② bản ĐANG DÙNG thì nút phải khoá (agent sẽ 404 vì không có file lịch    ║
 * ║      sử nào tên `<job>@current.png`).                                     ║
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
let historyItems: Array<{ id: string; at: string | null; current: boolean }> = [];

vi.mock("@/lib/hooks", () => ({
  useRawHistory: () => ({ data: { items: historyItems }, isLoading: false }),
  useRestoreRaw: () => ({ mutate: restoreMutate, isPending: false }),
  useDeleteRawHistory: () => ({ mutate: deleteMutate, isPending: false }),
}));
vi.mock("@/features/projects/lib/feedback", () => ({
  toastSuccess: vi.fn(), toastInfo: vi.fn(), toastError: vi.fn(),
}));

const { SheetVersionBar } = await import("../SheetVersionBar");

const CURRENT = { id: "current", at: "2026-08-24T10:00:00.000Z", current: true };
const OLD_1 = { id: "r-1756000000000", at: "2026-08-24T09:00:00.000Z", current: false };
const OLD_2 = { id: "r-1755000000000", at: "2026-08-23T09:00:00.000Z", current: false };

const mount = () => render(<SheetVersionBar projectId="p1" job="chinh-ui" />);
const restoreButton = () =>
  screen.getByRole<HTMLButtonElement>("button", { name: /Khôi phục bản này/ });

beforeEach(() => {
  restoreMutate.mockReset();
  deleteMutate.mockReset();
  historyItems = [CURRENT, OLD_1, OLD_2];
});
afterEach(cleanup);

describe("thanh phiên bản v1 · v2 · v3", () => {
  it("mở ra là đứng ở bản ĐANG DÙNG, và nút khôi phục khoá", () => {
    mount();
    expect(screen.getByRole("combobox").textContent).toContain("v3");
    expect(screen.getByRole("combobox").textContent).toContain("đang dùng");
    expect(restoreButton().disabled).toBe(true);
  });

  it("chưa gen lần nào ⇒ không vẽ thanh nào cả", () => {
    historyItems = [];
    const { container } = mount();
    expect(container.textContent).toBe("");
  });

  it("nói thẳng là bản cũ chưa xem trước được — .history không nằm trong READABLE_TOP", () => {
    mount();
    expect(screen.getByText(/Bản đang dùng/)).toBeTruthy();
  });
});

describe("khôi phục — MỘT CÚ BẤM KHÔNG ĐƯỢC PHÉP GHI ĐÈ", () => {
  /* Không có bản hiện hành (file `raw/<job>.png` đã bị dọn) ⇒ mục chọn sẵn là một bản
     lịch sử thật, tức nút mở khoá mà không phải lái Radix Select trong jsdom. */
  const withoutCurrent = () => { historyItems = [OLD_1, OLD_2]; };

  it("bấm nút CHỈ mở hộp xác nhận, KHÔNG gọi API", () => {
    withoutCurrent();
    mount();
    expect(restoreButton().disabled).toBe(false);
    fireEvent.click(restoreButton());
    expect(restoreMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog").textContent).toMatch(/GHI ĐÈ ảnh gốc đang dùng/);
  });

  it("bấm Huỷ ⇒ không có gì xảy ra", () => {
    withoutCurrent();
    mount();
    fireEvent.click(restoreButton());
    fireEvent.click(screen.getByRole("button", { name: "Huỷ" }));
    expect(restoreMutate).not.toHaveBeenCalled();
  });

  it("xác nhận rồi mới gọi #40, đúng job + đúng historyId", () => {
    withoutCurrent();
    mount();
    fireEvent.click(restoreButton());
    fireEvent.click(screen.getByRole("button", { name: "Khôi phục" }));
    expect(restoreMutate).toHaveBeenCalledTimes(1);
    expect(restoreMutate.mock.calls[0]?.[0]).toEqual({ job: "chinh-ui", historyId: OLD_1.id });
  });

  it("đang có lượt chạy ⇒ khoá nút, vì #40 trả 409 RUN_ACTIVE", () => {
    withoutCurrent();
    render(<SheetVersionBar projectId="p1" job="chinh-ui" busy />);
    expect(restoreButton().disabled).toBe(true);
  });
});

/* ══ XOÁ BẢN CŨ — "cho phép xoá ver cũ" (chủ sản phẩm, 07/09/2026) ═══════════
   Hai điều phải đúng cùng lúc, và chúng kéo về hai hướng ngược nhau:
     ① XOÁ ĐƯỢC, không phải qua ba lớp hộp thoại — nó chỉ bỏ một file trong
        `.history/`, ảnh đang dùng không suy suyển.
     ② KHÔNG BAO GIỜ chạm tới bản ĐANG DÙNG: đó là `raw/<tấm>.png`, đầu vào của
        bước cắt. Agent trả 409 `HISTORY_CURRENT` nếu ai đó thử — nút ở đây phải
        không tồn tại từ đầu, chứ không phải bấm rồi mới ăn lỗi. */
describe("xoá bản cũ", () => {
  const withoutCurrent = () => { historyItems = [OLD_1, OLD_2]; };
  const trash = () => screen.queryByRole<HTMLButtonElement>("button", { name: /^Xoá v\d/ });

  it("đang đứng ở bản ĐANG DÙNG ⇒ KHÔNG có nút xoá nào để bấm", () => {
    mount();
    expect(trash()).toBeNull();
  });

  it("bấm lần đầu CHỈ hỏi lại, chưa gọi API", () => {
    withoutCurrent();
    mount();
    const btn = trash();
    expect(btn).not.toBeNull();
    fireEvent.click(btn!);
    expect(deleteMutate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Xoá v2?" })).toBeTruthy();
  });

  it("bấm lần hai mới xoá thật, đúng tấm + đúng bản", () => {
    withoutCurrent();
    mount();
    fireEvent.click(trash()!);
    fireEvent.click(screen.getByRole("button", { name: "Xoá v2?" }));
    expect(deleteMutate).toHaveBeenCalledTimes(1);
    expect(deleteMutate.mock.calls[0]?.[0]).toEqual({ job: "chinh-ui", historyId: OLD_1.id });
  });

  it("rời khỏi nút ⇒ lời hỏi tự huỷ, không treo một cú bấm chờ sẵn", () => {
    withoutCurrent();
    mount();
    fireEvent.click(trash()!);
    fireEvent.blur(screen.getByRole("button", { name: "Xoá v2?" }));
    expect(screen.queryByRole("button", { name: "Xoá v2?" })).toBeNull();
    expect(deleteMutate).not.toHaveBeenCalled();
  });

  it("đang có lượt chạy ⇒ nút xoá khoá (agent cũng trả 409 RUN_ACTIVE)", () => {
    withoutCurrent();
    render(<SheetVersionBar projectId="p1" job="chinh-ui" busy />);
    expect(trash()!.disabled).toBe(true);
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
    expect(screen.getByRole("combobox").textContent).toContain("v3");
    cleanup();
    historyItems = [CURRENT, OLD_2];   // xoá mất bản Ở GIỮA, không phải bản cuối
    mount();
    expect(screen.getByRole("combobox").textContent).toContain("v2");
  });

  it("NÓI RA việc đánh số lại — không để người dùng tự phát hiện", () => {
    mount();
    expect(screen.getByRole("combobox").getAttribute("title")).toMatch(/đánh số lại/);
  });
});
