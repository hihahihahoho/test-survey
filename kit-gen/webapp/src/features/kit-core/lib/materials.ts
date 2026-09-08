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
 * ══ DI SẢN, MỘT TRƯỜNG DUY NHẤT CÒN VIỆC ═══════════════════════════════════
 * Preset từng khai thêm `suggestedMatte` — cách tách áp sẵn cho `skel.matte`. Khoá
 * ấy đã bị bỏ khỏi mọi tầng (08/09/2026): độ trong của một ô nay CHỈ là chữ trong
 * `spec`, và trục ấy là pill «Đục nền» (`glaze.ts`), không phải chất liệu. Còn lại
 * đúng `en` — cụm chữ mà pill `material` của tài liệu ĐỜI CŨ vẫn đọc được.
 */

export interface MaterialPreset {
  /** Id ỔN ĐỊNH — thứ được lưu vào bản nháp. Không slug từ tên tiếng Việt. */
  id: string;
  /** Nhãn tiếng Việt hiện trên UI. */
  vi: string;
  /** Cụm tiếng Anh NỐI VÀO `spec` của ô khi dựng contract. */
  en: string;
}

/**
 * Danh mục chất liệu. Chữ `en` viết theo giọng art-direction (chất liệu + bề mặt +
 * ánh sáng), vì `gen.sh` chèn `spec` NGUYÊN VĂN vào dòng `N) {spec}` — mỗi tính từ
 * thừa là một chi tiết máy vẽ phải chiều, mỗi tính từ thiếu là một ô vẽ đại khái.
 */
export const MATERIAL_PRESETS: readonly MaterialPreset[] = [
  { id: "glass", vi: "Kính", en: "made of clear polished glass, crisp specular highlights" },
  /* "Kính nhám", KHÔNG phải "Kính mờ": danh mục đục nền (`GLAZE_PRESETS`) đã có
     "Kính trong"/"Kính gradient", và hai pill này nằm cạnh nhau trong CÙNG một câu.
     Hai lựa chọn cùng tên là hai lựa chọn không phân biệt được — bằng mắt, và bằng
     cả trình đọc màn hình. */
  { id: "frosted-glass", vi: "Kính nhám", en: "made of frosted glass, softly diffused milky surface" },
  { id: "ice", vi: "Băng", en: "carved from translucent glacial ice, frosty surface with a cool inner glow" },
  { id: "fire", vi: "Lửa", en: "wreathed in stylized flames, ember-orange rim light" },
  { id: "glow", vi: "Phát sáng", en: "emitting a soft neon glow, luminous edges" },
  { id: "holographic", vi: "Hologram", en: "an iridescent holographic film, shifting rainbow sheen" },
  { id: "gold-metal", vi: "Kim loại vàng", en: "polished gold metal, warm reflections" },
  { id: "candy-gradient", vi: "Kẹo gradient", en: "smooth glossy candy gradient finish" },
  { id: "wood", vi: "Gỗ", en: "carved from warm natural wood, visible grain and soft matte finish" },
  { id: "stone", vi: "Đá", en: "chiselled from rough grey stone, chipped edges and matte surface" },
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
