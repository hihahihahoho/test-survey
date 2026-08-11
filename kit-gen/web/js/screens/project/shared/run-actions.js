/**
 * run-actions.js — CỬA duy nhất mà S2/S5 dùng để bắt đầu một lượt chạy (§4.8, §1.1-2).
 *
 * Phân vai rõ:
 *   · SINH ẢNH (tốn quota) ⇒ BẮT BUỘC qua modal M1. M1 thuộc quyền màn S4
 *     (`web/js/screens/runs/gen-modal.js`, engineer khác) — ở đây chỉ NẠP ĐỘNG và gọi
 *     theo đúng chữ ký của họ: `openGenModal({projectId, contract, jobStates, onlySheetId, navigate})`.
 *     Nếu file đó chưa có (các team làm song song) thì dùng bản M1 tối giản bên dưới,
 *     vẫn giữ đủ 3 điều kiện an toàn của §4.8. Xem teams/design/NEEDS-d2p2.md §2.
 *   · CẮT (tái tạo rẻ, §1.2) ⇒ confirm NHẸ inline, không modal, không cảnh báo quota.
 *
 * Mọi lỗi hiện qua core/errors.js. KHÔNG bao giờ hiện error.message ra thân UI (§6.1).
 */

import {
  confirmLight, openModal, createModalFooter, createButton, createCheckbox,
  createDevDetails, toast, el, icon, setLoading,
} from '../../../ui/index.js';
import * as api from '../../../core/api.js';
import * as errors from '../../../core/errors.js';
import * as store from '../../../core/store.js';
import { LS_KEYS } from '../../../core/constants.js';
import { isReadOnly, NEED_AGENT } from './agent-state.js';
import * as nav from './nav.js';
import { loadDoctor } from './data.js';

/** Hiện lỗi thao tác: 1 câu người đọc được + nút + panel dev gập lại (§1.1-5). */
export function reportError(error, { retry = null } = {}) {
  const view = errors.present(error);
  const actions = [];
  if (retry) actions.push({ label: 'Thử lại', onClick: retry });
  if (view.code === 'RUN_CONFLICT' || view.code === 'RUN_ACTIVE') {
    const runId = view.details?.runId;
    actions.push({
      label: 'Xem lượt đang chạy',
      onClick: () => { if (runId) nav.toRun(currentProjectId(), runId); },
    });
  }
  toast.error({
    title: view.title,
    description: view.explain,
    actions: actions.slice(0, 2),
  });
  return view;
}

let lastProjectId = null;
export function setCurrentProjectId(id) { lastProjectId = id; }
function currentProjectId() { return lastProjectId; }

/** §1.2 "Tái tạo rẻ": cắt lại = 1 confirm nhẹ (không modal to, không nút danger). */
export async function startSlice({ projectId, jobs, status, label = null }) {
  if (isReadOnly(status)) { toast.warning({ title: NEED_AGENT }); return null; }
  const n = jobs.length;
  const okGo = await confirmLight({
    title: n === 1 ? 'Cắt 1 sheet?' : `Cắt ${n} sheet?`,
    message: `Cắt tách ảnh đã sinh thành từng file PNG trong suốt. Không tốn quota, chạy lại được bất cứ lúc nào.${label ? `\n${label}` : ''}`,
    confirmLabel: n === 1 ? 'Cắt' : `Cắt ${n} sheet`,
  });
  if (!okGo) return null;
  try {
    const res = await api.runs.start(projectId, { kind: 'slice', jobs, maxJobs: prefMaxJobs(), autoSliceAfterGen: false });
    const runId = res?.runId ?? null;
    toast.success({
      title: 'Đã bắt đầu cắt',
      description: `${n} sheet đang được cắt.`,
      actions: runId ? [{ label: 'Xem tiến độ', onClick: () => nav.toRun(projectId, runId) }] : [],
    });
    return runId;
  } catch (error) { reportError(error); return null; }
}

/** Số lượt song song từ kitgen.prefs.v1 (mặc định 4 — §3-S6 tab Ưu tiên). */
export function prefMaxJobs() {
  try { return store.get(LS_KEYS.prefs)?.maxJobs ?? 4; } catch { return 4; }
}
export function prefAutoSlice() {
  try { return store.get(LS_KEYS.prefs)?.autoSliceAfterGen !== false; } catch { return true; }
}

/**
 * Mở modal "Bắt đầu sinh ảnh". Ưu tiên M1 thật của màn S4; không có thì dùng bản tạm.
 * @returns {Promise<string|null>} runId nếu đã bắt đầu
 */
export async function openGenFlow(ctx) {
  if (isReadOnly(ctx.status)) { toast.warning({ title: NEED_AGENT }); return null; }
  try {
    const mod = await import('../../runs/gen-modal.js');
    if (typeof mod.openGenModal === 'function') {
      // Gọi ĐÚNG chữ ký của M1 thật (runs/gen-modal.js): nó cần `jobStates` để tick sẵn
      // các lượt cần làm và vẽ badge §5.7. Lựa chọn cuối cùng do USER quyết trong modal.
      mod.openGenModal({
        projectId: ctx.projectId,
        contract: ctx.contract,
        jobStates: ctx.project?.state?.jobs ?? {},
        onlySheetId: soleSheetOf(ctx.jobs, ctx.contract),
        navigate: (path, opts) => { void routerNavigate(path, opts); },
      });
      return null;
    }
  } catch { /* màn S4 chưa có file → dùng bản M1 tối giản bên dưới */ }
  return openTemporaryGenModal(ctx);
}

/**
 * Nếu MỌI lượt được đề nghị thuộc cùng một sheet thì nói cho M1 biết để nó tick sẵn đúng
 * sheet đó (ví dụ: user bấm "Sinh lại sheet này" từ lightbox ở S5).
 * Tách `<variant>-<sheet>` phải đối chiếu với contract, không cắt chuỗi bừa: id sheet
 * có thể chứa dấu gạch ngang (`bg-home`, `pose-lan`).
 */
function soleSheetOf(jobs, contract) {
  if (!Array.isArray(jobs) || jobs.length === 0) return null;
  const sheetIds = (contract?.sheets ?? []).map((s) => s?.id).filter((x) => typeof x === 'string');
  const found = new Set();
  for (const job of jobs) {
    const hit = sheetIds.find((id) => String(job).endsWith(`-${id}`));
    if (!hit) return null;
    found.add(hit);
  }
  return found.size === 1 ? [...found][0] : null;
}

async function routerNavigate(path, opts) {
  const router = await import('../../../core/router.js');
  return router.navigate(path, opts);
}

/**
 * BẢN TẠM của M1 (§4.8) — đủ 3 điều kiện an toàn của spec, không hơn:
 *   (1) đếm được bao nhiêu lượt trước khi chạy (§1.1-2)
 *   (2) cảnh báo quota 3–5× (§4.8)
 *   (3) CHẶN TRƯỚC khi doctor báo không tạo được ảnh (đóng E1 tại gốc)
 * Chưa có: lưới chọn từng ô, ước lượng thời gian từ agent. TODO ở đầu file.
 * Export ra ngoài CHỈ để test đo được nhánh này khi màn S4 vắng mặt.
 */
export async function openTemporaryGenModal({ projectId, jobs = [], status, onStarted = null }) {
  if (jobs.length === 0) {
    toast.info({ title: 'Không có lượt nào để sinh', description: 'Chọn ô trong ma trận tiến độ hoặc mở bản thiết kế.' });
    return null;
  }
  const quotaLow = jobs.length * 3;
  const quotaHigh = jobs.length * 5;
  const autoSlice = createCheckbox({
    label: 'Tự động cắt sau khi sinh xong',
    sublabel: 'Cắt là bước tách ảnh thành từng PNG trong suốt.',
    checked: prefAutoSlice(),
  });

  const envSlot = el('div', { style: { marginTop: 'var(--s-3)' } });
  const body = el('div', {}, [
    el('p', { class: 'kg-t-body', text: `Sẽ sinh ${jobs.length} lượt với ${prefMaxJobs()} lượt song song.` }),
    el('div', { class: 'kg-banner kg-banner--warning', role: 'status' }, [
      icon('⚠'),
      el('div', {
        class: 'kg-banner__main',
        text: `Sinh ảnh tiêu quota tài khoản khoảng 3–5 lần một lượt hỏi thường. ${jobs.length} lượt ≈ ${quotaLow}–${quotaHigh} lượt tương đương.`,
      }),
    ]),
    el('div', { style: { marginTop: 'var(--s-4)' } }, [autoSlice.el]),
    envSlot,
    el('p', { class: 'kg-t-caption kg-fg-default', style: { marginTop: 'var(--s-3)' },
      text: 'Ảnh cũ của các lượt này được giữ trong lịch sử, có thể khôi phục.' }),
  ]);

  const cancel = createButton({ label: 'Huỷ', variant: 'secondary', attrs: { 'data-autofocus': '' }, onClick: () => m.close() });
  const confirm = createButton({
    label: `Sinh ${jobs.length} lượt`, variant: 'primary', icon: '⚡',
    onClick: async () => {
      setLoading(confirm, true);
      m.setBusy(true);
      try {
        const res = await api.runs.start(projectId, {
          kind: 'gen', jobs, maxJobs: prefMaxJobs(), autoSliceAfterGen: autoSlice.checked,
        });
        m.setBusy(false);
        m.close();
        const runId = res?.runId ?? null;
        toast.success({ title: `Đã bắt đầu sinh ${jobs.length} lượt` });
        if (onStarted) onStarted(runId);
        if (runId) nav.toRun(projectId, runId);
        return;
      } catch (error) {
        setLoading(confirm, false);
        m.setBusy(false);
        showInlineError(envSlot, error, confirm);
      }
    },
  });

  const m = openModal({
    title: 'Bắt đầu sinh ảnh',
    description: 'Đây là thao tác duy nhất tiêu quota tài khoản.',
    size: 'md', hasInput: true, body,
    footer: createModalFooter({ cancel, confirm }),
  });

  // (3) Chặn trước bằng doctor — KHÔNG chạy 8 lượt rồi mới báo lỗi môi trường.
  const doc = await loadDoctor();
  const ig = doc.ok ? doc.data?.imageGen : null;
  if (doc.ok && ig && ig.available === false) {
    setLoading(confirm, false);
    confirm.disabled = true;
    confirm.setAttribute('aria-disabled', 'true');
    envSlot.appendChild(el('div', { class: 'kg-banner kg-banner--error', role: 'alert' }, [
      icon('⛔'),
      el('div', { class: 'kg-banner__main' }, [
        el('div', { text: errors.lookup('IMAGEGEN_UNAVAILABLE').title }),
        el('div', { class: 'kg-t-caption', text: errors.imageGenReasonText(ig.reason) }),
      ]),
      el('div', { class: 'kg-banner__actions' }, [
        createButton({
          label: 'Khắc phục ngay', variant: 'secondary', size: 'sm',
          onClick: () => { m.close(); nav.toSettings('env'); },
        }),
      ]),
    ]));
  }
  return null;
}

/** Lỗi của thao tác nằm NGAY chỗ gây lỗi (§5.5: toast không được là nơi duy nhất). */
function showInlineError(slot, error, focusTarget) {
  const view = errors.present(error);
  while (slot.firstChild) slot.removeChild(slot.firstChild);
  slot.appendChild(el('div', { class: 'kg-banner kg-banner--error', role: 'alert' }, [
    icon('⛔'),
    el('div', { class: 'kg-banner__main' }, [
      el('div', { text: view.title }),
      el('div', { class: 'kg-t-caption', text: view.explain }),
    ]),
  ]));
  slot.appendChild(createDevDetails(errors.devDetails(error)));
  if (focusTarget) focusTarget.focus();
}
