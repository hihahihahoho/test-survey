import { z } from "zod";
/**
 * kit-core/lib/form-model.ts — TÁM TRỤC PHONG CÁCH + hình dạng giá trị của một bộ kit.
 *
 * 08/09/2026 — file này ĐỔI NHÀ từ `features/kit-form/lib/` sang đây. Form 4 trang
 * (`KitFormScreen`) đã bị xoá cùng đợt dọn prompt-first; thứ SỐNG SÓT là cái schema
 * và bảng trục, vì `kit-core/lib/model`, `kit-core/lib/style-phrases` và
 * `prompt-canvas/lib/composer-to-contract` đều khai kiểu theo nó.
 * `briefToForm()` đi cùng form (nó dịch bộ trả lời intake của `features/docs` — tầng
 * ấy cũng đã bị xoá), nên tên "form" nay chỉ còn là tên lịch sử của HÌNH DẠNG dữ liệu.
 */
import { NEUTRAL_PRIMARY_COLOR, NEUTRAL_SECONDARY_COLOR } from "@/lib/types/contract";

/* THỨ TỰ Ở ĐÂY = thứ tự câu trong `buildStylePrompt`. Thêm trục thì thêm vào CUỐI:
   trục mới chèn giữa sẽ đổi câu prompt của mọi bản nháp cũ mà không ai đụng vào chúng.
   `ornament` (trang trí) là trục thứ 8, thêm 24/08 — xem `style-phrases.ts`. */
export const STYLE_AXIS_IDS = ["age", "energy", "lux", "era", "gender", "detail", "outline", "ornament"] as const;
export type StyleAxisId = (typeof STYLE_AXIS_IDS)[number];

const slider = z.number().int().min(1).max(7);
export const kitFormSchema = z.object({
  name: z.string().trim().min(2, "Nhập tên bộ kit để tiếp tục.").max(80),
  hasCharacter: z.boolean(),
  character: z.object({ species: z.string().max(120), traits: z.string().max(180), costume: z.string().max(180) }),
  style: z.object({ age: slider, energy: slider, lux: slider, era: slider, gender: slider, detail: slider, outline: slider, ornament: slider }),
  primary: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Nhập màu dạng #RRGGBB."),
  secondary: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Nhập màu dạng #RRGGBB."),
  avoid: z.string().max(300),
  stylePrompt: z.string().max(800),
  backgroundCount: z.number().int().min(0).max(8),
  poseCount: z.union([z.literal(4), z.literal(16)]),
  items: z.array(z.string()).max(16),
  characterRefUploaded: z.boolean(),
});
export type KitFormValues = z.infer<typeof kitFormSchema>;

export const DEFAULT_VALUES: KitFormValues = {
  name: "", hasCharacter: false,
  character: { species: "", traits: "", costume: "" },
  style: { age: 4, energy: 4, lux: 4, era: 4, gender: 4, detail: 4, outline: 4, ornament: 4 },
  /* §BUG-1 — cặp màu khởi tạo của form là MỰC/XÁM TRUNG TÍNH của app, không phải nhận
     diện của một thương hiệu có thật (trước đây là `#005BAA`/`#00B0F0` của VNPAY, dán
     vào form của mọi người dùng). Vẫn là hex thật chứ không phải token CSS: đây là DỮ
     LIỆU brand của bộ kit, nó đi vào contract. Xem `lib/types/contract.ts`. */
  primary: NEUTRAL_PRIMARY_COLOR, secondary: NEUTRAL_SECONDARY_COLOR, avoid: "", stylePrompt: "",
  backgroundCount: 1, poseCount: 4, items: [], characterRefUploaded: false,
};
