/**
 * runs/log-view.js — LogView (§5.6) cho panel NHẬT KÝ của S4.
 * CỐ Ý không thành primitive ui/: chỉ S4 dùng, §5.6 không khai. CSS đã về file thật
 * (web/css/components/runs.css) ở lượt tích hợp.
 *
 * Luật §3-S4-5 đã thi công:
 *  · NỐI THÊM, không ghi đè (đóng D2) — mỗi lô dòng chỉ append vào cuối
 *  · timestamp hh:mm:ss + job + nội dung; dòng lỗi có nền danger 10%
 *  · tự cuộn xuống, NHƯNG dừng tự cuộn khi user cuộn lên → hiện nút `⏬ Về cuối`
 *  · filter [Chỉ lỗi] / [Chỉ lượt này] · [⬇ Tải log]
 *  · aria-live="polite" nhưng CHỈ đọc dòng lỗi (§5.8-A8: không spam screen reader)
 */

import { createButton, el, clear } from '../../ui/index.js';

const NEAR_BOTTOM_PX = 48;

export function createLogView() {
  const list = el('div', {
    class: 'r-log', role: 'log', tabindex: '0',
    'aria-label': 'Nhật ký lượt chạy',
  });
  // Vùng chỉ đọc dòng LỖI cho screen reader — tránh đọc hàng nghìn dòng info.
  const liveErrors = el('div', { class: 'kg-sr-only', role: 'status', 'aria-live': 'polite' });

  const toBottom = createButton({
    label: 'Về cuối', variant: 'secondary', size: 'sm', icon: '⏬',
    onClick: () => { autoScroll = true; scrollToEnd(); syncToBottom(); },
  });
  const toBottomWrap = el('div', { class: 'r-tobottom', hidden: true }, [toBottom]);

  const wrap = el('div', { class: 'r-logwrap' }, [list, toBottomWrap, liveErrors]);

  let autoScroll = true;
  let all = [];
  let filterErrorsOnly = false;
  let filterJob = null;

  list.addEventListener('scroll', () => {
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight <= NEAR_BOTTOM_PX;
    autoScroll = nearBottom;
    syncToBottom();
  });

  function syncToBottom() {
    if (autoScroll) toBottomWrap.setAttribute('hidden', '');
    else toBottomWrap.removeAttribute('hidden');
  }

  function visible(line) {
    if (filterErrorsOnly && line.level !== 'error') return false;
    if (filterJob && line.job !== filterJob) return false;
    return true;
  }

  function lineNode(line) {
    const isErr = line.level === 'error';
    return el('div', { class: `r-log__line${isErr ? ' r-log__line--error' : ''}` }, [
      el('span', { class: 'r-log__t', text: hhmmss(line.t) }),
      line.job ? el('span', { class: 'r-log__job', text: line.job }) : null,
      el('span', { class: `r-log__msg${isErr ? ' r-log__msg--error' : ''}`, text: String(line.text ?? '') }),
    ]);
  }

  function scrollToEnd() {
    list.scrollTop = list.scrollHeight;
  }

  /** NỐI THÊM một lô dòng (không dựng lại cả danh sách). */
  function append(batch) {
    all = all.concat(batch);
    if (all.length > 5000) all = all.slice(-5000);
    const frag = typeof document !== 'undefined' && document.createDocumentFragment
      ? document.createDocumentFragment() : null;
    let lastError = null;
    for (const line of batch) {
      if (line.level === 'error') lastError = line;
      if (!visible(line)) continue;
      const node = lineNode(line);
      if (frag) frag.appendChild(node); else list.appendChild(node);
    }
    if (frag) list.appendChild(frag);
    if (lastError) liveErrors.textContent = `Lỗi: ${lastError.job ? `${lastError.job} — ` : ''}${lastError.text}`;
    if (autoScroll) scrollToEnd();
  }

  /** Vẽ lại toàn bộ (chỉ khi đổi filter, hoặc nạp từ cache). */
  function setLines(lines) {
    all = [...lines];
    clear(list);
    const frag = typeof document !== 'undefined' && document.createDocumentFragment
      ? document.createDocumentFragment() : null;
    for (const line of all) {
      if (!visible(line)) continue;
      const node = lineNode(line);
      if (frag) frag.appendChild(node); else list.appendChild(node);
    }
    if (frag) list.appendChild(frag);
    if (autoScroll) scrollToEnd();
  }

  function setFilter({ errorsOnly = null, job = null } = {}) {
    if (errorsOnly !== null) filterErrorsOnly = Boolean(errorsOnly);
    if (job !== undefined) filterJob = job;
    setLines(all);
  }

  function text() {
    return all.map((l) => `${hhmmss(l.t)} ${l.job ?? ''} ${l.text}`.trim()).join('\n');
  }

  return {
    el: wrap, list, append, setLines, setFilter, text,
    get errorsOnly() { return filterErrorsOnly; },
    get jobFilter() { return filterJob; },
    get count() { return all.length; },
  };
}

export function hhmmss(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:--:--';
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map((n) => String(n).padStart(2, '0')).join(':');
}

/** Tải log ra file .txt — Blob same-origin, không gửi gì ra ngoài. */
export function downloadText(filename, content) {
  if (typeof document === 'undefined' || typeof URL === 'undefined' || typeof Blob === 'undefined') return false;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
