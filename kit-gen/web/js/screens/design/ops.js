/**
 * design/ops.js — MỌI THAY ĐỔI của bản thiết kế là một hàm THUẦN ở đây.
 * Vì sao: undo/redo ≥50 bước (§3.7) chỉ đúng khi mỗi thao tác (a) không sửa tại chỗ,
 * (b) có NHÃN tiếng Việt để hover nút Hoàn tác đọc được ("Bỏ 1 element khỏi sheet main").
 *
 * Quy ước cứng (đúng engine, không được đổi):
 *  · Thứ tự ô = thứ tự `components` ROW-MAJOR (gen.sh dòng 108–120, slice.py cellIndex).
 *  · `len(components)` LUÔN = cols×rows (V-04) ⇒ mọi thao tác đổi lưới phải tự bù ô trống.
 *  · Ô trống = `{ file:'', vi:'', spec:'', skel:{ shape:'empty' } }` (skeleton.py dòng 100).
 *
 * Mỗi hàm trả về `{ contract, label, focus? }`. `focus` để màn tự đưa con trỏ tới thứ vừa tạo.
 */

import { slugify as slugifyShared } from '../shared/text.js';

export const EMPTY_CELL = Object.freeze({ file: '', vi: '', spec: '', skel: Object.freeze({ shape: 'empty' }) });

const clone = (o) => (typeof structuredClone === 'function' ? structuredClone(o) : JSON.parse(JSON.stringify(o)));

export function emptyCell() { return clone(EMPTY_CELL); }

export function emptyContract() {
  return { schemaVersion: 4, sheets: [], variants: [], characterPoses: [] };
}

/* ── tra cứu ─────────────────────────────────────────────────────────────── */

export function findSheet(contract, sheetId) {
  return (contract?.sheets ?? []).find((s) => s.id === sheetId) ?? null;
}
export function sheetIndex(contract, sheetId) {
  return (contract?.sheets ?? []).findIndex((s) => s.id === sheetId);
}
export function cellCount(sheet) {
  const cols = Number(sheet?.grid?.cols ?? 0);
  const rows = Number(sheet?.grid?.rows ?? 0);
  return Number.isFinite(cols) && Number.isFinite(rows) ? cols * rows : 0;
}

/**
 * Slug hoá tên có dấu → id hợp lệ (đóng E2: không bao giờ từ chối im lặng).
 * Thuật toán ở `screens/shared/text.js` — dùng chung với S1 (gộp ở lượt tích hợp).
 */
export function slugify(text, { max = 32 } = {}) { return slugifyShared(text, { max }); }

/** id chưa dùng: `base`, `base-2`, `base-3`… */
export function uniqueId(base, taken, { min = 2 } = {}) {
  let root = base;
  if (root.length < min) root = `${root || 'x'}-1`;
  if (!taken.includes(root)) return root;
  for (let n = 2; n < 999; n += 1) {
    const cand = `${root}-${n}`;
    if (!taken.includes(cand)) return cand;
  }
  return `${root}-${Date.now().toString(36)}`;
}

/* ── SHEET ───────────────────────────────────────────────────────────────── */

export function addSheet(contract, { id, cols = 4, rows = 4, orient = 'landscape', components = null } = {}) {
  const next = clone(contract);
  const wanted = slugify(id || 'sheet') || 'sheet';
  const sid = uniqueId(wanted, next.sheets.map((s) => s.id));
  const total = cols * rows;
  const comps = [];
  for (let i = 0; i < total; i += 1) {
    comps.push(components && components[i] ? clone(components[i]) : emptyCell());
  }
  next.sheets.push({
    id: sid,
    grid: { cols, rows },
    orient,
    cell_hint: orient === 'portrait' ? 'portrait 2:3 cell' : 'landscape 3:2 cell',
    note: '',
    variants: [],
    components: comps,
  });
  return { contract: next, label: `Thêm sheet «${sid}»`, focus: { kind: 'sheet', sheetId: sid } };
}

export function renameSheet(contract, sheetId, newId) {
  const next = clone(contract);
  const sh = findSheet(next, sheetId);
  if (!sh) return { contract, label: '' };
  sh.id = String(newId ?? '');
  return { contract: next, label: `Đổi mã sheet «${sheetId}» → «${sh.id}»`, focus: { kind: 'sheet', sheetId: sh.id } };
}

export function patchSheet(contract, sheetId, patch, labelText) {
  const next = clone(contract);
  const sh = findSheet(next, sheetId);
  if (!sh) return { contract, label: '' };
  Object.assign(sh, clone(patch));
  return { contract: next, label: labelText || `Sửa sheet «${sheetId}»`, focus: { kind: 'sheet', sheetId } };
}

export function duplicateSheet(contract, sheetId) {
  const next = clone(contract);
  const i = sheetIndex(next, sheetId);
  if (i === -1) return { contract, label: '' };
  const copy = clone(next.sheets[i]);
  copy.id = uniqueId(`${sheetId}-2`, next.sheets.map((s) => s.id));
  next.sheets.splice(i + 1, 0, copy);
  return { contract: next, label: `Nhân bản sheet «${sheetId}»`, focus: { kind: 'sheet', sheetId: copy.id } };
}

export function removeSheet(contract, sheetId) {
  const next = clone(contract);
  const i = sheetIndex(next, sheetId);
  if (i === -1) return { contract, label: '' };
  next.sheets.splice(i, 1);
  return { contract: next, label: `Xoá sheet «${sheetId}»`, focus: { kind: 'sheet', sheetId: next.sheets[Math.max(0, i - 1)]?.id ?? null } };
}

export function moveSheet(contract, sheetId, delta) {
  const next = clone(contract);
  const i = sheetIndex(next, sheetId);
  const j = i + delta;
  if (i === -1 || j < 0 || j >= next.sheets.length) return { contract, label: '' };
  const [row] = next.sheets.splice(i, 1);
  next.sheets.splice(j, 0, row);
  return {
    contract: next,
    label: `Chuyển sheet «${sheetId}» ${delta < 0 ? 'lên' : 'xuống'}`,
    focus: { kind: 'sheet', sheetId },
  };
}

/**
 * Đổi lưới — thao tác NGUY HIỂM NHẤT của màn: cắt lưới nhỏ đi là mất element.
 * `overflow`: 'keep-empty' (mặc định: chỉ cho phép khi ô thừa đều trống)
 *           | 'drop'       (xoá N ô cuối — gọi hàm này sau khi user đã xác nhận)
 *           | 'move'       (chuyển N ô cuối sang sheet mới)
 */
export function resizeGrid(contract, sheetId, cols, rows, { overflow = 'keep-empty' } = {}) {
  const next = clone(contract);
  const sh = findSheet(next, sheetId);
  if (!sh) return { contract, label: '' };
  const total = cols * rows;
  const comps = Array.isArray(sh.components) ? sh.components : [];
  const before = comps.length;
  let moved = [];

  if (total > before) {
    for (let i = before; i < total; i += 1) comps.push(emptyCell());
  } else if (total < before) {
    const cut = comps.splice(total);
    moved = cut.filter((c) => String(c?.skel?.shape ?? '') !== 'empty');
  }
  sh.grid = { cols, rows };
  sh.components = comps;

  let label = `Đổi lưới sheet «${sheetId}» thành ${cols}×${rows}`;
  let focus = { kind: 'sheet', sheetId };
  if (moved.length > 0 && overflow === 'move') {
    const spill = addSheet(next, {
      id: `${sheetId}-2`, cols, rows, orient: sh.orient, components: moved,
    });
    label += ` · chuyển ${moved.length} element sang sheet mới`;
    return { contract: spill.contract, label, focus: spill.focus };
  }
  if (moved.length > 0) label += ` · bỏ ${moved.length} element`;
  return { contract: next, label, focus };
}

/** Số element THẬT (không tính ô trống) bị mất nếu đổi sang lưới cols×rows. */
export function overflowOf(sheet, cols, rows) {
  const comps = Array.isArray(sheet?.components) ? sheet.components : [];
  const cut = comps.slice(cols * rows);
  return cut.filter((c) => String(c?.skel?.shape ?? '') !== 'empty');
}

/* ── ELEMENT ─────────────────────────────────────────────────────────────── */

/** Đặt element vào ô `index` (ghi đè nội dung ô đó — lưới không đổi kích thước). */
export function setCell(contract, sheetId, index, comp, labelText) {
  const next = clone(contract);
  const sh = findSheet(next, sheetId);
  if (!sh || !Array.isArray(sh.components) || index < 0 || index >= sh.components.length) {
    return { contract, label: '' };
  }
  sh.components[index] = clone(comp);
  return {
    contract: next,
    label: labelText || `Sửa element ô ${index + 1} của sheet «${sheetId}»`,
    focus: { kind: 'element', sheetId, index },
  };
}

/** Sửa một phần element (merge nông; `skel` merge riêng). */
export function patchCell(contract, sheetId, index, patch, labelText) {
  const sh = findSheet(contract, sheetId);
  const cur = sh?.components?.[index] ?? {};
  const merged = { ...clone(cur), ...clone(patch) };
  if (patch && patch.skel) merged.skel = { ...clone(cur.skel ?? {}), ...clone(patch.skel) };
  return setCell(contract, sheetId, index, merged, labelText);
}

/** Xoá element khỏi ô: ô trở thành ô TRỐNG (giữ V-04 luôn đúng). */
export function clearCell(contract, sheetId, index) {
  const sh = findSheet(contract, sheetId);
  const name = sh?.components?.[index]?.file || `ô ${index + 1}`;
  const r = setCell(contract, sheetId, index, emptyCell(), `Bỏ «${name}» khỏi sheet «${sheetId}»`);
  return r;
}

/** Đổi vị trí 2 ô (kéo-thả hoặc ⌥←→↑↓). */
export function swapCells(contract, sheetId, a, b) {
  const next = clone(contract);
  const sh = findSheet(next, sheetId);
  if (!sh || !Array.isArray(sh.components)) return { contract, label: '' };
  const n = sh.components.length;
  if (a < 0 || b < 0 || a >= n || b >= n || a === b) return { contract, label: '' };
  const tmp = sh.components[a];
  sh.components[a] = sh.components[b];
  sh.components[b] = tmp;
  return {
    contract: next,
    label: `Đổi vị trí ô ${a + 1} ↔ ô ${b + 1} (sheet «${sheetId}»)`,
    focus: { kind: 'element', sheetId, index: b },
  };
}

/**
 * Thêm nhiều element từ THƯ VIỆN vào sheet (drawer §3-S3 cuối).
 * Điền vào các ô trống trước; hết ô trống thì NỚI LƯỚI (thêm hàng) — không bao giờ
 * làm sai V-04, và không bao giờ ghi đè element đang có.
 */
export function addElementsToSheet(contract, sheetId, elements) {
  const next = clone(contract);
  const sh = findSheet(next, sheetId);
  if (!sh) return { contract, label: '' };
  const list = elements.map((e) => libToComponent(e));
  const comps = Array.isArray(sh.components) ? sh.components : (sh.components = []);
  let firstIndex = -1;

  for (const comp of list) {
    let slot = comps.findIndex((c) => String(c?.skel?.shape ?? '') === 'empty');
    if (slot === -1) {
      const cols = Number(sh.grid?.cols ?? 4) || 4;
      const rows = Number(sh.grid?.rows ?? 1) || 1;
      sh.grid = { cols, rows: rows + 1 };
      for (let i = 0; i < cols; i += 1) comps.push(emptyCell());
      slot = comps.findIndex((c) => String(c?.skel?.shape ?? '') === 'empty');
    }
    comps[slot] = comp;
    if (firstIndex === -1) firstIndex = slot;
  }
  return {
    contract: next,
    label: `Thêm ${list.length} element vào sheet «${sheetId}»`,
    focus: firstIndex === -1 ? { kind: 'sheet', sheetId } : { kind: 'element', sheetId, index: firstIndex },
  };
}

/** Element của thư viện → component trong contract (COPY vào project — chốt X8). */
export function libToComponent(e) {
  return {
    file: String(e?.file ?? ''),
    vi: String(e?.vi ?? ''),
    spec: String(e?.spec ?? ''),
    skel: clone(e?.skel ?? { shape: 'rect', w: 0.8, h: 0.6 }),
  };
}

/** So với bản gốc trong thư viện: có sửa spec/skel không (badge `✎ đã sửa`, chốt X8). */
export function differsFromLib(comp, libEntry) {
  if (!libEntry) return false;
  const a = JSON.stringify({ spec: comp?.spec ?? '', skel: comp?.skel ?? {} });
  const b = JSON.stringify({ spec: libEntry?.spec ?? '', skel: libEntry?.skel ?? {} });
  return a !== b;
}

/** Danh sách lượt sinh ảnh (job) — mirror contractJobs() của agent, dùng cho modal M1. */
export function contractJobs(contract) {
  const out = [];
  for (const v of contract?.variants ?? []) {
    for (const sh of contract?.sheets ?? []) {
      const only = sh.variants;
      if (Array.isArray(only) && only.length && !only.includes(v.id)) continue;
      out.push({ job: `${v.id}-${sh.id}`, variant: v.id, sheet: sh.id });
    }
  }
  return out;
}

export function countComponents(contract) {
  return (contract?.sheets ?? []).reduce(
    (n, s) => n + (s.components ?? []).filter((c) => String(c?.skel?.shape ?? '') !== 'empty').length, 0,
  );
}
