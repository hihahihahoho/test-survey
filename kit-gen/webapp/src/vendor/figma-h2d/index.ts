/**
 * vendor/figma-h2d — CỬA DUY NHẤT để lấy encoder clipboard `figh2d`.
 *
 * ╔══ VÌ SAO `import()` ĐỘNG CHỨ KHÔNG `import` TĨNH ═════════════════════════╗
 * ║ Bundle là 49 KB (≈14 KB gzip) và CHỈ dùng khi người ta bấm "Copy to Figma".║
 * ║ Import tĩnh sẽ đẩy nó vào chunk khởi động của mọi màn hình. Vite tự tách   ║
 * ║ `import()` thành chunk riêng ⇒ ai không bấm thì không tải.                 ║
 * ║ Lợi ích thứ hai, quan trọng hơn: bundle chạm `window`/`document`/`Node`    ║
 * ║ khi thực thi, nên test THUẦN SỐ HỌC (`environment: "node"`) phải KHÔNG     ║
 * ║ được nạp nó. Cửa động cho phép `figma-node.ts` tách bạch hai phần đó.      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Nguồn gốc, cách vá và cách kiểm chứng: xem `README.md` cùng thư mục.
 */
import type { FigmaH2D } from "./figma-h2d.global.js";

export type {
  CaptureOptions,
  ClipboardOptions,
  FigmaClipboardPayload,
  FigmaH2D,
  H2DDocument,
  H2DNode,
  H2DRect,
} from "./figma-h2d.global.js";

/** Dấu mở/đóng của hai khối base64 mà Figma đọc khi dán. Dùng để kiểm cấu trúc. */
export const FIGMETA_OPEN = "<!--(figmeta)";
export const FIGMETA_CLOSE = "(/figmeta)-->";
export const FIGH2D_OPEN = "<!--(figh2d)";
export const FIGH2D_CLOSE = "(/figh2d)-->";

let cached: Promise<FigmaH2D> | null = null;

/**
 * Nạp encoder (một lần cho cả phiên). Ném nếu chunk tải hỏng — nơi gọi phải bắt và
 * rơi về đường bitmap cũ, KHÔNG được nuốt lỗi rồi báo "đã copy".
 */
export function loadFigmaH2D(): Promise<FigmaH2D> {
  cached ??= import("./figma-h2d.global.js").then((m) => m.default);
  return cached;
}

/** Chỉ dùng cho test — quên bản đã nạp để ca sau nạp lại từ đầu. */
export function resetFigmaH2D(): void {
  cached = null;
}
