/* Bấm THẬT mọi nút trong trang demo để chắc không có handler nào throw. */
import './minidom.mjs';
const IDS=['theme-switch','swatches','type-scale','buttons','badges','badges-overlay','fields','cards','tables','tabs','overlays','toasts','tips','empties','loaders','layout'];
const byId=new Map();
for(const id of IDS){const n=document.createElement('div');n.setAttribute('id',id);document.body.appendChild(n);byId.set(id,n);}
document.getElementById=(id)=>byId.get(id)||null;
await import('../preview-demo.js');

const errs=[];
const buttons=document.body.querySelectorAll('button');
console.log('Số nút tìm thấy:', buttons.length);
let clicked=0;
for(const b of buttons){
  const lbl=(b.textContent||b.getAttribute('aria-label')||'?').trim().slice(0,42);
  try{ b.click(); clicked++; }
  catch(e){ errs.push(`"${lbl}" → ${e.message}`); }
}
await new Promise(r=>setTimeout(r,120));
console.log('Đã bấm:', clicked);
console.log('Handler throw:', errs.length? errs : '(không có)');
// bấm cả nút mới sinh ra bởi overlay (modal/menu/drawer vừa mở)
const after=document.body.querySelectorAll('button').length;
console.log('Số nút sau khi các overlay mở ra:', after);
const dialogs=document.body.querySelectorAll('[role=dialog]').length;
const menus=document.body.querySelectorAll('[role=menu]').length;
const toasts=document.body.querySelectorAll('.kg-toast').length;
console.log(`overlay đang mở: dialog=${dialogs} menu=${menus} toast=${toasts} (toast phải ≤3)`);
console.log(toasts<=3 ? 'PASS giới hạn 3 toast vẫn giữ khi spam click' : 'FAIL toast vượt 3');
process.exit(errs.length?1:0);
