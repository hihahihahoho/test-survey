/**
 * Bảng ánh xạ THỊ GIÁC của file con — chỉ TÊN TOKEN, không mã màu (ràng buộc cứng).
 *
 * `DOC_COLORS` (types.ts) là tên nhãn do người dùng chọn; bảng này quy nó về token
 * semantic đã có của R0. Không thêm bậc màu mới: FLORA-REF §2.4 nói accent phải dùng
 * TIẾT CHẾ, nên chấm màu nhãn chỉ là chấm 6px, không phải nền tab.
 *
 * Class viết THẲNG chuỗi đầy đủ (không ghép runtime) vì Tailwind quét tĩnh —
 * `npm run deadclass` là cổng canh chuyện này.
 */
import { LayoutGrid, PenLine, type LucideIcon } from "lucide-react";
import type { DocColor, DocKind } from "../../lib";

/** `▦` workflow · `✎` canvas (§4.3). Icon LUÔN đi kèm chữ — không có tab chỉ-icon. */
export const KIND_ICON: Record<DocKind, LucideIcon> = {
  workflow: LayoutGrid,
  canvas: PenLine,
};

export const KIND_LABEL: Record<DocKind, string> = {
  workflow: "quy trình chuẩn",
  canvas: "bàn ý tưởng",
};

/** Chấm nhãn màu. `none` = không vẽ chấm. */
export const COLOR_DOT: Record<DocColor, string> = {
  none: "",
  mint: "bg-accent",
  ice: "bg-ok",
  amber: "bg-warn",
  rose: "bg-danger",
  violet: "bg-running",
};

export const COLOR_LABEL: Record<DocColor, string> = {
  none: "không nhãn",
  /* VNPAY-RECOLOR: KHOÁ `mint` là dữ liệu ĐÃ LƯU của người dùng (`DocColor` trong
     types.ts) — đổi khoá là phải viết migration, nên giữ. Chỉ đổi NHÃN, vì chấm này
     vẽ bằng `bg-accent` mà accent nay là xanh VNPAY: nhãn cũ "bạc hà" nói sai màu
     người dùng đang nhìn thấy. */
  mint: "xanh VNPAY",
  ice: "băng",
  amber: "hổ phách",
  rose: "hồng",
  violet: "tím",
};
