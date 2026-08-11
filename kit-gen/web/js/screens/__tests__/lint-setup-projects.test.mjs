/* TỰ KIỂM LUẬT CỨNG trên chính mã của tôi (quét file thật, không tin lời khai).
   Phạm vi: web/js/screens/setup/**, web/js/screens/projects/**, web/js/app-shell/**, web/js/boot.js,
   và web/index.html.
     1 không hard-code màu (#hex/rgb/hsl) — mọi màu qua var(--token)
     2 không hard-code px/rem ngoài thang §5.1 — phải var(--s-*)/var(--r-*)
     3 không fetch/XHR/WebSocket trực tiếp (§6.5-1)
     4 không chạm localStorage/sessionStorage/indexedDB trực tiếp (§6.5-2)
     5 không innerHTML/outerHTML/insertAdjacentHTML/document.write (§5.8-A12, đóng I6)
     6 không alert/confirm/prompt của trình duyệt (§5.5, đóng I7)
     7 không định nghĩa lại primitive (.kg-btn{…} …)
     8 mỗi file < 400 dòng
     9 không đường dẫn tuyệt đối trong mã
    10 không hiện error.message kỹ thuật ra thân UI (chỉ qua createDevDetails/devDetails) */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { assert, describe, it } from '../../core/__tests__/harness.mjs';

const JS_ROOT = new URL('../../', import.meta.url).pathname;      // web/js/
const WEB_ROOT = new URL('../../../', import.meta.url).pathname;  // web/

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '__tests__') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

const FILES = [
  ...walk(join(JS_ROOT, 'screens/setup')),
  ...walk(join(JS_ROOT, 'screens/projects')),
  ...walk(join(JS_ROOT, 'app-shell')),
  join(JS_ROOT, 'boot.js'),
];
const rel = (f) => f.slice(JS_ROOT.length);

/** Bỏ comment + chuỗi template nhiều dòng của script .sh để không bắt lỗi oan. */
function code(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '')).join('\n');
}
/** Bỏ luôn nội dung script bash (installer-script.js) khi kiểm px/màu. */
function codeNoScript(f, src) {
  const c = code(src);
  return f.endsWith('installer-script.js') ? c.replace(/const SCRIPT = `[\s\S]*?\n`;/, 'const SCRIPT = "";') : c;
}

function scan(re, { transform = code, allow = null } = {}) {
  const hits = [];
  for (const f of FILES) {
    const src = transform(f, readFileSync(f, 'utf8'));
    src.split('\n').forEach((line, i) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line)) !== null) {
        if (allow && allow(line, m)) continue;
        hits.push(`${rel(f)}:${i + 1}  ${line.trim().slice(0, 100)}`);
      }
    });
  }
  return hits;
}
const wrap = (fn) => (f, src) => fn(f, src);

describe('LUẬT CỨNG · dùng lại design system, không tự vẽ lại', () => {
  it(`1 · không hard-code màu trong ${FILES.length} file`, () => {
    const hits = scan(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g, {
      transform: wrap(codeNoScript),
      // Ngoại lệ DUY NHẤT: BG_LABEL — mã màu nền tách là NỘI DUNG hiển thị theo §3-S3.6,
      // không phải giá trị CSS. Kiểm thêm ở ca "mã màu chỉ dùng làm nhãn" bên dưới.
      allow: (line) => /^\s*(magenta|green):\s*'(Magenta|Green) #[0-9A-F]{6}',?$/.test(line),
    });
    assert(hits.length === 0, `\n${hits.join('\n')}`);
  });
  it('1b · mã màu nền tách CHỈ dùng làm nhãn, không bao giờ vào thuộc tính style', () => {
    const hits = scan(/(background|color|border|fill|stroke)[^:\n]*:\s*[^,\n]*#[0-9a-fA-F]{3,8}/gi, {
      transform: wrap(codeNoScript),
    });
    assert(hits.length === 0, `\n${hits.join('\n')}`);
  });
  it('2 · không hard-code px/rem ngoài thang §5.1', () => {
    const hits = scan(/:\s*'-?\d+(\.\d+)?(px|rem|em)'|\b\d+(\.\d+)?(px|rem)\b/g, {
      transform: wrap(codeNoScript),
      // ngoại lệ được spec cho phép: hairline 1px/2px của viền, và kích thước hình học nội bộ
      allow: (line) => /1px|2px|'0'|hairline|width: '1px'/.test(line) && !/#|rgb/.test(line),
    });
    assert(hits.length === 0, `\n${hits.join('\n')}`);
  });
  it('7 · không định nghĩa lại primitive của ui/', () => {
    const hits = scan(/\.kg-(btn|modal|toast|badge|drawer|tooltip|menu|card)\s*\{/g);
    assert(hits.length === 0, `\n${hits.join('\n')}`);
  });
});

describe('LUẬT CỨNG · transport & state chỉ qua core', () => {
  it('3 · không fetch/XHR/WebSocket/EventSource trực tiếp (§6.5-1)', () => {
    const hits = scan(/\bfetch\s*\(|XMLHttpRequest|EventSource|new\s+WebSocket/g, {
      // `fetchImpl`/`fetchList`/`fetchTrashCount` là tên hàm của tôi, không phải fetch của trình duyệt
      allow: (line) => /fetchImpl|fetchList|fetchTrashCount|theFetch/.test(line),
    });
    assert(hits.length === 0, `\n${hits.join('\n')}`);
  });
  it('4 · không chạm localStorage/sessionStorage/indexedDB (§6.5-2)', () => {
    const hits = scan(/\b(localStorage|sessionStorage|indexedDB)\s*(\.|\[)/g);
    assert(hits.length === 0, `\n${hits.join('\n')}`);
  });
  it('mọi lời gọi agent đều đi qua core/api.js hoặc core/agent.js', () => {
    const hits = [];
    for (const f of FILES) {
      const src = code(readFileSync(f, 'utf8'));
      if (!/\/api\/|\/health/.test(src)) continue;
      // Chỉ app-shell/commands.js (chuỗi lệnh hiển thị), agent-sheet (nhãn) và export-zip
      // (gọi agent._request có chủ đích, đã ghi lý do) được nhắc tới path API.
      if (/(commands|agent-sheet|agent-status)\.js$/.test(f)) continue;
      if (/export-zip\.js$/.test(f) && /agent\._request/.test(src)) continue;
      hits.push(rel(f));
    }
    assert(hits.length === 0, `file tự ghép URL API: ${hits.join(', ')}`);
  });
});

describe('LUẬT CỨNG · an toàn & a11y', () => {
  it('5 · không innerHTML/outerHTML/insertAdjacentHTML/document.write', () => {
    const hits = scan(/\b(innerHTML|outerHTML|insertAdjacentHTML)\b|document\.write/g);
    assert(hits.length === 0, `\n${hits.join('\n')}`);
  });
  it('6 · không alert/confirm/prompt của trình duyệt (§5.5, đóng I7)', () => {
    const hits = scan(/\b(window\.)?(alert|confirm|prompt)\s*\(/g, {
      allow: (line) => /confirmDestructive|confirmLight|confirmChecklist|confirmBtn|confirmHeader|prompt-input|promptCmd/.test(line),
    });
    assert(hits.length === 0, `\n${hits.join('\n')}`);
  });
  it('9 · không đường dẫn tuyệt đối trong mã (arch §4.3-5)', () => {
    const hits = scan(/\/Users\/|\/home\/[a-z]/g, {
      transform: wrap(codeNoScript),
      allow: (line) => /\$HOME|~\//.test(line),
    });
    assert(hits.length === 0, `\n${hits.join('\n')}`);
  });
  it('10 · không đưa err.message ra thân UI (chỉ qua devDetails)', () => {
    const hits = scan(/text:\s*[^,\n]*\b(err|e)\.message\b|textContent\s*=\s*[^;\n]*\.message\b/g);
    assert(hits.length === 0, `\n${hits.join('\n')}`);
  });
});

describe('LUẬT CỨNG · mỗi file dưới ~400 dòng (bài học studio.html 743 dòng)', () => {
  it('không file nào ≥ 400 dòng', () => {
    const big = FILES
      .map((f) => [rel(f), readFileSync(f, 'utf8').split('\n').length])
      .filter(([, n]) => n >= 400);
    assert(big.length === 0, big.map(([f, n]) => `${f} = ${n} dòng`).join('\n'));
  });
  it('web/index.html mỏng và KHÔNG chứa logic (không <script> nội dung)', () => {
    const html = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
    const lines = html.split('\n').length;
    assert(lines < 200, `index.html = ${lines} dòng`);
    const noComments = html.replace(/<!--[\s\S]*?-->/g, '');
    const inline = noComments.match(/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g) ?? [];
    assert(inline.length === 0, `index.html không được chứa <script> nội dung: ${inline.join('')}`);
    const scripts = noComments.match(/<script[^>]*>/g) ?? [];
    // Đường dẫn GỐC, không phải tương đối: deep link (/p/:id/design, /app/p/:id/runs/:runId)
    // làm `./js/boot.js` phân giải thành `/p/:id/js/boot.js` → SPA fallback trả HTML → trang trắng.
    // Bản mirror /app/ được agent rewrite (agent/routes/app.mjs rewriteIndexBase).
    assert(scripts.length === 1 && /type="module"/.test(scripts[0]) && /src="\/js\/boot\.js"/.test(scripts[0]),
      `phải có ĐÚNG 1 script module trỏ tới /js/boot.js (gốc, không tương đối), thấy: ${scripts.join(' ')}`);
    const css = noComments.match(/<link[^>]+rel="stylesheet"[^>]*>/g) ?? [];
    assert(css.length === 1 && /href="\/css\/app\.css"/.test(css[0]),
      `CSS phải nạp bằng đường dẫn gốc /css/app.css, thấy: ${css.join(' ')}`);
    assert(html.includes('<meta name="viewport"'), 'thiếu meta viewport (đóng audit I5)');
    assert(html.includes('lang="vi"'), 'thiếu lang="vi" (§5.8-A13)');
    assert(/Content-Security-Policy/.test(html), 'thiếu CSP (§8.2)');
    assert(!/https:\/\/(?!kitgen\.pages\.dev)[a-z]/.test(html.replace(/http:\/\/www\.w3\.org[^"']*/g, '')), 'không được nạp gì từ domain thứ ba');
  });
  it('index.html ghi rõ MOUNT POINT cho team khác', () => {
    const html = readFileSync(join(WEB_ROOT, 'index.html'), 'utf8');
    assert(html.includes('MOUNT POINT'), 'phải chỉ rõ mount point');
    assert(html.includes('main#main'), 'phải nêu tên phần tử mount');
    assert(html.includes('mount(host, ctx)'), 'phải nêu hợp đồng mount');
    for (const p of ['screens/project/index.js', 'screens/design/index.js', 'screens/runs/index.js', 'screens/kit/index.js', 'screens/settings/index.js']) {
      assert(html.includes(p), `thiếu chỉ dẫn đường dẫn ${p}`);
    }
  });
});
