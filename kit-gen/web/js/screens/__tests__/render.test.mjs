/**
 * Test DỰNG THẬT giao diện S3/S4 trên DOM giả: chứng minh 3 vùng có đúng cấu trúc,
 * lưới ô đúng cols×rows và phân biệt ô trống, panel thuộc tính hiện LỖI INLINE,
 * a11y cơ bản (role/aria/1 tabstop), và 4 trạng thái của màn.
 */
import { describe, it, assert, eq } from '../../core/__tests__/harness.mjs';
import { document } from './dom-extra.mjs';
import * as agent from '../../core/agent.js';
import * as idb from '../../core/idb.js';
import * as store from '../../core/store.js';
import { jsonResponse, mockFetch } from '../../core/__tests__/mock-fetch.mjs';

import { createCellGrid } from '../design/cell-grid.js';
import { createPropsPanel } from '../design/props.js';
import { createDesignTree } from '../design/tree.js';
import { createSaveBar, createValidateBar } from '../design/save-bar.js';
import { createLogView } from '../runs/log-view.js';
import { validateContract } from '../design/validate.js';
import { silhouetteSvg, cellAspect } from '../design/shapes.js';
import { ensureScreenCss } from '../design/css.js';
import { readFileSync } from 'node:fs';

/* CSS của S3+S4 nay là FILE THẬT (chuyển ở lượt tích hợp) — lint đọc thẳng file,
   không còn lint chuỗi trong JS. Ca lint vì thế mạnh hơn: nó soi đúng thứ trình duyệt tải. */
const CSS_ROOT = new URL('../../../css/components/', import.meta.url).pathname;
const SCREEN_CSS = ['editor.css', 'runs.css']
  .map((f) => readFileSync(CSS_ROOT + f, 'utf8')).join('\n');

const comp = (f, over = {}) => ({ file: f, vi: `Nhãn ${f}`, spec: 'spec', skel: { shape: 'pill', w: 0.8, h: 0.4 }, ...over });
const EMPTY = { file: '', vi: '', spec: '', skel: { shape: 'empty' } };
const sheet4 = () => ({
  id: 'main', grid: { cols: 2, rows: 2 }, orient: 'landscape',
  components: [comp('01-a'), comp('02-b'), EMPTY, comp('04-d')],
});
const contract = () => ({
  schemaVersion: 4, sheets: [sheet4()],
  variants: [{ id: 'tet', vi: 'Tết đỏ', brand: { mode: 'colors', primary: '#d42a1e' } }],
});

function setup() {
  store._setBackend(store._memoryBackend());
  idb.configure({ indexedDBImpl: null });
  agent.configure({
    fetchImpl: mockFetch(() => jsonResponse({})), baseUrl: 'http://127.0.0.1:8765',
    location: { protocol: 'https:', hostname: 'kitgen.pages.dev', origin: 'https://kitgen.pages.dev', pathname: '/' },
  });
}

describe('CellGrid: lưới đúng cols×rows, ô trống phân biệt rõ (§3-S3.3, §5.6)', () => {
  it('đủ số ô, là <button> chứ không phải div onclick (A5/I2)', () => {
    setup();
    const g = createCellGrid({});
    const node = g.render(sheet4());
    const cells = node.querySelectorAll('.d-cell');
    eq(cells.length, 4, 'lưới 2×2 phải có 4 ô');
    for (const c of cells) eq(c.tagName, 'BUTTON', 'ô phải là <button>');
  });
  it('grid có role=grid + aria-rowcount/colcount, ô có aria-rowindex/colindex', () => {
    setup();
    const g = createCellGrid({});
    const node = g.render(sheet4());
    eq(node.getAttribute('role'), 'grid');
    eq(node.getAttribute('aria-rowcount'), '2');
    eq(node.getAttribute('aria-colcount'), '2');
    const last = node.querySelectorAll('.d-cell')[3];
    eq([last.getAttribute('aria-rowindex'), last.getAttribute('aria-colindex')], ['2', '2']);
  });
  it('ĐÚNG MỘT tabstop (composite widget — §5.8-A6)', () => {
    setup();
    const g = createCellGrid({});
    const node = g.render(sheet4());
    const cells = [...node.querySelectorAll('.d-cell')];
    eq(cells.filter((c) => c.tabIndex === 0).length, 1);
    eq(cells[0].tabIndex, 0);
  });
  it('ô trống có class riêng + ký hiệu ␀ + nhãn "trống" (không chỉ dựa vào màu)', () => {
    setup();
    const g = createCellGrid({});
    const node = g.render(sheet4());
    const cells = node.querySelectorAll('.d-cell');
    assert(cells[2].className.includes('d-cell--empty'), 'ô 3 phải là ô trống');
    assert(cells[2].textContent.includes('␀'), 'phải có ký hiệu ␀');
    assert(cells[2].getAttribute('aria-label').includes('trống'), 'aria-label phải nói "trống"');
    assert(!cells[0].className.includes('d-cell--empty'));
  });
  it('ô có LỖI được đánh dấu d-cell--error + aria-label nói "có lỗi"', () => {
    setup();
    const g = createCellGrid({});
    const issues = new Map([[1, [{ code: 'V-01', message: 'x', severity: 'error' }]]]);
    const node = g.render(sheet4(), { issues });
    const cells = node.querySelectorAll('.d-cell');
    assert(cells[1].className.includes('d-cell--error'));
    assert(cells[1].getAttribute('aria-label').includes('có lỗi'));
  });
  it('mũi tên di chuyển con trỏ; ⌥+mũi tên GỌI onMove (đổi vị trí element)', () => {
    setup();
    const moves = [];
    const sel = [];
    const g = createCellGrid({ onMove: (a, b) => moves.push([a, b]), onSelect: (i) => sel.push(i) });
    const node = g.render(sheet4());
    const cells = node.querySelectorAll('.d-cell');
    cells[0].dispatch('keydown', { key: 'ArrowRight', altKey: false });
    eq(sel.at(-1), 1, 'mũi tên phải chuyển ô đang chọn');
    eq(moves, [], 'mũi tên trơn KHÔNG được đổi vị trí');
    cells[1].dispatch('keydown', { key: 'ArrowRight', altKey: true });
    eq(moves, [[1, 2]], '⌥→ phải đổi vị trí ô 1 với ô 2');
  });
  it('ArrowDown nhảy đúng 1 hàng (index + cols)', () => {
    setup();
    const sel = [];
    const g = createCellGrid({ onSelect: (i) => sel.push(i) });
    const node = g.render(sheet4());
    node.querySelectorAll('.d-cell')[0].dispatch('keydown', { key: 'ArrowDown' });
    eq(sel.at(-1), 2);
  });
  it('không đi ra ngoài biên lưới', () => {
    setup();
    const sel = [];
    const g = createCellGrid({ onSelect: (i) => sel.push(i) });
    const node = g.render(sheet4());
    node.querySelectorAll('.d-cell')[0].dispatch('keydown', { key: 'ArrowUp' });
    node.querySelectorAll('.d-cell')[0].dispatch('keydown', { key: 'ArrowLeft' });
    eq(sel, [], 'ở biên thì không phát sự kiện chọn');
  });
  it('⌫ gọi onDelete (có confirm ở tầng màn)', () => {
    setup();
    const del = [];
    const g = createCellGrid({ onDelete: (i) => del.push(i) });
    const node = g.render(sheet4());
    node.querySelectorAll('.d-cell')[1].dispatch('keydown', { key: 'Backspace' });
    eq(del, [1]);
  });
  it('update() KHÔNG dựng lại DOM khi lưới không đổi (đóng H3)', () => {
    setup();
    const g = createCellGrid({});
    const node = g.render(sheet4());
    const firstRowNode = node.childNodes[0];
    const s2 = sheet4();
    s2.components[0].vi = 'đổi nhãn';
    g.update(s2);
    assert(node.childNodes[0] === firstRowNode, 'node hàng phải được giữ nguyên (không dựng lại DOM)');
    eq(node.querySelectorAll('.d-cell').length, 4);
  });
  it('update() dựng lại khi ĐỔI LƯỚI', () => {
    setup();
    const g = createCellGrid({});
    const node = g.render(sheet4());
    const s2 = { ...sheet4(), grid: { cols: 3, rows: 2 }, components: [...sheet4().components, EMPTY, EMPTY] };
    g.update(s2);
    eq(node.querySelectorAll('.d-cell').length, 6);
  });
});

describe('silhouette SVG dựng được, tôn trọng skel', () => {
  it('trả về <svg> có viewBox và nội dung hình khối', () => {
    setup();
    const svg = silhouetteSvg({ shape: 'pill', w: 0.8, h: 0.4 }, 120, 80);
    eq(svg.tagName, 'SVG');
    assert(svg.getAttribute('viewBox'), 'phải có viewBox');
    const g = svg.childNodes[0];
    assert(String(g.innerHTML).includes('<rect'), `pill phải vẽ rect bo góc: ${g.innerHTML}`);
  });
  it('shape=empty không vẽ gì', () => {
    setup();
    eq(silhouetteSvg({ shape: 'empty' }, 100, 100).childNodes.length, 0);
  });
  it('free=true thì KHÔNG vẽ khung safe zone (đúng skeleton.py dòng 114)', () => {
    setup();
    const withBox = silhouetteSvg({ shape: 'rrect', w: 0.6, h: 0.6 }, 100, 100);
    const noBox = silhouetteSvg({ shape: 'rrect', w: 0.6, h: 0.6, free: true }, 100, 100);
    assert(withBox.childNodes.length > noBox.childNodes.length, 'free phải bớt 1 node khung');
  });
  it('tỉ lệ ô theo orient: landscape 3:2, portrait 2:3', () => {
    eq(cellAspect('landscape'), 1.5);
    eq(cellAspect('portrait'), 2 / 3);
  });
});

describe('Panel thuộc tính: LỖI HIỆN INLINE ngay dưới field (không chỉ toast)', () => {
  it('element sai tên file → input có aria-invalid + thông điệp inline', () => {
    setup();
    const c = contract();
    c.sheets[0].components[0].file = 'sai-ten';
    const v = validateContract(c);
    const p = createPropsPanel({ libEntryFor: () => null });
    p.render({ kind: 'element', sheetId: 'main', index: 0 }, { sheet: c.sheets[0], contract: c, validation: v, readOnly: false });
    const inputs = p.el.querySelectorAll('input');
    const bad = inputs.find((i) => i.getAttribute('aria-invalid') === 'true');
    assert(bad, 'phải có field bị đánh dấu aria-invalid');
    assert(p.el.textContent.includes('2 số + gạch nối'), `thông điệp V-01 phải hiện inline: ${p.el.textContent.slice(0, 200)}`);
  });
  it('w ngoài khoảng → thông điệp V-06 inline', () => {
    setup();
    const c = contract();
    c.sheets[0].components[0].skel.w = 3;
    const v = validateContract(c);
    const p = createPropsPanel({ libEntryFor: () => null });
    p.render({ kind: 'element', sheetId: 'main', index: 0 }, { sheet: c.sheets[0], contract: c, validation: v, readOnly: false });
    assert(p.el.textContent.includes('0.05 đến 1.00'), 'phải hiện thông điệp V-06');
  });
  it('không lỗi → không có aria-invalid nào', () => {
    setup();
    const c = contract();
    const v = validateContract(c);
    const p = createPropsPanel({ libEntryFor: () => null });
    p.render({ kind: 'element', sheetId: 'main', index: 0 }, { sheet: c.sheets[0], contract: c, validation: v, readOnly: false });
    eq(p.el.querySelectorAll('input').filter((i) => i.getAttribute('aria-invalid') === 'true').length, 0);
  });
  it('có 3 cờ skel: slice9 / free / plain, đều là checkbox thật', () => {
    setup();
    const c = contract();
    const p = createPropsPanel({ libEntryFor: () => null });
    p.render({ kind: 'element', sheetId: 'main', index: 0 }, { sheet: c.sheets[0], contract: c, validation: validateContract(c), readOnly: false });
    const boxes = p.el.querySelectorAll('input[type=checkbox]');
    assert(boxes.length >= 3, `phải có ≥3 checkbox, nhận ${boxes.length}`);
    assert(p.el.textContent.includes('slice9'));
    assert(p.el.textContent.includes('free'));
  });
  it('badge "đã sửa" + nút Trả về bản gốc chỉ hiện khi KHÁC thư viện (chốt X8)', () => {
    setup();
    const c = contract();
    const lib = { file: '01-a', spec: 'spec', skel: { shape: 'pill', w: 0.8, h: 0.4 } };
    const p1 = createPropsPanel({ libEntryFor: () => lib });
    p1.render({ kind: 'element', sheetId: 'main', index: 0 }, { sheet: c.sheets[0], contract: c, validation: validateContract(c), readOnly: false });
    assert(!p1.el.textContent.includes('Trả về bản gốc'), 'giống bản gốc thì không hiện');

    const c2 = contract();
    c2.sheets[0].components[0].spec = 'tôi đã sửa';
    const p2 = createPropsPanel({ libEntryFor: () => lib });
    p2.render({ kind: 'element', sheetId: 'main', index: 0 }, { sheet: c2.sheets[0], contract: c2, validation: validateContract(c2), readOnly: false });
    assert(p2.el.textContent.includes('đã sửa'), 'phải có badge đã sửa');
    assert(p2.el.textContent.includes('Trả về bản gốc'), 'phải có nút trả về bản gốc');
  });
  it('chế độ CHỈ ĐỌC: nút/field bị disabled nhưng KHÔNG bị ẩn (§2.5-2)', () => {
    setup();
    const c = contract();
    const p = createPropsPanel({ libEntryFor: () => null });
    p.render({ kind: 'element', sheetId: 'main', index: 0 }, { sheet: c.sheets[0], contract: c, validation: validateContract(c), readOnly: true });
    const inputs = p.el.querySelectorAll('input');
    assert(inputs.length > 0, 'field vẫn phải hiện');
    assert(inputs.every((i) => i.disabled), 'mọi field phải disabled');
    assert(p.el.textContent.includes('Xoá element'), 'nút xoá vẫn hiện, chỉ bị vô hiệu');
  });
  it('panel Sheet có ô lưới + dòng nói rõ cần bao nhiêu ô', () => {
    setup();
    const c = contract();
    const p = createPropsPanel({ libEntryFor: () => null });
    p.render({ kind: 'sheet', sheetId: 'main' }, { sheet: c.sheets[0], contract: c, validation: validateContract(c), readOnly: false });
    assert(p.el.textContent.includes('Lưới 2×2 cần đúng 4 ô'), p.el.textContent.slice(0, 200));
  });
  it('panel Nhân vật có 19 checkbox dáng + câu "chỉ áp dụng cho project"', () => {
    setup();
    const p = createPropsPanel({ libEntryFor: () => null, refUrl: () => null });
    p.render({ kind: 'character', characterId: 'lan' }, {
      character: { id: 'lan', vi: 'Lan', ref: '', poses: ['idle'], variantIds: ['tet'] },
      contract: contract(), validation: { errors: [], warnings: [], byTarget: new Map() }, readOnly: false,
    });
    const poseBox = p.el.querySelectorAll('.d-poses')[0];
    assert(poseBox, 'phải có khối 19 dáng');
    const poses = poseBox.querySelectorAll('input[type=checkbox]');
    eq(poses.length, 19, 'phải đủ 19 dáng');
    assert(p.el.textContent.includes('chỉ áp dụng cho project'), 'phải nói rõ dáng thuộc project (đóng A3)');
  });
  it('không chọn gì → empty state nói việc tiếp theo', () => {
    setup();
    const p = createPropsPanel({});
    p.render(null, { contract: contract(), validation: { errors: [], warnings: [], byTarget: new Map() } });
    assert(p.el.textContent.includes('Chưa chọn gì'));
    assert(p.el.textContent.includes('Chọn một sheet'), 'phải hướng dẫn bước tiếp');
  });
});

describe('Cây thiết kế (vùng ①)', () => {
  it('3 nhóm gập được, mỗi nhóm là disclosure có aria-expanded', () => {
    setup();
    const t = createDesignTree({});
    t.update({ sheets: contract().sheets, characters: [], variants: contract().variants, jobStates: {} });
    const toggles = t.el.querySelectorAll('.d-tree__toggle');
    eq(toggles.length, 3, 'Sheet · Nhân vật · Phong cách');
    for (const b of toggles) assert(b.getAttribute('aria-expanded') !== null);
    assert(t.el.textContent.includes('Sheet'));
    assert(t.el.textContent.includes('Nhân vật'));
    assert(t.el.textContent.includes('Phong cách'));
  });
  it('dòng sheet hiện n/tổng ô + badge trạng thái xấu nhất', () => {
    setup();
    const t = createDesignTree({});
    t.update({
      sheets: contract().sheets, characters: [], variants: contract().variants,
      jobStates: { 'tet-main': 'failed', 'vang-main': 'ok' },
    });
    assert(t.el.textContent.includes('3/4'), `phải hiện 3/4 ô: ${t.el.textContent}`);
    assert(t.el.textContent.includes('Lỗi'), 'badge phải là trạng thái xấu nhất (failed)');
  });
  it('⌥↑ trên dòng sheet gọi onMoveSheet', () => {
    setup();
    const moved = [];
    const t = createDesignTree({ onMoveSheet: (id, d) => moved.push([id, d]) });
    t.update({ sheets: contract().sheets, characters: [], variants: [], jobStates: {} });
    t.el.querySelectorAll('.d-tree__row')[0].dispatch('keydown', { key: 'ArrowUp', altKey: true });
    eq(moved, [['main', -1]]);
  });
  it('chế độ chỉ đọc: nút Thêm sheet disabled, không ẩn', () => {
    setup();
    const t = createDesignTree({});
    t.update({ sheets: [], characters: [], variants: [], jobStates: {}, readOnly: true });
    assert(t.el.textContent.includes('Thêm sheet'));
    const btn = t.el.querySelectorAll('button').find((b) => b.textContent.includes('Thêm sheet'));
    assert(btn.disabled, 'phải disabled');
  });
});

describe('Thanh lưu + thanh validate (§3.7)', () => {
  it('sạch → nút Lưu DISABLED, hiện "đã lưu" (đóng B6)', () => {
    setup();
    const bar = createSaveBar({});
    bar.update({ version: 37, dirty: false, pending: 0, savedAt: '2026-08-05T12:04:00Z', canUndo: false, canRedo: false, validation: { errors: [], warnings: [] }, readOnly: false });
    assert(bar.saveButton.disabled, 'nút Lưu phải disabled khi sạch');
    assert(bar.el.textContent.includes('v37'));
  });
  it('bẩn + hợp lệ → nút Lưu BẤM ĐƯỢC, nhãn "Lưu (3)"', () => {
    setup();
    const bar = createSaveBar({});
    bar.update({ version: 37, dirty: true, pending: 3, savedAt: null, canUndo: true, canRedo: false, validation: { errors: [], warnings: [] }, readOnly: false });
    assert(!bar.saveButton.disabled);
    assert(bar.el.textContent.includes('Lưu (3)'), bar.el.textContent);
    assert(bar.el.textContent.includes('3 thay đổi chưa lưu'));
  });
  it('CÓ LỖI → chặn lưu; chỉ CẢNH BÁO → vẫn lưu được', () => {
    setup();
    const bar = createSaveBar({});
    bar.update({ version: 1, dirty: true, pending: 1, canUndo: true, canRedo: false, validation: { errors: [{ code: 'V-04', message: 'x' }], warnings: [] }, readOnly: false });
    assert(bar.saveButton.disabled, 'có lỗi thì phải chặn');
    bar.update({ version: 1, dirty: true, pending: 1, canUndo: true, canRedo: false, validation: { errors: [], warnings: [{ code: 'V-07', message: 'x' }] }, readOnly: false });
    assert(!bar.saveButton.disabled, 'chỉ cảnh báo thì KHÔNG chặn');
  });
  it('chỉ đọc → chặn lưu kèm lý do', () => {
    setup();
    const bar = createSaveBar({});
    bar.update({ version: 1, dirty: true, pending: 1, canUndo: false, canRedo: false, validation: { errors: [], warnings: [] }, readOnly: true });
    assert(bar.saveButton.disabled);
    eq(bar.saveButton.getAttribute('aria-disabled'), 'true');
  });
  it('thanh validate: "Hợp lệ" khi sạch, "N lỗi · M cảnh báo" khi có vấn đề', () => {
    setup();
    const vb = createValidateBar({ onJump: () => {} });
    vb.update({ errors: [], warnings: [] });
    assert(vb.el.textContent.includes('Hợp lệ'));
    vb.update({ errors: [{ code: 'V-04', message: 'a' }, { code: 'V-01', message: 'b' }], warnings: [{ code: 'V-07', message: 'c' }] });
    assert(vb.el.textContent.includes('2 lỗi'), vb.el.textContent);
    assert(vb.el.textContent.includes('1 cảnh báo'), vb.el.textContent);
    eq(vb.el.getAttribute('aria-live'), 'polite');
  });
});

describe('LogView (§5.6): nối thêm, cuộn thông minh, lọc, aria-live chỉ đọc dòng lỗi', () => {
  const L = (n, level = 'info') => ({ seq: n, t: '2026-08-05T12:04:0' + (n % 10) + '.000Z', job: 'tet-main', level, text: `dòng ${n}` });
  it('append NỐI THÊM, không ghi đè', () => {
    setup();
    const v = createLogView();
    v.append([L(1), L(2)]);
    v.append([L(3)]);
    eq(v.list.querySelectorAll('.r-log__line').length, 3);
    eq(v.count, 3);
  });
  it('dòng lỗi có class riêng (không chỉ dựa vào màu)', () => {
    setup();
    const v = createLogView();
    v.append([L(1), L(2, 'error')]);
    eq(v.list.querySelectorAll('.r-log__line--error').length, 1);
  });
  it('aria-live CHỈ đọc dòng lỗi (không spam screen reader)', () => {
    setup();
    const v = createLogView();
    v.append([L(1), L(2), L(3, 'error')]);
    const live = v.el.querySelectorAll('[aria-live=polite]')[0];
    assert(live.textContent.includes('dòng 3'), 'phải đọc dòng lỗi');
    assert(!live.textContent.includes('dòng 1'), 'không đọc dòng info');
  });
  it('lọc [Chỉ lỗi] và lọc theo lượt', () => {
    setup();
    const v = createLogView();
    v.append([L(1), L(2, 'error'), { ...L(3), job: 'tet-tall' }]);
    v.setFilter({ errorsOnly: true });
    eq(v.list.querySelectorAll('.r-log__line').length, 1);
    v.setFilter({ errorsOnly: false, job: 'tet-tall' });
    eq(v.list.querySelectorAll('.r-log__line').length, 1);
    v.setFilter({ job: null });
    eq(v.list.querySelectorAll('.r-log__line').length, 3, 'bỏ lọc thì hiện lại đủ (không mất dòng)');
  });
  it('giữ tối đa 5000 dòng nhưng không mất dòng MỚI', () => {
    setup();
    const v = createLogView();
    v.append(Array.from({ length: 5200 }, (_, i) => L(i)));
    eq(v.count, 5000);
    assert(v.text().includes('dòng 5199'), 'dòng mới nhất phải còn');
  });
  it('nút ⏬ Về cuối ẩn khi đang ở cuối', () => {
    setup();
    const v = createLogView();
    v.append([L(1)]);
    const btnWrap = v.el.querySelectorAll('.r-tobottom')[0];
    assert(btnWrap.hasAttribute('hidden'), 'ở cuối thì ẩn nút');
  });
  it('text() xuất được để tải log', () => {
    setup();
    const v = createLogView();
    v.append([L(1), L(2, 'error')]);
    const t = v.text();
    assert(t.includes('dòng 1') && t.includes('dòng 2'));
    assert(t.split('\n').length === 2);
  });
});

describe('CSS của S3+S4 (file thật) chỉ dùng token — không hard-code màu/khoảng cách', () => {
  it('CSS ở file thật, ensureScreenCss KHÔNG còn bơm <style>', () => {
    setup();
    // CSS không còn bơm bằng <style> từ JS: nó ở web/css/components/{editor,runs}.css
    // và được app.css @import. Gọi nhiều lần vẫn không tạo thẻ <style> nào.
    ensureScreenCss();
    ensureScreenCss();
    eq(document.head.querySelectorAll('style').length, 0);
    const app = readFileSync(new URL('../../../css/app.css', import.meta.url).pathname, 'utf8');
    assert(app.includes('components/editor.css'), 'app.css phải @import editor.css');
    assert(app.includes('components/runs.css'), 'app.css phải @import runs.css');
  });
  it('không có mã màu hex/rgb thô trong CSS của S3+S4 (đọc file thật)', () => {
    const hex = SCREEN_CSS.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    eq(hex, [], `CSS phải dùng var(--…), tìm thấy màu thô: ${hex.join(',')}`);
    const rgb = SCREEN_CSS.match(/\brgba?\(/g) ?? [];
    eq(rgb, [], 'không được dùng rgb() thô');
  });
  it('không có px thô cho MÀU/KHOẢNG CÁCH (chỉ còn hairline + hình học đã ghi chú)', () => {
    // tokens.css cho phép: hairline 1px/2px + "giá trị hình học nội bộ đã ghi chú".
    // Danh sách dưới đây là toàn bộ ngoại lệ, mỗi số có lý do — nếu ai thêm số mới
    // vào CSS mà không khai ở đây thì ca này FAIL (đúng mục đích của luật).
    const ALLOWED = new Map([
      [7, 'bước hoạ tiết gạch chéo của ô trống (repeating-linear-gradient)'],
      [120, 'minmax track lưới ảnh ref'],
      [140, 'minmax track lưới ảnh ref'],
      [280, 'minmax track cột danh sách lượt của S4'],
      [1099, 'mốc responsive §2.2 — media query không nhận var()'],
      [767, 'mốc responsive §2.2 — media query không nhận var()'],
    ]);
    const px = [...new Set([...SCREEN_CSS.matchAll(/(\d+)px/g)].map((m) => Number(m[1])))];
    const bad = px.filter((n) => n > 2 && !ALLOWED.has(n));
    eq(bad, [], `px thô không khai báo lý do: ${bad.join(',')}`);
    // và tuyệt đối không có px nào trùng thang spacing (dấu hiệu hard-code khoảng cách)
    const spacing = [4, 8, 12, 16, 24, 32, 48, 64];
    eq(px.filter((n) => spacing.includes(n)), [], 'khoảng cách phải dùng var(--s-*)');
  });
  it('mọi var() dùng đều là token có thật trong tokens.css', async () => {
    const { readFileSync } = await import('node:fs');
    const REPO = new URL('../../../../', import.meta.url).pathname;
    let declared = '';
    for (const f of ['web/css/tokens.css', 'web/css/base.css', 'web/css/layout.css']) {
      declared += readFileSync(REPO + f, 'utf8');
    }
    const have = new Set([...declared.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));
    const used = [...new Set([...SCREEN_CSS.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1]))];
    const missing = used.filter((t) => !have.has(t));
    eq(missing, [], `token không tồn tại: ${missing.join(', ')}`);
    assert(used.length > 30, `phải dùng nhiều token, nhận ${used.length}`);
  });
});
