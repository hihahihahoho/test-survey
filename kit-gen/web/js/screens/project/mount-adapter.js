/**
 * mount-adapter.js — cầu nối giữa API nội bộ của 4 màn này và HỢP ĐỒNG MÀN HÌNH của
 * `web/js/app-shell/screen-registry.js` (do engineer setup+projects định nghĩa):
 *
 *     export function mount(host, ctx) -> { destroy?, route?(ctx), status?(st), title?() }
 *
 * Tôi không sửa file của họ; tôi thích ứng vào hợp đồng của họ. Nhờ vậy:
 *   · đổi `?tab=` KHÔNG dựng lại màn (shell gọi `route(ctx)` → tôi gọi `update({tab})`),
 *     nên giữ được cuộn/tab/lựa chọn (đóng audit H3).
 *   · agent pill đổi → shell gọi `status(st)` → tôi vẽ lại banner §2.5 + gate nút, KHÔNG mất dữ liệu.
 *   · `title()` trả tên project để shell đặt breadcrumb + <title> (§5.8-A13) mà không gọi API thêm.
 */

/**
 * @param {(container, opts) => {update, destroy, reload}} mountFn
 * @param {{needsProject?:boolean}} cfg
 */
export function toShellMount(mountFn, { needsProject = true } = {}) {
  return function mount(host, ctx = {}) {
    const projectId = ctx.params?.id ?? null;
    if (needsProject && !projectId) {
      throw new Error('screens/project: route này cần params.id');
    }
    const inner = mountFn(host, {
      projectId,
      tab: ctx.tab ?? ctx.query?.tab ?? null,
      status: ctx.status,
    });

    return {
      /** URL đổi mà vẫn cùng màn (đổi tab) — không dựng lại.
       *  QA-UX CAO-1 (lớp phòng thủ 2): `projectId` đóng băng lúc mount và `inner.update`
       *  không nhận nó. Nếu ai đó gọi route() với id khác, vẽ tiếp sẽ là project SAI.
       *  Shell đã vá để remount khi đổi project; đây là chốt chặn cuối. */
      route(next) {
        // Chỉ so khi caller CÓ khai `params` — xem chú thích cùng nội dung ở
        // `app-shell/screen-adapters.js`.
        if (next && typeof next.params === 'object' && next.params !== null) {
          const nextId = next.params.id ?? null;
          if (nextId !== projectId) {
            console.error('[shell] route() đổi project mà không remount — bỏ qua để không vẽ sai phạm vi',
              { mounted: projectId, next: nextId });
            return;
          }
        }
        inner.update({ tab: next?.tab ?? next?.query?.tab ?? null, status: next?.status });
      },
      /** Trạng thái agent đổi (§2.4 → §2.5). */
      status(st) { inner.update({ status: st }); },
      /** Tên project cho breadcrumb/<title>; null ⇒ shell tự lấy từ cache. */
      title() { return typeof inner.title === 'function' ? inner.title() : null; },
      /** Còn thay đổi chưa lưu? shell/router dùng để hỏi trước khi rời màn. */
      isDirty() { return typeof inner.isDirty === 'function' ? inner.isDirty() : false; },
      reload() { inner.reload?.(); },
      destroy() { inner.destroy(); },
      /** Truy cập API nội bộ (dùng cho test). */
      inner,
    };
  };
}
