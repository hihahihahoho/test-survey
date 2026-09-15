import type { FigmaFit } from "@/features/prompt-lab/lib/composer-model";
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
 *
 * ╔══ CON BỌ 15/09/2026 — «ĐANG CHỜ» Ở TRÊN, «THIẾU FILE» Ở DƯỚI ════════════╗
 * ║ Bấm «Vẽ lại tấm này» ⇒ panel hiện đúng dải «Đang chờ tới lượt… Đã gửi,    ║
 * ║ chờ máy nhận», NHƯNG ô ảnh ngay bên dưới đỏ lên «Thiếu file · Thử lại»,   ║
 * ║ kèm câu chú «Đây là ảnh của đúng lượt chạy này». Ba câu, cãi nhau cả ba.  ║
 * ║ Vì bản trước neo theo MỘT bằng chứng: có tên trong lượt. Mà agent ghi sẵn ║
 * ║ tên mọi job vào `run.json` ngay lúc mở lượt (`queued`), còn file          ║
 * ║ `runs/<lượt>/artifacts/<tấm>.png` thì chỉ ra đời khi vẽ xong — nên suốt   ║
 * ║ quãng chờ, ô ảnh đi xin một file chưa tồn tại và bỏ lại bức ảnh thật nằm  ║
 * ║ sẵn ở `raw/<tấm>.png`.                                                    ║
 * ║ Nên neo nay hỏi ĐÚNG câu nó cần: tấm này đã CÓ ẢNH trong thư mục của lượt ║
 * ║ chưa (`gen.drawn` — đã kết + có đường ảnh thật). Chưa có ⇒ bản hiện hành,  ║
 * ║ và dải chờ đứng trên nó thay vì thay nó.                                  ║
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
   * Job ĐÃ VẼ XONG trong lượt `runId` **và đã có ảnh bất biến** (`gen.drawn`) —
   * danh sách DUY NHẤT được phép neo ô ảnh vào thư mục của lượt.
   *
   * Vắng tên tấm này ⇒ ảnh đọc từ bản hiện hành (`raw/<tấm>.png`). Ba hoàn cảnh
   * cùng rơi vào đó, và cả ba đều đúng: lượt không đụng tới tấm này; lượt có mang
   * nó nhưng còn đang xếp hàng/đang vẽ; lượt vẽ hỏng tấm ấy. Trong cả ba, thứ
   * người dùng đáng được nhìn là bức ảnh đang có, không phải một ô đỏ.
   */
  drawnJobs?: readonly string[];
  /** Job máy ĐANG VẼ ngay lúc này (`gen.drawing`) — tập con của `requestedJobs`. */
  drawingJobs?: readonly string[];
  /**
   * Job ĐÃ XIN mà chưa có ảnh mới (`gen.requested`) — có TỪ LÚC BẤM, kể cả khi
   * lượt chưa phóng được.
   *
   * ╔══ CON BỌ 15/09/2026 ═════════════════════════════════════════════════════╗
   * ║ Bấm «Vẽ lại tấm này» lúc hàng đợi đang bận ⇒ panel của tấm KHÔNG hiện gì. ║
   * ║ Vì hai danh sách kia (`runJobs`, `drawingJobs`) chỉ có nội dung khi agent  ║
   * ║ đã mở lượt; trước đó cả hai rỗng, và mọi chỉ báo của tấm im lặng. Chữ duy  ║
   * ║ nhất nói ra là «Đang vẽ k/N» ở ĐẦU thẻ — muốn thấy phải cuộn ngược lên,   ║
   * ║ tức là màn hình bắt người dùng đi tìm câu trả lời cho cú bấm của chính họ. ║
   * ║ Danh sách này lấp đúng quãng ấy: tấm có tên trong đây mà chưa được vẽ thì  ║
   * ║ panel bày khung chờ NHẸ — giữ nguyên bức ảnh đang có, chỉ làm mờ đi.       ║
   * ╚══════════════════════════════════════════════════════════════════════════╝
   */
  requestedJobs?: readonly string[];
  /**
   * THẺ ĐANG CÓ MỘT LƯỢT (đang xếp hàng hoặc đang chạy).
   *
   * Hàng đợi chỉ nhận MỘT lượt cho mỗi thẻ (`enqueue` bỏ qua thẻ đã có mặt), nên
   * nút «Vẽ lại tấm này» của MỌI tấm trong thẻ đều là nút bấm vào không có gì xảy
   * ra cho tới khi lượt ấy xong. Khoá cả thẻ và nói ra lý do, đúng như vạch ranh
   * giới tấm ở tab Soạn (`row-ui.tsx`) đã làm.
   */
  blockBusy?: boolean;
  /** Vẽ lại ĐÚNG tấm này (ép vẽ) — vắng ⇒ panel không bày nút. */
  onRedraw?: () => void;
  /**
   * KHỚP KHUNG của THẺ — mọi tấm của một thẻ nhận CÙNG một giá trị.
   *
   * Đi thẳng từ vỏ thẻ xuống, không dừng lại ở lớp này: nấc ấy không liên quan gì
   * tới phép ghép tên lượt vẽ — việc duy nhất của lớp này.
   */
  fit?: FigmaFit;
  onFitChange?: (next: FigmaFit) => void;
}

export function SheetResultSlot({
  projectId,
  sheetId,
  runId = null,
  artifactPath = null,
  drawnJobs = [],
  drawingJobs = [],
  requestedJobs = [],
  blockBusy = false,
  onRedraw,
  fit,
  onFitChange,
}: SheetResultSlotProps) {
  const job = jobIdOf(sheetId);
  /* Tấm ĐÃ CÓ ẢNH trong lượt ⇒ neo vào ảnh bất biến của lượt; chưa có ⇒ `null`,
     tức `raw/<job>.png` — ảnh hiện hành, đúng thứ đang treo trên màn trước cú bấm.
     Hỏi "đã có ảnh chưa" chứ không hỏi "có tên trong lượt không": xem khối «CON BỌ
     15/09/2026» ở đầu file. */
  const mine = drawnJobs.includes(job) ? runId : null;
  const busy = drawingJobs.includes(job);
  /* ĐÃ XIN MÀ MÁY CHƯA CẦM TỚI. Hai trạng thái, không gộp: «đang vẽ» là lời hứa
     ảnh sắp về trong vài chục giây, còn «đang chờ» thì không hứa thời điểm nào. */
  const waiting = !busy && requestedJobs.includes(job);
  /* LÝ DO CHỜ, nói bằng thứ ta BIẾT CHẮC. Có tấm khác đang được vẽ ⇒ nói thẳng là
     tấm này xếp sau. Chưa tấm nào ⇒ lượt còn chưa tới tay agent; đừng đoán hộ nó
     đang kẹt vì thẻ khác hay vì mạng — câu duy nhất đúng là "đã gửi, đang chờ". */
  const waitingWhy = drawingJobs.length > 0
    ? "Máy đang vẽ tấm khác, tấm này xếp sau"
    : "Đã gửi, chờ máy nhận";
  return (
    <SheetResultPanel
      projectId={projectId}
      sheetId={sheetId}
      job={job}
      runId={mine}
      artifactPath={artifactPath}
      busy={busy}
      waiting={waiting}
      waitingWhy={waitingWhy}
      /* Thẻ bận mà tấm này KHÔNG nằm trong lượt ⇒ nút vẫn phải xám: hàng đợi sẽ
         bỏ qua cú bấm ấy, và một nút bấm được mà không làm gì là lời nói dối. */
      queueBusy={blockBusy}
      {...(onRedraw ? { onRedraw } : {})}
      {...(fit ? { fit } : {})}
      {...(onFitChange ? { onFitChange } : {})}
    />
  );
}
