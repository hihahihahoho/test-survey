/* ============================================================================
   Test bộ sinh Apps Script.
   Chạy:  node build.mjs && node test/appsscript.test.mjs

   Không gọi Google. Cách làm: lấy buildAppsScript() từ index.html, sinh ra file
   .gs cho JSON đã build, rồi THỰC THI file đó với một FormApp giả có ghi lại
   mọi lời gọi — nên test kiểm tra được hành vi thật của script, không phải
   chỉ kiểm tra chuỗi ký tự.
   ========================================================================== */
import { readFileSync } from "node:fs";

const src = readFileSync("index.html", "utf8").match(/<script>([\s\S]*)<\/script>/)[1];

/* ---- lấy nguyên văn các hàm cần thiết từ engine ---- */
function grab(name) {
  const i = src.search(new RegExp(`(?:^|\\n)(?:const|function) ${name}\\b`));
  if (i < 0) throw new Error("không tìm thấy " + name + " trong index.html");
  let depth = 0, k = src.indexOf("{", i);
  for (; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (depth === 0) break; }
  }
  return src.slice(i, k + 1);
}
const engine = await import("data:text/javascript," + encodeURIComponent([
  src.match(/const isExclusive = [^;]+;/)[0],
  grab("forGoogleForms"), grab("maxSelectOf"), grab("optsOf"),
  src.slice(src.indexOf("const SIMPLE_MAP"), src.indexOf("function normalize")),
  grab("normalize"), grab("stats"), grab("scriptCaveats"), grab("buildAppsScript"),
  "export { normalize, buildAppsScript, scriptCaveats, forGoogleForms };"
].join("\n")));

const raw = JSON.parse(readFileSync("surveys/creative-audit-2026.json", "utf8"));
const form = engine.normalize(raw);
const gs = engine.buildAppsScript(form);

let fail = 0;
const ok = (c, m) => { if (!c) { console.log("  ✗ " + m); fail++; } else console.log("  ✓ " + m); };

/* ==========================================================================
   FormApp giả — ghi lại mọi lời gọi
   ========================================================================== */
const log = { items: [], form: {}, choicesSet: [] };

function mkItem(kind) {
  const it = { kind, required: false, choiceValues: null, choices: null, other: false,
               rows: null, cols: null, bounds: null, labels: null, validation: null };
  log.items.push(it);
  it.setTitle = v => { it.title = v; return it; };
  it.setHelpText = v => { it.help = v; return it; };
  it.setRequired = v => { it.required = v; return it; };
  it.setChoiceValues = v => { it.choiceValues = v.slice(); return it; };
  it.setChoices = v => { it.choices = v; log.choicesSet.push(it); return it; };
  it.createChoice = (value, nav) => ({ value, nav });
  it.showOtherOption = v => { it.other = v; return it; };
  it.setBounds = (lo, hi) => { it.bounds = [lo, hi]; return it; };
  it.setLabels = (lo, hi) => { it.labels = [lo, hi]; return it; };
  it.setRows = v => { it.rows = v.slice(); return it; };
  it.setColumns = v => { it.cols = v.slice(); return it; };
  it.setValidation = v => { it.validation = v; return it; };
  return it;
}

const fakeForm = {
  setTitle: v => { log.form.title = v; return fakeForm; },
  setDescription: v => { log.form.desc = v; return fakeForm; },
  setProgressBar: v => { log.form.progress = v; return fakeForm; },
  getTitle: () => log.form.title,
  getEditUrl: () => "https://example.test/edit",
  getPublishedUrl: () => "https://example.test/view",
  getItems: () => log.items,
  addTextItem: () => mkItem("TEXT"),
  addParagraphTextItem: () => mkItem("PARAGRAPH_TEXT"),
  addMultipleChoiceItem: () => mkItem("MULTIPLE_CHOICE"),
  addCheckboxItem: () => mkItem("CHECKBOX"),
  addListItem: () => mkItem("LIST"),
  addScaleItem: () => mkItem("SCALE"),
  addGridItem: () => mkItem("GRID"),
  addCheckboxGridItem: () => mkItem("CHECKBOX_GRID"),
  addDateItem: () => mkItem("DATE"),
  addTimeItem: () => mkItem("TIME"),
  addPageBreakItem: () => mkItem("PAGE_BREAK"),
  addSectionHeaderItem: () => mkItem("SECTION_HEADER")
};

const FormApp = {
  create: t => { log.form.created = t; return fakeForm; },
  PageNavigationType: { SUBMIT: "«SUBMIT»", RESTART: "«RESTART»", CONTINUE: "«CONTINUE»" },
  createCheckboxValidation: () => {
    const b = { atMost: null };
    b.requireSelectAtMost = n => { b.atMost = n; return b; };
    b.requireSelectAtLeast = n => { b.atLeast = n; return b; };
    b.build = () => ({ atMost: b.atMost, atLeast: b.atLeast });
    return b;
  }
};
const logs = [];
const Logger = { log: m => logs.push(String(m)) };

console.log("\n[1] script sinh ra chạy được");
let threw = null;
try {
  new Function("FormApp", "Logger", gs + "\nreturn createForm();")(FormApp, Logger);
} catch (e) { threw = e; }
ok(!threw, "createForm() chạy không lỗi" + (threw ? ": " + threw.message : ""));
if (threw) { console.log(threw.stack); process.exit(1); }
ok(/^var FORM_SPEC = \{/m.test(gs), "spec được nhúng dưới dạng var FORM_SPEC");
ok(!gs.includes("_exclusive"), "script KHÔNG chứa field mở rộng _exclusive");
ok(!/=>/.test(gs.split("var FORM_SPEC")[0]) , "phần header không dùng arrow function (tương thích Rhino)");

console.log("\n[2] số lượng & loại item khớp với spec");
const spec = engine.forGoogleForms(form);
const want = { PAGE_BREAK: 0, SECTION_HEADER: 0, GRID: 0, CHECKBOX_GRID: 0,
               MULTIPLE_CHOICE: 0, CHECKBOX: 0, LIST: 0, TEXT: 0, PARAGRAPH_TEXT: 0, SCALE: 0 };
spec.items.forEach((it, idx) => {
  if (it.pageBreakItem) { idx === 0 ? want.SECTION_HEADER++ : want.PAGE_BREAK++; return; }
  if (it.textItem) { want.SECTION_HEADER++; return; }
  if (it.questionGroupItem) {
    it.questionGroupItem.grid.columns.type === "CHECKBOX" ? want.CHECKBOX_GRID++ : want.GRID++;
    return;
  }
  const q = it.questionItem.question;
  if (q.textQuestion) q.textQuestion.paragraph ? want.PARAGRAPH_TEXT++ : want.TEXT++;
  else if (q.scaleQuestion) want.SCALE++;
  else if (q.choiceQuestion) {
    if (q.choiceQuestion.type === "CHECKBOX") want.CHECKBOX++;
    else if (q.choiceQuestion.type === "DROP_DOWN") want.LIST++;
    else want.MULTIPLE_CHOICE++;
  }
});
const got = {};
log.items.forEach(i => { got[i.kind] = (got[i.kind] || 0) + 1; });
Object.keys(want).forEach(k => {
  if (!want[k] && !got[k]) return;
  ok((got[k] || 0) === want[k], `${k}: ${got[k] || 0} (mong đợi ${want[k]})`);
});
ok(log.items.length === spec.items.length,
   `tổng ${log.items.length} item = ${spec.items.length} item trong spec`);

console.log("\n[3] trang tiêu đề không bị để trống");
ok(log.items[0].kind === "SECTION_HEADER",
   'pageBreak đầu tiên được dựng thành section header (không tạo trang trống bắt bấm "Tiếp" vô nghĩa)');
ok(log.items[0].title.indexOf("Phần 1") === 0, `giữ đúng tiêu đề: "${log.items[0].title}"`);

console.log("\n[4] điều hướng theo lựa chọn");
ok(log.choicesSet.length === 4, `${log.choicesSet.length} câu được nối nhánh (mong đợi 4)`);
const pageBreaks = log.items.filter(i => i.kind === "PAGE_BREAK");
const byTitle = t => pageBreaks.find(p => p.title === t);
const gateGraphic = log.choicesSet.find(i =>
  i.choiceValues && i.choiceValues.length === 2 && i.title.indexOf("ảnh tĩnh") > 0);
ok(!!gateGraphic, "tìm thấy câu lọc mảng graphic");
if (gateGraphic) {
  const no = gateGraphic.choices.find(c => c.value === "Không");
  const yes = gateGraphic.choices.find(c => c.value === "Có");
  ok(no && no.nav === byTitle("Phần 5 · Mảng chuyển động"),
     '"Không" nhảy tới đúng PageBreakItem của phần chuyển động (không phải chuỗi id)');
  ok(yes && yes.nav === "«CONTINUE»", '"Có" đi tiếp phần kế tiếp');
}
const gateExtra = log.choicesSet.find(i => i.title === "Bạn muốn làm gì tiếp?");
ok(!!gateExtra && gateExtra.choices.some(c => c.nav === "«SUBMIT»"),
   '"Gửi luôn" gắn PageNavigationType.SUBMIT');
ok(log.choicesSet.every(i => i.choices.every(c => c.nav)),
   "mọi lựa chọn trong câu phân nhánh đều có điều hướng, không sót cái nào");

console.log("\n[5] giới hạn \"chọn tối đa N\" thành validation thật của Google");
const validated = log.items.filter(i => i.validation);
ok(validated.length === 1, `${validated.length} câu có validation (mong đợi 1)`);
ok(validated.every(i => i.validation.atMost === 3), "requireSelectAtMost(3)");

console.log("\n[6] grid, thang đo, ô Khác");
const grids = log.items.filter(i => i.kind === "GRID" || i.kind === "CHECKBOX_GRID");
ok(grids.every(g => g.rows && g.rows.length && g.cols && g.cols.length), "mọi grid đều có rows + columns");
const weak = grids.find(g => g.kind === "CHECKBOX_GRID");
ok(weak && weak.rows.length === 8 && weak.cols.length === 6,
   `grid điểm yếu là checkbox grid ${weak ? weak.rows.length + "×" + weak.cols.length : "?"}`);
ok(weak && weak.required === false, "grid điểm yếu không bắt buộc (đúng như spec)");
const scale = log.items.find(i => i.kind === "SCALE");
ok(scale && scale.bounds[0] === 1 && scale.bounds[1] === 5 && scale.labels[0] && scale.labels[1],
   "scale có bounds 1–5 và đủ 2 nhãn đầu/cuối");
const others = log.items.filter(i => i.other === true);
const wantOther = spec.items.filter(it => {
  const cq = it.questionItem && it.questionItem.question.choiceQuestion;
  return cq && cq.type !== "DROP_DOWN" && cq.options.some(o => o.isOther);
}).length;
ok(others.length === wantOther, `${others.length} câu bật ô "Khác" (mong đợi ${wantOther})`);
const lists = log.items.filter(i => i.kind === "LIST");
ok(lists.length === 3, `${lists.length} dropdown (3 câu xếp hạng ngốn thời gian)`);
ok(lists.every(i => i.other === false), 'dropdown không bật ô "Khác" (Google không hỗ trợ)');
ok(lists.every(i => i.choiceValues.length === 18), "mỗi dropdown xếp hạng có đủ 18 lựa chọn");
ok(lists.filter(i => i.required).length === 1, "chỉ hạng #1 bắt buộc, #2 và #3 tuỳ chọn");

console.log("\n[7] bắt buộc & log");
const wantRequired = spec.items.filter(it => {
  if (it.questionItem) return it.questionItem.question.required;
  if (it.questionGroupItem) return it.questionGroupItem.questions.some(q => q.required);
  return false;
}).length;
ok(log.items.filter(i => i.required === true).length === wantRequired,
   `${log.items.filter(i => i.required === true).length} item bắt buộc (mong đợi ${wantRequired})`);
ok(log.form.progress === true, "bật progress bar (form nhiều phần)");
ok(log.form.desc === form.info.description, "giữ nguyên phần mô tả mở đầu");
ok(logs.some(l => l.indexOf("Sửa form:") === 0) && logs.some(l => l.indexOf("Link điền:") === 0),
   "log ra link edit và link điền");
ok(!logs.some(l => l.indexOf("Bỏ qua item") === 0),
   "không có item nào bị bỏ qua vì không nhận diện được");

console.log("\n[8] cảnh báo giới hạn của Google Forms");
const cav = engine.scriptCaveats(form);
ok(cav.length === 2, `${cav.length} cảnh báo`);
ok(cav[0].indexOf("ô loại trừ") > 0, "có cảnh báo Google Forms không có ô loại trừ");
ok(gs.indexOf("LƯU Ý") > 0, "cảnh báo được ghi vào header của file .gs");

console.log(fail ? `\n${fail} kiểm tra THẤT BẠI` : "\nTất cả kiểm tra PASS");
process.exit(fail ? 1 : 0);
