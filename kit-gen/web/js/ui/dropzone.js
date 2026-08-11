/**
 * dropzone.js — primitive Dropzone (§5.6): chọn file bằng bấm HOẶC kéo-thả.
 *
 * GỘP TỪ 3 BẢN TỰ DỰNG (lượt tích hợp):
 *   · `screens/projects/crud/import-wizard.js` (wizard nhập, 1 file .zip/.json)
 *   · `screens/design/styles-tab.js` `createDropzone()` (ảnh ref/brand, nhiều file)
 *   · phần kéo-thả rời rạc trong tab Phong cách
 * Cả 3 đều đúng ý tưởng nhưng lệch nhau về a11y và trạng thái dragover, và 1 bản
 * gán màu/khoảng cách trực tiếp vào `style`. Bản này là NGUỒN DUY NHẤT, CSS ở
 * `web/css/components/field.css` (`.kg-dropzone`).
 *
 * A11y (§5.8): là `<label>` bọc `<input type="file">` THẬT ⇒ bấm được bằng chuột,
 * Tab tới được, Enter/Space mở hộp chọn file, screen reader đọc đúng nhãn (A5).
 * KHÔNG dùng `<div onclick>`. Vùng nhận focus có ring nhờ `:focus-within` (A4).
 */

import { el, icon, uid } from './dom.js';

/**
 * @param {object} o
 * @param {string} o.label            chữ chính, ví dụ 'Chọn file hoặc kéo file vào đây'
 * @param {string} [o.hint]           dòng phụ nhỏ (định dạng, giới hạn cỡ)
 * @param {string} [o.accept]         accept của input (mime/đuôi)
 * @param {boolean} [o.multiple]      cho chọn nhiều file
 * @param {boolean} [o.disabled]      khoá (agent chưa chạy / chế độ chỉ-đọc §2.5)
 * @param {'col'|'row'} [o.layout]    xếp dọc (mặc định) hay ngang
 * @param {(files: File[]) => void} o.onFiles  gọi với mảng File (luôn ≥1)
 * @returns {{el: HTMLElement, input: HTMLInputElement, setDisabled(b:boolean):void,
 *            setError(msg: string|null):void, reset():void}}
 */
export function createDropzone({
  label, hint = null, accept = '', multiple = false, disabled = false,
  layout = 'col', onFiles, id = uid('kg-drop'),
} = {}) {
  if (typeof onFiles !== 'function') throw new Error('kg-dropzone: thiếu onFiles');

  const input = el('input', {
    type: 'file', id, class: 'kg-sr-only',
    accept: accept || null, multiple: multiple ? true : null,
    disabled: disabled ? true : null,
  });
  const errNode = el('div', { class: 'kg-field__error', role: 'status', 'aria-live': 'polite' });
  const zone = el('label', {
    class: `kg-dropzone${layout === 'row' ? ' kg-dropzone--row' : ''}`,
    for: id,
    dataset: { state: 'idle', disabled: disabled ? 'true' : 'false' },
  }, [
    icon('⬆'),
    el('span', { text: label }),
    hint ? el('span', { class: 'kg-dropzone__hint', text: hint }) : null,
    input,
  ]);

  const emit = (list) => {
    const files = [...(list ?? [])];
    if (files.length === 0) return;
    onFiles(multiple ? files : [files[0]]);
  };

  input.addEventListener('change', () => {
    emit(input.files);
    input.value = '';          // chọn lại đúng file vừa chọn vẫn phát sự kiện
  });
  // dragover phải preventDefault ở CẢ dragover lẫn drop, không thì trình duyệt mở file
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!input.disabled) zone.dataset.state = 'dragover';
  });
  zone.addEventListener('dragleave', () => {
    if (zone.dataset.state === 'dragover') zone.dataset.state = 'idle';
  });
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.dataset.state = 'idle';
    if (input.disabled) return;
    emit(e.dataTransfer?.files);
  });

  const api = {
    el: el('div', { class: 'kg-field' }, [zone, errNode]),
    input,
    zone,
    setDisabled(b) {
      input.disabled = !!b;
      zone.dataset.disabled = b ? 'true' : 'false';
      return api;
    },
    setError(msg) {
      while (errNode.firstChild) errNode.removeChild(errNode.firstChild);
      zone.dataset.state = msg ? 'error' : 'idle';
      if (msg) errNode.append(icon('⛔'), el('span', { text: msg }));
      return api;
    },
    reset() { input.value = ''; return api.setError(null); },
  };
  return api;
}
