/**
 * screens/projects/index.js — S1 DANH SÁCH PROJECT (`/`, UX-SPEC §3-S1).
 * Hợp đồng màn: export mount(host, ctx) → handle (xem app-shell/screen-registry.js).
 *
 * Trách nhiệm ở file này: vòng đời + điều phối. Phần nặng đã tách:
 *   data.js (nạp/lọc/cache) · card.js (thẻ) · list-view.js (bảng + bulk) ·
 *   toolbar.js · states.js (4 trạng thái) · grid-keys.js (bàn phím) · crud/** (§4).
 *
 * 4 trạng thái §3-S1 đều có: empty (2 loại) · loading (2 loại) · error (2 loại) · success.
 * Agent chưa chạy ⇒ vẽ từ cache, nhãn `cache`, nút disabled + lý do (§2.5, §4.9).
 */

import { api, router, store } from '../../core/index.js';
import { createButton, createTopProgress, el, setDisabled, toast } from '../../ui/index.js';
import { copyText } from '../../app-shell/chrome.js';
import { RUN_CMD } from '../../app-shell/commands.js';
import * as agentStatus from '../../app-shell/agent-status.js';
import { createProjectCard } from './card.js';
import {
  applyView, chipCounts, fetchList, fetchTrashCount, readCache, readUiPrefs, writeCache, writeUiPrefs,
} from './data.js';
import { createBulkBar, createListView } from './list-view.js';
import { createToolbar } from './toolbar.js';
import { attachGridKeys } from './grid-keys.js';
import { openJump } from './jump.js';
import * as states from './states.js';
import { openCreateModal, openRenameModal } from './crud/create.js';
import { openDuplicateModal } from './crud/duplicate.js';
import { cleanProject, deleteProject, deleteProjects } from './crud/remove.js';
import { exportMany, openExportModal } from './crud/export-zip.js';
import { openImportWizard } from './crud/import-wizard.js';
import { openBrokenDetail } from './broken.js';

export function mount(host, ctx) {
  const prefs = readUiPrefs();
  const view = { query: prefs.query, chip: prefs.chip, tags: prefs.tags, sortBy: prefs.sortBy, dir: prefs.dir, mode: prefs.view };
  const st = {
    items: [],           // dữ liệu đang vẽ
    etag: null,
    scannedAt: null,
    fromCache: false,
    loading: true,
    error: null,
    selection: [],
    trashCount: 0,
  };

  /* ── Khung màn ─────────────────────────────────────────────────────────── */
  const title = el('h1', { text: 'Projects' });
  const countSlot = el('div');
  const btnCreate = createButton({ label: '＋ Tạo project', variant: 'primary', onClick: () => actions.create() });
  const btnImport = createButton({ label: '⇧ Nhập', variant: 'secondary', onClick: () => actions.import() });
  const btnRefresh = createButton({
    variant: 'ghost', icon: '↻', iconOnly: true, ariaLabel: 'Làm mới danh sách',
    tooltip: 'Làm mới danh sách', onClick: () => load({ force: true }),
  });

  const head = el('div', { class: 'kg-page-head' }, [
    el('div', { class: 'kg-page-head__text' }, [title, countSlot]),
    el('div', { class: 'kg-page-head__actions' }, [btnRefresh, btnImport, btnCreate]),
  ]);

  const toolbar = createToolbar({ view, onChange: (partial) => onViewChange(partial) });
  const progressSlot = el('div');
  const content = el('div');
  const footer = el('div', { class: 'kg-row', style: { marginTop: 'var(--s-5)' } });
  const bulk = createBulkBar({
    onExport: () => actions.exportSelected(),
    onDelete: () => actions.deleteSelected(),
    onTag: () => actions.tagSelected(),
    onClear: () => { st.selection = []; render(); },
    readOnly: agentStatus.isReadOnly(),
    reason: agentStatus.disabledReason(),
  });

  host.replaceChildren(head, toolbar.el, progressSlot, content, footer, bulk.el);

  /* ── Hành động (§4) ────────────────────────────────────────────────────── */
  const actions = {
    open(p) {
      if (p.broken) { openBrokenDetail(p); return; }
      try { store.rememberOpenedProject(p.id); } catch { /* không được phá điều hướng */ }
      router.go('S2', { id: p.id });
    },
    // Cố ý điều hướng vào S2 chứ KHÔNG mở modal M1 tại đây: từ danh sách, S1 chưa nạp
    // contract nên không biết tập lượt hợp lệ; mở M1 với dữ liệu thiếu là vi phạm §4.8.
    // S2 là nơi có đủ dữ liệu để mở M1 (và mọi đường sinh ảnh đều phải qua M1 — §7.3).
    nextStep(p) { router.go('S2', { id: p.id }); },
    create() {
      openCreateModal({
        existing: st.items,
        readOnly: agentStatus.isReadOnly(),
        reason: agentStatus.disabledReason(),
        onCreated: (project, template) => {
          load({ force: true });
          if (!project?.id) return;
          if (template === 'blank') router.go('S3', { id: project.id }, { tab: 'sheets' });
          else router.go('S2', { id: project.id });
        },
        onNeedImport: (preset) => actions.import(preset),
        onNeedDuplicate: () => {
          if (st.items.length === 0) {
            toast.info({ title: 'Chưa có project nào để nhân bản', description: 'Tạo project đầu tiên bằng template Kit cơ bản.' });
            return;
          }
          openJump({
            items: st.items.filter((p) => !p.broken),
            title: 'Nhân bản từ project nào?',
            onPick: (p) => actions.duplicate(p),
          });
        },
      });
    },
    import(preset = {}) {
      openImportWizard({
        presetName: preset.name ?? '',
        presetTags: preset.tags ?? [],
        readOnly: agentStatus.isReadOnly(),
        reason: agentStatus.disabledReason(),
        onImported: (project, { open }) => {
          load({ force: true });
          if (open && project?.id) router.go('S2', { id: project.id });
        },
      });
    },
    rename(p) {
      openRenameModal({ project: p, existing: st.items, onRenamed: () => load({ force: true }) });
    },
    duplicate(p) {
      openDuplicateModal({
        project: p, existing: st.items,
        readOnly: agentStatus.isReadOnly(), reason: agentStatus.disabledReason(),
        onDone: (target, { back }) => {
          load({ force: true });
          if (!target?.id) return;
          // §4.3: xong thì mở ngay project mới ở tab Phong cách (việc tiếp theo chắc chắn).
          if (back) router.go('S2', { id: target.id });
          else router.go('S3', { id: target.id }, { tab: 'styles' });
        },
      });
    },
    exportZip(p) {
      openExportModal({ project: p, readOnly: agentStatus.isReadOnly(), reason: agentStatus.disabledReason() });
    },
    async reveal(p) {
      try {
        await api.projects.reveal(p.id);
        toast.success({ title: 'Đã mở thư mục trên máy' });
      } catch (e) {
        const { present } = await import('../../core/errors.js');
        const v = present(e);
        toast.error({ title: v.title, description: v.explain });
      }
    },
    clean(p) { cleanProject({ project: p, onCleaned: () => load({ force: true }) }); },
    remove(p) {
      deleteProject({
        project: p,
        onDeleted: (x) => { st.items = st.items.filter((i) => i.id !== x.id); render(); },
        onRestored: () => load({ force: true }),
      });
    },
    showBrokenDetail(p) { openBrokenDetail(p); },
    selected() { return st.items.filter((p) => st.selection.includes(p.id)); },
    exportSelected() { exportMany(actions.selected()); },
    deleteSelected() {
      deleteProjects({
        projects: actions.selected(),
        onDeleted: (x) => { st.items = st.items.filter((i) => i.id !== x.id); },
        onRestored: () => load({ force: true }),
      });
      st.selection = [];
    },
    async tagSelected() {
      const picked = actions.selected();
      const { openTagModal } = await import('./tag-many.js');
      openTagModal({ projects: picked, onDone: () => { st.selection = []; load({ force: true }); } });
    },
    jump() { openJump({ items: st.items, onPick: (p) => actions.open(p) }); },
  };

  /* ── Nạp dữ liệu ───────────────────────────────────────────────────────── */
  async function load({ force = false } = {}) {
    const status = agentStatus.status();
    const cache = readCache(status.health?.workspaceFingerprint ?? null);

    if (!status.connected) {
      // §2.5-4: vẽ từ cache, xám + nhãn cache; không có cache thì khối lỗi giữa màn.
      if (cache) {
        st.items = cache.items ?? [];
        st.fromCache = true;
        st.scannedAt = cache.fetchedAt ?? null;
        st.loading = false;
        st.error = null;
      } else {
        st.items = [];
        st.fromCache = false;
        st.loading = status.pill === 'checking';
        st.error = status.pill === 'checking' ? null : { agent: true, status };
      }
      render();
      return;
    }

    // Có cache thì vẽ NGAY rồi làm mới (§3-S1 "loading có cache": progress 2px ở đỉnh).
    if (cache && st.items.length === 0) {
      st.items = cache.items ?? [];
      st.fromCache = true;
      st.loading = false;
      render();
    }
    progressSlot.replaceChildren(createTopProgress());
    if (st.items.length === 0) { st.loading = true; render(); }

    try {
      const res = await fetchList({ etag: force ? null : st.etag });
      if (res.notModified) {
        st.etag = res.etag ?? st.etag;
      } else {
        st.items = res.items;
        st.etag = res.etag;
        st.scannedAt = res.scannedAt;
        st.fromCache = false;
        writeCache(res.items, { etag: res.etag ?? '', fingerprint: res.workspaceFingerprint ?? '' });
      }
      st.error = null;
    } catch (e) {
      // Còn cache thì giữ cache + báo bằng toast; không có gì thì khối lỗi giữa màn.
      if (st.items.length > 0) {
        const { present } = await import('../../core/errors.js');
        const v = present(e);
        toast.error({ title: v.title, description: v.explain });
      } else {
        st.error = { err: e };
      }
    } finally {
      st.loading = false;
      progressSlot.replaceChildren();
      render();
    }
    st.trashCount = await fetchTrashCount();
    renderFooter();
  }

  function onViewChange(partial) {
    Object.assign(view, partial);
    if (partial.mode) writeUiPrefs({ projectsView: partial.mode });
    if (partial.sortBy) writeUiPrefs({ sortBy: partial.sortBy });
    if (partial.query !== undefined) writeUiPrefs({ filterQuery: partial.query });
    // §3-S1-1: chip + tag + chiều sort cũng lưu (schema kitgen.ui.v1 đã có chỗ) ⇒ F5 giữ nguyên bộ lọc.
    if (partial.chip !== undefined) writeUiPrefs({ filterChip: partial.chip });
    if (partial.tags !== undefined) writeUiPrefs({ filterTags: (partial.tags ?? []).slice(0, 10) });
    if (partial.dir !== undefined) writeUiPrefs({ sortDir: partial.dir });
    render();
  }

  /* ── Vẽ ────────────────────────────────────────────────────────────────── */
  let gridKeys = null;

  function render() {
    const status = agentStatus.status();
    const readOnly = agentStatus.isReadOnly();
    const reason = agentStatus.disabledReason();

    // QA-UX CAO-A: trước đây gate bằng tay + chỉ đặt `title=` ⇒ lý do chỉ tới được
    // người dùng CHUỘT (title là hành vi của UA), screen reader và người dùng bàn
    // phím không nghe được gì. `setDisabled` của primitive nối lý do vào a11y tree
    // (aria-describedby) — dùng nó để S1 không còn là ngoại lệ so với 7 màn kia.
    for (const b of [btnCreate, btnImport]) setDisabled(b, readOnly, readOnly ? reason : null);

    const counts = chipCounts(st.items);
    toolbar.render({ items: st.items, counts, chip: view.chip, tags: view.tags });

    if (gridKeys) { gridKeys(); gridKeys = null; }

    if (st.loading && st.items.length === 0) {
      countSlot.replaceChildren();
      content.replaceChildren(states.loadingSkeleton(6));
      return;
    }
    if (st.error?.agent) {
      countSlot.replaceChildren();
      content.replaceChildren(states.errorNoAgent({
        status: st.error.status ?? status,
        onCopyCmd: async () => {
          const ok = await copyText(RUN_CMD);
          if (ok) toast.success({ title: 'Đã copy lệnh', description: RUN_CMD });
          else toast.info({ title: 'Không copy được', description: `Gõ tay: ${RUN_CMD}` });
        },
        onRetry: () => agentStatus.refresh().then(() => load({ force: true })),
        onOpenMirror: () => { window.location.href = status.mirrorUrl; },
      }));
      return;
    }
    if (st.error?.err) {
      countSlot.replaceChildren();
      content.replaceChildren(states.errorLoadFailed({ err: st.error.err, onRetry: () => load({ force: true }) }));
      return;
    }
    if (st.items.length === 0) {
      countSlot.replaceChildren();
      content.replaceChildren(states.emptyNoProjects({
        onCreate: () => actions.create(), onImport: () => actions.import(), readOnly, reason,
      }));
      return;
    }

    const shown = applyView(st.items, view);
    countSlot.replaceChildren(states.countLine({
      shown: shown.length, total: st.items.length, scannedAt: st.scannedAt, fromCache: st.fromCache,
    }));

    if (shown.length === 0) {
      content.replaceChildren(states.emptyNoMatch({
        query: view.query || view.tags.join(', ') || view.chip,
        onClear: () => {
          view.query = ''; view.chip = 'all'; view.tags = [];
          toolbar.setQuery('');
          writeUiPrefs({ filterQuery: '' });
          render();
        },
      }));
      return;
    }

    if (view.mode === 'list') {
      const table = createListView({
        items: shown, actions, readOnly, reason, sortBy: view.sortBy,
        onSort: (key) => onViewChange({ sortBy: key }),
        onSelectionChange: (sel) => { st.selection = sel; bulk.update(sel.length); },
      });
      content.replaceChildren(table.el);
      bulk.update(st.selection.length);
      return;
    }

    const grid = el('div', { class: 'kg-grid', role: 'list', 'aria-label': 'Danh sách project' });
    for (const p of shown) {
      const card = createProjectCard(p, actions, { readOnly, reason, fromCache: st.fromCache });
      card.setAttribute('role', 'listitem');
      grid.appendChild(card);
    }
    content.replaceChildren(grid);
    gridKeys = attachGridKeys(grid, {
      onOpen: (id) => { const p = shown.find((x) => x.id === id); if (p) actions.open(p); },
      onDelete: (id) => { const p = shown.find((x) => x.id === id); if (p && !readOnly) actions.remove(p); },
      onRename: (id) => { const p = shown.find((x) => x.id === id); if (p && !readOnly) actions.rename(p); },
      onDuplicate: (id) => { const p = shown.find((x) => x.id === id); if (p && !readOnly) actions.duplicate(p); },
    });
    bulk.update(0);
  }

  function renderFooter() {
    footer.replaceChildren();
    if (st.trashCount > 0) {
      footer.appendChild(createButton({
        label: `Thùng rác ${st.trashCount} project ›`, variant: 'link',
        onClick: () => router.go('S6', {}, { tab: 'trash' }),
      }));
    }
  }

  /* ── Phím tắt của màn (§3-S1) ──────────────────────────────────────────── */
  function onKey(e) {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    if (typing) return;
    if (e.metaKey || e.ctrlKey) {
      if (e.key.toLowerCase() === 'p') { e.preventDefault(); actions.jump(); }
      return;
    }
    if (e.key === '/') { e.preventDefault(); toolbar.focusSearch(); }
    else if (e.key === 'n' && !agentStatus.isReadOnly()) { e.preventDefault(); actions.create(); }
    else if (e.key === 'v') { e.preventDefault(); onViewChange({ mode: view.mode === 'grid' ? 'list' : 'grid' }); }
  }
  document.addEventListener('keydown', onKey);
  const unsubStatus = agentStatus.subscribe(() => load());

  load();

  return {
    destroy() {
      document.removeEventListener('keydown', onKey);
      unsubStatus();
      if (gridKeys) gridKeys();
      bulk.el.remove();
    },
    status() { render(); },
    route() { /* S1 không có tab/param */ },
    jump: () => actions.jump(),
    title: () => null,
  };
}
