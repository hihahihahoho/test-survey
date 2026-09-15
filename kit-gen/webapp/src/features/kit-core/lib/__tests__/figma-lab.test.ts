/**
 * figma-lab.test.ts — CỔNG DEV của nút thí nghiệm, và danh sách biến thể.
 *
 * ┌── VÌ SAO CỜ DEV PHẢI LÀ MỘT HÀM THUẦN ───────────────────────────────────┐
 * │ `import.meta.env.DEV` là HẰNG SỐ do trình đóng gói thay lúc build — dưới  │
 * │ vitest nó luôn `true`, nên một ca gọi thẳng `figmaLabOn()` chỉ đo được    │
 * │ đúng một nửa cái cổng, và nửa còn lại (bản release) là nửa duy nhất người │
 * │ dùng chạm tới. Vì vậy phần quyết định nằm ở `labFlagOn(dev, search)` —    │
 * │ hàm thuần, hai phía đều kiểm được — còn `figmaLabOn()` chỉ là chỗ nối     │
 * │ dây tới `import.meta.env` và `location.search`.                          │
 * └───────────────────────────────────────────────────────────────────────────┘
 */
import { describe, expect, it } from "vitest";
import { LAB_CODES, LAB_QUERY_KEY, LAB_QUERY_VALUE, LAB_VARIANTS, labFlagOn } from "../figma-lab";

describe("cổng dev — nút thí nghiệm KHÔNG được có mặt ở bản người dùng cầm", () => {
  it("bản đã build, không query ⇒ TẮT", () => {
    expect(labFlagOn(false, "")).toBe(false);
    expect(labFlagOn(false, "?tab=cut")).toBe(false);
  });

  it("bản đã build + đúng query ⇒ BẬT (đường mở tay để chủ sản phẩm dán thử)", () => {
    expect(labFlagOn(false, `?${LAB_QUERY_KEY}=${LAB_QUERY_VALUE}`)).toBe(true);
    expect(labFlagOn(false, `?x=1&${LAB_QUERY_KEY}=${LAB_QUERY_VALUE}&y=2`)).toBe(true);
  });

  it("query sai giá trị ⇒ vẫn TẮT, không nhận bừa một chữ nào khác", () => {
    expect(labFlagOn(false, `?${LAB_QUERY_KEY}=1`)).toBe(false);
    expect(labFlagOn(false, `?${LAB_QUERY_KEY}`)).toBe(false);
    expect(labFlagOn(false, "?figma=lab")).toBe(false);
  });

  it("bản dev ⇒ BẬT, không cần query", () => {
    expect(labFlagOn(true, "")).toBe(true);
  });
});

describe("danh sách biến thể", () => {
  it("mỗi biến thể một mã và một tên RIÊNG — trùng tên là ảnh chụp không đối chiếu được", () => {
    expect(new Set(LAB_CODES).size).toBe(LAB_VARIANTS.length);
    expect(new Set(LAB_VARIANTS.map((v) => v.label)).size).toBe(LAB_VARIANTS.length);
  });

  it("tên hộp MỞ ĐẦU bằng chính mã của nó — panel Layers đọc từ trái sang", () => {
    for (const v of LAB_VARIANTS) expect(v.label.startsWith(`${v.code} `)).toBe(true);
  });

  it("KHÔNG có biến thể `data-*`: encoder chỉ chở ATTR_ALLOWLIST + `aria-*`", () => {
    /* `pickAttributes` (`figma-h2d.global.js:907-919`) bỏ mọi khoá ngoài danh sách
       trắng và ngoài tiền tố `aria-`, nên một biến thể gửi `data-aspect-ratio` sẽ
       KHÔNG BAO GIỜ rời khỏi máy này — bày nó ra là mời người ta đo một thứ không
       tồn tại. Ca này canh đúng chỗ đó: đừng thêm lại. */
    expect(LAB_CODES).not.toContain("K");
  });
});
