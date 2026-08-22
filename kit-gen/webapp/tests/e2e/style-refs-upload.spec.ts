import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * ══ ĐỢT 2026-08-14 (chiều) — HAI Ô THẢ ẢNH CỦA BƯỚC PHONG CÁCH ══════════════
 *
 * Chủ sản phẩm gửi ảnh chụp màn và chê thẳng. Ba lỗi đọc được từ chính ảnh đó:
 *  ① vùng thả là một băng nét đứt cao lêu nghêu, nút "Chọn ảnh" mỗi khối một chỗ;
 *  ② ảnh đã tải nằm LƠ LỬNG bên ngoài vùng thả, lệch trái, dấu ✕ đè góc ảnh;
 *  ③ card "Màu nền tách" chiếm nửa hàng mà bên trong chỉ có một dòng chữ (ô đó nay đã bỏ hẳn).
 *
 * File riêng chứ không nối vào `shell-smoke.spec.ts`: các ca dưới đây cần một dự án
 * ĐÃ CÓ SẴN ảnh ref trên đĩa (để lưới có ảnh mà xếp), còn fixture của smoke là dự án
 * trắng. Ca nào cũng đo HÌNH DẠNG THẬT (vị trí DOM, khung bao, số ô của lưới), không
 * đo tên class — đổi class mà layout vẫn đúng thì không được làm ai đỏ.
 */

const PID = "phong-cach-e2e";
const PNG_1x1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

const project = {
  id: PID, name: "Phong cách E2E", slug: "phong-cach", tags: ["kg-workflow"],
  updatedAt: "2026-08-14T09:00:00.000Z",
  cover: null,
  stats: { rawPresent: 0, kitsCut: 0 },
  state: { stale: false, staleReason: [], jobs: {} },
  workflow: { completed: false, updatedAt: "2026-08-14T09:00:00.000Z" },
};

const health = {
  ok: true, app: "kitgen-agent", protocol: 1, version: "1.2.0",
  workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:e2e-style", projects: 1, activeRuns: 0,
};

/** Hai ảnh phong cách + một ảnh brand ĐÃ nằm trên đĩa — `refKindOf` đọc kind từ tiền tố tên. */
const refItems = [
  { name: "inspo-1.png", bytes: 120, w: 8, h: 8, mtime: "2026-08-14T08:00:00.000Z", usedBy: [] },
  { name: "inspo-2.png", bytes: 120, w: 8, h: 8, mtime: "2026-08-14T08:01:00.000Z", usedBy: [] },
  { name: "brand-1.png", bytes: 120, w: 8, h: 8, mtime: "2026-08-14T08:02:00.000Z", usedBy: [] },
];

async function mockAgent(page: Page) {
  await page.route("**/health", async (route: Route) => route.fulfill({ json: health }));
  await page.route("**/api/**", async (route: Route) => {
    const path = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (path.startsWith("/src/")) return route.continue();

    if (path === "/api/projects") {
      return route.fulfill({ json: { scannedAt: "2026-08-14T09:00:00.000Z", workspaceLabel: "~/KitGen", workspaceFingerprint: "sha256:e2e-style", items: [project] } });
    }
    if (path === `/api/projects/${PID}`) return route.fulfill({ json: { project } });
    if (path.endsWith("/file")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: Buffer.from(PNG_1x1, "base64") });
    }
    if (path.endsWith("/refs")) {
      if (method === "POST") return route.fulfill({ status: 201, json: { items: refItems } });
      return route.fulfill({ json: { items: refItems } });
    }
    if (path.endsWith("/workflow-draft") && method === "PUT") {
      return route.fulfill({ json: { ...route.request().postDataJSON(), updatedAt: "2026-08-14T09:00:00.000Z" } });
    }
    if (path.endsWith("/workflow-draft")) return route.fulfill({ json: { completed: false, draft: null, updatedAt: null } });
    if (path.endsWith("/contract")) return route.fulfill({ json: { version: 0, contract: null } });
    if (path === "/api/library") return route.fulfill({ json: { version: 3, settings: {}, poseTemplates: [], items: [] } });
    if (path === "/api/usage") return route.fulfill({ json: { week: { used: 0, limit: 100 } } });
    return route.fulfill({ json: {} });
  });
}

test.beforeEach(async ({ page }) => {
  await mockAgent(page);
});

/** Mở bước ② Phong cách của wizard. */
async function openStyleStep(page: Page) {
  await page.goto(`/k/${PID}`);
  await page.getByRole("button", { name: "Tiếp theo" }).click();
  await expect(page.getByRole("heading", { name: "Phong cách", exact: true })).toBeVisible();
}

/** Khối tải ảnh mang nhãn `label` — lấy theo TỔ TIÊN của nhãn, không theo class. */
const block = (page: Page, label: string) =>
  page.locator("div").filter({ has: page.getByText(label, { exact: true }) }).last();

test("hai khối tải ảnh giống hệt nhau: nhãn · đếm n/8 · một khung ảnh", async ({ page }) => {
  await openStyleStep(page);

  for (const [label, count] of [["Ảnh phong cách", "2/8"], ["Ảnh thương hiệu", "1/8"]] as const) {
    const head = block(page, label);
    await expect(head.getByText(count, { exact: true })).toBeVisible();
  }
  // Cùng một component ⇒ cùng bề ngang. Lệch > 1px là hai khối đã trôi khỏi nhau.
  const boxes = await page.locator(".dropfield").evaluateAll((nodes) =>
    nodes.map((n) => ({ w: Math.round(n.getBoundingClientRect().width), top: Math.round(n.getBoundingClientRect().top) })));
  expect(boxes.length).toBe(2);
  expect(Math.abs(boxes[0]!.w - boxes[1]!.w)).toBeLessThanOrEqual(1);
  expect(Math.abs(boxes[0]!.top - boxes[1]!.top)).toBeLessThanOrEqual(1);
});

test("ảnh đã tải nằm TRONG khung vùng thả, và ô cuối là «Thêm ảnh»", async ({ page }) => {
  await openStyleStep(page);

  const field = page.locator(".dropfield").first();
  const thumbs = field.locator(".ref-preview-card");
  await expect(thumbs).toHaveCount(2);

  // ① mọi thumbnail nằm gọn trong khung — đây chính là "không còn lơ lửng bên ngoài".
  const frame = (await field.boundingBox())!;
  for (let i = 0; i < 2; i += 1) {
    const box = (await thumbs.nth(i).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(frame.x - 1);
    expect(box.y).toBeGreaterThanOrEqual(frame.y - 1);
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height + 1);
  }

  // ② ô "Thêm ảnh" là ô CUỐI của cùng lưới đó: cùng hàng, ngay sau ảnh cuối.
  const add = field.getByRole("button", { name: /Thêm ảnh/ });
  const addBox = (await add.boundingBox())!;
  const lastThumb = (await thumbs.nth(1).boundingBox())!;
  expect(addBox.x).toBeGreaterThan(lastThumb.x);
  expect(Math.abs(addBox.y - lastThumb.y)).toBeLessThanOrEqual(2);
  // …cao ĐÚNG BẰNG một ô ảnh (hàng cuối không so le)…
  expect(Math.abs(addBox.height - lastThumb.height)).toBeLessThanOrEqual(2);
  // …và không còn là BĂNG NGANG chiếm trọn bề rộng như bản bị chê.
  expect(addBox.width).toBeLessThanOrEqual(frame.width / 2);
});

test("dấu ✕ chỉ hiện khi trỏ vào đúng ảnh đó", async ({ page }) => {
  await openStyleStep(page);

  const card = page.locator(".ref-preview-card").first();
  const remove = card.getByRole("button", { name: /Xoá ảnh/ });
  expect(await remove.evaluate((n) => getComputedStyle(n).opacity)).toBe("0");
  await card.hover();
  await expect.poll(async () => remove.evaluate((n) => getComputedStyle(n).opacity)).toBe("1");
  // Bàn phím vẫn tới được: focus cũng phải làm nó hiện, nếu không đó là đích vô hình.
  await page.mouse.move(0, 0);
  await remove.focus();
  await expect.poll(async () => remove.evaluate((n) => getComputedStyle(n).opacity)).toBe("1");
});

/**
 * Ca này TRƯỚC ĐÂY đo kích thước hàng "Màu nền tách:" — một hàng chữ nhỏ thay cho
 * cái card nửa hàng của bản cũ (③ ở đầu file). Nay cả hàng đó cũng đã bỏ: nền sheet
 * là alpha thật, `gen.sh` không nhắc màu key nào, nên hỏi người dùng chọn màu nền
 * tách là hứa suông.
 *
 * Đổi thành phép PHỦ ĐỊNH thay vì xoá — nó canh đúng cái bẫy cũ: ô này từng mọc lại
 * hai lần dưới hai hình (card, rồi hàng). Và đo luôn rằng bước Phong cách vẫn còn
 * nguyên hai khối tải ảnh, để "bỏ ô nền tách" không lỡ tay cắt mất hàng xóm.
 */
test("@visual bước Phong cách KHÔNG còn ô «Màu nền tách»", async ({ page }, testInfo) => {
  await openStyleStep(page);

  await expect(page.getByText(/Màu nền tách/)).toHaveCount(0);
  await expect(page.getByText(/Magenta|Xanh lá/)).toHaveCount(0);
  await expect(page.getByText("Ảnh phong cách", { exact: true })).toBeVisible();
  await expect(page.getByText("Ảnh thương hiệu", { exact: true })).toBeVisible();

  await page.screenshot({ path: testInfo.outputPath("style-step-uploads.png"), fullPage: true, animations: "disabled" });
});
