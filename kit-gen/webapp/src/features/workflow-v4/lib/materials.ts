/**
 * materials.ts — CHẤT LIỆU CỦA MỘT Ô, dạng preset chọn được.
 *
 * ┌── VÌ SAO CÓ FILE NÀY ────────────────────────────────────────────────────┐
 * │ Ý kiến 4 của team ("đục nền theo material") ban đầu chỉ là một dòng GỢI Ý:│
 * │ spec có chữ "kính" thì nhắc người dùng bấm nút Trong suốt. Đó là đường    │
 * │ BỊ ĐỘNG — nó chỉ đọc chữ có sẵn và đoán. Chủ sản phẩm xin thêm đường CHỦ  │
 * │ ĐỘNG: một danh mục chất liệu bấm là ra, kính · băng · lửa · phát sáng ·   │
 * │ gradient · kim loại vàng…                                                │
 * │                                                                          │
 * │ Hai đường KHÔNG loại trừ nhau và cố ý giữ cả hai:                        │
 * │   · preset  = người dùng NÓI chất liệu ⇒ ta nối chữ + áp cách tách;      │
 * │   · gợi ý   = mô tả đã LỠ nói chất liệu ⇒ ta nhắc, không tự bấm hộ.      │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ══ HAI TRƯỜNG, HAI VIỆC — ĐỌC KỸ TRƯỚC KHI GỘP ═════════════════════════════
 *  · `en` đi vào **PROMPT** (nối vào `spec` của ô, xem `resolveElementSpec()`);
 *  · `suggestedMatte` đi vào **CÁCH TÁCH** (`skel.matte`, thứ `slice.py` đọc).
 * Một chất liệu trong suốt phải nói cả hai: nếu chỉ nối chữ "made of glass" mà
 * `matte` vẫn rỗng thì máy vẽ vẽ kính ĐỤC (prompt không có hợp đồng alpha) và
 * slicer cắt nó như một mảng đặc — đúng cái bệnh `research-glow-extraction` gọi
 * tên. Vì thế mọi preset đều khai `suggestedMatte`, kể cả chất liệu ĐỤC (`"none"`):
 * đổi từ kính sang gỗ mà độ trong còn kẹt lại là một ô gỗ nhìn xuyên qua được.
 *
 * ⚠️ `suggestedMatte` là GỢI Ý ÁP SẴN, không phải khoá: popup vẫn còn nguyên ba nút
 * "Nền thường / Hiệu ứng phát sáng / Trong suốt" và người dùng bấm sau là thắng.
 */
import type { SkelMatteChoice } from "./model";

export interface MaterialPreset {
  /** Id ỔN ĐỊNH — thứ được lưu vào bản nháp. Không slug từ tên tiếng Việt. */
  id: string;
  /** Nhãn tiếng Việt hiện trên UI. */
  vi: string;
  /** Cụm tiếng Anh NỐI VÀO `spec` của ô khi dựng contract. */
  en: string;
  /** Cách tách được áp sẵn khi chọn preset này. Xem khối trên. */
  suggestedMatte: SkelMatteChoice;
}

/**
 * Danh mục chất liệu. Chữ `en` viết theo giọng art-direction (chất liệu + bề mặt +
 * ánh sáng), vì `gen.sh` chèn `spec` NGUYÊN VĂN vào dòng `N) {spec}` — mỗi tính từ
 * thừa là một chi tiết máy vẽ phải chiều, mỗi tính từ thiếu là một ô vẽ đại khái.
 */
export const MATERIAL_PRESETS: readonly MaterialPreset[] = [
  { id: "glass", vi: "Kính", en: "made of clear polished glass, crisp specular highlights", suggestedMatte: "glass" },
  /* "Kính nhám", KHÔNG phải "Kính mờ": ba mức độ trong của ô kính (`GLASS_LEVEL_VI`)
     đã dùng đúng chữ "Kính mờ", và hai control nằm cạnh nhau trong CÙNG một popup.
     Hai nút cùng tên trong một hộp thoại là hai nút không phân biệt được — bằng mắt,
     và bằng cả trình đọc màn hình. */
  { id: "frosted-glass", vi: "Kính nhám", en: "made of frosted glass, softly diffused milky surface", suggestedMatte: "glass" },
  { id: "ice", vi: "Băng", en: "carved from translucent glacial ice, frosty surface with a cool inner glow", suggestedMatte: "glass" },
  { id: "fire", vi: "Lửa", en: "wreathed in stylized flames, ember-orange rim light", suggestedMatte: "glow" },
  { id: "glow", vi: "Phát sáng", en: "emitting a soft neon glow, luminous edges", suggestedMatte: "glow" },
  { id: "holographic", vi: "Hologram", en: "an iridescent holographic film, shifting rainbow sheen", suggestedMatte: "glass" },
  { id: "gold-metal", vi: "Kim loại vàng", en: "polished gold metal, warm reflections", suggestedMatte: "none" },
  { id: "candy-gradient", vi: "Kẹo gradient", en: "smooth glossy candy gradient finish", suggestedMatte: "none" },
  { id: "wood", vi: "Gỗ", en: "carved from warm natural wood, visible grain and soft matte finish", suggestedMatte: "none" },
  { id: "stone", vi: "Đá", en: "chiselled from rough grey stone, chipped edges and matte surface", suggestedMatte: "none" },
];

/** Preset theo id. `null` cho chuỗi TỰ GÕ (và cho id lạ của bản nháp đời sau). */
export function materialPreset(material: string | null | undefined): MaterialPreset | null {
  const raw = (material ?? "").trim();
  if (!raw) return null;
  return MATERIAL_PRESETS.find((preset) => preset.id === raw) ?? null;
}

/**
 * Cụm tiếng Anh của một chất liệu đã lưu.
 *
 * Giá trị lưu là **id preset HOẶC chính cụm chữ người dùng tự gõ** — một trường, hai
 * hình dạng. Vì sao không tách thành hai trường `materialId` + `materialText`: hai
 * trường thì luôn có một trạng thái thứ ba vô nghĩa (cả hai cùng có giá trị) và
 * `resolveElementSpec` sẽ phải chọn hộ người dùng. Id preset là `[a-z-]` nên không
 * bao giờ đụng hàng với một câu tiếng Anh có dấu cách.
 */
export function materialPhrase(material: string | null | undefined): string {
  const raw = (material ?? "").trim();
  if (!raw) return "";
  return materialPreset(raw)?.en ?? raw;
}

/** Nhãn hiện trên UI: preset ⇒ tên tiếng Việt; tự gõ ⇒ chính chữ người dùng viết. */
export function materialLabel(material: string | null | undefined): string {
  const raw = (material ?? "").trim();
  if (!raw) return "";
  return materialPreset(raw)?.vi ?? raw;
}
