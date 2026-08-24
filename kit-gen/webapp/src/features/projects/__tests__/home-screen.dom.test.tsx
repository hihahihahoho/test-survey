/**
 * H1 — MOUNT THẬT màn H trong DOM (jsdom) với agent GIẢ ở tầng fetch.
 *
 * ══ BỘ TEST NÀY THAY CHO CÁI GÌ ═══════════════════════════════════════════════════
 * `screen.dom.test.tsx` (11 ca, FE-1) khoá màn danh sách project CŨ: h1 «Bộ project»,
 * 5 chip lọc có số đếm, badge «Đang sinh 2/8», dòng «Có ảnh mới nhưng chưa cắt», nút
 * «Tạo project», link «Thùng rác 1 project». **Cả 11 ca đều nói về thứ FLOW-V3 §0.2 và
 * UX-V3 §1 CỐ Ý bỏ đi.** File đó **ngoài glob H** (`NEEDS-fe3-s0.md` N1 chưa được trả
 * lời) nên tôi KHÔNG sửa và KHÔNG xoá nó — nó đang đỏ, và H1-REPORT §3.3 báo đỏ.
 *
 * Bộ này dựng lại **đúng phần bảo vệ còn giá trị** của 11 ca đó trên IA mới:
 *   mount không trắng trang · bộ kit hỏng không biến mất im lặng · tên có ký tự HTML
 *   không thành thẻ · số tiến độ là số THẬT · trạng thái luôn có CHỮ · nút chính không bị
 *   khoá oan · thùng rác kèm số · agent tắt thì khoá KÈM LÝ DO, không lộ chuỗi kỹ thuật.
 * Cộng thêm phần chỉ IA mới mới có: nhãn hình thái ⚙️/🎨, đúng MỘT dòng trạng thái,
 * đúng MỘT nút CTA, skeleton đúng khung thẻ thật, ≥4 bộ kit để kiểm lưới (nợ #5 FE-1).
 *
 * jsdom KHÔNG có layout engine ⇒ bộ này chứng minh **cấu trúc + chữ + aria**, KHÔNG
 * chứng minh bố cục/CSS/tương phản. Việc đó là của Q1 trên trình duyệt thật.
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

const HEALTH = {
  ok: true, app: "kitgen-agent", protocol: 1, version: "1.2.0",
  workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:aaa", projects: 5, activeRuns: 1,
};

/** 5 bộ kit: đủ **cả hai hình thái** và đủ **5 trạng thái** của UX-V3 §1.3 (nợ #5 FE-1). */
const PROJECTS = {
  scannedAt: "2026-08-07T12:04:00Z",
  workspaceLabel: "~/KitGen",
  workspaceFingerprint: "sha256:aaa",
  items: [
    { // đang vẽ · ⚙️ · tên có ký tự HTML
      id: "tet26-a7f3", name: 'Tết 2026 — VietinBank <b>iPay</b>', slug: "tet26",
      tags: ["tet", "kg-workflow"], updatedAt: "2026-08-07T12:00:00Z", cover: "kits/tet/25-bg.png",
      stats: { rawPresent: 4, variants: 2, sheets: 5, components: 42, kitsCut: 96 },
      state: { jobs: { "tet-main": "running" }, activeRun: { runId: "r-31", done: 2, total: 6 } },
    },
    { // xong · 🎨
      id: "he-11b2", name: "Ý tưởng hè", tags: ["kg-canvas"], updatedAt: "2026-08-07T10:00:00Z",
      stats: { rawPresent: 3, kitsCut: 24, lastRun: { id: "r-he-1", at: "2026-08-07T10:00:00Z", ok: 3, fail: 0 } },
      state: { jobs: { "he-main": "ok" } },
    },
    { // chưa vẽ · ⚙️ (không có tag ⇒ mặc định workflow)
      id: "candy-9911", name: "Candy Lite", tags: [], updatedAt: "2026-08-06T09:00:00Z",
      stats: { rawPresent: 0 },
    },
    { // cần vẽ lại · ⚙️
      id: "noel-3311", name: "Noel 2026", tags: ["kg-workflow"], updatedAt: "2026-08-05T09:00:00Z",
      stats: { rawPresent: 2 }, state: { stale: true, jobs: {} },
    },
    { // vẽ lỗi · 🎨
      id: "hoa-7712", name: "Hoa mai", tags: ["kg-canvas"], updatedAt: "2026-08-04T09:00:00Z",
      stats: { rawPresent: 2 }, state: { jobs: { "hoa-main": "failed" } },
    },
    { // hỏng file mô tả — KHÔNG được biến mất im lặng (arch §2.5)
      id: "candy-old-11b2", name: "candy-old-11b2", broken: true,
      error: { code: "PROJECT_BROKEN", file: "project.json", line: 12, message: "Unexpected token }" },
    },
  ],
};

/** `GET /api/usage` — quota Codex còn lại, hình dạng THẬT của agent (gói plus, cửa sổ tuần). */
const USAGE = {
  ok: true, codexHomeLabel: "~/.codex", profile: "default-home", plan: "plus",
  primary: { usedPercent: 2, remainingPercent: 98, windowMinutes: 10080, resetsAt: "2026-08-20T06:30:28.000Z" },
  secondary: null,
  observedAt: "2026-08-13T09:00:24.138Z", checkedAt: "2026-08-13T09:33:08.309Z",
};

function fakeFetch(offline = false) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
    if (offline) throw new TypeError("Failed to fetch");
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status, headers: { "Content-Type": "application/json", "X-KitGen-Protocol": "1" },
      });
    if (url.includes("/health")) return json(HEALTH);
    if (url.includes("/api/projects?") || url.endsWith("/api/projects")) return json(PROJECTS);
    if (url.includes("/api/trash")) return json({ items: [{ trashId: "t1", name: "Cũ" }, { trashId: "t2", name: "Cũ 2" }] });
    if (url.includes("/api/usage")) return json(USAGE);
    if (url.includes("/files/")) return new Response(new Blob(["x"]), { status: 200 });
    return json({ error: { code: "NOT_FOUND", message: url } }, 404);
  });
}

function renderHome() {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: ProjectsScreen });
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <TooltipProvider>
        <RouterProvider router={router as never} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const card = (name: string) => screen.getByRole("article", { name: new RegExp(name) });

/** Sidebar trái. Phải khoanh vùng: thanh điều hướng cho màn hẹp (`md:hidden`) có
 *  những nút TRÙNG TÊN ("Thùng rác", "Cài đặt") và jsdom không áp CSS nên nó vẫn
 *  nằm trong cây — truy vấn toàn màn sẽ dính hai kết quả. */
const sidebar = (container: HTMLElement) => container.querySelector("aside") as HTMLElement;

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

describe("H · màn «Bộ kit của bạn» — agent OK", () => {
  beforeEach(() => {
    const f = fakeFetch(false);
    vi.stubGlobal("fetch", f);
    configureClient({ fetchImpl: f as never, base: "http://127.0.0.1:8765" });
  });

  it("không throw, không trắng trang: h1 là «Bộ kit của bạn»", async () => {
    renderHome();
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect((h1.textContent ?? "").normalize("NFC")).toBe("Bộ kit của bạn");
  });

  it("§5.2 — h1 nhấn serif italic ĐÚNG MỘT cụm, và tên vẫn đọc liền mạch", async () => {
    renderHome();
    const h1 = await screen.findByRole("heading", { level: 1 });
    const ems = h1.querySelectorAll("em");
    expect(ems).toHaveLength(1);
    expect(ems[0]!.className).toContain("font-serif");
    expect(ems[0]!.className).toContain("italic");
    expect(ems[0]!.textContent).toBe("bạn"); /* W2B-5: nhấn tối đa MỘT từ */
  });

  it("vẽ đủ 6 thẻ, kể cả thẻ HỎNG (không biến mất im lặng — arch §2.5)", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    for (const n of ["Ý tưởng hè", "Candy Lite", "Noel 2026", "Hoa mai", "candy-old-11b2"]) {
      expect(screen.getByText(n), `thiếu thẻ «${n}»`).toBeTruthy();
    }
    expect(document.querySelectorAll("[data-kit-card]")).toHaveLength(6);
  });

  it("A12 — tên có ký tự HTML hiện NGUYÊN VĂN, không thành thẻ (đóng I6)", async () => {
    const { container } = renderHome();
    await waitFor(() => expect(screen.getByText('Tết 2026 — VietinBank <b>iPay</b>')).toBeTruthy());
    expect(container.querySelector("[data-kit-card] b")).toBeNull();
  });

  it("§1.3 — NHÃN NHỎ hình thái đúng chữ, suy từ tag `kg-*`", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    expect(within(card("Ý tưởng hè")).getByText("Bàn làm việc")).toBeTruthy();
    expect(within(card("Tết 2026")).getByText("Điền form")).toBeTruthy();
    // Không tag ⇒ mặc định workflow (kit-mode.ts của S), KHÔNG đoán bừa.
    expect(within(card("Candy Lite")).getByText("Điền form")).toBeTruthy();
  });

  it("chuỗi tag hệ thống `kg-*` KHÔNG BAO GIỜ lọt ra màn", async () => {
    const { container } = renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    expect(container.textContent).not.toContain("kg-workflow");
    expect(container.textContent).not.toContain("kg-canvas");
    expect(container.textContent).not.toContain("kg-");
  });

  it("§1.3 — ĐÚNG MỘT dòng trạng thái mỗi thẻ, và là SỐ THẬT", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    // số 2/6 đến từ `state.activeRun`, không phải chuỗi cứng
    expect(within(card("Tết 2026")).getByText("Đang vẽ 2/6")).toBeTruthy();
    /* P-SWEEP·10 — "Chưa vẽ" KHÔNG còn là một pill trên thẻ: ảnh bìa rỗng đã nói
       đúng điều đó bằng chữ "Chưa vẽ ảnh nào", nên pill là lần thứ hai cách 40px
       (12 lần trên một lưới 6 thẻ). Pill chỉ giữ cho trạng thái mà ảnh bìa KHÔNG
       nói được — ba dòng còn lại của ca này chính là bộ đó, và chúng phải còn.
       Trạng thái vẫn là CHỮ đọc được: xem ca A3 ngay dưới (aria-label) và
       `data-kit-status` ở vòng lặp cuối. */
    expect(within(card("Candy Lite")).queryByText("Chưa vẽ")).toBeNull();
    expect(within(card("Noel 2026")).getByText("Cần vẽ lại")).toBeTruthy();
    expect(within(card("Hoa mai")).getByText("Vẽ lỗi 1 tấm")).toBeTruthy();
    for (const el of document.querySelectorAll("[data-kit-card]")) {
      expect(el.querySelectorAll("[data-kit-status]")).toHaveLength(0); // status ở chính thẻ
      expect(el.getAttribute("data-kit-status")).toBeTruthy();
    }
  });

  it("A3 — trạng thái là CHỮ, không chỉ màu; và đọc được cả câu dài qua aria-label", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    expect(card("Candy Lite").getAttribute("aria-label")).toBe("Candy Lite — Điền form — Chưa vẽ");
  });

  it("L1 — ĐÚNG MỘT nút CTA mint trên màn, và nó là ô ✚ đầu lưới", async () => {
    const { container } = renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    const cta = container.querySelectorAll("[data-create-kit]");
    expect(cta).toHaveLength(1);
    expect(cta[0]!.textContent).toContain("Tạo bộ kit mới");
    // `bg-accent` (nền mint đặc) chỉ được xuất hiện ở đúng chỗ đó + vạch tải.
    const mint = [...container.querySelectorAll('[class*="bg-accent"]')]
      .filter((el) => !el.closest("[aria-hidden=true]") || el.closest("[data-create-kit]"));
    expect(mint.every((el) => el.closest("[data-create-kit]") !== null)).toBe(true);
  });

  it("agent OK ⇒ ô ✚ KHÔNG bị khoá", async () => {
    const { container } = renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    const cta = container.querySelector("[data-create-kit]") as HTMLButtonElement;
    await waitFor(() => expect(cta.disabled).toBe(false));
  });

  /* §1.1 — thùng rác vẫn là NÚT CHỮ kèm SỐ THẬT, nhưng đã dời hẳn vào SIDEBAR:
     tên nút gọn («Thùng rác»), số đếm là badge cạnh nút. Nút «Thùng rác (N)» ở góc
     dưới-phải vùng lưới đã bỏ — sidebar đã có sẵn lối vào, nút thứ hai là thừa. */
  it("§1.1 — thùng rác là nút chữ ở sidebar kèm SỐ THẬT", async () => {
    const { container } = renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    const bar = within(sidebar(container));
    const trash = bar.getByRole("button", { name: "Thùng rác" });
    // số đếm THẬT (fixture /api/trash trả 2 mục), nằm cạnh nút chứ không nhét vào tên
    await waitFor(() => expect(within(trash.parentElement as HTMLElement).getByText("2")).toBeTruthy());
  });

  it("nút «Thùng rác (N)» ở góc dưới-phải lưới đã BỎ (chỉ còn lối vào ở sidebar)", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Thùng rác \(\d+\)/ })).toBeNull();
  });

  /* Sidebar sau đợt dọn: mục «Gần đây» bỏ hẳn (chỉ còn MỘT danh sách «Dự án»), và
     nhóm điều hướng nội dung có TITLE «Quản lý» để phân biệt với nhóm dự án ở trên. */
  it("sidebar: KHÔNG còn mục «Gần đây», chỉ còn một mục «Dự án»", async () => {
    const { container } = renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    expect(container.textContent ?? "").not.toContain("Gần đây");
    expect(within(sidebar(container)).getAllByRole("button", { name: "Dự án" })).toHaveLength(1);
  });

  /* Thanh quota Codex ở CHÂN sidebar — ngay trên "Cài đặt", cùng khối "việc của app"
     với nút [Cập nhật]. Số phải là SỐ THẬT của agent và phải đọc được bằng CHỮ (A3:
     thanh màu là trang trí, `aria-hidden`). */
  it("sidebar: thanh quota Codex hiện % CÒN LẠI bằng chữ, ngay trên «Cài đặt»", async () => {
    const { container } = renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    const bar = within(sidebar(container));
    const meter = await bar.findByRole("status", { name: /Hạn mức tuần/ });
    expect(meter.textContent).toContain("còn 98%");
    // nhãn chi tiết nói ra mốc ĐẶT LẠI và mốc QUAN SÁT (số cũ bằng lượt chạy cuối)
    const detail = meter.getAttribute("aria-label") ?? "";
    expect(detail).toContain("đặt lại 20/08/2026");
    expect(detail).toContain("số đọc lúc");
    // đứng TRƯỚC "Cài đặt" trong cây DOM
    const settings = bar.getByRole("button", { name: "Cài đặt" });
    expect(meter.compareDocumentPosition(settings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("sidebar: thanh quota ẨN HẲN khi agent chưa có số (không vẽ 0%)", async () => {
    /* `/api/usage` 404 ⇒ hook im lặng ⇒ component trả null. Ca này canh đúng cái
       ranh giới "chưa biết" ≠ "còn 0%". */
    const f = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(typeof input === "string" ? input : (input as Request).url ?? input);
      const json = (body: unknown, status = 200) =>
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "X-KitGen-Protocol": "1" } });
      if (url.includes("/api/usage")) return json({ error: { code: "NOT_FOUND", message: url } }, 404);
      if (url.includes("/health")) return json(HEALTH);
      if (url.includes("/api/projects?") || url.endsWith("/api/projects")) return json(PROJECTS);
      if (url.includes("/api/trash")) return json({ items: [] });
      if (url.includes("/files/")) return new Response(new Blob(["x"]), { status: 200 });
      return json({ error: { code: "NOT_FOUND", message: url } }, 404);
    });
    vi.stubGlobal("fetch", f);
    configureClient({ fetchImpl: f as never, base: "http://127.0.0.1:8765" });
    const { container } = renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    expect(within(sidebar(container)).queryByRole("status", { name: /Hạn mức/ })).toBeNull();
    expect(container.textContent ?? "").not.toContain("còn 0%");
  });

  it("sidebar: nhóm điều hướng có TITLE «Quản lý» hiện ra thành chữ", async () => {
    const { container } = renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    const bar = within(sidebar(container));
    const nav = bar.getByRole("navigation", { name: "Quản lý" });
    // title là CHỮ THẬT trên màn (không chỉ là aria-label của <nav>) và đứng TRƯỚC nhóm
    const title = bar.getByText("Quản lý", { selector: "p" });
    expect(title.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("nút ⋯ có trên mọi thẻ và có tên đọc được", async () => {
    renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Thao tác khác cho Candy Lite" })).toBeTruthy();
  });

  it("KHÔNG còn dấu vết IA cũ: chip lọc, đổi grid/list, nút Nhập, cột số liệu", async () => {
    const { container } = renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    const text = container.textContent ?? "";
    for (const gone of ["Cần sinh ảnh", "Chưa xong", "Xem dạng danh sách", "Nhập từ styles.json cũ", "phong cách"]) {
      expect(text, `IA cũ còn sót: «${gone}»`).not.toContain(gone);
    }
  });

  it("≤6 bộ kit ⇒ KHÔNG có ô nhập nào trên màn (đúng wireframe §1.1)", async () => {
    const { container } = renderHome();
    await waitFor(() => expect(screen.getByText("Candy Lite")).toBeTruthy());
    expect(container.querySelectorAll("input")).toHaveLength(0);
  });
});

describe("H khi AGENT CHƯA CHẠY — không treo, không trắng trang (§6)", () => {
  beforeEach(() => {
    const f = fakeFetch(true);
    vi.stubGlobal("fetch", f);
    configureClient({ fetchImpl: f as never, base: "http://127.0.0.1:8765" });
  });

  it("vẫn render được màn, vẫn có h1", async () => {
    renderHome();
    const h1 = await screen.findByRole("heading", { level: 1 });
    expect((h1.textContent ?? "").normalize("NFC")).toBe("Bộ kit của bạn");
  });

  it("§6 — ô ✚ bị KHOÁ KÈM LÝ DO ĐỌC ĐƯỢC, KHÔNG bị ẩn", async () => {
    const { container } = renderHome();
    const cta = await waitFor(() => {
      const el = container.querySelector("[data-create-kit]") as HTMLButtonElement | null;
      expect(el?.disabled).toBe(true);
      return el!;
    });
    expect(cta.getAttribute("aria-disabled")).toBe("true");
    expect(cta.getAttribute("title")).toBeTruthy();
    expect(cta.getAttribute("title")).not.toBe("");
    // lý do hiện cả thành CHỮ trên ô, không chỉ trong tooltip
    expect(cta.textContent).toContain("công cụ local");
  });

  it("§6 — banner nói việc cần làm + có lệnh copy được, KHÔNG phải overlay chặn màn", async () => {
    renderHome();
    expect(await screen.findByText("Công cụ trên máy chưa chạy")).toBeTruthy();
    expect(screen.getByText("npm run agent")).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /Thử lại/ }).length).toBeGreaterThan(0);
  });

  it("KHÔNG hiện chuỗi lỗi kỹ thuật ra thân UI (§6 quy tắc chung)", async () => {
    const { container } = renderHome();
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(container.textContent).toContain("Công cụ trên máy chưa chạy"));
    const text = container.textContent ?? "";
    for (const forbidden of ["Failed to fetch", "TypeError", "ENOENT", "undefined", "[object Object]"]) {
      expect(text, `lộ chuỗi kỹ thuật: ${forbidden}`).not.toContain(forbidden);
    }
  });
});
