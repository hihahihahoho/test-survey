/* ============================================================================
   helpers.mjs — viết bộ câu hỏi bằng cú pháp gọn, xuất ra schema
   Google Forms API v1 (forms.batchUpdate / Apps Script đọc được trực tiếp).

   Dùng trong authoring/<ten-survey>.mjs, rồi chạy `node build.mjs`.
   ========================================================================== */

let _id = 0;
export const resetIds = () => { _id = 0; };
const nid = () => "q" + (++_id).toString(36).padStart(4, "0");

/* Một option có thể là:
     "Chuỗi"                       → lựa chọn thường
     "__OTHER__"                   → ô "Khác:" cho người trả lời tự ghi
     { value, goTo: "NEXT" }       → hết trang này thì sang phần kế tiếp
     { value, goTo: "SUBMIT" }     → gửi form luôn
     { value, goTo: "sec_xxx" }    → nhảy tới PAGE có id = sec_xxx
     { value, exclusive: true }    → checkbox: tick ô này thì bỏ hết ô khác
                                     (vd "Không dùng cái nào", "Không áp dụng") */
export function opts(list) {
  return list.map(v => {
    if (v === "__OTHER__") return { isOther: true };
    if (typeof v === "string") return { value: v };
    const o = { value: v.value };
    if (v.goTo === "NEXT") o.goToAction = "NEXT_SECTION";
    else if (v.goTo === "SUBMIT") o.goToAction = "SUBMIT_FORM";
    else if (v.goTo) o.goToSectionId = v.goTo;
    if (v.exclusive) o._exclusive = true;
    return o;
  });
}

function q(title, question, o = {}) {
  const item = { itemId: nid(), title };
  if (o.desc) item.description = o.desc;
  item.questionItem = { question: Object.assign({ questionId: nid(), required: !!o.req }, question) };
  return item;
}

export const TXT   = (t, o = {}) => q(t, { textQuestion: { paragraph: false } }, o);
export const PARA  = (t, o = {}) => q(t, { textQuestion: { paragraph: true } }, o);
export const RADIO = (t, c, o = {}) => q(t, { choiceQuestion: { type: "RADIO",     options: opts(c), shuffle: false } }, o);
export const CHECK = (t, c, o = {}) => q(t, { choiceQuestion: { type: "CHECKBOX",  options: opts(c), shuffle: false } }, o);
export const DROP  = (t, c, o = {}) => q(t, { choiceQuestion: { type: "DROP_DOWN", options: opts(c), shuffle: false } }, o);
export const SCALE = (t, lo, hi, ll, hl, o = {}) =>
  q(t, { scaleQuestion: { low: lo, high: hi, lowLabel: ll, highLabel: hl } }, o);

/* GRID: rows = câu con, cols = thang đo. { multi:true } → grid checkbox. */
export function GRID(title, rows, cols, o = {}) {
  const item = { itemId: nid(), title };
  if (o.desc) item.description = o.desc;
  item.questionGroupItem = {
    questions: rows.map(r => ({ questionId: nid(), required: !!o.req, rowQuestion: { title: r } })),
    grid: { columns: { type: o.multi ? "CHECKBOX" : "RADIO", options: opts(cols) }, shuffleQuestions: false }
  };
  return item;
}

/* PAGE cần id cố định để skip-logic trỏ tới được. */
export const PAGE = (id, title, desc) => {
  const it = { itemId: id, title, pageBreakItem: {} };
  if (desc) it.description = desc;
  return it;
};

/* Khối chữ thuần, không phải câu hỏi. */
export const NOTE = (title, desc) => {
  const it = { itemId: nid(), title, textItem: {} };
  if (desc) it.description = desc;
  return it;
};

/* ---------------------------------------------------------------------------
   Kiểm tra chất lượng theo chuẩn survey enterprise. build.mjs gọi hàm này.
   --------------------------------------------------------------------------- */
export function lint(form, { maxGridRows = 8, maxGridCols = 6, maxMinutes = 20 } = {}) {
  const errors = [], warnings = [];
  const sectionIds = new Set(form.items.filter(i => i.pageBreakItem).map(i => i.itemId));
  const seenIds = new Set();

  form.items.forEach(it => {
    /* id trùng */
    const ids = [];
    if (it.questionItem) ids.push(it.questionItem.question.questionId);
    if (it.questionGroupItem) it.questionGroupItem.questions.forEach(sq => ids.push(sq.questionId));
    ids.forEach(id => {
      if (seenIds.has(id)) errors.push(`questionId trùng: ${id} (${it.title})`);
      seenIds.add(id);
    });

    /* skip-logic trỏ vào section không tồn tại */
    const cq = it.questionItem && it.questionItem.question.choiceQuestion;
    if (cq) {
      cq.options.forEach(o => {
        if (o.goToSectionId && !sectionIds.has(o.goToSectionId))
          errors.push(`skip-logic trỏ tới section không tồn tại: "${it.title}" → ${o.goToSectionId}`);
      });
      if (cq.type !== "RADIO" && cq.type !== "DROP_DOWN" &&
          cq.options.some(o => o.goToSectionId || o.goToAction))
        errors.push(`skip-logic chỉ hoạt động với RADIO/DROP_DOWN: "${it.title}"`);
    }

    /* grid quá lớn → gây straightlining */
    if (it.questionGroupItem) {
      const r = it.questionGroupItem.questions.length;
      const c = it.questionGroupItem.grid.columns.options.length;
      if (r > maxGridRows) warnings.push(`grid ${r} dòng (nên ≤ ${maxGridRows}): "${it.title}"`);
      if (c > maxGridCols) warnings.push(`grid ${c} cột (nên ≤ ${maxGridCols}): "${it.title}"`);
    }

    /* checkbox dài mà không có ô thoát — trừ câu đã giới hạn "chọn tối đa N",
       vì loại đó là câu xếp hạng, ai cũng chọn được ít nhất một phương án */
    const capped = /tối đa\s+\d+/i.test((it.title || "") + " " + (it.description || ""));
    if (cq && cq.type === "CHECKBOX" && cq.options.length > 12 && !capped &&
        !cq.options.some(o => o._exclusive || o.isOther))
      warnings.push(`checkbox ${cq.options.length} option, nên có ô "Không…" hoặc "Khác": "${it.title}"`);

    /* nhắc khi một phương án trông như ô thoát nhưng chưa gắn { exclusive: true }.
       Regex hẹp có chủ ý: "Không được tự cài software" hay "Không giữ được nhất
       quán brand" là phương án hợp lệ, không phải ô thoát — không được bắt trúng. */
    if (cq && cq.type === "CHECKBOX") {
      const looksLikeEscape = v =>
        /^(không dùng|không làm|không áp dụng|gần như không)\b/i.test(v) ||
        /^không (có|gặp)\b.{0,30}đáng kể/i.test(v);
      cq.options.forEach(o => {
        if (!o.isOther && !o._exclusive && typeof o.value === "string" && looksLikeEscape(o.value))
          warnings.push(`có thể thiếu { exclusive: true } cho "${o.value}" trong "${it.title}"`);
      });
    }
  });

  const s = estimate(form);
  if (s.requiredParagraphs > 2)
    warnings.push(`${s.requiredParagraphs} câu tự luận bắt buộc — mỗi câu bắt buộc làm tăng tỷ lệ bỏ giữa, nên ≤ 2`);
  if (s.minutes > maxMinutes)
    warnings.push(`ước lượng ${s.minutes} phút (mục tiêu ≤ ${maxMinutes})`);

  return { errors, warnings, stats: s };
}

/* Ước lượng thời gian trả lời.
   13s / câu chọn · 8s / dòng grid + 10s dựng khung · 50s / tự luận bắt buộc ·
   20s / tự luận tuỳ chọn (phần lớn người trả lời bỏ qua hoặc viết ngắn). */
export function estimate(form) {
  let total = 0, required = 0, gridRows = 0, grids = 0, branches = 0, requiredParagraphs = 0, sec = 0;
  form.items.forEach(it => {
    if (it.questionGroupItem) {
      total++; grids++;
      const n = it.questionGroupItem.questions.length;
      gridRows += n;
      if (it.questionGroupItem.questions.some(x => x.required)) required++;
      sec += 10 + n * 8;
    } else if (it.questionItem) {
      total++;
      const qq = it.questionItem.question;
      if (qq.required) required++;
      const isPara = qq.textQuestion && qq.textQuestion.paragraph;
      if (isPara && qq.required) requiredParagraphs++;
      sec += isPara ? (qq.required ? 50 : 20) : 13;
      if (qq.choiceQuestion && qq.choiceQuestion.options.some(o => o.goToSectionId || o.goToAction)) branches++;
    }
  });
  return { total, required, grids, gridRows, branches, requiredParagraphs, minutes: Math.round(sec / 60) };
}

/* Mô phỏng đường đi qua form theo một bộ câu trả lời {tiêu đề câu: giá trị}.
   Dùng để kiểm tra skip-logic không bỏ sót hoặc lặp vô hạn. */
export function walk(form, answers) {
  const pages = [{ header: null, items: [] }];
  form.items.forEach(it => {
    if (it.pageBreakItem) pages.push({ header: it, items: [] });
    else pages[pages.length - 1].items.push(it);
  });
  if (!pages[0].header && !pages[0].items.length && pages.length > 1) pages.shift();

  const path = [];
  let p = 0, guard = 0;
  while (p < pages.length && guard++ < 200) {
    path.push(pages[p].header ? pages[p].header.itemId : "(trang đầu)");
    let next = p + 1;
    const items = pages[p].items;
    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (!it.questionItem) continue;
      const cq = it.questionItem.question.choiceQuestion;
      if (!cq || !["RADIO", "DROP_DOWN"].includes(cq.type)) continue;
      if (!cq.options.some(o => o.goToSectionId || o.goToAction)) continue;
      const o = cq.options.find(x => x.value === answers[it.title]);
      if (o) {
        if (o.goToAction === "SUBMIT_FORM") { next = pages.length; break; }
        if (o.goToSectionId) {
          const idx = pages.findIndex(pp => pp.header && pp.header.itemId === o.goToSectionId);
          if (idx >= 0) next = idx;
        }
      }
      break;
    }
    p = next;
  }
  if (guard >= 200) throw new Error("skip-logic bị lặp vô hạn");
  return path;
}
