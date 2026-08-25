import * as React from "react";
import { GENRE_PRESETS } from "@/features/workflow-v4/lib/genre-presets";
import { EXPRESSIONS, POSES } from "@/features/workflow-v4/lib/poses";

/**
 * presets-store.ts — DANH MỤC NGƯỜI DÙNG TỰ SỬA, lưu trong localStorage.
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
 * ══ localStorage, KHÔNG phải backend — và giới hạn của nó ═══════════════════
 * Lab không được gọi API nào. localStorage đổi lại ba nhược điểm phải nói rõ:
 * chỉ có trên MỘT máy + MỘT trình duyệt; ẩn danh (không biết ai sửa gì); và
 * người dùng xoá dữ liệu duyệt web là mất. Bản làm thật phải để preset nằm
 * trong workspace KitGen cạnh contract, không nằm trong trình duyệt.
 *
 * ══ HẠT GIỐNG lấy từ dữ liệu THẬT của workflow-v4 (chỉ đọc) ════════════════
 * Kho rỗng là một demo không dùng được: người mở lần đầu phải tự nghĩ ra 7 phong
 * cách trước khi thấy được gì. Seed từ `genre-presets` / `materials` / `poses`
 * ⇒ mở phát là chạy, và người ta sửa từ một thứ có sẵn thay vì từ trang trắng.
 */

export interface StylePreset {
  id: string;
  /** Nhãn tiếng Việt trên pill. */
  vi: string;
  /** Cụm tiếng Anh đi vào prompt. */
  en: string;
}

/** Một loại element của bộ UI kit — thứ sinh ra các nút "+ Nút bấm", "+ Popover"… */
export interface ElementPreset {
  id: string;
  vi: string;
  en: string;
  /** Mức viền/trang trí áp sẵn khi thêm ô này (1–7). */
  decor: number;
  /** Id chất liệu áp sẵn; rỗng = chưa chọn. */
  materialId: string;
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
 * Ảnh trong lab là `blob:` sống trong RAM một tab (xem `schema.ts`). Nhét chúng
 * vào localStorage thì hoặc là lưu một URL chết, hoặc là base64 hoá vài MB vào
 * một kho có hạn mức ~5MB rồi vỡ im lặng ở tấm thứ ba. Preset mascot vì thế chỉ
 * mang TÊN ảnh như một lời nhắc; ảnh thật vẫn chọn ở pill trong block.
 */

const STORAGE_KEY = "kg-prompt-lab-presets-v1";

/** Bảy mức trang trí — thang của pill `decor`, dùng lại ở seed element. */
export const DECOR_LEVELS: readonly { value: string; vi: string; en: string }[] = [
  { value: "1", vi: "1 · Trần trụi", en: "no border, no ornament, pure flat shape" },
  { value: "2", vi: "2 · Tối giản", en: "a thin 1px border, no ornament" },
  { value: "3", vi: "3 · Gọn", en: "a clean border with a soft inner shadow" },
  { value: "4", vi: "4 · Vừa", en: "a beveled border with a subtle gradient face" },
  { value: "5", vi: "5 · Có nhấn", en: "a thick beveled frame with corner accents" },
  { value: "6", vi: "6 · Cầu kỳ", en: "an ornate frame with carved trim and inlays" },
  { value: "7", vi: "7 · Lộng lẫy", en: "a heavily ornamented frame with gems, filigree and gold trim" },
];

/** Hạt giống — đọc từ danh mục THẬT của workflow-v4, không chép tay. */
export function seedPresets(): PresetBundle {
  return {
    styles: GENRE_PRESETS.map((preset) => ({ id: preset.id, vi: preset.vi, en: preset.stylePrompt })),

    /* Danh mục element: repo CHƯA có danh mục tương đương để mượn (contract của
       workflow-v4 mô tả từng ô bằng chữ tự do, không bằng loại). Nên đây là danh
       mục MỚI của lab — và chính vì nó là mới nên nó phải sửa được, không được
       đóng cứng. Đúng thứ trang preset sinh ra để trả lời. */
    elements: [
      { id: "button", vi: "Nút bấm", en: "a primary action button with a centered label", decor: 4, materialId: "" },
      { id: "popover", vi: "Popover", en: "a floating popover panel with a title bar", decor: 5, materialId: "" },
      { id: "healthbar", vi: "Thanh máu", en: "a horizontal health bar with a filled track", decor: 3, materialId: "" },
      { id: "coin", vi: "Icon tiền", en: "a coin currency icon seen from a slight angle", decor: 2, materialId: "gold-metal" },
      { id: "avatar-frame", vi: "Khung avatar", en: "a circular avatar frame with a rim", decor: 5, materialId: "" },
      { id: "panel", vi: "Bảng nền", en: "a rounded background panel for a dialog", decor: 4, materialId: "" },
      { id: "badge", vi: "Huy hiệu", en: "a small badge with a number counter", decor: 3, materialId: "" },
      { id: "progress", vi: "Thanh tiến trình", en: "a segmented progress bar with a knob", decor: 3, materialId: "" },
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

/* ══ KHO TRONG BỘ NHỚ + ĐỒNG BỘ localStorage ════════════════════════════════
   Tự viết một store 20 dòng thay vì kéo zustand vào: cả lab chỉ có ĐÚNG một
   mẩu state chia sẻ giữa hai màn (composer ↔ trang preset). `useSyncExternalStore`
   là API React chuẩn cho đúng việc này và không thêm phụ thuộc nào. */

let cache: PresetBundle | null = null;
const listeners = new Set<() => void>();

/** localStorage KHÔNG tồn tại khi render phía server / trong test node. */
function readStorage(): PresetBundle | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PresetBundle>;
    /* Đọc phòng thủ: dữ liệu này do NGƯỜI dùng sửa và do đời code trước ghi.
       Thiếu một mảng thì lấy hạt giống cho mảng đó, đừng làm trắng cả màn. */
    const seed = seedPresets();
    return {
      styles: Array.isArray(parsed.styles) ? parsed.styles : seed.styles,
      elements: Array.isArray(parsed.elements) ? parsed.elements : seed.elements,
      mascots: Array.isArray(parsed.mascots) ? parsed.mascots : seed.mascots,
    };
  } catch {
    /* JSON hỏng (sửa tay, ghi dở) ⇒ quay về hạt giống thay vì ném lỗi làm
       trắng cả hai màn. Mất preset tự thêm là tệ, nhưng không tệ bằng một lab
       không mở được và không nói vì sao. */
    return null;
  }
}

export function getPresets(): PresetBundle {
  if (!cache) cache = readStorage() ?? seedPresets();
  return cache;
}

export function setPresets(next: PresetBundle): void {
  cache = next;
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Hết hạn mức / chế độ riêng tư. Giữ nguyên bản trong RAM để phiên đang làm
       không mất, chỉ là lần sau mở lại sẽ không còn. */
  }
  for (const listener of listeners) listener();
}

/** Xoá kho, quay về hạt giống — nút "Khôi phục mặc định" của trang preset. */
export function resetPresets(): PresetBundle {
  const seed = seedPresets();
  setPresets(seed);
  return seed;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Hook đọc kho. Hai màn cùng dùng ⇒ sửa ở trang preset là composer đổi theo. */
export function usePresets(): PresetBundle {
  return React.useSyncExternalStore(subscribe, getPresets, getPresets);
}
