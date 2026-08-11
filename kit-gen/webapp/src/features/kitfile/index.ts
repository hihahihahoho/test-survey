/**
 * features/kitfile — NỀN CHUNG của đợt FE-3 (chủ: nhánh S, FE3-PLAN §3-S1).
 *
 * Bốn thứ, dùng bởi H/W/R/K/C/E:
 *   · `kit-mode`   — hình thái ⚙️/🎨 lưu bằng tag hệ thống `kg-*`
 *   · `kit-status` — 5 trạng thái một dòng trên thẻ Home
 *   · `copy`       — từ điển chữ tiếng Việt chốt toàn hệ (UX-V3 §5)
 *   · `deprecate`  — nhãn cho màn đã rời đường chính
 *
 * LUẬT: module này **không chứa `fetch`, không hook, không JSX**. Nó chỉ là dữ liệu + hàm thuần,
 * để mọi nhánh import được mà không kéo theo React tree hay lời gọi mạng nào.
 */
export * from "./lib/kit-mode";
export * from "./lib/kit-status";
export * from "./lib/copy";
export * from "./lib/deprecate";
