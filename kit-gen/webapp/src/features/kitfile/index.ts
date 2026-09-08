/**
 * features/kitfile — NỀN CHUNG của đợt FE-3 (chủ: nhánh S, FE3-PLAN §3-S1).
 *
 * Ba thứ, dùng bởi màn Home và các dialog của nó:
 *   · `kit-mode`   — hình thái ⚙️/🎨 lưu bằng tag hệ thống `kg-*`
 *   · `kit-status` — 5 trạng thái một dòng trên thẻ Home
 *   · `copy`       — từ điển chữ tiếng Việt chốt toàn hệ (UX-V3 §5)
 *
 * `deprecate` (nhãn «Nâng cao» cho màn đã rời đường chính) đã xoá ở Đợt 3: bốn trong
 * năm màn nó dán nhãn (`design`, `runs`, `kit-library`, `subfiles`) không còn tồn tại,
 * và không màn nào từng render dải thông báo đó.
 *
 * LUẬT: module này **không chứa `fetch`, không hook, không JSX**. Nó chỉ là dữ liệu + hàm thuần,
 * để mọi nhánh import được mà không kéo theo React tree hay lời gọi mạng nào.
 */
export * from "./lib/kit-mode";
export * from "./lib/kit-status";
export * from "./lib/copy";
