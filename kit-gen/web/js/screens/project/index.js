/**
 * project/index.js — CỬA VÀO các màn do team này sở hữu.
 * `web/index.html` (team khác sở hữu) chỉ cần biết đúng file này:
 *
 *     import { mountScreen } from './js/screens/project/index.js';
 *     const screen = mountScreen(routeId, container, { projectId, tab, status });
 *     screen.update({ status, tab });   // agent pill / tab đổi
 *     screen.destroy();                // rời màn
 *
 * routeId theo core/routes.js: 'S2' (tổng quan) · 'S2b' (cài đặt project)
 *                              · 'S5' (thư viện kit) · 'S6' (cài đặt chung)
 * Hợp đồng mount đã ghi ở teams/design/NEEDS-d2p2.md để người sở hữu index.html khai đúng.
 */

import { mountOverview } from './overview.js';
import { mountProjectSettings } from './settings.js';
import { mountKit } from '../kit/index.js';
import { mountSettings } from '../settings/index.js';
import { toShellMount } from './mount-adapter.js';

/** Map routeId → hàm mount. Không có màn nào ngoài bảng này (§2.1). */
export const SCREENS = Object.freeze({
  S2: mountOverview,
  S2b: mountProjectSettings,
  S5: mountKit,
  S6: mountSettings,
});

/** true nếu routeId thuộc quyền team này (dùng cho router của index.html). */
export function ownsRoute(routeId) { return Object.hasOwn(SCREENS, routeId); }

/**
 * @param {'S2'|'S2b'|'S5'|'S6'} routeId
 * @param {HTMLElement} container   vùng nội dung (.kg-main) — đã được dọn bởi shell
 * @param {{projectId?:string, tab?:string, status?:object}} opts
 */
export function mountScreen(routeId, container, opts = {}) {
  const fn = SCREENS[routeId];
  if (!fn) throw new Error(`screens/project: không sở hữu route "${routeId}"`);
  if (routeId !== 'S6' && !opts.projectId) {
    throw new Error(`screens/project: route "${routeId}" cần projectId`);
  }
  return fn(container, opts);
}

/* ──────────────────────────────────────────────────────────────────────────────
   Hợp đồng mount của app-shell (web/js/app-shell/screen-registry.js).
   Shell nạp file này cho screen id `project` (S2) và mong đợi `export function mount`.
   Các màn còn lại có `mount` riêng trong file của chúng:
     S2b → project/settings.js · S5 → kit/index.js · S6 → settings/index.js
   ────────────────────────────────────────────────────────────────────────────── */
export const mount = toShellMount(mountOverview);

export { mountOverview, mountProjectSettings, mountKit, mountSettings, toShellMount };
export default mount;
