/**
 * features/workflow-v4/lib/draft-storage.ts — CHỖ CHỨA BẢN NHÁP WORKFLOW.
 *
 * Tách khỏi `model.ts` có chủ đích: màn Home (`lib/hooks/use-projects.ts`) phải dọn được
 * nhánh persist khi xoá bộ kit, mà nó KHÔNG được kéo cả zustand store + `kit-form` vào
 * chunk dùng chung chỉ để gọi `localStorage.removeItem`. File này **không import gì**.
 *
 * Ba luật:
 *  1. Mỗi bộ kit một key: `kitgen.workflow-v4:<projectId>` (§W1-1).
 *  2. Key CŨ không có projectId chỉ còn để DI TRÚ, và chỉ bị xoá khi đã nhận xong.
 *  3. Xoá bộ kit ⇒ key sống bị dọn NGAY, nhưng một bản nằm lại ở "bia mộ" vì thao tác
 *     xoá ở Home **hoàn tác được trong 10s**. Wave này sinh ra để chặn mất dữ liệu,
 *     không phải để tạo thêm một đường mất dữ liệu mới.
 */

/** Key CŨ — một key cho cả trình duyệt. Chỉ còn tồn tại để di trú. */
export const LEGACY_DRAFT_KEY = "kitgen.workflow-v4";
export const draftKey = (projectId: string) => `${LEGACY_DRAFT_KEY}:${projectId}`;
export const trashedDraftKey = (projectId: string) => `${LEGACY_DRAFT_KEY}:trashed:${projectId}`;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    // Safari chặn storage ở chế độ riêng tư ⇒ ném ngay lúc đọc thuộc tính.
    return null;
  }
}

/**
 * `model.ts` đăng ký hàm quên-store-đang-cache ở đây. Dùng hook thay vì import ngược
 * để file này giữ được luật "không import gì" (và không tạo vòng phụ thuộc).
 */
const forgetHooks = new Set<(projectId: string) => void>();
export function onDraftForgotten(fn: (projectId: string) => void): () => void {
  forgetHooks.add(fn);
  return () => void forgetHooks.delete(fn);
}
function forget(projectId: string): void {
  for (const fn of forgetHooks) fn(projectId);
}

/**
 * Di trú bản nháp cũ sang project đang mở. CHỈ nhận khi project đó **chưa có** bản nháp
 * riêng; và chỉ xoá key cũ khi đã nhận xong — không nhận mà vẫn xoá là vứt bản nháp
 * người dùng đang có.
 */
export function migrateLegacyDraft(projectId: string): boolean {
  const store = safeStorage();
  if (!store) return false;
  const legacy = store.getItem(LEGACY_DRAFT_KEY);
  if (legacy === null) return false;
  if (store.getItem(draftKey(projectId)) !== null) return false;
  store.setItem(draftKey(projectId), legacy);
  store.removeItem(LEGACY_DRAFT_KEY);
  return true;
}

/** Xoá bộ kit ⇒ dọn nhánh persist của nó (giữ một bản ở bia mộ cho nút Hoàn tác). */
export function dropWorkflowDraft(projectId: string): void {
  forget(projectId);
  const store = safeStorage();
  if (!store) return;
  const current = store.getItem(draftKey(projectId));
  if (current !== null) store.setItem(trashedDraftKey(projectId), current);
  store.removeItem(draftKey(projectId));
}

/** Hoàn tác xoá ⇒ trả bản nháp về chỗ cũ. */
export function restoreWorkflowDraft(projectId: string): void {
  forget(projectId);
  const store = safeStorage();
  if (!store) return;
  const tomb = store.getItem(trashedDraftKey(projectId));
  if (tomb === null) return;
  if (store.getItem(draftKey(projectId)) === null) store.setItem(draftKey(projectId), tomb);
  store.removeItem(trashedDraftKey(projectId));
}
