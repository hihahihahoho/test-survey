/**
 * step-workspace.js — S0 BƯỚC 3: CHỌN THƯ MỤC LÀM VIỆC (yêu cầu #6, chốt X1).
 *
 * Chốt X1 (không thương lượng): web KHÔNG nhận đường dẫn tự do.
 *  · Hiển thị nhãn rút gọn `~/KitGen` + ghi được ✓ + còn bao nhiêu trống (từ /health + doctor)
 *  · Chọn GIỮA các workspace agent đã biết: GET /api/workspaces → POST /api/workspace/activate
 *    và chỉ gửi `workspaceId` ĐỤC, không bao giờ gửi path
 *  · Muốn thêm thư mục khác → hiện LỆNH copy-1-nút, không có ô input path
 *  · Lựa chọn được nhớ ở trình duyệt qua store (kitgen.workspace.v1)
 *  · Đổi workspace ⇒ xoá cache danh sách project (dữ liệu của workspace cũ là SAI)
 *
 * Đây cũng là chỗ xử lý ca "user chạy lại wizard để ĐỔI workspace".
 */

import { api, errors, store } from '../../core/index.js';

const { LS_KEYS } = store;
import {
  createBanner, createButton, createCheckbox, createCodeBlock, createSpinnerRow, el, toast,
} from '../../ui/index.js';
import { ADD_WORKSPACE_CMD } from '../../app-shell/commands.js';
import * as agentStatus from '../../app-shell/agent-status.js';
import { bytes, count } from '../shared/format.js';

export function renderWorkspaceStep({ status, doctor, onNext, onChanged }) {
  const box = el('div', { class: 'kg-stack' }, [
    el('h2', { class: 'kg-t-title', text: 'Thư mục làm việc' }),
    el('p', {
      class: 'kg-t-body',
      text: 'Đây là nơi mọi project được lưu trên máy bạn. Trang web không bao giờ nhận đường dẫn bạn gõ — '
        + 'nó chỉ chọn giữa những thư mục mà công cụ local đã biết.',
    }),
  ]);

  if (!status.connected) {
    box.appendChild(createBanner({
      kind: 'warning',
      title: 'Cần công cụ local đang chạy để đọc danh sách thư mục làm việc.',
      actions: [createButton({ label: 'Thử lại', variant: 'secondary', size: 'sm', onClick: () => agentStatus.refresh() })],
    }));
    return box;
  }

  /* Thẻ thư mục đang dùng — số liệu THẬT từ /health + /api/doctor. */
  const ws = doctor?.workspace ?? null;
  const current = el('div', { class: 'kg-card', style: { padding: 'var(--s-4)', gap: 'var(--s-2)' } }, [
    el('h3', { class: 'kg-t-subtitle', text: 'Đang dùng' }),
    el('p', { class: 'kg-t-body', text: status.workspaceLabel ?? ws?.label ?? '—' }),
    el('p', {
      class: 'kg-t-caption kg-fg-default',
      text: [
        ws?.writable === true ? 'ghi được ✓' : (ws?.writable === false ? 'KHÔNG ghi được ✗' : 'chưa kiểm được quyền ghi'),
        Number.isFinite(ws?.freeBytes) ? `còn ${bytes(ws.freeBytes)} trống` : 'chưa đọc được dung lượng trống',
        Number.isFinite(status.health?.projects) ? count(status.health.projects, 'project') : null,
      ].filter(Boolean).join(' · '),
    }),
  ]);
  if (ws?.writable === false) {
    current.appendChild(createBanner({
      kind: 'error',
      title: 'Không ghi được vào thư mục này — kiểm tra quyền hoặc chọn thư mục khác bên dưới.',
    }));
  }
  box.appendChild(current);

  /* Danh sách workspace agent BIẾT (id đục, không path). */
  const listBox = el('div', { class: 'kg-card', style: { padding: 'var(--s-4)', gap: 'var(--s-2)' } }, [
    el('h3', { class: 'kg-t-subtitle', text: 'Chọn thư mục làm việc' }),
    createSpinnerRow({ label: 'Đang đọc danh sách…' }),
  ]);
  box.appendChild(listBox);

  const addBox = el('div', { class: 'kg-card', style: { padding: 'var(--s-4)', gap: 'var(--s-2)' } }, [
    el('h3', { class: 'kg-t-subtitle', text: 'Muốn dùng thư mục khác?' }),
    el('p', { class: 'kg-t-body', text: 'Chạy lệnh này trong Terminal (đổi đường dẫn theo ý bạn) rồi bấm Kiểm tra lại:' }),
    createCodeBlock({ code: ADD_WORKSPACE_CMD, ariaLabel: 'Lệnh thêm thư mục làm việc' }).el,
    el('p', { class: 'kg-t-caption kg-fg-default', text: 'Lựa chọn của bạn được ghi nhớ trong trình duyệt này.' }),
  ]);
  box.appendChild(addBox);

  const nextRow = el('div', { class: 'kg-row' }, [
    createButton({ label: 'Tiếp: kiểm tra môi trường tạo ảnh →', variant: 'primary', size: 'lg', onClick: onNext }),
    createButton({ label: 'Kiểm tra lại', variant: 'ghost', icon: '↻', onClick: () => loadList() }),
  ]);
  box.appendChild(nextRow);

  let picked = null;

  async function loadList() {
    listBox.replaceChildren(
      el('h3', { class: 'kg-t-subtitle', text: 'Chọn thư mục làm việc' }),
      createSpinnerRow({ label: 'Đang đọc danh sách…' }),
    );
    try {
      const res = await api.system.workspaces();
      const items = Array.isArray(res?.items) ? res.items : [];
      const activeId = res?.activeId ?? null;
      picked = activeId;

      listBox.replaceChildren(el('h3', { class: 'kg-t-subtitle', text: 'Chọn thư mục làm việc' }));

      if (items.length <= 1) {
        // §3-S6 empty: chỉ có 1 workspace ⇒ ẩn radio, hiện 1 dòng + lệnh thêm.
        listBox.appendChild(el('p', {
          class: 'kg-t-body',
          text: items.length === 1
            ? `Công cụ local đang biết đúng 1 thư mục: ${items[0].label ?? '—'}.`
            : 'Công cụ local chưa khai thư mục nào.',
        }));
        return;
      }

      const apply = createButton({
        label: 'Dùng thư mục đã chọn', variant: 'secondary',
        onClick: () => activate(items),
      });
      for (const w of items) {
        const c = createCheckbox({
          type: 'radio', name: 'kg-ws', value: w.id,
          label: `${w.label ?? w.id}${w.active ? '  ← đang dùng' : ''}`,
          sublabel: [
            Number.isFinite(w.projects) ? count(w.projects, 'project') : null,
            Number.isFinite(w.diskBytes) ? bytes(w.diskBytes) : null,
            w.writable === false ? 'KHÔNG ghi được' : null,
          ].filter(Boolean).join(' · '),
          checked: w.id === activeId,
          disabled: w.writable === false,
          onChange: () => { picked = w.id; },
        });
        listBox.appendChild(c.el);
      }
      listBox.appendChild(apply);
    } catch (e) {
      const view = errors.present(e);
      listBox.replaceChildren(
        el('h3', { class: 'kg-t-subtitle', text: 'Chọn thư mục làm việc' }),
        createBanner({
          kind: 'error', title: `${view.title} — ${view.explain}`,
          actions: [createButton({ label: 'Thử lại', variant: 'secondary', size: 'sm', onClick: () => loadList() })],
        }),
      );
    }
  }

  async function activate(items) {
    if (!picked) { toast.info({ title: 'Chọn một thư mục trước đã' }); return; }
    const target = items.find((w) => w.id === picked);
    try {
      const res = await api.system.activateWorkspace(picked);
      // Đổi workspace ⇒ cache danh sách của workspace cũ là dữ liệu SAI (§3.9 WORKSPACE_CHANGED).
      store.invalidateProjectsCache();
      store.patch(LS_KEYS.workspace, {
        workspaceId: res?.workspaceId ?? picked,
        label: res?.workspaceLabel ?? target?.label ?? '',
        fingerprint: res?.workspaceFingerprint ?? '',
        knownAt: new Date().toISOString(),
      });
      toast.success({ title: `Đã chuyển sang ${res?.workspaceLabel ?? target?.label ?? 'thư mục đã chọn'}` });
      await agentStatus.refresh();
      onChanged?.();
    } catch (e) {
      const view = errors.present(e);
      // §3-S6 error: lỗi INLINE tại dòng đó, KHÔNG đổi lựa chọn.
      listBox.appendChild(createBanner({ kind: 'error', title: `${view.title} — ${view.explain}` }));
      toast.error({ title: view.title, description: view.explain });
    }
  }

  loadList();
  return box;
}
