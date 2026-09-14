import { cn } from "@/lib/utils";
import { SHEET_MAX_CHOICES, maxPerSheetOf } from "../lib/composer-model";

/**
 * SheetMaxPicker — «Tối đa mỗi tấm: 1 · 4 · 9».
 *
 * ╔══ VÌ SAO CÀI ĐẶT NÀY NẰM NGAY TRÊN THẺ, CẠNH DÒNG ĐẾM ═══════════════════╗
 * ║ Chủ sản phẩm: *«không phải xếp 6 cái vào chung 1 page, mà sẽ có setting,  ║
 * ║ mặc định là MAX 4 cái 1 sheet gen… trên 1 tấm mà có 1 món → gen full, đỡ  ║
 * ║ tốn khoảng trống»*. Thứ nấc này đổi là SỐ TẤM SẼ VẼ — tức là số lượt tiêu ║
 * ║ tiền, và cỡ mỗi món trên ảnh ra. Cả hai đều được nói ngay cạnh nó bằng    ║
 * ║ dòng đếm («6 element · 2 tấm (4 + 2)»), nên đặt nó ở một trang cài đặt    ║
 * ║ khác là bắt người dùng nhớ một con số rồi quay lại đây kiểm tra.          ║
 * ║                                                                          ║
 * ║ Ba nút THẬT chứ không phải một `<select>`: chỉ có ba giá trị, và cả ba    ║
 * ║ đều phải đọc được cùng lúc thì mới so được «4 hay 9». Cùng hình dạng với  ║
 * ║ `ModeToggle` ngay cạnh — hai control cùng hàng trên một thẻ mà khác kiểu  ║
 * ║ thì hàng ấy trông như bị chắp vá.                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export function SheetMaxPicker({
  value,
  onPick,
  label = "Tối đa mỗi tấm",
}: {
  /** Giá trị đang lưu trên thẻ — giá trị lạ / thiếu tự về nấc mặc định. */
  value: number | undefined;
  onPick: (next: number) => void;
  /** Chữ của nhãn, cũng là `aria-label` của cả nhóm. */
  label?: string;
}) {
  const current = maxPerSheetOf(value);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-caption text-fg-muted">{label}</span>
      <span role="radiogroup" aria-label={label} className="inline-flex rounded-full border border-line-subtle p-0.5">
        {SHEET_MAX_CHOICES.map((choice) => (
          <button
            key={choice}
            type="button"
            role="radio"
            aria-checked={current === choice}
            onClick={() => onPick(choice)}
            /* `title` nói HỆ QUẢ, không nhắc lại con số: người đọc đã thấy con số
               trên mặt nút, thứ họ chưa biết là nút ấy đổi cái gì. */
            title={
              choice === 1
                ? "Mỗi món một tấm riêng — món chiếm trọn khổ ảnh"
                : `Tối đa ${choice} món trên một tấm`
            }
            className={cn(
              "rounded-full px-2.5 py-0.5 text-caption transition-colors duration-fast",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
              current === choice ? "bg-raised text-fg-strong" : "text-fg-muted hover:text-fg",
            )}
          >
            {choice}
          </button>
        ))}
      </span>
    </span>
  );
}
