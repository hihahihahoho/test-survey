import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import { HexColorField, normalizeHex } from "@/components/common/HexColorField";

import { PillButton, PillCaret, PillMenu } from "./pill-ui";
import { brandColorName, MAX_BRAND_COLORS } from "../lib/brand-colors";

/**
 * BrandColorPills — MÀU THƯƠNG HIỆU nằm ngay trong câu ngữ cảnh chung.
 *
 * ┌── VÌ SAO LÀ PILL TRONG CÂU, KHÔNG PHẢI MỘT KHUNG "Brand colors" RIÊNG ───┐
 * │ Vì màu là một MỆNH ĐỀ của câu tả bộ kit, y hệt theme và phong cách. Tách │
 * │ nó ra một khung riêng bên cạnh là dạy người dùng rằng màu được xử lý     │
 * │ theo đường khác — trong khi prompt sinh ra thì nó nằm cùng một câu.      │
 * │ Màn hình phải trông giống thứ nó sinh ra, đó là cả điểm của demo này.    │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ⚠️ Ô chỉnh màu KHÔNG tự vẽ lại: dùng `HexColorField` có sẵn ở
 * `components/common` (import chỉ-đọc, không sửa file đó). Nó đã giải xong bài
 * "dán được mã hex từ brand guideline" và tự nở `#F53` → `#ff5533`. Vẽ lại một
 * `<input type=color>` ở đây là đẻ ra cái ô thứ hai hiểu hex theo luật khác.
 */

/** Vai trò suy ra từ VỊ TRÍ — cùng luật với `describeBrandColors()`. */
function roleOf(index: number): string {
  if (index === 0) return "màu chủ đạo";
  if (index === 1) return "màu nhấn";
  return "màu phụ";
}

function BrandColorPill({
  hex,
  index,
  onEdit,
  onRemove,
}: {
  hex: string;
  index: number;
  onEdit: (next: string) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const swatch = normalizeHex(hex) ?? "#000000";
  const name = brandColorName(hex);

  return (
    <span className="relative inline-block">
      <PillButton active={open} onClick={() => setOpen((v) => !v)} aria-haspopup="dialog" aria-expanded={open}>
        {/* Màu thật chỉ có thể đến từ `style`: nó là dữ liệu người dùng nhập,
            không phải một token thiết kế. Đây là ngoại lệ duy nhất trong màn. */}
        <span
          aria-hidden
          className="size-4 shrink-0 rounded-1 border border-line-subtle"
          style={{ backgroundColor: swatch }}
        />
        <span className="text-mono">{swatch}</span>
        <PillCaret />
      </PillButton>

      {open && (
        <PillMenu label={`Sửa ${roleOf(index)}`} onClose={() => setOpen(false)}>
          <div className="flex flex-col gap-2 p-2">
            <p className="text-caption text-fg-muted">
              {roleOf(index)} — vào prompt thành{" "}
              {/* Cho thấy TRƯỚC cụm tiếng Anh mà máy sẽ đọc, đúng như pill chọn
                  option làm. Người dùng chỉnh hex mà thấy chữ đổi theo thì mới
                  hiểu vì sao prompt lại nói "deep navy blue". */}
              <span className="text-fg-strong">{name || "— không đọc được —"}</span>
            </p>

            <HexColorField label={roleOf(index)} value={swatch} onChange={onEdit} />

            <button
              type="button"
              onClick={() => {
                onRemove();
                setOpen(false);
              }}
              className="mt-1 inline-flex items-center gap-1.5 self-start rounded-1 px-2 py-1 text-caption text-fg-muted transition-colors duration-fast hover:bg-danger/[var(--kg-tint-a)] hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
            >
              <Trash2 aria-hidden className="size-3.5" />
              Bỏ màu này
            </button>
          </div>
        </PillMenu>
      )}
    </span>
  );
}

export function BrandColorPills({
  colors,
  onChange,
}: {
  colors: string[];
  /* Nhận HÀM cập nhật vì cùng lý do đã đo được ở `updateBlock` bên
     PromptComposerScreen: bấm "+ màu" hai nhịp liền thì bản nhận giá trị sẽ
     nuốt mất một màu. */
  onChange: (updater: (prev: string[]) => string[]) => void;
}) {
  return (
    <>
      {colors.map((hex, index) => (
        <BrandColorPill
          /* Key theo VỊ TRÍ chứ không theo mã màu: hai màu trùng nhau là hợp lệ
             (người ta dán nhầm rồi sửa), và key trùng thì React tái dùng nhầm
             popover đang mở. Vị trí ở đây cũng chính là danh tính — vai trò của
             màu do vị trí quyết định. */
          key={index}
          hex={hex}
          index={index}
          onEdit={(next) => onChange((prev) => prev.map((item, at) => (at === index ? next : item)))}
          onRemove={() => onChange((prev) => prev.filter((_, at) => at !== index))}
        />
      ))}

      {colors.length < MAX_BRAND_COLORS && (
        <PillButton
          compact
          muted
          onClick={() => onChange((prev) => [...prev, "#7c5cff"])}
          aria-label="Thêm màu thương hiệu"
        >
          <Plus aria-hidden className="size-3.5" />
          <span>màu</span>
        </PillButton>
      )}
    </>
  );
}
