/**
 * features/runs/lib/download.ts — tải một chuỗi ra file .txt.
 *
 * Blob dựng tại chỗ, same-origin, KHÔNG gửi gì lên mạng — đúng cam kết "dữ liệu
 * của bạn nằm trên máy bạn" ở §3-S6 tab Về (yêu cầu #7).
 *
 * Khác với ảnh/zip (phải đi qua transport vì agent chặn request thiếu header —
 * xem `features/projects/lib/agent-blob.ts`), log ĐÃ NẰM TRONG BỘ NHỚ trình
 * duyệt rồi, nên ở đây không có request nào cả.
 */
export function downloadText(filename: string, content: string): boolean {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof Blob === "undefined") {
    return false;
  }
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
