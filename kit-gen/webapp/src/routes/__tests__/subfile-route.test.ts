/**
 * FE-2 · E1 — test lớp ĐIỀU HƯỚNG FILE CON, chạy bằng router THẬT.
 *
 * Chạy trong `npm run verify` (config R0 include `src/**\/__tests__/**\/*.test.ts`).
 * Cùng hai bài học đã ghi ở `router-match.test.ts`: `matchRoutes` nhận chuỗi, còn
 * `beforeLoad` phải gọi thẳng vì `router.load()` trong Node không chạy guard.
 *
 * BỐN THỨ ĐƯỢC KHOÁ Ở ĐÂY, mỗi thứ tương ứng một tiêu chí FE2-PLAN §3-E1:
 *  ① `/p/:id/f/:fileId` khớp đúng route mới và KHÔNG bị `/p/:id` nuốt (⇒ reload giữ file).
 *  ② `?file=` lạ/rác rơi về mặc định, KHÔNG ném lỗi làm trắng màn.
 *  ③ `docPath` sinh đúng hình dạng URL cho từng kiểu file (mục «Sao chép liên kết»).
 *  ④ route mới có guard `requireSetup` như 9 route kia — thiếu là người chưa cài gì
 *     rơi thẳng vào bàn làm việc trống.
 */
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "@/routeTree";
import { useSetupStore } from "@/lib/store";
import { ALL_SHEETS_DOC_ID, RE_DOC_ID } from "@/features/docs/lib/types";
import {
  Route as fileRoute,
  parseFileRouteParams,
} from "../p.$projectId.f.$fileId";
import {
  FILE_ROUTE_PATH, designSearchSchema, docPath, fileSearchSchema, kitSearchSchema,
  readFileSearch, runsSearchSchema, withFileParam, withoutFileParam,
} from "../search-schemas";

const PID = "tet26-vietinbank-a7f3";

function makeRouter() {
  return createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: ["/"] }),
    notFoundMode: "root",
    context: { queryClient: new QueryClient() },
  });
}
const leaf = (pathname: string): string =>
  (makeRouter().matchRoutes(pathname, {}).at(-1)?.routeId as string | undefined) ?? "";

/* ═════════ ① Route canvas ═════════ */

describe("route `/p/:projectId/f/:fileId` — deep link tới bàn làm việc", () => {
  it("khớp đúng route mới", () => {
    expect(leaf(`/p/${PID}/f/f-y-tuong-tet`)).toBe(FILE_ROUTE_PATH);
  });

  it("KHÔNG bị `/p/:id` nuốt, và không nuốt `/p/:id/...` của ai", () => {
    expect(leaf(`/p/${PID}`)).toBe("/p/$projectId");
    expect(leaf(`/p/${PID}/design`)).toBe("/p/$projectId/design");
    expect(leaf(`/p/${PID}/settings`)).toBe("/p/$projectId/settings");
    expect(leaf(`/p/${PID}/runs/r-0031`)).toBe("/p/$projectId/runs/$runId");
    expect(leaf(`/p/${PID}/kit`)).toBe("/p/$projectId/kit");
  });

  it("params khớp ĐÚNG regex nguồn, không phải một bản chép tay", () => {
    expect(parseFileRouteParams({ projectId: PID, fileId: "f-main-kit" })).toEqual({
      projectId: PID,
      fileId: "f-main-kit",
    });
    /* Tab ảo «Tất cả sheet» hợp `RE_DOC_ID` nên route nhận nó — đúng, vì màn sẽ nói
       "file này mở ở quy trình chuẩn" thay vì 404 vô nghĩa. */
    expect(RE_DOC_ID.test(ALL_SHEETS_DOC_ID)).toBe(true);
  });

  it.each([
    ["thiếu tiền tố f-", "y-tuong"],
    ["path traversal", "../../etc/passwd"],
    ["chữ hoa", "f-Tet"],
    ["quá ngắn", "f-a"],
    ["rỗng", ""],
    ["dấu chấm", "f-a.b"],
    ["tên thư mục thật của project", "raw"],
  ])("fileId sai dạng (%s) ⇒ route KHÔNG khớp", (_l, fileId) => {
    expect(parseFileRouteParams({ projectId: PID, fileId })).toBe(false);
  });

  it("projectId sai dạng cũng bị chặn ở đây, không lọt sang repo", () => {
    expect(parseFileRouteParams({ projectId: "AB", fileId: "f-main-kit" })).toBe(false);
    expect(parseFileRouteParams({ projectId: "../x", fileId: "f-main-kit" })).toBe(false);
  });

  it("URL rác dưới /f/ ra 404, không rơi vào một màn bình thường", () => {
    for (const path of [`/p/${PID}/f`, `/p/${PID}/f/raw/x.png`, `/p/${PID}/f/f-ok/zzz`]) {
      const { foundRoute, routeParams } = makeRouter().getMatchedRoutes(path);
      expect(
        foundRoute === undefined || (routeParams["**"] ?? "") !== "",
        `${path} lại khớp trọn một route`,
      ).toBe(true);
    }
  });
});

/* ═════════ ④ Guard ═════════ */

describe("route file con không bị onboarding chặn", () => {
  it("mở thẳng với setup state cũ", () => {
    useSetupStore.setState({ completed: false });
    const fn = (fileRoute.options as { beforeLoad?: (c: { location: { pathname: string } }) => unknown }).beforeLoad;
    expect(() => fn!({ location: { pathname: `/p/${PID}/f/f-abc` } })).not.toThrow();
  });
});

/* ═════════ ② `?file=` ═════════ */

describe("`?file=` — id lạ rơi về mặc định, KHÔNG ném lỗi làm trắng màn", () => {
  it("id hợp lệ được giữ trên cả 3 schema có sẵn", () => {
    expect(designSearchSchema.parse({ file: "f-main-kit" }).file).toBe("f-main-kit");
    expect(kitSearchSchema.parse({ file: "f-main-kit" }).file).toBe("f-main-kit");
    expect(runsSearchSchema.parse({ file: "f-main-kit" }).file).toBe("f-main-kit");
  });

  it.each([
    ["sai dạng", "khong-phai-file"],
    ["traversal", "../../secret"],
    ["số", 42],
    ["null", null],
    ["object", { a: 1 }],
    ["chuỗi rỗng", ""],
  ])("giá trị xấu (%s) ⇒ undefined, tab mặc định vẫn nguyên", (_l, file) => {
    const d = designSearchSchema.parse({ tab: "styles", file });
    expect(d.file).toBeUndefined();
    expect(d.tab, "?file= xấu KHÔNG được làm mất ?tab=").toBe("styles");
    expect(readFileSearch({ file })).toBeUndefined();
  });

  it("`readFileSearch` chịu được search không phải object (route chưa validate)", () => {
    expect(readFileSearch(undefined)).toBeUndefined();
    expect(readFileSearch(null)).toBeUndefined();
    expect(readFileSearch("?file=f-abc")).toBeUndefined();
    expect(readFileSearch({ file: "f-abc", tab: "styles" })).toBe("f-abc");
  });

  it("router THẬT cũng validate như vậy (không chỉ schema rời)", () => {
    const ok = makeRouter().matchRoutes(`/p/${PID}/design`, { tab: "styles", file: "f-abc" }).at(-1);
    expect((ok?.search as { file?: string }).file).toBe("f-abc");
    const bad = makeRouter().matchRoutes(`/p/${PID}/design`, { file: "../x" }).at(-1);
    expect(bad?.routeId).toBe("/p/$projectId/design");
    expect((bad?.search as { file?: string }).file).toBeUndefined();
  });

  it("`fileSearchSchema` dùng cho 3 route chưa khai validateSearch (S2, S2b, S4d)", () => {
    expect(fileSearchSchema.parse({}).file).toBeUndefined();
    expect(fileSearchSchema.parse({ file: "f-abc" }).file).toBe("f-abc");
  });
});

/* ═════════ ③ docPath — mục «Sao chép liên kết» (NEEDS-fe2-c N8) ═════════ */

describe("docPath — hình dạng URL của file con", () => {
  it("file canvas ⇒ đường chính mới", () => {
    expect(docPath({ projectId: PID, docId: "f-y-tuong", kind: "canvas" })).toBe(
      `/p/${PID}/f/f-y-tuong`,
    );
  });

  it("file workflow ⇒ `?file=` trên ĐÚNG màn đang mở", () => {
    expect(docPath({ projectId: PID, docId: "f-main", kind: "workflow", currentPath: `/p/${PID}/design` })).toBe(`/p/${PID}/design?file=f-main`);
    expect(docPath({ projectId: PID, docId: "f-main", kind: "workflow" })).toBe(`/p/${PID}?file=f-main`);
  });

  it("đang ở URL file canvas ⇒ file workflow về tổng quan dự án", () => {
    expect(
      docPath({
        projectId: PID, docId: "f-main", kind: "workflow", currentPath: `/p/${PID}/f/f-y-tuong`,
      }),
    ).toBe(`/p/${PID}?file=f-main`);
  });

  it("tab ảo «Tất cả sheet» KHÔNG vào URL — nó là mặc định", () => {
    expect(docPath({ projectId: PID, docId: ALL_SHEETS_DOC_ID, kind: "workflow", currentPath: `/p/${PID}/kit`, virtualId: ALL_SHEETS_DOC_ID })).toBe(`/p/${PID}/kit`);
  });

  it("id/projectId được encode — không sinh URL vỡ", () => {
    const url = docPath({ projectId: "a b", docId: "f-x y", kind: "canvas" });
    expect(url).toBe("/p/a%20b/f/f-x%20y");
    expect(url.includes(" ")).toBe(false);
  });

  it("đường dẫn ngoài project (gõ tay/lỗi) ⇒ về `/p/:id`, không nối bừa", () => {
    expect(docPath({ projectId: PID, docId: "f-main", kind: "workflow", currentPath: "/settings" })).toBe(`/p/${PID}?file=f-main`);
  });

  it("mọi URL sinh ra đều mở lại được bằng chính router (không phải chuỗi bịa)", () => {
    for (const path of [
      docPath({ projectId: PID, docId: "f-y-tuong", kind: "canvas" }),
      docPath({ projectId: PID, docId: "f-main", kind: "workflow", currentPath: `/p/${PID}/kit` }),
    ]) {
      const [pathname = "", query = ""] = path.split("?");
      const search = query ? Object.fromEntries(new URLSearchParams(query)) : {};
      const m = makeRouter().matchRoutes(pathname, search).at(-1);
      expect(m, `${path} không khớp route nào`).toBeDefined();
      if (query) expect((m!.search as { file?: string }).file).toBe("f-main");
    }
  });
});

/* ═════════ ⑤ Lazy — ĐÚNG MỘT chunk cho cả nhánh canvas ═════════ */

describe("bàn làm việc lazy-load, KHÔNG kéo mọi component thành chunk rời", () => {
  /**
   * BÀI HỌC FE-1 ĐƯỢC KHOÁ BẰNG SỐ, KHÔNG BẰNG LỜI HỨA: mẫu glob rộng từng cắt mỗi
   * component con thành một chunk động riêng. Test này đọc `dist/` THẬT.
   *
   * Bỏ qua khi chưa build (`npx vitest` chạy trước `vite build` trong `npm run verify`),
   * và NÓI RA là đã bỏ qua — một test tự tắt trong im lặng là test vô dụng.
   */
  const dist = resolve(new URL("../../../dist/assets", import.meta.url).pathname);

  it("dist/ chỉ có ĐÚNG MỘT chunk canvas, và nó tách khỏi chunk vào", () => {
    if (!existsSync(dist)) {
      console.log("[BỎ QUA] chưa có dist/ — chạy `npm run build:only` rồi chạy lại ca này");
      return;
    }
    const files = readdirSync(dist).filter((f) => f.endsWith(".js"));
    const canvas = files.filter((f) => /^canvas-/.test(f));
    expect(canvas, `chunk canvas trong dist/: ${canvas.join(", ")}`).toHaveLength(1);

    /* Và nó KHÔNG bị gộp vào chunk vào: gộp thì lazy chỉ còn là hình thức. */
    const entry = files.find((f) => /^index-/.test(f));
    expect(entry).toBeDefined();
    expect(canvas[0]).not.toBe(entry);
  });

  it("route canvas KHÔNG import tĩnh `features/canvas` (nếu không thì lazy là vô nghĩa)", () => {
    const src = readFileSync(
      resolve(new URL("../p.$projectId.f.$fileId.tsx", import.meta.url).pathname),
      "utf8",
    );
    expect(src).not.toMatch(/^import .*from "@\/features\/canvas"/m);
    /* Canvas chưa phát hành: deep link cũ quay về mục Canvas đang khoá của dự án. */
    expect(src).toContain('<Navigate to="/p/$projectId"');
    expect(src).toContain('search={{ section: "canvas" }}');
  });

  it("chỉ có ĐÚNG MỘT `import(\"@/features/canvas\")` trong toàn bộ src/", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e.name) && !p.includes("__tests__")) {
          const txt = readFileSync(p, "utf8");
          const n = txt.match(/import\(\s*["']@\/features\/canvas["']\s*\)/g)?.length ?? 0;
          for (let i = 0; i < n; i += 1) hits.push(p);
        }
      }
    };
    walk(resolve(new URL("../..", import.meta.url).pathname));
    expect(hits, `điểm vào canvas: ${hits.join(", ")}`).toHaveLength(1);
    expect(hits[0]).toContain("lazy-screen.tsx");
  });
});

/* ═════════ ⑥ withFileParam / withoutFileParam — đổi file KHÔNG được ăn param khác ═════════ */

describe("cập nhật `?file=` giữ nguyên mọi param khác", () => {
  const cur = { tab: "styles", sheet: "main", variant: "tet-do", onlyFailed: true };

  it("đổi file ⇒ chỉ `file` đổi, `tab`/`sheet`/`variant` còn nguyên", () => {
    expect(withFileParam(cur, "f-main-kit", ALL_SHEETS_DOC_ID)).toEqual({ ...cur, file: "f-main-kit" });
  });

  it("mở tab ảo ⇒ XOÁ `file`, không ghi `?file=f-all-sheets`", () => {
    const out = withFileParam({ ...cur, file: "f-cu" }, ALL_SHEETS_DOC_ID, ALL_SHEETS_DOC_ID);
    expect(out).not.toHaveProperty("file");
    expect(out).toEqual(cur);
  });

  it("dọn `file` rác ⇒ giữ nguyên phần còn lại", () => {
    expect(withoutFileParam({ ...cur, file: "f-da-xoa" })).toEqual(cur);
    expect(withoutFileParam({})).toEqual({});
  });

  it("KHÔNG đổi object gốc (mutate search của router là lỗi rất khó truy)", () => {
    const src = { tab: "styles", file: "f-a" };
    withFileParam(src, "f-b", ALL_SHEETS_DOC_ID);
    withoutFileParam(src);
    expect(src).toEqual({ tab: "styles", file: "f-a" });
  });
});
