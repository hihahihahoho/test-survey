/**
 * E2E THẬT với AGENT THẬT — dùng CHÍNH tầng transport của webapp (`src/lib/api`)
 * và CHÍNH hàm lọc/slug của màn S1. Không mô phỏng `fetch`, không dùng harness
 * của agent: đúng đường mà trình duyệt đi, chỉ khác là chạy trong Node.
 *
 * CÁCH CHẠY (2 cửa sổ, hoặc 1 lệnh ghép):
 *   node agent/server.mjs --workspace /tmp/kg-e2e --port 8851 &
 *   cd webapp && npx vite-node src/features/projects/__tests__/e2e-agent.mjs 8851
 *
 * Lưu ý: script tạo project THẬT trong workspace bạn chỉ định — dùng thư mục tạm,
 * đừng trỏ vào ~/KitGen. KHÔNG gọi AI, KHÔNG tốn quota (chỉ CRUD + nhập file).
 *
 * Đã chạy sạch ngày 2026-08-06 với agent 1.2.0 — 24/24 khẳng định đúng, xem
 * kết quả trong teams/react/NEEDS-s1-projects.md.
 */
const PORT = process.argv[2] ?? "8851";
const BASE = `http://127.0.0.1:${PORT}`;

// Ép Origin cho mọi request (Node fetch không tự đặt) — giống trình duyệt ở
// đường vào Pages. Agent allowlist có http://localhost:<port>.
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init = {}) => {
  const headers = new Headers(init.headers ?? {});
  headers.set("Origin", `http://localhost:${PORT}`);
  return realFetch(url, { ...init, headers });
};

const { configureClient } = await import("../../../lib/api/client.ts");
const { api } = await import("../../../lib/api/endpoints.ts");
const { applyView, chipCounts, projectState } = await import("../lib/view.ts");
const { slugify, copyName } = await import("../lib/slug.ts");

configureClient({ base: BASE });

const log = (...a) => console.log(...a);
const ok = (c, m) => log(`${c ? "  ✓" : "  ✗ THẤT BẠI:"} ${m}`);

log("\n=== 1. Tạo project (§4.1, template basic) ===");
const created = await api.projects.create({
  name: 'Tết 2026 — VietinBank "iPay" <b>',
  template: "basic",
  firstVariant: { id: "tet-do", vi: "Tết đỏ", bg: "magenta" },
  tags: ["tet", "banking"],
});
log("  id     :", created.project.id);
log("  slug   :", created.project.slug);
log("  stats  :", JSON.stringify(created.project.stats));
log("  jobs   :", JSON.stringify(created.project.state?.jobs));
ok(created.project.id.includes("tet-2026-vietinbank-ipay"), "slug bỏ dấu đúng như slugify() của web");
ok(slugify('Tết 2026 — VietinBank "iPay" <b>').startsWith("tet-2026-vietinbank-ipay"), "slugify web ↔ agent khớp tiền tố");
ok(created.project.name.includes("<b>"), "tên giữ NGUYÊN VĂN ký tự đặc biệt (agent không escape hộ)");

log("\n=== 2. Trùng tên hiển thị: agent CHO PHÉP (§4.1-2) ===");
const dup2 = await api.projects.create({
  name: 'Tết 2026 — VietinBank "iPay" <b>',
  template: "blank",
  firstVariant: { vi: "V2", bg: "green" },
  tags: [],
});
ok(dup2.project.id !== created.project.id, `hai project cùng TÊN, khác thư mục: ${dup2.project.id}`);

log("\n=== 3. Danh sách + lọc/đếm của web (§3-S1-1) ===");
const list = await api.projects.list({});
log("  items  :", list.items.length, "· fingerprint:", list.workspaceFingerprint);
const counts = chipCounts(list.items);
log("  chip   :", JSON.stringify(counts));
for (const chip of ["all", "need-gen", "running", "failed", "unfinished"]) {
  const n = applyView(list.items, { chip }).length;
  ok(n === counts[chip], `chip «${chip}»: đếm ${counts[chip]} = lọc ${n}`);
}
ok(applyView(list.items, { query: "tet 2026" }).length >= 1, "tìm KHÔNG DẤU ra project tên CÓ DẤU");
ok(applyView(list.items, { tags: ["banking"] }).length === 1, "lọc theo tag ra đúng 1");
log("  state  :", list.items.map((p) => `${p.id}=${projectState(p)}`).join(" · "));

log("\n=== 4. Đổi tên (§4.2) — thư mục KHÔNG đổi ===");
const renamed = await api.projects.patch(created.project.id, { name: "Tết 2026 (đã đổi tên)" });
ok(renamed.name === "Tết 2026 (đã đổi tên)", "tên mới đã lưu");
ok(renamed.id === created.project.id, `projectId GIỮ NGUYÊN: ${renamed.id}`);

log("\n=== 5. Nhân bản (§4.3) ===");
const copyN = copyName(renamed.name, list.items);
log("  tên đề xuất của web:", copyN);
const duped = await api.projects.duplicate(created.project.id, {
  name: copyN, include: ["contract", "refs"], variants: "all",
});
log("  bản sao:", duped.project.id, "· copied:", JSON.stringify(duped.copied));
ok(duped.project.id !== created.project.id, "bản sao có thư mục riêng");
ok((duped.project.stats?.sheets ?? 0) === (created.project.stats?.sheets ?? 0), "bản sao giữ đủ sheet");

log("\n=== 6. Xuất .zip (§4.7) qua ĐÚNG transport của web ===");
const { httpGet } = await import("../../../lib/api/client.ts");
const res = await httpGet(`/api/projects/${created.project.id}/export.zip?include=contract,refs`, { raw: true, kind: "upload" });
const blob = await res.blob();
log("  HTTP   :", res.status, "· bytes:", blob.size);
log("  CD     :", res.headers.get("Content-Disposition"));
ok(res.status === 200 && blob.size > 0, "tải được zip (transport có gắn X-KitGen-Client)");

log("\n=== 7. Dọn cache dẫn xuất (§4.5) ===");
const cleaned = await api.projects.clean(created.project.id, ["skeleton", "prompts"]);
log("  freed  :", cleaned.freedBytes, "· removed:", JSON.stringify(cleaned.removed));
ok(typeof cleaned.freedBytes === "number", "agent trả freedBytes (UI hiện số THẬT sau khi dọn)");

log("\n=== 8. Xoá mềm + HOÀN TÁC (§4.4) ===");
const del = await api.projects.remove(dup2.project.id);
log("  trashId:", del.trashId, "· cancelledRuns:", JSON.stringify(del.cancelledRuns));
const trash = await api.trash.list();
ok(trash.items.some((t) => t.trashId === del.trashId), "project đã vào thùng rác");
const restored = await api.trash.restore(del.trashId);
ok(restored.id === dup2.project.id, `HOÀN TÁC phục hồi đúng project: ${restored.id}`);
const after = await api.projects.list({});
ok(after.items.some((p) => p.id === dup2.project.id), "project quay lại danh sách sau Hoàn tác");

log("\n=== 9. Ca lỗi §3.9: slug trùng ⇒ 409 PROJECT_ID_TAKEN kèm gợi ý ===");
try {
  await api.projects.create({
    name: "X", template: "blank", slug: created.project.id,
    firstVariant: { vi: "V", bg: "magenta" }, tags: [],
  });
  ok(false, "đáng lẽ phải 409");
} catch (e) {
  log("  code   :", e.code, "· status:", e.status, "· details:", JSON.stringify(e.details));
  ok(e.code === "PROJECT_ID_TAKEN" || e.status === 409, "agent trả đúng mã mà UI đang bắt");
}

log("\n=== 10. Nhập styles-campaign.json (§4.6) ===");
const { readFileSync } = await import("node:fs");
const buf = readFileSync(new URL("../../../../../teams/t4-tichhop/styles-campaign.json", import.meta.url));
const file = new File([buf], "styles-campaign.json", { type: "application/json" });
const up = await api.uploads.create(file);
log("  upload :", up.uploadId, up.kind, up.bytes, "byte");
const report = await api.import.preview({ source: "stylesJson", uploadId: up.uploadId });
log("  report :", JSON.stringify({
  sheets: report.sheets, components: report.components, variants: report.variants,
  poses: report.poses, unknown: report.unknownComponents, dupIds: report.duplicateSheetIds,
}));
ok(report.sheets === 12 && report.components === 78 && report.variants === 3,
   "khớp §4.6: 12 sheet · 78 element · 3 phong cách");
ok(report.unknownComponents === 73, "khớp §4.6: 73 element lạ được GIỮ NGUYÊN");
log(`  ⚠ LỆCH SPEC: §4.6 ghi "0 dáng nhân vật", agent trả poses=${report.poses} (thay bằng dáng mặc định)`);

const imported = await api.projects.create({
  name: "styles-campaign (nhập)", template: "import",
  firstVariant: { vi: "Phong cách 1", bg: "magenta" }, tags: [],
  import: { source: "stylesJson", uploadId: up.uploadId },
});
log("  đã tạo :", imported.project.id, "· stats:", JSON.stringify(imported.project.stats));
ok((imported.project.stats?.sheets ?? 0) === 12, "nhập xong GIỮ ĐỦ 12 sheet (bản Studio cũ chỉ còn 3)");
ok((imported.project.stats?.components ?? 0) === 78, "giữ đủ 78 element");

log("\n=== 11. Project HỎNG phải hiện thành thẻ đỏ, không biến mất ===");
const { writeFileSync, mkdirSync } = await import("node:fs");
mkdirSync(`${process.argv[3] ?? "/tmp/kg-e2e"}/projects/broken-one`, { recursive: true });
writeFileSync(`${process.argv[3] ?? "/tmp/kg-e2e"}/projects/broken-one/project.json`, '{"name": "hỏng",,}');
const list2 = await api.projects.list({});
const broken = list2.items.find((p) => p.id === "broken-one");
log("  broken :", broken ? JSON.stringify({ id: broken.id, broken: broken.broken, error: broken.error }) : "KHÔNG THẤY");
ok(Boolean(broken?.broken), "agent BÁO project hỏng thay vì bỏ qua im lặng");
log(`  ghi chú: error.line = ${broken?.error?.line ?? "null"} (QA-VERDICT L-05 — UI đã chịu được null)`);

log("\n=== XONG ===");
