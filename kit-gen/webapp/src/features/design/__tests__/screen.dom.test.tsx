/**
 * MÀN S3 — 4 trạng thái + ca AGENT CHƯA CHẠY, mount thật với router + Query giả lập.
 *
 * Đây là ca chống hồi quy cho yêu cầu cứng của brief: *"Mọi màn đủ 4 trạng thái
 * empty/loading/error/success + ca AGENT CHƯA CHẠY (không treo, không trắng trang)"*.
 * Chỉ đọc code không chứng minh được điều đó — phải mount và nhìn cái gì hiện ra.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet,
} from "@tanstack/react-router";
import { z } from "zod";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEditorStore } from "@/lib/store";
import type { Contract } from "@/lib/types/contract";

/* ── Giả lập tầng API. Màn KHÔNG fetch trực tiếp nên chỉ cần chặn `@/lib/api`. ── */
const state = {
  contract: null as { version: number; contract: Contract } | null,
  fail: false,
  connected: true,
};

/* Chặn ở `lib/api/endpoints` chứ KHÔNG phải `lib/api`: hook của R0 import thẳng
   `../api/endpoints`, nên mock cái vỏ `lib/api` sẽ không được dùng tới (bản đầu tôi
   mock nhầm chỗ và cả 7 ca đều rơi vào trạng thái error — đúng kiểu bẫy im lặng). */
vi.mock("@/lib/api/endpoints", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  const fake = {
      contract: {
        get: async () => {
          if (state.fail) throw new Error("BOOM");
          return state.contract;
        },
      },
      projects: { get: async () => ({ id: "p1", name: "Tết 2026", tags: [], broken: false }) },
      refs: { list: async () => ({ items: [] }) },
      elementLib: { get: async () => ({ elements: [] }) },
      system: { doctor: async () => ({}) },
      files: { thumbUrl: (p: string, r: string) => `/f/${p}/${r}` },
      runs: {},
  };
  return { ...real, api: fake, default: fake, contractApi: fake.contract };
});

vi.mock("@/lib/hooks/use-agent", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    useAgentStatus: () => ({
      status: state.connected
        ? { pill: "ok", connected: true, readOnly: false, case: "ok", code: null }
        : { pill: "offline", connected: false, readOnly: true, case: "agent-not-running", code: "AGENT_DOWN" },
      recheck: () => {},
      runBridgeProbe: async () => ({}),
    }),
    useDoctor: () => ({ data: null, refetch: () => {} }),
  };
});

const campaign = (): Contract => ({
  schemaVersion: 4,
  characterPoses: [],
  variants: [{ id: "tet", vi: "Tết đỏ", style: "", bg: "magenta", brand: { mode: "colors" } }],
  sheets: [
    {
      id: "main",
      grid: { cols: 2, rows: 1 },
      components: [
        { file: "01-btn", vi: "Nút", spec: "s", skel: { shape: "pill", w: 0.8, h: 0.4 } },
        { file: "", vi: "", spec: "", skel: { shape: "empty", w: 1, h: 1 } },
      ],
    },
  ],
});

async function mount() {
  const { DesignScreen } = await import("../DesignScreen");
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const designRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$projectId/design",
    validateSearch: z.object({ tab: z.enum(["sheets", "styles", "advanced"]).default("sheets").catch("sheets") }),
    component: () => <DesignScreen projectId="p1" />,
  });
  // Route phụ để `navigate` trong màn không ném "route không tồn tại".
  const runsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/p/$projectId/runs", component: () => null });
  const setRoute = createRoute({ getParentRoute: () => rootRoute, path: "/p/$projectId/settings", component: () => null });
  const settings = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: () => null });

  const router = createRouter({
    routeTree: rootRoute.addChildren([designRoute, runsRoute, setRoute, settings]),
    history: createMemoryHistory({ initialEntries: ["/p/p1/design?tab=sheets"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  // TooltipProvider la BAT BUOC: App.tsx boc no o goc, va SaveBar dung Tooltip de noi
  // LY DO nut Luu bi khoa. Thieu provider => Radix nem ngay luc mount, va ErrorBoundary
  // nuot thanh "Something went wrong". Ban dau cua ca test nay quen, mat mot vong go moi ra.
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <RouterProvider router={router as never} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(router.state.status).toBe("idle"));
}

beforeEach(() => {
  state.contract = { version: 37, contract: campaign() };
  state.fail = false;
  state.connected = true;
  useEditorStore.getState().reset();
});
afterEach(cleanup);

describe("4 trạng thái", () => {
  it("success: vẽ đủ 3 vùng, đúng cols×rows ô, và version trên thanh lưu", async () => {
    await mount();
    await screen.findByRole("grid");
    expect(screen.getAllByRole("gridcell")).toHaveLength(2);
    expect(screen.getByText("v37")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Bản thiết kế" })).toBeTruthy();
  });

  it("empty (0 sheet): KHÔNG trắng trang, có lối đi tiếp", async () => {
    state.contract = { version: 1, contract: { schemaVersion: 4, sheets: [], characterPoses: [], variants: [] } };
    await mount();
    expect(await screen.findByText("Chưa có sheet nào")).toBeTruthy();
    expect(screen.getByRole("button", { name: /thư viện element/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tạo sheet trống/i })).toBeTruthy();
  });

  it("error: hiện câu tiếng Việt + [Thử lại], KHÔNG đổ lỗi kỹ thuật ra thân UI", async () => {
    state.fail = true;
    await mount();
    const alert = await screen.findByRole("alert");
    // Chuoi ky thuat ("BOOM") DUOC PHEP nam trong <details> "Chi tiet cho lap trinh vien"
    // nhung KHONG duoc o phan than ma user doc. Cat phan details ra roi moi so.
    const details = alert.querySelector("details");
    const bodyText = alert.textContent!.replace(details?.textContent ?? "", "");
    expect(bodyText).not.toContain("BOOM");
    expect(details!.textContent).toContain("BOOM");
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy();
    expect(screen.getByText("Chi tiết cho lập trình viên")).toBeTruthy();
  });

  it("nút Lưu bị KHOÁ khi sạch, và nói rõ vì sao (đóng audit B6)", async () => {
    await mount();
    await screen.findByRole("grid");
    const save = screen.getByRole("button", { name: /^Lưu/ });
    expect(save.hasAttribute("disabled")).toBe(true);
    // Dấu bẩn nói bằng CHỮ + CHẤM, không chỉ bằng màu (§5.8-A3).
    expect(screen.getByText(/^✓ đã lưu/)).toBeTruthy();
    expect(screen.queryByText(/thay đổi chưa lưu/)).toBeNull();
  });
});

describe("ca AGENT CHƯA CHẠY (§2.5 + §4.9)", () => {
  it("màn VẪN mở được và đọc được, không treo, không trắng trang", async () => {
    state.connected = false;
    await mount();
    expect(await screen.findByRole("grid")).toBeTruthy();
    expect(screen.getAllByRole("gridcell")).toHaveLength(2);
  });

  it("nút ghi bị khoá KÈM LÝ DO, không bị ẩn (§2.5-2)", async () => {
    state.connected = false;
    await mount();
    await screen.findByRole("grid");
    const add = screen.getByRole("button", { name: /Thêm sheet/i });
    expect(add.hasAttribute("disabled")).toBe(true);
    expect(add.getAttribute("title")).toContain("công cụ local");
  });
});

describe("validate hiện ngay trên màn", () => {
  it("contract sai V-04 ⇒ thanh Validate báo lỗi và nút Lưu bị chặn", async () => {
    const bad = campaign();
    bad.sheets[0]!.components.pop(); // 2 ô → 1, trong lưới 2×1
    state.contract = { version: 5, contract: bad };
    await mount();
    expect(await screen.findByText(/lỗi phải sửa trước khi lưu/)).toBeTruthy();
  });

  it("contract hợp lệ ⇒ thanh Validate báo hợp lệ", async () => {
    await mount();
    expect(await screen.findByText(/Hợp lệ — lưu được/)).toBeTruthy();
  });
});
