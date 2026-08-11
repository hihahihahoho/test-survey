/**
 * design/advanced-tab.js — TAB "NÂNG CAO" (§3-S3.6): tham số cắt + màu nền tách + chất lượng tách.
 * Đóng C8 (threshold / grow_threshold / BLEED của slice.py lần đầu có UI) và F4 (một nơi cấu hình).
 *
 * TRUNG THỰC VỚI CODE THẬT (đã đọc slice.py):
 *  · `threshold` và `grow_threshold` được slice.py đọc THEO TỪNG STYLE (dòng 643–644)
 *    ⇒ "áp cho cả project" = ghi cho mọi variant + lưu mặc định ở contract.slice.
 *  · `BLEED` (dòng 66) hiện là HẰNG SỐ MODULE, chưa đọc từ contract ⇒ ô này được ghi vào
 *    contract.slice.bleed và UI NÓI RÕ là cần bản engine mới. Không hứa suông.
 *  · Chất lượng tách (ViTMatte/PyMatting/Vlahos) do engine TỰ DÒ thư viện, không có cờ
 *    ⇒ chỉ hiện trạng thái máy từ /api/doctor, lựa chọn ghi contract.slice.quality (chưa dùng).
 */

import {
  createBanner, createButton, createInput, createSegmented, createSpinnerRow,
  createInfoPopover, el, clear, icon as iconEl,
} from '../../ui/index.js';
import { api, errors } from '../../core/index.js';
import { readOnlyReason } from '../shared/read-only.js';

const DEFAULTS = Object.freeze({ threshold: 120, growOffset: 60, bleed: 0.18 });

export function createAdvancedTab(h = {}) {
  const root = el('div', { class: 'kg-stack' });
  let ctx = { contract: null, readOnly: false };
  let doctor = { state: 'idle', data: null, error: null };

  const dis = () => ctx.readOnly;
  const reason = readOnlyReason();

  function slice() { return ctx.contract?.slice ?? {}; }
  /** Giá trị hiện hành: ưu tiên contract.slice, rồi variant đầu tiên, rồi mặc định engine. */
  function effective(key, fallback) {
    const s = slice();
    if (s[key] !== undefined && s[key] !== null && s[key] !== '') return s[key];
    const v = (ctx.contract?.variants ?? [])[0];
    if (v && v[key] !== undefined && v[key] !== null) return v[key];
    return fallback;
  }

  function render(next = {}) {
    ctx = { ...ctx, ...next };
    clear(root);

    /* --- màu nền tách --- */
    const variants = ctx.contract?.variants ?? [];
    const allGreen = variants.length > 0 && variants.every((v) => /green|00ff00/i.test(String(v.bg ?? '')));
    const mixed = variants.length > 1
      && new Set(variants.map((v) => (/green|00ff00/i.test(String(v.bg ?? '')) ? 'g' : 'm'))).size > 1;

    const bgSeg = createSegmented({
      label: 'Màu nền tách (áp cho mọi phong cách)',
      value: allGreen ? 'green' : 'magenta',
      items: [{ value: 'magenta', label: 'Magenta #FF00FF' }, { value: 'green', label: 'Green #00FF00' }],
      note: mixed ? 'Các phong cách đang dùng màu nền KHÁC NHAU — chọn ở đây sẽ đặt lại cho tất cả.' : null,
      onChange: (val) => h.onSetAllBg(val),
    });

    root.appendChild(section('Màu nền tách', [
      bgSeg.el,
      el('p', { class: 'd-props__note', text: 'Nền đơn sắc để máy tách trong suốt. Đổi màu nền thì phải sinh ảnh lại — ảnh cũ vẫn nền cũ.' }),
      createInfoPopover({
        label: 'Vì sao quan trọng',
        content: 'Máy tách nền theo khoảng cách màu tới màu nền. Nếu element có màu gần màu nền, phần đó sẽ bị ăn mất. '
          + 'Chọn màu nền xa nhất với bảng màu của bộ kit: đồ ấm (đỏ/vàng) dùng magenta, đồ tím/hồng dùng green.',
      }),
    ]));

    /* --- tham số cắt --- */
    const th = Number(effective('threshold', DEFAULTS.threshold));
    const gt = Number(effective('grow_threshold', th + DEFAULTS.growOffset));
    const bleed = Number(slice().bleed ?? DEFAULTS.bleed);

    const fTh = createInput({
      label: 'Ngưỡng tách', type: 'number', value: String(th), size: 'sm', disabled: dis(),
      hint: `Mặc định ${DEFAULTS.threshold}. Càng cao càng ăn nhiều nền (và dễ ăn cả element).`,
      attrs: { min: '10', max: '400', step: '5' },
      onChange: (e) => h.onPatchSlice({ threshold: Number(e.target.value) }, scopeValue()),
    });
    const fGt = createInput({
      label: 'Ngưỡng nghiêm', type: 'number', value: String(gt), size: 'sm', disabled: dis(),
      hint: `Mặc định = ngưỡng tách + ${DEFAULTS.growOffset}.`,
      attrs: { min: '10', max: '500', step: '5' },
      onChange: (e) => h.onPatchSlice({ grow_threshold: Number(e.target.value) }, scopeValue()),
    });
    const fBleed = createInput({
      label: 'Vành ngoài ô', type: 'number', value: String(bleed), size: 'sm', disabled: dis(),
      hint: `Mặc định ${DEFAULTS.bleed} = ${Math.round(DEFAULTS.bleed * 100)}% cạnh ô, cho phần trang trí tràn ra.`,
      attrs: { min: '0', max: '0.5', step: '0.01' },
      onChange: (e) => h.onPatchSlice({ bleed: Number(e.target.value) }, { scope: 'project' }),
    });

    let scope = 'project';
    const scopeSeg = createSegmented({
      label: 'Áp dụng cho',
      value: 'project',
      items: [
        { value: 'project', label: 'Cả project' },
        ...(variants.length ? [{ value: 'variant', label: 'Từng phong cách' }] : []),
      ],
      onChange: (v) => { scope = v; render(); },
    });
    function scopeValue() {
      return scope === 'variant'
        ? { scope: 'variant', variantId: (variants[0] ?? {}).id }
        : { scope: 'project' };
    }

    root.appendChild(section('Tham số cắt ảnh', [
      el('div', { class: 'd-props__row' }, [fTh.el, fGt.el]),
      fBleed.el,
      // TRUNG THỰC: nói rõ ô nào engine hiện tại chưa đọc
      createBanner({
        kind: 'info',
        title: 'Vành ngoài ô hiện là hằng số trong bộ cắt — giá trị này được lưu vào bản thiết kế và sẽ có tác dụng khi công cụ local cập nhật.',
      }),
      scopeSeg.el,
      createButton({
        label: 'Trả về mặc định', variant: 'ghost', size: 'sm', icon: '↺',
        disabled: dis(), tooltip: dis() ? reason : null,
        onClick: () => h.onPatchSlice({
          threshold: DEFAULTS.threshold,
          grow_threshold: DEFAULTS.threshold + DEFAULTS.growOffset,
          bleed: DEFAULTS.bleed,
        }, { scope: 'project' }),
      }),
    ]));

    /* --- chất lượng tách + trạng thái máy (doctor) --- */
    const qWrap = el('div', { class: 'kg-stack', style: { gap: 'var(--s-2)' } });
    const qSeg = createSegmented({
      label: 'Chất lượng tách',
      value: String(slice().quality ?? 'fast') === 'high' ? 'high' : 'fast',
      items: [
        { value: 'fast', label: 'Nhanh (Pillow + numpy)' },
        { value: 'high', label: 'Cao (ViTMatte — cần cài thêm ~2 GB)' },
      ],
      onChange: (v) => h.onPatchSlice({ quality: v }, { scope: 'project' }),
    });
    qWrap.appendChild(qSeg.el);
    qWrap.appendChild(doctorLine());
    root.appendChild(section('Chất lượng tách', [qWrap]));

    return root;
  }

  function doctorLine() {
    if (doctor.state === 'loading') return createSpinnerRow({ label: 'Đang kiểm tra máy…' });
    if (doctor.state === 'error') {
      const view = errors.present(doctor.error);
      return el('div', { class: 'kg-row' }, [
        el('span', { class: 'kg-t-body', text: `Trạng thái máy: ${view.title}` }),
        createButton({ label: 'Thử lại', variant: 'ghost', size: 'sm', onClick: () => loadDoctor() }),
      ]);
    }
    if (doctor.state !== 'done') {
      return el('div', { class: 'kg-row' }, [
        el('span', { class: 'kg-t-body kg-fg-default', text: 'Trạng thái máy: chưa kiểm tra' }),
        createButton({ label: 'Kiểm tra', variant: 'ghost', size: 'sm', disabled: dis(), tooltip: dis() ? reason : null, onClick: () => loadDoctor() }),
      ]);
    }
    const py = doctor.data?.python ?? {};
    const deps = py.deps ?? {};
    const has = (k) => deps[k] === true || deps[k]?.ok === true;
    const rows = [
      ['Pillow', has('pillow') || has('PIL')],
      ['numpy', has('numpy')],
      ['PyMatting', has('pymatting')],
      ['ViTMatte', has('vitmatte') || has('transformers')],
    ];
    return el('div', { class: 'kg-stack', style: { gap: 'var(--s-1)' } }, [
      ...rows.map(([name, ok]) => el('div', { class: 'kg-row kg-row--tight' }, [
        iconEl(ok ? '✓' : '✗'),
        el('span', { class: 'kg-t-body', text: `${name}: ${ok ? 'đã cài' : 'chưa cài'}` }),
        !ok ? el('span', { class: 'kg-t-caption kg-fg-default', text: '— sẽ dùng chế độ tách nhanh' }) : null,
      ])),
      el('p', { class: 'd-props__note', text: 'Bộ cắt tự chọn chế độ tốt nhất có trên máy; đây là thông tin, không phải công tắc.' }),
    ]);
  }

  async function loadDoctor() {
    doctor = { state: 'loading', data: null, error: null };
    render();
    try {
      doctor = { state: 'done', data: await api.system.doctor(), error: null };
    } catch (e) {
      doctor = { state: 'error', data: null, error: e };
    }
    render();
  }

  function section(title, children) {
    return el('section', { class: 'kg-stack', style: { gap: 'var(--s-3)' } }, [
      el('h3', { class: 'kg-t-subtitle', text: title }),
      ...children,
    ]);
  }

  return { el: root, render };
}
