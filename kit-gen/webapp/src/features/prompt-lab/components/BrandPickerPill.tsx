import { Loader2, RotateCcw, Settings2 } from "lucide-react";
import type { PillImage } from "@/features/prompt-canvas/lib/pill-image";
import { PillButton, PillCaret, PillMenu, PillMenuItem, useMenuFlip } from "./pill-ui";

/**
 * BrandPickerPill — pill «thương hiệu» của câu Ngữ cảnh chung.
 *
 * ╔══ VÌ SAO THƯƠNG HIỆU KHÔNG ĐƯỢC TÁCH RA MỘT KHỐI RIÊNG ══════════════════╗
 * ║ Chủ sản phẩm hỏi thẳng: *"chỗ thương hiệu có nên tách ra không nhỉ"*.     ║
 * ║ Không — vì cùng một lý do đã ghi ở `BrandColorPills`: màu và thương hiệu   ║
 * ║ là MỆNH ĐỀ của câu tả bộ kit, y hệt theme và phong cách. Tách ra một khối  ║
 * ║ bên cạnh là dạy người dùng rằng chúng được xử lý theo một đường khác —     ║
 * ║ trong khi prompt sinh ra thì tất cả nằm cùng một câu. Màn hình phải trông  ║
 * ║ giống thứ nó sinh ra.                                                     ║
 * ║ Cái ĐÁNG tách thì đã tách rồi, và nó nằm ở chỗ khác: kho thương hiệu (tên,║
 * ║ màu, logo, linh vật) sống ở `/brands`, không sống trong bản nháp của một   ║
 * ║ dự án. Ở đây chỉ là một con TRỎ tới nó.                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO KHÔNG CÓ CỜ "ĐANG LIÊN KẾT MÀU" ════════════════════════════════
 * Chọn thương hiệu ⇒ màu của nó ĐỔ vào `brandColors`, rồi người dùng sửa tiếp
 * được. Câu hỏi "màu hiện tại có còn là màu của thương hiệu không" trả lời được
 * bằng cách SO HAI MẢNG — không cần một trường `linked` thứ ba, thứ chắc chắn
 * sẽ có ngày nói khác với hai mảng ấy. Cùng triết lý với `ComposerState.brandColors`
 * (vai trò suy từ thứ tự, không có trường `role`).
 */

export interface BrandOption {
  id: string;
  name: string;
  /** Màu của thương hiệu, THEO THỨ TỰ VAI TRÒ — xem `ComposerState.brandColors`. */
  colors: string[];
}

/** Một linh vật của thương hiệu, để pill ảnh nhân vật mời chọn. */
export interface BrandMascot {
  assetId: string;
  name: string;
}

/**
 * Dây nối giữa pill và kho thương hiệu — mọi thứ pill cần, không hơn.
 *
 * Pill KHÔNG tự đi lấy dữ liệu: nó sống được cả trong node view TipTap (nơi
 * không có chỗ nào bọc `QueryClientProvider` một cách hiển nhiên) lẫn trong câu
 * React thuần. Nơi biết cách hỏi kho là `prompt-canvas/lib/brand-binding.ts`.
 */
export interface BrandBinding {
  brands: BrandOption[];
  /** Id đang chọn; rỗng = không theo thương hiệu nào. */
  brandId: string;
  /** Tên của thương hiệu đang chọn — rỗng khi không theo cái nào. */
  name: string;
  /** Màu trong tài liệu đã KHÁC màu của thương hiệu đang chọn chưa. */
  colorsEdited: boolean;
  /** Đang chép ảnh của thương hiệu vào dự án. */
  busy: boolean;
  /** Linh vật của thương hiệu đang chọn — pill ảnh nhân vật mời chúng. */
  mascots: BrandMascot[];
  pick: (brandId: string) => void;
  /** Lấy lại đúng bộ màu của thương hiệu, bỏ mọi chỉnh tay. */
  restoreColors: () => void;
  /** Chép một asset thư viện vào `refs/` của dự án (có nhớ, không tải lại). */
  copyAsset: (assetId: string) => Promise<PillImage>;
  /** Mở màn quản lý kho thương hiệu; vắng ⇒ menu không bày mục ấy. */
  manage?: () => void;
}

/** Chữ trên pill khi chưa theo thương hiệu nào — nói TRẠNG THÁI, không nói tên trục. */
export const NO_BRAND_LABEL = "không theo thương hiệu";

export function BrandPickerPill({ binding }: { binding: BrandBinding }) {
  const menu = useMenuFlip();
  const current = binding.brands.find((brand) => brand.id === binding.brandId);
  /* Id trỏ vào một thương hiệu đã bị xoá khỏi kho ⇒ hiện `binding.name` (bộ dịch
     giữ lại tên cuối cùng biết được), còn không thì nói thẳng là không theo cái
     nào. Im lặng đổi về "không theo thương hiệu" là xoá một lựa chọn người dùng
     đã bấm mà không báo. */
  const label = current?.name || binding.name || NO_BRAND_LABEL;

  const choose = (id: string) => {
    binding.pick(id);
    menu.setOpen(false);
  };

  return (
    <span className="relative inline-block">
      <PillButton
        active={menu.open}
        muted={!binding.brandId}
        onClick={menu.toggle}
        aria-haspopup="listbox"
        aria-expanded={menu.open}
        aria-label={`Thương hiệu: ${label}`}
      >
        {binding.busy && <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />}
        <span className="max-w-56 truncate">{label}</span>
        {/* «màu đã sửa» chỉ hiện khi CÓ thương hiệu: không theo thương hiệu nào thì
            không có gì để lệch, và một nhãn cảnh báo vô cớ dạy người ta bỏ qua nó. */}
        {binding.brandId !== "" && binding.colorsEdited && (
          <span className="shrink-0 rounded-full bg-warn/[var(--kg-tint-b)] px-1.5 text-caption text-fg-muted">
            màu đã sửa
          </span>
        )}
        <PillCaret />
      </PillButton>

      {menu.open && (
        <PillMenu label="Chọn thương hiệu" dropUp={menu.dropUp} onClose={() => menu.setOpen(false)}>
          <PillMenuItem selected={!binding.brandId} onSelect={() => choose("")}>
            <span className="text-fg-muted">— {NO_BRAND_LABEL} —</span>
          </PillMenuItem>

          {binding.brands.map((brand) => (
            <PillMenuItem key={brand.id} selected={brand.id === binding.brandId} onSelect={() => choose(brand.id)}>
              <span className="inline-flex shrink-0 items-center gap-0.5">
                {/* Màu thật chỉ có thể đến từ `style`: nó là dữ liệu người dùng
                    nhập, không phải một token thiết kế — cùng ngoại lệ đã khai ở
                    `BrandColorPills`. Ba chấm là đủ để nhận ra một bộ nhận diện. */}
                {brand.colors.slice(0, 3).map((hex, at) => (
                  <span
                    key={at}
                    aria-hidden
                    className="size-3 rounded-full border border-line-subtle"
                    style={{ backgroundColor: hex }}
                  />
                ))}
              </span>
              <span className="min-w-0 flex-1 truncate text-fg-strong">{brand.name}</span>
            </PillMenuItem>
          ))}

          {binding.brandId !== "" && binding.colorsEdited && (
            <>
              <div aria-hidden className="my-1 h-px bg-line-subtle" />
              <PillMenuItem
                onSelect={() => {
                  binding.restoreColors();
                  menu.setOpen(false);
                }}
              >
                <RotateCcw aria-hidden className="size-4 shrink-0 text-fg-muted" />
                <span className="text-fg-strong">Lấy lại màu của thương hiệu</span>
              </PillMenuItem>
            </>
          )}

          {binding.manage && (
            <>
              <div aria-hidden className="my-1 h-px bg-line-subtle" />
              <PillMenuItem
                onSelect={() => {
                  menu.setOpen(false);
                  binding.manage?.();
                }}
              >
                <Settings2 aria-hidden className="size-4 shrink-0 text-fg-muted" />
                <span className="text-fg-strong">Quản lý thương hiệu…</span>
              </PillMenuItem>
            </>
          )}
        </PillMenu>
      )}
    </span>
  );
}
