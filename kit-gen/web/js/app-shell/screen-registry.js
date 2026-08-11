/**
 * screen-registry.js — BẢNG MOUNT POINT của toàn app. **ĐÂY LÀ CHỖ TEAM KHÁC CẦN.**
 *
 * Sitemap §2.1 có đúng 8 màn (S0–S6 + S2b). `core/routes.js` đặt cho mỗi màn một
 * `screen` id; bảng dưới đây map id đó → module màn hình. Không có màn nào ngoài bảng.
 *
 * ┌─ HỢP ĐỒNG MÀN HÌNH (mọi team thi công màn phải theo) ────────────────────┐
 * │ Mỗi module màn export:                                                   │
 * │     export function mount(host, ctx) -> handle                           │
 * │ · host  : HTMLElement rỗng nằm trong <main id="main"> của index.html      │
 * │ · ctx   : { route, params, query, tab, status, navigate, go, shell }      │
 * │           status = trạng thái agent (detect.js) — dùng để vào chế độ       │
 * │           chỉ-đọc §2.5, KHÔNG tự probe lại.                              │
 * │ handle (mọi field đều tuỳ chọn):                                          │
 * │ · destroy()      shell gọi khi rời màn — dọn listener/timer               │
 * │ · route(ctx)     shell gọi khi URL đổi mà VẪN cùng màn (đổi tab/param)    │
 * │ · status(st)     shell gọi khi trạng thái agent đổi (bật/tắt nút, banner) │
 * │ · title()        trả tên hiển thị (project) để đặt <title> theo §5.8-A13  │
 * │ · rail()         trả mảng mục rail; null/không có ⇒ shell tự dựng mặc định│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Màn nào chưa có file → shell vẽ empty-state "chưa thi công" và app VẪN CHẠY
 * (§6.5-6: mã lạ / thiếu không được vỡ UI). Team chỉ cần tạo file rồi thêm 1 dòng ở đây.
 * Xem thêm ghi chú trong `web/index.html` và `teams/design/NEEDS-setup-projects.md` (N1).
 */

/**
 * id (routes.js `screen`) → loader động. Đường dẫn TƯƠNG ĐỐI để chạy được cả ở /app/.
 * Module có thể export `mount(host, ctx)` (hợp đồng chuẩn) HOẶC một factory riêng đã
 * thoả thuận trước — `screen-adapters.js` sẽ tự bọc, xem resolveMount().
 */
import { resolveMount } from './screen-adapters.js';

export const SCREENS = Object.freeze({
  /* S0 — ĐANG CÓ (engineer setup+projects) */
  setup: () => import('../screens/setup/index.js'),
  /* S1 — ĐANG CÓ (engineer setup+projects) */
  projects: () => import('../screens/projects/index.js'),

  /* ▼▼▼ MOUNT POINT CHO CÁC TEAM KHÁC — tạo file rồi giữ nguyên dòng này ▼▼▼ */
  /* S2  /p/:id           — Tổng quan project */
  project: () => import('../screens/project/index.js'),
  /* S2b /p/:id/settings  — Cài đặt project */
  'project-settings': () => import('../screens/project/settings.js'),
  /* S3  /p/:id/design    — Trình soạn bản thiết kế (?tab=sheets|styles|advanced) */
  design: () => import('../screens/design/index.js'),
  /* S4  /p/:id/runs      — Theo dõi sinh ảnh */
  runs: () => import('../screens/runs/index.js'),
  /* S4d /p/:id/runs/:runId — Chi tiết 1 lượt chạy (cùng module với S4, phân biệt bằng params.runId) */
  'run-detail': () => import('../screens/runs/index.js'),
  /* S5  /p/:id/kit       — Thư viện kit (?tab=assets|matrix|export) */
  kit: () => import('../screens/kit/index.js'),
  /* S6  /settings        — Cài đặt (?tab=agent|env|prefs|trash|about) */
  settings: () => import('../screens/settings/index.js'),
  /* ▲▲▲ HẾT MOUNT POINT ▲▲▲ */
});

/** Màn nào có rail trái (§2.2: S1/S6 full width, còn lại có rail). */
export const HAS_RAIL = Object.freeze(new Set([
  'project', 'project-settings', 'design', 'runs', 'run-detail', 'kit',
]));

/** Nhãn tiếng Việt của màn — dùng cho empty-state "chưa thi công" và ⌘K sau này. */
export const SCREEN_LABEL = Object.freeze({
  setup: 'Cài đặt lần đầu',
  projects: 'Danh sách project',
  project: 'Tổng quan project',
  'project-settings': 'Cài đặt project',
  design: 'Bản thiết kế',
  runs: 'Theo dõi sinh ảnh',
  'run-detail': 'Chi tiết lượt chạy',
  kit: 'Thư viện kit',
  settings: 'Cài đặt',
});

/**
 * Nạp module một màn. Trả về `{ mount }` hoặc null nếu màn chưa được thi công.
 * KHÔNG ném ra ngoài: thiếu file là chuyện bình thường trong lúc các team làm song song.
 */
export async function loadScreen(screenId) {
  const loader = SCREENS[screenId];
  if (!loader) return null;
  try {
    const mod = await loader();
    const mount = resolveMount(mod);
    return mount ? { mount } : null;
  } catch (e) {
    // File chưa có / lỗi cú pháp của team khác ⇒ shell vẽ placeholder, app KHÔNG vỡ (§6.5-6).
    console.warn(`[shell] chưa nạp được màn "${screenId}":`, e?.message ?? e);
    return null;
  }
}
