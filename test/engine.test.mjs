/* ============================================================================
   Test engine trong index.html trên chính JSON đã build.
   Chạy:  node build.mjs --google && node test/engine.test.mjs
   Không dùng browser — chỉ nạp các hàm thuần (không DOM) từ index.html, nên
   test luôn chạy đúng code đang chạy thật thay vì một bản copy.
   ========================================================================== */
import { readFileSync } from "node:fs";

const html = readFileSync("index.html","utf8");
const src  = html.match(/<script>([\s\S]*)<\/script>/)[1];

// lấy đúng các hàm thuần (không DOM) từ engine, y nguyên như trong index.html
function grab(name, kind="function"){
  const re = new RegExp(`(?:^|\\n)(?:const|function) ${name}\\b`);
  const i = src.search(re);
  if(i<0) throw new Error("không tìm thấy "+name);
  // đọc tới khi cân ngoặc
  let j=src.indexOf("{",i), depth=0, k=j;
  for(;k<src.length;k++){ if(src[k]==="{")depth++; else if(src[k]==="}"){depth--; if(depth===0)break;} }
  return src.slice(i, k+1);
}
// LẤY isExclusive TRỰC TIẾP TỪ index.html — không hardcode, để test đúng code đang chạy
const exclLine = src.match(/const isExclusive = [^;]+;/);
if(!exclLine) throw new Error("không tìm thấy isExclusive trong index.html");
console.log("engine đang dùng: " + exclLine[0]);

const pieces = [
  exclLine[0],
  grab("maxSelectOf"), grab("optsOf"),
  src.slice(src.indexOf("const SIMPLE_MAP"), src.indexOf("function normalize")),
  grab("normalize"), grab("paginate"), grab("stats"), grab("isEmpty"),
].join("\n");

const mod = await import("data:text/javascript," + encodeURIComponent(
  pieces + "\nexport {isExclusive,maxSelectOf,normalize,paginate,stats,isEmpty};"
));

const raw = JSON.parse(readFileSync("surveys/creative-audit-2026.json","utf8"));
const form = mod.normalize(raw);
const pages = mod.paginate(form);
let fail = 0;
const ok=(c,m)=>{ if(!c){console.log("  ✗ "+m); fail++;} else console.log("  ✓ "+m); };

console.log("\n[1] normalize + paginate JSON đã build");
ok(form.items.length === raw.items.length, `giữ đủ ${raw.items.length} item`);
ok(pages.length === 17, `chia thành ${pages.length} phần (mong đợi 17)`);
ok(JSON.stringify(raw).includes("_exclusive"), "surveys/*.json GIỮ _exclusive (engine cần marker)");
const g = JSON.parse(readFileSync("surveys/google/creative-audit-2026.json","utf8"));
ok(!JSON.stringify(g).includes("_exclusive"), "surveys/google/*.json đã strip _exclusive (Forms API chấp nhận)");

console.log("\n[2] ô loại trừ — chỉ theo marker tường minh");
const expected = ["Không dùng AI tạo ảnh","Không dùng cái nào","Không làm phần này","Không dùng",
  "Gần như không phải sửa","Không dùng AI","Không có rào cản đáng kể","Không có hạn chế đáng kể",
  "Không gặp vấn đề đáng kể"];
const found = new Set(), falsePos = [];
form.items.forEach(it=>{
  const cq = it.questionItem?.question?.choiceQuestion;
  if(!cq || cq.type!=="CHECKBOX") return;
  cq.options.forEach(o=>{
    if(mod.isExclusive(o)){
      found.add(o.value);
      if(!expected.includes(o.value)) falsePos.push(`${it.title.slice(0,40)} → "${o.value}"`);
    }
  });
});
ok(found.size===9, `đánh dấu đúng ${found.size} ô thoát (mong đợi 9)`);
expected.forEach(e=>ok(found.has(e), `nhận ra "${e}"`));
ok(falsePos.length===0, `không nhận sai ô nào${falsePos.length?": "+falsePos.join(", "):""}`);

console.log("\n[3] giới hạn \"chọn tối đa N\"");
const caps = form.items.filter(it=>mod.maxSelectOf(it)).map(it=>[mod.maxSelectOf(it), it.title.slice(0,52)]);
ok(caps.length===1, `tìm thấy ${caps.length} câu có giới hạn (mong đợi 1 — câu rào cản AI)`);
caps.forEach(([n,t])=>console.log(`      tối đa ${n} · ${t}…`));

console.log("\n[4] skip-logic trên JSON đã build");
function next(pageIdx, answers){
  const items = pages[pageIdx].items;
  for(let i=items.length-1;i>=0;i--){
    const it=items[i]; if(!it.questionItem) continue;
    const cq=it.questionItem.question.choiceQuestion;
    if(!cq||!["RADIO","DROP_DOWN"].includes(cq.type)) continue;
    if(!cq.options.some(o=>o.goToSectionId||o.goToAction)) continue;
    const opt=cq.options.find(o=>o.value===answers[it.questionItem.question.questionId]);
    if(!opt) return pageIdx+1;
    if(opt.goToAction==="SUBMIT_FORM") return "SUBMIT";
    if(opt.goToSectionId){
      const k=pages.findIndex(p=>p.header&&p.header.itemId===opt.goToSectionId);
      if(k>=0) return k;
    }
    return pageIdx+1;
  }
  return pageIdx+1;
}
function qid(title){
  for(const it of form.items) if(it.title===title&&it.questionItem) return it.questionItem.question.questionId;
}
const A={ [qid("Bạn có làm ảnh tĩnh, illustration, graphic hoặc icon không?")]:"Không",
          [qid("Bạn có làm animation, motion graphic hoặc video không?")]:"Có",
          [qid("Bạn có làm 3D hoặc asset game không?")]:"Không",
          [qid("Bạn muốn làm gì tiếp?")]:"Gửi luôn" };
let p=0, path=[], guard=0;
while(p!=="SUBMIT" && p<pages.length && guard++<50){
  path.push(pages[p].header?pages[p].header.itemId:"(đầu)");
  p=next(p,A);
}
ok(p==="SUBMIT", "nhánh motion-only + \"Gửi luôn\" kết thúc bằng SUBMIT");
ok(!path.includes("sec_mod_graphic"), "bỏ qua module graphic");
ok(path.includes("sec_mod_motion"),  "vào module motion");
ok(!path.includes("sec_mod_3d"),     "bỏ qua module 3D");
ok(!path.includes("sec_extra"),      "bỏ qua phần mở rộng khi chọn Gửi luôn");
console.log("      " + path.join(" → "));

console.log("\n[5] validate ô trống");
ok(mod.isEmpty("")&&mod.isEmpty([])&&mod.isEmpty("__OTHER__:")&&mod.isEmpty(null), "coi \"\", [], \"__OTHER__:\" là trống");
ok(!mod.isEmpty("A")&&!mod.isEmpty(["A"]), "không coi giá trị thật là trống");

const s = mod.stats(form);
console.log(`\n[6] engine tự đếm: ${s.total} câu · ${s.required} bắt buộc · ${s.branches} nhánh · ~${s.minutes} phút`);
ok(s.total===58 && s.branches===4, "khớp với số build.mjs báo");

console.log(fail? `\n${fail} kiểm tra THẤT BẠI` : "\nTất cả kiểm tra PASS");
process.exit(fail?1:0);
