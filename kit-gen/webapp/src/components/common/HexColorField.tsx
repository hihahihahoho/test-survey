import * as React from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Ô CHỌN MÀU **COPY/PASTE ĐƯỢC** (feedback team 24/08 §2b).
 *
 * Bệnh: bước Phong cách chỉ có `<input type="color">` + một `<code>` in mã hex ra.
 * Người thiết kế đã có sẵn mã màu của thương hiệu trong tay (`#00B0F0`) nhưng KHÔNG
 * dán vào đâu được — phải mò trong bảng màu của hệ điều hành cho tới khi con số khớp.
 * Mã hex hiện ra mà không gõ được là mỉa mai đúng thứ người ta cần.
 *
 * Nên ô hex là một `<input>` thật, và nó nhận mọi dạng người ta thường copy được:
 * `#RGB` · `RGB` · `#RRGGBB` · `RRGGBB`, hoa hay thường đều được → chuẩn về `#rrggbb`
 * THƯỜNG (xem `normalizeHex`). Một dạng duy nhất đi tiếp vào state ⇒ so sánh màu
 * (chip preset đang khớp chưa, brand đã đổi màu chưa) không bao giờ lệch vì hoa/thường.
 *
 * VÌ SAO CÓ `draft` mà không dùng thẳng `value`: gõ tay thì màu đi qua những chuỗi
 * KHÔNG hợp lệ (`#`, `#0`, `#00b`…). Nếu ô hiển thị luôn là `value` đã chuẩn hoá thì
 * con trỏ nhảy loạn và người dùng không xoá nổi ký tự nào. Nên trong lúc gõ, ô hiện
 * ĐÚNG chữ người dùng gõ (`draft`); rời ô (`blur`) thì `draft` bị vứt và ô rơi về
 * `value` — tức là giá trị hợp lệ gần nhất. Gõ dở dang không bao giờ ghi vào state.
 *
 * A11y: theo mẫu `design/components/StylesTab.tsx` — swatch mang `id` để `<Label
 * htmlFor>` bên ngoài trỏ vào được, còn ô hex có `aria-label` riêng ("… dạng mã hex")
 * vì hai control cùng thuộc một nhãn thì screen reader đọc trùng tên.
 */

/** Màu hiện khi `value` không đọc được (dữ liệu cũ/hỏng) — `<input type=color>` từ chối chuỗi lạ. */
const FALLBACK = "#000000";

/**
 * Mọi dạng hex copy được → `#rrggbb` thường. `null` = chưa phải một màu.
 *
 * `#F53` nở thành `#ff5533` (mỗi ký tự nhân đôi) — đúng luật CSS 3 ký tự, và là lý do
 * hàm này tồn tại thay vì một regex `^#[0-9a-f]{6}$` đứng trước `onChange`.
 */
export function normalizeHex(raw: string): string | null {
  const body = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(body)) return `#${body.toLowerCase().replace(/./g, (c) => c + c)}`;
  if (/^[0-9a-fA-F]{6}$/.test(body)) return `#${body.toLowerCase()}`;
  return null;
}

export interface HexColorFieldProps {
  /** Gắn vào SWATCH (không phải ô hex) để `<Label htmlFor>` bên ngoài trỏ đúng vùng bấm. */
  id?: string;
  /** Tên trường, chỉ dùng dựng `aria-label` cho ô hex. Nhãn nhìn thấy do nơi gọi tự đặt. */
  label: string;
  value: string;
  /** Chỉ gọi với hex ĐÃ CHUẨN HOÁ `#rrggbb`; chuỗi gõ dở không bao giờ đi ra ngoài. */
  onChange: (hex: string) => void;
  disabled?: boolean;
  className?: string;
}

export function HexColorField({ id, label, value, onChange, disabled = false, className }: HexColorFieldProps) {
  const [draft, setDraft] = React.useState<string | null>(null);
  const shown = draft ?? value;
  const swatch = normalizeHex(value) ?? FALLBACK;

  const type = (raw: string) => {
    setDraft(raw);
    const hex = normalizeHex(raw);
    if (hex && hex !== value) onChange(hex);
  };

  return (
    <div className={cn("color-field", className)}>
      <input
        id={id}
        type="color"
        value={swatch}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => { setDraft(null); onChange(e.target.value.toLowerCase()); }}
      />
      <Input
        value={shown}
        disabled={disabled}
        aria-label={`${label} dạng mã hex`}
        spellCheck={false}
        autoComplete="off"
        className="w-28 font-mono"
        onChange={(e) => type(e.target.value)}
        /* Vứt bản nháp là ô tự rơi về `value` — giá trị hợp lệ gần nhất. Không cần
           nhớ riêng "giá trị tốt cuối cùng": state ở trên đã chính là nó. */
        onBlur={() => setDraft(null)}
      />
    </div>
  );
}
