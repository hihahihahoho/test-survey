import type { Contract, Sheet } from "@/lib/types/contract";

/**
 * fingerprint.ts — VÂN TAY CỦA MỘT TẤM: *"tấm này có còn đúng là tấm đã vẽ không"*.
 *
 * ╔══ VÌ SAO CẦN NÓ (chủ sản phẩm, 14/09/2026) ══════════════════════════════╗
 * ║ *«mỗi kiểu nếu tràn 2 sheet thì tách ra … như thế khi gen ảnh lại đỡ phải ║
 * ║ gen lại cả 2 cái»*. Một thẻ 6 món chia làm hai tấm; sửa một dòng ở tấm 2  ║
 * ║ rồi bấm Vẽ thì bản trước vẽ LẠI CẢ HAI — tấm 1 mất một lượt tạo để nhận   ║
 * ║ về một bức ảnh KHÁC (máy vẽ không tất định) cho một mô tả KHÔNG ĐỔI. Tiêu ║
 * ║ tiền để làm hỏng một kết quả đang đúng.                                  ║
 * ║ Vân tay là câu trả lời: nó băm đúng những thứ ĐI VÀO PROMPT của tấm ấy;   ║
 * ║ agent giữ vân tay cạnh ảnh, và tấm nào vân tay trùng thì lượt Vẽ BỎ QUA.  ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ NÓ GỒM ĐÚNG BA PHẦN, VÀ BA PHẦN ẤY LÀ ĐỦ ═══════════════════════════════
 *  ① CẢ MỤC CONTRACT CỦA TẤM — id, lưới, từng ô (`spec`, `skel`, `out`), câu chỉ
 *    đạo, và đường dẫn MỌI ảnh đính kèm (`ref` · `poseRef` · `layoutRef`);
 *  ② PHẦN MÔ TẢ CẢ BỘ KIT — `variant.style` (câu `gen.sh` đặt ở ĐẦU mọi prompt),
 *    bộ màu + logo thương hiệu, ảnh cảm hứng, danh sách dáng của nhân vật;
 *  ③ đời của chính phép băm (`fp1`), để ngày nào luật băm đổi thì mọi tấm cũ
 *    đều "khác" — thà vẽ lại một lượt thừa còn hơn giữ một tấm mà ta không còn
 *    đo được nữa.
 *
 * ══ VÌ SAO ĐƯỜNG DẪN ẢNH LÀ ĐỦ, KHÔNG CẦN BĂM BYTES ════════════════════════
 * `pickRefName` của agent (`routes/refs.mjs`) KHÔNG BAO GIỜ ghi đè một tên đã có
 * — tải lên lần nữa là `…-2.png`. Nên một `refs/<tên>` là một nội dung, vĩnh viễn;
 * ảnh đổi thì đường dẫn đổi theo và vân tay thấy ngay. Băm bytes ở web thì phải
 * tải cả tấm ảnh về trong một hàm THUẦN và ĐỒNG BỘ — thứ hàm này không làm được.
 *
 * ══ VÌ SAO KHÔNG PHẢI SHA-256 ══════════════════════════════════════════════
 * `crypto.subtle` là BẤT ĐỒNG BỘ, mà `composerToContract` được gọi ở mỗi nhịp
 * render. Đây cũng không phải chữ ký chống giả mạo: hai đầu đều là máy người
 * dùng, thứ cần là "đổi thì khác nhau". 64 bit (hai vòng FNV-1a độc lập) cho xác
 * suất trùng cỡ 1e-19 trên một dự án vài chục tấm — nhỏ hơn hẳn rủi ro của bất kỳ
 * đường nào khác trong chuỗi này.
 */

/** Đời phép băm. ĐỔI LUẬT THÌ ĐỔI CHUỖI NÀY — xem ③ ở khối trên. */
export const FINGERPRINT_VERSION = "fp1";

/**
 * Băm một chuỗi thành 16 ký tự hex. Hai vòng FNV-1a với hằng nhân khác nhau: một
 * vòng 32 bit đứng một mình có sinh nhật ~77k chuỗi, quá gần với đời thật của một
 * dự án nhiều lượt sửa.
 */
export function stableHash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0xcbf29ce4;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x85ebca6b);
    b = (b ^ (b >>> 13)) >>> 0;
  }
  return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}

/**
 * PHẦN MÔ TẢ CẢ BỘ KIT, dạng chuỗi — nửa thứ hai của mọi vân tay.
 *
 * `vi` (tên bộ kit) và `id` CỐ Ý ĐỨNG NGOÀI: đổi tên dự án không đổi một chữ nào
 * trong prompt, mà đưa nó vào đây thì một lần đổi tên là một lượt vẽ lại toàn bộ.
 */
export function kitKeyOf(variant: NonNullable<Contract["variants"]>[number] | undefined): string {
  if (!variant) return "";
  return JSON.stringify([
    variant.style ?? "",
    variant.styleMode ?? "",
    variant.brand ?? null,
    variant.characters ?? null,
    variant.inspo ?? null,
  ]);
}

/**
 * Vân tay của MỘT tấm trong ngữ cảnh một bộ kit.
 *
 * `fingerprint` cũ bị bóc ra trước khi băm: hàm phải TỰ LẶP LẠI ĐƯỢC — băm một tấm
 * đã đóng dấu phải ra đúng con dấu ấy, nếu không thì một lượt dịch contract thứ hai
 * trên cùng dữ liệu sẽ sinh ra một vân tay khác và mọi tấm đều "đã đổi".
 */
export function sheetFingerprint(sheet: Sheet, kitKey: string): string {
  const { fingerprint: _drop, ...rest } = sheet as Sheet & { fingerprint?: string };
  return `${FINGERPRINT_VERSION}-${stableHash(JSON.stringify([FINGERPRINT_VERSION, kitKey, rest]))}`;
}

/**
 * Đóng dấu vân tay cho mọi tấm của một contract.
 *
 * Chạy SAU `contractSchema.parse` có chủ ý: sau khi parse, thứ tự khoá của một tấm
 * là thứ tự SCHEMA — cố định — chứ không phải thứ tự mà nhánh dựng nào đó tình cờ
 * gán. Cùng dữ liệu, khác đường dựng, vẫn ra một vân tay.
 */
export function stampFingerprints(contract: Contract): Contract {
  const kit = kitKeyOf(contract.variants?.[0]);
  return {
    ...contract,
    sheets: (contract.sheets ?? []).map((sheet) => ({ ...sheet, fingerprint: sheetFingerprint(sheet, kit) })),
  };
}
