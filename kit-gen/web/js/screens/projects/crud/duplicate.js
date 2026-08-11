/**
 * duplicate.js — §4.3 Nhân bản CÓ CHỌN LỌC. Đây là use case chính của tool
 * (audit §3.1: "cùng bộ element, thử 5 hướng art style") nên phải làm tốt nhất.
 *
 * Bắt buộc theo spec:
 *  · Bản thiết kế LUÔN copy (checkbox khoá, ghi "luôn copy")
 *  · Mặc định: contract + refs; KHÔNG copy raw/kits (nhẹ, nhanh)
 *  · 3 lựa chọn phong cách sau khi nhân bản (giữ / chỉ 1 / xoá hết + tạo mới)
 *  · Ước lượng dung lượng tính từ stats THẬT, không bịa
 *  · Xong → mở project mới ở S3?tab=styles + toast có nút [Về project cũ]
 */

import { api, errors } from '../../../core/index.js';
import {
  createButton, createCheckbox, createInput, createModalFooter, createSelect,
  el, openModal, setLoading, toast,
} from '../../../ui/index.js';
import { bytes, count } from '../../shared/format.js';
import { copyName, variantId } from './slug.js';

/** Ước lượng byte của từng phần — chỉ dùng số có thật trong `stats`. */
function estimate(project) {
  const s = project.stats ?? {};
  const disk = Number(s.diskBytes ?? 0);
  const raw = Number(s.rawPresent ?? 0);
  const kits = Number(s.kitsCut ?? 0);
  // Không có phân rã theo thư mục trong #7/#9 ⇒ chỉ nêu SỐ FILE (chắc chắn đúng)
  // và tổng dung lượng project; không chia tỉ lệ bịa cho từng phần.
  return { disk, raw, kits };
}

export function openDuplicateModal({ project, existing = [], readOnly = false, reason = null, onDone } = {}) {
  const est = estimate(project);
  const s = project.stats ?? {};
  const variants = Array.isArray(project?.contractVariants) ? project.contractVariants : null;

  const nameField = createInput({
    label: 'Tên project mới', required: true, autofocus: true,
    value: copyName(project.name ?? project.id, existing),
    attrs: { maxlength: '120' },
  });

  const incContract = createCheckbox({
    label: `Bản thiết kế (${count(s.sheets ?? 0, 'sheet')} · ${count(s.components ?? 0, 'element')} · ${count(s.variants ?? 0, 'phong cách')})`,
    sublabel: 'luôn copy', checked: true, disabled: true,
  });
  const incRefs = createCheckbox({ label: 'Ảnh tham khảo', sublabel: 'thường cần, dung lượng nhỏ', checked: true });
  const incRaw = createCheckbox({
    label: `Ảnh AI đã sinh (${count(est.raw, 'lượt có ảnh')})`,
    sublabel: 'giữ lại thì không phải sinh lại — không tốn quota', checked: false,
  });
  const incKits = createCheckbox({
    label: `Kit đã cắt (${count(est.kits, 'file')})`,
    sublabel: 'cắt lại được, thường không cần', checked: false,
  });
  const incRuns = createCheckbox({ label: 'Lịch sử lượt chạy', sublabel: 'chỉ để tra cứu', checked: false });

  /* 3 lựa chọn phong cách — radio thật (§5.8-A5). */
  const modeName = 'kg-dup-variants';
  const keepAll = createCheckbox({ type: 'radio', name: modeName, label: 'Giữ nguyên phong cách rồi tự sửa', checked: true, onChange: sync });
  const keepOne = createCheckbox({ type: 'radio', name: modeName, label: 'Chỉ giữ 1 phong cách', onChange: sync });
  const dropAll = createCheckbox({ type: 'radio', name: modeName, label: 'Xoá hết phong cách, tạo phong cách mới', onChange: sync });

  const oneSelect = createSelect({
    label: 'Phong cách giữ lại', size: 'sm',
    options: variants
      ? variants.map((v) => ({ value: v.id, label: v.vi ?? v.id }))
      // Không có danh sách phong cách trong #7 ⇒ để user nhập id, và ta hiện rõ điều đó.
      : [{ value: '', label: '— chưa đọc được danh sách phong cách —' }],
  });
  const oneIdField = createInput({
    label: 'Mã phong cách giữ lại', size: 'sm', mono: true,
    hint: 'Mở project để xem đúng mã nếu bạn không nhớ.',
  });
  const newVariantField = createInput({
    label: 'Tên phong cách mới', size: 'sm', value: 'Phong cách mới',
  });

  const summary = el('p', { class: 'kg-t-body' });

  function sync() {
    oneSelect.el.hidden = !keepOne.checked || !variants;
    oneIdField.el.hidden = !keepOne.checked || Boolean(variants);
    newVariantField.el.hidden = !dropAll.checked;
    const parts = ['Bản thiết kế'];
    if (incRefs.checked) parts.push('ảnh tham khảo');
    if (incRaw.checked) parts.push(`${est.raw} ảnh AI`);
    if (incKits.checked) parts.push(`${est.kits} file kit`);
    if (incRuns.checked) parts.push('lịch sử lượt chạy');
    const heavy = incRaw.checked || incKits.checked || incRuns.checked;
    summary.textContent = heavy
      ? `Sẽ copy: ${parts.join(', ')}. Project gốc đang chiếm ${bytes(est.disk)} — bản sao có thể gần bằng.`
      : `Sẽ copy: ${parts.join(', ')}. Rất nhẹ, thường xong trong vài giây.`;
  }
  for (const c of [incRefs, incRaw, incKits, incRuns]) c.input.addEventListener('change', sync);

  const body = el('div', { class: 'kg-stack' }, [
    nameField.el,
    el('div', {}, [
      el('p', { class: 'kg-t-label', text: 'Copy những gì?' }),
      el('div', {}, [incContract.el, incRefs.el, incRaw.el, incKits.el, incRuns.el]),
    ]),
    el('div', {}, [
      el('p', { class: 'kg-t-label', text: 'Sau khi nhân bản, tôi muốn' }),
      el('div', {}, [keepAll.el, keepOne.el, oneSelect.el, oneIdField.el, dropAll.el, newVariantField.el]),
    ]),
    summary,
    el('p', { class: 'kg-t-caption kg-fg-default', text: 'Ảnh tham khảo được copy vào thư mục của project mới nên hai project không đè lên nhau.' }),
  ]);

  const cancel = createButton({ label: 'Huỷ', variant: 'secondary', onClick: () => m.close('cancel') });
  const confirm = createButton({
    label: 'Nhân bản', variant: 'primary', disabled: readOnly,
    onClick: async () => {
      const name = nameField.value.trim();
      if (name === '') { nameField.setError('Nhập tên cho bản sao.'); nameField.focus(); return; }
      const include = ['contract'];
      if (incRefs.checked) include.push('refs');
      if (incRaw.checked) include.push('raw');
      if (incKits.checked) include.push('kits');
      if (incRuns.checked) include.push('runs');

      let variantsArg = 'all';
      let newVariant;
      if (keepOne.checked) {
        const id = variants ? oneSelect.value : oneIdField.value.trim();
        if (!id) {
          const f = variants ? oneSelect : oneIdField;
          f.setError('Chọn hoặc nhập mã phong cách muốn giữ.');
          f.focus();
          return;
        }
        variantsArg = [id];
      } else if (dropAll.checked) {
        variantsArg = 'none';
        const vi = newVariantField.value.trim();
        if (vi === '') { newVariantField.setError('Nhập tên phong cách mới.'); newVariantField.focus(); return; }
        newVariant = { vi, id: variantId(vi) };
      }

      setLoading(confirm, true);
      m.setBusy(true);
      try {
        const res = await api.projects.duplicate(project.id, {
          name, include, variants: variantsArg, ...(newVariant ? { newVariant } : {}),
        });
        m.close('done');
        const np = res?.project;
        const copied = res?.copied ?? {};
        toast.success({
          title: `Đã nhân bản → «${np?.name ?? name}»`,
          description: `${count(copied.files ?? 0, 'file')} · ${bytes(copied.bytes ?? 0)}`,
          actions: [{ label: 'Về project cũ', variant: 'secondary', onClick: () => onDone?.(project, { back: true }) }],
        });
        onDone?.(np, { back: false });
      } catch (e) {
        setLoading(confirm, false);
        m.setBusy(false);
        const view = errors.present(e);
        // §5.5: toast không được là nơi DUY NHẤT báo lỗi → hiện inline ngay trong modal.
        nameField.setError(`${view.title}. ${view.explain}`);
        toast.error({ title: view.title, description: view.explain });
      }
    },
  });
  if (readOnly) confirm.title = reason ?? 'Cần công cụ local đang chạy';

  const m = openModal({
    title: `Nhân bản «${project.name ?? project.id}»`, size: 'lg', hasInput: true,
    body, footer: createModalFooter({ cancel, confirm }),
  });
  sync();
  return m;
}
