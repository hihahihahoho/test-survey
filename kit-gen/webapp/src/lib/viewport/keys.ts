/**
 * webapp/src/lib/viewport/keys.ts — bàn phím → lệnh khung nhìn.
 *
 * Tách riêng khỏi hook để test được **không cần DOM** và để bảng phím tắt của `⌘K`
 * (UI-SPEC-V2 §9.3) đọc được cùng một nguồn sự thật.
 *
 * Bảng thao tác gốc: UI-SPEC-V2 §2.4
 *   Pan   : ↑↓←→ 40px, ⇧ = 200px
 *   Zoom  : ⌘= / ⌘-  ·  ⌘0 = 100%  ·  ⌘1 = fit tất cả  ·  ⌘2 = fit vật đang chọn
 * A11y §5.8: 100% thao tác chuột phải có đường bàn phím ⇒ đây LÀ đường đó, không phải
 * phần thêm cho vui.
 */
import type { KeyLike, ViewportCommand } from "./types";

/** Bước cuộn bằng mũi tên (pixel màn hình). */
export const PAN_STEP = 40;
export const PAN_STEP_FAST = 200;

/**
 * macOS dùng ⌘, Windows/Linux dùng Ctrl. Ta nhận CẢ HAI ở mọi nền: người dùng Mac gõ
 * ⌘, người dùng PC gõ Ctrl, không ai phải học phím của hệ khác. (Không sniff navigator
 * — hook này phải chạy được cả trong môi trường test không có `window`.)
 */
const isMod = (e: KeyLike) => e.metaKey || e.ctrlKey;

/**
 * Trả về lệnh tương ứng, hoặc `null` nếu phím không thuộc về khung nhìn — người gọi
 * PHẢI bỏ qua (đừng preventDefault) để không nuốt phím của ô nhập liệu / các màn khác.
 */
export function resolveViewportCommand(e: KeyLike): ViewportCommand | null {
  if (e.altKey) return null; // ⌥+mũi tên đã thuộc về CellGrid (di chuyển ô) — không tranh.

  if (isMod(e)) {
    switch (e.key) {
      case "0":
        return { type: "actualSize" };
      case "1":
        return { type: "fitAll" };
      case "2":
        return { type: "fitSelection" };
      case "=":
      case "+":
        return { type: "zoomStep", direction: 1 };
      case "-":
      case "_":
        return { type: "zoomStep", direction: -1 };
      default:
        return null;
    }
  }

  const step = e.shiftKey ? PAN_STEP_FAST : PAN_STEP;
  switch (e.key) {
    // Mũi tên PHẢI = nhìn sang phải ⇒ nội dung dịch sang TRÁI ⇒ dx âm.
    case "ArrowRight":
      return { type: "pan", dx: -step, dy: 0 };
    case "ArrowLeft":
      return { type: "pan", dx: step, dy: 0 };
    case "ArrowDown":
      return { type: "pan", dx: 0, dy: -step };
    case "ArrowUp":
      return { type: "pan", dx: 0, dy: step };
    default:
      return null;
  }
}

/** Mô tả để đổ vào bảng phím tắt `⌘K` — tiếng Việt, không viết tắt kỹ thuật. */
export const VIEWPORT_SHORTCUTS: ReadonlyArray<{ keys: string; label: string }> = [
  { keys: "↑ ↓ ← →", label: "Cuộn khung nhìn 40px (giữ ⇧: 200px)" },
  { keys: "⌘ =", label: "Phóng to" },
  { keys: "⌘ -", label: "Thu nhỏ" },
  { keys: "⌘ 0", label: "Về 100%" },
  { keys: "⌘ 1", label: "Vừa khít tất cả" },
  { keys: "⌘ 2", label: "Vừa khít vật đang chọn" },
  { keys: "Space + kéo", label: "Kéo khung nhìn bằng chuột" },
];
