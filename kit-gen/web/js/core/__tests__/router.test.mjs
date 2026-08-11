/** Test router theo sitemap §2.1 + guard "chưa setup → ép về /setup". */
import { describe, it, assert, eq, throws } from './harness.mjs';
import * as router from '../router.js';
import { ROUTES, TABS, buildPath, matchPath, normalizePath } from '../routes.js';
import * as store from '../store.js';
import { LS_KEYS } from '../constants.js';

function fakeEnv({ path = '/', setupDone = true } = {}) {
  store._setBackend(store._memoryBackend());
  if (setupDone) store.set(LS_KEYS.setup, { completed: true, step: 'done' });
  const state = { path };
  const locationRef = {
    protocol: 'https:', hostname: 'kitgen.pages.dev', origin: 'https://kitgen.pages.dev',
    get pathname() { return state.path.split('?')[0]; },
    get search() { return state.path.includes('?') ? `?${state.path.split('?')[1]}` : ''; },
    hash: '',
  };
  const historyRef = {
    pushState: (s, t, url) => { state.path = String(url); },
    replaceState: (s, t, url) => { state.path = String(url); },
  };
  const windowRef = { addEventListener() {}, removeEventListener() {}, history: historyRef, location: locationRef };
  router._reset();
  router.configure({ windowRef, historyRef, locationRef });
  return { state };
}

describe('routes.js — sitemap §2.1 đủ 8 màn', () => {
  it('có đúng các màn S0,S1,S2,S2b,S3,S4,S4d,S5,S6', () => {
    eq(ROUTES.map((r) => r.id).sort(), ['S0', 'S1', 'S2', 'S2b', 'S3', 'S4', 'S4d', 'S5', 'S6']);
  });
  it('match /p/:id và /p/:id/design không lẫn nhau', () => {
    eq(matchPath('/p/tet26').route.id, 'S2');
    eq(matchPath('/p/tet26/design').route.id, 'S3');
    eq(matchPath('/p/tet26/runs').route.id, 'S4');
    eq(matchPath('/p/tet26/runs/r-0032').route.id, 'S4d');
    eq(matchPath('/p/tet26/runs/r-0032').params, { id: 'tet26', runId: 'r-0032' });
    eq(matchPath('/p/tet26/kit').route.id, 'S5');
    eq(matchPath('/p/tet26/settings').route.id, 'S2b');
    eq(matchPath('/settings').route.id, 'S6');
  });
  it('tab con qua query đúng danh sách của từng màn', () => {
    eq(TABS.S3, ['sheets', 'styles', 'advanced']);
    eq(TABS.S5, ['assets', 'matrix', 'export']);
    eq(TABS.S6, ['agent', 'env', 'prefs', 'trash', 'about']);
  });
  it('buildPath dựng path + query, encode tham số', () => {
    eq(buildPath('S3', { id: 'tet26' }, { tab: 'styles' }), '/p/tet26/design?tab=styles');
    eq(buildPath('S6', {}, { tab: 'env' }), '/settings?tab=env');
    eq(buildPath('S2', { id: 'a b/c' }), '/p/a%20b%2Fc');
  });
  it('buildPath ném lỗi rõ ràng khi thiếu tham số', () => {
    throws(() => buildPath('S3', {}), (e) => e.message.includes(':id'));
  });
  it('normalizePath bỏ query/hash/dấu / cuối', () => {
    eq(normalizePath('/p/x/design?tab=styles#a'), '/p/x/design');
    eq(normalizePath('/'), '/');
    eq(normalizePath('/settings/'), '/settings');
  });
  it('đường lạ không khớp route nào', () => {
    eq(matchPath('/khong-ton-tai'), null);
  });
});

describe('router.js — guard chưa setup', () => {
  it('CHƯA setup: mọi màn bị ép về /setup', () => {
    for (const path of ['/', '/p/tet26', '/p/tet26/design', '/settings?tab=env']) {
      fakeEnv({ path, setupDone: false });
      const m = router.start();
      eq(m.route.id, 'S0', `${path} phải bị ép về /setup`);
      eq(m.redirected, true);
      eq(m.redirectedFrom, normalizePath(path));
    }
  });
  it('CHƯA setup: /setup vào được bình thường', () => {
    fakeEnv({ path: '/setup', setupDone: false });
    const m = router.start();
    eq(m.route.id, 'S0');
    eq(m.redirected, false);
  });
  it('ĐÃ setup: vào thẳng màn được yêu cầu', () => {
    fakeEnv({ path: '/p/tet26/design?tab=styles' });
    const m = router.start();
    eq(m.route.id, 'S3');
    eq(m.params.id, 'tet26');
    eq(m.tab, 'styles');
  });
  it('ĐÃ setup: vẫn vào lại /setup được (Chạy lại hướng dẫn cài)', () => {
    fakeEnv({ path: '/setup' });
    eq(router.start().route.id, 'S0');
  });
  it('đường lạ → về trang chủ S1', () => {
    fakeEnv({ path: '/khong-co-man-nay' });
    const m = router.start();
    eq(m.route.id, 'S1');
    eq(m.redirected, true);
  });
  it('tab lạ → về tab đầu tiên, không vỡ UI', () => {
    fakeEnv({ path: '/p/x/design?tab=hacker' });
    eq(router.start().tab, 'sheets');
    fakeEnv({ path: '/settings?tab=nope' });
    eq(router.start().tab, 'agent');
  });
  it('guard tuỳ biến (vd project không tồn tại) redirect được', () => {
    fakeEnv({ path: '/p/khong-ton-tai' });
    router.setGuard((m) => (m.params.id === 'khong-ton-tai' ? '/' : null));
    const m = router.start();
    eq(m.route.id, 'S1');
    eq(m.redirected, true);
  });
});

describe('router.js — điều hướng & 2 đường vào', () => {
  it('navigate + subscribe phát ra route mới', () => {
    fakeEnv({ path: '/' });
    router.start();
    const seen = [];
    router.subscribe((m) => seen.push(m.route.id));
    router.go('S3', { id: 'tet26' }, { tab: 'advanced' });
    eq(seen, ['S3']);
    eq(router.current().tab, 'advanced');
  });
  it('setTab giữ nguyên params của màn hiện tại', () => {
    fakeEnv({ path: '/p/tet26/kit?tab=assets' });
    router.start();
    const m = router.setTab('matrix');
    eq(m.route.id, 'S5');
    eq(m.params.id, 'tet26');
    eq(m.tab, 'matrix');
  });
  it('base "/app" của bản mirror được bỏ khỏi path logic', () => {
    store._setBackend(store._memoryBackend());
    store.set(LS_KEYS.setup, { completed: true });
    router._reset();
    const locationRef = {
      protocol: 'http:', hostname: '127.0.0.1', origin: 'http://127.0.0.1:8765',
      pathname: '/app/p/tet26/design', search: '?tab=styles', hash: '',
    };
    router.configure({
      windowRef: { addEventListener() {}, removeEventListener() {} },
      historyRef: { pushState() {}, replaceState() {} },
      locationRef,
    });
    const m = router.start();
    eq(router.base(), '/app');
    eq(m.route.id, 'S3');
    eq(m.params.id, 'tet26');
    eq(m.tab, 'styles');
    eq(router.toHref('/p/x'), '/app/p/x');
  });
  it('file:// → chế độ hash, vẫn phân giải đúng màn', () => {
    store._setBackend(store._memoryBackend());
    store.set(LS_KEYS.setup, { completed: true });
    router._reset();
    router.configure({
      windowRef: { addEventListener() {}, removeEventListener() {} },
      historyRef: null,
      locationRef: { protocol: 'file:', pathname: '/x/index.html', search: '', hash: '#/p/tet26/runs' },
    });
    const m = router.start();
    eq(router.mode(), 'hash');
    eq(m.route.id, 'S4');
    eq(router.toHref('/p/x'), '#/p/x');
  });
  it('documentTitle theo §5.8 A13', () => {
    fakeEnv({ path: '/p/tet26/design' });
    const m = router.start();
    eq(router.documentTitle(m, 'Tết 2026'), 'Tết 2026 · Bản thiết kế — kit-gen');
  });
});
