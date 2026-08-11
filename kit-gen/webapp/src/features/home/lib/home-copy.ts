/**
 * features/home/lib/home-copy.ts — CHỮ CHỈ DÙNG Ở MÀN H, chưa có trong từ điển chung.
 *
 * LUẬT: từ điển chữ của cả đợt là `features/kitfile/lib/copy.ts` (chủ: nhánh S) — màn
 * KHÔNG tự chế chữ cho nút/tiêu đề/empty. Những chuỗi dưới đây là phần UX-V3 §6
 * (bảng trạng thái màn H) và §1.3 CÓ quy định nhưng CHƯA có trong `copy.ts`.
 *
 * ⚠️ GIẢI PHÁP TẠM TRONG GLOB CỦA H (FE3-PLAN §0-N1). Không nhánh nào khác import file này.
 * TODO(S): dời các chuỗi này vào `features/kitfile/lib/copy.ts` rồi xoá file này —
 *          đã ghi `teams/react/NEEDS-fe3-h.md` **N2**.
 */
import { BTN } from "@/features/kitfile";

export const HOME_COPY = {
  /** UX-V3 §6 hàng H cột `error` — nguyên văn tài liệu. */
  ERROR_TITLE: "Chưa lấy được danh sách bộ kit.",
  /** Câu phụ nói VIỆC CẦN LÀM. Không chứa mã lỗi (§6 quy tắc chung). */
  ERROR_BODY: "Danh sách bộ kit nằm trên máy bạn. Bấm Thử lại, hoặc kiểm tra công cụ trên máy.",
  /** Ca lọc rỗng: §5.3 chỉ định nghĩa cho W3; H mượn cùng lối nói, đổi danh từ. */
  FILTER_EMPTY_TITLE: "Không có bộ kit nào khớp",
  FILTER_EMPTY_BODY: "Thử từ khoá ngắn hơn.",
  /** Ô tìm — nhãn cho screen reader, không phải nút/tiêu đề. */
  SEARCH_LABEL: "Tìm bộ kit",
  SEARCH_PLACEHOLDER: "Tìm theo tên…",
  /** Nhãn vùng lưới cho screen reader. */
  GRID_LABEL: "Danh sách bộ kit",
  /** Chữ trên thẻ CTA đầu lưới — xuống dòng thủ công theo wireframe §1.1. */
  CREATE_TILE_HINT: "Điền form cho máy làm, hoặc tự xếp trên bàn.",
  /** Nhãn đọc lên khi lưới đang tải (§6 hàng H cột loading). */
  LOADING_LABEL: "Đang tải danh sách bộ kit…",
} as const;

/** «Thùng rác (2)» — §1.3. Số THẬT, không hardcode; 0 thì màn tự ẩn nút. */
export function trashLabel(n: number): string {
  const v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  return `${BTN.TRASH} (${v})`;
}
