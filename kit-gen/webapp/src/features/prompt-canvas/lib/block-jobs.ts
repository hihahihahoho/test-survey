import { MAIN_VARIANT_ID } from "@/features/kit-core/lib/kitset-to-contract";
import type { Sheet } from "@/lib/types/contract";
import type { BlockSheets } from "./composer-to-contract";

/**
 * block-jobs.ts — TÊN CỦA MỘT TẤM Ở BA TẦNG, khai đúng MỘT lần.
 *
 * ╔══ BA CHUỖI KHÁC NHAU CHO CÙNG MỘT TẤM ═══════════════════════════════════╗
 * ║  · `sheet.id`  — `nen`, `ui2`, `nhan-vat` (trong contract);               ║
 * ║  · `job`       — `chinh-nen` (`agent/lib/contract.mjs:25` ghép            ║
 * ║                  `${variant.id}-${sheet.id}`), thứ POST /runs nhận;       ║
 * ║  · đường ảnh   — `raw/chinh-nen.png`, thứ `GET /files/<path>` phục vụ.    ║
 * ║ Ghép tay ở mỗi chỗ cần là ba nơi để sai một dấu gạch — và cái sai ấy chỉ   ║
 * ║ lộ ra bằng `UNKNOWN_JOB` (nếu may) hoặc một ô ảnh trống (nếu không).      ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * `MAIN_VARIANT_ID` là hằng, không phải tham số: `composerToContract` sinh ĐÚNG
 * một variant và luôn là id đó. Ngày nào composer có nhiều phong cách, chỗ phải
 * sửa là đây — và `tsc` sẽ chỉ ra mọi nơi gọi.
 */

/** `nen` → `chinh-nen`. */
export function jobIdOf(sheetId: string): string {
  return `${MAIN_VARIANT_ID}-${sheetId}`;
}

/**
 * `nen` → `raw/chinh-nen.png` — ảnh THÔ nguyên tấm, chưa cắt.
 *
 * Đây là quy ước của agent (`raw/<job>.png`), cùng đường mà `RawSheetsPanel` đọc
 * qua `job.artifact.path`. Hàm này là ĐƯỜNG LÙI cho lúc chưa có `run` trong tay;
 * có artifact thật thì luôn dùng artifact — xem `SheetResultSlot`.
 */
export function rawPathOf(sheetId: string): string {
  return `raw/${jobIdOf(sheetId)}.png`;
}

/**
 * VÂN TAY của mấy tấm — khoá cache cho tab "Prompt".
 *
 * Cả tấm được đưa vào chứ không chỉ id: người dùng đổi một pill thì id tấm y
 * nguyên nhưng prompt đổi hẳn. `JSON.stringify` là đủ và ĐÚNG ở đây vì mấy tấm
 * này vừa được `composerToContract` dựng ra theo một thứ tự khoá cố định — không
 * có chuyện cùng dữ liệu ra hai chuỗi khác nhau như khi băm object tuỳ ý.
 *
 * ╔══ VÌ SAO PHẢI CÓ THAM SỐ THỨ HAI ════════════════════════════════════════╗
 * ║ CON BỌ THẬT: đổi phong cách chung xong, tab Prompt vẫn hiện prompt phong  ║
 * ║ cách CŨ. Vì khoá cache chỉ băm mấy tấm — mà câu phong cách, chủ đề, màu   ║
 * ║ thương hiệu và 8 trục ngữ nghĩa KHÔNG nằm trong tấm nào cả: chúng nằm ở   ║
 * ║ phần mô tả cả bộ kit. Người dùng đổi thứ hiện ra ở ĐẦU mọi prompt mà khoá ║
 * ║ không nhúc nhích ⇒ cache không bao giờ hết hạn, và màn hình nói dối một   ║
 * ║ cách hoàn toàn im lặng.                                                   ║
 * ║ Nên phần ấy đi vào khoá bằng `extra`. Nơi gọi truyền gì thì tuỳ, MIỄN LÀ  ║
 * ║ CẢ HAI CHỖ TRUYỀN CÙNG MỘT THỨ: chỗ hỏi engine và chỗ so "bản đang xem đã ║
 * ║ cũ chưa". Lệch nhau là hoặc không bao giờ hết hạn (như con bọ trên), hoặc ║
 * ║ lúc nào cũng báo cũ — và lời cảnh báo nào cũng kêu thì không ai đọc nữa.  ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * `extra` mặc định rỗng để nơi gọi nào chỉ quan tâm mấy tấm vẫn dùng được một
 * tham số — nhưng ở màn prompt-first thì cả hai nơi gọi đều PHẢI truyền.
 */
export function sheetsHash(sheets: readonly Sheet[], extra = ""): string {
  /* Bọc trong một mảng chứ không nối chuỗi: `extra` là văn bản người dùng gõ, và
     nối thẳng thì một câu phong cách chứa đúng đoạn mở đầu của phần tấm sẽ ra
     cùng một khoá với một tổ hợp khác. Mảng thì `JSON.stringify` tự đóng ngoặc. */
  return JSON.stringify([extra, sheets]);
}

/* ══════════════════════════════════════════════════════════════════════════
   ĐẾM LƯỢT
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * SỐ LƯỢT mà một tập thẻ sẽ tiêu: **một tấm = một lượt gọi máy vẽ = tiền**.
 *
 * ╔══ CON SỐ NÀY PHẢI THẬT, KHÔNG ĐƯỢC LÀ SỐ THẺ ════════════════════════════╗
 * ║ Nút «Vẽ tất cả» in con số này lên mặt nó, và đó là toàn bộ lời cảnh báo    ║
 * ║ trước một hành động tiêu tiền — không có hộp xác nhận nào phía sau. Nên nó ║
 * ║ phải đếm ĐÚNG THỨ SẼ CHẠY: một thẻ Bộ UI 20 món sinh HAI tấm, một thẻ rỗng ║
 * ║ sinh KHÔNG tấm nào. Đếm số thẻ là nói dối theo cả hai chiều.               ║
 * ║ Nguồn duy nhất của phép chia ấy là `composerBlockSheets` — hàm này chỉ      ║
 * ║ cộng, không tự suy lại luật nào.                                          ║
 * ╚═════════════════════════════════════════════════════════════════════════╝
 *
 * `only` vắng ⇒ đếm cả tài liệu; có ⇒ chỉ đếm mấy thẻ được nêu tên (nút dùng nó
 * để nói "đang vẽ k/N" về đúng lượt bấm của mình, không về cả trang).
 */
export function lotsOf(blocks: readonly BlockSheets[], only?: readonly string[]): number {
  return blocks.reduce(
    (total, block) => (only && !only.includes(block.blockId) ? total : total + block.sheets.length),
    0,
  );
}

/** Thẻ CÓ GÌ ĐỂ VẼ, theo thứ tự trên màn — đúng thứ tự chúng vào hàng đợi. */
export function drawableBlockIds(blocks: readonly BlockSheets[]): string[] {
  return blocks.filter((block) => block.sheets.length > 0).map((block) => block.blockId);
}
