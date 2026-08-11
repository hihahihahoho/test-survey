/**
 * design/save-bar.js — THANH LƯU & DẤU BẨN (§3.7) + thanh VALIDATE (§3-S3.4 cuối).
 *
 * Luật đã thi công:
 *  · `v37 ● 3 thay đổi chưa lưu` (chấm cam) hoặc `v37 ✓ đã lưu 12:04`
 *  · [💾 Lưu ⌘S] DISABLED khi sạch (đóng B6); khi bẩn nhãn thành `Lưu (3)`
 *  · CHẶN lưu khi có lỗi, CHO lưu khi chỉ có cảnh báo — kèm tooltip lý do
 *  · [↺ Hoàn tác] [↻ Làm lại] có tooltip = NHÃN của bước (hover đọc được việc gì)
 */

import {
  createButton, el, clear, icon as iconEl, setDisabled,
  attachTooltip, openModal,
} from '../../ui/index.js';
import { blockingSummary } from './validate.js';
import { readOnlyReason } from '../shared/read-only.js';

export function createSaveBar(h = {}) {
  const root = el('div', { class: 'd-savebar' });
  const tabsSlot = el('div', { class: 'd-savebar__tabs' });
  const stateSlot = el('div', { class: 'd-savebar__state' });
  const actionsSlot = el('div', { class: 'kg-row kg-row--tight' });

  const btnUndo = createButton({
    variant: 'ghost', size: 'sm', icon: '↺', iconOnly: true,
    ariaLabel: 'Hoàn tác', tooltip: 'Hoàn tác (⌘Z)', onClick: () => h.onUndo(),
  });
  const btnRedo = createButton({
    variant: 'ghost', size: 'sm', icon: '↻', iconOnly: true,
    ariaLabel: 'Làm lại', tooltip: 'Làm lại (⇧⌘Z)', onClick: () => h.onRedo(),
  });
  const btnHistory = createButton({
    label: 'Lịch sử', variant: 'ghost', size: 'sm', icon: '🕘', onClick: () => h.onHistory(),
  });
  const btnLibrary = createButton({
    label: 'Thư viện', variant: 'ghost', size: 'sm', icon: '▤',
    tooltip: 'Thư viện element (⌘L)', onClick: () => h.onLibrary(),
  });
  const btnSave = createButton({
    label: 'Lưu', variant: 'primary', size: 'sm', icon: '💾',
    tooltip: 'Lưu bản thiết kế (⌘S)', onClick: () => h.onSave(),
  });

  actionsSlot.appendChild(btnUndo);
  actionsSlot.appendChild(btnRedo);
  actionsSlot.appendChild(btnLibrary);
  actionsSlot.appendChild(btnHistory);
  actionsSlot.appendChild(btnSave);

  root.appendChild(tabsSlot);
  root.appendChild(el('div', { class: 'd-savebar__spacer' }));
  root.appendChild(stateSlot);
  root.appendChild(actionsSlot);

  function setTabs(node) { clear(tabsSlot); tabsSlot.appendChild(node); }

  /**
   * @param {{version:number, dirty:boolean, pending:number, savedAt:string|null,
   *          canUndo:boolean, canRedo:boolean, undoLabel:string|null, redoLabel:string|null,
   *          validation:object, readOnly:boolean, draftSavedAt:string|null}} s
   */
  function update(s) {
    clear(stateSlot);
    stateSlot.appendChild(el('span', { class: 'd-savebar__ver', text: `v${s.version}` }));
    if (s.dirty) {
      stateSlot.appendChild(el('span', { class: 'd-dirty-dot', 'aria-hidden': 'true' }));
      stateSlot.appendChild(el('span', {
        text: s.pending === 1 ? '1 thay đổi chưa lưu' : `${s.pending} thay đổi chưa lưu`,
      }));
      if (s.draftSavedAt) {
        stateSlot.appendChild(el('span', { class: 'kg-t-caption kg-fg-muted-raised', text: '· nháp đã lưu trên máy' }));
      }
    } else {
      stateSlot.appendChild(iconEl('✓'));
      stateSlot.appendChild(el('span', {
        text: s.savedAt ? `đã lưu ${timeOf(s.savedAt)}` : 'chưa có thay đổi',
      }));
    }
    // aria-live để screen reader biết dấu bẩn đổi (§5.8-A8)
    stateSlot.setAttribute('role', 'status');
    stateSlot.setAttribute('aria-live', 'polite');

    setDisabled(btnUndo, !s.canUndo);
    setDisabled(btnRedo, !s.canRedo);
    if (s.canUndo && s.undoLabel) attachTooltip(btnUndo, clip(`Hoàn tác: ${s.undoLabel}`));
    if (s.canRedo && s.redoLabel) attachTooltip(btnRedo, clip(`Làm lại: ${s.redoLabel}`));

    const blocked = blockingSummary(s.validation);
    const label = btnSave.querySelector('.kg-btn__label');
    if (label) label.textContent = s.dirty && s.pending > 0 ? `Lưu (${s.pending})` : 'Lưu';
    if (s.readOnly) setDisabled(btnSave, true, readOnlyReason());
    else if (blocked) setDisabled(btnSave, true, blocked);
    else setDisabled(btnSave, !s.dirty, s.dirty ? null : 'Chưa có thay đổi nào để lưu');
  }

  return { el: root, setTabs, update, saveButton: btnSave };
}

/** Thanh Validate ở đáy vùng ②: `✓ Hợp lệ` hoặc `⛔ 2 lỗi · ⚠ 3 cảnh báo` (bấm = danh sách). */
export function createValidateBar({ onJump }) {
  const root = el('div', { class: 'd-validate', role: 'status', 'aria-live': 'polite' });
  let validation = { errors: [], warnings: [] };

  const btn = createButton({
    label: 'Hợp lệ', variant: 'ghost', size: 'sm', icon: '✓',
    onClick: () => openList(),
  });
  root.appendChild(btn);

  function openList() {
    const all = [
      ...validation.errors.map((x) => ({ ...x, severity: 'error' })),
      ...validation.warnings.map((x) => ({ ...x, severity: 'warn' })),
    ];
    if (all.length === 0) return;
    const list = el('div', { class: 'd-issues' });
    for (const item of all) {
      list.appendChild(el('button', {
        type: 'button',
        class: `d-issue d-issue--${item.severity === 'error' ? 'error' : 'warn'}`,
        onClick: () => { m.close(); onJump(item); },
      }, [
        iconEl(item.severity === 'error' ? '⛔' : '⚠'),
        el('span', { class: 'd-issue__code', text: item.code }),
        el('span', { text: item.message }),
      ]));
    }
    const m = openModal({
      title: `${validation.errors.length} lỗi · ${validation.warnings.length} cảnh báo`,
      description: 'Bấm một dòng để nhảy tới đúng chỗ sai.',
      size: 'lg', body: list,
    });
  }

  function update(next) {
    validation = { errors: next?.errors ?? [], warnings: next?.warnings ?? [] };
    const nE = validation.errors.length;
    const nW = validation.warnings.length;
    root.classList.toggle('d-validate--ok', nE === 0 && nW === 0);
    root.classList.toggle('d-validate--bad', nE > 0);
    const label = btn.querySelector('.kg-btn__label');
    const iconWrap = btn.querySelector('.kg-btn__icon');
    if (iconWrap) {
      clear(iconWrap);
      iconWrap.appendChild(iconEl(nE > 0 ? '⛔' : (nW > 0 ? '⚠' : '✓')));
    }
    if (label) {
      label.textContent = nE === 0 && nW === 0
        ? 'Hợp lệ'
        : [nE > 0 ? `${nE} lỗi` : null, nW > 0 ? `${nW} cảnh báo` : null].filter(Boolean).join(' · ');
    }
    btn.disabled = nE === 0 && nW === 0;
  }

  return { el: root, update };
}

function timeOf(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}
function clip(s) { return s.length > 48 ? `${s.slice(0, 47)}…` : s; }
