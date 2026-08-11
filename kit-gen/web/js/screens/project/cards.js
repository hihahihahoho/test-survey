/**
 * cards.js — 3 thẻ phụ của S2: Bản thiết kế · Lượt chạy gần đây · Kit đã cắt (§3-S2 mục 4).
 * Tất cả dùng primitive có sẵn (createCard/createList/createThumb/createRunBadge).
 */

import {
  el, createList, createRunBadge, createButton, createThumb, createEmptyState, icon,
} from '../../ui/index.js';
import { panel, statRow } from './shared/screen.js';
import { gateButton } from './shared/agent-state.js';
import { imageFallback } from './shared/agent-state.js';
import * as fmt from '../shared/format.js';
import * as api from '../../core/api.js';

/** Thẻ "Bản thiết kế": số sheet/element/phong cách + phiên bản + lối vào S3. */
export function designCard({ project, contract, version, status, handlers = {} }) {
  const stats = project?.stats ?? {};
  const sheets = Array.isArray(contract?.sheets) ? contract.sheets.length : (stats.sheets ?? 0);
  const components = Array.isArray(contract?.sheets)
    ? contract.sheets.reduce((n, s) => n + (Array.isArray(s.components) ? s.components.length : 0), 0)
    : (stats.components ?? 0);
  const variants = Array.isArray(contract?.variants)
    ? contract.variants.length
    : (stats.variants ?? 0);

  return panel({
    title: 'Bản thiết kế',
    children: [
      statRow('Sheet', fmt.count(sheets, 'sheet')),
      statRow('Element', fmt.count(components, 'element')),
      statRow('Phong cách', fmt.count(variants, 'phong cách')),
      statRow('Phiên bản', version === null || version === undefined
        ? 'chưa lưu lần nào'
        : `v${version} · lưu ${fmt.relTime(project?.updatedAt)}`),
      el('div', { class: 'kg-row kg-row--tight', style: { marginTop: 'var(--s-2)' } }, [
        gateButton(createButton({
          label: 'Mở trình soạn', variant: 'secondary', size: 'sm', icon: '✎',
          onClick: () => handlers.onDesign?.('sheets'),
        }), status),
        createButton({
          label: 'Lịch sử bản lưu', variant: 'ghost', size: 'sm', icon: '▾',
          onClick: () => handlers.onHistory?.(),
        }),
      ]),
    ],
  });
}

/** Thẻ "Lượt chạy gần đây" — 3 dòng + [Xem tất cả]. done-with-errors KHÔNG dùng ✓ (§5.7). */
export function runsCard({ runs = [], handlers = {}, loadFailed = false }) {
  let body;
  if (loadFailed) {
    body = el('p', { class: 'kg-t-caption kg-fg-default', text: 'Chưa đọc được danh sách lượt chạy.' });
  } else if (runs.length === 0) {
    body = createEmptyState({
      inline: true, icon: '⚡',
      title: 'Chưa có lượt chạy nào',
      description: 'Mỗi lần bấm Sinh ảnh hoặc Cắt sẽ tạo một lượt chạy có nhật ký riêng.',
    });
  } else {
    body = createList({
      ariaLabel: 'Lượt chạy gần đây',
      items: runs.slice(0, 3).map((r) => ({
        badge: createRunBadge(safeRunStatus(r.status), {
          done: r?.progress?.done ?? null,
          total: r?.progress?.total ?? null,
          failed: r?.progress?.failed ?? 0,
        }),
        main: runKindLabel(r.kind),
        sub: `${fmt.relTime(r.finishedAt ?? r.startedAt)}${r.finishedAt && r.startedAt ? ` · ${fmt.duration(Date.parse(r.finishedAt) - Date.parse(r.startedAt))}` : ''}`,
        meta: r.id,
        ariaLabel: `Lượt chạy ${r.id}, ${runKindLabel(r.kind)}`,
        onClick: () => handlers.onRun?.(r.id),
      })),
    });
  }
  return panel({
    title: 'Lượt chạy gần đây',
    actions: createButton({
      label: 'Xem tất cả', variant: 'ghost', size: 'sm',
      onClick: () => handlers.onRuns?.(),
    }),
    children: [body],
  });
}

function safeRunStatus(s) {
  const known = ['queued', 'running', 'done', 'done-with-errors', 'cancelled', 'env-failed'];
  return known.includes(s) ? s : 'queued';
}
function runKindLabel(kind) {
  if (kind === 'gen') return 'Sinh ảnh';
  if (kind === 'slice') return 'Cắt';
  if (kind === 'skeleton') return 'Dựng khung xương';
  return 'Lượt chạy';
}

/**
 * Thẻ "Kit đã cắt" — 8 thumbnail + `+N` + [Mở].
 * Ảnh LUÔN qua `?w=256` (§6.5-5, đóng H4). Agent tắt ⇒ khung ▨ "Ảnh nằm trên máy bạn".
 */
export function kitCard({ projectId, kit, status, handlers = {}, readOnly = false }) {
  const files = kit?.files ?? [];
  if (!kit || files.length === 0) {
    return panel({
      title: 'Kit đã cắt',
      children: [createEmptyState({
        inline: true, icon: '▦',
        title: 'Chưa có file nào được cắt',
        description: 'Sau khi sinh ảnh, bước cắt sẽ tách sheet thành từng PNG trong suốt.',
        primary: createButton({
          label: 'Mở thư viện kit', variant: 'secondary', size: 'sm',
          onClick: () => handlers.onKit?.(),
        }),
      })],
    });
  }
  const shown = files.slice(0, 8);
  const rest = files.length - shown.length;
  const strip = el('div', {
    style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 'var(--s-2)' },
  });
  for (const f of shown) {
    strip.appendChild(readOnly
      ? imageFallback({ note: fmt.baseName(f.file) })
      : createThumb({ src: api.files.thumbUrl(projectId, f.path), alt: fmt.baseName(f.file) }));
  }
  if (rest > 0) {
    strip.appendChild(el('div', {
      class: 'kg-t-label kg-fg-default',
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        aspectRatio: '1 / 1', border: '1px dashed var(--line-default)', borderRadius: 'var(--r-2)',
      },
      text: `+${rest}`,
    }));
  }
  return panel({
    title: 'Kit đã cắt',
    actions: createButton({ label: 'Mở', variant: 'ghost', size: 'sm', onClick: () => handlers.onKit?.() }),
    children: [
      el('div', { class: 'kg-t-caption kg-fg-default' }, [
        el('span', { text: `${files.length} file` }),
        el('span', { 'aria-hidden': 'true', text: ' · ' }),
        el('span', { text: fmt.bytes(files.reduce((n, f) => n + (Number(f.bytes) || 0), 0)) }),
        kit.cutAt ? el('span', { 'aria-hidden': 'true', text: ' · ' }) : null,
        kit.cutAt ? el('span', { text: `cắt ${fmt.relTime(kit.cutAt)}` }) : null,
      ]),
      strip,
    ],
  });
}

/** Thẻ thống kê nhanh (§3-S2 "thống kê nhanh"). */
export function statsCard({ project }) {
  const s = project?.stats ?? {};
  return panel({
    title: 'Thống kê nhanh',
    children: [
      statRow('Lượt sinh ảnh trong thiết kế', fmt.count(s.jobs ?? 0, 'lượt')),
      statRow('Đã có ảnh', `${s.rawPresent ?? 0}/${s.jobs ?? 0}`),
      statRow('File kit đã cắt', fmt.count(s.kitsCut ?? 0, 'file')),
      statRow('Dung lượng trên đĩa', fmt.bytes(s.diskBytes ?? 0)),
      s.lastRun
        ? statRow('Lượt chạy cuối', `${fmt.relTime(s.lastRun.at)} · ${s.lastRun.ok ?? 0} xong${s.lastRun.fail ? ` · ${s.lastRun.fail} lỗi` : ''}`)
        : statRow('Lượt chạy cuối', 'chưa có'),
    ],
  });
}

export { icon };
