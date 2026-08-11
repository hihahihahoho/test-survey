/**
 * remove.js — §4.4 Xoá project (SOFT) + toast Hoàn tác 10s + thùng rác 30 ngày.
 *
 * Chốt X6: KHÔNG bắt gõ tên project (xoá vào thùng rác là thao tác phục hồi được).
 * §4.4: nút phá huỷ là `danger`, KHÔNG phải mặc định của Enter; Enter = Huỷ.
 * §4.9: agent chưa chạy ⇒ menu Xoá disabled; CẤM xoá lạc quan (sẽ tái hiện bug B3).
 * Xoá vĩnh viễn KHÔNG nằm ở đây (chỉ trong Thùng rác S6, cần mã 4 số).
 */

import { api, errors, router } from '../../../core/index.js';
import { confirmChecklist, confirmDestructive, toast } from '../../../ui/index.js';
import { bytes, count } from '../../shared/format.js';

/** Liệt kê hậu quả từ số liệu THẬT của project (§4.4 "xem trước cái gì sẽ mất"). */
function consequences(p) {
  const s = p.stats ?? {};
  const out = [
    `Bản thiết kế (${count(s.sheets ?? 0, 'sheet')} · ${count(s.components ?? 0, 'element')}) — không tái tạo được`,
  ];
  if ((s.rawPresent ?? 0) > 0) out.push(`${count(s.rawPresent, 'ảnh AI đã sinh')} — sinh lại sẽ tốn quota`);
  if ((s.kitsCut ?? 0) > 0) out.push(`${count(s.kitsCut, 'file kit đã cắt')} — cắt lại được`);
  out.push(`Tổng ${bytes(s.diskBytes ?? 0)}`);
  return out;
}

/** Có lượt chạy đang chạy? (§4.4: modal phải hiện dòng ⚠ "sẽ bị dừng"). */
function hasRunning(p) {
  const jobs = Object.values(p?.state?.jobs ?? {});
  return jobs.includes('running') || jobs.includes('queued');
}

/**
 * Xoá 1 project.
 * @param {object} o {project, onDeleted(project), onRestored(project), refresh()}
 */
export async function deleteProject({ project, onDeleted, onRestored } = {}) {
  const list = consequences(project);
  if (hasRunning(project)) list.push('⚠ Project đang chạy lượt sinh ảnh — lượt đó sẽ bị dừng.');

  const ok = await confirmDestructive({
    title: `Xoá project «${project.name ?? project.id}»?`,
    message: 'Project sẽ chuyển vào Thùng rác và giữ 30 ngày. Phục hồi được bất cứ lúc nào.',
    consequences: list,
    confirmLabel: 'Chuyển vào thùng rác',
    cancelLabel: 'Huỷ',
  });
  if (ok !== true) return false;

  try {
    const res = await api.projects.remove(project.id);
    onDeleted?.(project);
    showUndoToast([{ project, trashId: res?.trashId }], { onRestored, cancelledRuns: res?.cancelledRuns ?? [] });
    return true;
  } catch (e) {
    const view = errors.present(e);
    toast.error({
      title: view.title,
      description: view.explain,
      actions: e?.code === 'RUN_ACTIVE'
        ? [{ label: 'Xem lượt đang chạy', variant: 'secondary', onClick: () => router.go('S4', { id: project.id }) }]
        : [],
    });
    return false;
  }
}

/**
 * Xoá NHIỀU project (§4.4 "Xoá nhiều"): 1 modal gộp + 1 toast Hoàn tác cho cả lô.
 * Gọi API tuần tự để lỗi ở giữa không làm mất dấu cái nào đã xoá.
 */
export async function deleteProjects({ projects, onDeleted, onRestored } = {}) {
  if (projects.length === 1) return deleteProject({ project: projects[0], onDeleted, onRestored });
  const total = projects.reduce((n, p) => n + Number(p.stats?.diskBytes ?? 0), 0);
  const ok = await confirmDestructive({
    title: `Xoá ${projects.length} project?`,
    message: `Tất cả sẽ chuyển vào Thùng rác và giữ 30 ngày. Tổng ${bytes(total)}.`,
    consequences: projects.map((p) => `${p.name ?? p.id} — ${bytes(p.stats?.diskBytes ?? 0)}`),
    confirmLabel: `Chuyển ${projects.length} project vào thùng rác`,
  });
  if (ok !== true) return false;

  const done = [];
  const failed = [];
  for (const p of projects) {
    try {
      const res = await api.projects.remove(p.id);
      done.push({ project: p, trashId: res?.trashId });
      onDeleted?.(p);
    } catch (e) {
      failed.push({ project: p, err: e });
    }
  }
  if (done.length > 0) showUndoToast(done, { onRestored });
  for (const f of failed) {
    const view = errors.present(f.err);
    toast.error({ title: `Chưa xoá được «${f.project.name ?? f.project.id}»`, description: view.explain });
  }
  return failed.length === 0;
}

/**
 * Toast Hoàn tác 10s (§4.4). `undo` của ui/toast.js đã: 10s, không tự đóng khi
 * hover/focus, có nút [Hoàn tác]. Hoàn tác = POST /api/trash/:trashId/restore.
 */
function showUndoToast(entries, { onRestored, cancelledRuns = [] } = {}) {
  const one = entries.length === 1;
  const title = one
    ? `Đã xoá «${entries[0].project.name ?? entries[0].project.id}»`
    : `Đã xoá ${entries.length} project`;
  const desc = cancelledRuns.length > 0
    ? `Đã dừng ${count(cancelledRuns.length, 'lượt chạy')}. Trong thùng rác 30 ngày.`
    : 'Trong thùng rác 30 ngày — phục hồi được bất cứ lúc nào.';

  toast.success({
    title,
    description: desc,
    undo: {
      label: 'Hoàn tác',
      onUndo: async () => {
        const restored = [];
        const failed = [];
        for (const e of entries) {
          if (!e.trashId) { failed.push(e); continue; }
          try {
            const r = await api.trash.restore(e.trashId);
            restored.push(r?.project ?? e.project);
          } catch (err) { failed.push({ ...e, err }); }
        }
        if (restored.length > 0) {
          toast.success({ title: `Đã phục hồi ${restored.length === 1 ? `«${restored[0].name ?? restored[0].id}»` : `${restored.length} project`}` });
          onRestored?.(restored);
        }
        for (const f of failed) {
          const view = errors.present(f.err);
          toast.error({
            title: `Chưa phục hồi được «${f.project.name ?? f.project.id}»`,
            description: f.trashId ? view.explain : 'Công cụ local không trả về mã thùng rác cho mục này.',
            actions: [{ label: 'Xem thùng rác', variant: 'secondary', onClick: () => router.go('S6', {}, { tab: 'trash' }) }],
          });
        }
      },
    },
  });
}

/**
 * §4.5 Dọn cache dẫn xuất. Không phải xoá project, nhưng là thao tác phá huỷ nhẹ
 * ⇒ checklist xem trước, và ghi rõ 2 thứ KHÔNG BAO GIỜ bị dọn.
 * Số file/dung lượng của từng mục không có trong #7 ⇒ nêu hệ quả bằng chữ, KHÔNG bịa số.
 */
export async function cleanProject({ project, onCleaned } = {}) {
  const picked = await confirmChecklist({
    title: `Dọn cache của «${project.name ?? project.id}»`,
    items: [
      { id: 'skeleton', label: 'Khung xương', detail: 'tái tạo trong vài giây', checked: true },
      { id: 'prompts', label: 'Prompt đã dựng', detail: 'tái tạo trong ~1 giây', checked: true },
      { id: 'kits', label: 'Kit đã cắt', detail: 'cắt lại được, mất khoảng 40 giây' },
      { id: 'rawHistory', label: 'Lịch sử ảnh AI', detail: 'giữ 3 đời ảnh cũ', warn: 'mất bản sinh cũ, không lấy lại được' },
      { id: 'oldLogs', label: 'Log lượt chạy cũ hơn 30 ngày' },
    ],
    footnote: 'Ảnh AI đang dùng và Bản thiết kế KHÔNG BAO GIỜ bị dọn ở đây.',
    confirmLabel: 'Dọn',
  });
  if (!Array.isArray(picked) || picked.length === 0) return false;
  try {
    const res = await api.projects.clean(project.id, picked);
    toast.success({ title: `Đã giải phóng ${bytes(res?.freedBytes ?? 0)}` });
    onCleaned?.(res);
    return true;
  } catch (e) {
    const view = errors.present(e);
    toast.error({
      title: view.title,
      description: view.explain,
      actions: e?.code === 'RUN_ACTIVE'
        ? [{ label: 'Xem lượt', variant: 'secondary', onClick: () => router.go('S4', { id: project.id }) }]
        : [],
    });
    return false;
  }
}

/** Dùng cho test: dựng danh sách hậu quả mà không mở modal. */
export const _consequences = consequences;
export const _hasRunning = hasRunning;
