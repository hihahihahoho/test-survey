// @vitest-environment jsdom
/** Mọi địa chỉ `/p/**` đời cũ hội tụ an toàn về khu soạn `/k/:id`. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { routeTree } from "@/routeTree";

const PID = "tet26-vietinbank-a7f3";

function mount(initial: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [initial] }),
    notFoundMode: "root",
    context: { queryClient: new QueryClient() },
    defaultPendingMinMs: 0,
  });
  render(<QueryClientProvider client={new QueryClient()}><TooltipProvider><RouterProvider router={router as never} /></TooltipProvider></QueryClientProvider>);
  return router;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("stub `/p/$` — deep link đời cũ không được chết", () => {
  /* ══════════════════════════════════════════════════════════════════════════
     MỘT MÀN DUY NHẤT — mọi địa chỉ đời cũ của `/p/**` phải hội tụ về `/k/:id`.
     ══════════════════════════════════════════════════════════════════════════
     Đây là ca canh LỜI HỨA "deep link cũ không chết". `/p/:id` và sáu đường con
     của nó là những địa chỉ ĐÃ NẰM trong bookmark, trong lịch sử trình duyệt và
     trong bảng lệnh ⌘K của các bản trước. Xoá route thì chúng thành trang «không
     tìm thấy»; giữ route mà quên đổi đích thì chúng dẫn vào một màn không còn tồn
     tại. Chạy trên `routeTree` THẬT, không phải một cây rút gọn — cái sai kiểu này
     nằm ở thứ tự route, thứ chỉ lộ ra khi cả cây có mặt. */
  it.each([
    "",
    "/kit",
    "/design",
    "/runs",
    "/runs/r-0007",
    "/settings",
    "/f/f-main-kit",
    "/f/f-khong-co-that",
  ])("/p/:id%s hội tụ về khu soạn /k/:id", async (tail) => {
    const router = mount(`/p/${PID}${tail}`);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/k/${PID}`));
  });

  it("không dựng lại IA thanh tab file con đời cũ", async () => {
    const router = mount(`/p/${PID}/f/f-main-kit`);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/k/${PID}`));
    expect(document.querySelector('[role="tablist"]')).toBeNull();
  });

  /* `?settings=` là param đời cũ DUY NHẤT còn mở được một cái cửa thật (dialog Cài
     đặt dự án, nay treo ở khu soạn). Đánh rơi nó = link cũ mở lên một màn không có
     gì đang mở, và người dùng không hiểu vì sao. */
  it("/p/:id?settings=requirements mang param sang /k, không đánh rơi", async () => {
    const router = mount(`/p/${PID}?settings=requirements`);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/k/${PID}`));
    expect((router.state.location.search as { settings?: string }).settings).toBe("requirements");
  });

  it("/p/:id không có `?settings=` thì sang /k cũng KHÔNG tự mở dialog", async () => {
    const router = mount(`/p/${PID}?section=images`);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/k/${PID}`));
    expect((router.state.location.search as { settings?: string }).settings).toBeUndefined();
  });

  /* Id sai dạng KHÔNG được ghép thành `/k/<rác>` — đường về là trang chủ. */
  it.each([`/p/BAD`, `/p/ab`, `/p/`])("%s về trang chủ chứ không ghép URL rác", async (path) => {
    const router = mount(path);
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });
});
