/**
 * features/docs/lib/subfile-intent.ts — HỢP ĐỒNG DEEP-LINK giữa tầng file con và router.
 *
 * FE2-PLAN §3-C3 yêu cầu: *"deep-link intent là callback typed để E1 nối, component C
 * không tự biết router"*. File này là chỗ viết ra cái "typed" đó, thay vì để nó là một
 * quy ước truyền miệng trong review.
 *
 * VÌ SAO KHÔNG ĐỂ C TỰ ĐIỀU HƯỚNG: `SubfileTabs` được mount trên **6 màn project**
 * (rủi ro FE2-PLAN §6). Nếu nó tự gọi `navigate()` thì mỗi màn phải có một bản đồ URL
 * riêng nằm bên trong component, và đổi router là sửa cả tầng file con. Ở đây component
 * chỉ **phát ý định**; E1 dịch ý định thành URL. Đổi `/p/:id/f/:fileId` sang hình dạng
 * khác không phải sửa một dòng nào trong `features/docs/components/**`.
 *
 * ⚠️ File này KHÔNG import `@tanstack/react-router`, không đọc `window.location`, và
 * KHÔNG được phép làm thế — có test grep canh (`subfile-a11y.test.ts` không đủ, xem
 * `subfile-a11y.dom.test.tsx` mục "router-agnostic").
 */

/** Người dùng vừa muốn gì với file con. Đóng — E1 phải xử lý hết, không có nhánh rơi. */
export type SubfileIntent =
  /** Mở file trong đúng khung hiện tại (đổi tab). */
  | { type: "open"; docId: string }
  /** Mở file ở tab TRÌNH DUYỆT mới (chuột giữa / ⌘click) — E1 quyết định có hỗ trợ không. */
  | { type: "open-new-window"; docId: string }
  /** Vừa tạo file: mở nó ra ngay (§4.4 "file mới mở ngay"). */
  | { type: "created"; docId: string }
  /**
   * File đang mở vừa bị xoá ⇒ đã chuyển sang `docId` an toàn.
   * E1 phải ĐỔI URL theo, nếu không thì reload sẽ quay lại một file không còn tồn tại.
   */
  | { type: "moved-after-delete"; docId: string; deletedId: string };

export type SubfileIntentHandler = (intent: SubfileIntent) => void;

/**
 * Hình dạng URL mà E1 cấp cho mục «Sao chép liên kết». Trả chuỗi RỖNG nghĩa là
 * "chưa có URL" ⇒ UI chép id file thay vì chép một chuỗi rỗng vô nghĩa.
 */
export type DocLinkResolver = (docId: string) => string;

/** Chuỗi sẽ được chép khi E1 chưa cấp URL — vẫn dán được vào chỗ hỏi "file nào?". */
export function fallbackLinkText(docId: string): string {
  return docId;
}

/** `linkForDoc` có thể trả rỗng/undefined ⇒ về id. Một chỗ quyết định, không rải rác. */
export function resolveDocLink(docId: string, resolver?: DocLinkResolver): string {
  const url = resolver?.(docId)?.trim();
  return url && url.length > 0 ? url : fallbackLinkText(docId);
}
