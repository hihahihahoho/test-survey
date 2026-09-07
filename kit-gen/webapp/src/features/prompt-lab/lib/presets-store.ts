import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { GENRE_PRESETS } from "@/features/kit-core/lib/genre-presets";
import { glazeFromMaterial } from "@/features/kit-core/lib/glaze";
import { EXPRESSIONS, POSES } from "@/features/kit-core/lib/poses";
import { skelSchema, slugify, type Skel } from "@/lib/types/contract";
import { api } from "@/lib/api/endpoints";
import { qk, useUserLibrary } from "@/lib/hooks";
import type { LibraryPreset } from "@/lib/types/api";

/**
 * presets-store.ts — DANH MỤC NGƯỜI DÙNG TỰ SỬA, lưu TRONG WORKSPACE KitGen.
 *
 * ╔══ VÌ SAO LAB LẠI CÓ MỘT KHO DỮ LIỆU ═════════════════════════════════════╗
 * ║ Vì phần đắt nhất của ý tưởng này không phải cái editor — mà là câu hỏi    ║
 * ║ "danh mục element/phong cách của ĐỘI này gồm những gì". Mỗi đội game có   ║
 * ║ bộ element riêng (nút, popover, thanh máu, khung avatar…) và bộ phong     ║
 * ║ cách riêng. Nếu danh mục bị đóng cứng trong code thì demo chỉ trả lời     ║
 * ║ được "UI có đẹp không", không trả lời được "quy trình này có dùng được    ║
 * ║ cho đội tôi không" — mà đó mới là thứ cần biết trước khi làm thật.        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ ĐÃ RỜI localStorage → `GET/POST/PATCH/DELETE /api/library/presets` ══════
 * Bản trước lưu trong localStorage và tự ghi ba nhược điểm của nó ngay tại đây:
 * một máy · một trình duyệt; ẩn danh; mất khi người dùng xoá dữ liệu duyệt web.
 * Cả ba đã hết: preset nay nằm trong `.kitgen/library/library.json` của
 * workspace, cạnh contract — đúng chỗ mà chú thích cũ nói "bản làm thật phải để".
 *
 * ══ BA THỨ PHẢI GIỮ NGUYÊN, VÀ CHÚNG ĐỊNH HÌNH CẢ FILE NÀY ═════════════════
 * 1. `getPresets()` PHẢI ĐỒNG BỘ. Chục hàm THUẦN dùng nó làm đối số mặc định
 *    (`composer-model`, `pill-registry`, `serialize*`, `composer-doc`,
 *    `composer-to-contract`). Biến chúng thành async là sửa cả một tầng — và
 *    làm mất tính thuần khiến chúng hết test được. Nên: TanStack Query giữ dữ
 *    liệu gốc, còn ở đây có một BẢN SAO trong RAM để đọc đồng bộ. Bản sao chỉ
 *    được ghi từ đúng hai nguồn: hydrate từ server, và `setPresets` của người dùng.
 * 2. `id` trong bundle KHÔNG phải id của server. Id bundle đi thẳng vào tài liệu
 *    đã lưu (`elementId` của mỗi ô, giá trị của pill phong cách). Nếu nó là id
 *    server sinh ngẫu nhiên thì mọi tài liệu cũ trỏ vào hư không sau lần đầu đồng
 *    bộ. Nên id bundle được giữ nguyên trong `data.key`, và id server chỉ là địa
 *    chỉ vận chuyển — được tra qua bảng `serverIdOf`.
 * 3. Màn preset sửa THEO TỪNG PHÍM (không có nút Lưu — xem `PresetsScreen`).
 *    Mỗi phím một PATCH là hàng trăm request và một cuộc đua ghi đè. Nên bản sao
 *    trong RAM đổi NGAY (UI không giật), còn việc ghi lên server được GỘP lại và
 *    hoãn `FLUSH_DELAY_MS`.
 *
 * ══ HẠT GIỐNG lấy từ dữ liệu THẬT của kit-core (chỉ đọc) ════════════════
 * Kho rỗng là một màn không dùng được: người mở lần đầu phải tự nghĩ ra 7 phong
 * cách trước khi thấy được gì. Seed từ `genre-presets` / `poses` ⇒ mở phát là
 * chạy, và người ta sửa từ một thứ có sẵn thay vì từ trang trắng.
 */

export interface StylePreset {
  id: string;
  /** Nhãn tiếng Việt trên pill. */
  vi: string;
  /** Cụm tiếng Anh đi vào prompt. */
  en: string;
}

/**
 * Một loại element của bộ UI kit — thứ sinh ra các nút "+ Nút bấm", "+ Popover"…
 *
 * ╔══ `en` LÀ MỘT DANH TỪ, KHÔNG PHẢI MỘT CÂU MÔ TẢ ═════════════════════════╗
 * ║ Chủ sản phẩm, khi nhìn thấy "a rounded background panel for a dialog" và  ║
 * ║ "a floating popover panel with a title bar" trên màn: *"KHÔNG có thuộc    ║
 * ║ tính nhé… làm theo kiểu composition, popover thì chỉ là popover thôi."*   ║
 * ║                                                                          ║
 * ║ Ba tính từ trong một danh mục là ba quyết định thẩm mỹ bị đóng cứng vào   ║
 * ║ MỌI bộ kit dùng nó: "rounded" đá nhau với một style góc cạnh, "floating"  ║
 * ║ đá nhau với một popover dán mép màn hình, "with a title bar" thì thêm hẳn ║
 * ║ một bộ phận người dùng không xin. Thẩm mỹ đến từ prompt tổng phong cách + ║
 * ║ pill người dùng bấm; danh mục chỉ trả lời "món này TÊN LÀ GÌ".            ║
 * ║ Luật thành văn: `en` là DANH TỪ (cụm danh từ), không mạo từ, không tính   ║
 * ║ từ thẩm mỹ. Đúng hình dạng mà `element-lib.json` của engine đang đổi về.  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export interface ElementPreset {
  id: string;
  vi: string;
  /** DANH TỪ tiếng Anh đi vào `spec` của ô — xem khối chú thích trên. */
  en: string;
  /** Mức viền/trang trí áp sẵn khi thêm ô này (1–7). */
  decor: number;
  /** Id đục nền áp sẵn (`glaze.ts`); rỗng = nền đặc. */
  glazeId: string;
  /**
   * Cỡ safe zone GHIM TAY (`cell-size.ts`); rỗng ⇒ cỡ đo từ `skel` của chính loại này.
   * Rỗng là giá trị BÌNH THƯỜNG từ 07/09/2026, không phải "chưa điền".
   */
  sizeId: string;
  /**
   * HÌNH DẠNG của loại element — thứ đi thẳng vào `component.skel` của contract.
   *
   * ╔══ VÌ SAO DANH MỤC PHẢI BIẾT HÌNH DẠNG, KHÔNG CHỈ BIẾT TÊN ═══════════════╗
   * ║ `shape` không phải trang trí: `gen.sh` in toạ độ safe zone ra prompt từ   ║
   * ║ nó (`geometry.safe_box`), `slice.py` nắn lõi về đúng hộp ấy               ║
   * ║ (`snap_to_safe`, chỉ với pill/bar/rrect/circle/puzzle) và ghi 9-slice từ  ║
   * ║ `slice9`. Không khai ⇒ mọi ô là `rrect` 0.8×0.6, tức là ta đòi một cái    ║
   * ║ hộp 4:3 cho cả thanh máu lẫn khung tròn — xem khối đo thật ở đầu           ║
   * ║ `cell-size.ts`.                                                          ║
   * ║                                                                          ║
   * ║ `w`/`h` là phân số của một ô VUÔNG (tấm Bộ UI luôn vuông), nên đọc thẳng  ║
   * ║ ra tỉ lệ hình: `0.86 × 0.22` LÀ một thanh 3,9:1.                          ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   *
   * Thiếu (element tự đặt tên, hoặc bản ghi đời trước) ⇒ `CUSTOM_ELEMENT_SKEL`.
   */
  skel?: Skel;
}

export interface MascotPreset {
  id: string;
  vi: string;
  en: string;
  /** Tên tệp ảnh tham chiếu — CHỈ là ghi chú chữ. Xem khối ẢNH bên dưới. */
  refName: string;
}

export interface PresetBundle {
  styles: StylePreset[];
  elements: ElementPreset[];
  mascots: MascotPreset[];
}

/**
 * ẢNH TRONG PRESET — cố ý chỉ lưu TÊN, không lưu ảnh.
 *
 * Ảnh trong lab là `blob:` sống trong RAM một tab (xem `schema.ts`). Ngay cả khi
 * kho đã lên server, nhét ảnh vào preset là nhét nhị phân vào một file JSON
 * metadata — trong khi workspace ĐÃ CÓ chỗ đúng cho ảnh (`/api/library/items`,
 * có sniff định dạng, có giới hạn dung lượng, có route đọc file). Preset mascot
 * vì thế chỉ mang TÊN ảnh như một lời nhắc; ảnh thật vẫn chọn ở pill trong block.
 */

/**
 * Bảy mức trang trí — thang của pill `decor`, dùng lại ở seed element.
 *
 * ╔══ CHỈ TẢ CẤU TRÚC, KHÔNG TẢ CÁCH ĐÁNH BÓNG ══════════════════════════════╗
 * ║ Bản trước trộn hai thứ vào một thang: "a beveled border with a subtle      ║
 * ║ gradient face" nói CẢ "có viền" (cấu trúc) LẪN "vát khối, mặt chuyển màu"  ║
 * ║ (cách hoàn thiện). Cách hoàn thiện là việc của PHONG CÁCH — nó đã được nói ║
 * ║ ở `## Art style`, cho cả tấm, một lần. Nhắc lại ở từng ô là hai giọng cùng ║
 * ║ chỉ huy một chuyện: chọn phong cách "flat vector" rồi kéo viền lên nấc 4   ║
 * ║ là prompt tự mâu thuẫn — phẳng ở đầu tấm, vát khối ở dòng thứ ba.          ║
 * ║ Nên thang này chỉ còn trả lời ĐÚNG một câu hỏi: viền dày mỏng tới đâu, có  ║
 * ║ hoa văn ở góc không. Không "bevel", không "gradient", không "shadow",      ║
 * ║ không "glow" — `tests/test_gen_prompt.py` canh đúng những chữ ấy.          ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export const DECOR_LEVELS: readonly { value: string; vi: string; en: string }[] = [
  { value: "1", vi: "1 · Trần trụi", en: "plain edge, no rim" },
  { value: "2", vi: "2 · Tối giản", en: "a hairline rim" },
  { value: "3", vi: "3 · Gọn", en: "a thin even rim" },
  { value: "4", vi: "4 · Vừa", en: "a distinct rim" },
  { value: "5", vi: "5 · Có nhấn", en: "a thick rim with corner accents" },
  { value: "6", vi: "6 · Cầu kỳ", en: "a wide rim with a patterned band" },
  { value: "7", vi: "7 · Lộng lẫy", en: "an ornate rim with corner ornaments" },
];

/** Hạt giống — đọc từ danh mục THẬT của kit-core, không chép tay. */
export function seedPresets(): PresetBundle {
  return {
    styles: GENRE_PRESETS.map((preset) => ({ id: preset.id, vi: preset.vi, en: preset.stylePrompt })),

    /* Danh mục element: repo CHƯA có danh mục tương đương để mượn (contract của
       kit-core mô tả từng ô bằng chữ tự do, không bằng loại). Nên đây là danh
       mục MỚI của lab — và chính vì nó là mới nên nó phải sửa được, không được
       đóng cứng. Đúng thứ trang preset sinh ra để trả lời. */
    /* `en` = DANH TỪ THUẦN, `skel` = HÌNH HỌC của chính món đó. Hình học là thứ
       DUY NHẤT còn được áp sẵn theo loại element, vì nó không phải thẩm mỹ: một
       thanh máu là hộp rộng-mỏng ở mọi phong cách, một khung avatar là hộp vuông
       ở mọi phong cách.

       ══ BẢNG HÌNH DẠNG → TỈ LỆ (đo trên ô tham chiếu 314×314) ══════════════
         button        pill   0.78×0.27 → 245×85   2,9:1  ← element-lib 01-btn-pill-red
         popover       rrect  0.86×0.66 → 270×207  1,3:1  hộp thoại nổi
         health bar    bar    0.86×0.22 → 270×69   3,9:1  ← lõi model tự vẽ đo được 370×97
         coin icon     circle 0.40×0.40 → 126×126  1:1    đồng xu
         avatar frame  circle 0.62×0.62 → 195×195  1:1    ← lõi đo được 303×263
         panel         rrect  0.92×0.80 → 289×251  1,15:1 to nhất, còn chừa biên cho dao cắt
         badge         circle 0.46×0.46 → 144×144  1:1
         progress bar  bar    0.86×0.18 → 270×57   4,8:1  ← element-lib 07-progress-track

       Hai cột phải nói cùng một thứ tiếng với `element-lib.json` của engine: ở đó
       pill/bar là rộng-mỏng, circle/burst/puzzle là vuông, popup là hộp to. Khác
       biệt duy nhất là MẪU SỐ — element-lib đo trên ô 3:2 của tấm landscape, còn
       tấm Bộ UI ở đây luôn vuông, nên cùng một tỉ lệ ra cặp phân số khác.

       `slice9` bật cho món CO GIÃN ĐƯỢC (nút, thanh, bảng, hộp thoại) và tắt cho
       món tròn — kéo một cái huy hiệu tròn theo 9-slice là méo nó. `sizeId` để
       RỖNG: ghim một nấc cỡ ở đây là đè lên chính hình dạng vừa khai. */
    elements: [
      { id: "button", vi: "Nút bấm", en: "button", decor: 4, glazeId: "", sizeId: "", skel: { shape: "pill", w: 0.78, h: 0.27, slice9: true } },
      { id: "popover", vi: "Popover", en: "popover", decor: 5, glazeId: "", sizeId: "", skel: { shape: "rrect", w: 0.86, h: 0.66, slice9: true } },
      { id: "healthbar", vi: "Thanh máu", en: "health bar", decor: 3, glazeId: "", sizeId: "", skel: { shape: "bar", w: 0.86, h: 0.22, slice9: true } },
      { id: "coin", vi: "Icon tiền", en: "coin icon", decor: 2, glazeId: "", sizeId: "", skel: { shape: "circle", w: 0.4, h: 0.4 } },
      { id: "avatar-frame", vi: "Khung avatar", en: "avatar frame", decor: 5, glazeId: "", sizeId: "", skel: { shape: "circle", w: 0.62, h: 0.62 } },
      { id: "panel", vi: "Bảng nền", en: "panel", decor: 4, glazeId: "", sizeId: "", skel: { shape: "rrect", w: 0.92, h: 0.8, slice9: true } },
      { id: "badge", vi: "Huy hiệu", en: "badge", decor: 3, glazeId: "", sizeId: "", skel: { shape: "circle", w: 0.46, h: 0.46 } },
      { id: "progress", vi: "Thanh tiến trình", en: "progress bar", decor: 3, glazeId: "", sizeId: "", skel: { shape: "bar", w: 0.86, h: 0.18, slice9: true } },
    ],

    /* Mascot: ghép dáng + biểu cảm có sẵn thành vài "nhân vật mẫu" để trang
       preset không mở ra trống trơn. Chữ `en` là mô tả nhân vật, không phải dáng
       — dáng đã có pill riêng trong block. */
    mascots: [
      {
        id: "mascot-default",
        vi: "Linh vật chính",
        en: `a friendly rounded mascot character, ${EXPRESSIONS[0]?.value ?? "a big bright smile"}`,
        refName: "",
      },
      {
        id: "mascot-sidekick",
        vi: "Nhân vật phụ",
        en: `a small sidekick creature standing in an ${POSES[0]?.id ?? "idle"} pose`,
        refName: "",
      },
    ],
  };
}

/* ══ DỊCH GIỮA HAI HÌNH DẠNG ════════════════════════════════════════════════
   Server: `{id, kind, name, data}` — `data` là JSON tự do, agent không hiểu.
   Lab: ba mảng có kiểu chặt. Chỗ dịch nằm gọn ở đây, và CHỈ ở đây. */

type PresetKind = "style" | "element" | "mascot";

interface PresetPayload {
  kind: PresetKind;
  name: string;
  data: Record<string, unknown>;
}

/** Bất kỳ dòng nào trong ba mảng: ba kiểu chỉ khác nhau ở phần ĐUÔI, nên dạng
    chung là "phần chung bắt buộc + phần đuôi tuỳ chọn". Cả ba interface public
    ở trên đều gán được vào đây, và `payloadOf` chỉ đọc đuôi đúng theo `kind`. */
type AnyPreset = StylePreset & Partial<Omit<ElementPreset, keyof StylePreset>> & Partial<Omit<MascotPreset, keyof StylePreset>>;

/** `name` của server là nhãn tiếng Việt; phần còn lại nằm trong `data`. */
function payloadOf(kind: PresetKind, preset: AnyPreset): PresetPayload {
  /* `key` là id bundle — lý do #2 ở đầu file. Nó phải nằm TRONG `data` vì `id`
     của bản ghi thuộc về server (agent tự sinh, client không được chọn). */
  const base: Record<string, unknown> = { key: preset.id, en: preset.en };
  if (kind === "element") {
    return {
      kind,
      name: preset.vi,
      /* `materialId` KHÔNG còn được ghi: trường ấy đã chết cùng pill Chất liệu.
         Bản ghi cũ trên workspace vẫn còn nó cho tới lượt PATCH đầu tiên — và
         `toBundle` dịch nó sang `glazeId` khi đọc, nên không có khoảng nào mà
         người dùng mất lựa chọn. */
      /* `skel` ghi ra NGUYÊN OBJECT: nó là hình học của loại element, và bỏ nó lại
         ở client nghĩa là mở app trên máy thứ hai thì mọi element về `rrect` 0.8×0.6
         — đúng cái bệnh vừa chữa, nhưng lần này chỉ hiện ở máy khác. */
      data: {
        ...base,
        decor: preset.decor ?? 4,
        glazeId: preset.glazeId ?? "",
        sizeId: preset.sizeId ?? "",
        ...(preset.skel ? { skel: preset.skel } : {}),
      },
    };
  }
  if (kind === "mascot") return { kind, name: preset.vi, data: { ...base, refName: preset.refName ?? "" } };
  return { kind, name: preset.vi, data: base };
}

/** Đọc PHÒNG THỦ: `data` do đời code trước ghi và do người dùng sửa được. */
function str(data: Record<string, unknown>, field: string, fallback = ""): string {
  const value = data[field];
  return typeof value === "string" ? value : fallback;
}

/**
 * DI TRÚ CHỮ: mô tả có thuộc tính (đời trước) → DANH TỪ THUẦN.
 *
 * ╔══ VÌ SAO PHẢI CÓ BẢNG NÀY, DÙ HẠT GIỐNG ĐÃ ĐỔI ═════════════════════════╗
 * ║ Hạt giống chỉ gieo MỘT LẦN, vào một kho rỗng. Mọi workspace đã mở app     ║
 * ║ trước hôm nay đang giữ tám bản ghi với `en` là câu mô tả cũ — và           ║
 * ║ `seedOnce` cố ý KHÔNG ghi đè chúng (bản trên server có thể đã được người   ║
 * ║ dùng sửa). Không có bảng này thì chủ sản phẩm mở lại đúng máy đang test    ║
 * ║ vẫn thấy "a floating popover panel with a title bar" — đúng câu vừa bị      ║
 * ║ than, sau một lượt sửa mà anh ấy được báo là đã xong.                     ║
 * ║                                                                          ║
 * ║ Bảng khớp NGUYÊN VĂN, không đoán bằng regex: chỉ tám chuỗi do CHÍNH ta    ║
 * ║ ghi ra mới bị đổi. Người dùng tự sửa một chữ trong đó ⇒ không khớp ⇒ chữ   ║
 * ║ của họ được giữ nguyên, luôn luôn.                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
const LEGACY_ELEMENT_EN: Record<string, string> = {
  "a primary action button with a centered label": "button",
  "a floating popover panel with a title bar": "popover",
  "a horizontal health bar with a filled track": "health bar",
  "a coin currency icon seen from a slight angle": "coin icon",
  "a circular avatar frame with a rim": "avatar frame",
  "a rounded background panel for a dialog": "panel",
  "a small badge with a number counter": "badge",
  "a segmented progress bar with a knob": "progress bar",
};

/** Hình dạng hạt giống, tra theo id — nguồn của cả `seedPresets()` lẫn bảng di trú
 *  ngay dưới, để hai chỗ không thể nói khác nhau. */
const SEED_SKEL: Record<string, Skel | undefined> = Object.fromEntries(
  seedPresets().elements.map((element) => [element.id, element.skel]),
);

/**
 * DI TRÚ CỠ GHIM: bốn nấc S/M/L/XL của hạt giống ĐỜI TRƯỚC → rỗng (đo theo hình).
 *
 * Trước 07/09/2026 hạt giống ghim sẵn một nấc cỡ cho từng loại — đó là cách duy
 * nhất lúc ấy để một bảng nền to hơn một huy hiệu, khi mà danh mục chưa biết hình
 * dạng. Nay hình dạng đã có, và một nấc ghim sẽ ĐÈ LÊN chính nó: `defaultSizeOf`
 * ưu tiên `sizeId`, nên một cái nút vẫn ra hộp 192×136 (1,4:1) thay vì 245×85 (2,9:1).
 *
 * Khớp NGUYÊN VĂN cặp (id hạt giống, nấc hạt giống) — cùng kỷ luật với
 * `LEGACY_ELEMENT_EN`. Ai đã tự đổi nút sang «L» thì cặp không khớp và nấc của họ
 * ở nguyên đó.
 */
const LEGACY_ELEMENT_SIZE: Record<string, string> = {
  button: "m", popover: "xl", healthbar: "l", coin: "s",
  "avatar-frame": "m", panel: "xl", badge: "s", progress: "l",
};

/**
 * `data.skel` trên đĩa → `Skel`, hoặc `undefined`.
 *
 * Đọc qua `skelSchema` (schema THẬT của contract) chứ không tự kiểm tay: `shape`
 * là một enum đóng và `w`/`h` có luật V-06 ∈ (0,1]. Một `skel` rác lọt vào đây sẽ
 * đi thẳng ra `contract.json` rồi làm `gen.sh` in một hộp âm.
 */
function readSkel(value: unknown): Skel | undefined {
  const parsed = skelSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function toBundle(rows: readonly LibraryPreset[]): PresetBundle {
  const bundle: PresetBundle = { styles: [], elements: [], mascots: [] };
  for (const row of rows) {
    const data = row.data ?? {};
    /* Thiếu `key` ⇒ dùng id server. Xảy ra khi bản ghi được tạo bởi một client
       khác (hoặc bằng tay) — thà một id xấu còn hơn nuốt mất bản ghi. */
    const id = str(data, "key") || row.id;
    const en = str(data, "en");
    if (row.kind === "style") bundle.styles.push({ id, vi: row.name, en });
    else if (row.kind === "element") {
      const decor = Number(data.decor);
      /* Bản ghi đời trước chỉ có `materialId` ⇒ dịch sang đục nền gần nhất.
         Bản ghi đời nay có `glazeId` ⇒ nó thắng, kể cả khi rỗng (rỗng là một
         lựa chọn: "nền đặc"), nên phải hỏi `"glazeId" in data` chứ không phải
         `str(...) || fallback` — nếu không thì bỏ đục nền là nó tự quay lại. */
      const glazeId = "glazeId" in data ? str(data, "glazeId") : glazeFromMaterial(str(data, "materialId"));
      /**
       * DI TRÚ HÌNH DẠNG — cùng lý do (và cùng cách) với `LEGACY_ELEMENT_EN`.
       *
       * `skel` là khoá MỚI: mọi workspace đã mở app trước 07/09/2026 đang giữ tám
       * bản ghi element KHÔNG có nó, và `seedOnce` cố ý không ghi đè bản ghi cũ.
       * Không vá ở đây thì chủ sản phẩm mở lại đúng máy đang test vẫn thấy mọi ô ra
       * `rrect` 0.8×0.6 — đúng cái vừa được báo là đã sửa.
       *
       * Vá theo ID HẠT GIỐNG, không theo tên: tám id ấy do CHÍNH ta sinh ra. Element
       * người dùng tự thêm (`tu-dat-…`) không có trong bảng ⇒ giữ nguyên `undefined`,
       * và `CUSTOM_ELEMENT_SKEL` lo phần còn lại. Bản ghi ĐÃ CÓ `skel` thì nó thắng,
       * kể cả khi người dùng sửa tay trên đĩa.
       */
      const skel = readSkel(data["skel"]) ?? SEED_SKEL[id];
      const savedSize = str(data, "sizeId");
      bundle.elements.push({
        id, vi: row.name,
        en: LEGACY_ELEMENT_EN[en] ?? en,
        decor: Number.isFinite(decor) ? decor : 4,
        glazeId,
        sizeId: savedSize === LEGACY_ELEMENT_SIZE[id] ? "" : savedSize,
        ...(skel ? { skel } : {}),
      });
    } else if (row.kind === "mascot") bundle.mascots.push({ id, vi: row.name, en, refName: str(data, "refName") });
    /* `material` / `outfit` là hai `kind` agent chấp nhận nhưng lab CHƯA dùng.
       Bỏ qua chứ không ném: một bản web cũ không được làm hỏng dữ liệu bản mới. */
  }
  return bundle;
}

/* ══ BẢN SAO TRONG RAM + HÀNG ĐỢI GHI ═══════════════════════════════════════
   Vẫn tự viết một store 30 dòng thay vì kéo zustand vào: cả lab chỉ có ĐÚNG một
   mẩu state chia sẻ. `useSyncExternalStore` là API React chuẩn cho việc này. */

/** Hoãn bao lâu trước khi đẩy lên server. Đủ dài để gộp một cụm phím, đủ ngắn để
    người dùng rời trang ngay sau đó vẫn kịp (màn này không có nút Lưu). */
const FLUSH_DELAY_MS = 400;

let cache: PresetBundle | null = null;
const listeners = new Set<() => void>();

/** Bản ghi server đã biết, để `flush` biết cái gì là thêm / sửa / xoá. */
let serverRows: LibraryPreset[] = [];
/** `"kind:key"` → id server. */
let serverIdOf = new Map<string, string>();
/** Ảnh chụp JSON của lần hydrate gần nhất — để không hydrate lại y hệt. */
let hydratedFrom = "";
/** Có sửa chưa đẩy lên server ⇒ CẤM hydrate đè lên (sẽ nuốt chữ đang gõ). */
let dirty = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushing = false;
/** Lỗi ghi gần nhất, hiện ra màn preset — im lặng nuốt lỗi ghi là không chấp nhận được. */
let syncError: string | null = null;

/** Cửa để `usePresets` báo cho query biết dữ liệu đã cũ. Đặt bởi hook, không import
    thẳng `queryClient` singleton — test dựng QueryClient riêng của chúng. */
let invalidateLibrary: (() => void) | null = null;

function emit() { for (const listener of listeners) listener(); }

function rowKey(kind: string, key: string) { return `${kind}:${key}`; }

export function getPresets(): PresetBundle {
  if (!cache) cache = seedPresets();
  return cache;
}

/** Lỗi đồng bộ gần nhất (`null` = đang sạch). Màn preset đọc để nói ra. */
export function getPresetSyncError(): string | null { return syncError; }

export function setPresets(next: PresetBundle): void {
  cache = next;
  dirty = true;
  emit();
  scheduleFlush();
}

/**
 * ELEMENT NGƯỜI DÙNG TỰ ĐẶT TÊN — «Tự đặt tên…» trong hộp tra danh mục.
 *
 * ╔══ VÌ SAO NÓ VÀO THẲNG DANH MỤC, KHÔNG PHẢI MỘT TRƯỜNG RIÊNG CỦA DÒNG ════╗
 * ║ Đường kia (giữ tên ngay trên `UiCell`) nghe gọn hơn nhưng đẻ ra hai loại  ║
 * ║ dòng element: loại tra được trong danh mục và loại không. Mọi chỗ đọc tên ║
 * ║ (`cellLine`, `uiCellDoc`, `uiKitSheets`, pill tên, ô tìm kiếm) sẽ phải    ║
 * ║ nhớ hỏi cả hai nguồn — và chỗ nào quên thì hiện ra một id trần.           ║
 * ║ Vào danh mục thì nó là một element như mọi element: đổi loại được, tìm    ║
 * ║ được, dùng lại ở thẻ khác, và sửa/xoá được ở trang «Quản lý preset».      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ TÊN VI VÀ DANH TỪ EN LÀ HAI TRƯỜNG, DÙ THƯỜNG BẰNG NHAU ════════════════
 * Người dùng gõ tiếng Anh thì một chuỗi làm cả hai việc. Gõ tiếng Việt thì `vi`
 * là chữ họ đọc trên màn, còn `en` là chữ đi tới máy vẽ — và ta KHÔNG dịch hộ:
 * dịch máy một danh từ chuyên ngành ("khiên chắn" → "shield"? "barrier"?) là
 * đoán, mà đoán sai thì máy vẽ ra một món khác hẳn. Nên `en` mặc định là NGUYÊN
 * chuỗi ấy (model đa ngữ đọc được tiếng Việt), và nơi gọi có quyền đưa `en` riêng.
 *
 * Trả về preset đã tạo. Trùng tên với một element đã có ⇒ trả về CHÍNH element ấy,
 * không đẻ bản thứ hai: hai dòng cùng tên trong danh mục là hai dòng không phân
 * biệt được, và người dùng gõ lại đúng tên cũ là đang muốn dùng lại nó.
 */
export function addCustomElement(name: string, enInput?: string): ElementPreset | null {
  const vi = name.trim();
  if (!vi) return null;
  const en = (enInput ?? "").trim() || vi;
  const bundle = getPresets();

  const same = bundle.elements.find((element) => element.vi.toLowerCase() === vi.toLowerCase());
  if (same) return same;

  /* Id đi thẳng vào TÊN FILE của ô trong contract (`uiKitSheets` slug hoá nó), nên
     nó phải an toàn ngay từ lúc sinh: `slugify` bỏ dấu tiếng Việt và mọi ký tự lạ.
     Tiền tố `tu-dat` để phân biệt với id của danh mục gốc, và hậu tố số để hai
     tên khác nhau mà cùng slug ("Nút X" / "Nút x") không đè lên nhau. */
  const base = `tu-dat-${slugify(vi)}`;
  let id = base;
  for (let n = 2; bundle.elements.some((element) => element.id === id); n += 1) id = `${base}-${n}`;

  /* KHÔNG có `skel`: một cái tên tự gõ không nói được hình dạng nào, và đoán hộ
     ("khiên" → circle? rrect?) là đoán sai ở đúng chỗ tốn một lượt vẽ. Thiếu `skel`
     ⇒ `CUSTOM_ELEMENT_SKEL` (rrect 0.8×0.6) — xem `cell-size.ts`. Người dùng chỉnh
     bằng pill «Cỡ» ngay trên dòng. */
  const preset: ElementPreset = { id, vi, en, decor: 4, glazeId: "", sizeId: "" };
  setPresets({ ...bundle, elements: [...bundle.elements, preset] });
  return preset;
}

/** Xoá kho, quay về hạt giống — nút "Khôi phục mặc định" của trang preset. */
export function resetPresets(): PresetBundle {
  const seed = seedPresets();
  setPresets(seed);
  return seed;
}

function scheduleFlush() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => { flushTimer = null; void flush(); }, FLUSH_DELAY_MS);
}

/**
 * Đẩy chênh lệch lên server: thêm cái mới, sửa cái đổi, xoá cái biến mất.
 *
 * TUẦN TỰ chứ không `Promise.all`: agent ghi cả kho vào MỘT file JSON
 * (`library.json`) theo kiểu đọc-sửa-ghi. Bắn song song thì hai request cùng đọc
 * một bản rồi ghi đè nhau — mất bản ghi mà không ai báo lỗi. Danh mục dài vài
 * chục dòng nên tuần tự vẫn xong trong một nhịp.
 */
async function flush(): Promise<void> {
  if (flushing) { scheduleFlush(); return; }
  flushing = true;
  const desired = getPresets();
  const before = serverRows;
  const seen = new Set<string>();
  try {
    const jobs: [PresetKind, AnyPreset[]][] = [
      ["style", desired.styles],
      ["element", desired.elements],
      ["mascot", desired.mascots],
    ];
    let touched = false;
    for (const [kind, list] of jobs) {
      for (const preset of list) {
        const key = rowKey(kind, preset.id);
        seen.add(key);
        const payload = payloadOf(kind, preset);
        const id = serverIdOf.get(key);
        if (!id) {
          const created = await api.library.addPreset(payload);
          serverIdOf.set(key, created.id);
          touched = true;
          continue;
        }
        const existing = before.find((row) => row.id === id);
        /* So bằng JSON: `data` là object tự do, không có trường nào để so lẻ.
           Bỏ qua bản ghi không đổi là thứ giữ cho một phím gõ ở ô "phong cách"
           không kéo theo 10 PATCH của mọi dòng khác. */
        if (existing && existing.name === payload.name && stable(existing.data ?? {}) === stable(payload.data)) continue;
        await api.library.patchPreset(id, payload);
        touched = true;
      }
    }
    for (const [key, id] of [...serverIdOf]) {
      if (seen.has(key)) continue;
      await api.library.removePreset(id);
      serverIdOf.delete(key);
      touched = true;
    }
    dirty = false;
    syncError = null;
    if (touched) invalidateLibrary?.();
  } catch (error) {
    /* GIỮ `dirty`: bản trong RAM vẫn là cái người dùng đang thấy và đang sửa, và
       lần sửa tiếp theo sẽ thử ghi lại toàn bộ chênh lệch. Nhưng KHÔNG im lặng —
       màn preset hiện dòng cảnh báo, vì "tưởng đã lưu mà chưa" là hỏng tệ nhất. */
    syncError = error instanceof Error ? error.message : "Không ghi được danh mục lên workspace";
    emit();
  } finally {
    flushing = false;
  }
}

/** JSON có khoá sắp xếp — để so sánh không phụ thuộc thứ tự khoá. */
function stable(value: Record<string, unknown>): string {
  return JSON.stringify(Object.keys(value).sort().map((key) => [key, value[key]]));
}

function hydrate(rows: readonly LibraryPreset[]): void {
  const snapshot = JSON.stringify(rows);
  if (snapshot === hydratedFrom) return;
  hydratedFrom = snapshot;
  serverRows = [...rows];
  serverIdOf = new Map(rows.map((row) => [rowKey(row.kind, str(row.data ?? {}, "key") || row.id), row.id]));
  /* Đang có sửa chưa đẩy đi ⇒ chỉ nhận bảng id, KHÔNG nhận nội dung. Nhận nội
     dung lúc này là xoá đúng ký tự người dùng vừa gõ. */
  if (dirty) return;
  /* KHO RỖNG KHÔNG PHẢI LÀ "DANH MỤC RỖNG". Rỗng nghĩa là chưa gieo hạt — và
     giữa lúc thấy rỗng với lúc các POST gieo hạt về là một khoảng có thật (còn
     nếu agent tắt thì nó là mãi mãi). Vẽ ba mảng trắng trong khoảng đó là đúng
     cái mà cả phần hạt giống sinh ra để tránh: người mở lần đầu nhìn vào trang
     trắng. Nên rỗng ⇒ hiện hạt giống, và `seedOnce()` lo phần ghi xuống. */
  cache = rows.length === 0 ? seedPresets() : toBundle(rows);
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/* ══ GIEO HẠT LẦN ĐẦU ═══════════════════════════════════════════════════════
   Cờ chống gieo lặp phải là MỘT cờ dùng chung cho cả module, không phải state
   của component: `usePresets` được gọi ở 5 chỗ cùng lúc, và giữa lúc POST bay đi
   với lúc query trả về danh sách mới thì `presets` vẫn còn RỖNG — mỗi component
   sẽ tự thấy "kho rỗng, gieo đi" và ta có 5 bộ hạt giống chồng lên nhau.

   ══ NHƯNG CỜ ĐÓ CHỈ SỐNG TRONG MỘT LẦN TẢI TRANG ═════════════════════════════
   Và đó chính là chỗ nó thủng. Cờ này reset mỗi lần tải lại trang (F5, HMR nạp
   lại module, mở tab thứ hai) — trong khi thứ nó bảo vệ, cái kho, thì KHÔNG.
   Cảnh đã xảy ra thật trên `~/KitGen-dev`: một lần tải trang thấy kho rỗng và
   bắt đầu gieo; trước khi bộ POST ấy về, trang được tải lại; lần tải mới có cờ
   `idle` tinh khôi VÀ một ảnh chụp query vẫn còn rỗng — nên nó gieo lần nữa.
   Kết quả: 11 element với 3 bản trùng (Nút bấm / Popover / Thanh máu hai lần).

   Nên chống trùng phải nằm ở thứ SỐNG LÂU HƠN MỘT LẦN TẢI TRANG, tức là ở kho.
   Hai lớp, và chúng khác vai:
     ① (ở đây) ĐỐI CHIẾU DANH SÁCH SERVER NGAY TRƯỚC KHI GHI. Thu hẹp khe hở từ
       "bao lâu tuỳ độ cũ của cache query" xuống còn đúng một vòng request, và
       tránh bắn đi hàng chục POST vô ích. Đây là phép tối ưu, KHÔNG phải bảo đảm.
     ② (agent, `addLibraryPreset`) upsert nhẹ theo `kind`+`data.key`. Đây mới là
       BẢO ĐẢM: agent là chỗ duy nhất nhìn thấy mọi tab, mọi lần tải trang, nên
       chỉ nó mới đóng được khe hở "hai client cùng đọc rồi cùng ghi".
   Cờ `seedState` giữ nguyên làm lớp phụ: nó vẫn chặn được 5 component trong CÙNG
   một lần tải, mà không tốn request nào. */
type SeedState = "idle" | "running" | "done";
let seedState: SeedState = "idle";

async function seedOnce(): Promise<void> {
  if (seedState !== "idle") return;
  seedState = "running";
  try {
    /* ĐỌC LẠI TỪ SERVER, không tin `rows` mà hook vừa đưa: chính cái ảnh chụp cũ
       đó là nguyên nhân. Ở đây gọi thẳng `api.library.get()` chứ không đi qua
       TanStack Query — ta cần giá trị TẠI THỜI ĐIỂM GHI, mà query thì có quyền
       trả về bản cache. */
    const live = await api.library.get();
    const have = new Set((live.presets ?? []).map((row) => rowKey(row.kind, str(row.data ?? {}, "key") || row.id)));

    const seed = seedPresets();
    const jobs: [PresetKind, AnyPreset[]][] = [
      ["style", seed.styles],
      ["element", seed.elements],
      ["mascot", seed.mascots],
    ];
    for (const [kind, list] of jobs) {
      for (const preset of list) {
        /* Khoá đã có trên server ⇒ BỎ QUA. Kể cả khi bản trên server đã bị người
           dùng sửa khác hạt giống: hạt giống là điểm KHỞI ĐẦU, không phải giá trị
           đúng cần khôi phục. Ghi đè ở đây là xoá công sửa của họ. */
        if (have.has(rowKey(kind, preset.id))) continue;
        await api.library.addPreset(payloadOf(kind, preset));
      }
    }
    seedState = "done";
    /* Làm mới query KỂ CẢ KHI KHÔNG GIEO GÌ. Không gieo gì nghĩa là server đã có
       đủ — và cũng nghĩa là ảnh chụp query đang rỗng SAI. Bản trong RAM lúc này
       vẫn là hạt giống (`hydrate` đặt khi thấy rỗng), tức người dùng đang nhìn
       giá trị mặc định thay vì danh mục thật của họ. Một lượt refetch chữa đúng
       chỗ đó. */
    invalidateLibrary?.();
  } catch (error) {
    /* Gieo hụt (agent tắt giữa chừng) ⇒ về `idle` để lần mở sau thử lại. Bản
       trong RAM vẫn là hạt giống nên màn hình vẫn dùng được ngay bây giờ. */
    seedState = "idle";
    syncError = error instanceof Error ? error.message : "Không gieo được danh mục mặc định";
    emit();
  }
}

/** Chỉ cho test dùng: trả module về trạng thái vừa nạp. */
export function __resetPresetsStoreForTest(): void {
  cache = null;
  serverRows = [];
  serverIdOf = new Map();
  hydratedFrom = "";
  dirty = false;
  flushing = false;
  syncError = null;
  seedState = "idle";
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  invalidateLibrary = null;
}

/**
 * Hook đọc kho. Mọi màn cùng dùng ⇒ sửa ở trang preset là composer đổi theo.
 *
 * Đọc qua `useUserLibrary()` — CÙNG query với kho ảnh/thương hiệu, vì cả ba nằm
 * trong cùng một `GET /api/library`. Không mở query riêng cho preset: hai cache
 * cho cùng một response là hai thứ chắc chắn sẽ lệch nhau.
 */
export function usePresets(): PresetBundle {
  const client = useQueryClient();
  const library = useUserLibrary();
  const rows = library.data?.presets;

  React.useEffect(() => {
    invalidateLibrary = () => void client.invalidateQueries({ queryKey: qk.library() });
  }, [client]);

  React.useEffect(() => {
    if (!rows) return;
    hydrate(rows);
    /* Kho rỗng THẬT (đã tải xong, mảng rỗng) ⇒ gieo hạt. Phân biệt với "chưa
       tải" bằng chính `rows === undefined` ở trên: chưa tải thì không làm gì. */
    if (rows.length === 0 && !dirty) void seedOnce();
  }, [rows]);

  return React.useSyncExternalStore(subscribe, getPresets, getPresets);
}

/** Lỗi ghi gần nhất, dạng hook — màn preset hiện nó ra. */
export function usePresetSyncError(): string | null {
  return React.useSyncExternalStore(subscribe, getPresetSyncError, getPresetSyncError);
}
