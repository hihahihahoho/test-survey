/**
 * features/project/lib/useSliceRun.ts — CHẠY CẮT từ S2 (nút [✂ Cắt N lượt]).
 *
 * VÌ SAO CẮT KHÔNG CÓ MODAL mà sinh ảnh thì có: §1.1-2 nói "việc TỐN TIỀN phải
 * xin phép rõ ràng", và §1.2 xếp `kits/` vào nhóm "tái tạo rẻ" — cắt không gọi
 * AI, không tiêu quota, chạy vài chục giây. Bắt user qua một modal cho việc đó là
 * ma sát vô nghĩa (cùng lý do §0.2-X6 bỏ việc gõ tên khi xoá vào thùng rác).
 * Bù lại phải có phản hồi tức thì + đường đi tới nhật ký, và đó là việc của hook này.
 *
 * SINH ẢNH thì TUYỆT ĐỐI đi qua `<GenerateDialog>` của features/runs (§4.8: "không
 * có đường nào chạy gen mà không qua modal này"). Hook này chỉ gửi `kind: "slice"`,
 * cố định trong mã, không nhận `kind` từ nơi gọi — để không ai dùng nó làm đường
 * tắt chạy gen mà bỏ qua cảnh báo quota.
 */
import * as React from "react";
import { useStartRun } from "@/lib/hooks";
import { presentError } from "@/lib/api";
import { toastError, toastInfo, toastSuccess } from "@/features/projects/lib/feedback";
import type { ProjectNav } from "./nav";

export interface SliceRunApi {
  /** Bắt đầu cắt đúng tập lượt truyền vào. Rỗng ⇒ không làm gì (và nói ra). */
  run: (jobs: readonly string[]) => void;
  pending: boolean;
}

export function useSliceRun(projectId: string, nav: ProjectNav): SliceRunApi {
  const startRun = useStartRun(projectId);

  const run = React.useCallback(
    (jobs: readonly string[]) => {
      if (jobs.length === 0) {
        // §3.9 điều cấm 3: thao tác không làm được thì phải NÓI, không `return` im lặng.
        toastInfo("Chưa có lượt nào cần cắt", "Chọn ô trong ma trận tiến độ rồi bấm Cắt.");
        return;
      }
      startRun.mutate(
        // maxJobs/autoSliceAfterGen là bắt buộc trong schema #32; cắt không dùng
        // `autoSliceAfterGen` nên để false cho đúng nghĩa (không phải "pha 2 của gen").
        { kind: "slice", jobs: [...jobs], maxJobs: 4, autoSliceAfterGen: false },
        {
          onSuccess: (res) => {
            toastSuccess(
              jobs.length === 1 ? "Đang cắt 1 lượt" : `Đang cắt ${jobs.length} lượt`,
              "Cắt không tiêu quota. Bạn có thể xem nhật ký ngay.",
              res.runId ? { label: "Xem nhật ký", onClick: () => nav.toRun(res.runId) } : undefined,
            );
          },
          onError: (err) => {
            // 409 RUN_CONFLICT có `details.runId` ⇒ dựng được nút [Xem lượt đang chạy] (§3.9).
            const v = presentError(err);
            const d = v.details as { runId?: string } | null;
            toastError(err, {
              ...(typeof d?.runId === "string"
                ? { action: { label: "Xem lượt đang chạy", onClick: () => nav.toRun(d.runId as string) } }
                : {}),
            });
          },
        },
      );
    },
    [startRun, nav],
  );

  return { run, pending: startRun.isPending };
}
