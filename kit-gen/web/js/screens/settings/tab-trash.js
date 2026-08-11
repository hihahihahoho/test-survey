/**
 * tab-trash.js — S6 tab **Thùng rác** (§3-S6 + §4.4).
 * Danh sách project đã xoá + `xoá lúc` + `còn N ngày` + dung lượng.
 *   [Phục hồi]          → #13, có thể 409 PROJECT_ID_TAKEN ⇒ hiện gợi ý, không im lặng
 *   [Xoá vĩnh viễn…]    → #15 xin mã 4 số IN RA TERMINAL rồi #14 kèm header X-KitGen-Confirm
 *                          Mã KHÔNG BAO GIỜ được lưu ở trình duyệt (arch §4.3-7);
 *                          nó chỉ đi từ ô input tới header của một request duy nhất.
 *   [Dọn hết…]          → lặp purge từng mục, mỗi mục vẫn cần mã (không có cửa sau).
 */

import {
  el, createButton, createTable, createBadge, createEmptyState, createSpinnerRow,
  confirmDestructive, toast, icon,
} from '../../ui/index.js';
import { panel } from '../project/shared/screen.js';
import { isReadOnly, gateButton, NEED_AGENT } from '../project/shared/agent-state.js';
import * as api from '../../core/api.js';
import * as errors from '../../core/errors.js';
import * as nav from '../project/shared/nav.js';
import * as fmt from '../shared/format.js';
import { forgetInCache, rememberInCache } from '../project/shared/data.js';

/**
 * @param {object} o
 * @param {object[]} o.items
 * @param {boolean} o.loading
 * @param {object|null} o.error
 * @param {object} o.status
 * @param {() => void} o.onReload
 */
export function renderTrashTab(o) {
  const root = el('div', { class: 'kg-stack', style: { gap: 'var(--s-4)' } });

  if (o.loading) {
    root.appendChild(panel({ children: [createSpinnerRow({ label: 'Đang đọc thùng rác…' })] }));
    return root;
  }
  if (o.error) {
    const view = errors.present(o.error);
    root.appendChild(panel({ children: [createEmptyState({
      inline: true, icon: '⛔',
      title: view.title, description: view.explain,
      primary: createButton({ label: 'Thử lại', variant: 'primary', onClick: o.onReload }),
    })] }));
    return root;
  }
  if (o.items.length === 0) {
    root.appendChild(panel({ children: [createEmptyState({
      inline: true, icon: '🗑',
      title: 'Thùng rác trống',
      description: 'Project đã xoá sẽ nằm ở đây 30 ngày, phục hồi được bất cứ lúc nào.',
      primary: createButton({ label: 'Về danh sách project', variant: 'secondary', onClick: () => nav.toProjects() }),
    })] }));
    return root;
  }

  const table = createTable({
    caption: 'Project trong thùng rác',
    columns: [
      { key: 'name', label: 'Project', render: (r) => el('div', {}, [
          el('div', { class: 'kg-t-body kg-fg-strong kg-truncate', title: r.name ?? r.projectId, text: r.name ?? r.projectId }),
          el('div', { class: 'kg-t-caption kg-fg-default', text: r.projectId ?? '' }),
        ]) },
      { key: 'deletedAt', label: 'Xoá lúc', render: (r) => fmt.dateTime(r.deletedAt) },
      { key: 'left', label: 'Còn lại', render: (r) => leftBadge(r) },
      { key: 'bytes', label: 'Dung lượng', align: 'right', render: (r) => fmt.bytes(r.bytes ?? 0) },
      { key: 'act', label: 'Thao tác', render: (r) => el('div', { class: 'kg-row kg-row--tight' }, [
          gateButton(createButton({
            label: 'Phục hồi', variant: 'secondary', size: 'sm', icon: '↺',
            onClick: () => { void restore(r, o); },
          }), o.status),
          gateButton(createButton({
            label: 'Xoá vĩnh viễn…', variant: 'ghost', size: 'sm',
            onClick: () => { void purge(r, o); },
          }), o.status),
        ]) },
    ],
    rows: o.items.map((r) => ({ ...r, __label: r.name ?? r.projectId })),
    rowKey: (r) => r.trashId,
  });

  root.appendChild(panel({
    title: `Thùng rác · ${fmt.count(o.items.length, 'project')}`,
    actions: gateButton(createButton({
      label: 'Dọn hết…', variant: 'ghost', size: 'sm',
      onClick: () => { void purgeAll(o); },
    }), o.status),
    children: [
      el('p', { class: 'kg-t-body kg-fg-default',
        text: 'Project ở đây vẫn nằm trên đĩa. Sau 30 ngày công cụ local sẽ tự dọn.' }),
      table.el,
      el('p', { class: 'kg-t-caption kg-fg-default' }, [
        icon('ⓘ'),
        el('span', { text: ' Xoá vĩnh viễn cần một mã 4 số do công cụ local in ra cửa sổ Terminal — để không ai xoá được dữ liệu của bạn chỉ bằng một trang web.' }),
      ]),
      isReadOnly(o.status) ? el('p', { class: 'kg-t-caption kg-fg-default', text: NEED_AGENT }) : null,
    ].filter(Boolean),
  }));
  return root;
}

function leftBadge(r) {
  const d = fmt.daysLeft(r.restoreBefore);
  if (d === null) return createBadge({ state: 'neutral', text: 'chưa rõ', iconGlyph: '?' });
  if (d <= 0) return createBadge({ state: 'failed', text: 'đã hết hạn', iconGlyph: '⚠', long: 'Sẽ bị dọn ở lần kiểm tra tới' });
  if (d <= 3) return createBadge({ state: 'warn', text: `còn ${d} ngày`, iconGlyph: '⚠' });
  return createBadge({ state: 'ok', text: `còn ${d} ngày`, iconGlyph: '✓' });
}

async function restore(r, o) {
  try {
    const res = await api.trash.restore(r.trashId);
    const p = res?.project ?? null;
    if (p) rememberInCache(p);
    toast.success({
      title: `Đã phục hồi «${p?.name ?? r.name ?? r.projectId}»`,
      actions: p?.id ? [{ label: 'Mở', onClick: () => nav.toProject(p.id) }] : [],
    });
    o.onReload();
  } catch (error) {
    const view = errors.present(error);
    // 409 PROJECT_ID_TAKEN: nói rõ vì sao + gợi ý, KHÔNG im lặng (§3.9 điều cấm 3)
    toast.error({
      title: view.title,
      description: view.code === 'PROJECT_ID_TAKEN'
        ? `Đã có project cùng thư mục. Gợi ý: ${view.details?.suggestion ?? 'đổi tên project đang có rồi thử lại'}.`
        : view.explain,
      actions: [{ label: 'Thử lại', onClick: () => { void restore(r, o); } }],
    });
  }
}

/**
 * Xoá vĩnh viễn: xin mã (#15) → modal nhập mã → #14 với header confirm.
 * `confirmDestructive({requireCode:true})` giữ modal MỞ để ta báo lỗi mã sai tại chỗ.
 */
async function purge(r, o) {
  let codeIssued = false;
  try { await api.trash.requestCode(r.trashId); codeIssued = true; }
  catch (error) {
    const view = errors.present(error);
    toast.error({ title: view.title, description: view.explain });
    return;
  }

  const handle = await confirmDestructive({
    title: `Xoá vĩnh viễn «${r.name ?? r.projectId}»?`,
    message: `Không thể phục hồi. ${fmt.bytes(r.bytes ?? 0)} sẽ bị xoá khỏi ổ đĩa.`,
    consequences: [
      'Mở cửa sổ Terminal đang chạy công cụ local — bạn sẽ thấy một mã 4 số.',
      'Mã dùng một lần, hết hạn sau 60 giây.',
      'Mã này không được lưu ở trình duyệt.',
    ],
    confirmLabel: 'Xoá vĩnh viễn',
    requireCode: true,
    onResendCode: async () => {
      try { await api.trash.requestCode(r.trashId); toast.info({ title: 'Đã in mã mới ra Terminal' }); }
      catch (error) { toast.error({ title: errors.present(error).title }); }
    },
  });
  if (handle === false || !codeIssued) return;

  try {
    await api.trash.purge(r.trashId, handle.code);
    handle.close();
    forgetInCache(r.projectId);
    toast.success({ title: `Đã xoá vĩnh viễn «${r.name ?? r.projectId}»` });
    o.onReload();
  } catch (error) {
    const view = errors.present(error);
    const left = view.details?.attemptsLeft;
    handle.setError(view.code === 'CONFIRM_INVALID'
      ? `Sai mã. Hãy xem lại cửa sổ Terminal.${Number.isFinite(left) ? ` Còn ${left} lần thử.` : ''}`
      : `${view.title}. ${view.explain}`);
  }
}

/** Dọn hết: vẫn phải nhập mã cho từng mục — cố ý không làm "một mã xoá tất". */
async function purgeAll(o) {
  const ok = await confirmDestructive({
    title: `Dọn hết ${o.items.length} project trong thùng rác?`,
    message: 'Từng project vẫn cần một mã 4 số riêng từ Terminal — đây là bước cố ý để không xoá nhầm cả thùng rác.',
    consequences: o.items.slice(0, 8).map((r) => `${r.name ?? r.projectId} · ${fmt.bytes(r.bytes ?? 0)}`),
    confirmLabel: 'Bắt đầu dọn',
  });
  if (ok !== true) return;
  for (const r of [...o.items]) {
    // eslint-disable-next-line no-await-in-loop
    await purge(r, o);
  }
}
