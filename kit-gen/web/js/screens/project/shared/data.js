/**
 * data.js — nạp dữ liệu cho S2 · S2b · S5 (§6.2 #9, #22, #33, #42).
 * MỌI request đi qua core/api.js → core/agent.js (§6.5-1: cấm fetch trực tiếp).
 * Mọi lần đọc trả về `{ ok, data, error, fromCache }` — màn hình KHÔNG bắt exception
 * rải rác, và không bao giờ có nhánh "im lặng" (§3.9 điều cấm 3).
 *
 * Chế độ chỉ-đọc (§2.5-4): project được vẽ lại từ `kitgen.projects.cache.v1` qua
 * core/store.js. Không có cache ⇒ trả error để màn vẽ khối lỗi có nút, KHÔNG trắng trang.
 */

import * as api from '../../../core/api.js';
import * as store from '../../../core/store.js';
import { LS_KEYS } from '../../../core/constants.js';

/** Bọc một lời gọi API: không bao giờ ném ra ngoài. */
export async function attempt(fn) {
  try { return { ok: true, data: await fn(), error: null, fromCache: false }; }
  catch (error) { return { ok: false, data: null, error, fromCache: false }; }
}

/** #9 GET /api/projects/:id — kèm state.stale/staleReason/jobs + stats. */
export async function loadProject(projectId) {
  const r = await attempt(() => api.projects.get(projectId));
  if (r.ok) {
    const project = r.data?.project ?? null;
    if (project) rememberInCache(project);
    return { ...r, data: project };
  }
  const cached = projectFromCache(projectId);
  if (cached) return { ok: true, data: cached, error: r.error, fromCache: true };
  return r;
}

/** #22 GET contract — nguồn danh sách phong cách × sheet của ma trận (§3-S2). */
export async function loadContract(projectId) {
  const r = await attempt(() => api.contract.get(projectId));
  if (!r.ok) return r;
  return { ...r, data: { version: r.data?.version ?? null, contract: r.data?.contract ?? null } };
}

/** #33 GET runs?limit — thẻ "Lượt chạy gần đây" (3 dòng ở S2). */
export async function loadRuns(projectId, limit = 5) {
  const r = await attempt(() => api.runs.list(projectId, limit));
  if (!r.ok) return { ...r, data: [] };
  return { ...r, data: Array.isArray(r.data?.items) ? r.data.items : [] };
}

/** #42 GET kit?variant — danh mục file đã cắt. KIT_NOT_CUT là trạng thái EMPTY, không phải lỗi. */
export async function loadKit(projectId, variant) {
  const r = await attempt(() => api.files.kit(projectId, variant));
  if (r.ok) {
    return {
      ...r,
      data: {
        variant: r.data?.variant ?? variant ?? null,
        cutAt: r.data?.cutAt ?? null,
        files: Array.isArray(r.data?.files) ? r.data.files : [],
        sheets: r.data?.sheets ?? {},
      },
    };
  }
  if (r.error?.code === 'KIT_NOT_CUT') return { ok: true, data: null, error: null, fromCache: false, notCut: true };
  return r;
}

/** #2 GET doctor — CẤM poll (tốn ~1s). Chỉ gọi khi mở S6 / bấm Kiểm tra lại / trước M1. */
export async function loadDoctor({ refresh = false } = {}) {
  return attempt(() => api.system.doctor({ refresh }));
}

/** #3 GET workspaces — web chỉ CHỌN giữa các workspace agent đã biết (chốt X1). */
export async function loadWorkspaces() {
  const r = await attempt(() => api.system.workspaces());
  if (!r.ok) return { ...r, data: { items: [], activeId: null } };
  return {
    ...r,
    data: {
      items: Array.isArray(r.data?.items) ? r.data.items : [],
      activeId: r.data?.activeId ?? null,
    },
  };
}

/**
 * GET /api/update — chỉ gọi khi user BẤM (nó là lần duy nhất app chạm Internet).
 * Chuẩn hoá về đúng 7 field để tab Về không phải tự đoán field thiếu.
 */
export async function loadUpdate() {
  const r = await attempt(() => api.system.checkUpdate());
  if (!r.ok) return { ...r, data: null };
  const d = r.data ?? {};
  return {
    ...r,
    data: {
      ok: d.ok === true,
      currentVersion: typeof d.currentVersion === 'string' ? d.currentVersion : null,
      latestVersion: typeof d.latestVersion === 'string' ? d.latestVersion : null,
      available: d.available === true,
      reason: typeof d.reason === 'string' ? d.reason : null,
      updateCommand: typeof d.updateCommand === 'string' ? d.updateCommand : '~/.kitgen/bin/kitgen update',
      checkedAt: typeof d.checkedAt === 'string' ? d.checkedAt : null,
    },
  };
}

/** #12 GET trash. */
export async function loadTrash() {
  const r = await attempt(() => api.trash.list());
  if (!r.ok) return { ...r, data: [] };
  return { ...r, data: Array.isArray(r.data?.items) ? r.data.items : [] };
}

/* ───────────────────── cache danh sách project (§2.5-4) ───────────────────── */

/** Đọc 1 project từ kitgen.projects.cache.v1 (chỉ số liệu, KHÔNG có state.jobs). */
export function projectFromCache(projectId) {
  let cache;
  try { cache = store.get(LS_KEYS.projectsCache); } catch { return null; }
  const hit = (cache?.items ?? []).find((p) => p.id === projectId);
  if (!hit) return null;
  return {
    ...hit,
    cover: hit.coverUrlPath ?? null,
    stats: hit.stats ?? {},
    state: { stale: false, staleReason: [], jobs: {} },
    __cachedAt: cache.fetchedAt ?? null,
    __fromCache: true,
  };
}

/** Thời điểm cache được lấy — để banner §2.5-1 nói đúng giờ, không bịa. */
export function cacheFetchedAt() {
  try { return store.get(LS_KEYS.projectsCache)?.fetchedAt ?? null; } catch { return null; }
}

/**
 * Cập nhật một project vào cache. Chỉ ghi các field trong schema §4.1
 * (store.js sẽ loại field lạ + chặn secret; ta không tự tin vào input).
 */
export function rememberInCache(project) {
  if (!project || typeof project !== 'object' || !project.id) return;
  try {
    const cache = store.get(LS_KEYS.projectsCache);
    const entry = {
      id: project.id,
      name: String(project.name ?? project.id),
      updatedAt: project.updatedAt ?? new Date().toISOString(),
      tags: Array.isArray(project.tags) ? project.tags.map(String) : [],
      stats: project.stats ?? {},
      coverUrlPath: typeof project.cover === 'string' ? project.cover : '',
      broken: project.broken === true,
    };
    const items = [entry, ...(cache.items ?? []).filter((p) => p.id !== project.id)].slice(0, 60);
    store.patch(LS_KEYS.projectsCache, { items, fetchedAt: new Date().toISOString() });
  } catch { /* store chặn (allowlist/secret) hoặc hết quota → bỏ cache, KHÔNG vỡ UI */ }
}

/** Xoá project khỏi cache sau khi xoá thật (tránh thẻ ma ở chế độ chỉ-đọc). */
export function forgetInCache(projectId) {
  try {
    const cache = store.get(LS_KEYS.projectsCache);
    store.patch(LS_KEYS.projectsCache, {
      items: (cache.items ?? []).filter((p) => p.id !== projectId),
      fetchedAt: new Date().toISOString(),
    });
  } catch { /* noop */ }
}

/** Ghi nhớ project vừa mở (kitgen.recent.v1) — dùng cho ⌘P của màn khác. */
export function markOpened(projectId) {
  try { store.rememberOpenedProject(projectId); } catch { /* noop */ }
}
