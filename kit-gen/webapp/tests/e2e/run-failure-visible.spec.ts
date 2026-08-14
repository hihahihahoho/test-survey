import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * ══ BACKLOG #22 — «RUN FAIL MÀ KHÔNG AI THẤY» ═════════════════════════════════
 *
 * Chủ sản phẩm dính hai lần trong MỘT ngày. Cả hai lần mô tả giống hệt nhau:
 *   · lượt gen chết 100% mà «nó chẳng báo gì cả»;
 *   · ngoài Home, thẻ dự án trông y hệt một dự án chưa từng chạy;
 *   · trong dự án, phải mở TỪNG Ô mới thấy "chạy xong nhưng ảnh không được ghi";
 *   · nguyên nhân thật (`rc=127`) chỉ lòi ra khi có người đào `events.ndjson` bằng tay.
 *
 * Ba ca dưới đây khoá đúng ba nấc đó ở tầng NGƯỜI DÙNG NHÌN THẤY — chỗ mà unit test
 * không với tới, vì lỗi cũ không phải lỗi logic: mọi hàm đều trả đúng, chỉ là không ai
 * chịu VẼ kết quả ra màn hình.
 *
 * Dữ liệu giả chép đúng hình dạng agent trả sau bản vá, kể cả `errorTail` ĐÃ REDACT
 * (`…/bin` chứ không phải path tuyệt đối) và `failSummary` gộp.
 */

const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

/** Dự án vừa CHÁY RỤI: 2/2 lượt chết ⇒ `rawPresent = 0`, đúng cái bẫy của thẻ Home. */
const burned = {
  id: "tet-chay-4f10",
  name: "Tết cháy rụi",
  slug: "tet-chay",
  tags: ["kg-workflow"],
  updatedAt: "2026-08-14T02:45:00.000Z",
  stats: {
    rawPresent: 0,
    kitsCut: 0,
    lastRun: {
      id: "r-0003", at: "2026-08-14T02:44:10.000Z", ok: 0, fail: 2, total: 2,
      kind: "gen", status: "done-with-errors",
      failSummary: "2/2 job không ghi được ảnh",
    },
  },
  state: { jobs: { "chinh-pose-nhan-vat": "never" }, stale: false, activeRun: null },
  workflow: { completed: true, updatedAt: "2026-08-14T02:40:00.000Z" },
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

/* `errorTail` ĐÃ qua `agent/lib/redact.mjs`: khoá bị che, đường dẫn tuyệt đối rút về
   `…/2 đoạn cuối`. Web chỉ HIỆN lại — nó không (và không thể) redact lần nữa. */
const failedRun = {
  id: "r-0003",
  kind: "gen",
  status: "done-with-errors",
  startedAt: "2026-08-14T02:41:00.000Z",
  finishedAt: "2026-08-14T02:44:10.000Z",
  progress: { done: 0, total: 2, failed: 2 },
  failSummary: "2/2 job không ghi được ảnh",
  seq: 42,
  jobs: [
    {
      job: "chinh-pose-nhan-vat", variant: "chinh", sheet: "pose-nhan-vat",
      status: "failed", diagnosis: "NO_ARTIFACT", recovered: false, artifact: null,
      errorTail: ["codex: command not found (PATH=…/tet-chay-4f10/bin)", "rc=127 — ảnh không được ghi mới"],
    },
    {
      job: "chinh-bg-home", variant: "chinh", sheet: "bg-home",
      status: "failed", diagnosis: "NO_ARTIFACT", recovered: false, artifact: null,
      errorTail: ["rc=127 — ảnh không được ghi mới"],
    },
  ],
};

const health = {
  ok: true, app: "kitgen-agent", protocol: 1, version: "1.2.0", runtimeVersion: "2.1.21",
  workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:e2e-22", projects: 1, activeRuns: 0,
};

async function mockAgent(page: Page) {
  await page.route("**/health", async (route: Route) => route.fulfill({ json: health }));
  await page.route("**/api/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.startsWith("/src/")) return route.continue();

    if (path === "/api/projects") {
      return route.fulfill({ json: { scannedAt: "2026-08-14T03:00:00.000Z", workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:e2e-22", items: [burned] } });
    }
    if (path === `/api/projects/${burned.id}`) return route.fulfill({ json: { project: burned } });
    if (path.endsWith("/workflow-draft") && method === "PUT") {
      return route.fulfill({ json: { ...route.request().postDataJSON(), updatedAt: "2026-08-14T03:00:00.000Z" } });
    }
    if (path.endsWith("/workflow-draft")) return route.fulfill({ json: { completed: true, draft: { step: 5, unlocked: 5 }, updatedAt: null } });
    if (path.endsWith("/contract") && method === "PUT") return route.fulfill({ json: { version: 2, hash: "e2e-22" } });
    if (path.endsWith("/contract")) return route.fulfill({ json: { version: 1, contract } });
    if (path.endsWith("/kit")) return route.fulfill({ json: { variant: "chinh", cutAt: null, sheets: {}, files: [] } });

    if (path.endsWith("/runs")) return route.fulfill({ json: { items: [failedRun] } });
    if (path.startsWith("/api/runs/") && path.endsWith("/stream")) return route.fulfill({ body: "" });
    if (path.startsWith("/api/runs/")) return route.fulfill({ json: failedRun });

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

test("① thẻ Home nói lượt gen vừa rồi ĐÃ CHẾT, không im lặng là «Chưa vẽ»", async ({ page }) => {
  await page.goto("/");

  const card = page.locator("[data-project-card]").filter({ hasText: burned.name }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });

  /* Đây chính là dòng trước kia KHÔNG tồn tại: `ok=0` ⇒ `rawPresent=0` ⇒ thẻ suy ra
     «Chưa vẽ» và một dự án vừa cháy rụi trông y hệt dự án chưa từng chạy. */
  await expect(card).toContainText("Lỗi 2/2 tấm");
  /* `aria-label` là hợp đồng «đúng MỘT dòng trạng thái» của thẻ. Trước bản vá nó đọc
     «Tết cháy rụi — Chưa vẽ»; đó mới là chỗ sự im lặng nằm.
     (Ảnh bìa vẫn nói "Chưa vẽ ảnh nào" — câu đó nói về ẢNH BÌA và nó đúng: lượt chạy
     có tạo được tấm nào đâu mà vẽ bìa. Không gộp hai thứ làm một.) */
  await expect(card).toHaveAttribute("aria-label", /Lỗi 2\/2 tấm/);
  await expect(card).not.toHaveAttribute("aria-label", /Chưa vẽ/);
  // Chấm màu là thứ PHỤ; nghĩa vẫn nằm ở chữ + aria-label (§5.8-A3 «không chỉ bằng màu»).
  await expect(card).toHaveAttribute("data-kit-run", "danger");
});

test("② đầu trang «Ảnh đã tạo» có dải tổng kết kèm BẰNG CHỨNG, khỏi mở từng ô", async ({ page }) => {
  await page.goto(`/p/${burned.id}?section=images`);

  const banner = page.locator("[data-run-fail-banner]");
  await expect(banner).toBeVisible({ timeout: 15_000 });

  // Câu gộp do agent dựng — mọi bề mặt nói CÙNG một câu, màn không tự chế.
  await expect(banner).toContainText("2/2 job không ghi được ảnh");
  // Chẩn đoán của lượt đỏ đầu tiên…
  await expect(banner).toContainText("chạy xong nhưng ảnh không được ghi");
  // …và NGUYÊN NHÂN THẬT, thứ trước kia chỉ có trong events.ndjson.
  await expect(banner).toContainText("rc=127");

  // Bằng chứng đã redact: không một đường dẫn tuyệt đối nào lọt ra màn hình.
  const shown = (await banner.textContent()) ?? "";
  expect(shown).not.toMatch(/(^|\s)\/(Users|home|var|private|tmp)\//);

  await expect(banner.getByRole("button", { name: "Tạo lại toàn bộ" })).toBeVisible();
  await expect(banner.getByRole("button", { name: "Copy chẩn đoán" })).toBeVisible();

  /* Dải này đứng TRƯỚC lưới kết quả: cả tính năng vô nghĩa nếu phải cuộn mới thấy. */
  const bannerBox = await banner.boundingBox();
  const gridBox = await page.getByRole("tab", { name: "Ảnh thật" }).boundingBox();
  expect(bannerBox!.y).toBeLessThan(gridBox!.y);
});

test("③ «Copy chẩn đoán» chép khối text CỤC BỘ, không lộ path tuyệt đối", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: "http://127.0.0.1:9323" });
  await page.goto(`/p/${burned.id}?section=images`);

  const banner = page.locator("[data-run-fail-banner]");
  await expect(banner).toBeVisible({ timeout: 15_000 });
  await banner.getByRole("button", { name: "Copy chẩn đoán" }).click();

  const copied = await page.evaluate(() => navigator.clipboard.readText());

  // Đủ để dev trả lời mà không phải hỏi vòng vo.
  expect(copied).toContain("r-0003");
  expect(copied).toContain("2/2 job không ghi được ảnh");
  expect(copied).toContain("rc=127");
  expect(copied).toContain("Công cụ local: 2.1.21");
  expect(copied).toMatch(/Hệ điều hành: (macOS|Windows|Linux)/);

  // TRẦN DỮ LIỆU: không path tuyệt đối, không biến môi trường, không nguyên userAgent.
  expect(copied).not.toMatch(/(^|\s)\/(Users|home|var|private|tmp)\//);
  expect(copied).not.toContain("AppleWebKit");
  expect(copied).not.toMatch(/sk-[A-Za-z0-9_-]{16,}/);
});
