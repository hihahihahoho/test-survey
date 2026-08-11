/**
 * design/validate.js — VALIDATE CLIENT của bản thiết kế (UX-SPEC §3-S3.4, bảng V-01..V-08).
 *
 * Luật vàng: bộ luật này phải **khớp** agent/lib/validate.mjs (agent kiểm lại — client
 * không đáng tin). Client được phép cảnh báo THÊM, nhưng không được CHẶN thứ agent cho qua
 * (nếu không user sẽ bị kẹt không lưu được contract hợp lệ).
 *
 *   errors[]   → CHẶN lưu (nút Lưu disabled + tooltip lý do)
 *   warnings[] → không chặn (Lưu vẫn bấm được — §3-S3.4 cuối)
 *
 * Mỗi phát hiện có `target` để thanh Validate click-là-nhảy-tới-chỗ-sai.
 */

import { isKnownShape } from './shapes.js';

export const RE_COMPONENT_FILE = /^[0-9]{2}-[a-z0-9-]+$/;   // V-01 (agent: paths.mjs)
export const RE_SHEET_ID = /^[a-z0-9-]{2,32}$/;             // V-03
export const RE_ID_SHORT = /^[a-z0-9-]{2,24}$/;             // V-05 (variant/character)
export const MATTE_VALUES = Object.freeze(['glow', 'glass']);

const E = (list, code, message, target, extra = {}) => {
  list.push({ code, message, target, ...extra });
};

/** Ô trống cố ý: agent miễn V-01 cho skel.shape === 'empty'. */
export function isEmptyCell(comp) {
  return String(comp?.skel?.shape ?? '') === 'empty';
}

/**
 * @param {object} contract
 * @param {{refNames?: string[]}} [ctx] refNames = danh sách ref THẬT trên đĩa (cho V-08)
 * @returns {{errors:Array, warnings:Array, byTarget:Map, ok:boolean}}
 */
export function validateContract(contract, ctx = {}) {
  const errors = [];
  const warnings = [];

  if (!contract || typeof contract !== 'object') {
    E(errors, 'SCHEMA', 'Bản thiết kế không đọc được.', { kind: 'contract' });
    return finish(errors, warnings);
  }
  const sheets = Array.isArray(contract.sheets) ? contract.sheets : [];
  const variants = Array.isArray(contract.variants) ? contract.variants : [];
  if (!Array.isArray(contract.sheets)) E(errors, 'SCHEMA', 'Danh sách sheet bị hỏng.', { kind: 'contract' });
  if (!Array.isArray(contract.variants)) E(errors, 'SCHEMA', 'Danh sách phong cách bị hỏng.', { kind: 'contract' });

  /* ── V-05 · phong cách: id đúng dạng + duy nhất ────────────────────────── */
  const variantIds = new Set();
  variants.forEach((v, i) => {
    const t = { kind: 'variant', variantId: v?.id, index: i, field: 'id' };
    const id = String(v?.id ?? '');
    if (!RE_ID_SHORT.test(id)) {
      E(errors, 'V-05', 'Chỉ chữ thường, số, gạch nối (2–24 ký tự).', t);
    } else if (variantIds.has(id)) {
      E(errors, 'V-05', `Đã có phong cách «${id}». Đổi tên khác.`, t);
    } else {
      variantIds.add(id);
    }
    if (v?.bg !== undefined && typeof v.bg !== 'string') {
      E(errors, 'SCHEMA', 'Màu nền tách phải là chữ.', { ...t, field: 'bg' });
    }
    // V-05 cho nhân vật trong phong cách
    const chIds = new Set();
    for (const [k, c] of (Array.isArray(v?.characters) ? v.characters : []).entries()) {
      const ct = { kind: 'character', variantId: v?.id, characterId: c?.id, index: k, field: 'id' };
      const cid = String(c?.id ?? '');
      if (!RE_ID_SHORT.test(cid)) E(errors, 'V-05', 'Mã nhân vật: chỉ chữ thường, số, gạch nối.', ct);
      else if (chIds.has(cid)) E(errors, 'V-05', `Đã có nhân vật «${cid}» trong phong cách này.`, ct);
      else chIds.add(cid);
    }
  });

  /* ── Sheet ─────────────────────────────────────────────────────────────── */
  const sheetIds = new Set();
  sheets.forEach((sh, i) => {
    const sid = String(sh?.id ?? '');
    const tId = { kind: 'sheet', sheetId: sid, index: i, field: 'id' };

    // V-03 · id đúng dạng và DUY NHẤT trong project (đóng A6, K4 — Playwright strict-mode)
    if (!RE_SHEET_ID.test(sid)) {
      E(errors, 'V-03', 'Mã sheet: chữ thường, số, gạch nối, 2–32 ký tự.', tId);
    } else if (sheetIds.has(sid)) {
      E(errors, 'V-03', `Đã có sheet «${sid}». Đổi tên hoặc gộp.`, tId);
    } else {
      sheetIds.add(sid);
    }

    const cols = Number(sh?.grid?.cols);
    const rows = Number(sh?.grid?.rows);
    const tGrid = { kind: 'sheet', sheetId: sid, index: i, field: 'grid' };
    const gridOk = Number.isInteger(cols) && Number.isInteger(rows)
      && cols >= 1 && cols <= 8 && rows >= 1 && rows <= 8;
    if (!gridOk) E(errors, 'SCHEMA', 'Lưới phải là số nguyên từ 1 đến 8 cho cả cột và hàng.', tGrid);

    const comps = Array.isArray(sh?.components) ? sh.components : null;
    if (comps === null) {
      E(errors, 'SCHEMA', 'Danh sách element của sheet bị hỏng.', tGrid);
      return;
    }

    // V-04 · số element == cols×rows (đúng assert của gen.sh dòng 31 + slice.py)
    if (gridOk && comps.length !== cols * rows) {
      E(errors, 'V-04', `Lưới ${cols}×${rows} cần ${cols * rows} ô, đang có ${comps.length}.`, tGrid, {
        expected: cols * rows, actual: comps.length, fixable: 'grid',
      });
    }

    // V-07 · sheet rỗng: cảnh báo, KHÔNG chặn
    if (comps.length === 0) {
      E(warnings, 'V-07', `Sheet «${sid || i + 1}» chưa có element — sẽ bị bỏ qua khi sinh ảnh.`, tGrid);
    }

    // sheet.variants trỏ tới phong cách không tồn tại
    if (Array.isArray(sh?.variants)) {
      sh.variants.forEach((vid, k) => {
        if (!variantIds.has(String(vid))) {
          E(warnings, 'UNKNOWN_VARIANT', `Phong cách «${vid}» không còn tồn tại.`,
            { kind: 'sheet', sheetId: sid, index: i, field: 'variants', at: k });
        }
      });
    }

    // ô trống vẫn tính vào ảnh → cảnh báo tại chỗ (đóng C5)
    const emptyCount = comps.filter(isEmptyCell).length;
    if (emptyCount > 0 && gridOk) {
      const pct = Math.round((emptyCount / (cols * rows)) * 100);
      E(warnings, 'EMPTY_CELLS', `${emptyCount} ô trống — vẫn tính vào ảnh (≈${pct}% diện tích).`, tGrid,
        { emptyCount, pct });
    }

    validateComponents(sh, i, comps, { errors, warnings });
  });

  /* ── V-08 · ref bị xoá nhưng còn tham chiếu (chặn) ─────────────────────── */
  if (Array.isArray(ctx.refNames)) {
    const have = new Set(ctx.refNames.map((n) => baseName(n)));
    for (const use of refUsage(contract)) {
      if (use.ref === '' || have.has(baseName(use.ref))) continue;
      E(errors, 'V-08', `Ảnh «${baseName(use.ref)}» không còn trong project nhưng vẫn đang được dùng.`, use.target);
    }
  }

  return finish(errors, warnings);
}

function validateComponents(sh, sheetIndex, comps, out) {
  const sid = String(sh?.id ?? '');
  const files = new Map();
  comps.forEach((c, j) => {
    const t = { kind: 'element', sheetId: sid, index: j, sheetIndex, field: 'file' };
    const empty = isEmptyCell(c);
    const file = String(c?.file ?? '');

    // V-01 · tên file 2 số + slug (ô trống được miễn — đúng agent)
    if (!empty && !RE_COMPONENT_FILE.test(file)) {
      E(out.errors, 'V-01', 'Tên file: 2 số + gạch nối + chữ thường. Gợi ý: 17-btn-close', t);
    }
    // V-02 · duy nhất trong sheet
    if (file !== '') {
      if (files.has(file)) {
        E(out.errors, 'V-02', `Đã có element tên này ở ô ${files.get(file) + 1}.`, t);
      } else {
        files.set(file, j);
      }
    }
    if (c?.spec !== undefined && typeof c.spec !== 'string') {
      E(out.errors, 'SCHEMA', 'Mô tả cho AI phải là chữ.', { ...t, field: 'spec' });
    }
    if (!empty && String(c?.spec ?? '').trim() === '') {
      E(out.warnings, 'SPEC_EMPTY', `Element «${file || `ô ${j + 1}`}» chưa có mô tả cho AI.`, { ...t, field: 'spec' });
    }

    const sk = c?.skel;
    if (sk === undefined || sk === null) {
      E(out.warnings, 'SKEL_MISSING', `Element «${file || `ô ${j + 1}`}» chưa có khung xương — engine sẽ dùng chữ nhật 0.8×0.6.`,
        { ...t, field: 'skel' });
      return;
    }
    if (typeof sk !== 'object' || Array.isArray(sk)) {
      E(out.errors, 'SCHEMA', 'Khung xương phải là một nhóm thuộc tính.', { ...t, field: 'skel' });
      return;
    }

    // Whitelist shape — đọc từ silhouettes.js/skeleton.py qua shapes.js.
    // Agent chỉ CẢNH BÁO shape lạ ⇒ client cũng chỉ cảnh báo (không được nghiêm hơn agent).
    if (sk.shape !== undefined && !isKnownShape(sk.shape)) {
      E(out.warnings, 'SKEL_SHAPE', `Hình khối «${sk.shape}» không có trong thư viện khung xương — engine sẽ không vẽ được ô này.`,
        { ...t, field: 'shape' });
    }

    // V-06 · w,h ∈ (0,1]
    for (const k of ['w', 'h']) {
      if (sk[k] === undefined) continue;
      const n = Number(sk[k]);
      if (!(n > 0 && n <= 1)) {
        E(out.errors, 'V-06', 'Giá trị từ 0.05 đến 1.00.', { ...t, field: k });
      }
    }
    // Ô không phải `full`/`empty` mà thiếu w/h → engine lấy mặc định, nên chỉ cảnh báo
    if (!empty && sk.shape !== 'full' && (sk.w === undefined || sk.h === undefined)) {
      E(out.warnings, 'SKEL_WH_MISSING', 'Chưa đặt chiều rộng/cao trong ô — engine sẽ dùng mặc định.', { ...t, field: 'w' });
    }

    // matte chỉ được glow|glass (slice.py chỉ hiểu 2 giá trị này)
    if (sk.matte !== undefined && sk.matte !== null && sk.matte !== '') {
      if (!MATTE_VALUES.includes(String(sk.matte))) {
        E(out.errors, 'SKEL_MATTE', 'Kiểu tách nền chỉ nhận: glow hoặc glass.', { ...t, field: 'matte' });
      }
    }
    // slice9 / free / plain / anchor
    for (const k of ['slice9', 'free', 'plain']) {
      if (sk[k] !== undefined && typeof sk[k] !== 'boolean') {
        E(out.errors, 'SKEL_FLAG', `Cờ ${k} chỉ nhận bật/tắt.`, { ...t, field: k });
      }
    }
    if (sk.anchor !== undefined && sk.anchor !== null && sk.anchor !== 'bottom' && sk.anchor !== 'center') {
      E(out.errors, 'SKEL_ANCHOR', 'Neo chỉ nhận: giữa ô hoặc đáy ô.', { ...t, field: 'anchor' });
    }
    if (String(sk.shape) === 'pose' && (sk.pose === undefined || sk.pose === '')) {
      E(out.warnings, 'POSE_MISSING', 'Ô dáng nhân vật chưa chọn dáng — engine sẽ dùng "Đứng thẳng".', { ...t, field: 'pose' });
    }
  });
}

/** Mọi chỗ đang tham chiếu tới ảnh ref (mirror của refUsage() phía agent) + target để nhảy tới. */
export function refUsage(contract) {
  const out = [];
  (contract?.sheets ?? []).forEach((sh, i) => {
    if (typeof sh?.ref === 'string' && sh.ref !== '') {
      out.push({ kind: 'sheet', id: sh.id, ref: sh.ref, target: { kind: 'sheet', sheetId: sh.id, index: i, field: 'ref' } });
    }
  });
  (contract?.variants ?? []).forEach((v, i) => {
    for (const p of v?.inspo ?? []) {
      out.push({ kind: 'variantInspo', id: v.id, ref: p, target: { kind: 'variant', variantId: v.id, index: i, field: 'inspo' } });
    }
    for (const p of v?.brand?.refs ?? []) {
      out.push({ kind: 'variantBrand', id: v.id, ref: p, target: { kind: 'variant', variantId: v.id, index: i, field: 'brand' } });
    }
    (v?.characters ?? []).forEach((c, k) => {
      if (typeof c?.ref === 'string' && c.ref !== '') {
        out.push({
          kind: 'character', id: c.id, ref: c.ref,
          target: { kind: 'character', variantId: v.id, characterId: c.id, index: k, field: 'ref' },
        });
      }
    });
  });
  return out;
}

function baseName(p) {
  const s = String(p ?? '');
  const i = s.lastIndexOf('/');
  return i === -1 ? s : s.slice(i + 1);
}

function finish(errors, warnings) {
  const byTarget = new Map();
  for (const item of [...errors, ...warnings]) {
    const key = targetKey(item.target);
    if (!byTarget.has(key)) byTarget.set(key, []);
    byTarget.get(key).push(item);
  }
  return { errors, warnings, byTarget, ok: errors.length === 0 };
}

/** Khoá tra cứu lỗi theo chỗ hiển thị — panel thuộc tính dùng để hiện lỗi INLINE. */
export function targetKey(t) {
  if (!t) return 'contract';
  if (t.kind === 'element') return `element:${t.sheetId}:${t.index}:${t.field ?? ''}`;
  if (t.kind === 'sheet') return `sheet:${t.sheetId}:${t.field ?? ''}`;
  if (t.kind === 'variant') return `variant:${t.variantId}:${t.field ?? ''}`;
  if (t.kind === 'character') return `character:${t.variantId}:${t.characterId}:${t.field ?? ''}`;
  return t.kind ?? 'contract';
}

/** Lỗi/cảnh báo của đúng một field (dùng cho field.setError inline). */
export function issuesFor(result, target) {
  return result?.byTarget?.get(targetKey(target)) ?? [];
}

/** Câu ngắn cho tooltip nút Lưu khi bị chặn. */
export function blockingSummary(result) {
  const n = result?.errors?.length ?? 0;
  if (n === 0) return null;
  return n === 1 ? 'Còn 1 lỗi phải sửa trước khi lưu.' : `Còn ${n} lỗi phải sửa trước khi lưu.`;
}
