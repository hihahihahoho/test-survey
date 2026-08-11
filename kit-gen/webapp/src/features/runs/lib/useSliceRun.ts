/**
 * features/runs/lib/useSliceRun.ts — CHẠY CẮT (§W3-8).
 *
 * ══ VÌ SAO CẮT KHÔNG CÓ MODAL mà sinh ảnh thì có ═════════════════════════════
 * §1.1-2: "việc TỐN TIỀN phải xin phép rõ ràng". Cắt **không tốn tiền**:
 * `agent/lib/engine.mjs:139` chạy `python3 slice.py`, và `slice.py` chỉ import
 * `json, math, os, sys, collections, array, PIL` — không một dòng nào gọi mạng hay
 * model. Bắt người dùng qua một modal cho việc đó là ma sát vô nghĩa.
 *
 * SINH ẢNH thì TUYỆT ĐỐI đi qua `<GenerateDialog>` (§4.8: "không có đường nào chạy
 * gen mà không qua modal này"). Hook này chỉ gửi `kind: "slice"`, **cố định trong mã,
 * không nhận `kind` từ nơi gọi** — để không ai dùng nó làm đường tắt chạy gen mà bỏ
 * qua cảnh báo quota. `scripts/check-no-gen.mjs` luật ③ canh chính điều đó bằng máy.
 *
 * ══ VÌ SAO NẰM Ở `features/runs/` chứ không phải `features/workflow-v4/lib/` ══
 * Plan §W3-8 viết "bốc sang `features/workflow-v4/lib/`". Tôi để ở đây, và đây là
 * một lệch có chủ ý — vì làm đúng chữ của plan sẽ **tự bắn vào chân cổng W3-0**:
 * cổng đó FAIL nếu chuỗi `useStartRun` xuất hiện trong `src/features/workflow-v4/**`,
 * mà hook cắt buộc phải gọi `useStartRun`. Hai câu của plan đá nhau; tôi giữ câu
 * quan trọng hơn (cổng chặn tiêu tiền phải chặt) và chuyển hook sang `features/runs/`
 * — nơi plan đã tuyên "CẤM XOÁ" và là nhà đúng nghĩa của mọi thứ liên quan tới run.
 * Workflow import `useSliceRun`, không import `useStartRun` ⇒ cổng vẫn chặt nhất có thể.
 */
import * as React from "react";
import { useStartRun } from "@/lib/hooks";
import { presentError } from "@/lib/api";
import { toastError, toastInfo, toastSuccess } from "@/features/projects/lib/feedback";

export interface SliceRunApi {
  /** Cắt lại. `jobs` rỗng ⇒ agent tự chọn TOÀN BỘ job của contract (`agent/lib/runs.mjs:49`). */
  run: (jobs?: readonly string[]) => void;
  pending: boolean;
}

export interface SliceRunOptions {
  /** Có gì đó để cắt không. `false` ⇒ nói ra, không gửi request rỗng. */
  hasRaw?: boolean;
  onStarted?: (runId: string) => void;
}

export function useSliceRun(projectId: string, opts: SliceRunOptions = {}): SliceRunApi {
  const startRun = useStartRun(projectId);
  const { hasRaw = true, onStarted } = opts;

  const run = React.useCallback(
    (jobs: readonly string[] = []) => {
      if (!hasRaw) {
        // §3.9 điều cấm 3: thao tác không làm được thì phải NÓI, không `return` im lặng.
        toastInfo("Chưa có ảnh nào để cắt", "Bộ kit cần có ảnh đã vẽ trước khi cắt lại.");
        return;
      }
      startRun.mutate(
        // `maxJobs`/`autoSliceAfterGen` bắt buộc trong schema #32; cắt không phải
        // "pha 2 của gen" nên `autoSliceAfterGen` để false cho đúng nghĩa.
        { kind: "slice", jobs: [...jobs], maxJobs: 4, autoSliceAfterGen: false },
        {
          onSuccess: (res) => {
            toastSuccess(
              jobs.length === 0 ? "Đang cắt lại bộ kit" : `Đang cắt ${jobs.length} lượt`,
              "Cắt không tiêu quota.",
            );
            if (res.runId) onStarted?.(res.runId);
          },
          onError: (err) => {
            // 409 RUN_CONFLICT có `details.runId` ⇒ nói rõ đang có lượt chạy khác.
            const v = presentError(err);
            const d = v.details as { runId?: string } | null;
            toastError(err, typeof d?.runId === "string" ? { descriptionOverride: `Đang có lượt chạy khác: ${d.runId}. Chờ nó xong rồi cắt.` } : {});
          },
        },
      );
    },
    [startRun, hasRaw, onStarted],
  );

  return { run, pending: startRun.isPending };
}
