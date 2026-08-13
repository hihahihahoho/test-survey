/**
 * features/home/lib/brand-assets.ts — quy đổi `assetIds` (danh sách id THÔ) của một nhận
 * dạng thương hiệu thành thứ THẤY ĐƯỢC trên thẻ: vài ảnh xem trước + một dòng đếm đúng.
 *
 * VÌ SAO TÁCH KHỎI MÀN: thẻ thương hiệu trước đây in thẳng `brand.assetIds.length` kèm
 * danh từ gộp «ảnh và nhân vật». Câu đó nói sai hai chiều:
 *   1. đếm cả id đã CHẾT — agent chỉ dọn `assetIds` khi ảnh bị xoá qua API, dữ liệu cũ
 *      (hoặc file library.json chép tay) vẫn có thể trỏ vào ảnh không còn tồn tại;
 *   2. gộp ba loại khác hẳn nhau vào một danh từ, nên «3 ảnh và nhân vật» không cho biết
 *      thương hiệu đã có logo hay chưa — mà logo mới là thứ người dùng đi tìm.
 *
 * Ở đây là LOGIC THUẦN, không React: đó là điều kiện để test được số đếm mà không phải
 * dựng cả dialog (xem `__tests__/brand-assets.test.ts`).
 */
import type { BrandProfile, LibraryItem } from "@/lib/types";

/** Ba loại tài sản mà màn thương hiệu phân biệt. Khác `LibraryItem.kind` của kho chung. */
export type BrandAssetKind = "logo" | "style" | "mascot";

export const BRAND_ASSET_LABEL: Record<BrandAssetKind, string> = {
  logo: "Logo",
  style: "Ảnh phong cách",
  mascot: "Nhân vật",
};

/**
 * Loại của một ảnh trong kho, nhìn từ màn thương hiệu.
 *
 * Chỉ ảnh có `group === "brand-logo"` mới là logo. Mọi ảnh tham chiếu khác (kể cả
 * `style` upload từ màn Ảnh phong cách, và toàn bộ `brand-style` cũ) rơi về «ảnh phong
 * cách» — nhờ vậy dữ liệu upload TRƯỚC khi tách hai khu vẫn hiện nguyên, không mất ảnh
 * nào; người dùng đổi lại loại trong dialog thương hiệu nếu đó vốn là logo.
 */
export function brandAssetKind(item: Pick<LibraryItem, "kind" | "group">): BrandAssetKind {
  if (item.kind === "mascot") return "mascot";
  return item.group === "brand-logo" ? "logo" : "style";
}

const ORDER: Record<BrandAssetKind, number> = { logo: 0, style: 1, mascot: 2 };

/**
 * Ảnh THẬT của một thương hiệu: bỏ id trỏ vào ảnh đã biến mất khỏi kho, xếp
 * logo → ảnh phong cách → nhân vật (sort ổn định nên trong cùng loại vẫn giữ thứ tự gắn).
 */
export function brandAssets(
  brand: Pick<BrandProfile, "assetIds">,
  items: readonly LibraryItem[],
): LibraryItem[] {
  const byId = new Map(items.map(item => [item.id, item]));
  return brand.assetIds
    .map(id => byId.get(id))
    .filter((item): item is LibraryItem => Boolean(item))
    .sort((a, b) => ORDER[brandAssetKind(a)] - ORDER[brandAssetKind(b)]);
}

/** Số ảnh theo từng loại — dùng cho dòng đếm và cho test. */
export function brandAssetCounts(assets: readonly LibraryItem[]): Record<BrandAssetKind, number> {
  const counts: Record<BrandAssetKind, number> = { logo: 0, style: 0, mascot: 0 };
  for (const asset of assets) counts[brandAssetKind(asset)] += 1;
  return counts;
}

/**
 * Dòng đếm dưới thẻ: «1 logo · 3 ảnh phong cách · 2 nhân vật».
 * Loại nào bằng 0 thì KHÔNG nhắc tới — thẻ hẹp, chữ thừa đẩy chữ thật xuống.
 */
export function brandAssetSummary(assets: readonly LibraryItem[]): string {
  if (assets.length === 0) return "Chưa có ảnh hoặc nhân vật";
  const counts = brandAssetCounts(assets);
  const parts: string[] = [];
  if (counts.logo) parts.push(`${counts.logo} logo`);
  if (counts.style) parts.push(`${counts.style} ảnh phong cách`);
  if (counts.mascot) parts.push(`${counts.mascot} nhân vật`);
  return parts.join(" · ");
}

/**
 * Vài ô vuông xem trước + phần tràn. `limit` ô đầu là ảnh thật, phần còn lại gộp thành
 * một ô «+N» — không bao giờ vẽ «+0».
 */
export function brandPreview(
  assets: readonly LibraryItem[],
  limit = 2,
): { shown: LibraryItem[]; overflow: number } {
  const size = Math.max(0, limit);
  return { shown: assets.slice(0, size), overflow: Math.max(0, assets.length - size) };
}
