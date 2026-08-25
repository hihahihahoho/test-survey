import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { Route as rootRoute } from "./__root";

/**
 * `/lab/pose-editor` — DEMO "Pose & Sketch Lab" (manơcanh 3D + phác tay).
 *
 * ┌── VÌ SAO ROUTE NÀY KHÔNG PHÁ LUẬT "8 MÀN CỦA §2.1" ──────────────────────┐
 * │ Nó không phải một màn của sản phẩm. Cùng hạng với `/__preview` và         │
 * │ `/lab/prompt-composer`: trang công cụ cho người làm, KHÔNG có link nào    │
 * │ trong UI chính trỏ tới, chỉ vào được bằng URL gõ tay.                     │
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * NẠP LAZY, lý do đo được y như hai tiền lệ trên nhưng nặng hơn nhiều: màn này
 * kéo theo `three` + `@react-three/fiber` + `@react-three/drei` (~700 kB trước
 * gzip). Import tĩnh thì mọi người dùng thật tải một engine 3D mà họ không bao
 * giờ mở. Bên trong màn còn một biên `React.lazy` NỮA quanh chính khung WebGL —
 * xem `features/pose-lab/components/PoseViewport.tsx` để biết vì sao.
 *
 * KHÔNG có `beforeLoad: requireSetup` — lab không đụng workspace.
 */
export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lab/pose-editor",
  component: lazyRouteComponent(() => import("@/features/pose-lab"), "PoseSketchLabScreen"),
});
