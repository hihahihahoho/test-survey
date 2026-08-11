/**
 * data.js — LỚP DỮ LIỆU của S1: nạp danh sách project, cache §2.5-4, lọc/sắp xếp.
 * Mọi request đi qua core/api.js (cấm fetch trực tiếp §6.5-1);
 * mọi ghi state đi qua core/store.js (cấm localStorage §6.5-2).
 */

import { api, errors, store } from '../../core/index.js';
// Bỏ dấu + hạ chữ: thuật toán dùng chung ở screens/shared/text.js (gộp ở lượt tích hợp).
import { foldCase } from '../shared/text.js';

/** core/index.js xuất `store` dạng namespace; khoá localStorage nằm trong đó (§4.1). */
const { LS_KEYS } = store;

/** Chip filter §3-S1-1. `running` chỉ hiện khi đếm > 0 (xem NEEDS N3). */
export const CHIPS = Object.freeze([
  { id: 'all', label: 'Tất cả' },
  { id: 'need-gen', label: 'Cần gen' },
  { id: 'running', label: 'Đang chạy' },
  { id: 'error', label: 'Lỗi' },
  { id: 'unfinished', label: 'Chưa xong' },
]);

export { foldCase };   // nơi khác (⌘K, ⌘P) đang import từ đây — giữ nguyên đường dẫn cũ

export const SORTS = Object.freeze([
  { value: 'updatedAt', label: 'Sửa gần nhất' },
  { value: 'name', label: 'Tên A→Z' },
  { value: 'diskBytes', label: 'Dung lượng' },
  { value: 'createdAt', label: 'Ngày tạo' },
]);

/** Trạng thái tổng hợp của 1 project theo §5.7 (ưu tiên failed > running > … > ok). */
const PRIORITY = ['failed', 'running', 'queued', 'stale', 'uncut', 'never', 'ok'];

export function projectState(p) {
  if (p?.broken) return 'broken';
  const jobs = p?.state?.jobs;
  const values = jobs && typeof jobs === 'object' ? Object.values(jobs) : [];
  if (values.length === 0) return 'empty';
  for (const s of PRIORITY) if (values.includes(s)) return s;
  return 'ok';
}

/** Đếm cho chip filter — đếm THẬT trên dữ liệu đang có, không đoán. */
export function chipCounts(items) {
  const c = { all: items.length, 'need-gen': 0, running: 0, error: 0, unfinished: 0 };
  for (const p of items) {
    const st = projectState(p);
    if (st === 'broken') { c.error += 1; continue; }
    if (st === 'failed') { c.error += 1; c.unfinished += 1; continue; }
    if (st === 'running' || st === 'queued') { c.running += 1; c.unfinished += 1; continue; }
    if (st === 'stale' || st === 'never' || st === 'empty') { c['need-gen'] += 1; c.unfinished += 1; continue; }
    if (st === 'uncut') { c.unfinished += 1; }
  }
  return c;
}

function matchChip(p, chip) {
  const st = projectState(p);
  switch (chip) {
    case 'need-gen': return st === 'stale' || st === 'never' || st === 'empty';
    case 'running': return st === 'running' || st === 'queued';
    case 'error': return st === 'broken' || st === 'failed';
    // project hỏng thuộc nhóm "Lỗi", KHÔNG tính vào "Chưa xong" (giữ khớp với chipCounts)
    case 'unfinished': return st !== 'ok' && st !== 'broken';
    default: return true;
  }
}

/** Tìm mờ: tên + tag + id. Cho phép gõ thiếu dấu và gõ rời (fuzzy theo thứ tự ký tự). */
export function fuzzyScore(haystack, needle) {
  const h = foldCase(haystack);
  const n = foldCase(needle);
  if (n === '') return 1;
  if (h.includes(n)) return 100 - h.indexOf(n);
  let i = 0;
  let hits = 0;
  for (const ch of n) {
    const at = h.indexOf(ch, i);
    if (at === -1) return 0;
    i = at + 1;
    hits += 1;
  }
  return Math.max(1, 40 - (i - hits));
}



/** Lọc + sắp xếp cho view. Không đổi mảng gốc. */
export function applyView(items, { query = '', chip = 'all', tags = [], sortBy = 'updatedAt', dir = 'desc' } = {}) {
  let out = items.filter((p) => matchChip(p, chip));
  if (tags.length > 0) out = out.filter((p) => tags.every((t) => (p.tags ?? []).includes(t)));
  const q = query.trim();
  if (q !== '') {
    out = out
      .map((p) => ({ p, s: fuzzyScore(`${p.name} ${(p.tags ?? []).join(' ')} ${p.id}`, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.p);
    return out;   // đã sắp theo độ khớp — không sort lại
  }
  const sign = dir === 'asc' ? 1 : -1;
  return out.sort((a, b) => sign * cmp(a, b, sortBy));
}

function cmp(a, b, key) {
  if (key === 'name') return -String(a.name ?? '').localeCompare(String(b.name ?? ''), 'vi');
  if (key === 'diskBytes') return (a.stats?.diskBytes ?? 0) - (b.stats?.diskBytes ?? 0);
  if (key === 'createdAt') return String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? ''));
  return String(a.updatedAt ?? '').localeCompare(String(b.updatedAt ?? ''));
}

/** Tập tag có thật trong danh sách, kèm số đếm (để chip tag không bịa). */
export function allTags(items) {
  const m = new Map();
  for (const p of items) for (const t of p.tags ?? []) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'vi'));
}

/* ── Cache §2.5-4 ─────────────────────────────────────────────────────────── */

/**
 * Đọc cache. Chỉ dùng khi `workspaceFingerprint` khớp — đổi workspace thì cache
 * của workspace cũ là dữ liệu SAI, thà rỗng còn hơn hiện lẫn (§3.9 WORKSPACE_CHANGED).
 */
export function readCache(fingerprint = null) {
  try {
    const c = store.get(LS_KEYS.projectsCache);
    if (!Array.isArray(c.items) || c.items.length === 0) return null;
    if (fingerprint && c.workspaceFingerprint && c.workspaceFingerprint !== fingerprint) return null;
    return c;
  } catch { return null; }
}

/**
 * Ghi cache. Chỉ giữ đúng field schema cho phép (store sẽ loại phần còn lại).
 * Có `slug`/`description`/`state` (schema đã bổ sung ở lượt tích hợp) ⇒ thẻ vẽ từ cache
 * hiện được ĐÚNG badge trạng thái §5.7 khi agent chưa chạy (§2.5-4).
 * Chỉ giữ `state.jobs` dạng map ngắn — không nhét gì khác vào storage (§8.2).
 */
export function writeCache(items, { etag = '', fingerprint = '' } = {}) {
  try {
    store.set(LS_KEYS.projectsCache, {
      fetchedAt: new Date().toISOString(),
      etag: typeof etag === 'string' ? etag : '',
      workspaceFingerprint: fingerprint ?? '',
      items: items.slice(0, 200).map((p) => ({
        id: p.id,
        name: p.name ?? p.id,
        slug: typeof p.slug === 'string' ? p.slug : '',
        description: typeof p.description === 'string' ? p.description : '',
        updatedAt: p.updatedAt ?? new Date().toISOString(),
        tags: Array.isArray(p.tags) ? p.tags : [],
        stats: p.stats ?? {},
        state: cacheableState(p.state),
        coverUrlPath: typeof p.cover === 'string' ? p.cover : '',
        broken: p.broken === true,
      })),
    });
    return true;
  } catch (e) {
    // store chặn (allowlist/secret) ⇒ mất cache, KHÔNG được phá màn hình.
    console.warn('[projects] không lưu được cache danh sách:', e?.code ?? e?.name ?? 'lỗi');
    return false;
  }
}

/** Chỉ lấy phần `state` cần cho thẻ: cờ stale + map job→trạng thái §5.7 + tiến độ run. */
function cacheableState(state) {
  if (!state || typeof state !== 'object') return {};
  const jobs = {};
  if (state.jobs && typeof state.jobs === 'object') {
    for (const [job, st] of Object.entries(state.jobs)) {
      if (typeof st === 'string' && st.length <= 24) jobs[job] = st;
    }
  }
  const out = {
    stale: state.stale === true,
    staleReason: Array.isArray(state.staleReason) ? state.staleReason.slice(0, 10).map(String) : [],
    jobs,
  };
  const ar = state.activeRun;
  if (ar && typeof ar === 'object' && ar.runId) {
    out.activeRun = {
      runId: String(ar.runId), kind: String(ar.kind ?? ''),
      done: Number(ar.done) || 0, total: Number(ar.total) || 0, failed: Number(ar.failed) || 0,
    };
  }
  return out;
}

/**
 * Nạp danh sách từ agent. Trả về `{items, etag, scannedAt, fromCache:false}`.
 * Lỗi ⇒ ném AgentError để màn hình tra bảng §3.9 (không tự viết copy lỗi).
 */
export async function fetchList({ etag = null } = {}) {
  const res = await api.projects.list(etag ? { etag } : {});
  if (res?.notModified === true) return { notModified: true, etag: res.etag ?? etag };
  const items = Array.isArray(res?.items) ? res.items : [];
  return {
    items,
    etag: res?.__etag ?? null,
    scannedAt: res?.scannedAt ?? null,
    workspaceLabel: res?.workspaceLabel ?? null,
    workspaceFingerprint: res?.workspaceFingerprint ?? null,
    fromCache: false,
  };
}

/** Danh sách thùng rác (link ở footer S1). Lỗi ⇒ trả 0, không phá màn. */
export async function fetchTrashCount() {
  try {
    const r = await api.trash.list();
    return Array.isArray(r?.items) ? r.items.length : 0;
  } catch { return 0; }
}

/** Tuỳ chọn view đã lưu (§3-S1-1). Phần chip/tag/dir xem NEEDS N4. */
const CHIP_IDS = ['all', 'need-gen', 'running', 'error', 'unfinished'];
const UI_DEFAULTS = { view: 'grid', sortBy: 'updatedAt', query: '', chip: 'all', tags: [], dir: 'desc' };

/** §3-S1-1: TOÀN BỘ bộ lọc sống trong `kitgen.ui.v1` ⇒ F5 không mất (NEEDS N4). */
export function readUiPrefs() {
  try {
    const ui = store.get(LS_KEYS.ui);
    return {
      view: ui.projectsView === 'list' ? 'list' : 'grid',
      sortBy: ui.sortBy ?? 'updatedAt',
      query: ui.filterQuery ?? '',
      chip: CHIP_IDS.includes(ui.filterChip) ? ui.filterChip : 'all',
      tags: Array.isArray(ui.filterTags) ? ui.filterTags.slice(0, 10) : [],
      dir: ui.sortDir === 'asc' ? 'asc' : 'desc',
    };
  } catch { return { ...UI_DEFAULTS, tags: [] }; }
}

export function writeUiPrefs(partial) {
  try { store.patch(LS_KEYS.ui, partial); } catch { /* không được phá màn */ }
}

/** Text lỗi cho màn — LUÔN qua bảng §3.9. */
export function present(err) { return errors.present(err); }
export function devDetails(err) { return errors.devDetails(err); }
