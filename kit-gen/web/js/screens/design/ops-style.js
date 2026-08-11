/**
 * design/ops-style.js — thao tác cho TAB PHONG CÁCH và TAB NÂNG CAO (§3-S3.5, §3-S3.6).
 * Tách khỏi ops.js để mỗi file dưới ~400 dòng. Cùng hợp đồng: hàm THUẦN,
 * trả về { contract, label, focus? } để undo/redo có nhãn tiếng Việt.
 */

import { slugify, uniqueId } from './ops.js';

const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

/* ── VARIANT (phong cách) ────────────────────────────────────────────────── */

export function addVariant(contract, { vi, id, bg = 'pure vivid magenta #FF00FF' } = {}) {
  const next = clone(contract);
  if (!Array.isArray(next.variants)) next.variants = [];
  const wanted = slugify(id || vi || 'phong-cach', { max: 24 }) || 'phong-cach';
  const vid = uniqueId(wanted, next.variants.map((v) => v.id));
  next.variants.push({
    id: vid,
    vi: String(vi ?? vid),
    style: '',
    styleMode: 'prompt',
    bg,
    brand: { mode: 'colors', primary: '', secondary: '' },
    characters: [],
    inspo: [],
  });
  return { contract: next, label: `Thêm phong cách «${vid}»`, focus: { kind: 'variant', variantId: vid } };
}

export function patchVariant(contract, variantId, patch, labelText) {
  const next = clone(contract);
  const v = (next.variants ?? []).find((x) => x.id === variantId);
  if (!v) return { contract, label: '' };
  const p = clone(patch);
  if (p.brand) p.brand = { ...clone(v.brand ?? {}), ...p.brand };
  Object.assign(v, p);
  return { contract: next, label: labelText || `Sửa phong cách «${variantId}»`, focus: { kind: 'variant', variantId } };
}

export function duplicateVariant(contract, variantId) {
  const next = clone(contract);
  const i = (next.variants ?? []).findIndex((x) => x.id === variantId);
  if (i === -1) return { contract, label: '' };
  const copy = clone(next.variants[i]);
  copy.id = uniqueId(`${variantId}-2`, next.variants.map((v) => v.id), { min: 2 });
  copy.vi = `${copy.vi} (bản sao)`;
  next.variants.splice(i + 1, 0, copy);
  return { contract: next, label: `Nhân bản phong cách «${variantId}»`, focus: { kind: 'variant', variantId: copy.id } };
}

export function removeVariant(contract, variantId) {
  const next = clone(contract);
  next.variants = (next.variants ?? []).filter((v) => v.id !== variantId);
  // sheet nào chỉ áp cho phong cách này thì bỏ ràng buộc để không thành sheet mồ côi
  for (const sh of next.sheets ?? []) {
    if (Array.isArray(sh.variants) && sh.variants.includes(variantId)) {
      sh.variants = sh.variants.filter((x) => x !== variantId);
    }
  }
  return { contract: next, label: `Xoá phong cách «${variantId}»`, focus: { kind: 'variant', variantId: next.variants[0]?.id ?? null } };
}

/* ── NHÂN VẬT (thuộc project — đóng A3) ──────────────────────────────────── */

/** Nhân vật sống trong variant.characters[] (đúng refUsage của agent). */
export function allCharacters(contract) {
  const out = new Map();
  for (const v of contract?.variants ?? []) {
    for (const c of v.characters ?? []) {
      const cur = out.get(c.id) ?? { ...clone(c), variantIds: [] };
      cur.variantIds.push(v.id);
      // giữ bản có nhiều thông tin nhất
      if ((c.poses?.length ?? 0) > (cur.poses?.length ?? 0)) Object.assign(cur, clone(c), { variantIds: cur.variantIds });
      out.set(c.id, cur);
    }
  }
  return [...out.values()];
}

export function addCharacter(contract, { vi, id, variantIds = null } = {}) {
  const next = clone(contract);
  const taken = allCharacters(next).map((c) => c.id);
  const cid = uniqueId(slugify(id || vi || 'nhan-vat', { max: 24 }) || 'nhan-vat', taken);
  const targets = variantIds ?? (next.variants ?? []).map((v) => v.id);
  for (const v of next.variants ?? []) {
    if (!targets.includes(v.id)) continue;
    if (!Array.isArray(v.characters)) v.characters = [];
    v.characters.push({ id: cid, vi: String(vi ?? cid), ref: '', poses: ['idle', 'wave', 'point', 'hold-gift', 'cheer', 'sad', 'run', 'think'] });
  }
  return { contract: next, label: `Thêm nhân vật «${cid}»`, focus: { kind: 'character', characterId: cid } };
}

export function patchCharacter(contract, characterId, patch, labelText) {
  const next = clone(contract);
  for (const v of next.variants ?? []) {
    for (const c of v.characters ?? []) {
      if (c.id === characterId) Object.assign(c, clone(patch));
    }
  }
  return { contract: next, label: labelText || `Sửa nhân vật «${characterId}»`, focus: { kind: 'character', characterId } };
}

export function removeCharacter(contract, characterId) {
  const next = clone(contract);
  for (const v of next.variants ?? []) {
    if (Array.isArray(v.characters)) v.characters = v.characters.filter((c) => c.id !== characterId);
  }
  return { contract: next, label: `Xoá nhân vật «${characterId}»`, focus: { kind: 'character', characterId: null } };
}

/** Bật/tắt nhân vật trong một phong cách (checkbox ☑ Lan ☐ Sóc ở tab Phong cách). */
export function toggleCharacterInVariant(contract, variantId, characterId, on) {
  const next = clone(contract);
  const v = (next.variants ?? []).find((x) => x.id === variantId);
  if (!v) return { contract, label: '' };
  if (!Array.isArray(v.characters)) v.characters = [];
  const has = v.characters.some((c) => c.id === characterId);
  if (on && !has) {
    const src = allCharacters(next).find((c) => c.id === characterId);
    v.characters.push(src ? { id: src.id, vi: src.vi, ref: src.ref ?? '', poses: [...(src.poses ?? [])] } : { id: characterId, vi: characterId, ref: '', poses: [] });
  } else if (!on && has) {
    v.characters = v.characters.filter((c) => c.id !== characterId);
  }
  return {
    contract: next,
    label: `${on ? 'Thêm' : 'Bỏ'} nhân vật «${characterId}» ${on ? 'vào' : 'khỏi'} phong cách «${variantId}»`,
    focus: { kind: 'variant', variantId },
  };
}

/* ── NÂNG CAO (tham số cắt) ──────────────────────────────────────────────── */

/** Ghi tham số cắt: mỗi variant (slice.py đọc theo style) + mặc định ở contract.slice. */
export function patchSliceParams(contract, patch, { scope = 'project', variantId = null } = {}) {
  const next = clone(contract);
  const p = clone(patch);
  if (scope === 'project') {
    next.slice = { ...clone(next.slice ?? {}), ...p };
    for (const v of next.variants ?? []) {
      if (p.threshold !== undefined) v.threshold = p.threshold;
      if (p.grow_threshold !== undefined) v.grow_threshold = p.grow_threshold;
    }
    return { contract: next, label: 'Sửa tham số cắt (cả project)' };
  }
  const v = (next.variants ?? []).find((x) => x.id === variantId);
  if (!v) return { contract, label: '' };
  if (p.threshold !== undefined) v.threshold = p.threshold;
  if (p.grow_threshold !== undefined) v.grow_threshold = p.grow_threshold;
  return { contract: next, label: `Sửa tham số cắt của phong cách «${variantId}»`, focus: { kind: 'variant', variantId } };
}
