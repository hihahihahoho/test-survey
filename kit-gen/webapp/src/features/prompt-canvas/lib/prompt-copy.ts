/**
 * prompt-copy.ts — COPY PROMPT **KÈM ẢNH** vào bộ nhớ tạm.
 *
 * ╔══ VÌ SAO CHỮ KHÔNG CÒN ĐỦ ═══════════════════════════════════════════════╗
 * ║ Chủ sản phẩm: *"copy prompt sẽ là copy bao gồm cả ảnh vào clipboard"*.     ║
 * ║ Câu ấy đúng về mặt kỹ thuật chứ không phải một mong muốn xa xỉ: prompt của ║
 * ║ một tấm KHÔNG TỰ ĐỨNG ĐƯỢC — engine gửi kèm ảnh khung xương (`skeleton/`)  ║
 * ║ và ảnh mẫu (`refs/`), và mọi câu "ô thứ 3 hàng 2" trong prompt đều trỏ vào ║
 * ║ tấm khung xương ấy. Dán mỗi chữ sang ChatGPT là dán một nửa hợp đồng.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ MỘT `ClipboardItem`, NHIỀU MIME — VÀ VÌ SAO CHỈ MỘT ẢNH ════════════════
 * Chrome nhận đúng MỘT item trong một lượt `write()`, nhưng một item mang được
 * NHIỀU kiểu dữ liệu. Nên: `{ "text/plain": prompt, "image/png": ảnh đầu }` —
 * dán vào chỗ nhận chữ thì ra chữ, dán vào chỗ nhận ảnh thì ra ảnh. Ảnh thứ hai
 * trở đi KHÔNG nhét vào được, và cũng không nên im lặng bỏ: hàm trả về số ảnh
 * còn lại để UI mọc ra nút «Copy ảnh N» cho từng cái.
 *
 * ══ LUẬT: KHÔNG BAO GIỜ BÁO "ĐÃ COPY" KHI CHƯA COPY ĐƯỢC ═══════════════════
 * Cùng luật với `result-copy.ts` và `figma-board.ts`. Trình duyệt không có
 * `ClipboardItem`, hoặc ảnh tải hụt, thì ta lùi về CHỮ KHÔNG (`text-only`) và
 * NÓI RA lý do — chứ không dựng một cái toast xanh cho một việc chưa xảy ra.
 */
import { loadFull } from "@/features/kit/lib/image-source";

/**
 * PROMPT ĐỦ CỦA MỘT TẤM — thứ ĐI VÀO BỘ NHỚ TẠM khi bấm Copy.
 *
 * ╔══ VÌ SAO CÓ MỘT PHÉP KIỂM "ĐÃ CÓ CHƯA" THAY VÌ CỨ NỐI VÀO ═══════════════╗
 * ║ Engine ĐANG được sửa để tự đặt prompt tổng ở đầu prompt mỗi tấm. Trong    ║
 * ║ khoảng giao thời, hai bản engine cùng tồn tại trên máy người dùng: bản    ║
 * ║ mới đã có câu ấy, bản cũ chưa. Cứ nối vào thì bản mới ra prompt nói HAI   ║
 * ║ LẦN cùng một mệnh đề phong cách — và nhắc lại một chỉ thị là cách chắc    ║
 * ║ chắn để máy vẽ đè nó lên mọi thứ khác. Cứ KHÔNG nối thì bản cũ ra một     ║
 * ║ prompt không có phong cách nào, đúng thứ chủ sản phẩm vừa than.           ║
 * ║ Nên: hỏi trước. Có rồi thì để nguyên (chữ của engine là chữ thật), chưa   ║
 * ║ có thì nối lên đầu.                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export function fullPromptText(styleLine: string, prompt: string): string {
  const style = styleLine.trim();
  if (!style) return prompt;
  /* So bằng MỘT MẨU ĐẦU chứ không cả câu: engine có quyền xuống dòng hay chèn dấu
     câu quanh nó, và một phép so nguyên văn sẽ trượt vì đúng một ký tự. 40 ký tự
     đủ dài để không đụng nhầm một câu khác trong prompt. */
  const probe = style.slice(0, 40);
  return prompt.includes(probe) ? prompt : `${style}\n\n${prompt}`;
}


/** Kết quả một lượt copy. `reason` chỉ có mặt khi phải lùi bước — và phải hiện ra. */
export interface PromptCopyResult {
  /** `"text+image"` = chữ và ảnh cùng vào; `"text"` = chỉ chữ. */
  outcome: "text+image" | "text";
  /** Ảnh KHÔNG kèm được vào lượt này (ảnh thứ hai trở đi). Số, không phải cờ. */
  remainingImages: number;
  reason?: string;
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

/** Trình duyệt này có ghi được cả ảnh lẫn chữ trong một lượt không. */
export function canCopyImage(): boolean {
  return typeof ClipboardItem === "function" && typeof navigator !== "undefined" && Boolean(navigator.clipboard?.write);
}

/**
 * Copy `text` (+ ảnh đầu tiên trong `imagePaths`) vào bộ nhớ tạm.
 *
 * `imagePaths` rỗng ⇒ vẫn đi đường `ClipboardItem` một-MIME nếu có, và rơi về
 * `writeText` nếu không. Hai đường đều kết thúc bằng "chữ đã vào bộ nhớ tạm" —
 * ném ra ngoài chỉ khi tới cả chữ cũng không copy nổi, vì lúc đó nút vừa bấm
 * KHÔNG làm gì cả và người dùng phải biết điều đó.
 */
export async function copyPromptWithImage(
  projectId: string,
  text: string,
  imagePaths: readonly string[],
): Promise<PromptCopyResult> {
  const remaining = Math.max(0, imagePaths.length - 1);
  const first = imagePaths[0];

  if (!canCopyImage()) {
    await navigator.clipboard.writeText(text);
    return {
      outcome: "text",
      remainingImages: imagePaths.length,
      ...(imagePaths.length > 0
        ? { reason: "Trình duyệt này không cho ghi ảnh vào bộ nhớ tạm — mới copy được phần chữ." }
        : {}),
    };
  }

  if (!first) {
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }) })]);
    return { outcome: "text", remainingImages: 0 };
  }

  try {
    const png = await fetchProjectImage(projectId, first);
    /* MỘT item, HAI kiểu — xem khối chú thích đầu file. `text/plain` phải là Blob
       chứ không phải chuỗi ở một số bản Safari, và Blob thì bản nào cũng nhận. */
    await navigator.clipboard.write([
      new ClipboardItem({ "text/plain": new Blob([text], { type: "text/plain" }), "image/png": png }),
    ]);
    return { outcome: "text+image", remainingImages: remaining };
  } catch (error) {
    /* Ảnh hụt KHÔNG được kéo theo cả phần chữ: chữ là thứ người dùng cần nhất, và
       nó luôn copy được. Lùi một nấc, giữ nguyên phần lấy được, nói ra phần mất. */
    await navigator.clipboard.writeText(text);
    return {
      outcome: "text",
      remainingImages: imagePaths.length,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Copy MỘT ảnh lẻ — nút «Copy ảnh N» của những ảnh không kèm vào lượt trên.
 *
 * Tách khỏi `copyImageBlob` của `result-copy.ts` ở đúng một điểm: ở đó ảnh đã nằm
 * sẵn trong tay (object URL của ô kết quả), còn ở đây phải đi lấy theo đường dẫn.
 * Phần ghi bộ nhớ tạm thì dùng lại nguyên — không có bản sao thứ hai của luật ấy.
 */
export async function copyProjectImage(projectId: string, relPath: string): Promise<Blob> {
  return fetchProjectImage(projectId, relPath);
}
