import { ArrowUpCircle } from "lucide-react";
import { useInstallUpdateFlow, useUpdateCheck } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/**
 * NÚT [Cập nhật] Ở SIDEBAR — ngay trên mục "Cài đặt".
 *
 * Luật một dòng: **có bản mới thì hiện, không thì KHÔNG TỒN TẠI**. Trả `null` chứ không
 * phải `hidden`/`opacity-0`, để nó không chiếm chỗ và không lọt vào thứ tự Tab của bàn
 * phím trong 99% thời gian. Vì vậy đây là chỗ duy nhất trong app được phép "tự nhiên
 * mọc ra" — user không phải nhớ vào Cài đặt bấm kiểm tra mới biết có bản mới.
 *
 * `useUpdateCheck()` để `enabled` mặc định (true) thay vì chờ biết agent có sống không:
 * gọi `useAgentStatus()` ở đây sẽ dựng THÊM một vòng probe `/health` song song với vòng
 * của khung app. Agent chưa chạy thì request hỏng, `retry:false` nuốt im, nút vẫn ẩn —
 * đúng kết quả mong muốn với đúng một request.
 *
 * Kiểm tra không thành công (`ok:false`, mất mạng) CŨNG ẩn nút: không có bằng chứng có
 * bản mới thì không được mời user cập nhật.
 */
export function UpdateSidebarButton() {
  const update = useUpdateCheck();
  const { pending, start } = useInstallUpdateFlow();

  if (!update.data?.ok || !update.data.available) return null;

  return (
    <button
      type="button"
      onClick={() => void start(update.data?.latestVersion)}
      disabled={pending}
      title={`Cập nhật KitGen lên ${update.data.latestVersion}`}
      className={cn(
        "flex h-10 w-full items-center gap-3 rounded-2 px-3 text-left text-label",
        "border border-accent bg-accent/[var(--kg-tint-a)] text-accent-text",
        "transition-colors duration-fast hover:border-accent-hover",
        "disabled:cursor-not-allowed",
      )}
    >
      <ArrowUpCircle className="size-4 shrink-0" aria-hidden />
      <span className="truncate">{pending ? "Đang cập nhật…" : `Cập nhật ${update.data.latestVersion}`}</span>
    </button>
  );
}
