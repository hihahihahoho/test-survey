/**
 * jobs.js — suy ra MA TRẬN TIẾN ĐỘ (phong cách × sheet) và thẻ "Việc tiếp theo" của S2.
 *
 * Nguồn sự thật (§6.2-B): `project.state.jobs` — map `<variant>-<sheet>` → 1 trong 7 trạng
 * thái §5.7, do agent tính bằng cách so mtime chuỗi contract→prompts→raw→kits.
 * Client TUYỆT ĐỐI không tự suy từ exit code hay tự stat file (không làm được từ web tĩnh).
 *
 * Đường lùi đã ghi ở §7.5-U2: nếu agent chưa trả `state.jobs`, ta hiển thị trạng thái mức
 * SHEET suy từ `staleReason` và ĐÁNH DẤU `degraded: true` để màn nói thật với user
 * ("chưa đọc được tiến độ từng lượt") chứ không vẽ ô xanh giả.
 */

import { JOB_STATES, JOB_PRIORITY } from '../../../ui/index.js';

/** Khoá lượt sinh ảnh = `<variant>-<sheet>` (§1.3). Chỉ dùng nội bộ, không hiện ra UI. */
export function jobKey(variantId, sheetId) { return `${variantId}-${sheetId}`; }

/** Nhãn hiện ra UI cho một lượt: "Tết đỏ · main" (không bao giờ hiện chữ "job"). */
export function jobLabel(variantLabel, sheetId) { return `${variantLabel} · ${sheetId}`; }

/** Sheet có áp dụng cho phong cách này? contract cho phép sheet giới hạn `variants[]`. */
export function sheetAppliesTo(sheet, variantId) {
  const list = sheet?.variants;
  if (!Array.isArray(list) || list.length === 0) return true;
  return list.includes(variantId);
}

/**
 * Dựng ma trận từ contract + project.state.jobs.
 * @returns {{variants, sheets, cells, degraded, counts, total}}
 *   cells: Map "<variantId>|<sheetId>" → { state, job, variant, sheet, applies }
 */
export function buildMatrix(contract, project) {
  const variants = normalizeVariants(contract);
  const sheets = normalizeSheets(contract);
  const stateJobs = project?.state?.jobs;
  const degraded = !stateJobs || typeof stateJobs !== 'object' || Object.keys(stateJobs).length === 0;
  const fallback = degraded ? sheetFallbackState(project) : null;

  const cells = new Map();
  const counts = Object.fromEntries(Object.keys(JOB_STATES).map((k) => [k, 0]));
  let total = 0;

  for (const v of variants) {
    for (const s of sheets) {
      const applies = sheetAppliesTo(s, v.id);
      const key = `${v.id}|${s.id}`;
      if (!applies) { cells.set(key, { state: null, applies: false, job: null, variant: v, sheet: s }); continue; }
      const job = jobKey(v.id, s.id);
      const raw = degraded ? fallback : stateJobs[job];
      const state = Object.hasOwn(JOB_STATES, raw) ? raw : 'never';
      cells.set(key, { state, applies: true, job, variant: v, sheet: s });
      counts[state] += 1;
      total += 1;
    }
  }
  return { variants, sheets, cells, degraded, counts, total };
}

/** Danh sách phong cách đã chuẩn hoá {id, label}. Contract v4 dùng `variants` (arch §2.4) hoặc `styles` (bản cũ). */
export function normalizeVariants(contract) {
  const raw = Array.isArray(contract?.variants) ? contract.variants
    : Array.isArray(contract?.styles) ? contract.styles : [];
  return raw
    .filter((v) => v && typeof v === 'object' && typeof v.id === 'string' && v.id !== '')
    .map((v) => ({ id: v.id, label: String(v.vi ?? v.id), bg: v.bg ?? null, raw: v }));
}

/** Danh sách sheet đã chuẩn hoá {id, cols, rows, components, variants}. */
export function normalizeSheets(contract) {
  const raw = Array.isArray(contract?.sheets) ? contract.sheets : [];
  return raw
    .filter((s) => s && typeof s === 'object' && typeof s.id === 'string' && s.id !== '')
    .map((s) => ({
      id: s.id,
      cols: Number(s?.grid?.cols) || 0,
      rows: Number(s?.grid?.rows) || 0,
      components: Array.isArray(s.components) ? s.components : [],
      variants: Array.isArray(s.variants) ? s.variants : null,
      raw: s,
    }));
}

/** Đường lùi §7.5-U2: không có state.jobs thì đoán mức thô NHƯNG phải nói ra là đoán. */
function sheetFallbackState(project) {
  const reasons = project?.state?.staleReason;
  const list = Array.isArray(reasons) ? reasons : [];
  if (list.includes('contract>raw')) return 'stale';
  if (list.includes('raw>kits')) return 'uncut';
  if (project?.state?.stale === true) return 'stale';
  const rawPresent = Number(project?.stats?.rawPresent ?? 0);
  return rawPresent > 0 ? 'ok' : 'never';
}

/** Gộp trạng thái của một hàng/cột thành 1 badge (§5.7 thứ tự ưu tiên). */
export function worstOf(states) {
  const list = states.filter((s) => typeof s === 'string' && Object.hasOwn(JOB_STATES, s));
  if (list.length === 0) return null;
  for (const p of JOB_PRIORITY) if (list.includes(p)) return p;
  return 'ok';
}

/** Lấy toàn bộ ô đang ở một trạng thái (dùng cho "Việc tiếp theo" + chọn nhanh). */
export function cellsInState(matrix, state) {
  const out = [];
  for (const cell of matrix.cells.values()) if (cell.applies && cell.state === state) out.push(cell);
  return out;
}

/**
 * THẺ "VIỆC TIẾP THEO" (§3-S2 mục 2). Tối đa 3 dòng, mỗi dòng có 1 hành động thật.
 * Thứ tự phản ánh mức cấp bách và chi phí: lỗi → chưa có thiết kế → cần cắt (rẻ) →
 * cần sinh lại (tốn quota) → chưa gen lần nào.
 * @returns {{id, state, title, detail, action, jobs}[]}  rỗng ⇒ "Mọi thứ đã đồng bộ ✓"
 */
export function nextActions(matrix, project, contract) {
  const rows = [];
  const sheetCount = matrix.sheets.length;
  const variantCount = matrix.variants.length;

  // 0 · Chưa có bản thiết kế dùng được: không có sheet, hoặc không có phong cách.
  if (sheetCount === 0) {
    rows.push({
      id: 'no-sheets', state: 'never',
      title: 'Chưa có sheet nào trong bản thiết kế',
      detail: 'Chọn element từ thư viện để tạo sheet đầu tiên.',
      action: 'design', jobs: [],
    });
    return rows;
  }
  if (variantCount === 0) {
    rows.push({
      id: 'no-variants', state: 'never',
      title: 'Chưa có phong cách nào',
      detail: 'Mỗi phong cách là một bộ màu / art style riêng cho cùng bộ element.',
      action: 'styles', jobs: [],
    });
    return rows;
  }

  const failed = cellsInState(matrix, 'failed');
  const uncut = cellsInState(matrix, 'uncut');
  const stale = cellsInState(matrix, 'stale');
  const never = cellsInState(matrix, 'never');
  const running = cellsInState(matrix, 'running').concat(cellsInState(matrix, 'queued'));

  if (running.length > 0) {
    rows.push({
      id: 'running', state: 'running',
      title: `Đang sinh ảnh ${running.length} lượt`,
      detail: cellNames(running),
      action: 'runs', jobs: running.map((c) => c.job),
    });
  }
  if (failed.length > 0) {
    rows.push({
      id: 'failed', state: 'failed',
      title: `${failed.length} lượt sinh ảnh bị lỗi`,
      detail: cellNames(failed),
      action: 'gen', jobs: failed.map((c) => c.job),
    });
  }
  if (stale.length > 0) {
    rows.push({
      id: 'stale', state: 'stale',
      title: `${stale.length} sheet đã sửa thiết kế sau lần sinh ảnh cuối → nên sinh lại`,
      detail: cellNames(stale),
      action: 'gen', jobs: stale.map((c) => c.job),
    });
  }
  if (uncut.length > 0) {
    rows.push({
      id: 'uncut', state: 'uncut',
      title: `${uncut.length} sheet có ảnh mới nhưng chưa cắt`,
      detail: cellNames(uncut),
      action: 'slice', jobs: uncut.map((c) => c.job),
    });
  }
  if (never.length > 0) {
    rows.push({
      id: 'never', state: 'never',
      title: `${never.length} lượt chưa sinh ảnh lần nào`,
      detail: cellNames(never),
      action: 'gen', jobs: never.map((c) => c.job),
    });
  }
  return rows.slice(0, 3);
}

function cellNames(cells) {
  const names = cells.slice(0, 4).map((c) => jobLabel(c.variant.label, c.sheet.id));
  return cells.length > 4 ? `${names.join(' · ')} · +${cells.length - 4}` : names.join(' · ');
}

/** Số ô của một sheet theo lưới (đối chiếu với số element — dùng ở thẻ Bản thiết kế). */
export function sheetCellCount(sheet) {
  return (Number(sheet?.cols) || 0) * (Number(sheet?.rows) || 0);
}
