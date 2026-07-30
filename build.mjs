#!/usr/bin/env node
/* ============================================================================
   build.mjs — authoring/*.mjs  →  surveys/*.json + surveys/manifest.json

   Chạy:  node build.mjs            (build tất cả, in báo cáo lint)
          node build.mjs --check    (chỉ kiểm tra, không ghi file)
          node build.mjs --google   (ghi thêm bản đã strip cho Google Forms)
          node build.mjs --dist     (ghi thêm dist/ để deploy trang tĩnh)

   Thêm survey mới:
     1. tạo authoring/<id>.mjs, export `meta` và `build()`
     2. node build.mjs
   ========================================================================== */

import { readdir, writeFile, mkdir, copyFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { lint, walk } from "./authoring/helpers.mjs";

const ROOT = dirname(fileURLToPath(import.meta.url));
const AUTHOR_DIR = join(ROOT, "authoring");
const OUT_DIR = join(ROOT, "surveys");
const DIST_DIR = join(ROOT, "dist");
const CHECK_ONLY = process.argv.includes("--check");
const ALSO_DIST = process.argv.includes("--dist");
/* --dist luôn kèm bản Google, vì trang demo cũng cho tải file đó. */
const ALSO_GOOGLE = process.argv.includes("--google") || ALSO_DIST;

/* surveys/*.json giữ nguyên `_exclusive` — engine cần marker này để biết ô nào
   là ô thoát ("Không dùng cái nào"). Không đoán theo nhãn được, vì nhiều phương
   án hợp lệ cũng bắt đầu bằng "Không".
   Google Forms batchUpdate lại từ chối field lạ, nên bản đưa sang Google phải
   strip: dùng nút "Tải JSON" trong trình xem, hoặc `node build.mjs --google`. */
function forGoogleForms(form) {
  const out = JSON.parse(JSON.stringify(form));
  out.items.forEach(it => {
    const cq = it.questionItem && it.questionItem.question.choiceQuestion;
    if (cq) cq.options.forEach(o => { delete o._exclusive; });
  });
  return out;
}

const files = (await readdir(AUTHOR_DIR))
  .filter(f => f.endsWith(".mjs") && f !== "helpers.mjs")
  .sort();

if (!files.length) {
  console.error("Không tìm thấy file survey nào trong authoring/");
  process.exit(1);
}

const manifest = [];
let hardFail = false;

for (const file of files) {
  const mod = await import(pathToFileURL(join(AUTHOR_DIR, file)).href);
  if (typeof mod.build !== "function" || !mod.meta?.id) {
    console.error(`✗ ${file}: cần export cả \`meta\` (có id) và \`build()\``);
    hardFail = true;
    continue;
  }

  const form = mod.build();
  const { errors, warnings, stats } = lint(form);

  console.log(`\n── ${mod.meta.id} ─────────────────────────────────`);
  console.log(`   ${stats.total} câu · ${stats.required} bắt buộc · ` +
              `${stats.grids} grid (${stats.gridRows} dòng) · ` +
              `${stats.branches} câu phân nhánh · ~${stats.minutes} phút`);

  /* mô phỏng các nhánh chính để chắc skip-logic không bỏ sót / lặp */
  const gateG = "Bạn có làm ảnh tĩnh, illustration, graphic hoặc icon không?";
  const gateM = "Bạn có làm animation, motion graphic hoặc video không?";
  const gate3 = "Bạn có làm 3D hoặc asset game không?";
  const gateX = "Bạn muốn làm gì tiếp?";
  const paths = {
    "graphic only":  { [gateG]: "Có",    [gateM]: "Không", [gate3]: "Không" },
    "motion only":   { [gateG]: "Không", [gateM]: "Có",    [gate3]: "Không" },
    "3d only":       { [gateG]: "Không", [gateM]: "Không", [gate3]: "Có" },
    "cả ba mảng":    { [gateG]: "Có",    [gateM]: "Có",    [gate3]: "Có" },
    "gửi luôn":      { [gateG]: "Có",    [gateM]: "Không", [gate3]: "Không",
                       [gateX]: "Gửi luôn" }
  };
  for (const [label, ans] of Object.entries(paths)) {
    try {
      const p = walk(form, { ...ans, [gateX]: ans[gateX] ?? "Trả lời thêm phần mở (khoảng 4 phút)" });
      console.log(`   nhánh ${label.padEnd(13)} → ${p.length} phần`);
    } catch (e) {
      console.error(`   ✗ nhánh ${label}: ${e.message}`);
      hardFail = true;
    }
  }

  errors.forEach(e => { console.error(`   ✗ ${e}`); hardFail = true; });
  warnings.forEach(w => console.warn(`   ⚠ ${w}`));
  if (!errors.length && !warnings.length) console.log("   ✓ không có cảnh báo");

  if (!CHECK_ONLY) {
    const app = JSON.stringify(form, null, 2) + "\n";
    const google = JSON.stringify(forGoogleForms(form), null, 2) + "\n";
    const targets = ALSO_DIST ? [OUT_DIR, join(DIST_DIR, "surveys")] : [OUT_DIR];
    for (const dir of targets) {
      await mkdir(dir, { recursive: true });
      await writeFile(join(dir, `${mod.meta.id}.json`), app);
      if (ALSO_GOOGLE) {
        await mkdir(join(dir, "google"), { recursive: true });
        await writeFile(join(dir, "google", `${mod.meta.id}.json`), google);
      }
    }
  }

  manifest.push({
    id: mod.meta.id,
    file: `${mod.meta.id}.json`,
    name: mod.meta.name || form.info.title,
    note: mod.meta.note || "",
    questions: stats.total,
    minutes: stats.minutes
  });
}

if (CHECK_ONLY) {
  console.log("\n(--check: không ghi file)");
  process.exit(hardFail ? 1 : 0);
}

const manifestJson = JSON.stringify({ surveys: manifest }, null, 2) + "\n";
await writeFile(join(OUT_DIR, "manifest.json"), manifestJson);
console.log(`\n✓ Đã ghi ${manifest.length} survey vào surveys/ (kèm manifest.json)`);

/* dist/ là thư mục deploy cho trang tĩnh: chỉ index.html + surveys/.
   Không mang theo authoring/, test/, build.mjs — trang demo không cần. */
if (ALSO_DIST) {
  if (hardFail) {
    console.error("\n✗ Có lỗi cứng — không ghi dist/ để tránh deploy bản sai.");
    process.exit(1);
  }
  await writeFile(join(DIST_DIR, "surveys", "manifest.json"), manifestJson);
  await copyFile(join(ROOT, "index.html"), join(DIST_DIR, "index.html"));
  console.log("✓ Đã ghi dist/ (index.html + surveys/) — sẵn sàng deploy");
}

process.exit(hardFail ? 1 : 0);
