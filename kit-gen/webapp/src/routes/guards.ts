import { redirect } from "@tanstack/react-router";
import { useSetupStore } from "@/lib/store";

/**
 * GUARD "chưa setup xong ⇒ ép về /setup" (§2.1: S0 tự mở khi
 * `kitgen.setup.v1.completed !== true`).
 *
 * ĐỌC TRỰC TIẾP TỪ STORE, KHÔNG hỏi agent. Lý do: guard chạy TRƯỚC khi màn
 * render, mà trạng thái agent thì bất đồng bộ. Nếu guard phải chờ `/health`
 * thì mỗi lần mở app sẽ có một khoảng trắng — đúng thứ §1.6 cấm ("agent chưa
 * chạy không phải là màn hình trắng").
 *
 * `completed` chỉ nói "người này đã đi qua wizard", KHÔNG nói "agent đang
 * chạy". Việc agent tắt do banner §2.5 lo, không phải guard.
 */
export function requireSetup(pathname: string): void {
  if (useSetupStore.getState().completed === true) return;
  throw redirect({
    to: "/setup",
    // Nhớ chỗ user định tới để wizard xong thì trả họ về đúng đó.
    // `search-schemas.ts` đã chặn giá trị không phải đường dẫn nội bộ.
    search: pathname && pathname !== "/" ? { redirect: pathname } : {},
    replace: true,
  });
}
