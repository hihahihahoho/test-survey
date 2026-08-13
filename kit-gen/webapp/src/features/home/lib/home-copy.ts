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
export const HOME_COPY = {
  /** UX-V3 §6 hàng H cột `error` — nguyên văn tài liệu. */
  ERROR_TITLE: "Chưa lấy được danh sách dự án.",
  /** Câu phụ nói VIỆC CẦN LÀM. Không chứa mã lỗi (§6 quy tắc chung). */
  ERROR_BODY: "Danh sách dự án nằm trên máy bạn. Bấm Thử lại, hoặc kiểm tra công cụ trên máy.",
  /** Ca lọc rỗng: §5.3 chỉ định nghĩa cho W3; H mượn cùng lối nói, đổi danh từ. */
  FILTER_EMPTY_TITLE: "Không có dự án nào khớp",
  FILTER_EMPTY_BODY: "Thử từ khoá ngắn hơn.",
  /** Ô tìm — nhãn cho screen reader, không phải nút/tiêu đề. */
  SEARCH_LABEL: "Tìm dự án",
  SEARCH_PLACEHOLDER: "Tìm dự án…",
  /** Nhãn vùng lưới cho screen reader. */
  GRID_LABEL: "Danh sách dự án",
  /** Chữ trên thẻ CTA đầu lưới — xuống dòng thủ công theo wireframe §1.1. */
  CREATE_TILE_HINT: "Điền yêu cầu theo từng bước.",
  /** Nhãn đọc lên khi lưới đang tải (§6 hàng H cột loading). */
  LOADING_LABEL: "Đang tải danh sách dự án…",
} as const;

/* `trashLabel(n)` («Thùng rác (2)») đã XOÁ cùng với nút thùng rác góc dưới-phải của
   lưới: thùng rác nay chỉ có MỘT lối vào ở sidebar, nơi số đếm là badge riêng cạnh
   nút chứ không nằm trong tên nút. Không còn nơi nào gọi hàm này. */
