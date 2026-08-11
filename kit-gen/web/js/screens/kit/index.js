/**
 * kit/index.js — S5 · THƯ VIỆN KIT ĐÃ CẮT (`/p/:id/kit`, UX-SPEC §3-S5).
 * 3 tab con qua query `?tab=assets|matrix|export` (§2.1) — dùng primitive `createTabs`
 * (a11y: 1 tabstop, ←→ Home End, aria-selected/tabpanel).
 *
 * 4 trạng thái:
 *   loading → lưới skeleton theo số file dự kiến (lấy từ project.stats.kitsCut — biết trước thì đừng đoán)
 *   empty   → chưa cắt: 2 nhánh copy khác nhau tuỳ đã có ảnh AI hay chưa
 *   error   → manifest hỏng / không đọc được: banner + [Cắt lại] [Mở thư mục]
 *   success → lưới + cảnh báo stale + lightbox
 * Agent chưa chạy: banner §2.5, ảnh thành ▨, mọi nút ghi disabled có tooltip.
 */

import { el, createTabs, createSelect, createButton, createBanner, toast } from '../../ui/index.js';
import { createShell, pageHead, loadingStack, errorBlock, missingProjectBlock, panel } from '../project/shared/screen.js';
import { fallbackStatus, isReadOnly, gateButton, syncLabel } from '../project/shared/agent-state.js';
import * as data from '../project/shared/data.js';
import * as jobsLib from '../project/shared/jobs.js';
import * as nav from '../project/shared/nav.js';
import * as fmt from '../shared/format.js';
import { startSlice, openGenFlow, setCurrentProjectId } from '../project/shared/run-actions.js';
import { revealFolder } from '../project/actions.js';
import { renderAssetsTab } from './assets-tab.js';
import { renderMatrixTab } from './matrix-tab.js';
import { renderExportTab } from './export-tab.js';
import { toShellMount } from '../project/mount-adapter.js';

const TAB_IDS = ['assets', 'matrix', 'export'];

export function mountKit(container, opts = {}) {
  const projectId = String(opts.projectId ?? '');
  let status = opts.status ?? fallbackStatus();
  let activeTab = TAB_IDS.includes(opts.tab) ? opts.tab : 'assets';
  let disposed = false;

  /** State giao diện của tab, sống trong màn (không lưu secret, không lưu path). */
  const ui = {
    backdrop: 'checker', zoom: 1, query: '', sheet: '',
    collapsed: new Set(), diffOnly: false,
  };

  let model = {
    phase: 'loading', project: null, contract: null, variants: [],
    variantId: null, kits: new Map(), error: null, fromCache: false, notCut: false,
  };
  let tabsApi = null;

  setCurrentProjectId(projectId);
  const shell = createShell(container, { onRetry: () => load(), onWhy: () => nav.toSettings('agent') });

  const handlers = {
    onOpenSheet: () => nav.toDesign(projectId, 'sheets'),
    onGoAssets: () => switchTab('assets'),
    onReload: () => load(),
    /** Cắt: sheets=null ⇒ cắt tất cả lượt của phong cách đang xem. */
    onSlice: async (sheets) => {
      const jobs = jobsForSheets(sheets);
      if (jobs.length === 0) { toast.info({ title: 'Không có sheet nào để cắt' }); return; }
      const r = await startSlice({ projectId, jobs, status });
      if (r) void load();
    },
    /** Sinh ảnh: luôn qua modal M1 (§1.1-2). */
    onGen: (sheets, variantId = null) => {
      const jobs = jobsForSheets(sheets, variantId);
      void openGenFlow({ projectId, project: model.project, contract: model.contract, jobs, status, onStarted: () => load() });
    },
  };

  /** Đổi danh sách sheet → danh sách lượt `<variant>-<sheet>` cho phong cách đang chọn. */
  function jobsForSheets(sheets, variantId = null) {
    const vid = variantId ?? model.variantId ?? model.variants[0]?.id;
    if (!vid) return [];
    const all = jobsLib.normalizeSheets(model.contract).filter((s) => jobsLib.sheetAppliesTo(s, vid));
    const wanted = Array.isArray(sheets) && sheets.length ? all.filter((s) => sheets.includes(s.id)) : all;
    return wanted.map((s) => jobsLib.jobKey(vid, s.id));
  }

  async function load() {
    if (disposed) return;
    model = { ...model, phase: 'loading', error: null };
    render();

    const pr = await data.loadProject(projectId);
    if (disposed) return;
    if (!pr.ok) { model = { ...model, phase: 'error', error: pr.error }; render(); return; }
    model.project = pr.data;
    model.fromCache = pr.fromCache === true;

    if (model.fromCache) {
      // Chế độ chỉ-đọc: không gọi thêm (agent tắt) — vẽ khung + nói rõ ảnh nằm trên máy.
      model.contract = null; model.variants = []; model.kits = new Map();
      model.phase = 'success';
      render();
      return;
    }

    const cr = await data.loadContract(projectId);
    if (disposed) return;
    model.contract = cr.ok ? cr.data.contract : null;
    model.variants = jobsLib.normalizeVariants(model.contract);
    if (!model.variantId || !model.variants.some((v) => v.id === model.variantId)) {
      model.variantId = model.variants[0]?.id ?? null;
    }

    // Tab Ma trận cần kit của MỌI phong cách; tab Assets chỉ cần phong cách đang chọn.
    const need = activeTab === 'matrix' ? model.variants.map((v) => v.id) : [model.variantId].filter(Boolean);
    const kits = new Map(model.kits);
    let hardError = null;
    let notCut = false;
    for (const vid of need) {
      const kr = await data.loadKit(projectId, vid);
      if (disposed) return;
      if (kr.ok) { kits.set(vid, kr.data); if (kr.notCut) notCut = true; }
      else hardError = kr.error;
    }
    model.kits = kits;
    model.notCut = notCut;
    model.kitError = hardError;
    model.phase = 'success';
    render();
  }

  function switchTab(tab) {
    activeTab = TAB_IDS.includes(tab) ? tab : 'assets';
    nav.setTab(activeTab);
    // Tab Ma trận cần thêm dữ liệu của các phong cách khác → nạp thêm rồi vẽ.
    if (activeTab === 'matrix' && model.variants.some((v) => !model.kits.has(v.id))) void load();
    else render();
  }

  function render() {
    const reconnected = shell.syncBanner(status, {
      lastSyncLabel: model.fromCache ? syncLabel(data.cacheFetchedAt()) : null,
    });
    if (reconnected) void load();

    if (model.phase === 'loading') { shell.setContent(loadingStack({ panels: 2, label: 'Đang tải thư viện kit…' })); return; }
    if (model.phase === 'error') {
      const code = model.error?.code;
      if (code === 'PROJECT_NOT_FOUND' || code === 'PROJECT_IN_TRASH') {
        shell.setContent(missingProjectBlock(model.error, { onBack: () => nav.toProjects(), onTrash: () => nav.toSettings('trash') }));
        return;
      }
      shell.setContent(errorBlock(model.error, {
        actions: [
          createButton({ label: 'Thử lại', variant: 'primary', onClick: () => load() }),
          createButton({ label: 'Về tổng quan', variant: 'secondary', onClick: () => nav.toProject(projectId) }),
        ],
      }));
      return;
    }
    shell.setContent(view());
  }

  function view() {
    const ro = isReadOnly(status);
    const kit = model.variantId ? model.kits.get(model.variantId) : null;
    const staleInfo = { staleSheets: staleSheetSet() };

    const variantSel = model.variants.length > 1
      ? createSelect({
          label: 'Phong cách', value: model.variantId ?? '', size: 'sm',
          options: model.variants.map((v) => ({ value: v.id, label: v.label })),
          onChange: () => {
            model.variantId = String(variantSel.value ?? '');
            if (!model.kits.has(model.variantId)) void load(); else render();
          },
        })
      : null;

    const assetsPanel = renderAssetsTab({
      projectId, kit, status, handlers, uiState: ui, readOnly: ro,
      staleInfo, rawPresent: model.project?.stats?.rawPresent ?? 0,
      expectedCount: model.project?.stats?.kitsCut ?? 12,
    });
    const matrixPanel = activeTab === 'matrix'
      ? renderMatrixTab({
          projectId, variants: model.variants, kits: model.kits, status, handlers,
          uiState: ui, readOnly: ro, loading: false,
        })
      : el('div');
    const exportPanel = renderExportTab({
      projectId, project: model.project, variants: model.variants,
      kits: model.kits, status, readOnly: ro, handlers,
    });

    tabsApi = createTabs({
      ariaLabel: 'Thư viện kit',
      active: activeTab,
      tabs: [
        { id: 'assets', label: 'Assets', icon: '▦', panel: assetsPanel },
        { id: 'matrix', label: 'Ma trận so sánh', icon: '▤', panel: matrixPanel },
        { id: 'export', label: 'Xuất', icon: '⬇', panel: exportPanel },
      ],
      onChange: (id) => { if (id !== activeTab) switchTab(id); },
    });

    const stack = el('div', { class: 'kg-stack' }, [
      pageHead({
        title: 'Thư viện kit',
        subtitle: model.project?.name ?? projectId,
        meta: [model.fromCache ? 'dữ liệu từ bộ nhớ tạm' : null].filter(Boolean),
        actions: [
          variantSel ? el('div', { style: { minWidth: '180px' } }, [variantSel.el]) : null,
          gateButton(createButton({
            label: 'Cắt lại', variant: 'secondary', icon: '✂',
            onClick: () => handlers.onSlice(null),
          }), status),
          createButton({ label: 'Về tổng quan', variant: 'ghost', icon: '◧', onClick: () => nav.toProject(projectId) }),
        ].filter(Boolean),
      }),
    ]);

    if (model.kitError) {
      // manifest hỏng / không đọc được (§3-S5 error) — banner + 2 nút, KHÔNG trắng trang
      stack.appendChild(createBanner({
        kind: 'error',
        title: 'Không đọc được danh mục kit trên máy bạn.',
        actions: [
          gateButton(createButton({ label: 'Cắt lại', variant: 'secondary', size: 'sm', icon: '✂', onClick: () => handlers.onSlice(null) }), status),
          createButton({ label: 'Mở thư mục', variant: 'ghost', size: 'sm', onClick: () => revealFolder(projectId) }),
        ],
      }));
    }
    if (model.fromCache) {
      stack.appendChild(panel({ children: [
        el('p', { class: 'kg-t-body kg-fg-default',
          text: 'Chưa đọc được file kit vì công cụ local không chạy. Số liệu bên dưới lấy từ bộ nhớ tạm; ảnh nằm trên máy bạn.' }),
        el('p', { class: 'kg-t-caption kg-fg-default',
          text: `Đã cắt (lần cuối biết được): ${fmt.count(model.project?.stats?.kitsCut ?? 0, 'file')}.` }),
      ] }));
      return stack;
    }
    stack.appendChild(tabsApi.el);
    return stack;
  }

  /** Sheet nào đang stale/uncut ⇒ file kit của nó cũ hơn thiết kế (nguồn: state.jobs). */
  function staleSheetSet() {
    const out = new Set();
    const jobsMap = model.project?.state?.jobs ?? {};
    const vid = model.variantId;
    for (const s of jobsLib.normalizeSheets(model.contract)) {
      const st = vid ? jobsMap[jobsLib.jobKey(vid, s.id)] : null;
      if (st === 'stale' || st === 'uncut') out.add(s.id);
    }
    return out;
  }

  /** ⌘⇧E mở tab Xuất (§3-S5 phím tắt). */
  const onKey = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      switchTab('export');
      tabsApi?.setActive('export');
    }
  };
  document.addEventListener('keydown', onKey);

  void load();

  return {
    el: container,
    update({ status: next, tab } = {}) {
      if (next) status = next;
      if (tab && TAB_IDS.includes(tab) && tab !== activeTab) { activeTab = tab; }
      render();
    },
    reload: () => load(),
    title: () => model.project?.name ?? null,
    destroy() {
      disposed = true;
      document.removeEventListener('keydown', onKey);
      shell.destroy();
    },
  };
}

/* ── Hợp đồng mount của app-shell (screen id `kit`) ── */
export const mount = toShellMount(mountKit);
export default mount;
