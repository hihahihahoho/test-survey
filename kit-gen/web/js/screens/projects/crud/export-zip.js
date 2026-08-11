/**
 * export-zip.js — §4.7 XUẤT .zip. Modal chọn nội dung + ước lượng + tải về.
 *
 * Ràng buộc: agent trả `Content-Disposition` và (khi tính được) `Content-Length`.
 * Ta gọi qua core/agent.js (raw response) để giữ header bắt buộc X-KitGen-Client —
 * KHÔNG dùng thẻ <a download> trỏ thẳng vào API vì điều hướng của trình duyệt
 * không gửi được header đó, sẽ ăn 403 (agent/lib/security.mjs lớp 3).
 */

import { agent, errors } from '../../../core/index.js';
import {
  createBanner, createButton, createCheckbox, createModalFooter, createSpinnerRow,
  el, openModal, setLoading, toast,
} from '../../../ui/index.js';
import { bytes, count, exportFileName } from '../../shared/format.js';

export function openExportModal({ project, readOnly = false, reason = null } = {}) {
  const s = project.stats ?? {};
  const incRefs = createCheckbox({ label: 'Ảnh tham khảo', checked: true, sublabel: 'nhẹ, nên giữ' });
  const incRaw = createCheckbox({ label: `Ảnh AI đã sinh (${count(s.rawPresent ?? 0, 'lượt')})`, sublabel: 'nặng nhất, nhưng đỡ phải sinh lại' });
  const incKits = createCheckbox({ label: `Kit đã cắt (${count(s.kitsCut ?? 0, 'file')})`, sublabel: 'thứ giao cho dev/designer', checked: true });
  const incRuns = createCheckbox({ label: 'Lịch sử lượt chạy', sublabel: 'chỉ để tra cứu' });

  const fileName = exportFileName(project.slug ?? project.id);
  const info = el('p', { class: 'kg-t-body' });
  const progress = el('div');

  function sync() {
    const parts = ['bản thiết kế'];
    if (incRefs.checked) parts.push('ảnh tham khảo');
    if (incRaw.checked) parts.push('ảnh AI đã sinh');
    if (incKits.checked) parts.push('kit đã cắt');
    if (incRuns.checked) parts.push('lịch sử lượt chạy');
    const heavy = incRaw.checked || incRuns.checked;
    info.textContent = `Tên file: ${fileName} · gồm ${parts.join(', ')}.`
      + (heavy ? ` Project đang chiếm ${bytes(s.diskBytes ?? 0)} nên file có thể lớn.` : '');
  }
  for (const c of [incRefs, incRaw, incKits, incRuns]) c.input.addEventListener('change', sync);

  const body = el('div', { class: 'kg-stack' }, [
    el('p', { class: 'kg-t-body', text: 'Bản thiết kế luôn được xuất. Chọn thêm thứ bạn cần mang đi:' }),
    el('div', {}, [
      createCheckbox({ label: 'Bản thiết kế', sublabel: 'luôn xuất', checked: true, disabled: true }).el,
      incRefs.el, incRaw.el, incKits.el, incRuns.el,
    ]),
    info,
    createBanner({ kind: 'info', title: 'Nội dung zip là đúng cây thư mục project — thả vào máy khác là chạy được.' }),
    progress,
  ]);

  const cancel = createButton({ label: 'Đóng', variant: 'secondary', onClick: () => m.close('cancel') });
  const confirm = createButton({
    label: 'Tải .zip', variant: 'primary', icon: '⬇', disabled: readOnly,
    onClick: async () => {
      const include = ['contract'];
      if (incRefs.checked) include.push('refs');
      if (incRaw.checked) include.push('raw');
      if (incKits.checked) include.push('kits');
      if (incRuns.checked) include.push('runs');

      setLoading(confirm, true);
      m.setBusy(true);
      progress.replaceChildren(createSpinnerRow({ label: 'Công cụ local đang đóng gói…' }));
      try {
        const res = await downloadExport(project, include, fileName);
        m.close('done');
        toast.success({ title: `Đã tải ${res.fileName}`, description: bytes(res.bytes) });
      } catch (e) {
        const view = errors.present(e);
        progress.replaceChildren(createBanner({ kind: 'error', title: `${view.title} — ${view.explain}` }));
        toast.error({ title: view.title, description: view.explain });
      } finally {
        setLoading(confirm, false);
        m.setBusy(false);
      }
    },
  });
  if (readOnly) confirm.title = reason ?? 'Cần công cụ local đang chạy';

  const m = openModal({
    title: `Xuất «${project.name ?? project.id}»`, size: 'md',
    body, footer: createModalFooter({ cancel, confirm }),
  });
  sync();
  return m;
}

/**
 * Tải zip qua transport (có header ép preflight), rồi lưu bằng Blob.
 * Tên file ưu tiên `Content-Disposition` của agent (nguồn sự thật), fallback là tên ta tính.
 */
export async function downloadExport(project, include, fallbackName) {
  const qs = `?include=${encodeURIComponent(include.join(','))}`;
  const res = await agent._request(`/api/projects/${encodeURIComponent(project.id)}/export.zip${qs}`, {
    method: 'GET', kind: 'upload', raw: true,     // kind upload = 60s, không retry
  });
  const blob = await res.blob();
  const cd = res.headers?.get?.('Content-Disposition') ?? '';
  const match = /filename="?([^";]+)"?/i.exec(cd);
  const fileName = match ? match[1] : fallbackName;
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
  return { fileName, bytes: blob.size };
}

/** Xuất nhiều project (thanh hành động nổi ở view list) — tuần tự, báo từng cái. */
export async function exportMany(projects) {
  let ok = 0;
  for (const p of projects) {
    try {
      await downloadExport(p, ['contract', 'refs', 'kits'], exportFileName(p.slug ?? p.id));
      ok += 1;
    } catch (e) {
      const view = errors.present(e);
      toast.error({ title: `Chưa xuất được «${p.name ?? p.id}»`, description: view.explain });
    }
  }
  if (ok > 0) toast.success({ title: `Đã tải ${count(ok, 'file zip')}` });
  return ok;
}
