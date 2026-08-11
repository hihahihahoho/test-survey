/**
 * actions.js — thao tác quản lý một project, dùng chung cho S2 và S2b (§4.2–§4.7).
 * Mỗi thao tác = ĐÚNG 1 lời gọi API atomic ở agent (§4 nguyên tắc chung): UI không bao giờ
 * ở trạng thái "đã đổi trên màn nhưng chưa đổi trên đĩa".
 *
 * Phá huỷ ⇒ luôn có đường về (§1.1-1):
 *   xoá project   → modal xem trước hậu quả + thùng rác 30 ngày + toast [Hoàn tác] 10s (chốt X6)
 *   dọn cache     → checklist xem trước, mặc định chỉ tick thứ tái tạo rẻ (§1.2/§4.5)
 * Cấm xoá lạc quan (§4.9): agent chưa chạy thì nút disabled, không "xoá trước hỏi sau".
 */

import {
  openModal, createModalFooter, createButton, createInput, confirmChecklist,
  toast, el, icon, setLoading, createDevDetails,
} from '../../ui/index.js';
import * as api from '../../core/api.js';
import * as errors from '../../core/errors.js';
import { isReadOnly, NEED_AGENT } from './shared/agent-state.js';
import * as data from './shared/data.js';
import * as nav from './shared/nav.js';
import * as fmt from '../shared/format.js';

/** Menu `⋯` của S2 — đúng thứ tự của S1 (§3-S1 mục 3) để user không phải học lại. */
export function projectMenuItems({ project, status, projectId, onRename, onSettings, onKit, onReload }) {
  const ro = isReadOnly(status);
  const reason = NEED_AGENT;
  return [
    { label: 'Mở bản thiết kế', icon: '✎', onSelect: () => nav.toDesign(projectId, 'sheets') },
    { label: 'Đổi tên…', icon: '✎', hint: 'F2', disabled: ro, disabledReason: reason, onSelect: onRename },
    { label: 'Nhân bản…', icon: '⧉', disabled: ro, disabledReason: reason, onSelect: () => openDuplicateDialog({ project, projectId }) },
    { label: 'Xuất .zip', icon: '⬇', disabled: ro, disabledReason: reason, onSelect: () => openExportDialog({ project, projectId }) },
    { label: 'Mở thư mục trên máy', icon: '▤', disabled: ro, disabledReason: reason, onSelect: () => revealFolder(projectId) },
    { label: 'Dọn cache dẫn xuất…', icon: '⌫', disabled: ro, disabledReason: reason,
      onSelect: () => openCleanDialog({ project, projectId, status, onDone: onReload }) },
    { label: 'Thư viện kit', icon: '▦', onSelect: onKit },
    { label: 'Cài đặt project', icon: '⚙', onSelect: onSettings },
    'separator',
    { label: 'Xoá…', icon: '🗑', danger: true, disabled: ro, disabledReason: reason,
      onSelect: () => openDeleteDialog({ project, projectId, status, onDeleted: () => nav.toProjects() }) },
  ];
}

/** Hiện lỗi thao tác: copy từ bảng §3.9, message kỹ thuật chỉ trong panel gập. */
export function actionError(error, actions = []) {
  const view = errors.present(error);
  toast.error({ title: view.title, description: view.explain, actions: actions.slice(0, 2) });
  return view;
}

/** §4.2 Đổi tên — PATCH #10. Tên hiển thị đổi, thư mục trên máy KHÔNG đổi. */
export function openRenameDialog({ project, onSaved = null }) {
  if (!project) return;
  const field = createInput({
    label: 'Tên project', value: project.name ?? '', required: true, autofocus: true,
    hint: 'Chỉ đổi tên hiển thị. Thư mục trên máy và tên file khi xuất không đổi.',
  });
  const cancel = createButton({ label: 'Huỷ', variant: 'secondary', onClick: () => m.close() });
  const save = createButton({
    label: 'Lưu', variant: 'primary',
    onClick: async () => {
      const name = String(field.value ?? '').trim();
      if (name === '') { field.setError('Tên không được để trống.'); field.focus(); return; }
      if (name.length > 120) { field.setError('Tên tối đa 120 ký tự.'); field.focus(); return; }
      setLoading(save, true); m.setBusy(true);
      try {
        const res = await api.projects.update(project.id, { name });
        data.rememberInCache(res?.project ?? { ...project, name });
        m.setBusy(false); m.close();
        toast.success({ title: 'Đã đổi tên' });
        onSaved?.(res?.project ?? null);
      } catch (error) {
        setLoading(save, false); m.setBusy(false);
        field.setError(errors.present(error).title);
        field.focus();
      }
    },
  });
  const m = openModal({
    title: 'Đổi tên project', size: 'sm', hasInput: true,
    body: el('div', {}, [field.el]),
    footer: createModalFooter({ cancel, confirm: save }),
  });
  field.input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save.click(); } });
}

/**
 * §4.4 Xoá (soft) — modal XEM TRƯỚC hậu quả, KHÔNG bắt gõ tên (chốt X6).
 * Enter = Huỷ, ⌘Enter = xác nhận (chống bấm nhầm). Sau khi xoá: toast [Hoàn tác] 10s.
 */
export function openDeleteDialog({ project, projectId, status, onDeleted = null }) {
  if (isReadOnly(status)) { toast.warning({ title: NEED_AGENT }); return; }
  const s = project?.stats ?? {};
  const lines = [
    { label: `Bản thiết kế (${s.sheets ?? 0} sheet · ${s.components ?? 0} element)`, note: 'không tái tạo được' },
    { label: `${s.rawPresent ?? 0} ảnh AI đã sinh`, note: 'gen lại sẽ tốn quota' },
    { label: `${s.kitsCut ?? 0} file kit đã cắt`, note: 'cắt lại được' },
    { label: `Tổng ${fmt.bytes(s.diskBytes ?? 0)}`, note: null },
  ];
  const body = el('div', {}, [
    el('p', { class: 'kg-t-body', text: 'Project sẽ chuyển vào Thùng rác và giữ 30 ngày. Phục hồi được bất cứ lúc nào.' }),
    el('div', { class: 'kg-t-label kg-fg-default', style: { marginTop: 'var(--s-4)' }, text: 'Sẽ chuyển vào thùng rác:' }),
    el('ul', { style: { margin: 'var(--s-2) 0 0', paddingLeft: 'var(--s-5)', display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' } },
      lines.map((l) => el('li', { class: 'kg-t-body kg-fg-default' }, [
        el('span', { text: l.label }),
        l.note ? el('span', { class: 'kg-t-caption', style: { marginLeft: 'var(--s-2)' }, text: `— ${l.note}` }) : null,
      ]))),
    el('p', { class: 'kg-t-caption kg-fg-default', style: { marginTop: 'var(--s-3)' },
      text: 'Nhấn ⌘Enter (hoặc Ctrl+Enter) để xác nhận.' }),
  ]);

  const errSlot = el('div');
  body.appendChild(errSlot);

  const cancel = createButton({ label: 'Huỷ', variant: 'secondary', attrs: { 'data-autofocus': '' }, onClick: () => m.close() });
  const confirm = createButton({
    label: 'Chuyển vào thùng rác', variant: 'danger',
    onClick: () => { void run(); },
  });

  async function run() {
    setLoading(confirm, true); m.setBusy(true);
    try {
      const res = await api.projects.remove(projectId);
      data.forgetInCache(projectId);
      m.setBusy(false); m.close();
      const trashId = res?.trashId ?? null;
      const cancelled = Array.isArray(res?.cancelledRuns) ? res.cancelledRuns : [];
      toast.success({
        title: `Đã chuyển «${project?.name ?? projectId}» vào thùng rác`,
        description: cancelled.length ? `Đã dừng ${cancelled.length} lượt đang chạy.` : 'Giữ 30 ngày, phục hồi được.',
        undo: trashId ? { label: 'Hoàn tác', onUndo: () => { void undoDelete(trashId); } } : null,
      });
      onDeleted?.(res);
    } catch (error) {
      setLoading(confirm, false); m.setBusy(false);
      inlineError(errSlot, error);
    }
  }

  const m = openModal({
    title: `Xoá project «${project?.name ?? projectId}»?`,
    size: 'md', destructive: true, body,
    footer: createModalFooter({ cancel, confirm }),
  });
  m.panel.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); confirm.click(); }
  });
}

async function undoDelete(trashId) {
  try {
    const res = await api.trash.restore(trashId);
    const p = res?.project ?? null;
    if (p) data.rememberInCache(p);
    toast.success({
      title: `Đã phục hồi «${p?.name ?? 'project'}»`,
      actions: p?.id ? [{ label: 'Mở', onClick: () => nav.toProject(p.id) }] : [],
    });
  } catch (error) { actionError(error); }
}

/** §4.5 Dọn cache dẫn xuất — checklist xem trước; ảnh AI đang dùng & thiết kế KHÔNG BAO GIỜ bị dọn. */
export async function openCleanDialog({ project, projectId, status, onDone = null }) {
  if (isReadOnly(status)) { toast.warning({ title: NEED_AGENT }); return; }
  // Số MB từng nhóm lấy từ `stats.diskBreakdown` (§6.2 #9). Agent chưa trả field này
  // ⇒ KHÔNG kèm số (thà thiếu số còn hơn số sai) — dialog vẫn dùng được bình thường.
  const bd = project?.stats?.diskBreakdown;
  const size = (key) => {
    const n = Number(bd?.[key]);
    return Number.isFinite(n) && n > 0 ? ` · ${fmt.bytes(n)}` : '';
  };
  const picked = await confirmChecklist({
    title: `Dọn cache của «${project?.name ?? projectId}»`,
    confirmLabel: 'Dọn',
    items: [
      { id: 'skeleton', label: `Khung xương${size('skeleton')}`, detail: 'tái tạo tự động khi sinh ảnh lần sau', checked: true },
      { id: 'prompts', label: `Prompt đã dựng${size('prompts')}`, detail: 'tái tạo trong ~1 giây', checked: true },
      { id: 'kits', label: `Kit đã cắt${size('kits')}`, detail: 'cắt lại được, mất vài chục giây', checked: false },
      { id: 'rawHistory', label: `Lịch sử ảnh AI${size('rawHistory')}`, detail: 'các đời ảnh cũ', warn: 'mất bản gen cũ, không lấy lại được', checked: false },
      { id: 'oldLogs', label: 'Nhật ký lượt chạy cũ hơn 30 ngày', detail: 'chỉ là bằng chứng, không ảnh hưởng sản phẩm', checked: false },
    ],
    footnote: 'Ảnh AI đang dùng và Bản thiết kế KHÔNG BAO GIỜ bị dọn ở đây.',
  });
  if (!picked || picked.length === 0) return;
  try {
    const res = await api.projects.clean(projectId, picked);
    toast.success({
      title: `Đã giải phóng ${fmt.bytes(res?.freedBytes ?? 0)}`,
      description: describeRemoved(res?.removed),
    });
    onDone?.(res);
  } catch (error) {
    actionError(error, [{ label: 'Xem lượt', onClick: () => nav.toRuns(projectId) }]);
  }
}

function describeRemoved(removed) {
  if (!removed || typeof removed !== 'object') return null;
  const label = { skeleton: 'khung xương', prompts: 'prompt', kits: 'file kit', rawHistory: 'ảnh cũ', oldLogs: 'nhật ký' };
  const parts = Object.entries(removed)
    .filter(([, n]) => Number(n) > 0)
    .map(([k, n]) => `${n} ${label[k] ?? k}`);
  return parts.length ? `Đã xoá ${parts.join(' · ')}.` : null;
}

/** §4.7 Xuất .zip — chọn nội dung, hiện tên file thật trước khi tải. */
export function openExportDialog({ project, projectId }) {
  const boxes = [
    { id: 'contract', label: 'Bản thiết kế + ảnh tham khảo', locked: true, checked: true },
    { id: 'raw', label: 'Ảnh AI đã sinh', checked: false },
    { id: 'kits', label: 'Kit đã cắt', checked: false },
    { id: 'runs', label: 'Lịch sử lượt chạy', checked: false },
  ];
  const inputs = new Map();
  const rows = boxes.map((b) => {
    const input = el('input', { type: 'checkbox', id: `kg-exp-${b.id}`, disabled: b.locked ? true : null });
    input.checked = b.checked;
    inputs.set(b.id, input);
    return el('label', { class: 'kg-check', for: `kg-exp-${b.id}` }, [
      input,
      el('span', {}, [
        el('span', { text: b.label }),
        b.locked ? el('span', { class: 'kg-check__sub', text: 'luôn có trong file xuất' }) : null,
      ]),
    ]);
  });
  const nameLine = el('p', { class: 'kg-t-caption kg-fg-default', style: { marginTop: 'var(--s-3)' },
    text: `Tên file: ${fmt.exportFileName(project?.slug ?? projectId)}` });

  const cancel = createButton({ label: 'Huỷ', variant: 'secondary', attrs: { 'data-autofocus': '' }, onClick: () => m.close() });
  const go = createButton({
    label: 'Xuất', variant: 'primary', icon: '⬇',
    onClick: () => {
      const include = ['contract', 'refs', ...[...inputs.entries()].filter(([, i]) => i.checked).map(([k]) => k)];
      const url = api.projects.exportUrl(projectId, include);
      // Tải qua thẻ <a download>: giữ được stream + Content-Disposition của agent (§4.7).
      const a = el('a', { href: url, download: fmt.exportFileName(project?.slug ?? projectId), style: { display: 'none' } });
      document.body.appendChild(a);
      a.click();
      a.remove();
      m.close();
      toast.info({ title: 'Đang tạo file .zip', description: 'Trình duyệt sẽ hỏi chỗ lưu khi file sẵn sàng.' });
    },
  });
  const m = openModal({
    title: 'Xuất project ra .zip', size: 'sm', hasInput: true,
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' } }, [...rows, nameLine]),
    footer: createModalFooter({ cancel, confirm: go }),
  });
}

/** §4.3 Nhân bản — mặc định chỉ contract + refs (nhẹ, nhanh), KHÔNG copy raw/kits. */
export function openDuplicateDialog({ project, projectId }) {
  const nameField = createInput({
    label: 'Tên project mới', value: `${project?.name ?? projectId} (bản sao)`, required: true, autofocus: true,
  });
  const opts = [
    { id: 'raw', label: 'Ảnh AI đã sinh', detail: 'copy để không phải gen lại (tốn đĩa)' },
    { id: 'kits', label: 'Kit đã cắt', detail: 'tự cắt lại được, thường không cần' },
    { id: 'runs', label: 'Lịch sử lượt chạy', detail: null },
  ];
  const inputs = new Map();
  const rows = opts.map((o) => {
    const input = el('input', { type: 'checkbox', id: `kg-dup-${o.id}` });
    inputs.set(o.id, input);
    return el('label', { class: 'kg-check', for: `kg-dup-${o.id}` }, [
      input,
      el('span', {}, [el('span', { text: o.label }), o.detail ? el('span', { class: 'kg-check__sub', text: o.detail }) : null]),
    ]);
  });
  const errSlot = el('div');

  const cancel = createButton({ label: 'Huỷ', variant: 'secondary', onClick: () => m.close() });
  const go = createButton({
    label: 'Nhân bản', variant: 'primary', icon: '⧉',
    onClick: async () => {
      const name = String(nameField.value ?? '').trim();
      if (name === '') { nameField.setError('Tên không được để trống.'); nameField.focus(); return; }
      setLoading(go, true); m.setBusy(true);
      try {
        const include = ['contract', 'refs', ...[...inputs.entries()].filter(([, i]) => i.checked).map(([k]) => k)];
        const res = await api.projects.duplicate(projectId, { name, include, variants: 'all' });
        const np = res?.project ?? null;
        if (np) data.rememberInCache(np);
        m.setBusy(false); m.close();
        toast.success({
          title: `Đã nhân bản → «${np?.name ?? name}»`,
          description: res?.copied ? `${res.copied.files} file · ${fmt.bytes(res.copied.bytes)}` : null,
          actions: [{ label: 'Về project cũ', onClick: () => nav.toProject(projectId) }],
        });
        if (np?.id) nav.toDesign(np.id, 'styles');
      } catch (error) {
        setLoading(go, false); m.setBusy(false);
        inlineError(errSlot, error);
      }
    },
  });
  const m = openModal({
    title: 'Nhân bản project', size: 'md', hasInput: true,
    body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' } }, [
      nameField.el,
      el('div', { class: 'kg-t-label kg-fg-default', text: 'Mang theo thêm' }),
      ...rows,
      el('p', { class: 'kg-t-caption kg-fg-default', text: 'Bản thiết kế và ảnh tham khảo luôn được copy.' }),
      errSlot,
    ]),
    footer: createModalFooter({ cancel, confirm: go }),
  });
}

export async function revealFolder(projectId) {
  try { await api.projects.reveal(projectId); }
  catch (error) {
    const view = errors.present(error);
    if (view.code === 'NOT_SUPPORTED') toast.warning({ title: 'Hệ điều hành này không mở được thư mục từ web' });
    else actionError(error);
  }
}

/** Lỗi hiện NGAY trong modal (§5.5: toast không được là nơi duy nhất). */
function inlineError(slot, error) {
  const view = errors.present(error);
  while (slot.firstChild) slot.removeChild(slot.firstChild);
  slot.appendChild(el('div', { class: 'kg-banner kg-banner--error', role: 'alert', style: { marginTop: 'var(--s-3)' } }, [
    icon('⛔'),
    el('div', { class: 'kg-banner__main' }, [
      el('div', { text: view.title }),
      el('div', { class: 'kg-t-caption', text: view.explain }),
    ]),
  ]));
  slot.appendChild(createDevDetails(errors.devDetails(error)));
}
