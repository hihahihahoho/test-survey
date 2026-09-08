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
 * Cổng đi CẢ HAI CHIỀU: luật ①/② hỏi "class trong TSX có sinh CSS không", luật ③
 * hỏi ngược lại "rule trong CSS có ai đeo không".
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

/* ==========================================================================
   LUẬT ③ — RULE MỒ CÔI: có rule trong CSS của repo, KHÔNG class nào trong TSX
   --------------------------------------------------------------------------
   Luật ② đi chiều TSX → CSS. Chiều NGƯỢC LẠI chưa ai canh, và nó cháy thật: sáu
   đợt dọn màn (wizard, canvas, design, kết quả cũ) xoá hết TSX nhưng để lại
   ~350 dòng rule trong `globals.css` — `.prompt-studio-*`, `.result-*`,
   `.workflow-*`, `.kitset-*`, `.studio-*`. Một rule không ai đeo không làm vỡ gì,
   nên không cổng nào kêu; cái giá là người sau đọc CSS ra một cái app không tồn
   tại, và sửa nhầm vào đó.

   Cách đo: gom nội dung MỌI chuỗi nháy trong src (bỏ chú thích) — `className=…`,
   `cn(...)`, biến trung gian, chuỗi HTML mà `figma-node.ts` dựng. Rồi mỗi tên
   class xuất hiện trong SELECTOR của file .css nào đó phải khớp nguyên token ở
   đâu đó trong đống chuỗi ấy. Không khớp ⇒ rule mồ côi.

   Phạm vi CỐ Ý HẸP, nói rõ chứ không giả vờ phủ hết:
   - chỉ đọc file .css TRONG src/ (nguồn của repo). `vendor/` và node_modules
     không phải của mình, không dọn.
   - selector lấy từ prelude của rule (phần trước `{`), không phải cả file:
     tên class nằm trong chú thích hay trong `content: ".foo"` không tính.
   - class GHÉP ĐỘNG (`kg-tint-${tone}`) không có mặt nguyên vẹn trong chuỗi nào.
     Bắt bằng tiền tố: nếu src có `"kg-tint-"` đứng ngay trước một `${`, cả họ
     `kg-tint-*` được coi là sống. Cùng giới hạn của luật ①/②.
   - `CSS_ALLOW` dưới đây là allowlist cho thứ KHÔNG BAO GIỜ xuất hiện trong TSX
     của repo: trạng thái/toàn cục do trình duyệt gắn, và class do thư viện thứ
     ba gắn vào DOM (`sonner`, `cmdk`, TipTap/ProseMirror, Radix). Nó là danh
     sách TÊN, nên phải ngắn và có lý do — mỗi dòng ghi ai gắn class đó.
   ========================================================================== */

/** Class KHÔNG do TSX của repo gắn — đừng đòi chúng có mặt trong `className`. */
const CSS_ALLOW = [
  // theme: `lib/store/ui.ts` gắn bằng classList, không qua className
  /^(?:dark|light)$/,
  // trạng thái do CSS/thư viện bật-tắt, luôn đi kèm một class cha đã kiểm
  /^(?:is|has)-[a-z0-9-]+$/,
  /^(?:active|selected|open|disabled|checked)$/,
  // TipTap / ProseMirror tự gắn vào contenteditable
  /^ProseMirror/, /^tiptap/, /^node-/,
  // sonner (toast) và cmdk (command palette) tự gắn vào portal của chúng
  /^(?:toaster|sonner)/, /^cmdk-/,
  // Radix để lại data-* chứ không phải class; giữ tiền tố cho bản nào có
  /^radix-/,
];

/** Mọi file .css của repo (bỏ vendor / node_modules). */
function walkCss(dir, acc = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "vendor") continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkCss(p, acc);
    else if (e.name.endsWith(".css")) acc.push(p);
  }
  return acc;
}

/** Bỏ chú thích CSS, giữ số dòng. */
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

/** Prelude của mỗi rule (phần trước `{`), kèm số dòng. At-rule bị bỏ. */
function preludes(css) {
  const s = stripCss(css);
  const out = [];
  let buf = "", line = 1, at = 1;
  for (const c of s) {
    if (c === "\n") line++;
    if (c === "{") {
      const sel = buf.trim();
      if (sel && !sel.startsWith("@")) out.push({ sel, line: at });
      buf = ""; at = line;
    } else if (c === "}" || c === ";") { buf = ""; at = line; }
    else { if (!buf.trim()) at = line; buf += c; }
  }
  return out;
}

/** Nội dung MỌI chuỗi nháy trong src (đã bỏ chú thích) — đống cỏ để dò class. */
const HAY = walk(join(root, "src"))
  .map((f) => (stripComments(readFileSync(f, "utf8")).match(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g) ?? []).join("\n"))
  .join("\n");

/** Có ai gõ nguyên token `name` trong một chuỗi của src không? */
const inSrc = (name) => new RegExp(`(^|[^\\w-])${name}([^\\w-]|$)`).test(HAY);
/** Class ghép động: `"kg-tint-" + tone` / `` `kg-tint-${tone}` `` */
function builtByPrefix(name) {
  for (let i = name.length - 1; i > 2; i--) {
    const pre = name.slice(0, i);
    if (!pre.endsWith("-")) continue;
    if (new RegExp(`(^|[^\\w-])${pre}(\\$\\{|$)`, "m").test(HAY)) return pre;
  }
  return null;
}

const deadRules = [];
for (const cssFile of walkCss(join(root, "src"))) {
  const seenHere = new Set();
  for (const { sel, line } of preludes(readFileSync(cssFile, "utf8"))) {
    for (const m of sel.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
      const name = m[1];
      if (seenHere.has(name)) continue;
      seenHere.add(name);
      if (CSS_ALLOW.some((re) => re.test(name))) continue;
      if (inSrc(name) || builtByPrefix(name)) continue;
      deadRules.push({ name, file: cssFile.slice(root.length) + ":" + line });
    }
  }
}

for (const d of dead) console.log(`  FAIL  class KHÔNG sinh ra CSS: ${d.cls}   (${d.file})`);
for (const [cls, file] of orphan) console.log(`  FAIL  class MỒ CÔI (không rule .${cls} trong CSS): ${cls}   (${file})`);
for (const r of deadRules) console.log(`  FAIL  RULE MỒ CÔI (rule .${r.name} không class nào trong TSX): ${r.file}`);

const bad = dead.length + orphan.size + deadRules.length;
console.log(
  bad === 0
    ? `KẾT QUẢ: 0 class chết — hai chiều sạch (luật ①: ${seen.size} class có rủi ro · luật ②: ${orphan.size} class mồ côi · luật ③: ${deadRules.length} rule mồ côi · CSS ${(css.length / 1024) | 0} KB)`
    : `KẾT QUẢ: ${bad} CLASS CHẾT (luật ①: ${dead.length} · luật ②: ${orphan.size} class mồ côi · luật ③: ${deadRules.length} rule mồ côi)`,
);
process.exit(bad === 0 ? 0 : 1);
