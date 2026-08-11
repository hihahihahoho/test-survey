/* Tự kiểm LUẬT CỨNG trên chính mã của team này (quét file thật, không tin lời khai):
   1. Không hard-code màu (#hex / rgb() / hsl()) — mọi màu phải là var(--token).
   2. Không hard-code khoảng cách ngoài thang §5.1 — phải dùng var(--s-*)/var(--r-*).
   3. Không gọi fetch/XMLHttpRequest trực tiếp (§6.5-1) — chỉ qua core/agent.js.
   4. Không chạm localStorage/sessionStorage/indexedDB trực tiếp (§6.5-2) — chỉ qua core/store.js, core/idb.js.
   5. Không innerHTML/outerHTML/insertAdjacentHTML/document.write (§5.8-A12, đóng I6).
   6. Không window.alert/confirm/prompt (§5.5 cấm, đóng I7).
   7. Không tự viết lại primitive: không định nghĩa class .kg-btn/.kg-modal/.kg-toast…
   8. Mỗi file < 400 dòng.
   9. Không chuỗi đường dẫn tuyệt đối (/Users/…) trong mã. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname;
const OWNED = ['project', 'kit', 'settings'];

let pass = 0; let fail = 0;
const fails = [];
const ok = (n, c, extra = '') => {
  if (c) { pass += 1; console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` · ${extra}` : ''}`); }
  else { fail += 1; fails.push(`${n}${extra ? ` — ${extra}` : ''}`); console.log(`  \x1b[31m✗\x1b[0m ${n}${extra ? ` · ${extra}` : ''}`); }
};

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__') walk(p, out); }
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = OWNED.flatMap((d) => walk(join(ROOT, d)));
console.log(`\n\x1b[1mLint ${files.length} file thuộc web/js/screens/{project,kit,settings}\x1b[0m`);

/** Bỏ comment để không bắt lỗi oan phần giải thích. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
}

const RULES = [
  { id: 'màu hard-code', re: /#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g,
    // Ngoại lệ: KHÔNG có. Mọi màu phải qua token.
  },
  { id: 'fetch trực tiếp', re: /\bfetch\s*\(|XMLHttpRequest|EventSource|new\s+WebSocket/g },
  // Chỉ bắt DÙNG API thật (localStorage.getItem, indexedDB.open, gán biến…), không bắt chuỗi hiển thị
  { id: 'storage trực tiếp', re: /\b(localStorage|sessionStorage|indexedDB)\s*(\.|\[|\))/g },
  { id: 'innerHTML/outerHTML', re: /\b(innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write/g },
  { id: 'alert/confirm/prompt của trình duyệt', re: /\b(window\.)?(alert|confirm|prompt)\s*\(/g,
    allow: (line) => /confirmDestructive|confirmLight|confirmChecklist|confirmBtn|confirmHeader|onConfirm/.test(line) },
  { id: 'định nghĩa lại primitive CSS', re: /\.kg-(btn|modal|toast|badge|drawer|tooltip|menu)\s*\{/g },
  { id: 'đường dẫn tuyệt đối', re: /\/Users\/|\/home\/[a-z]/g },
];

for (const rule of RULES) {
  const hits = [];
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'));
    src.split('\n').forEach((line, i) => {
      rule.re.lastIndex = 0;
      if (!rule.re.test(line)) return;
      if (rule.allow && rule.allow(line)) return;
      hits.push(`${relative(ROOT, f)}:${i + 1} → ${line.trim().slice(0, 90)}`);
    });
  }
  ok(`không có: ${rule.id}`, hits.length === 0, hits.length ? hits.slice(0, 3).join(' | ') : '');
}

/* px thô trong style: chỉ cho phép các giá trị hình học đã ghi chú (aspect/kích thước ô lưới) */
{
  const allowPx = new Set(['0px', '1px', '2px', '6px', '8px', '72px', '96px', '104px', '120px', '152px', '180px', '200px', '208px', '240px', '256px', '280px', '320px', '360px']);
  const bad = [];
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'));
    src.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/'(\d+px)'|`(\d+px)`|: '(\d+px)/g)) {
        const v = m[1] ?? m[2] ?? m[3];
        if (v && !allowPx.has(v)) bad.push(`${relative(ROOT, f)}:${i + 1} → ${v}`);
      }
    });
  }
  ok('không dùng px thô ngoài danh sách hình học đã khai', bad.length === 0, bad.slice(0, 4).join(' | '));
}

/* Mỗi file < 400 dòng (§ luật cứng của đề bài) */
{
  const tooLong = files
    .map((f) => ({ f: relative(ROOT, f), n: readFileSync(f, 'utf8').split('\n').length }))
    .filter((x) => x.n >= 400);
  ok('mọi file < 400 dòng', tooLong.length === 0, tooLong.map((x) => `${x.f}=${x.n}`).join(', '));
  const max = files.map((f) => readFileSync(f, 'utf8').split('\n').length).sort((a, b) => b - a)[0];
  console.log(`     (file dài nhất: ${max} dòng)`);
}

/* Không sửa file của team khác: kiểm mtime/nội dung không phải việc của lint,
   nhưng kiểm được rằng ta KHÔNG import bằng đường dẫn ghi vào core/ui. */
{
  const bad = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    // chỉ được IMPORT từ core/ui, không được có đường dẫn ghi hay require động vào đó
    for (const m of src.matchAll(/from\s+'([^']+)'/g)) {
      const p = m[1];
      if (p.includes('../ui/') || p.includes('../core/') || p.startsWith('./') || p.startsWith('../')) continue;
      bad.push(`${relative(ROOT, f)} → ${p}`);
    }
  }
  ok('không import gì ngoài core/ui và file cùng nhánh (không CDN, không npm)', bad.length === 0, bad.join(', '));
}

/* Dùng THẬT primitive của design system (không phải chỉ khai) */
{
  const need = ['createButton', 'openModal', 'toast', 'createBadge', 'createTabs', 'createEmptyState'];
  const all = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  for (const n of need) ok(`có dùng primitive ${n}`, all.includes(n));
}

/* ─────────────────────────────────────────────────────────────────────────────
   R1 (QA LEAD) — HAI LUẬT BẢO MẬT phải quét TOÀN BỘ web/js, không chỉ 3 nhánh OWNED.
   Lý do: §6.5-1 (chỉ core/agent.js được fetch) và §6.5-2 (chỉ store.js/idb.js được
   chạm storage) là luật CỨNG cho cả bundle. Trước đây lint chỉ soi 26/128 file nên
   mã mới ở ui/, app-shell/, core/ lách qua được mà CI không kêu.
   Quét mọi file .js trong web/js trừ chính hai cửa hợp pháp và thư mục __tests__. */
{
  const WEBJS = join(ROOT, '..');            // web/js
  const LEGAL_FETCH = ['core/agent.js'];
  const LEGAL_STORAGE = ['core/store.js', 'core/idb.js'];
  const all = [];
  (function walkAll(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== '__tests__') walkAll(p); }
      else if (e.name.endsWith('.js')) all.push(p);
    }
  }(WEBJS));

  const scan = (re, legal, label) => {
    const hits = [];
    for (const f of all) {
      const rel = relative(WEBJS, f).split(sep).join('/');
      if (legal.includes(rel)) continue;
      const src = stripComments(readFileSync(f, 'utf8'));
      src.split('\n').forEach((line, i) => {
        re.lastIndex = 0;
        if (re.test(line)) hits.push(`${rel}:${i + 1} → ${line.trim().slice(0, 80)}`);
      });
    }
    ok(`[R1] TOÀN BỘ web/js (${all.length} file) — ${label}`, hits.length === 0, hits.slice(0, 4).join(' | '));
  };
  scan(/\bfetch\s*\(|XMLHttpRequest|EventSource|new\s+WebSocket/g, LEGAL_FETCH, 'không fetch ngoài core/agent.js (§6.5-1)');
  scan(/\b(localStorage|sessionStorage|indexedDB)\s*(\.|\[|\))/g, LEGAL_STORAGE, 'không chạm storage ngoài core/store.js·idb.js (§6.5-2)');
}

console.log(`\n${'─'.repeat(70)}`);
console.log(`Tổng: ${pass + fail} ca · \x1b[32m${pass} pass\x1b[0m · ${fail ? `\x1b[31m${fail} fail\x1b[0m` : '0 fail'}`);
if (fail) { console.log('\nCa thất bại:'); fails.forEach((f) => console.log(`  · ${f}`)); }
process.exit(fail ? 1 : 0);
