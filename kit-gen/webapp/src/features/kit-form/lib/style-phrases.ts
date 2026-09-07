import type { KitFormValues, StyleAxisId } from "./form-model";

/**
 * ⚠️ CỤM TỪ KHÔNG ĐƯỢC CHỨA DẤU PHẨY. `buildStylePrompt` ghép các trục bằng `", "`, nên
 * một dấu phẩy bên trong cụm sẽ tách một trục thành hai mệnh đề — hết đọc ra được
 * "8 trục = 8 mệnh đề" ở đầu ra, và mọi phép đếm (test, và mắt người đọc prompt) lệch.
 * Cần nối hai ý thì dùng "with"/"and", như 8 trục hiện có đang làm.
 */
export interface StyleAxis { id: StyleAxisId; left: string; right: string; phrases: readonly string[] }
export const STYLE_AXES: readonly StyleAxis[] = [
  { id: "age", left: "Chín chắn", right: "Trẻ trung", phrases: ["mature and composed", "refined and adult", "quietly youthful", "balanced in age", "friendly and youthful", "playful and youthful", "very young and playful"] },
  { id: "energy", left: "Sống động, ồn ào", right: "Thư giãn, nhẹ nhàng", phrases: ["high-energy and bustling", "lively busy composition", "bright and active", "balanced energy", "calm and open", "relaxed gentle mood", "very quiet and soothing"] },
  { id: "lux", left: "Sang trọng", right: "Bình dị, gần gũi", phrases: ["premium and luxurious", "polished upscale feel", "tastefully refined", "balanced and welcoming", "warm everyday feel", "humble and approachable", "rustic and down-to-earth"] },
  { id: "era", left: "Hiện đại", right: "Cổ điển", phrases: ["future-facing contemporary style", "clean modern era", "subtly modern", "timeless", "classic-inspired", "traditional vintage character", "deeply nostalgic folk-art era"] },
  { id: "gender", left: "Nam tính", right: "Nữ tính", phrases: ["strong masculine character", "clearly masculine", "slightly masculine", "gender-neutral", "slightly feminine", "clearly feminine", "soft feminine character"] },
  { id: "detail", left: "Nét phẳng", right: "Đổ khối dày", phrases: ["minimal flat shapes", "clean flat shading", "mostly flat with subtle depth", "balanced dimensional shading", "layered dimensional shading", "rich sculpted volume", "deeply modeled dimensional forms"] },
  { id: "outline", left: "Không viền", right: "Viền đậm", phrases: ["no visible outline", "very soft outline", "thin restrained outline", "medium outline", "clear graphic outline", "bold outline", "very bold heavy outline"] },
  /* Trục TRANG TRÍ (feedback team 24/08 §3): "mức chi tiết/hoa văn trên khung UI".
     `detail` đã có nhưng nó nói về ĐỘ DÀY KHỐI (phẳng ↔ đổ khối), không nói gì về
     hoa văn — một khung phẳng vẫn có thể đầy filigree, và một khung đổ khối dày vẫn
     có thể trơn nhẵn. Hai thứ đó lệch nhau nên phải là hai trục, không phải một. */
  { id: "ornament", left: "Tối giản", right: "Cầu kỳ", phrases: ["clean minimal surfaces with no decoration", "nearly bare surfaces with a single accent line", "light trim and a thin border detail on key panels", "moderate decorative trim on frames and corners", "richly trimmed frames with corner motifs and inlays", "ornate frames with layered scrollwork and gem accents", "highly ornate with elaborate decorative flourishes and filigree on every frame"] },
] as const;

/**
 * NẤC GIỮA của một trục — nấc "không nghiêng về bên nào".
 *
 * Cùng con số với `STYLE_AXIS_MID` của `kit-core/lib/model.ts` và `AXIS_MID` của
 * `composer-to-contract.ts`; ba nơi vì ba tầng không import chéo được nhau (model
 * dựng store zustand, bộ dịch composer phải THUẦN). Đổi thang 7 nấc thì đổi cả ba.
 */
export const AXIS_MID = 4;

/**
 * TRỤC NÀY NÓI VỀ CÁI GÌ — ba cụm, và phép chia này quyết định trục nào được IN
 * ra ở tấm nào.
 *
 * ╔══ VÌ SAO PHẢI CHIA, THAY VÌ IN CẢ 8 TRỤC VÀO MỌI TẤM ════════════════════╗
 * ║ `variant.style` được `gen.sh` in nguyên văn vào section `## Art style` của ║
 * ║ MỌI tấm. Đo trên prompt thật: một tấm nút bấm nhận được "clearly feminine, ║
 * ║ friendly and youthful, high-energy and bustling" — ba mệnh đề tả một CON   ║
 * ║ NGƯỜI, dán lên một cái nút. Máy vẽ không có chỗ nào để dùng chúng, nên tốt ║
 * ║ nhất là nhiễu, tệ nhất là nó vẽ một khuôn mặt lên nút.                     ║
 * ║  · `subject` (tuổi · giới · năng lượng) tả NHÂN VẬT ⇒ chỉ tấm nhân vật;    ║
 * ║  · `render` (nét viền · đổ khối · hoa văn) tả CÁCH VẼ ⇒ mọi tấm;           ║
 * ║  · `feel` (sang trọng · thời đại) tả KHÔNG KHÍ CHUNG ⇒ mọi tấm.            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export type AxisGroup = "subject" | "render" | "feel";
export const AXIS_GROUP: Readonly<Record<StyleAxisId, AxisGroup>> = {
  age: "subject",
  gender: "subject",
  energy: "subject",
  outline: "render",
  detail: "render",
  ornament: "render",
  lux: "feel",
  era: "feel",
};

/**
 * Cụm chữ của các trục — BỎ nấc giữa, và bỏ luôn trục ngoài `groups`.
 *
 * ╔══ VÌ SAO NẤC GIỮA KHÔNG ĐƯỢC IN ═════════════════════════════════════════╗
 * ║ Nấc giữa là "người dùng KHÔNG chọn gì" — thanh trượt chưa ai đụng tới. Câu ║
 * ║ của nó ("balanced in age", "timeless", "medium outline") nói với máy vẽ    ║
 * ║ đúng bằng không, nhưng vẫn chiếm chỗ trong prompt và vẫn kéo model về phía ║
 * ║ trung tính — tám mệnh đề trung tính đứng cạnh một câu phong cách thật thì   ║
 * ║ chúng thắng bằng số đông. Chủ sản phẩm: *"khá dài dòng và không chuẩn"*.   ║
 * ║ Không in ⇒ prompt chỉ còn những trục người dùng THẬT SỰ đã kéo.            ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export function styleAxisPhrases(
  style: KitFormValues["style"],
  groups: readonly AxisGroup[] = ["subject", "render", "feel"],
): string[] {
  const out: string[] = [];
  for (const axis of STYLE_AXES) {
    if (!groups.includes(AXIS_GROUP[axis.id])) continue;
    const value = style[axis.id];
    if (value === AXIS_MID) continue;
    const phrase = axis.phrases[value - 1];
    if (phrase) out.push(phrase);
  }
  return out;
}

/**
 * Cụm chữ của ba trục TẢ NHÂN VẬT — chỗ duy nhất chúng được phép đi vào prompt.
 *
 * Rỗng khi cả ba ở nấc giữa, và rỗng là đúng: người dùng chưa nói gì về tuổi,
 * giới hay năng lượng của con này thì prompt cũng không nói.
 */
export function subjectAxisLine(style: KitFormValues["style"]): string {
  return styleAxisPhrases(style, ["subject"]).join(", ");
}

/**
 * CẢ 8 TRỤC, kể cả nấc giữa — bản dành cho Ô SOẠN của form kit đời cũ.
 *
 * Khác `styleAxisPhrases` có chủ ý: ở đó đầu ra đi thẳng vào prompt (ít chữ là
 * tốt), còn ở đây đầu ra là GỢI Ý điền sẵn vào một ô người dùng sẽ sửa — một ô
 * trống trơn khi mọi thanh trượt ở mặc định thì không gợi được gì cả.
 */
export function buildStylePrompt(style: KitFormValues["style"]): string {
  return STYLE_AXES.map((axis) => axis.phrases[style[axis.id] - 1]).join(", ");
}
export function sliderValueText(axis: StyleAxis, value: number): string {
  const lean = value === 4 ? "ở giữa" : `nghiêng về ${value < 4 ? axis.left : axis.right}`;
  return `nấc ${value} trên 7 — ${lean}`;
}
