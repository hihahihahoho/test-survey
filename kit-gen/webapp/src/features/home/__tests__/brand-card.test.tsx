/**
 * THẺ THƯƠNG HIỆU — render THẬT bằng `renderToString` (repo chưa có jsdom trong
 * devDependencies; cùng giới hạn đã ghi ở `update-sidebar-button.test.tsx`).
 *
 * Ca đắt nhất là ca ẢNH ĐÃ CÓ MÀ THẺ VẪN NÓI KHÔNG: thẻ cũ in thẳng `assetIds.length`
 * kèm danh từ gộp và KHÔNG hề vẽ ảnh, nên "đã tải logo lên rồi mà thẻ vẫn trống" là hồi
 * quy im lặng — không có test nào ngã.
 */
import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import type { BrandProfile, LibraryItem } from "@/lib/types";
import { BrandCard } from "../components/BrandCard";

function item(id: string, over: Partial<LibraryItem> = {}): LibraryItem {
  return {
    id, kind: "reference", group: "brand-style", name: id, description: "",
    tags: [], filename: `${id}.png`, poses: [], ...over,
  } as LibraryItem;
}

const ITEMS = [
  item("logo-a", { group: "brand-logo", name: "Logo chính" }),
  item("style-a", { name: "Key visual Tết" }),
  item("style-b", { name: "Moodboard" }),
  item("mascot-a", { kind: "mascot", group: "brand-mascot", name: "Sóc VCB" }),
];

function brand(over: Partial<BrandProfile> = {}): BrandProfile {
  return { id: "brand_1", name: "Test", description: "", colors: ["#005BAA", "#00B0F0"], assetIds: [], ...over } as BrandProfile;
}

const render = (b: BrandProfile, items: LibraryItem[] = ITEMS) =>
  renderToString(<BrandCard brand={b} items={items} onEdit={() => {}} onRemove={() => {}} />);

describe("Thẻ thương hiệu", () => {
  it("chưa gắn gì → không có ô ảnh, dòng đếm nói thẳng là chưa có", () => {
    const html = render(brand());
    expect(html).toContain("Chưa có ảnh hoặc nhân vật");
    expect(html).not.toContain("Ảnh của Test");
    expect(html).not.toContain("+0");
  });

  it("có ảnh → vẽ ô xem trước và đếm tách theo loại", () => {
    const html = render(brand({ assetIds: ["logo-a", "style-a"] }));
    expect(html).toContain("Ảnh của Test");
    expect(html).toContain("Logo chính");
    expect(html).toContain(">1 logo · 1 ảnh phong cách<");
    expect(html).not.toContain(">+");
  });

  it("nhiều hơn 2 ảnh → hai ô đầu + chỉ báo tràn +N (không liệt kê hết)", () => {
    const html = render(brand({ assetIds: ["logo-a", "style-a", "style-b", "mascot-a"] }));
    expect(html).toContain(">+2<");
    expect(html).toContain("Key visual Tết");
    expect(html).not.toContain("Sóc VCB");
    expect(html).toContain(">1 logo · 2 ảnh phong cách · 1 nhân vật<");
  });

  it("id trỏ vào ảnh đã bị xoá khỏi kho → không đếm, không vẽ ô ma", () => {
    const html = render(brand({ assetIds: ["logo-a", "asset_khong_con"] }));
    expect(html).toContain(">1 logo<");
    expect(html).not.toContain("ảnh phong cách");
    expect(html).not.toContain(">+");
  });

  it("nút xoá KHÔNG xoá ngay: bấm mở hộp xác nhận, nên thẻ chỉ có nút, chưa có câu hỏi", () => {
    const html = render(brand());
    expect(html).toContain("Xoá Test");
    expect(html).not.toContain("Xoá “Test”?");
  });

  it("chưa có ghi chú thì nói rõ, không để dòng trống", () => {
    expect(render(brand())).toContain("Chưa có ghi chú");
  });
});
