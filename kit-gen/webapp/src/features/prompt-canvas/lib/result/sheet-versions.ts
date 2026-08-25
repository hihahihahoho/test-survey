/**
 * features/prompt-canvas/lib/result/sheet-versions.ts
 * ────────────────────────────────────────────────────────────────────────────
 * BA ĐỜI ẢNH CỦA MỘT TẤM → thanh chọn phiên bản v1 · v2 · v3.
 *
 * Phần thuần của thanh phiên bản. Tách khỏi component vì cái dễ sai ở đây là ĐÁNH SỐ
 * và QUYỀN KHÔI PHỤC, chứ không phải cách vẽ cái dropdown.
 */
/**
 * Một dòng của `#39 GET …/raw/:job/history`.
 *
 * Khai lại theo CẤU TRÚC thay vì `z.infer<typeof rawHistoryItemSchema>`: `lib/types/api.ts`
 * chưa export kiểu cho từng dòng (chỉ có schema), và file đó nằm ngoài phạm vi được sửa
 * của tôi. Kiểu ở đây LỎNG HƠN schema thật (mọi field đều tuỳ chọn) nên nhận được cả bản
 * đã parse lẫn dữ liệu test, và không thể lệch pha khi schema thêm field.
 */
export interface RawHistoryEntry {
  id: string;
  at?: string | null;
  bytes?: number;
  current?: boolean;
}

/** Id của bản HIỆN HÀNH mà `#39` trả về — đây là `raw/<job>.png`, không phải file lịch sử. */
export const CURRENT_ID = "current";

/**
 * Id file lịch sử thật — dạng `r-<mốc thời gian ms>` (agent/routes/runs.mjs:127).
 *
 * Chú thích này cố ý KHÔNG bọc đường dẫn mẫu trong dấu nháy ngược: bộ quét từ cấm §5.4
 * đọc mọi cụm nháy ngược trên một dòng như một chuỗi, kể cả trong chú thích, nên một
 * đường dẫn mẫu có chữ tiếng Việt bên trong sẽ bị đếm nhầm thành chữ kỹ thuật hiện ra UI.
 */
const RE_HISTORY_ID = /^r-\d+$/;

export interface SheetVersion {
  id: string;
  /** `v1`…`vN` — N là bản MỚI NHẤT. */
  label: string;
  at: string | null;
  bytes: number | null;
  /** Bản đang nằm ở `raw/<job>.png` — thứ mọi bước sau (cắt, xuất) đang dùng. */
  current: boolean;
  /**
   * Bấm "Khôi phục bản này" có nghĩa hay không.
   *
   * ╔══ HAI CA PHẢI CHẶN, VÀ CẢ HAI ĐỀU TỪ CODE CỦA AGENT ══════════════════╗
   * ║ ① `current` — `#40` đi tìm `.history/raw/<job>@current.png`, file đó   ║
   * ║   KHÔNG BAO GIỜ tồn tại ⇒ 404 NOT_FOUND. Khôi phục bản đang dùng về    ║
   * ║   chính nó cũng chẳng có nghĩa gì.                                     ║
   * ║ ② id lạ — `#40` chạy `assertMatch(RE_RUN_ID, historyId)` ⇒ 400. Agent  ║
   * ║   đời sau có thể thêm dạng id khác (`restore-<ms>` đã được chính nó ghi ║
   * ║   ra khi sao lưu trước lúc ghi đè); nút phải im với thứ nó chưa hiểu   ║
   * ║   thay vì bắn một request chắc chắn hỏng.                             ║
   * ╚═══════════════════════════════════════════════════════════════════════╝
   */
  restorable: boolean;
}

/**
 * Đánh số các đời ảnh.
 *
 * `#39` trả về **mới nhất trước** (`items.sort` giảm dần theo `at`, runs.mjs:138), nên
 * chỉ số 0 là bản mới nhất và phải mang số v LỚN NHẤT. Đánh số xuôi theo mảng là
 * cách gọi "v1" cho bản vừa gen — ngược hẳn nghĩa thông thường, và người dùng sẽ
 * khôi phục nhầm đúng thứ họ vừa tạo ra.
 *
 * Giữ nguyên thứ tự mảng (mới → cũ) để dropdown mở ra là thấy bản mới nhất trên cùng.
 */
export function sheetVersions(items: readonly RawHistoryEntry[] | undefined | null): SheetVersion[] {
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  return list.map((item, i) => {
    const id = String(item.id ?? "");
    const current = item.current === true || id === CURRENT_ID;
    return {
      id,
      label: `v${total - i}`,
      at: typeof item.at === "string" ? item.at : null,
      bytes: typeof item.bytes === "number" ? item.bytes : null,
      current,
      restorable: !current && RE_HISTORY_ID.test(id),
    };
  });
}

/** Bản đang nằm ở `raw/<job>.png`; không có thì `null` (tấm chưa gen bao giờ). */
export function currentVersion(versions: readonly SheetVersion[]): SheetVersion | null {
  return versions.find((v) => v.current) ?? null;
}

/**
 * Câu hỏi của hộp xác nhận. Viết ở đây (không nhét trong JSX) vì đây là LỜI HỨA với
 * người dùng về việc gì sắp xảy ra, và nó phải khớp đúng thứ agent làm:
 * ghi đè `raw/<job>.png` — tức mọi bước sau (cắt, xuất, copy) đổi theo.
 */
export function restoreWarning(version: SheetVersion): string {
  return `Khôi phục ${version.label} sẽ GHI ĐÈ ảnh gốc đang dùng của tấm này. `
    + "Bản đang dùng được cất vào lịch sử trước khi ghi đè, nhưng ô đã cắt thì phải cắt lại mới khớp.";
}
