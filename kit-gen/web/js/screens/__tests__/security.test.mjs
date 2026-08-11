/**
 * Test A12 (đóng audit I6) + §8.2: tên do user nhập KHÔNG BAO GIỜ được thoát ra HTML,
 * và chuỗi SVG duy nhất đi qua innerHTML (silhouetteMarkup) không thể chứa dữ liệu user.
 */
import { describe, it, assert, eq } from '../../core/__tests__/harness.mjs';
import { document } from './dom-extra.mjs';
import { silhouetteMarkup, silhouetteSvg } from '../design/shapes.js';
import { createCellGrid } from '../design/cell-grid.js';
import { createPropsPanel } from '../design/props.js';
import { createDesignTree } from '../design/tree.js';
import { validateContract } from '../design/validate.js';

const EVIL = '<img src=x onerror=alert(1)>';
const EVIL2 = 'Tết "26" <b>&amp;';

describe('A12 · chuỗi user render qua textContent, không qua HTML', () => {
  it('tên file/nhãn độc hại vào ô lưới vẫn là TEXT thuần', () => {
    const sheet = {
      id: 'main', grid: { cols: 1, rows: 1 }, orient: 'landscape',
      components: [{ file: EVIL, vi: EVIL2, spec: EVIL, skel: { shape: 'pill', w: 0.8, h: 0.4 } }],
    };
    const g = createCellGrid({});
    const node = g.render(sheet);
    const cell = node.querySelectorAll('.d-cell')[0];
    // nội dung phải nằm ở textContent (DOM giả lưu text node), KHÔNG có node <img> nào
    assert(cell.textContent.includes(EVIL), 'tên phải hiện đúng nguyên văn');
    eq(cell.querySelectorAll('img').length, 0, 'không được sinh thẻ img từ chuỗi user');
    const aria = cell.getAttribute('aria-label');
    assert(aria.includes(EVIL2), 'aria-label cũng là text thuần');
  });

  it('panel thuộc tính đặt giá trị user vào .value chứ không vào markup', () => {
    const sheet = {
      id: 'main', grid: { cols: 1, rows: 1 }, orient: 'landscape',
      components: [{ file: EVIL, vi: EVIL2, spec: EVIL, skel: { shape: 'pill', w: 0.8, h: 0.4 } }],
    };
    const p = createPropsPanel({ libEntryFor: () => null });
    p.render({ kind: 'element', sheetId: 'main', index: 0 }, {
      sheet, contract: { variants: [] }, validation: validateContract({ sheets: [sheet], variants: [] }), readOnly: false,
    });
    const values = p.el.querySelectorAll('input').map((i) => i.value);
    assert(values.includes(EVIL), 'giá trị user nằm ở property .value');
    eq(p.el.querySelectorAll('img').length, 0);
    eq(p.el.querySelectorAll('script').length, 0);
  });

  it('cây thiết kế: id sheet / tên phong cách độc hại không sinh node lạ', () => {
    const t = createDesignTree({});
    t.update({
      sheets: [{ id: EVIL, grid: { cols: 1, rows: 1 }, components: [] }],
      characters: [{ id: 'x', vi: EVIL2, poses: [] }],
      variants: [{ id: 'v', vi: EVIL, brand: { primary: 'javascript:alert(1)' } }],
      jobStates: {},
    });
    eq(t.el.querySelectorAll('img').length, 0);
    eq(t.el.querySelectorAll('script').length, 0);
    assert(t.el.textContent.includes(EVIL));
  });

  it('màu brand không hợp lệ KHÔNG được đổ vào style (chặn javascript:/url())', () => {
    const t = createDesignTree({});
    t.update({
      sheets: [], characters: [], variants: [{ id: 'v', vi: 'x', brand: { primary: 'url(javascript:alert(1))' } }], jobStates: {},
    });
    const sw = t.el.querySelectorAll('.d-tree__swatch')[0];
    const bg = String(sw?.style?.background ?? '');
    assert(!bg.includes('javascript'), `màu lạ phải bị bỏ, nhận: ${bg}`);
  });
});

describe('chuỗi SVG qua innerHTML chỉ chứa SỐ + màu hằng (không có dữ liệu user)', () => {
  it('skel độc hại không lọt vào markup', () => {
    const evilSkel = {
      shape: '"><script>alert(1)</script>', w: '0.5"><img>', h: 0.4,
      pose: '"><script>x</script>', anchor: 'bottom',
    };
    const markup = silhouetteMarkup(evilSkel.shape, 100, 100, 'u1', evilSkel);
    eq(markup, '', 'shape lạ → không vẽ gì, không echo chuỗi user');
    const svg = silhouetteSvg(evilSkel, 100, 100);
    const html = String(svg.childNodes[0]?.innerHTML ?? '');
    assert(!html.includes('<script'), `markup không được chứa script: ${html}`);
    assert(!html.includes('alert'), 'không được chứa payload');
  });

  it('pose lạ rơi về "idle", không echo chuỗi', () => {
    const markup = silhouetteMarkup('pose', 100, 100, 'u2', { pose: '"><script>alert(1)</script>' });
    assert(markup.includes('<line'), 'phải vẽ được bộ xương mặc định');
    assert(!markup.includes('script'), 'không echo chuỗi user');
  });

  it('w/h dạng chuỗi lạ được đưa về số an toàn', () => {
    const svg = silhouetteSvg({ shape: 'pill', w: 'abc', h: null }, 120, 80);
    const html = String(svg.childNodes[0].innerHTML);
    assert(/width="[\d.]+"/.test(html), `width phải là số: ${html}`);
    assert(!html.includes('abc'));
  });

  it('mọi markup sinh ra chỉ gồm ký tự an toàn của SVG', () => {
    for (const shape of ['pill', 'bar', 'rrect', 'rect', 'circle', 'burst', 'puzzle', 'figure', 'full', 'pose']) {
      const m = silhouetteMarkup(shape, 100, 60, 'uid', { w: 0.8, h: 0.5, pose: 'idle' });
      assert(!/on[a-z]+=/i.test(m), `${shape}: không được có thuộc tính on*`);
      assert(!/javascript:/i.test(m), `${shape}: không được có javascript:`);
    }
  });
});
