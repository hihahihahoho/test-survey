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

const contract = {
  schemaVersion: 4,
  characterPoses: [],
  variants: [{
    id: "tet",
    vi: "Tết hiện đại",
    style: "Tươi vui, hình khối mềm, màu đỏ ấm",
    bg: "pure vivid magenta #FF00FF",
    brand: { mode: "colors", primary: "#D93333", secondary: "#F6C453" },
    characters: [],
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
    if (path.startsWith("/api/projects/tet26-a7f3/files/runs/")) {
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
  await expect(page.getByRole("navigation", { name: "Quản lý dự án" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tất cả thành phẩm" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Mascot" })).toBeVisible();
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

  await page.getByRole("button", { name: "Cài đặt" }).click();
  await page.getByRole("button", { name: "Bộ khung UI" }).click();
  await page.getByRole("button", { name: /^UI nhỏ(?: · \d+)?$/ }).click();
  const customFrame = page.getByRole("button", { name: /Nút thưởng của tôi/ });
  await expect(customFrame).toBeVisible();
  await customFrame.click();
  await expect(customFrame).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Dự án", exact: true }).click();
  const backgroundLimit = page.getByRole("spinbutton", { name: "Nền" });
  await expect(backgroundLimit).toHaveAttribute("placeholder", "2");
  await backgroundLimit.fill("1");
  await expect(backgroundLimit).toHaveValue("1");

  await page.getByRole("button", { name: "Đóng" }).click();
  await expect(page.getByText("Chưa có ảnh nào")).toBeVisible();
});

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

  await page.addInitScript(() => {
    localStorage.setItem("kitgen.workflow-v4:tet26-a7f3", JSON.stringify({ state: { step: 6, unlocked: 6 }, version: 0 }));
  });
  await page.goto("/k/tet26-a7f3");
  await expect(page.getByRole("heading", { name: "Ảnh đã tạo", exact: true })).toBeVisible();
  await expect(page.getByText("Mascot pose", { exact: true })).toBeVisible();
  await expect(page.getByText("1 ô lệch bộ khung · Cần tạo lại")).toBeVisible();
  await page.getByRole("button", { name: "Tạo lại Mascot pose" }).click();

  const dialog = page.getByRole("dialog", { name: "Sinh ảnh" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /pose-nhan-vat/, checked: true })).toHaveCount(1);
  await expect(dialog.getByText("Đã chọn 1 lượt", { exact: false })).toBeVisible();
});

test("@visual a reusable mascot can be selected and pose cards stay readable", async ({ page }, testInfo) => {
  await page.goto("/k/tet26-a7f3");
  await page.getByRole("button", { name: "Tiếp theo" }).click();
  await page.getByRole("button", { name: "Tiếp theo" }).click();
  await page.getByRole("button", { name: "Tiếp theo" }).click();
  await page.getByRole("button", { name: "Chọn mascot có sẵn" }).click();
  await page.getByRole("button", { name: /Mèo mẫu/ }).click();
  await expect(page.getByRole("textbox", { name: "Tên nhân vật" })).toHaveValue("Mèo mẫu");
  await expect(page.getByText("2 dáng đã chọn")).toBeVisible();
  const poseCard = page.locator(".pose-choice-grid button").filter({ hasText: "Đứng chờ" });
  const cardBox = await poseCard.boundingBox();
  const previewBox = await poseCard.locator(".pose-prototype").boundingBox();
  const poseSvgBox = await poseCard.locator(".pose-prototype svg").boundingBox();
  expect(cardBox).not.toBeNull();
  expect(previewBox).not.toBeNull();
  expect(poseSvgBox).not.toBeNull();
  const poseStyle = await poseCard.evaluate((element) => ({
    height: getComputedStyle(element).height,
    width: getComputedStyle(element).width,
    aspectRatio: getComputedStyle(element).aspectRatio,
  }));
  expect(Math.abs(cardBox!.width - cardBox!.height), JSON.stringify(poseStyle)).toBeLessThanOrEqual(2);
  expect(previewBox!.width).toBeGreaterThanOrEqual(80);
  expect(poseSvgBox!.width).toBeGreaterThanOrEqual(60);
  await page.screenshot({ path: testInfo.outputPath("mascot-pose-dark.png"), fullPage: true, animations: "disabled" });
});

test("project management keeps UI nhỏ and Đạo cụ as separate destinations", async ({ page }) => {
  await page.goto("/p/tet26-a7f3");
  await page.getByRole("button", { name: "Đạo cụ", exact: true }).click();
  await expect(page).toHaveURL(/section=props/);
  await expect(page.getByRole("heading", { name: "Đạo cụ", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "UI nhỏ", exact: true }).click();
  await expect(page).toHaveURL(/section=ui/);
  await expect(page.getByRole("heading", { name: "UI nhỏ", exact: true })).toBeVisible();
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
  await page.goto("/p/tet26-a7f3/design");
  await expect(page).toHaveURL(/\/p\/tet26-a7f3\?section=ui$/);
  await page.goto("/k/tet26-a7f3/canvas");
  await expect(page).toHaveURL(/\/p\/tet26-a7f3\?section=overview$/);
  await expect(page.getByRole("heading", { name: "Tất cả thành phẩm", exact: true })).toBeVisible();
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
