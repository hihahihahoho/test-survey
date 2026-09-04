import { GLAZE_PRESETS, glazePhrase } from "@/features/kit-core/lib/glaze";
import { MATERIAL_PRESETS } from "@/features/kit-core/lib/materials";
import { EXPRESSIONS, OUTFIT_THEMES, POSES } from "@/features/kit-core/lib/poses";
import { CAMERA_VIEWS } from "@/features/pose-lab/lib/pose-state";
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
   * pose-lab — CÙNG bảng mà manơcanh 3D dùng để đặt camera, nên chữ đi vào prompt
   * và tấm ảnh đính kèm luôn nói về một góc. Hai bảng là hai thứ sẽ lệch nhau.
   */
  | "view"
  | "expression"
  | "outfit";

export interface PillOption {
  /** Thứ nằm trong attrs của node. */
  value: string;
  /** Nhãn tiếng Việt hiện trên pill và trong menu. */
  vi: string;
  /** Cụm tiếng Anh đi vào prompt. */
  en: string;
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

/** Không khí / mood của cảnh nền. */
const MOODS: readonly PillOption[] = [
  { value: "festive", vi: "Rộn ràng", en: "a festive celebratory mood, warm lanterns and confetti" },
  { value: "calm", vi: "Yên bình", en: "a calm peaceful mood, soft diffused daylight" },
  { value: "epic", vi: "Hoành tráng", en: "an epic dramatic mood, strong rim light and deep shadows" },
  { value: "cozy", vi: "Ấm cúng", en: "a cozy intimate mood, warm indoor light" },
  { value: "mysterious", vi: "Bí ẩn", en: "a mysterious moody atmosphere, fog and cool backlight" },
  { value: "sunset", vi: "Hoàng hôn", en: "a golden-hour sunset atmosphere, long orange light" },
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
  /* "Không đục" chứ không phải "đục nền": pill để trống phải nói TRẠNG THÁI đang
     có (ô đặc), không nói tên của trục. Nhãn trục đã nằm ngay bên trái pill. */
  glaze: "không đục",
  material: "chất liệu",
  decor: "mức viền",
  pose: "dáng",
  view: "góc máy",
  expression: "biểu cảm",
  outfit: "theo theme chung",
};

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
      return OUTFIT_THEMES.map((option) => ({ value: option.value, vi: option.label, en: option.value }));

    case "style":
      return presets.styles.map((preset) => ({ value: preset.id, vi: preset.vi, en: preset.en }));

    case "scene":
      return [...SCENES];

    case "mood":
      return [...MOODS];

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
      /* Đọc THẲNG bảng camera của pose-lab, không chép một bảng thứ hai sang đây:
         cùng `id` là cùng vị trí máy quay khi dựng ảnh manơcanh, nên chữ trong
         prompt và ảnh đính kèm không có đường nào để nói hai góc khác nhau. */
      return CAMERA_VIEWS.map((view) => ({ value: view.id, vi: view.vi, en: view.en }));

    case "expression":
      return EXPRESSIONS.map((option) => ({ value: option.value, vi: option.label, en: option.value }));

    case "outfit":
      return OUTFIT_THEMES.map((option) => ({ value: option.value, vi: option.label, en: option.value }));
  }
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
