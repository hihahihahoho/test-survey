/* settings.test.mjs — S6 · CÀI ĐẶT, 5 tab (agent · env · prefs · trash · about).
   Test THẬT cho màn của team này: chạy mount() dưới minidom với agent giả,
   rồi kiểm DOM/ARIA/luồng dữ liệu. Báo pass/fail TỪNG CA (không tự nhận vống). */
import { flush, mountPoint, textOf, storageMap } from './env.mjs';
import { makeMockFetch, defaultRoutes, PROJECT, DOCTOR_NO_IMAGEGEN, TRASH as TRASH_JSON, UPDATE_AVAILABLE, UPDATE_OFFLINE } from './mock-agent.mjs';

import * as agent from '../../core/agent.js';
import * as store from '../../core/store.js';
import * as router from '../../core/router.js';
import { LS_KEYS } from '../../core/constants.js';

let pass = 0; let fail = 0;
const fails = [];
const ok = (name, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  \x1b[32m✓\x1b[0m ${name}${extra ? ` · ${extra}` : ''}`); }
  else { fail += 1; fails.push(name); console.log(`  \x1b[31m✗\x1b[0m ${name}${extra ? ` · ${extra}` : ''}`); }
};
const group = (n) => console.log(`\n\x1b[1m${n}\x1b[0m`);

/* ── setup: agent giả + đã hoàn tất setup để router không ép về /setup ── */
const reqLog = [];
function useRoutes(routes) {
  agent.configure({ fetchImpl: makeMockFetch(routes, reqLog), baseUrl: 'http://127.0.0.1:8765' });
}
useRoutes(defaultRoutes());
store.set(LS_KEYS.setup, { completed: true, step: 'done' });
router.start();

const CONNECTED = Object.freeze({
  pill: 'connected', code: null, readOnly: false, connected: true,
  baseUrl: 'http://127.0.0.1:8765', mode: 'remote',
  health: { version: '1.2.0', protocol: 1, instanceLabel: 'gray-otter', workspaceLabel: '~/KitGen', activeRuns: 1, uptimeMs: 3600000, buildId: 'b1' },
  workspaceLabel: '~/KitGen', checkedAt: new Date().toISOString(), mirrorUrl: 'http://127.0.0.1:8765/app/',
});
const OFFLINE = Object.freeze({
  pill: 'not-running', code: 'AGENT_NOT_RUNNING', readOnly: true, connected: false,
  baseUrl: null, mode: 'remote', health: null, checkedAt: new Date().toISOString(),
  mirrorUrl: 'http://127.0.0.1:8765/app/',
});

/* ═════════════════ S6 · CÀI ĐẶT ═════════════════ */
group('S6 · /settings — 5 tab');
{
  useRoutes(defaultRoutes());
  const { mountSettings } = await import('../settings/index.js');
  const host = mountPoint();
  const scr = mountSettings(host, { status: CONNECTED, tab: 'agent' });
  await flush();
  const tabs = host.querySelectorAll('[role=tab]');
  ok('có đúng 5 tab', tabs.length === 5, tabs.map((x) => textOf(x)).join('|'));

  const t = textOf(host);
  ok('tab agent hiện trạng thái kết nối', t.includes('Đã kết nối'));
  ok('tab agent hiện 2 workspace để chọn', t.includes('~/KitGen') && t.includes('~/work/kits-demo'));
  const radios = host.querySelectorAll('input').filter((i) => i.getAttribute('type') === 'radio');
  ok('chọn workspace bằng radio thật (§5.8-A5)', radios.length === 2);
  ok('KHÔNG có ô nhập đường dẫn tự do (chốt X1)',
    !host.querySelectorAll('input').some((i) => /path|đường dẫn|folder/i.test(i.getAttribute('placeholder') ?? '')));
  ok('có lệnh thêm workspace để copy', t.includes('kitgen-agent --workspace'));
  const applyBtn = host.querySelectorAll('.kg-btn--primary').find((b) => textOf(b).includes('Dùng thư mục'));
  ok('nút "Dùng thư mục đã chọn" disabled khi chưa đổi lựa chọn', !!applyBtn && applyBtn.disabled === true);

  // tab env
  scr.update({ tab: 'env' });
  await flush();
  const te = textOf(host);
  ok('tab env hiện mode image_gen dạng enum', te.includes('default-home'));
  ok('tab env hiện từng phụ thuộc', te.includes('codex CLI') && te.includes('Python') && te.includes('Trình render khung xương'));
  ok('dòng thiếu có HỆ QUẢ tiếng Việt, không chỉ "missing"', te.includes('vẫn chạy được') || te.includes('bản dự phòng') || te.includes('tách nhanh'));
  ok('nói rõ không đọc thông tin đăng nhập (YC#7)', te.includes('không bao giờ đọc'));
  ok('KHÔNG hiện đường dẫn tuyệt đối kiểu /Users/', !te.includes('/Users/'));

  // tab env với image_gen KHÔNG dùng được
  useRoutes(defaultRoutes({ doctor: DOCTOR_NO_IMAGEGEN }));
  scr.reload();
  await flush();
  const te2 = textOf(host);
  ok('image_gen thiếu → hiện lý do từ bảng enum', te2.includes('chưa đăng nhập') || te2.includes('Codex chưa đăng nhập'));
  ok('image_gen thiếu → hướng dẫn CODEX_HOME riêng', te2.includes('CODEX_HOME') && te2.includes('codex login'));
  ok('hướng dẫn KHÔNG hỏi secret', !/api[_-]?key|token/i.test(te2));

  // tab prefs
  scr.update({ tab: 'prefs' });
  await flush();
  const tp = textOf(host);
  ok('tab prefs có số lượt song song', tp.includes('song song'));
  ok('tab prefs có tự động cắt sau gen', tp.includes('Tự động cắt'));
  ok('tab prefs có chọn giao diện', tp.includes('Tối') && tp.includes('Sáng'));
  ok('tab prefs LIỆT KÊ đúng 8 khoá localStorage', (tp.match(/localStorage · kitgen\./g) ?? []).length === 8,
    String((tp.match(/localStorage · kitgen\./g) ?? []).length));
  ok('tab prefs liệt kê 3 store IndexedDB', (tp.match(/IndexedDB · kitgen\//g) ?? []).length === 3);
  // đổi maxJobs thật → ghi qua store
  const sel = host.querySelectorAll('select').find((s) => true);
  sel.value = '2';
  sel.dispatch('change');
  await flush(2);
  ok('đổi số song song ghi vào kitgen.prefs.v1 qua store.js', store.get(LS_KEYS.prefs).maxJobs === 2,
    String(store.get(LS_KEYS.prefs).maxJobs));

  // tab trash
  scr.update({ tab: 'trash' });
  await flush();
  const tt = textOf(host);
  ok('tab trash liệt kê project đã xoá', tt.includes('Candy Old'));
  ok('tab trash hiện "còn N ngày"', /còn \d+ ngày/.test(tt) || tt.includes('đã hết hạn'));
  ok('tab trash có Phục hồi + Xoá vĩnh viễn', tt.includes('Phục hồi') && tt.includes('Xoá vĩnh viễn'));
  ok('nói rõ xoá vĩnh viễn cần mã 4 số từ Terminal', tt.includes('mã 4 số'));

  // tab about
  scr.update({ tab: 'about' });
  await flush();
  const ta = textOf(host);
  ok('tab about hiện phiên bản agent', ta.includes('1.2.0'));
  ok('tab about có khối Quyền riêng tư', ta.includes('Quyền riêng tư'));
  ok('about nói rõ dữ liệu nằm trên máy bạn', ta.includes('nằm trên máy bạn'));
  ok('about nói rõ không lưu thông tin đăng nhập', ta.includes('Không lưu thông tin đăng nhập'));
  ok('about liệt kê đúng các khoá lưu ở browser', ta.includes('kitgen.prefs.v1') && ta.includes('kitgen/thumbs'));

  scr.destroy();
}

/* ═════════ S6 · tab Về — KIỂM TRA CẬP NHẬT (nút gọi /api/update) ═════════ */
group('S6 · tab Về — Kiểm tra cập nhật');
{
  const findBtn = (root, text) => root.querySelectorAll('.kg-btn').find((b) => textOf(b).includes(text));

  /* ── ca 1: đang mới nhất ── */
  reqLog.length = 0;
  useRoutes(defaultRoutes());
  const { mountSettings } = await import('../settings/index.js');
  const host = mountPoint();
  const scr = mountSettings(host, { status: CONNECTED, tab: 'about' });
  await flush();

  ok('có nút [Kiểm tra cập nhật] ở tab Về', !!findBtn(host, 'Kiểm tra cập nhật'));
  ok('KHÔNG tự gọi /api/update khi mở tab (chỉ khi user bấm)',
    !reqLog.some((r) => String(r.url).includes('/api/update')), String(reqLog.length));
  ok('trước khi bấm nói rõ chưa kiểm tra lần nào', textOf(host).includes('Chưa kiểm tra lần nào'));

  findBtn(host, 'Kiểm tra cập nhật').click();
  await flush(3);
  ok('bấm nút thì GỌI GET /api/update', reqLog.some((r) => String(r.url).includes('/api/update')));
  const tLatest = textOf(host);
  ok('bản mới nhất → nói "Đang dùng bản mới nhất" kèm version', tLatest.includes('Đang dùng bản mới nhất') && tLatest.includes('2.1.13'));
  ok('bản mới nhất → KHÔNG hiện nút [Cập nhật ngay]', !findBtn(host, 'Cập nhật ngay'));
  scr.destroy();

  /* ── ca 2: có bản mới ── */
  reqLog.length = 0;
  useRoutes(defaultRoutes({ update: UPDATE_AVAILABLE }));
  const host2 = mountPoint();
  const scr2 = mountSettings(host2, { status: CONNECTED, tab: 'about' });
  await flush();
  findBtn(host2, 'Kiểm tra cập nhật').click();
  await flush(3);
  const tNew = textOf(host2);
  ok('có bản mới → nêu ĐÍCH DANH version mới và version đang chạy', tNew.includes('2.2.0') && tNew.includes('2.1.13'));
  ok('có bản mới → hiện nút [Cập nhật ngay]', !!findBtn(host2, 'Cập nhật ngay'));
  ok('có bản mới → vẫn cho đường thủ công bằng lệnh Terminal', tNew.includes('kitgen') && tNew.includes('update'));
  ok('lệnh cập nhật là nhãn rút gọn, KHÔNG đường dẫn tuyệt đối', !tNew.includes('/Users/'));
  scr2.destroy();

  /* ── ca 3: mất mạng — KHÁC với "đang mới nhất" ── */
  useRoutes(defaultRoutes({ update: UPDATE_OFFLINE }));
  const host3 = mountPoint();
  const scr3 = mountSettings(host3, { status: CONNECTED, tab: 'about' });
  await flush();
  findBtn(host3, 'Kiểm tra cập nhật').click();
  await flush(3);
  const tOff = textOf(host3);
  ok('mất mạng → nói KHÔNG kiểm tra được, không đổ thành "đang mới nhất"',
    tOff.includes('Không đọc được danh sách bản phát hành') && !tOff.includes('Đang dùng bản mới nhất'));
  ok('mất mạng → vẫn hiện lệnh cập nhật thủ công', tOff.includes('update'));
  scr3.destroy();

  /* ── ca 4: agent chưa chạy → nút bị chặn, có lý do ── */
  const host4 = mountPoint();
  const scr4 = mountSettings(host4, { status: OFFLINE, tab: 'about' });
  await flush();
  ok('agent chưa chạy → nút [Kiểm tra cập nhật] bị chặn', findBtn(host4, 'Kiểm tra cập nhật')?.disabled === true);
  ok('agent chưa chạy → nói rõ LÝ DO chưa kiểm tra được', textOf(host4).includes('Công cụ local chưa chạy'));
  scr4.destroy();
}

console.log(`\n${'─'.repeat(70)}`);
console.log(`Tổng: ${pass + fail} ca · \x1b[32m${pass} pass\x1b[0m · ${fail ? `\x1b[31m${fail} fail\x1b[0m` : '0 fail'}`);
if (fail) { console.log('\nCa thất bại:'); fails.forEach((f) => console.log(`  · ${f}`)); }
process.exit(fail ? 1 : 0);
