#!/usr/bin/env node
/**
 * check-button-contrast.mjs — CỔNG cho B1/B2/B6.
 *
 * Đọc bảng class THẬT do test DOM xuất ra (`src/__tests__/__artifacts__/button-classes.json`,
 * sinh bởi `zz-*.dom.test.tsx`), giải mã trên CSS bundle thật rồi đo tương phản
 * chữ/nền ở CẢ HAI trạng thái: bình thường và bị khoá.
 *
 * BẮT ĐƯỢC 3 BỆNH:
 *   ① nút khoá làm mờ bằng `opacity` (chữ tàng hình — B1)
 *   ② nút có nền đặc mà KHÔNG khai màu chữ ⇒ chữ kế thừa, chìm trên nền (B6/B2)
 *   ③ mọi cặp chữ/nền dưới 4.5:1
 *
 * Chạy: npm run btncontrast   (cần `npm run build:only` và test DOM chạy trước)
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadBundleCss, loadTokens, finalColors, contrast, hex } from "./css-resolve.mjs";

const ART = resolve(import.meta.dirname, "../src/__tests__/__artifacts__/button-classes.json");
if (!existsSync(ART)) {
  console.error("Thiếu bảng class. Chạy trước:\n  npx vitest run --config src/features/design/__tests__/vitest.dom.config.ts zz-button-classes");
  process.exit(2);
}
const cases = JSON.parse(readFileSync(ART, "utf8"));
const { name, css } = loadBundleCss();

const THEMES = [
  ["dark", loadTokens(/:root,\s*\.dark\s*\{/)],
  ["light", { ...loadTokens(/:root,\s*\.dark\s*\{/), ...loadTokens(/\.light\s*\{/) }],
];

let fails = 0, total = 0;
console.log(`CSS bundle: ${name}\n`);
for (const [theme, tokens] of THEMES) {
  console.log(`=== THEME ${theme.toUpperCase()} ===`);
  for (const c of cases) {
    const classList = c.class.split(/\s+/).filter(Boolean);
    const r = finalColors(css, tokens, classList, { pseudo: c.pseudo ?? "" });
    total++;
    const problems = [];
    if (r.opacity !== "1") problems.push(`làm mờ bằng opacity=${r.opacity} (B1)`);
    if (!r.declaredColor) problems.push("KHÔNG khai màu chữ ⇒ chữ kế thừa, có thể chìm (B6)");
    const ratio = r.fg ? contrast(r.fg, r.bg) : null;
    if (ratio !== null && ratio < 4.5) problems.push(`tương phản ${ratio}:1 < 4.5`);
    const ok = problems.length === 0;
    if (!ok) fails++;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(42)} ` +
      `chữ ${r.fg ? hex(r.fg) : "(kế thừa)"} trên nền ${hex(r.bg)} = ${ratio ?? "?"}`,
    );
    for (const p of problems) console.log(`        ↳ ${p}`);
  }
}
console.log(`\nKẾT QUẢ: ${total - fails}/${total} PASS`);
process.exit(fails ? 1 : 0);
