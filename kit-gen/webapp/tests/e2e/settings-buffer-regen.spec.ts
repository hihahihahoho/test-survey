import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * BẰNG CHỨNG CHẠY THẬT CHO HAI LỖI CỦA BLIND-TEST 2.1.17.
 *
 * §BUG-1 — bước "Phong cách" của một dự án MỚI không được điền sẵn dữ liệu của một
 *          thương hiệu có thật (tên brand + cặp màu của họ).
 * §BUG-2 — [Lưu và tạo lại ảnh] mở hộp xác nhận sinh ảnh; ĐÓNG hộp đó mà không bấm
 *          Sinh thì KHÔNG được ghi gì lên server, và ba nút Lưu phải còn sáng.
 *
 * File riêng chứ không nối vào `shell-smoke.spec.ts`: hai ca này cần một dự án đã có
 * ảnh + một dự án mới tinh, và cần ĐẾM từng lượt `PUT …/contract` — trộn vào bộ mock
 * dùng chung của smoke thì mỗi lần ai đó thêm một ca mới lại có thể làm lệch con đếm.
 */

const GENERATED_PROJECT = "da-gen-9f21";
const NEW_PROJECT = "moi-tinh-3b07";

/** Contract do chính workflow viết ra ⇒ có biến thể id `chinh` ⇒ KHÔNG bị coi là của người khác. */
const ownContract = {
  schemaVersion: 4,
  characterPoses: [],
  variants: [{
    id: "chinh",
    vi: "Phong cách chính",
    style: "Tươi vui, hình khối mềm",
    bg: "pure vivid magenta #FF00FF",
    brand: { mode: "colors", primary: "#D93333", secondary: "#F6C453" },
    characters: [],
  }],
  sheets: [{
    id: "main-ui",
    grid: { cols: 2, rows: 1 },
    orient: "landscape",
    cell_hint: "landscape",
    components: [
      { file: "01-nut", vi: "Nút chính", spec: "Nút bấm chính", skel: { shape: "pill", w: 0.8, h: 0.4 } },
      { file: "02-the", vi: "Khung thẻ", spec: "Khung thẻ phần thưởng", skel: { shape: "rrect", w: 0.8, h: 0.6 } },
    ],
  }],
};

const emptyContract = { schemaVersion: 4, characterPoses: [], variants: [], sheets: [] };

const health = {
  ok: true, app: "kitgen-agent", protocol: 1, version: "1.2.0",
  workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:e2e", projects: 2, activeRuns: 0,
};

/** Mỗi lượt `PUT …/contract` được đẩy vào đây — con đếm của cả §BUG-2. */
let contractWrites: string[] = [];
let runStarts: number;
let contractVersion: number;

async function mockAgent(page: Page) {
  contractWrites = [];
  runStarts = 0;
  contractVersion = 3;

  const generated = {
    id: GENERATED_PROJECT, name: "Dự án đã gen", slug: "da-gen", tags: ["kg-workflow"],
    updatedAt: "2026-08-12T08:00:00.000Z",
    /* Đã có ảnh thật ⇒ màn dự án ở lại trang kết quả thay vì đá về wizard. */
    stats: { rawPresent: 1, kitsCut: 2 },
    state: { stale: false, staleReason: [], jobs: { "chinh-main-ui": "ok" } },
    workflow: { completed: true, updatedAt: "2026-08-12T08:00:00.000Z" },
  };
  const fresh = {
    id: NEW_PROJECT, name: "Dự án mới tinh", slug: "moi-tinh", tags: ["kg-workflow"],
    updatedAt: "2026-08-12T08:00:00.000Z",
    stats: { rawPresent: 0, kitsCut: 0 },
    state: { stale: false, staleReason: [], jobs: {} },
    workflow: { completed: false, updatedAt: "2026-08-12T08:00:00.000Z" },
  };

  await page.route("**/health", async (route: Route) => route.fulfill({ json: health }));
  await page.route("**/api/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    // Vite phục vụ mã nguồn từ `/src/**`; chỉ chặn API của agent.
    if (path.startsWith("/src/")) return route.continue();

    if (path === "/api/projects") {
      return route.fulfill({ json: { scannedAt: "2026-08-12T08:00:00.000Z", workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:e2e", items: [generated, fresh] } });
    }
    if (path === `/api/projects/${GENERATED_PROJECT}`) return route.fulfill({ json: { project: generated } });
    if (path === `/api/projects/${NEW_PROJECT}`) return route.fulfill({ json: { project: fresh } });

    if (path.endsWith("/workflow-draft") && method === "PUT") {
      return route.fulfill({ json: { ...route.request().postDataJSON(), updatedAt: "2026-08-12T08:00:00.000Z" } });
    }
    if (path === `/api/projects/${GENERATED_PROJECT}/workflow-draft`) return route.fulfill({ json: { completed: true, draft: null, updatedAt: null } });
    if (path === `/api/projects/${NEW_PROJECT}/workflow-draft`) return route.fulfill({ json: { completed: false, draft: null, updatedAt: null } });

    if (path.endsWith("/contract") && method === "PUT") {
      contractWrites.push(path);
      contractVersion += 1;
      return route.fulfill({ json: { version: contractVersion, hash: `e2e-${contractVersion}` } });
    }
    if (path === `/api/projects/${GENERATED_PROJECT}/contract`) return route.fulfill({ json: { version: contractVersion, contract: ownContract } });
    if (path === `/api/projects/${NEW_PROJECT}/contract`) return route.fulfill({ json: { version: 1, contract: emptyContract } });

    if (path.endsWith("/runs") && method === "POST") {
      runStarts += 1;
      return route.fulfill({ status: 201, json: { runId: "run-e2e-1", jobs: [{ job: "chinh-main-ui", status: "queued" }] } });
    }
    if (path.endsWith("/runs")) return route.fulfill({ json: { items: [] } });
    if (path.startsWith("/api/runs/") && path.endsWith("/stream")) return route.fulfill({ body: "" });

    if (path.endsWith("/refs")) return route.fulfill({ json: { items: [] } });
    if (path.endsWith("/kit")) return route.fulfill({ json: { variant: "chinh", cutAt: null, sheets: {}, files: [] } });
    if (path === "/api/library") {
      return route.fulfill({ json: { version: 3, settings: { background: 2, popup: 4, small: 16, props: 16, mascot: 4 }, poseTemplates: [], items: [] } });
    }
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

/* ══════════════════════════════════════════════════════════════════════════
   §BUG-1
   ══════════════════════════════════════════════════════════════════════════ */

test("bước Phong cách của dự án mới không mang tên hay màu của một thương hiệu có thật", async ({ page }) => {
  await page.goto(`/k/${NEW_PROJECT}`);

  // Bước ② còn khoá cho tới khi rời bước ①, nên đi bằng [Tiếp theo] chứ không nhảy stepper.
  await expect(page.getByLabel("Tên dự án")).toBeVisible();
  await page.getByRole("button", { name: "Tiếp theo" }).click();

  const prompt = page.getByLabel("Mô tả phong cách");
  await expect(prompt).toBeVisible();

  // Ô mô tả TRỐNG — gợi ý cách viết nằm ở placeholder, và placeholder không đi vào contract.
  await expect(prompt).toHaveValue("");
  await expect(prompt).toHaveAttribute("placeholder", /Ví dụ/);

  // Dropdown nói "không dùng thương hiệu", nên không một ô nào bên dưới được nói khác.
  await expect(page.getByRole("combobox", { name: "Điền từ thương hiệu" })).toHaveText(/Không dùng thương hiệu đã lưu/);
  await expect(page.getByLabel("Màu chính")).not.toHaveValue("#005baa");
  await expect(page.getByLabel("Màu phụ")).not.toHaveValue("#00b0f0");

  // Và không một chữ nào trên bước này nhắc tên một thương hiệu có thật.
  await expect(page.locator("body")).not.toContainText("VNPAY");
});

/* ══════════════════════════════════════════════════════════════════════════
   §BUG-2
   ══════════════════════════════════════════════════════════════════════════ */

test("đóng hộp xác nhận sinh ảnh không ghi gì, và ba nút Lưu vẫn sáng", async ({ page }) => {
  await page.goto(`/p/${GENERATED_PROJECT}?settings=style`);

  const dialog = page.getByRole("dialog", { name: "Cài đặt" });
  await expect(dialog).toBeVisible();

  const prompt = dialog.getByLabel("Mô tả phong cách");
  await prompt.fill("Tối giản, viền mảnh, tông trung tính");
  const regenerate = dialog.getByRole("button", { name: "Lưu và tạo lại ảnh" });
  await expect(regenerate).toBeEnabled();

  contractWrites.length = 0;
  await regenerate.click();

  // Hộp xác nhận sinh ảnh mở ra — CHƯA có gì được ghi.
  const confirm = page.getByRole("dialog", { name: "Sinh ảnh" });
  await expect(confirm).toBeVisible();
  // Nhịp autosave cũ là 700ms; chờ quá mốc đó rồi mới khẳng định "không ghi gì".
  await page.waitForTimeout(1200);
  expect(contractWrites).toHaveLength(0);

  // ĐÓNG hộp, không bấm Sinh.
  await confirm.getByRole("button", { name: "Huỷ" }).click();
  await expect(confirm).toBeHidden();
  expect(contractWrites).toHaveLength(0);
  expect(runStarts).toBe(0);

  /* Bỏ dở ⇒ quay lại đúng tab Cài đặt vừa rời, chữ người dùng gõ còn nguyên, và ba nút
     VẪN SÁNG. Đây chính là điều (b) đã hỏng: trước kia mở lại thấy tất cả đều tắt. */
  const back = page.getByRole("dialog", { name: "Cài đặt" });
  await expect(back).toBeVisible();
  await expect(back.getByLabel("Mô tả phong cách")).toHaveValue("Tối giản, viền mảnh, tông trung tính");
  await expect(back.getByText("Có thay đổi chưa lưu", { exact: false })).toBeVisible();
  await expect(back.getByRole("button", { name: "Lưu và tạo lại ảnh" })).toBeEnabled();
  await expect(back.getByRole("button", { name: "Lưu cài đặt" })).toBeEnabled();
});

test("chỉ cú bấm [Sinh N lượt] mới ghi bản thiết kế xuống đĩa", async ({ page }) => {
  await page.goto(`/p/${GENERATED_PROJECT}?settings=style`);

  const dialog = page.getByRole("dialog", { name: "Cài đặt" });
  await dialog.getByLabel("Mô tả phong cách").fill("Sắc nét, tương phản cao");
  contractWrites.length = 0;
  await dialog.getByRole("button", { name: "Lưu và tạo lại ảnh" }).click();

  const confirm = page.getByRole("dialog", { name: "Sinh ảnh" });
  await expect(confirm).toBeVisible();
  expect(contractWrites).toHaveLength(0);

  const written = page.waitForResponse((response) =>
    response.url().includes(`/api/projects/${GENERATED_PROJECT}/contract`)
    && response.request().method() === "PUT");
  await confirm.getByRole("button", { name: /^Sinh \d+ lượt$/ }).click();
  await written;

  // Ghi ĐÚNG MỘT lần, và run chỉ chạy sau khi ghi xong.
  expect(contractWrites).toHaveLength(1);
  await expect.poll(() => runStarts).toBe(1);
});
