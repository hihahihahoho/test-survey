/**
 * silhouette-mirror.test.mjs — KHOÁ bản mirror của `shapes.js` vào `silhouettes.js` THẬT.
 *
 * Vì sao cần: `silhouettes.js` nằm ở GỐC REPO, ngoài `web/`, nên bundle (Pages và
 * mirror /app/) không tải được nó ⇒ `design/shapes.js` giữ một bản vẽ lại (mirror).
 * Rủi ro thật là mirror ÂM THẦM LỆCH khi ai đó sửa `silhouettes.js` (file bị luật cứng
 * cấm sửa, nhưng vẫn có thể đổi trong tương lai) ⇒ ô sheet trong S3 vẽ khác ảnh
 * khung xương mà engine thật gửi cho model.
 *
 * Bộ này nạp `silhouettes.js` thật (IIFE gán `globalThis.KITSIL`) rồi đối chiếu:
 *   1. đúng tập id dáng + nhãn VI,
 *   2. TỪNG toạ độ khớp (13 khớp × 19 dáng),
 *   3. markup SVG của MỌI shape trong whitelist phải GIỐNG HỆT bản thật.
 * Lệch một ly là fail, kèm chỉ rõ chỗ lệch.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, eq, assert as ok } from '../../core/__tests__/harness.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');

const JOINT_ORDER = ['head', 'neck', 'rs', 're', 'rw', 'ls', 'le', 'lw', 'hip', 'rk', 'ra', 'lk', 'la'];
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();

let KITSIL = null;
try {
  const src = readFileSync(join(REPO, 'silhouettes.js'), 'utf8');
  const g = {};
  new Function('window', 'globalThis', src).call(g, g, g);
  KITSIL = g.KITSIL ?? globalThis.KITSIL ?? null;
} catch { KITSIL = null; }

const shapes = await import('../design/shapes.js');

describe('mirror silhouettes.js trong shapes.js (bundle không tải được file gốc)', () => {
  it('nạp được silhouettes.js thật để đối chiếu', () => {
    ok(KITSIL && typeof KITSIL.silhouette === 'function' && KITSIL.POSES,
      'không đọc được silhouettes.js ở gốc repo — bộ test này mất ý nghĩa, phải sửa đường dẫn');
  });

  it('đúng tập 19 dáng, đúng nhãn VI', () => {
    const real = KITSIL.POSES;
    const mine = shapes.poseList();
    eq(mine.length, Object.keys(real).length, 'số dáng');
    for (const id of Object.keys(real)) {
      const p = mine.find((x) => x.id === id);
      ok(p, `mirror thiếu dáng "${id}"`);
      eq(p.vi, real[id].vi, `nhãn VI của "${id}"`);
    }
    for (const p of mine) ok(real[p.id], `mirror có dáng lạ "${p.id}" (không có trong silhouettes.js)`);
  });

  it('TỪNG toạ độ khớp khớp tuyệt đối với POSES thật (13 khớp × 19 dáng)', () => {
    const real = KITSIL.POSES;
    const lệch = [];
    for (const [id, def] of Object.entries(real)) {
      // lấy khớp qua markup dáng: so trực tiếp SVG là cách chắc nhất, nhưng để chỉ rõ
      // khớp nào lệch ta đọc lại từ chính hàm vẽ của hai bên ở cùng khung 100×100.
      const a = norm(KITSIL.silhouette('pose', 100, 100, 'u', { shape: 'pose', pose: id }));
      const b = norm(shapes.silhouetteMarkup('pose', 100, 100, 'u', { shape: 'pose', pose: id }));
      if (a !== b) lệch.push(id);
      for (const k of JOINT_ORDER) ok(Array.isArray(def.j[k]), `silhouettes.js thiếu khớp ${k} của ${id}`);
    }
    eq(lệch, [], `dáng vẽ ra SVG khác bản thật: ${lệch.join(', ')}`);
  });

  it('MỌI shape trong whitelist vẽ ra markup giống hệt bản thật', () => {
    const lệch = [];
    for (const shape of shapes.shapeWhitelist()) {
      const skel = shape === 'pose' ? { shape, pose: 'idle' } : { shape };
      let a; let b;
      try { a = norm(KITSIL.silhouette(shape, 200, 120, 'u1', skel)); } catch (e) { a = `THROW ${e.message}`; }
      try { b = norm(shapes.silhouetteMarkup(shape, 200, 120, 'u1', skel)); } catch (e) { b = `THROW ${e.message}`; }
      if (a !== b) lệch.push(`${shape}:\n    thật  = ${a.slice(0, 160)}\n    mirror= ${b.slice(0, 160)}`);
    }
    eq(lệch, [], `shape vẽ khác bản thật:\n  ${lệch.join('\n  ')}`);
  });

  it('whitelist shape của client KHÔNG hẹp hơn agent (client không được chặn oan)', async () => {
    const src = readFileSync(join(REPO, 'agent', 'lib', 'validate.mjs'), 'utf8');
    const m = /SHAPES\s*=\s*new Set\(\[([^\]]*)\]/.exec(src) ?? /SHAPES\s*=\s*\[([^\]]*)\]/.exec(src);
    ok(m, 'không tìm thấy danh sách SHAPES trong agent/lib/validate.mjs');
    const agentShapes = [...m[1].matchAll(/["']([a-z0-9-]+)["']/g)].map((x) => x[1]);
    ok(agentShapes.length > 0, 'đọc được tập shape của agent');
    const mine = shapes.shapeWhitelist();
    const thiếu = agentShapes.filter((s) => !mine.includes(s));
    eq(thiếu, [], `client chặn oan shape mà agent cho phép: ${thiếu.join(', ')}`);
  });
});
