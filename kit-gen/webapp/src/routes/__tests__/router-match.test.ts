/**
 * Kiểm chứng CÂY ROUTE bằng router THẬT — không đọc code rồi tin là đúng.
 *
 * Vì sao không kiểm bằng trình duyệt: môi trường chạy không khởi động được
 * Chrome (`agent-browser` báo "Chrome exited early without writing
 * DevToolsActivePort", kể cả với --no-sandbox; cổng 9333 luôn bị Connection
 * refused). Nên tôi dựng chính `createRouter` mà app dùng và cho nó khớp URL
 * thật. Việc soi bằng mắt trên trình duyệt VẪN CÒN THIẾU — đã ghi ở báo cáo.
 *
 * HAI ĐIỀU ĐO ĐƯỢC, GHI LẠI ĐỂ NGƯỜI SAU KHỎI VẤP:
 *  1. `router.matchRoutes(pathname, search)` nhận thẳng chuỗi. Còn
 *     `parseLocation()` thì ĐÒI một `HistoryLocation` làm đối số — gọi trần
 *     sẽ ném "Cannot destructure property 'pathname' of 'undefined'".
 *  2. `router.load()` trong Node KHÔNG chạy `beforeLoad` (router coi mình là
 *     server-side: `isServer === true`, `state.matches` rỗng). Nên guard phải được
 *     kiểm bằng cách gọi thẳng `beforeLoad` của route — đó cũng đúng là hàm mà
 *     trình duyệt sẽ gọi. (Hiện KHÔNG route nào còn `beforeLoad`: `requireSetup`
 *     là hàm rỗng và đã bị xoá 07/09/2026 cùng route `/setup`. Ghi chú giữ lại vì
 *     nó là cái bẫy đầu tiên ai thêm guard mới sẽ vấp.)
 */
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "@/routeTree";

/**
 * Router dùng chung cho các phép khớp.
 * `notFoundMode: "root"` phải GIỐNG HỆT App.tsx, nếu không test sẽ kiểm một
 * cấu hình không ai chạy. Xem ghi chú trong App.tsx để biết vì sao không dùng
 * mặc định "fuzzy".
 */
function makeRouter() {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
    notFoundMode: "root",
    context: { queryClient: new QueryClient() },
  });
}

const matchAt = (pathname: string, search: Record<string, unknown> = {}) =>
  makeRouter().matchRoutes(pathname, search);

const leaf = (pathname: string): string =>
  (matchAt(pathname).at(-1)?.routeId as string | undefined) ?? "";

describe("sitemap §2.1 — 8 đường dẫn khớp đúng route", () => {
  it.each([
    ["/", "/"],
    ["/settings", "/settings"],
    ["/p/tet26-a7f3", "/p/$projectId"],
    ["/p/tet26-a7f3/design", "/p/$projectId/design"],
    ["/p/tet26-a7f3/runs", "/p/$projectId/runs"],
    ["/p/tet26-a7f3/runs/r-0031", "/p/$projectId/runs/$runId"],
    ["/p/tet26-a7f3/kit", "/p/$projectId/kit"],
    ["/p/tet26-a7f3/settings", "/p/$projectId/settings"],
  ])("%s → %s", (path, expected) => {
    expect(leaf(path)).toBe(expected);
  });

  /* Hai bẫy kinh điển của cây route này. */
  it("S6 /settings KHÔNG nuốt S2b /p/:id/settings", () => {
    expect(leaf("/settings")).toBe("/settings");
    expect(leaf("/p/tet26-a7f3/settings")).toBe("/p/$projectId/settings");
  });

  it("/runs/:runId không bị /runs nuốt mất", () => {
    expect(leaf("/p/tet26-a7f3/runs")).toBe("/p/$projectId/runs");
    expect(leaf("/p/tet26-a7f3/runs/r-0031")).toBe("/p/$projectId/runs/$runId");
  });
});

describe("id sai dạng ⇒ ra trang 404, KHÔNG lọt vào màn nào", () => {
  /**
   * CÁCH ĐỌC KẾT QUẢ (đã dò trong router-core, không đoán):
   * TanStack coi một URL là "không tìm thấy" khi route khớp còn THỪA đuôi —
   * phần thừa nằm ở `routeParams["**"]`. Lúc đó match gốc được gắn cờ
   * `_notFound` và `notFoundComponent` của root (trang 404 của ta) được render.
   * Nên chỉ báo đúng là: hoặc không khớp route nào, hoặc còn đuôi thừa.
   *
   * Ca `runId sai dạng` là ca test này BẮT ĐƯỢC và bắt tôi đổi cấu hình:
   * `params.parse` từ chối `0031`, nhưng với `notFoundMode` mặc định ("fuzzy")
   * ranh giới 404 có thể rơi vào route cha gần nhất. Đã đặt `notFoundMode:
   * "root"` trong App.tsx để mọi URL rác đều ra trang 404 có đường về.
   */
  it.each([
    ["chữ hoa", "/p/TET26"],
    ["quá ngắn", "/p/ab"],
    ["runId sai dạng", "/p/tet26-a7f3/runs/0031"],
    ["đuôi rác sau /kit", "/p/tet26-a7f3/kit/zzz"],
    ["đường dẫn ngoài sitemap", "/khong-ton-tai"],
  ])("%s", (_l, path) => {
    const { foundRoute, routeParams } = makeRouter().getMatchedRoutes(path);
    const leftover = routeParams["**"] ?? "";
    expect(
      foundRoute === undefined || leftover !== "",
      "URL rác này lại khớp trọn một route — user sẽ thấy một màn bình thường thay vì 404",
    ).toBe(true);
  });

  it("ngược lại: URL hợp lệ khớp trọn, KHÔNG còn đuôi thừa", () => {
    for (const path of [
      "/",
      "/settings",
      "/p/tet26-a7f3",
      "/p/tet26-a7f3/design",
      "/p/tet26-a7f3/runs/r-0031",
      "/p/tet26-a7f3/kit",
      "/p/tet26-a7f3/settings",
    ]) {
      const { foundRoute, routeParams } = makeRouter().getMatchedRoutes(path);
      expect(foundRoute, `${path} phải khớp một route`).toBeDefined();
      expect(routeParams["**"] ?? "", `${path} không được còn đuôi thừa`).toBe("");
    }
  });
});

describe("search param — router thật validate đúng", () => {
  it("tab hợp lệ giữ nguyên", () => {
    const m = matchAt("/p/tet26-a7f3/design", { tab: "styles" }).at(-1);
    expect((m?.search as { tab?: string }).tab).toBe("styles");
  });

  it("tab lạ rơi về tab đầu, KHÔNG ném lỗi làm trắng màn", () => {
    const m = matchAt("/p/tet26-a7f3/design", { tab: "bịa-ra" }).at(-1);
    expect(m?.routeId).toBe("/p/$projectId/design");
    expect((m?.search as { tab?: string }).tab).toBe("sheets");
  });

  it("tab của S5 và S6 cũng vậy", () => {
    expect((matchAt("/p/tet26-a7f3/kit", { tab: "xx" }).at(-1)?.search as { tab?: string }).tab).toBe("assets");
    expect((matchAt("/settings", { tab: "xx" }).at(-1)?.search as { tab?: string }).tab).toBe("agent");
    expect((matchAt("/settings", { tab: "trash" }).at(-1)?.search as { tab?: string }).tab).toBe("agent");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   IA PROMPT-FIRST — HAI CĂN PHÒNG THẬT, và một mớ URL cũ vẫn phải mở được

   Sau đợt này chỉ còn HAI đích có màn riêng cho một dự án: `/k/:id` (SOẠN) và
   `/p/:id` (XEM + XUẤT). Sáu đường còn lại (`/design`, `/runs`, `/kit`,
   `/settings`, `/k/:id/canvas`, `/k/:id/studio`) là STUB chuyển hướng — chúng
   vẫn phải KHỚP route, vì rơi vào 404 nghĩa là mọi bookmark cũ của người dùng
   thành lỗi 404 chỉ vì bên trong app đổi cách làm việc.
   ══════════════════════════════════════════════════════════════════════════════ */
describe("smoke — hai căn phòng của một dự án + stub chuyển hướng đời cũ", () => {
  it.each([
    ["khu soạn", "/k/tet26-a7f3", "/k/$projectId"],
    ["kết quả & xuất kit", "/p/tet26-a7f3", "/p/$projectId"],
  ])("%s: %s → %s", (_label, path, expected) => {
    expect(leaf(path)).toBe(expected);
  });

  it.each([
    "/p/tet26-a7f3/design",
    "/p/tet26-a7f3/kit",
    "/p/tet26-a7f3/settings",
    "/p/tet26-a7f3/runs",
    "/k/tet26-a7f3/canvas",
    "/k/tet26-a7f3/studio",
  ])("link cũ %s vẫn khớp trọn một route (không 404)", (path) => {
    const { foundRoute, routeParams } = makeRouter().getMatchedRoutes(path);
    expect(foundRoute, `${path} phải khớp một route`).toBeDefined();
    expect(routeParams["**"] ?? "", `${path} không được còn đuôi thừa`).toBe("");
  });

  /* `?settings=` nay chỉ mang nghĩa "dialog Cài đặt đang mở"; ba giá trị cũ vẫn
     hợp lệ để link đời trước không rơi vào hư không (xem `search-schemas.ts`). */
  it.each(["project", "requirements", "style"])("`?settings=%s` mở dialog, không làm trắng màn", (v) => {
    const m = matchAt("/p/tet26-a7f3", { settings: v }).at(-1);
    expect(m?.routeId).toBe("/p/$projectId");
    expect((m?.search as { settings?: string }).settings).toBe(v);
  });

  it("giá trị `?settings=` lạ rơi về «đóng», KHÔNG ném lỗi", () => {
    const m = matchAt("/p/tet26-a7f3", { settings: "bịa-ra" }).at(-1);
    expect(m?.routeId).toBe("/p/$projectId");
    expect((m?.search as { settings?: string }).settings).toBeUndefined();
  });
});
