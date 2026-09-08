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
 * │ Cửa DUY NHẤT tiêu quota nay là src/lib/hooks/use-generate-run.ts — nó    │
 * │ nằm NGOÀI mọi vùng cấm bên dưới, có chủ ý: cổng này chỉ có nghĩa khi cửa │
 * │ tiêu tiền ở một chỗ được đọc kỹ, không phải trong màn người ta gõ mỗi   │
 * │ ngày. `features/runs/components/GenerateDialog.tsx` (dialog xác nhận số │
 * │ lượt của màn theo dõi) đã bị xoá cùng màn ấy ở đợt IA prompt-first.      │
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
 *       Lý do có thật, không phải nới tay: một cổng anh em có thể NHẮC TÊN kẻ bị cấm
 *       ngay trong assertion của chính nó (`expect(src).not.toMatch(/…useStartRun…/)`).
 *       Bắt đỏ vì một cổng khác gọi tên kẻ bị cấm là bắt nhầm. Test không thể tạo run nếu không có lời gọi;
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

/**
 * Vùng cấm.
 *
 * Plan §W3-0 khai ba vùng: `workflow-v4` · `canvas` · `gen`. Wave 4·B sửa danh
 * sách này vì ĐỊA HÌNH đổi, không phải vì luật đổi:
 *
 *  · `src/features/workflow-v4` → `src/features/kit-core`. Wizard bị khai tử; các
 *    lib/panel còn sống dọn sang `kit-core`. Nếu để tên cũ thì `walk()` gặp thư
 *    mục không tồn tại và LẶNG LẼ soi 0 file — cổng vẫn in "KẾT QUẢ: 0 lời gọi
 *    tiêu tiền" trong khi thật ra nó không soi gì cả. Đó là kiểu hỏng tệ nhất của
 *    một cổng: xanh vì mù.
 *  · THÊM `src/features/prompt-canvas`. Đây là CỬA CHÍNH MỚI (`/k/:id`) — chỗ mà
 *    một nút "Vẽ" sẽ mọc ra nếu ai đó lỡ tay, đúng vai trò mà `workflow-v4` giữ
 *    khi plan §W3-0 được viết. Vùng cấm phải theo nơi người ta đang gõ code, chứ
 *    không theo tên thư mục lịch sử.
 *  · BỎ `src/features/canvas` và `src/features/gen` (dọn mã chết, 07/09/2026). Hai
 *    thư mục đó ĐÃ BỊ XOÁ khỏi repo cùng đợt chuyển sang một màn duy nhất
 *    `/k/:id`; giữ tên trong danh sách chính là cái bẫy "xanh vì mù" mô tả ở gạch
 *    đầu dòng trên. Nếu ai dựng lại nhánh vẽ, THÊM đường dẫn mới vào đây trước.
 */
const GUARDED = [
  "src/features/kit-core",
  "src/features/prompt-canvas",
];

/**
 * Hook cắt: dù nằm ở đâu cũng phải giữ `kind` là hằng (luật ③).
 *
 * 08/09/2026 — DANH SÁCH RỖNG, và đó là sự thật chứ không phải một chỗ quên dọn.
 * Web KHÔNG CÒN tự phát lượt cắt: `use-generate-run.ts` gửi `autoSliceAfterGen:true`
 * và agent cắt từng tấm ngay sau khi ảnh về. Ba hook cũ
 * (`runs/lib/useSliceRun`, `kit/lib/useKitData`, `project/lib/useSliceRun`) đã bị xoá
 * cùng màn của chúng. Ai dựng lại một nút [Cắt] ở web thì THÊM đường dẫn vào đây —
 * luật ③ tồn tại vì `kind` lỏng ở hook cắt là đường vòng qua luật ①.
 */
const SLICE_HOOKS = [];

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

/* ── Luật ① + ② — các vùng cấm ──────────────────────────────────────────── */
for (const dir of GUARDED) {
  /* MỘT VÙNG CẤM KHÔNG TỒN TẠI LÀ MỘT LỖI, KHÔNG PHẢI MỘT KHOẢNG TRỐNG.
     Wave 4·B đổi tên `workflow-v4` → `kit-core`; nếu quên sửa danh sách trên thì
     `walk()` trả mảng rỗng và cổng in "0 lời gọi tiêu tiền" — xanh vì MÙ, không
     phải xanh vì sạch. Bắt đỏ ngay tại đây để lần đổi tên sau không đi qua im
     lặng. Vùng cấm được xoá thật thì người xoá phải rút nó khỏi `GUARDED`, và đó
     là một quyết định phải viết ra chứ không phải một hệ quả phụ. */
  if (!existsSync(join(root, dir))) {
    failures.push(`${dir}  — vùng cấm KHÔNG TỒN TẠI: cổng đang soi 0 file. Sửa GUARDED hoặc khôi phục thư mục.`);
    continue;
  }
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
