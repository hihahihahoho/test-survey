/**
 * features/projects/lib/cache.ts — CACHE DANH SÁCH cho chế độ chỉ-đọc §2.5-4.
 *
 * "Agent chưa chạy không phải là màn hình trắng" (§1.1-6): app phải vẽ được danh
 * sách từ `kitgen.projects.cache.v1` + nhãn `cache` trên từng thẻ.
 *
 * MỌI ghi/đọc đi qua `storeSet`/`storeGet` của R0 — đó là CỬA DUY NHẤT chạm
 * localStorage (§6.5-2), có allowlist khoá + schema + bộ dò secret. Feature này
 * KHÔNG BAO GIỜ gọi thẳng `localStorage`.
 *
 * Chốt nghiệp vụ: cache CHỈ dùng được khi `workspaceFingerprint` khớp. Đổi thư
 * mục làm việc thì cache cũ là dữ liệu SAI của một workspace khác — thà rỗng còn
 * hơn hiện lẫn (§3.9 WORKSPACE_CHANGED).
 */
import { LS_KEYS, storeGet, storeSet, type StoreShape } from "@/lib/store";
import { projectSchema, type Project, type ProjectList } from "@/lib/types";

type CacheShape = StoreShape[typeof LS_KEYS.projectsCache];
type CachedItem = CacheShape["items"][number];

export interface CachedList {
  items: Project[];
  fetchedAt: string;
  workspaceFingerprint: string;
}

/** Chỉ giữ phần `state` cần cho thẻ: cờ stale + map job→trạng thái + tiến độ run. */
function cacheableState(state: Project["state"]): Record<string, unknown> {
  if (!state) return {};
  const jobs: Record<string, string> = {};
  for (const [job, st] of Object.entries(state.jobs ?? {})) {
    if (typeof st === "string" && st.length <= 24) jobs[job] = st;
  }
  const out: Record<string, unknown> = {
    stale: state.stale === true,
    staleReason: (state.staleReason ?? []).slice(0, 10).map(String),
    jobs,
  };
  const ar = state.activeRun;
  if (ar?.runId) {
    out.activeRun = {
      runId: String(ar.runId),
      kind: ar.kind ?? null,
      done: Number(ar.done) || 0,
      total: Number(ar.total) || 0,
      failed: Number(ar.failed) || 0,
    };
  }
  return out;
}

/**
 * Ghi cache. Lỗi (quota, allowlist, bộ dò secret) ⇒ NUỐT, chỉ cảnh báo:
 * mất cache là phiền, phá màn hình mới là hỏng.
 * @returns true nếu ghi được.
 */
export function writeListCache(list: ProjectList, etag: string | null): boolean {
  try {
    storeSet(LS_KEYS.projectsCache, {
      fetchedAt: new Date().toISOString(),
      etag: etag ?? "",
      workspaceFingerprint: list.workspaceFingerprint ?? "",
      items: list.items.slice(0, 200).map((p) => ({
        id: p.id,
        name: p.name ?? p.id,
        slug: p.slug ?? "",
        description: p.description ?? "",
        updatedAt: p.updatedAt ?? "",
        tags: p.tags ?? [],
        stats: (p.stats ?? {}) as Record<string, unknown>,
        state: cacheableState(p.state),
        coverUrlPath: typeof p.cover === "string" ? p.cover : "",
        broken: p.broken === true,
      })),
    });
    return true;
  } catch (e) {
    // Không dùng console.error: đây không phải lỗi của user và không có gì để họ làm.
    console.warn("[S1] không lưu được cache danh sách:", (e as { name?: string })?.name ?? "lỗi");
    return false;
  }
}

/** Dựng lại `Project` từ mục cache. Field thiếu lấy mặc định của schema. */
function reviveProject(item: CachedItem): Project | null {
  const r = projectSchema.safeParse({
    id: item.id,
    name: item.name || item.id,
    slug: item.slug || undefined,
    description: item.description || undefined,
    updatedAt: item.updatedAt || undefined,
    tags: item.tags,
    stats: item.stats,
    state: item.state,
    cover: item.coverUrlPath || null,
    broken: item.broken,
  });
  return r.success ? r.data : null;
}

/**
 * Đọc cache. Trả `null` khi rỗng HOẶC khi fingerprint lệch.
 * @param fingerprint fingerprint của workspace đang hoạt động (từ `/health`).
 *        Truyền `null` nghĩa là "chưa biết" ⇒ chấp nhận cache (đúng lúc agent tắt
 *        hẳn thì ta không có gì để đối chiếu, mà đó chính là lúc cần cache nhất).
 */
export function readListCache(fingerprint?: string | null): CachedList | null {
  try {
    const c = storeGet(LS_KEYS.projectsCache);
    if (!Array.isArray(c.items) || c.items.length === 0) return null;
    if (fingerprint && c.workspaceFingerprint && c.workspaceFingerprint !== fingerprint) return null;
    const items = c.items.map(reviveProject).filter((p): p is Project => p !== null);
    if (items.length === 0) return null;
    return { items, fetchedAt: c.fetchedAt, workspaceFingerprint: c.workspaceFingerprint };
  } catch {
    return null;
  }
}
