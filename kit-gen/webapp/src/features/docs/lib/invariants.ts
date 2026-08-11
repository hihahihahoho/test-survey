/**
 * features/docs/lib/invariants.ts — BẤT BIẾN GIỮA FILE CON VÀ CONTRACT (UI-SPEC-V2 §4.5).
 *
 * Bất biến phải test: với mọi file con, `∪ view.sheetIds ⊆ contract.sheets[].id`.
 * Sheet không thuộc file nào → hiện trong file hệ thống ảo «Tất cả sheet».
 * **Không bao giờ có sheet "tàng hình".**
 *
 * QUYẾT ĐỊNH QUAN TRỌNG — SHEET BIẾN MẤT KHỎI CONTRACT THÌ **KHÔNG NÉM LỖI**:
 * contract là nguồn sự thật và nó đổi liên tục (VERDICT §1.3 đo được 20/46 lượt mồ côi vì
 * contract bị tái cấu trúc). Nếu tầng này ném lỗi thì một lần user xoá sheet là mọi file con
 * trỏ tới nó chết theo — đúng kiểu hỏng mà §2.8 "mất liên kết" lập ra để chống.
 * ⇒ Ta **lọc ra `staleSheetIds`** và trả về, để UI hiện huy hiệu `mất liên kết` cho user tự xử.
 * Frame/doc mồ côi KHÔNG BAO GIỜ tự xoá.
 */
import { ALL_SHEETS_DOC_ID, ALL_SHEETS_DOC_NAME, type Doc, type DocView } from "./types";

export interface ReconcileResult {
  /** id sheet trong file con nhưng KHÔNG còn trong contract ⇒ hiện "mất liên kết". */
  staleSheetIds: string[];
  /** bộ lọc đã lọc sạch, dùng để render — luôn ⊆ contract.sheets[].id. */
  view: DocView;
}

/** Đối chiếu bộ lọc của MỘT file con với danh sách sheet hiện có của contract. */
export function reconcileView(
  view: DocView | undefined,
  contractSheetIds: readonly string[],
): ReconcileResult {
  const known = new Set(contractSheetIds);
  const sheetIds = view?.sheetIds ?? [];
  return {
    staleSheetIds: sheetIds.filter((id) => !known.has(id)),
    view: {
      sheetIds: sheetIds.filter((id) => known.has(id)),
      variantIds: view?.variantIds ?? [],
    },
  };
}

/** Sheet không nằm trong bất kỳ file con nào (chỉ tính file chưa vào thùng rác). */
export function orphanSheetIds(
  docs: readonly Doc[],
  contractSheetIds: readonly string[],
): string[] {
  const covered = new Set<string>();
  for (const d of docs) {
    if (d.trashedAt) continue;
    for (const id of d.view?.sheetIds ?? []) covered.add(id);
  }
  return contractSheetIds.filter((id) => !covered.has(id));
}

/**
 * File workflow ẢO «Tất cả sheet» — luôn tồn tại, luôn thấy MỌI sheet, không lưu, không xoá.
 * Đây là bảo hiểm cho bất biến "không có sheet tàng hình": kể cả khi mọi file con đều lọc
 * hẹp, vẫn còn đúng một chỗ nhìn thấy toàn bộ.
 */
export function virtualAllSheetsDoc(contractSheetIds: readonly string[], now: string): Doc {
  return {
    id: ALL_SHEETS_DOC_ID,
    name: ALL_SHEETS_DOC_NAME,
    kind: "workflow",
    createdAt: now,
    updatedAt: now,
    color: "none",
    view: { sheetIds: [...contractSheetIds], variantIds: [] },
    trashedAt: null,
  };
}

/** Bất biến tổng: đúng thì mọi sheet đều nhìn thấy được ở ít nhất một file (kể cả file ảo). */
export function everySheetVisible(
  docs: readonly Doc[],
  contractSheetIds: readonly string[],
): boolean {
  const all = [...docs, virtualAllSheetsDoc(contractSheetIds, "")];
  return orphanSheetIds(all, contractSheetIds).length === 0;
}
