/**
 * features/setup/hooks/use-setup-doctor.ts — gọi `/api/doctor` ĐÚNG LUẬT.
 *
 * §6.2 ghi rõ: **CẤM poll `/api/doctor`** vì mỗi lần nó chạy `codex debug prompt-input`
 * (~1 giây CPU trên máy user). Hook của R0 vì thế để `enabled: false` mặc định và bắt
 * màn phải chủ động bật. Ở S0 nghĩa là:
 *
 *   · bật khi user ĐANG Ở bước 3 hoặc 4 **và** agent đang kết nối được;
 *   · gọi lại kèm `?refresh=1` (bỏ cache 60s phía agent) CHỈ khi user bấm [Kiểm tra lại]
 *     hoặc vừa đổi thư mục làm việc — cả hai đều là cử chỉ người dùng.
 *
 * Agent chưa chạy ⇒ KHÔNG gọi và KHÔNG treo spinner: trả cờ `agentOffline` để UI hiện
 * thẻ "cần công cụ local" thay vì quay vòng vô tận (ràng buộc "ca AGENT CHƯA CHẠY").
 */
import * as React from "react";
import { useDoctor } from "@/lib/hooks";
import type { Doctor } from "@/lib/types/api";

export interface SetupDoctor {
  doctor: Doctor | null;
  /** đang tải LẦN ĐẦU (chưa có gì để vẽ) */
  loading: boolean;
  error: unknown;
  /** true ⇒ không phải lỗi, chỉ là chưa có agent để hỏi. */
  agentOffline: boolean;
  hasData: boolean;
  /** đang làm mới nhưng vẫn còn dữ liệu cũ để vẽ ⇒ không được xoá màn hình đi */
  refreshing: boolean;
  recheck: () => void;
}

export function useSetupDoctor(opts: { active: boolean; connected: boolean }): SetupDoctor {
  const { active, connected } = opts;
  const enabled = active && connected;

  /** >0 nghĩa là user đã chủ động yêu cầu kiểm tra lại ⇒ từ đó luôn gửi `?refresh=1`. */
  const [refreshTick, setRefreshTick] = React.useState(0);
  const q = useDoctor({ enabled, refresh: refreshTick > 0 });
  const refetch = q.refetch;

  React.useEffect(() => {
    if (refreshTick === 0 || !enabled) return;
    void refetch();
  }, [refreshTick, enabled, refetch]);

  const recheck = React.useCallback(() => setRefreshTick((t) => t + 1), []);

  return {
    doctor: q.data ?? null,
    loading: enabled && q.isPending,
    error: enabled ? q.error : null,
    agentOffline: active && !connected,
    hasData: q.data !== undefined,
    refreshing: q.isFetching && q.data !== undefined,
    recheck,
  };
}
