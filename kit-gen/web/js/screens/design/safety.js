/**
 * design/safety.js — LƯỚI AN TOÀN của trình soạn: drawer LỊCH SỬ bản lưu (#24/#25/#26),
 * modal XUNG ĐỘT 409 `CONTRACT_CONFLICT`, và banner KHÔI PHỤC NHÁP.
 * Đóng issue #3 của audit (B4, B5, R7) — hạng mục MUST 'L' của §7.1.
 */

import {
  createBadge, createButton, createErrorState, createSpinnerRow, createBanner,
  createEmptyState, el, clear, openDrawer, openModal, createModalFooter, toast,
} from '../../ui/index.js';
import { api, errors } from '../../core/index.js';

const fmtTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
};

/**
 * MODAL XUNG ĐỘT 409 — so sánh 2 cột "Bản của bạn" / "Bản trên đĩa" + 3 lối ra
 * (§3-S3 bảng trạng thái: error 409). KHÔNG bao giờ tự chọn hộ user.
 *
 * @returns {Promise<'overwrite'|'reload'|'fork'|false>}
 */
export function openConflictModal({ mine, theirs, details, returnFocusTo = null } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (v) => { if (!settled) { settled = true; resolve(v); } };

    const stat = (c) => {
      const sheets = (c?.sheets ?? []).length;
      const comps = (c?.sheets ?? []).reduce((n, s) => n + (s.components ?? []).length, 0);
      const variants = (c?.variants ?? []).length;
      return `${sheets} sheet · ${comps} ô · ${variants} phong cách`;
    };

    const diff = details?.diffSummary ?? null;
    const body = el('div', {}, [
      el('p', { class: 'kg-t-body', text: 'Có tab khác hoặc người khác đã lưu bản thiết kế sau khi bạn mở màn này. Chọn cách xử lý — không thao tác nào làm mất bản của bạn trên máy này.' }),
      el('div', { class: 'd-diff', style: { marginTop: 'var(--s-4)' } }, [
        el('div', { class: 'd-diff__col' }, [
          el('span', { class: 'd-diff__h', text: 'Bản của bạn (chưa lưu)' }),
          el('span', { class: 'kg-t-body', text: stat(mine) }),
          el('span', { class: 'kg-t-caption kg-fg-default', text: 'Đang nằm trong tab này và trong bản nháp trên máy.' }),
        ]),
        el('div', { class: 'd-diff__col' }, [
          el('span', { class: 'd-diff__h', text: 'Bản trên đĩa' }),
          el('span', { class: 'kg-t-body', text: theirs ? stat(theirs) : `phiên bản v${details?.serverVersion ?? '?'}` }),
          diff
            ? el('span', { class: 'kg-t-caption kg-fg-default', text: `Khác biệt: +${diff.added ?? 0} sheet, −${diff.removed ?? 0} sheet` })
            : null,
        ]),
      ]),
    ]);

    const btnReload = createButton({
      label: 'Tải lại bản trên đĩa', variant: 'secondary',
      tooltip: 'Bỏ thay đổi của bạn',
      onClick: () => { finish('reload'); m.close(); },
    });
    const btnFork = createButton({
      label: 'Lưu thành bản sao', variant: 'secondary',
      onClick: () => { finish('fork'); m.close(); },
    });
    const btnOverwrite = createButton({
      label: 'Ghi đè bằng bản của tôi', variant: 'danger',
      onClick: () => { finish('overwrite'); m.close(); },
    });

    const m = openModal({
      title: 'Bản thiết kế đã đổi ở nơi khác',
      description: 'Chọn một trong ba cách. Bản của bạn vẫn được giữ cho tới khi bạn tự chọn bỏ.',
      size: 'lg', destructive: true, body,
      footer: createModalFooter({ cancel: btnReload, confirm: btnOverwrite, extraLeft: btnFork }),
      returnFocusTo,
      onClose: () => finish(false),
    });
  });
}

/**
 * DRAWER LỊCH SỬ — 50 bản lưu của agent (#24). Khôi phục = tạo bản MỚI (#26),
 * không ghi đè lịch sử.
 */
export function openHistoryDrawer({ projectId, currentVersion, onRestored, returnFocusTo = null } = {}) {
  const body = el('div', { class: 'd-hist' });
  const drawer = openDrawer({ title: 'Lịch sử bản thiết kế', body, returnFocusTo });
  body.appendChild(createSpinnerRow({ label: 'Đang đọc lịch sử…' }));

  (async () => {
    try {
      const res = await api.contract.history(projectId, 50);
      const items = Array.isArray(res?.items) ? res.items : [];
      clear(body);
      if (items.length === 0) {
        body.appendChild(createEmptyState({
          inline: true, icon: '🕘', title: 'Chưa có bản lưu nào',
          description: 'Mỗi lần bạn bấm Lưu, bản trước đó được giữ lại ở đây (tối đa 50 bản).',
        }));
        return;
      }
      body.appendChild(el('p', {
        class: 'kg-t-caption kg-fg-default',
        text: `${items.length} bản gần nhất · bản đang mở là v${currentVersion}`,
      }));
      for (const it of items) {
        const sum = it.summary ?? {};
        body.appendChild(el('div', { class: 'd-hist__row' }, [
          createBadge({ state: 'neutral', text: `v${it.version ?? '?'}`, iconGlyph: '▤' }),
          el('span', { class: 'd-hist__when', text: fmtTime(it.at) }),
          el('span', { class: 'd-hist__sum', text: `${sum.sheets ?? 0} sheet · ${sum.components ?? 0} ô` }),
          createButton({
            label: 'Khôi phục', variant: 'secondary', size: 'sm',
            onClick: async (ev) => {
              const btn = ev.currentTarget;
              btn.disabled = true;
              try {
                const r = await api.contract.restore(projectId, it.snapshot);
                toast.success({
                  title: `Đã khôi phục bản v${it.version ?? '?'}`,
                  description: `Bản thiết kế hiện tại là v${r?.version ?? '?'} — lịch sử vẫn giữ nguyên.`,
                });
                drawer.close('restored');
                if (onRestored) onRestored(r);
              } catch (e) {
                btn.disabled = false;
                const view = errors.present(e);
                toast.error({ title: view.title, description: view.explain });
              }
            },
          }),
        ]));
      }
    } catch (e) {
      clear(body);
      const view = errors.present(e);
      body.appendChild(createErrorState({
        title: view.title, description: view.explain,
        actions: [createButton({
          label: 'Thử lại', variant: 'secondary',
          onClick: () => { drawer.close(); openHistoryDrawer({ projectId, currentVersion, onRestored, returnFocusTo }); },
        })],
        devDetails: errors.devDetails(e),
      }));
    }
  })();

  return drawer;
}

/**
 * BANNER KHÔI PHỤC NHÁP (§3.7): *"Có bản nháp chưa lưu từ 14:32 hôm nay"*
 * + [Khôi phục] [Bỏ nháp] [So sánh].
 */
export function createDraftBanner({ draft, serverContract, onRestore, onDiscard }) {
  const when = fmtTime(draft?.savedAt);
  const stat = (c) => {
    const sheets = (c?.sheets ?? []).length;
    const comps = (c?.sheets ?? []).reduce((n, s) => n + (s.components ?? []).length, 0);
    return `${sheets} sheet · ${comps} ô`;
  };
  const banner = createBanner({
    kind: 'warning',
    title: `Có bản nháp chưa lưu từ ${when || 'lần trước'} — ${stat(draft?.contract)}`,
    actions: [
      createButton({ label: 'Khôi phục', variant: 'secondary', size: 'sm', onClick: () => onRestore() }),
      createButton({ label: 'Bỏ nháp', variant: 'ghost', size: 'sm', onClick: () => onDiscard() }),
    ],
  });
  // [So sánh] là hành động thứ 3 — banner chỉ cho 2 nút (§5.5) nên đưa vào dòng phụ.
  const compare = createButton({
    label: 'So sánh nháp với bản trên đĩa', variant: 'link', size: 'sm',
    onClick: () => {
      openModal({
        title: 'So sánh nháp với bản trên đĩa', size: 'lg',
        body: el('div', { class: 'd-diff' }, [
          el('div', { class: 'd-diff__col' }, [
            el('span', { class: 'd-diff__h', text: `Nháp trên máy (${when})` }),
            el('span', { class: 'kg-t-body', text: stat(draft?.contract) }),
          ]),
          el('div', { class: 'd-diff__col' }, [
            el('span', { class: 'd-diff__h', text: 'Bản trên đĩa' }),
            el('span', { class: 'kg-t-body', text: stat(serverContract) }),
          ]),
        ]),
      });
    },
  });
  return el('div', { class: 'kg-stack', style: { gap: 'var(--s-1)' } }, [banner, compare]);
}
