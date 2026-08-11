/**
 * overview.js — S2 · CHI TIẾT PROJECT — Tổng quan (`/p/:id`, UX-SPEC §3-S2).
 * Trả lời trong 5 giây: project đang ở đâu · việc tiếp theo là gì · bấm đâu để làm.
 *
 * Đủ 4 trạng thái (§3-S2 bảng trạng thái):
 *   loading  → skeleton từng thẻ, giữ khung
 *   empty    → project 0 sheet: khối hướng dẫn 3 bước, KHÔNG vẽ ma trận
 *   error    → PROJECT_BROKEN/NOT_FOUND: khối lỗi có nút, message kỹ thuật chỉ ở panel gập
 *   success  → thẻ Việc tiếp theo + ma trận + 4 thẻ phụ
 * Agent chưa chạy (§2.5): banner vàng + vẽ từ cache + mọi nút ghi disabled có tooltip.
 *
 * Phím tắt (§3-S2): ⌘Enter mở modal Sinh ảnh · e/r/k/s điều hướng · F2 đổi tên.
 */

import { el, createButton, attachMenu, toast, createBanner } from '../../ui/index.js';
import { createShell, pageHead, panel, loadingStack, errorBlock, missingProjectBlock } from './shared/screen.js';
import { fallbackStatus, isReadOnly, gateButton, NEED_AGENT, syncLabel } from './shared/agent-state.js';
import * as data from './shared/data.js';
import * as jobs from './shared/jobs.js';
import * as nav from './shared/nav.js';
import * as fmt from '../shared/format.js';
import { createProgressMatrix, createSelectionBar, createMatrixLegend } from './matrix.js';
import { createNextActions, createOnboardingSteps } from './next-actions.js';
import { designCard, runsCard, kitCard, statsCard } from './cards.js';
import { openGenFlow, startSlice, setCurrentProjectId, reportError } from './shared/run-actions.js';
import { openRenameDialog, projectMenuItems } from './actions.js';

/**
 * @param {HTMLElement} container
 * @param {{projectId:string, status?:object}} opts
 */
export function mountOverview(container, opts = {}) {
  const projectId = String(opts.projectId ?? '');
  let status = opts.status ?? fallbackStatus();
  let model = { phase: 'loading', project: null, contract: null, version: null, runs: [], kit: null, error: null, fromCache: false };
  let matrixApi = null;
  let disposed = false;

  setCurrentProjectId(projectId);
  data.markOpened(projectId);

  const shell = createShell(container, {
    onRetry: () => { void load(); },
    onWhy: () => { nav.toSettings('agent'); },
  });

  const handlers = {
    onDesign: (tab) => nav.toDesign(projectId, tab),
    onRuns: () => nav.toRuns(projectId),
    onRun: (runId) => nav.toRun(projectId, runId),
    onKit: () => nav.toKit(projectId),
    onSettings: () => nav.toProjectSettings(projectId),
    // Drawer "Lịch sử bản thiết kế" là của S3 (§2.1) và ĐÃ export sẵn ⇒ nạp động và gọi
    // trực tiếp (cùng cách S2 đang làm với gen-modal.js) thay vì bắt user bấm thêm 1 lần.
    // S3 lỗi/thiếu file thì rơi về điều hướng như trước — không mất tính năng (§6.5-6).
    onHistory: async () => {
      try {
        const mod = await import('../design/safety.js');
        if (typeof mod.openHistoryDrawer === 'function') {
          mod.openHistoryDrawer({
            projectId,
            currentVersion: model.project?.contract?.version ?? null,
            onRestored: () => load(),
            returnFocusTo: document.activeElement,
          });
          return;
        }
      } catch { /* không nạp được S3 → đường lùi dưới */ }
      nav.toDesign(projectId, 'sheets');
      toast.info({ title: 'Lịch sử bản lưu nằm trong trình soạn', description: 'Mở nút Lịch sử ở thanh lưu.' });
    },
    onGen: (jobList) => { void openGenFlow({ projectId, project: model.project, contract: model.contract, jobs: jobList, status, onStarted: () => load() }); },
    onSlice: async (jobList) => { const r = await startSlice({ projectId, jobs: jobList, status }); if (r) void load(); },
  };

  async function load() {
    if (disposed) return;
    model = { ...model, phase: 'loading', error: null };
    render();

    const pr = await data.loadProject(projectId);
    if (disposed) return;
    if (!pr.ok) {
      model = { ...model, phase: 'error', error: pr.error };
      render();
      return;
    }
    model.project = pr.data;
    model.fromCache = pr.fromCache === true;

    // Contract cần cho ma trận. Ở chế độ cache (agent tắt) không gọi tiếp cho khỏi treo.
    if (!model.fromCache) {
      const [cr, rr] = await Promise.all([data.loadContract(projectId), data.loadRuns(projectId, 5)]);
      if (disposed) return;
      if (cr.ok) { model.contract = cr.data.contract; model.version = cr.data.version; }
      else { model.contract = null; model.contractError = cr.error; }
      model.runs = rr.data;
      const variantId = jobs.normalizeVariants(model.contract)[0]?.id;
      const kr = await data.loadKit(projectId, variantId);
      if (disposed) return;
      model.kit = kr.ok ? kr.data : null;
    } else {
      model.contract = null;
      model.runs = [];
      model.kit = null;
    }
    model.phase = 'success';
    render();
  }

  function render() {
    const reconnected = shell.syncBanner(status, {
      lastSyncLabel: model.fromCache ? syncLabel(data.cacheFetchedAt()) : null,
    });
    if (reconnected) void load();

    if (model.phase === 'loading') { shell.setContent(loadingStack({ panels: 4, label: 'Đang tải tổng quan project…' })); return; }

    if (model.phase === 'error') {
      const code = model.error?.code;
      if (code === 'PROJECT_NOT_FOUND' || code === 'PROJECT_IN_TRASH') {
        shell.setContent(missingProjectBlock(model.error, {
          onBack: () => nav.toProjects(),
          onTrash: () => nav.toSettings('trash'),
        }));
        return;
      }
      shell.setContent(errorBlock(model.error, {
        actions: [
          createButton({ label: 'Thử lại', variant: 'primary', onClick: () => load() }),
          createButton({ label: 'Mở thư mục', variant: 'secondary', onClick: () => revealFolder(projectId) }),
          createButton({ label: 'Về danh sách', variant: 'ghost', onClick: () => nav.toProjects() }),
        ],
      }));
      return;
    }

    shell.setContent(successView());
  }

  function successView() {
    const p = model.project;
    const matrix = jobs.buildMatrix(model.contract, p);
    const rows = jobs.nextActions(matrix, p, model.contract);
    const empty = matrix.sheets.length === 0;

    const genBtn = gateButton(createButton({
      label: 'Sinh ảnh…', variant: 'primary', icon: '⚡',
      onClick: () => handlers.onGen(allPendingJobs(matrix)),
    }), status, empty ? 'Cần ≥1 sheet' : null);

    const moreBtn = createButton({
      variant: 'ghost', icon: '⋯', iconOnly: true, ariaLabel: 'Thao tác khác với project này',
      tooltip: 'Thao tác khác',
    });
    attachMenu(moreBtn, () => projectMenuItems({
      project: p, status, projectId,
      onRename: () => openRenameDialog({ project: p, onSaved: () => load() }),
      onSettings: handlers.onSettings,
      onKit: handlers.onKit,
      onReload: () => load(),
    }));

    const head = pageHead({
      title: p?.name ?? projectId,
      subtitle: p?.description || null,
      meta: [
        `sửa ${fmt.relTime(p?.updatedAt)}`,
        fmt.bytes(p?.stats?.diskBytes ?? 0),
        model.fromCache ? 'dữ liệu từ bộ nhớ tạm' : null,
      ].filter(Boolean),
      actions: [genBtn, moreBtn],
    });

    const stack = el('div', { class: 'kg-stack' }, [
      head,
      panel({ title: 'Việc tiếp theo', children: [
        createNextActions({ rows, status, handlers, degraded: matrix.degraded && !empty }),
      ] }),
    ]);

    if (model.contractError) {
      stack.appendChild(createBanner({
        kind: 'warning',
        title: 'Chưa đọc được bản thiết kế — ma trận tiến độ có thể thiếu.',
        actions: [createButton({ label: 'Thử lại', variant: 'secondary', size: 'sm', onClick: () => load() })],
      }));
    }

    if (empty) {
      stack.appendChild(panel({ title: 'Bắt đầu từ đâu', children: [
        createOnboardingSteps({ status, handlers }),
      ] }));
      stack.appendChild(twoCol(designCard({ project: p, contract: model.contract, version: model.version, status, handlers }),
        runsCard({ runs: model.runs, handlers, loadFailed: model.fromCache })));
      return stack;
    }

    /* --- MA TRẬN TIẾN ĐỘ --- */
    const selBar = createSelectionBar({ onClear: () => matrixApi?.clearSelection() });
    matrixApi = createProgressMatrix({
      matrix,
      onOpenCell: (cell) => nav.toDesign(projectId, 'sheets'),
      onSelectionChange: (sel) => {
        const btns = [
          gateButton(createButton({
            label: `Sinh ${sel.length} lượt đã chọn`, variant: 'primary', size: 'sm', icon: '⚡',
            onClick: () => handlers.onGen(sel),
          }), status),
          gateButton(createButton({
            label: 'Cắt', variant: 'secondary', size: 'sm', icon: '✂',
            onClick: () => handlers.onSlice(sel),
          }), status),
        ];
        selBar.update(sel.length, matrix.total, btns);
      },
    });

    const legend = createMatrixLegend(matrix.counts);
    stack.appendChild(panel({
      title: 'Tiến độ theo sheet × phong cách',
      children: [matrixApi.el, legend, selBar.el],
    }));

    stack.appendChild(twoCol(
      designCard({ project: p, contract: model.contract, version: model.version, status, handlers }),
      runsCard({ runs: model.runs, handlers, loadFailed: model.fromCache }),
    ));
    stack.appendChild(twoCol(
      statsCard({ project: p }),
      kitCard({ projectId, kit: model.kit, status, handlers, readOnly: isReadOnly(status) }),
    ));
    return stack;
  }

  /** Tất cả lượt CẦN làm (stale/never/failed) — dùng cho nút chính "Sinh ảnh…". */
  function allPendingJobs(matrix) {
    const out = [];
    for (const cell of matrix.cells.values()) {
      if (!cell.applies) continue;
      if (['stale', 'never', 'failed'].includes(cell.state)) out.push(cell.job);
    }
    return out.length > 0 ? out : [...matrix.cells.values()].filter((c) => c.applies).map((c) => c.job);
  }

  async function revealFolder(id) {
    try { await (await import('../../core/api.js')).projects.reveal(id); }
    catch (e) { reportError(e); }
  }

  /* --- Phím tắt của màn (§3-S2). Không bắt phím khi con trỏ ở trong input (§2.3). --- */
  const onKey = (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (isReadOnly(status)) { toast.warning({ title: NEED_AGENT }); return; }
      const matrix = jobs.buildMatrix(model.contract, model.project);
      handlers.onGen(allPendingJobs(matrix));
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'e') { e.preventDefault(); handlers.onDesign('sheets'); }
    else if (e.key === 'r') { e.preventDefault(); handlers.onRuns(); }
    else if (e.key === 'k') { e.preventDefault(); handlers.onKit(); }
    else if (e.key === 's') { e.preventDefault(); handlers.onSettings(); }
    else if (e.key === 'F2') {
      e.preventDefault();
      if (isReadOnly(status)) { toast.warning({ title: NEED_AGENT }); return; }
      openRenameDialog({ project: model.project, onSaved: () => load() });
    }
  };
  document.addEventListener('keydown', onKey);

  void load();

  return {
    el: container,
    /** Agent pill đổi trạng thái → vẽ lại banner + gate nút, không mất dữ liệu đang có. */
    update({ status: next } = {}) {
      if (next) status = next;
      render();
    },
    reload: () => load(),
    /** Tên project cho breadcrumb + <title> của shell (§5.8-A13) — không gọi API thêm. */
    title: () => model.project?.name ?? null,
    destroy() {
      disposed = true;
      document.removeEventListener('keydown', onKey);
      shell.destroy();
    },
  };
}

function twoCol(a, b) {
  return el('div', {
    style: { display: 'grid', gap: 'var(--s-4)', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' },
  }, [a, b]);
}
