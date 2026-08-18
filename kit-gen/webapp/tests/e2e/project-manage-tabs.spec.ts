import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * ══ ĐỢT 2026-08-14 — CHỦ SẢN PHẨM TRẢ LẠI MÀN DỰ ÁN ═════════════════════════
 *
 * Năm câu nói, năm ca chạy thật. File riêng chứ không nối vào `shell-smoke.spec.ts`:
 * bốn trong năm ca cần một dự án ĐÃ CÓ ẢNH ở nhiều nhóm (mascot + UI nhỏ) để các khối
 * theo nhóm và tab "Ảnh gốc" có gì mà hiện, còn fixture dùng chung của smoke là một dự
 * án chưa gen lần nào.
 *
 *  §1 "SETTING SAO NÓ THÔ THẾ NÀY, KIỂU ĐỂ HẾT TRONG 1 CÁI POPUP THÔI, ĐỪNG LỘ RA
 *     NGOÀI" → lưới thành phần không còn ô nhập trần; ô kích thước nằm trong popup.
 *  §2 "SKELETON UI … CÓ 3 TAB: ẢNH THẬT, ẢNH GỐC, SETTINGS" → và trang Mascot cùng
 *     khuôn, với danh sách dáng CUỘN được.
 *  §3 "BỎ CÁI ĐOẠN BUTTON PILL Ở TẤT CẢ THÀNH PHẨM" → một dải cuộn dọc chia khối theo
 *     nhóm; `?group=` cũ cuộn tới đúng khối thay vì lọc.
 *  §4 "SIDEBAR TRÁI SẼ CÓ PHẦN PREVIEW TỔNG QUAN".
 *  §5 "CÁI CÀI ĐẶT Ở SIDEBAR ĐỔI THÀNH CÀI ĐẶT STYLE … ĐỂ CÁI BẢNG MÀU VẼ ẤY".
 */

const PID = "vcb-tet-2026";
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/** Đủ ô để trang dài hơn một màn hình — nếu không thì "đã cuộn tới" không đo được. */
const POSE_CELLS = Array.from({ length: 12 }, (_, i) => `${String(i + 1).padStart(2, "0")}-pose-${i}`);
const UI_CELLS = Array.from({ length: 8 }, (_, i) => `${String(i + 1).padStart(2, "0")}-ui-${i}`);

/**
 * Ô UI của contract phải mang tên THẬT của thư viện đóng gói.
 *
 * `ProjectScreen` dựng thư viện từ (ô của contract trên đĩa) + (thư viện agent) + (bộ
 * khung người dùng thêm), rồi `resolveKitset` chỉ vẽ những món kitset BIẾT. Đặt tên bịa
 * ở đây thì contract dựng lại rỗng phần UI và trang Skeleton UI báo "chưa có tấm nào" —
 * hỏng vì fixture, không phải vì mã.
 */
const LIB_FILES = ["01-btn-pill-red", "02-btn-pill-blue", "03-btn-pill-outline"];

/** Contract do chính workflow viết ra (biến thể `chinh`) ⇒ không bị coi là của bản cũ. */
const contract = {
  schemaVersion: 4,
  characterPoses: ["idle"],
  variants: [{
    id: "chinh", vi: "Phong cách chính", style: "Tươi vui, hình khối mềm",
    bg: "pure vivid magenta #FF00FF",
    brand: { mode: "colors", primary: "#D93333", secondary: "#F6C453" },
    characters: [{ id: "nhan-vat", vi: "Nhân vật", ref: null, poses: ["idle"] }],
  }],
  sheets: [
    {
      id: "ui", grid: { cols: 2, rows: 2 }, orient: "landscape", cell_hint: "landscape",
      components: LIB_FILES.map((file, i) => ({
        file, vi: `Ô UI ${i + 1}`, spec: `Thành phần UI ${i + 1}`,
        skel: { shape: "pill", w: 0.78, h: 0.4, slice9: true },
      })),
    },
    {
      id: "pose-nhan-vat", grid: { cols: 4, rows: 3 }, orient: "portrait", cell_hint: "portrait",
      components: POSE_CELLS.map((file, i) => ({
        file, vi: `Dáng ${i + 1}`, spec: `Dáng nhân vật ${i + 1}`,
        skel: { shape: "rrect", w: 0.3, h: 0.85 },
      })),
    },
  ],
};

const kitCatalogue = {
  variant: "chinh",
  cutAt: "2026-08-14T09:00:00.000Z",
  sheets: {},
  files: [
    ...POSE_CELLS.map((file) => ({
      file: `tight/${file}`, path: `kits/chinh/tight/${file}.png`,
      w: 200, h: 300, bytes: 90, sheet: "pose-nhan-vat", cellIndex: null, empty: false,
    })),
    ...UI_CELLS.map((file) => ({
      file: `tight/${file}`, path: `kits/chinh/tight/${file}.png`,
      w: 200, h: 120, bytes: 90, sheet: "ui", cellIndex: null, empty: false,
    })),
  ],
};

const runItem = {
  id: "run-0007", kind: "gen", status: "done",
  startedAt: "2026-08-14T08:50:00.000Z", finishedAt: "2026-08-14T08:58:00.000Z",
  jobs: [
    {
      job: "chinh-ui", sheet: "ui", variant: "chinh", status: "ok",
      artifact: { path: "raw/chinh-ui.png", bytes: 2048, mtime: "2026-08-14T08:55:00.000Z" },
      geometryOk: true, invalidCells: 0,
    },
    {
      job: "chinh-pose-nhan-vat", sheet: "pose-nhan-vat", variant: "chinh", status: "ok",
      artifact: { path: "raw/chinh-pose-nhan-vat.png", bytes: 2048, mtime: "2026-08-14T08:57:00.000Z" },
      geometryOk: true, invalidCells: 0,
    },
  ],
};

const project = {
  id: PID, name: "VCB Tết 2026", slug: "vcb-tet", tags: ["kg-workflow"],
  updatedAt: "2026-08-14T09:00:00.000Z",
  cover: null,
  stats: { rawPresent: 2, kitsCut: POSE_CELLS.length + UI_CELLS.length, lastRun: { id: "run-0007", at: "2026-08-14T08:58:00.000Z", ok: 2, fail: 0 } },
  state: { stale: false, staleReason: [], jobs: { "chinh-ui": "ok", "chinh-pose-nhan-vat": "ok" } },
  workflow: { completed: true, updatedAt: "2026-08-14T09:00:00.000Z" },
};

const health = {
  ok: true, app: "kitgen-agent", protocol: 1, version: "1.2.0",
  workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:e2e-0814", projects: 1, activeRuns: 0,
};

async function mockAgent(page: Page) {
  await page.route("**/health", async (route: Route) => route.fulfill({ json: health }));
  await page.route("**/api/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.startsWith("/src/")) return route.continue();

    if (path === "/api/projects") {
      return route.fulfill({ json: { scannedAt: "2026-08-14T09:00:00.000Z", workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:e2e-0814", items: [project] } });
    }
    if (path === `/api/projects/${PID}`) return route.fulfill({ json: { project } });
    if (path.endsWith("/workflow-draft") && method === "PUT") {
      return route.fulfill({ json: { ...route.request().postDataJSON(), updatedAt: "2026-08-14T09:00:00.000Z" } });
    }
    if (path.endsWith("/workflow-draft")) return route.fulfill({ json: { completed: true, draft: null, updatedAt: null } });
    if (path.endsWith("/contract") && method === "PUT") return route.fulfill({ json: { version: 2, hash: "e2e-0814" } });
    if (path.endsWith("/contract")) return route.fulfill({ json: { version: 1, contract } });
    if (path.endsWith("/kit")) return route.fulfill({ json: kitCatalogue });
    if (path.endsWith("/runs") && method === "POST") return route.fulfill({ status: 201, json: { runId: "run-0008", jobs: [] } });
    if (path.endsWith("/runs")) return route.fulfill({ json: { items: [runItem] } });
    if (path.startsWith("/api/runs/") && path.endsWith("/stream")) return route.fulfill({ body: "" });
    if (path.startsWith("/api/runs/")) return route.fulfill({ json: runItem });
    if (path.includes("/files/")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(PNG_1x1, "base64") });
    }
    if (path === "/api/trash") return route.fulfill({ json: { items: [] } });
    if (path === "/api/library") return route.fulfill({ json: { version: 3, settings: {}, poseTemplates: [], items: [] } });
    if (path === "/api/refs" || path.endsWith("/refs")) return route.fulfill({ json: { items: [] } });
    if (path === "/api/usage") return route.fulfill({ json: { week: { used: 0, limit: 100 } } });
    return route.fulfill({ json: {} });
  });
}

test.beforeEach(async ({ page }) => {
  await mockAgent(page);
});

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Quản lý dự án" });

/* ══════════════════════════════════════════════════════════════════════════
   §3 — trang "Ảnh đã tạo": không chip, một dải cuộn dọc chia khối
   ══════════════════════════════════════════════════════════════════════════ */

test("§3 — không còn hàng chip; mỗi nhóm là một khối trong dải cuộn", async ({ page }) => {
  await page.goto(`/p/${PID}?section=images`);

  await expect(page.getByRole("heading", { name: "Tất cả thành phẩm", exact: true })).toBeVisible();
  for (const label of ["Tất cả thành phẩm", "Mascot pose", "Nền", "Popup", "UI nhỏ", "Đạo cụ"]) {
    await expect(page.getByRole("button", { name: label, exact: true })).toHaveCount(0);
  }

  // Hai nhóm có ảnh ⇒ hai khối, cả hai nằm sẵn trên trang chứ không sau một cú bấm.
  await expect(page.locator("#nhom-mascot")).toBeVisible();
  await expect(page.locator("#nhom-ui")).toBeVisible();
  // Nhóm một tấm ⇒ tiêu đề in ĐÚNG MỘT lần (tên nhóm), không lặp lại ở tầng tấm.
  await expect(page.getByRole("heading", { name: "Mascot pose", exact: true })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "UI nhỏ", exact: true })).toHaveCount(1);
  // Nhóm không có ảnh KHÔNG để lại ô trống.
  await expect(page.locator("#nhom-popup")).toHaveCount(0);
});

test("§3 — link cũ `?group=` CUỘN TỚI đúng khối thay vì lọc", async ({ page }) => {
  await page.goto(`/p/${PID}?section=images`);
  await expect(page.locator("#nhom-ui")).toBeVisible();
  // Không có `?group=` ⇒ đứng ở đầu trang.
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  await page.goto(`/p/${PID}?section=images&group=ui`);
  await expect(page.locator("#nhom-ui")).toBeInViewport({ timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 }).toBeGreaterThan(0);
  // Cuộn chứ KHÔNG lọc: khối mascot vẫn còn trên trang.
  await expect(page.locator("#nhom-mascot")).toHaveCount(1);
});

/* ══════════════════════════════════════════════════════════════════════════
   §1 + §2 — Skeleton UI: ba tab, và mọi control trong popup
   ══════════════════════════════════════════════════════════════════════════ */

test("§2 — Skeleton UI có ba tab, mở ở «Ảnh thật»", async ({ page }) => {
  await page.goto(`/p/${PID}?section=skeleton`);
  const modes = page.getByRole("tablist", { name: "Chế độ xem Skeleton UI" });
  await expect(modes.getByRole("tab", { name: "Ảnh thật", selected: true })).toBeVisible();
  await expect(modes.getByRole("tab", { name: "Ảnh gốc" })).toBeVisible();
  await expect(modes.getByRole("tab", { name: "Cài đặt" })).toBeVisible();

  // ① Ảnh thật = bộ khung đã dựng, và KHÔNG kèm tấm mascot (tấm đó có trang riêng).
  await expect(page.getByRole("heading", { name: "ui", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "pose nhan vat", exact: true })).toHaveCount(0);

  // ② Ảnh gốc = sheet thô tương ứng.
  await modes.getByRole("tab", { name: "Ảnh gốc" }).click();
  await expect(page.getByText("Sheet gốc theo phiên bản")).toBeVisible();
  await expect(page.getByRole("heading", { name: "UI nhỏ", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mascot pose", exact: true })).toHaveCount(0);
});

test("§1 — thẻ thành phần sạch; ô kích thước chỉ có trong popup Chi tiết", async ({ page }) => {
  await page.goto(`/p/${PID}?section=skeleton`);
  await page.getByRole("tab", { name: "Cài đặt" }).click();

  const grid = page.locator(".compact-element-grid").first();
  await expect(grid.locator(".compact-element").first()).toBeVisible();
  // Bức tường 84 ô số đã đi: không một ô nhập nào nằm trần trong lưới.
  await expect(grid.locator("input, select, textarea")).toHaveCount(0);
  await expect(page.getByLabel("Rộng %")).toHaveCount(0);

  await grid.getByRole("button", { name: /^Chi tiết / }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Rộng %")).toBeVisible();
  await expect(dialog.getByLabel("Cao %")).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /Vẽ thành phần này/ })).toBeVisible();
  await expect(dialog.getByText("Prompt sẽ gửi đi")).toBeVisible();
  // Hàng nút Lưu của trang đi theo vào popup — sửa xong là lưu được ngay tại chỗ.
  await expect(dialog.getByRole("button", { name: "Lưu", exact: true })).toBeVisible();
});

/* ══════════════════════════════════════════════════════════════════════════
   §2b — trang Mascot cùng khuôn, danh sách cuộn được
   ══════════════════════════════════════════════════════════════════════════ */

test("§2b — Mascot có ba tab, và lưới dáng KHÔNG cuộn riêng", async ({ page }) => {
  await page.goto(`/p/${PID}?section=mascot`);
  const modes = page.getByRole("tablist", { name: "Chế độ xem Mascot" });
  await expect(modes.getByRole("tab", { name: "Ảnh thật", selected: true })).toBeVisible();
  await expect(modes.getByRole("tab", { name: "Ảnh gốc" })).toBeVisible();

  // Tab "Ảnh thật" của trang này là bộ khung của tấm dáng, không phải của phần UI.
  await expect(page.getByRole("heading", { name: "pose nhan vat", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "ui", exact: true })).toHaveCount(0);

  await modes.getByRole("tab", { name: "Cài đặt" }).click();
  const poses = page.locator(".compact-element-grid").first();
  await expect(poses.locator(".compact-element").first()).toBeVisible();

  /* ĐỢT 2026-08-14b — ĐẢO LẠI yêu cầu cũ ("lưới có hộp cuộn RIÊNG"). Chủ sản phẩm báo
     kèm ảnh: lăn chuột ngang qua khu "Bộ dáng" là trang khựng. Hộp cuộn ấy chính là thủ
     phạm — `overflow-y-auto` biến khối thành scroll container ngay cả khi 3–4 thẻ không
     hề tràn, rồi `overscroll-behavior: contain` nuốt luôn wheel event.
     Đo bằng COMPUTED STYLE, không bằng class: class đúng mà CSS khác vẫn hỏng. */
  const measured = await poses.evaluate((el) => ({
    overflowY: getComputedStyle(el).overflowY,
    maxHeight: getComputedStyle(el).maxHeight,
  }));
  expect(measured.overflowY).toBe("visible");
  expect(measured.maxHeight).toBe("none");
});

test("§2b′ — lăn chuột TRÊN khu «Bộ dáng» thì trang vẫn cuộn, không khựng", async ({ page }) => {
  await page.goto(`/p/${PID}?section=mascot`);
  await page.getByRole("tab", { name: "Cài đặt" }).click();

  const section = page.locator('[aria-label="Bộ dáng mascot"]');
  await expect(section.locator(".compact-element").first()).toBeVisible();

  /* Đây là phép đo ĐÚNG THỨ NGƯỜI DÙNG LÀM: đặt con trỏ giữa khu Bộ dáng rồi lăn.
     Bản hỏng cho `scrollY === 0` (vùng con nuốt event); bản đúng thì trang đi tiếp. */
  await page.evaluate(() => window.scrollTo(0, 0));
  const box = (await section.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + Math.min(60, box.height / 2));
  await page.mouse.wheel(0, 240);
  await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 }).toBeGreaterThan(0);
});

test("§2b″ — popup Chi tiết dáng VẪN cuộn nội bộ và chặn chaining ở biên", async ({ page }) => {
  await page.goto(`/p/${PID}?section=mascot`);
  await page.getByRole("tab", { name: "Cài đặt" }).click();

  const grid = page.locator(".compact-element-grid").first();
  await grid.getByRole("button", { name: /^Chi tiết dáng / }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();

  const body = page.getByTestId("dialog-body");
  const measured = await body.evaluate((el) => ({
    overflowY: getComputedStyle(el).overflowY,
    overscrollY: getComputedStyle(el).overscrollBehaviorY,
  }));
  expect(measured.overflowY).toBe("auto");
  expect(measured.overscrollY).toBe("contain");
});

/* ══════════════════════════════════════════════════════════════════════════
   §4 + §5 — sidebar
   ══════════════════════════════════════════════════════════════════════════ */

test("§4 — Preview tổng quan đếm ảnh theo nhóm và mở trang Ảnh đã tạo", async ({ page }) => {
  await page.goto(`/p/${PID}?section=mascot`);

  const preview = page.getByRole("region", { name: "Preview tổng quan" });
  await expect(preview).toBeVisible();
  await expect(preview.getByText("Mascot pose")).toBeVisible();
  await expect(preview.getByText(String(POSE_CELLS.length), { exact: true })).toBeVisible();
  await expect(preview.getByText(String(POSE_CELLS.length + UI_CELLS.length), { exact: true })).toBeVisible();

  await preview.getByRole("button", { name: "Mở Ảnh đã tạo" }).click();
  await expect(page).toHaveURL(/section=images/);
  await expect(page.getByRole("heading", { name: "Tất cả thành phẩm", exact: true })).toBeVisible();
});

test("§5 — mục sidebar tên «Cài đặt style» và mở đúng dialog Cài đặt", async ({ page }) => {
  await page.goto(`/p/${PID}?section=images`);

  await expect(sidebar(page).getByRole("button", { name: "Cài đặt", exact: true })).toHaveCount(0);
  const entry = sidebar(page).getByRole("button", { name: "Cài đặt style", exact: true });
  await expect(entry).toBeVisible();

  await entry.click();
  await expect(page.getByRole("dialog", { name: "Cài đặt" })).toBeVisible();
  // Nút tên «Cài đặt style» thì phải mở đúng tab Phong cách — 2/3 blind tester
  // đợt 2026-08-18 vấp cảnh mở ra lại là tab Yêu cầu.
  await expect(page).toHaveURL(/settings=style/);
  // Mở dialog KHÔNG đụng mục nền (lỗi #5 của đợt trước vẫn phải đứng).
  await expect(page).toHaveURL(/section=images/);
});
