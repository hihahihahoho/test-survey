/**
 * H1 — ĐO TƯƠNG PHẢN cho tổ hợp màu MỚI mà thẻ bộ kit tạo ra (UX-V3 §8.3 hàng 2:
 * «nhãn nhỏ trên card ảnh Home»).
 *
 * Chạy:  node src/features/projects/__tests__/home-contrast.mjs
 *
 * VÌ SAO CÓ FILE NÀY THAY VÌ THÊM VÀO `scripts/check-contrast.mjs`:
 * `webapp/scripts/**` VÔ CHỦ trong bản đồ glob FE-3 (`NEEDS-fe3-s0.md` N6) và S0 đã
 * cảnh báo rằng sửa script chấm điểm cho chính mình là thứ Q1 phải nghi ngờ nhất (N7).
 * Nên phép đo của tôi nằm trong glob tôi, chạy riêng, và báo số riêng.
 *
 * ⚠️ UX-V3 §8.3 đòi «nhãn nhỏ đè lên ảnh bìa phải có nền đặc». H1 giải quyết bằng
 * CẤU TRÚC: nhãn KHÔNG đè ảnh, nó nằm dưới ảnh trên nền `surface` đặc. Nên cặp đo được
 * là (fg-muted / surface) — tất định, không phụ thuộc ảnh của user. Nếu ai đó sau này
 * dời nhãn lên đè ảnh, phép đo này KHÔNG còn bảo vệ được gì: ảnh bìa là ảnh bất kỳ.
 *
 * Đọc token THẬT từ `src/styles/tokens.css`, không hardcode màu.
 */
import { readFileSync } from "node:fs";
const css = readFileSync("src/styles/tokens.css", "utf8");
const tok = (n) => {
  const m = new RegExp(`--kg-${n}:\\s*([0-9]+)\\s+([0-9]+)\\s+([0-9]+)\\s*;`).exec(css);
  if (!m) throw new Error(`không thấy --kg-${n}`);
  return [ +m[1], +m[2], +m[3] ];
};
const lum = ([r,g,b]) => { const f=(c)=>{c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;};
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b); };
const ratio = (a,b) => { const [x,y]=[lum(a),lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
const over = (fg,bg,a) => fg.map((c,i)=>c*a + bg[i]*(1-a));  // composite alpha
const hex = (c)=>"#"+c.map(v=>Math.round(v).toString(16).padStart(2,"0")).join("").toUpperCase();

const surface = tok("surface"), canvas = tok("canvas"), raised = tok("raised");
const fgMuted = tok("fg-muted"), fgStrong = tok("fg-strong");
const tintA = +(/--kg-tint-a:\s*([0-9.]+)/.exec(css)?.[1] ?? 0.16);

const rows = [
  ["nhãn hình thái «⚙️ Điền form» trên thẻ (fg-muted / surface)", fgMuted, surface, 4.5],
  ["  … khi thẻ vẽ từ cache (opacity-80 ⇒ trộn với canvas)", over(fgMuted, canvas, .8), over(surface, canvas, .8), 4.5],
  ["tên bộ kit (fg-strong / surface)", fgStrong, surface, 4.5],
  ["chữ giữ chỗ ảnh bìa «Chưa vẽ ảnh nào» (fg-muted / raised)", fgMuted, raised, 4.5],
];
for (const tone of ["running","ok","never","stale","danger"]) {
  const ink = tok(`on-tint-${tone}`), bg = over(tok(tone), surface, tintA);
  rows.push([`badge trạng thái tone=${tone} (on-tint-${tone} / tint trên surface)`, ink, bg, 4.5]);
}
let fail = 0;
for (const [name, fg, bg, min] of rows) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${r.toFixed(2)}:1 (min ${min})  ${hex(fg)} on ${hex(bg)}  — ${name}`);
}
console.log(`\nKẾT QUẢ: ${rows.length - fail}/${rows.length} PASS`);
process.exit(fail ? 1 : 0);
