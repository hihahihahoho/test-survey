import { expect, test, type Page, type Route } from "@playwright/test";

const project = {
  id: "tet26-a7f3",
  name: "Tết 2026",
  slug: "tet26",
  tags: ["kg-workflow"],
  updatedAt: "2026-08-11T08:00:00.000Z",
  stats: { rawPresent: 1, kitsCut: 0 },
  state: { jobs: {} },
  workflow: { completed: true, updatedAt: "2026-08-11T08:00:00.000Z" },
};

const createdProject = {
  ...project,
  id: "du-an-moi-b4c8",
  name: "Dự án mới",
  slug: "du-an-moi",
  tags: ["kg-workflow"],
  stats: { rawPresent: 0, kitsCut: 0 },
  workflow: { completed: false, updatedAt: "2026-08-11T08:00:00.000Z" },
};

const blankContract = {
  schemaVersion: 4,
  characterPoses: [],
  variants: [],
  sheets: [],
};

let generatedRunItems: Array<Record<string, unknown>> = [];
let cancelledRuns: string[] = [];

/**
 * #42 `GET …/kit` — DẠNG THẬT của agent, kể cả các khoá `null`.
 * Hai điều ca test khoá lại: (a) `sheet: null` / `w: null` không được làm chết cả
 * danh mục (schema từng khai `.optional()`, zod không nhận null); (b) mỗi ô có bản
 * `tight/` nên lưới phải khử trùng, không hiện ô hai lần.
 */
const kitCatalogue = {
  variant: "tet",
  cutAt: "2026-08-12T08:02:00.000Z",
  sheets: {},
  files: [
    { file: "01-pose-idle", path: "kits/tet/01-pose-idle.png", w: null, h: null, bytes: 120, sheet: "pose-nhan-vat", cellIndex: null, empty: false },
    { file: "tight/01-pose-idle", path: "kits/tet/tight/01-pose-idle.png", w: 240, h: 320, bytes: 90, sheet: "pose-nhan-vat", cellIndex: null, empty: false },
    { file: "02-pose-wave", path: "kits/tet/02-pose-wave.png", w: null, h: null, bytes: 120, sheet: null, cellIndex: null, empty: false },
    { file: "tight/02-pose-wave", path: "kits/tet/tight/02-pose-wave.png", w: 230, h: 310, bytes: 88, sheet: null, cellIndex: null, empty: false },
    { file: "_empty-1", path: "kits/tet/_empty-1.png", w: null, h: null, bytes: 0, sheet: null, cellIndex: null, empty: true },
  ],
};

const health = {
  ok: true,
  app: "kitgen-agent",
  protocol: 1,
  version: "1.2.0",
  workspaceLabel: "~/KitGen",
  workspaceFingerprint: "sha256:e2e",
  projects: 1,
  activeRuns: 0,
};

/* `characterPoses` KHÔNG rỗng là chủ ý: sau khi nhận bản thiết kế cũ, contract dựng lại
   phải còn tấm dáng `pose-nhan-vat` — đó là tấm mà ca "tạo lại đúng một sheet" bấm vào. */
const contract = {
  schemaVersion: 4,
  characterPoses: ["idle"],
  variants: [{
    id: "tet",
    vi: "Tết hiện đại",
    style: "Tươi vui, hình khối mềm, màu đỏ ấm",
    bg: "pure vivid magenta #FF00FF",
    brand: { mode: "colors", primary: "#D93333", secondary: "#F6C453" },
    characters: [{ id: "nhan-vat", vi: "Nhân vật", ref: null, poses: ["idle"] }],
  }],
  sheets: [{
    id: "main-ui",
    grid: { cols: 2, rows: 2 },
    orient: "landscape",
    components: [
      { file: "01-button", vi: "Nút chính", spec: "", skel: { shape: "pill", w: 0.8, h: 0.35 } },
      { file: "02-card", vi: "Thẻ nội dung", spec: "", skel: { shape: "rrect", w: 0.8, h: 0.65 } },
      { file: "03-badge", vi: "Nhãn trạng thái", spec: "", skel: { shape: "pill", w: 0.55, h: 0.25 } },
      { file: "04-icon", vi: "Biểu tượng", spec: "", skel: { shape: "circle", w: 0.45, h: 0.45 } },
    ],
  }],
};

async function mockAgent(page: Page) {
  let currentContract = contract;
  let contractVersion = 1;
  const createdRefs: Array<{ name: string; path: string; bytes: number; mtime: string; usedBy: [] }> = [];
  const libraryItem = {
    id: "asset_0123456789abcdef",
    kind: "mascot" as const,
    group: "mascot" as const,
    name: "Mèo mẫu",
    filename: "mascot.png",
    poses: ["idle", "cheer"],
    tags: ["VCB"],
  };
  const uiLibraryItem = {
    id: "asset_fedcba9876543210",
    kind: "ui" as const,
    group: "small" as const,
    name: "Nút thưởng của tôi",
    description: "Nút nhận quà có vùng nội dung sạch",
    filename: "reward-button.png",
    poses: [],
    tags: [],
    cell: "landscape" as const,
    skel: { shape: "pill" as const, w: 0.78, h: 0.5, slice9: true },
  };
  const styleReferenceItem = {
    id: "asset_1111222233334444",
    kind: "reference" as const,
    group: "style" as const,
    name: "Phong cách lễ hội",
    filename: "style-reference.png",
    poses: [],
    tags: [],
  };
  const poseTemplates = ["idle", "wave"].map((sourcePose, index) => ({
    id: `pose_${sourcePose}`, name: index ? "Vẫy chào" : "Đứng thẳng",
    description: "Khung prototype", sourcePose, enabled: true, builtIn: true,
  }));
  await page.route("**/health", async (route: Route) => route.fulfill({ json: health }));
  await page.route("**/api/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    // Vite serves modules from `/src/lib/api/**`; only intercept the agent API,
    // otherwise the app bootstraps from JSON instead of its source module.
    if (path.startsWith("/src/")) return route.continue();
    if (path === "/api/projects" && method === "POST") return route.fulfill({ status: 201, json: { project: createdProject, warnings: [] } });
    if (path === "/api/projects") return route.fulfill({ json: { scannedAt: "2026-08-11T08:00:00.000Z", workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:e2e", items: [project] } });
    if (path === "/api/projects/tet26-a7f3" && method === "PATCH") {
      const patch = route.request().postDataJSON() as Partial<typeof project>;
      Object.assign(project, patch);
      return route.fulfill({ json: { project } });
    }
    if (path === "/api/projects/tet26-a7f3") return route.fulfill({ json: { project } });
    if (path === "/api/projects/du-an-moi-b4c8") return route.fulfill({ json: { project: createdProject } });
    if (path.endsWith("/workflow-draft") && method === "PUT") return route.fulfill({ json: { ...route.request().postDataJSON(), updatedAt: "2026-08-12T08:00:00.000Z" } });
    if (path === "/api/projects/tet26-a7f3/workflow-draft") return route.fulfill({ json: { completed: true, draft: null, updatedAt: null } });
    if (path === "/api/projects/du-an-moi-b4c8/workflow-draft") return route.fulfill({ json: { completed: false, draft: null, updatedAt: null } });
    if (path === "/api/projects/tet26-a7f3/contract" && method === "PUT") {
      currentContract = (route.request().postDataJSON() as { contract: typeof contract }).contract;
      contractVersion += 1;
      return route.fulfill({ json: { version: contractVersion, hash: `e2e-${contractVersion}` } });
    }
    if (path === "/api/projects/tet26-a7f3/contract") return route.fulfill({ json: { version: contractVersion, contract: currentContract } });
    if (path === "/api/projects/du-an-moi-b4c8/contract" && method === "PUT") return route.fulfill({ json: { version: 2, hash: "e2e-created" } });
    if (path === "/api/projects/du-an-moi-b4c8/contract") return route.fulfill({ json: { version: 1, contract: blankContract } });
    if (path === "/api/projects/tet26-a7f3/runs" && method === "POST") {
      return route.fulfill({ status: 201, json: { runId: "run-regenerate-1", jobs: [{ job: "tet-main-ui", status: "queued" }] } });
    }
    if (path === "/api/projects/tet26-a7f3/runs") return route.fulfill({ json: { items: generatedRunItems } });
    if (path.startsWith("/api/runs/") && path.endsWith("/cancel")) {
      cancelledRuns.push(path.split("/")[3]!);
      return route.fulfill({ json: { runId: path.split("/")[3], cancelled: true, killed: [], kept: 0 } });
    }
    if (path.startsWith("/api/runs/") && path.endsWith("/stream")) return route.fulfill({ body: "" });
    if (path.startsWith("/api/runs/")) return route.fulfill({ json: generatedRunItems[0] ?? {} });
    /* #42 — danh mục ô ĐÃ CẮT. Hình dạng đúng như agent thật trả: `sheet` có thể null,
       `w/h` null, và mỗi ô có thêm một bản `tight/` (slice.py ghi cả hai). */
    if (path === "/api/projects/tet26-a7f3/kit") return route.fulfill({ json: kitCatalogue });
    if (path.startsWith("/api/projects/tet26-a7f3/files/runs/")
      || path.startsWith("/api/projects/tet26-a7f3/files/kits/")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    }
    if (path === "/api/trash") return route.fulfill({ json: { items: [] } });
    if (path === `/api/library/items/${libraryItem.id}/file`
      || path === `/api/library/items/${uiLibraryItem.id}/file`
      || path === `/api/library/items/${styleReferenceItem.id}/file`) {
      return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64") });
    }
    if (path === `/api/library/items/${libraryItem.id}` && method === "PATCH") {
      Object.assign(libraryItem, route.request().postDataJSON());
      return route.fulfill({ json: { item: libraryItem } });
    }
    if (path === `/api/library/items/${libraryItem.id}` && method === "DELETE") {
      return route.fulfill({ status: 204 });
    }
    if (path === "/api/library/settings" && method === "PATCH") {
      return route.fulfill({ json: { settings: { background: 2, popup: 4, small: 16, props: 16, mascot: 4, ...route.request().postDataJSON() } } });
    }
    if (path === "/api/library") return route.fulfill({ json: { version: 3, settings: { background: 2, popup: 4, small: 16, props: 16, mascot: 4 }, poseTemplates, items: [libraryItem, uiLibraryItem, styleReferenceItem] } });
    if (path === "/api/projects/tet26-a7f3/refs" && method === "POST") return route.fulfill({ json: { name: "char-meo-mau.png", path: "refs/char-meo-mau.png" } });
    if (path === "/api/projects/du-an-moi-b4c8/refs" && method === "POST") {
      const item = {
        name: "inspo-phong-cach-le-hoi.png",
        path: "refs/inspo-phong-cach-le-hoi.png",
        bytes: 68,
        mtime: "2026-08-11T08:00:00.000Z",
        usedBy: [] as [],
      };
      createdRefs.splice(0, createdRefs.length, item);
      return route.fulfill({ json: item });
    }
    if (path === "/api/projects/du-an-moi-b4c8/refs") return route.fulfill({ json: { items: createdRefs } });
    if (path === "/api/workspaces") return route.fulfill({ json: { items: [{ id: "ws_e2e", label: "~/KitGen" }], activeId: "ws_e2e" } });
    if (path === "/api/system/update") return route.fulfill({ json: { currentVersion: "1.2.0", latestVersion: "1.2.0", available: false } });
    if (path === "/api/doctor") return route.fulfill({ json: { codex: { ok: true }, imageGen: { available: true, mode: "default" } } });
    return route.fulfill({ json: {} });
  });
}

test.beforeEach(async ({ page }) => {
  generatedRunItems = [];
  await mockAgent(page);
});

test("@visual home uses the project sidebar instead of a horizontal header", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dự án", exact: true })).toBeVisible();

  await expect(page.locator("header.sticky")).toHaveCount(0);
  const projectSearch = page.getByRole("searchbox", { name: "Tìm dự án" });
  await expect(projectSearch).toBeVisible();
  await expect(projectSearch.locator("xpath=ancestor::aside")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bộ khung UI" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mascot" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cài đặt" })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("home-dark.png"), fullPage: true, animations: "disabled" });
});

test("@visual an internal page keeps only Back home and runtime status", async ({ page }, testInfo) => {
  await page.goto("/p/tet26-a7f3");

  const header = page.locator("header.sticky");
  await expect(header).toHaveCount(1);
  await expect(header.getByRole("button", { name: "Dự án" })).toBeVisible();
  await expect(header.getByRole("button", { name: /Trạng thái:/ })).toBeVisible();
  await expect(header.getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("searchbox", { name: "Tìm dự án" })).toHaveCount(0);
  // Sidebar dự án nay có ĐÚNG bốn đích; sáu nhóm ảnh cũ xuống làm hàng chip trong trang.
  const sidebar = page.getByRole("navigation", { name: "Quản lý dự án" });
  await expect(sidebar).toBeVisible();
  await expect(sidebar.getByRole("button")).toHaveCount(4);
  for (const name of ["Ảnh đã tạo", "Skeleton UI", "Mascot", "Cài đặt"]) {
    await expect(sidebar.getByRole("button", { name, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("button", { name: "Tất cả thành phẩm" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tất cả thành phẩm", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Ảnh thật" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Skeleton" })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("project-internal-dark.png"), fullPage: true, animations: "disabled" });
});

test("an imported project can be converted, edited and given project sheet limits", async ({ page }) => {
  await page.goto("/p/tet26-a7f3");
  await expect(page.getByText("Dự án này được tạo bằng phiên bản cũ.")).toBeVisible();
  await page.getByRole("button", { name: "Chỉnh sửa dự án" }).click();
  await expect(page.getByRole("alertdialog", { name: "Chuyển sang trình quản lý mới?" })).toBeVisible();
  const saved = page.waitForResponse((response) => response.url().includes("/api/projects/tet26-a7f3/contract")
    && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Chuyển và chỉnh sửa" }).click();
  await expect(page.getByText("Dự án này được tạo bằng phiên bản cũ.")).toHaveCount(0);
  await saved;

  // "Bộ khung UI" đã rời dialog Cài đặt và thành TRANG "Skeleton UI" trong sidebar.
  await page.getByRole("navigation", { name: "Quản lý dự án" }).getByRole("button", { name: "Skeleton UI" }).click();
  await expect(page).toHaveURL(/section=skeleton/);
  await page.getByRole("button", { name: /^UI nhỏ(?: · \d+)?$/ }).click();
  const customFrame = page.getByRole("button", { name: /Nút thưởng của tôi/ });
  await expect(customFrame).toBeVisible();
  await customFrame.click();
  await expect(customFrame).toHaveAttribute("aria-pressed", "true");

  // Sửa ở đây là BUFFER: chưa bấm Lưu thì chưa có PUT contract nào (mục ④).
  await expect(page.getByRole("button", { name: "Lưu", exact: true }).first()).toBeEnabled();

  const dialog = page.getByRole("dialog", { name: "Cài đặt" });
  await page.getByRole("navigation", { name: "Quản lý dự án" }).getByRole("button", { name: "Cài đặt" }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Dự án", exact: true }).click();
  const backgroundLimit = page.getByRole("spinbutton", { name: "Nền" });
  await expect(backgroundLimit).toHaveAttribute("placeholder", "2");
  await backgroundLimit.fill("1");
  await expect(backgroundLimit).toHaveValue("1");

  const savedLimit = page.waitForResponse((response) => response.url().includes("/api/projects/tet26-a7f3/contract")
    && response.request().method() === "PUT");
  await dialog.getByRole("button", { name: "Lưu cài đặt" }).click();
  await savedLimit;

  await page.getByRole("button", { name: "Đóng" }).click();
  await page.getByRole("navigation", { name: "Quản lý dự án" }).getByRole("button", { name: "Ảnh đã tạo" }).click();
  await expect(page.getByText("Chưa có ảnh nào")).toBeVisible();
});

/**
 * MỤC ④ — SỬA LÀ BUFFER, LƯU MỚI LÀ LƯU.
 *
 * Hợp đồng: chạm vào một ô trong "Skeleton UI" KHÔNG được ghi contract xuống đĩa; chỉ
 * nút [Lưu] mới ghi. Và [Huỷ] phải trả bản nháp về đúng trạng thái đã lưu.
 */
test("editing the project buffers changes until Lưu is pressed", async ({ page }) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "PUT" && request.url().includes("/api/projects/tet26-a7f3/contract")) writes.push(request.url());
  });

  // Dự án mock mang bản thiết kế của bản cũ ⇒ phải nhận nó trước, nếu không cả trang
  // ở chế độ chỉ-đọc và không có gì để sửa.
  await page.goto("/p/tet26-a7f3");
  await page.getByRole("button", { name: "Chỉnh sửa dự án" }).click();
  const adopted = page.waitForResponse((response) => response.url().includes("/api/projects/tet26-a7f3/contract")
    && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Chuyển và chỉnh sửa" }).click();
  await adopted;

  await page.getByRole("navigation", { name: "Quản lý dự án" }).getByRole("button", { name: "Skeleton UI" }).click();
  await page.getByRole("button", { name: /^UI nhỏ(?: · \d+)?$/ }).click();
  const frame = page.getByRole("button", { name: /Nút thưởng của tôi/ });
  await expect(frame).toBeVisible();
  writes.length = 0;
  const before = await frame.getAttribute("aria-pressed");
  await frame.click();
  await expect(frame).not.toHaveAttribute("aria-pressed", before ?? "");
  await expect(page.getByText("Có thay đổi chưa lưu", { exact: false }).first()).toBeVisible();
  // Nhịp autosave cũ là 700ms — chờ quá mốc đó rồi mới khẳng định "không ghi gì".
  await page.waitForTimeout(1200);
  expect(writes).toHaveLength(0);

  // [Huỷ] trả về đúng bản đã lưu, và hàng nút tắt trở lại.
  await page.getByRole("button", { name: "Huỷ", exact: true }).first().click();
  await expect(frame).toHaveAttribute("aria-pressed", before ?? "");
  await expect(page.getByText("Không có thay đổi nào chưa lưu").first()).toBeVisible();
  expect(writes).toHaveLength(0);

  await frame.click();
  // Rời mục sidebar khi còn thay đổi chưa lưu ⇒ PHẢI hỏi lại, và có cả hai đường ra.
  await page.getByRole("navigation", { name: "Quản lý dự án" }).getByRole("button", { name: "Mascot" }).click();
  const guard = page.getByRole("alertdialog", { name: "Còn thay đổi chưa lưu" });
  await expect(guard).toBeVisible();
  await expect(guard.getByRole("button", { name: "Bỏ thay đổi" })).toBeVisible();
  await guard.getByRole("button", { name: "Ở lại" }).click();
  await expect(page).toHaveURL(/section=skeleton/);
  expect(writes).toHaveLength(0);

  // [Lưu] — và CHỈ [Lưu] — mới ghi contract xuống đĩa.
  const saved = page.waitForResponse((response) => response.url().includes("/api/projects/tet26-a7f3/contract")
    && response.request().method() === "PUT");
  await page.getByRole("button", { name: "Lưu", exact: true }).first().click();
  await saved;
  expect(writes).toHaveLength(1);
});

/**
 * LỖI #5 — mở dialog Cài đặt KHÔNG được điều hướng màn nền về "tất cả thành phẩm".
 */
test("opening project settings keeps the background section untouched", async ({ page }) => {
  await page.goto("/p/tet26-a7f3?section=mascot");
  await expect(page.getByRole("heading", { name: "Mascot", exact: true, level: 1 })).toBeVisible();

  await page.locator("header.sticky").getByRole("button", { name: "Cài đặt" }).click();
  await expect(page.getByRole("dialog", { name: "Cài đặt" })).toBeVisible();
  await expect(page).toHaveURL(/section=mascot/);
  await expect(page).toHaveURL(/settings=requirements/);

  await page.getByRole("button", { name: "Đóng" }).click();
  await expect(page.getByRole("dialog", { name: "Cài đặt" })).toHaveCount(0);
  await expect(page).toHaveURL(/section=mascot/);
  await expect(page.getByRole("heading", { name: "Mascot", exact: true, level: 1 })).toBeVisible();
});

/**
 * LỖI #6 — hàng nút của dialog Cài đặt là FOOTER THẬT, không phải một thanh `sticky`
 * nằm trong vùng cuộn. Phát biểu ở dạng HÌNH DẠNG đo được: hàng nút phải nằm HOÀN TOÀN
 * dưới đáy vùng cuộn, tức là không có một pixel nào chồng lên nội dung.
 */
test("the settings dialog footer never covers its scrolling content", async ({ page }) => {
  await page.goto("/p/tet26-a7f3?settings=requirements");
  const dialog = page.getByRole("dialog", { name: "Cài đặt" });
  await expect(dialog).toBeVisible();

  const body = dialog.locator("[data-testid=dialog-body]");
  const bodyBox = await body.boundingBox();
  const footerBox = await dialog.getByRole("button", { name: "Lưu cài đặt" }).boundingBox();
  expect(bodyBox).not.toBeNull();
  expect(footerBox).not.toBeNull();
  expect(footerBox!.y).toBeGreaterThanOrEqual(bodyBox!.y + bodyBox!.height - 1);
});

/**
 * Dự án mock mang bản thiết kế của bản cũ ⇒ `ProjectScreen` để cả trang ở chế độ
 * CHỈ-ĐỌC cho tới khi người dùng nhận nó. Ca nào cần bấm nút ghi (tạo lại, dừng)
 * đều phải đi qua bước này trước, đúng như luồng thật.
 */
async function adoptImportedProject(page: Page) {
  const notice = page.getByText("Dự án này được tạo bằng phiên bản cũ.");
  await expect(notice).toBeVisible();
  await page.getByRole("button", { name: "Chỉnh sửa dự án" }).click();
  await expect(page.getByRole("alertdialog", { name: "Chuyển sang trình quản lý mới?" })).toBeVisible();
  await page.getByRole("button", { name: "Chuyển và chỉnh sửa" }).click();
  await expect(notice).toHaveCount(0);
}

test("generated images show immutable artifacts and retry only the selected sheet", async ({ page }) => {
  generatedRunItems = [{
    id: "run-generated-1", kind: "gen", status: "done-with-errors",
    startedAt: "2026-08-12T08:00:00.000Z", finishedAt: "2026-08-12T08:01:00.000Z",
    progress: { done: 1, total: 1, failed: 0, etaSeconds: null }, seq: 1,
    jobs: [{
      job: "chinh-pose-nhan-vat", variant: "chinh", sheet: "pose-nhan-vat", status: "ok",
      startedAt: "2026-08-12T08:00:00.000Z", durationMs: 60_000, recovered: false, diagnosis: null,
      artifact: {
        path: "runs/run-generated-1/artifacts/chinh-pose-nhan-vat.png",
        validation: { ok: false, cells: [{ file: "01-button", cell: 0, status: "regenerate", reasons: ["position"] }] },
      },
    }],
  }];

  // Bước ⑥ "Kết quả" đã bỏ: ảnh đã tạo nay chỉ có một nhà, là tab của màn quản lý dự án.
  await page.goto("/p/tet26-a7f3?section=images");
  await adoptImportedProject(page);
  await expect(page.getByRole("heading", { name: "Tất cả thành phẩm", exact: true })).toBeVisible();

  /* MẶC ĐỊNH là "Ảnh thật" = ô ĐÃ CẮT (§12: chroma/lưới bị hậu xử lý loại bỏ).
     Sheet thô nền chroma là chế độ xem PHỤ. */
  const modes = page.getByRole("tablist", { name: "Chế độ xem ảnh" });
  await expect(modes.getByRole("tab", { name: "Ảnh thật", selected: true })).toBeVisible();
  await expect(page.getByText("01-pose-idle", { exact: true })).toBeVisible();
  // ô có cả bản canvas lẫn bản tight ⇒ chỉ hiện MỘT lần
  await expect(page.getByText("02-pose-wave", { exact: true })).toHaveCount(1);
  // ô trống không phải thành phẩm
  await expect(page.getByText("_empty-1", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Thao tác khác cho 01-pose-idle" })).toBeVisible();

  await modes.getByRole("tab", { name: "Ảnh gốc" }).click();
  await expect(page.getByText("Mascot pose", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 ô lệch bộ khung · Cần tạo lại")).toBeVisible();
  await page.getByRole("button", { name: "Tạo lại Mascot pose" }).click();

  const dialog = page.getByRole("dialog", { name: "Sinh ảnh" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /pose-nhan-vat/, checked: true })).toHaveCount(1);
  await expect(dialog.getByText("Đã chọn 1 lượt", { exact: false })).toBeVisible();
});

/**
 * HỒI QUY BÁO TỪ BẢN CÀI THẬT: vừa bấm "Tạo ảnh", MỌI thẻ đã hiện icon đỏ
 * "Chưa tạo được ảnh" như thể hỏng hết, và không có đường nào để dừng.
 */
test("đang tạo ảnh: có tiến trình tổng, trạng thái từng sheet và nút Dừng", async ({ page }) => {
  cancelledRuns = [];
  generatedRunItems = [{
    id: "run-live-1", kind: "gen", status: "running",
    startedAt: "2026-08-12T08:00:00.000Z", finishedAt: null,
    progress: { done: 1, total: 3, failed: 0, etaSeconds: null }, seq: 4,
    jobs: [
      { job: "chinh-nen", variant: "chinh", sheet: "nen", status: "ok", startedAt: null, durationMs: null, recovered: false, diagnosis: null,
        artifact: { path: "runs/run-live-1/artifacts/chinh-nen.png" } },
      { job: "chinh-ui", variant: "chinh", sheet: "ui", status: "running", startedAt: null, durationMs: null, recovered: false, diagnosis: null, artifact: null },
      { job: "chinh-ui2", variant: "chinh", sheet: "ui2", status: "queued", startedAt: null, durationMs: null, recovered: false, diagnosis: null, artifact: null },
    ],
  }];

  await page.goto("/p/tet26-a7f3?section=images");
  await adoptImportedProject(page);
  const progress = page.getByRole("status", { name: "Tiến trình tạo ảnh" });
  await expect(progress).toBeVisible();
  await expect(progress.getByText("Đang tạo ảnh · 1/3 sheet xong")).toBeVisible();

  await page.getByRole("tablist", { name: "Chế độ xem ảnh" }).getByRole("tab", { name: "Ảnh gốc" }).click();
  // KHÔNG có "Chưa tạo được ảnh" cho sheet chưa tới lượt — đó là lời nói dối cũ.
  await expect(page.getByText("Đang tạo ảnh…")).toBeVisible();
  await expect(page.getByText("Đang chờ tới lượt")).toBeVisible();
  await expect(page.getByText("Chưa tạo được ảnh")).toHaveCount(0);

  // Nhóm phải khớp cấu hình wizard: `nen` là Nền, `ui2` là UI nhỏ — KHÔNG phải "Khác".
  await expect(page.getByRole("heading", { name: "Nền", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "UI nhỏ", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Khác", exact: true })).toHaveCount(0);
  await expect(page.getByText("UI nhỏ 2", { exact: true })).toBeVisible();

  await progress.getByRole("button", { name: "Dừng" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByText("Dừng lượt tạo ảnh?")).toBeVisible();
  await confirm.getByRole("button", { name: "Dừng tạo ảnh" }).click();
  await expect.poll(() => cancelledRuns).toContain("run-live-1");
});

/**
 * ⚠️ HỢP ĐỒNG ĐỔI Ở UI-FIX §3a/§3b — ghi rõ vì sao, không phải nới ca test cho xanh.
 *
 * Bước Mascot nay là **danh sách thẻ + modal** (cộng từng nhân vật một), và bộ dáng
 * dùng chung khuôn `.compact-element` của bước "Bộ khung UI" thay vì ô vuông
 * `.pose-choice-grid` + `.pose-prototype` riêng. Nên nút "Chọn mascot có sẵn" ĐỔI CHỖ
 * (vào trong modal), KHÔNG mất.
 *
 * Ba điều ca test này khoá thì KHÔNG đổi một chữ:
 *   ① mascot lấy từ thư viện mang đúng **tên** của nó;
 *   ② nó mang theo đúng **bộ dáng đã lưu** (Mèo mẫu = 2 dáng), chứ không rơi về
 *      mặc định (nay là 12 dáng cơ bản + thông dụng, không còn chọn hết 19) — đây là
 *      chỗ đã hồi quy một lần, nên phải có cổng canh;
 *   ③ thẻ dáng **đọc được**: hình xem trước và chữ đều đủ to, không bị bóp.
 */
test("@visual a reusable mascot can be selected and pose cards stay readable", async ({ page }, testInfo) => {
  await page.goto("/k/tet26-a7f3");
  await page.getByRole("button", { name: "Tiếp theo" }).click();
  await page.getByRole("button", { name: "Tiếp theo" }).click();
  await page.getByRole("button", { name: "Tiếp theo" }).click();

  // `exact` là bắt buộc: ô rỗng "Chưa có nhân vật nào — bấm để thêm nhân vật đầu tiên."
  // cũng là một <button> và chứa cụm "thêm nhân vật".
  await page.getByRole("button", { name: "Thêm nhân vật", exact: true }).click();
  // Đặt tên rõ: popover "Chọn mascot có sẵn" của Radix cũng mang `role="dialog"`.
  const dialog = page.getByRole("dialog", { name: "Thêm nhân vật" });
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "Chọn mascot có sẵn" }).click();
  await page.getByRole("button", { name: /Mèo mẫu/ }).click();

  // ① tên đi theo con vừa chọn.
  await expect(dialog.getByRole("textbox", { name: "Tên nhân vật" })).toHaveValue("Mèo mẫu");
  // Ảnh của nó cũng đi lên đĩa dự án và được gắn cho riêng nhân vật này.
  await expect(dialog.getByText("char-meo-mau.png")).toBeVisible();
  await dialog.getByRole("button", { name: "Thêm nhân vật", exact: true }).click();
  await expect(dialog).toBeHidden();

  // Con vừa thêm thành MỘT THẺ trong danh sách, có đường sửa và đường xoá.
  await expect(page.getByRole("button", { name: "Sửa Mèo mẫu" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Xoá Mèo mẫu" })).toBeVisible();

  // ② bộ dáng đã lưu của nó THẮNG mặc định (12 dáng) — mẫu số 19 là cỡ DANH MỤC, không đổi.
  await expect(page.getByText("2/19 dáng đã chọn")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Cơ bản · 1$/ })).toBeVisible();

  // ③ thẻ dáng đọc được — và đang bật, đúng bộ dáng của Mèo mẫu (idle + cheer).
  const poseCard = page.locator(".compact-element-grid button.compact-element").filter({ hasText: "Đứng chờ" });
  await expect(poseCard).toHaveAttribute("aria-pressed", "true");
  const cardBox = await poseCard.boundingBox();
  const artBox = await poseCard.locator(".compact-element-art").boundingBox();
  const poseSvgBox = await poseCard.locator(".compact-element-art svg").boundingBox();
  expect(cardBox).not.toBeNull();
  expect(artBox).not.toBeNull();
  expect(poseSvgBox).not.toBeNull();
  // Thẻ đủ cao để hai dòng chữ không chồng nhau, hình xem trước không bị bóp về 0.
  expect(cardBox!.height).toBeGreaterThanOrEqual(96);
  expect(artBox!.width).toBeGreaterThanOrEqual(56);
  expect(poseSvgBox!.width).toBeGreaterThanOrEqual(32);
  expect(poseSvgBox!.height).toBeGreaterThanOrEqual(40);
  // Nhãn dáng phải hiện NGUYÊN chữ, không bị cắt cụt (`truncate` chỉ cắt khi hết chỗ).
  const label = poseCard.locator("strong");
  await expect(label).toHaveText("Đứng chờ");
  const labelBox = await label.boundingBox();
  expect(labelBox!.width).toBeGreaterThan(40);

  await page.screenshot({ path: testInfo.outputPath("mascot-pose-dark.png"), fullPage: true, animations: "disabled" });
});

/**
 * HỢP ĐỒNG GIỮ NGUYÊN, ĐỔI HÌNH DẠNG URL: "UI nhỏ" và "Đạo cụ" vẫn là hai đích riêng
 * deep-link được, nhưng nay là hai NHÓM của trang "Ảnh đã tạo" (`?group=`) chứ không
 * còn là hai mục sidebar — sidebar chỉ còn bốn đích. Link cũ `?section=props` vẫn mở
 * đúng nhóm Đạo cụ (xem `resolveProjectView`).
 */
test("project management keeps UI nhỏ and Đạo cụ as separate destinations", async ({ page }) => {
  await page.goto("/p/tet26-a7f3");
  await page.getByRole("button", { name: "Đạo cụ", exact: true }).click();
  await expect(page).toHaveURL(/group=props/);
  await expect(page.getByRole("heading", { name: "Đạo cụ", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "UI nhỏ", exact: true }).click();
  await expect(page).toHaveURL(/group=ui/);
  await expect(page.getByRole("heading", { name: "UI nhỏ", exact: true })).toBeVisible();

  await page.goto("/p/tet26-a7f3?section=props");
  await expect(page.getByRole("heading", { name: "Đạo cụ", exact: true })).toBeVisible();
});

test("@visual a new project opens the step-by-step wizard", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tạo dự án" }).click();
  await page.getByRole("textbox", { name: "Tên dự án" }).fill("Dự án mới");
  await page.getByRole("button", { name: "Tiếp tục" }).click();

  await expect(page).toHaveURL(/\/k\/du-an-moi-b4c8$/);
  await expect(page.getByRole("heading", { name: "Tạo dự án" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Các bước tạo dự án" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Yêu cầu", exact: true })).toBeVisible();
  await expect(page.getByText("Dữ liệu đã nhập")).toHaveCount(0);

  await page.screenshot({ path: testInfo.outputPath("project-wizard-dark.png"), fullPage: true, animations: "disabled" });
});

test("a shared style reference can be selected from the wizard", async ({ page }) => {
  await page.goto("/k/du-an-moi-b4c8");
  await page.getByRole("button", { name: "Tiếp theo" }).click();
  await page.getByRole("button", { name: "Chọn từ thư viện" }).click();
  await page.getByRole("button", { name: /Phong cách lễ hội/ }).click();
  await expect(page.getByRole("button", { name: "Xoá ảnh inspo-phong-cach-le-hoi.png" })).toBeVisible();
});

test("creating from Home starts a blank wizard without imported-data badges", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tạo dự án" }).click();
  await page.getByRole("textbox", { name: "Tên dự án" }).fill("Dự án mới");
  await page.getByRole("button", { name: "Tiếp tục" }).click();

  await expect(page).toHaveURL(/\/k\/du-an-moi-b4c8$/);
  await expect(page.getByRole("heading", { name: "Tạo dự án" })).toBeVisible();
  await expect(page.getByText("Dữ liệu đã nhập")).toHaveCount(0);
  await expect(page.getByText("Bản nháp", { exact: true })).toHaveCount(0);
});

test("@visual opening settings does not change the viewport width", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dự án", exact: true })).toBeVisible();
  const widthBefore = await page.evaluate(() => document.documentElement.clientWidth);

  await page.getByRole("button", { name: "Cài đặt" }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(page.getByRole("heading", { name: "Cài đặt", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Cài đặt" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.clientWidth)).toBe(widthBefore);

  await page.screenshot({ path: testInfo.outputPath("settings-dark.png"), fullPage: true, animations: "disabled" });
});

test("@visual light settings keeps selected and interactive surfaces distinct", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("kitgen.ui.v1", JSON.stringify({ state: { theme: "light" }, version: 1 }));
  });
  await page.goto("/settings?tab=prefs");
  await expect(page.getByRole("heading", { name: "Cài đặt", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Cài đặt" })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/light/);

  const activeSwitch = page.getByRole("switch", { name: "Tự tách ảnh sau khi tạo" });
  const colors = await activeSwitch.evaluate((control) => {
    const thumb = control.querySelector("span");
    if (!thumb) throw new Error("Switch thumb is missing");
    return {
      track: getComputedStyle(control).backgroundColor,
      thumb: getComputedStyle(thumb).backgroundColor,
    };
  });
  expect(colors.thumb).not.toBe("rgb(0, 0, 0)");
  expect(colors.thumb).not.toBe(colors.track);

  await expect(page.getByRole("radio", { name: "Sáng" })).toHaveAttribute("data-state", "on");
  await page.screenshot({ path: testInfo.outputPath("settings-light.png"), fullPage: true, animations: "disabled" });
});

test("@visual mobile Home keeps project search when the sidebar collapses", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto("/");

  await expect(page.getByRole("searchbox", { name: "Tìm dự án" })).toBeVisible();
  await expect(page.locator("aside")).toBeHidden();
  await page.screenshot({ path: testInfo.outputPath("home-mobile-dark.png"), fullPage: true, animations: "disabled" });
});

test("@visual trash and shared libraries are separate Home destinations", async ({ page }, testInfo) => {
  await page.goto("/trash");
  await expect(page.getByRole("heading", { name: "Thùng rác", exact: true })).toBeVisible();
  await expect(page).not.toHaveURL(/settings/);

  await page.getByRole("button", { name: "Bộ khung UI" }).click();
  await expect(page).toHaveURL(/\/library\/ui/);
  await expect(page.getByRole("heading", { name: "Bộ khung UI", exact: true })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Nền" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Popup" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "UI nhỏ" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Đạo cụ" })).toBeVisible();
  await page.getByRole("button", { name: "Thêm bộ khung" }).click();
  await expect(page.getByRole("dialog", { name: "Thêm nền" })).toBeVisible();
  await page.getByRole("button", { name: "Huỷ" }).click();

  await page.screenshot({ path: testInfo.outputPath("ui-library-dark.png"), fullPage: true, animations: "disabled" });
});

test("the mascot library manages named mascots, tags and prototype poses", async ({ page }) => {
  await page.goto("/library/mascot");
  await expect(page.getByRole("heading", { name: "Mascot" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Quản lý nhân vật" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Quản lý khung pose" })).toBeVisible();
  await expect(page.getByRole("searchbox", { name: "Tìm nhân vật" })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Lọc nhân vật theo nhãn" })).toBeVisible();
  await expect(page.getByText("Mèo mẫu", { exact: true })).toBeVisible();
  await expect(page.getByText("VCB", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Tuỳ chọn Mèo mẫu" }).click();
  await expect(page.getByRole("menuitem", { name: "Sửa" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Xoá" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Quản lý khung pose" }).click();
  await expect(page.getByText("Đứng thẳng", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm khung pose" })).toBeVisible();
});

test("legacy project pages converge on the project manager", async ({ page }) => {
  // `/design` là trình soạn bộ khung cũ ⇒ nhà mới của nó là trang "Skeleton UI".
  await page.goto("/p/tet26-a7f3/design");
  await expect(page).toHaveURL(/\/p\/tet26-a7f3\?section=skeleton$/);
  await expect(page.getByRole("heading", { name: "Skeleton UI", exact: true })).toBeVisible();
  await page.goto("/k/tet26-a7f3/canvas");
  await expect(page).toHaveURL(/\/p\/tet26-a7f3\?section=images$/);
  await expect(page.getByRole("heading", { name: "Tất cả thành phẩm", exact: true })).toBeVisible();
  // Link cũ `/p/:id/settings` vẫn mở dialog Cài đặt, không đá màn nền đi đâu cả.
  await page.goto("/p/tet26-a7f3/settings");
  await expect(page).toHaveURL(/settings=requirements/);
  await expect(page.getByRole("dialog", { name: "Cài đặt" })).toBeVisible();
});

test("@visual toast uses the default viewport position and an in-card close button", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const mod = await import("/src/components/ui/sonner.tsx");
    mod.toast.error("Chưa lưu được thay đổi", { description: "Thử lại sau ít phút." });
  });

  const toast = page.locator("[data-sonner-toast]").first();
  await expect(toast).toBeVisible();
  const box = await toast.boundingBox();
  expect(box).not.toBeNull();
  expect(1280 - (box!.x + box!.width)).toBeLessThanOrEqual(40);
  expect(720 - (box!.y + box!.height)).toBeLessThanOrEqual(40);

  const close = toast.locator("[data-close-button]");
  await expect(close).toBeVisible();
  // Sonner animates the toast for 400 ms. Assert the settled geometry instead of
  // sampling a transient transform immediately after `toBeVisible()` resolves.
  await expect.poll(async () => {
    const settledToast = await toast.boundingBox();
    const settledClose = await close.boundingBox();
    if (!settledToast || !settledClose) return false;
    return settledClose.x >= settledToast.x
      && settledClose.y >= settledToast.y
      && settledClose.x + settledClose.width <= settledToast.x + settledToast.width
      && settledClose.y + settledClose.height <= settledToast.y + settledToast.height;
  }).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("toast-default-dark.png"), fullPage: true, animations: "disabled" });
});

test("toast tự đóng theo thời lượng mặc định", async ({ page }) => {
  await page.goto("/");
  const durations = await page.evaluate(async () => {
    const mod = await import("/src/components/ui/sonner.tsx");
    mod.toast.info("Thông báo sẽ tự đóng");
    return mod.KG_TOAST_DURATION;
  });
  expect(durations).toEqual({ success: 4000, successWithUndo: 10_000, info: 5000, warning: 8000, error: 12_000 });
  await expect(page.getByText("Thông báo sẽ tự đóng", { exact: true })).toBeVisible();
  await expect(page.getByText("Thông báo sẽ tự đóng", { exact: true })).toHaveCount(0, { timeout: 7000 });
});

test("active product routes do not expose legacy technical wording", async ({ page }) => {
  const routes = ["/", "/library/ui", "/library/mascot", "/references", "/trash", "/settings", "/p/tet26-a7f3", "/k/du-an-moi-b4c8"];
  const banned = /bộ kit|bản thiết kế|ảnh AI|Server Live|Codex check|kg-|contract|\bjob\b|\brender\b|\belement\b|\bproject\b/i;

  for (const path of routes) {
    await page.goto(path);
    const text = await page.locator("body").innerText();
    expect(text, `Copy cũ còn xuất hiện ở ${path}`).not.toMatch(banned);
  }
});
