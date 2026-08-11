/**
 * Test lớp mutation: CRUD sheet/element/phong cách/nhân vật + đổi lưới và HỆ QUẢ
 * (thừa/thiếu ô), giữ bất biến V-04 sau MỌI thao tác.
 */
import { describe, it, assert, eq } from '../../core/__tests__/harness.mjs';
import * as ops from '../design/ops.js';
import * as st from '../design/ops-style.js';
import { validateContract } from '../design/validate.js';

const comp = (f) => ({ file: f, vi: f, spec: 's', skel: { shape: 'pill', w: 0.8, h: 0.4 } });
function contract4x4() {
  return {
    schemaVersion: 4,
    sheets: [{
      id: 'main', grid: { cols: 2, rows: 2 }, orient: 'landscape',
      components: [comp('01-a'), comp('02-b'), comp('03-c'), comp('04-d')],
    }],
    variants: [{ id: 'tet', vi: 'Tết đỏ' }],
    characterPoses: [],
  };
}
const cellsOk = (c) => (c.sheets ?? []).every((s) => (s.components ?? []).length === s.grid.cols * s.grid.rows);
const files = (c, id = 'main') => ops.findSheet(c, id).components.map((x) => x.file);

describe('bất biến: mọi thao tác giữ len(components) == cols×rows', () => {
  it('addSheet điền đủ ô trống', () => {
    const r = ops.addSheet(contract4x4(), { id: 'tall', cols: 4, rows: 2 });
    assert(cellsOk(r.contract));
    eq(ops.findSheet(r.contract, 'tall').components.length, 8);
    assert(ops.findSheet(r.contract, 'tall').components.every((c) => c.skel.shape === 'empty'));
  });
  it('nới lưới thêm ô TRỐNG, không mất element', () => {
    const r = ops.resizeGrid(contract4x4(), 'main', 3, 2);
    assert(cellsOk(r.contract));
    eq(files(r.contract), ['01-a', '02-b', '03-c', '04-d', '', '']);
  });
  it('thu lưới: element thừa CHUYỂN sang sheet mới (không mất im lặng)', () => {
    const r = ops.resizeGrid(contract4x4(), 'main', 1, 2, { overflow: 'move' });
    assert(cellsOk(r.contract));
    eq(files(r.contract), ['01-a', '02-b']);
    const spill = r.contract.sheets.find((s) => s.id === 'main-2');
    assert(spill, 'phải tạo sheet main-2');
    eq(spill.components.filter((c) => c.file).map((c) => c.file), ['03-c', '04-d']);
    assert(r.label.includes('chuyển 2 element'), r.label);
  });
  it('thu lưới overflow=drop thì nhãn undo NÓI RÕ bỏ mấy element', () => {
    const r = ops.resizeGrid(contract4x4(), 'main', 1, 2, { overflow: 'drop' });
    assert(cellsOk(r.contract));
    eq(r.contract.sheets.length, 1);
    assert(r.label.includes('bỏ 2 element'), r.label);
  });
  it('overflowOf chỉ đếm element THẬT, ô trống không tính là mất', () => {
    let c = contract4x4();
    c = ops.clearCell(c, 'main', 3).contract;
    eq(ops.overflowOf(ops.findSheet(c, 'main'), 1, 2).map((x) => x.file), ['03-c']);
  });
  it('validate sạch sau mỗi thao tác lưới', () => {
    let c = contract4x4();
    for (const [cols, rows] of [[4, 4], [1, 1], [2, 3], [8, 1]]) {
      c = ops.resizeGrid(c, 'main', cols, rows, { overflow: 'drop' }).contract;
      eq(validateContract(c).errors.filter((e) => e.code === 'V-04'), [], `lưới ${cols}×${rows}`);
    }
  });
});

describe('CRUD sheet', () => {
  it('id trùng được tự đổi thành -2 (không bao giờ tạo id trùng)', () => {
    const r = ops.addSheet(contract4x4(), { id: 'main' });
    eq(r.contract.sheets.map((s) => s.id), ['main', 'main-2']);
  });
  it('slug hoá tên có dấu (đóng E2)', () => {
    eq(ops.slugify('Sheet Nền Trang Chủ'), 'sheet-nen-trang-chu');
    eq(ops.slugify('Xuân 26'), 'xuan-26');
    eq(ops.slugify('Tết "26" <b>'), 'tet-26-b');
  });
  it('nhân bản sheet copy sâu, không dùng chung mảng', () => {
    const r = ops.duplicateSheet(contract4x4(), 'main');
    const dup = ops.findSheet(r.contract, 'main-2');
    dup.components[0].file = 'đổi';
    eq(ops.findSheet(r.contract, 'main').components[0].file, '01-a', 'bản gốc không được bị ảnh hưởng');
  });
  it('đổi thứ tự sheet, chặn ở biên', () => {
    let c = ops.addSheet(contract4x4(), { id: 'tall' }).contract;
    eq(ops.moveSheet(c, 'tall', -1).contract.sheets.map((s) => s.id), ['tall', 'main']);
    eq(ops.moveSheet(c, 'main', -1).label, '', 'ở đầu thì không làm gì');
    eq(ops.moveSheet(c, 'tall', 1).label, '', 'ở cuối thì không làm gì');
  });
  it('xoá sheet', () => {
    const r = ops.removeSheet(contract4x4(), 'main');
    eq(r.contract.sheets.length, 0);
    assert(r.label.includes('main'));
  });
  it('thao tác trên sheet không tồn tại → không đổi gì, nhãn rỗng', () => {
    const c = contract4x4();
    for (const r of [ops.removeSheet(c, 'zzz'), ops.renameSheet(c, 'zzz', 'x'), ops.resizeGrid(c, 'zzz', 2, 2), ops.duplicateSheet(c, 'zzz')]) {
      eq(r.label, '');
      eq(r.contract, c);
    }
  });
});

describe('CRUD element', () => {
  it('xoá element → ô TRỐNG (giữ V-04), nhãn undo đọc được', () => {
    const r = ops.clearCell(contract4x4(), 'main', 1);
    assert(cellsOk(r.contract));
    eq(files(r.contract), ['01-a', '', '03-c', '04-d']);
    eq(r.label, 'Bỏ «02-b» khỏi sheet «main»');
  });
  it('đổi vị trí = swap, thứ tự row-major giữ nguyên độ dài', () => {
    const r = ops.swapCells(contract4x4(), 'main', 0, 3);
    eq(files(r.contract), ['04-d', '02-b', '03-c', '01-a']);
    assert(cellsOk(r.contract));
  });
  it('swap ngoài biên / cùng ô → không đổi', () => {
    const c = contract4x4();
    for (const [a, b] of [[0, 0], [-1, 2], [0, 99]]) eq(ops.swapCells(c, 'main', a, b).label, '');
  });
  it('patchCell merge skel chứ không thay cả cục', () => {
    const r = ops.patchCell(contract4x4(), 'main', 0, { skel: { w: 0.5 } });
    eq(ops.findSheet(r.contract, 'main').components[0].skel, { shape: 'pill', w: 0.5, h: 0.4 });
  });
  it('thêm từ thư viện: điền ô trống TRƯỚC, không ghi đè element có sẵn', () => {
    let c = ops.clearCell(contract4x4(), 'main', 2).contract;
    const r = ops.addElementsToSheet(c, 'main', [{ file: '09-new', vi: 'Mới', spec: 'x', skel: { shape: 'rrect', w: 0.7, h: 0.7 } }]);
    eq(files(r.contract), ['01-a', '02-b', '09-new', '04-d']);
    assert(cellsOk(r.contract));
  });
  it('hết ô trống thì NỚI LƯỚI thêm hàng (không ghi đè, vẫn đúng V-04)', () => {
    const r = ops.addElementsToSheet(contract4x4(), 'main', [
      { file: '09-x', skel: { shape: 'rrect' } }, { file: '10-y', skel: { shape: 'rrect' } },
    ]);
    const sh = ops.findSheet(r.contract, 'main');
    eq(sh.grid, { cols: 2, rows: 3 });
    eq(sh.components.length, 6);
    eq(files(r.contract), ['01-a', '02-b', '03-c', '04-d', '09-x', '10-y']);
    eq(validateContract(r.contract).errors.filter((e) => e.code === 'V-04'), []);
  });
  it('differsFromLib phát hiện đã sửa spec/skel (badge ✎)', () => {
    const lib = { file: '01-a', spec: 'goc', skel: { shape: 'pill', w: 0.8, h: 0.4 } };
    assert(!ops.differsFromLib({ spec: 'goc', skel: { shape: 'pill', w: 0.8, h: 0.4 } }, lib));
    assert(ops.differsFromLib({ spec: 'đã sửa', skel: { shape: 'pill', w: 0.8, h: 0.4 } }, lib));
    assert(ops.differsFromLib({ spec: 'goc', skel: { shape: 'pill', w: 0.5, h: 0.4 } }, lib));
    assert(!ops.differsFromLib({ spec: 'x' }, null), 'không có bản gốc thì không nói "đã sửa"');
  });
});

describe('phong cách + nhân vật', () => {
  it('thêm phong cách sinh id từ tên có dấu', () => {
    const r = st.addVariant(contract4x4(), { vi: 'Vàng Kim' });
    eq(r.contract.variants.map((v) => v.id), ['tet', 'vang-kim']);
  });
  it('xoá phong cách cũng dọn ràng buộc sheet.variants (không để sheet mồ côi)', () => {
    let c = st.addVariant(contract4x4(), { vi: 'Vàng' }).contract;
    c = ops.patchSheet(c, 'main', { variants: ['tet', 'vang'] }).contract;
    const r = st.removeVariant(c, 'tet');
    eq(ops.findSheet(r.contract, 'main').variants, ['vang']);
  });
  it('nhân bản phong cách copy toàn bộ style/brand/nhân vật, id mới', () => {
    let c = contract4x4();
    c.variants[0].brand = { mode: 'colors', primary: '#d42a1e' };
    c.variants[0].characters = [{ id: 'lan', vi: 'Lan', poses: ['idle'] }];
    const r = st.duplicateVariant(c, 'tet');
    const dup = r.contract.variants[1];
    eq(dup.id, 'tet-2');
    eq(dup.brand.primary, '#d42a1e');
    eq(dup.characters[0].id, 'lan');
    dup.characters[0].poses.push('wave');
    eq(c.variants[0].characters[0].poses, ['idle'], 'không dùng chung mảng với bản gốc');
  });
  it('nhân vật thuộc PROJECT: thêm là gắn vào mọi phong cách (đóng A3)', () => {
    let c = st.addVariant(contract4x4(), { vi: 'Vàng' }).contract;
    const r = st.addCharacter(c, { vi: 'Lan' });
    for (const v of r.contract.variants) eq(v.characters.map((x) => x.id), ['lan'], `phong cách ${v.id}`);
    eq(st.allCharacters(r.contract).length, 1, 'gộp lại vẫn là 1 nhân vật');
  });
  it('bật/tắt nhân vật theo từng phong cách', () => {
    let c = st.addVariant(contract4x4(), { vi: 'Vàng' }).contract;
    c = st.addCharacter(c, { vi: 'Lan' }).contract;
    c = st.toggleCharacterInVariant(c, 'tet', 'lan', false).contract;
    eq(c.variants.find((v) => v.id === 'tet').characters, []);
    c = st.toggleCharacterInVariant(c, 'tet', 'lan', true).contract;
    eq(c.variants.find((v) => v.id === 'tet').characters.map((x) => x.id), ['lan']);
  });
  it('tham số cắt: scope project ghi cho MỌI variant (đúng cách slice.py đọc)', () => {
    let c = st.addVariant(contract4x4(), { vi: 'Vàng' }).contract;
    const r = st.patchSliceParams(c, { threshold: 150, grow_threshold: 210 }, { scope: 'project' });
    eq(r.contract.slice.threshold, 150);
    for (const v of r.contract.variants) eq([v.threshold, v.grow_threshold], [150, 210], v.id);
  });
  it('tham số cắt: scope variant chỉ ghi cho 1 phong cách', () => {
    let c = st.addVariant(contract4x4(), { vi: 'Vàng' }).contract;
    const r = st.patchSliceParams(c, { threshold: 99 }, { scope: 'variant', variantId: 'vang' });
    eq(r.contract.variants.find((v) => v.id === 'vang').threshold, 99);
    eq(r.contract.variants.find((v) => v.id === 'tet').threshold, undefined);
  });
});

describe('contractJobs khớp cách agent/gen.sh ghép job', () => {
  it('variant × sheet, sheet.variants rỗng = áp mọi phong cách', () => {
    let c = st.addVariant(contract4x4(), { vi: 'Vàng' }).contract;
    c = ops.addSheet(c, { id: 'tall', cols: 1, rows: 1 }).contract;
    eq(ops.contractJobs(c).map((j) => j.job), ['tet-main', 'tet-tall', 'vang-main', 'vang-tall']);
  });
  it('sheet chỉ áp 1 phong cách thì không sinh job cho phong cách khác', () => {
    let c = st.addVariant(contract4x4(), { vi: 'Vàng' }).contract;
    c = ops.addSheet(c, { id: 'pose-lan', cols: 1, rows: 1 }).contract;
    c = ops.patchSheet(c, 'pose-lan', { variants: ['tet'] }).contract;
    eq(ops.contractJobs(c).map((j) => j.job), ['tet-main', 'tet-pose-lan', 'vang-main']);
  });
  it('countComponents không tính ô trống', () => {
    const c = ops.clearCell(contract4x4(), 'main', 0).contract;
    eq(ops.countComponents(c), 3);
  });
});

describe('uniqueId', () => {
  it('tránh trùng và có hậu tố tăng dần', () => {
    eq(ops.uniqueId('main', []), 'main');
    eq(ops.uniqueId('main', ['main']), 'main-2');
    eq(ops.uniqueId('main', ['main', 'main-2']), 'main-3');
  });
  it('id quá ngắn được nới cho đủ luật ^[a-z0-9-]{2,32}$', () => {
    assert(ops.uniqueId('a', []).length >= 2);
  });
});
