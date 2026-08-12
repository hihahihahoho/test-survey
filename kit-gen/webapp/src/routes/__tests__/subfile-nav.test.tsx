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
  it.each(["f-main-kit", "f-y-tuong-tet", "f-khong-co-that"])("/p/:id/f/%s redirects to project overview", async (fileId) => {
    const router = mount(`/p/${PID}/f/${fileId}`);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/p/${PID}`));
    expect((router.state.location.search as { section?: string }).section).toBe("overview");
  });

  it("does not render the old file tab IA", async () => {
    const router = mount(`/p/${PID}/f/f-main-kit`);
    await waitFor(() => expect(router.state.location.pathname).toBe(`/p/${PID}`));
    expect(document.querySelector('[role="tablist"]')).toBeNull();
  });

  it("keeps invalid file URLs out of the canvas route", async () => {
    const router = mount(`/p/${PID}/f/not-valid`);
    await waitFor(() => expect(router.state.location.pathname).not.toContain("/canvas"));
    expect(document.querySelector('[role="application"]')).toBeNull();
  });
});
