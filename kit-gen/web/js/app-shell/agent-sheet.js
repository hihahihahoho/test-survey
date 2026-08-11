/**
 * agent-sheet.js — Sheet "Trạng thái công cụ local" (§2.1 overlay, §2.4 "bấm vào pill").
 * Một chỗ duy nhất chứa mọi đường thoát khi không kết nối được:
 *   [Copy lệnh chạy] · [Mở bản chạy tại máy] · [Vì sao?] · [Kiểm tra lại] ·
 *   [Chạy cầu dò] (cử chỉ user, §3-S0) · [Copy lệnh cập nhật] · link Cài đặt môi trường.
 * Copy lỗi lấy từ core/errors.js — màn KHÔNG tự viết văn bản lỗi (§3.9).
 */

import { errors } from '../core/index.js';
import {
  createButton, createCodeBlock, createDevDetails, createStatusDot, el, openDrawer, toast,
} from '../ui/index.js';
import * as agentStatus from './agent-status.js';
import { RUN_CMD, RUN_CMD_REPO, updateCmd } from './commands.js';

/** Một dòng "nhãn — giá trị" của sheet. Giá trị thiếu ⇒ "—", không bịa. */
function row(label, value) {
  return el('div', { class: 'kg-row', style: { justifyContent: 'space-between', gap: 'var(--s-4)' } }, [
    el('span', { class: 'kg-t-label kg-fg-default', text: label }),
    el('span', { class: 'kg-t-body kg-truncate', text: value == null || value === '' ? '—' : String(value) }),
  ]);
}

const WHY_TEXT = [
  'Trang này chạy trên HTTPS, còn công cụ local chạy trên http://127.0.0.1 — một số trình duyệt',
  '(Safari, hoặc Chrome khi bật Local Network Access) không cho trang HTTPS gọi vào máy bạn.',
  'Dữ liệu của bạn vẫn nguyên trên máy. Cách dùng: mở bản chạy tại máy — cùng một giao diện,',
  'cùng tính năng, chỉ khác là do công cụ local tự phục vụ nên không bị chặn.',
].join(' ');

export function openAgentSheet({ returnFocusTo = null } = {}) {
  const st = agentStatus.status();
  const view = st.code ? errors.lookup(st.code) : null;
  const body = el('div', { class: 'kg-stack' });

  body.appendChild(el('div', { class: 'kg-card', style: { padding: 'var(--s-4)', gap: 'var(--s-2)' } }, [
    createStatusDot(pillTone(st.pill), pillText(st)),
    view ? el('p', { class: 'kg-t-body', text: view.explain }) : null,
    row('Phiên bản', st.agentVersion),
    row('Tên phiên', st.instanceLabel),
    row('Thư mục làm việc', st.workspaceLabel),
    row('Địa chỉ', st.baseUrl),
    row('Đường vào', st.entry === 'mirror' ? 'Bản chạy tại máy (same-origin)' : 'Trang web tĩnh'),
    row('Kiểm lúc', st.checkedAt ? st.checkedAt.slice(11, 19) : null),
  ]));

  /* Khối hành động — luôn có ít nhất [Kiểm tra lại]; không bao giờ là ngõ cụt (§1.1-5). */
  const actions = el('div', { class: 'kg-row' });
  actions.appendChild(createButton({
    label: 'Kiểm tra lại', variant: 'secondary', icon: '↻',
    onClick: async () => {
      await agentStatus.refresh();
      toast.info({ title: 'Đã kiểm tra lại', description: pillText(agentStatus.status()) });
      drawer.close();
    },
  }));
  if (st.pill !== 'connected' && st.entry !== 'mirror') {
    actions.appendChild(createButton({
      label: 'Mở bản chạy tại máy', variant: 'primary', icon: '↗',
      onClick: () => { location.href = st.mirrorUrl; },
    }));
  }
  if (st.pill === 'protocol-mismatch') {
    actions.appendChild(createButton({
      label: 'Tải lại cứng', variant: 'secondary', icon: '⟲',
      onClick: () => { location.reload(); },
    }));
  }
  if (st.needsBridgeProbe || st.pill === 'not-running' || st.pill === 'blocked-by-browser') {
    actions.appendChild(createButton({
      label: 'Chạy cầu dò (mở cửa sổ nhỏ)', variant: 'secondary', icon: '⌕',
      onClick: async () => {
        const r = await agentStatus.runBridgeProbe();
        if (r.blockedPopup) {
          toast.warning({
            title: 'Trình duyệt chặn cửa sổ nhỏ',
            description: 'Cho phép popup cho trang này rồi bấm lại, hoặc mở bản chạy tại máy.',
          });
        } else if (r.alive) {
          toast.warning({
            title: 'Công cụ local đang chạy, nhưng trình duyệt chặn',
            description: 'Dùng bản chạy tại máy để đủ tính năng.',
          });
        } else {
          toast.info({
            title: 'Chưa thấy công cụ local',
            description: 'Mở Terminal và chạy lệnh trong sheet này.',
          });
        }
      },
    }));
  }
  body.appendChild(actions);

  /* Lệnh copy — CodeBlock của design system, không tự vẽ khối mono. */
  if (st.pill !== 'connected') {
    body.appendChild(el('div', { class: 'kg-stack' }, [
      el('h3', { class: 'kg-t-subtitle', text: 'Chạy công cụ local' }),
      createCodeBlock({ code: RUN_CMD, ariaLabel: 'Lệnh chạy công cụ local' }).el,
      el('p', { class: 'kg-t-caption kg-fg-default', text: 'Nếu bạn chạy từ mã nguồn đã tải về:' }),
      createCodeBlock({ code: RUN_CMD_REPO, ariaLabel: 'Lệnh chạy từ mã nguồn' }).el,
    ]));
  }
  if (st.pill === 'protocol-mismatch') {
    body.appendChild(el('div', { class: 'kg-stack' }, [
      el('h3', { class: 'kg-t-subtitle', text: 'Cập nhật công cụ local' }),
      createCodeBlock({ code: updateCmd(st.health), ariaLabel: 'Lệnh cập nhật' }).el,
    ]));
  }
  if (st.pill === 'blocked-by-browser' || st.code === 'ORIGIN_NOT_ALLOWED' || st.code === 'BAD_HOST') {
    body.appendChild(el('details', {}, [
      el('summary', { class: 'kg-t-label kg-fg-default', style: { cursor: 'pointer' }, text: 'Vì sao lại thế?' }),
      el('p', { class: 'kg-t-body', style: { marginTop: 'var(--s-2)' }, text: WHY_TEXT }),
    ]));
  }
  if (st.pill === 'imagegen-unavailable') {
    body.appendChild(el('p', { class: 'kg-t-body', text: 'Sinh ảnh đang không dùng được. Mở Cài đặt → Môi trường để xem thiếu gì.' }));
  }

  /* Chi tiết kỹ thuật: chỉ trong panel gập (§3.9 — cấm hiện message ở thân UI). */
  if (st.code) {
    body.appendChild(createDevDetails(errors.devDetails({
      code: st.code, status: 0, url: st.baseUrl ?? '(chưa dò được cổng)',
      message: `pill=${st.pill} entry=${st.entry} readOnly=${st.readOnly}`,
    })));
  }

  const drawer = openDrawer({
    title: 'Công cụ local', body, returnFocusTo,
  });
  return drawer;
}

function pillTone(pill) {
  if (pill === 'connected') return 'ok';
  if (pill === 'checking') return 'running';
  if (pill === 'not-running') return 'muted';
  return 'warn';
}

function pillText(st) {
  const map = {
    connected: 'Đã kết nối',
    checking: 'Đang kiểm tra…',
    'not-running': 'Chưa thấy công cụ local',
    'blocked-by-browser': 'Trình duyệt đang chặn',
    'protocol-mismatch': 'Công cụ local không cùng phiên bản',
    'imagegen-unavailable': 'Đã kết nối · chưa tạo được ảnh',
  };
  return map[st.pill] ?? 'Chưa rõ trạng thái';
}
