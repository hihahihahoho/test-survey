/**
 * broken.js — chi tiết "project.json hỏng" (§3-S1-4, §3.9 PROJECT_BROKEN).
 * Nguyên tắc §1.1-5: 1 câu người thật hiểu + ≥1 nút + panel dev gập lại.
 * Project hỏng KHÔNG biến mất im lặng và KHÔNG mở được (tránh làm hỏng thêm).
 */

import { api, errors } from '../../core/index.js';
import { createButton, createDevDetails, el, openModal, toast } from '../../ui/index.js';

export function openBrokenDetail(project) {
  const err = project.error ?? {};
  const rows = [
    ['Thư mục', project.id],
    ['File', err.file ?? 'project.json'],
    ['Dòng', err.line != null ? String(err.line) : 'chưa xác định'],
  ];
  const body = el('div', { class: 'kg-stack' }, [
    el('p', { class: 'kg-t-body', text: 'Công cụ local đọc được thư mục nhưng không hiểu nội dung file mô tả project. Project vẫn nằm nguyên trên máy bạn — không có gì bị xoá.' }),
    el('div', { class: 'kg-stack' }, rows.map(([k, v]) => el('div', { class: 'kg-row' }, [
      el('span', { class: 'kg-t-label kg-fg-default', text: k }),
      el('span', { class: 'kg-t-mono', text: v }),
    ]))),
    el('p', { class: 'kg-t-body', text: 'Cách sửa: mở thư mục, sửa lại file bằng editor (thường là thiếu/thừa dấu phẩy), rồi bấm Kiểm tra lại ở danh sách.' }),
    createDevDetails(errors.devDetails({
      code: 'PROJECT_BROKEN', message: err.message ?? '(agent không kèm thông điệp)', details: err,
    })),
  ]);

  const m = openModal({
    title: `Không đọc được «${project.name ?? project.id}»`,
    size: 'md',
    body,
    footer: el('div', { class: 'kg-row' }, [
      el('div', { style: { marginLeft: 'auto' } }),
      createButton({ label: 'Đóng', variant: 'secondary', onClick: () => m.close() }),
      createButton({
        label: 'Mở thư mục', variant: 'primary',
        onClick: async () => {
          try { await api.projects.reveal(project.id); }
          catch (e) {
            const v = errors.present(e);
            toast.error({ title: v.title, description: v.explain });
          }
        },
      }),
    ]),
  });
  return m;
}
