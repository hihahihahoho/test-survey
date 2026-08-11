/**
 * runs/index.js — S4 THEO DÕI SINH ẢNH · /p/:id/runs và /p/:id/runs/:runId (§3-S4).
 *
 * Hợp đồng mount (teams/design/NEEDS-d2p3.md §1):
 *   const s4 = createRunsScreen({ projectId, runId, readOnly, navigate });
 *   host.appendChild(s4.el);  s4.update({ runId, readOnly });  s4.destroy();
 *
 * 4 trạng thái: empty (chưa có run) · loading (skeleton) · error · success.
 * Agent chưa chạy: đọc log ≤20 run từ IDB `runlog`, nhãn `bản lưu tạm` (§4.9).
 */

import {
  createButton, createEmptyState, createErrorState, createRunBadge,
  createSkeleton, createTable, el, clear, toast,
} from '../../ui/index.js';
import { api, errors } from '../../core/index.js';
import { readOnlyReason } from '../shared/read-only.js';
import { ensureScreenCss } from '../design/css.js';
import { createRunDetail } from './run-detail.js';
import { isFinished } from './run-store.js';
import { openGenModal } from './gen-modal.js';
import { openJobDrawer } from './job-drawer.js';

let activeRuns = 0;
/** Cho rail của d2p1: badge số lượt chạy đang chạy ở mục "Sinh ảnh" (§2.2). */
export function activeRunCount() { return activeRuns; }

export function createRunsScreen(opts = {}) {
  ensureScreenCss();
  const projectId = String(opts.projectId ?? '');
  let runId = opts.runId ? String(opts.runId) : null;
  let readOnly = Boolean(opts.readOnly);
  const navigate = typeof opts.navigate === 'function' ? opts.navigate : () => {};

  const root = el('div', { class: 'r-screen' });
  let detail = null;
  let phase = 'loading';
  let items = [];
  let loadError = null;

  function destroyDetail() {
    if (detail) { detail.destroy(); detail = null; }
  }

  /* ── danh sách lượt chạy (§3-S4-7) ─────────────────────────────────────── */

  async function loadList() {
    phase = 'loading';
    render();
    try {
      const res = await api.runs.list(projectId, 20);
      items = Array.isArray(res?.items) ? res.items : [];
      activeRuns = items.filter((r) => !isFinished(r.status)).length;
      phase = 'ready';
    } catch (e) {
      loadError = e;
      phase = 'error';
    }
    render();
  }

  function render() {
    destroyDetail();
    clear(root);

    if (runId) {
      detail = createRunDetail({ projectId, runId, readOnly, navigate });
      root.appendChild(detail.el);
      return root;
    }

    root.appendChild(el('div', { class: 'r-head' }, [
      el('h1', { class: 'r-head__title', text: 'Theo dõi sinh ảnh' }),
      el('span', { style: { marginLeft: 'auto' } }),
      createButton({
        label: 'Sinh ảnh…', variant: 'primary', icon: '⚡',
        disabled: readOnly, tooltip: readOnly ? readOnlyReason() : null,
        onClick: () => openGen(),
      }),
    ]));

    if (phase === 'loading') {
      root.appendChild(el('div', { 'aria-busy': 'true', class: 'kg-stack' }, [
        createSkeleton({ variant: 'text', count: 3 }),
      ]));
      return root;
    }
    if (phase === 'error') {
      const view = errors.present(loadError);
      root.appendChild(createErrorState({
        title: view.title, description: view.explain,
        actions: [
          createButton({ label: 'Thử lại', variant: 'primary', onClick: () => loadList() }),
          createButton({ label: 'Về tổng quan project', variant: 'secondary', onClick: () => navigate(`/p/${encodeURIComponent(projectId)}`) }),
        ],
        devDetails: errors.devDetails(loadError),
      }));
      return root;
    }
    if (items.length === 0) {
      root.appendChild(createEmptyState({
        icon: '⚡', title: 'Chưa có lượt chạy nào',
        description: 'Mỗi lượt sinh ảnh gọi AI một lần cho một sheet của một phong cách.',
        primary: createButton({
          label: 'Sinh ảnh…', variant: 'primary', size: 'lg', icon: '⚡',
          disabled: readOnly, tooltip: readOnly ? readOnlyReason() : null,
          onClick: () => openGen(),
        }),
        steps: [
          'Chọn phong cách và sheet cần sinh',
          'Xem số lượt và ước lượng quota trước khi chạy',
          'Theo dõi tiến độ, dừng hoặc chạy lại lượt lỗi tại đây',
        ],
      }));
      return root;
    }

    const table = createTable({
      caption: 'Danh sách lượt chạy gần nhất',
      columns: [
        { key: 'id', label: 'Lượt chạy', render: (r) => el('button', {
            type: 'button', class: 'kg-btn kg-btn--link kg-btn--sm',
            'aria-label': `Xem lượt chạy ${r.id}`,
            onClick: () => open(r.id),
          }, [el('span', { class: 'kg-btn__label kg-t-mono', text: r.id })]) },
        { key: 'at', label: 'Thời điểm', render: (r) => fmtWhen(r.startedAt) },
        { key: 'kind', label: 'Loại', render: (r) => (r.kind === 'slice' ? 'Cắt' : (r.kind === 'skeleton' ? 'Khung xương' : 'Sinh ảnh')) },
        { key: 'progress', label: 'Kết quả', align: 'right', render: (r) => `${r.progress?.done ?? 0}/${r.progress?.total ?? 0}` },
        { key: 'dur', label: 'Thời lượng', align: 'right', render: (r) => durOf(r) },
        { key: 'status', label: 'Trạng thái', render: (r) => createRunBadge(r.status ?? 'running', {
            done: r.progress?.done ?? 0, total: r.progress?.total ?? 0, failed: r.progress?.failed ?? 0,
          }) },
        { key: 'acts', label: 'Thao tác', render: (r) => el('div', { class: 'kg-row kg-row--tight' }, [
            createButton({ label: 'Xem', variant: 'ghost', size: 'sm', onClick: () => open(r.id) }),
            failedOf(r).length > 0
              ? createButton({
                  label: `Chạy lại ${failedOf(r).length} lượt lỗi`, variant: 'ghost', size: 'sm', icon: '↻',
                  disabled: readOnly, onClick: () => retry(r),
                })
              : null,
            failedOf(r).length > 0
              ? createButton({
                  variant: 'ghost', size: 'sm', icon: '▤', iconOnly: true,
                  ariaLabel: `Xem nhật ký lượt lỗi đầu tiên của ${r.id}`, tooltip: 'Xem nhật ký lượt lỗi',
                  onClick: () => openJobDrawer({ runId: r.id, job: failedOf(r)[0], projectId }),
                })
              : null,
          ]) },
      ],
      rows: items,
      rowKey: (r) => r.id,
    });
    root.appendChild(table.el);
    root.appendChild(el('p', {
      class: 'kg-t-caption kg-fg-default',
      text: `Giữ ${items.length} lượt chạy gần nhất. Nhật ký cũ hơn được dọn theo hạn lưu.`,
    }));
    return root;
  }

  function failedOf(r) {
    return (r.jobs ?? []).filter((j) => j.status === 'failed').map((j) => j.job);
  }

  async function retry(r) {
    const jobs = failedOf(r);
    if (jobs.length === 0 || readOnly) return;
    try {
      const res = await api.runs.start(projectId, {
        kind: r.kind === 'slice' ? 'slice' : 'gen', jobs, maxJobs: r.maxJobs ?? 4, autoSliceAfterGen: true,
      });
      toast.success({ title: `Đang chạy lại ${jobs.length} lượt lỗi` });
      if (res?.runId) open(res.runId);
    } catch (e) {
      const view = errors.present(e);
      toast.error({ title: view.title, description: view.explain });
    }
  }

  function open(id) {
    navigate(`/p/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(id)}`);
  }

  async function openGen() {
    let contract = null;
    let jobStates = {};
    try {
      const [c, p] = await Promise.all([
        api.contract.get(projectId),
        api.projects.get(projectId).catch(() => null),
      ]);
      contract = c?.contract ?? null;
      jobStates = p?.project?.state?.jobs ?? {};
    } catch (e) {
      const view = errors.present(e);
      toast.error({ title: view.title, description: view.explain });
      return;
    }
    openGenModal({ projectId, contract, jobStates, navigate });
  }

  if (runId) render(); else loadList();

  return {
    el: root,
    update({ runId: nextRunId, readOnly: nextReadOnly } = {}) {
      const changedRun = nextRunId !== undefined && String(nextRunId ?? '') !== String(runId ?? '');
      if (nextReadOnly !== undefined) readOnly = Boolean(nextReadOnly);
      if (changedRun) {
        runId = nextRunId ? String(nextRunId) : null;
        if (runId) render(); else loadList();
        return;
      }
      if (detail) detail.update({ readOnly });
      else render();
    },
    /**
     * §2.3: khi đang xem 1 lượt chạy thì lệnh của nó góp vào ⌘K; ở danh sách thì chưa có
     * lệnh riêng nào (mọi thứ đã có trong phần toàn cục) ⇒ trả mảng rỗng, không vỡ.
     */
    commands() {
      return typeof detail?.commands === 'function' ? detail.commands() : [];
    },
    destroy() { destroyDetail(); clear(root); },
  };
}

function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function durOf(r) {
  if (!r.startedAt) return '—';
  const end = r.finishedAt ? new Date(r.finishedAt) : new Date();
  const s = Math.round((end - new Date(r.startedAt)) / 1000);
  if (!Number.isFinite(s) || s < 0) return '—';
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m${String(s % 60).padStart(2, '0')}s` : `${s}s`;
}

export default createRunsScreen;
export { openGenModal } from './gen-modal.js';
export { openJobDrawer } from './job-drawer.js';
