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
 * ══ NỀN ĐỤC KHÔNG CÒN LÀ MỘT CHẨN ĐOÁN ═══════════════════════════════════════
 *
 * 09/2026 từng có mã `OPAQUE_ALPHA`: cổng alpha của `gen.sh` đánh trượt tấm đục,
 * job đỏ, ảnh không được đăng. Chủ sản phẩm chốt 09/09/2026 "cái này cứ để cho nó
 * gen tự nhiên nhé, ko block" — engine in `OK` kèm một ghi chú, job xong bình
 * thường, và thứ duy nhất còn nói ra sự thật là cờ `mode: "rgb"` của từng ô trong
 * manifest. Nên `diagnosisSchema` trở lại đúng 5 mã LỖI THẬT, và một payload cũ
 * mang `OPAQUE_ALPHA` phải bị schema từ chối chứ không lặng lẽ lọt qua.
 * Nguồn: `agent/lib/engine.mjs` (`diagnose` + `DIAGNOSIS_VI`).
 */
describe("nền đục đi đường job THÀNH CÔNG, không đường chẩn đoán", () => {
  it("`OPAQUE_ALPHA` KHÔNG còn là giá trị hợp lệ của `diagnosis`", () => {
    const run = runWith([cell("ok")]);
    const r = runSchema.safeParse({
      ...run,
      jobs: [{ job: "chinh-nhan-vat", variant: "chinh", sheet: "nhan-vat", status: "failed", diagnosis: "OPAQUE_ALPHA" }],
    });
    expect(r.success).toBe(false);
  });

  it("tấm nền đục về web như một job xong: status ok, có artifact, không chẩn đoán", () => {
    const run = runWith([cell("ok")]);
    const r = runSchema.safeParse({
      ...run,
      jobs: [{
        job: "chinh-nhan-vat",
        variant: "chinh",
        sheet: "nhan-vat",
        status: "ok",
        artifact: { path: "runs/r-0001/artifacts/chinh-nhan-vat.png", bytes: 1234 },
      }],
    });
    expect(r.success).toBe(true);
    expect(r.success && r.data.jobs[0]!.status).toBe("ok");
    expect(r.success ? (r.data.jobs[0]!.diagnosis ?? null) : "x").toBeNull();
  });
});
