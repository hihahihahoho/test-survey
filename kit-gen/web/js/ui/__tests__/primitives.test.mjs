import './minidom.mjs';
const UI = '../';
const m = await import(UI + 'index.js');
let pass=0, fail=0;
const ok=(n,c,extra='')=>{ if(c){pass++;console.log(`  PASS ${n}${extra?' · '+extra:''}`);} else {fail++;console.log(`  FAIL ${n}${extra?' · '+extra:''}`);} };
const t=(n,fn)=>{ try{ fn(); }catch(e){ fail++; console.log(`  FAIL ${n} · THREW ${e.message}`); } };

console.log('\n== 1. Export đủ 12 primitive + helper ==');
const need=['createButton','createInput','createSelect','createTextarea','createCheckbox','createSegmented','createCodeBlock',
 'openModal','toast','createBadge','createJobBadge','createRunBadge','createAgentPill','createCard','createSection','createThumb',
 'createTable','createList','createTabs','openDrawer','attachTooltip','createInfoPopover','createEmptyState','createErrorState',
 'createBanner','createSpinner','createSkeleton','confirmDestructive','confirmLight','confirmChecklist','attachMenu',
 'createMatrixCell','createStatusDot','worstJobState','JOB_STATES','RUN_STATES','AGENT_STATES'];
for(const k of need) ok(`export ${k}`, typeof m[k]!=='undefined');

console.log('\n== 2. Button: 5 biến thể × 3 cỡ, trạng thái ==');
for(const v of ['primary','secondary','ghost','danger','link'])
  for(const s of ['sm','md','lg']){
    const b=m.createButton({label:'x',variant:v,size:s});
    ok(`btn ${v}/${s}`, b.className.includes(`kg-btn--${v}`)&&b.className.includes(`kg-btn--${s}`));
  }
t('btn variant lạ phải throw', ()=>{ let threw=false; try{ m.createButton({label:'x',variant:'fancy'});}catch{threw=true;} ok('reject variant thứ 6',threw); });
t('btn icon-only thiếu aria phải throw', ()=>{ let threw=false; try{ m.createButton({icon:'x',iconOnly:true});}catch{threw=true;} ok('icon-only buộc có aria-label',threw); });
{ const b=m.createButton({label:'Lưu',variant:'primary'});
  m.setLoading(b,true);
  ok('loading: aria-busy + spinner + giữ chữ', b.getAttribute('aria-busy')==='true' && !!b.querySelector('.kg-btn__spinner') && b.textContent.includes('Lưu'));
  m.setLoading(b,false); ok('bỏ loading: xoá spinner', !b.querySelector('.kg-btn__spinner') && b.disabled===false);
  m.setDisabled(b,true,'Cần công cụ local đang chạy');
  ok('disabled: có cả disabled + aria-disabled (§2.5-2)', b.disabled===true && b.getAttribute('aria-disabled')==='true');
}

console.log('\n== 3. Badge/§5.7: 7 job + 5 run + 6 agent, luôn có CHỮ ==');
ok('JOB_STATES đúng 7', Object.keys(m.JOB_STATES).length===7, Object.keys(m.JOB_STATES).join(','));
for(const s of Object.keys(m.JOB_STATES)){
  const b=m.createJobBadge(s);
  ok(`job badge ${s} có chữ`, b.textContent.trim().length>0, `"${b.textContent.trim()}"`);
}
ok('RUN_STATES có done-with-errors', !!m.RUN_STATES['done-with-errors']);
{ const b=m.createRunBadge('done-with-errors',{done:5,total:8,failed:3});
  ok('done-with-errors KHÔNG dùng ✓ và không nói "Xong" trơn (đóng E1)', !b.textContent.includes('✓') && !/^Xong/.test(b.textContent.trim()), `"${b.textContent.trim()}"`); }
ok('AGENT_STATES đúng 6', Object.keys(m.AGENT_STATES).length===6);
for(const s of Object.keys(m.AGENT_STATES)){
  const p=m.createAgentPill(s,{onClick(){}});
  ok(`agent pill ${s} có chữ (audit I1)`, p.textContent.trim().length>0, `"${p.textContent.trim()}"`);
}
ok('pill checking không bấm được', m.createAgentPill('checking').disabled===true || m.createAgentPill('checking').tagName==='SPAN');
ok('worstJobState ưu tiên failed', m.worstJobState(['ok','stale','failed'])==='failed');
ok('worstJobState ok khi tất cả ok', m.worstJobState(['ok','ok'])==='ok');
ok('worstJobState running > stale', m.worstJobState(['stale','running'])==='running');
t('badge thiếu text phải throw',()=>{ let th=false; try{ m.createBadge({state:'ok'});}catch{th=true;} ok('cấm badge chỉ icon/màu',th); });
t('StatusDot thiếu label throw',()=>{ let th=false; try{ m.createStatusDot('ok');}catch{th=true;} ok('StatusDot buộc có chữ',th); });

console.log('\n== 4. Field: nhãn thật + lỗi + aria ==');
{ const f=m.createInput({label:'Tên project',value:'Tết "26" <b>'});
  const lab=f.el.querySelector('label');
  ok('input có <label for> khớp id (đóng I4)', lab.getAttribute('for')===f.input.getAttribute('id'));
  ok('giá trị user KHÔNG bị parse thành HTML (đóng I6/A12)', f.input.value==='Tết "26" <b>');
  f.setError('Đã có project tên này.');
  ok('setError: aria-invalid', f.input.getAttribute('aria-invalid')==='true');
  ok('setError: aria-describedby trỏ tới vùng lỗi', (f.input.getAttribute('aria-describedby')||'').includes(f.el.querySelector('[role=status]').getAttribute('id')));
  ok('setError: chữ lỗi hiện ra', f.el.textContent.includes('Đã có project tên này.'));
  f.setError(null); ok('xoá lỗi: bỏ aria-invalid', f.input.getAttribute('aria-invalid')===null);
}
t('input thiếu label phải throw',()=>{ let th=false; try{ m.createInput({value:'x'});}catch{th=true;} ok('cấm control không nhãn',th); });
{ const s=m.createSelect({label:'Màu nền tách',value:'green',options:[{value:'magenta',label:'Magenta'},{value:'green',label:'Green'}]});
  ok('select render đủ option', s.el.querySelectorAll('option').length===2);
}
{ const c=m.createCheckbox({label:'Tự động cắt',checked:true});
  ok('checkbox là input thật trong <label>', c.input.tagName==='INPUT' && c.el.tagName==='LABEL' && c.checked===true); }
{ const seg=m.createSegmented({label:'Nguồn art style',items:[{value:'a',label:'A'},{value:'b',label:'B'}],value:'a',note:'2 ảnh brand đang KHÔNG được dùng'});
  ok('segmented là radiogroup', seg.group.getAttribute('role')==='radiogroup');
  ok('mục chọn có aria-checked', seg.group.querySelectorAll('[aria-checked=true]').length===1);
  ok('chỉ 1 tabstop (roving tabindex)', seg.group.querySelectorAll('[role=radio]').filter(b=>b.tabIndex===0).length===1);
  ok('dòng ⓘ khi nhánh khác có dữ liệu (đóng C3)', seg.el.textContent.includes('KHÔNG được dùng'));
  seg.setValue('b'); ok('đổi lựa chọn được', seg.value==='b');
}
{ const cb=m.createCodeBlock({code:'bash setup.sh'});
  ok('CodeBlock role=group + tabindex=0 + có nút Copy', cb.el.getAttribute('role')==='group' && cb.el.getAttribute('tabindex')==='0' && !!cb.el.querySelector('.kg-code__copy')); }

console.log('\n== 5. Modal: aria-modal, labelledby, Esc, trả focus ==');
{ const trigger=m.createButton({label:'Mở'}); document.body.appendChild(trigger); trigger.focus();
  const before=document.activeElement;
  const mo=m.openModal({title:'Xoá project?',description:'mô tả',body:document.createElement('div'),
    footer:m.createModalFooter({cancel:m.createButton({label:'Huỷ'}),confirm:m.createButton({label:'Xoá',variant:'danger'})})});
  ok('panel role=dialog + aria-modal', mo.panel.getAttribute('role')==='dialog' && mo.panel.getAttribute('aria-modal')==='true');
  ok('aria-labelledby trỏ tới tiêu đề thật', mo.panel.getAttribute('aria-labelledby')===mo.panel.querySelector('.kg-modal__title').getAttribute('id'));
  ok('aria-describedby trỏ tới mô tả', mo.panel.getAttribute('aria-describedby')===mo.panel.querySelector('.kg-modal__desc').getAttribute('id'));
  ok('khoá cuộn body khi mở', document.body.classList.contains('kg-no-scroll'));
  ok('footer: nút xác nhận nằm CUỐI (bên phải)', mo.footer.textContent.trim().endsWith('Xoá'));
  mo.close();
  ok('đóng: mở lại cuộn body', !document.body.classList.contains('kg-no-scroll'));
  ok('đóng: TRẢ FOCUS về trigger (§5.8-A7)', document.activeElement===before);
}
t('modal thiếu title throw',()=>{ let th=false; try{ m.openModal({});}catch{th=true;} ok('modal buộc có title cho aria',th); });

console.log('\n== 6. Toast: aria-live, tối đa 3, Hoàn tác ==');
{ const t1=m.toast.success({title:'Đã tạo'});
  ok('success role=status', t1.el.getAttribute('role')==='status');
  const t2=m.toast.error({title:'Lỗi rồi'});
  ok('error role=alert + assertive (§5.8-A8)', t2.el.getAttribute('role')==='alert' && t2.el.getAttribute('aria-live')==='assertive');
  let undone=false;
  const t3=m.toast.success({title:'Đã xoá',undo:{onUndo:()=>{undone=true;}}});
  ok('toast có nút Hoàn tác', t3.el.textContent.includes('Hoàn tác'));
  t3.el.querySelectorAll('button').find(b=>b.textContent.includes('Hoàn tác')).click();
  ok('bấm Hoàn tác gọi callback (X6)', undone===true);
  m.toast.info({title:'1'}); m.toast.info({title:'2'}); m.toast.info({title:'3'}); m.toast.info({title:'4'});
  const cont=document.body.querySelector('.kg-toasts');
  ok('giữ TỐI ĐA 3 toast (§5.5)', cont.childNodes.length<=3, `đang có ${cont.childNodes.length}`);
  m.toast.closeAll();
}

console.log('\n== 7. Tabs: role, 1 tabstop, mũi tên ==');
{ const tb=m.createTabs({ariaLabel:'Bản thiết kế',tabs:[
    {id:'a',label:'Sheet & element',panel:document.createElement('div')},
    {id:'b',label:'Phong cách',panel:document.createElement('div')},
    {id:'c',label:'Nâng cao',panel:document.createElement('div')}]});
  ok('tablist role đúng', tb.tablist.getAttribute('role')==='tablist');
  ok('đúng 1 tabstop', tb.tablist.querySelectorAll('[role=tab]').filter(x=>x.tabIndex===0).length===1);
  ok('panel ẩn đúng 2 cái', tb.panelWrap.querySelectorAll('[role=tabpanel]').filter(p=>p.hasAttribute('hidden')).length===2);
  ok('panel có aria-labelledby', !!tb.panels.get('a').getAttribute('aria-labelledby'));
  tb.tablist.dispatch('keydown',{key:'ArrowRight'});
  ok('ArrowRight đổi tab (§5.8-A6)', tb.activeId==='b', `active=${tb.activeId}`);
  tb.tablist.dispatch('keydown',{key:'End'});
  ok('End tới tab cuối', tb.activeId==='c');
  tb.setActive('a'); ok('setActive được', tb.activeId==='a');
}

console.log('\n== 8. Table/List: scope, aria-sort, checkbox có nhãn ==');
{ const tbl=m.createTable({caption:'Danh sách project',selectable:true,sort:{key:'name',dir:'asc'},onSort(){},
   columns:[{key:'name',label:'Project',sortable:true},{key:'n',label:'Sheet',align:'right'}],
   rows:[{__label:'Tết 2026',name:'Tết 2026',n:5},{__label:'Candy',name:'Candy',n:3}]});
  ok('mọi th có scope=col', tbl.table.querySelectorAll('th').every(th=>th.getAttribute('scope')==='col'));
  ok('cột sort có aria-sort', tbl.table.querySelectorAll('[aria-sort]').length>=1);
  const boxes=tbl.table.querySelectorAll('input');
  ok('mọi checkbox có aria-label (đóng I4)', boxes.every(b=>!!b.getAttribute('aria-label')), boxes.map(b=>b.getAttribute('aria-label')).join(' | '));
  boxes[1].checked=true; boxes[1].dispatch('change');
  ok('chọn dòng → selection + aria-selected', tbl.selection.length===1 && tbl.tbody.querySelectorAll('[aria-selected=true]').length===1);
}
{ const l=m.createList({ariaLabel:'Lượt chạy',items:[{main:'r-0031',onClick(){}},{main:'r-0030'}]});
  ok('dòng bấm được là <button> (đóng I2)', l.childNodes[0].tagName==='BUTTON');
  ok('list có aria-label', l.getAttribute('aria-label')==='Lượt chạy'); }

console.log('\n== 9. Drawer ==');
{ const tr=m.createButton({label:'x'}); document.body.appendChild(tr); tr.focus(); const before=document.activeElement;
  const d=m.openDrawer({title:'Nhật ký r-0031',wide:true,blocking:false,body:document.createElement('div')});
  ok('drawer không chặn = complementary (§5.5)', d.el.getAttribute('role')==='complementary');
  ok('wide → class kg-drawer--wide (640px cho log)', d.el.className.includes('kg-drawer--wide'));
  d.close(); ok('drawer đóng trả focus', document.activeElement===before);
  const d2=m.openDrawer({title:'Lịch sử',body:document.createElement('div')});
  ok('drawer chặn = dialog + aria-modal', d2.el.getAttribute('role')==='dialog' && d2.el.getAttribute('aria-modal')==='true');
  d2.close();
}

console.log('\n== 10. Card/Thumb/Empty/Error/Banner ==');
{ const c=m.createCard({title:'Tết "26" <script>',rows:['2 phong cách · 5 sheet'],footLeft:'4 phút',footRight:'176 MB',
    badges:[m.createJobBadge('stale')],tags:[m.createTag('tet')],actions:m.createButton({label:'Mở'})});
  ok('tên project render qua textContent (đóng I6)', c.textContent.includes('Tết "26" <script>') && c.querySelectorAll('script').length===0);
}
t('thumb thiếu alt throw',()=>{ let th=false; try{ m.createThumb({src:'x.png'});}catch{th=true;} ok('Thumb buộc có alt (§5.8-A9)',th); });
{ const e=m.createEmptyState({title:'Chưa có project nào',description:'d',primary:m.createButton({label:'Tạo project',variant:'primary'}),steps:['a','b','c']});
  ok('empty state có nút primary + 3 bước', e.textContent.includes('Tạo project') && e.querySelectorAll('li').length===3); }
{ const e=m.createErrorState({title:'Không đọc được project',actions:[m.createButton({label:'Mở thư mục'})],devDetails:'ENOENT: no such file'});
  ok('error state role=alert', e.getAttribute('role')==='alert');
  ok('chi tiết kỹ thuật nằm trong <details> GẬP LẠI (§6.1: không hiện ở thân UI)', !!e.querySelector('details') && !e.querySelector('details').hasAttribute('open'));
  ok('message kỹ thuật không ở thân, chỉ trong details', e.querySelector('details').textContent.includes('ENOENT'));
}
{ const b=m.createBanner({kind:'warning',title:'Chưa thấy công cụ local',actions:[m.createButton({label:'Copy lệnh'}),m.createButton({label:'Thử lại'})]});
  ok('banner có icon + chữ + nút', b.textContent.includes('Chưa thấy công cụ local'));
  // §2.5-1 khai đích danh 3 nút cho banner chỉ-đọc ⇒ 3 phải HỢP LỆ, 4 mới bị chặn
  const b3=m.createBanner({kind:'warning',title:'Chưa thấy công cụ local',actions:[m.createButton({label:'Copy lệnh'}),m.createButton({label:'Thử lại'}),m.createButton({label:'Vì sao?'})]});
  const acts=b3.querySelector('.kg-banner__actions');
  ok('banner nhận đủ 3 nút của §2.5-1 và cả 3 nằm TRONG vùng actions', !!acts && acts.childNodes.length===3);
  let th=false; try{ m.createBanner({kind:'info',title:'x',actions:[1,2,3,4]});}catch{th=true;}
  ok('banner >3 nút bị chặn', th); }

console.log('\n== 11. Spinner/Skeleton ==');
{ ok('spinner có nhãn cho screen reader', m.createSpinner({label:'Đang tải danh sách'}).textContent.includes('Đang tải danh sách'));
  ok('spinner role=status', m.createSpinner({}).getAttribute('role')==='status');
  const g=m.createSkeletonGrid({expected:6});
  ok('skeleton grid đúng số dự kiến (§5.6)', g.querySelectorAll('.kg-card').length===6);
  ok('skeleton grid có aria-busy', g.getAttribute('aria-busy')==='true'); }

console.log('\n== 12. MatrixCell + confirm + menu ==');
{ const c=m.createMatrixCell({state:'stale',variantLabel:'Tết đỏ',sheetLabel:'tall',onClick(){}});
  ok('matrix cell là <button>', c.tagName==='BUTTON');
  ok('aria-label đủ nghĩa (§3-S2)', c.getAttribute('aria-label')==='Tết đỏ, sheet tall, Thiết kế đã đổi sau lần sinh ảnh cuối', `"${c.getAttribute('aria-label')}"`);
  ok('có aria-pressed cho chọn nhiều', c.getAttribute('aria-pressed')==='false');
}
{ const p=m.confirmDestructive({title:'Xoá «Tết 2026»?',consequences:['176 MB','8 ảnh AI'],confirmLabel:'Xoá'});
  const panel=document.body.querySelectorAll('[role=dialog]').pop();
  ok('confirm dùng modal trong app, KHÔNG window.confirm (đóng I7)', !!panel);
  ok('hiện trước hậu quả (§1.1-1)', panel.textContent.includes('176 MB') && panel.textContent.includes('8 ảnh AI'));
  const del=panel.querySelectorAll('button').find(b=>b.textContent.trim()==='Xoá');
  ok('nút xác nhận là biến thể danger', del.className.includes('kg-btn--danger'));
  ok('KHÔNG bắt gõ tên project (X6)', panel.querySelectorAll('input').length===0);
  del.click();
  p.then(v=>ok('confirm resolve true khi xác nhận', v===true));
}
{ const trg=m.createButton({icon:'⋯',iconOnly:true,ariaLabel:'Thao tác'});
  document.body.appendChild(trg);
  m.attachMenu(trg,()=>[{label:'Mở',onSelect(){}},'separator',{label:'Xoá…',danger:true,onSelect(){}},{label:'Xuất',disabled:true,disabledReason:'Cần công cụ local'}]);
  ok('trigger có aria-haspopup + aria-expanded', trg.getAttribute('aria-haspopup')==='menu' && trg.getAttribute('aria-expanded')==='false');
  trg.dispatch('keydown',{key:'F10',shiftKey:true,preventDefault(){}});
  const menu=document.body.querySelector('[role=menu]');
  ok('Shift+F10 mở menu bằng bàn phím (§5.8-A6)', !!menu);
  ok('menu items có role=menuitem', menu.querySelectorAll('[role=menuitem]').length===3);
  ok('mục disabled vẫn HIỆN + aria-disabled (§2.5-2)', menu.querySelectorAll('[aria-disabled=true]').length===1);
  ok('aria-expanded thành true khi mở', trg.getAttribute('aria-expanded')==='true');
}
await new Promise(r=>setTimeout(r,50));
console.log(`\n================ KẾT QUẢ: ${pass} PASS · ${fail} FAIL ================`);
process.exit(fail?1:0);
