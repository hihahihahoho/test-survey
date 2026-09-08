import { GLAZE_PRESETS, glazePhrase } from "@/features/kit-core/lib/glaze";
import { MATERIAL_PRESETS } from "@/features/kit-core/lib/materials";
import { EXPRESSIONS, OUTFIT_THEMES, POSES } from "@/features/kit-core/lib/poses";
import { CAMERA_VIEWS } from "@/features/prompt-lab/lib/pose/pose-state";
import { DECOR_LEVELS, getPresets, type PresetBundle } from "./presets-store";

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
  | "decor"
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

/** Khung cảnh của block Background — danh mục riêng của lab. */
const SCENES: readonly PillOption[] = [
  { value: "main-menu", vi: "Màn hình chính", en: "a main menu screen background" },
  { value: "level", vi: "Màn chơi", en: "an in-game level background" },
  { value: "shop", vi: "Cửa hàng", en: "an in-game shop interior background" },
  { value: "map", vi: "Bản đồ", en: "a world map screen background" },
  { value: "result", vi: "Màn kết quả", en: "a level-complete result screen background" },
  { value: "loading", vi: "Màn chờ", en: "a loading screen background" },
];

/**
 * Không khí của tấm background.
 *
 * ╔══ MỖI NẤC PHẢI MANG CHUYỂN ĐỘNG · ÁNH SÁNG · CHIỀU SÂU ══════════════════╗
 * ║ Bản trước mỗi mục là hai chữ tính từ ("a festive celebratory mood, warm    ║
 * ║ lanterns and confetti"). Đo trên ảnh thật: ra một tấm phông tĩnh, đẹp mà   ║
 * ║ chết — không có gì đang chuyển động, không biết nguồn sáng ở đâu, mọi thứ  ║
 * ║ nằm cùng một mặt phẳng. Nền game thì ngược lại: nó phải có thứ ĐANG động   ║
 * ║ (đèn nhấp nháy, mây trôi, sương cuộn), một hướng sáng nói ra được, và ít   ║
 * ║ nhất hai lớp XA/GẦN để lớp UI có chỗ đứng lên trên.                       ║
 * ║ Nên mỗi mục dưới đây là ba mệnh đề theo đúng thứ tự ấy — chữ đời thường,   ║
 * ║ không thuật ngữ nhiếp ảnh, vì máy vẽ đọc "sương cuộn thấp" tốt hơn         ║
 * ║ "atmospheric perspective".                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
const MOODS: readonly PillOption[] = [
  {
    value: "festive",
    vi: "Rộn ràng",
    en: "a festive celebratory mood: lanterns blinking overhead, confetti drifting down through the air, fireworks going off far behind the rooftops",
  },
  {
    value: "calm",
    vi: "Yên bình",
    en: "a calm peaceful mood: clouds drifting slowly across the sky, slanted sunlight falling over the ground, dust motes floating close to the viewer",
  },
  {
    value: "epic",
    vi: "Hoành tráng",
    en: "an epic dramatic mood: strong rim light along every edge, dust and haze hanging in the air, god rays reaching down into the far distance",
  },
  {
    value: "cozy",
    vi: "Ấm cúng",
    en: "a cosy intimate mood: a warm lamp glowing in the near foreground, its light spreading over everything around it, snow falling outside the window behind",
  },
  {
    value: "mysterious",
    vi: "Bí ẩn",
    en: "a mysterious mood: fog curling low over the ground, cold moonlight coming from behind, fireflies blinking in the middle distance",
  },
  {
    value: "night",
    vi: "Sôi động ban đêm",
    en: "a busy night mood: neon signs glowing along the street, their colours reflected in the wet ground underfoot, headlights streaking past far behind",
  },
  {
    value: "dawn",
    vi: "Bình minh",
    en: "an early dawn mood: a low warm sun just breaking the horizon, mist lifting slowly off the ground, birds crossing the far sky",
  },
  {
    value: "sunset",
    vi: "Hoàng hôn",
    en: "a golden-hour sunset mood: long orange light raking across everything, warm haze thickening with distance, dark silhouettes along the far horizon",
  },
];

/**
 * Bố cục của tấm background — CHỖ NÀO ĐỂ TRỐNG cho UI, chi tiết dồn vào đâu.
 *
 * Mỗi cụm EN nói ra hai vế ấy bằng số phần khung cụ thể ("the middle third"),
 * không nói bằng tính từ ("balanced"): một tấm nền game hỏng hay không là ở chỗ
 * cái nút bấm sắp đặt lên nó có nằm trên một vùng rối rắm hay không.
 */
const LAYOUTS: readonly PillOption[] = [
  {
    value: "center-clear",
    vi: "thoáng giữa",
    hint: "chỗ đặt UI",
    en: "composition: keep the middle third of the frame open and low in detail so UI can sit there, and concentrate the detail along the top and bottom edges",
  },
  {
    value: "top-clear",
    vi: "thoáng phía trên",
    en: "composition: keep the upper third of the frame open and low in detail so UI can sit there, and concentrate the detail in the lower half",
  },
  {
    value: "bottom-clear",
    vi: "thoáng phía dưới",
    en: "composition: keep the lower third of the frame open and low in detail so UI can sit there, and concentrate the detail in the upper half",
  },
  {
    value: "full",
    vi: "kín toàn khung",
    en: "composition: detail spread evenly across the whole frame, with no area held back for UI",
  },
  {
    value: "low-horizon",
    vi: "chân trời thấp",
    en: "composition: horizon low in the frame with a wide open sky above it, and the detail concentrated along the bottom",
  },
  {
    value: "high-horizon",
    vi: "chân trời cao",
    en: "composition: horizon high in the frame with a wide open foreground below it, and the detail concentrated along the top",
  },
];

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
  /* "Không đục" chứ không phải "đục nền": pill để trống phải nói TRẠNG THÁI đang
     có (ô đặc), không nói tên của trục. Nhãn trục đã nằm ngay bên trái pill. */
  glaze: "không đục",
  material: "chất liệu",
  decor: "mức viền",
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
  decor: "mức viền",
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
  switch (kind) {
    case "theme":
      /* `kitEN`, KHÔNG phải `value`: pill này nói về CẢ BỘ KIT (mô-típ, màu, biểu
         tượng) và cụm của nó đi vào `## Art style` của mọi tấm. `value` là cụm
         TRANG PHỤC — nó vẫn là id ổn định của mục, và vẫn được pill `outfit` dùng
         đúng nghĩa của nó ở dưới. Xem `ThemeOption.kitEN`. */
      return OUTFIT_THEMES.map((option) => ({ value: option.value, vi: option.label, en: option.kitEN }));

    case "style":
      return presets.styles.map((preset) => ({ value: preset.id, vi: preset.vi, en: preset.en }));

    case "scene":
      return [...SCENES];

    case "mood":
      return [...MOODS];

    case "layout":
      return [...LAYOUTS];

    case "glaze":
      /* `glazePhrase` chứ không phải `preset.en`: `en` của "Kính trong" RỖNG (câu
         alpha của nấc kính đã nói trọn), và một dòng phụ trống trơn trong menu là
         lời hứa "chọn cái này thì không thêm chữ nào" — sai. */
      return GLAZE_PRESETS.map((preset) => ({ value: preset.id, vi: preset.vi, en: glazePhrase(preset.id) }));

    case "material":
      return MATERIAL_PRESETS.map((preset) => ({ value: preset.id, vi: preset.vi, en: preset.en }));

    case "decor":
      return DECOR_LEVELS.map((level) => ({ value: level.value, vi: level.vi, en: level.en }));

    case "pose":
      /* POSES chỉ có nhãn VI + id. Id VỐN ĐÃ là tiếng Anh ("hold-gift", "view-34")
         nên nó dùng luôn được trong prompt sau khi bỏ gạch nối — không bịa thêm
         một bảng dịch thứ hai để rồi lệch với danh mục gốc. */
      return POSES.map((pose) => ({ value: pose.id, vi: pose.label, en: `a ${pose.id.replace(/-/g, " ")} pose` }));

    case "view":
      /* Đọc THẲNG bảng camera của manơcanh (`lib/pose/pose-state.ts`), không chép một bảng thứ hai sang đây:
         cùng `id` là cùng vị trí máy quay khi dựng ảnh manơcanh, nên chữ trong
         prompt và ảnh đính kèm không có đường nào để nói hai góc khác nhau. */
      return CAMERA_VIEWS.map((view) => ({ value: view.id, vi: view.vi, en: view.en }));

    case "expression":
      return EXPRESSIONS.map((option) => ({ value: option.value, vi: option.label, en: option.value }));

    case "outfit":
      return OUTFIT_THEMES.map((option) => ({ value: option.value, vi: option.label, en: option.value }));

    case "mascot":
      /**
       * RỖNG, VÀ ĐÓ LÀ CÂU TRẢ LỜI ĐẦY ĐỦ.
       *
       * ╔══ NHÂN VẬT KHÔNG CÓ DANH MỤC DÙNG CHUNG ═══════════════════════════╗
       * ║ Lượt trước ô này đổ `presets.mascots` ra — «Linh vật chính», «Nhân   ║
       * ║ vật phụ»… Chủ sản phẩm nhìn màn và bác thẳng: *"cái chọn nhân vật    ║
       * ║ này nó chỉ đi theo cái nhận diện thương hiệu thôi, thương hiệu ko có ║
       * ║ con mascot nào thì ko có cái này nhé"*. Đúng: một nhân vật là TÀI    ║
       * ║ SẢN của một thương hiệu cụ thể, không phải một mục trong bảng tra    ║
       * ║ như «Chibi» hay «Tết». Mời một «Nhân vật phụ» chung chung là mời một ║
       * ║ con không thuộc về ai — và nó lại còn không có ảnh thật để vẽ theo.  ║
       * ║ Nên danh sách chọn sẵn của pill này KHÔNG đến từ đây; nó đến từ kho  ║
       * ║ thương hiệu và được truyền vào bằng `extraGroups` (xem node view của ║
       * ║ `optionPill`). Không có thương hiệu ⇒ không có nấc «Chọn sẵn».       ║
       * ╚═════════════════════════════════════════════════════════════════════╝
       */
      return [];
  }
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
  return kind !== "mascot";
}

/** Kind này có nghĩa "để trống = kế thừa ngữ cảnh chung" không. */
export function inheritsWhenEmpty(kind: PillKind): boolean {
  return kind === "style" || kind === "outfit";
}

/** Nhãn VI hiện trên pill. Giá trị lạ ⇒ hiện nguyên văn (còn debug được). */
export function labelOf(kind: PillKind, value: string, presets: PresetBundle = getPresets()): string {
  const raw = (value ?? "").trim();
  if (!raw) return PLACEHOLDER[kind];
  return pillOptions(kind, presets).find((option) => option.value === raw)?.vi ?? raw;
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
  const hit = pillOptions(kind, presets).find((option) => option.value === raw);
  if (hit) return hit.en;
  return kind === "expression" || kind === "outfit" || kind === "theme" ? raw : "";
}
