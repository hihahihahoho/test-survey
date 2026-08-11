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
 *     server-side: `isServer === true`, `state.matches` rỗng). Nên guard được
 *     kiểm bằng cách gọi thẳng `beforeLoad` của route — đó cũng đúng là hàm mà
 *     trình duyệt sẽ gọi.
 */
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter, isRedirect } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "@/routeTree";
import { useSetupStore } from "@/lib/store";

import { Route as setupRoute } from "../setup";
import { Route as indexRoute } from "../index";
import { Route as settingsRoute } from "../settings";
import { Route as projectRoute } from "../p.$projectId";
import { Route as designRoute } from "../p.$projectId.design";
import { Route as runsRoute } from "../p.$projectId.runs";
import { Route as runDetailRoute } from "../p.$projectId.runs.$runId";
import { Route as kitRoute } from "../p.$projectId.kit";
import { Route as projectSettingsRoute } from "../p.$projectId.settings";

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

describe("sitemap §2.1 — 9 đường dẫn khớp đúng route", () => {
  it.each([
    ["/setup", "/setup"],
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
      "/setup",
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

/* ── Guard: gọi thẳng `beforeLoad` của từng route (xem ghi chú đầu file) ──── */

type BeforeLoad = (ctx: { location: { pathname: string } }) => unknown;
const beforeLoadOf = (route: { options: unknown }): BeforeLoad | undefined =>
  (route.options as { beforeLoad?: BeforeLoad }).beforeLoad;

const GUARDED: [string, { options: unknown }, string][] = [
  ["S1 /", indexRoute, "/"],
  ["S6 /settings", settingsRoute, "/settings"],
  ["S2 /p/:id", projectRoute, "/p/tet26-a7f3"],
  ["S3 /p/:id/design", designRoute, "/p/tet26-a7f3/design"],
  ["S4 /p/:id/runs", runsRoute, "/p/tet26-a7f3/runs"],
  ["S4d /p/:id/runs/:runId", runDetailRoute, "/p/tet26-a7f3/runs/r-0031"],
  ["S5 /p/:id/kit", kitRoute, "/p/tet26-a7f3/kit"],
  ["S2b /p/:id/settings", projectSettingsRoute, "/p/tet26-a7f3/settings"],
];

describe("local-first routes skip obsolete onboarding", () => {
  it.each(GUARDED)("%s opens with stale setup state", (_label, route, pathname) => {
    useSetupStore.setState({ completed: false });
    expect(() => beforeLoadOf(route)!({ location: { pathname } })).not.toThrow();
  });
  it("/setup redirects to workspace", () => {
    const fn = beforeLoadOf(setupRoute); let thrown: unknown = null;
    try { fn!({ location: { pathname: "/setup" } }); } catch (e) { thrown = e; }
    expect(isRedirect(thrown)).toBe(true);
    expect((thrown as { options: { to?: string } }).options.to).toBe("/");
  });
});
