/**
 * Tầng TanStack Query: key factory phải phân cấp đúng (nếu không thì `invalidateQueries`
 * trượt và màn hình hiện dữ liệu cũ), chính sách retry phải đúng, và bộ rút gọn event
 * của stream phải cho cùng kết quả với poll.
 */
import { describe, expect, it } from "vitest";
import { keysAfterContractSave, keysAfterRun, qk } from "../keys";
import { GC, STALE, shouldRetry } from "../query-client";
import { applyEvent } from "../use-runs";
import { AgentError } from "../../api/client";
import { runSchema, type Run, type StreamEvent } from "../../types/api";

/** So khớp tiền tố như `invalidateQueries` của TanStack Query làm. */
const isPrefixOf = (prefix: readonly unknown[], key: readonly unknown[]) =>
  prefix.every((v, i) => JSON.stringify(v) === JSON.stringify(key[i]));

describe("query key factory — phân cấp để invalidate theo TẦNG", () => {
  it("projects.all() phủ cả list lẫn detail", () => {
    expect(isPrefixOf(qk.projects.all(), qk.projects.list({ q: "tet" }))).toBe(true);
    expect(isPrefixOf(qk.projects.all(), qk.projects.detail("p1"))).toBe(true);
  });

  it("projects.lists() phủ MỌI bộ lọc — đổi tên xong là mọi danh sách đều cũ", () => {
    for (const p of [{}, { q: "tet" }, { tag: "banking" }, { sort: "name" }]) {
      expect(isPrefixOf(qk.projects.lists(), qk.projects.list(p))).toBe(true);
    }
  });

  it("projects.lists() KHÔNG phủ detail (và ngược lại) — tránh invalidate thừa", () => {
    expect(isPrefixOf(qk.projects.lists(), qk.projects.detail("p1"))).toBe(false);
    expect(isPrefixOf(qk.projects.details(), qk.projects.list({}))).toBe(false);
  });

  it("key của list ổn định theo THAM SỐ, không theo thứ tự khai", () => {
    expect(qk.projects.list({ q: "a", tag: "b" })).toEqual(qk.projects.list({ tag: "b", q: "a" }));
    expect(qk.projects.list({})).toEqual(qk.projects.list({ q: "", tag: "", sort: "" }));
  });

  it("detail của hai project khác nhau là hai key khác nhau", () => {
    expect(qk.projects.detail("a")).not.toEqual(qk.projects.detail("b"));
  });

  it("contract.all(id) phủ current + history + snapshot", () => {
    expect(isPrefixOf(qk.contract.all("p1"), qk.contract.current("p1"))).toBe(true);
    expect(isPrefixOf(qk.contract.all("p1"), qk.contract.history("p1"))).toBe(true);
    expect(isPrefixOf(qk.contract.all("p1"), qk.contract.snapshot("p1", "2026-08-05T101233Z"))).toBe(true);
  });

  it("contract của project khác KHÔNG bị cuốn theo", () => {
    expect(isPrefixOf(qk.contract.all("p1"), qk.contract.current("p2"))).toBe(false);
  });

  it("runs.detail phủ log và prompt của chính run đó", () => {
    expect(isPrefixOf(qk.runs.detail("r-1"), qk.runs.jobLog("r-1", "tet-main"))).toBe(true);
    expect(isPrefixOf(qk.runs.detail("r-1"), qk.runs.jobPrompt("r-1", "tet-main"))).toBe(true);
    expect(isPrefixOf(qk.runs.detail("r-1"), qk.runs.jobLog("r-2", "tet-main"))).toBe(false);
  });

  it("kit.all(id) phủ mọi phong cách", () => {
    expect(isPrefixOf(qk.kit.all("p1"), qk.kit.variant("p1", "tet"))).toBe(true);
    expect(isPrefixOf(qk.kit.all("p1"), qk.kit.variant("p1"))).toBe(true);
  });
});

describe("gom key phải invalidate sau mỗi loại thao tác", () => {
  it("sau một lượt chạy: project detail + list + runs + kit đều cũ", () => {
    const keys = keysAfterRun("p1");
    expect(keys).toContainEqual(qk.projects.detail("p1"));
    expect(keys).toContainEqual(qk.projects.lists());
    expect(keys).toContainEqual(qk.runs.ofProject("p1"));
    expect(keys).toContainEqual(qk.kit.all("p1"));
  });

  /* Bug 07/09/2026 — thanh «Hạn mức Codex» đứng im cả ngày. Mỗi tấm vừa vẽ là một lượt
     hỏi đã tiêu, nhưng không nơi nào bảo `qk.usage()` là nó đã cũ, nên con số chỉ đổi
     khi người dùng đăng nhập lại. Cổng này giữ dòng đó nằm nguyên trong danh sách. */
  it("sau một lượt chạy: HẠN MỨC Codex cũng cũ — nó vừa bị tiêu chính bởi lượt vừa rồi", () => {
    expect(keysAfterRun("p1")).toContainEqual(qk.usage());
  });

  it("sau khi lưu thiết kế: contract + project (version/stale đổi)", () => {
    const keys = keysAfterContractSave("p1");
    expect(keys).toContainEqual(qk.contract.all("p1"));
    expect(keys).toContainEqual(qk.projects.detail("p1"));
    expect(keys).toContainEqual(qk.projects.lists());
  });
});

describe("chính sách retry ở tầng Query", () => {
  const agentErr = (code: string, status = 0) =>
    new AgentError({ code, status, transport: status > 0 ? "http-error" : "unreachable" });

  it("retry tối đa 1 lần (§6.1)", () => {
    expect(shouldRetry(0, agentErr("AGENT_INTERNAL", 500))).toBe(true);
    expect(shouldRetry(1, agentErr("AGENT_INTERNAL", 500))).toBe(false);
  });

  it("KHÔNG retry lỗi mà thử lại chắc chắn ra kết quả cũ", () => {
    for (const code of [
      "ORIGIN_NOT_ALLOWED", "BAD_HOST", "CONTRACT_CONFLICT", "RUN_CONFLICT",
      "PROJECT_NOT_FOUND", "PROJECT_IN_TRASH", "UNKNOWN_JOB", "TOO_LARGE",
      "AGENT_PROTOCOL_OLD", "IF_MATCH_REQUIRED",
    ]) {
      expect(shouldRetry(0, agentErr(code, 409)), code).toBe(false);
    }
  });

  it("KHÔNG retry 4xx thường, CÓ retry 429 và 5xx", () => {
    expect(shouldRetry(0, agentErr("NOT_FOUND", 404))).toBe(false);
    expect(shouldRetry(0, agentErr("RATE_LIMITED", 429))).toBe(true);
    expect(shouldRetry(0, agentErr("AGENT_INTERNAL", 503))).toBe(true);
  });

  it("CÓ retry lỗi mạng (agent có thể vừa khởi động lại)", () => {
    expect(shouldRetry(0, agentErr("AGENT_NOT_RUNNING", 0))).toBe(true);
  });

  it("lỗi không phải AgentError vẫn được thử lại 1 lần", () => {
    expect(shouldRetry(0, new Error("lạ"))).toBe(true);
    expect(shouldRetry(1, new Error("lạ"))).toBe(false);
  });
});

describe("staleTime — doctor KHÔNG được poll (§6.2)", () => {
  it("doctor cache ít nhất 60s", () => {
    expect(STALE.doctor).toBeGreaterThanOrEqual(60_000);
  });
  it("run đang chạy luôn coi là cũ (nguồn thật là stream/poll)", () => {
    expect(STALE.runActive).toBe(0);
  });
  it("elementLib cache dài (catalogue chỉ đọc)", () => {
    expect(STALE.elementLib).toBeGreaterThanOrEqual(60 * 60_000);
  });
  it("gcTime của projects đủ dài để §2.5 vẽ được từ cache khi agent tắt", () => {
    expect(GC.projects).toBeGreaterThanOrEqual(10 * 60_000);
  });
});

describe("applyEvent — stream và poll phải cho CÙNG hình dạng dữ liệu (chốt X10)", () => {
  const base: Run = runSchema.parse({
    id: "r-0032", projectId: "p1", kind: "gen", status: "running",
    progress: { done: 0, total: 2, failed: 0 },
    jobs: [
      { job: "tet-main", variant: "tet", sheet: "main", status: "queued" },
      { job: "vang-main2", variant: "vang", sheet: "main2", status: "queued" },
    ],
    seq: 0,
  });

  it("job.started ⇒ đúng lượt đó thành running, lượt khác không đụng tới", () => {
    const ev = { seq: 402, type: "job.started", job: "tet-main" } as StreamEvent;
    const r = applyEvent(base, ev);
    expect(r.jobs[0]!.status).toBe("running");
    expect(r.jobs[1]!.status).toBe("queued");
    expect(r.seq).toBe(402);
  });

  it("job.done mang theo chẩn đoán để dòng lượt lỗi có 1 câu giải thích", () => {
    const ev = { seq: 405, type: "job.done", job: "vang-main2", status: "failed", diagnosis: "QUOTA_SUSPECTED" } as StreamEvent;
    const r = applyEvent(base, ev);
    expect(r.jobs[1]!.status).toBe("failed");
    expect(r.jobs[1]!.diagnosis).toBe("QUOTA_SUSPECTED");
  });

  it("progress cập nhật đủ 4 số kể cả ETA null", () => {
    const r = applyEvent(base, { seq: 407, type: "progress", done: 3, total: 8, failed: 1, etaSeconds: 132 } as StreamEvent);
    expect(r.progress).toEqual({ done: 3, total: 8, failed: 1, etaSeconds: 132 });
    const r2 = applyEvent(base, { seq: 408, type: "progress", done: 1, total: 8, failed: 0 } as StreamEvent);
    expect(r2.progress.etaSeconds).toBeNull();
  });

  it("phase.changed ⇒ pha 2 (cắt) hiện được (chốt X9)", () => {
    const r = applyEvent(base, { seq: 406, type: "phase.changed", phase: { index: 2, total: 2, name: "slice" } } as StreamEvent);
    expect(r.phase).toEqual({ index: 2, total: 2, name: "slice" });
  });

  it("sheet.ready gắn artifact vào job GIỮA lượt — ô 'Đã xong' hết đen", () => {
    const ev = {
      seq: 406, type: "sheet.ready", job: "vang-main2", variant: "vang", sheet: "main2",
      artifact: { path: "raw/vang-main2.png", bytes: 12345 },
      sliced: { ok: true, durationMs: 900 },
    } as StreamEvent;
    const r = applyEvent(base, ev);
    expect(r.jobs[1]!.artifact).toEqual({ path: "raw/vang-main2.png", bytes: 12345 });
    expect(r.jobs[0]!.artifact).toBe(base.jobs[0]!.artifact);
    expect(r.seq).toBe(406);
  });

  /* NHỊP 1 CỦA CHU TRÌNH PER-SHEET (25/08).
     `sheet.image` tới NGAY khi engine ghi xong ảnh; `sheet.ready` chỉ tới sau khi tấm đó
     đã được cắt — và tấm sau còn phải xếp hàng sau tấm trước. Đo trên lượt thật: khoảng
     cách giữa hai nhịp là vài giây tới vài chục giây, và trước bản này TOÀN BỘ quãng đó
     là ô đen "Đã xong" (web đọc `job.artifact.path`, mà ô đó chỉ được điền ở nhịp 2).
     Ba ca dưới khoá: nhịp 1 đủ để hiện ảnh, nhịp 2 áp lên không xoá gì, và nhịp 2 thiếu
     artifact cũng không được làm ô đang có ảnh đen lại. */
  it("sheet.image gắn artifact NGAY — không đợi cắt xong", () => {
    const ev = {
      seq: 410, type: "sheet.image", job: "vang-main2", variant: "vang", sheet: "main2",
      artifact: { path: "runs/r1/artifacts/vang-main2.png", bytes: 999 },
    } as StreamEvent;
    const r = applyEvent(base, ev);
    expect(r.jobs[1]!.artifact).toEqual({ path: "runs/r1/artifacts/vang-main2.png", bytes: 999 });
    expect(r.jobs[0]!.artifact).toBe(base.jobs[0]!.artifact);
    expect(r.seq).toBe(410);
    // thuần khiết y như mọi nhánh khác — React cần tham chiếu mới
    expect(r).not.toBe(base);
    expect(base.jobs[1]!.artifact ?? null).toBe(null);
  });

  it("sheet.ready đi sau sheet.image là phép gán TRÙNG, không lật ngược gì", () => {
    const path = "runs/r1/artifacts/vang-main2.png";
    const a = applyEvent(base, {
      seq: 410, type: "sheet.image", job: "vang-main2", artifact: { path, bytes: 999 },
    } as StreamEvent);
    const b = applyEvent(a, {
      seq: 411, type: "sheet.ready", job: "vang-main2", artifact: { path, bytes: 999 },
      sliced: { ok: true, durationMs: 900 },
    } as StreamEvent);
    expect(b.jobs[1]!.artifact).toEqual({ path, bytes: 999 });
    expect(b.seq).toBe(411);
  });

  it("nhịp 2 KHÔNG mang artifact ⇒ giữ ảnh nhịp 1, không để ô đang có ảnh đen lại", () => {
    const path = "runs/r1/artifacts/vang-main2.png";
    const a = applyEvent(base, {
      seq: 410, type: "sheet.image", job: "vang-main2", artifact: { path, bytes: 999 },
    } as StreamEvent);
    const b = applyEvent(a, { seq: 412, type: "sheet.ready", job: "vang-main2" } as StreamEvent);
    expect(b.jobs[1]!.artifact).toEqual({ path, bytes: 999 });
  });

  it("event LẠ không làm hỏng run đang có", () => {
    const r = applyEvent(base, { seq: 999, type: "chưa.biết" } as StreamEvent);
    expect(r).toEqual(base);
  });

  it("thuần khiết — KHÔNG sửa object gốc (React cần tham chiếu mới để re-render)", () => {
    const before = JSON.stringify(base);
    const r = applyEvent(base, { seq: 402, type: "job.started", job: "tet-main" } as StreamEvent);
    expect(JSON.stringify(base)).toBe(before);
    expect(r).not.toBe(base);
    expect(r.jobs).not.toBe(base.jobs);
  });

  it("job không có trong run ⇒ bỏ qua, không tạo dòng ma", () => {
    const r = applyEvent(base, { seq: 402, type: "job.started", job: "khong-co" } as StreamEvent);
    expect(r.jobs).toHaveLength(2);
    expect(r.jobs.every((j) => j.status === "queued")).toBe(true);
  });
});
