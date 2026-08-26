// @vitest-environment jsdom
/** Link canvas cũ hội tụ an toàn về tổng quan dự án. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryHistory, createRouter } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { routeTree } from "@/routeTree";
import { useSetupStore } from "@/lib/store";

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
  useSetupStore.setState({ completed: true });
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("project subfile navigation", () => {
  /* ĐÍCH ĐỔI: app chỉ còn MỘT màn làm việc (`/k/:id` — khu soạn prompt), nên mọi
     deep link đời cũ đổ về đó chứ không về `/p/:id` (route ấy nay cũng chỉ chuyển
     hướng tiếp). Ca này vẫn hỏi đúng câu cũ: link cũ KHÔNG được chết. */
  it.each(["f-main-kit", "f-y-tuong-tet", "f-khong-co-that"])("/p/:id/f/%s redirects to the compose screen", async (fileId) => {
    const router = mount(`/p/${PID}/f/${fileId}`);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/k/${PID}`));
    expect((router.state.location.search as { section?: string }).section).toBeUndefined();
  });

  it("does not render the old file tab IA", async () => {
    const router = mount(`/p/${PID}/f/f-main-kit`);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/k/${PID}`));
    expect(document.querySelector('[role="tablist"]')).toBeNull();
  });

  /* ══════════════════════════════════════════════════════════════════════════
     MỘT MÀN DUY NHẤT — mọi địa chỉ đời cũ của `/p/**` phải hội tụ về `/k/:id`.
     ══════════════════════════════════════════════════════════════════════════
     Đây là ca canh LỜI HỨA "deep link cũ không chết". `/p/:id` và sáu route con
     của nó là những địa chỉ ĐÃ NẰM trong bookmark, trong lịch sử trình duyệt và
     trong bảng lệnh ⌘K của các bản trước. Xoá route thì chúng thành trang «không
     tìm thấy»; giữ route mà quên đổi đích thì chúng dẫn vào một màn không còn tồn
     tại. Chạy trên `routeTree` THẬT, không phải một cây rút gọn — cái sai kiểu này
     nằm ở thứ tự route và ở `validateSearch`, hai thứ chỉ lộ ra khi cả cây có mặt. */
  it.each([
    "",
    "/kit",
    "/design",
    "/runs",
    "/runs/r-0007",
    "/settings",
  ])("/p/:id%s hội tụ về khu soạn /k/:id", async (tail) => {
    const router = mount(`/p/${PID}${tail}`);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/k/${PID}`));
  });

  /* Hai route `/k/:id/*` đời cũ cũng vậy — chúng từng trỏ sang `/p`, tức là hai cú
     nhảy cho một cú bấm. */
  it.each(["/canvas", "/studio", "/form"])("/k/:id%s hội tụ về khu soạn /k/:id", async (tail) => {
    const router = mount(`/k/${PID}${tail}`);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/k/${PID}`));
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

  it("keeps invalid file URLs out of the canvas route", async () => {
    const router = mount(`/p/${PID}/f/not-valid`);
    await waitFor(() => expect(router.state.location.pathname).not.toContain("/canvas"));
    expect(document.querySelector('[role="application"]')).toBeNull();
  });
});
