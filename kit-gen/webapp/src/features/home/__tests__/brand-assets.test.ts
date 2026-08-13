/**
 * THẺ THƯƠNG HIỆU NÓI ĐÚNG NÓ CÓ GÌ (màn /app/brands).
 *
 * Ca đắt nhất KHÔNG phải «đếm 3 ảnh ra 3» mà là ba ca dễ lọt sau, đều đã xảy ra thật:
 *   1. `assetIds` trỏ vào ảnh KHÔNG CÒN trong kho ⇒ thẻ khoe số ảnh nó không vẽ được;
 *   2. ảnh tải lên TRƯỚC khi tách hai khu (toàn bộ nằm ở `brand-style`) phải vẫn hiện,
 *      chỉ là hiện ở khu «ảnh phong cách» — không được biến mất;
 *   3. «+N» phải là số ảnh CÒN LẠI, và không bao giờ được vẽ «+0».
 */
import { describe, expect, it } from "vitest";
import type { LibraryItem } from "@/lib/types";
import { brandAssetKind, brandAssetSummary, brandAssets, brandPreview } from "../lib/brand-assets";

function item(id: string, over: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id, kind: "reference", group: "brand-style", name: id, description: "",
    tags: [], filename: `${id}.png`, poses: [], ...over,
  } as LibraryItem;
}

const LOGO_A = item("logo-a", { group: "brand-logo" });
const LOGO_B = item("logo-b", { group: "brand-logo" });
const STYLE_A = item("style-a");
const STYLE_OLD = item("style-old", { group: "style" });
const MASCOT = item("mascot-a", { kind: "mascot", group: "brand-mascot", tags: ["VCB"] });
const ALL = [STYLE_A, MASCOT, LOGO_A, LOGO_B, STYLE_OLD];

describe("brandAssetKind · phân loại tài sản", () => {
  it("chỉ group brand-logo mới là logo", () => {
    expect(brandAssetKind(LOGO_A)).toBe("logo");
    expect(brandAssetKind(STYLE_A)).toBe("style");
  });

  it("ảnh cũ (group style, upload trước khi tách hai khu) rơi về ảnh phong cách chứ không mất", () => {
    expect(brandAssetKind(STYLE_OLD)).toBe("style");
  });

  it("nhân vật nhận theo kind, không phụ thuộc group", () => {
    expect(brandAssetKind(MASCOT)).toBe("mascot");
    expect(brandAssetKind({ kind: "mascot", group: "brand-logo" })).toBe("mascot");
  });
});

describe("brandAssets · nối id với kho", () => {
  it("bỏ id trỏ vào ảnh đã biến mất khỏi kho", () => {
    const assets = brandAssets({ assetIds: ["logo-a", "đã-xoá", "style-a"] }, ALL);
    expect(assets.map(asset => asset.id)).toEqual(["logo-a", "style-a"]);
  });

  it("xếp logo trước, rồi ảnh phong cách, rồi nhân vật — giữ thứ tự gắn trong từng loại", () => {
    const assets = brandAssets({ assetIds: ["mascot-a", "style-a", "logo-b", "style-old", "logo-a"] }, ALL);
    expect(assets.map(asset => asset.id)).toEqual(["logo-b", "logo-a", "style-a", "style-old", "mascot-a"]);
  });

  it("thương hiệu chưa gắn gì thì rỗng, không nổ", () => {
    expect(brandAssets({ assetIds: [] }, ALL)).toEqual([]);
  });
});

describe("brandAssetSummary · dòng đếm dưới thẻ", () => {
  it("chưa có gì thì nói rõ là chưa có, không in «0 ảnh»", () => {
    expect(brandAssetSummary([])).toBe("Chưa có ảnh hoặc nhân vật");
  });

  it("tách từng loại thay vì gộp thành một danh từ mơ hồ", () => {
    expect(brandAssetSummary(brandAssets({ assetIds: ["logo-a", "style-a", "style-old", "mascot-a"] }, ALL)))
      .toBe("1 logo · 2 ảnh phong cách · 1 nhân vật");
  });

  it("loại nào bằng 0 thì không nhắc tới", () => {
    expect(brandAssetSummary([LOGO_A, LOGO_B])).toBe("2 logo");
  });
});

describe("brandPreview · ô vuông xem trước + chỉ báo tràn", () => {
  it("ít hơn hoặc bằng giới hạn thì KHÔNG có +N", () => {
    expect(brandPreview([LOGO_A, STYLE_A])).toEqual({ shown: [LOGO_A, STYLE_A], overflow: 0 });
  });

  it("dư ra bao nhiêu thì +N đúng bấy nhiêu", () => {
    const preview = brandPreview([LOGO_A, LOGO_B, STYLE_A, MASCOT]);
    expect(preview.shown.map(asset => asset.id)).toEqual(["logo-a", "logo-b"]);
    expect(preview.overflow).toBe(2);
  });

  it("rỗng thì không có ô nào và không có +0", () => {
    expect(brandPreview([])).toEqual({ shown: [], overflow: 0 });
  });
});
