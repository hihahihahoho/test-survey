#!/usr/bin/env node
/**
 * CỔNG CHẶN TIÊU TIỀN — `kind:"gen"` (UPGRADE-PLAN §W3-0).
 *
 * ┌──────────────────────────────────────────────────────────────────────────┐
 * │ GỠ CỔNG NÀY CHỈ KHI CHỦ DỰ ÁN CHỐT BẰNG VĂN BẢN.                         │
 * │ `gen.sh:163` (`codex exec`) là dòng tiêu tiền DUY NHẤT của cả hệ thống.  │
 * │ Đường đi tới nó: POST /api/projects/:id/runs với `kind:"gen"`            │
 * │            → agent/lib/engine.mjs:137 → bash gen.sh → gen.sh:163.        │
 * │ 41/42 endpoint còn lại là I/O đĩa thuần — KHÔNG tốn một lượt AI nào.     │
 * │ Khi được chốt: nút Vẽ đi qua features/runs/components/GenerateDialog.tsx │
 * │ ("CỬA DUY NHẤT TIÊU QUOTA" — đã có doctor gate, ước lượng, cảnh báo      │
 * │ quota, xử lý run đang chạy), rồi mới gỡ cổng này.                        │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * VÌ SAO KHÔNG PHẢI MỘT LỆNH `grep`:
 *
 *  ① Comment bị bóc trước khi quét. Một câu giải thích *"không được viết kind:\"gen\""*
 *    không chạy được cái gì cả; nếu cổng đỏ vì chính lời cảnh báo của mình thì người
 *    ta sẽ tắt cổng. Cổng phải đo CODE, không đo văn xuôi. (Cùng thủ pháp mà
 *    `check-dead-classes.mjs` luật ② đã phải dùng, vì đúng lý do đó.)
 *
 *  ② Hai tầng luật cho hai loại file:
 *     · file SẢN PHẨM  — luật CHẶT NHẤT, đúng chữ của plan: chỉ cần NHẮC TÊN
 *       `useStartRun`, hay có chuỗi `kind:"gen"`, là ĐỎ.
 *     · file TEST      — luật theo HÌNH DẠNG LỜI GỌI (`useStartRun(`).
 *       Lý do có thật, không phải nới tay: `features/gen/__tests__/mock-boundary.test.ts:69`
 *       chứa `expect(src).not.toMatch(/useSaveContract|useStartRun|…/)` — tức là một
 *       CỔNG KHÁC đang khẳng định điều y hệt cổng này. Bắt đỏ vì một cổng anh em
 *       gọi tên kẻ bị cấm là bắt nhầm. Test không thể tạo run nếu không có lời gọi;
 *       luật hình-dạng-lời-gọi đóng đủ lỗ đó.
 *
 *  ③ Luật ③ canh CÁI LỖ THẬT SỰ NGUY HIỂM: đường vòng. Workflow không gọi
 *    `useStartRun` mà gọi `useSliceRun` — nếu hook đó nhận `kind` từ nơi gọi thì cổng
 *    này thành vô dụng trong khi vẫn xanh. Vậy nên hook cắt bị soi riêng: `kind` phải
 *    là HẰNG `"slice"` viết thẳng trong mã, không được là biến/tham số.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;

/** Ba vùng cấm — đúng danh sách của plan §W3-0. */
const GUARDED = ["src/features/workflow-v4", "src/features/canvas", "src/features/gen"];

/** Hook cắt: dù nằm ở đâu cũng phải giữ `kind` là hằng (luật ③). */
const SLICE_HOOKS = ["src/features/runs/lib/useSliceRun.ts", "src/features/kit/lib/useKitData.ts"];

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Bóc comment (`//…` và `/*…*\/`) — xem lý do ① ở đầu file. Giữ nguyên độ dài dòng. */
function stripComments(src) {
  let out = "";
  let i = 0;
  let mode = "code"; // code | line | block | s | d | t
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === "code") {
      if (c === "/" && n === "/") { mode = "line"; i += 2; continue; }
      if (c === "/" && n === "*") { mode = "block"; i += 2; continue; }
      if (c === "'") mode = "s";
      else if (c === '"') mode = "d";
      else if (c === "`") mode = "t";
      out += c; i += 1; continue;
    }
    if (mode === "line") { if (c === "\n") { mode = "code"; out += c; } i += 1; continue; }
    if (mode === "block") { if (c === "*" && n === "/") { mode = "code"; i += 2; } else { if (c === "\n") out += c; i += 1; } continue; }
    // trong chuỗi: nuốt escape để `"\""` không kết thúc sớm
    if (c === "\\") { out += c + (n ?? ""); i += 2; continue; }
    if ((mode === "s" && c === "'") || (mode === "d" && c === '"') || (mode === "t" && c === "`")) mode = "code";
    out += c; i += 1;
  }
  return out;
}

const isTest = (p) => p.includes("__tests__") || /\.test\.tsx?$/.test(p);

/** `kind: "gen"` — nháy đơn, nháy kép hay backtick đều tính. */
const RE_KIND_GEN = /kind\s*:\s*["'`]gen["'`]/;
/** `kind:` mà giá trị KHÔNG phải chuỗi viết thẳng ⇒ kind động, không kiểm được bằng mắt. */
const RE_KIND_DYNAMIC = /kind\s*:\s*(?!["'`])[A-Za-z_$]/;

const failures = [];

/* ── Luật ① + ② — ba vùng cấm ───────────────────────────────────────────── */
for (const dir of GUARDED) {
  for (const file of walk(join(root, dir))) {
    const clean = stripComments(readFileSync(file, "utf8"));
    const rel = relative(root, file);
    const lines = clean.split("\n");
    // `useStartRun`: file sản phẩm cấm NHẮC TÊN; file test cấm LỜI GỌI.
    const reStart = isTest(file) ? /\buseStartRun\s*\(/ : /\buseStartRun\b/;
    lines.forEach((line, i) => {
      if (reStart.test(line)) failures.push(`${rel}:${i + 1}  useStartRun — cửa tiêu quota, cấm trong ${dir}`);
      if (RE_KIND_GEN.test(line)) failures.push(`${rel}:${i + 1}  kind:"gen" — LỜI GỌI TIÊU TIỀN, cấm trong ${dir}`);
    });
  }
}

/* ── Luật ③ — hook cắt phải giữ `kind` là hằng ───────────────────────────── */
for (const relPath of SLICE_HOOKS) {
  const file = join(root, relPath);
  if (!existsSync(file)) continue;
  const clean = stripComments(readFileSync(file, "utf8"));
  if (!/kind\s*:\s*["'`]slice["'`]/.test(clean)) {
    failures.push(`${relPath}  — hook cắt KHÔNG còn hằng kind:"slice" viết thẳng trong mã`);
  }
  clean.split("\n").forEach((line, i) => {
    if (RE_KIND_GEN.test(line)) failures.push(`${relPath}:${i + 1}  kind:"gen" trong hook cắt`);
    if (RE_KIND_DYNAMIC.test(line)) failures.push(`${relPath}:${i + 1}  kind ĐỘNG (nhận từ nơi gọi) — hook cắt phải cố định "slice"`);
  });
}

for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(
  failures.length === 0
    ? `KẾT QUẢ: 0 lời gọi tiêu tiền (đã soi ${GUARDED.length} vùng cấm + ${SLICE_HOOKS.filter((p) => existsSync(join(root, p))).length} hook cắt)`
    : `KẾT QUẢ: ${failures.length} LỜI GỌI TIÊU TIỀN — xem UPGRADE-PLAN §W3-0 trước khi gỡ cổng`,
);
process.exit(failures.length === 0 ? 0 : 1);
