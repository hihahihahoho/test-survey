/**
 * web/js/core/routes.js — bảng route theo sitemap UX-SPEC §2.1 (S0..S6 + tab con qua query).
 * Không có màn nào ngoài bảng này; mọi thứ khác là overlay của 8 màn (§2.1).
 */

/** Tab hợp lệ của từng màn (§2.1). Tab lạ → về tab đầu, không vỡ UI. */
export const TABS = Object.freeze({
  S3: Object.freeze(['sheets', 'styles', 'advanced']),
  S5: Object.freeze(['assets', 'matrix', 'export']),
  S6: Object.freeze(['agent', 'env', 'prefs', 'trash', 'about']),
});

/**
 * Mỗi route: { id, screen, pattern, params, tabs?, needsSetup, needsProject, title }
 * needsSetup=false ⇒ vào được khi chưa setup (chỉ /setup).
 */
export const ROUTES = Object.freeze([
  { id: 'S0', screen: 'setup',           pattern: '/setup',                needsSetup: false, title: 'Cài đặt lần đầu' },
  { id: 'S1', screen: 'projects',        pattern: '/',                     needsSetup: true,  title: 'Projects' },
  { id: 'S6', screen: 'settings',        pattern: '/settings',             needsSetup: true,  title: 'Cài đặt', tabs: TABS.S6 },
  { id: 'S3', screen: 'design',          pattern: '/p/:id/design',         needsSetup: true,  needsProject: true, title: 'Bản thiết kế', tabs: TABS.S3 },
  { id: 'S4', screen: 'runs',            pattern: '/p/:id/runs',           needsSetup: true,  needsProject: true, title: 'Sinh ảnh' },
  { id: 'S4d',screen: 'run-detail',      pattern: '/p/:id/runs/:runId',    needsSetup: true,  needsProject: true, title: 'Lượt chạy' },
  { id: 'S5', screen: 'kit',             pattern: '/p/:id/kit',            needsSetup: true,  needsProject: true, title: 'Thư viện kit', tabs: TABS.S5 },
  { id: 'S2b',screen: 'project-settings',pattern: '/p/:id/settings',       needsSetup: true,  needsProject: true, title: 'Cài đặt project' },
  { id: 'S2', screen: 'project',         pattern: '/p/:id',                needsSetup: true,  needsProject: true, title: 'Tổng quan' },
]);

/** Đường dẫn mặc định khi không khớp gì. */
export const FALLBACK_PATH = '/';
export const SETUP_PATH = '/setup';

/** Dựng path có tham số: buildPath('S3', {id:'x'}, {tab:'styles'}) */
export function buildPath(routeId, params = {}, query = {}) {
  const route = ROUTES.find((r) => r.id === routeId);
  if (!route) throw new Error(`Route không tồn tại: ${routeId}`);
  let path = route.pattern.replace(/:([A-Za-z]+)/g, (_, name) => {
    const v = params[name];
    if (v === undefined || v === null || v === '') throw new Error(`Thiếu tham số :${name} cho route ${routeId}`);
    return encodeURIComponent(String(v));
  });
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const qs = usp.toString();
  if (qs !== '') path += `?${qs}`;
  return path;
}

/** So khớp pathname → route + params. Trả về null nếu không khớp. */
export function matchPath(pathname) {
  const clean = normalizePath(pathname);
  for (const route of ROUTES) {
    const params = matchOne(route.pattern, clean);
    if (params !== null) return { route, params };
  }
  return null;
}

function matchOne(pattern, pathname) {
  const pa = pattern.split('/').filter((s) => s !== '');
  const pb = pathname.split('/').filter((s) => s !== '');
  if (pa.length !== pb.length) return null;
  const params = {};
  for (let i = 0; i < pa.length; i += 1) {
    if (pa[i].startsWith(':')) {
      const v = decodeURIComponent(pb[i]);
      if (v === '') return null;
      params[pa[i].slice(1)] = v;
    } else if (pa[i] !== pb[i]) return null;
  }
  return params;
}

export function normalizePath(pathname) {
  let p = String(pathname ?? '/');
  const qi = p.indexOf('?');
  if (qi !== -1) p = p.slice(0, qi);
  const hi = p.indexOf('#');
  if (hi !== -1) p = p.slice(0, hi);
  if (p === '') p = '/';
  if (p.length > 1 && p.endsWith('/')) p = p.replace(/\/+$/, '');
  return p === '' ? '/' : p;
}

/** Chuẩn hoá tab: tab lạ → tab đầu tiên của màn (không vỡ UI). */
export function normalizeTab(route, tab) {
  if (!route.tabs) return null;
  return route.tabs.includes(tab) ? tab : route.tabs[0];
}
