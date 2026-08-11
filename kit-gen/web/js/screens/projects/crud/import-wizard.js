/**
 * import-wizard.js — §4.6 NHẬP: wizard 3 bước, BƯỚC 2 KHÔNG BỎ QUA ĐƯỢC.
 * Đóng issue nghiêm trọng #2 của audit (import làm mất dữ liệu) và chốt X12:
 * cấm mọi đường import "im lặng". Bảng đối chiếu lấy từ #20 /api/import/preview —
 * web KHÔNG tự đọc file, KHÔNG tự đoán số liệu.
 *
 * Bước 1 chọn nguồn → Bước 2 đối chiếu (thêm/ghi đè/bỏ qua) → Bước 3 kết quả.
 */

import { api, errors } from '../../../core/index.js';
import {
  createBanner, createButton, createCheckbox, createDropzone, createInput, createModalFooter,
  createSpinnerRow, createTable, el, openModal, setLoading, toast,
} from '../../../ui/index.js';
import { bytes, count } from '../../shared/format.js';
import { validateName } from './slug.js';

const SOURCES = Object.freeze([
  { id: 'zip', label: 'File .zip của project', hint: 'Bản xuất từ kit-gen (tối đa 200 MB)', accept: '.zip,application/zip' },
  { id: 'stylesJson', label: 'styles.json của bản cũ', hint: 'Bản Studio v1 — giữ nguyên mọi sheet, không lọc', accept: '.json,application/json' },
  { id: 'folder', label: 'Thư mục có sẵn trong thư mục làm việc', hint: 'Công cụ local quét thấy project.json chưa có trong danh sách', accept: null },
]);

export function openImportWizard({ presetName = '', presetTags = [], readOnly = false, reason = null, onImported } = {}) {
  const state = {
    step: 1,
    source: 'zip',
    uploadId: null,
    fileName: '',
    fileBytes: 0,
    folderPath: '',
    report: null,
    copyHeavy: true,
  };

  const bodyWrap = el('div', { class: 'kg-stack' });
  const stepLine = el('p', { class: 'kg-t-label kg-fg-default' });

  const backBtn = createButton({ label: '← Quay lại', variant: 'ghost', onClick: () => goto(state.step - 1) });
  const cancelBtn = createButton({ label: 'Huỷ', variant: 'secondary', onClick: () => m.close('cancel') });
  const nextBtn = createButton({ label: 'Tiếp: đối chiếu →', variant: 'primary', onClick: () => onNext() });

  const nameField = createInput({
    label: 'Tên project sẽ tạo', value: presetName, required: true,
    attrs: { maxlength: '120' },
  });

  /* ── Bước 1 — chọn nguồn ─────────────────────────────────────────────── */
  function renderStep1() {
    const fileInfo = el('p', { class: 'kg-t-caption kg-fg-default' });

    // Dropzone dùng primitive chung của design system (§5.6) — trước đây mỗi team
    // tự dựng một bản; đã gộp về web/js/ui/dropzone.js ở lượt tích hợp.
    const dz = createDropzone({
      label: 'Chọn file hoặc kéo file vào đây',
      accept: SOURCES.find((s) => s.id === state.source)?.accept ?? '',
      layout: 'row',
      onFiles: (files) => pickFile(files[0]),
    });
    const drop = dz.el;

    async function pickFile(file) {
      dz.setError(null);
      state.uploadId = null;
      state.fileName = file.name;
      state.fileBytes = file.size ?? 0;
      fileInfo.textContent = `${file.name} · ${bytes(file.size ?? 0)} · đang tải lên công cụ local…`;
      setLoading(nextBtn, true);
      try {
        const up = await api.uploads.create(file);
        state.uploadId = up?.uploadId ?? null;
        fileInfo.textContent = `${file.name} · ${bytes(file.size ?? 0)} · đã nhận (${up?.kind ?? 'file'})`;
        if (nameField.value.trim() === '') nameField.setValue(file.name.replace(/\.(zip|json)$/i, '') + ' (nhập)');
      } catch (e) {
        const view = errors.present(e);
        fileInfo.textContent = '';
        dz.setError(`${view.title}. ${view.explain}`);
      } finally {
        setLoading(nextBtn, false);
      }
    }

    const folderField = createInput({
      label: 'Tên thư mục trong thư mục làm việc', mono: true, size: 'sm',
      hint: 'Ví dụ: candy-old-11b2 — thư mục phải nằm trong projects/ của thư mục làm việc.',
      value: state.folderPath,
      onInput: (e) => { state.folderPath = e.target.value.trim(); },
    });

    const radios = SOURCES.map((s) => createCheckbox({
      type: 'radio', name: 'kg-import-src', label: s.label, sublabel: s.hint,
      checked: s.id === state.source,
      onChange: () => { state.source = s.id; state.uploadId = null; goto(1); },
    }));

    bodyWrap.replaceChildren(
      el('div', {}, [el('p', { class: 'kg-t-label', text: 'Nhập từ đâu?' }), ...radios.map((r) => r.el)]),
      state.source === 'folder' ? folderField.el : el('div', { class: 'kg-stack' }, [drop, fileInfo]),
      nameField.el,
      createBanner({ kind: 'info', title: 'File gốc của bạn KHÔNG bị thay đổi hay xoá. Nhập là một chiều.' }),
    );
    nextBtn.querySelector('.kg-btn__label').textContent = 'Tiếp: đối chiếu →';
    backBtn.setAttribute('hidden', '');
  }

  /* ── Bước 2 — BẢNG ĐỐI CHIẾU (không bỏ qua được) ─────────────────────── */
  function renderStep2Loading() {
    bodyWrap.replaceChildren(
      el('div', { style: { padding: 'var(--s-5)' } }, [
        createSpinnerRow({ label: 'Đang đọc file và đối chiếu — chưa tạo gì trên máy bạn…' }),
      ]),
    );
    backBtn.removeAttribute('hidden');
  }

  function renderStep2() {
    const r = state.report ?? {};
    const will = r.willCreate ?? {};
    const rows = [
      { what: 'Sheet', act: 'Thêm mới', n: r.sheets ?? 0, note: `khớp ${will.sheets ?? r.sheets ?? 0}/${r.sheets ?? 0}` },
      { what: 'Element (ô trên sheet)', act: 'Thêm mới', n: r.components ?? 0, note: 'giữ nguyên như trong file' },
      { what: 'Phong cách', act: 'Thêm mới', n: r.variants ?? 0, note: '' },
      { what: 'Dáng nhân vật', act: 'Thêm mới', n: r.poses ?? 0, note: r.poses ? '' : 'file không có dáng nào' },
      { what: 'Ảnh AI đã sinh', act: state.copyHeavy && (will.raw ?? 0) > 0 ? 'Copy kèm' : 'Bỏ qua', n: will.raw ?? 0, note: 'không tốn quota' },
      { what: 'Kit đã cắt', act: state.copyHeavy && (will.kits ?? 0) > 0 ? 'Copy kèm' : 'Bỏ qua', n: will.kits ?? 0, note: 'cắt lại được' },
      { what: 'Project đang có trên máy', act: 'Không ghi đè', n: 0, note: 'luôn tạo project MỚI' },
    ];

    const table = createTable({
      caption: 'Bảng đối chiếu: cái gì sẽ được thêm, ghi đè hay bỏ qua',
      columns: [
        { key: 'what', label: 'Nội dung' },
        { key: 'act', label: 'Sẽ làm gì' },
        { key: 'n', label: 'Số lượng', align: 'right', render: (x) => String(x.n) },
        { key: 'note', label: 'Ghi chú' },
      ],
      rows,
    });

    const warns = Array.isArray(r.warnings) ? r.warnings : [];
    const warnBox = el('div', { class: 'kg-stack' });
    for (const w of warns.slice(0, 6)) {
      warnBox.appendChild(createBanner({
        kind: w.code === 'UNKNOWN_COMPONENTS' ? 'warning' : 'info',
        title: String(w.message ?? w.code ?? 'Ghi chú'),
      }));
    }
    if ((r.duplicateSheetIds ?? []).length > 0) {
      warnBox.appendChild(createBanner({
        kind: 'warning',
        title: `${count(r.duplicateSheetIds.length, 'sheet trùng mã')} — sẽ tự thêm hậu tố -2 và ghi vào báo cáo.`,
      }));
    }

    const heavy = createCheckbox({
      label: 'Copy luôn ảnh AI đã sinh và kit đã cắt (nếu file có)',
      sublabel: 'Bỏ tick nếu chỉ muốn lấy bản thiết kế.',
      checked: state.copyHeavy,
      onChange: (e) => { state.copyHeavy = e.target.checked; renderStep2(); },
    });

    bodyWrap.replaceChildren(
      el('h3', { class: 'kg-t-subtitle', text: `Kiểm tra trước khi nhập — ${state.fileName || state.folderPath || 'nguồn đã chọn'}` }),
      el('p', { class: 'kg-t-body', text: `Đọc được: ${count(r.sheets ?? 0, 'sheet')} · ${count(r.components ?? 0, 'element')} · ${count(r.variants ?? 0, 'phong cách')} · ${count(r.poses ?? 0, 'dáng nhân vật')}.` }),
      table.el,
      (will.raw ?? 0) + (will.kits ?? 0) > 0 ? heavy.el : null,
      warnBox,
      createBanner({ kind: 'info', title: 'File gốc của bạn KHÔNG bị thay đổi hay xoá.' }),
    );
    nextBtn.querySelector('.kg-btn__label').textContent = `Nhập ${count(r.sheets ?? 0, 'sheet')} vào project mới`;
    backBtn.removeAttribute('hidden');
  }

  /* ── Bước 3 — kết quả ────────────────────────────────────────────────── */
  function renderStep3(project, warnings) {
    const s = project?.stats ?? {};
    const lines = [
      `${count(s.sheets ?? 0, 'sheet')} · ${count(s.components ?? 0, 'element')} · ${count(s.variants ?? 0, 'phong cách')}`,
      `Thư mục trên máy: ${project?.id ?? '—'}`,
    ];
    const report = buildReportText(project, state.report, warnings);
    bodyWrap.replaceChildren(
      createBanner({ kind: 'success', title: `Đã nhập vào «${project?.name ?? 'project mới'}»` }),
      el('ul', { style: { paddingLeft: 'var(--s-5)' } }, lines.map((t) => el('li', { class: 'kg-t-body', text: t }))),
      ...(warnings.length > 0
        ? [el('p', { class: 'kg-t-label', text: 'Cảnh báo đã áp dụng' }),
           el('ul', { style: { paddingLeft: 'var(--s-5)' } }, warnings.slice(0, 8).map((w) => el('li', { class: 'kg-t-caption kg-fg-default', text: String(w.message ?? w.code) })))]
        : []),
      el('div', { class: 'kg-row' }, [
        createButton({
          label: 'Tải báo cáo .txt', variant: 'secondary', icon: '⬇',
          onClick: () => downloadText(`kitgen-import-${project?.id ?? 'report'}.txt`, report),
        }),
      ]),
    );
    nextBtn.querySelector('.kg-btn__label').textContent = 'Mở project';
    backBtn.setAttribute('hidden', '');
  }

  function sourcePayload() {
    if (state.source === 'folder') return { source: 'folder', path: state.folderPath };
    return { source: state.source, uploadId: state.uploadId };
  }

  async function onNext() {
    if (state.step === 1) {
      const nameErr = validateName(nameField.value);
      nameField.setError(nameErr);
      if (nameErr) { nameField.focus(); return; }
      if (state.source === 'folder' && state.folderPath === '') {
        toast.warning({ title: 'Chưa chọn thư mục', description: 'Nhập tên thư mục nằm trong thư mục làm việc.' });
        return;
      }
      if (state.source !== 'folder' && !state.uploadId) {
        toast.warning({ title: 'Chưa chọn file', description: 'Chọn file .zip hoặc styles.json trước khi đối chiếu.' });
        return;
      }
      goto(2);
      return;
    }
    if (state.step === 2) { await doImport(); return; }
    m.close('done');
    onImported?.(state.createdProject, { open: true });
  }

  async function loadPreview() {
    renderStep2Loading();
    setLoading(nextBtn, true);
    try {
      const res = await api.importer.preview(sourcePayload());
      state.report = res?.report ?? {};
      renderStep2();
    } catch (e) {
      const view = errors.present(e);
      bodyWrap.replaceChildren(
        createBanner({ kind: 'error', title: view.title }),
        el('p', { class: 'kg-t-body', text: view.explain }),
        el('p', { class: 'kg-t-caption kg-fg-default', text: 'Không có project nào được tạo nửa vời.' }),
      );
      nextBtn.disabled = true;
    } finally {
      setLoading(nextBtn, false);
    }
  }

  async function doImport() {
    setLoading(nextBtn, true);
    m.setBusy(true);
    try {
      const res = await api.projects.create({
        name: nameField.value.trim(),
        template: 'import',
        firstVariant: { vi: 'Phong cách 1', bg: 'magenta' },
        tags: presetTags,
        import: sourcePayload(),
      });
      state.createdProject = res?.project;
      state.step = 3;
      stepLine.textContent = 'Bước 3/3 · Xong';
      renderStep3(res?.project, Array.isArray(res?.warnings) ? res.warnings : []);
      toast.success({ title: `Đã nhập «${res?.project?.name ?? nameField.value.trim()}»` });
      onImported?.(res?.project, { open: false });
    } catch (e) {
      const view = errors.present(e);
      bodyWrap.prepend(createBanner({ kind: 'error', title: `${view.title} — ${view.explain}` }));
      toast.error({ title: view.title, description: view.explain });
    } finally {
      setLoading(nextBtn, false);
      m.setBusy(false);
    }
  }

  function goto(step) {
    state.step = Math.max(1, Math.min(3, step));
    nextBtn.disabled = false;
    if (state.step === 1) { stepLine.textContent = 'Bước 1/3 · Chọn nguồn'; renderStep1(); return; }
    if (state.step === 2) { stepLine.textContent = 'Bước 2/3 · Đối chiếu (bắt buộc xem)'; loadPreview(); }
  }

  const m = openModal({
    title: 'Nhập project', size: 'lg', hasInput: true,
    body: el('div', { class: 'kg-stack' }, [stepLine, bodyWrap]),
    footer: createModalFooter({ extraLeft: backBtn, cancel: cancelBtn, confirm: nextBtn }),
  });
  if (readOnly) {
    nextBtn.disabled = true;
    nextBtn.title = reason ?? 'Cần công cụ local đang chạy';
    bodyWrap.prepend(createBanner({ kind: 'warning', title: 'Cần công cụ local đang chạy để nhập file.' }));
  }
  goto(1);
  return m;
}

/** Báo cáo .txt — bằng chứng cho user, không chứa đường dẫn tuyệt đối. */
function buildReportText(project, report, warnings) {
  const r = report ?? {};
  return [
    'kit-gen · BÁO CÁO NHẬP PROJECT',
    `Thời điểm: ${new Date().toISOString()}`,
    `Project: ${project?.name ?? '—'} (thư mục ${project?.id ?? '—'})`,
    '',
    `Sheet: ${r.sheets ?? 0}`,
    `Element: ${r.components ?? 0}`,
    `Phong cách: ${r.variants ?? 0}`,
    `Dáng nhân vật: ${r.poses ?? 0}`,
    `Element không có trong thư viện chuẩn: ${r.unknownComponents ?? 0} (được GIỮ NGUYÊN)`,
    `Sheet trùng mã: ${(r.duplicateSheetIds ?? []).join(', ') || 'không có'}`,
    '',
    'Cảnh báo:',
    ...(warnings.length ? warnings.map((w) => `  - [${w.code ?? '?'}] ${w.message ?? ''}`) : ['  (không có)']),
  ].join('\n');
}

/** Tải chuỗi thành file — Blob, không gọi ra domain thứ ba (§8.2). */
export function downloadText(fileName, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = el('a', { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
