/**
 * tab-env.js — S6 tab **Môi trường (doctor) + Tạo ảnh AI** (§3-S6, YÊU CẦU #5 và #7).
 *
 * Luật bảo mật thi công ở đây (arch §4.3, YC#7):
 *   · KHÔNG hiện secret. Doctor chỉ trả enum + boolean + version — ta chỉ vẽ đúng thứ đó.
 *   · KHÔNG lưu bất cứ gì của doctor vào trình duyệt, TRỪ `imageGenMode` (enum, được phép
 *     theo schema `kitgen.setup.v1`).
 *   · KHÔNG hiện đường dẫn tuyệt đối — doctor đã rút thành nhãn `~/…`; ta hiện nguyên nhãn đó.
 *   · Mỗi dòng ✗ có HỆ QUẢ bằng tiếng Việt (không chỉ "missing") + [Copy lệnh cài] + link.
 * `/api/doctor` KHÔNG được poll (§6.2) — chỉ gọi khi mở tab / bấm [Kiểm tra lại].
 */

import {
  el, createButton, createCodeBlock, createBanner, createStatusDot, createBadge,
  createSpinnerRow, createEmptyState, icon,
} from '../../ui/index.js';
import { panel, statRow } from '../project/shared/screen.js';
import { copyCmdButton } from '../project/shared/agent-state.js';
import * as errors from '../../core/errors.js';
import * as store from '../../core/store.js';
import { LS_KEYS, IMAGE_GEN_MODES } from '../../core/constants.js';
import * as fmt from '../shared/format.js';

/** Nhãn tiếng Việt cho 5 enum mode của image_gen (arch §5). Không thêm mode nào khác. */
const MODE_LABEL = Object.freeze({
  'default-home': 'dùng cấu hình mặc định của codex',
  'img-home': 'dùng home riêng cho tạo ảnh (~/.codex-img)',
  'profile-overlay': 'dùng profile riêng trong cùng home',
  unavailable: 'chưa tạo được ảnh',
  unknown: 'chưa kiểm tra được',
});

/** Hệ quả khi thiếu từng phụ thuộc + lệnh cài (đúng tinh thần §3-S6: không chỉ "missing"). */
const DEP_INFO = Object.freeze({
  codex: { label: 'codex CLI', consequence: 'Không sinh được ảnh AI. Đây là thứ bắt buộc.', cmd: 'npm i -g @openai/codex' },
  node: { label: 'Node', consequence: 'Không chạy được công cụ local.', cmd: 'brew install node' },
  python: { label: 'Python', consequence: 'Không cắt được ảnh thành PNG trong suốt.', cmd: 'brew install python@3.12' },
  pillow: { label: 'Pillow', consequence: 'Không cắt ảnh và không tạo được thumbnail.', cmd: 'python3 -m pip install pillow' },
  numpy: { label: 'numpy', consequence: 'Không tách nền được.', cmd: 'python3 -m pip install numpy' },
  torch: { label: 'ViTMatte (torch)', consequence: 'Vẫn cắt được, nhưng dùng chế độ tách nhanh — mép ảnh kém mượt hơn.', cmd: 'python3 -m pip install torch transformers' },
  playwright: { label: 'Playwright', consequence: 'Khung xương dùng bản dự phòng (vẫn chạy được).', cmd: 'python3 -m pip install playwright && python3 -m playwright install chromium' },
});

/**
 * @param {object} o
 * @param {object|null} o.doctor
 * @param {boolean} o.loading
 * @param {object|null} o.error
 * @param {() => void} o.onRecheck
 */
export function renderEnvTab(o) {
  const root = el('div', { class: 'kg-stack', style: { gap: 'var(--s-4)' } });

  root.appendChild(el('div', { class: 'kg-toolbar', style: { marginBottom: '0' } }, [
    el('span', { class: 'kg-t-caption kg-fg-default',
      text: o.doctor ? `Kiểm tra lúc ${fmt.relTime(o.checkedAt)}` : 'Chưa kiểm tra' }),
    el('div', { class: 'kg-toolbar__spacer' }),
    createButton({ label: 'Kiểm tra lại', variant: 'secondary', size: 'sm', icon: '↻', onClick: o.onRecheck }),
  ]));

  if (o.loading) {
    root.appendChild(panel({ title: 'Máy của bạn', children: [
      createSpinnerRow({ label: 'Đang kiểm tra môi trường (mất khoảng 1 giây)…' }),
    ] }));
    return root;
  }

  if (o.error) {
    const view = errors.present(o.error);
    root.appendChild(panel({ title: 'Môi trường', children: [
      createEmptyState({
        inline: true, icon: '⛔',
        title: 'Không kiểm tra được môi trường',
        description: view.explain,
        primary: createButton({ label: 'Thử lại', variant: 'primary', onClick: o.onRecheck }),
      }),
    ] }));
    return root;
  }

  if (!o.doctor) {
    root.appendChild(panel({ title: 'Môi trường', children: [
      // Agent chưa chạy: hiện `?` mọi dòng + [Thử lại] (§4.9 ma trận hành vi)
      el('p', { class: 'kg-t-body kg-fg-default', text: 'Chưa đọc được — công cụ local phải đang chạy mới kiểm tra được máy bạn.' }),
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-1)' } },
        ['codex CLI', 'Node', 'Python', 'ViTMatte', 'Playwright', 'Thư mục làm việc']
          .map((n) => el('div', { class: 'kg-row kg-row--tight' }, [
            createBadge({ state: 'neutral', text: 'chưa biết', iconGlyph: '?' }),
            el('span', { class: 'kg-t-body kg-fg-default', text: n }),
          ]))),
      el('div', { class: 'kg-row kg-row--tight' }, [
        createButton({ label: 'Thử lại', variant: 'secondary', size: 'sm', onClick: o.onRecheck }),
      ]),
    ] }));
    return root;
  }

  root.appendChild(imageGenPanel(o.doctor));
  root.appendChild(machinePanel(o.doctor));
  return root;
}

/* ───────────────────── Tạo ảnh AI ───────────────────── */

function imageGenPanel(doc) {
  const ig = doc.imageGen ?? {};
  const available = ig.available === true;
  const mode = IMAGE_GEN_MODES.includes(ig.mode) ? ig.mode : 'unknown';

  // Ghi nhớ ENUM mode (được phép theo schema kitgen.setup.v1) — không ghi gì khác.
  try { store.patch(LS_KEYS.setup, { imageGenMode: mode, checkedAt: new Date().toISOString() }); }
  catch { /* store chặn thì thôi, không ảnh hưởng hiển thị */ }

  const children = [
    el('div', { class: 'kg-row', style: { gap: 'var(--s-3)' } }, [
      createStatusDot(available ? 'ok' : 'warn', available ? 'Sẵn sàng' : errors.lookup('IMAGEGEN_UNAVAILABLE').title),
      el('div', { style: { marginLeft: 'auto' } }, [
        createBadge({ state: available ? 'ok' : 'warn', text: mode, iconGlyph: available ? '✓' : '⚠', long: MODE_LABEL[mode] }),
      ]),
    ]),
    statRow('Chế độ', MODE_LABEL[mode]),
    statRow('Cấu hình codex đang dùng', ig.codexHomeLabel ?? 'chưa biết'),
    statRow('Đã đăng nhập codex', ig.authPresent === true ? 'có' : ig.authPresent === false ? 'chưa' : 'chưa biết'),
    ig.verifiedAt ? statRow('Kiểm tra lúc', fmt.relTime(ig.verifiedAt)) : null,
    el('p', { class: 'kg-t-caption kg-fg-default' }, [
      icon('ⓘ'),
      el('span', { text: ' kit-gen chỉ kiểm tra "có đăng nhập chưa", không bao giờ đọc hay lưu nội dung đăng nhập của bạn.' }),
    ]),
  ];

  if (!available) {
    // Giải thích theo `details.reason` (7 enum) — copy lấy từ core/errors.js, không tự viết.
    children.push(createBanner({
      kind: 'warning',
      title: errors.imageGenReasonText(ig.reason),
    }));
    children.push(...fallbackGuide(ig));
  }
  return panel({ title: 'Tạo ảnh AI', children: children.filter(Boolean) });
}

/**
 * Hướng dẫn fallback CODEX_HOME riêng (§3-S0 bước 4 / §3-S6).
 * KHÔNG tự động hoá, KHÔNG hỏi secret: chỉ đưa 2 lệnh để user tự chạy ở Terminal.
 */
function fallbackGuide(ig) {
  const home = ig.codexHomeLabel && ig.codexHomeLabel !== '~/.codex' ? ig.codexHomeLabel : '~/.codex-img';
  const out = [
    el('p', { class: 'kg-t-body kg-fg-default',
      text: 'Cách khắc phục: dựng một cấu hình codex RIÊNG cho việc tạo ảnh, rồi đăng nhập vào đó. Chạy hai lệnh sau ở Terminal:' }),
    createCodeBlock({ code: `mkdir -p ${home}`, ariaLabel: 'Lệnh tạo cấu hình riêng' }).el,
    createCodeBlock({ code: `CODEX_HOME=${home} codex login`, ariaLabel: 'Lệnh đăng nhập cho cấu hình riêng' }).el,
    el('p', { class: 'kg-t-caption kg-fg-default',
      text: 'Đăng nhập diễn ra hoàn toàn trong Terminal và trình duyệt của codex. Trang này không nhận, không thấy, không lưu thông tin đăng nhập.' }),
    el('div', { class: 'kg-row kg-row--tight' }, [
      copyCmdButton(`CODEX_HOME=${home} codex login`, 'Copy lệnh đăng nhập'),
    ]),
  ];
  if (ig.needsFallbackHome === false && ig.reason === 'FREE_PLAN') {
    out.push(el('p', { class: 'kg-t-caption kg-fg-default',
      text: 'Gói tài khoản hiện tại không có công cụ tạo ảnh — đổi cấu hình sẽ không giúp được.' }));
  }
  return out;
}

/* ───────────────────── Máy của bạn ───────────────────── */

function machinePanel(doc) {
  const rows = [];
  rows.push(depRow('codex', doc.codex?.ok === true, doc.codex?.version));
  rows.push(depRow('node', doc.node?.ok === true, doc.node?.version));
  rows.push(depRow('python', doc.python?.ok === true, pythonNote(doc.python)));
  const deps = doc.python?.deps ?? {};
  rows.push(depRow('pillow', deps.pillow === true));
  rows.push(depRow('numpy', deps.numpy === true));
  rows.push(depRow('torch', deps.torch === true && deps.transformers === true));
  rows.push(depRow('playwright', doc.playwright?.ok === true));

  const ws = doc.workspace ?? {};
  const wsOk = ws.writable === true;
  rows.push(el('div', { class: 'kg-row', style: { gap: 'var(--s-3)' } }, [
    createBadge({ state: wsOk ? 'ok' : 'failed', text: wsOk ? 'ghi được' : 'không ghi được', iconGlyph: wsOk ? '✓' : '✗' }),
    el('div', { style: { minWidth: '0', flex: '1 1 200px' } }, [
      el('div', { class: 'kg-t-body kg-fg-strong', text: 'Thư mục làm việc' }),
      el('div', { class: 'kg-t-caption kg-fg-default',
        text: `${ws.label ?? 'chưa biết'}${Number.isFinite(ws.freeBytes) ? ` · còn ${fmt.bytes(ws.freeBytes)}` : ''}` }),
    ]),
  ]));

  return panel({
    title: 'Máy của bạn',
    children: [
      doc.os ? statRow('Hệ điều hành', String(doc.os)) : null,
      el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--s-3)' } }, rows),
    ].filter(Boolean),
  });
}

function pythonNote(py) {
  if (!py) return null;
  const bits = [py.version, py.venv ? 'môi trường riêng' : null].filter(Boolean);
  return bits.join(' · ') || null;
}

/** Một dòng phụ thuộc: ✓/✗ + tên + (nếu ✗) HỆ QUẢ + [Copy lệnh cài]. */
function depRow(key, ok, versionNote = null) {
  const info = DEP_INFO[key];
  return el('div', { class: 'kg-row', style: { gap: 'var(--s-3)', alignItems: 'flex-start' } }, [
    createBadge({ state: ok ? 'ok' : 'warn', text: ok ? 'có' : 'chưa cài', iconGlyph: ok ? '✓' : '✗' }),
    el('div', { style: { minWidth: '0', flex: '1 1 240px' } }, [
      el('div', { class: 'kg-t-body kg-fg-strong', text: info.label }),
      el('div', { class: 'kg-t-caption kg-fg-default', text: ok ? (versionNote ?? '') : info.consequence }),
    ]),
    ok ? null : el('div', { class: 'kg-row kg-row--tight', style: { marginLeft: 'auto' } }, [
      copyCmdButton(info.cmd, 'Copy lệnh cài'),
    ]),
  ]);
}
