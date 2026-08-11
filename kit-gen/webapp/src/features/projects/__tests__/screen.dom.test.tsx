/**
 * MOUNT THẬT màn S1 trong DOM (jsdom) với agent GIẢ ở tầng fetch.
 *
 * Bộ test này tồn tại vì một lý do cụ thể: `teams/qa-web/QA-VERDICT.md` phán
 * NO-GO với lý do "0/8 màn từng được render bởi một layout engine thật". Tôi
 * KHÔNG mở được trình duyệt thật ở đây (sandbox chặn Chrome đăng ký Mach port —
 * `bootstrap_check_in … Permission denied (1100)`), nên jsdom là mức cao nhất
 * tôi trung thực đạt được: nó chứng minh màn MOUNT ĐƯỢC, gọi đúng API, và ARIA
 * đúng. Nó KHÔNG chứng minh layout/CSS/tương phản.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider, createRootRoute, createRoute, createRouter, createMemoryHistory, Outlet,
} from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { createQueryClient } from "@/lib/hooks";
import { configureClient, _resetClient } from "@/lib/api/client";
import { _setBackend, memoryBackend } from "@/lib/store";
import { ProjectsScreen } from "../ProjectsScreen";

/* ═════════ Agent giả: trả đúng hình dạng của §6.2 ═════════ */
const HEALTH = {
  ok: true, app: "kitgen-agent", protocol: 1, version: "1.2.0",
  workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:aaa", projects: 3, activeRuns: 1,
};

const PROJECTS = {
  scannedAt: "2026-08-06T12:04:00Z",
  workspaceLabel: "~/KitGen",
  workspaceFingerprint: "sha256:aaa",
  items: [
    {
      id: "tet26-a7f3", name: 'Tết 2026 — VietinBank <b>iPay</b>', slug: "tet26",
      tags: ["tet", "banking"], updatedAt: "2026-08-06T12:00:00Z", cover: "kits/tet/25-bg.png",
      stats: { variants: 2, sheets: 5, components: 42, kitsCut: 96, diskBytes: 176_000_000 },
      state: { stale: true, jobs: { "tet-main": "running" }, activeRun: { runId: "r-31", done: 2, total: 8 } },
    },
    {
      id: "candy-11b2", name: "Candy Lite", tags: ["candy"], updatedAt: "2026-08-05T09:00:00Z",
      stats: { variants: 1, sheets: 3, components: 24, kitsCut: 24, diskBytes: 42_000_000 },
      state: { jobs: { "c-main": "uncut" } },
    },
    {
      id: "candy-old-11b2", name: "candy-old-11b2", broken: true,
      error: { code: "PROJECT_BROKEN", file: "project.json", line: 12, message: "Unexpected token }" },
    },
  ],
};

function fakeFetch(offline = false) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (offline) throw new TypeError("Failed to fetch");
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", "X-KitGen-Protocol": "1" },
      });
    if (url.includes("/health")) return json(HEALTH);
    if (url.includes("/api/projects?") || url.endsWith("/api/projects")) return json(PROJECTS);
    if (url.includes("/api/trash")) return json({ items: [{ trashId: "t1", name: "Cũ" }] });
    if (url.includes("/files/")) return new Response(new Blob(["x"]), { status: 200 });
    return json({ error: { code: "NOT_FOUND", message: url } }, 404);
  });
}

/** Router tối thiểu: `/` là màn S1. Đủ để `useNavigate()` chạy. */
function renderScreen() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: ProjectsScreen });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  const qc = createQueryClient();
  // TooltipProvider do `main.tsx` bọc ở tầng app (không phải việc của màn) —
  // harness phải bọc y hệt, nếu không Radix ném "must be used within TooltipProvider".
  return render(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <RouterProvider router={router as never} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  _setBackend(memoryBackend());
  _resetClient();
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: false, media: q, onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  }));
  Object.defineProperty(URL, "createObjectURL", { value: () => "blob:fake", writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: () => {}, writable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("H mount THẬT trong DOM — agent OK", () => {
  beforeEach(() => {
    const f = fakeFetch(false);
    vi.stubGlobal("fetch", f);
    configureClient({ fetchImpl: f as never, base: "http://127.0.0.1:8765" });
  });

  it("không throw, không trắng trang: có h1 «Bộ kit của bạn»", async () => {
    renderScreen();
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect((h1.textContent ?? "").normalize("NFC")).toContain("B\u1ed9 kit c\u1ee7a b\u1ea1n");
  });

  it("vẽ đủ 3 thẻ, kể cả thẻ HỎNG (không biến mất im lặng — arch §2.5)", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByLabelText(/Candy Lite —/)).toBeTruthy());
    expect(screen.getByLabelText(/candy-old-11b2 —/)).toBeTruthy();
    expect(screen.getByLabelText(/candy-old-11b2 —/).getAttribute("data-kit-status")).toBe("ve-loi");
  });

  it("A12 — tên có ký tự HTML hiện NGUYÊN VĂN, không thành thẻ (đóng I6)", async () => {
    const { container } = renderScreen();
    const card = await screen.findByLabelText(/Tết 2026 — VietinBank <b>iPay<\/b> —/);
    expect(within(card).getByText('Tết 2026 — VietinBank <b>iPay</b>')).toBeTruthy();
    // Nếu bị inject, DOM sẽ có <b> thật bên trong thẻ.
    expect(container.querySelector("article b")).toBeNull();
  });

  it("badge run của project đang chạy hiện SỐ THẬT từ state.activeRun", async () => {
    renderScreen();
    expect(await screen.findByText("Đang vẽ 2/8")).toBeTruthy();
  });

  it("FLOW-V3 bỏ chip lọc dày, lưới vẫn chứa đủ 3 file kit", async () => {
    const { container } = renderScreen();
    await screen.findByText("Candy Lite");
    expect(container.querySelectorAll("[data-kit-card]")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /Tất cả/ })).toBeNull();
  });

  /* P-SWEEP·10 — pill "Chưa vẽ" gỡ khỏi thẻ (ảnh bìa rỗng đã nói y hệt, cách 40px).
     Bất biến A3 mà ca này canh KHÔNG đổi: trạng thái phải đọc được bằng CHỮ, không
     chỉ bằng màu. Nay chỗ mang chữ đó là `aria-label` của thẻ — nơi screen reader
     đọc nguyên câu — nên ca này đo đúng chỗ đó thay vì đo cái pill. */
  it("A3 — trạng thái luôn có CHỮ, không chỉ màu", async () => {
    const { container } = renderScreen();
    await waitFor(() => expect(screen.getByLabelText(/Candy Lite —/)).toBeTruthy());
    for (const el of container.querySelectorAll("[data-kit-card]")) {
      const label = el.getAttribute("aria-label") ?? "";
      expect(label.split("—").length, label).toBeGreaterThanOrEqual(3);
      expect(label.trim().endsWith("—"), label).toBe(false);
    }
    expect(screen.getByLabelText(/Candy Lite —/).getAttribute("aria-label")).toContain("Chưa vẽ");
  });

  it("agent OK ⇒ ô Tạo bộ kit mới KHÔNG bị khoá", async () => {
    renderScreen();
    const btn = await screen.findByRole("button", { name: /Tạo bộ kit/ });
    await waitFor(() => expect(btn.hasAttribute("disabled")).toBe(false));
  });

  it("footer có link Thùng rác kèm số", async () => {
    renderScreen();
    expect(await screen.findByRole("button", { name: "Thùng rác (1)" })).toBeTruthy();
  });
});

describe("H khi AGENT CHƯA CHẠY — không treo, không trắng trang (§2.5)", () => {
  beforeEach(() => {
    const f = fakeFetch(true);
    vi.stubGlobal("fetch", f);
    configureClient({ fetchImpl: f as never, base: "http://127.0.0.1:8765" });
  });

  it("vẫn render được màn, có h1", async () => {
    renderScreen();
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect((h1.textContent ?? "").normalize("NFC")).toContain("B\u1ed9 kit c\u1ee7a b\u1ea1n");
  });

  it("§4.9 + yêu cầu 3 của brief: nút ghi bị KHOÁ KÈM GIẢI THÍCH, không bị ẩn", async () => {
    renderScreen();
    const btn = await screen.findByRole("button", { name: /Tạo bộ kit/ });
    await waitFor(() => {
      expect(btn.getAttribute("aria-disabled")).toBe("true");
    });
    // Nút vẫn TỒN TẠI (không ẩn) và có lý do đọc được.
    expect(btn.getAttribute("title")).toBeTruthy();
  });

  it("KHÔNG hiện chuỗi lỗi kỹ thuật ra thân UI (§3.9 điều cấm 1)", async () => {
    const { container } = renderScreen();
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(container.textContent).toContain("công cụ local"));
    const text = container.textContent ?? "";
    for (const forbidden of ["Failed to fetch", "TypeError", "ENOENT", "undefined", "[object Object]"]) {
      expect(text, `lộ chuỗi kỹ thuật: ${forbidden}`).not.toContain(forbidden);
    }
  });
});
