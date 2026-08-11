/**
 * tag-many.js — thêm tag cho nhiều project (thanh hành động nổi ở view list, §3-S1).
 * Mỗi project là 1 lần PATCH #10 (mỗi thao tác = 1 API call atomic, §4 nguyên tắc chung).
 * Không xoá tag cũ — chỉ THÊM, để thao tác gộp không bao giờ mất dữ liệu.
 */

import { api, errors } from '../../core/index.js';
import { createButton, createInput, createModalFooter, createTag, el, openModal, setLoading, toast } from '../../ui/index.js';
import { slugify } from './crud/slug.js';

export function openTagModal({ projects = [], onDone } = {}) {
  const tags = [];
  const row = el('div', { class: 'kg-row kg-row--tight' });
  const field = createInput({
    label: 'Tag muốn thêm', autofocus: true,
    placeholder: 'tet, banking… Enter để thêm',
    hint: 'Chỉ THÊM tag, không xoá tag đang có.',
  });
  field.input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const t = slugify(field.input.value);
    if (t === '') { field.setError('Tag chỉ gồm chữ không dấu, số và gạch ngang.'); return; }
    if (tags.includes(t)) { field.setError(`Đã chọn tag «${t}».`); return; }
    field.setError(null);
    tags.push(t);
    field.input.value = '';
    render();
  });
  function render() {
    row.replaceChildren();
    for (const t of tags) {
      row.appendChild(createTag(t, { onRemove: (x) => { tags.splice(tags.indexOf(x), 1); render(); } }));
    }
  }

  const body = el('div', { class: 'kg-stack' }, [
    el('p', { class: 'kg-t-body', text: `Sẽ thêm tag cho ${projects.length} project đã chọn.` }),
    field.el, row,
  ]);

  const cancel = createButton({ label: 'Huỷ', variant: 'secondary', onClick: () => m.close('cancel') });
  const confirm = createButton({
    label: 'Thêm tag', variant: 'primary',
    onClick: async () => {
      if (tags.length === 0) { field.setError('Nhập ít nhất 1 tag rồi bấm Enter.'); field.focus(); return; }
      setLoading(confirm, true);
      m.setBusy(true);
      let ok = 0;
      const failed = [];
      for (const p of projects) {
        const next = [...new Set([...(p.tags ?? []), ...tags])];
        try { await api.projects.update(p.id, { tags: next }); ok += 1; }
        catch (e) { failed.push({ p, e }); }
      }
      m.close('done');
      if (ok > 0) toast.success({ title: `Đã thêm tag cho ${ok} project` });
      for (const f of failed) {
        const v = errors.present(f.e);
        toast.error({ title: `Chưa gắn được tag cho «${f.p.name ?? f.p.id}»`, description: v.explain });
      }
      onDone?.();
    },
  });

  const m = openModal({
    title: 'Thêm tag', size: 'md', hasInput: true,
    body, footer: createModalFooter({ cancel, confirm }),
  });
  return m;
}
