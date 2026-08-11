/**
 * features/setup/hooks/use-setup-exit.ts — RỜI WIZARD cho đúng chỗ.
 *
 * Ba việc phải làm đúng, và cả ba đều dễ làm sai:
 *
 * 1. ĐIỀU HƯỚNG BẰNG ROUTER, không phải `window.location.href`. Gán location là nạp
 *    lại toàn bộ bundle — mất cache TanStack Query vừa dựng, và ở đường vào mirror
 *    `/app/` còn dễ trượt basepath. `useNavigate` giữ nguyên SPA.
 *
 * 2. TÔN TRỌNG `?redirect=`. Guard `routes/guards.ts` đá user về `/setup` có kèm chỗ họ
 *    định tới. Xong wizard mà quẳng họ về trang chủ là bắt họ đi lại từ đầu.
 *    `setupSearchSchema` đã chặn open-redirect (chỉ nhận đường dẫn nội bộ, không `//`)
 *    nên ở đây chỉ cần kiểm lại một lần cho chắc — kiểm hai lần rẻ hơn một lần sót.
 *
 * 3. `replace: true`. Wizard đã xong thì KHÔNG được nằm lại trong lịch sử: bấm Back
 *    sau khi tạo project mà rơi ngược vào màn cài đặt là một trải nghiệm khó hiểu.
 *
 * Ý ĐỊNH "tạo project" / "nhập project" phát bằng CustomEvent trên `window`.
 * ⚠️ TẠM THỜI — đã ghi teams/react/NEEDS-s0-setup.md (N3): `projectsSearchSchema` của
 * R1-P1 hiện chỉ có `q` và `tag`, không có tham số nào để deep-link mở modal Tạo/Nhập,
 * mà tôi thì không được sửa file của R1. Sự kiện là giải pháp tạm; nếu S1 chưa lắng
 * nghe thì user vẫn về đúng danh sách project, chỉ là phải tự bấm [Tạo project] —
 * KHÔNG có màn trắng, không có nút chết.
 * TODO(R1-P1): thêm `?new=1` / `?import=1` vào `projectsSearchSchema` rồi đổi hook này
 * sang `navigate({ to: "/", search: { new: true } })` và bỏ CustomEvent.
 */
import * as React from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";

export const SETUP_INTENT_EVENT = {
  create: "kg:create-project",
  import: "kg:import-project",
} as const;

export type ExitIntent = "create" | "import" | "home";

function safeInternalPath(v: unknown): string | null {
  if (typeof v !== "string") return null;
  if (!v.startsWith("/") || v.startsWith("//")) return null;
  return v;
}

export function useSetupExit(): (intent: ExitIntent) => void {
  const navigate = useNavigate();
  // `strict: false` = không phụ thuộc vào định nghĩa route của R1-P1; thiếu param
  // thì trả undefined chứ không ném.
  const search = useSearch({ strict: false }) as { redirect?: unknown };
  const redirect = safeInternalPath(search?.redirect);

  return React.useCallback(
    (intent: ExitIntent) => {
      /* (§W1-9) ĐÓNG TODO Ở ĐẦU FILE: `projectsSearchSchema` nay đã có `action`, và
         `ProjectsScreen` đã ĐỌC nó (`lib/useCreateIntent.ts`). Ý định đi bằng URL, không
         còn bằng CustomEvent — sự kiện cũ chưa bao giờ có ai nghe. */
      if (intent !== "home") {
        void navigate({ to: "/", search: { action: intent }, replace: true });
        return;
      }
      void navigate({ to: redirect ?? "/", replace: true });
    },
    [navigate, redirect]
  );
}
