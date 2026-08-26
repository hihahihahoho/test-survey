/**
 * glaze.ts — «ĐỤC NỀN» CỦA MỘT Ô: một pill, một hiệu ứng alpha.
 *
 * ╔══ VÌ SAO FILE NÀY THAY CHO `materials.ts` Ở TẦNG SOẠN PROMPT ═════════════╗
 * ║ Chủ sản phẩm (dân design) chốt thẳng: *"Chất liệu → bỏ, nó ăn theo style   ║
 * ║ mà. Chỉ có option ĐỤC NỀN: kiểu kính, gradient kính… tạo hiệu ứng, auto    ║
 * ║ đục theo chất liệu (băng thì đục alpha xuyên thấu)."*                      ║
 * ║                                                                            ║
 * ║ Câu ấy bác bỏ đúng một giả định của `materials.ts`: rằng "chất liệu" là     ║
 * ║ một trục người dùng phải chọn cho TỪNG ô. Không phải. Gỗ · đá · kim loại   ║
 * ║ vàng là THẨM MỸ, và thẩm mỹ đến từ prompt tổng phong cách (`variant.style`,║
 * ║ thứ `gen.sh` chèn vào MỌI tấm). Nhắc lại ở từng ô là dạy máy vẽ rằng mỗi   ║
 * ║ element có một chất liệu riêng — ngược hẳn ý "một bộ nhận diện".           ║
 * ║                                                                            ║
 * ║ Thứ CÒN LẠI, thứ prompt tổng KHÔNG nói hộ được, là ĐỘ TRONG của ô: nó      ║
 * ║ quyết định `skel.matte` (thứ `slice.py` đọc để cắt) chứ không chỉ quyết    ║
 * ║ định ô trông thế nào. Đó là trục duy nhất đáng một pill, và đây là nó.     ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 *
 * ══ MỘT LỰA CHỌN = HAI NỬA CỦA CÙNG MỘT HỢP ĐỒNG ═══════════════════════════
 *  · `matte` (+ `glassLevel`) đi vào **CÁCH TÁCH** — `gen.sh` xin nền đen / xin
 *    alpha thật, rồi `slice.py` giải ngược đúng cách ấy;
 *  · `en` đi vào **PROMPT**, và nó CỐ Ý NGẮN: chỉ nói về độ xuyên thấu, không
 *    tả bề mặt. Một cụm dài kiểu "carved from translucent glacial ice, frosty
 *    surface with a cool inner glow" là chất liệu thẩm mỹ đội lốt độ trong — nó
 *    đá nhau với prompt tổng phong cách, và đó chính là thứ vừa bị bỏ.
 * Nói một nửa là hỏng: chỉ nối chữ mà `matte` rỗng ⇒ máy vẽ ra kính ĐỤC và
 * slicer cắt nó như mảng đặc; chỉ đặt `matte` mà không nói chữ ⇒ máy vẽ không
 * biết phải chừa alpha ở đâu.
 */
import type { GlassLevel, SkelMatteChoice } from "./model";

/**
 * Ba mức kính → câu tiếng Anh nối vào `spec`.
 *
 * Con số alpha trong câu KHÔNG phải tôi ước: `gen.sh` (nhánh `matte == "glass"`, mirror
 * ở `item-prompt.ts:glassCellPrompt`) đã ra hợp đồng *"about 64 out of 255 for a clear
 * pane, up to 128 for a strongly tinted one"*. Ba mức này chỉ ĐỊNH VỊ ô trong dải ấy,
 * nên chúng không thể mâu thuẫn với câu kính chung — đó là lý do không cần đụng `gen.sh`.
 *
 * ⚠️ CHUYỂN NHÀ 08/2026: hằng này từng ở `kitset-to-contract.ts` và vẫn được xuất lại
 * từ đó (chỗ gọi cũ không phải đổi). Nó về đây vì nó là NỬA CÒN LẠI của bảng đục nền —
 * mỗi preset kính chỉ nói mình nằm ở nấc nào, còn câu chữ của nấc thì ở đây; hai thứ
 * ở hai file khác nhau là hai thứ sẽ lệch nhau sau đúng một lượt sửa.
 */
export const GLASS_LEVEL_SPEC: Record<GlassLevel, string> = {
  clear: "a clear pane: barely tinted see-through glass, alpha about 64 of 255",
  frosted: "strongly frosted glass: milky diffused surface, alpha about 96 of 255",
  tinted: "strongly tinted glass: deep saturated tint, alpha about 128 of 255",
};

export interface GlazePreset {
  /** Id ỔN ĐỊNH — thứ được lưu vào tài liệu. Không slug từ nhãn tiếng Việt. */
  id: string;
  /** Nhãn tiếng Việt trên pill. */
  vi: string;
  /** Cách tách áp cho ô này. `"none"` = nền đặc, cắt như một mảng thường. */
  matte: SkelMatteChoice;
  /**
   * Mức trong khi `matte === "glass"` — quy về ba nấc alpha mà `gen.sh` đã có hợp
   * đồng sẵn (xem `GLASS_LEVEL_SPEC`). Không có nghĩa với `matte` khác.
   */
  glassLevel?: GlassLevel;
  /**
   * Cụm tiếng Anh NỐI THÊM vào `spec`. Rỗng là hợp lệ và hay gặp: với "Kính
   * trong" thì câu alpha của `GLASS_LEVEL_SPEC` đã nói trọn, thêm chữ nữa chỉ là
   * nói hai lần cùng một điều bằng hai giọng.
   */
  en: string;
}

/**
 * Danh mục ĐỤC NỀN. Thứ tự = thứ tự hiện trên menu, đi từ đặc tới trong.
 *
 * Giá trị RỖNG (`""`) KHÔNG nằm trong bảng: nó là "chưa chọn / nền đặc", tức mặc
 * định tự nhiên của một trường — đúng quy ước `INHERIT` của pill. Có mặt trong
 * bảng thì nó thành một lựa chọn phải bấm mới có, và một ô mới thêm sẽ không có
 * giá trị nào hợp lệ cho tới lúc người dùng bấm.
 */
export const GLAZE_PRESETS: readonly GlazePreset[] = [
  {
    id: "glass",
    vi: "Kính trong",
    matte: "glass",
    glassLevel: "clear",
    /* Rỗng có chủ ý — `GLASS_LEVEL_SPEC.clear` đã là câu tả độ trong đầy đủ. */
    en: "",
  },
  {
    id: "glass-gradient",
    vi: "Kính gradient",
    matte: "glass",
    glassLevel: "frosted",
    /* Chỉ nói ĐỘ TRONG BIẾN THIÊN — không nói màu, không nói bề mặt. */
    en: "its transparency fades from top to bottom",
  },
  {
    id: "ice",
    vi: "Băng",
    matte: "glass",
    glassLevel: "tinted",
    en: "a thick translucent body that light passes through",
  },
  {
    id: "glow",
    vi: "Phát sáng",
    /* `glow` = nền ô lúc gen là ĐEN và `slice.py` tách theo kênh sáng, nên câu
       tiếng Anh phải nói về ÁNH SÁNG TỰ PHÁT — thứ phép tách ấy trông cậy vào. */
    matte: "glow",
    en: "it emits its own light, luminous edges",
  },
];

/** Preset theo id. `null` cho chuỗi rỗng và cho id lạ (tài liệu đời sau). */
export function glazePreset(id: string | null | undefined): GlazePreset | null {
  const raw = (id ?? "").trim();
  if (!raw) return null;
  return GLAZE_PRESETS.find((preset) => preset.id === raw) ?? null;
}

/** Nhãn hiện trên UI. Rỗng ⇒ chuỗi rỗng (nơi gọi tự quyết chữ placeholder). */
export function glazeLabel(id: string | null | undefined): string {
  return glazePreset(id)?.vi ?? "";
}

/**
 * TRỌN cụm tiếng Anh của một đục nền = [câu riêng] + [câu alpha của nấc kính].
 *
 * Đây là thứ MỘT NƠI DUY NHẤT phải dựng: pill hiện nó ra để người dùng thấy trước
 * chữ sẽ tới máy vẽ, và prompt copy-dán (`serialize-composer`) nối nó vào dòng ô.
 * `resolveElementSpec` dựng lại cùng nội dung nhưng CÓ THÊM một cửa: nó chỉ nói câu
 * alpha khi ô THẬT SỰ còn là kính sau khi trộn `matte` — cửa ấy chỉ tồn tại được ở
 * chỗ biết `skel`, nên hai đường không gộp làm một được.
 */
export function glazePhrase(id: string | null | undefined): string {
  const preset = glazePreset(id);
  if (!preset) return "";
  return [preset.en, preset.glassLevel ? GLASS_LEVEL_SPEC[preset.glassLevel] : ""].filter(Boolean).join(", ");
}

/**
 * DI TRÚ: id chất liệu ĐỜI CŨ → đục nền gần nhất.
 *
 * ╔══ VÌ SAO DỊCH LÚC ĐỌC, KHÔNG PHẢI MỘT LƯỢT GHI ĐÈ DỮ LIỆU ═══════════════╗
 * ║ `KitElementSkel.material` và `UiCell.materialId` đang nằm trong bản nháp   ║
 * ║ của những dự án có thật. Một lượt "sửa dữ liệu cho sạch" là ghi đè bản     ║
 * ║ nháp của người dùng bằng suy đoán của ta — và nếu suy đoán sai thì bản gốc ║
 * ║ không còn để đối chiếu. Dịch lúc đọc thì bản gốc vẫn nguyên trên đĩa, và   ║
 * ║ lần đầu người dùng chạm vào pill là giá trị mới được ghi đè bằng lựa chọn  ║
 * ║ CỦA HỌ, không phải của ta.                                                ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Chất liệu ĐỤC (gỗ · đá · kim loại · kẹo gradient) → `""`: chúng nói về thẩm mỹ,
 * và thẩm mỹ nay do prompt tổng lo. Mất chữ ấy là ĐÚNG ý chủ sản phẩm, không phải
 * một lỗ hổng của phép dịch.
 */
const MATERIAL_TO_GLAZE: Record<string, string> = {
  glass: "glass",
  "frosted-glass": "glass-gradient",
  ice: "ice",
  fire: "glow",
  glow: "glow",
  holographic: "glass-gradient",
};

export function glazeFromMaterial(material: string | null | undefined): string {
  const raw = (material ?? "").trim();
  if (!raw) return "";
  /* Chuỗi TỰ GÕ (có dấu cách) không tra bảng được và cũng không nên đoán: nó là
     một câu tả chất liệu, không phải một mức trong. Trả rỗng = "nền đặc". */
  return MATERIAL_TO_GLAZE[raw] ?? "";
}
