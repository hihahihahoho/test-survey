/**
 * features/docs/hooks/use-docs.ts — ADAPTER TanStack Query quanh `docsRepo()`.
 *
 * ⚠️ ĐÂY LÀ CỬA DUY NHẤT mà UI file con được dùng để đọc dữ liệu (FE2-PLAN §4).
 * Không component nào gọi thẳng `docsRepo()`, không `fetch()`, không localStorage,
 * không Zustand. Đổi adapter `local → http` sau #43–#49 thì SỬA ĐÚNG `docs-repo.ts`,
 * file này và mọi component không phải đổi.
 *
 * VÌ SAO KHÔNG DÙNG `qk` CỦA R0: `src/lib/hooks/keys.ts` thuộc glob R0 và FE-2 cấm
 * sửa file ngoài glob. Key ở đây có namespace riêng `["docs", …]` nên không đụng
 * tiền tố nào của R0 ⇒ `invalidateQueries` hai bên không giẫm chân nhau.
 * TODO(C1): khi #43–#49 lên, đề nghị R0 nhận key này vào `qk.docs` — đã ghi
 * `teams/react/NEEDS-fe2-c.md` N1.
 *
 * BA LUẬT VỀ TRẠNG THÁI (FE2-PLAN §0-N5):
 *  1. **retry HỮU HẠN.** Lỗi của kho local hầu hết là vĩnh viễn trong phiên
 *     (IndexedDB bị chặn, quota đầy) — retry vô hạn chỉ làm màn quay mãi. Chỉ thử
 *     lại đúng 1 lần, và KHÔNG thử lại các mã đã biết là vô vọng.
 *  2. **Loading có trần 20s.** Quá hạn thì hook tự báo `timedOut` để UI đổi sang
 *     lối lỗi có nút [Thử lại], thay vì skeleton chạy vĩnh viễn.
 *  3. **Agent chưa chạy KHÔNG ảnh hưởng tới đây.** File con nằm trên máy; hook này
 *     không gọi API agent. UI phải nói đúng điều đó thay vì khoá màn.
 */
import { useEffect, useRef, useState } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import {
  docsRepo,
  draftBadge,
  isDocsRepoError,
  type Doc,
  type DraftBadge,
} from "../lib";

/** Namespace key riêng của tầng file con. */
export const docsKeys = {
  all: () => ["docs"] as const,
  ofProject: (projectId: string) => ["docs", projectId] as const,
  list: (projectId: string, includeTrashed = false) =>
    ["docs", projectId, "list", includeTrashed ? "with-trash" : "active"] as const,
  storage: () => ["docs", "storage"] as const,
};

/** Trần thời gian chờ trước khi UI được phép gọi đây là hỏng (§0-N5). */
export const DOCS_LOADING_TIMEOUT_MS = 20_000;

/** Những mã lỗi mà thử lại chắc chắn vẫn hỏng ⇒ hỏng luôn cho nhanh.
 *  `WRITE_BLOCKED` nằm đây vì cùng một nội dung sẽ trúng cùng một luật ở lần thử thứ
 *  hai — chỉ người dùng sửa chữ mới đổi được kết quả. */
const NO_RETRY = new Set(["STORAGE_UNAVAILABLE", "NOT_IMPLEMENTED", "DOC_READONLY", "DOC_NOT_FOUND", "WRITE_BLOCKED"]);

function retryFinite(failureCount: number, error: Error): boolean {
  if (isDocsRepoError(error) && NO_RETRY.has(error.code)) return false;
  return failureCount < 1;
}

/** Danh sách file con của một project. `projectId` rỗng ⇒ không gọi (route chưa có id). */
export function useDocsList(
  projectId: string | undefined | null,
  opts: { includeTrashed?: boolean } = {},
): UseQueryResult<Doc[], Error> {
  const includeTrashed = opts.includeTrashed ?? false;
  return useQuery({
    queryKey: docsKeys.list(projectId ?? "", includeTrashed),
    queryFn: () => docsRepo().list(projectId!, { includeTrashed }),
    enabled: Boolean(projectId),
    retry: retryFinite,
    staleTime: 5_000,
    gcTime: 10 * 60_000,
  });
}

/** Kho lưu nháp có dùng được không — quyết định nội dung badge «bản nháp cục bộ». */
export function useDocsStorage(): UseQueryResult<boolean, Error> {
  return useQuery({
    queryKey: docsKeys.storage(),
    queryFn: () => docsRepo().available(),
    retry: false,
    staleTime: 30_000,
  });
}

/**
 * Nội dung badge nháp. Trong lúc còn đang dò kho lưu thì COI NHƯ dùng được —
 * hiện badge "cảnh báo mất dữ liệu" rồi rút lại là kiểu nhấp nháy gây hoang mang.
 */
export function useDraftBadge(): DraftBadge {
  const storage = useDocsStorage();
  return draftBadge(storage.data ?? true);
}

/**
 * `true` khi query đã chờ quá `DOCS_LOADING_TIMEOUT_MS` mà chưa xong.
 * Tách thành hook riêng (không nhét vào `useDocsList`) để test được bằng fake timer
 * và để chỗ nào không cần trần thời gian thì không phải trả giá cho một `setTimeout`.
 */
export function useLoadingTimeout(isLoading: boolean, ms: number = DOCS_LOADING_TIMEOUT_MS): boolean {
  const [timedOut, setTimedOut] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isLoading) {
      setTimedOut(false);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
      return;
    }
    timer.current = setTimeout(() => setTimedOut(true), ms);
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = null;
    };
  }, [isLoading, ms]);

  return timedOut;
}
