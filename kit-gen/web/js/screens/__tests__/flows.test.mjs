/* Test các LUỒNG NGUY HIỂM + tốn tiền của 4 màn — nơi bug gây mất dữ liệu hoặc mất quota.
   Chạy thật dưới minidom với agent giả; kiểm bằng request đã bắn ra, không đoán. */
import { flush, mountPoint, textOf } from './env.mjs';
import { makeMockFetch, PROJECT, CONTRACT, KIT, RUNS, DOCTOR_OK, DOCTOR_NO_IMAGEGEN } from './mock-agent.mjs';

import * as agent from '../../core/agent.js';
import * as store from '../../core/store.js';
import * as router from '../../core/router.js';
import { LS_KEYS } from '../../core/constants.js';

let pass = 0; let fail = 0;
const fails = [];
const ok = (n, c, extra = '') => {
  if (c) { pass += 1; console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` · ${extra}` : ''}`); }
  else { fail += 1; fails.push(n); console.log(`  \x1b[31m✗\x1b[0m ${n}${extra ? ` · ${extra}` : ''}`); }
};
const group = (n) => console.log(`\n\x1b[1m${n}\x1b[0m`);

store.set(LS_KEYS.setup, { completed: true, step: 'done' });
router.start();

const CONNECTED = Object.freeze({
  pill: 'connected', code: null, readOnly: false, connected: true,
  baseUrl: 'http://127.0.0.1:8765', mode: 'remote',
  health: { version: '1.2.0', protocol: 1, workspaceLabel: '~/KitGen' },
  checkedAt: new Date().toISOString(), mirrorUrl: 'http://127.0.0.1:8765/app/',
});

function setup(extra = [], { doctor = DOCTOR_OK } = {}) {
  const log = [];
  const routes = [
    ...extra,
    ['/api/doctor', { status: 200, json: doctor }],
    [`/api/projects/${PROJECT.id}/contract`, { status: 200, json: { version: 37, contract: CONTRACT } }],
    [`/api/projects/${PROJECT.id}/runs`, { status: 200, json: { items: RUNS } }],
    [`/api/projects/${PROJECT.id}/kit`, { status: 200, json: KIT }],
    [`/api/projects/${PROJECT.id}`, { status: 200, json: { project: PROJECT } }],
  ];
  agent.configure({ fetchImpl: makeMockFetch(routes, log), baseUrl: 'http://127.0.0.1:8765' });
  return log;
}
const bodyOf = (r) => { try { return JSON.parse(r.body); } catch { return null; } };
const findBtn = (root, text) => root.querySelectorAll('.kg-btn').find((b) => textOf(b).includes(text));
/** Nút trong overlay trên cùng — tránh trùng tên với nút của trang bên dưới. */
const overlay = () => {
  const panels = document.body.querySelectorAll('.kg-modal__panel');
  return panels[panels.length - 1] ?? document.body;
};
const findOverlayBtn = (text, cls = '.kg-btn') => overlay().querySelectorAll(cls).find((b) => textOf(b).includes(text));

/* ══ 1 · Xoá project: modal xem trước → thùng rác → toast Hoàn tác 10s (§4.4 / X6) ══ */
group('§4.4 · xoá project có đường lùi');
{
  const log = setup([
    [`/api/trash/20260805-999-x/restore`, { status: 200, json: { project: { ...PROJECT, name: 'Tết 2026 — VietinBank iPay' } } }],
  ]);
  // DELETE của agent giả
  const delRoutes = [[`/api/projects/${PROJECT.id}`, (u, init) => {
    if (init.method === 'DELETE') {
      return { status: 200, json: { ok: true, trashId: '20260805-999-x', restoreBefore: '2026-09-04T00:00:00.000Z', cancelledRuns: ['r-0031'], bytes: 184320133 } };
    }
    return { status: 200, json: { project: PROJECT } };
  }]];
  const log2 = setup([...delRoutes, ['/api/trash/20260805-999-x/restore', { status: 200, json: { project: PROJECT } }]]);

  const { mountProjectSettings } = await import('../project/settings.js');
  const host = mountPoint();
  const scr = mountProjectSettings(host, { projectId: PROJECT.id, status: CONNECTED });
  await flush();

  findBtn(host, 'Xoá…').click();
  await flush();
  const modalText = textOf(document.body);
  ok('modal xoá XEM TRƯỚC hậu quả (§1.1-1)', modalText.includes('Sẽ chuyển vào thùng rác'));
  ok('modal nêu số sheet/element sẽ mất', modalText.includes('3 sheet') && modalText.includes('42 element'));
  ok('modal nêu ảnh AI phải gen lại tốn quota', modalText.includes('tốn quota'));
  ok('modal nêu tổng dung lượng', /\d+([,.]\d+)? MB/.test(modalText));
  ok('KHÔNG bắt gõ tên project (chốt X6)',
    !document.body.querySelectorAll('input').some((i) => /gõ|nhập tên/i.test(String(i.getAttribute('placeholder') ?? ''))));
  ok('nút xác nhận là biến thể danger', document.body.querySelectorAll('.kg-btn--danger').length >= 1);

  const confirmBtn = findOverlayBtn('thùng rác', '.kg-btn--danger');
  confirmBtn.click();
  await flush();
  const del = log2.find((r) => r.method === 'DELETE');
  ok('gọi DELETE /api/projects/:id (soft, atomic 1 call §4)', !!del, del?.url);
  const toastText = textOf(document.body);
  ok('toast báo đã vào thùng rác', toastText.includes('thùng rác'));
  ok('toast có nút Hoàn tác (§4.4 · 10s)', toastText.includes('Hoàn tác'));
  ok('toast nói đã dừng lượt đang chạy', toastText.includes('Đã dừng 1 lượt'));

  const undoBtn = document.body.querySelectorAll('.kg-btn').find((b) => textOf(b).includes('Hoàn tác'));
  undoBtn.click();
  await flush();
  ok('Hoàn tác gọi POST /api/trash/:trashId/restore',
    log2.some((r) => r.method === 'POST' && r.url.includes('/restore')), log2.filter((r) => r.method === 'POST').map((r) => r.url).join(','));
  ok('phục hồi xong có toast xác nhận', textOf(document.body).includes('Đã phục hồi'));
  scr.destroy();
}

/* ══ 2 · Sinh ảnh: luôn qua modal M1 THẬT của màn S4 (§1.1-2 / §4.8) ══ */
group('§4.8 · sinh ảnh phải xin phép — bàn giao đúng cho modal M1 của màn S4');
{
  const log = setup([[`/api/projects/${PROJECT.id}/runs`, (u, init) => (init.method === 'POST'
    ? { status: 202, json: { runId: 'r-0032', jobs: [] } }
    : { status: 200, json: { items: [] } })]]);   // không có run đang chạy để nút chính là "Sinh N lượt"
  const { mountOverview } = await import('../project/overview.js');
  const host = mountPoint();
  const scr = mountOverview(host, { projectId: PROJECT.id, status: CONNECTED });
  await flush();

  const before = log.filter((r) => r.method === 'POST' && r.url.includes('/runs')).length;
  findBtn(host, 'Sinh ảnh').click();
  await flush(12);
  ok('bấm Sinh ảnh KHÔNG chạy ngay — phải qua modal (§1.1-2)',
    log.filter((r) => r.method === 'POST' && r.url.includes('/runs')).length === before);

  const mt = textOf(overlay());
  ok('mở đúng modal M1 của màn S4 (không dựng modal thứ hai)', mt.includes('Bắt đầu sinh ảnh') && mt.includes('Chọn lượt cần sinh'));
  ok('M1 nhận đúng state.jobs của tôi → badge ô hiện "Cần sinh lại"', mt.includes('Cần sinh lại'), mt.slice(120, 200));
  ok('M1 nhận đúng state.jobs → badge ô hiện "Lỗi"', mt.includes('Lỗi'));
  ok('M1 cảnh báo quota 3–5×', mt.includes('3–5 lần'));
  ok('M1 có nút "Chỉ thứ đã đổi"', mt.includes('Chỉ thứ đã đổi'));

  const goBtn = findOverlayBtn('Sinh', '.kg-btn--primary');
  ok('M1 có nút chính đếm rõ số lượt', !!goBtn && /Sinh \d+ lượt/.test(textOf(goBtn)), textOf(goBtn ?? { textContent: '' }));
  goBtn.click();
  await flush(8);
  const post = log.find((r) => r.method === 'POST' && r.url.includes('/runs'));
  ok('xác nhận rồi mới POST /runs', !!post, post ? post.url : 'không có POST nào');
  const b = bodyOf(post) ?? { jobs: [] };
  ok('gửi kind="gen"', b?.kind === 'gen', String(b?.kind));
  ok('gửi jobs là DANH TỪ <variant>-<sheet> (đóng E7)',
    Array.isArray(b?.jobs) && b.jobs.length > 0 && b.jobs.every((j) => /^[a-z0-9-]+-[a-z0-9-]+$/.test(j)), JSON.stringify(b?.jobs));
  ok('tick sẵn đúng lượt CẦN làm, không tick lượt đã Xong',
    !b.jobs.includes('tet-main') && b.jobs.includes('tet-tall') && b.jobs.includes('vang-bg-home'), JSON.stringify(b.jobs));
  scr.destroy();
}

/* ══ 2b · Bản M1 tối giản (đường lùi khi màn S4 vắng mặt) vẫn phải an toàn ══ */
group('§4.8 · bản M1 tối giản trong nhánh của tôi vẫn đủ 3 điều kiện an toàn');
{
  const log = setup([[`/api/projects/${PROJECT.id}/runs`, (u, init) => (init.method === 'POST'
    ? { status: 202, json: { runId: 'r-0034' } } : { status: 200, json: { items: [] } })]]);
  const { openTemporaryGenModal } = await import('../project/shared/run-actions.js');
  const p = openTemporaryGenModal({ projectId: PROJECT.id, jobs: ['tet-tall', 'vang-bg-home'], status: CONNECTED });
  await flush(6);
  const mt = textOf(overlay());
  ok('(1) đếm rõ số lượt trước khi chạy', /Sẽ sinh 2 lượt/.test(mt), mt.match(/Sẽ sinh \d+ lượt/)?.[0]);
  ok('(2) cảnh báo quota 3–5× và quy đổi', mt.includes('3–5 lần') && /≈ 6–10 lượt tương đương/.test(mt));
  ok('có tuỳ chọn tự động cắt sau gen', mt.includes('Tự động cắt'));
  findOverlayBtn('Sinh 2 lượt', '.kg-btn--primary').click();
  await flush(6);
  const post = log.find((r) => r.method === 'POST' && r.url.includes('/runs'));
  ok('POST đúng jobs được truyền vào', JSON.stringify(bodyOf(post)?.jobs) === JSON.stringify(['tet-tall', 'vang-bg-home']),
    JSON.stringify(bodyOf(post)?.jobs));
  await p;
}

/* ══ 3 · Chặn TRƯỚC khi môi trường không tạo được ảnh (đóng E1 tại gốc) ══ */
group('§4.8 · doctor chặn trước, không chạy rồi mới báo lỗi');
{
  const log = setup([], { doctor: DOCTOR_NO_IMAGEGEN });
  const { openTemporaryGenModal } = await import('../project/shared/run-actions.js');
  openTemporaryGenModal({ projectId: PROJECT.id, jobs: ['tet-tall'], status: CONNECTED });
  await flush(8);
  const mt = textOf(overlay());
  ok('modal hiện lỗi môi trường TRƯỚC khi chạy', mt.includes('Chưa tạo được ảnh'));
  ok('nêu đúng lý do theo enum reason', mt.includes('chưa đăng nhập') || mt.includes('Codex chưa đăng nhập'));
  const goBtn = findOverlayBtn('Sinh', '.kg-btn--primary');
  ok('nút chạy bị vô hiệu (aria-disabled)', goBtn?.disabled === true && goBtn.getAttribute('aria-disabled') === 'true');
  ok('có nút Khắc phục ngay dẫn sang Cài đặt → Môi trường', mt.includes('Khắc phục ngay'));
  ok('có gọi /api/doctor để chặn trước', log.some((r) => r.url.includes('/api/doctor')));
  ok('KHÔNG có request POST /runs nào', !log.some((r) => r.method === 'POST' && r.url.includes('/runs')));
}

/* ══ 4 · Cắt lại = tái tạo rẻ: confirm NHẸ, không cảnh báo quota (§1.2) ══ */
group('§1.2 · cắt là thao tác tái tạo rẻ');
{
  const log = setup([[`/api/projects/${PROJECT.id}/runs`, (u, init) => (init.method === 'POST'
    ? { status: 202, json: { runId: 'r-0033', jobs: [] } }
    : { status: 200, json: { items: RUNS } })]]);
  const { mountKit } = await import('../kit/index.js');
  const host = mountPoint();
  const scr = mountKit(host, { projectId: PROJECT.id, status: CONNECTED, tab: 'assets' });
  await flush();
  findBtn(host, 'Cắt lại').click();
  await flush();
  const mt = textOf(document.body);
  ok('confirm cắt nói không tốn quota', mt.includes('Không tốn quota'));
  ok('confirm cắt KHÔNG dùng nút danger', overlay().querySelectorAll('.kg-btn--danger').length === 0);
  const goBtn = findOverlayBtn('Cắt', '.kg-btn--primary');
  goBtn.click();
  await flush();
  const post = log.find((r) => r.method === 'POST' && r.url.includes('/runs'));
  ok('POST /runs với kind="slice"', bodyOf(post)?.kind === 'slice', JSON.stringify(bodyOf(post)));
  ok('slice KHÔNG bật autoSliceAfterGen', bodyOf(post)?.autoSliceAfterGen === false);
  ok('phạm vi cắt = đúng các lượt của phong cách đang xem',
    (bodyOf(post)?.jobs ?? []).every((j) => j.startsWith('tet-')), JSON.stringify(bodyOf(post)?.jobs));
  scr.destroy();
}

/* ══ 5 · Dọn cache: mặc định chỉ tick thứ tái tạo rẻ (§4.5) ══ */
group('§4.5 · dọn cache không bao giờ chạm thiết kế/ảnh đang dùng');
{
  const log = setup([[`/api/projects/${PROJECT.id}/clean`, { status: 200, json: { freedBytes: 2097152, removed: { skeleton: 5, prompts: 10 } } }]]);
  const { mountProjectSettings } = await import('../project/settings.js');
  const host = mountPoint();
  const scr = mountProjectSettings(host, { projectId: PROJECT.id, status: CONNECTED });
  await flush();
  findBtn(host, 'Dọn cache…').click();
  await flush();
  const mt = textOf(document.body);
  ok('checklist nói rõ thiết kế + ảnh đang dùng KHÔNG bị dọn',
    mt.includes('KHÔNG BAO GIỜ bị dọn'));
  ok('mục "Lịch sử ảnh AI" có cảnh báo mất không lấy lại được', mt.includes('không lấy lại được'));
  const boxes = overlay().querySelectorAll('input').filter((i) => i.getAttribute('type') === 'checkbox');
  ok('mặc định chỉ tick 2 mục rẻ nhất (khung xương + prompt)',
    boxes.filter((b) => b.checked).length === 2, `${boxes.filter((b) => b.checked).length}/${boxes.length}`);
  const goBtn = findOverlayBtn('Dọn', '.kg-btn--primary');
  goBtn.click();
  await flush();
  const post = log.find((r) => r.url.includes('/clean'));
  ok('POST /clean gửi đúng targets đã tick', !!post && JSON.stringify(bodyOf(post)?.targets) === JSON.stringify(['skeleton', 'prompts']),
    JSON.stringify(bodyOf(post)?.targets));
  ok('toast báo đã giải phóng bao nhiêu', textOf(document.body).includes('Đã giải phóng'));
  scr.destroy();
}

/* ══ 6 · Lỗi khi lưu: form KHÔNG mất dữ liệu, lỗi hiện INLINE (§3-S2b) ══ */
group('§3-S2b · lỗi lưu không được làm mất dữ liệu đang nhập');
{
  setup([[`/api/projects/${PROJECT.id}`, (u, init) => (init.method === 'PATCH'
    ? { status: 409, json: { error: { code: 'PROJECT_ID_TAKEN', message: 'slug xuan-26 used by tet26-old', details: { suggestion: 'xuan-26-2' } } } }
    : { status: 200, json: { project: PROJECT } })]]);
  const { mountProjectSettings } = await import('../project/settings.js');
  const host = mountPoint();
  const scr = mountProjectSettings(host, { projectId: PROJECT.id, status: CONNECTED });
  await flush();
  const slugInput = host.querySelectorAll('input').find((i) => i.value === PROJECT.slug);
  slugInput.value = 'xuan-26';
  slugInput.dispatch('input');
  const nameInput = host.querySelectorAll('input').find((i) => i.value === PROJECT.name);
  nameInput.value = 'Xuân 26';
  nameInput.dispatch('input');
  findBtn(host, 'Lưu thay đổi').click();
  await flush();
  const t = textOf(host);
  ok('lỗi hiện INLINE tại ô slug (§3-S2b)', t.includes('Tên thư mục này đã có') || t.includes('đã có'));
  ok('có nút Dùng gợi ý «xuan-26-2»', t.includes('xuan-26-2'));
  ok('ô slug được đánh dấu aria-invalid', slugInput.getAttribute('aria-invalid') === 'true');
  ok('form KHÔNG mất dữ liệu đang nhập', slugInput.value === 'xuan-26' && nameInput.value === 'Xuân 26',
    `${nameInput.value} / ${slugInput.value}`);
  ok('KHÔNG hiện message kỹ thuật ra thân UI', !t.includes('used by tet26-old'));
  findBtn(host, 'xuan-26-2').click();
  ok('bấm gợi ý điền luôn vào ô slug', slugInput.value === 'xuan-26-2', slugInput.value);
  scr.destroy();
}

/* ══ 7 · Tên do user nhập không bị hiểu là HTML (§5.8-A12, đóng I6) ══ */
group('§5.8-A12 · tên user nhập luôn qua textContent');
{
  const nasty = 'Tết "26" <b>xin chào</b> <img src=x onerror=alert(1)>';
  setup([[`/api/projects/${PROJECT.id}`, { status: 200, json: { project: { ...PROJECT, name: nasty } } }]]);
  const { mountOverview } = await import('../project/overview.js');
  const host = mountPoint();
  const scr = mountOverview(host, { projectId: PROJECT.id, status: CONNECTED });
  await flush();
  ok('tên độc hại hiện NGUYÊN VĂN dưới dạng chữ', textOf(host).includes(nasty));
  ok('không sinh thẻ <b> nào từ tên', host.querySelectorAll('b').length === 0);
  ok('không sinh thẻ <img> nào từ tên',
    host.querySelectorAll('img').every((i) => !String(i.getAttribute('src')).includes('onerror')));
  scr.destroy();
}

console.log(`\n${'─'.repeat(70)}`);
console.log(`Tổng: ${pass + fail} ca · \x1b[32m${pass} pass\x1b[0m · ${fail ? `\x1b[31m${fail} fail\x1b[0m` : '0 fail'}`);
if (fail) { console.log('\nCa thất bại:'); fails.forEach((f) => console.log(`  · ${f}`)); }
process.exit(fail ? 1 : 0);
