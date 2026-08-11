#!/usr/bin/env node
/**
 * CỔNG KIỂM ĐỊNH MỚI — "class chết".
 *
 * Bài học đắt nhất của lượt React: `tsc` xanh, 688 test xanh, `vite build` xanh,
 * `npm run contrast` 93/93 PASS — trong khi 6 class trắng-mờ và 4 class cỡ modal
 * KHÔNG hề sinh ra CSS. Không cổng nào bắt được, vì không cổng nào so JSX với CSS
 * ĐÃ BIÊN DỊCH. Script này làm đúng việc đó:
 *   1. biên dịch Tailwind bằng CHÍNH config của repo,
 *   2. trích các class "có rủi ro" từ src/**,
 *   3. class nào không có mặt trong CSS đầu ra ⇒ FAIL.
 *
 * Chỉ soi lớp class tĩnh, viết thẳng trong chuỗi. Class ghép động (`text-${x}`)
 * nằm ngoài tầm — script KHÔNG giả vờ phủ hết, và nói rõ ở đây.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = new URL("..", import.meta.url).pathname;
const out = join(mkdtempSync(join(tmpdir(), "kg-css-")), "out.css");

execFileSync("npx", ["tailwindcss", "-i", "src/styles/globals.css", "-o", out], {
  cwd: root, stdio: "pipe",
});
const css = readFileSync(out, "utf8");

/** Đọc mọi file nguồn. */
function walk(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name) && !p.includes("__tests__")) acc.push(p);
  }
  return acc;
}

/** Tiền tố mang màu/kích thước — nơi lỗi "token không tồn tại" thật sự xảy ra. */
const RISKY =
  /\b(?:hover:|focus:|focus-visible:|active:|disabled:|group-hover:|data-\[[^\]]+\]:|sm:|md:|lg:|xl:|2xl:)*(?:bg|text|border|ring|fill|stroke|max-w|min-w|w|h|max-h)-[a-z][a-z0-9-]*(?:\/(?:\[[0-9.]+\]|[0-9]{1,3}))?\b/g;

/** Escape đúng cách Tailwind sinh selector. */
const esc = (c) => c.replace(/[.:/[\]]/g, (m) => "\\" + m);

const seen = new Map();
for (const f of walk(join(root, "src"))) {
  const src = readFileSync(f, "utf8");
  for (const m of src.match(RISKY) ?? []) {
    if (!seen.has(m)) seen.set(m, f.slice(root.length));
  }
}

/** Class không phải Tailwind (prop tên trùng, chuỗi trong comment) sẽ lọt vào.
    Nên chỉ báo lỗi với nhóm token màu semantic + cỡ modal — nhóm đã cháy thật. */
const WATCH = /-(?:white|black|modal-(?:sm|md|lg|xl)|gray|slate|zinc|neutral|blue|red|green|yellow)\b/;

const dead = [];
for (const [cls, file] of seen) {
  if (!WATCH.test(cls)) continue;
  const base = cls.split(":").pop();
  if (!css.includes(esc(base)) && !css.includes(base)) dead.push({ cls, file });
}

/* ==========================================================================
   LUẬT ② (W2A-5) — CLASS MỒ CÔI: có trong `className`, KHÔNG có rule trong CSS
   --------------------------------------------------------------------------
   Vì sao cần dù đã có luật ①: `WATCH` của luật ① là một allowlist TÊN CỨNG
   (white|black|modal-*|gray|…), nên nó chỉ soi được nhóm token màu/cỡ đã từng
   cháy. Ba class `workflow-choice` / `brand-ref` / `mascot-dropzone` sống trong
   TSX suốt nhiều vòng review mà KHÔNG có một dòng CSS nào — không phải utility
   Tailwind, không có rule trong file CSS nào ⇒ ba khối đó render TRẦN. Luật ①
   không thấy vì tên chúng không nằm trong allowlist. Đây là lỗ hổng hình dạng,
   không phải lỗ hổng danh sách, nên phải vá bằng một luật khác hình dạng.

   Cách đo: Tailwind JIT sinh CSS TỪ CHÍNH src này. Nên mọi utility có thật mà
   đang được dùng CHẮC CHẮN có mặt trong CSS đầu ra. Một class đơn nằm trong
   `className` mà không có rule `.<tên>` nào ⇒ hoặc là utility gõ sai, hoặc là
   class tự chế chưa ai viết thân. Cả hai đều là lỗi.

   Phạm vi CỐ Ý HẸP (nói rõ chứ không giả vờ phủ hết):
   - chỉ đọc chuỗi nháy nằm trong `className=…` (kể cả trong `cn(...)`);
     template literal `${}` bỏ qua — class ghép động ngoài tầm, y như luật ①.
   - chỉ xét token ĐƠN GIẢN `a-z0-9-`: không biến thể `hover:`, không alpha `/`,
     không giá trị ngoặc vuông. Ba dạng kia sinh selector đã escape, so sánh dễ
     báo động giả, và luật ① đã canh đúng nhóm rủi ro của chúng.
   - **bắt buộc có dấu gạch nối**. Đây là bộ lọc quan trọng nhất và có lý do đo
     được: biểu thức `className` chứa đầy chuỗi KHÔNG PHẢI class — nhánh so sánh
     (`variant === "danger"`), khoá enum (`side === "vertical"`), tham số
     (`buttonVariants({ variant: "secondary" })`). Chạy thử không lọc: 24 báo động
     giả, **toàn bộ đều là từ đơn**, trong khi cả 6 phát hiện thật đều có gạch nối
     (`workflow-choice`, `brand-ref`, `mascot-dropzone`, `max-w-content`,
     `bg-tint-warn`, `text-xl`). Cái giá phải trả, nói thẳng: class tự chế MỘT TỪ
     mà chưa ai viết thân sẽ lọt. Đổi lại cổng không bao giờ kêu oan — một cổng
     hay kêu oan là cổng sẽ bị tắt.
   - chú thích bị xoá TRƯỚC khi quét: file này và `check-contrast.mjs` đều có
     comment kể lại chuỗi cũ; quét thô sẽ đo chính lời giải thích.
   ========================================================================== */

/** Xoá `//…` và `/*…*\/`, giữ nguyên số ký tự để vị trí không lệch. */
function stripComments(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + " ".repeat(m.length - p1.length));
}

/** Đọc trọn biểu thức của một `className=…`, trả về đoạn text của biểu thức đó. */
function classNameExpr(src, from) {
  let i = from;
  while (i < src.length && /\s/.test(src[i])) i++;
  if (src[i] === '"' || src[i] === "'") {
    const q = src[i];
    const end = src.indexOf(q, i + 1);
    return end === -1 ? "" : src.slice(i, end + 1);
  }
  if (src[i] !== "{") return "";
  let depth = 0;
  const start = i;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return "";
}

/** Marker class: Tailwind CỐ Ý không sinh rule `.group`/`.peer` đứng một mình —
    chúng chỉ tồn tại để `group-*:`/`peer-*:` bám vào. Không phải class chết. */
const MARKERS = new Set(["group", "peer"]);
/** token đơn giản VÀ có ít nhất một gạch nối — xem lý do ở khối chú thích trên. */
const SIMPLE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/;
/** Có rule `.tên` thật trong CSS đầu ra (không dính `.tên-gì-đó`). */
const hasRule = (name) => new RegExp(`\\.${name}(?![\\w-])`).test(css);

const orphan = new Map();
for (const f of walk(join(root, "src"))) {
  const src = stripComments(readFileSync(f, "utf8"));
  for (let i = src.indexOf("className"); i !== -1; i = src.indexOf("className", i + 1)) {
    const eq = src.indexOf("=", i + "className".length);
    if (eq === -1 || src.slice(i + "className".length, eq).trim() !== "") continue;
    const expr = classNameExpr(src, eq + 1);
    for (const lit of expr.match(/"[^"\n]*"|'[^'\n]*'/g) ?? []) {
      for (const tok of lit.slice(1, -1).split(/\s+/)) {
        if (!tok || !SIMPLE.test(tok) || MARKERS.has(tok)) continue;
        if (hasRule(tok)) continue;
        if (!orphan.has(tok)) orphan.set(tok, f.slice(root.length));
      }
    }
  }
}

for (const d of dead) console.log(`  FAIL  class KHÔNG sinh ra CSS: ${d.cls}   (${d.file})`);
for (const [cls, file] of orphan) console.log(`  FAIL  class MỒ CÔI (không rule .${cls} trong CSS): ${cls}   (${file})`);

const bad = dead.length + orphan.size;
console.log(
  bad === 0
    ? `KẾT QUẢ: 0 class chết (luật ①: ${seen.size} class có rủi ro · luật ②: ${orphan.size} mồ côi · CSS ${(css.length / 1024) | 0} KB)`
    : `KẾT QUẢ: ${bad} CLASS CHẾT (luật ①: ${dead.length} · luật ②: ${orphan.size} mồ côi)`,
);
process.exit(bad === 0 ? 0 : 1);
