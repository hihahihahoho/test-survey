/**
 * screens/setup/index.js — S0 WIZARD 4 BƯỚC (`/setup`, UX-SPEC §3-S0).
 * Hợp đồng màn: export mount(host, ctx) (xem app-shell/screen-registry.js).
 *
 * Bước: 1 Cài công cụ → 2 Kết nối (poll + cầu dò) → 3 Thư mục làm việc → 4 Tạo ảnh.
 * Ghi trạng thái đã setup vào store (`kitgen.setup.v1`) — router dùng nó để guard (§2.1).
 * Chạy lại wizard để ĐỔI workspace: vào /setup lúc đã completed ⇒ nhảy thẳng bước 3
 * và nút cuối đổi thành "Xong, về danh sách project".
 *
 * Phím tắt (§3-S0): Enter = nút chính · Esc KHÔNG đóng wizard (chỉ "Bỏ qua" mới rời).
 */

import { api, router, store } from '../../core/index.js';

const { LS_KEYS } = store;
import { createBanner, createButton, el, toast } from '../../ui/index.js';
import * as agentStatus from '../../app-shell/agent-status.js';
import { STEPS, createStepper, stepIndex } from './stepper.js';
import { renderInstallStep } from './step-install.js';
import { renderConnectStep } from './step-connect.js';
import { renderWorkspaceStep } from './step-workspace.js';
import { renderImageGenStep } from './step-imagegen.js';

/** Đọc trạng thái setup đã lưu (không bao giờ ném). */
function readSetup() {
  try { return store.get(LS_KEYS.setup); } catch { return { completed: false, step: 'download' }; }
}

function saveSetup(partial) {
  try { store.patch(LS_KEYS.setup, partial); }
  catch (e) { console.warn('[setup] không lưu được trạng thái:', e?.code ?? e?.name); }
}

export function mount(host, ctx) {
  const saved = readSetup();
  const rerun = saved.completed === true;      // user chủ động chạy lại để đổi workspace
  const st = {
    step: rerun ? 'workspace' : (STEPS.some((s) => s.id === saved.step) ? saved.step : 'download'),
    done: [],
    doctor: null,
    doctorLoading: false,
    doctorError: null,
  };

  const stepper = createStepper({ onGoto: (id) => goto(id) });
  const stepSlot = el('div', { class: 'kg-stack' });
  const skipRow = el('div', { class: 'kg-row' });

  const wrap = el('div', {
    class: 'kg-stack',
    // bề rộng đọc thoải mái cho wizard: dựng từ token, không có số px rời (§5.1)
    style: { maxWidth: 'calc(var(--w-modal-lg) + var(--s-10))', margin: '0 auto', padding: 'var(--s-10) var(--s-4)' },
  }, [
    el('div', { class: 'kg-row' }, [
      el('h1', { text: 'Cài đặt lần đầu' }),
      el('div', { style: { marginLeft: 'auto' } }, [skipRow]),
    ]),
    stepper.el,
    rerun
      ? createBanner({
          kind: 'info',
          title: 'Bạn đang chạy lại hướng dẫn cài. Đổi thư mục làm việc ở bước 3, xong thì bấm về danh sách project.',
        })
      : null,
    stepSlot,
  ]);
  host.replaceChildren(wrap);

  /* Nút rời wizard: rerun thì luôn có; lần đầu thì là "Bỏ qua, tôi đã cài rồi". */
  function renderSkip() {
    skipRow.replaceChildren(createButton({
      label: rerun ? 'Về danh sách project' : 'Bỏ qua, tôi đã cài rồi →',
      variant: 'ghost',
      onClick: () => { if (!rerun) goto('connect'); else finish({ navigate: true }); },
    }));
  }

  /** Đánh dấu xong + ghi store; `navigate` = về S1 luôn. */
  function finish({ navigate = false } = {}) {
    saveSetup({
      completed: true,
      step: 'done',
      agentVersionSeen: agentStatus.status().agentVersion ?? '',
      protocolSeen: Number(agentStatus.status().health?.protocol ?? 1),
      imageGenMode: st.doctor?.imageGen?.mode ?? 'unknown',
      checkedAt: new Date().toISOString(),
    });
    if (navigate) router.go('S1');
  }

  async function loadDoctor({ refresh = false } = {}) {
    if (!agentStatus.status().connected) {
      st.doctor = null;
      st.doctorError = { code: 'AGENT_NOT_RUNNING' };
      render();
      return;
    }
    st.doctorLoading = true;
    st.doctorError = null;
    render();
    try {
      st.doctor = await api.system.doctor({ refresh });
      st.doctorError = null;
    } catch (e) {
      st.doctor = null;
      st.doctorError = e;
    } finally {
      st.doctorLoading = false;
      render();
    }
  }

  function goto(id) {
    st.step = STEPS.some((s) => s.id === id) ? id : 'download';
    saveSetup({ step: st.step === 'done' ? 'done' : st.step });
    const i = stepIndex(st.step);
    st.done = STEPS.slice(0, i).map((s) => s.id);
    // §6.2 ràng buộc: CẤM poll doctor — chỉ gọi khi vào bước 3/4 hoặc bấm Kiểm tra lại.
    if ((st.step === 'workspace' || st.step === 'imagegen') && st.doctor === null && !st.doctorLoading) {
      loadDoctor();
      return;
    }
    render();
  }

  async function trouble() {
    const r = await agentStatus.runBridgeProbe();
    if (r.blockedPopup) {
      toast.warning({
        title: 'Trình duyệt chặn cửa sổ kiểm tra',
        description: 'Cho phép popup cho trang này rồi bấm lại.',
      });
    }
    render();
  }

  function render() {
    const status = agentStatus.status();
    stepper.render({ current: st.step, done: st.done });
    renderSkip();

    if (st.step === 'download') {
      stepSlot.replaceChildren(renderInstallStep({
        waiting: !status.connected,
        onTrouble: trouble,
        onSkip: () => goto('connect'),
      }));
      // Tự nhảy sang bước 2 ngay khi phát hiện agent (không bắt user bấm).
      if (status.connected) goto('connect');
      return;
    }
    if (st.step === 'connect') {
      stepSlot.replaceChildren(renderConnectStep({
        status,
        bridgeResult: agentStatus.lastBridgeResult(),
        onTrouble: trouble,
        onNext: () => goto('workspace'),
      }));
      return;
    }
    if (st.step === 'workspace') {
      stepSlot.replaceChildren(renderWorkspaceStep({
        status,
        doctor: st.doctor,
        onNext: () => goto('imagegen'),
        onChanged: () => loadDoctor({ refresh: true }),
      }));
      return;
    }
    stepSlot.replaceChildren(renderImageGenStep({
      doctor: st.doctor,
      loading: st.doctorLoading,
      error: st.doctorError,
      onRecheck: () => loadDoctor({ refresh: true }),
      onFinish: () => finish(),
      onCreateFirst: () => { router.go('S1'); window.dispatchEvent(new CustomEvent('kg:create-project')); },
      onImport: () => { router.go('S1'); window.dispatchEvent(new CustomEvent('kg:import-project')); },
    }));
  }

  /* Enter = nút chính của bước (§3-S0 phím tắt). Không bắt Enter khi đang gõ. */
  function onKey(e) {
    if (e.key !== 'Enter') return;
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || t.tagName === 'BUTTON')) return;
    const primary = stepSlot.querySelector('.kg-btn--primary');
    if (primary && !primary.disabled) { e.preventDefault(); primary.click(); }
  }
  document.addEventListener('keydown', onKey);

  const unsub = agentStatus.subscribe(() => {
    // Đã kết nối mà doctor chưa có và đang ở bước cần doctor → nạp.
    if ((st.step === 'workspace' || st.step === 'imagegen') && st.doctor === null && !st.doctorLoading) {
      loadDoctor();
      return;
    }
    render();
  });

  goto(st.step);

  return {
    destroy() {
      document.removeEventListener('keydown', onKey);
      unsub();
    },
    status() { render(); },
    route() { /* /setup không có tab */ },
    title: () => null,
  };
}

/** Dùng cho test & cho S6 ("Chạy lại hướng dẫn cài"). */
export function isSetupCompleted() { return readSetup().completed === true; }
