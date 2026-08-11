/**
 * features/kitfile/lib/kit-mode.ts — HÌNH THÁI của một bộ kit (⚙️ / 🎨).
 *
 * NGUỒN: FLOW-V3 §0.3 (một file có đúng 2 hình thái, đổi được sau) ·
 *        BA-V3 §1.4 (chỗ chứa: TAG HỆ THỐNG `kg-workflow`/`kg-canvas`, vì `project.json`
 *        chưa có field hình thái và `PATCH #10` chỉ nhận name/slug/description/tags/cover) ·
 *        FE3-PLAN §3-S1 + §4 (không phải mock — bền trên đĩa, nhưng là chỗ chứa MƯỢN).
 *
 * BỐN LUẬT CỦA MODULE NÀY:
 *  1. **KHÔNG gọi API.** Module này chỉ đọc `project` và TRẢ VỀ payload; việc gửi đi là của
 *     `usePatchProject`/`useCreateProject` (`lib/hooks/use-projects.ts`). Không `fetch`, không hook.
 *  2. **Mặc định là `workflow`** khi thiếu tag hoặc tag mâu thuẫn (FE3-PLAN §6: "tag `kg-*` bị user
 *     sửa tay ⇒ hình thái sai" — chặn bằng mặc định an toàn, không ném lỗi, không màn trắng).
 *  3. **Mọi tag tiền tố `kg-` phải bị lọc khỏi UI** — cả chỗ hiển thị lẫn ô nhập tag. User không
 *     bao giờ được thấy chuỗi `kg-canvas`.
 *  4. **Không nhận `Project` đầy đủ làm điều kiện chạy.** Nhận `{tags?}` để test được bằng object
 *     rỗng và để không vỡ khi agent trả thiếu trường.
 */

/** Hai hình thái user chọn ở màn N. Chữ hiện ra nằm ở `copy.ts`, KHÔNG ở đây. */
export const KIT_MODES = ["workflow", "canvas"] as const;
export type KitMode = (typeof KIT_MODES)[number];

/** Mặc định khi không đọc được hình thái. Đường ⚙️ là đường đã qua QA (BA-V3 §1.4). */
export const DEFAULT_KIT_MODE: KitMode = "workflow";

/** Tiền tố tag hệ thống. MỌI tag bắt đầu bằng chuỗi này đều bị giấu khỏi UI. */
export const KG_TAG_PREFIX = "kg-";
export const KG_TAG_WORKFLOW = "kg-workflow";
export const KG_TAG_CANVAS = "kg-canvas";

/** Hai tag hình thái — dùng để lọc `GET /api/projects?tag=` ở Home. */
export const KG_MODE_TAGS: Readonly<Record<KitMode, string>> = {
  workflow: KG_TAG_WORKFLOW,
  canvas: KG_TAG_CANVAS,
};

export function isKitMode(v: unknown): v is KitMode {
  return typeof v === "string" && (KIT_MODES as readonly string[]).includes(v);
}

/** Nguồn tag: chấp nhận mảng bẩn (null/số/khoảng trắng) vì `tags` đến từ đĩa. */
function cleanTags(tags: unknown): string[] {
  if (!Array.isArray(tags)) return [];
  const out: string[] = [];
  for (const t of tags) {
    if (typeof t !== "string") continue;
    const s = t.trim();
    if (s !== "") out.push(s);
  }
  return out;
}

/** `true` nếu tag là tag hệ thống (mọi `kg-*`, không chỉ hai tag hình thái). */
export function isSystemTag(tag: unknown): boolean {
  return typeof tag === "string" && tag.trim().toLowerCase().startsWith(KG_TAG_PREFIX);
}

/**
 * Lọc tag hệ thống khỏi danh sách hiện ra UI **và** khỏi ô nhập tag.
 * Giữ nguyên thứ tự và chữ hoa/thường của tag người dùng.
 */
export function stripSystemTags(tags: unknown): string[] {
  return cleanTags(tags).filter((t) => !isSystemTag(t));
}

/**
 * Đọc hình thái từ project.
 *
 * Quy tắc quyết định (cố ý đơn giản và tất định):
 *   - chỉ có `kg-canvas`   → canvas
 *   - chỉ có `kg-workflow` → workflow
 *   - có CẢ HAI, hoặc KHÔNG có cái nào, hoặc dữ liệu hỏng → **workflow** (mặc định)
 *
 * Ca "cả hai" xảy ra khi user sửa tag bằng tay ở màn Cài đặt. Chọn mặc định thay vì đoán
 * là cách duy nhất không nói dối: xem `modeIsExplicit()` nếu màn cần cảnh báo.
 */
export function readMode(project: { tags?: unknown } | null | undefined): KitMode {
  const tags = cleanTags(project?.tags).map((t) => t.toLowerCase());
  const hasCanvas = tags.includes(KG_TAG_CANVAS);
  const hasWorkflow = tags.includes(KG_TAG_WORKFLOW);
  if (hasCanvas && !hasWorkflow) return "canvas";
  return DEFAULT_KIT_MODE;
}

/** `false` khi hình thái đang là GIÁ TRỊ MẶC ĐỊNH chứ không phải điều user đã chọn. */
export function modeIsExplicit(project: { tags?: unknown } | null | undefined): boolean {
  const tags = cleanTags(project?.tags).map((t) => t.toLowerCase());
  const hasCanvas = tags.includes(KG_TAG_CANVAS);
  const hasWorkflow = tags.includes(KG_TAG_WORKFLOW);
  return hasCanvas !== hasWorkflow; // đúng một trong hai
}

/** Tag hệ thống cần gửi kèm khi TẠO bộ kit (`POST #8` nhận `tags`). */
export function modeTags(mode: KitMode): string[] {
  return [KG_MODE_TAGS[mode]];
}

/**
 * Payload `tags` cho `PATCH #10` khi ĐỔI hình thái: giữ nguyên tag người dùng,
 * thay sạch mọi tag hình thái cũ (kể cả khi trước đó có cả hai vì sửa tay).
 * KHÔNG tự gọi mutation — trả mảng cho màn truyền vào `usePatchProject`.
 */
export function tagsWithMode(currentTags: unknown, mode: KitMode): string[] {
  const kept = cleanTags(currentTags).filter(
    (t) => t.toLowerCase() !== KG_TAG_WORKFLOW && t.toLowerCase() !== KG_TAG_CANVAS
  );
  return [...kept, KG_MODE_TAGS[mode]];
}

/** Tham số lọc cho `GET /api/projects?tag=` — Home lọc theo hình thái mà không gõ chuỗi tay. */
export function modeFilterTag(mode: KitMode): string {
  return KG_MODE_TAGS[mode];
}
