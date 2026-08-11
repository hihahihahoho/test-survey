/**
 * agent-status.js — NGUỒN DUY NHẤT của trạng thái agent trong app (§2.4, §2.5).
 * Bọc `core/detect.js`: probe 1 lần khi mở app, rồi lặp theo backoff 1.5→3→6→15s;
 * tab ẩn thì DỪNG (arch §5.3). `/health` là endpoint duy nhất được poll (§6.2).
 *
 * Màn hình KHÔNG tự probe: nhận `ctx.status` khi mount và `handle.status(st)` khi đổi.
 * Không lưu gì ngoài những gì core/agent.js đã lưu (kitgen.agent.v1 qua store).
 */

import { detect } from '../core/index.js';
import { smallScreenQuery, SMALL_SCREEN_MAX } from './breakpoints.js';

const listeners = new Set();
let current = detect.checkingStatus();
let timer = null;
let running = false;
let schedule = detect.createProbeSchedule();
let lastBridge = null;
let started = false;
/** deps tiêm được để test dưới Node (không có window/document). */
const deps = { doc: null, win: null };

export function configure({ doc, win } = {}) {
  if (doc !== undefined) deps.doc = doc;
  if (win !== undefined) deps.win = win;
}
const theDoc = () => deps.doc ?? (typeof document !== 'undefined' ? document : null);
const theWin = () => deps.win ?? (typeof window !== 'undefined' ? window : null);

/* ────────────────────────────────────────────────────────────────────────────
   §2.2 · MỐC <768px LÀ "CHỈ ĐỌC" — gate thật, không phải chỉ banner.

   QA-UX CAO-2 · vì sao gate nằm ở ĐÂY.
     Trước lượt này, mốc `<768` chỉ dựng một banner ở `chrome.js`; không dòng nào nối
     bề rộng màn với `readOnly`. Đo được: ở 375px và ở 1440px số nút GHI bấm được là
     GIỐNG HỆT nhau, và thao tác ghi chạy thật (tạo project, lưu bản thiết kế).
     Nghĩa là banner "xem được, sửa nên dùng máy tính" NÓI SAI về khả năng của app —
     người dùng tin mình không thể làm hỏng gì rồi vẫn xoá được project.

     Gate đặt ở nguồn `readOnly` chung nên 31 chỗ `gateButton()/writeButton()` +
     mọi màn đọc `ctx.status.readOnly` tự ăn theo — KHÔNG phải sửa màn nào, KHÔNG
     thêm tính năng, KHÔNG đổi kiến trúc.

   Chỉ SIẾT, không nới: chưa bao giờ biến readOnly=true thành false.
   ──────────────────────────────────────────────────────────────────────────── */
const SMALL_SCREEN_REASON = `Màn hình nhỏ (dưới ${SMALL_SCREEN_MAX + 1}px) — mở trên máy tính để sửa`;
let smallMq = null;
let smallBound = false;

function smallScreenMatches() {
  try {
    if (smallMq === null) smallMq = smallScreenQuery();
    return smallMq?.matches === true;
  } catch { return false; }
}

/** Xoay ngang / đổi cỡ cửa sổ ⇒ trạng thái chỉ-đọc phải đổi theo, không cần F5. */
function bindSmallScreen() {
  if (smallBound) return;
  if (smallMq === null) smallMq = smallScreenQuery();
  if (!smallMq) return;
  smallBound = true;
  const onChange = () => emit();
  if (typeof smallMq.addEventListener === 'function') smallMq.addEventListener('change', onChange);
  else if (typeof smallMq.addListener === 'function') smallMq.addListener(onChange);
}

/** Ghép mốc màn hình nhỏ vào trạng thái agent. `raw` không bị sửa (nó đang bị freeze). */
function compose(raw) {
  if (raw.readOnly === true || !smallScreenMatches()) return raw;
  return Object.freeze({ ...raw, readOnly: true, readOnlyBySmallScreen: true });
}

/** Trạng thái hiện tại (không bao giờ null — lúc đầu là `checking`). */
export function status() { return compose(current); }

/** Trạng thái THÔ của agent, chưa ghép mốc màn hình — dùng cho pill/banner §2.4-2.5. */
export function agentOnlyStatus() { return current; }

/** true ⇒ mọi nút gây thay đổi phải disabled + nêu lý do (§2.5-2), KHÔNG ẩn nút. */
export function isReadOnly() { return status().readOnly === true; }

/** Lý do vào chế độ chỉ-đọc, dùng làm nội dung `aria-describedby` của nút bị chặn. */
export function disabledReason() {
  if (!isReadOnly()) return null;
  // Agent vẫn tốt, chỉ vướng mốc màn hình ⇒ nói ĐÚNG lý do, không mượn câu
  // "Cần công cụ local" (sẽ đẩy user đi sửa nhầm chỗ).
  if (current.readOnly !== true && smallScreenMatches()) return SMALL_SCREEN_REASON;
  if (current.pill === 'blocked-by-browser') return 'Trình duyệt đang chặn — mở bản chạy tại máy';
  if (current.pill === 'protocol-mismatch') return 'Công cụ local không cùng phiên bản — cập nhật rồi thử lại';
  return 'Cần công cụ local đang chạy';
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  const st = status();
  for (const fn of [...listeners]) {
    try { fn(st); } catch (e) { console.error('[agent-status] listener lỗi', e); }
  }
}

function set(next) {
  const changed = next.pill !== current.pill
    || next.code !== current.code
    || next.baseUrl !== current.baseUrl
    || next.workspaceLabel !== current.workspaceLabel
    || next.health?.projects !== current.health?.projects
    || next.health?.activeRuns !== current.health?.activeRuns;
  current = next;
  if (changed) emit();
  return next;
}

/**
 * Chạy 1 lần probe ngay. Trả về trạng thái mới. Không bao giờ ném.
 * Kết quả cầu dò gần nhất (nếu có) luôn được đưa vào để phân biệt
 * "chưa chạy" vs "trình duyệt chặn" (arch §5.3).
 */
export async function refresh() {
  if (running) return current;
  running = true;
  try {
    if (current.pill !== 'connected') set(detect.checkingStatus());
    const st = await detect.probe({ bridgeResult: lastBridge });
    return set(st);
  } catch (e) {
    // detect.probe đã tự bọc lỗi; đây chỉ là lưới an toàn cuối (không được vỡ UI).
    console.error('[agent-status] probe lỗi bất thường', e);
    return current;
  } finally {
    running = false;
  }
}

/**
 * Cầu dò popup (§3-S0 "Tôi bị lỗi →"). CHỈ gọi từ cử chỉ người dùng — popup
 * không do user bấm sẽ bị trình duyệt chặn.
 * @returns {Promise<{alive:boolean, blockedPopup?:boolean}>}
 */
export async function runBridgeProbe() {
  const r = await detect.bridgeProbe();
  lastBridge = r;
  await refresh();
  return r;
}

export function lastBridgeResult() { return lastBridge; }

/** Số lượt chạy đang hoạt động (toàn workspace) — quyết định nhịp poll 1.5s. */
function hasActiveRun() {
  return Number(current.health?.activeRuns ?? 0) > 0;
}

function plan() {
  clearTimeout(timer);
  const doc = theDoc();
  if (doc && doc.hidden === true) return;      // tab ẩn ⇒ DỪNG (arch §5.3)
  const ms = schedule.next({ hasActiveRun: hasActiveRun(), connected: current.pill === 'connected' });
  timer = setTimeout(async () => { await refresh(); plan(); }, ms);
}

/** Khởi động vòng probe. Gọi 1 lần từ shell. */
export function start() {
  if (started) return;
  started = true;
  bindSmallScreen();
  const doc = theDoc();
  if (doc && typeof doc.addEventListener === 'function') {
    doc.addEventListener('visibilitychange', () => {
      if (doc.hidden) clearTimeout(timer);
      else { schedule.reset(); refresh().then(plan); }
    });
  }
  const win = theWin();
  if (win && typeof win.addEventListener === 'function') {
    // Máy vừa thức / vừa có mạng lại: thử ngay, không chờ hết backoff.
    win.addEventListener('online', () => { schedule.reset(); refresh().then(plan); });
  }
  refresh().then(plan);
}

/** Dừng hẳn (dùng cho test / khi rời app). */
export function stop() {
  clearTimeout(timer);
  timer = null;
  started = false;
  schedule = detect.createProbeSchedule();
}

/** Reset toàn bộ cho test. */
export function _reset() {
  stop();
  listeners.clear();
  lastBridge = null;
  current = detect.checkingStatus();
  smallMq = null;
  smallBound = false;
}
