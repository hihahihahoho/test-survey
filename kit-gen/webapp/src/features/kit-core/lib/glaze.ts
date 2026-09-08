/**
 * glaze.ts — «ĐỤC NỀN» CỦA MỘT Ô: một pill, một câu tiếng Anh, hết.
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
 * ║ Thứ CÒN LẠI, thứ prompt tổng KHÔNG nói hộ được, là ĐỘ TRONG của ô. Đó là   ║
 * ║ trục duy nhất đáng một pill, và đây là nó.                                 ║
 * ╚════════════════════════════════════════════════════════════════════════════╝
 *
 * ══ TỪ 08/09/2026: MỘT PRESET = MỘT CÂU, VÀ CHỈ MỘT NƠI NÓI NÓ ═════════════
 * Trước đợt này, đục nền nói HAI LẦN cho cùng một ô: `resolveElementSpec` nối
 * `en` + `GLASS_LEVEL_SPEC[level]` vào mô tả, RỒI `skel.matte` bắt `gen.sh` in
 * thêm một khối "LIGHT EFFECT…" / "SEE-THROUGH ELEMENT…" của riêng nó. Hai bản
 * của cùng một luật, ở hai kho, viết bởi hai người — và không có gì bắt chúng
 * khớp nhau.
 *
 * `skel.matte` là DI SẢN của thời tách nền bằng key: `"glow"` từng nghĩa là "gen
 * ô này trên nền ĐEN rồi `slice.py` giải ngược α = độ sáng", `"glass"` là "để key
 * lộ qua thân rồi giải ngược `C = α·F + (1−α)·K`". Cả hai vế thuật toán đã chết:
 * máy vẽ trả alpha THẬT, `slice.py` chỉ crop theo toạ độ. Cái còn sót lại chỉ là
 * mấy câu tiếng Anh — nên chúng về đây, nơi người dùng NHÌN THẤY chúng trên pill
 * trước khi bấm, và `matte` bị bỏ khỏi contract/engine/agent.
 *
 * ⚠️ LUẬT VIẾT `en`: mỗi câu phải TỰ ĐỨNG ĐƯỢC — nói trọn cách vẽ alpha của ô,
 * vì sau đợt này KHÔNG còn tầng nào nối thêm chữ cho nó nữa. Nhưng nó vẫn chỉ
 * nói về ĐỘ XUYÊN THẤU: một cụm kiểu "carved from translucent glacial ice, frosty
 * surface with a cool inner glow" là chất liệu thẩm mỹ đội lốt độ trong — nó đá
 * nhau với prompt tổng phong cách.
 *
 * Bản nháp / contract ĐỜI CŨ còn `skel.matte` trên đĩa: mọi tầng đọc đều LƯỢC BỎ
 * êm (`mergeElementSkel` ở `kitset-to-contract.ts`, `engineSkel` ở
 * `agent/lib/engine.mjs`), không tầng nào báo lỗi.
 */

export interface GlazePreset {
  /** Id ỔN ĐỊNH — thứ được lưu vào tài liệu. Không slug từ nhãn tiếng Việt. */
  id: string;
  /** Nhãn tiếng Việt trên pill. */
  vi: string;
  /**
   * CÂU TIẾNG ANH DUY NHẤT của preset — thứ được nối vào `spec` của ô và cũng là
   * thứ pill hiện ra làm dòng phụ. Không có mảnh nào của nó nằm ở nơi khác.
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
 *
 * Con số alpha trong ba câu kính KHÔNG phải ước lượng tại chỗ: nó là hợp đồng
 * `gen.sh` đã dùng nhiều tháng ("about 64 out of 255 for a clear pane, up to 128
 * for a strongly tinted one"), nay viết thẳng ra chỗ người dùng đọc được.
 */
export const GLAZE_PRESETS: readonly GlazePreset[] = [
  {
    id: "glass",
    vi: "Kính trong",
    en: "a see-through pane of barely tinted glass drawn at low alpha, about 64 of 255,"
      + " keeping its own tint colour at that alpha; frame, rim and highlights stay fully opaque",
  },
  {
    id: "glass-gradient",
    vi: "Kính gradient",
    /* Chỉ nói ĐỘ TRONG BIẾN THIÊN — không nói màu, không nói bề mặt. */
    en: "a see-through sheet of glass whose alpha fades top to bottom, about 96 of 255 at the top"
      + " down to 0 at the bottom; frame, rim and highlights stay fully opaque",
  },
  {
    id: "ice",
    vi: "Băng",
    en: "a thick translucent body that light passes through, drawn at alpha about 128 of 255,"
      + " keeping its own tint colour at that alpha; frame, rim and highlights stay fully opaque",
  },
  {
    id: "glow",
    vi: "Phát sáng",
    /* Câu này phải HUỶ phản xạ "lấp kín hộp bằng một mặt phẳng liền lạc" — đó mới
       là thứ đẻ ra cái đế caro dưới ô ánh sáng, chứ không phải thiếu lời cấm caro.
       Luật safe zone của `gen.sh` nay đã trung lập (nói về TẦM VỚI, không về sơn
       đặc), nên câu này chỉ còn tả ô, không phải huỷ lệnh của engine. */
    en: "pure light with no surface: the halo keeps its own colour and fades to alpha 0 at its"
      + " edge, and nothing sits behind it — no plate, no black, no checkerboard",
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
 * Cụm tiếng Anh của một đục nền — MỘT NGUỒN cho cả ba chỗ đọc nó: pill (dòng phụ
 * trong menu), prompt copy-dán (`serialize-composer`) và contract
 * (`resolveElementSpec`). Ba chỗ, một chuỗi, không có nhánh điều kiện nào.
 */
export function glazePhrase(id: string | null | undefined): string {
  return glazePreset(id)?.en ?? "";
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
