/**
 * step-install.js — S0 BƯỚC 1: tải script .sh + copy lệnh (§3-S0 wireframe bước 1/4).
 *
 * Ràng buộc spec:
 *  · KHÔNG dùng kiểu `curl … | bash` — user phải xem được file trước (nói rõ trên UI)
 *  · Có SHA256 + nút Copy để user tự đối chiếu bằng lệnh shasum
 *  · Accordion "Script sẽ làm gì" liệt kê ĐÚNG 7 việc
 *  · Dòng "Đang chờ công cụ local…" (tự phát hiện) + nút [Tôi bị lỗi →]
 */

import { createBanner, createButton, createCodeBlock, createSpinnerRow, el, toast } from '../../ui/index.js';
import { bashCmd, shasumCmd } from '../../app-shell/commands.js';
import { bytes } from '../shared/format.js';
import {
  SCRIPT_NAME, SEVEN_THINGS, downloadScript, scriptBytes, scriptSha256,
} from './installer-script.js';

export function renderInstallStep({ onTrouble, onSkip, waiting }) {
  const size = scriptBytes().length;

  const shaLine = el('div', { class: 'kg-stack' }, [
    el('span', { class: 'kg-t-label kg-fg-default', text: 'SHA256 của đúng file bạn sắp tải' }),
    createSpinnerRow({ label: 'đang tính…' }),
  ]);
  // Tính hash THẬT trên đúng bytes sẽ tải về (không phải hằng số chép tay).
  scriptSha256().then((hex) => {
    shaLine.replaceChildren(
      el('span', { class: 'kg-t-label kg-fg-default', text: 'SHA256 của đúng file bạn sắp tải' }),
      hex
        ? createCodeBlock({ code: hex, ariaLabel: 'Chữ ký SHA256 của script' }).el
        : el('span', {
            class: 'kg-t-caption kg-fg-default',
            text: 'Trình duyệt này không cho tính chữ ký (cần https hoặc bản chạy tại máy). Bạn vẫn đọc được toàn bộ script bằng editor.',
          }),
      el('span', { class: 'kg-t-caption kg-fg-default', text: 'So sánh với kết quả lệnh shasum bên dưới cho chắc chắn.' }),
    );
  });

  const dl = createButton({
    label: `⬇ Tải ${SCRIPT_NAME}`, variant: 'primary', size: 'lg',
    onClick: () => {
      const n = downloadScript();
      toast.success({
        title: `Đã tải ${SCRIPT_NAME}`,
        description: `${bytes(n)} · mở bằng editor để đọc trước khi chạy`,
      });
    },
  });

  const box1 = el('div', { class: 'kg-card', style: { padding: 'var(--s-4)', gap: 'var(--s-3)' } }, [
    el('h3', { class: 'kg-t-subtitle', text: '1 · Tải script' }),
    el('div', { class: 'kg-row' }, [
      dl,
      el('span', { class: 'kg-t-caption kg-fg-default', text: `1 file, ${bytes(size)}, mã nguồn mở — mở bằng editor được` }),
    ]),
    shaLine,
  ]);

  const box2 = el('div', { class: 'kg-card', style: { padding: 'var(--s-4)', gap: 'var(--s-3)' } }, [
    el('h3', { class: 'kg-t-subtitle', text: '2 · Mở Terminal và chạy' }),
    createCodeBlock({ code: shasumCmd(SCRIPT_NAME), ariaLabel: 'Lệnh kiểm tra chữ ký' }).el,
    createCodeBlock({ code: bashCmd(SCRIPT_NAME), ariaLabel: 'Lệnh chạy script' }).el,
    el('p', {
      class: 'kg-t-caption kg-fg-default',
      text: 'Chúng tôi KHÔNG dùng kiểu tải-và-chạy-một-dòng (curl rồi bash) — bạn phải xem được file trước khi chạy.',
    }),
  ]);

  const acc = el('details', {}, [
    el('summary', {
      class: 'kg-t-label', style: { cursor: 'pointer' },
      text: `Script sẽ làm gì trên máy tôi? (${SEVEN_THINGS.length} việc, không cần sudo)`,
    }),
    el('ol', { style: { paddingLeft: 'var(--s-5)', marginTop: 'var(--s-2)' } },
      SEVEN_THINGS.map((t) => el('li', { class: 'kg-t-body', text: t }))),
  ]);

  const accLinux = el('details', {}, [
    el('summary', { class: 'kg-t-label', style: { cursor: 'pointer' }, text: 'Tôi dùng Linux / không có Homebrew' }),
    el('p', {
      class: 'kg-t-body', style: { marginTop: 'var(--s-2)' },
      text: 'Script không dùng Homebrew. Nó chỉ cần bash, Node ≥ 20 và python3 có sẵn trên hệ thống. '
        + 'Trên Ubuntu/Debian, nếu thiếu venv hãy cài gói python3-venv bằng trình quản lý gói của bạn rồi chạy lại script.',
    }),
  ]);

  const waitRow = el('div', { class: 'kg-row' }, [
    createSpinnerRow({ label: 'Đang chờ công cụ local… (tự phát hiện, không cần bấm gì)' }),
    createButton({ label: 'Tôi bị lỗi →', variant: 'ghost', size: 'sm', onClick: onTrouble }),
  ]);

  return el('div', { class: 'kg-stack' }, [
    el('h2', { class: 'kg-t-title', text: 'Cài công cụ local' }),
    el('p', {
      class: 'kg-t-body',
      text: 'Trang này chạy trong trình duyệt nên không tự đọc được ổ đĩa hay gọi được AI. '
        + 'Một script sẽ chuẩn bị máy giúp bạn: kiểm tra codex CLI, Python và các thư viện cắt ảnh.',
    }),
    box1,
    box2,
    acc,
    accLinux,
    waiting === false
      ? createBanner({ kind: 'success', title: 'Đã thấy công cụ local — sang bước tiếp theo được rồi.' })
      : waitRow,
    el('div', { class: 'kg-row' }, [
      createButton({ label: 'Bỏ qua, tôi đã cài rồi →', variant: 'link', onClick: onSkip }),
    ]),
  ]);
}
