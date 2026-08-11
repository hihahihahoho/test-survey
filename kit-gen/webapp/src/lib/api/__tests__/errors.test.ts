/**
 * Bảng tra cứu lỗi §3.9: phủ đủ mã, copy tiếng Việt sạch thuật ngữ, và LUẬT BẤT DI BẤT DỊCH
 * "không bao giờ hiện message kỹ thuật ra thân UI".
 */
import { describe, expect, it } from "vitest";
import {
  ERROR_TABLE, STATUS_FALLBACK, canonicalCode, devDetails, imageGenReasonText,
  isKnownCode, knownCodes, presentError,
} from "../errors";

/** Mọi mã nêu trong §3.9 + §6.1 phải có entry. Thiếu một mã = user thấy lỗi generic. */
const REQUIRED_CODES = [
  "AGENT_NOT_RUNNING", "AGENT_BLOCKED_BY_BROWSER", "AGENT_PROTOCOL_OLD", "AGENT_PROTOCOL_NEW",
  "ORIGIN_NOT_ALLOWED", "BAD_HOST", "WORKSPACE_CHANGED", "WORKSPACE_UNWRITABLE", "DISK_FULL",
  "CODEX_MISSING", "PY_DEPS_MISSING", "IMAGEGEN_UNAVAILABLE", "QUOTA_SUSPECTED",
  "RUN_CONFLICT", "RUN_ACTIVE", "CONTRACT_CONFLICT", "CONTRACT_INVALID",
  "PROJECT_ID_TAKEN", "PROJECT_BROKEN", "PROJECT_NOT_FOUND", "PROJECT_IN_TRASH",
  "REF_IN_USE", "UNKNOWN_JOB", "TOO_LARGE", "BAD_TYPE",
  "CONFIRM_REQUIRED", "CONFIRM_INVALID", "CONFIRM_LOCKED",
  "IMPORT_INVALID", "LOG_NOT_FOUND", "RATE_LIMITED",
  // mã của §6.2 mà §3.9 không liệt kê riêng nhưng endpoint có trả
  "WORKSPACE_UNKNOWN", "TRASH_NOT_FOUND", "RUN_NOT_FOUND", "RUN_FINISHED",
  "CURSOR_GONE", "KIT_NOT_CUT", "PATH_ESCAPE", "IF_MATCH_REQUIRED",
  "CONTRACT_BROKEN", "INVALID_NAME", "INVALID_SLUG", "NOT_SUPPORTED", "AGENT_STARTING",
];

describe("§3.9 — bảng phủ đủ mã", () => {
  for (const code of REQUIRED_CODES) {
    it(`có entry cho ${code}`, () => {
      expect(isKnownCode(code)).toBe(true);
    });
  }

  it("mọi entry đều có tiêu đề, giải thích và nơi hiện", () => {
    for (const [code, e] of Object.entries(ERROR_TABLE)) {
      expect(e.title, code).toBeTruthy();
      expect(e.explain, code).toBeTruthy();
      expect(e.where.length, code).toBeGreaterThan(0);
      expect(["info", "warn", "danger"], code).toContain(e.severity);
    }
  });

  it("copy KHÔNG chứa thuật ngữ bị cấm hiện ra UI (§1.3)", () => {
    // Danh sách cấm §1.3: contract, job, skel, matte, styleMode, chroma key, blob, bleed,
    // NDJSON, If-Match. Kiểm trên chữ hiện ra, phân biệt hoa thường có chủ đích.
    const banned = [/\bcontract\b/i, /\bjob\b/i, /\bskel\b/i, /\bmatte\b/i, /styleMode/, /chroma/i, /\bblob\b/i, /\bbleed\b/i, /NDJSON/, /If-Match/];
    for (const [code, e] of Object.entries(ERROR_TABLE)) {
      const text = `${e.title} ${e.explain}`;
      for (const re of banned) {
        expect(re.test(text), `${code}: "${text}" chứa thuật ngữ cấm ${re}`).toBe(false);
      }
    }
  });

  it("mã lạ ⇒ entry generic, KHÔNG ném, KHÔNG vỡ UI (§6.5-6)", () => {
    const v = presentError({ code: "MÃ_CHƯA_TỪNG_CÓ" });
    expect(v.known).toBe(false);
    expect(v.title).toBe("Có lỗi từ công cụ local");
    expect(v.actions.some((a) => a.id === "SHOW_DETAILS")).toBe(true);
  });

  it("không có code gì cả ⇒ vẫn trả object dùng được", () => {
    expect(presentError(null).title).toBeTruthy();
    expect(presentError(undefined).title).toBeTruthy();
    expect(presentError({}).title).toBeTruthy();
    expect(presentError("chuỗi lung tung").title).toBeTruthy();
  });
});

describe("LUẬT: message kỹ thuật KHÔNG BAO GIỜ ra thân UI", () => {
  const techy = [
    { code: "AGENT_NOT_RUNNING", message: "TypeError: Failed to fetch" },
    { code: "PROJECT_BROKEN", message: "ENOENT: no such file or directory, open '/Users/x/p.json'" },
    { code: "CONTRACT_CONFLICT", message: "Contract version 37 != 38" },
  ];
  for (const err of techy) {
    it(`không lộ «${err.message.slice(0, 24)}…»`, () => {
      const v = presentError(err);
      expect(JSON.stringify(v)).not.toContain(err.message);
      expect(v).not.toHaveProperty("message");
    });
  }

  it("devDetails LÀ chỗ duy nhất có message — dành cho panel gập", () => {
    const s = devDetails({ code: "CONTRACT_CONFLICT", message: "version 37 != 38", status: 409, url: "/x" });
    expect(s).toContain("version 37 != 38");
    expect(s).toContain("status: 409");
  });

  it("devDetails chịu được envelope lồng và details vòng tham chiếu", () => {
    expect(devDetails({ error: { code: "X", message: "m" } })).toContain("m");
    const circular: Record<string, unknown> = { code: "X" };
    circular.details = circular;
    expect(() => devDetails(circular)).not.toThrow();
  });
});

describe("chuẩn hoá mã & fallback theo status", () => {
  it("alias của client về mã chính", () => {
    expect(canonicalCode("AGENT_OFFLINE")).toBe("AGENT_NOT_RUNNING");
    expect(canonicalCode("network")).toBe("AGENT_NOT_RUNNING");
    expect(canonicalCode("  starting ")).toBe("AGENT_STARTING");
  });
  it("chuỗi rỗng/không phải chuỗi ⇒ null", () => {
    expect(canonicalCode("")).toBeNull();
    expect(canonicalCode(42)).toBeNull();
  });
  it("mọi mã trong STATUS_FALLBACK đều có entry trong bảng", () => {
    for (const [status, code] of Object.entries(STATUS_FALLBACK)) {
      expect(isKnownCode(code), `status ${status} → ${code}`).toBe(true);
    }
  });
  it("phủ đủ mã HTTP của §6.1", () => {
    for (const s of [400, 403, 404, 409, 410, 412, 413, 421, 422, 423, 429, 500, 503]) {
      expect(STATUS_FALLBACK[s], `thiếu fallback cho ${s}`).toBeTruthy();
    }
  });
});

describe("IMAGEGEN_UNAVAILABLE — 7 lý do có copy riêng", () => {
  it("mỗi enum reason cho một câu tiếng Việt khác nhau", () => {
    const reasons = ["NO_CODEX", "NOT_LOGGED_IN", "FEATURE_OFF", "QUOTA", "TIMEOUT", "NO_AUTH_FILE", "UNKNOWN"];
    const texts = reasons.map(imageGenReasonText);
    expect(new Set(texts).size).toBe(reasons.length);
  });
  it("reason lạ ⇒ câu UNKNOWN, không vỡ", () => {
    expect(imageGenReasonText("CÁI_GÌ_ĐÓ")).toBe(imageGenReasonText("UNKNOWN"));
  });
});

describe("details đi kèm để dựng nút hành động", () => {
  it("giữ details của RUN_CONFLICT để có nút [Xem lượt đang chạy]", () => {
    const v = presentError({ code: "RUN_CONFLICT", details: { runId: "r-0031", progress: { done: 3, total: 8 } } });
    expect(v.details).toMatchObject({ runId: "r-0031" });
    expect(v.actions[0]!.id).toBe("VIEW_ACTIVE_RUN");
  });
  it("giữ details của PROJECT_ID_TAKEN để có nút [Dùng tên gợi ý]", () => {
    const v = presentError({ code: "PROJECT_ID_TAKEN", details: { suggestion: "xuan-26-2" } });
    expect(v.details).toMatchObject({ suggestion: "xuan-26-2" });
  });
});

describe("bảng đủ lớn để không phải rơi vào generic thường xuyên", () => {
  it("có ít nhất 40 mã", () => {
    expect(knownCodes().length).toBeGreaterThanOrEqual(40);
  });
});
