/**
 * webapp/src/features/design/library/lib/contract.ts
 * ────────────────────────────────────────────────────────────────────────────
 * CẦU NỐI sang hợp đồng CHÍNH THỨC của R2-P1: `features/design/contracts.ts`.
 *
 * LỊCH SỬ NGẮN, GHI LẠI CHO TRUNG THỰC: lúc tôi bắt đầu, `features/design/` chưa
 * tồn tại (đã kiểm: `ls webapp/src/features` chỉ có `projects`, `setup`) nên theo
 * mục 4 của brief tôi tự định nghĩa một interface tối thiểu ở đây. Sau đó R2-P1 nộp
 * `contracts.ts` + `slots.tsx`. Interface tự chế ĐÃ BỊ BỎ và drawer chuyển sang
 * dùng ĐÚNG `ElementLibraryDrawerProps` của R2-P1 — một hợp đồng, một chủ sở hữu.
 * Những chỗ tôi thấy thiếu đã ghi ở `teams/react/NEEDS-r2p3.md` chứ không tự vá.
 *
 * Ở lại file này chỉ còn mấy hàm THUẦN mà drawer cần và không thuộc về ai khác.
 */
import type { Component } from "@/lib/types/contract";
import type { LibElement } from "./types";

/** Kiểu chính chủ — re-export để trong `library/**` chỉ import từ một chỗ. */
export type {
  ElementLibraryDrawerProps,
  ElementLibraryDrawerComponent,
} from "../../contracts";

/**
 * Element thư viện → component của contract. ĐÂY LÀ BƯỚC COPY của chốt X8:
 * catalogue chỉ-đọc, "thêm" nghĩa là sao chép vào bản thiết kế của project.
 *
 * `structuredClone` cho `skel` là bắt buộc, không phải cho đẹp: thư viện được
 * dùng chung cho mọi lần thêm, chia sẻ tham chiếu thì user sửa `w` của element
 * trong project sẽ đổi luôn bản trong thư viện (và mọi element thêm sau đó).
 *
 * KHÔNG tự đặt tên file / không tự chọn ô: `ops.addElements()` của R2-P1 lo việc
 * đó (điền ô trống trước, hết chỗ thì nới lưới, tên file theo dạng V-01).
 */
export function libToComponent(e: LibElement): Partial<Component> {
  return {
    file: String(e.file ?? ""),
    vi: String(e.vi ?? ""),
    spec: String(e.spec ?? ""),
    skel: structuredClone(e.skel),
  };
}

/** Hướng sheet mới suy từ `cell`: chỉ dọc khi TẤT CẢ element đều là ô dọc. */
export function orientFor(elements: readonly LibElement[]): "landscape" | "portrait" {
  return elements.length > 0 && elements.every((e) => e.cell === "portrait") ? "portrait" : "landscape";
}

/**
 * Tên sheet gợi ý khi tạo sheet mới: theo `sheetHint` nếu MỌI element được chọn
 * cùng một hint (đúng cách `studio.html` dòng 250 đặt tên chunk).
 * Chỉ để HIỆN CHỮ cho user biết trước — việc đặt id thật là của R2-P1.
 */
export function suggestedSheetId(elements: readonly LibElement[]): string | undefined {
  const first = elements[0]?.sheetHint;
  if (first !== undefined && first !== "" && elements.every((e) => e.sheetHint === first)) return first;
  return undefined;
}
