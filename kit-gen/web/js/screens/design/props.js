/**
 * design/props.js — VÙNG ③ PANEL THUỘC TÍNH (§3-S3.4), 4 dạng theo thứ đang chọn:
 * Element · Sheet · Nhân vật · (Phong cách → tab riêng, xem styles-tab.js).
 *
 * LUẬT QUAN TRỌNG: lỗi validate hiện INLINE ngay dưới field (không chỉ toast) —
 * dùng `field.setError()` của design system + `issuesFor()` của validate.js.
 */

import {
  createButton, createCheckbox, createInput, createSelect, createTextarea,
  createBadge, el, clear,
} from '../../ui/index.js';
import { issuesFor } from './validate.js';
import { readOnlyReason } from '../shared/read-only.js';
import { poseList, shapeOptions } from './shapes.js';
import { differsFromLib } from './ops.js';

const ANCHORS = [
  { value: 'center', label: 'Giữa ô' },
  { value: 'bottom', label: 'Dính đáy ô' },
];
const MATTES = [
  { value: '', label: 'Không (tách theo màu nền)' },
  { value: 'glow', label: 'glow — hiệu ứng phát sáng' },
  { value: 'glass', label: 'glass — vật liệu trong suốt' },
];

/**
 * @param {{ onPatchCell:Function, onDeleteCell:Function, onPatchSheet:Function,
 *  onDeleteSheet:Function, onResetToLib:Function, onPatchCharacter:Function,
 *  onDeleteCharacter:Function, onGenSheet:Function, onSliceSheet:Function,
 *  onPickRef:Function, libEntryFor:Function, refUrl:Function }} h
 */
export function createPropsPanel(h = {}) {
  const root = el('aside', { class: 'd-props', 'aria-label': 'Thuộc tính' });
  let ctx = { readOnly: false, validation: null, contract: null };

  const dis = () => ctx.readOnly;
  const reason = readOnlyReason();

  function head(kindLabel, titleText, actions = []) {
    return el('div', {}, [
      el('div', { class: 'd-props__head' }, [
        el('span', { class: 'd-props__kind', text: kindLabel }),
        ...actions,
      ]),
      titleText ? el('p', { class: 'kg-t-subtitle kg-truncate', text: titleText }) : null,
    ]);
  }

  /** Gắn lỗi inline cho một field theo target của validate.js. */
  function bindIssue(field, target) {
    const list = issuesFor(ctx.validation, target);
    const err = list.find((x) => (ctx.validation?.errors ?? []).includes(x));
    const warn = list.find((x) => (ctx.validation?.warnings ?? []).includes(x));
    if (err) field.setError(err.message);
    else if (warn) field.setError(`⚠ ${warn.message}`);
    else field.setError(null);
    return field;
  }

  /* ── 1 · ELEMENT ─────────────────────────────────────────────────────── */
  function renderElement(sheet, index) {
    const comp = sheet?.components?.[index];
    if (!comp) { renderNothing(); return; }
    const t = (field) => ({ kind: 'element', sheetId: sheet.id, index, field });
    const lib = h.libEntryFor ? h.libEntryFor(comp.file) : null;
    const edited = differsFromLib(comp, lib);
    const skel = comp.skel ?? {};

    const fFile = createInput({
      label: 'Tên file', value: comp.file ?? '', mono: true, disabled: dis(),
      hint: '2 số + gạch nối + chữ thường, ví dụ 17-btn-close',
      onChange: (e) => h.onPatchCell(index, { file: e.target.value.trim() }, `Đổi tên file ô ${index + 1}`),
    });
    const fVi = createInput({
      label: 'Nhãn tiếng Việt', value: comp.vi ?? '', disabled: dis(),
      onChange: (e) => h.onPatchCell(index, { vi: e.target.value }, `Đổi nhãn ô ${index + 1}`),
    });
    const fSpec = createTextarea({
      label: 'Mô tả cho AI', value: comp.spec ?? '', rows: 6, disabled: dis(),
      hint: 'Câu lệnh cho AI vẽ element này. Sửa được — đây là bản copy của project.',
      onChange: (e) => h.onPatchCell(index, { spec: e.target.value }, `Sửa mô tả ô ${index + 1}`),
    });
    const fShape = createSelect({
      label: 'Hình khối (khung xương)', value: String(skel.shape ?? 'rect'), disabled: dis(),
      options: shapeOptions(),
      onChange: (e) => h.onPatchCell(index, { skel: { shape: e.target.value } }, `Đổi hình khối ô ${index + 1}`),
    });
    const fW = createInput({
      label: 'Rộng (0–1)', type: 'number', value: String(skel.w ?? ''), size: 'sm', disabled: dis(),
      attrs: { min: '0.05', max: '1', step: '0.01', inputmode: 'decimal' },
      onChange: (e) => h.onPatchCell(index, { skel: { w: numOrUndef(e.target.value) } }, `Đổi chiều rộng ô ${index + 1}`),
    });
    const fH = createInput({
      label: 'Cao (0–1)', type: 'number', value: String(skel.h ?? ''), size: 'sm', disabled: dis(),
      attrs: { min: '0.05', max: '1', step: '0.01', inputmode: 'decimal' },
      onChange: (e) => h.onPatchCell(index, { skel: { h: numOrUndef(e.target.value) } }, `Đổi chiều cao ô ${index + 1}`),
    });
    const fMatte = createSelect({
      label: 'Kiểu tách nền', value: String(skel.matte ?? ''), disabled: dis(), options: MATTES,
      hint: 'glow: ô vẽ trên nền đen. glass: miễn ép đục ruột.',
      onChange: (e) => h.onPatchCell(index, { skel: { matte: e.target.value === '' ? undefined : e.target.value } }, `Đổi kiểu tách nền ô ${index + 1}`),
    });
    const fAnchor = createSelect({
      label: 'Neo trong ô', value: String(skel.anchor ?? 'center'), disabled: dis(), options: ANCHORS,
      onChange: (e) => h.onPatchCell(index, { skel: { anchor: e.target.value === 'center' ? undefined : e.target.value } }, `Đổi neo ô ${index + 1}`),
    });
    const cSlice9 = createCheckbox({
      label: 'slice9 — kéo giãn được 9 lát', checked: skel.slice9 === true, disabled: dis(),
      onChange: (e) => h.onPatchCell(index, { skel: { slice9: e.target.checked ? true : undefined } }, `${e.target.checked ? 'Bật' : 'Tắt'} slice9 ô ${index + 1}`),
    });
    const cFree = createCheckbox({
      label: 'free — không vẽ khung safe zone', checked: skel.free === true, disabled: dis(),
      onChange: (e) => h.onPatchCell(index, { skel: { free: e.target.checked ? true : undefined } }, `${e.target.checked ? 'Bật' : 'Tắt'} free ô ${index + 1}`),
    });
    const cPlain = createCheckbox({
      label: 'plain — silhouette đặc, không viền', checked: skel.plain === true, disabled: dis(),
      onChange: (e) => h.onPatchCell(index, { skel: { plain: e.target.checked ? true : undefined } }, `${e.target.checked ? 'Bật' : 'Tắt'} plain ô ${index + 1}`),
    });

    bindIssue(fFile, t('file'));
    bindIssue(fSpec, t('spec'));
    bindIssue(fShape, t('shape'));
    bindIssue(fW, t('w'));
    bindIssue(fH, t('h'));
    bindIssue(fMatte, t('matte'));

    const fields = [
      head('Element', `Ô ${index + 1} · sheet ${sheet.id}`, [
        edited ? createBadge({ state: 'accent', text: 'đã sửa', iconGlyph: '✎', long: 'Khác bản gốc trong thư viện element' }) : null,
      ]),
      fFile.el, fVi.el, fSpec.el,
      edited && lib
        ? createButton({
            label: 'Trả về bản gốc', variant: 'ghost', size: 'sm', icon: '↺', disabled: dis(),
            onClick: () => h.onResetToLib(index),
          })
        : null,
      el('hr', { class: 'd-props__sep' }),
      fShape.el,
      el('div', { class: 'd-props__row' }, [fW.el, fH.el]),
      fAnchor.el, fMatte.el,
      el('div', { class: 'd-checks' }, [cSlice9.el, cFree.el, cPlain.el]),
    ];

    if (String(skel.shape) === 'pose') {
      const fPose = createSelect({
        label: 'Dáng nhân vật', value: String(skel.pose ?? 'idle'), disabled: dis(),
        options: poseList().map((p) => ({ value: p.id, label: p.vi })),
        onChange: (e) => h.onPatchCell(index, { skel: { pose: e.target.value } }, `Đổi dáng ô ${index + 1}`),
      });
      fields.push(fPose.el);
    }

    fields.push(el('hr', { class: 'd-props__sep' }));
    fields.push(createButton({
      label: 'Xoá element', variant: 'ghost', size: 'sm', icon: '🗑',
      disabled: dis(), tooltip: dis() ? reason : null,
      onClick: () => h.onDeleteCell(index),
    }));
    paint(fields);
  }

  /* ── 2 · SHEET ───────────────────────────────────────────────────────── */
  function renderSheet(sheet) {
    if (!sheet) { renderNothing(); return; }
    const t = (field) => ({ kind: 'sheet', sheetId: sheet.id, field });
    const cols = Number(sheet.grid?.cols ?? 1);
    const rows = Number(sheet.grid?.rows ?? 1);

    const fId = createInput({
      label: 'Mã sheet', value: sheet.id ?? '', mono: true, disabled: dis(),
      hint: 'Duy nhất trong project. Dùng làm tên ảnh: raw/<phong cách>-<mã sheet>.png',
      onChange: (e) => h.onPatchSheet({ id: e.target.value.trim() }, 'rename'),
    });
    const fCols = createInput({
      label: 'Số cột', type: 'number', value: String(cols), size: 'sm', disabled: dis(),
      attrs: { min: '1', max: '8', step: '1' },
      onChange: (e) => h.onPatchSheet({ grid: { cols: Number(e.target.value), rows } }, 'grid'),
    });
    const fRows = createInput({
      label: 'Số hàng', type: 'number', value: String(rows), size: 'sm', disabled: dis(),
      attrs: { min: '1', max: '8', step: '1' },
      onChange: (e) => h.onPatchSheet({ grid: { cols, rows: Number(e.target.value) } }, 'grid'),
    });
    const fOrient = createSelect({
      label: 'Khổ ảnh', value: String(sheet.orient ?? 'landscape'), disabled: dis(),
      options: [
        { value: 'landscape', label: 'Ngang 1536×1024 (ô 3:2)' },
        { value: 'portrait', label: 'Dọc 1024×1536 (ô 2:3)' },
      ],
      onChange: (e) => h.onPatchSheet({
        orient: e.target.value,
        cell_hint: e.target.value === 'portrait' ? 'portrait 2:3 cell' : 'landscape 3:2 cell',
      }, 'orient'),
    });
    const fHint = createInput({
      label: 'Gợi ý về ô (cell_hint)', value: sheet.cell_hint ?? '', disabled: dis(),
      onChange: (e) => h.onPatchSheet({ cell_hint: e.target.value }, 'hint'),
    });
    const fNote = createTextarea({
      label: 'Ghi chú thêm vào prompt', value: sheet.note ?? '', rows: 3, disabled: dis(),
      onChange: (e) => h.onPatchSheet({ note: e.target.value }, 'note'),
    });

    bindIssue(fId, t('id'));
    bindIssue(fCols, t('grid'));
    bindIssue(fRows, t('grid'));

    const variants = ctx.contract?.variants ?? [];
    const only = Array.isArray(sheet.variants) ? sheet.variants : [];
    const checks = variants.map((v) => createCheckbox({
      label: v.vi || v.id, checked: only.length === 0 || only.includes(v.id), disabled: dis(),
      onChange: (e) => h.onToggleSheetVariant(v.id, e.target.checked),
    }).el);

    paint([
      head('Sheet', sheet.id, []),
      fId.el,
      el('div', { class: 'd-props__row' }, [fCols.el, fRows.el]),
      el('p', { class: 'd-props__note', text: `Lưới ${cols}×${rows} cần đúng ${cols * rows} ô.` }),
      fOrient.el, fHint.el, fNote.el,
      el('hr', { class: 'd-props__sep' }),
      el('span', { class: 'd-props__kind', text: 'Áp cho phong cách' }),
      el('p', { class: 'd-props__note', text: 'Bỏ tick hết = áp cho mọi phong cách.' }),
      el('div', { class: 'd-checks' }, checks.length ? checks : [el('p', { class: 'd-tree__empty', text: 'Chưa có phong cách nào.' })]),
      el('hr', { class: 'd-props__sep' }),
      el('div', { class: 'kg-row' }, [
        createButton({ label: 'Sinh sheet này…', variant: 'secondary', size: 'sm', icon: '⚡', disabled: dis(), tooltip: dis() ? reason : null, onClick: () => h.onGenSheet(sheet.id) }),
        createButton({ label: 'Cắt sheet này', variant: 'ghost', size: 'sm', icon: '✂️', disabled: dis(), tooltip: dis() ? reason : null, onClick: () => h.onSliceSheet(sheet.id) }),
      ]),
      createButton({
        label: 'Xoá sheet', variant: 'ghost', size: 'sm', icon: '🗑',
        disabled: dis(), tooltip: dis() ? reason : null, onClick: () => h.onDeleteSheet(sheet.id),
      }),
    ]);
  }

  /* ── 3 · NHÂN VẬT ────────────────────────────────────────────────────── */
  function renderCharacter(ch) {
    if (!ch) { renderNothing(); return; }
    const t = (field) => ({ kind: 'character', variantId: (ch.variantIds ?? [])[0], characterId: ch.id, field });
    const fId = createInput({
      label: 'Mã nhân vật', value: ch.id ?? '', mono: true, disabled: dis(),
      onChange: (e) => h.onPatchCharacter(ch.id, { id: e.target.value.trim() }, 'Đổi mã nhân vật'),
    });
    const fVi = createInput({
      label: 'Tên nhân vật', value: ch.vi ?? '', disabled: dis(),
      onChange: (e) => h.onPatchCharacter(ch.id, { vi: e.target.value }, 'Đổi tên nhân vật'),
    });
    bindIssue(fId, t('id'));

    const url = h.refUrl && ch.ref ? h.refUrl(ch.ref) : null;
    const poses = new Set(ch.poses ?? []);
    const poseChecks = poseList().map((p) => createCheckbox({
      label: p.vi, sublabel: p.id, checked: poses.has(p.id), disabled: dis(),
      onChange: (e) => h.onTogglePose(ch.id, p.id, e.target.checked),
    }).el);

    paint([
      head('Nhân vật', ch.vi || ch.id, []),
      el('p', { class: 'd-props__note', text: 'Bộ dáng này chỉ áp dụng cho project hiện tại.' }),
      fId.el, fVi.el,
      el('span', { class: 'd-props__kind', text: 'Ảnh tham khảo' }),
      url
        ? el('img', { class: 'd-refcard__img', src: url, alt: `Ảnh tham khảo của ${ch.vi || ch.id}` })
        : el('p', { class: 'd-tree__empty', text: 'Chưa có ảnh tham khảo.' }),
      createButton({
        label: url ? 'Đổi ảnh tham khảo' : 'Tải ảnh tham khảo', variant: 'secondary', size: 'sm', icon: '⬆',
        disabled: dis(), tooltip: dis() ? reason : null, onClick: () => h.onPickRef(ch.id),
      }),
      el('hr', { class: 'd-props__sep' }),
      el('span', { class: 'd-props__kind', text: `Dáng (${poses.size}/19)` }),
      el('div', { class: 'd-poses' }, poseChecks),
      el('hr', { class: 'd-props__sep' }),
      createButton({
        label: 'Xoá nhân vật', variant: 'ghost', size: 'sm', icon: '🗑',
        disabled: dis(), tooltip: dis() ? reason : null, onClick: () => h.onDeleteCharacter(ch.id),
      }),
    ]);
  }

  function renderNothing() {
    paint([
      el('div', { class: 'kg-empty kg-empty--inline' }, [
        el('div', { class: 'kg-empty__icon', 'aria-hidden': 'true', text: '☰' }),
        el('p', { class: 'kg-empty__title', text: 'Chưa chọn gì' }),
        el('p', { class: 'kg-empty__desc', text: 'Chọn một sheet, một ô element hoặc một nhân vật ở bên trái để sửa thuộc tính.' }),
      ]),
    ]);
  }

  function paint(nodes) {
    clear(root);
    for (const n of nodes) if (n) root.appendChild(n);
  }

  return {
    el: root,
    /** @param {{kind:string}} sel */
    render(sel, next = {}) {
      ctx = { ...ctx, ...next };
      if (!sel) { renderNothing(); return; }
      if (sel.kind === 'element') renderElement(next.sheet ?? ctx.sheet, sel.index);
      else if (sel.kind === 'sheet') renderSheet(next.sheet ?? ctx.sheet);
      else if (sel.kind === 'character') renderCharacter(next.character);
      else renderNothing();
    },
  };
}

function numOrUndef(v) {
  const s = String(v ?? '').trim();
  if (s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}
