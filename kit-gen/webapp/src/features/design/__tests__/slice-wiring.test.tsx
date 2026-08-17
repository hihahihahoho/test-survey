/* @vitest-environment jsdom */
/**
 * ĐƯỜNG "CẮT LẠI" Ở MÀN THIẾT KẾ — nút [✂ Cắt sheet này] phải CẮT, không phải SINH.
 *
 * ══ LỖI ĐANG KHOÁ (QA e2e xác nhận, và nó chưa từng chạy đúng) ═══════════════
 * `SheetsWorkspace.tsx` đấu bảng handler của panel thuộc tính như sau:
 *
 *     genSheet:   props.onGenSheet,
 *     sliceSheet: props.onGenSheet,   ← CÙNG MỘT HÀM
 *
 * Hai dòng này ra đời cùng nhau trong commit gốc `943e8eb` và chưa ai sửa, nên nút
 * ghi "Cắt sheet này" chưa BAO GIỜ gửi một lượt `kind:"slice"` nào. Bấm nó sẽ chạy
 * đúng nhánh của [⚡ Sinh sheet này…]: sang màn lượt chạy để mở modal SINH ẢNH.
 *
 * Vì sao đây là lỗi NGHIÊM TRỌNG chứ không phải nút chết: nút chết thì người dùng bỏ
 * qua. Nút này thì MỜI người dùng làm một việc **miễn phí** rồi đặt họ trước một cửa
 * **tiêu quota** — và quota là tài nguyên duy nhất của hệ thống này không hoàn lại
 * được (`gen.sh:163` là dòng tiêu tiền duy nhất). Nhãn nói một đằng, tiền đi một nẻo.
 *
 * ══ VÌ SAO MOUNT CẢ MÀN CHỨ KHÔNG UNIT-TEST BẢNG HANDLER ════════════════════
 * Lỗi nằm ở CHỖ NỐI DÂY, không ở logic. Một test gọi thẳng `sliceSheet(...)` sẽ xanh
 * với cả bản sai lẫn bản đúng, vì nó tự cầm sợi dây thay cho người dùng. Chỉ có mount
 * thật — bấm đúng cái nút mang chữ "Cắt sheet này" rồi soi CÁI GÌ ĐI RA DÂY MẠNG —
 * mới phân biệt được hai bản, và tiện thể khoá luôn payload gửi lên agent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet,
} from "@tanstack/react-router";
import { z } from "zod";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useEditorStore } from "@/lib/store";
import type { Contract } from "@/lib/types/contract";

/* jsdom thiếu vài API mà Radix + react-resizable-panels cần lúc mount. Config test
   chính (`vitest.config.ts`) KHÔNG có `setupFiles`, nên vá tại chỗ — cùng nội dung
   với `__tests__/setup-dom.ts` của bộ `*.dom.test.tsx`. */
if (!("ResizeObserver" in globalThis)) {
  (globalThis as Record<string, unknown>).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
}
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};

/**
 * NGÂN SÁCH THỜI GIAN — 20s, không phải để "che" một test chậm.
 *
 * Ca này mount CẢ màn soạn thảo (3 vùng resizable + cây + canvas + panel thuộc tính)
 * và tự trả tiền transform cho nhánh module đó. Chạy một mình mất ~1.7s; chạy chung
 * 122 file song song thì CPU chia nhỏ và nó vượt mốc 5s mặc định. Khi vượt, test
 * timeout NHƯNG cây React vẫn mount xong sau `cleanup` ⇒ DOM rò sang ca kế tiếp và
 * ca đó chết vì "Found multiple elements" — một thất bại dây chuyền không liên quan
 * gì tới thứ đang kiểm. Nới mốc là sửa ĐÚNG nguyên nhân; giữ 5s là mua một test đỏ
 * ngẫu nhiên, và một suite đỏ ngẫu nhiên thì không ai còn đọc nữa.
 */
vi.setConfig({ testTimeout: 20_000, hookTimeout: 20_000 });

/* `vi.hoisted`: factory của `vi.mock` bị kéo lên đầu file, nên nó không nhìn thấy
   `const` khai báo bên dưới (TDZ). Đây là chỗ chứa chung hợp lệ duy nhất. */
const H = vi.hoisted(() => ({
  startRun: vi.fn(async () => ({ runId: "r-0009" })),
  toasts: [] as { level: string; title: string }[],
  jobs: {} as Record<string, string>,
}));

vi.mock("@/lib/api/endpoints", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  const fake = {
    contract: { get: async () => ({ version: 12, contract: campaign() }) },
    projects: { get: async () => ({ id: "p1", name: "Tết 2026", tags: [], broken: false, state: { stale: false, jobs: H.jobs } }) },
    refs: { list: async () => ({ items: [] }) },
    elementLib: { get: async () => ({ elements: [] }) },
    system: { doctor: async () => ({}) },
    files: { thumbUrl: (p: string, r: string) => `/f/${p}/${r}` },
    runs: { start: H.startRun },
  };
  return { ...real, api: fake, default: fake, contractApi: fake.contract };
});

vi.mock("@/lib/hooks/use-agent", async (orig) => {
  const real = (await orig()) as Record<string, unknown>;
  return {
    ...real,
    useAgentStatus: () => ({
      status: { pill: "ok", connected: true, readOnly: false, case: "ok", code: null },
      recheck: () => {},
      runBridgeProbe: async () => ({}),
    }),
    useDoctor: () => ({ data: null, refetch: () => {} }),
  };
});

/* Toast là PHẢN HỒI DUY NHẤT của đường cắt (cắt cố ý không có modal — §1.1-2 chỉ bắt
   xin phép với việc tốn tiền), nên nó là thứ phải kiểm, không phải thứ để tắt đi. */
vi.mock("@/components/ui/sonner", () => ({
  KG_TOAST_DURATION: { success: 4000, info: 5000, warning: 8000, error: Number.POSITIVE_INFINITY },
  toast: {
    success: (title: string) => void H.toasts.push({ level: "success", title }),
    info: (title: string) => void H.toasts.push({ level: "info", title }),
    warning: (title: string) => void H.toasts.push({ level: "warning", title }),
    error: (title: string) => void H.toasts.push({ level: "error", title }),
  },
}));

/** Hai phong cách × hai sheet ⇒ 4 lượt. Cần ≥2 sheet để chứng minh nút CHỈ cắt sheet
 *  đang chọn — một bản sai gửi cả 4 lượt vẫn "chạy được", chỉ là sai phạm vi. */
function campaign(): Contract {
  return {
    schemaVersion: 4,
    characterPoses: [],
    variants: [
      { id: "tet", vi: "Tết đỏ", style: "", bg: "magenta", brand: { mode: "colors" } },
      { id: "xuan", vi: "Xuân", style: "", bg: "magenta", brand: { mode: "colors" } },
    ],
    sheets: [
      {
        id: "main",
        grid: { cols: 1, rows: 1 },
        components: [{ file: "01-btn", vi: "Nút", spec: "s", skel: { shape: "pill", w: 0.8, h: 0.4 } }],
      },
      {
        id: "extra",
        grid: { cols: 1, rows: 1 },
        components: [{ file: "02-bg", vi: "Nền", spec: "s", skel: { shape: "rrect", w: 0.9, h: 0.9 } }],
      },
    ],
  } as Contract;
}

let router: ReturnType<typeof createRouter>;

async function mount() {
  const { DesignScreen } = await import("../DesignScreen");
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const designRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$projectId/design",
    validateSearch: z.object({ tab: z.enum(["sheets", "styles", "advanced"]).default("sheets").catch("sheets") }),
    component: () => <DesignScreen projectId="p1" />,
  });
  const runsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/p/$projectId/runs", component: () => null });
  const runRoute = createRoute({ getParentRoute: () => rootRoute, path: "/p/$projectId/runs/$runId", component: () => null });
  const setRoute = createRoute({ getParentRoute: () => rootRoute, path: "/p/$projectId/settings", component: () => null });
  const settings = createRoute({ getParentRoute: () => rootRoute, path: "/settings", component: () => null });

  router = createRouter({
    routeTree: rootRoute.addChildren([designRoute, runsRoute, runRoute, setRoute, settings]),
    history: createMemoryHistory({ initialEntries: ["/p/p1/design?tab=sheets"] }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <RouterProvider router={router as never} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
  await waitFor(() => expect(router.state.status).toBe("idle"));
  await screen.findByRole("grid");
}

/** Panel ③ chỉ vẽ `SheetProps` khi selection là SHEET; mặc định selection rỗng. */
async function selectSheet(sheetId: string) {
  await act(async () => {
    useEditorStore.getState().select({ kind: "sheet", sheetId });
  });
  return screen.findByRole("button", { name: /Cắt sheet này/ });
}

beforeEach(() => {
  H.startRun.mockClear();
  H.startRun.mockResolvedValue({ runId: "r-0009" });
  H.toasts.length = 0;
  /* Có ảnh đã vẽ ⇒ cắt lại là việc có nghĩa. `uncut` = raw mới hơn kits, đúng ca mà
     người dùng bấm "cắt lại" nhất. */
  H.jobs = { "tet-main": "uncut", "xuan-main": "ok", "tet-extra": "uncut", "xuan-extra": "ok" };
  useEditorStore.getState().reset();
});
afterEach(cleanup);

describe("[✂ Cắt sheet này] chạy CẮT, không mở đường sinh ảnh", () => {
  it("gửi đúng một lượt `kind:\"slice\"` — không tiêu quota", async () => {
    await mount();
    fireEvent.click(await selectSheet("main"));

    await waitFor(() => expect(H.startRun).toHaveBeenCalledTimes(1));
    const [projectId, input] = H.startRun.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(projectId).toBe("p1");
    expect(input.kind).toBe("slice");
    // Chốt cứng: KHÔNG có đường nào từ nút này ra `kind:"gen"`.
    expect(input.kind).not.toBe("gen");
    // Cắt không phải "pha 2 của gen" ⇒ cờ auto-slice phải tắt.
    expect(input.autoSliceAfterGen).toBe(false);
  });

  it("chỉ cắt SHEET ĐANG CHỌN, không nở ra cả dự án", async () => {
    await mount();
    fireEvent.click(await selectSheet("main"));

    await waitFor(() => expect(H.startRun).toHaveBeenCalledTimes(1));
    const input = (H.startRun.mock.calls[0] as unknown as [string, { jobs: string[] }])[1];
    expect([...input.jobs].sort()).toEqual(["tet-main", "xuan-main"]);
    // `jobs: []` với agent nghĩa là "CẮT TẤT CẢ" (`agent/lib/runs.mjs:49`) — một nút
    // phạm vi hẹp mà gửi mảng rỗng là thao tác toàn dự án trá hình.
    expect(input.jobs.length).toBeGreaterThan(0);
    expect(input.jobs).not.toContain("tet-extra");
  });

  it("KHÔNG rời màn thiết kế và KHÔNG mở modal sinh ảnh", async () => {
    await mount();
    fireEvent.click(await selectSheet("main"));

    await waitFor(() => expect(H.startRun).toHaveBeenCalledTimes(1));
    /* Đây là phép kiểm phân biệt bản sai với bản đúng: bản cũ (`sliceSheet:
       props.onGenSheet`) điều hướng sang `/p/p1/runs` để mở modal SINH ẢNH. */
    expect(router.state.location.pathname).toBe("/p/p1/design");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("nói ra bằng toast rằng việc này không tiêu quota", async () => {
    await mount();
    fireEvent.click(await selectSheet("main"));

    await waitFor(() => expect(H.toasts.some((t) => t.level === "success")).toBe(true));
    expect(H.toasts.find((t) => t.level === "success")!.title).toMatch(/[Cc]ắt/);
  });
});

describe("[⚡ Sinh sheet này…] vẫn đi cửa cũ — và KHÔNG tự tạo lượt nào", () => {
  it("chuyển sang màn lượt chạy, không POST thẳng một run", async () => {
    await mount();
    await selectSheet("main");
    fireEvent.click(screen.getByRole("button", { name: /Sinh sheet này/ }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/p/p1/runs"));
    /* §4.8: "không có đường nào chạy gen mà không qua modal" — màn thiết kế chỉ được
       DẪN tới cửa đó, tuyệt đối không tự bắn request. */
    expect(H.startRun).not.toHaveBeenCalled();
  });
});

describe("ca không cắt được thì DỪNG và NÓI (§3.9 điều cấm 3)", () => {
  it("sheet chưa vẽ lần nào ⇒ không gửi request rỗng, chỉ báo lý do", async () => {
    H.jobs = { "tet-main": "never", "xuan-main": "never" };
    await mount();
    fireEvent.click(await selectSheet("main"));

    await waitFor(() => expect(H.toasts.some((t) => t.level === "info")).toBe(true));
    expect(H.toasts.find((t) => t.level === "info")!.title).toMatch(/chưa có ảnh/i);
    expect(H.startRun).not.toHaveBeenCalled();
    expect(router.state.location.pathname).toBe("/p/p1/design");
  });
});
