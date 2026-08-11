/**
 * features/design/lib/ops-derive.ts — SỐ LIỆU DẪN XUẤT từ contract.
 *
 * Tách khỏi `ops.ts` (biến đổi dữ liệu) để mỗi file dưới ~400 dòng: đây là những hàm
 * chỉ ĐỌC và ĐẾM, không sinh `Op`. Chúng phải khớp `contractJobs()` của agent —
 * `__tests__/ops.test.ts` đối chiếu hai cách đếm với nhau trên dữ liệu thật.
 */
import { contractVariants, sheetVariantFilter, type Contract, type Sheet } from "@/lib/types/contract";
import { realCount } from "./ops";

/** Số lượt sinh ảnh của một sheet = số phong cách áp lên nó. */
export function jobCountOfSheet(c: Contract, sh: Sheet): number {
  const only = sheetVariantFilter(sh);
  const all = contractVariants(c);
  return only.length === 0 ? all.length : all.filter((v) => only.includes(v.id)).length;
}

/** Số lượt sinh ảnh của một phong cách = số sheet nó áp lên. */
export function jobCountOfVariant(c: Contract, variantId: string): number {
  return c.sheets.filter((sh) => {
    const only = sheetVariantFilter(sh);
    return only.length === 0 || only.includes(variantId);
  }).length;
}

export function countRealComponents(c: Contract): number {
  return c.sheets.reduce((n, s) => n + realCount(s), 0);
}
