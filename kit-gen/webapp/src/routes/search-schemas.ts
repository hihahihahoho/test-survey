import { z } from "zod";
import { RE_DOC_ID } from "@/features/docs/lib/types";

/**
 * SEARCH SCHEMA (§2.1) — tab con của S3/S5/S6 đi qua search param, không phải
 * route riêng. Lý do: đổi tab KHÔNG được làm remount cả màn (S3 là editor 3 cột
 * có cuộn riêng — remount là mất chỗ cuộn, mất selection; đúng bệnh audit #8).
 *
 * `.catch(...)` là chủ ý, không phải lười: link cũ / URL gõ tay có `?tab=xyz`
 * phải rơi về tab đầu **chứ không được ném lỗi làm trắng màn**. Đây là quy tắc
 * "tab lạ → về tab đầu, không vỡ UI" mà bản vanilla đã chốt trong routes.js.
 * (Đã kiểm bằng zod thật: `z.enum(...).default(x).catch(x)` cho `{}` → x,
 * `{tab:"zzz"}` → x, `{tab:"b"}` → "b".)
 */

/* ══════════════════════════════════════════════════════════════════════════
   FE-2 · E1 — `?file=<docId>` : FILE CON ĐANG MỞ trên các route workflow
   ══════════════════════════════════════════════════════════════════════════

   §4.3 chốt HAI hình dạng URL, không phải một:
     · `/p/:projectId/f/:fileId`  cho file kiểu **canvas** (route riêng, `p.$projectId.f.$fileId.tsx`)
     · `?file=<docId>` cộng thêm vào **route workflow đã có** (S2/S2b/S3/S4/S4d/S5)

   VÌ SAO KHÔNG LÀM ROUTE CON CHO CẢ FILE WORKFLOW: đổi file con **không được**
   remount cả màn. S3 là editor 3 cột có cuộn riêng, S5 là lưới hàng trăm ảnh —
   remount là mất chỗ cuộn và mất selection, đúng bệnh audit #8 mà chú thích đầu
   file này đã cấm. Search param thì đổi trong CÙNG một match ⇒ không remount.

   `docId` được kiểm bằng ĐÚNG `RE_DOC_ID` của tầng file con (`features/docs/lib/types.ts`),
   không phải một regex chép tay: một id sai dạng (`../`, `raw`, chuỗi 200 ký tự) không
   bao giờ được đi tiếp tới repo. Sai dạng ⇒ `.catch(undefined)` ⇒ **rơi về file mặc định
   kèm thông báo**, KHÔNG ném lỗi làm trắng màn (cùng luật với `?tab=` ở trên).
   Đã kiểm bằng zod thật, output ở `fe2/E1-REPORT.md`.
*/

/** Một field dùng lại cho mọi schema có `?file=`. Sai dạng ⇒ `undefined`, không ném. */
export const fileParam = z
  .string()
  .regex(RE_DOC_ID)
  .optional()
  .catch(undefined);

/** Schema đứng riêng — dùng cho 3 route CHƯA có `validateSearch` (S2, S2b, S4d). */
export const fileSearchSchema = z.object({ file: fileParam });

/**
 * Đọc `?file=` từ một search record BẤT KỲ (kể cả route không validate).
 * Một cửa duy nhất: mọi màn/khung gọi hàm này thay vì tự `String(search.file)`.
 */
export function readFileSearch(search: unknown): string | undefined {
  return fileSearchSchema.safeParse(search ?? {}).data?.file;
}

/** Đường dẫn của route canvas — hằng số để test khoá được, không rải chuỗi. */
export const FILE_ROUTE_PATH = "/p/$projectId/f/$fileId" as const;

/**
 * ĐƯỜNG DẪN tới một file con. Đây là chỗ DUY NHẤT biết hình dạng URL của file con
 * (mục «Sao chép liên kết» của C2 nhận nó qua `linkForDoc`, xem NEEDS-fe2-c N8).
 *
 * `kind` quyết định hình dạng, KHÔNG phải màn đang mở: file canvas luôn có route
 * riêng, file workflow luôn là `?file=` trên màn workflow.
 * Tab ảo «Tất cả sheet» KHÔNG có `?file=`: nó là trạng thái mặc định, và để nó
 * vào URL thì link chia sẻ mang một id không có bản ghi thật.
 */
export function docPath(input: {
  projectId: string;
  docId: string;
  kind: "workflow" | "canvas";
  /** đường dẫn workflow hiện tại; không có/không hợp lệ ⇒ về `/p/:projectId`. */
  currentPath?: string;
  /** id tab ảo «Tất cả sheet» — truyền từ `features/docs/lib` để không chép chuỗi. */
  virtualId?: string;
}): string {
  const { projectId, docId, kind, virtualId, currentPath } = input;
  const pid = encodeURIComponent(projectId);
  const root = `/p/${pid}`;
  if (kind === "canvas") return `${root}/f/${encodeURIComponent(docId)}`;

  const isProjectScreen = currentPath === root
    || currentPath?.startsWith(`${root}/design`) === true
    || currentPath?.startsWith(`${root}/runs`) === true
    || currentPath?.startsWith(`${root}/kit`) === true
    || currentPath?.startsWith(`${root}/settings`) === true;
  const base = isProjectScreen ? currentPath! : root;
  if (virtualId !== undefined && docId === virtualId) return base;
  return `${base}?file=${encodeURIComponent(docId)}`;
}

/**
 * CẬP NHẬT `?file=` trên search hiện tại — hàm THUẦN để test được không cần router.
 *
 * Hai luật, cả hai đều là ca hỏng thật nếu làm sai:
 *  · mở tab ảo «Tất cả sheet» ⇒ **XOÁ** `file` thay vì ghi `?file=f-all-sheets`. Tab ảo
 *    là mặc định; ghi nó vào URL làm link chia sẻ mang một id không có bản ghi thật.
 *  · **giữ nguyên mọi param khác** (`tab`, `sheet`, `variant`, `onlyFailed`). Trả về một
 *    object mới chỉ có `file` là đổi tab đang mở của người ta khi họ chỉ đổi file — đúng
 *    loại lỗi mà `?tab=` ở đầu file này được thiết kế để tránh.
 */
export function withFileParam(
  prev: Readonly<Record<string, unknown>>,
  docId: string,
  virtualId: string,
): Record<string, unknown> {
  const next = { ...prev };
  if (docId === virtualId) delete next.file;
  else next.file = docId;
  return next;
}

/** Bỏ `?file=` (dùng khi id trên URL không còn tồn tại). Giữ nguyên param khác. */
export function withoutFileParam(
  prev: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const next = { ...prev };
  delete next.file;
  return next;
}

export const DESIGN_TABS = ["sheets", "styles", "advanced"] as const;
export const KIT_TABS = ["assets", "matrix", "export"] as const;
export const SETTINGS_TABS = ["agent", "env", "prefs", "about"] as const;
/**
 * ══ MÀN QUẢN LÝ DỰ ÁN — BA TRỤC ĐỘC LẬP TRÊN URL ═══════════════════════════
 *
 * Trước bản này chỉ có MỘT tham số `?section=` gánh cả ba việc: đích sidebar, nhóm
 * ảnh đang lọc, và "dialog Cài đặt có đang mở không". Vì gánh chung nên bấm nút Cài
 * đặt trên topbar (`section=settings`) **xoá mất** tab nền người dùng đang đứng, và
 * đóng dialog lại ném họ về `overview` — đúng lỗi #5 của đợt này.
 *
 * Nay tách hẳn:
 *   · `section`  — đích SIDEBAR: `images` · `skeleton` · `mascot`.
 *   · `group`    — nhóm ảnh đang lọc bên trong "Ảnh đã tạo".
 *   · `settings` — tab của DIALOG Cài đặt; vắng mặt ⇒ dialog đóng.
 * Mở/đóng dialog chỉ thêm/bớt `settings`, hai trục kia không bị đụng tới.
 *
 * `LEGACY_PROJECT_SECTIONS` là các giá trị `?section=` cũ còn nằm trong bookmark,
 * lịch sử trình duyệt và link cũ. Chúng KHÔNG bị `.catch` nuốt về mặc định — chúng
 * được `resolveProjectView()` dịch sang bộ ba mới.
 */
export const PROJECT_SECTIONS = ["images", "skeleton", "mascot"] as const;
export const LEGACY_PROJECT_SECTIONS = ["overview", "background", "popup", "ui", "props", "requirements", "style", "canvas", "settings"] as const;
export const PROJECT_IMAGE_GROUPS = ["all", "background", "popup", "ui", "props", "mascot"] as const;
export const PROJECT_SETTINGS_TABS = ["requirements", "style", "project"] as const;

export type DesignTab = (typeof DESIGN_TABS)[number];
export type KitTab = (typeof KIT_TABS)[number];
export type SettingsTab = (typeof SETTINGS_TABS)[number];
export type ProjectSection = (typeof PROJECT_SECTIONS)[number];
export type ProjectImageGroup = (typeof PROJECT_IMAGE_GROUPS)[number];
export type ProjectSettingsTab = (typeof PROJECT_SETTINGS_TABS)[number];

export const projectSearchSchema = z.object({
  section: z.enum([...PROJECT_SECTIONS, ...LEGACY_PROJECT_SECTIONS]).default("images").catch("images"),
  group: z.enum(PROJECT_IMAGE_GROUPS).optional().catch(undefined),
  settings: z.enum(PROJECT_SETTINGS_TABS).optional().catch(undefined),
  file: fileParam,
});

/** Giá trị `?section=` cũ → nhóm ảnh tương ứng. Không có trong bảng ⇒ không lọc gì. */
const LEGACY_SECTION_GROUP: Partial<Record<string, ProjectImageGroup>> = {
  background: "background",
  popup: "popup",
  ui: "ui",
  props: "props",
};

/** Giá trị `?section=` cũ mở thẳng một tab của dialog Cài đặt. */
const LEGACY_SECTION_SETTINGS: Partial<Record<string, ProjectSettingsTab>> = {
  settings: "requirements",
  requirements: "requirements",
  style: "style",
};

export interface ProjectView {
  section: ProjectSection;
  group: ProjectImageGroup;
  /** `null` ⇒ dialog Cài đặt đóng. */
  settingsTab: ProjectSettingsTab | null;
}

/**
 * URL (mới HOẶC cũ) → trạng thái màn. Hàm THUẦN nên test được không cần router.
 *
 * Luật: tham số mới luôn thắng; giá trị cũ chỉ được dùng khi tham số mới vắng mặt.
 * Nhờ vậy một link cũ `?section=props` vẫn mở đúng nhóm Đạo cụ, còn `?section=settings`
 * vẫn mở dialog — nhưng nền phía sau đứng ở mục mặc định chứ không bị nhảy lung tung.
 */
export function resolveProjectView(search: {
  section?: string | undefined;
  group?: ProjectImageGroup | undefined;
  settings?: ProjectSettingsTab | undefined;
}): ProjectView {
  const raw = search.section ?? "images";
  const section = (PROJECT_SECTIONS as readonly string[]).includes(raw) ? (raw as ProjectSection) : "images";
  return {
    section,
    group: search.group ?? LEGACY_SECTION_GROUP[raw] ?? "all",
    settingsTab: search.settings ?? LEGACY_SECTION_SETTINGS[raw] ?? null,
  };
}

export const designSearchSchema = z.object({
  tab: z.enum(DESIGN_TABS).default("sheets").catch("sheets"),
  /** FE-2·E1 — file con đang mở (§4.3 "cộng search param `?file=<fileId>`"). */
  file: fileParam,
  /** Sheet đang mở ở canvas ② — cho phép deep-link từ ma trận tiến độ S2. */
  sheet: z.string().optional().catch(undefined),
  /** Phong cách đang xem — `variant` là khoá kỹ thuật, chỉ nằm trong URL. */
  variant: z.string().optional().catch(undefined),
});

export const kitSearchSchema = z.object({
  tab: z.enum(KIT_TABS).default("assets").catch("assets"),
  file: fileParam,
  variant: z.string().optional().catch(undefined),
});

export const settingsSearchSchema = z.object({
  tab: z.enum(SETTINGS_TABS).default("agent").catch("agent"),
});

export const runsSearchSchema = z.object({
  /** Lọc "chỉ lỗi" ở danh sách lượt chạy (§3-S4). */
  onlyFailed: z.boolean().optional().catch(undefined),
  file: fileParam,
});

export const projectsSearchSchema = z.object({
  /** Ô tìm ở S1 — để trong URL thì chia sẻ được kết quả lọc. */
  q: z.string().optional().catch(undefined),
  tag: z.string().optional().catch(undefined),
  /**
   * Ý ĐỊNH mang từ màn khác sang: ⌘K "Tạo project mới…" bấm ở /settings, hay
   * nút [Tạo project đầu tiên] ở cuối wizard S0.
   *
   * Vì sao là search param chứ không chỉ CustomEvent: sự kiện là "bắn rồi
   * quên" — nếu S1 chưa kịp gắn listener (hoặc chưa gắn) thì thao tác CHÌM
   * TRONG IM LẶNG, đúng điều §3.9 cấm. Search param thì nằm lại trên URL, S1
   * đọc lúc nào cũng thấy, F5 vẫn còn, và người dùng thấy rõ mình đang ở đâu.
   * Shell phát CẢ HAI (param + sự kiện) — xem AppLayout.
   */
  action: z.enum(["create", "import"]).optional().catch(undefined),
});

/**
 * `/setup` nhớ mình được mở từ đâu để quay lại sau khi xong.
 * CHỈ nhận đường dẫn nội bộ bắt đầu bằng "/" và KHÔNG bắt đầu bằng "//" —
 * chặn open-redirect ra ngoài (`//evil.com` là URL tuyệt đối theo giao thức).
 */
export const setupSearchSchema = z.object({
  redirect: z
    .string()
    .refine((s) => s.startsWith("/") && !s.startsWith("//"), "chỉ nhận đường dẫn nội bộ")
    .optional()
    .catch(undefined),
});
