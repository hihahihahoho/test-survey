/**
 * shell.js — KHUNG APP: nối core/router.js với các màn trong screen-registry.js.
 * Đây là thứ mà `web/index.html` khởi động, và là chỗ mọi màn được mount vào.
 *
 * Nhiệm vụ (và CHỈ những nhiệm vụ này):
 *  1. bật vòng probe agent (agent-status) + vẽ header/pill/banner chỉ-đọc (§2.2, §2.4, §2.5)
 *  2. nghe router → nạp module màn theo bảng → gọi mount(host, ctx)
 *  3. giữ vòng đời màn: destroy / route / status / title / rail
 *  4. phím tắt toàn cục: ⌘P (⌘K tạm dùng chung — NEEDS N9), `g p`, `?`
 *  5. màn chưa thi công ⇒ placeholder, KHÔNG vỡ app (§6.5-6)
 *
 * Shell KHÔNG chứa logic nghiệp vụ của bất kỳ màn nào.
 */

import { router, store } from '../core/index.js';

const { LS_KEYS } = store;
import { createEmptyState, createButton, el, openModal, toast } from '../ui/index.js';
import * as agentStatus from './agent-status.js';
import { createHeader, createSmallScreenBanner, createStatusBanner } from './chrome.js';
import { createRail } from './rail.js';
import { HAS_RAIL, SCREEN_LABEL, loadScreen } from './screen-registry.js';
import { baseCommands, openCommandPalette } from './command-palette.js';
import { RUN_CMD } from './commands.js';
import { copyText } from './chrome.js';

const SHORTCUTS = [
  ['⌘K / Ctrl+K', 'Bảng lệnh — gọi được mọi hành động chính từ bất kỳ màn nào'],
  ['⌘P', 'Nhảy nhanh giữa project'],
  ['g p', 'Về danh sách project'],
  ['g d / g r / g k / g s', 'Thiết kế / Sinh ảnh / Thư viện / Cài đặt project'],
  ['/', 'Tìm trong danh sách project'],
  ['n', 'Tạo project mới'],
  ['v', 'Đổi lưới ↔ danh sách'],
  ['F2', 'Đổi tên project đang chọn'],
  ['⌘D', 'Nhân bản project đang chọn'],
  ['⌫', 'Xoá project đang chọn (có xác nhận + hoàn tác)'],
  ['?', 'Bảng phím tắt này'],
  ['Esc', 'Đóng overlay trên cùng'],
];

export function startShell({ root }) {
  const header = createHeader({
    onHome: () => router.go('S1'),
    // Ô tìm ở header ghi "⌘K" ⇒ phải mở BẢNG LỆNH, không phải hộp nhảy project.
    onSearch: () => openPalette(),
    onJump: () => openJumpFromShell(),
  });
  header.setSettingsHandler(() => router.go('S6', {}, { tab: 'agent' }));

  const banner = createStatusBanner();
  // §2.2 mốc <768: banner "chỉ đọc" — trước đây spec có yêu cầu nhưng chưa ai dựng.
  const smallBanner = createSmallScreenBanner();
  const rail = createRail({ onNavigate: (route, id) => router.go(route, { id }) });
  // ≤1099px rail bị ẩn khỏi luồng ⇒ phải có nút mở, không thì 5 mục của project
  // không tới được bằng chuột lẫn bàn phím (§2.2 + §5.8-A6).
  header.setRailToggle(rail.createRailToggle());
  const main = el('main', { class: 'kg-main', id: 'main', tabindex: '-1' });
  const body = el('div', { class: 'kg-body' }, [rail.el, main]);

  root.replaceChildren(
    el('a', { class: 'kg-skip-link', href: '#main', text: 'Tới nội dung chính' }),
    el('div', { class: 'kg-app' }, [
      header.el,
      el('div', { class: 'kg-banners' }, [banner.el, smallBanner.el]),
      body,
    ]),
  );

  let currentScreenId = null;
  let handle = null;
  let currentMatch = null;

  /** ctx truyền cho màn — hợp đồng ghi ở screen-registry.js. */
  function ctxFor(match) {
    return {
      route: match.route,
      params: match.params ?? {},
      query: match.query ?? {},
      tab: match.tab ?? null,
      status: agentStatus.status(),
      navigate: (path, opts) => router.navigate(path, opts),
      go: (id, params, query, opts) => router.go(id, params, query, opts),
      shell: { openJump: openJumpFromShell, refreshAgent: () => agentStatus.refresh() },
    };
  }

  async function onRoute(match) {
    const prevProjectId = currentMatch?.params?.id ?? null;
    currentMatch = match;
    const screenId = match.route?.screen ?? null;
    const projectId = match.params?.id ?? null;

    // Rail chỉ hiện khi ở trong project (§2.2: S1/S6 full width).
    const withRail = screenId !== null && HAS_RAIL.has(screenId);
    body.className = withRail ? 'kg-body' : 'kg-body kg-body--norail';
    rail.render({ screenId, projectId: withRail ? projectId : null, badges: railBadges(), dots: railDots() });

    // QA-UX CAO-1 (phần 2): `projectName()` ưu tiên `handle.title()`, mà lúc này `handle`
    // vẫn là màn CŨ. Khi đổi project, tên cũ sẽ dán lên breadcrumb + <title> của project
    // mới — đúng triệu chứng "app nói dối về phạm vi". Đổi project ⇒ chỉ lấy tên từ cache
    // danh sách, không hỏi màn cũ; màn mới mount xong sẽ tự cập nhật qua refreshCrumbs().
    const nameNow = withRail ? (projectNameFromCache(projectId) ?? (prevProjectId === projectId ? projectName(projectId) : null)) : null;
    header.setCrumbs({
      projectName: withRail ? (nameNow ?? projectId) : null,
      screenLabel: withRail ? SCREEN_LABEL[screenId] : null,
    });
    document.title = router.documentTitle(match, nameNow);

    // Cùng màn VÀ cùng project, chỉ đổi tab/param → để màn tự xử lý, KHÔNG dựng lại
    // (giữ cuộn/tab/undo stack — đóng audit H3).
    //
    // QA-UX CAO-1 · vì sao phải so `params.id`.
    //   Bản cũ chỉ so `screenId`. Đổi project bằng ⌘P / breadcrumb ▾ / ⌘K "Nhảy nhanh"
    //   là CÙNG screenId ⇒ rơi vào nhánh này. Nhưng `projectId` được cả hai adapter đọc
    //   ĐÚNG MỘT LẦN lúc mount rồi đóng băng trong closure (`mount-adapter.js`,
    //   `screen-adapters.js` — `route()` chỉ chuyển tiếp tab/runId/readOnly, không có
    //   projectId). Hệ quả đo được: URL + breadcrumb + <title> nói project B, nhưng nội
    //   dung và MỌI hành động vẫn thuộc project A; 0 lời gọi API nào cho B trên cả 5 màn
    //   trong project. Đây là vi phạm §1.1-4 "phạm vi hiện rành mạch" và có thể khiến
    //   user tiêu quota cho project mà họ không định chạy.
    //   Bản vá giữ nguyên tối ưu "đổi ?tab= không dựng lại": chỉ ĐỔI PROJECT mới remount.
    const sameProject = prevProjectId === projectId;
    if (screenId === currentScreenId && sameProject && handle && typeof handle.route === 'function') {
      handle.route(ctxFor(match));
      return;
    }

    if (handle && typeof handle.destroy === 'function') {
      try { handle.destroy(); } catch (e) { console.error('[shell] destroy lỗi', e); }
    }
    handle = null;
    currentScreenId = screenId;
    main.replaceChildren();

    const mod = await loadScreen(screenId);
    if (!mod) { main.replaceChildren(placeholder(screenId, projectId)); return; }
    try {
      handle = mod.mount(main, ctxFor(match));
      refreshCrumbs(match);
    } catch (e) {
      console.error('[shell] mount lỗi', e);
      main.replaceChildren(placeholder(screenId, projectId, e));
    }
    main.focus?.({ preventScroll: true });
  }

  /** Dấu • ở mục "Thiết kế" khi màn báo còn thay đổi chưa lưu (§2.2). */
  function railDots() {
    try { return handle?.rail?.()?.dots ?? {}; } catch { return {}; }
  }

  /**
   * Số ở mục rail "Sinh ảnh" = số lượt đang chạy CỦA PROJECT ĐANG MỞ.
   * Nguồn: `state.activeRun` trong cache danh sách project (agent trả ở #7/#9).
   * `/health.activeRuns` là tổng TOÀN workspace nên chỉ dùng làm đường lùi khi
   * đúng 1 run tồn tại (khi đó nó chắc chắn là của project đang mở).
   */
  function railBadges() {
    const id = currentMatch?.params?.id ?? null;
    if (id) {
      try {
        const c = store.get(LS_KEYS.projectsCache);
        const mine = (c.items ?? []).find((p) => p.id === id);
        const ar = mine?.state?.activeRun;
        if (ar && Number(ar.total) > 0) return { runs: Math.max(1, Number(ar.total) - (Number(ar.done) || 0)) };
        if (mine) return { runs: 0 };
      } catch { /* cache lỗi → dùng đường lùi dưới */ }
    }
    const n = Number(agentStatus.status().health?.activeRuns ?? 0);
    return { runs: n === 1 ? 1 : 0 };
  }

  /** Tên project để đặt breadcrumb/<title> — lấy từ cache, không gọi API thêm. */
  function projectName(id) {
    if (!id) return null;
    if (typeof handle?.title === 'function') {
      const t = handle.title();
      if (t) return t;
    }
    return projectNameFromCache(id);
  }

  /** Chỉ đọc cache danh sách — KHÔNG hỏi `handle` (có thể là màn của project khác). */
  function projectNameFromCache(id) {
    if (!id) return null;
    try {
      const c = store.get(LS_KEYS.projectsCache);
      return (c.items ?? []).find((p) => p.id === id)?.name ?? null;
    } catch { return null; }
  }

  /** Màn mới đã nạp xong ⇒ lấy tên thật của nó dán lại vào breadcrumb + <title>. */
  function refreshCrumbs(match) {
    const screenId = match.route?.screen ?? null;
    const id = match.params?.id ?? null;
    if (screenId === null || !HAS_RAIL.has(screenId)) return;
    const name = projectName(id);
    if (!name) return;
    header.setCrumbs({ projectName: name, screenLabel: SCREEN_LABEL[screenId] });
    document.title = router.documentTitle(match, name);
  }

  /** Chốt chống mở trùng overlay khi có 2 nơi cùng nghe một phím (§2.3). */
  let overlayBusy = null;
  function onceOverlay(kind, fn) {
    if (overlayBusy) return;
    overlayBusy = kind;
    try { fn(); } finally { setTimeout(() => { overlayBusy = null; }, 0); }
  }

  /** ⌘P — dùng module của S1 (nó sở hữu dữ liệu danh sách + fuzzy). */
  async function openJumpFromShell() {
    const [{ openJump }, { readCache }] = await Promise.all([
      import('../screens/projects/jump.js'),
      import('../screens/projects/data.js'),
    ]);
    const cache = readCache();
    const items = cache?.items ?? [];
    if (items.length === 0) {
      toast.info({
        title: 'Chưa có danh sách project để nhảy',
        description: 'Mở trang Projects một lần để giao diện biết bạn có những project nào.',
        actions: [{ label: 'Về Projects', variant: 'secondary', onClick: () => router.go('S1') }],
      });
      return;
    }
    openJump({ items, onPick: (p) => router.go('S2', { id: p.id }) });
  }

  /**
   * ⌘K — §2.3 "Mọi hành động trong spec này phải gọi được từ đây".
   * Lệnh = phần toàn cục (điều hướng + CRUD project + công cụ local) ⊕ phần
   * do MÀN ĐANG MỞ khai qua `handle.commands()` (tuỳ chọn, màn nào chưa khai
   * thì vẫn đủ phần toàn cục — không màn nào bị vỡ).
   */
  function openPalette() {
    const projectId = currentMatch?.params?.id ?? null;
    const global = baseCommands({
      router,
      projectId: currentScreenId && HAS_RAIL.has(currentScreenId) ? projectId : null,
      status: agentStatus.status(),
      hooks: {
        openJump: openJumpFromShell,
        openShortcuts,
        refreshAgent: () => agentStatus.refresh(),
        copyRunCmd: async () => {
          const ok = await copyText(RUN_CMD);
          if (ok) toast.success({ title: 'Đã copy lệnh', description: RUN_CMD });
          else toast.info({ title: 'Không copy được', description: `Gõ tay: ${RUN_CMD}` });
        },
      },
    });
    let own = [];
    try {
      const fromScreen = typeof handle?.commands === 'function' ? handle.commands() : null;
      if (Array.isArray(fromScreen)) {
        own = fromScreen
          .filter((c) => c && typeof c.run === 'function' && typeof c.label === 'string')
          .map((c) => ({ ...c, group: c.group ?? 'Màn hình này' }));
      }
    } catch (e) { console.error('[⌘K] commands() của màn lỗi', e); }
    openCommandPalette({ commands: [...own, ...global] });
  }

  function openShortcuts() {
    const rows = SHORTCUTS.map(([k, v]) => el('div', { class: 'kg-row' }, [
      el('kbd', { class: 'kg-t-mono', style: { minWidth: 'calc(var(--s-10) * 2 + var(--s-6))' }, text: k }),
      el('span', { class: 'kg-t-body', text: v }),
    ]));
    openModal({
      title: 'Phím tắt', size: 'md',
      body: el('div', { class: 'kg-stack' }, rows),
      footer: el('div', { class: 'kg-row' }, [
        el('div', { style: { marginLeft: 'auto' } }),
        createButton({ label: 'Đóng', variant: 'secondary', onClick: () => document.querySelector('.kg-modal__close')?.click() }),
      ]),
    });
  }

  /* ── Phím tắt toàn cục (§2.3) ─────────────────────────────────────────── */
  let gPending = 0;
  function onKey(e) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey) {
      const k = e.key.toLowerCase();
      if (k === 'k') { e.preventDefault(); onceOverlay('cmdk', openPalette); }
      else if (k === 'p') {
        e.preventDefault();
        // Màn nào tự khai `jump()` (S1) thì để nó mở — nếu shell mở nữa sẽ ra 2 hộp.
        if (typeof handle?.jump !== 'function') onceOverlay('jump', openJumpFromShell);
      }
      return;
    }
    if (e.key === '?') { e.preventDefault(); openShortcuts(); return; }
    // chuỗi phím kiểu vim: `g` rồi phím đích, trong 800ms
    if (e.key === 'g') { gPending = Date.now(); return; }
    if (gPending > 0 && Date.now() - gPending < 800) {
      const id = currentMatch?.params?.id ?? null;
      const map = { p: ['S1', null], d: ['S3', id], r: ['S4', id], k: ['S5', id], s: ['S2b', id] };
      const hit = map[e.key];
      gPending = 0;
      if (!hit) return;
      const [route, pid] = hit;
      if (route === 'S1') { e.preventDefault(); router.go('S1'); return; }
      if (pid) { e.preventDefault(); router.go(route, { id: pid }); }
      return;
    }
    gPending = 0;
  }
  document.addEventListener('keydown', onKey);

  /* Sự kiện do S0 phát khi kết thúc wizard ("Tạo project đầu tiên"/"Nhập"). */
  window.addEventListener('kg:create-project', () => {
    setTimeout(() => document.querySelector('.kg-page-head__actions .kg-btn--primary')?.click(), 60);
  });
  window.addEventListener('kg:import-project', () => {
    setTimeout(() => {
      const btns = document.querySelectorAll('.kg-page-head__actions .kg-btn');
      for (const b of btns) if (b.textContent.includes('Nhập')) { b.click(); return; }
    }, 60);
  });

  /* Trạng thái agent → header + banner + màn hiện tại.
     QA-UX CAO-2: pill (§2.4) và banner (§2.5) nói về CÔNG CỤ LOCAL ⇒ phải dùng trạng
     thái THÔ. Nếu đưa trạng thái đã ghép mốc màn hình vào đây, mở app trên điện thoại
     khi agent vẫn chạy tốt sẽ hiện "Chưa thấy công cụ local" — sai sự thật, đúng loại
     lỗi mà bản vá này đang đi chữa. Màn hình thì nhận trạng thái ĐÃ ghép (có gate). */
  agentStatus.subscribe((stt) => {
    const raw = agentStatus.agentOnlyStatus();
    header.renderStatus(raw);
    banner.render(raw);
    smallBanner.render();
    rail.render({
      screenId: currentScreenId, projectId: currentMatch?.params?.id ?? null,
      badges: railBadges(), dots: railDots(),
    });
    if (handle && typeof handle.status === 'function') {
      try { handle.status(stt); } catch (e) { console.error('[shell] status lỗi', e); }
    }
  });
  header.renderStatus(agentStatus.agentOnlyStatus());
  banner.render(agentStatus.agentOnlyStatus());
  agentStatus.start();

  router.subscribe(onRoute);
  router.start();

  /* Dấu • "chưa lưu" ở rail: đọc isDirty() mỗi 1s. Chỉ đọc RAM, KHÔNG gọi API. */
  const dotTimer = setInterval(() => {
    if (!currentScreenId || !HAS_RAIL.has(currentScreenId)) return;
    rail.render({
      screenId: currentScreenId, projectId: currentMatch?.params?.id ?? null,
      badges: railBadges(), dots: railDots(),
    });
  }, 1000);

  return {
    destroy() {
      document.removeEventListener('keydown', onKey);
      clearInterval(dotTimer);
      agentStatus.stop();
    },
  };
}

/** Màn của team khác chưa có file → nói rõ, cho đường về, KHÔNG vỡ app. */
function placeholder(screenId, projectId, err = null) {
  const label = SCREEN_LABEL[screenId] ?? 'Màn hình';
  return createEmptyState({
    icon: '▤',
    title: `${label} chưa được thi công`,
    description: err
      ? 'Màn này có file nhưng nạp bị lỗi. Xem console để biết chi tiết; phần còn lại của app vẫn dùng được.'
      : 'Phần này thuộc nhóm khác trong dự án và chưa có mã. Danh sách project và cài đặt lần đầu vẫn dùng được bình thường.',
    primary: createButton({ label: 'Về danh sách project', variant: 'primary', onClick: () => router.go('S1') }),
    secondary: projectId
      ? createButton({ label: 'Cài đặt', variant: 'secondary', onClick: () => router.go('S6', {}, { tab: 'agent' }) })
      : null,
  });
}
