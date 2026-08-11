/**
 * design/library-drawer.js — DRAWER "THƯ VIỆN ELEMENT" (§3-S3 cuối, ⌘L).
 * Đọc /api/element-lib (#28) — 42 element, catalogue CHỈ ĐỌC (chốt X8): thêm = COPY
 * vào contract của project, sửa sau đó là sửa bản copy.
 *
 * Đóng đúng các issue audit ghi trong spec:
 *   I2/I4 · mỗi dòng là <label><input type=checkbox> THẬT, không div onclick
 *   I3 · chữ ≥12px (dùng --t-body/--t-caption, không cỡ tự phát)
 *   I1 · trạng thái chọn = dấu ✓ + nền + viền, không chỉ màu viền
 *   "42 ô không tìm kiếm được" · có ô tìm + lọc nhóm
 */

import {
  createButton, createCheckbox, createInput, createSelect, createSpinnerRow,
  createEmptyState, createErrorState, createSegmented, el, clear,
  openDrawer,
} from '../../ui/index.js';
import { api, errors } from '../../core/index.js';
import { learnShapesFrom } from './shapes.js';

let cache = null;   // { version, elements } — catalogue đổi rất ít, cache trong phiên tab

/**
 * @param {{ sheets:Array, activeSheetId:string, onAdd:(els:Array, target:object)=>void,
 *           returnFocusTo?:HTMLElement }} opts
 */
export function openLibraryDrawer(opts = {}) {
  const { sheets = [], activeSheetId = null, onAdd = () => {}, returnFocusTo = null } = opts;
  const body = el('div', { class: 'd-lib' });
  const foot = el('div', { class: 'd-lib__foot' });

  const drawer = openDrawer({
    title: 'Thư viện element', body, footer: foot, returnFocusTo,
  });

  const picked = new Set();
  let all = [];
  let query = '';
  let group = 'all';
  let destination = activeSheetId ?? (sheets[0]?.id ?? null);
  let newSheetMode = sheets.length === 0;

  const list = el('div', { class: 'd-lib__list', role: 'group', 'aria-label': 'Danh sách element trong thư viện' });
  const countLine = el('p', { class: 'kg-t-caption kg-fg-default', role: 'status', 'aria-live': 'polite' });

  const fSearch = createInput({
    label: 'Tìm element', placeholder: 'tên file hoặc nhãn tiếng Việt…',
    attrs: { type: 'search' },
    onInput: (e) => { query = e.target.value.trim().toLowerCase(); renderList(); },
  });
  const fGroup = createSelect({
    label: 'Nhóm', value: 'all', options: [{ value: 'all', label: 'Tất cả nhóm' }],
    onChange: (e) => { group = e.target.value; renderList(); },
  });

  body.appendChild(el('div', { class: 'd-props__row' }, [fSearch.el, fGroup.el]));
  body.appendChild(countLine);
  body.appendChild(list);

  function usedFiles() {
    const set = new Set();
    for (const sh of sheets) {
      for (const c of sh.components ?? []) if (c?.file) set.add(`${c.file}@${sh.id}`);
    }
    return set;
  }
  const used = usedFiles();

  function sheetsWithFile(file) {
    return sheets.filter((sh) => (sh.components ?? []).some((c) => c?.file === file)).map((sh) => sh.id);
  }

  function renderList() {
    clear(list);
    const q = query;
    const items = all.filter((e) => {
      if (group !== 'all' && String(e.group ?? '') !== group) return false;
      if (q === '') return true;
      return `${e.file} ${e.vi} ${e.spec ?? ''}`.toLowerCase().includes(q);
    });

    if (items.length === 0) {
      list.appendChild(createEmptyState({
        inline: true, icon: '🔍', title: 'Không có element nào khớp',
        description: 'Thử từ khoá khác hoặc bỏ lọc nhóm.',
      }));
    }

    for (const e of items) {
      const inSheets = sheetsWithFile(e.file);
      const chk = createCheckbox({
        label: `${e.file} — ${e.vi}`,
        sublabel: `${e.skel?.shape ?? '?'} · ${e.cell ?? 'landscape'}${e.group ? ` · nhóm ${e.group}` : ''}`,
        checked: picked.has(e.file),
        onChange: (ev) => {
          if (ev.target.checked) picked.add(e.file); else picked.delete(e.file);
          syncFooter();
        },
      });
      const row = el('div', { class: 'd-lib__item' }, [
        chk.el,
        inSheets.length
          ? el('span', { class: 'd-lib__meta', text: `● đã có trong ${inSheets.join(', ')}` })
          : null,
      ]);
      list.appendChild(row);
    }
    countLine.textContent = `${items.length} element hiển thị · tổng ${all.length} trong thư viện`;
    syncFooter();
  }

  const destWrap = el('div', {});
  const addBtn = createButton({
    label: 'Thêm element', variant: 'primary', disabled: true,
    onClick: () => {
      const chosen = all.filter((e) => picked.has(e.file));
      if (chosen.length === 0) return;
      onAdd(chosen, newSheetMode ? { kind: 'new-sheet' } : { kind: 'sheet', sheetId: destination });
      drawer.close('added');
    },
  });
  const cancelBtn = createButton({ label: 'Huỷ', variant: 'secondary', onClick: () => drawer.close('cancel') });

  function syncFooter() {
    const n = picked.size;
    addBtn.disabled = n === 0;
    const lbl = addBtn.querySelector('.kg-btn__label');
    if (lbl) lbl.textContent = n === 0 ? 'Thêm element' : `Thêm ${n} element`;
    renderDest();
  }

  function renderDest() {
    clear(destWrap);
    const n = picked.size;
    if (n === 0) return;
    const target = sheets.find((s) => s.id === destination);
    const free = target
      ? (target.components ?? []).filter((c) => String(c?.skel?.shape ?? '') === 'empty').length
      : 0;
    const items = [
      ...(sheets.length
        ? [{ value: 'sheet', label: target ? `sheet ${target.id} (còn ${free} ô trống)` : 'sheet đang mở' }]
        : []),
      { value: 'new', label: 'sheet mới' },
    ];
    const seg = createSegmented({
      label: `Đang chọn ${n} → thêm vào`,
      value: newSheetMode ? 'new' : 'sheet',
      items,
      note: !newSheetMode && target && free < n
        ? `Chỉ còn ${free} ô trống — lưới sẽ được nới thêm hàng cho vừa ${n} element.`
        : null,
      onChange: (v) => { newSheetMode = v === 'new'; renderDest(); },
    });
    destWrap.appendChild(seg.el);
    if (!newSheetMode && sheets.length > 1) {
      const pick = createSelect({
        label: 'Sheet đích', value: destination ?? sheets[0].id,
        options: sheets.map((s) => ({ value: s.id, label: s.id })),
        onChange: (e) => { destination = e.target.value; renderDest(); },
      });
      destWrap.appendChild(pick.el);
    }
  }

  foot.appendChild(destWrap);
  foot.appendChild(el('div', { class: 'kg-row' }, [
    el('span', { style: { marginLeft: 'auto' } }),
    cancelBtn, addBtn,
  ]));

  /* ── nạp catalogue: 4 trạng thái empty/loading/error/success ───────────── */
  const loading = createSpinnerRow({ label: 'Đang nạp thư viện element…' });
  list.appendChild(loading);

  (async () => {
    try {
      if (cache === null) cache = await api.elementLib.get();
      all = Array.isArray(cache?.elements) ? cache.elements : [];
      learnShapesFrom(all);
      const groups = [...new Set(all.map((e) => String(e.group ?? '')).filter((g) => g !== ''))].sort();
      clear(fGroup.input);
      for (const o of [{ value: 'all', label: 'Tất cả nhóm' }, ...groups.map((g) => ({ value: g, label: g }))]) {
        fGroup.input.appendChild(el('option', { value: o.value, text: o.label }));
      }
      if (all.length === 0) {
        clear(list);
        list.appendChild(createEmptyState({
          inline: true, icon: '▤', title: 'Thư viện chưa có element nào',
          description: 'Công cụ local chưa nạp được element-lib.json.',
        }));
        return;
      }
      renderList();
    } catch (e) {
      clear(list);
      const view = errors.present(e);
      list.appendChild(createErrorState({
        title: view.title,
        description: view.explain,
        actions: [createButton({ label: 'Thử lại', variant: 'secondary', onClick: () => { cache = null; drawer.close(); openLibraryDrawer(opts); } })],
        devDetails: errors.devDetails(e),
      }));
    }
  })();

  return drawer;
}

/** Cho màn khác dùng lại catalogue đã nạp (không gọi API lần hai). */
export function cachedElements() {
  return Array.isArray(cache?.elements) ? cache.elements : [];
}
export async function ensureElementLib() {
  if (cache === null) {
    cache = await api.elementLib.get();
    learnShapesFrom(cache?.elements ?? []);
  }
  return cachedElements();
}
