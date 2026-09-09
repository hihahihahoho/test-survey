import { describe, expect, it } from "vitest";
import type { PromptPreviewImage } from "@/lib/types/api";
import { roleLabel, sheetImages, shortName, splitPromptByDesc } from "../prompt-images";

/**
 * ẢNH ĐI KÈM MỘT TẤM — bốn thứ mà hỏng thì màn hình nói dối trong im lặng.
 *
 * ╔══ BỆNH ĐÃ ĐO (chủ sản phẩm, 09/09/2026) ═════════════════════════════════╗
 * ║ Xem trước prompt hiện đúng tấm ảnh dáng và giấu mất tấm ảnh nhân vật, vì  ║
 * ║ khối ảnh chỉ đọc danh sách ĐÍNH KÈM còn ảnh nhân vật (nền đục) đi đường   ║
 * ║ tả thành chữ. Người dùng kết luận đúng thứ họ thấy: *"prompt thiếu cái    ║
 * ║ hiển thị ảnh này"*.                                                       ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */

const img = (over: Partial<PromptPreviewImage>): PromptPreviewImage => ({
  path: "refs/lan.png", role: "character", mode: "described", alpha: false, desc: null, ...over,
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
    expect(shortName("~\\\\refs\\\\lan.png")).toBe("lan.png");
  });
});

describe("danh sách ảnh để bày ra", () => {
  it("dùng bản kê của engine khi có, và khử ảnh trùng", () => {
    const out = sheetImages({
      attachments: [],
      images: [img({}), img({ path: "refs/tam-dang.png", role: "pose", mode: "attached", alpha: true }), img({})],
    });
    expect(out.map((i) => i.path)).toEqual(["refs/lan.png", "refs/tam-dang.png"]);
    expect(out.map((i) => i.mode)).toEqual(["described", "attached"]);
  });

  /* ENGINE ĐỜI CŨ chưa ghi bản kê. Bày nửa sự thật (ảnh đính kèm) vẫn hơn bày một
     khối rỗng — nhưng vai phải để TRỐNG, không được bịa ra một vai. */
  it("engine đời cũ (chỉ có danh sách đính kèm) ⇒ vẫn bày được, vai để trống", () => {
    const out = sheetImages({ attachments: ["refs/lan.png", "skeleton/nen.png", "refs/lan.png"], images: [] });
    expect(out).toEqual([{ path: "refs/lan.png", role: "", mode: "attached", alpha: false, desc: null }]);
  });
});

describe("neo đoạn tả của một ảnh vào khối chữ", () => {
  const DESC = "Con sóc đỏ tròn, bụng kem.";
  const PROMPT = `## Character\n${DESC}\n## Palette\nđỏ và vàng`;

  it("cắt đúng đoạn chữ đang đứng thay cho ảnh, ghép lại thì nguyên văn không đổi", () => {
    const parts = splitPromptByDesc(PROMPT, [img({ desc: DESC })]);
    expect(parts.map((p) => p.text).join("")).toBe(PROMPT);
    expect(parts.filter((p) => p.imageIndex === 0).map((p) => p.text)).toEqual([DESC]);
  });

  /* Chưa tả lần nào thì đoạn đứng thay là CÂU CHỜ do agent đặt vào — nó cũng phải
     neo được, vì đó chính là chỗ người dùng cần nhìn để hiểu ảnh của mình đi đâu. */
  it("câu chờ (ảnh chưa được tả) cũng neo được y như mô tả thật", () => {
    const cho = "[mô tả ảnh lan.png — sẽ tự tả ở lượt Vẽ đầu]";
    const parts = splitPromptByDesc(`## Character\n${cho}`, [img({ desc: cho })]);
    expect(parts.find((p) => p.imageIndex === 0)?.text).toBe(cho);
  });

  it("ảnh đính kèm không neo gì cả — nó tới máy vẽ bằng chính pixel của nó", () => {
    const parts = splitPromptByDesc(PROMPT, [img({ mode: "attached", desc: DESC })]);
    expect(parts).toEqual([{ text: PROMPT, imageIndex: null }]);
  });

  /* KHÔNG NEO BỪA. Đoạn chữ không có trong prompt (engine đổi bố cục, agent đời
     khác) ⇒ không cắt gì hết: một cú nhảy tới nhầm đoạn còn tệ hơn không nhảy. */
  it("không tìm thấy đoạn chữ ⇒ không cắt, không neo", () => {
    const parts = splitPromptByDesc(PROMPT, [img({ desc: "một đoạn không có trong prompt" })]);
    expect(parts).toEqual([{ text: PROMPT, imageIndex: null }]);
  });

  it("hai ảnh tả ra cùng một đoạn ⇒ không nhân đôi khúc chữ nào", () => {
    const parts = splitPromptByDesc(PROMPT, [img({ desc: DESC }), img({ path: "refs/b.png", desc: DESC })]);
    expect(parts.map((p) => p.text).join("")).toBe(PROMPT);
    expect(parts.filter((p) => p.imageIndex !== null)).toHaveLength(1);
  });
});
