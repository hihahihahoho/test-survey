/**
 * badge.js — §5.7 bảng CHUẨN 7 trạng thái job + 5 trạng thái run + §2.4 agent pill.
 * ĐÂY LÀ NGUỒN DUY NHẤT của icon/màu/nhãn trạng thái. Màn nào tự viết lại nhãn
 * là sai spec. LUẬT: icon + CHỮ luôn đi cùng nhau, không chỗ nào chỉ màu.
 *
 * API:
 *   JOB_STATES, RUN_STATES, AGENT_STATES        // dữ liệu tra cứu
 *   createBadge({ state, kind, text, long, outline })
 *   createJobBadge(state, { long, count })
 *   createRunBadge(state, { done, total, failed })
 *   createAgentPill(state, { onClick, workspaceSuffix })
 *   worstJobState([...states])                   // gộp nhiều job vào 1 badge
 *   createTag(label, { onRemove })
 *   createStatusDot(tone, label)
 */
import { el, icon as iconEl, cx, uid } from './dom.js';
import { attachTooltip } from './tooltip.js';

/* --- §5.7 · 7 trạng thái job. `tone` = class màu trong badge.css --- */
export const JOB_STATES = {
  never:   { icon: '○', tone: 'never',   short: 'Chưa có',      long: 'Chưa sinh ảnh lần nào' },
  queued:  { icon: '◔', tone: 'queued',  short: 'Đang chờ',     long: 'Đang chờ tới lượt' },
  running: { icon: '⏳', tone: 'running', short: 'Đang sinh',    long: 'Đang sinh ảnh' },
  ok:      { icon: '✓', tone: 'ok',      short: 'Xong',         long: 'Xong' },
  stale:   { icon: '⟳', tone: 'stale',   short: 'Cần sinh lại', long: 'Thiết kế đã đổi sau lần sinh ảnh cuối' },
  uncut:   { icon: '✂', tone: 'uncut',   short: 'Cần cắt',      long: 'Có ảnh mới nhưng chưa cắt' },
  failed:  { icon: '❌', tone: 'failed',  short: 'Lỗi',          long: 'Lỗi khi sinh ảnh' },
};

/** §5.7 · thứ tự ưu tiên khi gộp nhiều job vào 1 badge. */
export const JOB_PRIORITY = ['failed', 'running', 'queued', 'stale', 'uncut', 'never', 'ok'];

/** §5.7 · 5 trạng thái của LƯỢT CHẠY. done-with-errors KHÔNG dùng ✓, không nói "xong" trơn. */
export const RUN_STATES = {
  queued:             { icon: '◔', tone: 'queued',  short: 'Đang chờ' },
  running:            { icon: '⏳', tone: 'running', short: 'Đang chạy' },
  done:               { icon: '✓', tone: 'ok',      short: 'Xong' },
  'done-with-errors': { icon: '⚠', tone: 'warn',    short: 'Có lỗi' },
  cancelled:          { icon: '■', tone: 'never',   short: 'Đã dừng' },
  'env-failed':       { icon: '⛔', tone: 'failed',  short: 'Không chạy được — môi trường' },
};

/** §2.4 · 6 trạng thái agent pill. Pill LUÔN có chữ, không bao giờ chỉ màu (audit I1). */
export const AGENT_STATES = {
  connected:        { dot: 'ok',      tone: 'ok',      text: 'Đã kết nối' },
  checking:         { dot: 'muted',   tone: 'muted',   text: 'Đang kiểm tra…' },
  'not-running':    { dot: 'muted',   tone: 'muted',   text: 'Chưa thấy công cụ local' },
  'blocked':        { dot: 'warn',    tone: 'warn',    text: 'Trình duyệt đang chặn' },
  'protocol-old':   { dot: 'warn',    tone: 'warn',    text: 'Công cụ local cũ' },
  'imagegen-down':  { dot: 'warn',    tone: 'warn',    text: 'Chưa tạo được ảnh' },
};
const AGENT_ICON = { connected: '●', checking: '◐', 'not-running': '○', blocked: '▲', 'protocol-old': '▲', 'imagegen-down': '⚠' };

/** Badge chung. `state` là khoá tone, `text` là chữ BẮT BUỘC. */
export function createBadge({ state = 'neutral', text = '', iconGlyph = null, long = null, outline = false } = {}) {
  if (!text) throw new Error('kg-badge: thiếu `text` — §5.7 cấm badge chỉ có icon/màu');
  const node = el('span', {
    class: cx('kg-badge', `kg-badge--${state}`, outline && 'kg-badge--outline'),
  }, [
    iconGlyph ? iconEl(iconGlyph) : null,
    el('span', { class: 'kg-badge__text', text }),
  ]);
  if (long) {
    // nhãn dài đi vào tooltip + aria-label để screen reader đọc đủ nghĩa
    node.setAttribute('aria-label', long);
    attachTooltip(node, long.length > 48 ? long.slice(0, 47) + '…' : long);
    node.tabIndex = 0;   // tooltip phải mở được bằng bàn phím
  }
  return node;
}

/** Badge cho 1 job theo §5.7. `count` > 1 → hiện "N × nhãn". */
export function createJobBadge(state, { long = null, count = 1 } = {}) {
  const s = JOB_STATES[state];
  if (!s) throw new Error(`kg-badge: trạng thái job lạ "${state}" — §5.7 chỉ có 7`);
  const text = count > 1 ? `${count} ${s.short.toLowerCase()}` : s.short;
  return createBadge({ state: s.tone, text, iconGlyph: s.icon, long: long || s.long });
}

/** Badge cho 1 run theo §5.7 (kèm N/M và số lỗi). */
export function createRunBadge(state, { done = null, total = null, failed = 0 } = {}) {
  const s = RUN_STATES[state];
  if (!s) throw new Error(`kg-badge: trạng thái run lạ "${state}" — §5.7 chỉ có 5(+queued)`);
  let text = s.short;
  if (done !== null && total !== null) {
    if (state === 'running') text = `${s.short} ${done}/${total}`;
    else if (state === 'done') text = `${s.short} ${done}/${total}`;
    else if (state === 'done-with-errors') text = `${done}/${total} · ${failed} lỗi`;
    else if (state === 'cancelled') text = `${s.short} · ${done}/${total}`;
  }
  return createBadge({ state: s.tone, text, iconGlyph: s.icon, long: `${s.short}${failed ? ` · ${failed} lượt lỗi` : ''}` });
}

/** §5.7 · gộp nhiều job thành 1 badge: lấy trạng thái XẤU NHẤT. */
export function worstJobState(states = []) {
  for (const p of JOB_PRIORITY) if (states.includes(p)) return p;
  return 'ok';
}

/** §2.4 · agent pill ở header. Bấm vào mở Sheet trạng thái (do màn tự truyền onClick). */
export function createAgentPill(state, { onClick = null, workspaceSuffix = null } = {}) {
  const s = AGENT_STATES[state];
  if (!s) throw new Error(`kg-agent-pill: trạng thái lạ "${state}" — §2.4 chỉ có 6`);
  const clickable = state !== 'checking' && typeof onClick === 'function';
  const label = workspaceSuffix ? `${s.text} ${workspaceSuffix}` : s.text;
  const node = el(clickable ? 'button' : 'span', {
    class: cx('kg-pill', `kg-pill--${s.tone}`),
    type: clickable ? 'button' : null,
    disabled: state === 'checking' ? true : null,
    'aria-live': state === 'checking' ? 'polite' : null,
  }, [
    el('span', { class: cx('kg-dot', `kg-dot--${state === 'checking' ? 'running' : s.dot}`), 'aria-hidden': 'true' }),
    iconEl(AGENT_ICON[state]),
    el('span', { class: 'kg-truncate', text: label }),
  ]);
  if (clickable) node.addEventListener('click', onClick);
  return node;
}

/** Tag/chip có nút bỏ, bỏ được bằng bàn phím. */
export function createTag(label, { onRemove = null } = {}) {
  const id = uid('kg-tag');
  const node = el('span', { class: 'kg-tag', id }, [el('span', { class: 'kg-truncate', text: label })]);
  if (onRemove) {
    node.appendChild(el('button', {
      type: 'button', class: 'kg-tag__remove',
      'aria-label': `Bỏ tag ${label}`,
      onClick: () => onRemove(label),
    }, [iconEl('×')]));
  }
  return node;
}

/** StatusDot (§5.6): 8px tròn + CHỮ bên cạnh. pulse chỉ ở tone running. */
export function createStatusDot(tone = 'muted', label = '') {
  if (!label) throw new Error('kg-dot: thiếu label — §5.6 buộc có chữ bên cạnh');
  return el('span', { class: 'kg-dot-label' }, [
    el('span', { class: cx('kg-dot', `kg-dot--${tone}`), 'aria-hidden': 'true' }),
    el('span', { text: label }),
  ]);
}

/** MatrixCell (§5.6) — ô ma trận S2, là <button>, aria-label đủ nghĩa. */
export function createMatrixCell({ state, variantLabel, sheetLabel, selected = false, onClick = null }) {
  const s = JOB_STATES[state];
  if (!s) throw new Error(`kg-matrix-cell: trạng thái lạ "${state}"`);
  const aria = `${variantLabel}, sheet ${sheetLabel}, ${s.long}`;
  const btn = el('button', {
    type: 'button',
    class: 'kg-matrix-cell kg-focus-inset',
    'aria-label': aria,
    'aria-pressed': selected ? 'true' : 'false',
  }, [iconEl(s.icon), el('span', { class: 'kg-truncate', text: s.short })]);
  if (onClick) btn.addEventListener('click', onClick);
  attachTooltip(btn, `${variantLabel} · ${sheetLabel}`);
  return btn;
}
