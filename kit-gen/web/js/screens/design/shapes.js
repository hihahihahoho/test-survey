/**
 * design/shapes.js — HÌNH KHỐI KHUNG XƯƠNG cho lưới ô S3 (§3-S3.3) và whitelist
 * `shape` cho luật validate V-SHAPE (§3.4 "shape thuộc whitelist đọc từ
 * silhouettes.js/skeleton.py").
 *
 * NGUỒN SỰ THẬT, theo thứ tự ưu tiên:
 *   1. `window.KITSIL` nếu trang đã nạp `silhouettes.js` thật (bản gốc ở gốc repo).
 *   2. Bản MIRROR trong file này — vẽ lại ĐÚNG hình học của silhouettes.js dòng 85–127
 *      và skeleton.py dòng 81–115, POSES lấy nguyên số liệu khớp (rút bằng script,
 *      không gõ tay: xem teams/design/NEEDS-d2p3.md §3).
 *   3. Hợp thêm mọi `shape` do agent trả về trong /api/element-lib (§6.2 #28) và
 *      tập SHAPES của agent/lib/validate.mjs — client KHÔNG được nghiêm hơn agent.
 *
 * VÌ SAO GIỮ MIRROR (chốt ở lượt tích hợp, KHÔNG copy file vào bundle):
 * `silhouettes.js` ở gốc repo, ngoài `web/`, và là script IIFE gán `window.KITSIL` —
 * không phải ES module. Copy nó vào bundle sẽ tạo BẢN SAO THỨ HAI phải đồng bộ tay,
 * còn thêm endpoint `/api/engine/silhouettes.js` thì đường vào Pages (không có agent
 * lúc mở trang) vẫn phải có mirror để không vỡ ⇒ mirror là đường duy nhất luôn đúng.
 * Rủi ro "mirror lệch âm thầm" được khoá bằng ca test đối chiếu TỪNG KÝ TỰ markup của
 * cả 11 shape + 19 dáng với file thật: `web/js/screens/__tests__/silhouette-mirror.test.mjs`.
 * (Lượt tích hợp đã tìm ra 5 chỗ mirror LỆCH THẬT nhờ ca này: stroke-width 1.5 thay vì 3,
 *  thiếu chấm khớp, `full` lệch inset, `puzzle` lệch vành, sàn `lw` 2 thay vì 5.)
 */

/** Tập shape agent chấp nhận (agent/lib/validate.mjs) — client không được hẹp hơn. */
const AGENT_SHAPES = ['empty', 'pose', 'pill', 'bar', 'rrect', 'rect', 'circle', 'burst', 'puzzle', 'figure', 'full'];

/** Nhãn tiếng Việt cho select "Hình khối" (§3-S3.4 panel Element). */
export const SHAPE_LABELS = Object.freeze({
  pill: 'Viên nhộng (pill)',
  bar: 'Thanh ngang (bar)',
  rrect: 'Chữ nhật bo góc',
  rect: 'Chữ nhật',
  circle: 'Tròn',
  burst: 'Tia nổ',
  puzzle: 'Mảnh ghép',
  figure: 'Hình người',
  pose: 'Dáng nhân vật',
  full: 'Tràn nền (full-bleed)',
  empty: 'Ô trống',
});

/** 19 dáng nhân vật — id + nhãn VI + khớp (x,y ×100) đúng POSES của silhouettes.js. */
const POSE_DATA = Object.freeze({
  idle: ['Đứng thẳng', '50,10 50,22 62,25 66,39 67,53 38,25 34,39 33,53 50,56 58,75 58,93 42,75 42,93'],
  wave: ['Vẫy chào', '50,10 50,22 62,25 70,16 76,5 38,25 34,39 33,53 50,56 58,75 58,93 42,75 42,93'],
  point: ['Chỉ tay', '50,10 50,22 62,25 76,28 92,27 38,25 34,39 33,53 50,56 58,75 58,93 42,75 42,93'],
  'hold-gift': ['Ôm quà', '50,10 50,22 62,25 66,38 56,44 38,25 34,38 44,44 50,56 58,75 58,93 42,75 42,93'],
  cheer: ['Ăn mừng', '50,10 50,23 62,26 70,15 74,4 38,26 30,15 26,4 50,56 61,72 66,84 39,72 34,84'],
  sad: ['Buồn', '52,13 50,24 60,28 62,42 58,56 40,28 38,42 42,56 50,58 57,76 57,93 43,76 43,93'],
  run: ['Chạy', '60,11 56,23 66,26 76,33 84,24 46,25 38,35 32,46 52,55 68,68 78,80 44,76 34,92'],
  think: ['Suy nghĩ', '52,11 50,23 62,26 68,38 58,21 38,26 35,40 44,48 50,56 58,75 58,93 42,75 42,93'],
  sit: ['Ngồi', '50,18 50,30 61,33 65,46 63,58 39,33 35,46 37,58 50,63 65,68 62,88 35,68 32,88'],
  jump: ['Bật nhảy', '50,9 50,21 61,24 70,14 76,5 39,24 30,14 24,5 50,52 61,66 56,78 39,66 44,78'],
  bow: ['Cúi chào', '64,30 56,38 62,41 60,53 56,64 50,41 46,53 42,64 46,60 53,77 53,93 40,77 40,93'],
  'thumbs-up': ['Like 👍', '50,10 50,22 62,25 70,36 74,22 38,25 34,39 33,53 50,56 58,75 58,93 42,75 42,93'],
  present: ['Giới thiệu', '48,10 48,22 60,25 74,32 88,38 36,25 33,40 40,50 48,56 56,75 56,93 40,75 40,93'],
  dance: ['Nhảy múa', '54,9 52,21 64,24 70,13 64,4 40,25 30,32 20,26 48,54 60,69 68,84 38,74 30,88'],
  walk: ['Đi bộ', '54,10 52,22 62,25 68,37 72,48 42,25 37,37 33,48 50,56 60,73 64,91 42,74 36,91'],
  fly: ['Bay', '66,13 58,22 64,26 76,18 88,10 52,28 66,26 80,20 44,50 34,64 24,78 40,70 30,86'],
  'view-34': ['Góc ¾', '53,10 51,22 65,26 68,39 68,53 43,25 38,38 36,52 50,56 59,75 60,93 44,75 42,93'],
  'view-side': ['Nhìn ngang', '55,10 52,22 53,25 55,39 56,52 50,25 51,39 52,52 50,56 54,75 56,93 47,75 45,93'],
  'view-back': ['Nhìn lưng', '50,10 50,22 38,25 34,39 33,53 62,25 66,39 67,53 50,56 42,75 42,93 58,75 58,93'],
});

const JOINT_ORDER = ['head', 'neck', 'rs', 're', 'rw', 'ls', 'le', 'lw', 'hip', 'rk', 'ra', 'lk', 'la'];
/** Chi + màu kiểu OpenPose — y hệt LIMBS của silhouettes.js. */
const LIMBS = [
  ['neck', 'head', '#e6194b'], ['neck', 'hip', '#f58231'],
  ['neck', 'rs', '#ffe119'], ['rs', 're', '#bfef45'], ['re', 'rw', '#3cb44b'],
  ['neck', 'ls', '#42d4f4'], ['ls', 'le', '#4363d8'], ['le', 'lw', '#911eb4'],
  ['hip', 'rk', '#f032e6'], ['rk', 'ra', '#a9a9a9'],
  ['hip', 'lk', '#469990'], ['lk', 'la', '#9a6324'],
];

function joints(poseId) {
  const row = POSE_DATA[poseId] ?? POSE_DATA.idle;
  const nums = row[1].split(' ').map((p) => p.split(',').map(Number));
  const out = {};
  JOINT_ORDER.forEach((k, i) => { out[k] = [nums[i][0] / 100, nums[i][1] / 100]; });
  return out;
}

/** 19 dáng cho checkbox "lưới 19 dáng" của panel Nhân vật (§3-S3.4-3). */
export function poseList() {
  const kitsil = externalPoses();
  return Object.keys(POSE_DATA).map((id) => ({
    id,
    vi: kitsil?.[id]?.vi ?? POSE_DATA[id][0],
  }));
}

export function poseLabel(id) {
  return poseList().find((p) => p.id === id)?.vi ?? String(id ?? '');
}

function externalPoses() {
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  const k = g && g.KITSIL;
  return k && k.POSES && typeof k.POSES === 'object' ? k.POSES : null;
}

function externalSilhouette() {
  const g = typeof globalThis !== 'undefined' ? globalThis : null;
  const k = g && g.KITSIL;
  return k && typeof k.silhouette === 'function' ? k.silhouette : null;
}

/* ── Whitelist shape (nguồn của luật validate) ───────────────────────────── */

const extraShapes = new Set();
/**
 * Nạp thêm shape từ /api/element-lib để client KHÔNG chặn oan element hợp lệ
 * của thư viện (§6.5-6: mã/dữ liệu lạ không được làm vỡ UI).
 */
export function learnShapesFrom(elements = []) {
  for (const e of elements) {
    const s = e?.skel?.shape;
    if (typeof s === 'string' && s !== '') extraShapes.add(s);
  }
}

/** Whitelist hiện hành = mirror ∪ agent ∪ đã học từ element-lib ∪ KITSIL thật. */
export function shapeWhitelist() {
  const set = new Set([...AGENT_SHAPES, ...Object.keys(SHAPE_LABELS), ...extraShapes]);
  return [...set];
}

export function isKnownShape(shape) {
  return shapeWhitelist().includes(String(shape));
}

/** Lựa chọn cho <select> hình khối: chỉ shape vẽ được, có nhãn VI. */
export function shapeOptions() {
  return shapeWhitelist()
    .filter((s) => s !== 'empty')
    .map((s) => ({ value: s, label: SHAPE_LABELS[s] ?? s }));
}

/* ── Vẽ silhouette (mirror của silhouettes.js dòng 85–127) ───────────────── */

const FILL = '#9a9a9a';
const EDGE = '#606060';

function esc(n) { return Number(n).toFixed(1); }

/** Cổng theo silhouettes.js `poseSVG` dòng 67-83 — GIỐNG TỪNG KÝ TỰ (có ca test khoá lại). */
function poseSVG(poseId, w, h) {
  const j = joints(poseId);
  const P = (k) => [j[k][0] * w, j[k][1] * h];
  const lw = Math.max(5, w * 0.045);
  let out = '';
  for (const [a, b, color] of LIMBS) {
    const [x1, y1] = P(a); const [x2, y2] = P(b);
    out += `<line x1="${esc(x1)}" y1="${esc(y1)}" x2="${esc(x2)}" y2="${esc(y2)}" stroke="${color}" stroke-width="${lw}" stroke-linecap="round"/>`;
  }
  const [hx, hy] = P('head');
  out += `<circle cx="${esc(hx)}" cy="${esc(hy)}" r="${esc(h * 0.085)}" fill="none" stroke="#e6194b" stroke-width="${lw}"/>`;
  // chấm khớp: bản trước THIẾU hẳn phần này ⇒ ô trong S3 trông khác ảnh engine gửi model
  for (const k of JOINT_ORDER) {
    const [x, y] = P(k);
    out += `<circle cx="${esc(x)}" cy="${esc(y)}" r="${esc(lw * 0.65)}" fill="#222"/>`;
  }
  return out;
}

/**
 * Markup SVG (chuỗi) của một silhouette trong hệ toạ độ 0,0→w,h.
 * Dùng bản THẬT nếu trang có KITSIL, ngược lại dùng mirror.
 */
export function silhouetteMarkup(shape, w, h, uid, skel = {}) {
  const real = externalSilhouette();
  if (real) {
    try { return real(shape, w, h, uid, skel); } catch { /* rơi về mirror */ }
  }
  // stroke-width 3 và số KHÔNG làm tròn — y hệt silhouettes.js dòng 85-127.
  const stroke = skel.plain ? `fill="${FILL}"` : `fill="${FILL}" stroke="${EDGE}" stroke-width="3"`;
  if (shape === 'empty') return '';
  if (shape === 'pose') return poseSVG(skel.pose, w, h);
  if (shape === 'pill' || shape === 'bar') {
    return `<rect x="0" y="0" width="${w}" height="${h}" rx="${h / 2}" ${stroke}/>`;
  }
  if (shape === 'rrect') {
    return `<rect x="0" y="0" width="${w}" height="${h}" rx="${Math.min(w, h) / 6}" ${stroke}/>`;
  }
  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    return `<circle cx="${w / 2}" cy="${h / 2}" r="${r}" ${stroke}/>`;
  }
  if (shape === 'burst') {
    const R = Math.min(w, h) / 2; const pts = [];
    for (let i = 0; i < 16; i += 1) {
      const a = (i * Math.PI) / 8; const r = i % 2 ? R * 0.45 : R;
      pts.push(`${w / 2 + r * Math.cos(a)},${h / 2 + r * Math.sin(a)}`);
    }
    return `<polygon points="${pts.join(' ')}" ${stroke}/>`;
  }
  if (shape === 'puzzle') {
    const tab = Math.min(w, h) * 0.22; const rx = Math.min(w, h) / 8;
    return `<mask id="pz${uid}">
          <rect x="0" y="${tab}" width="${w}" height="${h - tab}" rx="${rx}" fill="#fff"/>
          <circle cx="${w / 2}" cy="${tab}" r="${tab}" fill="#fff"/>
          <circle cx="0" cy="${(h + tab) / 2}" r="${tab}" fill="#000"/>
        </mask>
        <rect x="-6" y="-6" width="${w + 12}" height="${h + 12}" fill="${FILL}" mask="url(#pz${uid})"/>`;
  }
  if (shape === 'figure') {
    const hr = Math.min(w * 0.4, h * 0.24);
    const by = hr * 1.8; const bw = w * 0.66; const bh = h - by;
    const aw = w * 0.15; const ah = bh * 0.5;
    return `<circle cx="${w / 2}" cy="${hr}" r="${hr}" ${stroke}/>
        <rect x="${(w - bw) / 2}" y="${by}" width="${bw}" height="${bh}" rx="${bw / 3}" ${stroke}/>
        <rect x="${(w - bw) / 2 - aw * 0.8}" y="${by + bh * 0.06}" width="${aw}" height="${ah}" rx="${aw / 2}" ${stroke}
              transform="rotate(12 ${(w - bw) / 2} ${by + bh * 0.06})"/>
        <rect x="${(w + bw) / 2 - aw * 0.2}" y="${by + bh * 0.06}" width="${aw}" height="${ah}" rx="${aw / 2}" ${stroke}
              transform="rotate(-12 ${(w + bw) / 2} ${by + bh * 0.06})"/>`;
  }
  if (shape === 'full') {
    return `<rect x="2" y="2" width="${w - 4}" height="${h - 4}" ${stroke}/>`;
  }
  // `rect` KHÔNG có trong silhouettes.js (bản thật trả rỗng) — giữ đúng hành vi đó,
  // whitelist vẫn nhận `rect` vì agent nhận, chỉ là không vẽ silhouette gợi ý.
  return '';
}

/**
 * Node <svg> thật cho một ô lưới. `boxW/boxH` là kích thước ô hiển thị (px CSS).
 * Silhouette được đặt đúng tỉ lệ w/h của skel + anchor bottom như skeleton.py dòng 105–107.
 * KHÔNG dùng innerHTML cho dữ liệu người dùng: chuỗi SVG chỉ chứa số + màu hằng.
 */
export function silhouetteSvg(skel, boxW, boxH) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${Math.round(boxW)} ${Math.round(boxH)}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const shape = String(skel?.shape ?? 'rect');
  if (shape === 'empty') return svg;

  const isFull = shape === 'full';
  const w = isFull ? boxW : boxW * clamp01(skel?.w ?? 0.8);
  const h = isFull ? boxH : boxH * clamp01(skel?.h ?? 0.6);
  const x = (boxW - w) / 2;
  const y = skel?.anchor === 'bottom' ? boxH - h - boxH * 0.04 : (boxH - h) / 2;

  const g = document.createElementNS(NS, 'g');
  g.setAttribute('transform', `translate(${esc(x)} ${esc(y)})`);
  // Chuỗi SVG do file này sinh (số + màu hằng), không có dữ liệu user → an toàn.
  g.innerHTML = silhouetteMarkup(shape, w, h, uidCounter(), skel ?? {});
  svg.appendChild(g);

  // Khung safe zone như skeleton.py dòng 114–115: element `free` KHÔNG vẽ khung.
  if (!skel?.free && shape !== 'pose') {
    const box = document.createElementNS(NS, 'rect');
    box.setAttribute('x', esc(x)); box.setAttribute('y', esc(y));
    box.setAttribute('width', esc(w)); box.setAttribute('height', esc(h));
    box.setAttribute('fill', 'none');
    box.setAttribute('stroke', 'currentColor');
    box.setAttribute('stroke-width', '1');
    box.setAttribute('stroke-dasharray', '3 3');
    box.setAttribute('opacity', '0.55');
    svg.appendChild(box);
  }
  return svg;
}

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0.8;
  return Math.min(1, n);
}

let seq = 0;
function uidCounter() { seq += 1; return `s${seq.toString(36)}`; }

/** Tỉ lệ ô theo orient (§3-S3.3: landscape 3:2 · portrait 2:3). */
export function cellAspect(orient) {
  return orient === 'portrait' ? 2 / 3 : 3 / 2;
}
