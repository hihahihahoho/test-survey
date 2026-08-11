/**
 * design/index.js — S3 TRÌNH SOẠN BẢN THIẾT KẾ · /p/:id/design (UX-SPEC §3-S3, độ khó XL).
 *
 * Hợp đồng mount (xem teams/design/NEEDS-d2p3.md §1):
 *   const s3 = createDesignScreen({ projectId, tab, readOnly, navigate, onDirty });
 *   host.appendChild(s3.el);  s3.update({ tab, readOnly });  s3.destroy();
 *
 * 4 trạng thái BẮT BUỘC: empty (0 sheet) · loading (skeleton 3 cột) · error · success.
 * Agent chưa chạy ⇒ chỉ-đọc: nút disabled + nêu lý do, KHÔNG ẩn, nháp vẫn ghi IDB (§4.9).
 */

import {
  createButton, createEmptyState, createErrorState, createSkeleton,
  createTabs, el, clear, toast,
} from '../../ui/index.js';
import { api, errors, router } from '../../core/index.js';
import { readOnlyReason } from '../shared/read-only.js';
import { ensureScreenCss } from './css.js';
import { createEditorState } from './state.js';
import { validateContract } from './validate.js';
import { createActions } from './actions.js';
import { createDesignTree } from './tree.js';
import { createCanvas } from './canvas.js';
import { createPropsPanel } from './props.js';
import { createStylesTab } from './styles-tab.js';
import { createAdvancedTab } from './advanced-tab.js';
import { createSaveBar } from './save-bar.js';
import { openHistoryDrawer } from './safety.js';
import { cachedElements } from './library-drawer.js';
import { bindShortcuts } from './shortcuts.js';
import { createLoader } from './loader.js';
import { createGlue } from './glue.js';
import { s3Commands } from './commands.js';
import * as ops from './ops.js';
import * as opsStyle from './ops-style.js';

const TABS = ['sheets', 'styles', 'advanced'];

export function createDesignScreen(opts = {}) {
  ensureScreenCss();
  const projectId = String(opts.projectId ?? '');
  let tab = TABS.includes(opts.tab) ? opts.tab : 'sheets';
  let readOnly = Boolean(opts.readOnly);
  const navigate = typeof opts.navigate === 'function' ? opts.navigate : (p) => router.navigate(p);

  const root = el('div', { class: 'd-screen' });
  // QA-UX THẤP-A · S3 từng thiếu <h1> (§5.8-A13); sr-only ⇒ không đổi pixel nào.
  const srTitle = el('h1', { class: 'kg-sr-only', text: 'Bản thiết kế' });
  const bannerSlot = el('div', {});
  const bodySlot = el('div', { style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: '0' } });

  /** phase: 'loading' | 'ready' | 'error' */
  let phase = 'loading';
  let loadError = null;
  let selection = null;         // { kind:'sheet'|'element'|'character', ... }
  let projectState = { jobs: {}, stale: false };
  let refs = [];
  let validation = { errors: [], warnings: [], byTarget: new Map(), ok: true };
  let unbindShortcuts = () => {};
  let unbindUnload = () => {};

  const state = createEditorState({
    projectId,
    onDirty: (d) => { if (typeof opts.onDirty === 'function') opts.onDirty(d); },
    onChange: () => { revalidate(); },
  });

  const actions = createActions({
    state, projectId,
    getSelection: () => selection,
    setSelection: (s) => { selection = normalizeSelection(s); },
    rerender: () => render(),
    readOnly: () => readOnly,
    openLibrary: () => openLibrary(),
    openGenModal: () => openGen(),
    startSlice: (sheetId) => startSlice(sheetId),
  });

  const glue = createGlue({
    projectId, state,
    readOnly: () => readOnly,
    currentSheetId: () => currentSheetId(),
    projectState: () => projectState,
    actions: () => actions,
    save: (o) => actions.save(o),
    navigate,
  });
  const sheetMenuItems = (sh) => glue.sheetMenuItems(sh);
  const openLibrary = () => glue.openLibrary();
  const openGen = (o) => glue.openGen(o);
  const startSlice = (id) => glue.startSlice(id);
  const pickCharacterRef = (id) => glue.pickCharacterRef(id);

  /* ── các vùng ──────────────────────────────────────────────────────────── */
  const saveBar = createSaveBar({
    onSave: () => actions.save(),
    onUndo: () => { const l = state.undo(); if (l) toast.info({ title: 'Đã hoàn tác', description: l }); render(); },
    onRedo: () => { const l = state.redo(); if (l) toast.info({ title: 'Đã làm lại', description: l }); render(); },
    onHistory: () => openHistoryDrawer({
      projectId, currentVersion: state.version,
      onRestored: () => reload({ keepSelection: true }),
    }),
    onLibrary: () => openLibrary(),
  });

  const tree = createDesignTree({
    readOnly,
    refUrl: (p) => (p ? api.files.thumbUrl(projectId, p) : null),
    onSelect: (sel) => { selection = normalizeSelection(sel); render(); },
    onAddSheet: (e) => actions.addSheet(e?.currentTarget ?? null),
    onAddCharacter: () => actions.addCharacter(),
    onAddVariant: () => actions.addVariant(),
    onMoveSheet: (id, d) => actions.moveSheet(id, d),
    onOpenStyles: () => setTab('styles'),
    onSheetMenu: (sh) => sheetMenuItems(sh),
  });

  const canvas = createCanvas({
    onSelectCell: (i) => { selection = { kind: 'element', sheetId: currentSheetId(), index: i }; renderProps(); },
    onMoveCell: (from, to) => actions.moveCell(currentSheetId(), from, to),
    onDeleteCell: (i) => actions.deleteCell(currentSheetId(), i),
    onResizeGrid: (id) => actions.resizeGrid(id),
    onGenSheet: (id) => openGen({ sheetId: id }),
    onSliceSheet: (id) => startSlice(id),
    onLibrary: () => openLibrary(),
    onJumpToIssue: (item) => jumpTo(item.target),
  });

  const props = createPropsPanel({
    libEntryFor: (file) => cachedElements().find((e) => e.file === file) ?? null,
    refUrl: (p) => (p ? api.files.thumbUrl(projectId, p) : null),
    onPatchCell: (i, patch, label) => actions.patchCell(currentSheetId(), i, patch, label),
    onDeleteCell: (i) => actions.deleteCell(currentSheetId(), i),
    onResetToLib: (i) => {
      const sheet = ops.findSheet(state.contract, currentSheetId());
      const file = sheet?.components?.[i]?.file;
      actions.resetToLib(currentSheetId(), i, cachedElements().find((e) => e.file === file));
    },
    onPatchSheet: (patch, kind) => actions.patchSheet(currentSheetId(), patch, kind),
    onDeleteSheet: (id) => actions.removeSheet(id),
    onToggleSheetVariant: (vid, on) => actions.toggleSheetVariant(currentSheetId(), vid, on),
    onPatchCharacter: (id, patch, label) => actions.patchCharacter(id, patch, label),
    onDeleteCharacter: (id) => actions.removeCharacter(id),
    onTogglePose: (id, pose, on) => actions.togglePose(id, pose, on),
    onPickRef: (id) => pickCharacterRef(id),
    onGenSheet: (id) => openGen({ sheetId: id }),
    onSliceSheet: (id) => startSlice(id),
  });

  const stylesTab = createStylesTab({
    refUrl: (p) => (p ? api.files.thumbUrl(projectId, p) : null),
    jobCountFor: (vid) => ops.contractJobs(state.contract).filter((j) => j.variant === vid).length,
    onAddVariant: () => actions.addVariant(),
    onPatchVariant: (id, patch, label) => actions.patchVariant(id, patch, label),
    onDuplicateVariant: (id) => actions.duplicateVariant(id),
    onRemoveVariant: (id) => actions.removeVariant(id),
    onToggleCharacter: (vid, cid, on) => actions.toggleCharacterInVariant(vid, cid, on),
    onUploadRef: (vid, kind, files) => actions.uploadRefs(vid, kind, files),
    onRemoveRef: (vid, kind, p) => actions.removeRefFromVariant(vid, kind, p),
  });

  const advancedTab = createAdvancedTab({
    onPatchSlice: (patch, scope) => actions.patchSlice(patch, scope),
    onSetAllBg: (kind) => actions.setAllBg(kind),
  });

  const tabs = createTabs({
    ariaLabel: 'Phần của bản thiết kế',
    tabs: [
      { id: 'sheets', label: 'Sheet & element', icon: '▦', panel: el('div') },
      { id: 'styles', label: 'Phong cách', icon: '◐', panel: el('div') },
      { id: 'advanced', label: 'Nâng cao', icon: '⚙', panel: el('div') },
    ],
    active: tab,
    onChange: (id) => setTab(id),
  });
  saveBar.setTabs(tabs.tablist);

  root.append(srTitle, saveBar.el, bannerSlot, bodySlot);

  /* ── helpers ───────────────────────────────────────────────────────────── */

  function currentSheetId() {
    if (selection?.sheetId) return selection.sheetId;
    return (state.contract?.sheets ?? [])[0]?.id ?? null;
  }
  function normalizeSelection(s) {
    if (!s) return null;
    if (s.kind === 'sheet' && s.sheetId === null) return null;
    return s;
  }
  function setTab(next) {
    tab = TABS.includes(next) ? next : 'sheets';
    try { router.setTab(tab); } catch { /* router chưa start (test) thì bỏ qua */ }
    if (tabs.activeId !== tab) tabs.setActive(tab);
    render();
  }
  function revalidate() {
    validation = validateContract(state.contract, { refNames: refs.map((r) => r.name) });
    renderSaveBar();
  }
  function renderSaveBar() {
    saveBar.update({
      version: state.version, dirty: state.dirty, pending: state.pendingCount,
      savedAt: state.lastSavedAt, draftSavedAt: state.draftSavedAt,
      canUndo: state.canUndo, canRedo: state.canRedo,
      undoLabel: state.undoLabel, redoLabel: state.redoLabel,
      validation, readOnly,
    });
  }

  /** Nhảy tới đúng chỗ sai từ thanh Validate (§3-S3.4). */
  function jumpTo(target) {
    if (!target) return;
    if (target.kind === 'element') {
      selection = { kind: 'element', sheetId: target.sheetId, index: target.index };
      setTab('sheets');
      canvas.selectCell(target.index);
      return;
    }
    if (target.kind === 'sheet') { selection = { kind: 'sheet', sheetId: target.sheetId }; setTab('sheets'); return; }
    if (target.kind === 'variant') { selection = { kind: 'variant', variantId: target.variantId }; setTab('styles'); return; }
    if (target.kind === 'character') { selection = { kind: 'character', characterId: target.characterId }; setTab('sheets'); }
  }

  /* ── render ────────────────────────────────────────────────────────────── */

  function render() {
    renderSaveBar();
    clear(bodySlot);

    if (phase === 'loading') { bodySlot.appendChild(skeleton()); return root; }
    if (phase === 'error') { bodySlot.appendChild(errorView()); return root; }

    if (tab === 'styles') {
      bodySlot.appendChild(el('div', { class: 'd-pane' }, [
        stylesTab.render({ contract: state.contract, readOnly, validation, refs }),
      ]));
      return root;
    }
    if (tab === 'advanced') {
      bodySlot.appendChild(el('div', { class: 'd-pane' }, [
        advancedTab.render({ contract: state.contract, readOnly }),
      ]));
      return root;
    }

    const sheets = state.contract?.sheets ?? [];
    const panes = el('div', { class: 'd-panes' });
    panes.appendChild(el('div', { class: 'd-pane' }, [treeNode()]));

    if (sheets.length === 0) {
      // empty (0 sheet): vùng ②③ thay bằng khối giữa (§3-S3 bảng trạng thái)
      panes.appendChild(el('div', { class: 'd-pane d-pane--canvas', style: { gridColumn: 'span 2' } }, [
        createEmptyState({
          icon: '▦', title: 'Chưa có sheet nào',
          description: 'Sheet là một ảnh AI chứa nhiều element xếp theo lưới. Bắt đầu bằng cách chọn element từ thư viện.',
          primary: createButton({
            label: 'Chọn từ thư viện element', variant: 'primary', size: 'lg',
            disabled: readOnly, tooltip: readOnly ? readOnlyReason() : null,
            onClick: () => openLibrary(),
          }),
          secondary: createButton({
            label: 'Tạo sheet trống', variant: 'secondary', size: 'lg',
            disabled: readOnly, onClick: () => actions.addSheet(),
          }),
        }),
      ]));
      bodySlot.appendChild(panes);
      return root;
    }

    panes.appendChild(canvas.render({
      sheet: ops.findSheet(state.contract, currentSheetId()),
      readOnly, validation, projectId,
      variants: state.contract?.variants ?? [],
      jobStates: projectState.jobs ?? {},
    }));
    panes.appendChild(el('div', { class: 'd-pane' }, [props.el]));
    bodySlot.appendChild(panes);
    renderProps();
    return root;
  }

  function treeNode() {
    tree.update({
      sheets: state.contract?.sheets ?? [],
      characters: opsStyle.allCharacters(state.contract),
      variants: state.contract?.variants ?? [],
      jobStates: projectState.jobs ?? {},
      readOnly,
    });
    tree.setSelection(selection);
    return tree.el;
  }

  function renderProps() {
    const sheet = ops.findSheet(state.contract, currentSheetId());
    const character = selection?.kind === 'character'
      ? opsStyle.allCharacters(state.contract).find((c) => c.id === selection.characterId)
      : null;
    props.render(selection ?? (sheet ? { kind: 'sheet', sheetId: sheet.id } : null), {
      sheet, character, contract: state.contract, readOnly, validation,
    });
  }

  function skeleton() {
    const col = () => el('div', { class: 'd-pane' }, [
      createSkeleton({ variant: 'title' }),
      createSkeleton({ variant: 'text', count: 6 }),
    ]);
    return el('div', { class: 'd-panes', 'aria-busy': 'true' }, [col(), col(), col()]);
  }

  function errorView() {
    const view = errors.present(loadError);
    return el('div', { class: 'd-pane' }, [
      createErrorState({
        title: view.title, description: view.explain,
        actions: [
          createButton({ label: 'Thử lại', variant: 'primary', onClick: () => reload() }),
          createButton({ label: 'Về tổng quan project', variant: 'secondary', onClick: () => navigate(`/p/${encodeURIComponent(projectId)}`) }),
        ],
        devDetails: errors.devDetails(loadError),
      }),
    ]);
  }

  /* ── khởi động ─────────────────────────────────────────────────────────── */

  const loader = createLoader({
    state, projectId, bannerSlot,
    setPhase: (p) => { phase = p; },
    setError: (e) => { loadError = e; },
    setSelection: (s) => { selection = s; },
    setProjectState: (s) => { projectState = s; },
    setRefs: (r) => { refs = r; },
    revalidate: () => revalidate(),
    render: () => render(),
  });
  const reload = (o) => loader.reload(o);

  unbindUnload = state.bindBeforeUnload();
  unbindShortcuts = bindShortcuts({
    onSave: () => actions.save(),
    onSaveAndGen: () => actions.save({ thenOpenGen: true }),
    onUndo: () => { const l = state.undo(); if (l) toast.info({ title: 'Đã hoàn tác', description: l }); render(); },
    onRedo: () => { const l = state.redo(); if (l) toast.info({ title: 'Đã làm lại', description: l }); render(); },
    onLibrary: () => openLibrary(),
    onPrevSheet: () => stepSheet(-1),
    onNextSheet: () => stepSheet(1),
  });

  function stepSheet(delta) {
    const sheets = state.contract?.sheets ?? [];
    if (sheets.length === 0) return;
    const i = Math.max(0, sheets.findIndex((s) => s.id === currentSheetId()));
    const next = sheets[(i + delta + sheets.length) % sheets.length];
    selection = { kind: 'sheet', sheetId: next.id };
    render();
  }

  reload();

  return {
    el: root,
    update({ tab: nextTab, readOnly: nextReadOnly } = {}) {
      if (nextTab !== undefined && TABS.includes(nextTab) && nextTab !== tab) {
        tab = nextTab;
        if (tabs.activeId !== tab) tabs.setActive(tab);
      }
      if (nextReadOnly !== undefined) readOnly = Boolean(nextReadOnly);
      render();
    },
    /** Cho d2p1: rail hiện dấu • khi có thay đổi chưa lưu. */
    isDirty: () => state.dirty,
    /** §2.3: lệnh của S3 góp vào ⌘K — xem design/commands.js. */
    commands: () => s3Commands({
      state,
      readOnly,
      onSave: () => actions.save(),
      onSaveAndGen: () => actions.save({ thenOpenGen: true }),
      onUndo: () => { const l = state.undo(); if (l) toast.info({ title: 'Đã hoàn tác', description: l }); render(); },
      onRedo: () => { const l = state.redo(); if (l) toast.info({ title: 'Đã làm lại', description: l }); render(); },
      onLibrary: () => openLibrary(),
      onHistory: () => openHistoryDrawer({
        projectId, currentVersion: state.version, onRestored: () => reload({ keepSelection: true }),
      }),
    }),
    destroy() {
      unbindShortcuts();
      unbindUnload();
      state.destroy();
      clear(root);
    },
  };
}

export default createDesignScreen;
