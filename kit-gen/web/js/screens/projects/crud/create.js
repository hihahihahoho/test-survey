/**
 * create.js — §4.1 Modal "Tạo project" (4 template) + §4.2 modal "Đổi tên".
 * Ràng buộc thi công:
 *  · slug tự sinh từ tên có dấu, có [Sửa], validate inline (§4.1-1, đóng E2)
 *  · trùng tên hiển thị = CẢNH BÁO, không chặn (§4.1-2)
 *  · 409 PROJECT_ID_TAKEN → lỗi tại ô slug + nút [Dùng gợi ý] (§4.1-3)
 *  · agent chưa chạy → nút Tạo disabled + dải vàng giải thích TRƯỚC khi bấm (§4.1-5, §4.9)
 *  · tạo xong: blank → S3?tab=sheets · còn lại → S2 (§4.1-4)
 */

import { api, errors } from '../../../core/index.js';
import {
  createBanner, createButton, createCheckbox, createInput, createModalFooter, createSegmented,
  createTag, el, openModal, setLoading, toast,
} from '../../../ui/index.js';
import { copyName, duplicateNameWarning, slugify, validateName, validateSlug, variantId } from './slug.js';

/**
 * Nhãn "màu nền tách" — chuỗi HIỂN THỊ do §3-S3.6 quy định.
 * Mã màu ở đây là NỘI DUNG user cần đọc (để đối chiếu với ảnh khi cắt), KHÔNG phải
 * giá trị style: nó không bao giờ vào thuộc tính CSS. Mọi màu của giao diện vẫn
 * lấy từ tokens.css. Lint có ngoại lệ tường minh cho biến này.
 */
export const BG_LABEL = Object.freeze({
  magenta: 'Magenta #FF00FF',
  green: 'Green #00FF00',
});

/** 4 template — nội dung chốt ở §4.1, không để dev tự nghĩ. */
export const TEMPLATES = Object.freeze([
  { id: 'basic', title: 'Kit cơ bản', lines: ['3 sheet · 25 ô', '24 element + 1 nền', '(khuyến nghị)'], icon: '▣' },
  { id: 'blank', title: 'Trống', lines: ['0 sheet', 'tự chọn từ thư viện'], icon: '▢' },
  { id: 'from-project', title: 'Từ project đang có', lines: ['chọn phần muốn copy'], icon: '⧉' },
  { id: 'import', title: 'Nhập file', lines: ['.zip hoặc styles.json cũ'], icon: '⇧' },
]);

/** Ô chọn template: <input type=radio> thật trong <label> (§5.8-A5, đóng I2/I4). */
function templatePicker(onPick, initial = 'basic') {
  const name = 'kg-template';
  const row = el('div', {
    class: 'kg-grid kg-grid--tight', role: 'radiogroup', 'aria-label': 'Bắt đầu từ',
  });
  const inputs = [];
  for (const t of TEMPLATES) {
    const c = createCheckbox({
      type: 'radio', name, value: t.id, label: t.title,
      sublabel: t.lines.join(' · '),
      checked: t.id === initial,
      onChange: () => onPick(t.id),
    });
    c.el.style.border = '1px solid var(--line-default)';
    c.el.style.borderRadius = 'var(--r-2)';
    c.el.style.padding = 'var(--s-3)';
    inputs.push(c);
    row.appendChild(c.el);
  }
  return { el: row, inputs };
}

/**
 * Mở modal tạo project.
 * @param {object} o {existing, readOnly, reason, onCreated(project, template), onNeedImport(), onNeedDuplicate()}
 */
export function openCreateModal(o = {}) {
  const { existing = [], readOnly = false, reason = null, onCreated, onNeedImport, onNeedDuplicate } = o;

  let template = 'basic';
  let slugEdited = false;

  const nameField = createInput({
    label: 'Tên project', required: true, autofocus: true,
    placeholder: 'Tết 2026 — VietinBank iPay',
    attrs: { maxlength: '120', autocomplete: 'off' },
  });
  const slugField = createInput({
    label: 'Tên thư mục (tự đặt từ tên project)', mono: true, size: 'sm',
    hint: 'Công cụ local sẽ thêm 4 ký tự ngẫu nhiên để không bao giờ trùng thư mục.',
    attrs: { autocomplete: 'off', spellcheck: 'false' },
  });
  const slugRow = el('div', { hidden: true }, [slugField.el]);
  const slugPreview = el('p', { class: 'kg-t-caption kg-fg-default' });
  const editSlugBtn = createButton({
    label: 'Sửa', variant: 'link', size: 'sm',
    onClick: () => {
      slugEdited = true;
      slugRow.removeAttribute('hidden');
      editSlugBtn.setAttribute('hidden', '');
      slugField.focus();
    },
  });
  const dupWarn = el('div');

  const variantField = createInput({
    label: 'Tên phong cách đầu tiên', value: 'Phong cách 1',
    hint: 'Cùng bộ element, khác art style / màu brand / nhân vật.',
    attrs: { maxlength: '60' },
  });
  const bgSeg = createSegmented({
    label: 'Màu nền tách',
    // NHÃN HIỂN THỊ do §3-S3.6 quy định (mã màu là nội dung user cần đọc để đối chiếu
    // với ảnh, KHÔNG phải giá trị style — mọi màu của giao diện vẫn lấy từ tokens.css).
    items: [{ value: 'magenta', label: BG_LABEL.magenta }, { value: 'green', label: BG_LABEL.green }],
    value: 'magenta',
  });

  const tags = [];
  const tagRow = el('div', { class: 'kg-row kg-row--tight' });
  const tagInput = createInput({
    label: 'Tag (không bắt buộc)', size: 'sm',
    placeholder: 'tet, banking… Enter để thêm',
    attrs: { autocomplete: 'off' },
  });
  tagInput.input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = tagInput.input.value.trim().replace(/,+$/, '');
    const t = slugify(raw);
    if (t === '') { tagInput.setError('Tag chỉ gồm chữ không dấu, số và gạch ngang.'); return; }
    if (tags.includes(t)) { tagInput.setError(`Đã có tag «${t}».`); return; }
    if (tags.length >= 8) { tagInput.setError('Tối đa 8 tag.'); return; }
    tagInput.setError(null);
    tags.push(t);
    tagInput.input.value = '';
    renderTags();
  });
  function renderTags() {
    tagRow.replaceChildren();
    for (const t of tags) {
      tagRow.appendChild(createTag(t, {
        onRemove: (x) => { tags.splice(tags.indexOf(x), 1); renderTags(); },
      }));
    }
  }

  function syncSlug() {
    const auto = slugify(nameField.value);
    if (!slugEdited) slugField.setValue(auto);
    const s = slugField.value;
    slugPreview.textContent = s === ''
      ? 'Thư mục sẽ được đặt tên sau khi bạn gõ tên project.'
      : `Thư mục sẽ là: projects/${s}-xxxx`;
    const err = slugEdited ? validateSlug(s) : null;
    slugField.setError(err);

    dupWarn.replaceChildren();
    const dup = duplicateNameWarning(nameField.value, existing);
    if (dup) {
      dupWarn.appendChild(createBanner({
        kind: 'warning', title: dup.warn,
        actions: [createButton({
          label: `Dùng «${dup.suggestion}»`, variant: 'ghost', size: 'sm',
          onClick: () => { nameField.setValue(dup.suggestion); syncSlug(); },
        })],
      }));
    }
    return err;
  }
  nameField.input.addEventListener('input', syncSlug);
  slugField.input.addEventListener('input', () => { slugEdited = true; syncSlug(); });

  const picker = templatePicker((id) => {
    template = id;
    firstVariantBox.hidden = id === 'import' || id === 'from-project';
    confirm.querySelector('.kg-btn__label').textContent = labelFor(id);
  });

  const firstVariantBox = el('div', { class: 'kg-stack' }, [variantField.el, bgSeg.el]);

  const offlineBanner = readOnly
    ? createBanner({
        kind: 'warning',
        title: 'Cần công cụ local đang chạy để tạo thư mục project trên máy bạn.',
        actions: [createButton({
          label: 'Xem cách chạy', variant: 'secondary', size: 'sm',
          onClick: () => { m.close(); document.querySelector('.kg-pill')?.click(); },
        })],
      })
    : null;

  const body = el('div', { class: 'kg-stack' }, [
    offlineBanner,
    nameField.el,
    el('div', { class: 'kg-row kg-row--tight' }, [slugPreview, editSlugBtn]),
    slugRow,
    dupWarn,
    el('div', {}, [el('p', { class: 'kg-t-label', text: 'Bắt đầu từ' }), picker.el]),
    firstVariantBox,
    el('div', {}, [tagInput.el, tagRow]),
  ]);

  function labelFor(id) {
    if (id === 'import') return 'Tiếp: chọn nguồn nhập →';
    if (id === 'from-project') return 'Tiếp: chọn project nguồn →';
    return 'Tạo project';
  }

  const cancel = createButton({ label: 'Huỷ', variant: 'secondary', onClick: () => m.close('cancel') });
  const confirm = createButton({
    label: labelFor('basic'), variant: 'primary',
    disabled: readOnly,
    onClick: () => submit(),
  });
  if (readOnly) confirm.title = reason ?? 'Cần công cụ local đang chạy';

  async function submit() {
    const nameErr = validateName(nameField.value);
    nameField.setError(nameErr);
    if (nameErr) { nameField.focus(); return; }
    const slugErr = syncSlug();
    if (slugErr) { slugField.focus(); return; }

    // 2 template chuyển sang luồng riêng (§4.1 bảng template).
    if (template === 'import') { m.close('to-import'); onNeedImport?.({ name: nameField.value.trim(), tags: [...tags] }); return; }
    if (template === 'from-project') { m.close('to-duplicate'); onNeedDuplicate?.(); return; }

    setLoading(confirm, true);
    m.setBusy(true);
    try {
      const payload = {
        name: nameField.value.trim(),
        template,
        firstVariant: {
          id: variantId(variantField.value),
          vi: variantField.value.trim() || 'Phong cách 1',
          bg: bgSeg.value,
        },
        tags: [...tags],
      };
      if (slugEdited) payload.slug = slugField.value;
      const res = await api.projects.create(payload);
      m.close('created');
      const p = res?.project;
      const warns = Array.isArray(res?.warnings) ? res.warnings : [];
      toast.success({
        title: `Đã tạo «${p?.name ?? payload.name}»`,
        description: warns.length > 0 ? `${warns.length} ghi chú khi khởi tạo` : undefined,
      });
      onCreated?.(p, template);
    } catch (e) {
      setLoading(confirm, false);
      m.setBusy(false);
      handleCreateError(e, { slugField, slugRow, editSlugBtn, onUseSuggestion: (s) => { slugEdited = true; slugField.setValue(s); syncSlug(); } });
    }
  }

  const m = openModal({
    title: 'Tạo project', size: 'lg', hasInput: true,
    body, footer: createModalFooter({ cancel, confirm }),
  });
  syncSlug();
  return m;
}

/** 409 PROJECT_ID_TAKEN → lỗi INLINE tại ô slug + nút [Dùng gợi ý] (§4.1-3, §3.9). */
function handleCreateError(e, { slugField, slugRow, editSlugBtn, onUseSuggestion }) {
  const view = errors.present(e);
  if (e?.code === 'PROJECT_ID_TAKEN' || e?.code === 'INVALID_SLUG') {
    slugRow.removeAttribute('hidden');
    editSlugBtn.setAttribute('hidden', '');
    const sug = e?.details?.suggestion;
    slugField.setError(sug ? `${view.title}. Gợi ý: ${sug}` : view.explain);
    slugField.focus();
    if (sug) {
      toast.warning({
        title: view.title,
        description: view.explain,
        actions: [{ label: `Dùng «${sug}»`, variant: 'secondary', onClick: () => onUseSuggestion(sug) }],
      });
    }
    return;
  }
  toast.error({ title: view.title, description: view.explain });
}

/**
 * §4.2 Đổi tên — modal 1 ô. projectId và thư mục KHÔNG đổi (ghi rõ 1 dòng).
 * Slug (tên file zip) đổi ở S2b, không ở đây — để đổi tên là thao tác 2 giây.
 */
export function openRenameModal({ project, existing = [], onRenamed } = {}) {
  const field = createInput({
    label: 'Tên project', value: project.name ?? project.id, required: true, autofocus: true,
    attrs: { maxlength: '120' },
  });
  const dupWarn = el('div');
  field.input.addEventListener('input', () => {
    dupWarn.replaceChildren();
    const dup = duplicateNameWarning(field.value, existing.filter((p) => p.id !== project.id));
    if (dup) dupWarn.appendChild(createBanner({ kind: 'warning', title: dup.warn }));
  });

  const body = el('div', { class: 'kg-stack' }, [
    field.el,
    dupWarn,
    el('p', { class: 'kg-t-caption kg-fg-default', text: `Thư mục trên máy vẫn là ${project.id}. Đổi tên file khi xuất thì vào Cài đặt project.` }),
  ]);

  const cancel = createButton({ label: 'Huỷ', variant: 'secondary', onClick: () => m.close('cancel') });
  const confirm = createButton({
    label: 'Lưu tên', variant: 'primary',
    onClick: async () => {
      const err = validateName(field.value);
      field.setError(err);
      if (err) { field.focus(); return; }
      setLoading(confirm, true);
      m.setBusy(true);
      try {
        const res = await api.projects.update(project.id, { name: field.value.trim() });
        m.close('saved');
        toast.success({ title: `Đã đổi tên thành «${res?.project?.name ?? field.value.trim()}»` });
        onRenamed?.(res?.project);
      } catch (e) {
        setLoading(confirm, false);
        m.setBusy(false);
        const view = errors.present(e);
        field.setError(`${view.title}. ${view.explain}`);
        toast.error({ title: 'Chưa đổi được tên', description: view.explain });
      }
    },
  });

  const m = openModal({
    title: `Đổi tên «${project.name ?? project.id}»`, size: 'md', hasInput: true,
    body, footer: createModalFooter({ cancel, confirm }),
  });
  field.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); confirm.click(); } });
  return m;
}

export { copyName };
