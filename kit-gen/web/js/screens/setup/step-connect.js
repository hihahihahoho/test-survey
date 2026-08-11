/**
 * step-connect.js — S0 BƯỚC 2: CHỜ CÔNG CỤ LOCAL SẴN SÀNG (§3-S0 bước 3/4 của wireframe).
 *
 * Bắt buộc theo spec:
 *  · Hiện RÕ đang chờ gì: poll /health với backoff 1.5→3→6→15s (agent-status lo nhịp)
 *  · Có "cầu dò popup" khi nghi trình duyệt chặn → phân biệt CHƯA CHẠY vs BỊ CHẶN
 *  · Trạng thái AGENT_BLOCKED_BY_BROWSER: thẻ vàng + nút chính [Mở bản chạy tại máy]
 *  · AGENT_PROTOCOL_OLD/NEW: [Copy lệnh cập nhật] / [Tải lại cứng]
 *  · Mọi copy lỗi lấy từ core/errors.js (§3.9) — không tự viết
 */

import { errors } from '../../core/index.js';
import {
  createBanner, createButton, createCodeBlock, createSpinnerRow, createStatusDot, el, toast,
} from '../../ui/index.js';
import * as agentStatus from '../../app-shell/agent-status.js';
import { RUN_CMD, RUN_CMD_REPO, updateCmd } from '../../app-shell/commands.js';

const WHY = 'Trang này chạy trên HTTPS, còn công cụ local chạy trên http://127.0.0.1. '
  + 'Một số trình duyệt không cho trang HTTPS gọi vào máy bạn. Bản chạy tại máy do chính công cụ '
  + 'local phục vụ nên không bị chặn — cùng giao diện, cùng tính năng, cùng dữ liệu.';

export function renderConnectStep({ status, onNext, onTrouble, bridgeResult }) {
  const box = el('div', { class: 'kg-stack' });

  box.appendChild(el('h2', { class: 'kg-t-title', text: 'Kết nối với công cụ local' }));

  if (status.pill === 'checking') {
    box.appendChild(el('div', { class: 'kg-card', style: { padding: 'var(--s-4)' } }, [
      createSpinnerRow({ label: 'Đang thử cổng 8765, 8766, 8767 trên máy bạn…' }),
      el('p', { class: 'kg-t-caption kg-fg-default', text: 'Việc này chỉ gọi vào 127.0.0.1 — không có dữ liệu nào ra Internet.' }),
    ]));
    return box;
  }

  if (status.connected) {
    box.appendChild(el('div', { class: 'kg-card', style: { padding: 'var(--s-4)', gap: 'var(--s-2)' } }, [
      createStatusDot('ok', 'Đã kết nối'),
      el('p', { class: 'kg-t-body', text: label(status) }),
    ]));
    box.appendChild(el('div', { class: 'kg-row' }, [
      createButton({ label: 'Tiếp: chọn thư mục làm việc →', variant: 'primary', size: 'lg', onClick: onNext }),
    ]));
    return box;
  }

  /* Chưa kết nối — nói rõ đang chờ gì và cho đủ đường thoát. */
  const view = errors.lookup(status.code ?? 'AGENT_NOT_RUNNING');
  const blocked = status.pill === 'blocked-by-browser';
  const proto = status.pill === 'protocol-mismatch';

  const actions = [];
  if (blocked) {
    actions.push(createButton({
      label: 'Mở bản chạy tại máy →', variant: 'primary', size: 'lg',
      onClick: () => { window.location.href = status.mirrorUrl; },
    }));
  } else if (proto) {
    actions.push(createButton({
      label: status.code === 'AGENT_PROTOCOL_NEW' ? 'Tải lại cứng' : 'Copy lệnh cập nhật',
      variant: 'primary', size: 'lg',
      onClick: async () => {
        if (status.code === 'AGENT_PROTOCOL_NEW') { window.location.reload(); return; }
        const cmd = updateCmd(status.health);
        const ok = await copy(cmd);
        toast[ok ? 'success' : 'info']({ title: ok ? 'Đã copy lệnh cập nhật' : 'Không copy được', description: cmd });
      },
    }));
  }
  actions.push(createButton({
    label: 'Kiểm tra lại', variant: blocked || proto ? 'secondary' : 'primary', size: 'lg',
    icon: '↻',
    onClick: () => agentStatus.refresh(),
  }));

  box.appendChild(createBanner({ kind: blocked || proto ? 'warning' : 'info', title: `${view.title} — ${view.explain}` }));

  if (blocked) {
    box.appendChild(el('div', { class: 'kg-card', style: { padding: 'var(--s-4)', gap: 'var(--s-2)' } }, [
      el('p', {
        class: 'kg-t-body',
        text: 'Công cụ local ĐANG CHẠY (đã xác nhận qua cửa sổ kiểm tra), nhưng trình duyệt không cho trang này gọi vào máy bạn.',
      }),
      el('details', {}, [
        el('summary', { class: 'kg-t-label', style: { cursor: 'pointer' }, text: 'Vì sao lại thế?' }),
        el('p', { class: 'kg-t-body', style: { marginTop: 'var(--s-2)' }, text: WHY }),
      ]),
    ]));
  } else if (!proto) {
    box.appendChild(el('div', { class: 'kg-card', style: { padding: 'var(--s-4)', gap: 'var(--s-3)' } }, [
      el('h3', { class: 'kg-t-subtitle', text: 'Đang chờ bạn chạy lệnh này trong Terminal' }),
      createCodeBlock({ code: RUN_CMD, ariaLabel: 'Lệnh chạy công cụ local' }).el,
      el('p', { class: 'kg-t-caption kg-fg-default', text: 'Nếu bạn chạy từ mã nguồn đã tải về:' }),
      createCodeBlock({ code: RUN_CMD_REPO, ariaLabel: 'Lệnh chạy từ mã nguồn' }).el,
      createSpinnerRow({ label: 'Tự phát hiện sau mỗi vài giây — không cần bấm gì.' }),
    ]));
  }
  if (proto) {
    box.appendChild(el('div', { class: 'kg-card', style: { padding: 'var(--s-4)', gap: 'var(--s-3)' } }, [
      el('h3', { class: 'kg-t-subtitle', text: 'Cập nhật công cụ local' }),
      createCodeBlock({ code: updateCmd(status.health), ariaLabel: 'Lệnh cập nhật' }).el,
    ]));
  }

  box.appendChild(el('div', { class: 'kg-row' }, actions));

  /* Cầu dò popup — CHỈ chạy từ cử chỉ user (popup tự mở sẽ bị chặn). */
  const probeBox = el('div', { class: 'kg-stack' });
  if (bridgeResult?.blockedPopup) {
    probeBox.appendChild(createBanner({
      kind: 'warning',
      title: 'Trình duyệt đã chặn cửa sổ kiểm tra. Cho phép popup cho trang này rồi bấm lại.',
    }));
  } else if (bridgeResult && bridgeResult.alive === false) {
    probeBox.appendChild(createBanner({
      kind: 'info',
      title: 'Cửa sổ kiểm tra không thấy công cụ local nào đang chạy — hãy chạy lệnh ở trên.',
    }));
  }
  probeBox.appendChild(el('div', { class: 'kg-row' }, [
    createButton({
      label: 'Tôi đã chạy lệnh nhưng vẫn không kết nối được →', variant: 'secondary',
      onClick: onTrouble,
    }),
    el('span', {
      class: 'kg-t-caption kg-fg-default',
      text: 'Sẽ mở một cửa sổ nhỏ để kiểm tra xem công cụ local có sống hay không.',
    }),
  ]));
  box.appendChild(probeBox);

  return box;
}

function label(status) {
  const parts = [];
  if (status.workspaceLabel) parts.push(`thư mục làm việc ${status.workspaceLabel}`);
  if (status.agentVersion) parts.push(`công cụ local v${status.agentVersion}`);
  if (status.instanceLabel) parts.push(status.instanceLabel);
  if (status.entry === 'mirror') parts.push('bản chạy tại máy');
  return parts.length > 0 ? parts.join(' · ') : 'Đã nói chuyện được với công cụ local.';
}

async function copy(text) {
  try {
    if (navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fallthrough */ }
  return false;
}
