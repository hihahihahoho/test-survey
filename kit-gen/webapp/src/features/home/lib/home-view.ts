/**
 * features/home/lib/home-view.ts — LỌC + SẮP XẾP cho màn H. Thuần hàm, không React.
 *
 * IA mới (FLOW-V3 §0.2) bỏ hết chip/cột/bảng của màn cũ: Home chỉ còn **một lưới thẻ**,
 * sắp theo «sửa gần nhất». Vì thế file này cố ý NHỎ — nó không phải bản sao thứ hai của
 * `features/projects/lib/view.ts` (file đó vẫn sống cho màn cũ, KHÔNG bị xoá — N8).
 *
 * Dùng lại `fuzzyScore` của FE-1 thay vì viết bộ tìm thứ hai: nó đã có test và đã xử lý
 * ca gõ thiếu dấu ("xuan" ra "Xuân"). Import CHỈ-ĐỌC, không sửa file đó.
 */
import type { Project } from "@/lib/types";
import { fuzzyScore } from "@/features/projects/lib/view";
import { stripSystemTags } from "@/features/kitfile";

/**
 * Ngưỡng hiện ô tìm. Dưới ngưỡng thì ô tìm chỉ là thêm chữ vào một màn mà FLOW-V3 §0.4
 * đòi «3 giây biết bấm gì» — mắt phải rơi vào ô accent, không rơi vào một ô nhập.
 * Trên ngưỡng thì cuộn tay đắt hơn, ô tìm mới đáng chỗ.
 */
export const SEARCH_THRESHOLD = 7;

export function shouldShowSearch(total: number): boolean {
  return total >= SEARCH_THRESHOLD;
}

/**
 * Chuỗi đem đi đối chiếu khi tìm. **Không** đưa `id`/`slug` vào: ở IA mới hai thứ đó
 * không hiện ra cho user (BA-V3 §1.4 hàng "Naming"), tìm theo thứ không nhìn thấy được
 * sẽ cho ra kết quả mà user không giải thích nổi. Tag hệ thống `kg-*` cũng bị loại —
 * gõ "canvas" mà ra bộ kit là lộ chỗ chứa mượn.
 */
export function haystackOf(p: Project): string {
  return `${p.name ?? ""} ${stripSystemTags(p.tags).join(" ")}`;
}

/** Sắp «sửa gần nhất» — thứ tự duy nhất của Home. Không đổi mảng gốc (cache của Query). */
export function sortByRecent(items: readonly Project[]): Project[] {
  return [...items].sort((a, b) =>
    String(b.updatedAt ?? b.createdAt ?? "").localeCompare(String(a.updatedAt ?? a.createdAt ?? "")),
  );
}

/** Lọc theo từ khoá rồi sắp. Từ khoá rỗng ⇒ chỉ sắp. */
export function applyHomeView(items: readonly Project[], query = ""): Project[] {
  const q = query.trim();
  if (q === "") return sortByRecent(items);
  return items
    .map((p) => ({ p, s: fuzzyScore(haystackOf(p), q) }))
    .filter((x) => x.s > 0)
    // Gõ tìm thì thứ khớp nhất đứng trước; hoà điểm mới xét tới «sửa gần nhất».
    .sort((a, b) => b.s - a.s || String(b.p.updatedAt ?? "").localeCompare(String(a.p.updatedAt ?? "")))
    .map((x) => x.p);
}
