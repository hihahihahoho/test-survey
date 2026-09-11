import { MATERIAL_PRESETS } from "@/features/kit-core/lib/materials";
import { getPresets, type CatalogRow, type PresetBundle } from "./presets-store";

/**
 * pill-registry.ts — MỘT BẢNG TRA cho mọi pill chọn-một.
 *
 * ┌── VÌ SAO GOM, THAY VÌ MỖI LOẠI PILL MỘT FILE ───────────────────────────┐
 * │ Chín loại pill (theme · phong cách · khung cảnh · không khí · chất liệu │
 * │ · mức trang trí · dáng · biểu cảm · trang phục) khác nhau ĐÚNG ở danh    │
 * │ sách lựa chọn. Hình dạng, cách bấm, cách đi vào prompt đều y hệt. Chín   │
 * │ node ProseMirror + chín node view là chín bản sao của cùng một đoạn code │
 * │ — và chín chỗ để quên khi sửa. Ở đây: một node `optionPill` mang         │
 * │ `{ kind, value }`, còn "kind nào có gì" thì tra ở bảng này.              │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * ══ HAI KIỂU `value`, CỐ Ý ══════════════════════════════════════════════════
 * Danh mục của repo có sẵn hai quy ước và lab KHÔNG bẻ lại chúng:
 *  · id ổn định (`material`, `pose`, `style`) — chữ EN tra ra từ id;
 *  · chính CỤM TIẾNG ANH (`expression`, `outfit`, theo `PhraseOption` của
 *    poses.ts) — vì hai ô đó bên kit-core có đường TỰ GÕ, mà chuỗi tự gõ
 *    thì không có id nào để đặt.
 * `phraseOf()` che khác biệt đó đi, nên chỗ gọi không cần biết.
 *
 * ══ 09/2026 — MỌI DANH SÁCH ĐÃ RỜI FILE NÀY ═══════════════════════════════
 * Trước lượt này, khung cảnh · không khí · bố cục nằm CỨNG ngay trong file, và
 * bảy trục còn lại đọc thẳng bảng hằng ở `glaze.ts`/`poses.ts`/`pose-state.ts`.
 * Hệ quả: người dùng chỉ sửa được danh mục phong cách. Nay mọi `kind` đọc kho
 * (`presets-store`), còn bảng hằng lùi về làm hạt giống (`catalog-seeds.ts`) —
 * nên `pillOptions` sửa ở màn «Thư viện prompt» là pill trên `/k/:id` đổi theo.
 * File này chỉ còn giữ thứ KHÔNG PHẢI dữ liệu: tên trục, chữ placeholder, và
 * bốn câu hỏi về hành vi (`takesImage`, `hasBlankChoice`, `inheritsWhenEmpty`).
 */

export type PillKind =
  | "theme"
  | "style"
  | "scene"
  | "mood"
  /**
   * BỐ CỤC của thẻ Background — "chừa chỗ nào cho UI, dồn chi tiết vào đâu".
   *
   * ╔══ VÌ SAO NÓ THAY CHO PILL ẢNH CŨ ════════════════════════════════════════╗
   * ║ Câu Background trước đây kết bằng «tham chiếu [🖼]» — một pill ảnh trần,   ║
   * ║ không nói ảnh ấy đóng vai gì. Người dùng đính vào đó cả hai loại ảnh khác ║
   * ║ hẳn nhau: ảnh CẢNH ("vẽ giống cái này") và ảnh PHÁC BỐ CỤC ("xếp chỗ như  ║
   * ║ thế này"), rồi máy vẽ chép luôn nét vẽ nguệch ngoạc của bản phác.         ║
   * ║ Nay bố cục là một pill ĐÚNG NGHĨA với ba nguồn: chọn sẵn, đính bản phác   ║
   * ║ (đi vào `sheet.layoutRef`, `gen.sh` nói rõ "chỉ chép CHỖ ĐẶT"), hoặc gõ   ║
   * ║ một câu riêng. Ảnh cảnh vẫn vào `sheet.ref` như cũ, qua pill khung cảnh.  ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  | "layout"
  /**
   * ĐỤC NỀN — pill thay cho `material` từ 08/2026. Xem `glaze.ts`.
   */
  | "glaze"
  /**
   * CHẤT LIỆU — **DI SẢN, chỉ để ĐỌC**. Không còn menu `/` nào chèn nó và không
   * còn dòng element nào sinh ra nó; nhưng nó đang nằm trong câu tự do của những
   * dự án có thật, và một `kind` bị xoá khỏi bảng này là một pill hiện ra chữ
   * trần rồi rụng khỏi prompt mà không ai báo. Giữ để đọc, không quảng cáo.
   */
  | "material"
  /**
   * LƯỢNG TRANG TRÍ của một ô — không · ít · vừa · nhiều (`DECOR_LEVELS`).
   *
   * Tên `kind` giữ nguyên chữ `decor` dù thang bên dưới đã đổi hẳn câu hỏi (từ
   * "viền dày bao nhiêu" sang "trang trí nhiều ít"): `kind` nằm trong attrs của
   * mọi node pill ĐÃ LƯU trên đĩa, và đổi nó là làm mọi câu tự do đời trước hiện
   * ra pill không tra được. Nhãn thì đổi — «Trang trí», ở `NOUN`.
   */
  | "decor"
  /**
   * BỐ TRÍ chỗ trang trí — cân đối · lệch trái · lệch phải · ngẫu nhiên.
   *
   * ╔══ PILL DUY NHẤT CÓ THỂ VẮNG MẶT KHỎI DÒNG ELEMENT ═══════════════════════╗
   * ║ Nó chỉ có nghĩa khi ô CÓ trang trí: hỏi "xếp hoa văn ở đâu" cho một ô vừa ║
   * ║ tuyên bố "không hoa văn nào" là mời máy vẽ hoà giải hai câu ngược nhau —  ║
   * ║ và nó hoà giải bằng cách vẽ vài bông hoa. Luật ẩn/hiện nằm ở đúng MỘT chỗ ║
   * ║ (`hasDecorPlacement`), xem lý do trong `presets-store.ts`.                ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  | "decorPlace"
  | "pose"
  /**
   * GÓC MÁY của một dòng dáng trên thẻ Nhân vật. Danh mục là `CAMERA_VIEWS` của
   * `lib/pose/pose-state.ts` — CÙNG bảng mà manơcanh 3D dùng để đặt camera, nên chữ đi vào prompt
   * và tấm ảnh đính kèm luôn nói về một góc. Hai bảng là hai thứ sẽ lệch nhau.
   */
  | "view"
  | "expression"
  | "outfit"
  /**
   * NHÂN VẬT của câu đầu thẻ Nhân vật — "con này là ai".
   *
   * ╔══ VÌ SAO NÓ LÀ MỘT PILL CHỌN-MỘT, KHÔNG PHẢI MỘT Ô CHỌN ẢNH ═════════════╗
   * ║ Bản trước câu đầu thẻ là «Tạo nhân vật [🖼 ảnh]» — một pill ảnh, và hết.  ║
   * ║ Chủ sản phẩm nhìn màn và nói: *"tạo nhân vật cũng sẽ cho chọn theo thương ║
   * ║ hiệu ấy, thay vì fix sẵn up ảnh luôn"*. Đúng: "ai" trả lời được bằng ba   ║
   * ║ thứ — một nhân vật mẫu trong danh mục, một tấm ảnh, hoặc một câu tả. Đóng ║
   * ║ cứng vào ảnh là bắt người chưa có ảnh phải đi vẽ một tấm trước khi dùng   ║
   * ║ được công cụ vẽ. Nên nó là pill chọn-một y như theme/phong cách, và ảnh   ║
   * ║ chỉ là MỘT trong ba nguồn của cùng cái pill ấy.                          ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  | "mascot";

export interface PillOption {
  /** Thứ nằm trong attrs của node. */
  value: string;
  /** Nhãn tiếng Việt hiện trên pill và trong menu. */
  vi: string;
  /** Cụm tiếng Anh đi vào prompt. */
  en: string;
  /** Dòng ghi chú phụ trong hộp chọn — không đi vào prompt. */
  hint?: string;
}

/**
 * Giá trị "KẾ THỪA NGỮ CẢNH CHUNG" — chuỗi rỗng.
 *
 * Dùng cho `style` và `outfit`: ô để trống nghĩa là "lấy theo theme/phong cách
 * tổng ở đầu tài liệu". Vì sao là chuỗi rỗng chứ không phải một id `"inherit"`:
 * rỗng là mặc định TỰ NHIÊN của một attr, nên một ô chưa ai đụng tới đã đúng
 * ngay — không cần code khởi tạo, và không có trạng thái thứ ba "chưa set".
 */
export const INHERIT = "";

/** Chữ hiện trên pill khi giá trị rỗng và kind KHÔNG có nghĩa kế thừa. */
const PLACEHOLDER: Record<PillKind, string> = {
  theme: "chủ đề",
  /* «theo chung», KHÔNG phải «theo phong cách chung». Cùng nghĩa, ngắn hơn 11 ký
     tự — và 11 ký tự ở đây là chuyện bố cục có thật: pill này đứng trong hàng
     một-dòng của dòng element, sau nhãn trục «Phong cách:». Để nguyên chuỗi cũ
     là pill đọc ra «Phong cách: theo phong cách chung» — nói hai lần cùng một
     chữ, và dài tới mức ba pill còn lại bị cắt cụt. Menu vẫn ghi đầy đủ
     («— theo cái chung —»), nên nghĩa không mất đi đâu. */
  style: "theo chung",
  scene: "khung cảnh",
  mood: "không khí",
  layout: "bố cục",
  /* «đục hoàn toàn» — chuỗi này phải nói ĐÚNG thứ sẽ xảy ra với một ô rỗng, và từ
     11/09/2026 mọi cửa đọc đưa rỗng về `solid` (`glazeOrSolid`), không còn về `auto`.
     Nó chỉ tới được mắt người dùng qua một bản nháp lạ chưa đi qua `readCell`. */
  glaze: "đục hoàn toàn",
  material: "chất liệu",
  decor: "trang trí",
  decorPlace: "bố trí",
  pose: "dáng",
  view: "góc máy",
  expression: "biểu cảm",
  outfit: "theo theme chung",
  mascot: "chọn nhân vật",
};

/**
 * TÊN GỌI của trục, dùng trong nhãn trợ năng («Nguồn cho phong cách»).
 *
 * Không dùng lại `PLACEHOLDER`: chữ ở đó là chữ hiện TRÊN PILL khi để trống, nên
 * nó nói TRẠNG THÁI («theo chung», «không đục», «chọn nhân vật»). Ghép nó vào một
 * câu là ra "Nguồn cho theo chung" — trình đọc màn hình đọc đúng câu ấy. Hai việc
 * khác nhau thì hai bảng, kể cả khi vài ô trùng chữ.
 */
const NOUN: Record<PillKind, string> = {
  theme: "chủ đề",
  style: "phong cách",
  scene: "khung cảnh",
  mood: "không khí",
  layout: "bố cục",
  glaze: "đục nền",
  material: "chất liệu",
  decor: "trang trí",
  decorPlace: "bố trí",
  pose: "dáng",
  view: "góc máy",
  expression: "biểu cảm",
  outfit: "trang phục",
  mascot: "nhân vật",
};

/** Tên trục để ghép vào câu — xem `NOUN`. */
export function nounOf(kind: PillKind): string {
  return NOUN[kind];
}

/**
 * Danh sách lựa chọn của một kind.
 *
 * `presets` truyền vào chứ không tự gọi `getPresets()`: hàm này phải THUẦN để
 * test được, và `style` là kind DUY NHẤT đọc kho người dùng — kho đó đổi khi ai
 * đó sửa ở trang preset, nên nó phải là tham số, không phải biến toàn cục ẩn.
 */
export function pillOptions(kind: PillKind, presets: PresetBundle = getPresets()): PillOption[] {
  const rows = catalogRowsOf(kind, presets);
  /* DÒNG ẨN BIẾN KHỎI MENU, nhưng KHÔNG biến khỏi phép tra — xem `lookupOptions`.
     Hai cửa, hai câu hỏi: "bày cho người dùng chọn cái gì" và "giá trị đã lưu này
     tên là gì". Trộn chúng vào một hàm thì ẩn một dòng đồng nghĩa với việc mọi câu
     đang dùng dòng ấy hiện ra một id trần — tức là ẩn hoá ra chính là xoá. */
  if (rows !== null) return rows.filter((row) => !row.hidden).map(toOption);

  switch (kind) {
    case "style":
      return presets.styles.map((preset) => ({ value: preset.id, vi: preset.vi, en: preset.en }));

    case "material":
      return MATERIAL_PRESETS.map((preset) => ({ value: preset.id, vi: preset.vi, en: preset.en }));

    /**
     * KHÔNG KHÍ — **DI SẢN, chỉ để ĐỌC**, cùng thân phận với `material`.
     *
     * ╔══ VÌ SAO TRẢ RỖNG THAY VÌ XOÁ HẲN `kind` ═══════════════════════════════╗
     * ║ Chủ sản phẩm: *"cảnh nền bỏ cái không khí đi"*. Câu khởi điểm của thẻ    ║
     * ║ Cảnh nền không còn ô ấy, và bộ di trú gỡ nó khỏi câu của dự án cũ. Nhưng ║
     * ║ một `kind` bị xoá khỏi kiểu `PillKind` là mọi chỗ đọc nó thành lỗi biên  ║
     * ║ dịch, còn một pill `mood` sót lại trong một câu TỰ DO (nơi bộ di trú cố  ║
     * ║ ý không đụng vào chữ người dùng) sẽ ném lúc chạy. Trả rỗng thì pill ấy   ║
     * ║ hiện chữ trần và rụng khỏi prompt — im lặng, nhưng KHÔNG làm trắng màn.  ║
     * ╚═════════════════════════════════════════════════════════════════════════╝
     */
    case "mood":
      return [];

    case "mascot":
      /**
       * RỖNG, VÀ ĐÓ LÀ CÂU TRẢ LỜI ĐẦY ĐỦ.
       *
       * ╔══ NHÂN VẬT KHÔNG CÓ DANH MỤC DÙNG CHUNG ═══════════════════════════╗
       * ║ Lượt trước ô này đổ `presets.mascots` ra — «Linh vật chính», «Nhân   ║
       * ║ vật phụ»… Chủ sản phẩm nhìn màn và bác thẳng: *"cái chọn nhân vật    ║
       * ║ này nó chỉ đi theo cái nhận diện thương hiệu thôi, thương hiệu ko có ║
       * ║ con mascot nào thì ko có cái này nhé"*. Đúng: một nhân vật là TÀI    ║
       * ║ SẢN của một thương hiệu cụ thể, không phải một mục trong bảng tra.   ║
       * ║ Nên danh sách chọn sẵn của pill này KHÔNG đến từ đây; nó đến từ kho  ║
       * ║ thương hiệu và được truyền vào bằng `extraGroups`.                   ║
       * ╚═════════════════════════════════════════════════════════════════════╝
       */
      return [];

    /* Mười `kind` còn lại đã được `catalogRowsOf` trả lời ở trên; nhánh này chỉ có
       mặt để `tsc` thấy switch phủ kín kiểu — bỏ nó đi là mất luôn cái cổng ấy. */
    default:
      return [];
  }
}

/**
 * DANH MỤC THÔ của một trục — KỂ CẢ dòng đang ẩn. `null` = trục không đọc kho.
 *
 * Mười trục dưới đây trước 09/2026 mỗi trục đọc một bảng cứng khác nhau (`SCENES`
 * ngay trong file này, `GLAZE_PRESETS`, `POSES`, `CAMERA_VIEWS`…) và hệ quả là chỉ
 * `style` sửa được trên màn. Nay bảng cứng đã lùi về làm HẠT GIỐNG
 * (`catalog-seeds.ts`) và nguồn đọc là kho — một đường, mọi trục.
 */
function catalogRowsOf(kind: PillKind, presets: PresetBundle): readonly CatalogRow[] | null {
  switch (kind) {
    /* `en` của dòng chủ đề là cụm BỘ KIT (mô-típ, màu, biểu tượng), không phải cụm
       trang phục: nó đi vào `## Art style` của MỌI tấm, kể cả tấm 16 nút bấm. Cụm
       trang phục của cùng dòng nằm ở `en2` và chỉ ra khi pill Trang phục để trống —
       xem `themeOutfitEN`. */
    case "theme": return presets.catalogs.theme;
    case "scene": return presets.catalogs.scene;
    case "layout": return presets.catalogs.layout;
    /* DÒNG PHỤ = câu tiếng Anh của nấc, TRỪ nấc `auto`: `en` của nó RỖNG (nó không
       nối chữ nào vào dòng element — luật của nó do `gen.sh` nói một lần cho cả
       tấm), nên dòng phụ ấy nhường cho `hint`, chữ Việt nói bấm vào thì được gì. */
    case "glaze": return presets.catalogs.glaze;
    case "decor": return presets.catalogs.decor;
    case "decorPlace": return presets.catalogs.decorPlace;
    case "pose": return presets.catalogs.pose;
    /* Cùng `id` với `CAMERA_VIEWS` của manơcanh, nên chữ trong prompt và tấm ảnh
       đính kèm không có đường nào để nói hai góc khác nhau. Đó cũng là lý do trục
       này không cho THÊM dòng — xem `FIXED_KINDS`. */
    case "view": return presets.catalogs.view;
    case "expression": return presets.catalogs.expression;
    case "outfit": return presets.catalogs.outfit;
    default: return null;
  }
}

function toOption(row: CatalogRow): PillOption {
  return { value: row.id, vi: row.vi, en: row.en, ...(row.hint ? { hint: row.hint } : {}) };
}

/**
 * BẢNG TRA cho `labelOf`/`phraseOf` — rộng hơn `pillOptions` đúng một điều: nó CÓ
 * cả dòng đang ẩn.
 *
 * ╔══ VÌ SAO ẨN KHÔNG ĐƯỢC PHÉP GIỐNG XOÁ ═══════════════════════════════════╗
 * ║ Ẩn sinh ra làm đường lùi AN TOÀN: "tôi không muốn thấy mục này trong menu ║
 * ║ nữa, nhưng đừng đụng vào những câu đã viết". Nếu phép tra cũng lọc dòng   ║
 * ║ ẩn thì mọi dự án đang dùng dòng ấy lập tức hiện một id trần trên pill và  ║
 * ║ rụng câu khỏi prompt — đúng hậu quả của XOÁ, chỉ khác cái tên nút bấm.    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
function lookupOptions(kind: PillKind, presets: PresetBundle): PillOption[] {
  const rows = catalogRowsOf(kind, presets);
  return rows !== null ? rows.map(toOption) : pillOptions(kind, presets);
}

/**
 * VAI TRÒ của tấm ảnh mà mục «Đính ảnh tham chiếu» của pill này sẽ chèn.
 *
 * ╔══ VÌ SAO CHỈ HAI KIND CÓ MỤC ẤY ═════════════════════════════════════════╗
 * ║ Ảnh chỉ tới được máy vẽ qua ba cửa của contract: `sheet.ref` (ảnh của một  ║
 * ║ tấm), `variant.brand.refs` (logo) và `variant.inspo` (ảnh tả cả bộ kit).   ║
 * ║ Pill trong câu NGỮ CẢNH CHUNG nói về cả bộ kit ⇒ cửa của nó là `inspo`.    ║
 * ║ Pill `decor`/`glaze`/`pose`… thì nói về MỘT Ô, mà một ô không có cửa ảnh   ║
 * ║ riêng nào — bày nút đính ảnh ở đó là hứa một thứ contract không nhận, và   ║
 * ║ tấm ảnh sẽ chết lặng trong tài liệu. Thà không có nút.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export function refRoleOf(kind: PillKind): "theme" | "style" | "" {
  if (kind === "theme") return "theme";
  if (kind === "style") return "style";
  return "";
}

/**
 * Pill này CÓ NHẬN ẢNH không.
 *
 * Rộng hơn `refRoleOf` đúng một ca, và ca ấy đáng được nói ra: pill `mascot`
 * nhận ảnh, nhưng tấm ảnh của nó KHÔNG đi qua `contextRefs` — nó là `sheet.ref`
 * của chính tấm dáng ấy (xem `mascotSheets`). Gộp hai câu hỏi vào một hàm thì
 * hoặc là ảnh nhân vật bị đẩy nhầm vào `variant.inspo` của cả bộ kit, hoặc là
 * pill nhân vật mất luôn nấc «Đính ảnh».
 */
export function takesImage(kind: PillKind): boolean {
  /* `layout` là ca THỨ HAI cùng họ với `mascot`: ảnh của nó KHÔNG đi qua
     `contextRefs` (nó không tả cả bộ kit) mà thành `sheet.layoutRef` của đúng tấm
     background ấy — một bản phác bố cục, và `gen.sh` nói rõ với máy vẽ rằng chỉ
     được chép CHỖ ĐẶT từ nó chứ không chép nét vẽ. Xem `PillKind.layout`. */
  return kind === "mascot" || kind === "layout" || refRoleOf(kind) !== "";
}

/**
 * Pill này có mục "để trống" ở đầu danh sách chọn sẵn không.
 *
 * `mascot` là ca DUY NHẤT không có, và lý do không phải thẩm mỹ: mục ấy sinh ra
 * làm ĐƯỜNG LÙI khỏi một danh mục đóng ("lỡ bấm thì bấm lại cái này"). Danh sách
 * của pill nhân vật lại là linh vật của thương hiệu đang chọn — bỏ một linh vật
 * đã chọn nghĩa là bỏ TẤM ẢNH đã chép vào dự án, và đường lùi đúng cho việc ấy đã
 * nằm ở nấc «Đính ảnh» («Bỏ ảnh»). Bày thêm một mục "để trống" ở đây là hai cửa
 * cho một việc, và cửa này thì không nói ra nó sẽ xoá cái gì.
 */
export function hasBlankChoice(kind: PillKind): boolean {
  /* `glaze` là ca THỨ HAI, thêm 08/09/2026 và cùng một lý do "hai cửa cho một
     việc": mục để-trống sinh ra làm ĐƯỜNG LÙI khỏi một danh mục đóng, mà đường lùi
     của trục đục nền nay là những mục có tên hẳn hoi — «Đục hoàn toàn» (nấc mặc
     định từ 11/09/2026, đứng đầu danh sách) và «Tự động» ngay dưới nó. Bày thêm
     «— để trống —» bên trên chúng là hai mục cho cùng một nghĩa (`""` và mục đầu
     bảng ra CÙNG một prompt), và người dùng không có cách nào đoán được chúng khác
     nhau ở đâu. */
  /* `decor` và `decorPlace` là ca THỨ BA và THỨ TƯ, thêm 09/2026, CÙNG một lý do:
     nấc «Không» của trục trang trí là một mục có tên hẳn hoi, và nó nói MẠNH HƠN
     một ô để trống — để trống chỉ là không nói gì (rồi theme tự bơm hoa vào ô, đúng
     cái bệnh đang chữa), còn «Không» là một lệnh cấm viết ra chữ. Hai cửa cho một
     nghĩa thì cửa YẾU HƠN phải đóng. Trục bố trí thì càng rõ: nó luôn có mặc định
     «Cân đối», và một ô để trống ở đó nghĩa là trả lại chỗ đặt hoa văn cho máy vẽ
     tự quyết — tức là đúng cái «hơi random» mà pill này sinh ra để chấm dứt. */
  return kind !== "mascot" && kind !== "glaze" && kind !== "decor" && kind !== "decorPlace";
}

/** Kind này có nghĩa "để trống = kế thừa ngữ cảnh chung" không. */
export function inheritsWhenEmpty(kind: PillKind): boolean {
  return kind === "style" || kind === "outfit";
}

/** Nhãn VI hiện trên pill. Giá trị lạ ⇒ hiện nguyên văn (còn debug được). */
export function labelOf(kind: PillKind, value: string, presets: PresetBundle = getPresets()): string {
  const raw = (value ?? "").trim();
  if (!raw) return PLACEHOLDER[kind];
  return lookupOptions(kind, presets).find((option) => option.value === raw)?.vi ?? raw;
}

/**
 * Cụm tiếng Anh đi vào prompt.
 *
 * Giá trị lạ (preset đã bị xoá ở trang preset, bản nháp đời trước) trả về ""
 * chứ KHÔNG trả về chính id: nhét "gold-metal" vào giữa một câu prompt là gửi
 * cho máy vẽ một chữ nó không hiểu, tệ hơn là không gửi gì.
 * Ngoại lệ là hai kind lưu thẳng cụm chữ (`expression`, `outfit`, `theme`): ở đó
 * giá trị lạ CHÍNH LÀ chữ người dùng tự gõ, nên nó đi vào prompt nguyên văn.
 */
export function phraseOf(kind: PillKind, value: string, presets: PresetBundle = getPresets()): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const hit = lookupOptions(kind, presets).find((option) => option.value === raw);
  if (hit) return hit.en;
  return kind === "expression" || kind === "outfit" || kind === "theme" ? raw : "";
}
