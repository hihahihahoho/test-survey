/**
 * settings/index.js — S6 · CÀI ĐẶT (`/settings`, UX-SPEC §3-S6). 5 tab qua `?tab=`:
 *   agent · env · prefs · trash · about        (§2.1)
 *
 * Kỷ luật gọi API (§6.2 ràng buộc thiết kế):
 *   · `/api/doctor` KHÔNG BAO GIỜ được poll (nó chạy `codex debug prompt-input`, ~1s).
 *     Chỉ gọi khi MỞ tab env/about lần đầu, hoặc khi user bấm [Kiểm tra lại].
 *   · `/api/workspaces` chỉ gọi khi mở tab agent. `/api/trash` chỉ khi mở tab trash.
 *   · prefs/about không gọi mạng.
 *
 * 4 trạng thái mỗi tab: loading (skeleton/spinner có chữ) · empty (thùng rác trống,
 * 1 workspace) · error (banner/khối lỗi có nút) · success. Agent chưa chạy: banner §2.5,
 * mọi nút ghi disabled + tooltip; tab prefs/about VẪN dùng được (chúng là local).
 */

import { el, createTabs, createButton, toast } from '../../ui/index.js';
import { createShell, pageHead, panel } from '../project/shared/screen.js';
import { fallbackStatus } from '../project/shared/agent-state.js';
import * as data from '../project/shared/data.js';
import * as nav from '../project/shared/nav.js';
import { renderAgentTab } from './tab-agent.js';
import { renderEnvTab } from './tab-env.js';
import { renderPrefsTab } from './tab-prefs.js';
import { renderTrashTab } from './tab-trash.js';
import { renderAboutTab } from './tab-about.js';
import { toShellMount } from '../project/mount-adapter.js';

const TAB_IDS = ['agent', 'env', 'prefs', 'trash', 'about'];
const TAB_LABEL = {
  agent: 'Công cụ local', env: 'Môi trường', prefs: 'Ưu tiên', trash: 'Thùng rác', about: 'Về',
};

export function mountSettings(container, opts = {}) {
  let status = opts.status ?? fallbackStatus();
  let activeTab = TAB_IDS.includes(opts.tab) ? opts.tab : 'agent';
  let disposed = false;
  let tabsApi = null;

  const m = {
    workspaces: { items: [], activeId: null },
    wsLoading: false, wsError: null, wsLoaded: false,
    doctor: null, doctorLoading: false, doctorError: null, doctorCheckedAt: null,
    trash: [], trashLoading: false, trashError: null, trashLoaded: false,
  };

  const shell = createShell(container, {
    onRetry: () => { void recheck(); },
    onWhy: () => { toast.info({
      title: 'Vì sao trình duyệt chặn?',
      description: 'Trang https không được gọi vào máy bạn (http://127.0.0.1) trên một số trình duyệt. Bản chạy tại máy dùng chung một địa chỉ nên không bị chặn.',
    }); },
  });

  /* ─────────────── nạp dữ liệu theo tab, không nạp thừa ─────────────── */

  async function ensureWorkspaces({ force = false } = {}) {
    if (m.wsLoading) return;
    if (m.wsLoaded && !force) return;
    m.wsLoading = true; m.wsError = null; render();
    const r = await data.loadWorkspaces();
    if (disposed) return;
    m.wsLoading = false;
    m.wsLoaded = true;
    if (r.ok) m.workspaces = r.data; else m.wsError = r.error;
    render();
  }

  async function ensureDoctor({ refresh = false } = {}) {
    if (m.doctorLoading) return;
    if (m.doctor && !refresh) return;
    m.doctorLoading = true; m.doctorError = null; render();
    const r = await data.loadDoctor({ refresh });
    if (disposed) return;
    m.doctorLoading = false;
    if (r.ok) { m.doctor = r.data; m.doctorCheckedAt = new Date().toISOString(); }
    else { m.doctor = null; m.doctorError = r.error; }
    render();
  }

  async function ensureTrash({ force = false } = {}) {
    if (m.trashLoading) return;
    if (m.trashLoaded && !force) return;
    m.trashLoading = true; m.trashError = null; render();
    const r = await data.loadTrash();
    if (disposed) return;
    m.trashLoading = false;
    m.trashLoaded = true;
    if (r.ok) m.trash = r.data; else m.trashError = r.error;
    render();
  }

  /** [Kiểm tra lại] của cả màn: chỉ làm mới thứ thuộc tab đang mở. */
  async function recheck() {
    if (activeTab === 'agent') await ensureWorkspaces({ force: true });
    else if (activeTab === 'env' || activeTab === 'about') await ensureDoctor({ refresh: true });
    else if (activeTab === 'trash') await ensureTrash({ force: true });
    else render();
  }

  function loadForTab() {
    if (activeTab === 'agent') void ensureWorkspaces();
    else if (activeTab === 'env') void ensureDoctor();
    else if (activeTab === 'trash') void ensureTrash();
    else render();
  }

  /* ─────────────── vẽ ─────────────── */

  function tabPanelFor(id) {
    if (id === 'agent') {
      return renderAgentTab({
        status, workspaces: m.workspaces, loading: m.wsLoading, error: m.wsError,
        onRecheck: () => { void ensureWorkspaces({ force: true }); },
        onReload: () => { void ensureWorkspaces({ force: true }); },
      });
    }
    if (id === 'env') {
      return renderEnvTab({
        doctor: m.doctor, loading: m.doctorLoading, error: m.doctorError,
        checkedAt: m.doctorCheckedAt,
        onRecheck: () => { void ensureDoctor({ refresh: true }); },
      });
    }
    if (id === 'prefs') return renderPrefsTab({});
    if (id === 'trash') {
      return renderTrashTab({
        items: m.trash, loading: m.trashLoading, error: m.trashError, status,
        onReload: () => { void ensureTrash({ force: true }); },
      });
    }
    return renderAboutTab({ status, doctor: m.doctor, buildId: status?.health?.buildId ?? null });
  }

  function render() {
    shell.syncBanner(status);

    const head = pageHead({
      title: 'Cài đặt',
      subtitle: 'Môi trường, thư mục làm việc, ưu tiên, thùng rác.',
      actions: [
        createButton({ label: 'Kiểm tra lại', variant: 'secondary', icon: '↻', onClick: () => { void recheck(); } }),
        createButton({ label: 'Về danh sách project', variant: 'ghost', icon: '◧', onClick: () => nav.toProjects() }),
      ],
    });

    tabsApi = createTabs({
      ariaLabel: 'Cài đặt',
      active: activeTab,
      tabs: TAB_IDS.map((id) => ({
        id, label: TAB_LABEL[id],
        // Panel của tab KHÔNG mở thì để rỗng — tránh dựng DOM và gọi API vô ích
        panel: id === activeTab ? tabPanelFor(id) : el('div'),
      })),
      onChange: (id) => { if (id !== activeTab) switchTab(id); },
    });

    shell.setContent(el('div', { class: 'kg-stack' }, [head, tabsApi.el]));
  }

  function switchTab(tab) {
    activeTab = TAB_IDS.includes(tab) ? tab : 'agent';
    nav.setTab(activeTab);
    loadForTab();
    render();
  }

  /* Phím tắt (§3-S6): 1..5 đổi tab · ⌘R chặn mặc định → Kiểm tra lại. */
  const onKey = (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'r') {
      e.preventDefault();
      void recheck();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= TAB_IDS.length) {
      e.preventDefault();
      switchTab(TAB_IDS[n - 1]);
    }
  };
  document.addEventListener('keydown', onKey);

  render();
  loadForTab();

  return {
    el: container,
    update({ status: next, tab } = {}) {
      if (next) status = next;
      if (tab && TAB_IDS.includes(tab) && tab !== activeTab) {
        activeTab = tab;
        loadForTab();
      }
      render();
    },
    reload: () => recheck(),
    destroy() {
      disposed = true;
      document.removeEventListener('keydown', onKey);
      shell.destroy();
    },
  };
}

/* ── Hợp đồng mount của app-shell (screen id `settings`, không cần projectId) ── */
export const mount = toShellMount(mountSettings, { needsProject: false });

export { panel };
export default mount;
