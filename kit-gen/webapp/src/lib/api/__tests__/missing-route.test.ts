import { describe, expect, it } from "vitest";
import { presentError } from "../errors";

/* 30/09/2026: web dev gọi «Lưu làm template» vào agent dev khởi động từ 21/09 ⇒ 404
   «no route for …» hiện thành «Không tìm thấy thứ bạn cần / dữ liệu có thể đã bị xoá». */
describe("404 «no route» = agent cũ hơn giao diện", () => {
  it("đọc thành AGENT_FEATURE_MISSING, chỉ đường cập nhật", () => {
    const p = presentError({ code: "NOT_FOUND", status: 404, message: "no route for POST /api/projects/x/save-template" });
    expect(p.code).toBe("AGENT_FEATURE_MISSING");
    expect(p.known).toBe(true);
    expect(p.explain).toContain("Cập nhật");
  });
  it("404 thường (dữ liệu vắng) giữ nguyên NOT_FOUND", () => {
    expect(presentError({ code: "NOT_FOUND", status: 404, message: "project abc not found" }).code).toBe("NOT_FOUND");
  });
  it("mã 404 có nghĩa riêng không bị đổi", () => {
    expect(presentError({ code: "TEMPLATE_NOT_FOUND", status: 404, message: "no route for x" }).code).toBe("TEMPLATE_NOT_FOUND");
  });
});
