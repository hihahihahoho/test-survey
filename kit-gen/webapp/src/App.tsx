import * as React from "react";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { queryClient } from "@/lib/query";
import { useUiStore, applyTheme } from "@/lib/store";
import { ErrorBoundary, UpdateOverlay, UpdateResultNotice } from "@/components/layout";
import { routeTree } from "./routeTree";
import { detectBaseHref, toRouterBasepath } from "@/lib/basepath";
import { NotFoundScreen } from "./routes/-not-found";
import { RouteErrorScreen } from "./routes/-route-error";

/**
 * CÙNG một bundle chạy được ở hai đường vào (arch §3.2):
 *   (1) Cloudflare Pages   https://…/                  → basepath "/"
 *   (2) agent same-origin  http://127.0.0.1:8765/app/  → basepath "/app"
 * Không hardcode: suy từ URL thật. Xem lib/basepath.ts để biết vì sao còn cần
 * kèm <base href> trong index.html (lỗi B2 — deep link làm trắng trang).
 */
export const router = createRouter({
  routeTree,
  basepath: toRouterBasepath(detectBaseHref(window.location.pathname)),
  defaultPreload: "intent",
  /**
   * "root" chứ KHÔNG phải mặc định "fuzzy".
   *
   * ĐO ĐƯỢC (src/routes/__tests__/router-match.test.ts): với "fuzzy",
   * `/p/tet26-a7f3/runs/0031` — runId sai dạng, `params.parse` đã từ chối —
   * vẫn bị gán về route CHA `/p/$projectId/runs` và render màn danh sách lượt
   * chạy. User bấm vào một link hỏng lại thấy một màn bình thường, không hiểu
   * mình đang ở đâu. Với "root", URL không khớp route nào thì ra thẳng trang
   * 404 có đường về — đúng tinh thần §1.5 (không bỏ user bơ vơ).
   */
  notFoundMode: "root",
  defaultNotFoundComponent: NotFoundScreen,
  defaultErrorComponent: RouteErrorScreen,
  context: { queryClient },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

/**
 * Gốc ứng dụng.
 *
 * Thứ tự bọc có chủ đích:
 *   ErrorBoundary (ngoài cùng) → lỗi ở BẤT KỲ đâu, kể cả trong RouterProvider,
 *     vẫn ra một màn có nút thử lại thay vì trang trắng.
 *   QueryClientProvider → TooltipProvider → RouterProvider.
 *   Toaster đặt NGOÀI router: toast "Đã xoá — [Hoàn tác 10s]" phải sống sót
 *     qua điều hướng, nếu không thì xoá project xong rời màn là mất đường lùi.
 *   UpdateOverlay / UpdateResultNotice cũng NGOÀI router, và vì đúng lý do đó ở mức
 *     gắt hơn: lượt cập nhật bắt đầu từ sidebar hoặc từ popover header (popover đóng =
 *     unmount), chạy xuyên qua mọi điều hướng, rồi kết thúc bằng một lần tải lại trang.
 *     Không có chỗ nào trong cây route sống đủ lâu để giữ nó.
 */
export function App() {
  const theme = useUiStore((s) => s.theme);
  React.useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <ErrorBoundary title="Ứng dụng gặp trục trặc">
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <UpdateOverlay />
          <UpdateResultNotice />
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
