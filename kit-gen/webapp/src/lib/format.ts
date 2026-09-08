/**
 * webapp/src/lib/format.ts — ĐỊNH DẠNG SỐ/THỜI GIAN DÙNG CHUNG.
 *
 * ╔══ VÌ SAO FILE NÀY TỒN TẠI (INTEGRATION) ══════════════════════════════════╗
 * ║ Ba team viết ba bản `bytes()` và hai bản `count()` khác nhau:              ║
 * ║   features/projects/lib/format.ts · features/setup/lib/format.ts ·         ║
 * ║   (bản setup đã bị xoá 07/09/2026 cùng wizard cài đặt)                     ║
 * ║   features/runs/lib/format.ts                                             ║
 * ║ và cả ba đều ghi cùng một dòng NEEDS: "nếu ≥2 màn cần, nâng lên lib/".     ║
 * ║ (NEEDS-s1-projects §N1 · NEEDS-s0-setup dòng đầu format.ts · runs §N4.)    ║
 * ║ Ba bản KHÔNG cho cùng kết quả ở ca biên — đo thật:                         ║
 * ║   bytes(null): projects → "0 B"  ·  setup → "—"  ·  runs → "—"             ║
 * ║ "0 B" nghĩa là *file rỗng*, còn thiếu dữ liệu phải là "—". Hai điều khác   ║
 * ║ hẳn nhau với người đọc, và bản của projects đang NÓI DỐI ở ca đó.          ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * Bản gộp lấy hành vi CHẶT NHẤT (của `runs`) làm chuẩn: thiếu dữ liệu ⇒ "—".
 * Đã kiểm là nó thoả ĐỒNG THỜI cả 3 bộ test cũ (xem `__tests__/format.test.ts`).
 *
 * Chỉ chuỗi tiếng Việt theo §1.3. Cấm thuật ngữ nội bộ (`contract`, `job`, `skel`…).
 */

/* ═════════ Dung lượng ═════════ */

/**
 * "0 B" · "512 B" · "18 KB" · "2,9 MB" · "1,2 GB" (dấu thập phân kiểu VI).
 *
 * `Number(null) === 0`, KHÔNG phải NaN — nên phải loại null/undefined/"" TRƯỚC khi
 * ép kiểu, nếu không "chưa biết dung lượng" sẽ hiện thành "0 B".
 */
export function bytes(n: unknown): string {
  if (n === null || n === undefined || n === "") return "—";
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return "—";
  if (v < 1024) return `${Math.round(v)} B`;
  const kb = v / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1).replace(".", ",") : Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1).replace(".", ",") : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1).replace(".", ",")} GB`;
}

/* ═════════ Đếm ═════════ */

/** "5 sheet" · "0 sheet" · "— project" — tiếng Việt không biến đổi danh từ theo số. */
export function count(n: unknown, noun: string): string {
  if (n === null || n === undefined || n === "") return `— ${noun}`;
  const v = Number(n);
  if (!Number.isFinite(v)) return `— ${noun}`;
  return `${v} ${noun}`;
}

/* ═════════ Thời gian ═════════ */

/** "vừa xong · 4 phút trước · 18:04 hôm nay · hôm qua 18:04 · 05/08 18:04". */
export function relTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "—";
  const diff = Math.round((now - t) / 1000);
  if (diff < 45) return "vừa xong";
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))} phút trước`;
  if (diff < 6 * 3600) return `${Math.round(diff / 3600)} giờ trước`;
  const d = new Date(t);
  const p = (x: number) => String(x).padStart(2, "0");
  const at = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (new Date(now).toDateString() === d.toDateString()) return `${at} hôm nay`;
  if (new Date(now - 864e5).toDateString() === d.toDateString()) return `hôm qua ${at}`;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${at}`;
}

/** Nhãn đầy đủ cho `title`/`aria` khi chữ hiển thị là tương đối. */
export function absTime(iso: string | null | undefined): string {
  if (!iso) return "chưa rõ thời điểm";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "chưa rõ thời điểm";
  const d = new Date(t);
  const p = (x: number) => String(x).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** "14:32" — chỉ giờ:phút, KHÔNG hiện ngày (không cần, và ít lộ hơn). */
export function hhmm(iso: string | null | undefined): string {
  if (typeof iso !== "string" || iso === "") return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/* ═════════ Chuỗi ═════════ */

/**
 * Bỏ dấu + hạ chữ — dùng cho tìm kiếm "gõ xuan ra Xuân".
 * NFD phân rã hết dấu tiếng Việt TRỪ đ/Đ nên phải xử riêng.
 * (Bản đời đầu của v1 dùng bảng tra tay và biến "chủ" thành "cho".)
 */
export function foldCase(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

/** Tên file zip xuất ra: `kitgen-<slug>-<yyyymmdd>.zip` (§4.7). */
export function exportFileName(slug: string, now: Date = new Date()): string {
  const p = (x: number) => String(x).padStart(2, "0");
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}`;
  return `kitgen-${slug || "project"}-${stamp}.zip`;
}
