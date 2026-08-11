/**
 * step-imagegen.js — S0 BƯỚC 4: XÁC NHẬN MÔI TRƯỜNG (doctor) + tạo ảnh AI.
 *
 * Bắt buộc theo spec (§3-S0 bước 4, yêu cầu #5, §3.9 IMAGEGEN_UNAVAILABLE):
 *  · Checklist từng dòng ✓/✗: node · python (+Pillow/numpy) · codex · playwright · thư mục làm việc
 *  · 3 kết cục: Sẵn sàng (cấu hình mặc định) / Sẵn sàng (home riêng ~/.codex-img) / Chưa tạo được ảnh
 *  · Thiếu image_gen ⇒ HƯỚNG DẪN fallback CODEX_HOME riêng + codex login,
 *    KHÔNG tự động hoá (web không được chạy lệnh), KHÔNG hiện secret
 *  · Dòng cố định: "kit-gen không bao giờ đọc hay lưu thông tin đăng nhập của bạn."
 *  · Mỗi dòng ✗ có hệ quả bằng tiếng Việt + [Copy lệnh cài]
 *  · CẤM poll /api/doctor (tốn ~1s) — chỉ gọi khi mở bước này / bấm Kiểm tra lại
 */

import { errors } from '../../core/index.js';
import {
  createBanner, createButton, createCodeBlock, createSpinnerRow, createStatusDot, el, toast,
} from '../../ui/index.js';
import { IMG_HOME_CHECK_CMD, IMG_HOME_LOGIN_CMD, INSTALL_CMD } from '../../app-shell/commands.js';
import { bytes } from '../shared/format.js';

const PRIVACY_LINE = 'kit-gen không bao giờ đọc hay lưu thông tin đăng nhập của bạn — '
  + 'nó chỉ kiểm tra "có file đăng nhập hay không".';

/** Một dòng checklist: ✓/✗ + hệ quả bằng tiếng Việt + (tuỳ) lệnh cài. */
function line({ ok, label, value, consequence, cmd, onCopy }) {
  const row = el('div', { class: 'kg-row', style: { alignItems: 'flex-start' } }, [
    el('span', { 'aria-hidden': 'true', style: { color: ok ? 'var(--on-tint-ok)' : 'var(--on-tint-danger)' }, text: ok ? '✓' : '✗' }),
    el('span', { class: 'kg-sr-only', text: ok ? 'Đã có:' : 'Còn thiếu:' }),
    el('div', { style: { minWidth: '0', flex: '1 1 auto' } }, [
      el('div', { class: 'kg-t-body', text: `${label}${value ? `  ${value}` : ''}` }),
      !ok && consequence ? el('div', { class: 'kg-t-caption kg-fg-default', text: consequence }) : null,
    ]),
    !ok && cmd
      ? createButton({ label: 'Copy lệnh cài', variant: 'ghost', size: 'sm', icon: '⧉', onClick: () => onCopy(cmd) })
      : null,
  ]);
  return row;
}

/** 3 kết cục của khối "Tạo ảnh AI" (§3-S0 bước 4). */
export function imageGenOutcome(doctor) {
  const ig = doctor?.imageGen ?? {};
  if (ig.available === true) {
    return {
      tone: 'ok',
      title: ig.mode === 'img-home'
        ? 'Sẵn sàng (dùng home riêng cho tạo ảnh)'
        : 'Sẵn sàng (dùng cấu hình mặc định)',
      detail: ig.codexHomeLabel ? `Cấu hình: ${ig.codexHomeLabel}` : null,
      needsFallback: false,
    };
  }
  return {
    tone: 'warn',
    title: 'Chưa tạo được ảnh',
    detail: errors.imageGenReasonText(ig.reason),
    needsFallback: ig.needsFallbackHome === true || ig.available === false,
  };
}

export function renderImageGenStep({ doctor, loading, error, onRecheck, onFinish, onCreateFirst, onImport }) {
  const box = el('div', { class: 'kg-stack' }, [
    el('h2', { class: 'kg-t-title', text: 'Môi trường & tạo ảnh AI' }),
  ]);

  if (loading) {
    box.appendChild(el('div', { class: 'kg-card', style: { padding: 'var(--s-4)' } }, [
      createSpinnerRow({ label: 'Đang kiểm tra máy bạn (mất khoảng 1 giây)…' }),
    ]));
    return box;
  }
  if (error) {
    const view = errors.present(error);
    box.appendChild(createBanner({
      kind: 'error',
      title: `Không kiểm tra được môi trường — ${view.explain}`,
      actions: [createButton({ label: 'Thử lại', variant: 'secondary', size: 'sm', onClick: onRecheck })],
    }));
    box.appendChild(el('p', { class: 'kg-t-caption kg-fg-default', text: 'Bạn vẫn dùng được phần quản lý project; chỉ phần sinh ảnh là chưa chắc chạy.' }));
    box.appendChild(finishRow({ onFinish, onCreateFirst, onImport, label: 'Bỏ qua kiểm tra và vào app' }));
    return box;
  }

  const copy = async (cmd) => {
    let ok = false;
    try { if (navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(cmd); ok = true; } } catch { ok = false; }
    toast[ok ? 'success' : 'info']({ title: ok ? 'Đã copy lệnh' : 'Không copy được, gõ tay nhé', description: cmd });
  };

  /* Khối "Tạo ảnh AI" — 3 kết cục. */
  const out = imageGenOutcome(doctor);
  const igBox = el('div', { class: 'kg-card', style: { padding: 'var(--s-4)', gap: 'var(--s-2)' } }, [
    el('h3', { class: 'kg-t-subtitle', text: 'Tạo ảnh AI' }),
    createStatusDot(out.tone === 'ok' ? 'ok' : 'warn', out.title),
    out.detail ? el('p', { class: 'kg-t-body', text: out.detail }) : null,
    el('p', { class: 'kg-t-caption kg-fg-default', text: PRIVACY_LINE }),
  ]);

  if (out.needsFallback) {
    igBox.appendChild(el('div', { class: 'kg-stack' }, [
      el('p', {
        class: 'kg-t-body',
        text: 'Cách dự phòng: dùng một cấu hình codex RIÊNG chỉ để tạo ảnh. Bạn chạy 2 lệnh này trong Terminal — '
          + 'kit-gen cố ý KHÔNG tự chạy thay bạn, vì đây là việc liên quan tới đăng nhập.',
      }),
      createCodeBlock({ code: IMG_HOME_LOGIN_CMD, ariaLabel: 'Lệnh đăng nhập cho home riêng' }).el,
      createCodeBlock({ code: IMG_HOME_CHECK_CMD, ariaLabel: 'Lệnh kiểm tra công cụ tạo ảnh' }).el,
      el('p', {
        class: 'kg-t-caption kg-fg-default',
        text: 'Lệnh thứ hai chỉ ĐẾM xem có công cụ tạo ảnh hay không — không sinh ảnh, không tốn quota. '
          + 'Xong thì bấm Kiểm tra lại.',
      }),
      el('p', {
        class: 'kg-t-caption kg-fg-default',
        text: 'Chưa xong bước này vẫn dùng được app: bạn soạn thiết kế và cắt ảnh bình thường, chỉ phần sinh ảnh mới cần nó.',
      }),
    ]));
  }
  box.appendChild(igBox);

  /* Checklist máy — từng dòng ✓/✗ với hệ quả thật. */
  const py = doctor?.python ?? {};
  const deps = py.deps ?? {};
  const ws = doctor?.workspace ?? {};
  const rows = [
    line({ ok: doctor?.codex?.ok === true, label: 'codex CLI', value: doctor?.codex?.version ?? '', consequence: 'Không có codex thì không sinh được ảnh AI.', cmd: INSTALL_CMD.codex, onCopy: copy }),
    line({ ok: doctor?.node?.ok === true, label: 'Node.js', value: doctor?.node?.version ?? '', consequence: 'Công cụ local cần Node ≥ 20.', onCopy: copy }),
    line({ ok: py.ok === true, label: 'Python 3', value: py.version ? `${py.version}${py.venv ? ' (môi trường riêng)' : ''}` : '', consequence: 'Không có Python thì không cắt được sheet thành PNG.', cmd: INSTALL_CMD.python, onCopy: copy }),
    line({ ok: deps.pillow === true, label: 'Pillow', value: '', consequence: 'Thiếu Pillow: không cắt ảnh và không tạo được thumbnail.', cmd: INSTALL_CMD.pillow, onCopy: copy }),
    line({ ok: deps.numpy === true, label: 'numpy', value: '', consequence: 'Thiếu numpy: chế độ tách nền nhanh không chạy.', cmd: INSTALL_CMD.pillow, onCopy: copy }),
    line({ ok: doctor?.playwright?.ok === true, label: 'Playwright', value: '', consequence: `Chưa cài — khung xương dùng bản dự phòng (${doctor?.playwright?.fallback ?? 'skeleton.py'}), vẫn chạy được.`, cmd: INSTALL_CMD.playwright, onCopy: copy }),
    line({ ok: ws.writable === true, label: 'Thư mục làm việc', value: [ws.label, Number.isFinite(ws.freeBytes) ? `còn ${bytes(ws.freeBytes)}` : null].filter(Boolean).join(' · '), consequence: 'Không ghi được thì không tạo được project.', onCopy: copy }),
  ];
  box.appendChild(el('div', { class: 'kg-card', style: { padding: 'var(--s-4)', gap: 'var(--s-2)' } }, [
    el('h3', { class: 'kg-t-subtitle', text: 'Máy của bạn' }),
    ...rows,
    el('p', {
      class: 'kg-t-caption kg-fg-default',
      text: doctor?.checkedAt ? `Kiểm tra lúc ${String(doctor.checkedAt).slice(11, 16)}` : '',
    }),
  ]));

  box.appendChild(el('div', { class: 'kg-row' }, [
    createButton({ label: 'Kiểm tra lại', variant: 'secondary', icon: '↻', onClick: onRecheck }),
  ]));
  box.appendChild(finishRow({ onFinish, onCreateFirst, onImport }));
  return box;
}

/** Kết thúc wizard: 2 nút to theo §3-S0. */
function finishRow({ onFinish, onCreateFirst, onImport, label = null }) {
  return el('div', { class: 'kg-row', style: { marginTop: 'var(--s-4)' } }, [
    createButton({
      label: 'Tạo project đầu tiên', variant: 'primary', size: 'lg',
      onClick: () => { onFinish?.(); onCreateFirst?.(); },
    }),
    createButton({
      label: 'Nhập từ styles.json cũ', variant: 'secondary', size: 'lg',
      onClick: () => { onFinish?.(); onImport?.(); },
    }),
    label ? createButton({ label, variant: 'ghost', onClick: () => onFinish?.() }) : null,
  ]);
}
