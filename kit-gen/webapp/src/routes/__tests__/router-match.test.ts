/**
 * Kiểm chứng CÂY ROUTE bằng router THẬT — không đọc code rồi tin là đúng.
 *
 * Vì sao không kiểm bằng trình duyệt: môi trường chạy không khởi động được
 * Chrome (`agent-browser` báo "Chrome exited early without writing
 * DevToolsActivePort", kể cả với --no-sandbox; cổng 9333 luôn bị Connection
 * refused). Nên tôi dựng chính `createRouter` mà app dùng và cho nó khớp URL thật.
 *
 * HAI ĐIỀU ĐO ĐƯỢC, GHI LẠI ĐỂ NGƯỜI SAU KHỎI VẤP:
 *  1. `router.matchRoutes(pathname, search)` nhận thẳng chuỗi. Còn
 *     `parseLocation()` thì ĐÒI một `HistoryLocation` làm đối số — gọi trần
 *     sẽ ném "Cannot destructure property 'pathname' of 'undefined'".
 *  2. `router.load()` trong Node KHÔNG chạy `beforeLoad` (router coi mình là
 *     server-side). Nên guard phải được kiểm bằng cách gọi thẳng `beforeLoad` của
 *     route. (Hiện KHÔNG route nào còn `beforeLoad`; ghi chú giữ lại vì nó là cái
 *     bẫy đầu tiên ai thêm guard mới sẽ vấp.)
 */
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "@/routeTree";
import { projectIdFromSplat } from "../p.$";

const PID = "tet26-a7f3";

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

describe("sitemap — 8 đường dẫn khớp đúng route", () => {
  it.each([
    ["/", "/"],
    ["/settings", "/settings"],
    ["/trash", "/trash"],
    ["/brands", "/brands"],
    ["/references", "/references"],
    ["/library/prompts", "/library/prompts"],
    [`/k/${PID}`, "/k/$projectId"],
    [`/p/${PID}`, "/p/$"],
  ])("%s → %s", (path, expected) => {
    expect(leaf(path)).toBe(expected);
  });

  /* Bẫy kinh điển của cây route này: route splat `/p/$` khớp rất rộng. */
  it("`/p/$` KHÔNG nuốt màn làm việc `/k/:id` lẫn các trang vỏ", () => {
    expect(leaf(`/k/${PID}`)).toBe("/k/$projectId");
    expect(leaf("/settings")).toBe("/settings");
    expect(leaf("/references")).toBe("/references");
    expect(leaf("/library/prompts")).toBe("/library/prompts");
  });

  /**
   * HAI ĐỊA CHỈ ĐÃ GỠ (08/09/2026) KHÔNG ĐƯỢC LẶNG LẼ SỐNG LẠI.
   *
   * `/library/ui` và `/library/mascot` bị xoá cùng hai màn của chúng. Ca này canh
   * đúng một thứ: một link cũ (bookmark, tab đang mở) rơi xuống trang 404 chứ không
   * khớp trúng `/library/prompts` hay bị `/p/$` nuốt thành một màn trông có vẻ ổn.
   */
  it.each(["/library/ui", "/library/mascot"])("%s đã gỡ ⇒ không khớp route nào", (path) => {
    const { foundRoute, routeParams } = makeRouter().getMatchedRoutes(path);
    expect(foundRoute === undefined || (routeParams["**"] ?? "") !== "").toBe(true);
  });

  /* `?kind=` là trục URL duy nhất của thư viện prompt, và nó phải sống sót một
     giá trị rác: link cũ / URL gõ tay không được làm trắng màn. */
  it("`/library/prompts?kind=` nhận giá trị lạ mà không ném", () => {
    expect(matchAt("/library/prompts", { kind: "khong-co-that" }).at(-1)?.routeId).toBe("/library/prompts");
    expect(matchAt("/library/prompts", { kind: 42 }).at(-1)?.routeId).toBe("/library/prompts");
  });
});

describe("id sai dạng ⇒ ra trang 404, KHÔNG lọt vào màn nào", () => {
  /**
   * CÁCH ĐỌC KẾT QUẢ (đã dò trong router-core, không đoán):
   * TanStack coi một URL là "không tìm thấy" khi route khớp còn THỪA đuôi —
   * phần thừa nằm ở `routeParams["**"]`. Lúc đó match gốc được gắn cờ
   * `_notFound` và `notFoundComponent` của root (trang 404 của ta) được render.
   */
  it.each([
    ["chữ hoa", `/k/TET26`],
    ["quá ngắn", `/k/ab`],
    ["đuôi rác sau /k/:id", `/k/${PID}/zzz`],
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
    for (const path of ["/", "/settings", "/trash", `/k/${PID}`]) {
      const { foundRoute, routeParams } = makeRouter().getMatchedRoutes(path);
      expect(foundRoute, `${path} phải khớp một route`).toBeDefined();
      expect(routeParams["**"] ?? "", `${path} không được còn đuôi thừa`).toBe("");
    }
  });
});

describe("search param — router thật validate đúng", () => {
  it("tab hợp lệ giữ nguyên", () => {
    expect((matchAt("/settings", { tab: "prefs" }).at(-1)?.search as { tab?: string }).tab).toBe("prefs");
  });

  it("tab lạ rơi về tab đầu, KHÔNG ném lỗi làm trắng màn", () => {
    const m = matchAt("/settings", { tab: "bịa-ra" }).at(-1);
    expect(m?.routeId).toBe("/settings");
    expect((m?.search as { tab?: string }).tab).toBe("agent");
    /* `trash` từng là tab thứ 5 của /settings; nay là route riêng `/trash`. */
    expect((matchAt("/settings", { tab: "trash" }).at(-1)?.search as { tab?: string }).tab).toBe("agent");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════
   IA PROMPT-FIRST — MỘT CĂN PHÒNG THẬT, và một mớ URL cũ vẫn phải mở được

   Sau đợt này chỉ còn MỘT đích có màn riêng cho một dự án: `/k/:id`. Mọi địa chỉ
   `/p/**` đời cũ đi qua đúng MỘT route splat và chuyển hướng về đó — chúng vẫn
   phải KHỚP route, vì rơi vào 404 nghĩa là mọi bookmark cũ thành lỗi 404 chỉ vì
   bên trong app đổi cách làm việc.
   ══════════════════════════════════════════════════════════════════════════════ */
describe("stub `/p/$` — mọi địa chỉ đời cũ vẫn khớp trọn một route", () => {
  it.each([
    `/p/${PID}`,
    `/p/${PID}/design`,
    `/p/${PID}/kit`,
    `/p/${PID}/settings`,
    `/p/${PID}/runs`,
    `/p/${PID}/runs/r-0031`,
    `/p/${PID}/f/f-y-tuong-tet`,
  ])("link cũ %s vẫn khớp trọn (không 404)", (path) => {
    const { foundRoute, routeParams } = makeRouter().getMatchedRoutes(path);
    expect(foundRoute, `${path} phải khớp một route`).toBeDefined();
    expect(routeParams["**"] ?? "", `${path} không được còn đuôi thừa`).toBe("");
    expect(leaf(path)).toBe("/p/$");
  });

  it("tách id dự án từ đoạn đầu của phần đuôi", () => {
    expect(projectIdFromSplat(PID)).toBe(PID);
    expect(projectIdFromSplat(`${PID}/runs/r-0031`)).toBe(PID);
    expect(projectIdFromSplat(`${PID}/f/f-main-kit`)).toBe(PID);
  });

  it.each([
    ["rỗng", ""],
    ["không có gì", undefined],
    ["chữ hoa", "TET26"],
    ["quá ngắn", "ab"],
    ["path traversal", "../../etc/passwd"],
  ])("id %s ⇒ về trang chủ, KHÔNG ghép một URL rác", (_l, splat) => {
    expect(projectIdFromSplat(splat)).toBeNull();
  });

  /* `?settings=` nay chỉ mang nghĩa "dialog Cài đặt đang mở"; ba giá trị cũ vẫn
     hợp lệ để link đời trước không rơi vào hư không (xem `search-schemas.ts`). */
  it.each(["project", "requirements", "style"])("`?settings=%s` mở dialog, không làm trắng màn", (v) => {
    const m = matchAt(`/k/${PID}`, { settings: v }).at(-1);
    expect(m?.routeId).toBe("/k/$projectId");
    expect((m?.search as { settings?: string }).settings).toBe(v);
  });

  it("giá trị `?settings=` lạ rơi về «đóng», KHÔNG ném lỗi", () => {
    const m = matchAt(`/k/${PID}`, { settings: "bịa-ra" }).at(-1);
    expect(m?.routeId).toBe("/k/$projectId");
    expect((m?.search as { settings?: string }).settings).toBeUndefined();
  });
});
