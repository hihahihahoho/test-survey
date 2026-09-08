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
 *
 * ══ TỪ 08/09/2026 (2): `auto` — MẶC ĐỊNH LÀ «MÁY TỰ QUYẾT THEO VẬT LIỆU» ═════
 * Chủ sản phẩm chốt thêm một nấc, và nó là nấc MẶC ĐỊNH: *"model tự quyết độ trong
 * theo vật liệu của element — kính/băng/ánh sáng thì xuyên thấu bằng alpha thật,
 * kim loại/gỗ/đá thì đục hoàn toàn"*.
 *
 * ⚠️ `auto.en` RỖNG, VÀ ĐÓ LÀ CẢ THIẾT KẾ. Câu của nó đúng với MỌI ô của MỌI tấm,
 * nên in lại nó ở từng dòng element là nói cùng một luật N lần trong một prompt —
 * đúng cái bệnh mà `skel.matte` vừa bị bỏ vì mắc phải. Nó được nói ĐÚNG MỘT LẦN,
 * ở section `## Transparency` của `gen.sh` (gạch đầu dòng thứ ba). Dòng element
 * chỉ mọc thêm chữ khi người dùng chọn một nấc CỤ THỂ — và lúc ấy câu của nấc ấy
 * đè lên luật chung, vì gạch đầu dòng kia mở đầu bằng "unless an element's own
 * line below says otherwise".
 *
 * ⚠️ VÌ THẾ KHÔNG CÓ `solid` NÀO ĐI KÈM CHUỖI RỖNG. Trước đợt này `""` vừa là
 * "chưa chọn" vừa là "nền đặc" — hai nghĩa một giá trị, và nghĩa "đặc" chỉ đứng
 * được nhờ `gen.sh` mặc định mọi ô là đục. Nay mặc định ấy đổi thành "theo vật
 * liệu", nên "đặc" phải TỰ NÓI RA: đó là nấc `solid` («Đục hoàn toàn»), có id, có
 * câu tiếng Anh, bấm được. Còn `""` mất hẳn nghĩa: mọi cửa đọc đều đưa nó về
 * `auto` (`glazeOrAuto`), và pill không còn bày mục «— để trống —» cho trục này
 * (`hasBlankChoice` ở `pill-registry.ts`).
 */

export interface GlazePreset {
  /** Id ỔN ĐỊNH — thứ được lưu vào tài liệu. Không slug từ nhãn tiếng Việt. */
  id: string;
  /** Nhãn tiếng Việt trên pill. */
  vi: string;
  /**
   * CÂU TIẾNG ANH DUY NHẤT của preset — thứ được nối vào `spec` của ô và cũng là
   * thứ pill hiện ra làm dòng phụ. Không có mảnh nào của nó nằm ở nơi khác.
   *
   * RỖNG ở đúng một nấc: `auto`. Rỗng nghĩa là "nấc này KHÔNG nối chữ nào vào
   * dòng element" — luật của nó do `gen.sh` nói một lần cho cả tấm.
   */
  en: string;
  /**
   * DÒNG PHỤ TRONG MENU cho nấc không có `en` — chữ TIẾNG VIỆT, không phải prompt.
   *
   * Chỉ `auto` cần: một mục có nhãn mà dòng phụ trống trơn thì người dùng không có
   * cách nào biết bấm vào nó thì được gì. Không dùng `en` cho việc này, vì `en` là
   * thứ ĐI VÀO PROMPT — nhét chữ mô tả vào đó là in nó ra thật, ở mọi dòng element.
   */
  hint?: string;
}

/** Nấc MẶC ĐỊNH — máy tự quyết theo vật liệu. Id ổn định, đừng gõ lại chuỗi này. */
export const GLAZE_AUTO = "auto";

/**
 * Danh mục ĐỤC NỀN. Thứ tự = thứ tự hiện trên menu: `auto` đứng đầu vì nó là mặc
 * định, rồi phần còn lại đi từ đặc tới trong.
 *
 * Giá trị RỖNG (`""`) KHÔNG nằm trong bảng, và từ 08/09/2026 nó cũng không còn
 * NGHĨA nào: mọi cửa đọc đưa nó về `auto` (`glazeOrAuto`), pill không bày mục
 * «— để trống —» cho trục này. Trước đó `""` gánh hai nghĩa cùng lúc ("chưa chọn"
 * và "nền đặc"); nghĩa thứ hai nay có id riêng là `solid`.
 *
 * Con số alpha trong ba câu kính KHÔNG phải ước lượng tại chỗ: nó là hợp đồng
 * `gen.sh` đã dùng nhiều tháng ("about 64 out of 255 for a clear pane, up to 128
 * for a strongly tinted one"), nay viết thẳng ra chỗ người dùng đọc được.
 */
export const GLAZE_PRESETS: readonly GlazePreset[] = [
  {
    id: GLAZE_AUTO,
    /* «Tự động», KHÔNG phải «Tự động theo vật liệu». Nhãn này hiện TRÊN PILL, trong
       một hàng `flex-nowrap` có sáu thứ khác đứng cạnh (xem `RowTop`): thêm 13 ký
       tự ở đây là bóp cụt ba pill bên phải. Vế "theo vật liệu" không mất đi đâu —
       nó là `hint`, dòng phụ mà menu bày ngay dưới nhãn. Cùng cách xử lý với pill
       «Phong cách: theo chung» (xem `PLACEHOLDER` ở `pill-registry.ts`). */
    vi: "Tự động",
    /* RỖNG CÓ CHỦ Ý — xem khối chú thích đầu file. Câu của nấc này nằm ở
       `gen.sh`, section `## Transparency`, và chỉ nằm ở đó. */
    en: "",
    hint: "máy tự quyết theo vật liệu của ô: kính · băng · ánh sáng thì xuyên thấu, kim loại · gỗ · đá thì đục",
  },
  {
    id: "solid",
    vi: "Đục hoàn toàn",
    /* Nấc này TỒN TẠI ĐỂ CÃI LẠI `auto`, nên câu của nó phải nói rõ "kể cả khi
       trông như kính" — không có vế ấy thì model đọc "một ô kính, fully opaque"
       và tự hoà giải bằng cách vẽ nửa vời. */
    en: "fully opaque everywhere, alpha 255, with no see-through part at all,"
      + " whatever material it may look like",
  },
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
       đặc), nên câu này chỉ còn tả ô, không phải huỷ lệnh của engine.
       08/09/2026: tả điều MUỐN, không gọi tên thứ không muốn — model ảnh đọc
       "no checkerboard" thành gợi ý vẽ caro (chủ sản phẩm đo được). */
    en: "pure light with no surface: the halo keeps its own colour and fades to alpha 0 at its"
      + " edge, and the empty canvas shows through all around it",
  },
];

/**
 * CHUẨN HOÁ MỘT GIÁ TRỊ ĐÃ LƯU: rỗng ⇒ `auto`, còn lại giữ NGUYÊN VĂN.
 *
 * ╔══ VÌ SAO RỖNG ĐỜI CŨ VỀ `auto` CHỨ KHÔNG VỀ `solid` ═════════════════════╗
 * ║ Rỗng đời cũ nghĩa là "người dùng chưa bấm gì" — và cái họ nhìn thấy lúc   ║
 * ║ ấy là một ô do máy tự quyết độ đục, vì `gen.sh` không nhận được câu nào    ║
 * ║ cho ô đó. Đưa nó về `solid` là GHI một lựa chọn mà họ chưa hề bấm, và với ║
 * ║ một ô "cửa sổ kính" thì lựa chọn ấy còn đổi luôn ảnh ra. `auto` giữ đúng   ║
 * ║ trạng thái cũ: chưa ai quyết, để máy quyết.                               ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * Id LẠ (tài liệu của một bản sau) đi qua nguyên vẹn: `glazePreset` sẽ trả `null`
 * cho nó và không ai in thêm chữ nào — thà mất một hiệu ứng còn hơn âm thầm đổi
 * lựa chọn của người dùng thành một thứ khác.
 */
export function glazeOrAuto(id: string | null | undefined): string {
  return (id ?? "").trim() || GLAZE_AUTO;
}

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
 *
 * VÀ KHÔNG PHẢI `"solid"`. Rỗng ở đây rơi tiếp vào `glazeOrAuto` ⇒ `auto`, mà `auto`
 * nhìn thấy "polished gold metal" thì vẽ đục — cùng một tấm ảnh, không cần ta ghi
 * hộ một lựa chọn. Ghi `solid` thì ngược lại: nó sẽ ĐÈ cả những ô mà chất liệu cũ
 * là "kính nhám" nếu mai này bảng dưới đổi.
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
