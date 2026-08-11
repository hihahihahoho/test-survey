/* Agent giả cho test: trả đúng hình dạng response của UX-SPEC §6.2 (#2,#3,#9,#12,#22,#33,#42).
   Không mạng, không file thật. Ghi lại mọi request để test kiểm "có gọi đúng endpoint không". */

export function makeMockFetch(routes, log = []) {
  return async function mockFetch(url, init = {}) {
    const u = String(url);
    log.push({ url: u, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ?? null });
    for (const [pattern, handler] of routes) {
      if (u.includes(pattern)) {
        const r = typeof handler === 'function' ? await handler(u, init) : handler;
        return makeResponse(r);
      }
    }
    return makeResponse({ status: 404, json: { error: { code: 'NOT_FOUND', message: `no mock for ${u}` } } });
  };
}

function makeResponse({ status = 200, json = null, text = '', headers = {} }) {
  const h = new Map(Object.entries({ 'X-KitGen-Protocol': '1', ...headers }).map(([k, v]) => [k.toLowerCase(), String(v)]));
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: '',
    headers: { get: (k) => h.get(String(k).toLowerCase()) ?? null },
    json: async () => { if (json === null) throw new Error('not json'); return json; },
    text: async () => text,
    body: null,
  };
}

export const PROJECT = Object.freeze({
  id: 'tet26-vietinbank-a7f3',
  schemaVersion: 1,
  name: 'Tết 2026 — VietinBank iPay',
  slug: 'tet26-vietinbank',
  description: 'Campaign lì xì, 3 mini-game',
  tags: ['tet', 'banking'],
  createdAt: '2026-08-01T03:00:00.000Z',
  updatedAt: '2026-08-05T05:00:00.000Z',
  contract: { file: 'contract.json', version: 37, hash: 'sha256:abc' },
  cover: 'kits/tet/25-bg-home.png',
  stats: {
    variants: 2, sheets: 3, components: 42, jobs: 6, rawPresent: 4,
    kitsCut: 96, lastRun: { id: 'r-0031', at: '2026-08-05T04:58:00.000Z', ok: 7, fail: 1 },
    diskBytes: 184320133,
  },
  state: {
    stale: true,
    staleReason: ['contract>prompts', 'raw>kits'],
    jobs: {
      'tet-main': 'ok', 'tet-tall': 'stale', 'tet-bg-home': 'running',
      'vang-main': 'ok', 'vang-tall': 'never', 'vang-bg-home': 'failed',
    },
  },
  broken: false, error: null,
});

export const CONTRACT = Object.freeze({
  schemaVersion: 4,
  variants: [
    { id: 'tet', vi: 'Tết đỏ', bg: 'pure vivid magenta #FF00FF' },
    { id: 'vang', vi: 'Vàng kim', bg: 'pure vivid magenta #FF00FF' },
  ],
  sheets: [
    { id: 'main', grid: { cols: 4, rows: 4 }, components: [{ file: '01-btn-pill-red', vi: 'Nút đỏ' }] },
    { id: 'tall', grid: { cols: 4, rows: 2 }, components: [{ file: '15-reward-giftbox', vi: 'Hộp quà' }] },
    { id: 'bg-home', grid: { cols: 1, rows: 1 }, components: [{ file: '25-bg-home', vi: 'Nền trang chủ' }] },
  ],
  characterPoses: [],
});

export const KIT = Object.freeze({
  variant: 'tet',
  cutAt: '2026-08-05T05:09:00.000Z',
  files: [
    { file: '01-btn-pill-red', path: 'kits/tet/01-btn-pill-red.png', w: 384, h: 256, bytes: 42000, sheet: 'main', cellIndex: 0, empty: false },
    { file: '15-reward-giftbox', path: 'kits/tet/15-reward-giftbox.png', w: 384, h: 512, bytes: 61000, sheet: 'tall', cellIndex: 0, empty: false },
    { file: '25-bg-home', path: 'kits/tet/25-bg-home.png', w: 1024, h: 1536, bytes: 0, sheet: 'bg-home', cellIndex: 0, empty: true },
  ],
  sheets: { main: { cut: 16, blobs: 24 }, tall: { cut: 8, blobs: 15 } },
});

export const RUNS = Object.freeze([
  { id: 'r-0031', kind: 'gen', status: 'running', startedAt: '2026-08-05T04:58:00.000Z', finishedAt: null, progress: { done: 2, total: 8, failed: 0 } },
  { id: 'r-0030', kind: 'gen', status: 'done', startedAt: '2026-08-04T11:00:00.000Z', finishedAt: '2026-08-04T11:04:12.000Z', progress: { done: 8, total: 8, failed: 0 } },
  { id: 'r-0029', kind: 'slice', status: 'done-with-errors', startedAt: '2026-08-04T10:31:00.000Z', finishedAt: '2026-08-04T10:34:00.000Z', progress: { done: 5, total: 8, failed: 3 } },
]);

export const DOCTOR_OK = Object.freeze({
  os: 'darwin-arm64',
  node: { ok: true, version: '24.13.0' },
  python: { ok: true, version: '3.12.4', venv: true, deps: { pillow: true, numpy: true, torch: false, transformers: false } },
  playwright: { ok: false, fallback: 'skeleton.py (PIL)' },
  codex: { ok: true, version: '0.146.0' },
  imageGen: { mode: 'default-home', available: true, codexHomeLabel: '~/.codex', authPresent: true, reason: null, needsFallbackHome: false },
  workspace: { label: '~/KitGen', writable: true, freeBytes: 128849018880 },
});

export const DOCTOR_NO_IMAGEGEN = Object.freeze({
  ...DOCTOR_OK,
  imageGen: { mode: 'unavailable', available: false, codexHomeLabel: '~/.codex', authPresent: false, reason: 'NOT_LOGGED_IN', needsFallbackHome: true },
});

export const WORKSPACES = Object.freeze({
  items: [
    { id: 'ws_8f2c', label: '~/KitGen', projects: 7, diskBytes: 228589568, active: true, writable: true },
    { id: 'ws_11a0', label: '~/work/kits-demo', projects: 2, diskBytes: 12582912, active: false, writable: true },
  ],
  activeId: 'ws_8f2c',
});

export const TRASH = Object.freeze({
  items: [
    { trashId: '20260805-121003-candy-old-11b2', projectId: 'candy-old-11b2', name: 'Candy Old', deletedAt: '2026-08-05T05:10:03.000Z', restoreBefore: '2026-09-04T05:10:03.000Z', bytes: 44040192 },
    { trashId: '20260701-090000-mid-autumn-2f10', projectId: 'mid-autumn-2f10', name: 'Mid-Autumn 2026', deletedAt: '2026-07-01T02:00:00.000Z', restoreBefore: '2026-07-31T02:00:00.000Z', bytes: 10485760 },
  ],
});

export const HEALTH = Object.freeze({
  ok: true, app: 'kitgen-agent', protocol: 1, version: '1.2.0', buildId: 'b-2026-08-05',
  instanceLabel: 'gray-otter', workspaceId: 'ws_8f2c', workspaceLabel: '~/KitGen',
  workspaceFingerprint: 'sha256:aaaaaaaaaaaa', projects: 7, activeRuns: 1, uptimeMs: 3600000,
  updateCommand: 'npm i -g kitgen-agent',
});

/** Bộ route mặc định: mọi endpoint mà 4 màn của team này dùng. */
export function defaultRoutes({ doctor = DOCTOR_OK } = {}) {
  return [
    ['/health', { status: 200, json: HEALTH }],
    ['/api/doctor', { status: 200, json: doctor }],
    ['/api/workspaces', { status: 200, json: WORKSPACES }],
    ['/api/trash', { status: 200, json: TRASH }],
    [`/api/projects/${PROJECT.id}/contract`, { status: 200, json: { version: 37, contract: CONTRACT } }],
    [`/api/projects/${PROJECT.id}/runs`, { status: 200, json: { items: RUNS } }],
    [`/api/projects/${PROJECT.id}/kit`, { status: 200, json: KIT }],
    [`/api/projects/${PROJECT.id}`, { status: 200, json: { project: PROJECT } }],
  ];
}
