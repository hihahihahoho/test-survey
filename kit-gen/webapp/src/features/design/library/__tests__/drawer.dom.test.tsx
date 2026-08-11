/**
 * drawer.dom.test.tsx — MOUNT THẬT drawer thư viện trong jsdom.
 *
 * Kiểm những thứ mà test logic KHÔNG thấy được: dòng có phải checkbox thật không,
 * nút có bị khoá KÈM LÝ DO không, chuỗi lỗi kỹ thuật có rò ra thân UI không,
 * và `onAdd` có nhận đúng dữ liệu đã COPY không.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ElementLibraryDrawer } from "../ElementLibraryDrawer";
import type { ElementLibraryDrawerProps } from "../lib/contract";

afterEach(cleanup);

/** `useElementLib()` gọi `/api/element-lib`. Trong test ta chặn ở tầng fetch — KHÔNG
 *  mock module của R0, để vẫn đi qua đúng client/schema thật của họ. */
function mockAgent(payload: unknown, ok = true) {
  vi.stubGlobal("fetch", vi.fn(async () =>
    new Response(JSON.stringify(payload), {
      status: ok ? 200 : 500,
      headers: { "content-type": "application/json" },
    })));
}

function setup(over: Partial<ElementLibraryDrawerProps> = {}) {
  const onAdd = vi.fn();
  const props: ElementLibraryDrawerProps = {
    open: true,
    onOpenChange: vi.fn(),
    targetSheetId: "main",
    targetSheetLabel: "main",
    freeSlots: 2,
    existingFiles: ["01-btn-pill-red"],
    readOnly: false,
    readOnlyReason: "",
    onAdd,
    ...over,
  };
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <ElementLibraryDrawer {...props} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  return { onAdd, props };
}

/** Bản v2 đóng gói luôn có sẵn ⇒ dù agent lỗi, danh sách vẫn hiện. */
async function waitForList() {
  return screen.findByRole("group", { name: /danh sách element/i }, { timeout: 5000 });
}

describe("drawer thư viện — mount thật", () => {
  it("hiện danh sách 42 element, mỗi dòng là CHECKBOX THẬT (đóng I2/I4)", async () => {
    mockAgent({ version: 1, elements: [] }); // agent rỗng ⇒ tự dùng bản đóng gói
    setup();
    const list = await waitForList();
    const boxes = within(list).getAllByRole("checkbox");
    expect(boxes).toHaveLength(42);
    // nhãn gắn được vào control ⇒ screen reader đọc ra tên element
    expect(screen.getByText("01-btn-pill-red")).toBeTruthy();
  });

  it("đánh dấu element ĐÃ CÓ trong sheet đích", async () => {
    mockAgent({ version: 1, elements: [] });
    setup();
    await waitForList();
    expect(screen.getByText(/đã có trong sheet main/i)).toBeTruthy();
  });

  it("tick 1 element → nút đổi thành «Thêm 1 element» và bấm được", async () => {
    mockAgent({ version: 1, elements: [] });
    const { onAdd } = setup();
    const list = await waitForList();
    const user = userEvent.setup();

    const addBtn = screen.getByRole("button", { name: /^Thêm element$/i });
    expect(addBtn.hasAttribute("disabled")).toBe(true); // chưa chọn gì ⇒ khoá

    await user.click(within(list).getAllByRole("checkbox")[0]!);
    const armed = screen.getByRole("button", { name: /Thêm 1 element/i });
    expect(armed.hasAttribute("disabled")).toBe(false);

    await user.click(armed);
    expect(onAdd).toHaveBeenCalledTimes(1);

    const [elements, opts] = onAdd.mock.calls[0]!;
    expect(elements).toHaveLength(1);
    // ĐÃ COPY sang dạng component của contract, đủ 4 field
    expect(Object.keys(elements[0]).sort()).toEqual(["file", "skel", "spec", "vi"]);
    expect(opts).toEqual({ toNewSheet: false });
  });

  it("tìm kiếm KHÔNG DẤU lọc đúng danh sách", async () => {
    mockAgent({ version: 1, elements: [] });
    setup();
    await waitForList();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/tìm element/i), "nut do");
    const list = await waitForList();
    const boxes = within(list).getAllByRole("checkbox");
    expect(boxes.length).toBeLessThan(42);
    expect(screen.getByText("01-btn-pill-red")).toBeTruthy();
  });

  it("tìm không ra → empty state RIÊNG, có nút xoá bộ lọc (không phải màn trắng)", async () => {
    mockAgent({ version: 1, elements: [] });
    setup();
    await waitForList();
    const user = userEvent.setup();

    await user.type(screen.getByLabelText(/tìm element/i), "zzz-khong-ton-tai");
    expect(await screen.findByText(/Không có element nào khớp/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Xoá bộ lọc/i })).toBeTruthy();
  });

  it("AGENT CHƯA CHẠY: vẫn duyệt được, nút Thêm khoá KÈM LÝ DO (§2.5 — không ẩn nút)", async () => {
    mockAgent({ error: { code: "AGENT_NOT_RUNNING" } }, false);
    setup({ readOnly: true, readOnlyReason: "Công cụ local chưa chạy nên chưa sửa được bản thiết kế." });
    await waitForList(); // bản đóng gói vẫn hiện

    const addBtn = screen.getByRole("button", { name: /Thêm element/i });
    expect(addBtn.hasAttribute("disabled")).toBe(true);
    expect(addBtn.getAttribute("title")).toMatch(/chưa chạy/i);
    expect(screen.getAllByText(/Công cụ local chưa chạy/i).length).toBeGreaterThan(0);
  });

  it("KHÔNG rò chuỗi kỹ thuật ra thân UI", async () => {
    mockAgent({ error: { code: "AGENT_NOT_RUNNING", message: "ECONNREFUSED 127.0.0.1:8765" } }, false);
    setup();
    await waitForList();
    expect(document.body.textContent).not.toMatch(/ECONNREFUSED|127\.0\.0\.1|stack|TypeError/i);
  });

  it("hiện «sheet mới» khi project chưa có sheet nào", async () => {
    mockAgent({ version: 1, elements: [] });
    const { onAdd } = setup({ targetSheetId: null, targetSheetLabel: null, freeSlots: 0 });
    const list = await waitForList();
    const user = userEvent.setup();

    await user.click(within(list).getAllByRole("checkbox")[0]!);
    expect(screen.getByText(/chưa có sheet nào/i)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /Thêm 1 element/i }));
    expect(onAdd.mock.calls[0]![1]).toEqual({ toNewSheet: true });
  });

  it("cảnh báo NỚI LƯỚI khi chọn nhiều hơn số ô trống — nói trước hậu quả", async () => {
    mockAgent({ version: 1, elements: [] });
    setup({ freeSlots: 1 });
    const list = await waitForList();
    const user = userEvent.setup();

    const boxes = within(list).getAllByRole("checkbox");
    await user.click(boxes[0]!);
    await user.click(boxes[1]!);
    await user.click(boxes[2]!);
    expect(screen.getByText(/lưới sẽ được nới thêm hàng/i)).toBeTruthy();
  });
});
