import { createRoute, useNavigate } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";
import { LazyScreen } from "@/components/layout";
import { setupSearchSchema } from "./search-schemas";

/**
 * S0 `/setup` — wizard 4 bước. ĐÂY LÀ ROUTE DUY NHẤT KHÔNG CÓ GUARD setup
 * (§2.1: "needsSetup=false ⇒ vào được khi chưa setup"). Nếu gắn guard vào đây
 * thì user chưa setup sẽ bị đá vòng tròn /setup → /setup.
 *
 * Cũng KHÔNG bọc `AppLayout`: wizard không có rail, không breadcrumb, và
 * §3-S0 nói "Esc không đóng được wizard nếu chưa xong". Màn tự dựng khung của
 * nó (chủ sở hữu: R1-P2).
 */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  validateSearch: setupSearchSchema,
  component: SetupRoute,
});

function SetupRoute() {
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();

  /**
   * Wizard xong → điều hướng bằng ROUTER, không `window.location.href`.
   * S0 có sẵn đường lùi bằng full reload khi route không truyền `onDone`; ở đây
   * ta truyền, để không mất cache Query và không chớp cả trang.
   *
   * `redirect` là chỗ user định tới trước khi bị guard chặn (xem guards.ts).
   * Giá trị đã được `setupSearchSchema` chặn: chỉ nhận đường dẫn nội bộ.
   * Hai kết cục còn lại theo §3-S0: 2 nút to [Tạo project đầu tiên] /
   * [Nhập từ styles.json cũ] — cả hai đều sống ở S1, nên về S1 rồi phát sự
   * kiện mà S1 lắng nghe (cùng hợp đồng sự kiện với ⌘K, xem AppLayout).
   */
  const onDone = (intent: "create" | "import" | "home") => {
    if (intent === "home" && redirect) {
      void navigate({ to: redirect });
      return;
    }
    if (intent === "create" || intent === "import") {
      /* Cùng hợp đồng với ⌘K: ý định đi bằng SEARCH PARAM, và chỉ bằng nó.
         (§W1-9) `CustomEvent("kg:create-project")` đã bỏ — **không ai nghe** nó bao giờ,
         nên nó chỉ tạo cảm giác có đường thứ hai. Đường thật là `?action=`, do
         `features/projects/lib/useCreateIntent.ts` đọc. */
      void navigate({ to: "/", search: { action: intent } });
      return;
    }
    void navigate({ to: "/" });
  };

  return <LazyScreen screen="setup" onDone={onDone} />;
}
