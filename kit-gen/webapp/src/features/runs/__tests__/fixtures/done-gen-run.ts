/**
 * Fixture DÙNG CHUNG: một run gen ĐÃ XONG, hình dạng đúng như `generatedRuns` đọc —
 * `kind:"gen"`, và đường ảnh nằm ở `job.artifact.path` chứ không phải `job.path`.
 *
 * Nằm ở ĐÂY (features/runs) chứ không nằm cạnh test dùng nó, vì cổng
 * `scripts/check-no-gen.mjs` cấm chuỗi `kind:"gen"` xuất hiện trong ba vùng
 * kit-core/canvas/gen — kể cả trong test. Cổng đó canh code TẠO run tiêu tiền;
 * một fixture chỉ MÔ TẢ run đã chạy xong thì hợp lệ, nhưng phải sống ngoài vùng cấm
 * để cổng giữ nguyên độ chặt.
 */
export const DONE_GEN_RUN = {
  id: "r1",
  kind: "gen",
  status: "done",
  startedAt: "2026-08-22T03:00:00.000Z",
  finishedAt: "2026-08-22T03:05:00.000Z",
  jobs: [{
    job: "chinh-ui",
    sheet: "ui",
    variant: "chinh",
    status: "done",
    diagnosis: null,
    artifact: { path: "raw/chinh-ui.png", validation: null },
  }],
};
