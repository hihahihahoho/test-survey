import * as React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

/**
 * ══ UI-FIX §1 · HÀNG TICK CỦA WIZARD ════════════════════════════════════════
 *
 * BỆNH (thấy ở bước ① Yêu cầu và bước ④ Mascot): công tắc nằm TRƠ MỘT MÌNH trên
 * một dòng, nhãn "Có nhân vật đại diện" + câu mô tả rơi xuống dòng dưới, lệch hẳn
 * khỏi control. Trông như giao diện vỡ.
 *
 * NGUYÊN NHÂN thật (không phải "thiếu class"): `globals.css` có
 *     `.workflow-panel label, .field-label { @apply mb-2 BLOCK … }`
 * Selector `.workflow-panel label` có độ đặc hiệu 0-1-1, thắng utility `.flex`
 * (0-1-0). Nên `<label className="flex …">` trong panel wizard **vẫn là `block`**,
 * và cái `<strong className="block">` bên trong đẩy chữ xuống dòng kế. Mọi `<label>`
 * làm hàng ngang bên trong wizard đều dính, không riêng hai chỗ này.
 *
 * THUỐC: một component duy nhất, mang class `.check-row` — class ấy được khai bằng
 * selector đủ đặc hiệu (`.workflow-panel label.check-row`) nên hàng nằm ngang thật.
 * Và theo yêu cầu: **checkbox, không phải switch**. Switch nói "bật/tắt một chế độ
 * đang chạy"; đây là một lựa chọn trong form sẽ được lưu khi bấm Tiếp theo — đúng
 * ngữ nghĩa checkbox.
 *
 * Bấm CẢ HÀNG để đổi trạng thái: hàng là một `<label>` bọc `<Checkbox>` — cách
 * `ExportTab.tsx` và `ScopePage.tsx` đã dùng, không phát minh thêm kiểu thứ ba.
 */
export function CheckRow({
  checked,
  onCheckedChange,
  label,
  description,
  id,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  id?: string;
  className?: string;
}) {
  const auto = React.useId();
  const inputId = id ?? `check-${auto}`;
  return (
    <label className={cn("check-row", className)} htmlFor={inputId}>
      <Checkbox
        id={inputId}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <span className="check-row-text">
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  );
}
