/**
 * BACKLOG #22 — «Copy chẩn đoán».
 *
 * Ca ở đây bảo vệ HAI thứ, và thứ hai mới là thứ đắt:
 *  ① khối text có đủ thứ dev cần để trả lời mà không phải hỏi vòng vo;
 *  ② nó KHÔNG mọc thêm nguồn dữ liệu nào ngoài những gì agent đã redact. Nút này nằm
 *    ngay cạnh một dải lỗi, tức là đúng lúc người dùng đang bực và sẵn sàng dán bất cứ
 *    thứ gì cho bất cứ ai — nên trần dữ liệu phải được khoá bằng test, không bằng lời hứa.
 */
import { describe, expect, it } from "vitest";
import { buildDiagnosticsText, osLabel } from "../lib/diagnostics";
import type { Run, RunJob } from "@/lib/types";

const job = (o: Partial<RunJob> & { job: string }): RunJob => ({
  status: "failed", recovered: false, ...o,
} as RunJob);

const mkRun = (o: Partial<Run> = {}): Run => ({
  id: "r-0007", kind: "gen", status: "done-with-errors",
  startedAt: "2026-08-14T02:00:00.000Z", finishedAt: "2026-08-14T02:03:20.000Z",
  progress: { done: 0, total: 2, failed: 2 }, seq: 40,
  failSummary: "2/2 job không ghi được ảnh",
  jobs: [
    job({ job: "tet-main", diagnosis: "NO_ARTIFACT", errorTail: ["codex: command not found", "rc=127 — ảnh không được ghi mới"] }),
    job({ job: "tet-bg-home", diagnosis: "NO_ARTIFACT", errorTail: ["rc=127 — ảnh không được ghi mới"] }),
  ],
  ...o,
} as Run);

const OPTS = { appVersion: "2.1.21", agentVersion: "2.1.21", os: "macOS", now: Date.parse("2026-08-14T02:05:00.000Z") };

describe("osLabel — nhãn THÔ, không phải vân tay", () => {
  it("nhận ra ba hệ điều hành chính", () => {
    expect(osLabel("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)")).toBe("macOS");
    expect(osLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("Windows");
    expect(osLabel("Mozilla/5.0 (X11; Linux x86_64)")).toBe("Linux");
  });
  it("không biết thì nói không biết, KHÔNG đoán bừa", () => {
    expect(osLabel(null)).toBe("không rõ");
    expect(osLabel("")).toBe("không rõ");
  });
  it("KHÔNG trả lại nguyên userAgent (đó là vân tay, không phải chẩn đoán)", () => {
    const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/141.0.0.0";
    expect(osLabel(ua)).toBe("macOS");
    expect(osLabel(ua)).not.toContain("AppleWebKit");
  });
});

describe("buildDiagnosticsText — đủ để dev trả lời", () => {
  const text = buildDiagnosticsText({ run: mkRun(), ...OPTS });

  it("có phiên bản app, phiên bản công cụ local và hệ điều hành", () => {
    expect(text).toContain("Giao diện web: 2.1.21");
    expect(text).toContain("Công cụ local: 2.1.21");
    expect(text).toContain("Hệ điều hành: macOS");
  });

  it("có id lượt chạy và mốc giờ ISO (không nhập nhằng múi giờ)", () => {
    expect(text).toContain("r-0007");
    expect(text).toContain("Bắt đầu: 2026-08-14T02:00:00.000Z");
    expect(text).toContain("Kết thúc: 2026-08-14T02:03:20.000Z");
  });

  it("có failSummary gộp của agent, nguyên văn", () => {
    expect(text).toContain("Tổng kết: 2/2 job không ghi được ảnh");
  });

  it("có errorTail của TỪNG lượt lỗi — đây là thứ khỏi phải đào events.ndjson", () => {
    expect(text).toContain("rc=127");
    expect(text).toContain("- tet-main —");
    expect(text).toContain("- tet-bg-home —");
  });

  it("mất kết nối agent thì NÓI THẬT, không bịa số phiên bản", () => {
    const t = buildDiagnosticsText({ run: mkRun(), ...OPTS, agentVersion: null });
    expect(t).toContain("Công cụ local: không kết nối được");
  });

  it("không có lượt chạy nào vẫn trả chuỗi dùng được", () => {
    const t = buildDiagnosticsText({ run: null, ...OPTS });
    expect(t).toContain("Chưa có lượt chạy nào");
    expect(t).toContain("Giao diện web: 2.1.21");
  });

  it("cắt bớt khi có quá nhiều lượt lỗi — không dán 60 khối vào chat", () => {
    const many = mkRun({
      jobs: Array.from({ length: 12 }, (_, i) => job({ job: `tet-${i}`, diagnosis: "NO_ARTIFACT", errorTail: ["rc=127"] })),
      failSummary: "12/12 job không ghi được ảnh",
    });
    const t = buildDiagnosticsText({ run: many, ...OPTS });
    expect(t).toContain("Lượt lỗi (12)");
    expect(t).toContain("… và 4 lượt lỗi nữa.");
    expect(t).not.toContain("- tet-11 —");
  });
});

describe("HỢP ĐỒNG BẢO MẬT — trần dữ liệu của khối chẩn đoán", () => {
  it("KHÔNG có đường dẫn tuyệt đối do web tự thêm vào", () => {
    const text = buildDiagnosticsText({ run: mkRun(), ...OPTS });
    // `errorTail` đã qua redact của agent; web không được thêm path nào của riêng nó.
    expect(text).not.toMatch(/(^|\s)\/(Users|home|var|private|tmp)\//);
  });

  it("chỉ chép lại errorTail của agent, KHÔNG tự đọc thêm nguồn nào", () => {
    /* Job mang một trường lạ (giả sử bản agent sau này thêm) — nó KHÔNG được rơi vào
       khối text. Trần dữ liệu phải là danh sách CHO PHÉP, không phải "đổ hết ra". */
    const sneaky = mkRun({
      jobs: [job({
        job: "tet-main", diagnosis: "NO_ARTIFACT", errorTail: ["rc=127"],
        ...({ workspacePath: "/Users/ai-do/KitGen", env: { OPENAI_API_KEY: "sk-that" } } as object),
      })],
    });
    const text = buildDiagnosticsText({ run: sneaky, ...OPTS });
    expect(text).not.toContain("/Users/ai-do");
    expect(text).not.toContain("OPENAI_API_KEY");
    expect(text).not.toContain("sk-that");
  });

  it("failSummary trống thì bỏ hẳn dòng, không in 'null'", () => {
    const text = buildDiagnosticsText({ run: mkRun({ failSummary: null }), ...OPTS });
    expect(text).not.toContain("Tổng kết:");
    expect(text).not.toContain("null");
  });
});
