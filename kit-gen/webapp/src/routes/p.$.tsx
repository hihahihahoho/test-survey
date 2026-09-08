import { createRoute, Navigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { isProjectId } from "@/lib/types";
import { kitCanvasSearchSchema } from "./search-schemas";

/**
 * `/p/*` — MỘT TẤM BIỂN CHỈ ĐƯỜNG DUY NHẤT cho toàn bộ địa chỉ đời cũ.
 *
 * ╔══ VÌ SAO MỘT ROUTE THAY VÌ BẢY ══════════════════════════════════════════╗
 * ║ App chỉ còn MỘT màn làm việc (`/k/:id`). Trước đợt này mỗi đường cũ       ║
 * ║ (`/p/:id`, `/p/:id/design`, `/p/:id/kit`, `/p/:id/runs`, `/p/:id/runs/:r`,║
 * ║ `/p/:id/settings`, `/p/:id/f/:fileId`) có một file route riêng, và cả bảy ║
 * ║ file chỉ chứa đúng một `<Navigate>` giống hệt nhau. Bảy bản sao của cùng  ║
 * ║ một câu là bảy chỗ để quên sửa.                                          ║
 * ║                                                                           ║
 * ║ Route Ở LẠI (không xoá hẳn) vì bookmark, lịch sử trình duyệt và link chia ║
 * ║ sẻ đời trước đều trỏ vào `/p/**`. Xoá là biến tất cả thành trang «không   ║
 * ║ tìm thấy» — deep link cũ phải SỐNG, chỉ là nay nó dẫn về đúng một chỗ.    ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ĐOẠN ĐẦU của phần đuôi là id dự án. Đúng dạng ⇒ về `/k/<id>`; không đúng dạng
 * (`/p/`, `/p/BAD`, `/p/../x`) ⇒ về trang chủ chứ KHÔNG ném lỗi làm trắng màn.
 *
 * `?settings=` được MANG THEO, và chỉ nó. Link `/p/:id?settings=project` — thứ bảng
 * lệnh ⌘K đời trước phát ra, và thứ nằm trong bookmark của người dùng — phải mở đúng
 * dialog Cài đặt dự án ở đích mới. `<Navigate>` KHÔNG tự giữ search (đã đo: search
 * của đích được dựng lại từ schema của route đích), nên param phải chuyển tay.
 * `section`/`group` là từ vựng của những màn đã bị gỡ ⇒ rơi lại đây, đúng chỗ của chúng.
 *
 * Chuyển hướng bằng `<Navigate>` chứ không `throw redirect()` trong `beforeLoad`:
 * `router.load()` trong môi trường Node KHÔNG chạy `beforeLoad` (xem chú thích
 * đầu `__tests__/router-match.test.ts`) ⇒ đổi sang `redirect()` là mất chỗ kiểm.
 */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/p/$",
  component: LegacyProjectRedirect,
});

/** `"tet26-a7f3/runs/r-0031"` → `"tet26-a7f3"`; đuôi rác → `null`. */
export function projectIdFromSplat(splat: string | undefined): string | null {
  const head = (splat ?? "").split("/")[0] ?? "";
  return isProjectId(head) ? head : null;
}

function LegacyProjectRedirect() {
  const params = Route.useParams() as { _splat?: string };
  const raw = Route.useSearch() as Record<string, unknown>;
  const projectId = projectIdFromSplat(params._splat);
  if (projectId === null) return <Navigate to="/" replace />;

  /* Đi qua chính schema của đích: giá trị lạ (`?settings=bịa`) rơi về `undefined`
     thay vì được ném nguyên si sang một route đang validate nó. */
  const { settings } = kitCanvasSearchSchema.parse(raw ?? {});
  return (
    <Navigate
      to="/k/$projectId"
      params={{ projectId }}
      search={settings === undefined ? {} : { settings }}
      replace
    />
  );
}
