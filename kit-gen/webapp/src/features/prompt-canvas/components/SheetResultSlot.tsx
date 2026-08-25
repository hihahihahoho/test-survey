import type { Sheet } from "@/lib/types/contract";
import { jobIdOf } from "../lib/block-jobs";
import { SheetResultPanel } from "./result";

/**
 * SheetResultSlot — CHỖ CẮM panel kết quả dưới một thẻ của màn soạn.
 *
 * ╔══ MỘT LỚP MỎNG, VÀ NÓ CÓ VIỆC THẬT ══════════════════════════════════════╗
 * ║ Ruột đã là `SheetResultPanel` (ba tab: ảnh gốc · ô đã cắt · khung xương).  ║
 * ║ Lớp này chỉ làm đúng một chuyện mà panel KHÔNG được biết: dịch `sheetId`   ║
 * ║ sang TÊN JOB. Phép ghép ấy (`<variant>-<sheetId>`) là luật của bộ dịch      ║
 * ║ composer → contract, không phải luật của một panel hiển thị — panel nhận    ║
 * ║ `job` từ ngoài đúng như một panel nên làm.                                  ║
 * ║ Nhờ vậy mọi thẻ trên màn chỉ cần biết id tấm của mình, và ngày nào composer ║
 * ║ có nhiều phong cách thì chỗ phải sửa vẫn là `block-jobs.ts`, không phải     ║
 * ║ mười chỗ gọi.                                                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 */
export interface SheetResultSlotProps {
  projectId: string;
  /** Id tấm trong contract (`nen`, `ui2`, `nhan-vat`) — KHÔNG phải tên job. */
  sheetId: string;
  /** Lượt vừa vẽ tấm này: có ⇒ đọc ảnh BẤT BIẾN của lượt đó thay vì bản hiện hành. */
  runId?: string | null;
  /** Đường ảnh mà stream vừa báo — đổi giá trị là tín hiệu "byte mới, tải lại". */
  artifactPath?: string | null;
  /**
   * Tấm ĐANG SOẠN (chưa lưu) để vẽ khung xương. Màn soạn luôn có nó trong tay và
   * luôn nên truyền: bản trên đĩa có thể cũ hơn thứ người dùng đang nhìn một nhịp.
   */
  sheet?: Sheet | null;
  /** Tấm đang chạy ⇒ khoá thao tác ghi trong panel. */
  busy?: boolean;
}

export function SheetResultSlot({
  projectId,
  sheetId,
  runId = null,
  artifactPath = null,
  sheet = null,
  busy = false,
}: SheetResultSlotProps) {
  return (
    <SheetResultPanel
      projectId={projectId}
      sheetId={sheetId}
      job={jobIdOf(sheetId)}
      runId={runId}
      artifactPath={artifactPath}
      sheet={sheet}
      busy={busy}
    />
  );
}
