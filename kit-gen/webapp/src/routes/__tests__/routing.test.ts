/**
 * Test lớp ĐIỀU HƯỚNG — thuần logic, không cần DOM.
 *
 * GHI CHÚ CHẠY TEST: `vitest.config.ts` (của R0) mới chỉ include
 * `src/lib/**\/__tests__`. Tôi không sửa file của team khác, nên chạy bằng:
 *     npx vitest run --dir src/routes
 * Đã ghi yêu cầu mở rộng `include` ở teams/react/NEEDS-appshell.md (N1).
 *
 * 07/09/2026 — hai describe cuối đi cùng đợt dọn mã chết: `setupSearchSchema`
 * (`?redirect=` của `/setup`) và `requireSetup` không còn tồn tại — route `/setup`
 * lẫn hàm guard rỗng đều đã bị xoá, nên không còn gì để khoá.
 */
import { describe, expect, it } from "vitest";
import { parseProjectParams, parseRunParams } from "../params";
import {
  designSearchSchema, kitSearchSchema, settingsSearchSchema,
} from "../search-schemas";

describe("params — id sai dạng phải KHÔNG khớp route (⇒ 404), không lọt sang agent", () => {
  it("nhận id hợp lệ", () => {
    expect(parseProjectParams({ projectId: "tet26-vietinbank-a7f3" })).toEqual({
      projectId: "tet26-vietinbank-a7f3",
    });
  });

  it.each([
    ["rỗng", ""],
    ["quá ngắn", "ab"],
    ["chữ hoa", "Tet26"],
    ["path traversal", "../../etc/passwd"],
    ["có dấu chấm", "a.b.c"],
    ["khoảng trắng", "tet 26"],
  ])("từ chối %s", (_label, id) => {
    expect(parseProjectParams({ projectId: id })).toBe(false);
  });

  it("runId phải đúng dạng r-NNNN", () => {
    expect(parseRunParams({ projectId: "tet26-a7f3", runId: "r-0031" })).toEqual({
      projectId: "tet26-a7f3",
      runId: "r-0031",
    });
    expect(parseRunParams({ projectId: "tet26-a7f3", runId: "0031" })).toBe(false);
    expect(parseRunParams({ projectId: "BAD", runId: "r-0031" })).toBe(false);
  });
});

describe("search schema — tab lạ rơi về tab đầu, KHÔNG ném lỗi làm trắng màn", () => {
  it("thiếu tab ⇒ tab mặc định", () => {
    expect(designSearchSchema.parse({}).tab).toBe("sheets");
    expect(kitSearchSchema.parse({}).tab).toBe("assets");
    expect(settingsSearchSchema.parse({}).tab).toBe("agent");
  });

  it("tab lạ ⇒ tab đầu (link cũ vẫn mở được)", () => {
    expect(designSearchSchema.parse({ tab: "khong-co" }).tab).toBe("sheets");
    expect(kitSearchSchema.parse({ tab: 42 }).tab).toBe("assets");
    expect(settingsSearchSchema.parse({ tab: null }).tab).toBe("agent");
  });

  it("tab hợp lệ được giữ nguyên", () => {
    expect(designSearchSchema.parse({ tab: "styles" }).tab).toBe("styles");
    expect(settingsSearchSchema.parse({ tab: "prefs" }).tab).toBe("prefs");
    expect(settingsSearchSchema.parse({ tab: "trash" }).tab).toBe("agent");
  });
});
