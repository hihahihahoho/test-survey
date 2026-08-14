/**
 * features/kit/lib/blend.ts — ASSET PHÁT SÁNG VẼ BẰNG PHÉP CỘNG (backlog P1-3).
 *
 * ╔══ VÌ SAO CÓ FILE NÀY ═════════════════════════════════════════════════════╗
 * ║ Ô `matte:"glow"` được `slice.py` tách khỏi TẤM ĐEN: ảnh AI ở đó chính là   ║
 * ║ premultiplied `C = α·F`, nên PNG xuất ra mang alpha = độ sáng. Dán nó kiểu ║
 * ║ thường (`source-over`) là TRỘN — nền nuốt mất đúng phần quầng ngoài mềm,   ║
 * ║ thứ làm glow ra glow. `docs/research-glow-extraction-2026-08.md` đo:       ║
 * ║ RGBA(α=max) + `plus-lighter` giống HỆT TỪNG BIT nền-đen + additive.        ║
 * ║ ⇒ Không bake alpha; manifest ship kèm `blend:"screen"`, nơi vẽ tự đặt.     ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Trên web, `mix-blend-mode: screen` là phép gần nhất có sẵn — và nó chỉ ĐỌC ĐƯỢC
 * trên nền TỐI (screen với nền trắng cho ra… trắng). Nên `KitImage` vừa đặt blend
 * vừa ép nền tối cho riêng ô này, thay vì để người dùng tưởng ảnh hỏng.
 *
 * Trong Figma thì không có đường tự động: clipboard `figma-h2d` không mang được
 * blendMode, nên chỗ Copy phải NÓI ra (`GLOW_FIGMA_HINT`).
 */
import type { KitFile } from "@/lib/types";

/** Giá trị `blend` duy nhất `slice.py` ghi ra lúc này (`MATTE_BLEND` trong slice.py). */
export const BLEND_SCREEN = "screen";

/**
 * Class blend cho `<img>`. Viết THẲNG chuỗi đầy đủ (không ghép động) để Tailwind
 * quét thấy và thật sự sinh CSS — bài học của `npm run deadclass`.
 */
export const BLEND_SCREEN_CLASS = "mix-blend-screen";

/**
 * Nền của ô glow (`styles/globals.css`): tối, không lật theo theme, tắt ô vuông
 * alpha và `isolation: isolate`. Ba thứ đó đi liền nhau nên nằm chung MỘT class —
 * xem khối chú thích ở CSS để biết vì sao thiếu cái nào cũng hỏng.
 */
export const GLOW_GROUND_CLASS = "kg-glow-ground";

/** Câu nhắc khi copy sang Figma: Figma gọi phép cộng là Linear Dodge (Add). */
export const GLOW_FIGMA_HINT =
  "Vào Figma chỉnh blend mode của layer thành Linear Dodge (Add) hoặc Screen.";

/** Ô phát sáng — vẽ bằng phép cộng, không phải phép trộn. */
export function isGlowAsset(file: Pick<KitFile, "blend"> | null | undefined): boolean {
  return file?.blend === BLEND_SCREEN;
}

/**
 * Class blend cho một giá trị `blend` của manifest. Giá trị lạ (manifest của bản
 * slice.py mới hơn web) ⇒ `undefined`: vẽ thường còn hơn vẽ sai một phép mình
 * không hiểu.
 */
export function blendImgClass(blend: string | undefined): string | undefined {
  return blend === BLEND_SCREEN ? BLEND_SCREEN_CLASS : undefined;
}
