import { expect, test, type Page, type Route } from "@playwright/test";

const project = {
  id: "tet26-a7f3",
  name: "Tết 2026",
  slug: "tet26",
  tags: ["kg-workflow"],
  updatedAt: "2026-08-11T08:00:00.000Z",
  stats: { rawPresent: 1, kitsCut: 0 },
  state: { jobs: {} },
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
  await page.route("**/health", async (route: Route) => route.fulfill({ json: health }));
  await page.route("**/api/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    // Vite serves modules from `/src/lib/api/**`; only intercept the agent API,
    // otherwise the app bootstraps from JSON instead of its source module.
    if (path.startsWith("/src/")) return route.continue();
    if (path === "/api/projects") return route.fulfill({ json: { scannedAt: "2026-08-11T08:00:00.000Z", workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:e2e", items: [project] } });
    if (path === "/api/projects/tet26-a7f3") return route.fulfill({ json: { project } });
    if (path === "/api/projects/tet26-a7f3/contract") return route.fulfill({ json: { version: 1, contract } });
    if (path === "/api/projects/tet26-a7f3/runs") return route.fulfill({ json: { items: [] } });
    if (path === "/api/trash") return route.fulfill({ json: { items: [] } });
    if (path === "/api/workspaces") return route.fulfill({ json: { items: [{ id: "ws_e2e", label: "~/KitGen" }], activeId: "ws_e2e" } });
    if (path === "/api/system/update") return route.fulfill({ json: { currentVersion: "1.2.0", latestVersion: "1.2.0", available: false } });
    if (path === "/api/doctor") return route.fulfill({ json: { codex: { ok: true }, imageGen: { available: true, mode: "default" } } });
    return route.fulfill({ json: {} });
  });
}

test.beforeEach(async ({ page }) => {
  await mockAgent(page);
});

test("@visual home uses the project sidebar instead of a horizontal header", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dự án của bạn" })).toBeVisible();

  await expect(page.locator("header")).toHaveCount(0);
  await expect(page.getByRole("searchbox", { name: "Tìm dự án" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cài đặt" })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("home-dark.png"), fullPage: true, animations: "disabled" });
});

test("@visual an internal page keeps only Back home and runtime status", async ({ page }, testInfo) => {
  await page.goto("/p/tet26-a7f3");

  const header = page.locator("header.sticky");
  await expect(header).toHaveCount(1);
  await expect(header.getByRole("button", { name: "Dự án" })).toBeVisible();
  await expect(header.getByRole("button", { name: /Trạng thái:/ })).toBeVisible();
  await expect(header.getByRole("button")).toHaveCount(2);
  await expect(page.getByRole("searchbox", { name: "Tìm dự án" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Tết 2026" })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("project-internal-dark.png"), fullPage: true, animations: "disabled" });
});

test("@visual the kit studio keeps generated assets inside the project", async ({ page }, testInfo) => {
  await page.goto("/k/tet26-a7f3/studio");

  await expect(page.getByRole("heading", { name: "Quản lý từng phần" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Phạm vi bộ kit" })).toBeVisible();
  await page.getByRole("button", { name: /Giao diện/ }).click();
  await expect(page.getByRole("radiogroup", { name: "Kết quả của main-ui" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Khung xương" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tạo phần này" })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("kit-studio-dark.png"), fullPage: true, animations: "disabled" });
});

test("@visual opening settings does not change the viewport width", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dự án của bạn" })).toBeVisible();
  const widthBefore = await page.evaluate(() => document.documentElement.clientWidth);

  await page.getByRole("button", { name: "Cài đặt" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.clientWidth)).toBe(widthBefore);

  await page.screenshot({ path: testInfo.outputPath("settings-dark.png"), fullPage: true, animations: "disabled" });
});

test("@visual light settings keeps selected and interactive surfaces distinct", async ({ page }, testInfo) => {
  await page.addInitScript(() => {
    localStorage.setItem("kitgen.ui.v1", JSON.stringify({ state: { theme: "light" }, version: 1 }));
  });
  await page.goto("/settings?tab=prefs");
  await expect(page.getByRole("dialog")).toBeVisible();
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

  const input = page.getByRole("searchbox", { name: "Tìm dự án" });
  await expect(input).toBeVisible();
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
