/**
 * web/js/core/router.js — router cho sitemap §2.1, chạy được ở CẢ HAI đường vào:
 *   · Pages HTTPS  (base '/')      → history API
 *   · mirror agent (base '/app/')  → history API với base '/app'
 *   · fallback     (file://, host không rewrite) → chế độ hash '#/p/x/design?tab=styles'
 *
 * GUARD: chưa setup (kitgen.setup.v1.completed !== true) ⇒ ép về /setup (§2.1).
 * Router KHÔNG vẽ gì; nó chỉ phát ra { route, params, query, tab } cho lớp màn hình.
 */

import { LS_KEYS } from './constants.js';
import * as store from './store.js';
import { FALLBACK_PATH, ROUTES, SETUP_PATH, buildPath, matchPath, normalizePath, normalizeTab } from './routes.js';

export { ROUTES, TABS, buildPath } from './routes.js';

const deps = { windowRef: null, historyRef: null, locationRef: null };
export function configure({ windowRef, historyRef, locationRef } = {}) {
  if (windowRef !== undefined) deps.windowRef = windowRef;
  if (historyRef !== undefined) deps.historyRef = historyRef;
  if (locationRef !== undefined) deps.locationRef = locationRef;
}
const win = () => deps.windowRef ?? (typeof window !== 'undefined' ? window : null);
const hist = () => deps.historyRef ?? win()?.history ?? null;
const loc = () => deps.locationRef ?? win()?.location ?? null;

const state = {
  mode: 'history',      // 'history' | 'hash'
  base: '',             // '' hoặc '/app'
  current: null,
  started: false,
  guard: null,
};
const listeners = new Set();

/** Base path: bundle mirror nằm dưới /app/ (§6.2 #6). */
export function detectBase() {
  const l = loc();
  const p = l?.pathname ?? '/';
  if (p === '/app' || p.startsWith('/app/')) return '/app';
  return '';
}

function detectMode() {
  const l = loc();
  if (!l) return 'history';
  if (l.protocol === 'file:') return 'hash';
  if (typeof hist()?.pushState !== 'function') return 'hash';
  return 'history';
}

/** Đường dẫn logic hiện tại (đã bỏ base, đã tính chế độ hash). */
export function currentPath() {
  const l = loc();
  if (!l) return FALLBACK_PATH;
  if (state.mode === 'hash') {
    const h = String(l.hash ?? '').replace(/^#/, '');
    return h === '' ? FALLBACK_PATH : h;
  }
  const full = `${l.pathname ?? '/'}${l.search ?? ''}`;
  if (state.base !== '' && full.startsWith(state.base)) {
    const rest = full.slice(state.base.length);
    return rest === '' || rest === '/' ? FALLBACK_PATH : rest;
  }
  return full === '' ? FALLBACK_PATH : full;
}

/** Đổi path logic → URL thật để đặt vào address bar. */
export function toHref(path) {
  const p = path.startsWith('/') ? path : `/${path}`;
  if (state.mode === 'hash') return `#${p}`;
  return `${state.base}${p === '/' ? '/' : p}`;
}

/** Phân giải một path logic thành route đã áp guard. */
export function resolve(path) {
  const raw = path ?? currentPath();
  const qIndex = raw.indexOf('?');
  const pathname = normalizePath(raw);
  const query = Object.fromEntries(new URLSearchParams(qIndex === -1 ? '' : raw.slice(qIndex)));
  const hit = matchPath(pathname);

  if (hit === null) {
    return applyGuard({ route: null, params: {}, query, tab: null, path: pathname, notFound: true });
  }
  const tab = normalizeTab(hit.route, query.tab);
  return applyGuard({ route: hit.route, params: hit.params, query, tab, path: pathname, notFound: false });
}

/** Setup đã xong chưa (kitgen.setup.v1.completed). */
export function isSetupDone() {
  try { return store.get(LS_KEYS.setup)?.completed === true; }
  catch { return false; }
}

/** Guard tuỳ biến thêm (vd: project không tồn tại). Trả về path để redirect hoặc null. */
export function setGuard(fn) { state.guard = fn; }

function applyGuard(match) {
  // Guard cứng: chưa setup ⇒ mọi màn (trừ /setup) bị ép về /setup (§2.1 "tự mở khi completed !== true").
  const done = isSetupDone();
  if (!done && match.route?.needsSetup !== false) {
    return { ...match, redirectedFrom: match.path, redirected: true, ...resolveRaw(SETUP_PATH) };
  }
  // Đã setup mà cố vào /setup thì cho phép (user chủ động "Chạy lại hướng dẫn cài") — §3.1-S0.
  if (match.notFound) {
    return { ...match, redirectedFrom: match.path, redirected: true, ...resolveRaw(FALLBACK_PATH) };
  }
  if (state.guard) {
    const to = state.guard(match);
    if (typeof to === 'string' && to !== match.path) {
      return { ...resolveRaw(to), redirectedFrom: match.path, redirected: true };
    }
  }
  return { ...match, redirected: false };
}

/** Phân giải KHÔNG áp guard (tránh đệ quy vô hạn). */
function resolveRaw(path) {
  const pathname = normalizePath(path);
  const qIndex = path.indexOf('?');
  const query = Object.fromEntries(new URLSearchParams(qIndex === -1 ? '' : path.slice(qIndex)));
  const hit = matchPath(pathname);
  if (hit === null) {
    const home = matchPath(FALLBACK_PATH);
    return { route: home.route, params: {}, query: {}, tab: null, path: FALLBACK_PATH, notFound: true };
  }
  return {
    route: hit.route, params: hit.params, query,
    tab: normalizeTab(hit.route, query.tab), path: pathname, notFound: false,
  };
}

/** Điều hướng. replace=true để không thêm entry vào history. */
export function navigate(path, { replace = false, silent = false } = {}) {
  const match = resolve(path);
  const target = match.redirected ? match.path + queryString(match.query) : path;
  const href = toHref(target);
  const h = hist();
  if (h) {
    if (replace || match.redirected) h.replaceState({ path: target }, '', href);
    else h.pushState({ path: target }, '', href);
  } else if (loc() && state.mode === 'hash') {
    loc().hash = href;
  }
  state.current = match;
  if (!silent) emit(match);
  return match;
}

function queryString(query) {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const s = usp.toString();
  return s === '' ? '' : `?${s}`;
}

/** Tới một route theo id: go('S3', {id}, {tab:'styles'}) */
export function go(routeId, params, query, opts) {
  return navigate(buildPath(routeId, params, query), opts);
}

/** Đổi tab của màn hiện tại, giữ nguyên params (§2.1 "tab con qua query"). */
export function setTab(tab, opts = { replace: true }) {
  const cur = state.current ?? resolve();
  if (!cur.route?.tabs) return cur;
  return navigate(buildPath(cur.route.id, cur.params, { ...cur.query, tab }), opts);
}

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(match) {
  for (const fn of listeners) {
    try { fn(match); } catch (e) { console.error('[router] listener lỗi', e); }
  }
}

/** Khởi động: đọc URL hiện tại, áp guard, gắn popstate/hashchange. */
export function start() {
  state.mode = detectMode();
  state.base = detectBase();
  const w = win();
  if (w && !state.started) {
    const onChange = () => {
      const match = resolve();
      state.current = match;
      if (match.redirected) {
        const h = hist();
        if (h) h.replaceState({ path: match.path }, '', toHref(match.path + queryString(match.query)));
      }
      emit(match);
    };
    w.addEventListener('popstate', onChange);
    if (state.mode === 'hash') w.addEventListener('hashchange', onChange);
    state.started = true;
  }
  const match = resolve();
  state.current = match;
  if (match.redirected) {
    const h = hist();
    if (h) h.replaceState({ path: match.path }, '', toHref(match.path + queryString(match.query)));
  }
  emit(match);
  return match;
}

export function current() { return state.current ?? resolve(); }
export function mode() { return state.mode; }
export function base() { return state.base; }

/** Tiêu đề tài liệu theo màn (§5.8 A13: `Tết 2026 · Thiết kế — kit-gen`). */
export function documentTitle(match, projectName) {
  const parts = [];
  if (projectName) parts.push(projectName);
  if (match?.route?.title) parts.push(match.route.title);
  return `${parts.join(' · ')}${parts.length > 0 ? ' — ' : ''}kit-gen`;
}

/** Reset cho test. */
export function _reset() {
  state.mode = 'history'; state.base = ''; state.current = null;
  state.started = false; state.guard = null;
  listeners.clear();
}
