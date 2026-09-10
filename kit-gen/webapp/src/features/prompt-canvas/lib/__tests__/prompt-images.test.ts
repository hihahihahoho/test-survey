import { describe, expect, it } from "vitest";
import type { PromptPreviewImage } from "@/lib/types/api";
import { roleLabel, sheetImages, shortName } from "../prompt-images";

/**
 * ẢNH ĐI KÈM MỘT TẤM — ba thứ mà hỏng thì màn hình nói dối trong im lặng.
 *
 * Chủ sản phẩm mở xem trước prompt của một thẻ: *"đúng rồi prompt thiếu cái hiển
 * thị ảnh này"*. Khối ảnh bày ra mấy ô vuông giống hệt nhau với tên file bị cắt
 * cụt, nên không ô nào trả lời được câu «tấm nào là ảnh nhân vật của tôi».
 */

const img = (over: Partial<PromptPreviewImage>): PromptPreviewImage => ({
  path: "refs/lan.png", role: "character", ...over,
});

describe("vai của một ảnh nói bằng chữ người dùng nhận ra", () => {
  it("năm vai của engine có năm cái tên tiếng Việt", () => {
    expect(["character", "pose", "style", "brand", "layout"].map(roleLabel))
      .toEqual(["Nhân vật", "Dáng", "Phong cách", "Thương hiệu", "Bố cục"]);
  });

  /* Engine trên máy người dùng cập nhật bằng một lượt RIÊNG với webapp, nên một
     vai mới sẽ tới đây trước khi có ai dịch nó. Rơi về chữ trung tính, KHÔNG hiện
     khoá tiếng Anh của engine ra mặt người dùng (§5.4). */
  it("vai lạ / vai trống rơi về một chữ trung tính, không lộ khoá của engine", () => {
    expect(roleLabel("mascot-hat")).toBe("Ảnh tham chiếu");
    expect(roleLabel("")).toBe("Ảnh tham chiếu");
  });
});

describe("tên đọc được của một tấm ảnh", () => {
  it("bỏ thư mục, giữ tên file", () => {
    expect(shortName("refs/char-pose-sheet.png")).toBe("char-pose-sheet.png");
    expect(shortName("lan.png")).toBe("lan.png");
    expect(shortName("~\\refs\\lan.png")).toBe("lan.png");
  });
});

describe("danh sách ảnh để bày ra", () => {
  it("dùng bản kê của engine khi có, giữ nguyên vai, và khử ảnh trùng", () => {
    const out = sheetImages({
      attachments: [],
      images: [img({}), img({ path: "refs/tam-dang.png", role: "pose" }), img({})],
    });
    expect(out.map((i) => i.path)).toEqual(["refs/lan.png", "refs/tam-dang.png"]);
    expect(out.map((i) => i.role)).toEqual(["character", "pose"]);
  });

  /* ENGINE ĐỜI CŨ chưa ghi bản kê. Bày ảnh mà thiếu nhãn vẫn hơn bày một khối
     rỗng — nhưng vai phải để TRỐNG, không được bịa ra một vai. */
  it("engine đời cũ (chỉ có danh sách đính kèm) ⇒ vẫn bày được, vai để trống", () => {
    const out = sheetImages({ attachments: ["refs/lan.png", "skeleton/nen.png", "refs/lan.png"], images: [] });
    expect(out).toEqual([{ path: "refs/lan.png", role: "" }]);
  });
});
