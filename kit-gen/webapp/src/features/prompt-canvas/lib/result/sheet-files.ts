/**
 * features/prompt-canvas/lib/result/sheet-files.ts
 * ────────────────────────────────────────────────────────────────────────────
 * ĐƯỜNG DẪN + LỌC Ô cho panel kết quả dưới chân mỗi block của Prompt Canvas.
 *
 * Phần THUẦN của panel: không chạm DOM, không gọi mạng, nên kiểm được bằng số
 * thật. Mọi thứ ở đây chỉ trả về **đường dẫn tương đối trong project** — đúng thứ
 * `#41 GET /api/projects/:id/files/*` nhận. Việc bọc thêm `/api/.../files/` là
 * của `features/kit/lib/image-source.ts:filePath`, KHÔNG lặp lại ở đây (ghép hai
 * lần là bug 400 PATH_ESCAPE mà `features/kit/lib/download.ts` đã kể lại).
 */
import type { KitFile } from "@/lib/types";

/**
 * ẢNH GỐC CỦA MỘT TẤM — hai nguồn, hai ý nghĩa KHÁC NHAU.
 *
 * ╔══ VÌ SAO KHÔNG CHỈ DÙNG `raw/` ═══════════════════════════════════════════╗
 * ║ `raw/<job>.png` là ảnh **hiện hành**: mỗi lượt gen lại ghi đè, và nút      ║
 * ║ "Khôi phục bản này" cũng ghi đè chính nó (agent/routes/runs.mjs:145-161).  ║
 * ║ Nghĩa là nó KHÔNG neo được vào một phiên bản: mở lại panel sau một lượt    ║
 * ║ gen khác thì ảnh đã là ảnh khác mà không có gì báo.                        ║
 * ║ `runs/<runId>/artifacts/<job>.png` thì BẤT BIẾN — agent chép sang đó lúc   ║
 * ║ kết lượt và không ai ghi đè. Có `runId` ⇒ dùng nó; không có ⇒ `raw/`.      ║
 * ║ Cả hai đều nằm trong `READABLE_TOP` của `agent/routes/files.mjs` nên đọc   ║
 * ║ được như nhau.                                                            ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export function rawSheetImagePath(job: string, runId?: string | null): string {
  const safeJob = String(job).trim();
  /* Câu lỗi nói bằng tiếng Việt, không mượn tên khoá kỹ thuật: câu này CÓ THỂ tới mắt
     người dùng qua toast lỗi, và cổng từ cấm §5.4 đọc đúng như vậy. */
  if (safeJob === "") throw new Error("thiếu tên lượt vẽ của tấm — không dựng được đường ảnh gốc");
  const run = typeof runId === "string" ? runId.trim() : "";
  return run === "" ? `raw/${safeJob}.png` : `runs/${run}/artifacts/${safeJob}.png`;
}

/* `skeletonImagePath()` ĐÃ BỎ. Nó dựng đường tới `skeleton/<sheetId>.png` — ảnh
   khung xương mà engine từng gửi kèm prompt. Engine thôi dựng ảnh ấy (vùng an
   toàn nay vào prompt bằng toạ độ số), nên hàm này chỉ còn dựng được đường tới
   một file không bao giờ tồn tại. Giữ lại là để dành một cái bẫy: agent VẪN mở
   thư mục `skeleton` cho phép đọc (`routes/files.mjs`), nên lượt xin sẽ không
   nổ ngay — nó chỉ trả về 404 ở một chỗ xa nơi gây ra lỗi. */

/** Tên ô đã bỏ tiền tố thư mục: `tight/01-btn` → `01-btn`. */
export function cellName(file: KitFile): string {
  const raw = String(file.file ?? "");
  return raw.slice(raw.lastIndexOf("/") + 1);
}

const isTight = (file: KitFile): boolean => String(file.file ?? "").startsWith("tight/");

/**
 * Ô ĐÃ CẮT CỦA ĐÚNG MỘT TẤM — nguồn của tab «Đã crop».
 *
 * Ba việc, đều bắt buộc, và đều lấy từ bài học của `CutAssetGrid.cutAssets`:
 *  ① **Lọc theo `file.sheet`** — `#42 GET …/kit` trả CẢ BỘ KIT (mọi tấm). Panel này
 *    nằm dưới chân MỘT block nên hiện nhầm ô của tấm khác là nói dối về chỗ đứng.
 *    Không dò contract ở đây: block đã biết `sheetId` của chính nó, không cần đoán.
 *  ② **Ưu tiên bản `tight/`** — `slice.py:950-953` ghi HAI file cho mỗi ô (bản canvas
 *    còn đệm bleed và bản `tight/` ôm sát ruột). Giữ cả hai thì mỗi ô hiện hai lần.
 *  ③ **Bỏ ô rỗng** — `empty` và các file `_empty*` là chỗ trống của lưới, không phải
 *    thành phẩm; đếm chúng vào là báo sai số ô cắt được.
 *
 * Thứ tự: theo `cellIndex` (đúng thứ tự ô trên tấm, khớp số hiện trong `SkeletonPreview`),
 * ô không có `cellIndex` xuống cuối và xếp theo tên — tất định, không phụ thuộc `readdir`.
 */
export function cellsOfSheet(files: readonly KitFile[], sheetId: string): KitFile[] {
  const id = String(sheetId ?? "");
  const mine = files.filter(
    (f) => String(f.sheet ?? "") === id && f.empty !== true && !cellName(f).startsWith("_empty"),
  );
  const tightNames = new Set(mine.filter(isTight).map(cellName));
  const picked = mine.filter((f) => isTight(f) || !tightNames.has(cellName(f)));
  const order = (f: KitFile): number =>
    typeof f.cellIndex === "number" && Number.isFinite(f.cellIndex) ? f.cellIndex : Number.MAX_SAFE_INTEGER;
  return [...picked].sort((a, b) => order(a) - order(b) || cellName(a).localeCompare(cellName(b)));
}

/** Tên file gợi ý khi tải nguyên tấm về máy (agent vẫn được quyền đặt tên khác). */
export function sheetDownloadName(job: string): string {
  return `${String(job).trim() || "sheet"}.png`;
}
