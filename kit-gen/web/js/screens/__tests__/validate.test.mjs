/**
 * Test 8 LUẬT VALIDATE của §3-S3.4 + đối chiếu whitelist shape với NGUỒN THẬT
 * (silhouettes.js ở gốc repo, SHAPES của agent/lib/validate.mjs, skeleton.py).
 */
import { readFileSync } from 'node:fs';
import { describe, it, assert, eq } from '../../core/__tests__/harness.mjs';
import { validateContract, refUsage, issuesFor, blockingSummary } from '../design/validate.js';
import { isKnownShape, shapeWhitelist, poseList, learnShapesFrom } from '../design/shapes.js';

const REPO = new URL('../../../../', import.meta.url).pathname;

const sheet = (over = {}) => ({
  id: 'main', grid: { cols: 2, rows: 1 }, orient: 'landscape',
  components: [comp(), comp({ file: '02-btn-blue' })],
  ...over,
});
const comp = (over = {}) => ({
  file: '01-btn-red', vi: 'Nút', spec: 'red button',
  skel: { shape: 'pill', w: 0.8, h: 0.4 }, ...over,
});
const base = (over = {}) => ({
  schemaVersion: 4, sheets: [sheet()], variants: [{ id: 'tet', vi: 'Tết' }], ...over,
});

const codes = (r) => r.errors.map((e) => e.code);
const wcodes = (r) => r.warnings.map((e) => e.code);

describe('V-04 · số component == cols×rows (assert của gen.sh)', () => {
  it('đúng số ô → không lỗi', () => {
    eq(codes(validateContract(base())), []);
  });
  it('thiếu 1 ô → V-04 kèm expected/actual để UI gợi ý sửa', () => {
    const c = base({ sheets: [sheet({ components: [comp()] })] });
    const r = validateContract(c);
    assert(codes(r).includes('V-04'), 'phải có V-04');
    const e = r.errors.find((x) => x.code === 'V-04');
    eq([e.expected, e.actual], [2, 1]);
    assert(e.message.includes('cần 2 ô'), `thông điệp phải nêu số ô: ${e.message}`);
  });
  it('thừa ô → V-04', () => {
    const c = base({ sheets: [sheet({ components: [comp(), comp({ file: '02-a' }), comp({ file: '03-b' })] })] });
    assert(codes(validateContract(c)).includes('V-04'));
  });
  it('lưới 4×4 với 16 ô → hợp lệ', () => {
    const comps = Array.from({ length: 16 }, (_, i) => comp({ file: `${String(i + 1).padStart(2, '0')}-x` }));
    const c = base({ sheets: [sheet({ grid: { cols: 4, rows: 4 }, components: comps })] });
    eq(codes(validateContract(c)), []);
  });
});

describe('shape whitelist ĐỌC TỪ NGUỒN THẬT (silhouettes.js + skeleton.py + agent)', () => {
  it('mọi shape silhouettes.js vẽ được đều nằm trong whitelist client', () => {
    const src = readFileSync(`${REPO}silhouettes.js`, 'utf8');
    const found = [...src.matchAll(/shape === "([a-z0-9]+)"/g)].map((m) => m[1]);
    assert(found.length >= 7, `phải rút được shape từ silhouettes.js, nhận ${found.length}`);
    const missing = found.filter((s) => !isKnownShape(s));
    eq(missing, [], `shape của silhouettes.js bị client từ chối: ${missing.join(',')}`);
  });
  it('mọi shape SHAPES của skeleton.py đều nằm trong whitelist', () => {
    const py = readFileSync(`${REPO}skeleton.py`, 'utf8');
    const block = py.slice(py.indexOf('SHAPES = {'), py.indexOf('def main()'));
    const found = [...block.matchAll(/"([a-z0-9]+)":/g)].map((m) => m[1]);
    assert(found.length >= 6, `phải rút được shape từ skeleton.py, nhận ${found.length}`);
    eq(found.filter((s) => !isKnownShape(s)), []);
  });
  it('trùng khớp tập SHAPES của agent/lib/validate.mjs (client không được hẹp hơn)', () => {
    const src = readFileSync(`${REPO}agent/lib/validate.mjs`, 'utf8');
    const line = src.match(/const SHAPES = new Set\(\[([^\]]*)\]\)/)[1];
    const agentShapes = [...line.matchAll(/"([a-z0-9]+)"/g)].map((m) => m[1]);
    eq(agentShapes.filter((s) => !isKnownShape(s)), [], 'client từ chối shape mà agent cho qua');
  });
  it('mọi shape trong element-lib.json (42 element) đều hợp lệ', () => {
    const lib = JSON.parse(readFileSync(`${REPO}element-lib.json`, 'utf8'));
    eq(lib.elements.length, 42, 'element-lib phải có 42 element');
    const shapes = [...new Set(lib.elements.map((e) => e.skel.shape))];
    eq(shapes.filter((s) => !isKnownShape(s)), []);
  });
  it('shape lạ chỉ CẢNH BÁO, không chặn lưu (đúng hành vi agent)', () => {
    const c = base({ sheets: [sheet({ components: [comp({ skel: { shape: 'hexagon', w: 0.5, h: 0.5 } }), comp({ file: '02-b' })] })] });
    const r = validateContract(c);
    assert(!codes(r).includes('SKEL_SHAPE'), 'không được là lỗi chặn');
    assert(wcodes(r).includes('SKEL_SHAPE'), 'phải là cảnh báo');
  });
  it('learnShapesFrom nạp thêm shape của thư viện', () => {
    assert(!isKnownShape('zzz-new'), 'chưa học thì không biết');
    learnShapesFrom([{ skel: { shape: 'zzz-new' } }]);
    assert(isKnownShape('zzz-new'), 'sau khi học phải biết');
    assert(shapeWhitelist().includes('zzz-new'));
  });
});

describe('V-06 · 0 < w,h <= 1', () => {
  for (const [w, ok] of [[0.5, true], [1, true], [0.0001, true], [0, false], [-1, false], [1.5, false]]) {
    it(`w=${w} → ${ok ? 'hợp lệ' : 'lỗi V-06'}`, () => {
      const c = base({ sheets: [sheet({ components: [comp({ skel: { shape: 'pill', w, h: 0.4 } }), comp({ file: '02-b' })] })] });
      eq(codes(validateContract(c)).includes('V-06'), !ok);
    });
  }
  it('h ngoài khoảng cũng bị chặn', () => {
    const c = base({ sheets: [sheet({ components: [comp({ skel: { shape: 'pill', w: 0.5, h: 2 } }), comp({ file: '02-b' })] })] });
    assert(codes(validateContract(c)).includes('V-06'));
  });
});

describe('matte chỉ glow|glass', () => {
  it('glow và glass hợp lệ', () => {
    for (const m of ['glow', 'glass']) {
      const c = base({ sheets: [sheet({ components: [comp({ skel: { shape: 'burst', w: 0.6, h: 0.9, matte: m } }), comp({ file: '02-b' })] })] });
      eq(codes(validateContract(c)), [], `matte ${m} phải hợp lệ`);
    }
  });
  it('matte lạ bị CHẶN', () => {
    const c = base({ sheets: [sheet({ components: [comp({ skel: { shape: 'burst', w: 0.6, h: 0.9, matte: 'shiny' } }), comp({ file: '02-b' })] })] });
    assert(codes(validateContract(c)).includes('SKEL_MATTE'));
  });
});

describe('slice9 / free / plain là bool', () => {
  it('bool → hợp lệ', () => {
    const c = base({ sheets: [sheet({ components: [comp({ skel: { shape: 'pill', w: 0.8, h: 0.4, slice9: true, free: false, plain: true } }), comp({ file: '02-b' })] })] });
    eq(codes(validateContract(c)), []);
  });
  it('chuỗi "true" bị chặn', () => {
    const c = base({ sheets: [sheet({ components: [comp({ skel: { shape: 'pill', w: 0.8, h: 0.4, slice9: 'true' } }), comp({ file: '02-b' })] })] });
    assert(codes(validateContract(c)).includes('SKEL_FLAG'));
  });
});

describe('V-01 / V-02 · tên file', () => {
  it('đúng dạng 2 số + slug', () => eq(codes(validateContract(base())), []));
  for (const bad of ['btn-red', '1-btn', '01-BTN', '01_btn', '']) {
    it(`«${bad}» → V-01`, () => {
      const c = base({ sheets: [sheet({ components: [comp({ file: bad }), comp({ file: '02-b' })] })] });
      assert(codes(validateContract(c)).includes('V-01'));
    });
  }
  it('ô TRỐNG được miễn V-01 (đúng agent)', () => {
    const c = base({ sheets: [sheet({ components: [comp(), { file: '', skel: { shape: 'empty' } }] })] });
    eq(codes(validateContract(c)), []);
  });
  it('trùng tên trong sheet → V-02 nêu đúng số ô', () => {
    const c = base({ sheets: [sheet({ components: [comp(), comp()] })] });
    const r = validateContract(c);
    assert(codes(r).includes('V-02'));
    assert(r.errors.find((e) => e.code === 'V-02').message.includes('ô 1'));
  });
});

describe('V-03 · sheet.id đúng dạng + DUY NHẤT (đóng A6, K4)', () => {
  it('id hợp lệ', () => eq(codes(validateContract(base())), []));
  for (const bad of ['A', 'Main', 'main_2', 'x'.repeat(33)]) {
    it(`«${bad}» → V-03`, () => {
      assert(codes(validateContract(base({ sheets: [sheet({ id: bad })] }))).includes('V-03'));
    });
  }
  it('hai sheet trùng id → V-03 (bệnh pose-soc của styles.json)', () => {
    const c = base({ sheets: [sheet({ id: 'pose-soc' }), sheet({ id: 'pose-soc' })] });
    const r = validateContract(c);
    assert(codes(r).includes('V-03'));
    assert(r.errors.some((e) => e.message.includes('pose-soc')));
  });
});

describe('V-05 · variant/character id', () => {
  it('id hợp lệ', () => eq(codes(validateContract(base())), []));
  it('trùng variant id → V-05', () => {
    assert(codes(validateContract(base({ variants: [{ id: 'tet' }, { id: 'tet' }] }))).includes('V-05'));
  });
  it('character id sai dạng → V-05', () => {
    const c = base({ variants: [{ id: 'tet', characters: [{ id: 'Lan Vàng' }] }] });
    assert(codes(validateContract(c)).includes('V-05'));
  });
});

describe('V-07 · sheet 0 element = CẢNH BÁO, không chặn', () => {
  it('không chặn lưu', () => {
    const c = base({ sheets: [sheet({ id: 'tall', grid: { cols: 0, rows: 0 }, components: [] })] });
    const r = validateContract(c);
    assert(wcodes(r).includes('V-07'), 'phải cảnh báo V-07');
  });
  it('sheet rỗng có lưới hợp lệ vẫn chỉ cảnh báo về V-07 (V-04 riêng)', () => {
    const c = base({ sheets: [{ id: 'tall', grid: { cols: 1, rows: 1 }, components: [] }] });
    const r = validateContract(c);
    assert(wcodes(r).includes('V-07'));
    assert(codes(r).includes('V-04'), 'lưới 1×1 mà 0 ô thì vẫn sai V-04');
  });
});

describe('V-08 · ref bị xoá nhưng còn tham chiếu → CHẶN', () => {
  it('ref còn trên đĩa → không lỗi', () => {
    const c = base({ variants: [{ id: 'tet', characters: [{ id: 'lan', ref: 'refs/char-lan.png' }] }] });
    eq(codes(validateContract(c, { refNames: ['char-lan.png'] })), []);
  });
  it('ref mất → V-08 nêu tên file', () => {
    const c = base({ variants: [{ id: 'tet', characters: [{ id: 'lan', ref: 'refs/char-lan.png' }] }] });
    const r = validateContract(c, { refNames: [] });
    assert(codes(r).includes('V-08'));
    assert(r.errors.find((e) => e.code === 'V-08').message.includes('char-lan.png'));
  });
  it('không truyền refNames thì KHÔNG đoán bừa', () => {
    const c = base({ variants: [{ id: 'tet', characters: [{ id: 'lan', ref: 'refs/x.png' }] }] });
    eq(codes(validateContract(c)), []);
  });
  it('refUsage liệt kê mọi chỗ dùng', () => {
    const c = base({
      sheets: [sheet({ ref: 'refs/a.png' })],
      variants: [{ id: 'tet', inspo: ['refs/b.png'], brand: { refs: ['refs/c.png'] }, characters: [{ id: 'lan', ref: 'refs/d.png' }] }],
    });
    eq(refUsage(c).map((u) => u.kind), ['sheet', 'variantInspo', 'variantBrand', 'character']);
  });
});

describe('cảnh báo ô trống + tra cứu inline + chặn lưu', () => {
  it('EMPTY_CELLS tính đúng % diện tích', () => {
    const comps = [comp(), comp({ file: '02-b' }), { file: '', skel: { shape: 'empty' } }, { file: '', skel: { shape: 'empty' } }];
    const c = base({ sheets: [sheet({ grid: { cols: 2, rows: 2 }, components: comps })] });
    const w = validateContract(c).warnings.find((x) => x.code === 'EMPTY_CELLS');
    assert(w, 'phải có cảnh báo ô trống');
    eq([w.emptyCount, w.pct], [2, 50]);
  });
  it('issuesFor() trả lỗi của đúng field để hiện INLINE', () => {
    const c = base({ sheets: [sheet({ components: [comp({ file: 'sai' }), comp({ file: '02-b' })] })] });
    const r = validateContract(c);
    const hit = issuesFor(r, { kind: 'element', sheetId: 'main', index: 0, field: 'file' });
    eq(hit.map((x) => x.code), ['V-01']);
    eq(issuesFor(r, { kind: 'element', sheetId: 'main', index: 1, field: 'file' }), []);
  });
  it('blockingSummary chỉ nói khi CÓ lỗi (cảnh báo không chặn)', () => {
    eq(blockingSummary(validateContract(base())), null);
    const onlyWarn = base({ sheets: [sheet({ components: [comp({ spec: '' }), comp({ file: '02-b' })] })] });
    eq(blockingSummary(validateContract(onlyWarn)), null, 'chỉ cảnh báo thì KHÔNG chặn lưu');
    const bad = base({ sheets: [sheet({ components: [comp({ file: 'x' }), comp({ file: '02-b' })] })] });
    assert(String(blockingSummary(validateContract(bad))).includes('1 lỗi'));
  });
  it('contract rác không làm vỡ validate', () => {
    for (const junk of [null, undefined, 42, 'x', {}, { sheets: 'no' }]) {
      const r = validateContract(junk);
      assert(Array.isArray(r.errors) && Array.isArray(r.warnings), `junk ${JSON.stringify(junk)} phải trả kết quả dùng được`);
    }
  });
});

describe('19 dáng nhân vật khớp POSES của silhouettes.js', () => {
  it('đủ 19 dáng, id trùng khít', () => {
    const src = readFileSync(`${REPO}silhouettes.js`, 'utf8');
    const block = src.slice(src.indexOf('const POSES = {'), src.indexOf('/* chi + màu'));
    const ids = [...block.matchAll(/^\s{4}"?([a-z0-9-]+)"?:\s*\{\s*vi:/gm)].map((m) => m[1]);
    eq(ids.length, 19, 'silhouettes.js phải có 19 dáng');
    eq(poseList().map((p) => p.id).sort(), ids.sort());
  });
});
