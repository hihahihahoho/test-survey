/**
 * FE-2 §3-A2 #6 — CATCH-ALL PHẢI TÁCH THEO NGUYÊN NHÂN.
 *
 * Trước FE-2, bốn nguyên nhân (agent hỏng · agent trả thứ không đọc được · yêu cầu chưa gửi
 * được · xung đột trạng thái) rơi chung vào `AGENT_INTERNAL` ⇒ 49 điểm hiển thị đọc cùng một
 * câu kèm cùng một nút. Bộ test này khoá lại điều ngược lại: **mỗi nguyên nhân một title và
 * một bộ action phân biệt được**, và thân UI vẫn tuyệt đối không chứa `error.message`.
 */
import { describe, expect, it } from "vitest";
import { AgentError } from "../client";
import { ERROR_TABLE, STATUS_FALLBACK, presentError, refineCatchAll } from "../errors";

/** Dựng lỗi y như `client.ts` ném ra khi agent trả mã ≥400 kèm envelope. */
const httpErr = (status: number, code?: string, message = "boom at /Users/an/secret/path") =>
  new AgentError({ ...(code ? { code } : {}), message, status, transport: "http-error" });

/** Dựng lỗi y như `endpoints.ts:parse()` ném khi zod trượt. */
const schemaErr = () =>
  new AgentError({
    code: "AGENT_INTERNAL",
    message: 'Dữ liệu projects không đúng schema: [{"path":["items",0,"id"]}]',
    transport: "client",
    details: { what: "projects", issues: [{ code: "invalid_type", path: ["items", 0, "id"] }] },
  });

/** Dựng lỗi y như `client.ts:transportError()` khi fetch reject. */
const unreachableErr = () =>
  new AgentError({
    code: "AGENT_NOT_RUNNING", message: "TypeError: Failed to fetch",
    status: 0, transport: "unreachable",
  });

describe("#6 — bốn nguyên nhân ra bốn copy khác nhau", () => {
  const cases = {
    "agent hỏng khi xử lý (500 có response)": httpErr(500),
    "agent trả thứ không đọc được (schema)": schemaErr(),
    "yêu cầu chưa gửi được (client tự dựng)":
      new AgentError({ code: "AGENT_INTERNAL", message: "fetch không khả dụng", transport: "client" }),
    "xung đột trạng thái (409 trần)": httpErr(409),
  };

  it("mỗi ca ra một MÃ khác nhau", () => {
    const codes = Object.values(cases).map((e) => presentError(e).code);
    expect(new Set(codes).size, `trùng mã: ${codes.join(", ")}`).toBe(4);
  });

  it("mỗi ca ra một TIÊU ĐỀ khác nhau — không còn câu dùng chung", () => {
    const titles = Object.values(cases).map((e) => presentError(e).title);
    expect(new Set(titles).size, `trùng title: ${titles.join(" | ")}`).toBe(4);
  });

  it("HÀNH ĐỘNG khác nhau: ca vô ích khi retry thì KHÔNG mời [Thử lại] trước tiên", () => {
    // 409 và schema-fail: thử lại mù chắc chắn hỏng y như cũ ⇒ hành động đầu phải là tải lại.
    for (const err of [httpErr(409), schemaErr()]) {
      const v = presentError(err);
      expect(v.actions[0]!.id, v.code).toBe("RELOAD_DATA");
    }
    // 500 và "chưa gửi được": thử lại là việc đúng ⇒ hành động đầu là [Thử lại].
    const notSent = new AgentError({ code: "AGENT_INTERNAL", message: "x", transport: "unreachable" });
    for (const err of [httpErr(500), notSent]) {
      expect(presentError(err).actions[0]!.id).toBe("RETRY");
    }
    // Ngược lại: lỗi ĐÃ có chẩn đoán riêng (agent chưa chạy) giữ nguyên hành động của nó,
    // refineCatchAll không được lấn sang. Đây là hàng rào chống "sửa một chỗ hỏng chỗ khác".
    expect(presentError(unreachableErr()).actions[0]!.id).toBe("COPY_RUN_CMD");
  });

  it("ca «chưa gửi được» PHẢI trấn an rằng chưa có gì thay đổi (khác hẳn ca 500 dở dang)", () => {
    const v = presentError(new AgentError({ code: "AGENT_INTERNAL", message: "x", transport: "timeout" }));
    expect(v.code).toBe("REQUEST_NOT_SENT");
    expect(v.explain).toContain("chưa");
    // ...còn ca 500 thì KHÔNG được hứa như vậy, vì agent đã bắt tay vào làm.
    expect(presentError(httpErr(500)).explain).not.toContain("chưa có gì");
  });
});

describe("refineCatchAll — chỉ động vào catch-all, không viết lại chẩn đoán tầng dưới", () => {
  it("mã ĐÃ CÓ NGHĨA giữ nguyên, kể cả khi status là 409", () => {
    for (const code of ["RUN_CONFLICT", "CONTRACT_CONFLICT", "PROJECT_BROKEN", "AGENT_NOT_RUNNING"]) {
      expect(refineCatchAll(code, httpErr(409, code))).toBe(code);
    }
  });
  it("409 CÓ mã cụ thể vẫn ra mã đó, không bị hạ về STATE_CONFLICT", () => {
    expect(presentError(httpErr(409, "CONTRACT_CONFLICT")).code).toBe("CONTRACT_CONFLICT");
  });
  it("409 TRẦN (không envelope) mới thành STATE_CONFLICT", () => {
    expect(STATUS_FALLBACK[409]).toBe("STATE_CONFLICT");
  });
  it("500 vẫn là AGENT_INTERNAL — không đổi nghĩa mã cũ", () => {
    expect(STATUS_FALLBACK[500]).toBe("AGENT_INTERNAL");
  });
  it("lỗi không phải object / không có gì để suy ⇒ không ném", () => {
    expect(() => refineCatchAll("AGENT_INTERNAL", null)).not.toThrow();
    expect(refineCatchAll("AGENT_INTERNAL", null)).toBe("AGENT_INTERNAL");
    expect(refineCatchAll("AGENT_INTERNAL", "chuỗi")).toBe("AGENT_INTERNAL");
  });
});

describe("ba mã mới vẫn tuân luật §3.9 như mọi entry khác", () => {
  const NEW = ["AGENT_BAD_RESPONSE", "REQUEST_NOT_SENT", "STATE_CONFLICT"] as const;

  it("có mặt trong bảng, đủ title/explain/where/severity", () => {
    for (const c of NEW) {
      const e = ERROR_TABLE[c];
      expect(e, c).toBeTruthy();
      expect(e!.title, c).toBeTruthy();
      expect(e!.explain, c).toBeTruthy();
      expect(e!.where.length, c).toBeGreaterThan(0);
    }
  });

  it("KHÔNG lộ message kỹ thuật ra object hiển thị", () => {
    for (const err of [schemaErr(), httpErr(500), httpErr(409), unreachableErr()]) {
      const v = presentError(err);
      expect(JSON.stringify(v)).not.toContain("/Users/an");
      expect(JSON.stringify(v)).not.toContain("schema");
      expect(v).not.toHaveProperty("message");
    }
  });

  it("copy không chứa thuật ngữ bị cấm §1.3", () => {
    const banned = [/\bschema\b/i, /\bparse\b/i, /\bfetch\b/i, /\bjson\b/i, /\bHTTP\b/, /\b409\b/, /zod/i, /\bcontract\b/i];
    for (const c of NEW) {
      const text = `${ERROR_TABLE[c]!.title} ${ERROR_TABLE[c]!.explain}`;
      for (const re of banned) expect(re.test(text), `${c}: "${text}" vi phạm ${re}`).toBe(false);
    }
  });
});
