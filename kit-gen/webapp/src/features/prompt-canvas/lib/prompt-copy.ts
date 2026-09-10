/**
 * prompt-copy.ts — CHỮ ĐI MỘT ĐƯỜNG, ẢNH ĐI MỘT ĐƯỜNG.
 *
 * ╔══ VÌ SAO BỎ ĐƯỜNG «MỘT ITEM, HAI KIỂU DỮ LIỆU» ══════════════════════════╗
 * ║ Bản trước ghi MỘT `ClipboardItem` mang cả `text/plain` lẫn `image/png`,    ║
 * ║ tin rằng nơi dán sẽ tự chọn kiểu hợp với nó. ChatGPT web KHÔNG làm thế:    ║
 * ║ nó nhận CHỮ và bỏ ảnh — im lặng. Chủ sản phẩm dán xong thì máy trả lời     ║
 * ║ *"Bạn gửi lại ảnh gốc/reference cần dùng vào chat nhé… chưa có ảnh nguồn   ║
 * ║ khả dụng"*, tức là ảnh đã rơi mất mà nút vừa bấm vẫn báo xanh.             ║
 * ║ Một lượt copy hứa hai thứ mà chỉ giao được một thứ là kiểu hỏng tệ nhất:   ║
 * ║ người dùng chỉ phát hiện ra ở đầu bên kia, sau khi đã tốn một lượt hỏi.    ║
 * ║ Nên nay: nút chữ copy CHỮ, và ảnh có đường riêng của nó (copy từng ảnh,    ║
 * ║ hoặc tải về máy rồi kéo vào chat). Hai lời hứa nhỏ mà giữ được, hơn một    ║
 * ║ lời hứa to mà nửa vời.                                                    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ LUẬT: KHÔNG BAO GIỜ BÁO "ĐÃ COPY" KHI CHƯA COPY ĐƯỢC ═══════════════════
 * Cùng luật với `result-copy.ts` và `figma-board.ts`. Ở đây nó thành một phép
 * kiểm trước khi gọi: trình duyệt thiếu `navigator.clipboard` thì NÉM ra chữ
 * người đọc hiểu được, chứ không để `undefined.writeText` ném ra một câu tiếng
 * Anh mà nơi gọi lỡ nuốt mất.
 */
import { loadFull } from "@/features/kit/lib/image-source";

/**
 * ẢNH THAM CHIẾU CỦA MỘT TẤM — danh sách để bày ra và để người dùng dán vào chat.
 *
 * ╔══ VÌ SAO CHỈ LỌC, KHÔNG TỰ GOM LẠI TỪ ĐẦU ═══════════════════════════════╗
 * ║ Thứ tự đính kèm là quyết định của engine, không phải của màn hình:         ║
 * ║ `gen.sh` ghép `ref` → tấm ảnh dáng → ảnh thương hiệu → ảnh gợi hứng, khử   ║
 * ║ trùng, rồi ghi ra `prompts/<job>.att`; agent đọc đúng file đó và trả về    ║
 * ║ nguyên thứ tự ấy trong `attachments` (`routes/contract.mjs`, nhánh         ║
 * ║ prompt-preview). Dựng lại danh sách ở đây từ contract là mở NGUỒN SỰ THẬT  ║
 * ║ THỨ HAI cho cùng một câu hỏi — và hai nguồn ấy sẽ lệch nhau đúng vào ngày  ║
 * ║ engine thêm một vai ảnh mới (đang thêm: ảnh bố cục), vì webapp và engine   ║
 * ║ trên máy người dùng KHÔNG cập nhật cùng nhịp.                             ║
 * ║ Nên hàm này nhận chính `attachments` và chỉ làm hai việc engine đã làm rồi ║
 * ║ nhưng ta không được phép giả định: khử trùng lặp và bỏ ảnh khung xương.    ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÌ SAO BỎ `skeleton/` ═════════════════════════════════════════════════
 * Engine đã thôi gửi ảnh khung xương — vùng an toàn nay đi vào prompt bằng toạ
 * độ số. Nhưng bản engine trên máy người dùng nằm ở một thư mục riêng và cập
 * nhật bằng một lượt riêng, nên trong khoảng giao thời `attachments` vẫn có thể
 * trả về `skeleton/…`. Bày nó ra là bảo người dùng dán vào chat một tấm mà máy
 * vẽ không còn nhận — tốn một lượt hỏi để nhận về một câu hỏi lại.
 * Lọc theo TIỀN TỐ THƯ MỤC vì đó là hợp đồng thật của agent (`routes/files.mjs`
 * chỉ mở đúng vài thư mục, `skeleton` là một trong đó).
 */
export function referenceImages(attachments: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of attachments) {
    const path = raw.trim();
    if (!path || path.startsWith("skeleton/")) continue;
    /* Danh sách này dài nhất là dăm bảy đường dẫn — `includes` rẻ hơn dựng một
       `Set` và giữ được ĐÚNG thứ tự engine đã chọn. */
    if (!out.includes(path)) out.push(path);
  }
  return out;
}

/**
 * Copy CHỮ vào bộ nhớ tạm — cửa duy nhất cho nút «Copy prompt».
 *
 * Ném thay vì trả cờ: nơi gọi phải hiện lỗi, và một hàm trả `false` lặng lẽ là
 * lời mời quên kiểm. Chữ ném ra là chữ tiếng Việt vì nó đi thẳng vào hộp báo lỗi.
 */
export async function copyPromptText(text: string): Promise<void> {
  const clip = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clip?.writeText) throw new Error("Trình duyệt này không cho ghi vào bộ nhớ tạm.");
  await clip.writeText(text);
}

/**
 * Đường dẫn ảnh trong dự án → `Blob` PNG.
 *
 * Đi qua `loadFull` của `image-source` chứ không `fetch` thẳng: agent trả **403**
 * cho mọi request thiếu header `X-KitGen-Client` (đo thật, xem đầu `image-source.ts`),
 * và hàng đợi + cache ở đó cũng là thứ giữ cho một cú bấm không mở 10 kết nối.
 */
export async function fetchProjectImage(projectId: string, relPath: string): Promise<Blob> {
  const url = await loadFull(projectId, relPath).promise;
  /* `url` là một object URL nội bộ — `fetch` ở đây KHÔNG ra mạng, nó chỉ đọc lại
     blob đã nằm trong RAM. Cùng thủ thuật với `result-copy.decode`. */
  const res = await fetch(url);
  return res.blob();
}

/**
 * Copy MỘT ảnh lẻ — nút «Copy ảnh» của từng tấm trong panel ảnh tham chiếu.
 *
 * Tách khỏi `copyImageBlob` của `result-copy.ts` ở đúng một điểm: ở đó ảnh đã nằm
 * sẵn trong tay (object URL của ô kết quả), còn ở đây phải đi lấy theo đường dẫn.
 * Phần ghi bộ nhớ tạm thì dùng lại nguyên — không có bản sao thứ hai của luật ấy.
 */
export async function copyProjectImage(projectId: string, relPath: string): Promise<Blob> {
  return fetchProjectImage(projectId, relPath);
}

/* ══════════════════════════════════════════════════════════════════════════
   COPY MỘT BLOB ẢNH VÀO BỘ NHỚ TẠM — đường lùi là TẢI FILE, và nói ra sự thật
   ══════════════════════════════════════════════════════════════════════════
   08/09/2026 — ba hàm dưới đây đổi nhà từ `kit-core/lib/result-copy.ts`. File cũ
   phục vụ menu ⋯ của màn «Kết quả & xuất kit» (đã bị xoá); phần SỐNG SÓT là đúng
   `copyImageBlob`, thứ `components/CanvasBlock` gọi cho nút «Copy ảnh» của một ô.
   Phần chết đi cùng: `cellRect`/`locateComponent`/`rawSheetPath`/`cropCellBlob`
   (cắt ô từ sheet thô — nay engine cắt, web không cắt nữa) và `blobOfImage`.

   LUẬT GIỮ NGUYÊN, và đây là lý do hàm này không chỉ là một dòng `clipboard.write`:
   clipboard ảnh cần `ClipboardItem` + một cử chỉ người dùng. Không có thì TẢI FILE
   và trả về đúng chuyện đã xảy ra — KHÔNG BAO GIỜ báo "đã copy" khi chưa copy được
   (cùng luật với `features/kit/lib/figma-board.ts`). */

export type CopyOutcome = "clipboard" | "download";

export interface CopyResult {
  outcome: CopyOutcome;
  /** Lý do phải dùng đường lùi — hiện trong toast, không nuốt. */
  reason?: string;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * BỘ NHỚ TẠM CHỈ NHẬN PNG — ảnh JPG phải được vẽ lại thành PNG trước khi ghi.
 *
 * Hiện trường 10/09/2026: bấm «Copy ảnh» trên ảnh nhân vật (JPG) ⇒ Chrome ném
 * "Type image/png does not match the blob's type image/jpeg", rồi đường lùi tải
 * file chạy và toast nói "Đã tải ảnh về máy" kèm nguyên câu lỗi kỹ thuật ấy —
 * người dùng chỉ muốn dán ảnh, không muốn biết MIME là gì. Chromium chỉ cho ghi
 * `image/png` (và `image/svg+xml`) vào clipboard, nên mọi ảnh khác đi qua một
 * canvas: giải mã → vẽ → xuất PNG. Ảnh đã là PNG thì trả về nguyên vẹn, không
 * mất byte nào (tránh nén lại một tấm alpha).
 */
export async function toPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === "image/png") return blob;
  if (typeof createImageBitmap !== "function") {
    throw new Error("Trình duyệt này không chuyển được ảnh sang PNG để copy.");
  }
  const bitmap = await createImageBitmap(blob);
  try {
    if (typeof OffscreenCanvas === "function") {
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Không mở được canvas để chuyển ảnh sang PNG.");
      ctx.drawImage(bitmap, 0, 0);
      return await canvas.convertToBlob({ type: "image/png" });
    }
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Không mở được canvas để chuyển ảnh sang PNG.");
    ctx.drawImage(bitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Không xuất được PNG từ canvas."))), "image/png");
    });
  } finally {
    bitmap.close?.();
  }
}

/** Copy ảnh vào bộ nhớ tạm; hỏng thì tải file và TRẢ VỀ SỰ THẬT đó. */
export async function copyImageBlob(blob: Blob, fileName: string): Promise<CopyResult> {
  try {
    if (typeof ClipboardItem === "function" && navigator.clipboard?.write) {
      const png = await toPngBlob(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      return { outcome: "clipboard" };
    }
    download(blob, fileName);
    return { outcome: "download", reason: "Trình duyệt này không cho ghi ảnh vào bộ nhớ tạm." };
  } catch (e) {
    download(blob, fileName);
    return { outcome: "download", reason: e instanceof Error ? e.message : String(e) };
  }
}
