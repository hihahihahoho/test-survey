/**
 * screen-adapters.js — ADAPTER cho những màn dùng hợp đồng khác.
 *
 * Vì sao có file này: hợp đồng chuẩn của shell là `mount(host, ctx) -> handle`
 * (xem screen-registry.js). Team S3/S4 (`screens/design/**`, `screens/runs/**`) thi công
 * theo hợp đồng riêng của họ — `createXScreen({...}) -> { el, update, destroy, isDirty }`,
 * đã ghi trong `teams/design/NEEDS-d2p3.md §1`. Thay vì bắt họ sửa file của mình
 * (luật cứng: không sửa file team khác), TÔI thích ứng ở đây — đúng một chỗ, có tên rõ.
 *
 * Nhờ adapter:
 *   · đổi `?tab=` KHÔNG dựng lại màn → giữ cuộn/tab/undo stack (đóng audit H3)
 *   · agent đổi trạng thái → gọi update({readOnly}) thay vì remount (không mất nháp)
 *   · rail lấy được dấu • "có thay đổi chưa lưu" từ isDirty() (§2.2)
 */

import { setReadOnlyStatus } from '../screens/shared/read-only.js';

/**
 * Bọc `createDesignScreen`-style thành mount() của shell.
 * @param {(opts:object) => {el:HTMLElement, update?:Function, destroy?:Function, isDirty?:Function, title?:Function}} factory
 * @param {{extraArgs?:(ctx:object)=>object, onDirtyKey?:string}} cfg
 */
export function adaptFactory(factory, { extraArgs = () => ({}) } = {}) {
  return function mount(host, ctx = {}) {
    // QA-UX CAO-2: S3/S4 chỉ nhận boolean `readOnly` (hợp đồng NEEDS-d2p3 §1) nên chúng
    // không biết VÌ SAO bị khoá. Nạp câu chữ đúng vào nguồn dùng chung ở đây — chỗ duy
    // nhất mà cả trạng thái đầy đủ lẫn hai màn đó cùng đi qua.
    setReadOnlyStatus(ctx.status);
    let dirty = false;
    // QA-UX CAO-1 (lớp phòng thủ 2): `projectId` bị đóng băng ở đây. `route()` KHÔNG
    // truyền được projectId xuống inner (hợp đồng NEEDS-d2p3 §1 không có field đó), nên
    // nếu shell gọi route() với id khác thì màn sẽ vẽ project cũ mà không ai biết.
    // Shell đã được vá để remount khi đổi project; đây là chốt chặn nếu ai đó bỏ qua nó.
    const mountedProjectId = ctx.params?.id ?? null;
    const inner = factory({
      projectId: mountedProjectId,
      tab: ctx.tab ?? ctx.query?.tab ?? null,
      readOnly: ctx.status?.readOnly === true,
      navigate: (path) => ctx.navigate?.(path),
      onDirty: (d) => { dirty = d === true; },
      ...extraArgs(ctx),
    });
    if (inner?.el) host.appendChild(inner.el);
    return {
      route(next) {
        // Chỉ so khi caller CÓ khai `params` (shell luôn khai — `ctxFor()` đặt
        // `params: match.params ?? {}`). Caller không khai thì không có ý định đổi
        // project, so sẽ ra "null ≠ p1" và chặn oan.
        if (next && typeof next.params === 'object' && next.params !== null) {
          const nextId = next.params.id ?? null;
          if (nextId !== mountedProjectId) {
            // Không im lặng vẽ sai phạm vi (§1.1-4). Báo để lỗi lộ ra ở dev thay vì
            // biến thành "app nói dối" ở tay người dùng.
            console.error('[shell] route() đổi project mà không remount — bỏ qua để không vẽ sai phạm vi',
              { mounted: mountedProjectId, next: nextId });
            return;
          }
        }
        setReadOnlyStatus(next?.status);
        inner.update?.({
          tab: next?.tab ?? next?.query?.tab ?? null,
          runId: next?.params?.runId ?? null,
          readOnly: next?.status?.readOnly === true,
        });
      },
      status(st) { setReadOnlyStatus(st); inner.update?.({ readOnly: st?.readOnly === true }); },
      destroy() { inner.destroy?.(); },
      title() { return typeof inner.title === 'function' ? inner.title() : null; },
      isDirty() { return typeof inner.isDirty === 'function' ? inner.isDirty() : dirty; },
      /** §2.3: lệnh riêng của màn góp vào ⌘K. Màn không khai thì ⌘K vẫn đủ phần toàn cục. */
      commands() { return typeof inner.commands === 'function' ? inner.commands() : []; },
      rail() {
        const d = typeof inner.isDirty === 'function' ? inner.isDirty() : dirty;
        return { dots: { design: d === true } };
      },
    };
  };
}

/**
 * Nạp một màn: ưu tiên `mount` chuẩn; nếu module chỉ có factory riêng thì tự bọc.
 * Trả về null khi màn chưa thi công (shell vẽ placeholder, app không vỡ).
 */
export function resolveMount(mod) {
  if (!mod || typeof mod !== 'object') return null;
  if (typeof mod.mount === 'function') return mod.mount;
  // Hợp đồng của team S3/S4 (NEEDS-d2p3 §1).
  if (typeof mod.createDesignScreen === 'function') return adaptFactory(mod.createDesignScreen);
  if (typeof mod.createRunsScreen === 'function') {
    return adaptFactory(mod.createRunsScreen, {
      extraArgs: (ctx) => ({ runId: ctx.params?.runId ?? null }),
    });
  }
  return null;
}
