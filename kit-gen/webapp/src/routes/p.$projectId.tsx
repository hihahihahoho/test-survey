import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { parseProjectParams } from "./params";
import { projectSearchSchema } from "./search-schemas";

/**
 * `/p/:projectId` — CHỈ CÒN LÀ MỘT TẤM BIỂN CHỈ ĐƯỜNG.
 *
 * ╔══ APP CHỈ CÒN MỘT MÀN LÀM VIỆC ══════════════════════════════════════════╗
 * ║ Chủ sản phẩm chốt: *"bỏ giao diện này đi, chỉ có 1 giao diện prompt,       ║
 * ║ preview trực tiếp trên đấy"*. Màn «Kết quả & xuất kit» dựng ở đợt trước đã ║
 * ║ bị XOÁ, và mọi cửa ra của nó (tải .zip · copy Figma · xem màn demo · cài   ║
 * ║ đặt dự án · xoá) đã chuyển vào hàng công cụ đầu `PromptCanvasScreen`.      ║
 * ║                                                                            ║
 * ║ Route thì Ở LẠI, và đó là cả lý do file này còn tồn tại: bookmark, link    ║
 * ║ chia sẻ, lịch sử trình duyệt và bảng lệnh đời trước đều trỏ về `/p/:id`.   ║
 * ║ Xoá route là biến tất cả chúng thành trang «không tìm thấy» — deep link cũ ║
 * ║ phải SỐNG, chỉ là nó dẫn tới đúng một chỗ.                                 ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * `validateSearch` GIỮ NGUYÊN dù không ai đọc kết quả: link cũ mang `?section=images`
 * hay `?settings=project`, và không có schema thì router coi chúng là search lạ. Schema
 * `.catch()` nuốt mọi giá trị đời cũ nên cú chuyển hướng không bao giờ vỡ vì một param.
 *
 * Chuyển hướng bằng `<Navigate>` chứ không `throw redirect()` trong `beforeLoad`:
 * cả tám route chuyển hướng đời cũ trong thư mục này đều dùng `<Navigate>`, và
 * `router.load()` trong môi trường Node KHÔNG chạy `beforeLoad` (xem chú thích đầu
 * `__tests__/router-match.test.ts`) ⇒ đổi sang `redirect()` là mất chỗ kiểm.
 */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$projectId",
  params: { parse: parseProjectParams },
  validateSearch: projectSearchSchema,
  component: ProjectRoute,
});

function ProjectRoute() {
  const { projectId } = Route.useParams();
  /* `?settings=` ĐI THEO. Đây là param đời cũ DUY NHẤT còn mở được một cái cửa thật
     (dialog Cài đặt dự án, nay treo ở khu soạn). Đánh rơi nó nghĩa là một link
     `/p/:id?settings=project` — thứ bảng lệnh ⌘K đời trước phát ra — mở lên một màn
     không có gì đang mở, và người dùng không hiểu vì sao. `section`/`group` thì
     KHÔNG mang theo: chúng là tên tab của những màn đã bị gỡ. */
  const { settings } = Route.useSearch();
  return (
    <Navigate
      to="/k/$projectId"
      params={{ projectId }}
      search={settings === undefined ? {} : { settings }}
      replace
    />
  );
}
