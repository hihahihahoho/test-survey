/**
 * tab-about.js — S6 tab **Về** (§3-S6, YÊU CẦU #7).
 * Hai việc: (1) nói đúng phiên bản đang chạy, (2) khối QUYỀN RIÊNG TƯ nói rõ
 * *dữ liệu gì được lưu ở browser* — liệt kê thật theo allowlist của core/store.js,
 * không phải câu marketing.
 */

import { el, createButton, createBadge, icon } from '../../ui/index.js';
import { panel, statRow } from '../project/shared/screen.js';
import { APP_PROTOCOL, LS_KEYS, IDB_STORES } from '../../core/constants.js';
import * as store from '../../core/store.js';
import * as nav from '../project/shared/nav.js';
import * as fmt from '../shared/format.js';

/** Giải thích từng khoá — đúng mục đích thật, để user tự phán xét (YC#7). */
const KEY_PURPOSE = Object.freeze({
  [LS_KEYS.setup]: 'Đã xong hướng dẫn cài chưa + chế độ tạo ảnh (dạng enum).',
  [LS_KEYS.agent]: 'Địa chỉ loopback của công cụ local (chỉ 127.0.0.1 + cổng cho phép) và tên phiên bản.',
  [LS_KEYS.workspace]: 'NHÃN rút gọn của thư mục làm việc (ví dụ ~/KitGen) và id đục — không có đường dẫn thật.',
  [LS_KEYS.projectsCache]: 'Bản sao danh sách project để mở app nhanh và xem được khi công cụ local tắt.',
  [LS_KEYS.ui]: 'Tuỳ chọn giao diện: theme, mật độ, kiểu xem, sắp xếp.',
  [LS_KEYS.prefs]: 'Ưu tiên khi chạy: số lượt song song, tự động cắt, hỏi trước khi xoá.',
  [LS_KEYS.recent]: 'Vài project mở gần đây để nhảy nhanh.',
  [LS_KEYS.hints]: 'Những gợi ý bạn đã tắt để khỏi hiện lại.',
});

const STORE_PURPOSE = Object.freeze({
  [IDB_STORES.drafts]: 'Nháp bản thiết kế tự lưu, để đóng tab không mất việc đang làm.',
  [IDB_STORES.thumbs]: 'Ảnh thu nhỏ đã tải, để lưới kit không tải lại ảnh nặng.',
  [IDB_STORES.runlog]: 'Nhật ký của tối đa 20 lượt chạy gần nhất, để xem lại khi công cụ local đã tắt.',
});

/**
 * @param {object} o
 * @param {object} o.status
 * @param {object|null} o.doctor
 * @param {string|null} o.buildId
 */
export function renderAboutTab(o) {
  const root = el('div', { class: 'kg-stack', style: { gap: 'var(--s-4)' } });
  const h = o.status?.health ?? null;

  root.appendChild(panel({
    title: 'Phiên bản',
    children: [
      statRow('Giao diện (bản web)', o.buildId ? String(o.buildId) : 'bản phát triển'),
      statRow('Công cụ local', h?.version ?? 'chưa kết nối'),
      statRow('Giao thức', `giao diện nói v${APP_PROTOCOL}${h?.protocol ? ` · công cụ local nói v${h.protocol}` : ''}`),
      h?.instanceLabel ? statRow('Phiên bản đang chạy', h.instanceLabel) : null,
      h?.uptimeMs ? statRow('Công cụ local đã chạy', fmt.duration(h.uptimeMs)) : null,
      o.doctor?.os ? statRow('Hệ điều hành', String(o.doctor.os)) : null,
    ].filter(Boolean),
  }));

  /* ── QUYỀN RIÊNG TƯ (YC#7) ── */
  const inventory = el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' } });
  for (const [key, purpose] of Object.entries(KEY_PURPOSE)) {
    inventory.appendChild(el('div', {}, [
      el('div', { class: 'kg-row kg-row--tight' }, [
        createBadge({ state: hasValue(key) ? 'info' : 'neutral', text: hasValue(key) ? 'đang lưu' : 'trống', iconGlyph: hasValue(key) ? '▤' : '○' }),
        el('span', { class: 'kg-t-mono kg-fg-strong', text: key }),
      ]),
      el('div', { class: 'kg-t-caption kg-fg-default', text: purpose }),
    ]));
  }
  for (const [name, purpose] of Object.entries(STORE_PURPOSE)) {
    inventory.appendChild(el('div', {}, [
      el('div', { class: 'kg-row kg-row--tight' }, [
        createBadge({ state: 'neutral', text: 'IndexedDB', iconGlyph: '▤' }),
        el('span', { class: 'kg-t-mono kg-fg-strong', text: `kitgen/${name}` }),
      ]),
      el('div', { class: 'kg-t-caption kg-fg-default', text: purpose }),
    ]));
  }

  root.appendChild(panel({
    title: 'Quyền riêng tư',
    children: [
      el('ul', { style: { margin: '0', paddingLeft: 'var(--s-5)', display: 'flex', flexDirection: 'column', gap: 'var(--s-2)' } }, [
        li('Dữ liệu của bạn nằm trên máy bạn. Project là thư mục thật trong thư mục làm việc; công cụ local là thứ duy nhất chạm ổ đĩa.'),
        li('Trang web này không có server xử lý dữ liệu. Nó chỉ gọi tới 127.0.0.1 trên máy bạn.'),
        li('Không lưu thông tin đăng nhập. Việc đăng nhập codex diễn ra trong Terminal; trang này chỉ biết "đã đăng nhập chưa" dưới dạng đúng/sai.'),
        li('Không lưu API key, token, cookie. Cửa lưu trữ của app tự chặn và từ chối ghi nếu phát hiện chuỗi giống secret.'),
        li('Không lưu đường dẫn tuyệt đối — chỉ nhãn rút gọn kiểu ~/KitGen.'),
        li('Mã xác nhận 4 số khi xoá vĩnh viễn không được lưu ở đâu cả; nó đi thẳng từ ô nhập vào một request duy nhất.'),
      ]),
      el('div', { class: 'kg-t-label kg-fg-default', style: { marginTop: 'var(--s-3)' }, text: 'Đúng những thứ được lưu trong trình duyệt này' }),
      inventory,
      el('div', { class: 'kg-row kg-row--tight' }, [
        createButton({
          label: 'Quản lý / xoá dữ liệu này', variant: 'secondary', size: 'sm',
          onClick: () => nav.toSettings('prefs'),
        }),
      ]),
      el('p', { class: 'kg-t-caption kg-fg-default' }, [
        icon('ⓘ'),
        el('span', { text: ' Muốn tự kiểm? Mở DevTools → Application → Local Storage và IndexedDB, bạn sẽ thấy đúng danh sách trên.' }),
      ]),
    ],
  }));

  root.appendChild(panel({
    title: 'Tài liệu',
    children: [
      el('p', { class: 'kg-t-body kg-fg-default',
        text: 'Bản đặc tả giao diện và tài liệu công cụ local nằm trong chính repo của bạn: teams/p0-boctach/UX-SPEC.md và agent/README.md.' }),
      el('div', { class: 'kg-row kg-row--tight' }, [
        createButton({ label: 'Chạy lại hướng dẫn cài', variant: 'ghost', size: 'sm', onClick: () => nav.toSettings('agent') }),
      ]),
    ],
  }));

  return root;
}

function li(text) { return el('li', { class: 'kg-t-body kg-fg-default', text }); }

/** Khoá này thật sự đang có dữ liệu không? Đọc qua store (cửa duy nhất). */
function hasValue(key) {
  try {
    const v = store.get(key);
    if (!v || typeof v !== 'object') return false;
    return Object.values(v).some((x) => {
      if (Array.isArray(x)) return x.length > 0;
      if (typeof x === 'string') return x !== '';
      if (typeof x === 'boolean') return x === true;
      return x !== undefined && x !== null;
    });
  } catch { return false; }
}
