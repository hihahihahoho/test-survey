/**
 * settings.js — S2b · CÀI ĐẶT PROJECT (`/p/:id/settings`, UX-SPEC §3-S2b).
 * Gom mọi thao tác quản lý của MỘT project vào một chỗ, kể cả thao tác phá huỷ.
 *
 * 3 khối theo wireframe: Thông tin · Dung lượng · VÙNG NGUY HIỂM (viền --danger).
 * 4 trạng thái: loading (skeleton 3 thẻ) · empty (project mới: 0 MB + [Dọn cache] disabled)
 *              · error (PROJECT_ID_TAKEN inline tại ô slug · RUN_ACTIVE inline tại nút)
 *              · success (toast "Đã lưu" + tiêu đề đổi ngay).
 * Phím tắt: ⌘S lưu · Esc bỏ thay đổi (có confirm nếu form bẩn).
 */

import {
  el, createButton, createInput, createTextarea, createTag, createBanner,
  toast, setLoading, setDisabled, confirmLight, icon,
} from '../../ui/index.js';
import { createShell, pageHead, panel, statRow, loadingStack, errorBlock, missingProjectBlock } from './shared/screen.js';
import { fallbackStatus, isReadOnly, gateButton, NEED_AGENT, syncLabel } from './shared/agent-state.js';
import * as data from './shared/data.js';
import * as jobsLib from './shared/jobs.js';
import * as nav from './shared/nav.js';
import * as fmt from '../shared/format.js';
import * as api from '../../core/api.js';
import * as errors from '../../core/errors.js';
import { openCleanDialog, openDeleteDialog, openDuplicateDialog, openExportDialog, revealFolder, actionError } from './actions.js';
import { openCoverPicker, coverPreview } from './cover-picker.js';
import { toShellMount } from './mount-adapter.js';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,47}$/;

export function mountProjectSettings(container, opts = {}) {
  const projectId = String(opts.projectId ?? '');
  let status = opts.status ?? fallbackStatus();
  let model = { phase: 'loading', project: null, contract: null, error: null, fromCache: false };
  let form = null;
  let disposed = false;

  const shell = createShell(container, {
    onRetry: () => { void load(); },
    onWhy: () => nav.toSettings('agent'),
  });

  async function load() {
    if (disposed) return;
    model = { ...model, phase: 'loading', error: null };
    render();
    const pr = await data.loadProject(projectId);
    if (disposed) return;
    if (!pr.ok) { model = { ...model, phase: 'error', error: pr.error }; render(); return; }
    model.project = pr.data;
    model.fromCache = pr.fromCache === true;
    if (!model.fromCache) {
      const cr = await data.loadContract(projectId);
      if (disposed) return;
      model.contract = cr.ok ? cr.data.contract : null;
    }
    model.phase = 'success';
    render();
  }

  function render() {
    const reconnected = shell.syncBanner(status, {
      lastSyncLabel: model.fromCache ? syncLabel(data.cacheFetchedAt()) : null,
    });
    if (reconnected) void load();

    if (model.phase === 'loading') { shell.setContent(loadingStack({ panels: 3, label: 'Đang tải cài đặt project…' })); return; }
    if (model.phase === 'error') {
      const code = model.error?.code;
      if (code === 'PROJECT_NOT_FOUND' || code === 'PROJECT_IN_TRASH') {
        shell.setContent(missingProjectBlock(model.error, { onBack: () => nav.toProjects(), onTrash: () => nav.toSettings('trash') }));
        return;
      }
      shell.setContent(errorBlock(model.error, {
        actions: [
          createButton({ label: 'Thử lại', variant: 'primary', onClick: () => load() }),
          createButton({ label: 'Về tổng quan', variant: 'secondary', onClick: () => nav.toProject(projectId) }),
        ],
      }));
      return;
    }
    shell.setContent(view());
  }

  function view() {
    const p = model.project;
    const ro = isReadOnly(status);
    form = buildForm(p, ro);

    return el('div', { class: 'kg-stack' }, [
      pageHead({
        title: 'Cài đặt project',
        subtitle: p?.name ?? projectId,
        actions: [createButton({ label: 'Về tổng quan', variant: 'ghost', icon: '◧', onClick: () => nav.toProject(projectId) })],
      }),
      infoPanel(p, ro),
      diskPanel(p),
      dangerPanel(p),
    ]);
  }

  /* ───────────────────────── khối Thông tin ───────────────────────── */

  function buildForm(p, ro) {
    const name = createInput({ label: 'Tên hiển thị', value: p?.name ?? '', required: true, disabled: ro });
    const desc = createTextarea({ label: 'Mô tả', value: p?.description ?? '', rows: 2, disabled: ro });
    const slug = createInput({
      label: 'Tên file khi xuất (slug)', value: p?.slug ?? '', mono: true, disabled: ro,
      hint: 'Chỉ đổi tên file khi xuất. Thư mục trên máy không đổi.',
    });
    return { name, desc, slug, tags: [...(p?.tags ?? [])], cover: p?.cover ?? null, dirty: false };
  }

  function infoPanel(p, ro) {
    const saveBtn = gateButton(createButton({
      label: 'Lưu thay đổi', variant: 'primary', icon: '💾', onClick: () => { void save(); },
    }), status);
    // Nút Lưu disabled khi form còn SẠCH (§3-S2b "nút Lưu disabled khi sạch").
    if (!ro) setDisabled(saveBtn, true, 'Chưa có thay đổi nào');

    const markDirty = () => {
      form.dirty = true;
      if (!ro) setDisabled(saveBtn, false);
      renderExportName();
    };
    form.name.input.addEventListener('input', markDirty);
    form.desc.input.addEventListener('input', markDirty);
    form.slug.input.addEventListener('input', markDirty);

    const tagWrap = el('div', { class: 'kg-row kg-row--tight' });
    const tagInput = createInput({ label: 'Thêm tag', value: '', size: 'sm', disabled: ro, hint: 'Enter để thêm. Tối đa 12 tag.' });
    function renderTags() {
      while (tagWrap.firstChild) tagWrap.removeChild(tagWrap.firstChild);
      if (form.tags.length === 0) tagWrap.appendChild(el('span', { class: 'kg-t-caption kg-fg-default', text: 'chưa có tag' }));
      for (const t of form.tags) {
        tagWrap.appendChild(createTag(t, ro ? {} : {
          onRemove: (label) => { form.tags = form.tags.filter((x) => x !== label); renderTags(); markDirty(); },
        }));
      }
    }
    renderTags();
    tagInput.input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const v = String(tagInput.value ?? '').trim().slice(0, 24);
      if (v === '') return;
      if (form.tags.includes(v)) { tagInput.setError('Tag này đã có.'); return; }
      if (form.tags.length >= 12) { tagInput.setError('Tối đa 12 tag.'); return; }
      tagInput.setError(null);
      form.tags.push(v);
      tagInput.setValue('');
      renderTags();
      markDirty();
    });

    const coverSlot = el('div', { class: 'kg-row', style: { gap: 'var(--s-3)' } });
    function renderCover() {
      while (coverSlot.firstChild) coverSlot.removeChild(coverSlot.firstChild);
      coverSlot.appendChild(coverPreview({ projectId, cover: form.cover, readOnly: ro }));
      coverSlot.appendChild(el('div', {}, [
        el('div', { class: 'kg-t-caption kg-fg-default', text: form.cover ? form.cover : 'Tự động (lấy file đầu tiên trong kit)' }),
        gateButton(createButton({
          label: 'Đổi ảnh bìa…', variant: 'secondary', size: 'sm', icon: '▨',
          onClick: () => openCoverPicker({
            projectId,
            variants: jobsLib.normalizeVariants(model.contract),
            current: form.cover,
            readOnly: ro,
            onPick: (relPath) => { form.cover = relPath; renderCover(); markDirty(); },
          }),
        }), status),
      ]));
    }
    renderCover();

    const exportLine = el('p', { class: 'kg-t-caption kg-fg-default' });
    function renderExportName() {
      exportLine.textContent = `→ ${fmt.exportFileName(String(form.slug.value ?? p?.slug ?? projectId))}`;
    }
    renderExportName();

    const folderRow = el('div', { class: 'kg-row', style: { gap: 'var(--s-3)' } }, [
      el('div', {}, [
        el('div', { class: 'kg-t-caption kg-fg-default', text: 'Thư mục trên máy' }),
        el('div', { class: 'kg-t-mono kg-fg-strong', text: `projects/${projectId}` }),
        el('div', { class: 'kg-t-caption kg-fg-default', text: 'Không đổi được — đổi tên hiển thị không di chuyển thư mục.' }),
      ]),
      gateButton(createButton({
        label: 'Mở thư mục', variant: 'secondary', size: 'sm', icon: '▤',
        onClick: () => revealFolder(projectId),
      }), status),
    ]);

    const saveSlot = el('div');
    primarySaveBtn = saveBtn;
    return panel({
      title: 'Thông tin',
      children: [
        form.name.el, form.desc.el,
        el('div', {}, [el('div', { class: 'kg-field__label', text: 'Tag' }), tagWrap, tagInput.el]),
        el('div', {}, [el('div', { class: 'kg-field__label', text: 'Ảnh bìa' }), coverSlot]),
        el('div', {}, [form.slug.el, exportLine]),
        folderRow,
        saveSlot,
        el('div', { class: 'kg-row', style: { justifyContent: 'flex-end' } }, [saveBtn]),
      ],
    });

    async function save() {
      const name = String(form.name.value ?? '').trim();
      const slugV = String(form.slug.value ?? '').trim();
      form.name.setError(null); form.slug.setError(null);
      if (name === '') { form.name.setError('Tên không được để trống.'); form.name.focus(); return; }
      if (slugV !== '' && !SLUG_RE.test(slugV)) {
        form.slug.setError('Chỉ dùng chữ thường không dấu, số và dấu gạch ngang (2–48 ký tự).');
        form.slug.focus();
        return;
      }
      setLoading(saveBtn, true);
      const patch = {
        name,
        description: String(form.desc.value ?? ''),
        tags: form.tags,
        cover: form.cover,
      };
      if (slugV !== '') patch.slug = slugV;
      try {
        const res = await api.projects.update(projectId, patch);
        setLoading(saveBtn, false);
        setDisabled(saveBtn, true, 'Chưa có thay đổi nào');
        form.dirty = false;
        model.project = res?.project ?? { ...model.project, ...patch };
        data.rememberInCache(model.project);
        clearSlot();
        toast.success({ title: 'Đã lưu' });
        render();   // tiêu đề/breadcrumb đổi ngay
      } catch (error) {
        setLoading(saveBtn, false);
        const view2 = errors.present(error);
        // §3-S2b: PROJECT_ID_TAKEN → lỗi INLINE tại ô slug + nút [Dùng gợi ý]
        if (view2.code === 'PROJECT_ID_TAKEN') {
          const suggestion = view2.details?.suggestion ?? null;
          form.slug.setError(`${view2.title}. ${view2.explain}`);
          form.slug.focus();
          clearSlot();
          if (suggestion) {
            saveSlot.appendChild(el('div', { class: 'kg-row kg-row--tight' }, [
              createButton({
                label: `Dùng «${suggestion}»`, variant: 'secondary', size: 'sm',
                onClick: () => { form.slug.setValue(suggestion); form.slug.setError(null); renderExportName(); },
              }),
            ]));
          }
          return;
        }
        // Form KHÔNG mất dữ liệu (§3-S2b): chỉ hiện lỗi, giữ nguyên giá trị đang nhập.
        clearSlot();
        saveSlot.appendChild(createBanner({
          kind: 'error', title: `${view2.title} — ${view2.explain}`,
          actions: [createButton({ label: 'Thử lại', variant: 'secondary', size: 'sm', onClick: () => save() })],
        }));
        toast.error({ title: view2.title, description: 'Dữ liệu bạn nhập vẫn còn trên form.' });
      }
    }

    function clearSlot() { while (saveSlot.firstChild) saveSlot.removeChild(saveSlot.firstChild); }
  }
  /** Nút Lưu của lần render gần nhất — để ⌘S bấm đúng nút, không đoán bằng selector. */
  let primarySaveBtn = null;

  /* ───────────────────────── khối Dung lượng ───────────────────────── */

  function diskPanel(p) {
    const s = p?.stats ?? {};
    const total = Number(s.diskBytes ?? 0);
    const isEmpty = total === 0;
    const cleanBtn = gateButton(createButton({
      label: 'Dọn cache…', variant: 'secondary', icon: '⌫',
      onClick: () => openCleanDialog({ project: p, projectId, status, onDone: () => load() }),
    }), status, isEmpty ? 'Chưa có file nào để dọn' : null);

    // Phân rã theo thư mục do agent trả trong `stats.diskBreakdown` (§6.2 #9).
    // Agent cũ chưa có field này → không hiện dòng nào, KHÔNG hiện 0 gây hiểu sai.
    const bdRows = fmt.diskRows(s.diskBreakdown).map((r) => statRow(r.label, fmt.bytes(r.bytes)));

    return panel({
      title: 'Dung lượng',
      children: [
        statRow('Tổng chiếm chỗ', fmt.bytes(total)),
        ...bdRows,
        statRow('Ảnh AI đã sinh', `${s.rawPresent ?? 0}/${s.jobs ?? 0} lượt có ảnh`),
        statRow('File kit đã cắt', fmt.count(s.kitsCut ?? 0, 'file')),
        isEmpty
          ? el('p', { class: 'kg-t-caption kg-fg-default', text: 'Chưa có file nào — sinh ảnh xong sẽ thấy ở đây.' })
          : el('p', { class: 'kg-t-caption kg-fg-default' }, [
              icon('ⓘ'),
              el('span', { text: ' Dọn cache chỉ xoá thứ tái tạo được (khung xương, prompt, kit đã cắt, nhật ký cũ).' }),
            ]),
        el('div', { class: 'kg-row', style: { justifyContent: 'flex-end' } }, [cleanBtn]),
      ],
    });
  }

  /* ───────────────────────── VÙNG NGUY HIỂM ───────────────────────── */

  function dangerPanel(p) {
    const row = (title, desc, btn) => el('div', {
      class: 'kg-row', style: { gap: 'var(--s-3)', paddingTop: 'var(--s-2)' },
    }, [
      el('div', { style: { minWidth: '0', flex: '1 1 240px' } }, [
        el('div', { class: 'kg-t-body kg-fg-strong', text: title }),
        el('div', { class: 'kg-t-caption kg-fg-default', text: desc }),
      ]),
      el('div', { style: { marginLeft: 'auto' } }, [btn]),
    ]);

    return panel({
      title: 'Vùng nguy hiểm', danger: true,
      children: [
        row('Nhân bản project này', 'Tạo bản sao để thử art style khác mà không ảnh hưởng bản gốc.',
          gateButton(createButton({ label: 'Nhân bản…', variant: 'secondary', icon: '⧉',
            onClick: () => openDuplicateDialog({ project: p, projectId }) }), status)),
        row('Xuất ra file .zip', 'Toàn bộ cây thư mục project — thả vào máy khác là chạy được.',
          gateButton(createButton({ label: 'Xuất…', variant: 'secondary', icon: '⬇',
            onClick: () => openExportDialog({ project: p, projectId }) }), status)),
        row('Chuyển project vào thùng rác', 'Giữ 30 ngày, phục hồi được. Xoá vĩnh viễn phải làm ở Cài đặt → Thùng rác.',
          gateButton(createButton({ label: 'Xoá…', variant: 'danger', icon: '🗑',
            onClick: () => openDeleteDialog({ project: p, projectId, status, onDeleted: () => nav.toProjects() }) }), status)),
      ],
    });
  }

  /* ───────────────────────── phím tắt ───────────────────────── */

  const onKey = async (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();   // chặn "Lưu trang" của trình duyệt (§2.3)
      const btn = primarySaveBtn;
      if (btn && !btn.disabled) btn.click();
      else if (isReadOnly(status)) toast.warning({ title: NEED_AGENT });
      return;
    }
    if (e.key === 'Escape' && form?.dirty) {
      // Esc = bỏ thay đổi, nhưng có confirm vì form đang bẩn (§3-S2b phím tắt).
      const ok = await confirmLight({
        title: 'Bỏ các thay đổi chưa lưu?',
        message: 'Những gì bạn vừa nhập ở màn này sẽ không được lưu.',
        confirmLabel: 'Bỏ thay đổi',
      });
      if (ok) { form.dirty = false; void load(); }
    }
  };
  document.addEventListener('keydown', onKey);

  /** Cảnh báo khi rời trang mà form còn bẩn — cùng luật an toàn dữ liệu của §1.1-1. */
  const onBeforeUnload = (e) => {
    if (!form?.dirty) return;
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  void load();

  return {
    el: container,
    update({ status: next } = {}) { if (next) status = next; render(); },
    reload: () => load(),
    title: () => model.project?.name ?? null,
    isDirty: () => form?.dirty === true,
    destroy() {
      disposed = true;
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
      shell.destroy();
    },
  };
}

export { actionError };

/* ── Hợp đồng mount của app-shell (screen id `project-settings`) ── */
export const mount = toShellMount(mountProjectSettings);
export default mount;
