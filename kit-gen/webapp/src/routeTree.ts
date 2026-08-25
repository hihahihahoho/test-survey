import { Route as rootRoute } from "./routes/__root";
import { Route as setupRoute } from "./routes/setup";
import { Route as indexRoute } from "./routes/index";
import { Route as settingsRoute } from "./routes/settings";
import { Route as uiLibraryRoute } from "./routes/library.ui";
import { Route as mascotLibraryRoute } from "./routes/library.mascot";
import { Route as brandsRoute } from "./routes/brands";
import { Route as referencesRoute } from "./routes/references";
import { Route as trashRoute } from "./routes/trash";
import { Route as projectRoute } from "./routes/p.$projectId";
import { Route as kitMainRoute } from "./routes/k.$projectId";
import { Route as kitStudioRoute } from "./routes/k.$projectId.studio";
import { Route as kitFormRoute } from "./routes/k.$projectId.form";
import { Route as canvasRoute } from "./routes/k.$projectId.canvas";
import { Route as fileRoute } from "./routes/p.$projectId.f.$fileId";
import { Route as designRoute } from "./routes/p.$projectId.design";
import { Route as runsRoute } from "./routes/p.$projectId.runs";
import { Route as runDetailRoute } from "./routes/p.$projectId.runs.$runId";
import { Route as kitRoute } from "./routes/p.$projectId.kit";
import { Route as projectSettingsRoute } from "./routes/p.$projectId.settings";
import { Route as previewRoute } from "./routes/__preview.route";
import { Route as promptComposerLabRoute } from "./routes/lab.prompt-composer";
import { Route as promptComposerPresetsRoute } from "./routes/lab.prompt-composer.presets";
import { Route as poseEditorLabRoute } from "./routes/lab.pose-editor";

/**
 * CÂY ROUTE — khai báo TAY, đúng sitemap §2.1. Không dùng file-based codegen.
 * Lý do giữ nguyên từ R0: `routeTree.gen.ts` phải commit và rất dễ lệch khi
 * nhiều team cùng thêm màn; khai tay thì xung đột merge nhìn thấy rõ.
 *
 * ┌─ AI ĐƯỢC SỬA FILE NÀY ─────────────────────────────────────────────────┐
 * │ CHỈ engineer app-shell + routing. Team màn KHÔNG khai route.            │
 * │ Team màn chỉ nộp file theo hợp đồng lazy-mount (screen-contract.ts);    │
 * │ route đã có sẵn và tự nhận file khi nó xuất hiện.                       │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * §2.1 có ĐÚNG 8 màn (9 route vì run-detail tách khỏi runs). Mọi thứ còn lại
 * là overlay của 8 màn đó — không thêm route mới mà không sửa spec trước.
 * `__preview` là trang showcase component của R0, không nằm trong sitemap.
 *
 * FE-2·E1 THÊM ROUTE THỨ 10 — `/p/:id/f/:fileId` (bàn làm việc, file con kiểu canvas).
 * Đúng luật "sửa spec trước": UI-SPEC-V2 §4.3 chốt đường dẫn này nguyên văn. File con
 * kiểu **workflow** thì KHÔNG có route riêng — chúng đi bằng `?file=` trên các route cũ,
 * để đổi file không remount màn (§2.1 vẫn đúng 8 màn + 2 route phụ).
 *
 * ⚠️ THỨ TỰ QUAN TRỌNG: `fileRoute` phải nằm TRƯỚC `projectRoute` cùng lý do mà
 * `runDetailRoute` nằm trước `runsRoute` — route cụ thể trước route tổng.
 */
export const routeTree = rootRoute.addChildren([
  /* S0 */ setupRoute,
  /* S1 */ indexRoute,
  /* S6 */ settingsRoute,
  uiLibraryRoute,
  mascotLibraryRoute,
  brandsRoute,
  referencesRoute,
  trashRoute,
  /* W1 */ kitFormRoute,
  /* Studio */ kitStudioRoute,
  /* W3/C1 */ kitMainRoute,
  /* C1 */ canvasRoute,
  /* S3 */ designRoute,
  /* S4d*/ runDetailRoute,
  /* S4 */ runsRoute,
  /* S5 */ kitRoute,
  /* S2b*/ projectSettingsRoute,
  /* legacy */ fileRoute,
  /* S2 */ projectRoute,
  previewRoute,
  /* lab — cùng hạng với `previewRoute`: trang công cụ cho người làm, KHÔNG có
     link nào trong UI trỏ tới, chỉ vào bằng URL. Xem đầu file route để biết vì
     sao nó không đụng vào "đúng 8 màn" của §2.1.
     Trang preset đứng TRƯỚC màn composer — route cụ thể trước route tổng, cùng
     luật với `runDetailRoute` / `runsRoute` ở trên. */
  promptComposerPresetsRoute,
  promptComposerLabRoute,
  poseEditorLabRoute,
]);
