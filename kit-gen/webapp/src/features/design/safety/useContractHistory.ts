/**
 * features/design/safety/useContractHistory.ts — LỊCH SỬ BẢN LƯU (tầng 3 của chốt X5).
 *
 * Bọc quanh hook của R0 (`useContractHistory` #24 + `useRestoreContract` #26) và bù
 * đúng MỘT thứ mà UI cần nhưng tầng dữ liệu không lo: sau khi khôi phục, **màn phải
 * nạp lại contract**.
 *
 * VÌ SAO ĐIỀU ĐÓ QUAN TRỌNG: #26 tạo một bản MỚI ở agent (v37 → v39), nó KHÔNG ghi
 * đè lịch sử. Nếu editor vẫn giữ `baseVersion` cũ thì lần bấm Lưu kế tiếp gửi
 * `If-Match: 37` trong khi đĩa đã ở 39 ⇒ user ăn ngay modal xung đột 409 cho một
 * việc mà chính họ vừa làm đúng. Hook này trả về contract mới + version mới để
 * `SafetyPanel` đẩy vào `onResolved()`.
 */
import * as React from "react";
import { useContractHistory as useHistoryQuery, useRestoreContract } from "@/lib/hooks";
import { api as agentApi } from "@/lib/api";
import type { Contract } from "@/lib/types";
import type { HistoryEntryView } from "./types";

export interface ContractHistoryApi {
  items: HistoryEntryView[];
  count: number;
  loading: boolean;
  error: unknown;
  refetch: () => void;
  /** Đang khôi phục snapshot nào (`null` = không). */
  restoring: string | null;
  /** Khôi phục + nạp lại. `null` nếu thất bại (lỗi đã được Query giữ). */
  restore: (snapshot: string) => Promise<{ contract: Contract; version: number } | null>;
  restoreError: unknown;
}

export function useContractHistory(projectId: string, _currentVersion: number): ContractHistoryApi {
  const query = useHistoryQuery(projectId);
  const restoreMutation = useRestoreContract(projectId);
  const [restoring, setRestoring] = React.useState<string | null>(null);
  const [restoreError, setRestoreError] = React.useState<unknown>(null);

  const items = React.useMemo<HistoryEntryView[]>(
    () =>
      (query.data?.items ?? []).map((it) => ({
        snapshot: it.snapshot,
        version: it.version ?? 0,
        at: it.at ?? null,
        summary: `${it.summary?.sheets ?? 0} sheet · ${it.summary?.components ?? 0} element`,
      })),
    [query.data],
  );

  const restore = React.useCallback(
    async (snapshot: string) => {
      setRestoring(snapshot);
      setRestoreError(null);
      try {
        await restoreMutation.mutateAsync(snapshot);
        // Đọc lại bản vừa được tạo. Dùng `api.contract.get` thay vì refetch của
        // Query để chắc chắn KHÔNG nhận bản cache cũ — đúng version là điều kiện
        // sống còn của `If-Match` ở lần lưu sau.
        const fresh = await agentApi.contract.get(projectId);
        void query.refetch();
        return { contract: fresh.contract, version: fresh.version };
      } catch (e) {
        setRestoreError(e);
        return null;
      } finally {
        setRestoring(null);
      }
    },
    [restoreMutation, projectId, query],
  );

  return {
    items,
    count: items.length,
    loading: query.isLoading,
    error: query.error,
    refetch: () => void query.refetch(),
    restoring,
    restore,
    restoreError,
  };
}
