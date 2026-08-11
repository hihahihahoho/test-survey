/**
 * runs/run-detail.js — CHI TIẾT 1 LƯỢT CHẠY (§3-S4, wireframe chính).
 * Đóng D1, D2, D3, D5, D6, D7, D9, E1, E4, E5, H1, R20.
 *
 * Thành phần theo đúng thứ tự spec: run header (+đồng hồ, [■ Dừng]) → progress + ETA →
 * dải pha 1/2 → 2 cột (danh sách lượt · nhật ký) → thanh hành động dưới.
 */

import {
  createBadge, createBanner, createButton, createEmptyState, createErrorState,
  createJobBadge, createRunBadge, createSkeleton, el, clear, toast, confirmLight,
} from '../../ui/index.js';
import { api, errors } from '../../core/index.js';
import { readOnlyReason } from '../shared/read-only.js';
import { createRunStore, fmtDuration, isFinished, splitJob } from './run-store.js';
import { diagText, elapsedText, fmtMinutes, jobMeta, kindLabel, mapJobState, variantLabel } from './run-format.js';
import { createLogView, downloadText } from './log-view.js';
import { openJobDrawer } from './job-drawer.js';
import { bindRunShortcuts } from '../design/shortcuts.js';
import { s4Commands } from './commands.js';   // QA: thiếu import này ⇒ ReferenceError khi ⌘K gọi commands()

export function createRunDetail({ projectId, runId, readOnly = false, navigate, contract = null }) {
  const root = el('div', { class: 'r-screen' });
  const headSlot = el('div', { class: 'kg-stack', style: { gap: 'var(--s-2)' } });
  const bodySlot = el('div', { style: { display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: '0' } });
  const footSlot = el('div', { class: 'kg-row' });
  root.appendChild(headSlot);
  root.appendChild(bodySlot);
  root.appendChild(footSlot);

  const log = createLogView();
  let snap = { run: null, lines: [], pollMode: false, connected: false, fromCache: false, error: null };
  let selectedJob = null;
  let clockTimer = null;
  let started = false;

  const store = createRunStore({
    projectId, runId,
    onUpdate: (s) => { snap = s; render(); },
    onLines: (batch) => log.append(batch),
  });

  const unbindKeys = bindRunShortcuts({
    onCancel: () => cancelRun(),
    onRetryFailed: () => retryFailed(),
    onNextJob: () => stepJob(1),
    onPrevJob: () => stepJob(-1),
    onOpenJobLog: () => { if (selectedJob) openJobDrawer({ runId, job: selectedJob, projectId }); },
    onToggleErrorFilter: () => { log.setFilter({ errorsOnly: !log.errorsOnly }); render(); },
  });

  /* ── hành động ─────────────────────────────────────────────────────────── */

  async function cancelRun() {
    const run = snap.run;
    if (!run || isFinished(run.status) || readOnly) return;
    const ok = await confirmLight({
      title: `Dừng lượt chạy ${run.id}?`,
      message: 'Ảnh của các lượt đã xong vẫn được giữ. Các lượt đang chạy sẽ bị bỏ và không hoàn quota đã dùng.',
      confirmLabel: 'Dừng lượt chạy',
    });
    if (!ok) return;
    try {
      const res = await api.runs.cancel(runId);
      toast.info({
        title: 'Đã dừng lượt chạy',
        description: `Giữ ${res?.kept ?? 0} lượt đã xong · bỏ ${(res?.killed ?? []).length} lượt đang chạy.`,
      });
      store.reload();
    } catch (e) {
      const view = errors.present(e);
      toast.error({ title: view.title, description: view.explain });
    }
  }

  async function retryJobs(list, label) {
    if (readOnly || list.length === 0) return;
    try {
      const res = await api.runs.start(projectId, {
        kind: snap.run?.kind === 'slice' ? 'slice' : 'gen',
        jobs: list, maxJobs: snap.run?.maxJobs ?? 4, autoSliceAfterGen: true,
      });
      toast.success({ title: label });
      if (res?.runId) navigate(`/p/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(res.runId)}`);
    } catch (e) {
      const view = errors.present(e);
      if (e?.code === 'RUN_CONFLICT' && e.details?.runId) {
        toast.error({
          title: view.title, description: view.explain,
          actions: [{ label: 'Xem lượt đó', onClick: () => navigate(`/p/${encodeURIComponent(projectId)}/runs/${encodeURIComponent(e.details.runId)}`) }],
        });
        return;
      }
      toast.error({ title: view.title, description: view.explain });
    }
  }

  function failedJobs() {
    return (snap.run?.jobs ?? []).filter((j) => j.status === 'failed').map((j) => j.job);
  }
  function retryFailed() {
    const list = failedJobs();
    if (list.length === 0) return;
    retryJobs(list, `Đang chạy lại ${list.length} lượt lỗi`);
  }

  function stepJob(delta) {
    const jobs = snap.run?.jobs ?? [];
    if (jobs.length === 0) return;
    const i = Math.max(0, jobs.findIndex((j) => j.job === selectedJob));
    selectedJob = jobs[(i + delta + jobs.length) % jobs.length].job;
    render();
  }

  /* ── render ────────────────────────────────────────────────────────────── */

  function render() {
    const run = snap.run;
    clear(headSlot);
    clear(footSlot);

    if (!run && snap.error) { renderError(); return root; }
    if (!run) { renderLoading(); return root; }

    const p = run.progress ?? {};
    const total = Number(p.total ?? (run.jobs ?? []).length ?? 0);
    const done = Number(p.done ?? 0);
    const failed = Number(p.failed ?? 0);
    const running = !isFinished(run.status);

    /* header */
    const title = el('div', { class: 'r-head' }, [
      createButton({
        variant: 'ghost', size: 'sm', icon: '←', iconOnly: true, ariaLabel: 'Về danh sách lượt chạy',
        onClick: () => navigate(`/p/${encodeURIComponent(projectId)}/runs`),
      }),
      el('h1', { class: 'r-head__title', text: `Lượt chạy ${run.id}` }),
      createRunBadge(run.status ?? 'running', { done, total, failed }),
      run.kind ? createBadge({ state: 'neutral', text: kindLabel(run.kind), iconGlyph: '⚙' }) : null,
      el('span', { class: 'r-clock', text: elapsedText(run) }),
      snap.pollMode ? createBadge({ state: 'neutral', text: 'chế độ poll', iconGlyph: '↻', long: 'Nhật ký trực tiếp bị đứt — đang cập nhật mỗi 2 giây' }) : null,
      snap.fromCache ? createBadge({ state: 'neutral', text: 'bản lưu tạm', iconGlyph: '▤', long: 'Đọc từ bộ nhớ trình duyệt vì chưa gọi được công cụ local' }) : null,
      el('span', { style: { marginLeft: 'auto' } }),
      running
        ? createButton({
            label: 'Dừng', variant: 'danger', size: 'sm', icon: '■',
            disabled: readOnly, tooltip: readOnly ? readOnlyReason() : 'Dừng lượt chạy (⌘.)',
            onClick: () => cancelRun(),
          })
        : null,
    ]);
    headSlot.appendChild(title);

    /* progress + ETA */
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const etaText = running
      ? (snap.eta === null || snap.eta === undefined ? 'đang tính…' : `ước còn ~${fmtMinutes(snap.eta)}`)
      : (run.finishedAt ? `tổng ${fmtDuration(new Date(run.finishedAt) - new Date(run.startedAt))}` : '');
    headSlot.appendChild(el('div', { class: 'r-progress' }, [
      el('div', {
        class: 'r-progress__track', role: 'progressbar',
        'aria-valuemin': '0', 'aria-valuemax': String(total || 1), 'aria-valuenow': String(done),
        'aria-label': `Tiến độ: ${done} trên ${total} lượt xong`,
      }, [
        el('div', {
          class: `r-progress__fill${failed > 0 ? ' r-progress__fill--bad' : (!running ? ' r-progress__fill--ok' : '')}`,
          style: { width: `${pct}%` },
        }),
      ]),
      el('p', {
        class: 'r-progress__label', role: 'status', 'aria-live': 'polite',
        text: `${done}/${total} · ${failed > 0 ? `${failed} lỗi · ` : ''}${etaText}${run.maxJobs ? ` · ${run.maxJobs} lượt song song` : ''}`,
      }),
    ]));

    /* dải pha (X9) */
    if (run.phase) {
      const idx = Number(run.phase.index ?? 1);
      headSlot.appendChild(el('div', { class: 'r-phases' }, [
        phaseChip('Pha 1/2 Sinh ảnh', idx === 1),
        el('span', { 'aria-hidden': 'true', text: '→' }),
        phaseChip('Pha 2/2 Cắt (tự động sau khi sinh)', idx === 2),
      ]));
    }

    /* banner môi trường / huỷ / lỗi cắt */
    headSlot.appendChild(statusBanner(run));

    /* body 2 cột */
    clear(bodySlot);
    if ((run.jobs ?? []).length === 0 && !running) {
      bodySlot.appendChild(createEmptyState({
        inline: true, icon: '⚡', title: 'Lượt chạy này không có lượt nào',
        description: 'Có thể bản thiết kế đã đổi sau khi lượt chạy kết thúc.',
      }));
    } else {
      bodySlot.appendChild(el('div', { class: 'r-split' }, [jobsColumn(run), logColumn(run)]));
    }

    /* thanh hành động dưới */
    if (running) {
      footSlot.appendChild(createButton({
        label: 'Dừng lượt chạy', variant: 'secondary', icon: '■', disabled: readOnly,
        onClick: () => cancelRun(),
      }));
    } else if (failedJobs().length > 0) {
      footSlot.appendChild(createButton({
        label: `Chạy lại ${failedJobs().length} lượt lỗi`, variant: 'primary', icon: '↻',
        disabled: readOnly, tooltip: readOnly ? readOnlyReason() : 'Chạy lại lượt lỗi (⌘⏎)',
        onClick: () => retryFailed(),
      }));
    }
    footSlot.appendChild(createButton({
      label: 'Xem bản thiết kế', variant: 'ghost',
      onClick: () => navigate(`/p/${encodeURIComponent(projectId)}/design`),
    }));
    if (!running && (run.status === 'done' || run.status === 'done-with-errors')) {
      footSlot.appendChild(createButton({
        label: 'Xem kit đã cắt', variant: 'ghost',
        onClick: () => navigate(`/p/${encodeURIComponent(projectId)}/kit`),
      }));
    }

    ensureClock(running);
    return root;
  }

  function phaseChip(text, current) {
    return el('span', { class: 'r-phase', 'aria-current': current ? 'step' : null }, [el('span', { text })]);
  }

  function statusBanner(run) {
    const wrap = el('div', {});
    if (run.status === 'env-failed') {
      wrap.appendChild(createBanner({
        kind: 'error',
        title: 'Công cụ tạo ảnh chưa dùng được — các lượt đã dừng, không tốn quota.',
        actions: [createButton({
          label: 'Khắc phục', variant: 'secondary', size: 'sm',
          onClick: () => navigate('/settings?tab=env'),
        })],
      }));
    } else if (run.status === 'cancelled') {
      wrap.appendChild(createBanner({
        kind: 'info',
        title: `Đã dừng · ${run.progress?.done ?? 0}/${run.progress?.total ?? 0} xong. Ảnh của các lượt đã xong vẫn được giữ.`,
      }));
    }
    const quota = (run.jobs ?? []).some((j) => j.diagnosis === 'QUOTA_SUSPECTED');
    if (quota) {
      wrap.appendChild(createBanner({
        kind: 'warning',
        title: 'Có vẻ đã chạm giới hạn tạo ảnh của tài khoản. Sinh ảnh tiêu quota gấp 3–5 lần lượt hỏi thường.',
        actions: [createButton({
          label: 'Chạy lại lượt lỗi', variant: 'secondary', size: 'sm', disabled: readOnly,
          onClick: () => retryFailed(),
        })],
      }));
    }
    return wrap;
  }

  function jobsColumn(run) {
    const col = el('div', { class: 'r-col' });
    const jobs = run.jobs ?? [];
    col.appendChild(el('div', { class: 'r-col__head' }, [
      el('h2', { class: 'r-col__title', text: `Lượt (${jobs.length})` }),
    ]));
    const list = el('div', { class: 'r-jobs', role: 'list' });
    for (const j of jobs) {
      const { variant, sheet } = j.variant ? j : splitJob(j.job);
      const isSel = selectedJob === j.job;
      const row = el('div', { class: 'r-job', role: 'listitem', 'aria-current': isSel ? 'true' : null }, [
        createJobBadge(mapJobState(j.status), { long: diagText(j) }),
        el('button', {
          type: 'button', class: 'r-job__name kg-focus-inset',
          'aria-label': `Xem nhật ký của lượt ${variant} ${sheet}`,
          onClick: () => { selectedJob = j.job; log.setFilter({ job: j.job }); render(); },
        }, [el('span', { text: `${variantLabel(variant)} · ${sheet}` })]),
        el('span', { class: 'r-job__meta', text: jobMeta(j) }),
        j.recovered ? createBadge({ state: 'neutral', text: 'đã cứu ảnh', iconGlyph: '↩', long: 'Ảnh được cứu từ thư mục tạm của công cụ tạo ảnh' }) : null,
        el('span', { class: 'r-job__acts' }, [
          createButton({
            variant: 'ghost', size: 'sm', icon: '▤', iconOnly: true,
            ariaLabel: `Xem nhật ký lượt ${j.job}`, tooltip: 'Xem nhật ký',
            onClick: () => openJobDrawer({ runId, job: j.job, projectId }),
          }),
          j.status === 'failed'
            ? createButton({
                variant: 'ghost', size: 'sm', icon: '↻', iconOnly: true,
                ariaLabel: `Chạy lại lượt ${j.job}`, tooltip: 'Chạy lại lượt này',
                disabled: readOnly,
                onClick: () => retryJobs([j.job], `Đang chạy lại lượt ${j.job}`),
              })
            : null,
        ]),
      ]);
      list.appendChild(row);
      if (j.diagnosis) {
        list.appendChild(el('p', { class: 'r-job__diag', text: `ⓘ ${diagText(j)}` }));
      }
    }
    col.appendChild(list);
    return col;
  }

  function logColumn(run) {
    const col = el('div', { class: 'r-col' });
    col.appendChild(el('div', { class: 'r-col__head' }, [
      el('h2', { class: 'r-col__title', text: 'Nhật ký' }),
      snap.connected && !snap.pollMode && !isFinished(run.status)
        ? createBadge({ state: 'running', text: 'trực tiếp', iconGlyph: '●' })
        : null,
      el('span', { style: { marginLeft: 'auto' } }),
      createButton({
        label: log.errorsOnly ? 'Tất cả' : 'Chỉ lỗi', variant: 'ghost', size: 'sm',
        tooltip: 'Lọc nhật ký (f)',
        onClick: () => { log.setFilter({ errorsOnly: !log.errorsOnly }); render(); },
      }),
      log.jobFilter
        ? createButton({
            label: `Chỉ ${log.jobFilter}`, variant: 'secondary', size: 'sm', icon: '✕',
            ariaLabel: `Bỏ lọc theo lượt ${log.jobFilter}`,
            onClick: () => { log.setFilter({ job: null }); render(); },
          })
        : null,
      createButton({
        label: 'Tải log', variant: 'ghost', size: 'sm', icon: '⬇',
        onClick: () => downloadText(`${runId}.log`, log.text()),
      }),
    ]));
    if (log.count === 0) {
      col.appendChild(createEmptyState({
        inline: true, icon: '▤', title: 'Chưa có dòng nhật ký nào',
        description: isFinished(run.status)
          ? 'Nhật ký của lượt chạy này không còn trong bộ nhớ trình duyệt. Mở nhật ký từng lượt để đọc từ máy.'
          : 'Nhật ký sẽ hiện ngay khi công cụ local bắt đầu ghi.',
      }));
    } else {
      col.appendChild(log.el);
    }
    return col;
  }

  function renderLoading() {
    clear(bodySlot);
    headSlot.appendChild(createSkeleton({ variant: 'title' }));
    bodySlot.appendChild(el('div', { 'aria-busy': 'true' }, [createSkeleton({ variant: 'text', count: 3 })]));
  }

  function renderError() {
    clear(bodySlot);
    const view = errors.present(snap.error);
    bodySlot.appendChild(createErrorState({
      title: view.title, description: view.explain,
      actions: [
        createButton({ label: 'Thử lại', variant: 'primary', onClick: () => store.reload() }),
        createButton({ label: 'Về danh sách lượt chạy', variant: 'secondary', onClick: () => navigate(`/p/${encodeURIComponent(projectId)}/runs`) }),
      ],
      devDetails: errors.devDetails(snap.error),
    }));
  }

  /** Đồng hồ chạy + title tab `(3/8) kit-gen` (§3-S4 trạng thái running). */
  function ensureClock(running) {
    if (running && clockTimer === null && typeof setInterval === 'function') {
      clockTimer = setInterval(() => {
        const run = snap.run;
        if (!run) return;
        const nodes = root.querySelectorAll('.r-clock');
        for (const n of nodes) n.textContent = elapsedText(run);
        updateTitle();
      }, 1000);
    }
    if (!running && clockTimer !== null) { clearInterval(clockTimer); clockTimer = null; }
    updateTitle();
  }

  function updateTitle() {
    if (typeof document === 'undefined') return;
    const run = snap.run;
    if (!run) return;
    const p = run.progress ?? {};
    document.title = isFinished(run.status)
      ? `Lượt chạy ${run.id} — kit-gen`
      : `(${p.done ?? 0}/${p.total ?? 0}) kit-gen`;
  }

  if (!started) { started = true; store.start(); }

  return {
    el: root,
    update({ readOnly: ro } = {}) { if (ro !== undefined) readOnly = Boolean(ro); render(); },
    /** §2.3: lệnh của S4 góp vào ⌘K — xem runs/commands.js. */
    commands: () => s4Commands({
      run: snap.run, readOnly, selectedJob, errorsOnly: log.errorsOnly,
      onCancel: () => cancelRun(),
      onRetryFailed: () => retryFailed(),
      onToggleErrorFilter: () => { log.setFilter({ errorsOnly: !log.errorsOnly }); render(); },
      onOpenJobLog: () => { if (selectedJob) openJobDrawer({ runId, job: selectedJob, projectId }); },
    }),
    destroy() {
      unbindKeys();
      store.stop();
      if (clockTimer !== null) { clearInterval(clockTimer); clockTimer = null; }
      clear(root);
    },
  };
}
