/* Chạy THẬT preview-demo.js + preview-demo2.js dưới minidom: dựng đúng các
   #id mà preview-ui.html có, rồi import module như trình duyệt sẽ làm.
   Bắt mọi lỗi/warning ra console. */
import './minidom.mjs';
const IDS = ['theme-switch','swatches','type-scale','buttons','badges','badges-overlay','fields',
  'cards','tables','tabs','overlays','toasts','tips','empties','loaders','layout'];
const byId = new Map();
for (const id of IDS) { const n = document.createElement('div'); n.setAttribute('id', id); document.body.appendChild(n); byId.set(id, n); }
document.getElementById = (id) => byId.get(id) || null;
// bổ sung: preview dùng querySelector('.kg-field__label') trên header
const errors = [];
const warns = [];
const origWarn = console.warn, origErr = console.error;
console.warn = (...a) => { warns.push(a.join(' ')); };
console.error = (...a) => { errors.push(a.join(' ')); };
try {
  await import('../preview-demo.js');
} catch (e) {
  errors.push('IMPORT THREW: ' + e.stack);
}
console.warn = origWarn; console.error = origErr;
let total = 0;
for (const [id, n] of byId) {
  const kids = n.childNodes.length;
  total += kids;
  console.log(`  #${id.padEnd(16)} → ${kids} node con ${kids ? '' : '  <-- TRỐNG'}`);
}
console.log('\nTổng node gắn vào trang:', total);
console.log('console.error:', errors.length ? errors : '(không có)');
console.log('console.warn :', warns.length ? warns : '(không có)');
// đếm primitive thật đã dựng
const q = (s) => document.body.querySelectorAll(s).length;
console.log('\nĐếm primitive đã dựng trong DOM:');
for (const s of ['.kg-btn','.kg-badge','.kg-pill','.kg-field','.kg-card','[role=tab]','.kg-matrix-cell','.kg-skel','.kg-tag','.kg-check','.kg-banner','.kg-empty','.kg-code','.kg-spinner','.kg-dot','[role=radiogroup]','.kg-table','.kg-list'])
  console.log(`  ${s.padEnd(20)} ${q(s)}`);
process.exit(errors.length ? 1 : 0);
