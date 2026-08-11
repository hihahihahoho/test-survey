/**
 * runs/gen-modal.js — MODAL M1 "BẮT ĐẦU SINH ẢNH" (§4.8) — CỬA DUY NHẤT TIÊU QUOTA.
 * Không có đường nào chạy gen mà không qua đây (nguyên tắc §1.1-2, chốt X11).
 *
 * Đã thi công đủ các chốt:
 *  · Ma trận phong cách × sheet, mỗi ô là CHECKBOX THẬT có nhãn + badge trạng thái (§5.7)
 *  · [Tất cả] [Chỉ thứ đã đổi] [Bỏ chọn] — "đã đổi" = stale ⟳ / never ○ / failed ❌
 *  · 3 số: số lượt · ước lượng thời gian · CẢNH BÁO QUOTA (nói "khoảng", không hứa con số)
 *  · Selection sống TRONG modal, theo project — đóng modal là mất (đóng C1)
 *  · doctor imageGen.available === false ⇒ CHẶN, nút chính disabled + lối sang S6?tab=env (đóng E1)
 *  · Đang có run của project ⇒ nút chính đổi thành [Xem lượt đang chạy] (đóng E5)
 *  · Số lượt song song + auto-cắt, mặc định đọc từ kitgen.prefs.v1 qua core/store.js
 */

import {
  createBanner, createButton, createCheckbox, createJobBadge, createSelect,
  createSpinnerRow, createModalFooter, el, clear, openModal, toast,
} from '../../ui/index.js';
import { api, errors, store } from '../../core/index.js';
import { contractJobs } from '../design/ops.js';

const QUOTA_PER_JOB = [3, 5];
const SECS_PER_JOB = [90, 150];

/**
 * @param {{ projectId:string, contract:object, jobStates:object, onlySheetId?:string,
 *   dirty?:boolean, onSaveFirst?:Function, navigate:Function, returnFocusTo?:HTMLElement }} opts
 */
export function openGenModal(opts = {}) {
  const {
    projectId, contract, jobStates = {}, onlySheetId = null,
    dirty = false, onSaveFirst = null, navigate = () => {}, returnFocusTo = null,
  } = opts;

  const jobs = contractJobs(contract);
  const variants = contract?.variants ?? [];
  const sheets = contract?.sheets ?? [];
  const prefs = readPrefs();

  /** Selection CỤC BỘ trong modal (đóng C1: không rò rỉ ra biến toàn cục). */
  const picked = new Set(
    onlySheetId
      ? jobs.filter((j) => j.sheet === onlySheetId).map((j) => j.job)
      : jobs.filter((j) => needsGen(jobStates[j.job])).map((j) => j.job),
  );
  let maxJobs = prefs.maxJobs;
  let autoSlice = prefs.autoSliceAfterGen;
  let doctorState = { phase: 'loading', data: null, error: null };
  let activeRun = null;
  let submitting = false;

  const bannerSlot = el('div', {});
  const matrixSlot = el('div', { class: 'm1-matrix' });
  const sumSlot = el('div', { class: 'm1-sum' });
  const optSlot = el('div', { class: 'kg-stack', style: { gap: 'var(--s-2)' } });

  const body = el('div', { class: 'kg-stack', style: { gap: 'var(--s-4)' } }, [
    bannerSlot,
    el('div', { class: 'kg-row' }, [
      el('span', { class: 'd-props__kind', text: 'Chọn lượt cần sinh' }),
      el('span', { style: { marginLeft: 'auto' } }),
      createButton({ label: 'Tất cả', variant: 'ghost', size: 'sm', onClick: () => { jobs.forEach((j) => picked.add(j.job)); renderMatrix(); } }),
      createButton({ label: 'Chỉ thứ đã đổi', variant: 'ghost', size: 'sm', onClick: () => { picked.clear(); jobs.filter((j) => needsGen(jobStates[j.job])).forEach((j) => picked.add(j.job)); renderMatrix(); } }),
      createButton({ label: 'Bỏ chọn', variant: 'ghost', size: 'sm', onClick: () => { picked.clear(); renderMatrix(); } }),
    ]),
    matrixSlot, sumSlot, optSlot,
  ]);

  const cancelBtn = createButton({ label: 'Huỷ', variant: 'secondary', onClick: () => m.close('cancel') });
  const goBtn = createButton({ label: 'Sinh ảnh', variant: 'primary', icon: '⚡', onClick: () => submit() });

  const m = openModal({
    title: 'Bắt đầu sinh ảnh',
    description: 'Mỗi lượt là một lần gọi AI cho một sheet của một phong cách.',
    size: 'xl', hasInput: true, returnFocusTo,
    body, footer: createModalFooter({ cancel: cancelBtn, confirm: goBtn }),
  });

  /* ── ma trận ───────────────────────────────────────────────────────────── */

  function renderMatrix() {
    clear(matrixSlot);
    if (jobs.length === 0) {
      matrixSlot.appendChild(el('p', { class: 'kg-t-body', text: 'Bản thiết kế chưa có phong cách hoặc chưa có sheet nào để sinh ảnh.' }));
      renderSummary();
      return;
    }
    const table = el('table');
    const head = el('tr', {}, [el('th', { scope: 'col', text: 'Phong cách' })]);
    for (const sh of sheets) head.appendChild(el('th', { scope: 'col', text: sh.id }));
    table.appendChild(el('thead', {}, [head]));

    const tbody = el('tbody');
    for (const v of variants) {
      const tr = el('tr', {}, [el('th', { scope: 'row', text: v.vi || v.id })]);
      for (const sh of sheets) {
        const job = jobs.find((j) => j.variant === v.id && j.sheet === sh.id);
        const td = el('td');
        if (!job) {
          td.appendChild(el('span', { class: 'kg-t-caption kg-fg-muted-raised', text: '— không áp' }));
        } else {
          const st = jobStates[job.job] ?? 'never';
          // Checkbox THẬT có nhãn đọc được (A5/I4); badge trạng thái là icon + CHỮ (§5.7).
          const chk = createCheckbox({
            label: `${v.vi || v.id} · ${sh.id}`,
            checked: picked.has(job.job),
            onChange: (e) => {
              if (e.target.checked) picked.add(job.job); else picked.delete(job.job);
              renderSummary();
            },
          });
          // Nhãn chữ đã có ở hàng/cột tiêu đề nên trong ô chỉ hiện badge; nhãn đầy đủ
          // vẫn nằm trong DOM cho screen reader.
          const textLabel = chk.el.querySelector('span > span');
          if (textLabel) textLabel.className = 'kg-sr-only';
          chk.el.appendChild(createJobBadge(st));
          td.appendChild(chk.el);
        }
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    matrixSlot.appendChild(table);
    renderSummary();
  }

  function renderSummary() {
    clear(sumSlot);
    const n = picked.size;
    const [s1, s2] = [Math.ceil((n / maxJobs) * SECS_PER_JOB[0]), Math.ceil((n / maxJobs) * SECS_PER_JOB[1])];
    sumSlot.appendChild(el('p', {
      class: 'kg-t-body',
      text: n === 0
        ? 'Chưa chọn lượt nào.'
        : `Đã chọn ${n} lượt · ước lượng ~${fmtMinutes(s1)}–${fmtMinutes(s2)} với ${maxJobs} lượt song song`,
    }));
    if (n > 0) {
      sumSlot.appendChild(createBanner({
        kind: 'warning',
        title: `Sinh ảnh tiêu quota tài khoản ChatGPT khoảng ${QUOTA_PER_JOB[0]}–${QUOTA_PER_JOB[1]} lần một lượt hỏi thường. ${n} lượt ≈ ${n * QUOTA_PER_JOB[0]}–${n * QUOTA_PER_JOB[1]} lượt tương đương.`,
      }));
      sumSlot.appendChild(el('p', {
        class: 'kg-t-caption kg-fg-default',
        text: 'Ảnh cũ của các lượt này được giữ trong lịch sử (3 đời), có thể khôi phục.',
      }));
    }
    syncFooter();
  }

  function renderOptions() {
    clear(optSlot);
    const fMax = createSelect({
      label: 'Số lượt song song', value: String(maxJobs),
      options: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: String(n), label: String(n) })),
      hint: 'Càng cao càng dễ chạm giới hạn tài khoản.',
      onChange: (e) => { maxJobs = Number(e.target.value) || 4; savePrefs(maxJobs, autoSlice); renderSummary(); },
    });
    const cAuto = createCheckbox({
      label: 'Tự động cắt sau khi sinh xong', checked: autoSlice,
      onChange: (e) => { autoSlice = e.target.checked; savePrefs(maxJobs, autoSlice); },
    });
    optSlot.appendChild(fMax.el);
    optSlot.appendChild(cAuto.el);
  }

  /* ── chặn trước khi chạy: doctor + run đang chạy ───────────────────────── */

  function renderBanner() {
    clear(bannerSlot);
    if (dirty) {
      bannerSlot.appendChild(createBanner({
        kind: 'warning',
        title: 'Bản thiết kế đang có thay đổi chưa lưu — sẽ lưu trước khi sinh ảnh.',
      }));
    }
    if (doctorState.phase === 'loading') {
      bannerSlot.appendChild(createSpinnerRow({ label: 'Đang kiểm tra môi trường tạo ảnh…' }));
    } else if (doctorState.phase === 'blocked') {
      const reason = errors.imageGenReasonText(doctorState.data?.imageGen?.reason);
      bannerSlot.appendChild(createBanner({
        kind: 'error',
        title: `Chưa tạo được ảnh AI — ${reason}`,
        actions: [
          createButton({
            label: 'Khắc phục ngay', variant: 'secondary', size: 'sm',
            onClick: () => { m.close(); navigate('/settings?tab=env'); },
          }),
          createButton({ label: 'Kiểm tra lại', variant: 'ghost', size: 'sm', onClick: () => loadDoctor(true) }),
        ],
      }));
    } else if (doctorState.phase === 'error') {
      const view = errors.present(doctorState.error);
      bannerSlot.appendChild(createBanner({
        kind: 'warning',
        title: `Không kiểm tra được môi trường: ${view.title}`,
        actions: [createButton({ label: 'Thử lại', variant: 'secondary', size: 'sm', onClick: () => loadDoctor(true) })],
      }));
    }
    if (activeRun) {
      bannerSlot.appendChild(createBanner({
        kind: 'warning',
        title: `Project này đang chạy lượt ${activeRun.id} (${activeRun.progress?.done ?? 0}/${activeRun.progress?.total ?? 0}).`,
        actions: [createButton({
          label: 'Xem lượt đang chạy', variant: 'secondary', size: 'sm',
          onClick: () => openRun(activeRun.id),
        })],
      }));
    }
    syncFooter();
  }

  function syncFooter() {
    const n = picked.size;
    const label = goBtn.querySelector('.kg-btn__label');
    if (activeRun) {
      if (label) label.textContent = 'Xem lượt đang chạy';
      goBtn.disabled = false;
      return;
    }
    if (label) label.textContent = n === 0 ? 'Sinh ảnh' : `Sinh ${n} lượt`;
    goBtn.disabled = submitting || n === 0 || doctorState.phase === 'blocked' || doctorState.phase === 'loading';
  }

  async function loadDoctor(refresh = false) {
    doctorState = { phase: 'loading', data: null, error: null };
    renderBanner();
    try {
      const d = await api.system.doctor({ refresh });
      doctorState = {
        phase: d?.imageGen?.available === false ? 'blocked' : 'ok',
        data: d, error: null,
      };
    } catch (e) {
      doctorState = { phase: 'error', data: null, error: e };
    }
    renderBanner();
  }

  async function loadActiveRun() {
    try {
      const res = await api.runs.list(projectId, 5);
      activeRun = (res?.items ?? []).find((r) => r.status === 'running' || r.status === 'queued') ?? null;
    } catch { activeRun = null; }
    renderBanner();
  }

  function openRun(runId) {
    m.close();
    navigate(`/p/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(runId)}`);
  }

  async function submit() {
    if (activeRun) { openRun(activeRun.id); return; }
    submitting = true;
    syncFooter();
    m.setBusy(true);
    try {
      if (dirty && onSaveFirst) {
        const saved = await onSaveFirst();
        if (saved === false) { throw new Error('save-first-failed'); }
      }
      const res = await api.runs.start(projectId, {
        kind: 'gen', jobs: [...picked], maxJobs, autoSliceAfterGen: autoSlice,
      });
      m.setBusy(false);
      m.close('started');
      toast.success({ title: `Đã bắt đầu ${picked.size} lượt sinh ảnh` });
      if (res?.runId) openRun(res.runId);
    } catch (e) {
      submitting = false;
      m.setBusy(false);
      if (e?.message === 'save-first-failed') { syncFooter(); return; }
      const view = errors.present(e);
      if (e?.code === 'RUN_CONFLICT') {
        activeRun = { id: e.details?.runId, progress: e.details?.progress };
        renderBanner();
        return;
      }
      if (e?.code === 'IMAGEGEN_UNAVAILABLE') {
        doctorState = { phase: 'blocked', data: { imageGen: { reason: e.details?.reason } }, error: e };
        renderBanner();
        return;
      }
      // lỗi khác: hiện INLINE trong modal, không chỉ toast (§5.5)
      clear(bannerSlot);
      bannerSlot.appendChild(createBanner({
        kind: 'error', title: `${view.title} — ${view.explain}`,
        actions: [createButton({ label: 'Thử lại', variant: 'secondary', size: 'sm', onClick: () => submit() })],
      }));
      syncFooter();
    }
  }

  renderMatrix();
  renderOptions();
  renderBanner();
  loadDoctor(false);
  loadActiveRun();

  return m;
}

/** "Đã đổi" = cần sinh: chưa có ○, cũ hơn thiết kế ⟳, hoặc lỗi ❌. */
function needsGen(state) {
  return state === undefined || state === null || state === 'never' || state === 'stale' || state === 'failed';
}

/** Ghi lại lựa chọn song song / auto-cắt vào kitgen.prefs.v1 (chỉ qua core/store.js). */
function savePrefs(maxJobs, autoSliceAfterGen) {
  try { store.patch(store.keys.prefs, { maxJobs, autoSliceAfterGen }); }
  catch { /* store chặn (allowlist/secret) thì bỏ qua, không phá modal */ }
}

function readPrefs() {
  try {
    const p = store.get(store.keys.prefs);
    return { maxJobs: Number(p.maxJobs) || 4, autoSliceAfterGen: p.autoSliceAfterGen !== false };
  } catch { return { maxJobs: 4, autoSliceAfterGen: true }; }
}

function fmtMinutes(seconds) {
  const m = Math.max(1, Math.round(Number(seconds) / 60));
  return `${m} phút`;
}
