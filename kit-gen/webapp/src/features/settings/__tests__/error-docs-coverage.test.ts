/**
 * BẢNG LỖI ↔ TRANG TRỢ GIÚP — mã nào màn hình nói ra thì trang «Mã lỗi» phải giải thích được.
 *
 * `missingDocEntries()` được viết ra đúng để bắt "R0 thêm mã mới mà trang trợ giúp không
 * theo"; ca này là chỗ nó thật sự được gọi. Hai mã của phiên sửa template có ca riêng: chúng
 * được hiện ra từ MỘT màn duy nhất (màn soạn ở chế độ sửa template), nên nếu thiếu thì chỉ
 * lộ ra khi người dùng đã ở đúng tình huống khó hiểu nhất — phiên vừa biến mất dưới tay họ.
 */
import { describe, expect, it } from "vitest";
import { ERROR_TABLE, presentError } from "@/lib/api/errors";
import { docEntry, missingDocEntries } from "../errors/catalog";

describe("bảng lỗi và trang trợ giúp đi cùng nhau", () => {
  it("không mã nào trong bảng lỗi thiếu mục giải thích", () => {
    expect(missingDocEntries()).toEqual([]);
  });

  for (const code of ["TEMPLATE_EDIT_NOT_FOUND", "TEMPLATE_EDIT_NO_RUN"] as const) {
    it(`${code}: có chữ riêng trong bảng lỗi VÀ có mục ở trang trợ giúp`, () => {
      expect(ERROR_TABLE[code]).toBeTruthy();
      const v = presentError({ code });
      expect(v.known).toBe(true);
      expect(v.title).not.toBe("Có lỗi từ công cụ local");
      const doc = docEntry(code);
      expect(doc?.why).toBeTruthy();
      expect(doc?.fix.length).toBeGreaterThan(0);
    });
  }

  it("phiên sửa mất (404) chỉ đường về «Template dự án», không mời thử lại", () => {
    const v = presentError({ code: "TEMPLATE_EDIT_NOT_FOUND", status: 404 });
    expect(v.explain).toContain("Template dự án");
    expect(v.actions.some((a) => a.id === "RETRY")).toBe(false);
  });
});
