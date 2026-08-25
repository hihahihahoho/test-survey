import { MAIN_VARIANT_ID } from "@/features/kit-core/lib/kitset-to-contract";
import type { Sheet } from "@/lib/types/contract";

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
 */
export function sheetsHash(sheets: readonly Sheet[]): string {
  return JSON.stringify(sheets);
}
