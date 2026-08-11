/**
 * ══════════════════════════════════════════════════════════════════════════════
 * webapp/src/features/design/contracts.ts
 * HỢP ĐỒNG GIỮA 3 NGƯỜI LÀM MÀN S3 — R2-P2 và R2-P3 ĐỌC FILE NÀY TRƯỚC KHI VIẾT.
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Chia việc (theo brief):
 *   features/design/**          R2-P1 (tôi) — khung, cây, lưới ô, panel, CRUD, validate
 *   features/design/safety/**   R2-P2      — undo/redo, nháp IDB, lịch sử, xung đột 409
 *   features/design/library/**  R2-P3      — drawer thư viện element
 *   features/design/preview/**  R2-P3      — preview khung xương
 *
 * BA NGUYÊN TẮC CỦA HỢP ĐỒNG NÀY
 *
 * 1. KHÔNG AI PHẢI SỬA FILE CỦA AI. Màn nạp `safety/` và `library/` bằng
 *    `import.meta.glob` (xem `slots.tsx`) — CHƯA CÓ FILE thì màn vẫn chạy đủ
 *    tính năng cốt lõi với bản tạm, KHÔNG gãy build. Đây là đúng cách mà
 *    `components/layout/lazy-screen.tsx` của R1 đã chốt cho 9 màn.
 *
 * 2. MỌI THAY ĐỔI CONTRACT ĐI QUA `DesignApi.apply()`. Không ai được gọi
 *    `useEditorStore.setState({ draft })` thẳng: `apply()` là chỗ duy nhất đẩy
 *    bước undo có NHÃN (§3.7) và bật dấu bẩn. Ghi thẳng = mất một bước undo,
 *    và không ai truy ra được vì sao.
 *
 * 3. KHÔNG COMPONENT NÀO FETCH TRỰC TIẾP. Dùng hook trong `@/lib/hooks`.
 *
 * Bản nháp/undo/lịch sử là việc của R2-P2, nhưng ĐIỂM MÓC đã có sẵn ở đây để
 * hai bên không phải chờ nhau.
 */
import type * as React from "react";
import type { Component, Contract, Sheet, Variant } from "@/lib/types/contract";
import type { Selection } from "@/lib/store";
import type { Op } from "./lib/ops";
import type { Finding, Target, ValidationResult } from "./lib/validate";

export type { Op, Finding, Target, ValidationResult };

/* ═══════════════════════ API mà màn S3 mở ra cho đồng đội ═══════════════════ */

export interface DesignApi {
  projectId: string;

  /** Bản đang sửa. `null` = chưa nạp xong. ĐỪNG sửa tại chỗ. */
  contract: Contract | null;
  /** Version của bản trên đĩa lúc nạp — `If-Match` khi lưu (#23). */
  baseVersion: number;
  dirty: boolean;
  /** Số thao tác kể từ lần lưu cuối — nút hiện "Lưu (3)". */
  dirtyCount: number;
  /** Agent chưa chạy / lỗi kết nối ⇒ mọi nút ghi bị khoá, KÈM `readOnlyReason`. */
  readOnly: boolean;
  readOnlyReason: string;

  /**
   * ĐƯỜNG DUY NHẤT sửa contract.
   * `op.label` rỗng ⇒ bỏ qua (không đẩy bước undo rỗng).
   * Ví dụ: `api.apply(addElements(api.contract!, sheetId, picked))`
   */
  apply: (op: Op) => void;
  /** Nạp đè toàn bộ (khôi phục nháp / khôi phục lịch sử). `markDirty=false` khi
   *  nội dung ĐÚNG BẰNG bản trên đĩa. */
  replaceContract: (contract: Contract, opts?: { label?: string; markDirty?: boolean; version?: number }) => void;

  selection: Selection;
  select: (s: Selection) => void;
  /** Sheet đang mở ở canvas ② (null khi project chưa có sheet nào). */
  activeSheetId: string | null;
  setActiveSheet: (sheetId: string) => void;

  /** Kết quả validate hiện hành — dùng `issuesFor()` để lấy lỗi của một field. */
  validation: ValidationResult;
  /** Nhảy con trỏ tới chỗ sai (thanh Validate và drawer đều dùng). */
  goToTarget: (t: Target) => void;

  /** Lưu (⌘S). Bị chặn khi còn lỗi hoặc `readOnly`. Trả true nếu ĐÃ gửi đi. */
  save: () => Promise<boolean>;
  saving: boolean;

  tab: "sheets" | "styles" | "advanced";
  setTab: (t: "sheets" | "styles" | "advanced") => void;
}

/* ═══════════════ R2-P3 · DRAWER THƯ VIỆN ELEMENT (`library/`) ═══════════════ */

/**
 * File cần nộp: `features/design/library/ElementLibraryDrawer.tsx`
 * Export:      `export function ElementLibraryDrawer(props: ElementLibraryDrawerProps)`
 *              (nhận cả `export default`).
 *
 * Màn tự lo: nút mở drawer, phím `⌘L`, lệnh ⌘K, và việc GHI element vào contract.
 * Drawer chỉ cần gọi `onAdd(...)` rồi tự đóng — KHÔNG tự gọi `api.apply()`, để
 * nhãn undo và luật "điền ô trống trước, hết chỗ thì nới lưới" nằm một chỗ.
 */
export interface ElementLibraryDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Sheet đang mở — đích mặc định của nút [Thêm N element]. */
  targetSheetId: string | null;
  /** Tên sheet cho câu "thêm vào sheet «main» (còn 1 ô)". */
  targetSheetLabel: string | null;
  /** Số ô trống còn lại ở sheet đích (drawer hiện "còn N ô"). */
  freeSlots: number;
  /** File đã có trong sheet đích ⇒ drawer đánh dấu "● đã có trong sheet". */
  existingFiles: readonly string[];
  /** Agent chưa chạy: catalogue vẫn xem được, nút [Thêm] khoá kèm lý do. */
  readOnly: boolean;
  readOnlyReason: string;
  /**
   * Thêm vào sheet ĐANG MỞ. Màn lo chọn ô trống / nới lưới / đặt tên file hợp lệ.
   * `toNewSheet: true` ⇒ tạo sheet mới thay vì chèn vào sheet hiện tại.
   */
  onAdd: (elements: readonly Partial<Component>[], opts?: { toNewSheet?: boolean }) => void;
}

export type ElementLibraryDrawerComponent = React.ComponentType<ElementLibraryDrawerProps>;

/* ═══════════════ R2-P2 · AN TOÀN DỮ LIỆU (`safety/`) ═══════════════ */

/**
 * File cần nộp: `features/design/safety/SafetyPanel.tsx`
 * Export:      `export function SafetyPanel(props: SafetyPanelProps)`
 *
 * Chỗ hiển thị: HÀNG TRÊN của thanh lưu, bên trái nút [💾 Lưu] (§3.7). Màn đã
 * dựng sẵn nút [↺ Hoàn tác] [↻ Làm lại] [💾 Lưu] và dấu bẩn `v37 ● 3 thay đổi
 * chưa lưu`; `SafetyPanel` bù 3 thứ CÒN LẠI của X5/§3.7:
 *   · [Lịch sử ▾] → drawer 50 bản lưu + [Xem diff] [Khôi phục]
 *   · banner "Có bản nháp chưa lưu từ 14:32" + [Khôi phục] [Bỏ nháp] [So sánh]
 *   · modal 409 CONTRACT_CONFLICT (so sánh 2 cột, 3 nút)
 *
 * UNDO/REDO trong phiên: đã có ở `useEditorStore` (R0) và màn đã nối phím
 * ⌘Z/⇧⌘Z + nút. R2-P2 KHÔNG cần làm lại, chỉ nâng cấp nếu muốn nhãn tốt hơn.
 *
 * NHÁP IDB: màn KHÔNG tự ghi IDB (tránh hai nơi cùng ghi một khoá). Màn gọi
 * `onDraftTick` mỗi lần contract đổi (đã debounce 2s) — R2-P2 quyết định ghi gì.
 *
 * XUNG ĐỘT 409: màn dùng `useSaveContract()` của R0, hook này đã trả `conflict`.
 * Màn truyền nguyên `conflict` + `resolveConflict` xuống đây; R2-P2 chỉ dựng UI
 * và gọi `onResolved(fresh)` để màn nạp lại editor.
 *
 * `beforeunload` khi bẩn: MÀN đã gắn (một chỗ duy nhất). Đừng gắn lần hai.
 */
export interface SafetyPanelProps {
  api: DesignApi;
  /** Trạng thái 409 lấy từ `useSaveContract()` của R0 (`null` = không xung đột). */
  conflict: ConflictLike | null;
  resolveConflict: (choice: "overwrite" | "reload" | "fork") => Promise<unknown>;
  dismissConflict: () => void;
  /** Sau khi khôi phục/tải lại: đưa contract mới vào editor. */
  onResolved: (contract: Contract, version: number) => void;
}

/** Đúng `ConflictState` của `lib/hooks/use-contract.ts` — khai lại để không phụ thuộc vòng. */
export interface ConflictLike {
  serverVersion: number;
  serverHash: string | null;
  diffSummary: { added: number; removed: number };
  mine: Contract;
  myBaseVersion: number;
}

export type SafetyPanelComponent = React.ComponentType<SafetyPanelProps>;

/**
 * File TUỲ CHỌN thứ hai của R2-P2: `features/design/safety/useDraft.ts`
 *   export function useDraft(opts: UseDraftOptions): UseDraftResult
 * Màn gọi nếu có; không có thì bỏ qua (không có nháp IDB, mọi thứ khác vẫn chạy).
 */
export interface UseDraftOptions {
  projectId: string;
  contract: Contract | null;
  dirty: boolean;
  baseVersion: number;
}
export interface UseDraftResult {
  /** Nháp tìm thấy khi mở màn — màn KHÔNG tự khôi phục, phải hỏi user (§3.7). */
  found: { savedAt: number; contract: Contract; baseVersion: number } | null;
  discard: () => void;
}

/* ═══════════════ R2-P3 · PREVIEW KHUNG XƯƠNG (`preview/`) ═══════════════ */

/**
 * TUỲ CHỌN: `features/design/preview/SheetPreview.tsx`
 *   export function SheetPreview(props: SheetPreviewProps)
 * Chưa có ⇒ màn dùng bản dựng sẵn của mình (`components/CellGrid` + `Silhouette`),
 * nên đây thuần tuý là bản nâng cấp, không phải phụ thuộc.
 *
 * Nếu R2-P3 muốn hiện preview cả sheet ở tab riêng của canvas, dùng props này.
 */
export interface SheetPreviewProps {
  sheet: Sheet;
  /** Phong cách đang xem — để tô màu brand nếu muốn. */
  variant: Variant | null;
  selectedIndex: number | null;
  onSelect: (index: number) => void;
}

/* ═══════════════════════ Tiện ích dùng chung ═══════════════════════ */

/** Ô trống còn lại ở sheet — drawer thư viện hiện "còn N ô". */
export function freeSlotsOf(sheet: Sheet | null | undefined): number {
  return (sheet?.components ?? []).filter((c) => String(c.skel?.shape ?? "") === "empty").length;
}
