/**
 * design/loader.js — NẠP DỮ LIỆU của S3 + xử lý NHÁP khi mở màn (§3.7 tầng 2).
 * Tách khỏi index.js để mỗi file dưới ~400 dòng.
 *
 * Ba đường vào khi mở màn:
 *   1. agent OK, không có nháp        → nạp bản trên đĩa
 *   2. agent OK, có nháp khác bản đĩa → banner [Khôi phục] [Bỏ nháp] [So sánh]
 *   3. agent TẮT                      → vẽ từ nháp IDB, banner vàng, KHÔNG trắng trang (§4.9)
 */

import { createBanner, createButton, clear, toast } from '../../ui/index.js';
import { api, idb } from '../../core/index.js';
import { createDraftBanner } from './safety.js';
import { ensureElementLib } from './library-drawer.js';
import * as ops from './ops.js';

/**
 * @param {{ state:object, projectId:string, bannerSlot:HTMLElement,
 *   setPhase:Function, setSelection:Function, setProjectState:Function,
 *   setRefs:Function, setError:Function, revalidate:Function, render:Function }} env
 */
export function createLoader(env) {
  const { state, projectId, bannerSlot } = env;

  /* ── nạp dữ liệu ───────────────────────────────────────────────────────── */

  async function reload({ keepSelection = false } = {}) {
    env.setPhase('loading');
    env.render();
    try {
      const [contractRes, projectRes] = await Promise.all([
        api.contract.get(projectId),
        api.projects.get(projectId).catch(() => null),
      ]);
      env.setProjectState(projectRes?.project?.state ?? { jobs: {}, stale: false });
      api.refs.list(projectId).then((r) => { env.setRefs(r?.items ?? []); env.revalidate(); }).catch(() => { env.setRefs([]); });
      ensureElementLib().catch(() => { /* thư viện lỗi thì drawer tự báo */ });

      const server = { contract: contractRes?.contract ?? ops.emptyContract(), version: contractRes?.version ?? 0 };
      const draft = await state.peekDraft();
      state.load(server);
      if (!keepSelection) env.setSelection(firstSelection());
      env.setPhase('ready');

      if (draft && JSON.stringify(draft.contract) !== JSON.stringify(server.contract)) {
        showDraftBanner(draft, server.contract);
      } else if (draft) {
        await state.dropDraft();
      } else {
        warnIfNoDraftStore();
      }
      env.render();
    } catch (e) {
      // Agent tắt: thử vẽ từ nháp để KHÔNG trắng trang (§2.5, §4.9)
      const draft = await state.peekDraft();
      if (draft) {
        state.load({ contract: draft.contract, version: draft.baseVersion, markSaved: false });
        env.setSelection(firstSelection());
        env.setPhase('ready');
        clear(bannerSlot);
        bannerSlot.appendChild(createBanner({
          kind: 'warning',
          title: 'Chưa đọc được bản thiết kế từ máy — đang xem bản nháp lưu trong trình duyệt. Không lưu được.',
          actions: [createButton({ label: 'Thử lại', variant: 'secondary', size: 'sm', onClick: () => reload() })],
        }));
        env.render();
        return;
      }
      env.setError(e);
      env.setPhase('error');
      env.render();
    }
  }

  /**
   * QA-UX TB-D · lưới an toàn thứ 2 của chốt X5 có thể VẮNG MẶT mà không ai biết.
   *
   * §4.9 chép "agent chưa chạy ❌ nhưng nháp vẫn lưu vào IDB" — spec GIẢ ĐỊNH IDB luôn
   * có. Thực tế Safari chế độ riêng tư / IDB bị chính sách chặn thì `idb.available()`
   * trả false, `saveDraftNow()` trả false, và KHÔNG AI đọc giá trị trả về đó. Người
   * dùng sửa 20 phút, bấm sang màn khác 3 giây, quay lại: mất trắng, không một chữ nào.
   *
   * Không thể thêm được nháp ở đâu khác (không được đổi kiến trúc, không thêm store),
   * nên việc đúng đắn còn lại là NÓI THẬT: trình duyệt này không giữ được nháp, phải
   * bấm Lưu. Đúng §3.9 điều cấm 3 ("thất bại không được im lặng").
   */
  function warnIfNoDraftStore() {
    if (idb.available()) return;
    clear(bannerSlot);
    bannerSlot.appendChild(createBanner({
      kind: 'warning', live: true,
      title: 'Trình duyệt này không cho lưu bản nháp — hãy bấm Lưu trước khi rời màn, '
        + 'nếu không thay đổi chưa lưu sẽ mất.',
    }));
  }

  function firstSelection() {
    const sh = (state.contract?.sheets ?? [])[0];
    return sh ? { kind: 'sheet', sheetId: sh.id } : null;
  }

  function showDraftBanner(draft, serverContract) {
    clear(bannerSlot);
    bannerSlot.appendChild(createDraftBanner({
      draft, serverContract,
      onRestore: () => {
        state.load({ contract: draft.contract, version: draft.baseVersion, markSaved: false });
        env.setSelection(firstSelection());
        clear(bannerSlot);
        toast.info({ title: 'Đã khôi phục bản nháp', description: 'Bấm Lưu để ghi vào máy.' });
        env.render();
      },
      onDiscard: async () => {
        await state.dropDraft();
        clear(bannerSlot);
        toast.info({ title: 'Đã bỏ bản nháp' });
        env.render();
      },
    }));
  }


  return { reload, firstSelection, showDraftBanner };
}
