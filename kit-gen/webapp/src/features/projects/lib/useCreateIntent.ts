/**
 * features/projects/lib/useCreateIntent.ts — Ý ĐỊNH mang từ màn khác sang Home.
 *
 * UPGRADE-PLAN §W1-9: nút TO NHẤT cuối wizard cài đặt ([Tạo bộ kit đầu tiên]) và lệnh
 * đầu bảng ⌘K ("Tạo bộ kit mới…") đều bắn `navigate({to:"/", search:{action}})`, nhưng
 * `ProjectsScreen` **không đọc `?action=`** ⇒ người dùng vừa cài xong, bấm nút lớn nhất
 * màn hình, rơi về Home trống. Thất bại không phản hồi gì — đúng thứ §3.9 cấm.
 *
 * Đường sự kiện `CustomEvent("kg:create-project")` bị bỏ: **không ai nghe** nó, và một ý
 * định nằm trên URL thì F5 vẫn còn, deep-link vẫn mở, không phụ thuộc thứ tự mount.
 *
 * Param bị dọn ngay sau khi mở dialog (`replace: true`) để F5 lần hai không mở lại
 * dialog mà người dùng vừa đóng.
 */
import * as React from "react";

export type CreateIntent = "create" | "import";

/** Đọc ý định từ search THÔ (đến từ URL ⇒ phải coi là dữ liệu bẩn). */
export function intentOf(search: unknown): CreateIntent | null {
  if (!search || typeof search !== "object") return null;
  const action = (search as { action?: unknown }).action;
  return action === "create" || action === "import" ? action : null;
}

/**
 * Chạy ý định đúng MỘT lần cho mỗi lần `?action=` đổi giá trị.
 * `run`/`clear` đi qua ref nên nơi gọi không cần `useCallback` để tránh chạy lại.
 */
export function useCreateIntent(
  search: unknown,
  run: (intent: CreateIntent) => void,
  clear: () => void,
): void {
  const runRef = React.useRef(run);
  runRef.current = run;
  const clearRef = React.useRef(clear);
  clearRef.current = clear;

  const intent = intentOf(search);
  React.useEffect(() => {
    if (!intent) return;
    runRef.current(intent);
    clearRef.current();
  }, [intent]);
}
