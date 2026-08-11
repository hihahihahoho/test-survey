/* Lọc/sắp xếp/trạng thái/slug/cache của S1 — logic thuần, kiểm được chính xác. */
import { assert, describe, eq, it } from '../../core/__tests__/harness.mjs';
import { applyView, chipCounts, foldCase, fuzzyScore, projectState, readCache, writeCache } from '../projects/data.js';
import { copyName, duplicateNameWarning, slugify, validateName, validateSlug, variantId } from '../projects/crud/slug.js';
import { rankProjects } from '../projects/jump.js';
import { _columns } from '../projects/grid-keys.js';
import { _consequences, _hasRunning } from '../projects/crud/remove.js';

const P = (o) => ({ id: o.id, name: o.name ?? o.id, tags: o.tags ?? [], updatedAt: o.updatedAt ?? '2026-08-05T10:00:00.000Z', createdAt: o.createdAt ?? '2026-08-01T10:00:00.000Z', stats: o.stats ?? {}, state: o.state, broken: o.broken === true, error: o.error });

describe('S1 · trạng thái tổng hợp project (§5.7 ưu tiên failed > running > … > ok)', () => {
  it('lấy trạng thái XẤU NHẤT trong state.jobs', () => {
    eq(projectState(P({ id: 'a', state: { jobs: { x: 'ok', y: 'stale', z: 'failed' } } })), 'failed');
    eq(projectState(P({ id: 'a', state: { jobs: { x: 'ok', y: 'uncut' } } })), 'uncut');
    eq(projectState(P({ id: 'a', state: { jobs: { x: 'ok', y: 'running' } } })), 'running');
    eq(projectState(P({ id: 'a', state: { jobs: { x: 'ok' } } })), 'ok');
  });
  it('project hỏng manifest → "broken", KHÔNG lẫn với trạng thái job', () => {
    eq(projectState(P({ id: 'a', broken: true })), 'broken');
  });
  it('project mới (0 job) → "empty", không giả vờ là ok', () => {
    eq(projectState(P({ id: 'a', state: { jobs: {} } })), 'empty');
    eq(projectState(P({ id: 'a' })), 'empty');
  });
});

describe('S1 · chip filter có SỐ ĐẾM đúng (§3-S1-1)', () => {
  const items = [
    P({ id: 'a', state: { jobs: { j: 'ok' } } }),
    P({ id: 'b', state: { jobs: { j: 'stale' } } }),
    P({ id: 'c', state: { jobs: { j: 'failed' } } }),
    P({ id: 'd', broken: true }),
    P({ id: 'e', state: { jobs: { j: 'uncut' } } }),
    P({ id: 'f', state: { jobs: { j: 'running' } } }),
  ];
  it('đếm đúng từng nhóm (project hỏng thuộc "Lỗi", không tính vào "Chưa xong")', () => {
    const c = chipCounts(items);
    eq([c.all, c['need-gen'], c.running, c.error, c.unfinished], [6, 1, 1, 2, 4]);
  });
  it('số đếm chip KHỚP số dòng khi bấm chip đó (không nói một đằng hiện một nẻo)', () => {
    const c = chipCounts(items);
    for (const chip of ['all', 'need-gen', 'running', 'error', 'unfinished']) {
      eq(applyView(items, { chip }).length, c[chip], `chip ${chip}`);
    }
  });
  it('filter "error" gom cả project hỏng và job lỗi', () => {
    eq(applyView(items, { chip: 'error' }).map((p) => p.id).sort(), ['c', 'd']);
  });
  it('filter "unfinished" loại đúng cái đã xong', () => {
    assert(!applyView(items, { chip: 'unfinished' }).some((p) => p.id === 'a'));
  });
});

describe('S1 · tìm mờ bỏ dấu tiếng Việt', () => {
  it('gõ "xuan" ra "Xuân 26"', () => { assert(fuzzyScore('Xuân 26', 'xuan') > 0); });
  it('gõ "tet" ra "Tết 2026 — VietinBank"', () => { assert(fuzzyScore('Tết 2026 — VietinBank', 'tet') > 0); });
  it('foldCase xử lý cả chữ đ', () => { eq(foldCase('Đường Đỏ'), 'duong do'); });
  it('không khớp thì trả 0 (không bịa kết quả)', () => { eq(fuzzyScore('Candy Lite', 'zzzz'), 0); });
  it('tìm theo tag và theo id thư mục', () => {
    const items = [P({ id: 'tet26-a7f3', name: 'Tết 2026', tags: ['banking'] }), P({ id: 'candy-1', name: 'Candy' })];
    eq(applyView(items, { query: 'banking' }).map((p) => p.id), ['tet26-a7f3']);
    eq(applyView(items, { query: 'a7f3' }).map((p) => p.id), ['tet26-a7f3']);
  });
});

describe('S1 · sắp xếp', () => {
  const items = [
    P({ id: 'a', name: 'B', updatedAt: '2026-08-01T00:00:00.000Z', stats: { diskBytes: 10 } }),
    P({ id: 'b', name: 'A', updatedAt: '2026-08-05T00:00:00.000Z', stats: { diskBytes: 99 } }),
  ];
  it('mặc định: sửa gần nhất trước', () => { eq(applyView(items, {}).map((p) => p.id), ['b', 'a']); });
  it('tên A→Z', () => { eq(applyView(items, { sortBy: 'name' }).map((p) => p.name), ['A', 'B']); });
  it('dung lượng giảm dần', () => { eq(applyView(items, { sortBy: 'diskBytes' }).map((p) => p.id), ['b', 'a']); });
});

describe('§4.1 · slug tự sinh từ tên có dấu (đóng audit E2)', () => {
  it('"Xuân 26" → "xuan-26"', () => { eq(slugify('Xuân 26'), 'xuan-26'); });
  it('"Tết 2026 — VietinBank iPay" → slug sạch', () => { eq(slugify('Tết 2026 — VietinBank iPay'), 'tet-2026-vietinbank-ipay'); });
  it('cắt 40 ký tự, không để lại gạch cuối', () => {
    const s = slugify('a'.repeat(60));
    assert(s.length <= 40 && !s.endsWith('-'), s);
  });
  it('tên toàn ký tự lạ → slug rỗng và validate BÁO LỖI, không im lặng', () => {
    eq(slugify('!!!'), '');
    assert(validateSlug('') !== null);
  });
  it('validateSlug bắt đúng luật ^[a-z0-9-]{3,48}$', () => {
    eq(validateSlug('abc'), null);
    assert(validateSlug('ab') !== null);
    assert(validateSlug('Có Dấu') !== null);
    assert(validateSlug('-abc') !== null);
    assert(validateSlug('a'.repeat(49)) !== null);
  });
  it('validateName chặn rỗng và quá 120 ký tự', () => {
    assert(validateName('   ') !== null);
    assert(validateName('x'.repeat(121)) !== null);
    eq(validateName('Tết 2026'), null);
  });
  it('variantId hợp lệ 2..24 ký tự', () => {
    eq(variantId('Tết đỏ'), 'tet-do');
    eq(variantId('!'), 'v1');
    assert(variantId('x'.repeat(40)).length <= 24);
  });
});

describe('§4.1-2 · trùng TÊN thì cho phép, chỉ cảnh báo + gợi ý', () => {
  const existing = [P({ id: 'a', name: 'Tết 2026' })];
  it('trùng → có warn + gợi ý "(2)"', () => {
    const w = duplicateNameWarning('Tết 2026', existing);
    assert(w !== null);
    eq(w.suggestion, 'Tết 2026 (2)');
    assert(w.warn.includes('Vẫn tạo được'));
  });
  it('không trùng → null', () => { eq(duplicateNameWarning('Khác', existing), null); });
  it('§4.3 tên bản sao tăng dần', () => {
    eq(copyName('Tết 2026', existing), 'Tết 2026 (bản sao)');
    eq(copyName('Tết 2026', [...existing, P({ id: 'b', name: 'Tết 2026 (bản sao)' })]), 'Tết 2026 (bản sao 2)');
  });
});

describe('§4.4 · modal xoá phải xem trước hậu quả THẬT', () => {
  const p = P({ id: 'a', name: 'X', stats: { sheets: 5, components: 42, rawPresent: 8, kitsCut: 96, diskBytes: 184320133 } });
  it('liệt kê đủ: thiết kế · ảnh AI (tốn quota) · kit · tổng dung lượng', () => {
    const c = _consequences(p);
    assert(c.some((x) => x.includes('5 sheet') && x.includes('42 element')), c.join(' | '));
    assert(c.some((x) => x.includes('tốn quota')), c.join(' | '));
    assert(c.some((x) => x.includes('cắt lại được')), c.join(' | '));
    assert(c.some((x) => x.includes('176 MB')), c.join(' | '));
  });
  it('phát hiện project đang chạy để cảnh báo "sẽ bị dừng"', () => {
    assert(_hasRunning(P({ id: 'a', state: { jobs: { j: 'running' } } })) === true);
    assert(_hasRunning(P({ id: 'a', state: { jobs: { j: 'ok' } } })) === false);
  });
});

describe('⌘P · xếp hạng nhảy nhanh', () => {
  const items = [P({ id: 'a', name: 'Candy Lite' }), P({ id: 'b', name: 'Tết 2026', tags: ['tet'] })];
  it('khớp tên đứng trước', () => { eq(rankProjects(items, 'tet').map((p) => p.id), ['b']); });
  it('query rỗng → ưu tiên project mở gần đây', () => {
    eq(rankProjects(items, '', ['a']).map((p) => p.id)[0], 'a');
  });
});

describe('§2.5-4 · cache danh sách project đi qua store (allowlist + dò secret)', () => {
  it('ghi rồi đọc lại được, và KHÔNG lưu path tuyệt đối', () => {
    const ok = writeCache([P({ id: 'a', name: 'Tết 2026', stats: { diskBytes: 10 }, tags: ['tet'] })], { etag: '"x"', fingerprint: 'sha256:abc' });
    assert(ok === true, 'writeCache phải thành công');
    const c = readCache('sha256:abc');
    assert(c !== null);
    eq(c.items.map((i) => i.id), ['a']);
  });
  it('fingerprint khác ⇒ KHÔNG dùng cache của workspace khác', () => {
    eq(readCache('sha256:khac'), null);
  });
  it('không ghi được cover là đường dẫn tuyệt đối (store chặn secret/PII)', () => {
    const ok = writeCache([{ id: 'b', name: 'x', updatedAt: '2026-08-05T00:00:00.000Z', tags: [], stats: {}, cover: '/Users/tung/secret/a.png' }], {});
    assert(ok === false, 'store PHẢI chặn đường dẫn tuyệt đối (arch §4.3-5)');
  });
});

describe('lưới thẻ · đo số cột thật để ←→↑↓ đi đúng', () => {
  it('3 thẻ cùng hàng → 3 cột', () => {
    const cards = [{ offsetTop: 0 }, { offsetTop: 0 }, { offsetTop: 0 }, { offsetTop: 200 }];
    eq(_columns(cards), 3);
  });
  it('danh sách rỗng → 1 cột (không chia cho 0)', () => { eq(_columns([]), 1); });
});
