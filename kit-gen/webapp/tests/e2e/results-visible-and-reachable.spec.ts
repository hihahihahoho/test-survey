import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * ══ BA HỒI QUY CỦA BLIND-TEST 2.1.17 ═══════════════════════════════════════
 *
 * Hai người kiểm mù độc lập, cùng dựng dự án riêng, cùng báo lại một chuyện: gen xong
 * mà KHÔNG XEM ĐƯỢC ẢNH. Hai nguyên nhân tách bạch, và ca test ở đây khoá cả hai:
 *
 *  §B1 — Ô ảnh kết quả kẹt `aria-busy="true"` + vòng xoay VĨNH VIỄN. `KitImage` có
 *        `state.kind` trong mảng phụ thuộc của effect tải, nên effect tự huỷ chính
 *        mình ngay sau khi đặt `loading` (chi tiết trong `KitImage.tsx`). File PNG trả
 *        200 hợp lệ, tab Skeleton cùng trang vẫn hiện — chỉ ô ảnh thật là chết.
 *
 *  §B2 — Dự án đã gen mở lại từ Home rơi về bước "Kiểm tra" của wizard. Đích của thẻ
 *        Home phụ thuộc cờ `workflow.completed`, mà autosave của wizard lật cờ đó về
 *        `false` mỗi lần store đổi. Kết quả vẫn nằm trên đĩa mà không còn đường tới.
 *
 * Ca ở đây dùng API GIẢ (không phụ thuộc workspace thật của máy chạy test), nhưng dữ
 * liệu giả chép đúng hình dạng agent trả — kể cả `sheet: null`, `w: null` và cặp
 * `tight/` mà `slice.py` luôn ghi kèm.
 */

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
/* Use repository fixtures with the exact dimensions claimed by the manifest. */
const PORTRAIT_PNG = readFileSync(new URL("../../../kits/candy/tight/25-bg-home.png", import.meta.url));
const LANDSCAPE_PNG = readFileSync(new URL("../../../skeleton/main.png", import.meta.url));
let includePreviewFixtures = false;

/** Dự án ĐÃ gen xong — có ô đã cắt, có lượt chạy gần nhất. */
const done = {
  id: "trung-thu-9c21",
  name: "Trung Thu Kẹo Ngọt",
  slug: "trung-thu",
  tags: ["kg-workflow"],
  updatedAt: "2026-08-13T10:43:01.000Z",
  stats: { rawPresent: 2, kitsCut: 2, lastRun: { id: "r-0002", at: "2026-08-13T10:46:10.000Z", ok: 2, fail: 0 } },
  state: { jobs: { "chinh-pose-nhan-vat": "ok" } },
  /* ⚠️ ĐÂY LÀ CÁI BẪY của §B2, cố ý để `false`: người dùng đã gen xong rồi mở lại
     wizard, autosave ghi đè cờ này. Dự án đầy ảnh mà cờ nháp nói "chưa xong". */
  workflow: { completed: false, updatedAt: "2026-08-13T10:50:00.000Z" },
};

/** Dự án CHƯA gen bao giờ — đích đúng của nó vẫn là wizard. */
const fresh = {
  id: "du-an-trang-0001",
  name: "Dự án trắng",
  slug: "du-an-trang",
  tags: ["kg-workflow"],
  updatedAt: "2026-08-13T10:00:00.000Z",
  stats: { rawPresent: 0, kitsCut: 0, lastRun: null },
  state: { jobs: {} },
  workflow: { completed: false, updatedAt: "2026-08-13T10:00:00.000Z" },
};

const contract = {
  schemaVersion: 4,
  characterPoses: ["idle"],
  variants: [{ id: "chinh", vi: "Phong cách chính", style: "pastel" }],
  sheets: [{
    id: "pose-nhan-vat",
    grid: { cols: 2, rows: 1 },
    orient: "portrait",
    components: [
      { file: "01-pose-idle", vi: "Đứng thẳng", spec: "pose" },
      { file: "02-pose-wave", vi: "Vẫy chào", spec: "pose" },
    ],
  }],
};

/** #42 — danh mục ô đã cắt, đúng hình dạng agent thật (có bản `tight/` song song). */
const kitCatalogue = {
  variant: "chinh",
  cutAt: "2026-08-13T10:46:30.000Z",
  sheets: {},
  files: [
    { file: "01-pose-idle", path: "kits/chinh/01-pose-idle.png", w: null, h: null, bytes: 120, sheet: "pose-nhan-vat", cellIndex: null, empty: false },
    { file: "tight/01-pose-idle", path: "kits/chinh/tight/01-pose-idle.png", w: 265, h: 451, bytes: 90, sheet: "pose-nhan-vat", cellIndex: null, empty: false },
    { file: "02-pose-wave", path: "kits/chinh/02-pose-wave.png", w: null, h: null, bytes: 120, sheet: "pose-nhan-vat", cellIndex: null, empty: false },
    { file: "tight/02-pose-wave", path: "kits/chinh/tight/02-pose-wave.png", w: 309, h: 452, bytes: 88, sheet: "pose-nhan-vat", cellIndex: null, empty: false },
  ],
};

const previewFiles = [
  { file: "tight/25-bg-home", path: "kits/chinh/tight/25-bg-home.png", w: 1024, h: 1536, bytes: 90, sheet: "bg-home", cellIndex: null, empty: false },
  { file: "tight/ui-sheet", path: "kits/chinh/tight/ui-sheet.png", w: 1536, h: 1024, bytes: 90, sheet: "ui", cellIndex: null, empty: false },
];

const runItem = {
  id: "r-0002",
  kind: "gen",
  status: "done",
  startedAt: "2026-08-13T10:44:00.000Z",
  finishedAt: "2026-08-13T10:46:10.000Z",
  jobs: [
    {
      job: "chinh-pose-nhan-vat", sheet: "pose-nhan-vat", variant: "chinh", status: "ok",
      /* `artifact.path` là nơi màn kết quả đọc ảnh sheet thô — không phải `raw`. */
      artifact: { path: "raw/chinh-pose-nhan-vat.png", bytes: 1024, mtime: "2026-08-13T10:46:00.000Z" },
      geometryOk: true, invalidCells: 0,
    },
  ],
};

const health = {
  ok: true, app: "kitgen-agent", protocol: 1, version: "1.2.0",
  workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:e2e-b1", projects: 2, activeRuns: 0,
};

/** Số byte ảnh đã phục vụ — dùng để chứng minh app THẬT SỰ tải ảnh, không chỉ vẽ khung. */
let served: string[] = [];

async function captureLegacyPreviewScreenshot(
  page: Page,
  name: string,
  orientation: "portrait" | "landscape",
  bytes: Buffer,
  height: number,
  screenshotDir: string,
) {
  /* Comparator for the reported bug: old `DialogBody` + inner `overflow-auto`.
     Kept in the E2E spec so the before image is produced by Playwright too. */
  await page.setContent(`
    <style>
      * { box-sizing: border-box; }
      html, body { margin: 0; min-height: 100%; background: #101114; color: #f6f7f9; font: 14px system-ui; }
      body { overflow: hidden; }
      .scrim { position: fixed; inset: 0; background: rgb(0 0 0 / .68); }
      .dialog { position: fixed; inset: 50% auto auto 50%; width: min(960px, calc(100vw - 32px)); max-height: min(90dvh, 720px); transform: translate(-50%, -50%); display: flex; flex-direction: column; background: #1d1f24; border: 1px solid #4a4e58; border-radius: 16px; padding: 0 20px; }
      .header { flex: 0 0 auto; padding: 20px 28px 12px 0; }
      .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 8px 0; }
      .frame { height: 800px; display: flex; align-items: center; justify-content: center; overflow: auto; border: 1px solid #4a4e58; border-radius: 8px; padding: 12px; }
      img { display: block; width: 100%; height: auto; }
      .close { position: absolute; right: 12px; top: 12px; color: #fff; }
    </style>
    <div class="scrim"></div>
    <section class="dialog" role="dialog" aria-label="${name}">
      <header class="header"><strong>${name}</strong><div>Ảnh gốc ${orientation === "portrait" ? "1024×1536" : "1536×1024"} pixel · ${orientation === "portrait" ? "Nền" : "UI nhỏ"}</div></header>
      <div class="body"><div class="frame"><img alt="${name}" src="data:image/png;base64,${bytes.toString("base64")}"></div></div>
      <button class="close" aria-label="Đóng">×</button>
    </section>
  `);
  await expect(page.locator("img")).toHaveJSProperty("complete", true);
  await page.screenshot({
    path: `${screenshotDir}/before-${orientation}-1280x${height}.png`,
    animations: "disabled",
  });
}

async function mockAgent(page: Page) {
  served = [];
  await page.route("**/health", async (route: Route) => route.fulfill({ json: health }));
  await page.route("**/api/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.startsWith("/src/")) return route.continue();

    if (path === "/api/projects") {
      return route.fulfill({ json: { scannedAt: "2026-08-13T11:00:00.000Z", workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:e2e-b1", items: [done, fresh] } });
    }
    if (path === `/api/projects/${done.id}`) return route.fulfill({ json: { project: done } });
    if (path === `/api/projects/${fresh.id}`) return route.fulfill({ json: { project: fresh } });

    if (path.endsWith("/workflow-draft") && method === "PUT") {
      return route.fulfill({ json: { ...route.request().postDataJSON(), updatedAt: "2026-08-13T11:00:00.000Z" } });
    }
    if (path === `/api/projects/${done.id}/workflow-draft`) return route.fulfill({ json: { completed: false, draft: { step: 5, unlocked: 5 }, updatedAt: null } });
    if (path === `/api/projects/${fresh.id}/workflow-draft`) return route.fulfill({ json: { completed: false, draft: null, updatedAt: null } });

    if (path.endsWith("/contract") && method === "PUT") return route.fulfill({ json: { version: 2, hash: "e2e-b1" } });
    if (path === `/api/projects/${done.id}/contract`) return route.fulfill({ json: { version: 1, contract } });
    if (path === `/api/projects/${fresh.id}/contract`) return route.fulfill({ json: { version: 1, contract: { schemaVersion: 4, characterPoses: [], variants: [], sheets: [] } } });

    if (path === `/api/projects/${done.id}/kit`) {
      return route.fulfill({ json: { ...kitCatalogue, files: includePreviewFixtures ? [...kitCatalogue.files, ...previewFiles] : kitCatalogue.files } });
    }
    if (path.endsWith("/kit")) return route.fulfill({ json: { variant: "", cutAt: null, sheets: {}, files: [] } });

    if (path === `/api/projects/${done.id}/runs`) return route.fulfill({ json: { items: [runItem] } });
    if (path.endsWith("/runs")) return route.fulfill({ json: { items: [] } });
    if (path.startsWith("/api/runs/") && path.endsWith("/stream")) return route.fulfill({ body: "" });
    if (path.startsWith("/api/runs/")) return route.fulfill({ json: runItem });

    /* Ảnh: 200 + PNG hợp lệ — ĐÚNG như blind-test đã đo bằng curl trên agent thật.
       Ô vẫn quay mãi thì lỗi nằm ở component, không nằm ở agent. */
    if (path.includes("/files/")) {
      served.push(path);
      const body = path.includes("25-bg-home")
        ? PORTRAIT_PNG
        : path.includes("ui-sheet")
          ? LANDSCAPE_PNG
          : Buffer.from(PNG_1x1, "base64");
      return route.fulfill({ status: 200, contentType: "image/png", body });
    }

    if (path === "/api/trash") return route.fulfill({ json: { items: [] } });
    if (path === "/api/library") return route.fulfill({ json: { version: 3, settings: {}, poseTemplates: [], items: [] } });
    if (path === "/api/refs" || path.endsWith("/refs")) return route.fulfill({ json: { items: [] } });
    if (path === "/api/usage") return route.fulfill({ json: { week: { used: 0, limit: 100 } } });
    return route.fulfill({ json: {} });
  });
}

test.beforeEach(async ({ page }) => {
  includePreviewFixtures = false;
  await mockAgent(page);
});

test("§B1 — ô ảnh trong tab «Ảnh thật» hiện ảnh, không kẹt vòng xoay", async ({ page }) => {
  await page.goto(`/p/${done.id}?section=images`);

  /* `sheetLabel("pose-nhan-vat")` → "Mascot pose"; đó là `aria-label` của vùng lưới. */
  const grid = page.getByRole("region", { name: "Mascot pose" }).first();
  await expect(grid.getByRole("img").first()).toBeVisible({ timeout: 15_000 });
  await expect(grid.getByRole("img")).toHaveCount(2);
  await expect(page.getByRole("img", { name: /01-pose-idle/ })).toBeVisible();

  // Không còn một ô nào tự nhận là "đang bận" sau khi ảnh đã về.
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  // …và ảnh đến từ transport có header, không phải <img src> trần (agent trả 403 cho đường đó).
  expect(served.some((p) => p.includes("/files/kits/chinh/tight/"))).toBe(true);
});

test("§B1 — tab «Ảnh gốc» cũng hiện sheet thô, không kẹt vòng xoay", async ({ page }) => {
  await page.goto(`/p/${done.id}?section=images`);
  await page.getByRole("tab", { name: "Ảnh gốc" }).click();

  await expect(page.getByRole("img").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
});

test("§B2 — thẻ Home của dự án đã gen mở THẲNG trang kết quả", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-project-card]").filter({ hasText: done.name }).first().click();

  await expect(page).toHaveURL(new RegExp(`/p/${done.id}\\?section=images`));
  await expect(page.getByRole("heading", { name: "Tất cả thành phẩm" })).toBeVisible();
});

test("§B2 — dự án chưa gen bao giờ vẫn vào wizard", async ({ page }) => {
  await page.goto("/");
  await page.locator("[data-project-card]").filter({ hasText: fresh.name }).first().click();

  await expect(page).toHaveURL(new RegExp(`/k/${fresh.id}`));
});

test("§B2 — deep-link /p/ của dự án đã gen KHÔNG bị đá về wizard dù cờ nháp nói chưa xong", async ({ page }) => {
  await page.goto(`/p/${done.id}?section=images`);
  await page.waitForTimeout(2000);

  await expect(page).toHaveURL(new RegExp(`/p/${done.id}`));
  await expect(page.getByRole("heading", { name: "Tất cả thành phẩm" })).toBeVisible();
});

test("§B2 — wizard của dự án đã gen có đường sang trang kết quả", async ({ page }) => {
  await page.goto(`/k/${done.id}`);

  const link = page.getByRole("button", { name: "Xem ảnh đã tạo" });
  await expect(link).toBeVisible({ timeout: 15_000 });
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/p/${done.id}\\?section=images`));
});

test("trang Ảnh đã tạo có ĐÚNG MỘT thanh segmented; Skeleton ở trang riêng", async ({ page }) => {
  await page.goto(`/p/${done.id}?section=images`);

  // Hai thanh xếp chồng cùng mở đầu bằng "Ảnh thật" là thứ vừa bị bỏ.
  await expect(page.getByRole("tab", { name: "Ảnh thật" })).toHaveCount(1);
  await expect(page.getByRole("tab", { name: "Ảnh gốc" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Skeleton" })).toHaveCount(0);

  /* Nội dung của thanh cũ không bị vứt đi — nó về đúng trang Skeleton UI, nay là tab
     "Ảnh thật" của trang đó. Ba tab: Ảnh thật · Ảnh gốc · Cài đặt. */
  await page.getByRole("navigation", { name: "Quản lý dự án" }).getByRole("button", { name: "Skeleton UI" }).click();
  const modes = page.getByRole("tablist", { name: "Chế độ xem Skeleton UI" });
  await expect(modes.getByRole("tab", { name: "Ảnh thật", selected: true })).toBeVisible();
  await expect(modes.getByRole("tab", { name: "Ảnh gốc" })).toBeVisible();
  await expect(modes.getByRole("tab", { name: "Cài đặt" })).toBeVisible();
});

test("§B2 — wizard của dự án trắng KHÔNG mọc ra nút xem kết quả", async ({ page }) => {
  await page.goto(`/k/${fresh.id}`);
  // Chờ wizard dựng xong (ô đầu tiên của bước ① đã có) rồi mới kết luận là KHÔNG có nút.
  await expect(page.getByRole("textbox", { name: /Tên dự án/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Xem ảnh đã tạo" })).toHaveCount(0);
});

test("preview ảnh dọc/ngang chỉ có một ổ cuộn và khóa trang nền", async ({ page }) => {
  includePreviewFixtures = true;
  const screenshotDir = "/Users/tungnt2/Documents/work/survey/kit-gen/teams/fix-modal-scroll";
  mkdirSync(screenshotDir, { recursive: true });

  for (const height of [800, 600]) {
    await page.setViewportSize({ width: 1280, height });
    for (const [name, orientation, bytes] of [
      ["25-bg-home", "portrait", PORTRAIT_PNG],
      ["ui-sheet", "landscape", LANDSCAPE_PNG],
    ] as const) {
      await captureLegacyPreviewScreenshot(page, name, orientation, bytes, height, screenshotDir);
    }
    await page.goto(`/p/${done.id}?section=images`);
    for (const [name, orientation] of [["25-bg-home", "portrait"], ["ui-sheet", "landscape"]] as const) {
      const trigger = page.getByRole("button", { name: `Xem ảnh gốc ${name}` });
      await expect(trigger).toBeVisible({ timeout: 15_000 });
      await trigger.click();

      const dialog = page.getByRole("dialog", { name });
      await expect(dialog).toBeVisible();
      const image = dialog.getByRole("img", { name: new RegExp(name) });
      await expect(image).toBeVisible({ timeout: 15_000 });
      const stats = await dialog.evaluate((root) => {
        const scrollables = [...root.querySelectorAll<HTMLElement>("*")]
          .filter((node) => ["auto", "scroll"].includes(getComputedStyle(node).overflowY)
            || ["auto", "scroll"].includes(getComputedStyle(node).overflowX));
        const frame = root.querySelector<HTMLElement>("[data-testid=asset-preview-frame]")!;
        const body = root.querySelector<HTMLElement>("[data-testid=dialog-body]")!;
        const imageNode = root.querySelector<HTMLImageElement>("img")!;
        const dialogBox = root.getBoundingClientRect();
        const frameBox = frame.getBoundingClientRect();
        const imageBox = imageNode.getBoundingClientRect();
        const originalScrollTop = body.scrollTop;
        body.scrollTop = body.scrollHeight;
        const bodyAtBottomAfterScroll = body.scrollTop + body.clientHeight >= body.scrollHeight - 1;
        body.scrollTop = originalScrollTop;
        return {
          scrollables: scrollables.map((node) => node.dataset.testid ?? ""),
          bodyOverflow: getComputedStyle(document.body).overflow,
          bodyLocked: document.body.hasAttribute("data-scroll-locked"),
          naturalWidth: imageNode.naturalWidth,
          naturalHeight: imageNode.naturalHeight,
          dialogInsideViewport: dialogBox.top >= 0
            && dialogBox.bottom <= window.innerHeight
            && dialogBox.left >= 0
            && dialogBox.right <= window.innerWidth,
          dialogHasHorizontalOverflow: root.scrollWidth > root.clientWidth,
          bodyAtBottomAfterScroll,
          imageInsideFrame: imageBox.top >= frameBox.top
            && imageBox.bottom <= frameBox.bottom
            && imageBox.left >= frameBox.left
            && imageBox.right <= frameBox.right,
          frameHasHorizontalOverflow: frame.scrollWidth > frame.clientWidth,
        };
      });
      expect(stats.scrollables).toEqual(["dialog-body"]);
      expect(stats.bodyOverflow).toBe("hidden");
      expect(stats.bodyLocked).toBe(true);
      expect([stats.naturalWidth, stats.naturalHeight]).toEqual(
        orientation === "portrait" ? [1024, 1536] : [1536, 1024],
      );
      expect(stats.dialogInsideViewport).toBe(true);
      expect(stats.dialogHasHorizontalOverflow).toBe(false);
      expect(stats.bodyAtBottomAfterScroll).toBe(true);
      expect(stats.imageInsideFrame).toBe(true);
      expect(stats.frameHasHorizontalOverflow).toBe(false);
      await expect(dialog.getByRole("button", { name: "Đóng" })).toBeVisible();
      await page.screenshot({
        path: `${screenshotDir}/after-${orientation}-1280x${height}.png`,
        animations: "disabled",
      });
      await dialog.getByRole("button", { name: "Đóng" }).click();
      await expect(dialog).toHaveCount(0);
    }
  }

  /* Cửa sổ hẹp/zoom lớn: content có thể cần cuộn trong `DialogBody`, nhưng modal và
     nút X vẫn nằm trong viewport, không mọc scroll ngang. */
  await page.setViewportSize({ width: 360, height: 320 });
  await page.goto(`/p/${done.id}?section=images`);
  await page.getByRole("button", { name: "Xem ảnh gốc 25-bg-home" }).click();
  const narrowDialog = page.getByRole("dialog", { name: "25-bg-home" });
  await expect(narrowDialog).toBeVisible();
  const closeBox = await narrowDialog.getByRole("button", { name: "Đóng" }).boundingBox();
  expect(closeBox).not.toBeNull();
  expect(closeBox!.x).toBeGreaterThanOrEqual(0);
  expect(closeBox!.y).toBeGreaterThanOrEqual(0);
  expect(closeBox!.x + closeBox!.width).toBeLessThanOrEqual(360);
  expect(closeBox!.y + closeBox!.height).toBeLessThanOrEqual(320);
  await expect(narrowDialog.getByRole("img", { name: /25-bg-home/ })).toBeVisible({ timeout: 15_000 });
  await expect(narrowDialog).toHaveAttribute("data-state", "open");
  expect(await page.evaluate(() => document.body.hasAttribute("data-scroll-locked"))).toBe(true);
});
