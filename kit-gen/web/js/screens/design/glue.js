/**
 * design/glue.js — cầu nối từ S3 sang các overlay & hành động chạy dài:
 * menu ⋯ của sheet · drawer thư viện element · modal M1 Sinh ảnh · chạy Cắt · chọn ảnh nhân vật.
 * Tách khỏi index.js để mỗi file dưới ~400 dòng.
 */

import { toast } from '../../ui/index.js';
import { readOnlyReason } from '../shared/read-only.js';
import { api, errors } from '../../core/index.js';
import { openLibraryDrawer } from './library-drawer.js';
import { openGenModal } from '../runs/gen-modal.js';
import * as ops from './ops.js';

export function createGlue(env) {
  const { projectId, state, navigate } = env;
  const readOnly = () => env.readOnly();
  const actions = () => env.actions();

  function sheetMenuItems(sh) {
    const reason = readOnlyReason();
    return [
      { label: 'Đổi tên', icon: '✎', disabled: readOnly(), disabledReason: reason, onSelect: () => actions().renameSheet(sh.id) },
      { label: 'Nhân bản sheet', icon: '⧉', disabled: readOnly(), disabledReason: reason, onSelect: () => actions().duplicateSheet(sh.id) },
      { label: 'Đổi lưới…', icon: '⊞', disabled: readOnly(), disabledReason: reason, onSelect: () => actions().resizeGrid(sh.id) },
      'separator',
      { label: 'Sinh sheet này…', icon: '⚡', disabled: readOnly(), disabledReason: reason, onSelect: () => openGen({ sheetId: sh.id }) },
      { label: 'Cắt sheet này', icon: '✂️', disabled: readOnly(), disabledReason: reason, onSelect: () => startSlice(sh.id) },
      'separator',
      { label: 'Xoá sheet', icon: '🗑', danger: true, disabled: readOnly(), disabledReason: reason, onSelect: () => actions().removeSheet(sh.id) },
    ];
  }

  function openLibrary() {
    openLibraryDrawer({
      sheets: state.contract?.sheets ?? [],
      activeSheetId: env.currentSheetId(),
      onAdd: (els, target) => actions().addFromLibrary(els, target),
    });
  }

  function openGen({ sheetId = null } = {}) {
    openGenModal({
      projectId,
      contract: state.contract,
      jobStates: env.projectState().jobs ?? {},
      onlySheetId: sheetId,
      dirty: state.dirty,
      onSaveFirst: () => env.save(),
      navigate,
    });
  }

  async function startSlice(sheetId) {
    if (readOnly()) return;
    const jobs = ops.contractJobs(state.contract).filter((j) => j.sheet === sheetId).map((j) => j.job);
    if (jobs.length === 0) return;
    try {
      const res = await api.runs.start(projectId, { kind: 'slice', jobs, maxJobs: 4, autoSliceAfterGen: false });
      toast.success({ title: `Đang cắt sheet «${sheetId}»`, description: `${jobs.length} lượt` });
      if (res?.runId) navigate(`/p/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(res.runId)}`);
    } catch (e) {
      const view = errors.present(e);
      toast.error({ title: view.title, description: view.explain });
    }
  }

  function pickCharacterRef(characterId) {
    if (typeof document === 'undefined') return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/png,image/jpeg,image/webp';
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])];
      if (files.length) actions().uploadCharacterRef(characterId, files);
    });
    input.click();
  }


  return { sheetMenuItems, openLibrary, openGen, startSlice, pickCharacterRef };
}
