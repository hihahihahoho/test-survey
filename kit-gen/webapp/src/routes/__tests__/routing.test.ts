/**
 * Test lớp ĐIỀU HƯỚNG — thuần logic, không cần DOM.
 *
 * GHI CHÚ CHẠY TEST: `vitest.config.ts` (của R0) mới chỉ include
 * `src/lib/**\/__tests__`. Tôi không sửa file của team khác, nên chạy bằng:
 *     npx vitest run --dir src/routes
 * Đã ghi yêu cầu mở rộng `include` ở teams/react/NEEDS-appshell.md (N1).
 */
import { describe, expect, it, beforeEach } from "vitest";
import { parseProjectParams, parseRunParams } from "../params";
import {
  designSearchSchema, kitSearchSchema, settingsSearchSchema, setupSearchSchema,
} from "../search-schemas";
import { requireSetup } from "../guards";
import { useSetupStore } from "@/lib/store";
import { isRedirect } from "@tanstack/react-router";

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
    expect(settingsSearchSchema.parse({ tab: "trash" }).tab).toBe("trash");
  });
});

describe("setup ?redirect= — chặn open-redirect ra ngoài", () => {
  it("nhận đường dẫn nội bộ", () => {
    expect(setupSearchSchema.parse({ redirect: "/p/tet26-a7f3/design" }).redirect).toBe(
      "/p/tet26-a7f3/design",
    );
  });

  it.each([
    ["URL tuyệt đối", "https://evil.example/"],
    ["giao thức tương đối", "//evil.example/"],
    ["javascript:", "javascript:alert(1)"],
  ])("bỏ qua %s", (_l, value) => {
    // `.catch(undefined)` ⇒ giá trị xấu bị loại, KHÔNG ném lỗi làm hỏng /setup
    expect(setupSearchSchema.parse({ redirect: value }).redirect).toBeUndefined();
  });
});

describe("guard — chưa setup xong thì ép về /setup", () => {
  beforeEach(() => {
    useSetupStore.setState({ completed: false });
  });

  /* Hình dạng của `redirect()` ĐƯỢC ĐO chứ không đoán: object trả về chỉ có
     đúng một khoá `options`, mọi thứ (to/search/replace/statusCode) nằm trong
     đó. Bản test đầu tôi viết `thrown.to` và nó FAIL — giữ lại ghi chú này để
     người sau không mất công tìm lại. */
  it("chưa xong ⇒ ném redirect tới /setup, có nhớ chỗ định tới", () => {
    let thrown: unknown = null;
    try {
      requireSetup("/p/tet26-a7f3/design");
    } catch (e) {
      thrown = e;
    }
    expect(isRedirect(thrown)).toBe(true);
    const opts = (thrown as { options: { to?: string; search?: { redirect?: string }; replace?: boolean } }).options;
    expect(opts.to).toBe("/setup");
    expect(opts.search?.redirect).toBe("/p/tet26-a7f3/design");
    // `replace` để nút Back không đá user ngược vào trang bị chặn
    expect(opts.replace).toBe(true);
  });

  it("đã xong ⇒ đi tiếp, không ném gì", () => {
    useSetupStore.setState({ completed: true });
    expect(() => requireSetup("/p/tet26-a7f3")).not.toThrow();
  });

  it("từ trang chủ thì không nhét redirect='/' vô nghĩa", () => {
    let thrown: unknown = null;
    try {
      requireSetup("/");
    } catch (e) {
      thrown = e;
    }
    expect((thrown as { options: { search?: Record<string, unknown> } }).options.search).toEqual({});
  });
});
