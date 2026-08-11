/**
 * features/design/safety/format-time.ts — thời gian dạng người đọc.
 * Tách khỏi component để `HistoryDrawer` và `DraftBanner` dùng chung mà không
 * import lẫn nhau, và để test được bằng Node thuần (không cần DOM).
 *
 * KHÔNG BAO GIỜ in ISO thô ra UI: "2026-08-06T14:32:11.004Z" không giúp ai cả.
 */
export function formatWhen(iso: string, now: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "lần trước";
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  const hhmm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (new Date(now).toDateString() === d.toDateString()) return `${hhmm} hôm nay`;
  if (new Date(now - 864e5).toDateString() === d.toDateString()) return `hôm qua ${hhmm}`;
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${hhmm}`;
}
