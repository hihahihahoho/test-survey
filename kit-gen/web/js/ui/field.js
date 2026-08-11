/**
 * field.js — input / select / textarea + checkbox/radio + SegmentedControl + CodeBlock.
 * §5.8-I4/A5: MỌI control có <label for> thật, không dùng title làm nhãn.
 * Lỗi nối qua aria-describedby + aria-invalid (§3-S3.4 validate inline).
 *
 * API chung cho input/select/textarea:
 *   const f = createInput({ label, value, hint, error, required, ... })
 *   f.el       // wrapper .kg-field (đem đi append)
 *   f.input    // control thật (đọc .value)
 *   f.setError(msg|null)   f.setValue(v)   f.setDisabled(b)   f.focus()
 */
import { el, uid, icon as iconEl, cx, append } from './dom.js';
import { createButton } from './button.js';

function buildField(kind, opts) {
  const {
    label, value = '', hint = null, error = null, required = false, disabled = false,
    placeholder = null, name = null, id = uid(`kg-${kind}`), mono = false, size = 'md',
    rows = 3, options = [], attrs = {}, onInput = null, onChange = null, autofocus = false,
  } = opts;
  if (!label) throw new Error(`kg-${kind}: thiếu label — §5.8-I4 cấm control không nhãn`);

  const hintId = hint ? `${id}-hint` : null;
  const errId = `${id}-err`;

  let input;
  if (kind === 'select') {
    input = el('select', { id, name: name || id, class: cx('kg-select', size === 'sm' && 'kg-select--sm'), ...attrs });
    for (const o of options) {
      const o2 = typeof o === 'string' ? { value: o, label: o } : o;
      input.appendChild(el('option', { value: o2.value, selected: o2.value === value ? true : null, text: o2.label }));
    }
  } else if (kind === 'textarea') {
    input = el('textarea', { id, name: name || id, rows, class: cx('kg-textarea', mono && 'kg-input--mono'), placeholder, ...attrs });
    input.value = value;
  } else {
    input = el('input', {
      id, name: name || id, type: opts.type || 'text',
      class: cx('kg-input', size === 'sm' && 'kg-input--sm', mono && 'kg-input--mono'),
      placeholder, ...attrs,
    });
    input.value = value;
  }
  if (required) input.required = true;
  if (disabled) input.disabled = true;
  if (autofocus) input.setAttribute('data-autofocus', '');
  if (onInput) input.addEventListener('input', onInput);
  if (onChange) input.addEventListener('change', onChange);

  const labelNode = el('label', { class: 'kg-field__label', for: id }, [
    el('span', { text: label }),
    required ? el('span', { class: 'kg-field__req', 'aria-hidden': 'true', text: '*' }) : null,
    required ? el('span', { class: 'kg-sr-only', text: '(bắt buộc)' }) : null,
  ]);

  const hintNode = hint ? el('div', { class: 'kg-field__hint', id: hintId, text: hint }) : null;
  // vùng lỗi: aria-live để đọc ngay khi validate chạy (§5.8-A8)
  const errNode = el('div', { class: 'kg-field__error', id: errId, role: 'status', 'aria-live': 'polite' });

  const wrap = el('div', { class: 'kg-field' }, [labelNode, hintNode, input, errNode]);

  const api = {
    el: wrap, input, labelNode,
    get value() { return input.value; },
    setValue(v) { input.value = v; return api; },
    setDisabled(b) { input.disabled = !!b; return api; },
    focus() { input.focus(); return api; },
    /** Hiện/ẩn lỗi inline (đỏ, ngay dưới field) + cập nhật aria. */
    setError(msg) {
      while (errNode.firstChild) errNode.removeChild(errNode.firstChild);
      if (msg) {
        append(errNode, [iconEl('⛔'), el('span', { text: msg })]);
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', [hintId, errId].filter(Boolean).join(' '));
      } else {
        input.removeAttribute('aria-invalid');
        if (hintId) input.setAttribute('aria-describedby', hintId);
        else input.removeAttribute('aria-describedby');
      }
      return api;
    },
  };
  api.setError(error);
  return api;
}

export const createInput = (opts) => buildField('input', opts);
export const createSelect = (opts) => buildField('select', opts);
export const createTextarea = (opts) => buildField('textarea', opts);

/** Checkbox/radio: <label> bọc control thật (§5.8-A5, đóng I4). */
export function createCheckbox({ label, checked = false, disabled = false, sublabel = null, name = null, value = null, type = 'checkbox', onChange = null, id = uid('kg-chk') } = {}) {
  if (!label) throw new Error('kg-check: thiếu label');
  const input = el('input', { type, id, name, value, disabled: disabled ? true : null });
  // đặt PROPERTY, không chỉ attribute: attribute `checked` chỉ là giá trị mặc
  // định, property mới là trạng thái thật khi đọc `.checked`
  input.checked = !!checked;
  if (onChange) input.addEventListener('change', onChange);
  const wrap = el('label', { class: cx('kg-check', disabled && 'kg-check--disabled'), for: id }, [
    input,
    el('span', {}, [
      el('span', { text: label }),
      sublabel ? el('span', { class: 'kg-check__sub', text: sublabel }) : null,
    ]),
  ]);
  return { el: wrap, input, get checked() { return input.checked; }, setChecked(b) { input.checked = !!b; } };
}

/**
 * SegmentedControl (§5.6) — role=radiogroup, mũi tên di chuyển.
 * `note` = dòng ⓘ khi nhánh KHÔNG chọn vẫn có dữ liệu (bắt buộc, đóng C3).
 */
export function createSegmented({ label, items = [], value = null, note = null, onChange = null } = {}) {
  if (!label) throw new Error('kg-seg: thiếu label cho radiogroup');
  const group = el('div', { class: 'kg-seg', role: 'radiogroup', 'aria-label': label });
  let cur = value ?? (items[0] && items[0].value);

  const buttons = items.map((it) => {
    const b = el('button', {
      type: 'button', class: 'kg-seg__item', role: 'radio',
      'aria-checked': it.value === cur ? 'true' : 'false',
      tabindex: it.value === cur ? '0' : '-1',
      dataset: { value: it.value },
    }, [it.icon ? iconEl(it.icon) : null, el('span', { text: it.label })]);
    b.addEventListener('click', () => select(it.value));
    return b;
  });
  append(group, buttons);

  function select(v) {
    cur = v;
    buttons.forEach((b) => {
      const on = b.dataset.value === v;
      b.setAttribute('aria-checked', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });
    if (onChange) onChange(v);
  }
  // bàn phím: ←→↑↓ chuyển lựa chọn (mẫu radiogroup của WAI-ARIA)
  group.addEventListener('keydown', (e) => {
    const idx = buttons.findIndex((b) => b.dataset.value === cur);
    let next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % buttons.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + buttons.length) % buttons.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = buttons.length - 1;
    if (next === null) return;
    e.preventDefault();
    select(buttons[next].dataset.value);
    buttons[next].focus();
  });

  const wrap = el('div', { class: 'kg-field' }, [
    el('span', { class: 'kg-field__label', text: label }),
    group,
    note ? el('div', { class: 'kg-seg-note' }, [iconEl('ⓘ'), el('span', { text: note })]) : null,
  ]);
  return { el: wrap, group, get value() { return cur; }, setValue: select };
}

/**
 * CodeBlock (§5.6) — mono 13px, nút [Copy] góc phải, tabindex=0, ⌘C khi focus.
 * Copy xong đổi thành "✓ Đã copy" 2s (§3-S0).
 */
export function createCodeBlock({ code = '', ariaLabel = 'Khối lệnh' } = {}) {
  const pre = el('pre', { class: 'kg-code__pre', text: code });
  const btn = createButton({
    label: 'Copy', variant: 'ghost', size: 'sm', icon: '⧉',
    attrs: { class: 'kg-btn kg-btn--ghost kg-btn--sm kg-code__copy' },
    onClick: () => copy(),
  });
  const wrap = el('div', {
    class: 'kg-code', role: 'group', 'aria-label': ariaLabel, tabindex: '0',
  }, [pre, btn]);

  let timer = null;
  async function copy() {
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code); ok = true;
      }
    } catch { ok = false; }
    if (!ok) {
      // fallback: chọn nội dung để user tự ⌘C — KHÔNG im lặng (§3.9 điều cấm 3)
      const sel = getSelection();
      const range = document.createRange();
      range.selectNodeContents(pre);
      sel.removeAllRanges(); sel.addRange(range);
    }
    const lbl = btn.querySelector('.kg-btn__label');
    if (lbl) {
      lbl.textContent = ok ? '✓ Đã copy' : 'Đã chọn — bấm ⌘C';
      clearTimeout(timer);
      timer = setTimeout(() => { lbl.textContent = 'Copy'; }, 2000);
    }
  }
  wrap.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'c' && document.activeElement === wrap) copy();
  });
  return { el: wrap, copy };
}
