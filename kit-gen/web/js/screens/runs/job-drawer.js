/**
 * runs/job-drawer.js — DRAWER LOG/PROMPT của MỘT lượt sinh ảnh (§3-S4-6, đóng D7).
 * Mở được từ bất kỳ badge ❌ nào trong app.
 *
 * Nguồn: #37 `GET /api/runs/:runId/jobs/:job/log` (text/plain, agent ĐÃ REDACT)
 *      + #38 `GET /api/runs/:runId/jobs/:job/prompt`.
 * Khi agent tắt: đọc log của lượt từ IDB `runlog` và dán nhãn `bản lưu tạm` (§4.9).
 */

import {
  createBadge, createButton, createCodeBlock, createEmptyState, createErrorState,
  createSpinnerRow, createTabs, el, clear, openDrawer, toast,
} from '../../ui/index.js';
import { api, errors, idb } from '../../core/index.js';
import { downloadText } from './log-view.js';

export function openJobDrawer({ runId, job, projectId = null, returnFocusTo = null } = {}) {
  const logPanel = el('div', { class: 'kg-stack', style: { gap: 'var(--s-2)' } });
  const promptPanel = el('div', { class: 'kg-stack', style: { gap: 'var(--s-2)' } });

  const tabs = createTabs({
    ariaLabel: 'Nội dung của lượt sinh ảnh',
    tabs: [
      { id: 'log', label: 'Nhật ký', icon: '▤', panel: logPanel },
      { id: 'prompt', label: 'Prompt đã dùng', icon: '✎', panel: promptPanel },
    ],
    active: 'log',
    onChange: (id) => { if (id === 'prompt') loadPrompt(); },
  });

  const drawer = openDrawer({
    title: `Lượt ${job}`,
    wide: true,
    blocking: false,     // §5.5: drawer log KHÔNG chặn — vẫn xem được màn phía sau
    body: el('div', {}, [tabs.el]),
    returnFocusTo,
  });

  let logText = '';
  logPanel.appendChild(createSpinnerRow({ label: 'Đang đọc nhật ký…' }));

  (async () => {
    try {
      const res = await api.runs.jobLog(runId, job, 2000);
      logText = typeof res?.text === 'function' ? await res.text() : String(res ?? '');
      renderLog({ cached: false });
    } catch (e) {
      // Agent tắt hoặc LOG_NOT_FOUND → thử bản lưu tạm trong IDB
      const cached = await idb.runlog.get(runId).catch(() => null);
      const lines = (cached?.lines ?? []).filter((l) => l.job === job);
      if (lines.length > 0) {
        logText = lines.map((l) => `${l.t ?? ''} ${l.text ?? ''}`.trim()).join('\n');
        renderLog({ cached: true });
        return;
      }
      clear(logPanel);
      const view = errors.present(e);
      logPanel.appendChild(createErrorState({
        title: view.title, description: view.explain,
        actions: [createButton({
          label: 'Chạy lại lượt này', variant: 'secondary',
          onClick: () => { drawer.close(); toast.info({ title: 'Mở modal Sinh ảnh để chạy lại lượt này' }); },
        })],
        devDetails: errors.devDetails(e),
      }));
    }
  })();

  function renderLog({ cached }) {
    clear(logPanel);
    if (logText.trim() === '') {
      logPanel.appendChild(createEmptyState({
        inline: true, icon: '▤', title: 'Nhật ký trống',
        description: 'Lượt này chưa ghi dòng nào.',
      }));
      return;
    }
    logPanel.appendChild(el('div', { class: 'kg-row' }, [
      cached ? createBadge({ state: 'neutral', text: 'bản lưu tạm', iconGlyph: '▤', long: 'Đọc từ bộ nhớ trình duyệt vì chưa gọi được công cụ local' }) : null,
      el('span', { class: 'kg-t-caption kg-fg-default', text: `${logText.split('\n').length} dòng` }),
      el('span', { style: { marginLeft: 'auto' } }),
      createButton({
        label: 'Tải log', variant: 'ghost', size: 'sm', icon: '⬇',
        onClick: () => downloadText(`${runId}-${job}.log`, logText),
      }),
    ]));
    logPanel.appendChild(createCodeBlock({ code: logText, ariaLabel: `Nhật ký của lượt ${job}` }).el);
  }

  let promptLoaded = false;
  async function loadPrompt() {
    if (promptLoaded) return;
    promptLoaded = true;
    clear(promptPanel);
    promptPanel.appendChild(createSpinnerRow({ label: 'Đang đọc prompt…' }));
    try {
      const res = await api.runs.jobPrompt(runId, job);
      clear(promptPanel);
      const atts = Array.isArray(res?.attachments) ? res.attachments : [];
      if (atts.length > 0) {
        promptPanel.appendChild(el('div', { class: 'kg-stack', style: { gap: 'var(--s-1)' } }, [
          el('span', { class: 'd-props__kind', text: `Ảnh đính kèm (${atts.length})` }),
          ...atts.map((p) => el('div', { class: 'kg-row kg-row--tight' }, [
            projectId
              ? el('img', {
                  src: api.files.thumbUrl(projectId, p), alt: `Ảnh đính kèm ${p}`,
                  class: 'kg-checker', style: { width: 'var(--s-10)', height: 'auto', borderRadius: 'var(--r-1)' },
                  loading: 'lazy',
                })
              : null,
            el('span', { class: 'kg-t-mono kg-truncate', text: p }),
          ])),
        ]));
      }
      promptPanel.appendChild(createCodeBlock({
        code: String(res?.prompt ?? ''), ariaLabel: `Prompt của lượt ${job}`,
      }).el);
    } catch (e) {
      clear(promptPanel);
      const view = errors.present(e);
      promptPanel.appendChild(createErrorState({
        title: view.title, description: view.explain, devDetails: errors.devDetails(e),
      }));
    }
  }

  return drawer;
}
