/**
 * MỘT CỬA VÀO MỘT BỘ KIT — khoá lại việc app chỉ còn đúng một đường tới màn làm việc.
 *
 * 08/09/2026 — ba ca cũ đi cùng đợt dọn: `/k/:id/form` (stub của form 4 trang) đã gộp
 * vào `/p/$`, còn `AppBreadcrumb` và `ProjectJump` bị xoá — cả hai đều không có chỗ
 * gọi nào từ đợt gỡ rail. Cái ca này còn hỏi là câu đáng hỏi nhất và cũng là câu duy
 * nhất còn kiểm được: đường vào có đúng MỘT, và nó không đi vòng qua `/p/**`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { routeTree } from "../../routeTree";
import { readMode } from "@/features/kitfile";

const paths = () => JSON.stringify(routeTree).replaceAll("\\/", "/");

describe("route wiring — một màn làm việc, một tấm biển chỉ đường", () => {
  it("đăng ký khu soạn và ĐÚNG MỘT stub cho mọi địa chỉ đời cũ", () => {
    const p = paths();
    expect(p).toContain("/k/$projectId");
    expect(p).toContain("/p/$");
    /* Bảy stub `/p/:id/**` + ba stub `/k/:id/*` đã gộp; không được mọc lại. */
    expect(p).not.toContain("/k/$projectId/");
    expect(p).not.toContain("/p/$projectId");
  });

  it("mặc định hình thái bộ kit về `workflow` khi tag thiếu hoặc mâu thuẫn", () => {
    expect(readMode({ tags: [] })).toBe("workflow");
    expect(readMode({ tags: ["kg-workflow", "kg-canvas"] })).toBe("workflow");
    expect(readMode({ tags: ["kg-canvas"] })).toBe("canvas");
  });

  it("route khu soạn KHÔNG còn trỏ về địa chỉ đời cũ nào", () => {
    const kitRoute = readFileSync(resolve(__dirname, "../k.$projectId.tsx"), "utf8");
    expect(kitRoute).not.toContain('to: "/p/');
    expect(kitRoute).toContain('path: "/k/$projectId"');
  });
});
