/**
 * export-tab.js — S5 tab **Xuất** (§3-S5): 4 khối, mỗi khối 1 dòng giải thích AI DÙNG NÓ.
 *   1. Tải .zip kit            (chọn phong cách + có/không ảnh AI)   ← hành động CHÍNH
 *   2. atlas.png + atlas.json  (Phaser JSON Hash, do slice.py sinh)
 *   3. manifest.json           (danh mục để script khác đọc)
 *   4. Copy cho Figma          (§7.2 NICE — xem ghi chú trung thực bên dưới)
 *
 * TRUNG THỰC VỀ PHẠM VI:
 *   · Zip đi qua #18 `GET /api/projects/:id/export.zip` — có thật, agent đã làm.
 *   · atlas/manifest tải trực tiếp qua #41 `files/*` — có thật trong `kits/<variant>/`.
 *   · **Copy-to-Figma CHƯA THI CÔNG**. Spec xếp nó vào NICE (§7.2, độ khó M) và đòi
 *     "tiến trình 4 bước, huỷ được" (đóng H5). Việc đó cần đọc từng PNG gốc rồi ghép
 *     canvas + ClipboardItem — vượt khỏi khối MUST của màn này và chưa kiểm chứng được
 *     ở môi trường không có clipboard ảnh. Ở đây làm ĐÚNG như đề bài yêu cầu: một nút
 *     + trạng thái nói rõ chưa có, kèm đường thay thế dùng được ngay (tải .zip).
 *     TODO(NICE §7.2 / H5): thi công 4 pha (đọc manifest → tải ảnh → ghép bảng → copy),
 *     có nút Huỷ và progress; theo dõi ở teams/design/NEEDS-d2p2.md.
 */

import {
  el, createButton, createCheckbox, createSelect, createBanner, createEmptyState,
  toast, icon,
} from '../../ui/index.js';
import * as api from '../../core/api.js';
import { panel } from '../project/shared/screen.js';
import { gateButton } from '../project/shared/agent-state.js';
import * as fmt from '../shared/format.js';

/**
 * @param {object} o
 * @param {string} o.projectId
 * @param {object} o.project
 * @param {{id,label}[]} o.variants
 * @param {Map<string,object|null>} o.kits
 * @param {object} o.status
 * @param {boolean} o.readOnly
 */
export function renderExportTab(o) {
  const root = el('div', { class: 'kg-stack', style: { gap: 'var(--s-4)' } });
  const hasAnyKit = [...o.kits.values()].some((k) => k && k.files.length > 0);

  if (!hasAnyKit) {
    root.appendChild(createEmptyState({
      icon: '⬇',
      title: 'Chưa có gì để xuất',
      description: 'Cần ảnh đã cắt mới xuất được kit. Sinh ảnh rồi cắt, quay lại đây.',
      primary: createButton({
        label: 'Xem tab Assets', variant: 'secondary',
        onClick: () => o.handlers?.onGoAssets?.(),
      }),
    }));
    return root;
  }

  /* ── 1 · Tải .zip kit (hành động CHÍNH của màn — đúng 1 primary) ── */
  const variantSel = createSelect({
    label: 'Phong cách', value: o.variants[0]?.id ?? '',
    options: o.variants.length
      ? [{ value: '__all__', label: 'Tất cả phong cách' }, ...o.variants.map((v) => ({ value: v.id, label: v.label }))]
      : [{ value: '', label: 'chưa có phong cách' }],
  });
  const withRaw = createCheckbox({
    label: 'Kèm ảnh AI gốc (raw)',
    sublabel: 'File to hơn nhiều. Chỉ cần khi muốn cắt lại ở máy khác.',
    checked: false,
  });
  const zipBtn = gateButton(createButton({
    label: 'Tải .zip kit', variant: 'primary', icon: '⬇',
    onClick: () => {
      const include = ['contract', 'kits'];
      if (withRaw.checked) include.push('raw');
      // §3-S5: chọn phong cách LỌC THẬT (agent #18 nhận ?variant=) — không còn xuất bừa cả bộ.
      const picked = variantSel.value;
      const variant = picked && picked !== '__all__' ? picked : null;
      const url = api.projects.exportUrl(o.projectId, include, variant);
      const slug = o.project?.slug ?? o.projectId;
      triggerDownload(url, fmt.exportFileName(variant ? `${slug}-${variant}` : slug));
      toast.info({
        title: 'Đang tạo file .zip',
        description: 'Trình duyệt sẽ hỏi chỗ lưu khi file sẵn sàng.',
      });
    },
  }), o.status);

  root.appendChild(panel({
    title: 'Tải .zip kit',
    children: [
      explain('Cho ai: người ngoài project cần cả bộ PNG trong suốt + bản thiết kế. Thả vào máy khác là chạy được.'),
      el('div', { class: 'kg-row', style: { gap: 'var(--s-4)', alignItems: 'flex-end' } }, [
        el('div', { style: { flex: '0 1 240px' } }, [variantSel.el]),
        withRaw.el,
        el('div', { style: { marginLeft: 'auto' } }, [zipBtn]),
      ]),
      o.variants.length > 1
        ? el('p', { class: 'kg-t-caption kg-fg-default' }, [
            icon('ⓘ'),
            el('span', { text: ' Chọn “Tất cả phong cách” để lấy trọn bộ, hoặc một phong cách để .zip chỉ chứa kit của phong cách đó.' }),
          ])
        : null,
    ],
  }));

  /* ── 2 · atlas.png + atlas.json ── */
  const atlasRows = [];
  for (const v of o.variants) {
    const kit = o.kits.get(v.id);
    if (!kit) continue;
    atlasRows.push(el('div', { class: 'kg-row', style: { gap: 'var(--s-2)' } }, [
      el('span', { class: 'kg-t-body kg-fg-strong', text: v.label }),
      el('div', { class: 'kg-row kg-row--tight', style: { marginLeft: 'auto' } }, [
        fileBtn(o, `kits/${v.id}/atlas.png`, 'atlas.png'),
        fileBtn(o, `kits/${v.id}/atlas.json`, 'atlas.json'),
      ]),
    ]));
  }
  root.appendChild(panel({
    title: 'atlas.png + atlas.json',
    children: [
      explain('Cho ai: lập trình viên game dùng Phaser/PixiJS — một ảnh gộp + toạ độ từng frame.'),
      ...(atlasRows.length ? atlasRows : [el('p', { class: 'kg-t-caption kg-fg-default', text: 'Chưa có atlas — atlas được sinh trong bước cắt.' })]),
      el('p', { class: 'kg-t-caption kg-fg-default', text: 'Không có file? Nghĩa là bước cắt chưa sinh atlas cho phong cách đó — cắt lại là có.' }),
    ],
  }));

  /* ── 3 · manifest.json ── */
  root.appendChild(panel({
    title: 'manifest.json',
    children: [
      explain('Cho ai: script tự động của bạn — danh mục mọi file đã cắt kèm kích thước, sheet, số ô.'),
      el('div', { class: 'kg-row kg-row--tight' }, [fileBtn(o, 'kits/manifest.json', 'Tải manifest.json')]),
    ],
  }));

  /* ── 4 · Copy cho Figma (chưa thi công — nói thật, có đường thay thế) ── */
  const figmaBtn = createButton({
    label: 'Copy cho Figma', variant: 'secondary', icon: '⧉',
    onClick: () => {
      toast.warning({
        title: 'Copy cho Figma chưa làm ở bản này',
        description: 'Hãy tải .zip rồi kéo thả thư mục kit vào Figma — kết quả tương đương.',
        actions: [{ label: 'Tải .zip', onClick: () => zipBtn.click() }],
      });
    },
  });
  root.appendChild(panel({
    title: 'Copy cho Figma',
    children: [
      explain('Cho ai: designer muốn dán cả bảng element vào Figma trong một lần.'),
      createBanner({
        kind: 'info',
        title: 'Chưa thi công ở bản này (hạng mục NICE §7.2). Đường dùng được ngay: tải .zip rồi kéo thả vào Figma.',
      }),
      el('div', { class: 'kg-row kg-row--tight' }, [figmaBtn]),
    ],
  }));

  return root;
}

function explain(text) {
  return el('p', { class: 'kg-t-caption kg-fg-default', text });
}

/** Nút tải 1 file trong project qua #41 (không có `?w=` ⇒ file gốc). */
function fileBtn(o, relPath, label) {
  const btn = createButton({
    label, variant: 'ghost', size: 'sm', icon: '⬇',
    disabled: o.readOnly,
    onClick: () => triggerDownload(api.files.fullUrl(o.projectId, relPath), relPath.split('/').pop()),
  });
  if (o.readOnly) btn.setAttribute('aria-disabled', 'true');
  return btn;
}

function triggerDownload(url, filename) {
  const a = el('a', { href: url, download: filename, style: { display: 'none' } });
  document.body.appendChild(a);
  a.click();
  a.remove();
}
