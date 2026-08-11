/**
 * chrome.js — HEADER §2.2 + agent pill §2.4 + workspace pill + banner chỉ-đọc §2.5.
 * Chỉ dựng DOM bằng primitive của web/js/ui/**; không tự viết button/pill/banner.
 *
 * Vì `core/detect.js` (PILL.*) và `ui/badge.js` (AGENT_STATES) đặt tên khoá khác nhau,
 * bảng PILL_TO_BADGE dưới đây là chỗ DUY NHẤT dịch giữa hai bên (không sửa file team khác).
 */

import { createAgentPill, createBanner, createButton, createSpinnerRow, el, toast, attachTooltip } from '../ui/index.js';
import * as agentStatus from './agent-status.js';
import { openAgentSheet } from './agent-sheet.js';
import { RUN_CMD } from './commands.js';
import { smallScreenQuery } from './breakpoints.js';

/** detect.PILL (6 trạng thái §2.4) → khoá của ui/badge.js AGENT_STATES. */
const PILL_TO_BADGE = Object.freeze({
  connected: 'connected',
  checking: 'checking',
  'not-running': 'not-running',
  'blocked-by-browser': 'blocked',
  'protocol-mismatch': 'protocol-old',
  'imagegen-unavailable': 'imagegen-down',
});

export function createHeader({ onSearch, onJump, onHome }) {
  const crumbs = el('nav', { class: 'kg-header__crumbs', 'aria-label': 'Đường dẫn' });
  /* Chỗ cắm nút ☰ mở rail-drawer ở mốc ≤1099px (§2.2). Nút do rail.js cấp để
     trạng thái aria-expanded và rail luôn khớp nhau — xem shell.js. */
  const railSlot = el('span', { style: { display: 'inline-flex', flex: 'none' } });
  const pillSlot = el('span', { style: { display: 'inline-flex', flex: 'none' } });
  const wsSlot = el('span', { style: { display: 'inline-flex', flex: 'none' } });

  const searchBtn = createButton({
    label: 'Tìm project…  ⌘K', variant: 'secondary', size: 'sm', icon: '🔍',
    onClick: () => onSearch?.(),
  });
  /* Trên máy nhỏ không có bàn phím để bấm ⌘K ⇒ nút này là đường DUY NHẤT tới
     bảng lệnh. Vì vậy KHÔNG ẩn nó ở <768 (như `.kg-hide-sm` từng làm); chỉ ẩn
     phần CHỮ và giữ lại icon + nhãn cho screen reader. */
  const searchBtnLabel = searchBtn.querySelector('.kg-btn__label');
  if (searchBtnLabel) searchBtnLabel.classList.add('kg-hide-sm');
  searchBtn.setAttribute('aria-label', 'Bảng lệnh (⌘K)');
  searchBtn.appendChild(el('span', { class: 'kg-sr-only', text: 'Bảng lệnh' }));

  const header = el('header', { class: 'kg-header' }, [
    railSlot,
    el('a', {
      class: 'kg-header__logo', href: '#', 'aria-label': 'kit-gen — về danh sách project',
      onClick: (e) => { e.preventDefault(); onHome?.(); },
    }, [el('span', { 'aria-hidden': 'true', text: '▣' }), el('span', { text: 'kit-gen' })]),
    crumbs,
    el('div', { class: 'kg-header__search', style: { textAlign: 'right' } }, [searchBtn]),
    el('div', { class: 'kg-header__right' }, [wsSlot, pillSlot]),
  ]);

  /** Breadcrumb: `Projects ▸ <tên project> ▾` — ▾ mở ⌘P (§2.2). textContent, không HTML. */
  function setCrumbs({ projectName = null, screenLabel = null } = {}) {
    crumbs.replaceChildren();
    crumbs.appendChild(createButton({
      label: 'Projects', variant: 'link', size: 'sm', onClick: () => onHome?.(),
    }));
    if (projectName) {
      crumbs.appendChild(el('span', { 'aria-hidden': 'true', class: 'kg-fg-default', text: '▸' }));
      const jump = createButton({
        label: `${projectName} ▾`, variant: 'ghost', size: 'sm',
        tooltip: 'Nhảy nhanh giữa project (⌘P)',
        onClick: () => onJump?.(),
      });
      crumbs.appendChild(jump);
    }
    if (screenLabel) {
      crumbs.appendChild(el('span', { 'aria-hidden': 'true', class: 'kg-fg-default', text: '▸' }));
      crumbs.appendChild(el('span', { class: 'kg-t-label kg-truncate', text: screenLabel }));
    }
  }

  /** Vẽ lại 2 pill theo trạng thái. Gọi mỗi lần agent-status đổi. */
  function renderStatus(st) {
    const badgeKey = PILL_TO_BADGE[st.pill] ?? 'not-running';
    const pill = createAgentPill(badgeKey, {
      onClick: st.pill === 'checking' ? null : () => openAgentSheet({ returnFocusTo: pillSlot.firstChild }),
    });
    pillSlot.replaceChildren(pill);

    wsSlot.replaceChildren();
    const label = st.workspaceLabel;
    if (label) {
      const suffix = st.mode === 'mirror' ? ' (bản tại máy)' : '';
      const btn = createButton({
        label: `${label}${suffix}`, variant: 'ghost', size: 'sm', icon: '▤',
        tooltip: 'Thư mục làm việc — đổi trong Cài đặt',
        onClick: () => onOpenSettings?.(),
      });
      wsSlot.appendChild(btn);
    }
  }

  let onOpenSettings = null;
  return {
    el: header,
    setCrumbs,
    renderStatus,
    setSettingsHandler(fn) { onOpenSettings = fn; },
    /** Cắm nút ☰ (rail-drawer) vào đầu header — trước logo, đúng thứ tự đọc. */
    setRailToggle(btn) { railSlot.replaceChildren(btn); },
  };
}

/**
 * Banner chỉ-đọc §2.5-1 với ĐÚNG 3 nút [Copy lệnh] [Thử lại] [Vì sao?].
 * (`createBanner` đã nhận 3 nút từ lượt tích hợp — NEEDS N6 đã xử.)
 */
export function createStatusBanner() {
  const slot = el('div', { class: 'kg-banner-slot' });
  let reconnectTimer = null;
  let wasReadOnly = null;

  function render(st) {
    clearTimeout(reconnectTimer);
    slot.replaceChildren();

    if (st.pill === 'checking') {
      slot.appendChild(el('div', { class: 'kg-banner kg-banner--info', role: 'status' }, [
        createSpinnerRow({ label: 'Đang tìm công cụ local trên máy bạn…' }),
      ]));
      return;
    }

    if (!st.readOnly) {
      // §2.5-5: vừa kết nối lại → banner xanh 3s rồi tự ẩn.
      if (wasReadOnly === true) {
        const ok = createBanner({
          kind: 'success', live: true,
          title: 'Đã kết nối lại — đã làm mới danh sách',
        });
        slot.appendChild(ok);
        reconnectTimer = setTimeout(() => { ok.remove(); }, 3000);
      }
      wasReadOnly = false;
      return;
    }

    wasReadOnly = true;
    const seenAt = lastSeenLabel(st);
    const actions = [];
    if (st.pill === 'blocked-by-browser') {
      actions.push(createButton({
        label: 'Mở bản chạy tại máy', variant: 'primary', size: 'sm',
        onClick: () => { location.href = st.mirrorUrl; },
      }));
    } else {
      actions.push(createButton({
        label: 'Copy lệnh', variant: 'secondary', size: 'sm', icon: '⧉',
        onClick: async () => {
          const ok = await copyText(RUN_CMD);
          if (ok) toast.success({ title: 'Đã copy lệnh', description: RUN_CMD });
          else toast.info({ title: 'Không copy được', description: `Gõ tay: ${RUN_CMD}` });
        },
      }));
    }
    actions.push(createButton({
      label: 'Thử lại', variant: 'ghost', size: 'sm', icon: '↻',
      onClick: () => agentStatus.refresh(),
    }));

    const why = createButton({
      label: 'Vì sao?', variant: 'link', size: 'sm',
      onClick: () => openAgentSheet(),
    });
    attachTooltip(why, 'Mở sheet trạng thái công cụ local');
    actions.push(why);

    slot.appendChild(createBanner({
      kind: 'warning', live: true,
      title: bannerTitle(st, seenAt),
      actions,
    }));
  }

  return { el: slot, render };
}

/**
 * Banner "màn hình nhỏ" (§2.2 mốc <768: *chỉ đọc*).
 * Đây là banner RIÊNG, không dùng chung slot với banner agent (§2.5) vì hai
 * thông báo có thể cùng đúng một lúc và không được che nhau.
 *
 * QA-UX CAO-2 · hai thứ đổi ở lượt này:
 *   1. Câu chữ nói ĐÚNG hiện trạng. Trước đây "xem được, sửa nên dùng máy tính" là
 *      LỜI HỨA SUÔNG: không có gate nào, bấm vẫn xoá được project. Nay gate có thật
 *      (`agent-status.js`), nên banner nói thẳng là thao tác sửa đang bị khoá.
 *   2. Nút [✕] KHÔNG còn tắt gate — nó chỉ thu banner. Giữ được nút để banner không
 *      chiếm chỗ vĩnh viễn trên màn nhỏ, nhưng người dùng phải còn đường biết vì sao
 *      nút bị khoá ⇒ mỗi nút bị chặn tự nêu lý do qua `aria-describedby` (CAO-A).
 */
export function createSmallScreenBanner() {
  const slot = el('div', { class: 'kg-banner-slot kg-banner-slot--small' });
  let dismissed = false;
  const mq = smallScreenQuery();

  function render() {
    slot.replaceChildren();
    if (!mq || !mq.matches) { dismissed = false; return; }   // về màn rộng ⇒ reset
    if (dismissed) return;
    slot.appendChild(createBanner({
      kind: 'info', live: true,
      // Giữ NGUYÊN VĂN câu của §2.2 (có ca test khoá), cộng thêm một câu nói rõ hệ quả
      // — trước đây câu gốc là lời hứa suông vì không có gate nào.
      title: 'Màn hình nhỏ: xem được, sửa nên dùng máy tính. Thao tác sửa đang bị khoá ở màn này.',
      onDismiss: () => { dismissed = true; render(); },
    }));
  }

  if (mq) {
    // Safari cũ không có addEventListener trên MediaQueryList
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', render);
    else if (typeof mq.addListener === 'function') mq.addListener(render);
  }
  render();
  return { el: slot, render };
}

function bannerTitle(st, seenAt) {
  if (st.pill === 'blocked-by-browser') {
    return 'Trình duyệt đang chặn kết nối tới máy bạn — công cụ local vẫn đang chạy. Không sửa được ở đây.';
  }
  if (st.pill === 'protocol-mismatch') {
    return st.code === 'AGENT_PROTOCOL_NEW'
      ? 'Giao diện đang là bản cache cũ — tải lại trang để lấy bản mới. Tạm thời chỉ đọc.'
      : 'Công cụ local cũ hơn giao diện — cập nhật để sửa được. Tạm thời chỉ đọc.';
  }
  return `Chưa thấy công cụ local — ${seenAt}. Không sửa được.`;
}

/** "đây là dữ liệu bạn thấy lần cuối (12:04 hôm nay)" — mốc thời gian THẬT của cache. */
function lastSeenLabel(st) {
  const at = st.health?.checkedAt ?? null;
  if (typeof at === 'string' && at.length >= 19) return `dữ liệu lần cuối lúc ${at.slice(11, 16)}`;
  return 'đang hiện dữ liệu đã lưu trên máy này';
}

/** Copy có fallback thật thà: không im lặng khi clipboard bị chặn (§3.9 điều cấm 3). */
export async function copyText(text) {
  try {
    if (navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* rơi xuống dưới */ }
  return false;
}
