import * as React from "react";

/**
 * project-context.ts — "TÀI LIỆU NÀY THUỘC DỰ ÁN NÀO".
 *
 * ╔══ VÌ SAO LÀ CONTEXT, KHÔNG PHẢI PROP ════════════════════════════════════╗
 * ║ Thứ cần biết id dự án nằm SÂU nhất trong cây và không phải React thường:   ║
 * ║ node view của pill ảnh, do ProseMirror mount ra ở giữa một tài liệu. Muốn  ║
 * ║ truyền prop tới đó thì id phải đi qua màn → thẻ block → `BlockEditor` →    ║
 * ║ `Extension.configure()` → node view: năm chặng, và chặng nào quên cũng     ║
 * ║ chỉ lộ ra bằng một cái pill không tải được ảnh, không lỗi.                 ║
 * ║                                                                          ║
 * ║ `null` là giá trị hợp lệ và có nghĩa rõ ràng: KHÔNG có dự án nào — một     ║
 * ║ tài liệu dựng ngoài ngữ cảnh dự án (test, story). Pill ảnh phải           ║
 * ║ NÓI RA điều đó thay vì im lặng không làm gì — xem `ImagePill`.            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export const PromptProjectContext = React.createContext<string | null>(null);

/** Id dự án đang mở, hoặc `null` khi tài liệu chưa gắn vào dự án nào. */
export function usePromptProjectId(): string | null {
  return React.useContext(PromptProjectContext);
}
