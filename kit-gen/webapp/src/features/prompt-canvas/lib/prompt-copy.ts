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
