import { z } from "zod";

/**
 * SEARCH SCHEMA — trạng thái phụ của màn đi qua search param, không phải route riêng.
 * Lý do: đổi tab/mở dialog KHÔNG được làm remount cả màn (mất chỗ cuộn, mất
 * selection — đúng bệnh audit #8).
 *
 * `.catch(...)` là chủ ý, không phải lười: link cũ / URL gõ tay có `?tab=xyz` phải
 * rơi về tab đầu **chứ không được ném lỗi làm trắng màn**.
 *
 * 08/09/2026 — đợt dọn prompt-first xoá `designSearchSchema` · `kitSearchSchema` ·
 * `runsSearchSchema` · `projectSearchSchema` cùng bảy route `/p/**` mà chúng phục vụ,
 * và cả nhánh `?file=` (`fileParam`, `docPath`, `withFileParam`, `FILE_ROUTE_PATH`…)
 * cùng tầng file con `features/docs`. App chỉ còn hai trục URL thật: `?tab=` của
 * `/settings` và `?settings=` của `/k/:id`.
 */

export const SETTINGS_TABS = ["agent", "env", "prefs", "about"] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

/**
 * Ba giá trị đời cũ của `?settings=` (`requirements`/`style`/`project`) từng là ba TAB
 * của dialog «Cài đặt dự án»; dialog nay chỉ còn một khối meta, nên màn đọc param này
 * bằng «có mặt hay không» chứ không bằng tên. Giữ đủ ba giá trị để bookmark đời trước
 * — `/p/:id?settings=requirements`, thứ `/p/$` chuyển hướng sang đây và mang theo —
 * vẫn mở đúng cái cửa cũ.
 */
export const PROJECT_SETTINGS_TABS = ["requirements", "style", "project"] as const;

/** `/k/:projectId` — màn làm việc duy nhất, đúng MỘT trục URL. */
export const kitCanvasSearchSchema = z.object({
  settings: z.enum(PROJECT_SETTINGS_TABS).optional().catch(undefined),
});

export const settingsSearchSchema = z.object({
  tab: z.enum(SETTINGS_TABS).default("agent").catch("agent"),
});

export const projectsSearchSchema = z.object({
  /** Ô tìm ở trang chủ — để trong URL thì chia sẻ được kết quả lọc. */
  q: z.string().optional().catch(undefined),
  tag: z.string().optional().catch(undefined),
  /**
   * Ý ĐỊNH mang từ màn khác sang: ⌘K "Tạo project mới…" bấm ở /settings.
   *
   * Vì sao là search param chứ không chỉ CustomEvent: sự kiện là "bắn rồi quên" —
   * nếu trang chủ chưa kịp gắn listener thì thao tác CHÌM TRONG IM LẶNG, đúng điều
   * §3.9 cấm. Search param thì nằm lại trên URL, F5 vẫn còn.
   */
  action: z.enum(["create", "import"]).optional().catch(undefined),
});
