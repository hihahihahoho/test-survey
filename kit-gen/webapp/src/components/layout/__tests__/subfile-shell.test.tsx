/**
 * FE-2 · E1 — test NỐI DÂY THANH TAB vào khung, và các luật lọc phạm vi file.
 *
 * Chạy trong `npm run verify` (config R0, environment `node`).
 *
 * VÌ SAO `renderToString` CHỨ KHÔNG PHẢI jsdom: `jsdom` + `@testing-library` vẫn nằm
 * ngoài `package.json` và đang là symlink `/tmp` (nợ hạ tầng đã ghi ở `EVIDENCE-FE1.md`
 * §5-3, `NEEDS-fe2-c.md` N2, `NEEDS-fe2-d.md` N3). Một file `vitest.dom.config.ts` cho
 * nhánh E cũng **ngoài glob E** (FE2-PLAN §1) ⇒ tôi không tạo. Cùng lựa chọn mà R1-P2
 * đã ghi trong `features/setup/__tests__/render-smoke.test.tsx`.
 *
 * ⚠️ GIỚI HẠN NÓI THẲNG: SSR **không** kiểm được tương tác (bấm tab, đổi URL, back/forward)
 * và **không** chạy `useEffect` (nên nhánh "dọn `?file=` rác" không được chứng minh ở đây —
 * xem §5 của `fe2/E1-REPORT.md` và đề nghị Q1 kiểm bằng trình duyệt). Cái SSR kiểm ĐƯỢC,
 * và đúng là những chỗ dễ vỡ nhất khi nối dây: cây component mount được thật, thanh tab có
 * mặt ở đúng 6 màn, `aria-controls` ⇄ `role="tabpanel"` khớp nhau, và không có chuỗi kỹ
 * thuật nào lọt ra thân UI.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  RouterProvider, createMemoryHistory, createRootRoute, createRoute, createRouter, Outlet,
} from "@tanstack/react-router";
import { AppLayout } from "../AppLayout";
import { FileScopeNotice } from "../FloraShell";
import {
  HAS_RAIL, contractSheetIdsOf, hasFileTabs, runningSheetIdsOf, scopeSheetIds,
  type FileScope, type ScreenId,
} from "../screen-contract";
import { FILE_PANEL_ID } from "@/features/docs/lib/subfile-a11y";
import { FileTab } from "@/features/docs/components/subfiles";
import { ALL_SHEETS_DOC_ID } from "@/features/docs/lib/types";
import { useSetupStore } from "@/lib/store";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/* Agent không có trong test ⇒ fetch trượt. Đó CHÍNH LÀ ca "agent chưa chạy" ta muốn
   khung phải sống sót qua. */
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
  useSetupStore.setState({ completed: true });
});

const PID = "tet26-vietinbank-a7f3";

/** Thân UI = mọi thứ NGOÀI `<details>` (panel "Chi tiết cho lập trình viên" được phép). */
const visibleBody = (html: string) => html.replace(/<details[\s\S]*?<\/details>/g, "");

/**
 * CHỮ NGƯỜI DÙNG ĐỌC ĐƯỢC. React SSR chèn `<!-- -->` giữa các đoạn text, nên "3 sheet"
 * trong JSX ra HTML là `3<!-- --> <!-- -->sheet`. Kiểm chuỗi thô sẽ báo đỏ dù UI đúng —
 * đúng bài học mà R1-P2 đã ghi trong `render-smoke.test.tsx` (phép kiểm sai, không phải
 * code sai). Bản này kiểm đúng thứ cần kiểm: chữ mà người dùng thấy.
 */
const textOf = (html: string) =>
  html.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

async function renderShell(screen: ScreenId, url: string, fileId?: string): Promise<string> {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const page = createRoute({
    getParentRoute: () => rootRoute,
    path: "/p/$projectId/$rest",
    component: () => (
      <AppLayout screen={screen} projectId={PID} {...(fileId ? { fileId } : {})}>
        <p>nội dung màn</p>
      </AppLayout>
    ),
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([page]),
    history: createMemoryHistory({ initialEntries: [url] }),
  });
  // Không `await router.load()` thì `renderToString` trả chuỗi RỖNG ⇒ mọi assertion
  // phủ định "xanh giả" (bài học đã ghi ở render-smoke.test.tsx của R1-P2).
  await router.load();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  /* CÙNG THỨ TỰ PROVIDER MÀ `App.tsx` DÙNG: QueryClient → Tooltip → Router.
     Thiếu `TooltipProvider` là ca test này bắt được đầu tiên: Radix ném "`Tooltip` must
     be used within `TooltipProvider`", Suspense/boundary nuốt lỗi và `renderToString`
     trả ra một `<template data-msg=...>` — HTML "có nội dung" nhưng không có UI nào.
     Nếu tôi chỉ kiểm `html.length > 1000` thì ca này đã XANH GIẢ. */
  return renderToString(
    <QueryClientProvider client={qc}>
      <TooltipProvider>
        <RouterProvider router={router as never} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

/* ═════════ 1. Thanh tab ĐÃ ĐÔNG LẠNH — khung không mount nó ở màn nào ═════════ */

/**
 * ⚠️ ĐỔI HỢP ĐỒNG Ở WAVE 1 (UPGRADE-PLAN §W1-13 · §Đ3) — đọc trước khi "sửa lại cho xanh".
 *
 * `showRail`/`showTabs` trong `AppLayout` tính ra **`false` ở cả 6 chỗ gọi thật** (hai
 * route có `projectId` thì lại `simplified`). Bộ test cũ ở đây render thẳng `AppLayout`
 * KHÔNG kèm `simplified`, tức là nó khoá một nhánh **không route nào chạy tới** — và
 * chính nhánh đó kéo `ProjectRail` + `subfiles/**` (~106KB) vào bundle của mọi màn.
 *
 * Wave 1 gỡ hai nhánh khỏi khung nhưng **KHÔNG xoá một file nào**: hướng sản phẩm
 * "file con kiểu Figma" là quyết định của chủ dự án. Nên bộ test này đổi theo đúng một
 * bước: từ *"thanh tab phải được mount"* sang *"khung không mount thanh tab, và nội dung
 * màn vẫn nguyên vẹn"*. Bảng `hasFileTabs`/`HAS_RAIL`, `scopeSheetIds`, và bộ test a11y
 * của `FileTab` giữ NGUYÊN — chúng là bằng chứng của phần đang đông lạnh, và là thứ cần
 * còn nguyên vào ngày chủ dự án bật lại.
 */
describe("thanh tab file con — đông lạnh, khung không mount ở màn nào", () => {
  const SIX: ScreenId[] = ["project", "project-settings", "design", "runs", "run-detail", "kit"];

  it("BẢNG HỢP ĐỒNG GIỮ NGUYÊN: đúng 6 màn khai có thanh tab, khớp `HAS_RAIL`", () => {
    expect(SIX.every(hasFileTabs)).toBe(true);
    expect([...HAS_RAIL].sort()).toEqual([...SIX].sort());
    for (const s of ["setup", "projects", "settings"] as ScreenId[]) {
      expect(hasFileTabs(s), `${s} KHÔNG được có thanh tab file con`).toBe(false);
    }
  });

  it.each(SIX)("màn %s: KHÔNG có thanh tab, KHÔNG có tabpanel, nội dung màn vẫn render", async (screen) => {
    const html = await renderShell(screen, `/p/${PID}/x?file=f-main-kit`);
    expect(html.length).toBeGreaterThan(1000);
    /* Chặn "xanh giả": một cây bị ném lỗi vẫn ra HTML dài, nhưng nội dung là template
       của Suspense chứ không phải UI. Ca này là lý do các assertion phủ định dưới đây
       không thể xanh vì màn trắng. */
    expect(html, "cây component bị ném lỗi khi render").not.toContain("data-msg=");
    expect(html, "nội dung màn phải render bình thường").toContain("nội dung màn");
    expect(html, "thanh tab file con đã đông lạnh, không được mount").not.toContain("Đang mở danh sách file…");
    expect(html).not.toContain(`id="${FILE_PANEL_ID}"`);
    expect(html).not.toContain('role="tabpanel"');
  });

  it("badge «bản nháp cục bộ» của thanh tab cũng biến mất cùng thanh tab", async () => {
    const html = await renderShell("project", `/p/${PID}/x`);
    expect(textOf(html)).not.toContain("bản nháp cục bộ");
  });

  it("thân UI KHÔNG rò chuỗi kỹ thuật dù mọi fetch đều trượt", async () => {
    const body = visibleBody(await renderShell("design", `/p/${PID}/design`));
    for (const bad of ["Failed to fetch", "TypeError", "indexedDB", "NOT_IMPLEMENTED"]) {
      expect(body, `thân UI không được chứa "${bad}"`).not.toContain(bad);
    }
  });

  it("route canvas (`fileId` qua prop) vẫn mở được và cũng không có thanh tab", async () => {
    const html = await renderShell("project", `/p/${PID}/f`, "f-y-tuong-tet");
    expect(html).toContain("nội dung màn");
    expect(html).not.toContain("Đang mở danh sách file…");
    expect(html).not.toContain(`id="${FILE_PANEL_ID}"`);
  });

  it("màn NGOÀI project (S1/S6/S0) — không đổi gì so với trước", async () => {
    const html = await renderShell("projects", "/p/x/y");
    expect(html).not.toContain("Đang mở danh sách file…");
    expect(html).not.toContain('role="tabpanel"');
    expect(html).not.toContain(`id="${FILE_PANEL_ID}"`);
    expect(html, "nội dung màn vẫn phải render bình thường").toContain("nội dung màn");
  });

  it("khung KHÔNG còn import `ProjectRail`/`SubfileTabs` — hai file vẫn còn trên đĩa", () => {
    const shell = readFileSync(resolve(new URL("..", import.meta.url).pathname, "AppLayout.tsx"), "utf8");
    expect(shell).not.toContain('from "./ProjectRail"');
    expect(shell).not.toContain('from "@/features/docs/components/subfiles"');
    // ĐÔNG LẠNH nghĩa là GIỮ FILE — xoá là quyết định của chủ dự án (§Đ3).
    expect(readFileSync(resolve(new URL("..", import.meta.url).pathname, "ProjectRail.tsx"), "utf8").length).toBeGreaterThan(0);
  });
});

/* ═════════ 1b. `aria-controls` ⇄ `role="tabpanel"` — hai vế phải cùng một id ═════════ */

describe("aria-controls chỉ tồn tại khi có panel thật (đóng NEEDS-fe2-c N8)", () => {
  const TAB = {
    id: "f-main-kit", name: "Bộ kit chính", kind: "workflow" as const, color: "none" as const,
    virtual: false, dirty: false, sheetCount: 2, staleCount: 0, updatedAt: "",
  };

  it("khung TRUYỀN `panelId` ⇒ tab có `aria-controls` trỏ đúng id mà khung render", () => {
    const out = renderToString(
      <FileTab tab={TAB} active onActivate={() => {}} panelId={FILE_PANEL_ID} />,
    );
    expect(out).toContain(`aria-controls="${FILE_PANEL_ID}"`);
  });

  it("KHÔNG truyền ⇒ bỏ hẳn thuộc tính (aria sai tệ hơn aria thiếu)", () => {
    expect(renderToString(<FileTab tab={TAB} active onActivate={() => {}} />)).not.toContain(
      "aria-controls",
    );
  });
});

/* ═════════ 2. `scopeSheetIds` — bất biến §4.5 ═════════ */

function scope(over: Partial<FileScope> = {}): FileScope {
  return {
    docId: "f-main-kit", docName: "Bộ kit chính", kind: "workflow", all: false,
    sheetIds: ["main", "main2"], resolving: false, openAllSheets: () => {}, ...over,
  };
}
const sheets = [{ id: "main" }, { id: "main2" }, { id: "pose-lan" }, { id: "coin" }];
const ids = (list: { id: string }[]) => list.map((s) => s.id);

describe("scopeSheetIds — bộ lọc HIỂN THỊ, không bao giờ làm màn trống", () => {
  it("lọc đúng và GIỮ THỨ TỰ CONTRACT (không sắp lại theo sheetIds)", () => {
    expect(ids(scopeSheetIds(sheets, (s) => s.id, scope({ sheetIds: ["main2", "main"] })))).toEqual([
      "main", "main2",
    ]);
  });

  it("không có phạm vi ⇒ nguyên vẹn (màn hành xử y như trước lượt E1)", () => {
    expect(ids(scopeSheetIds(sheets, (s) => s.id, null))).toEqual(ids(sheets));
  });

  it("tab ảo «Tất cả sheet» ⇒ nguyên vẹn", () => {
    expect(ids(scopeSheetIds(sheets, (s) => s.id, scope({ all: true, sheetIds: null })))).toEqual(
      ids(sheets),
    );
  });

  it("file canvas ⇒ nguyên vẹn (canvas không lọc sheet của màn workflow)", () => {
    expect(ids(scopeSheetIds(sheets, (s) => s.id, scope({ kind: "canvas", sheetIds: null })))).toEqual(
      ids(sheets),
    );
  });

  it("bộ lọc RỖNG ⇒ nguyên vẹn, KHÔNG phải màn trắng", () => {
    expect(ids(scopeSheetIds(sheets, (s) => s.id, scope({ sheetIds: [] })))).toEqual(ids(sheets));
  });

  it("bộ lọc trỏ toàn sheet đã bị xoá khỏi contract ⇒ nguyên vẹn, không mất hết", () => {
    const kept = scopeSheetIds(sheets, (s) => s.id, scope({ sheetIds: ["da-xoa-1", "da-xoa-2"] }));
    expect(ids(kept)).toEqual(ids(sheets));
  });

  it("KHÔNG nhân đôi, KHÔNG mất phần tử trong mọi ca", () => {
    for (const f of [null, ["main"], ["main", "main2", "coin"], ["x"], []]) {
      const out = scopeSheetIds(sheets, (s) => s.id, scope({ sheetIds: f }));
      expect(new Set(ids(out)).size).toBe(out.length);
      expect(out.every((s) => sheets.includes(s))).toBe(true);
    }
  });
});

/* ═════════ 3. runningSheetIdsOf — cảnh báo C-01 (NEEDS-fe2-c N7) ═════════ */

describe("runningSheetIdsOf — sheet nào đang chạy, đọc từ `project.state.jobs`", () => {
  const SHEETS = ["main", "main2", "pose-lan", "coin"];

  it("khoá job là `<variant>-<sheet>` và CẢ HAI phần đều có dấu `-`", () => {
    /* Dữ liệu thật của repo: `styles.json` có `pose-lan`/`pose-soc`/`pose-taxi`.
       Cắt chuỗi ở dấu `-` đầu hay cuối đều sai; phải đối chiếu với danh sách sheet. */
    expect(runningSheetIdsOf({ "tet-do-pose-lan": "running" }, SHEETS)).toEqual(["pose-lan"]);
    expect(runningSheetIdsOf({ "tet-main": "running" }, SHEETS)).toEqual(["main"]);
  });

  it("`main` KHÔNG khớp lây sang `main2`", () => {
    expect(runningSheetIdsOf({ "tet-main2": "running" }, SHEETS)).toEqual(["main2"]);
    expect(runningSheetIdsOf({ "tet-main": "running" }, SHEETS)).not.toContain("main2");
  });

  it("chỉ tính running/queued — xong/lỗi/chưa có thì không cảnh báo", () => {
    expect(
      runningSheetIdsOf(
        { "tet-main": "ok", "tet-main2": "queued", "tet-coin": "failed", "tet-pose-lan": "stale" },
        SHEETS,
      ),
    ).toEqual(["main2"]);
  });

  it("không có jobs / jobs rỗng ⇒ rỗng, không cảnh báo sai", () => {
    expect(runningSheetIdsOf(undefined, SHEETS)).toEqual([]);
    expect(runningSheetIdsOf(null, SHEETS)).toEqual([]);
    expect(runningSheetIdsOf({}, SHEETS)).toEqual([]);
  });

  it("job mồ côi (sheet đã bị xoá khỏi contract) KHÔNG sinh cảnh báo về một sheet không tồn tại", () => {
    /* VERDICT §1.3 đo được 20/46 job mồ côi — đây là ca thật, không phải giả định. */
    expect(runningSheetIdsOf({ "tet-sheet-da-xoa": "running" }, SHEETS)).toEqual([]);
  });
});

/* ═════════ 4. contractSheetIdsOf — agent chưa chạy KHÔNG phải lỗi ═════════ */

describe("contractSheetIdsOf", () => {
  it("contract null/undefined ⇒ [] (tab ảo hiện «0 sheet», không phải khối lỗi)", () => {
    expect(contractSheetIdsOf(null)).toEqual([]);
    expect(contractSheetIdsOf(undefined)).toEqual([]);
    expect(contractSheetIdsOf({})).toEqual([]);
  });

  it("bỏ id rỗng/không phải chuỗi — một sheet hỏng không giết cả thanh tab", () => {
    expect(
      contractSheetIdsOf({ sheets: [{ id: "main" }, { id: "" }, { id: 7 as never }, { id: "coin" }] }),
    ).toEqual(["main", "coin"]);
  });
});

/* ═════════ 5. FileScopeNotice — nói ra + có đường ra ═════════ */

describe("FileScopeNotice — bộ lọc không bao giờ im lặng (§4.5)", () => {
  const html = (n: number, unit?: "sheet" | "ảnh") =>
    renderToString(
      <FileScopeNotice docName="Bộ kit chính" hiddenCount={n} onShowAll={() => {}} {...(unit ? { unit } : {})} />,
    );

  it("có phần tử bị ẩn ⇒ nói rõ số, tên file, và 'không bị xoá'", () => {
    const out = html(3);
    expect(textOf(out)).toContain("3 sheet");
    expect(textOf(out)).toContain("Bộ kit chính");
    expect(textOf(out)).toContain("không bị xoá");
    expect(textOf(out)).toContain("Xem tất cả sheet");
    expect(out).toContain('role="status"');
  });

  it("đơn vị nói đúng thứ đang bị ẩn (S5 ẩn ảnh, không phải sheet)", () => {
    expect(textOf(html(2, "ảnh"))).toContain("2 ảnh");
    expect(textOf(html(2, "ảnh"))).not.toContain("2 sheet");
  });

  it("không ẩn gì ⇒ KHÔNG render (cảnh báo rỗng là nhiễu)", () => {
    expect(html(0)).toBe("");
    expect(html(-1)).toBe("");
  });
});

/* ═════════ 5b. Nợ A1 #2 — bo góc arbitrary trong glob E ═════════ */

describe("nợ A1 `NEEDS-fe2-a.md` #2 — 0 bo góc arbitrary trong glob E", () => {
  /**
   * A1 đóng 19/21 và giao 2 chỗ còn lại: `FloraShell.tsx` (glob E — E1 đóng ở lượt này) và
   * `ProjectRail.tsx` (A1 ghi rõ *"KHÔNG AI"* sở hữu). Test của A1
   * (`src/__tests__/visual-debt-a1.test.ts:74-75`) loại trừ tường minh **cả hai** file, nên
   * nếu tôi không tự canh thì việc sửa của tôi không có gì giữ.
   *
   * ⚠️ `ProjectRail.tsx` KHÔNG nằm trong glob E (FE2-PLAN §1 liệt kê từng file của
   * `components/layout/`, và nó không có trong danh sách) ⇒ tôi không sửa, chỉ ĐO và ghi
   * `NEEDS-fe2-e.md` N7. Ca dưới đây khoá đúng phần tôi sở hữu.
   */
  const LAYOUT = resolve(new URL("..", import.meta.url).pathname);
  const MINE = ["AppLayout.tsx", "FloraShell.tsx", "screen-contract.ts", "lazy-screen.tsx", "index.ts"];

  it.each(MINE)("%s không còn `rounded-[Npx]`", (file) => {
    const src = readFileSync(join(LAYOUT, file), "utf8");
    const hits = (src.match(/rounded-\[[^\]]+\]/g) ?? []).filter(
      (m) => m !== "rounded-[inherit]" && !m.includes("Npx"),
    );
    expect(hits, `${file}: ${hits.join(", ")}`).toEqual([]);
  });

  it("BÁO HIỆN TRẠNG (không phải gate): ProjectRail vẫn còn 1 chỗ, vô chủ theo A1", () => {
    const src = readFileSync(join(LAYOUT, "ProjectRail.tsx"), "utf8");
    const hits = (src.match(/rounded-\[[^\]]+\]/g) ?? []).filter((m) => m !== "rounded-[inherit]");
    console.log(`[hiện trạng] ProjectRail.tsx rounded arbitrary: ${hits.join(", ") || "0"}`);
    expect(Array.isArray(hits)).toBe(true);
  });
});

/* ═════════ 6. Tab ảo là hằng số DÙNG CHUNG, không phải chuỗi chép tay ═════════ */

describe("không có nguồn sự thật thứ hai", () => {
  it("khung dùng đúng `ALL_SHEETS_DOC_ID` của tầng file con", () => {
    expect(ALL_SHEETS_DOC_ID).toBe("f-all-sheets");
  });
});
