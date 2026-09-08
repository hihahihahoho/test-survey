import { Route as rootRoute } from "./routes/__root";
import { Route as indexRoute } from "./routes/index";
import { Route as settingsRoute } from "./routes/settings";
import { Route as uiLibraryRoute } from "./routes/library.ui";
import { Route as mascotLibraryRoute } from "./routes/library.mascot";
import { Route as brandsRoute } from "./routes/brands";
import { Route as referencesRoute } from "./routes/references";
import { Route as trashRoute } from "./routes/trash";
import { Route as kitMainRoute } from "./routes/k.$projectId";
import { Route as legacyProjectRoute } from "./routes/p.$";

/**
 * CÂY ROUTE — khai báo TAY, đúng sitemap. Không dùng file-based codegen.
 * Lý do giữ nguyên từ R0: `routeTree.gen.ts` phải commit và rất dễ lệch khi
 * nhiều team cùng thêm màn; khai tay thì xung đột merge nhìn thấy rõ.
 *
 * ┌─ AI ĐƯỢC SỬA FILE NÀY ─────────────────────────────────────────────────┐
 * │ CHỈ engineer app-shell + routing. Team màn KHÔNG khai route.            │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ══ IA PROMPT-FIRST: MỘT MÀN LÀM VIỆC, MỘT LỚP VỎ ═════════════════════════
 * `/k/:projectId` là màn làm việc DUY NHẤT (khu soạn prompt). Bảy route còn lại
 * là vỏ: trang chủ, cài đặt máy, thùng rác, và bốn thư viện.
 *
 * `/p/$` là TẤM BIỂN CHỈ ĐƯỜNG cho mọi địa chỉ đời cũ — xem `routes/p.$.tsx`.
 * Nó phải đứng CUỐI: một route splat khớp rất rộng, đặt trước là nó nuốt mất
 * những route cụ thể hơn.
 *
 * 07/09/2026 — `/setup` (S0) BỊ XOÁ cùng wizard cài đặt: máy được cài xong TRƯỚC
 * khi server mở app nên không còn gì để hỏi.
 * 08/09/2026 — bảy stub `/p/:id/**` + ba stub `/k/:id/{studio,form,canvas}` gộp
 * thành `/p/$`; trang showcase `/__preview` bị xoá (component của nó đã đi theo
 * các màn bị gỡ). Ai dựng lại một trang lab/preview thì đăng ký ở ĐÂY.
 */
export const routeTree = rootRoute.addChildren([
  indexRoute,
  settingsRoute,
  uiLibraryRoute,
  mascotLibraryRoute,
  brandsRoute,
  referencesRoute,
  trashRoute,
  kitMainRoute,
  legacyProjectRoute,
]);
