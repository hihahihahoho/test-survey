/**
 * nav.js — điều hướng giữa các màn theo sitemap §2.1. Dùng core/router.js, KHÔNG tự đổi location.
 * Ở đây gom tất cả đường đi để không màn nào tự ghép URL (ghép sai là 404 câm).
 */

import * as router from '../../../core/router.js';

/** Điều hướng an toàn: router chưa start (test / mount lẻ) thì không được ném. */
function go(routeId, params, query) {
  try { return router.go(routeId, params, query); }
  catch (e) { console.warn('[nav] không điều hướng được', routeId, e?.message); return null; }
}

export const toProjects = () => go('S1', {}, {});
export const toProject = (id) => go('S2', { id }, {});
export const toDesign = (id, tab = null) => go('S3', { id }, tab ? { tab } : {});
export const toRuns = (id) => go('S4', { id }, {});
export const toRun = (id, runId) => go('S4d', { id, runId }, {});
export const toKit = (id, tab = null) => go('S5', { id }, tab ? { tab } : {});
export const toProjectSettings = (id) => go('S2b', { id }, {});
export const toSettings = (tab = null) => go('S6', {}, tab ? { tab } : {});

/** Đổi tab của màn hiện tại (S5/S6) — giữ params, replace để không phình history. */
export function setTab(tab) {
  try { return router.setTab(tab, { replace: true }); }
  catch { return null; }
}

/** Path dạng chuỗi (dùng cho href của thẻ <a> — bàn phím/chuột giữa đều mở được). */
export function href(routeId, params = {}, query = {}) {
  try { return router.toHref(router.buildPath(routeId, params, query)); }
  catch { return '#'; }
}
