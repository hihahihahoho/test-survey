/**
 * tab-agent.js — S6 tab **Công cụ local & Thư mục làm việc** (§3-S6, YÊU CẦU #6).
 *
 * Chốt X1 được thi công đúng chữ:
 *   · Web KHÔNG có ô nhập đường dẫn. Không bao giờ gửi `path`.
 *   · Chỉ CHỌN giữa các workspace agent đã biết (#3 `GET /api/workspaces`) rồi gửi
 *     `workspaceId` ĐỤC qua #4 `POST /api/workspace/activate`.
 *   · Muốn thêm workspace mới → hiện lệnh copy-1-nút để chạy ở Terminal.
 *   · Đổi workspace ⇒ xoá `kitgen.projects.cache.v1`, về S1, toast.
 */

import {
  el, clear, createButton, createCodeBlock, createEmptyState, createStatusDot,
  createBanner, createSpinnerRow, toast, setLoading, icon,
} from '../../ui/index.js';
import { panel, statRow } from '../project/shared/screen.js';
import { isReadOnly, NEED_AGENT, gateButton, copyCmdButton, openMirror } from '../project/shared/agent-state.js';
import * as api from '../../core/api.js';
import * as errors from '../../core/errors.js';
import * as store from '../../core/store.js';
import * as nav from '../project/shared/nav.js';
import * as fmt from '../shared/format.js';

const ADD_WS_CMD = 'kitgen-agent --workspace /đường/dẫn/của/bạn';

/**
 * @param {object} o
 * @param {object} o.status              trạng thái agent (§2.4)
 * @param {{items:[], activeId:string|null}} o.workspaces
 * @param {boolean} o.loading
 * @param {object|null} o.error
 * @param {() => void} o.onRecheck
 * @param {() => void} o.onReload
 */
export function renderAgentTab(o) {
  const root = el('div', { class: 'kg-stack', style: { gap: 'var(--s-4)' } });
  const ro = isReadOnly(o.status);
  const h = o.status?.health ?? null;

  /* ── Kết nối ── */
  const connChildren = [
    el('div', { class: 'kg-row', style: { gap: 'var(--s-3)' } }, [
      createStatusDot(ro ? 'warn' : 'ok', connLabel(o.status)),
      el('div', { style: { marginLeft: 'auto' } }, [
        createButton({ label: 'Kiểm tra lại', variant: 'secondary', size: 'sm', icon: '↻', onClick: o.onRecheck }),
      ]),
    ]),
  ];
  if (h) {
    connChildren.push(statRow('Địa chỉ', o.status?.baseUrl ?? '—'));
    connChildren.push(statRow('Phiên bản công cụ local', h.version ?? '—'));
    if (h.instanceLabel) connChildren.push(statRow('Tên phiên bản đang chạy', h.instanceLabel));
    connChildren.push(statRow('Chế độ', o.status?.mode === 'mirror' ? 'bản chạy tại máy (same-origin)' : 'gọi trực tiếp từ trang web'));
    if (Number.isFinite(h.activeRuns)) connChildren.push(statRow('Lượt đang chạy', fmt.count(h.activeRuns, 'lượt')));
  } else {
    const view = errors.lookup(o.status?.code ?? 'AGENT_NOT_RUNNING');
    connChildren.push(el('p', { class: 'kg-t-body kg-fg-default', text: view.explain }));
    connChildren.push(el('div', { class: 'kg-row kg-row--tight' }, [
      copyCmdButton('kitgen-agent', 'Copy lệnh chạy'),
      createButton({ label: 'Chạy lại hướng dẫn cài', variant: 'ghost', size: 'sm', onClick: () => nav.toSettings('env') }),
    ]));
  }
  if (o.status?.mode !== 'mirror') {
    connChildren.push(el('div', { class: 'kg-row kg-row--tight' }, [
      createButton({
        label: 'Dùng bản chạy tại máy', variant: 'ghost', size: 'sm',
        onClick: () => openMirror(o.status),
      }),
      el('span', { class: 'kg-t-caption kg-fg-default', text: 'Dùng khi trình duyệt chặn kết nối tới máy bạn.' }),
    ]));
  }
  root.appendChild(panel({ title: 'Kết nối', children: connChildren }));

  /* ── Thư mục làm việc ── */
  root.appendChild(workspacePanel(o, ro));

  /* ── Thêm workspace khác ── */
  root.appendChild(panel({
    title: 'Thêm thư mục làm việc khác',
    children: [
      el('p', { class: 'kg-t-body kg-fg-default',
        text: 'Trang web không nhận đường dẫn tự do (một ký tự sai là hỏng, và trang web không kiểm chứng được). Chạy lệnh dưới đây ở Terminal rồi bấm Kiểm tra lại.' }),
      createCodeBlock({ code: ADD_WS_CMD, ariaLabel: 'Lệnh thêm thư mục làm việc' }).el,
      el('p', { class: 'kg-t-caption kg-fg-default' }, [
        icon('ⓘ'), el('span', { text: ' Lựa chọn thư mục được ghi nhớ trong trình duyệt này (chỉ nhãn và id, không có đường dẫn thật).' }),
      ]),
    ],
  }));

  return root;
}

/** Nhãn kết nối: luôn có CHỮ, lấy từ bảng §3.9 — không màn nào tự viết copy (§2.4/§3.9). */
function connLabel(status) {
  if (status?.connected) return 'Đã kết nối';
  return errors.lookup(status?.code ?? 'AGENT_NOT_RUNNING').title;
}

function workspacePanel(o, ro) {
  const children = [];

  if (o.loading) {
    children.push(createSpinnerRow({ label: 'Đang đọc danh sách thư mục làm việc…' }));
    return panel({ title: 'Thư mục làm việc', children });
  }
  if (o.error) {
    const view = errors.present(o.error);
    children.push(createBanner({
      kind: 'warning',
      title: `${view.title} — ${view.explain}`,
      actions: [createButton({ label: 'Thử lại', variant: 'secondary', size: 'sm', onClick: o.onReload })],
    }));
    return panel({ title: 'Thư mục làm việc', children });
  }

  const items = o.workspaces?.items ?? [];
  const activeId = o.workspaces?.activeId ?? null;

  if (items.length === 0) {
    // Không có gì để chọn: hiện nhãn từ /health nếu có, và lệnh thêm ở khối dưới.
    const label = o.status?.workspaceLabel ?? null;
    children.push(label
      ? statRow('Đang dùng', label)
      : createEmptyState({
          inline: true, icon: '▤',
          title: 'Chưa đọc được thư mục làm việc',
          description: 'Công cụ local phải đang chạy mới biết thư mục nào đang dùng.',
        }));
    return panel({ title: 'Thư mục làm việc', children });
  }

  if (items.length === 1) {
    // §3-S6 empty: chỉ có 1 workspace ⇒ ẨN radio, hiện 1 dòng.
    const w = items[0];
    children.push(statRow('Đang dùng', `${w.label} · ${fmt.count(w.projects ?? 0, 'project')} · ${fmt.bytes(w.diskBytes ?? 0)}`));
    if (w.writable === false) {
      children.push(createBanner({ kind: 'error', title: `${errors.lookup('WORKSPACE_UNWRITABLE').title} — ${errors.lookup('WORKSPACE_UNWRITABLE').explain}` }));
    }
    return panel({ title: 'Thư mục làm việc', children });
  }

  /* Nhiều workspace: radiogroup thật (<input type=radio> có nhãn — §5.8-A5). */
  const errSlot = el('div');
  const group = el('div', { role: 'radiogroup', 'aria-label': 'Thư mục làm việc', style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' } });
  let picked = activeId;
  const radios = [];
  for (const w of items) {
    const id = `kg-ws-${w.id}`;
    const input = el('input', { type: 'radio', name: 'kg-workspace', id, value: w.id, disabled: ro ? true : null });
    input.checked = w.id === activeId;
    input.addEventListener('change', () => {
      picked = w.id;
      clear(errSlot);
      applyBtn.disabled = picked === activeId;
      applyBtn.setAttribute('aria-disabled', applyBtn.disabled ? 'true' : 'false');
    });
    radios.push({ input, w });
    group.appendChild(el('label', { class: 'kg-check', for: id }, [
      input,
      el('span', {}, [
        el('span', { text: `${w.label}${w.id === activeId ? ' — đang dùng' : ''}` }),
        el('span', { class: 'kg-check__sub', text: `${fmt.count(w.projects ?? 0, 'project')} · ${fmt.bytes(w.diskBytes ?? 0)}${w.writable === false ? ' · KHÔNG ghi được' : ''}` }),
      ]),
    ]));
  }

  const applyBtn = gateButton(createButton({
    label: 'Dùng thư mục đã chọn', variant: 'primary',
    onClick: () => { void activate(); },
  }), o.status);
  if (!ro) { applyBtn.disabled = true; applyBtn.setAttribute('aria-disabled', 'true'); }

  async function activate() {
    if (!picked || picked === activeId) return;
    setLoading(applyBtn, true);
    try {
      const res = await api.system.activateWorkspace(picked);
      // Đổi workspace ⇒ cache project cũ vô nghĩa (khác fingerprint) → xoá (chốt X1 + §3.9).
      try { store.invalidateProjectsCache(); } catch { /* store bị chặn thì thôi */ }
      setLoading(applyBtn, false);
      toast.success({ title: `Đã chuyển sang ${res?.workspaceLabel ?? 'thư mục mới'}` });
      nav.toProjects();
    } catch (error) {
      setLoading(applyBtn, false);
      const view = errors.present(error);
      // §3-S6 error: WORKSPACE_UNWRITABLE ⇒ lỗi INLINE tại dòng đó, KHÔNG đổi lựa chọn.
      const row = radios.find((r) => r.w.id === picked);
      if (row) row.input.checked = false;
      const back = radios.find((r) => r.w.id === activeId);
      if (back) back.input.checked = true;
      picked = activeId;
      clear(errSlot);
      errSlot.appendChild(createBanner({
        kind: 'error',
        title: `${view.title} — ${view.explain}`,
        actions: [createButton({ label: 'Kiểm tra lại', variant: 'secondary', size: 'sm', onClick: o.onRecheck })],
      }));
    }
  }

  children.push(group, errSlot, el('div', { class: 'kg-row', style: { justifyContent: 'flex-end' } }, [applyBtn]));
  if (ro) children.push(el('p', { class: 'kg-t-caption kg-fg-default', text: NEED_AGENT }));
  return panel({ title: 'Thư mục làm việc', children });
}
