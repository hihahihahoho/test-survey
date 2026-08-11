/**
 * button.js — §5.4: 5 biến thể (primary/secondary/ghost/danger/link) × 3 cỡ (sm/md/lg).
 * KHÔNG có biến thể thứ 6. Mỗi màn tối đa 1 primary, tối đa 1 danger.
 *
 * API:
 *   createButton({ label, variant, size, icon, iconOnly, tooltip, onClick,
 *                  disabled, loading, type, ariaLabel, attrs })  -> HTMLButtonElement
 *   setLoading(btn, bool)   // giữ nguyên chiều rộng + chữ (§5.4)
 *   setDisabled(btn, bool, reasonTooltip)
 *
 * Ràng buộc a11y: icon-only BẮT BUỘC có ariaLabel; nếu thiếu → throw ở dev.
 */
import { el, icon as iconEl, cx, uid } from './dom.js';
import { attachTooltip } from './tooltip.js';

const VARIANTS = new Set(['primary', 'secondary', 'ghost', 'danger', 'link']);
const SIZES = new Set(['sm', 'md', 'lg']);

export function createButton(opts = {}) {
  const {
    label = '', variant = 'secondary', size = 'md', icon = null, iconOnly = false,
    tooltip = null, onClick = null, disabled = false, loading = false,
    type = 'button', ariaLabel = null, attrs = {},
  } = opts;

  if (!VARIANTS.has(variant)) throw new Error(`kg-btn: variant lạ "${variant}" (§5.4 chỉ có 5)`);
  if (!SIZES.has(size)) throw new Error(`kg-btn: size lạ "${size}" (§5.4 chỉ có sm/md/lg)`);
  if (iconOnly && !(ariaLabel || tooltip)) {
    throw new Error('kg-btn: nút icon-only phải có ariaLabel (§5.4 + §5.8-A9)');
  }

  const btn = el('button', {
    type,
    class: cx('kg-btn', `kg-btn--${variant}`, `kg-btn--${size}`, iconOnly && 'kg-btn--icon'),
    'aria-label': ariaLabel || (iconOnly ? tooltip : null),
    ...attrs,
  });

  if (icon) btn.appendChild(el('span', { class: 'kg-btn__icon', 'aria-hidden': 'true' }, [iconEl(icon)]));
  if (!iconOnly && label) btn.appendChild(el('span', { class: 'kg-btn__label', text: label }));

  if (onClick) btn.addEventListener('click', onClick);
  if (disabled) setDisabled(btn, true);
  if (loading) setLoading(btn, true);
  // Icon-only PHẢI có tooltip nữa (§5.4). Tooltip cũng hiện khi focus bàn phím.
  if (tooltip) attachTooltip(btn, tooltip);

  return btn;
}

/** loading: spinner 14px thay icon, chữ giữ nguyên, chiều rộng không đổi (§5.4). */
export function setLoading(btn, isLoading) {
  const already = btn.querySelector('.kg-btn__spinner');
  if (isLoading) {
    btn.dataset.loading = 'true';
    btn.setAttribute('aria-busy', 'true');
    // disabled thật để tránh double-submit, nhưng KHÔNG mất chữ
    btn.disabled = true;
    if (!already) {
      const sp = el('span', { class: 'kg-btn__spinner', 'aria-hidden': 'true' });
      btn.insertBefore(sp, btn.firstChild);
    }
  } else {
    delete btn.dataset.loading;
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
    if (already) already.remove();
  }
  return btn;
}

/**
 * disabled: dùng CẢ `disabled` và `aria-disabled` (§2.5-2).
 * `reason` → lý do "Cần công cụ local đang chạy" — KHÔNG ẩn nút.
 *
 * QA-UX CAO-A · vì sao KHÔNG chỉ dựa vào tooltip.
 *   Bản cũ chỉ gọi `attachTooltip(btn, reason, {alsoWrapper:true})`. Ba chỗ hỏng:
 *     1. `alsoWrapper` đọc `target.parentElement`, nhưng 31 chỗ trong `web/js/screens`
 *        gate nút NGAY LÚC TẠO — lúc đó nút chưa có cha ⇒ nhánh hover-ở-cha không
 *        bao giờ được gắn (đo được: UX-VERDICT §2, ca A vs B).
 *     2. `<button disabled>` bị loại khỏi tab order theo chuẩn HTML ⇒ người dùng bàn
 *        phím KHÔNG focus tới được ⇒ nhánh tooltip-khi-focus cũng không chạy.
 *     3. Nút disabled không phát pointer event ⇒ hover trên chính nút cũng vô hiệu.
 *   Hệ quả: lý do CHỈ tới được người dùng chuột, mà là người dùng chuột rê trúng cha.
 *   Với screen reader: đọc "Sinh ảnh, nút, không khả dụng" — không có lý do.
 *
 *   Bản vá: gắn lý do vào CHÍNH a11y tree của nút, không phụ thuộc hover/cha/tab order:
 *     · `<span class="kg-sr-only">` chứa lý do, nằm TRONG nút, nối bằng `aria-describedby`
 *     · `title` gốc của trình duyệt làm đường lùi cho người dùng chuột
 *   Tooltip vẫn giữ (khi nút có cha) để người dùng chuột thấy nhanh — nay là lớp phụ.
 */
export function setDisabled(btn, isDisabled, reason = null) {
  btn.disabled = !!isDisabled;
  if (isDisabled) {
    btn.setAttribute('aria-disabled', 'true');
    if (reason) setDisabledReason(btn, reason);
  } else {
    btn.removeAttribute('aria-disabled');
    clearDisabledReason(btn);
  }
  return btn;
}

/** Lý do đi vào a11y tree của chính nút — không phụ thuộc hover, cha, hay tab order. */
function setDisabledReason(btn, reason) {
  const text = String(reason);
  let node = btn.querySelector?.('.kg-btn__reason') ?? null;
  if (!node) {
    // `aria-hidden` là CỐ Ý: với <button>, nội dung bên trong tham gia tính TÊN
    // (accname). Không ẩn thì screen reader đọc "Sinh ảnh… Cần công cụ local đang
    // chạy, nút" — tên nút bị bẩn. Ngược lại, node được `aria-describedby` TRỎ THẲNG
    // tới thì accname spec bỏ qua trạng thái ẩn khi tính MÔ TẢ ⇒ vẫn đọc được đúng
    // chỗ cần: sau tên + vai trò.
    node = el('span', { class: 'kg-btn__reason kg-sr-only', 'aria-hidden': 'true', id: uid('kg-why') });
    btn.appendChild(node);
  }
  node.textContent = text;
  const id = node.getAttribute('id');
  const prev = btn.getAttribute('aria-describedby');
  if (!prev) btn.setAttribute('aria-describedby', id);
  else if (!prev.split(/\s+/).includes(id)) btn.setAttribute('aria-describedby', `${prev} ${id}`);
  // Đường lùi cho người dùng chuột: title gốc của UA hiện cả khi nút disabled.
  btn.title = text;
  // Lớp phụ: tooltip §5.5 (chỉ chạy được khi nút đã có cha).
  attachTooltip(btn, text, { alsoWrapper: true });
}

function clearDisabledReason(btn) {
  const node = btn.querySelector?.('.kg-btn__reason') ?? null;
  if (!node) return;
  const id = node.getAttribute('id');
  const prev = btn.getAttribute('aria-describedby') ?? '';
  const rest = prev.split(/\s+/).filter((x) => x && x !== id).join(' ');
  if (rest) btn.setAttribute('aria-describedby', rest);
  else btn.removeAttribute('aria-describedby');
  node.remove();
  btn.title = '';
}

/** Nhóm nút: footer modal, toolbar. */
export function createButtonGroup(buttons = []) {
  return el('div', { class: 'kg-btn-group' }, buttons);
}
