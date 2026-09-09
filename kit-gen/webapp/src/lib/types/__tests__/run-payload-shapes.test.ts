import { describe, expect, it } from "vitest";
import { runListSchema, runSchema } from "../api";

/**
 * HỒI QUY 14/08 — «MÀN ẢNH ĐÃ TẠO TRỐNG TRƠN DÙ ĐĨA ĐẦY ẢNH».
 *
 * Người dùng Cmd+F5 giữa lượt gen rồi mở lại dự án: màn "Ảnh đã tạo" hiện
 * «Chưa có ảnh nào», tab "Ảnh gốc" trống, dải tiến trình và dải lỗi cũng biến mất —
 * trong khi trên đĩa có 5 sheet raw + 56 ô đã cắt và `/api/projects/:id/runs` trả 200
 * với đầy đủ dữ liệu (đo trên dự án thật `hello-a262`, agent 1.2.0/2.1.22).
 *
 * Nguyên nhân: `validate_output_geometry.py:118-120` gán `status: "empty"` cho ô CỐ Ý
 * bỏ trống (`skel.shape === "empty"`), còn schema web chỉ nhận `"ok" | "regenerate"`.
 * MỘT ô như thế trong MỘT job làm `runListSchema.parse()` NÉM ⇒ `useRuns()` không có
 * `data` ⇒ `GeneratedResults` thấy `items = []` ⇒ vẽ trạng thái rỗng. Không một dòng
 * lỗi nào hiện ra, vì đây là lỗi query chứ không phải lỗi render.
 *
 * Hai lời hứa được khoá ở đây:
 *   ① `"empty"` là giá trị HỢP LỆ — nó có thật, engine đang gửi;
 *   ② giá trị LẠ (engine mới hơn web) không được giết cả danh sách: `.catch("ok")`.
 *      §6.5-6 — thứ không hiểu thì bỏ qua, đừng vỡ.
 */

const cell = (status: string) => ({ file: "01-btn", cell: 0, status, reasons: [] });

const runWith = (cells: ReturnType<typeof cell>[]) => ({
  id: "r-0001",
  projectId: "hello-a262",
  kind: "gen",
  status: "done-with-errors",
  startedAt: "2026-08-14T07:36:27.524Z",
  finishedAt: "2026-08-14T07:40:40.710Z",
  progress: { done: 5, total: 10, failed: 5 },
  jobs: [{
    job: "chinh-ui",
    variant: "chinh",
    sheet: "ui",
    status: "ok",
    artifact: {
      path: "runs/r-0001/artifacts/chinh-ui.png",
      bytes: 3112044,
      writtenAt: "2026-08-14T07:38:02.000Z",
      validation: { ok: false, job: "chinh-ui", sheet: "ui", cells },
    },
  }],
});

describe("payload lượt chạy THẬT của agent không được làm vỡ màn kết quả", () => {
  it("ô đệm `status: \"empty\"` (validate_output_geometry.py) parse được", () => {
    const r = runSchema.safeParse(runWith([cell("ok"), cell("empty"), cell("regenerate")]));
    expect(r.success).toBe(true);
    expect(r.success && r.data.jobs[0]!.artifact!.validation!.cells.map((c) => c.status))
      .toEqual(["ok", "empty", "regenerate"]);
  });

  it("MỘT ô lạ KHÔNG được giết cả danh sách lượt — đây là ca đã làm màn trống trơn", () => {
    const r = runListSchema.safeParse({ items: [runWith([cell("trang-thai-tuong-lai"), cell("ok")])] });
    expect(r.success).toBe(true);
    // Trạng thái lạ hạ về "ok": chỉ `regenerate` mới được phép hô "cần tạo lại",
    // đoán bừa theo hướng báo động sẽ đẩy người dùng đi đốt quota cho ô không sai.
    expect(r.success && r.data.items[0]!.jobs[0]!.artifact!.validation!.cells[0]!.status).toBe("ok");
  });

  it("`artifact` xuất hiện GIỮA lượt (chu trình per-sheet) vẫn parse được", () => {
    // agent/lib/run-handle.mjs điền `artifact` ngay khi một tấm gen xong, chứ không
    // đợi hết lượt — run vẫn `running` mà job đã có ảnh đọc được.
    const live = { ...runWith([cell("ok")]), status: "running", finishedAt: null };
    const r = runSchema.safeParse(live);
    expect(r.success).toBe(true);
    expect(r.success && r.data.jobs[0]!.artifact!.path).toBe("runs/r-0001/artifacts/chinh-ui.png");
  });
});

/**
 * ══ CHẨN ĐOÁN `OPAQUE_ALPHA` (09/2026) ═══════════════════════════════════════
 *
 * Cổng alpha của `gen.sh` đánh trượt cả lượt đầu lẫn lượt vẽ lại tự động: ảnh ĐÃ
 * sinh ra, quota ĐÃ tiêu, chỉ có nền là đục. Đây là mã DUY NHẤT mà việc đáng làm
 * tiếp theo là bấm Vẽ — nên nó phải qua được schema chứ không rơi về một giá trị
 * chung. Nguồn: `agent/lib/engine.mjs` (`diagnose` + `DIAGNOSIS_VI`).
 */
describe("job trượt cổng alpha đọc được nguyên vẹn ở web", () => {
  const opaque = () => {
    const run = runWith([cell("ok")]);
    return {
      ...run,
      failSummary: "1/3 job model trả ảnh đục, không có kênh alpha thật (đã thử lại 1 lần)",
      jobs: [{
        job: "chinh-nhan-vat",
        variant: "chinh",
        sheet: "nhan-vat",
        status: "failed",
        diagnosis: "OPAQUE_ALPHA",
        errorTail: [
          "Model trả ảnh đục, không có kênh alpha thật — đã thử lại 1 lần, vẫn đục. Bấm Vẽ lại để thử tiếp.",
        ],
      }],
    };
  };

  it("`OPAQUE_ALPHA` là giá trị HỢP LỆ, không bị hạ về UNKNOWN", () => {
    const r = runSchema.safeParse(opaque());
    expect(r.success).toBe(true);
    expect(r.success && r.data.jobs[0]!.diagnosis).toBe("OPAQUE_ALPHA");
  });

  it("câu tiếng Việt của agent tới được web nguyên văn (errorTail)", () => {
    const r = runSchema.safeParse(opaque());
    expect(r.success && r.data.jobs[0]!.errorTail?.[0]).toContain("đã thử lại 1 lần");
    expect(r.success && r.data.failSummary).toContain("không có kênh alpha thật");
  });

  it("tấm trượt cổng KHÔNG mang `artifact` — và web không được coi đó là lỗi parse", () => {
    const r = runSchema.safeParse(opaque());
    expect(r.success).toBe(true);
    expect(r.success && !r.data.jobs[0]!.artifact).toBe(true);
  });
});
