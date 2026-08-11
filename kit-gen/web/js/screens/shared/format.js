/**
 * format.js — định dạng số/thời gian/nhãn DÙNG CHUNG cho mọi màn (S0–S6).
 * Chỗ trung lập theo NEEDS-setup-projects.md N7 (trước ở screens/project/shared/).
 * Chỉ chuỗi tiếng Việt theo §1.3 (từ vựng khoá) — không có thuật ngữ nội bộ
 * (`contract`, `job`, `skel`, `matte`… bị cấm hiện ra UI, §1.3).
 * KHÔNG chứa màu/khoảng cách: mọi giá trị hiển thị đi qua token ở tầng gọi.
 */

/** Dung lượng: 0 B · 954 KB · 24.0 MB · 1.2 GB (dấu thập phân kiểu VI). */
export function bytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '—';
  if (v < 1024) return `${Math.round(v)} B`;
  const kb = v / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1).replace('.', ',') : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1).replace('.', ',') : Math.round(mb)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(1).replace('.', ',')} GB`;
}

/** Thời gian tương đối: "vừa xong · 4 phút trước · hôm qua 18:04 · 5/8". */
export function relTime(iso, now = Date.now()) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const diff = Math.round((now - t) / 1000);
  if (diff < 0) return 'vừa xong';
  if (diff < 45) return 'vừa xong';
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))} phút trước`;
  if (diff < 6 * 3600) return `${Math.round(diff / 3600)} giờ trước`;
  const d = new Date(t);
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = new Date(now).toDateString() === d.toDateString();
  if (sameDay) return `${hhmm} hôm nay`;
  const yesterday = new Date(now - 864e5).toDateString() === d.toDateString();
  if (yesterday) return `hôm qua ${hhmm}`;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${hhmm}`;
}

/** Ngày tuyệt đối ngắn (dùng cho thùng rác: "05/08/2026 12:10"). */
export function dateTime(iso) {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const d = new Date(t);
  const p = (x) => String(x).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Còn bao nhiêu ngày tới mốc (thùng rác 30 ngày). Âm ⇒ đã hết hạn. */
export function daysLeft(iso, now = Date.now()) {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - now) / 864e5);
}

/** Khoảng thời lượng: 1m48s · 4m12s · 52s. */
export function duration(ms) {
  const v = Number(ms);
  if (!Number.isFinite(v) || v < 0) return '—';
  const s = Math.round(v / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, '0')}s`;
}

/** "5 sheet" / "0 sheet" — số + danh từ không biến đổi (tiếng Việt). */
export function count(n, noun) {
  const v = Number.isFinite(Number(n)) ? Number(n) : 0;
  return `${v} ${noun}`;
}

/** Tên file bỏ đuôi .png để hiện nhãn ô kit. */
export function baseName(path) {
  const s = String(path ?? '');
  const last = s.slice(s.lastIndexOf('/') + 1);
  return last.replace(/\.(png|jpg|jpeg|webp)$/i, '');
}

/** WxH → "384×256"; thiếu số → "kích thước chưa đo được" (không bịa). */
export function dimensions(w, h) {
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) return `${w}×${h}`;
  return 'kích thước chưa đo được';
}

/** Nhãn tên file khi xuất: kitgen-<slug>-<yyyymmdd>.zip (§3-S2b). */
export function exportFileName(slug, now = new Date()) {
  const p = (x) => String(x).padStart(2, '0');
  const day = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  const s = String(slug ?? 'project').replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'project';
  return `kitgen-${s}-${day}.zip`;
}

/**
 * Nhãn VI + thứ tự hiển thị cho `stats.diskBreakdown` (§6.2 #9) — đúng các dòng
 * wireframe §3-S2b. Khoá lạ do agent mới thêm bị BỎ QUA thay vì làm vỡ màn (§6.5-6);
 * khoá thiếu ⇒ không hiện dòng đó, KHÔNG hiện 0 (thà thiếu số hơn số sai).
 */
export const DISK_GROUPS = Object.freeze([
  { key: 'raw', label: 'Ảnh AI đã sinh' },
  { key: 'rawHistory', label: 'Lịch sử ảnh' },
  { key: 'kits', label: 'Kit đã cắt' },
  { key: 'skeleton', label: 'Khung xương' },
  { key: 'prompts', label: 'Prompt đã dựng' },
  { key: 'runs', label: 'Nhật ký & lượt chạy' },
  { key: 'refs', label: 'Ảnh tham khảo' },
]);

/** [{key,label,bytes}] cho các nhóm CÓ dữ liệu; rỗng khi agent chưa trả diskBreakdown. */
export function diskRows(breakdown) {
  if (!breakdown || typeof breakdown !== 'object') return [];
  return DISK_GROUPS
    .map((g) => ({ ...g, bytes: Number(breakdown[g.key]) }))
    .filter((g) => Number.isFinite(g.bytes) && g.bytes > 0);
}
