import type { Run } from "@/lib/types/api";

/**
 * Fixture DÙNG CHUNG: một run gen ĐANG CHẠY / ĐÃ XONG, hình dạng đúng như
 * `GET /api/runs/:id` trả về (có `projectId`, `progress`, `jobs[].status`).
 *
 * ══ VÌ SAO NẰM CẠNH TEST CỦA MÀN SOẠN ═══════════════════════
 * Cùng lý do đã ghi ở `done-gen-run.ts` cạnh đây: cổng `scripts/check-no-gen.mjs`
 * cấm chuỗi `kind:"gen"` xuất hiện trong các vùng cấm — KỂ CẢ trong test. Wave 4·B
 * thêm `src/features/prompt-canvas` vào danh sách vùng cấm (nó là cửa chính mới,
 * tức là nơi một lời gọi tiêu tiền sẽ mọc ra nếu ai đó lỡ tay), nên fixture của
 * màn đó phải dọn ra khỏi vùng cấm.
 *
 * Cổng canh code TẠO run tiêu tiền. Một fixture chỉ MÔ TẢ run đã/đang chạy thì
 * hợp lệ về nội dung — nhưng phải sống ngoài vùng cấm để cổng giữ nguyên độ chặt,
 * thay vì phải nới luật cho file test (nới một lần là mất cả hàng rào).
 *
 * `as unknown as Run`: fixture cố ý NGHÈO hơn `Run` thật — chỉ mang đúng những
 * trường mà màn kết quả đọc. Điền đủ mọi trường sẽ biến fixture thành thứ phải bảo
 * trì mỗi lần schema đổi, mà không ca nào đọc tới chúng.
 */
export function makeGenRun(
  projectId: string,
  id: string,
  status: Run["status"],
  jobStatus: "queued" | "running" | "ok" | "failed",
): Run {
  return {
    id,
    projectId,
    kind: "gen",
    status,
    startedAt: "2026-08-25T10:00:00.000Z",
    finishedAt: status === "running" || status === "queued" ? null : "2026-08-25T10:02:00.000Z",
    progress: { done: jobStatus === "ok" ? 1 : 0, total: 1, failed: jobStatus === "failed" ? 1 : 0, etaSeconds: null },
    jobs: [{ job: `chinh-${id}`, status: jobStatus, recovered: false }],
    seq: 1,
  } as unknown as Run;
}
