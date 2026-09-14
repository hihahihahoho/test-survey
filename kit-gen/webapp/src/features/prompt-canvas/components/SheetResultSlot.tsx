import { jobIdOf } from "../lib/block-jobs";
import { SheetResultPanel } from "./result";

/**
 * SheetResultSlot — CHỖ CẮM panel kết quả dưới một thẻ của màn soạn.
 *
 * ╔══ MỘT LỚP MỎNG, VÀ NÓ CÓ VIỆC THẬT ══════════════════════════════════════╗
 * ║ Ruột đã là `SheetResultPanel` (hai tab: ảnh gốc · ô đã cắt).               ║
 * ║ Lớp này chỉ làm đúng một chuyện mà panel KHÔNG được biết: dịch `sheetId`   ║
 * ║ sang TÊN JOB. Phép ghép ấy (`<variant>-<sheetId>`) là luật của bộ dịch      ║
 * ║ composer → contract, không phải luật của một panel hiển thị — panel nhận    ║
 * ║ `job` từ ngoài đúng như một panel nên làm.                                  ║
 * ║ Nhờ vậy mọi thẻ trên màn chỉ cần biết id tấm của mình, và ngày nào composer ║
 * ║ có nhiều phong cách thì chỗ phải sửa vẫn là `block-jobs.ts`, không phải     ║
 * ║ mười chỗ gọi.                                                              ║
 * ╚═══════════════════════════════════════════════════════════════════════════╝
 *
 * ══ VÀ VÌ THẾ ĐÂY CŨNG LÀ CHỖ HỎI «LƯỢT NÀY CÓ TÔI KHÔNG» ══════════════════
 * ╔══ CON BỌ 14/09/2026 ═════════════════════════════════════════════════════╗
 * ║ Thẻ Bộ UI hai tấm. Bấm «Vẽ lại tấm này» ở tấm 2 ⇒ CẢ HAI ô ảnh hiện «Đang  ║
 * ║ vẽ tấm này…», dù lượt chạy chỉ có đúng một job (`r-0034`: `chinh-ui2`).    ║
 * ║ Vì vỏ thẻ đưa xuống mọi ô cùng một thứ: trạng thái của CẢ THẺ, và mã lượt  ║
 * ║ của CẢ THẺ. Ô của tấm 1 vừa hiện khung chờ cho một lượt không đụng tới nó, ║
 * ║ vừa đi đọc `runs/r-0034/artifacts/chinh-ui.png` — một file không tồn tại — ║
 * ║ nên ảnh đang có của nó (`raw/chinh-ui.png`) biến mất khỏi màn.             ║
 * ║ Nên lớp này nhận DANH SÁCH JOB của lượt và tự tra tên mình vào:            ║
 * ║  · không có tên tôi ⇒ không khung chờ, và `runId` rơi về `null` để panel   ║
 * ║    đọc ảnh HIỆN HÀNH của tấm — mọi nút copy/tải/lưới/phiên bản dùng bình   ║
 * ║    thường như lúc không có lượt nào chạy;                                  ║
 * ║  · có tên tôi nhưng agent đã vẽ xong ⇒ ảnh đã có, thôi quay vòng chờ.      ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */
export interface SheetResultSlotProps {
  projectId: string;
  /** Id tấm trong contract (`nen`, `ui2`, `nhan-vat`) — KHÔNG phải tên job. */
  sheetId: string;
  /** Lượt vừa vẽ tấm này: có ⇒ đọc ảnh BẤT BIẾN của lượt đó thay vì bản hiện hành. */
  runId?: string | null;
  /** Đường ảnh mà stream vừa báo — đổi giá trị là tín hiệu "byte mới, tải lại". */
  artifactPath?: string | null;
  /* `sheet` (bản tấm đang soạn) ĐÃ BỎ cùng tab «Khung xương»: nó tồn tại chỉ để
     vẽ SVG khung xương, và engine thôi dùng ảnh khung xương — xem khối chú thích
     đầu `SheetResultPanel`. Panel nay chỉ cần `sheetId` để lọc ô đã cắt. */
  /**
   * Job THẬT SỰ nằm trong lượt `runId` (`gen.jobs`). Vắng tên tấm này ⇒ lượt ấy
   * không đụng tới nó, và ảnh phải đọc từ bản hiện hành.
   */
  runJobs?: readonly string[];
  /** Job CÒN đang chờ/đang vẽ (`gen.drawing`) — tập con của `runJobs`. */
  drawingJobs?: readonly string[];
  /** Vẽ lại ĐÚNG tấm này (ép vẽ) — vắng ⇒ panel không bày nút. */
  onRedraw?: () => void;
}

export function SheetResultSlot({
  projectId,
  sheetId,
  runId = null,
  artifactPath = null,
  runJobs = [],
  drawingJobs = [],
  onRedraw,
}: SheetResultSlotProps) {
  const job = jobIdOf(sheetId);
  /* Tấm có trong lượt ⇒ neo vào ảnh bất biến của lượt; không có ⇒ `null`, tức
     `raw/<job>.png` — ảnh hiện hành, đúng thứ đang treo trên màn trước cú bấm. */
  const mine = runJobs.includes(job) ? runId : null;
  return (
    <SheetResultPanel
      projectId={projectId}
      sheetId={sheetId}
      job={job}
      runId={mine}
      artifactPath={artifactPath}
      busy={drawingJobs.includes(job)}
      {...(onRedraw ? { onRedraw } : {})}
    />
  );
}
