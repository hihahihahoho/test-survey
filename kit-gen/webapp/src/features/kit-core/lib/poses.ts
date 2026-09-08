/**
 * poses.ts — DANH MỤC DÁNG MASCOT, tách khỏi `steps/MascotStep.tsx`.
 *
 * Vì sao tách: `model.ts` phải biết danh sách dáng để đặt **mặc định chọn hết** (UI-FIX §2),
 * mà `model.ts` import ngược lên một file `steps/` thì thành vòng import (step nào cũng
 * `import { useWorkflowStore } from "../lib/model"`). Danh mục là DỮ LIỆU, nên nó về `lib/`.
 *
 * §W1-7 vẫn nguyên: store giữ **id tiếng Anh**, UI hiện **nhãn tiếng Việt**.
 */
export type PoseGroup = "Cơ bản" | "Cảm xúc" | "Chuyển động" | "Chiến dịch" | "Góc nhìn";

export const POSES = [
  { id: "idle", label: "Đứng chờ", group: "Cơ bản" }, { id: "wave", label: "Vẫy tay", group: "Cơ bản" },
  { id: "point", label: "Chỉ tay", group: "Cơ bản" }, { id: "present", label: "Giới thiệu", group: "Cơ bản" },
  { id: "cheer", label: "Ăn mừng", group: "Cảm xúc" }, { id: "sad", label: "Buồn", group: "Cảm xúc" },
  { id: "think", label: "Suy nghĩ", group: "Cảm xúc" }, { id: "thumbs-up", label: "Giơ ngón cái", group: "Cảm xúc" },
  { id: "run", label: "Chạy", group: "Chuyển động" }, { id: "walk", label: "Đi bộ", group: "Chuyển động" },
  { id: "jump", label: "Nhảy", group: "Chuyển động" }, { id: "dance", label: "Nhảy múa", group: "Chuyển động" },
  { id: "hold-gift", label: "Ôm quà", group: "Chiến dịch" }, { id: "bow", label: "Cúi chào", group: "Chiến dịch" },
  { id: "sit", label: "Ngồi", group: "Chiến dịch" }, { id: "fly", label: "Bay", group: "Chiến dịch" },
  { id: "view-34", label: "Góc 3/4", group: "Góc nhìn" }, { id: "view-side", label: "Nhìn ngang", group: "Góc nhìn" },
  { id: "view-back", label: "Nhìn sau", group: "Góc nhìn" },
] as const satisfies ReadonlyArray<{ id: string; label: string; group: PoseGroup }>;

/** Nhãn tiếng Việt của một id; id lạ (dữ liệu cũ) rơi về chính nó thay vì biến mất. */
export function poseLabel(id: string): string {
  return POSES.find((pose) => pose.id === id)?.label ?? id;
}

/** TOÀN BỘ dáng — nay chỉ còn phục vụ nút "Chọn tất cả", không còn là mặc định. */
export function allPoseIds(): string[] {
  return POSES.map((pose) => pose.id);
}

/**
 * Thứ tự dáng của PROTOTYPE (`characterPoses` trong `styles.example.json`, cũng là thứ
 * tự khai báo của `silhouettes.js`) — "dáng thông dụng đứng trước" theo đúng bản gốc.
 */
const PROTOTYPE_POSE_ORDER = [
  "idle", "wave", "point", "hold-gift", "cheer", "sad", "run", "think", "sit", "jump",
  "bow", "thumbs-up", "fly", "walk", "dance", "present", "view-34", "view-side", "view-back",
];

/* ══════════════════════════════════════════════════════════════════════════
   BIỂU CẢM + CHỦ ĐỀ TRANG PHỤC — hai danh mục "nhãn VI ⇄ cụm tiếng Anh"
   ══════════════════════════════════════════════════════════════════════════

   Cùng một luật với §W1-7 của dáng, chỉ khác chỗ chứa: **giá trị lưu là cụm
   TIẾNG ANH đi thẳng vào prompt**, nhãn tiếng Việt chỉ để người dùng đọc. Vì sao
   không lưu id rồi tra bảng như dáng: hai ô này có **đường tự gõ**. Người dùng gõ
   "đội mũ cối" thì không có id nào để đặt, mà chuỗi họ gõ vẫn phải tới được máy
   vẽ — nên chỗ chứa buộc phải là chính cụm chữ. Preset chỉ là phím tắt để không
   phải nghĩ bằng tiếng Anh.

   Hệ quả phải nhớ: **nhãn VI tra NGƯỢC từ giá trị** (`phraseLabel`), và giá trị lạ
   (tự gõ) rơi về chính nó thay vì biến mất. */
export interface PhraseOption {
  /** Cụm tiếng Anh ĐI VÀO PROMPT — đây là thứ được lưu vào bản nháp. */
  value: string;
  /** Nhãn tiếng Việt hiện trên UI. */
  label: string;
}

/**
 * Nét mặt của MỘT dáng. Ý kiến 2c của team: "biểu cảm nhân vật kèm prompt cho đỡ cứng".
 *
 * Cụm chữ viết sao cho đọc được ở CẢ HAI đường ghép trong `poseSpecFor()`: thay thế
 * mệnh đề nét mặt sẵn có ("…, sad expression") và nối thêm vào cuối dáng chưa nói gì
 * về mặt ("standing still…, a big bright smile").
 */
export const EXPRESSIONS: readonly PhraseOption[] = [
  { value: "a big bright smile", label: "Cười tươi" },
  { value: "an excited thrilled expression, eyes wide open", label: "Phấn khích" },
  { value: "a puzzled hesitant expression, one eyebrow raised", label: "Băn khoăn" },
  { value: "a sad downcast expression", label: "Buồn" },
  { value: "a surprised expression, mouth open", label: "Ngạc nhiên" },
  { value: "a determined confident expression", label: "Quyết tâm" },
  { value: "winking one eye with a playful grin", label: "Nháy mắt" },
];

/**
 * Chủ đề trang phục theo mùa/chiến dịch — ý kiến 5 của team ("checkbox outfit theo
 * chủ đề game: đông, hè, bóng đá…").
 *
 * Cụm chữ được nối vào SUBJECT của ô dáng dưới dạng `"… wearing {outfit}"`, nên nó
 * phải là một cụm danh từ đọc xuôi sau chữ "wearing" — không phải một câu.
 */
export interface ThemeOption extends PhraseOption {
  /**
   * CHỦ ĐỀ CỦA CẢ BỘ KIT — mô-típ, màu, biểu tượng. KHÔNG nói tới quần áo.
   *
   * ╔══ VÌ SAO MỘT MỤC PHẢI MANG HAI CỤM CHỮ ══════════════════════════════════╗
   * ║ Danh mục này trả lời MỘT câu hỏi ("chủ đề gì") ở HAI chỗ khác hẳn nhau:   ║
   * ║  · pill `theme` của câu Ngữ cảnh chung → đi vào `variant.style`, tức là    ║
   * ║    vào `## Art style` của MỌI tấm: nút bấm, thanh máu, cảnh nền.          ║
   * ║  · pill `outfit` để trống ("theo theme chung") → đi vào chủ ngữ của ô dáng ║
   * ║    dưới dạng "… wearing {cụm}".                                          ║
   * ║ Trước 09/2026 chỉ có MỘT cụm — cụm trang phục — nên một tấm 16 nút bấm    ║
   * ║ nhận được câu "a Vietnamese Tết festive outfit with red and gold" ở đầu   ║
   * ║ prompt. Máy vẽ đọc chữ "outfit" đúng như nó viết: có ảnh trả về nút bấm   ║
   * ║ mang cổ áo và khuy. Hai chỗ dùng ⇒ hai cụm, nhưng vẫn MỘT mục để người    ║
   * ║ dùng chỉ phải chọn một lần.                                              ║
   * ║ `value` GIỮ NGUYÊN là cụm trang phục cũ vì nó đang là ID ổn định nằm      ║
   * ║ trong bản nháp của mọi dự án có thật (`themeValue`, attr `value` của       ║
   * ║ pill). Đổi nó là mọi dự án cũ mở lên mất chủ đề đã chọn.                  ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  kitEN: string;
}

export const OUTFIT_THEMES: readonly ThemeOption[] = [
  {
    value: "a Vietnamese Tết festive outfit with red and gold",
    label: "Tết",
    kitEN: "Vietnamese Tết theme: red and gold, lanterns, apricot and peach blossom motifs",
  },
  {
    value: "a Christmas outfit with a red santa hat and white fur trim",
    label: "Giáng sinh",
    kitEN: "Christmas theme: deep red and pine green, snowflakes, baubles and holly motifs",
  },
  {
    value: "a light summer outfit with short sleeves and sunglasses",
    label: "Hè",
    kitEN: "summer theme: sun-bright blues and warm sand, waves, palm leaves and ice-cream motifs",
  },
  {
    value: "a warm winter outfit with a thick knitted scarf and coat",
    label: "Đông",
    kitEN: "winter theme: cool blues and white, snow, frost patterns and knitted textures",
  },
  {
    value: "a football kit with a team jersey, shorts and long socks",
    label: "Bóng đá",
    kitEN: "football theme: pitch green and white line markings, balls, trophies and pennant motifs",
  },
  {
    value: "a Halloween costume with a pumpkin motif and a dark cape",
    label: "Halloween",
    kitEN: "Halloween theme: pumpkin orange and deep purple, bats, cobwebs and crescent-moon motifs",
  },
];

/** 3 sheet × 4 ô (= `DEFAULT_SHEET_LIMITS.mascot` của `kitset-to-contract.ts` — không
 *  import được vì file đó import ngược `model.ts`). Đổi trần ô/sheet thì sửa cả hai. */
const DEFAULT_POSE_CAP = 3 * 4;

/**
 * MẶC ĐỊNH CỦA BẢN NHÁP MỚI (2026-08, quyết định chủ sản phẩm): mascot chiếm TỐI ĐA
 * ~3 sheet mỗi lần gen. Chọn hết 19 dáng = 5 sheet — mascot ăn nhiều lượt hơn cả phần
 * UI, trong khi đa số dự án chỉ cần bộ cơ bản. Quy tắc: trọn nhóm "Cơ bản" trước, rồi
 * cộng dáng thông dụng theo đúng thứ tự prototype cho tới trần 12 dáng = 3 sheet.
 *
 * Chỉ là GIÁ TRỊ KHỞI TẠO: người dùng vẫn "Chọn tất cả" / cộng từng dáng; bản nháp và
 * contract đã lưu giữ nguyên selection của họ; mascot thư viện có bộ dáng riêng vẫn
 * THẮNG mặc định này (MascotDialog `onAdoptPoses`).
 */
export function defaultPoseIds(): string[] {
  const picked: string[] = POSES.filter((pose) => pose.group === "Cơ bản").map((pose) => pose.id);
  for (const id of PROTOTYPE_POSE_ORDER) {
    if (picked.length >= DEFAULT_POSE_CAP) break;
    if (!picked.includes(id)) picked.push(id);
  }
  return picked.slice(0, DEFAULT_POSE_CAP);
}
