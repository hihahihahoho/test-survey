/* ============================================================================
   Test bộ sinh Apps Script.
   Chạy:  node build.mjs && node test/appsscript.test.mjs

   Không gọi Google. Cách làm: lấy buildAppsScript() từ index.html, sinh file .gs
   cho TỪNG survey trong manifest, rồi THỰC THI file đó với một FormApp giả có ghi
   lại mọi lời gọi — nên test kiểm tra hành vi thật của script, không phải chỉ so
   chuỗi ký tự.

   Phần [A] chạy cho mọi survey. Phần [B] là assertion riêng của từng survey.
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
  "export { normalize, buildAppsScript, scriptCaveats, forGoogleForms, maxSelectOf };"
].join("\n")));

let fail = 0;
const ok = (c, m) => { if (!c) { console.log("  ✗ " + m); fail++; } else console.log("  ✓ " + m); };

/* ==========================================================================
   FormApp giả — ghi lại mọi lời gọi. Tạo mới cho từng survey.
   ========================================================================== */
function runScript(gs) {
  const log = { items: [], form: {}, choicesSet: [], logs: [] };

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

  const form = {
    setTitle: v => { log.form.title = v; return form; },
    setDescription: v => { log.form.desc = v; return form; },
    setProgressBar: v => { log.form.progress = v; return form; },
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
    create: t => { log.form.created = t; return form; },
    PageNavigationType: { SUBMIT: "«SUBMIT»", RESTART: "«RESTART»", CONTINUE: "«CONTINUE»" },
    createCheckboxValidation: () => {
      const b = { atMost: null };
      b.requireSelectAtMost = n => { b.atMost = n; return b; };
      b.requireSelectAtLeast = n => { b.atLeast = n; return b; };
      b.build = () => ({ atMost: b.atMost, atLeast: b.atLeast });
      return b;
    }
  };
  const Logger = { log: m => log.logs.push(String(m)) };

  let threw = null;
  try { new Function("FormApp", "Logger", gs + "\nreturn createForm();")(FormApp, Logger); }
  catch (e) { threw = e; }
  return { log, threw };
}

/* Loại item mong đợi, suy trực tiếp từ spec — không hardcode con số nào, nên
   thêm survey mới hoặc sửa câu hỏi là test tự khớp theo. */
function expectedKinds(spec) {
  const w = {};
  const bump = k => { w[k] = (w[k] || 0) + 1; };
  spec.items.forEach((it, idx) => {
    if (it.pageBreakItem) return bump(idx === 0 ? "SECTION_HEADER" : "PAGE_BREAK");
    if (it.textItem) return bump("SECTION_HEADER");
    if (it.questionGroupItem)
      return bump(it.questionGroupItem.grid.columns.type === "CHECKBOX" ? "CHECKBOX_GRID" : "GRID");
    const q = it.questionItem.question;
    if (q.textQuestion) return bump(q.textQuestion.paragraph ? "PARAGRAPH_TEXT" : "TEXT");
    if (q.scaleQuestion) return bump("SCALE");
    if (q.dateQuestion) return bump("DATE");
    if (q.timeQuestion) return bump("TIME");
    if (q.choiceQuestion) {
      const t = q.choiceQuestion.type;
      return bump(t === "CHECKBOX" ? "CHECKBOX" : t === "DROP_DOWN" ? "LIST" : "MULTIPLE_CHOICE");
    }
  });
  return w;
}

/* ==========================================================================
   [A] Kiểm tra chung — chạy cho mọi survey trong manifest
   ========================================================================== */
const { surveys } = JSON.parse(readFileSync("surveys/manifest.json", "utf8"));
console.log(`\nmanifest: ${surveys.length} survey`);

const results = {};

for (const s of surveys) {
  console.log(`\n══ ${s.id} ══`);
  const form = engine.normalize(JSON.parse(readFileSync("surveys/" + s.file, "utf8")));
  const spec = engine.forGoogleForms(form);
  const gs = engine.buildAppsScript(form);
  const { log, threw } = runScript(gs);
  results[s.id] = { form, spec, gs, log };

  ok(!threw, "createForm() chạy không lỗi" + (threw ? ": " + threw.message : ""));
  if (threw) { console.log(threw.stack); continue; }

  ok(!gs.includes("_exclusive"), "script không chứa field mở rộng _exclusive");
  ok(!/=>/.test(gs.split("var FORM_SPEC")[0]), "header không dùng arrow function (tương thích Rhino)");

  const want = expectedKinds(spec), got = {};
  log.items.forEach(i => { got[i.kind] = (got[i.kind] || 0) + 1; });
  const kinds = [...new Set([...Object.keys(want), ...Object.keys(got)])].sort();
  const mismatch = kinds.filter(k => (got[k] || 0) !== (want[k] || 0));
  ok(mismatch.length === 0,
     mismatch.length
       ? `lệch loại item: ${mismatch.map(k => `${k} ${got[k] || 0}≠${want[k] || 0}`).join(", ")}`
       : `${log.items.length} item, đúng loại theo spec (${kinds.join(", ")})`);

  ok(log.items[0].kind === "SECTION_HEADER",
     "pageBreak đầu tiên dựng thành section header, không tạo trang trống");

  const navQuestions = spec.items.filter(it => {
    const cq = it.questionItem && it.questionItem.question.choiceQuestion;
    return cq && cq.options.some(o => o.goToSectionId || o.goToAction);
  });
  ok(log.choicesSet.length === navQuestions.length,
     `${log.choicesSet.length}/${navQuestions.length} câu phân nhánh được nối`);
  ok(log.choicesSet.every(i => i.choices.length && i.choices.every(c => c.nav)),
     "mọi lựa chọn trong câu phân nhánh đều có điều hướng");
  const badTarget = log.choicesSet.flatMap(i => i.choices)
    .filter(c => typeof c.nav === "string" && !/^«(SUBMIT|RESTART|CONTINUE)»$/.test(c.nav));
  ok(badTarget.length === 0,
     badTarget.length
       ? `điều hướng trỏ vào chuỗi id thay vì PageBreakItem: ${badTarget.map(c => c.nav).join(", ")}`
       : "đích nhảy là object PageBreakItem, không phải chuỗi id");

  const wantRequired = spec.items.filter(it =>
    it.questionItem ? it.questionItem.question.required
    : it.questionGroupItem ? it.questionGroupItem.questions.some(q => q.required) : false).length;
  ok(log.items.filter(i => i.required === true).length === wantRequired,
     `${wantRequired} item bắt buộc`);

  const wantOther = spec.items.filter(it => {
    const cq = it.questionItem && it.questionItem.question.choiceQuestion;
    return cq && cq.type !== "DROP_DOWN" && cq.options.some(o => o.isOther);
  }).length;
  ok(log.items.filter(i => i.other === true).length === wantOther, `${wantOther} câu bật ô "Khác"`);
  ok(log.items.filter(i => i.kind === "LIST").every(i => i.other === false),
     'dropdown không bật ô "Khác" (Google không hỗ trợ)');

  const wantCaps = spec.items.filter(it => {
    const cq = it.questionItem && it.questionItem.question.choiceQuestion;
    return cq && cq.type === "CHECKBOX" && engine.maxSelectOf(it);
  });
  ok(log.items.filter(i => i.validation).length === wantCaps.length,
     `${wantCaps.length} câu "chọn tối đa N" → validation thật của Google`);
  wantCaps.forEach(it => {
    const n = engine.maxSelectOf(it);
    ok(log.items.some(i => i.validation && i.validation.atMost === n),
       `requireSelectAtMost(${n}) cho "${it.title.slice(0, 38)}…"`);
  });

  ok(log.items.filter(i => i.kind === "GRID" || i.kind === "CHECKBOX_GRID")
      .every(g => g.rows && g.rows.length && g.cols && g.cols.length),
     "mọi grid đều có rows + columns");
  ok(!log.logs.some(l => l.indexOf("Bỏ qua item") === 0), "không item nào bị bỏ qua");
  ok(log.logs.some(l => l.indexOf("Sửa form:") === 0) &&
     log.logs.some(l => l.indexOf("Link điền:") === 0), "log ra link edit và link điền");
  ok(log.form.desc === form.info.description, "giữ nguyên phần mô tả mở đầu");
  ok(log.form.progress === true, "bật progress bar");
}

/* ==========================================================================
   [B] Kiểm tra riêng từng survey
   ========================================================================== */
console.log("\n══ riêng · creative-audit-2026 ══");
{
  const r = results["creative-audit-2026"];
  const pb = r.log.items.filter(i => i.kind === "PAGE_BREAK");
  const gate = r.log.choicesSet.find(i => i.title && i.title.indexOf("ảnh tĩnh") > 0);
  ok(!!gate, "có câu lọc mảng graphic");
  ok(gate && gate.choices.find(c => c.value === "Không").nav
       === pb.find(p => p.title === "Phần 5 · Mảng chuyển động"),
     '"Không" nhảy đúng sang phần chuyển động');
  ok(gate && gate.choices.find(c => c.value === "Có").nav === "«CONTINUE»", '"Có" đi tiếp');
  const extra = r.log.choicesSet.find(i => i.title === "Bạn muốn làm gì tiếp?");
  ok(!!extra && extra.choices.some(c => c.nav === "«SUBMIT»"), '"Gửi luôn" → SUBMIT');
  const sink = r.log.items.find(i => i.title && i.title.indexOf("ngốn nhiều thời gian nhất") > 0);
  ok(sink && sink.kind === "CHECKBOX" && sink.other === true && sink.validation.atMost === 5,
     'câu "ngốn thời gian" là checkbox, có ô Khác, giới hạn 5');
  const scale = r.log.items.find(i => i.kind === "SCALE");
  ok(scale && scale.bounds[0] === 1 && scale.bounds[1] === 5 && scale.labels[0] && scale.labels[1],
     "scale 1–5 có đủ 2 nhãn");
}

console.log("\n══ riêng · game-uikit-pipeline-2026 ══");
{
  const r = results["game-uikit-pipeline-2026"];
  /* Ca đặc biệt: câu sàng lọc nằm ngay section đầu, mà section đầu bị dựng thành
     SECTION_HEADER — phải chắc điều hướng SUBMIT vẫn nối đúng. */
  const gate = r.log.choicesSet.find(i =>
    i.title === "Bạn có tham gia làm campaign mini-game không?");
  ok(!!gate, "có câu sàng lọc");
  ok(gate && gate.kind === "MULTIPLE_CHOICE",
     "câu sàng lọc là multiple choice (điều kiện để điều hướng chạy)");
  ok(gate && gate.choices.find(c => c.value === "Không tham gia").nav === "«SUBMIT»",
     '"Không tham gia" → gửi form luôn, không phải xem tiếp');
  ok(gate && gate.choices.filter(c => c.nav === "«CONTINUE»").length === 2,
     "hai phương án còn lại đều đi tiếp");
  ok(r.log.items.indexOf(gate) === 1 && r.log.items[0].kind === "SECTION_HEADER",
     "câu sàng lọc đứng ngay sau section header đầu — đúng vị trí câu cuối của section");
  const must = r.log.items.find(i => i.title && i.title.indexOf("chỉ được có MỘT thứ") > 0);
  ok(must && must.kind === "LIST" && must.required === true,
     'câu "chỉ được có MỘT thứ" là dropdown bắt buộc');
  ok(r.log.items.filter(i => i.kind === "GRID").length === 7, "7 grid định lượng");
  /* bước render PDF/slide phải có mặt ở cả phần bàn giao và phần pipeline */
  const pdfRows = r.log.items
    .filter(i => i.kind === "GRID")
    .flatMap(g => g.rows)
    .filter(row => /PDF|slide/i.test(row));
  ok(pdfRows.length === 2,
     `${pdfRows.length} dòng grid về PDF/slide (bàn giao + pipeline)`);
  const pdfQs = r.log.items.filter(i => i.title && /PDF|slide/i.test(i.title));
  ok(pdfQs.length === 3, `${pdfQs.length} câu hỏi riêng về PDF/slide bàn giao`);
  const one = r.log.items.find(i => i.title && i.title.indexOf("chỉ được có MỘT thứ") > 0);
  ok(one && one.choiceValues.some(v => /PDF/.test(v)),
     'PDF là một phương án trong câu "chỉ được có MỘT thứ"');
}

console.log(fail ? `\n${fail} kiểm tra THẤT BẠI` : "\nTất cả kiểm tra PASS");
process.exit(fail ? 1 : 0);
