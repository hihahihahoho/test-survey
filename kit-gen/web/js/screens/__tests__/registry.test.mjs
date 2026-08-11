/* registry.test.mjs — kiểm TÍCH HỢP THẬT với app-shell của team khác:
   nạp 4 màn của tôi qua `web/js/app-shell/screen-registry.js` (không phải import trực tiếp),
   mount bằng đúng hợp đồng mount(host, ctx), rồi kiểm màn vẽ được nội dung thật.
   Đây là ca chống hồi quy quan trọng nhất về ranh giới giữa hai team:
   nếu tôi lỡ đổi tên export `mount`, test này fail ngay chứ không đợi tới lúc chạy app. */
import './dom-patch.mjs';
import { flush } from './env.mjs';
import { makeMockFetch, defaultRoutes, PROJECT } from './mock-agent.mjs';
import * as agent from '../../core/agent.js';
import * as store from '../../core/store.js';
import { LS_KEYS } from '../../core/constants.js';
import { loadScreen, SCREEN_LABEL } from '../../app-shell/screen-registry.js';

const log = [];
agent.configure({ fetchImpl: makeMockFetch(defaultRoutes(), log), baseUrl: 'http://127.0.0.1:8765' });
store.set(LS_KEYS.setup, { completed: true, step: 'done' });

const CONNECTED = { pill:'connected', readOnly:false, connected:true, baseUrl:'http://127.0.0.1:8765',
  mode:'remote', health:{version:'1.2.0', buildId:'b1', workspaceLabel:'~/KitGen'}, mirrorUrl:'x', checkedAt:new Date().toISOString() };

const cases = [
  ['project', { id: PROJECT.id }, null, 'Việc tiếp theo'],
  ['project-settings', { id: PROJECT.id }, null, 'Vùng nguy hiểm'],
  ['kit', { id: PROJECT.id }, 'assets', 'Ma trận so sánh'],
  ['settings', {}, 'agent', 'Thư mục làm việc'],
];
let bad = 0;
for (const [id, params, tab, expect] of cases) {
  const mod = await loadScreen(id);
  if (!mod) { console.log(`  ✗ ${id} — screen-registry KHÔNG nạp được module (mount thiếu?)`); bad++; continue; }
  const host = document.createElement('div');
  document.body.appendChild(host);
  let h;
  try { h = mod.mount(host, { route:{ id, screen:id }, params, query:{}, tab, status: CONNECTED, navigate(){}, go(){}, shell:{} }); }
  catch (e) { console.log(`  ✗ ${id} — mount THROW: ${e.message}`); bad++; continue; }
  await flush(10);
  const t = String(host.textContent ?? '');
  const okc = t.includes(expect);
  console.log(`  ${okc ? '✓' : '✗'} ${id} (${SCREEN_LABEL[id]}) — ${okc ? `vẽ thật, thấy "${expect}"` : `KHÔNG thấy "${expect}"; text=${t.slice(0,120)}`}`);
  if (!okc) bad++;
  h.destroy();
}
console.log(bad === 0 ? '\n✓ Cả 4 màn nạp được qua screen-registry thật của app-shell' : `\n✗ ${bad} màn có vấn đề`);
process.exit(bad ? 1 : 0);
