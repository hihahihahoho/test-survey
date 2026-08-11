/**
 * features/docs/hooks/use-file-tabs.ts — GẮN read model vào dữ liệu thật.
 *
 * Hook này KHÔNG biết router (FE2-PLAN §3-C3: deep-link là callback typed để E1 nối).
 * Nó nhận `activeId` từ ngoài và trả `onActivate` — ai gọi thì tự quyết định đổi URL
 * hay đổi state. Nhờ vậy story/test dựng được component mà không cần dựng cả router.
 */
import { useMemo } from "react";
import { useDocsList, useLoadingTimeout, useDraftBadge } from "./use-docs";
import { buildTabs, resolveActiveId, type TabItem } from "../lib/subfile-model";
import { isDocsRepoError, type DraftBadge } from "../lib";

export type TabsPhase = "loading" | "timeout" | "error" | "ready";

export interface FileTabsModel {
  phase: TabsPhase;
  tabs: TabItem[];
  /** Luôn là một id CÓ THẬT trong `tabs` (rơi về tab ảo nếu id yêu cầu không còn). */
  activeId: string;
  /** `true` khi id yêu cầu không tồn tại ⇒ UI phải nói ra, không im lặng đổi tab. */
  activeFallback: boolean;
  /** Câu đời thường cho ca lỗi. Chi tiết kỹ thuật nằm ở `errorDetail`. */
  errorTitle: string;
  errorDetail?: string;
  refetch: () => void;
  badge: DraftBadge;
}

export interface UseFileTabsInput {
  projectId: string | undefined | null;
  /** id sheet của contract; agent chưa chạy ⇒ truyền `[]`, tab ảo hiện «0 sheet». */
  contractSheetIds: readonly string[];
  activeId?: string | null;
  dirtyIds?: readonly string[];
  now?: string;
}

export function useFileTabs(input: UseFileTabsInput): FileTabsModel {
  const { projectId, contractSheetIds, activeId, dirtyIds, now } = input;
  const q = useDocsList(projectId);
  const timedOut = useLoadingTimeout(q.isLoading);
  const badge = useDraftBadge();

  const tabs = useMemo(
    () => buildTabs({ docs: q.data ?? [], contractSheetIds, dirtyIds, now }),
    [q.data, contractSheetIds, dirtyIds, now],
  );

  const resolved = resolveActiveId(tabs, activeId);
  const phase: TabsPhase = q.isError
    ? "error"
    : q.isLoading
      ? timedOut
        ? "timeout"
        : "loading"
      : "ready";

  const err = q.error as unknown;
  return {
    phase,
    tabs,
    activeId: resolved,
    activeFallback: Boolean(activeId) && activeId !== resolved && phase === "ready",
    errorTitle: isDocsRepoError(err)
      ? err.message
      : "Không đọc được danh sách file của dự án này. Ảnh và bản thiết kế của bạn không bị ảnh hưởng.",
    errorDetail: isDocsRepoError(err) ? `${err.code}${err.detail ? `: ${err.detail}` : ""}` : undefined,
    refetch: () => void q.refetch(),
    badge,
  };
}
