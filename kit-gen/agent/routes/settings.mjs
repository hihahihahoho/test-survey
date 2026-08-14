/* routes/settings.mjs — TUỲ CHỌN NGƯỜI DÙNG trên đĩa (`<workspace>/.kitgen/config.json`).
 *
 * Hai endpoint, không hơn:
 *   GET   /api/settings   → toàn bộ bảng đã chuẩn hoá
 *   PATCH /api/settings   → vá một phần, trả lại TOÀN BỘ bảng sau khi vá
 *
 * File riêng chứ không nhét vào `routes/system.mjs`: `system.mjs` là nhóm "sức khoẻ +
 * workspace + cập nhật", còn đây là dữ liệu người dùng. Trộn hai thứ vào một file làm
 * mờ ranh giới mà `lib/settings.mjs` đang giữ (system trả trạng thái MÁY; settings trả
 * lựa chọn NGƯỜI).
 *
 * Bảo mật: mọi luật nằm ở `lib/settings.mjs` (enum · bool · int · mã khớp `ID_RE`), và
 * route này KHÔNG được phép nới thêm. Không có field nào ở đây chạm tới đường dẫn, biến
 * môi trường hay hồ sơ codex — `/api/image-profile` vẫn là chỗ duy nhất đụng `imageGen`.
 */
import { patchSettings, readSettings } from "../lib/settings.mjs"

export function register(r) {
  r.get("/api/settings", async ctx => ({
    status: 200,
    json: { settings: await readSettings(ctx.registry.active) },
  }))

  r.patch("/api/settings", async ctx => ({
    status: 200,
    json: { settings: await patchSettings(ctx.registry.active, await ctx.json()) },
  }))
}
