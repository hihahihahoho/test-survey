/**
 * Test lớp ĐIỀU HƯỚNG — thuần logic, không cần DOM.
 *
 * 07/09/2026 — hai describe cuối đi cùng đợt dọn mã chết: `setupSearchSchema`
 * (`?redirect=` của `/setup`) và `requireSetup` không còn tồn tại.
 * 08/09/2026 — `parseRunParams`, `designSearchSchema`, `kitSearchSchema` đi cùng
 * bảy route `/p/**`; chỉ còn `/settings` có `?tab=`.
 */
import { describe, expect, it } from "vitest";
import { parseProjectParams } from "../params";
import { kitCanvasSearchSchema, settingsSearchSchema } from "../search-schemas";

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
});

describe("search schema — giá trị lạ rơi về mặc định, KHÔNG ném lỗi làm trắng màn", () => {
  it("thiếu tab ⇒ tab mặc định", () => {
    expect(settingsSearchSchema.parse({}).tab).toBe("agent");
  });

  it("tab lạ ⇒ tab đầu (link cũ vẫn mở được)", () => {
    expect(settingsSearchSchema.parse({ tab: "khong-co" }).tab).toBe("agent");
    expect(settingsSearchSchema.parse({ tab: null }).tab).toBe("agent");
    expect(settingsSearchSchema.parse({ tab: "trash" }).tab).toBe("agent");
  });

  it("tab hợp lệ được giữ nguyên", () => {
    expect(settingsSearchSchema.parse({ tab: "prefs" }).tab).toBe("prefs");
  });

  it("`?settings=` đời cũ vẫn mở dialog; giá trị lạ ⇒ đóng", () => {
    expect(kitCanvasSearchSchema.parse({ settings: "requirements" }).settings).toBe("requirements");
    expect(kitCanvasSearchSchema.parse({ settings: "bịa" }).settings).toBeUndefined();
    expect(kitCanvasSearchSchema.parse({}).settings).toBeUndefined();
  });
});
