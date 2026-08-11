/**
 * features/design/safety/types.ts — kiểu dùng chung của lưới an toàn.
 * Tách riêng để `ConflictDialog`/`HistoryDrawer` không phải import ngược lên
 * `SafetyPanel` (vòng import), và để R2-P1 đọc được hình dạng dữ liệu mà không
 * phải mở file component.
 */
import type { Contract } from "@/lib/types";
import type { ContractDiff } from "./diff";

/** Dữ liệu đủ để dựng modal so sánh 2 cột của §3-S3 (error 409). */
export interface ConflictInfo {
  /** version của bản trên đĩa (lớn hơn version ta cầm). */
  serverVersion: number;
  /** version mà user đã cầm khi bắt đầu sửa. */
  myBaseVersion: number;
  /** bản của user — KHÔNG bị mất, để nút [Ghi đè] còn thứ mà ghi. */
  mine: Contract;
  /** bản trên đĩa, nạp thêm sau khi 409 để so được HAI CỘT THẬT. */
  theirs: Contract | null;
  theirsLoading: boolean;
  diff: ContractDiff | null;
}

/** Một bản lưu trong `.history/contract/` (#24). */
export interface HistoryEntryView {
  snapshot: string;
  version: number;
  at: string | null;
  /** "5 sheet · 42 element" — đã dựng sẵn chuỗi để drawer khỏi tự chế. */
  summary: string;
}
