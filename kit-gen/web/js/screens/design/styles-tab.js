/**
 * design/styles-tab.js — TAB "PHONG CÁCH" (§3-S3.5): art style · brand · nhân vật · ảnh ref.
 *
 * Đóng C3 (SegmentedControl không được giấu dữ liệu im lặng): nhánh KHÔNG chọn mà vẫn có
 * dữ liệu thì phải có dòng `ⓘ … đang KHÔNG được dùng` + [Xem] — làm bằng `note` của
 * createSegmented (design system đã hỗ trợ đúng luật này).
 */

import {
  attachMenu, createBadge, createButton, createCheckbox, createDropzone, createInput,
  createSegmented, createTextarea, createEmptyState, el, clear, icon as iconEl,
} from '../../ui/index.js';
import { issuesFor } from './validate.js';
import { readOnlyReason } from '../shared/read-only.js';

/**
 * @param {{ onPatchVariant:Function, onAddVariant:Function, onDuplicateVariant:Function,
 *   onRemoveVariant:Function, onToggleCharacter:Function, onUploadRef:Function,
 *   onRemoveRef:Function, refUrl:Function, jobCountFor:Function }} h
 */
export function createStylesTab(h = {}) {
  const root = el('div', { class: 'd-styles' });
  let ctx = { contract: null, readOnly: false, validation: null, refs: [] };

  const dis = () => ctx.readOnly;
  const reason = readOnlyReason();

  function render(next = {}) {
    ctx = { ...ctx, ...next };
    clear(root);
    const variants = ctx.contract?.variants ?? [];

    root.appendChild(el('div', { class: 'kg-row' }, [
      el('h2', { class: 'kg-t-title', text: `Phong cách ${variants.length}` }),
      el('span', { style: { marginLeft: 'auto' } }),
      createButton({
        label: 'Thêm phong cách', variant: 'secondary', size: 'sm', icon: '＋',
        disabled: dis(), tooltip: dis() ? reason : null,
        onClick: () => h.onAddVariant(),
      }),
    ]));

    if (variants.length === 0) {
      root.appendChild(createEmptyState({
        icon: '◐', title: 'Chưa có phong cách nào',
        description: 'Mỗi phong cách dùng chung bộ element nhưng khác art style, màu brand và nhân vật.',
        primary: createButton({
          label: 'Thêm phong cách đầu tiên', variant: 'primary', size: 'lg',
          disabled: dis(), tooltip: dis() ? reason : null, onClick: () => h.onAddVariant(),
        }),
      }));
      return root;
    }

    for (const v of variants) root.appendChild(variantCard(v));
    return root;
  }

  function variantCard(v) {
    const t = (field) => ({ kind: 'variant', variantId: v.id, field });
    const card = el('section', { class: 'd-variant', 'aria-label': `Phong cách ${v.vi || v.id}` });
    const color = typeof v.brand?.primary === 'string' && /^#[0-9a-f]{3,8}$/i.test(v.brand.primary) ? v.brand.primary : null;

    const more = createButton({
      variant: 'ghost', size: 'sm', icon: '⋯', iconOnly: true,
      ariaLabel: `Thao tác với phong cách ${v.vi || v.id}`, tooltip: 'Thao tác (Shift+F10)',
    });
    attachMenu(more, () => [
      { label: 'Nhân bản phong cách', icon: '⧉', disabled: dis(), disabledReason: reason, onSelect: () => h.onDuplicateVariant(v.id) },
      'separator',
      { label: 'Xoá phong cách…', icon: '🗑', danger: true, disabled: dis(), disabledReason: reason, onSelect: () => h.onRemoveVariant(v.id) },
    ]);

    card.appendChild(el('header', { class: 'd-variant__head' }, [
      el('span', { class: 'd-tree__swatch', 'aria-hidden': 'true', style: color ? { background: color } : null }),
      el('h3', { class: 'd-variant__title', text: `${v.vi || v.id}` }),
      el('span', { class: 'kg-t-mono kg-fg-default', text: `(${v.id})` }),
      el('span', { style: { marginLeft: 'auto' } }),
      createBadge({
        state: 'neutral', iconGlyph: '⚡',
        text: `${h.jobCountFor ? h.jobCountFor(v.id) : 0} lượt`,
        long: 'Số lượt sinh ảnh của phong cách này',
      }),
      more,
    ]));

    const body = el('div', { class: 'd-variant__body' });

    /* --- tên + id --- */
    const fVi = createInput({
      label: 'Tên hiển thị', value: v.vi ?? '', disabled: dis(),
      onChange: (e) => h.onPatchVariant(v.id, { vi: e.target.value }, `Đổi tên phong cách «${v.id}»`),
    });
    const fId = createInput({
      label: 'Mã (dùng trong tên file ảnh)', value: v.id ?? '', mono: true, disabled: dis(),
      hint: 'Chỉ chữ thường, số, gạch nối. Đổi mã sẽ làm ảnh đã sinh thành mồ côi.',
      onChange: (e) => h.onPatchVariant(v.id, { id: e.target.value.trim() }, `Đổi mã phong cách «${v.id}»`),
    });
    applyIssue(fId, t('id'));
    body.appendChild(el('div', { class: 'd-props__row' }, [fVi.el, fId.el]));

    /* --- nguồn art style: gõ mô tả / dùng ảnh (đóng C3) --- */
    const inspoRefs = Array.isArray(v.inspo) ? v.inspo : [];
    const styleMode = String(v.styleMode ?? 'prompt');
    const styleSeg = createSegmented({
      label: 'Nguồn art style',
      value: styleMode === 'inspo' ? 'inspo' : 'prompt',
      items: [{ value: 'prompt', label: 'Gõ mô tả' }, { value: 'inspo', label: 'Dùng ảnh tham khảo' }],
      note: styleMode !== 'inspo' && inspoRefs.length > 0
        ? `${inspoRefs.length} ảnh tham khảo bạn đã tải đang KHÔNG được dùng (vì đang chọn "Gõ mô tả").`
        : (styleMode === 'inspo' && String(v.style ?? '').trim() !== ''
          ? 'Mô tả art style bạn đã gõ đang KHÔNG được dùng (vì đang chọn "Dùng ảnh tham khảo").'
          : null),
      onChange: (val) => h.onPatchVariant(v.id, { styleMode: val }, `Đổi nguồn art style của «${v.id}»`),
    });
    body.appendChild(styleSeg.el);

    const fStyle = createTextarea({
      label: 'Mô tả art style', value: v.style ?? '', rows: 4, disabled: dis(),
      hint: 'Tiếng Anh, mô tả chất liệu / bảng màu / độ bóng. Áp cho mọi element của phong cách này.',
      onChange: (e) => h.onPatchVariant(v.id, { style: e.target.value }, `Sửa art style của «${v.id}»`),
    });
    body.appendChild(fStyle.el);
    body.appendChild(refSection(v, 'inspo', 'Ảnh tham khảo art style', inspoRefs));

    /* --- màu brand --- */
    const brand = v.brand ?? {};
    const brandRefs = Array.isArray(brand.refs) ? brand.refs : [];
    const brandMode = String(brand.mode ?? 'colors');
    const brandSeg = createSegmented({
      label: 'Màu brand',
      value: brandMode === 'image' ? 'image' : 'colors',
      items: [{ value: 'colors', label: 'Chọn màu' }, { value: 'image', label: 'Dùng ảnh brand' }],
      note: brandMode !== 'image' && brandRefs.length > 0
        ? `${brandRefs.length} ảnh brand bạn đã tải đang KHÔNG được dùng (vì đang chọn "Chọn màu").`
        : (brandMode === 'image' && (brand.primary || brand.secondary)
          ? 'Cặp màu bạn đã chọn đang KHÔNG được dùng (vì đang chọn "Dùng ảnh brand").'
          : null),
      onChange: (val) => h.onPatchVariant(v.id, { brand: { mode: val } }, `Đổi nguồn màu brand của «${v.id}»`),
    });
    body.appendChild(brandSeg.el);

    const fP = createInput({
      label: 'Màu chính', value: brand.primary ?? '', mono: true, disabled: dis(), size: 'sm',
      attrs: { placeholder: '#d42a1e' },
      onChange: (e) => h.onPatchVariant(v.id, { brand: { primary: e.target.value.trim() } }, `Đổi màu chính của «${v.id}»`),
    });
    const fS = createInput({
      label: 'Màu phụ', value: brand.secondary ?? '', mono: true, disabled: dis(), size: 'sm',
      attrs: { placeholder: '#f5c64a' },
      onChange: (e) => h.onPatchVariant(v.id, { brand: { secondary: e.target.value.trim() } }, `Đổi màu phụ của «${v.id}»`),
    });
    const preview = el('span', {
      class: 'd-swatch-preview', role: 'img',
      'aria-label': `Xem thử cặp màu: chính ${brand.primary || 'chưa đặt'}, phụ ${brand.secondary || 'chưa đặt'}`,
      style: {
        background: `linear-gradient(90deg, ${safeColor(brand.primary)} 0 50%, ${safeColor(brand.secondary)} 50% 100%)`,
      },
    });
    body.appendChild(el('div', { class: 'd-colorrow' }, [fP.el, fS.el, preview]));
    body.appendChild(refSection(v, 'brand', 'Ảnh brand', brandRefs));

    /* --- màu nền tách (chroma key) --- */
    const bgSeg = createSegmented({
      label: 'Màu nền tách',
      value: /green|00ff00/i.test(String(v.bg ?? '')) ? 'green' : 'magenta',
      items: [{ value: 'magenta', label: 'Magenta #FF00FF' }, { value: 'green', label: 'Green #00FF00' }],
      onChange: (val) => h.onPatchVariant(v.id, {
        bg: val === 'green' ? 'pure vivid green #00FF00' : 'pure vivid magenta #FF00FF',
      }, `Đổi màu nền tách của «${v.id}»`),
    });
    body.appendChild(bgSeg.el);

    /* --- nhân vật trong phong cách này --- */
    const chars = allCharacterIds();
    const mine = new Set((v.characters ?? []).map((c) => c.id));
    body.appendChild(el('div', {}, [
      el('span', { class: 'd-props__kind', text: 'Nhân vật trong phong cách này' }),
      chars.length === 0
        ? el('p', { class: 'd-tree__empty', text: 'Chưa có nhân vật nào trong project.' })
        : el('div', { class: 'd-checks' }, chars.map((c) => createCheckbox({
            label: c.vi || c.id, checked: mine.has(c.id), disabled: dis(),
            onChange: (e) => h.onToggleCharacter(v.id, c.id, e.target.checked),
          }).el)),
    ]));

    card.appendChild(body);
    return card;
  }

  function refSection(v, kind, title, list) {
    const wrap = el('div', {}, [
      el('span', { class: 'd-props__kind', text: title }),
    ]);
    if (list.length > 0) {
      wrap.appendChild(el('div', { class: 'd-reflist' }, list.map((p) => {
        const url = h.refUrl ? h.refUrl(p) : null;
        const meta = (ctx.refs ?? []).find((r) => p.endsWith(r.name));
        return el('div', { class: 'd-refcard' }, [
          url ? el('img', { class: 'd-refcard__img kg-checker', src: url, alt: `Ảnh ${title.toLowerCase()}: ${baseName(p)}`, loading: 'lazy' })
              : el('div', { class: 'd-refcard__img kg-checker', role: 'img', 'aria-label': 'Ảnh nằm trên máy bạn' }),
          el('div', { class: 'd-refcard__foot' }, [
            el('span', { class: 'kg-t-caption kg-truncate', text: baseName(p) }),
            meta ? el('span', { class: 'kg-t-caption kg-fg-muted-raised', text: `${meta.w ?? '?'}×${meta.h ?? '?'}` }) : null,
            createButton({
              label: 'Bỏ ảnh', variant: 'ghost', size: 'sm', icon: '✕',
              disabled: dis(), tooltip: dis() ? reason : null,
              onClick: () => h.onRemoveRef(v.id, kind, p),
            }),
          ]),
        ]);
      })));
    }
    wrap.appendChild(createDropzone({
      label: 'Kéo ảnh vào đây hoặc chọn file',
      hint: 'PNG/JPG/WebP, ≤20 MB',
      accept: 'image/png,image/jpeg,image/webp',
      multiple: true,
      disabled: dis(),
      onFiles: (files) => h.onUploadRef(v.id, kind, files),
    }).el);
    return wrap;
  }

  function allCharacterIds() {
    const out = new Map();
    for (const v of ctx.contract?.variants ?? []) {
      for (const c of v.characters ?? []) if (!out.has(c.id)) out.set(c.id, c);
    }
    return [...out.values()];
  }

  function applyIssue(field, target) {
    const list = issuesFor(ctx.validation, target);
    const err = list.find((x) => (ctx.validation?.errors ?? []).includes(x));
    field.setError(err ? err.message : null);
  }

  return { el: root, render };
}

function safeColor(c) {
  return typeof c === 'string' && /^#[0-9a-f]{3,8}$/i.test(c) ? c : 'var(--bg-raised)';
}
function baseName(p) {
  const s = String(p ?? '');
  const i = s.lastIndexOf('/');
  return i === -1 ? s : s.slice(i + 1);
}
