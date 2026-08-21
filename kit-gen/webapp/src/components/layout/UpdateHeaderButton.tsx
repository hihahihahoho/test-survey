import { ArrowUpCircle } from "lucide-react";
import { useInstallUpdateFlow, useUpdateCheck } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { FLORA, FOCUS } from "./flora";

/**
 * NÚT [Cập nhật] TRÊN THANH HEADER — chỉ hiện ở các màn KHÔNG phải Home.
 *
 * VÌ SAO CÓ FILE NÀY
 *   Lối cập nhật duy nhất trước đây là `UpdateSidebarButton`, mà sidebar chỉ tồn tại ở
 *   Home. Ai đang ở trong một dự án thì phải **thoát ra Home mới thấy nút** — người dùng
 *   đã kêu đúng chuyện này. Mà "đang ở trong dự án" lại chính là lúc người ta gặp lỗi và
 *   cần bản vá nhất; bắt họ rời chỗ đang làm để đi tìm nút là đặt rào ngay trước cửa.
 *
 * CÙNG MỘT LUẬT VỚI NÚT Ở SIDEBAR, cố ý không lệch một ly:
 *   · có bản mới thì hiện, không thì **trả `null`** — không `hidden`, không `opacity-0`.
 *     Nó không chiếm chỗ và không lọt vào thứ tự Tab trong 99% thời gian.
 *   · kiểm tra hỏng (`ok:false`, mất mạng) ⇒ CŨNG ẩn. Không có bằng chứng có bản mới thì
 *     không được mời người ta cập nhật.
 *   · bấm xong thứ nhìn thấy là `UpdateOverlay` toàn trang (gắn ở `App.tsx`), không phải
 *     cái nút này đổi chữ. `pending` chỉ để chặn cú bấm thứ hai trong khoảnh khắc chờ.
 *
 * `useUpdateCheck()` dùng chung cache của TanStack Query với nút ở sidebar, nên dựng thêm
 * nút này KHÔNG thêm một request nào — hai chỗ đọc cùng một kết quả.
 *
 * HÌNH DÁNG: pill h-8 y hệt [Cài đặt] nằm cạnh, chỉ khác màu accent để đọc ra là "việc
 * nên làm" chứ không phải một chỗ để xem. Dưới `sm` rút còn mỗi icon — header ở màn hẹp
 * đã chật, mà icon + `aria-label` là đủ để bấm và đủ cho trình đọc màn hình.
 */
export function UpdateHeaderButton() {
  const update = useUpdateCheck();
  const { pending, start } = useInstallUpdateFlow();

  if (!update.data?.ok || !update.data.available) return null;

  const version = update.data.latestVersion;
  const label = pending ? "Đang cập nhật…" : `Cập nhật ${version}`;

  return (
    <button
      type="button"
      onClick={() => void start(version)}
      disabled={pending}
      aria-label={`Cập nhật KitGen lên ${version}`}
      title={`Cập nhật KitGen lên ${version}`}
      className={cn(
        "inline-flex h-8 items-center gap-2 border px-3 text-caption",
        FLORA.pill,
        "border-accent bg-accent/[var(--kg-tint-a)] text-accent-text",
        "transition-colors duration-fast hover:border-accent-hover",
        "disabled:cursor-not-allowed",
        FOCUS,
      )}
    >
      <ArrowUpCircle className="size-3.5 shrink-0" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
