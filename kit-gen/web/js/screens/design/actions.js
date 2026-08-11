/**
 * design/actions.js — HÀNH ĐỘNG của S3: mọi thao tác sửa contract + lưu + phím tắt.
 * Tách khỏi index.js để mỗi file dưới ~400 dòng.
 *
 * Mọi thao tác đi qua `state.apply(opsResult)` ⇒ tự vào undo stack có nhãn + tự lưu nháp.
 * Mọi thao tác PHÁ HUỶ có confirm + đường lùi (toast Hoàn tác 10s dùng undo của editor).
 */

import { confirmDestructive, confirmLight, toast } from '../../ui/index.js';
import { api, errors } from '../../core/index.js';
import * as ops from './ops.js';
import * as opsStyle from './ops-style.js';
import { openAddSheetDialog, openResizeGridDialog, openTextDialog } from './dialogs.js';
import { openConflictModal } from './safety.js';
import { poseList } from './shapes.js';
import { createRefActions } from './actions-refs.js';

/**
 * @param {{ state:object, projectId:string, getSelection:Function, setSelection:Function,
 *   rerender:Function, readOnly:Function, openLibrary:Function, openGenModal:Function,
 *   startSlice:Function }} env
 */
export function createActions(env) {
  const { state, projectId, rerender } = env;

  /** Áp một thao tác + toast Hoàn tác cho việc phá huỷ. */
  function apply(result, { undoable = false } = {}) {
    if (!result || result.label === '') return false;
    const ok = state.apply(result);
    if (!ok) return false;
    if (result.focus) env.setSelection(result.focus);
    rerender();
    if (undoable) {
      toast.success({
        title: result.label,
        description: 'Chưa ghi vào máy — bấm Lưu để ghi, hoặc Hoàn tác để bỏ.',
        undo: { label: 'Hoàn tác', onUndo: () => { state.undo(); rerender(); } },
      });
    }
    return true;
  }

  const guard = () => {
    if (!env.readOnly()) return true;
    toast.warning({
      title: 'Chưa thấy công cụ local',
      description: 'Đang ở chế độ chỉ đọc — không sửa được bản thiết kế.',
    });
    return false;
  };

  /* ── SHEET ─────────────────────────────────────────────────────────────── */

  async function addSheet(trigger) {
    if (!guard()) return;
    const chars = opsStyle.allCharacters(state.contract);
    const spec = await openAddSheetDialog({ returnFocusTo: trigger, characters: chars });
    if (!spec) return;
    if (spec.kind === 'pose') {
      const ch = chars.find((c) => c.id === spec.characterId);
      const poses = (ch?.poses ?? []).slice(0, spec.cols * spec.rows);
      const comps = poses.map((p, i) => ({
        file: `${String(i + 1).padStart(2, '0')}-pose-${p}`,
        vi: `${ch?.vi ?? spec.characterId}: ${poseLabelOf(p)}`,
        spec: `character in the "${p}" pose`,
        skel: { shape: 'pose', pose: p, w: 0.8, h: 0.9, free: true },
      }));
      apply(ops.addSheet(state.contract, { ...spec, components: comps }));
      return;
    }
    if (spec.kind === 'bg') {
      apply(ops.addSheet(state.contract, {
        ...spec,
        components: [{ file: '25-bg-home', vi: 'Nền', spec: 'full-bleed background scene', skel: { shape: 'full', w: 1, h: 1 } }],
      }));
      return;
    }
    apply(ops.addSheet(state.contract, spec));
  }

  async function renameSheet(sheetId, trigger) {
    if (!guard()) return;
    const v = await openTextDialog({
      title: `Đổi mã sheet «${sheetId}»`, label: 'Mã sheet mới', value: sheetId,
      hint: 'Đổi mã làm ảnh đã sinh (raw/<phong cách>-<mã sheet>.png) thành mồ côi.',
      returnFocusTo: trigger,
    });
    if (v === false || v === sheetId || v === '') return;
    apply(ops.renameSheet(state.contract, sheetId, v));
  }

  async function resizeGrid(sheetId, trigger) {
    if (!guard()) return;
    const sheet = ops.findSheet(state.contract, sheetId);
    const r = await openResizeGridDialog({ sheet, returnFocusTo: trigger });
    if (!r) return;
    apply(ops.resizeGrid(state.contract, sheetId, r.cols, r.rows, { overflow: r.overflow }), { undoable: true });
  }

  async function removeSheet(sheetId) {
    if (!guard()) return;
    const sheet = ops.findSheet(state.contract, sheetId);
    const real = (sheet?.components ?? []).filter((c) => String(c?.skel?.shape ?? '') !== 'empty').length;
    const okDel = await confirmDestructive({
      title: `Xoá sheet «${sheetId}»?`,
      message: 'Sheet là dữ liệu gốc — thư viện element không tái sinh được sheet.',
      consequences: [
        `${real} element trong sheet này sẽ bị bỏ khỏi bản thiết kế`,
        'Ảnh đã sinh và file đã cắt của sheet này trở thành mồ côi (không bị xoá ngay)',
        'Hoàn tác được ngay sau đó, và chỉ ghi vào máy khi bạn bấm Lưu',
      ],
      confirmLabel: 'Xoá sheet',
    });
    if (!okDel) return;
    apply(ops.removeSheet(state.contract, sheetId), { undoable: true });
  }

  function moveSheet(sheetId, delta) {
    if (!guard()) return;
    apply(ops.moveSheet(state.contract, sheetId, delta));
  }

  function duplicateSheet(sheetId) {
    if (!guard()) return;
    apply(ops.duplicateSheet(state.contract, sheetId));
  }

  function patchSheet(sheetId, patch, kind) {
    if (!guard()) return;
    if (kind === 'grid') {
      const sheet = ops.findSheet(state.contract, sheetId);
      const cols = Number(patch.grid?.cols ?? sheet?.grid?.cols ?? 1);
      const rows = Number(patch.grid?.rows ?? sheet?.grid?.rows ?? 1);
      const lost = ops.overflowOf(sheet, cols, rows);
      if (lost.length > 0) { resizeGrid(sheetId); return; }
      apply(ops.resizeGrid(state.contract, sheetId, cols, rows));
      return;
    }
    if (kind === 'rename') { apply(ops.renameSheet(state.contract, sheetId, patch.id)); return; }
    apply(ops.patchSheet(state.contract, sheetId, patch));
  }

  function toggleSheetVariant(sheetId, variantId, on) {
    if (!guard()) return;
    const sheet = ops.findSheet(state.contract, sheetId);
    const all = (state.contract?.variants ?? []).map((v) => v.id);
    let list = Array.isArray(sheet?.variants) && sheet.variants.length ? [...sheet.variants] : [...all];
    list = on ? [...new Set([...list, variantId])] : list.filter((x) => x !== variantId);
    // tick hết = áp cho mọi phong cách ⇒ lưu mảng rỗng (đúng ngữ nghĩa của gen.sh)
    const next = list.length === all.length ? [] : list;
    apply(ops.patchSheet(state.contract, sheetId, { variants: next },
      `${on ? 'Áp' : 'Bỏ áp'} sheet «${sheetId}» cho phong cách «${variantId}»`));
  }

  /* ── ELEMENT ───────────────────────────────────────────────────────────── */

  function patchCell(sheetId, index, patch, label) {
    if (!guard()) return;
    apply(ops.patchCell(state.contract, sheetId, index, patch, label));
  }

  async function deleteCell(sheetId, index) {
    if (!guard()) return;
    const sheet = ops.findSheet(state.contract, sheetId);
    const comp = sheet?.components?.[index];
    if (!comp || String(comp?.skel?.shape ?? '') === 'empty') return;
    const ok = await confirmLight({
      title: `Bỏ «${comp.file || `ô ${index + 1}`}» khỏi sheet?`,
      message: 'Ô sẽ thành ô trống (lưới không đổi). Hoàn tác được ngay sau đó.',
      confirmLabel: 'Bỏ element',
    });
    if (!ok) return;
    apply(ops.clearCell(state.contract, sheetId, index), { undoable: true });
  }

  function moveCell(sheetId, from, to) {
    if (!guard()) return;
    apply(ops.swapCells(state.contract, sheetId, from, to));
  }

  function resetToLib(sheetId, index, libEntry) {
    if (!guard() || !libEntry) return;
    apply(ops.patchCell(state.contract, sheetId, index, {
      spec: libEntry.spec, skel: libEntry.skel,
    }, `Trả element ô ${index + 1} về bản gốc trong thư viện`));
  }

  function addFromLibrary(elements, target) {
    if (!guard()) return;
    if (target.kind === 'new-sheet') {
      const cols = 4;
      const rows = Math.max(1, Math.ceil(elements.length / cols));
      const added = ops.addSheet(state.contract, {
        id: 'main', cols, rows,
        orient: elements.every((e) => e.cell === 'portrait') ? 'portrait' : 'landscape',
        components: elements.map((e) => ops.libToComponent(e)),
      });
      apply({ ...added, label: `Tạo sheet mới với ${elements.length} element từ thư viện` });
      return;
    }
    apply(ops.addElementsToSheet(state.contract, target.sheetId, elements));
  }

  /* ── PHONG CÁCH / NHÂN VẬT ─────────────────────────────────────────────── */

  async function addVariant(trigger) {
    if (!guard()) return;
    const v = await openTextDialog({
      title: 'Thêm phong cách', label: 'Tên phong cách', value: '',
      hint: 'Ví dụ: Tết đỏ. Mã kỹ thuật sẽ tự tạo từ tên.',
      confirmLabel: 'Thêm', returnFocusTo: trigger,
    });
    if (!v) return;
    apply(opsStyle.addVariant(state.contract, { vi: v }));
  }

  function patchVariant(variantId, patch, label) {
    if (!guard()) return;
    apply(opsStyle.patchVariant(state.contract, variantId, patch, label));
  }

  function duplicateVariant(variantId) {
    if (!guard()) return;
    apply(opsStyle.duplicateVariant(state.contract, variantId));
  }

  async function removeVariant(variantId) {
    if (!guard()) return;
    const jobs = ops.contractJobs(state.contract).filter((j) => j.variant === variantId).length;
    const v = (state.contract?.variants ?? []).find((x) => x.id === variantId);
    const ok = await confirmDestructive({
      title: `Xoá phong cách «${v?.vi || variantId}»?`,
      message: `Xoá «${v?.vi || variantId}» sẽ làm ${jobs} ảnh đã sinh và các file đã cắt của phong cách này thành mồ côi. Ảnh không bị xoá ngay.`,
      consequences: [
        'Art style, màu brand và danh sách nhân vật của phong cách này sẽ mất',
        'Ảnh đã sinh vẫn nằm trên máy (raw/) cho tới khi bạn dọn dẹp',
        'Hoàn tác được ngay, và chỉ ghi vào máy khi bấm Lưu',
      ],
      confirmLabel: 'Xoá phong cách',
    });
    if (!ok) return;
    apply(opsStyle.removeVariant(state.contract, variantId), { undoable: true });
  }

  function toggleCharacterInVariant(variantId, characterId, on) {
    if (!guard()) return;
    apply(opsStyle.toggleCharacterInVariant(state.contract, variantId, characterId, on));
  }

  async function addCharacter(trigger) {
    if (!guard()) return;
    const v = await openTextDialog({
      title: 'Thêm nhân vật', label: 'Tên nhân vật', value: '',
      hint: 'Ví dụ: Lan. Bộ dáng chỉ áp dụng cho project này.',
      confirmLabel: 'Thêm', returnFocusTo: trigger,
    });
    if (!v) return;
    apply(opsStyle.addCharacter(state.contract, { vi: v }));
  }

  function patchCharacter(characterId, patch, label) {
    if (!guard()) return;
    apply(opsStyle.patchCharacter(state.contract, characterId, patch, label));
  }

  async function removeCharacter(characterId) {
    if (!guard()) return;
    const ok = await confirmDestructive({
      title: `Xoá nhân vật «${characterId}»?`,
      message: 'Các sheet dáng của nhân vật này sẽ không còn nguồn tham chiếu.',
      consequences: ['Danh sách dáng và ảnh tham khảo gắn với nhân vật sẽ bị bỏ khỏi bản thiết kế'],
      confirmLabel: 'Xoá nhân vật',
    });
    if (!ok) return;
    apply(opsStyle.removeCharacter(state.contract, characterId), { undoable: true });
  }

  function togglePose(characterId, poseId, on) {
    if (!guard()) return;
    const ch = opsStyle.allCharacters(state.contract).find((c) => c.id === characterId);
    const cur = new Set(ch?.poses ?? []);
    if (on) cur.add(poseId); else cur.delete(poseId);
    apply(opsStyle.patchCharacter(state.contract, characterId, { poses: [...cur] },
      `${on ? 'Thêm' : 'Bỏ'} dáng «${poseLabelOf(poseId)}» của «${characterId}»`));
  }

  function patchSlice(patch, scope) {
    if (!guard()) return;
    apply(opsStyle.patchSliceParams(state.contract, patch, scope));
  }

  function setAllBg(kind) {
    if (!guard()) return;
    const bg = kind === 'green' ? 'pure vivid green #00FF00' : 'pure vivid magenta #FF00FF';
    let next = state.contract;
    for (const v of state.contract?.variants ?? []) {
      next = opsStyle.patchVariant(next, v.id, { bg }).contract ?? next;
    }
    state.apply({ contract: next, label: `Đổi màu nền tách của mọi phong cách sang ${kind === 'green' ? 'green' : 'magenta'}` });
    rerender();
  }

  /* ── LƯU ───────────────────────────────────────────────────────────────── */

  async function save({ thenOpenGen = false } = {}) {
    if (env.readOnly()) {
      // §4.9: không lưu được nhưng NHÁP VẪN GHI + có [Thử lưu lại]
      await state.saveDraftNow();
      toast.warning({
        title: 'Chưa lưu được — cần công cụ local đang chạy',
        description: 'Thay đổi của bạn đã được giữ trong bản nháp trên máy này.',
        actions: [{ label: 'Thử lưu lại', onClick: () => save({ thenOpenGen }) }],
      });
      return false;
    }
    const res = await state.save();
    if (res.ok) {
      const sheets = (state.contract?.sheets ?? []).length;
      const comps = ops.countComponents(state.contract);
      toast.success({ title: 'Đã lưu', description: `${sheets} sheet · ${comps} element` });
      rerender();
      if (thenOpenGen) env.openGenModal();
      return true;
    }
    if (res.conflict) {
      const details = res.error?.details ?? null;
      let theirs = null;
      try { theirs = (await api.contract.get(projectId))?.contract ?? null; } catch { /* đọc được thì tốt */ }
      const choice = await openConflictModal({ mine: state.contract, theirs, details });
      if (choice === 'overwrite') return save({ thenOpenGen });
      if (choice === 'reload') {
        await state.reloadFromDisk();
        rerender();
        toast.info({ title: 'Đã tải lại bản trên đĩa' });
        return false;
      }
      if (choice === 'fork') {
        toast.warning({
          title: 'Chưa lưu được thành bản sao',
          description: 'Công cụ local chưa có endpoint tách bản sao của bản thiết kế. Dùng Nhân bản project ở màn Cài đặt project để giữ bản của bạn.',
        });
        return false;
      }
      return false;
    }
    const view = errors.present(res.error);
    toast.error({
      title: 'Chưa lưu được — thay đổi của bạn vẫn còn trên máy này',
      description: view.explain,
      actions: [{ label: 'Thử lại', onClick: () => save({ thenOpenGen }) }],
    });
    rerender();
    return false;
  }

  return {
    apply,
    addSheet, renameSheet, resizeGrid, removeSheet, moveSheet, duplicateSheet, patchSheet, toggleSheetVariant,
    patchCell, deleteCell, moveCell, resetToLib, addFromLibrary,
    addVariant, patchVariant, duplicateVariant, removeVariant, toggleCharacterInVariant,
    addCharacter, patchCharacter, removeCharacter, togglePose,
    patchSlice, setAllBg,
    ...createRefActions({ state, projectId, apply, guard, rerender }),
    save,
  };
}

function poseLabelOf(id) {
  return poseList().find((p) => p.id === id)?.vi ?? String(id);
}
