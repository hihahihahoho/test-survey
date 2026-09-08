/**
 * FE-2 · E1 — test lớp ĐIỀU HƯỚNG FILE CON, chạy bằng router THẬT.
 *
 * Chạy trong `npm run verify` (config R0 include `src/**\/__tests__/**\/*.test.ts`).
 * Cùng hai bài học đã ghi ở `router-match.test.ts`: `matchRoutes` nhận chuỗi, còn
 * `beforeLoad` phải gọi thẳng vì `router.load()` trong Node không chạy guard.
 *
 * BA THỨ ĐƯỢC KHOÁ Ở ĐÂY, mỗi thứ tương ứng một tiêu chí FE2-PLAN §3-E1:
 *  ① `/p/:id/f/:fileId` khớp đúng route mới và KHÔNG bị `/p/:id` nuốt (⇒ reload giữ file).
 *  ② `?file=` lạ/rác rơi về mặc định, KHÔNG ném lỗi làm trắng màn.
 *  ③ `docPath` sinh đúng hình dạng URL cho từng kiểu file (mục «Sao chép liên kết»).
 *  ④ (ĐÃ BỎ 07/09/2026) guard `requireSetup` — hàm đã rỗng từ lâu rồi bị xoá hẳn
 *     cùng wizard cài đặt, nên không còn gì để khoá.
 *
 * ⑤ cũ ("ĐÚNG MỘT chunk cho cả nhánh canvas") cũng đi theo: `features/canvas` đã bị
 * xoá khỏi repo, `/p/:id/f/:fileId` nay chỉ còn là stub chuyển hướng về `/k/:id`.
 */
import { describe, expect, it } from "vitest";
import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import { routeTree } from "@/routeTree";
import { ALL_SHEETS_DOC_ID, RE_DOC_ID } from "@/features/docs/lib/types";
import { parseFileRouteParams } from "../p.$projectId.f.$fileId";
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
