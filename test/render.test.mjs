/* ============================================================================
   Test chặn regression phần render.
   Chạy:  node test/render.test.mjs

   GIỚI HẠN: đây là kiểm tra TĨNH trên CSS và cấu trúc DOM trong index.html,
   không phải render thật trong browser (repo không có jsdom). Nó chặn đúng ba
   lỗi đã từng xảy ra, chứ không thay được việc mở trang xem bằng mắt:

   1. `.opt input{opacity:0}` ẩn luôn ô text của "Khác:" — người trả lời bấm vào
      ô Khác mà không thấy chỗ gõ.
   2. Input trong grid và scale không được ẩn — hiện ô radio gốc của trình duyệt
      nằm cạnh vòng tròn giả.
   3. Trạng thái đã chọn chỉ khai báo cho `.opt` — ô trong grid và scale tick
      vào nhưng không đổi màu.
   ========================================================================== */
import { readFileSync } from "node:fs";

const html = readFileSync("index.html", "utf8");
/* Bỏ comment trước khi parse — nếu không, khối /* … *​/ đứng trước một rule sẽ bị
   gom vào phần capture selector và làm các regex kiểm tra selector trượt hết. */
const css = html.slice(html.indexOf("<style>"), html.indexOf("</style>"))
                .replace(/\/\*[\s\S]*?\*\//g, "");
const js = html.match(/<script>([\s\S]*)<\/script>/)[1];

let fail = 0;
const ok = (c, m) => { if (!c) { console.log("  ✗ " + m); fail++; } else console.log("  ✓ " + m); };

/* Gom các selector của những rule có ẩn input (opacity:0 + width:0) */
const hideRules = [...css.matchAll(/([^{}]+)\{([^}]*opacity:\s*0[^}]*)\}/g)]
  .filter(m => /width:\s*0/.test(m[2]))
  .map(m => m[1].replace(/\s+/g, " ").trim());

console.log("\n[1] ô text của \"Khác:\" không bị ẩn cùng radio/checkbox");
ok(hideRules.length > 0, `tìm thấy ${hideRules.length} rule ẩn input`);
const unscoped = hideRules.filter(sel =>
  /(^|,)\s*\.opt\s+input\s*(,|$)/.test(sel) ||          // .opt input  → quét cả input text
  /(^|,)\s*\.opt\s+\*\s*(,|$)/.test(sel));
ok(unscoped.length === 0,
   unscoped.length ? `rule ẩn quá rộng: ${unscoped.join(" | ")}` : "không có rule nào ẩn mọi input trong .opt");
const hideSel = hideRules.join(" , ");
ok(/\.opt\s+input\[type="?radio"?\]/.test(hideSel) && /\.opt\s+input\[type="?checkbox"?\]/.test(hideSel),
   "rule ẩn giới hạn đúng vào input[type=radio] và input[type=checkbox]");

console.log("\n[2] input trong grid và scale cũng được ẩn");
ok(/\.scale-item\s+input/.test(hideSel), "phủ .scale-item input");
ok(/table\.grid\s+input/.test(hideSel), "phủ table.grid input");

console.log("\n[3] trạng thái đã chọn dùng chung cho mọi loại câu");
["radio", "check"].forEach(kind => {
  const re = new RegExp(`(^|[,}\\n])\\s*input:checked \\+ \\.mark\\.${kind}\\s*(\\{|::after)`);
  ok(re.test(css), `input:checked + .mark.${kind} không bị bó vào .opt`);
});
ok(!/\.opt\s+input:checked\s*\+/.test(css),
   "không còn rule trạng thái nào chỉ áp cho .opt (grid/scale sẽ mất màu)");

console.log("\n[4] ô \"Khác:\" nằm ngoài <label>");
ok(!/lab\.appendChild\(otherInp\)/.test(js),
   "không append ô text vào trong <label> (nếu lồng vào, click để gõ sẽ toggle checkbox)");
ok(/row\.appendChild\(lab\)/.test(js) && /row\.appendChild\(otherInp\)/.test(js),
   "label và ô text là hai node ngang cấp trong .opt-row");
ok(/\.opt-row\s*\{/.test(css), "có style cho .opt-row");
ok(/otherInp\.onfocus/.test(js), "focus vào ô Khác thì tự tick checkbox");
ok(/placeholder: "Câu trả lời của bạn"/.test(js.slice(js.indexOf("other-input") - 400, js.indexOf("other-input") + 400))
   || /other-input[\s\S]{0,200}placeholder/.test(js),
   "ô Khác có placeholder để thấy rõ là chỗ gõ");

console.log("\n[5] mọi .mark đều đứng ngay sau input tương ứng");
/* input:checked + .mark chỉ hoạt động khi hai node kề nhau — kiểm tra cả 3 chỗ render */
const adjacency = [...js.matchAll(/appendChild\(inp\);\s*\n?\s*\w+\.appendChild\(el\("span", "mark/g)];
ok(adjacency.length === 3,
   `${adjacency.length}/3 chỗ render (option, grid, scale) đặt .mark ngay sau input`);

console.log(fail ? `\n${fail} kiểm tra THẤT BẠI` : "\nTất cả kiểm tra PASS");
process.exit(fail ? 1 : 0);
