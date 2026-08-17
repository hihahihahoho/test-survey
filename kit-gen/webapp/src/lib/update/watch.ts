/**
 * webapp/src/lib/update/watch.ts — TỰ BIẾT CÓ BẢN MỚI, KHÔNG BẮT NGƯỜI DÙNG TẢI LẠI TRANG.
 *
 * VẤN ĐỀ: GitHub không đẩy được gì về máy local, nên "có bản mới" chỉ có một đường duy
 * nhất là app tự đi hỏi. Trước đây app hỏi ĐÚNG MỘT LẦN mỗi phiên (`useUpdateCheck` với
 * staleTime 12h, tắt cả refetch theo nhịp lẫn theo focus). App này là công cụ mở cả ngày:
 * ai mở tab từ sáng thì tới chiều vẫn đang nhìn kết quả của lần hỏi lúc 9h, và bản vá
 * phát hành lúc 10h chỉ đến tay họ nếu tình cờ bấm F5.
 *
 * CÁCH LÀM — KHÔNG đẻ endpoint mới, KHÔNG đẻ đường fetch mới: vẫn đúng `GET /api/update`
 * mà agent đã bọc sẵn (fetch chạy ở AGENT vì raw.githubusercontent.com không trả CORS cho
 * origin loopback). Chỉ đổi CHÍNH SÁCH HỎI LẠI của query đó:
 *   · mỗi 30 phút khi tab đang hiện (react-query mặc định không tick khi tab ẩn ⇒ máy
 *     ngủ / tab nền không sinh request nào);
 *   · mỗi lần người dùng quay lại tab, nhưng CHẶN DƯỚI 5 PHÚT — đây chính là `staleTime`:
 *     dữ liệu còn tươi thì focus không sinh request. Không có nó, người vừa alt-tab qua
 *     Figma rồi quay lại sẽ bắn một request mỗi vài giây.
 *
 * NÓI MỘT LẦN CHO MỖI BẢN: hỏi lại mỗi 30 phút nhưng KHÔNG nhắc lại mỗi 30 phút. Người
 * dùng đã thấy "có bản 2.2.0" và cố ý chưa cài (đang dở việc, đang chạy gen 15 phút) —
 * nhắc lại mỗi nửa tiếng là phá việc, không phải giúp đỡ. Toast chỉ bật khi số hiệu bản
 * mới KHÁC bản đã nhắc. Chấm tròn trên nút trạng thái vẫn đứng đó im lặng làm việc nhắc.
 *
 * `ok:false` (mất mạng) TUYỆT ĐỐI im lặng: "chưa kiểm tra được" không phải tin tức.
 */
import type { UpdateCheck } from "../api/endpoints";

/** Nhịp hỏi lại khi tab đang mở. Đủ thưa để không ai để ý, đủ dày để bản vá tới trong ngày. */
export const UPDATE_POLL_INTERVAL_MS = 30 * 60 * 1000;
/**
 * Sàn thời gian giữa hai lần hỏi do quay lại tab. Cũng chính là `staleTime` của query:
 * react-query chỉ refetch-on-focus khi dữ liệu đã cũ, nên một hằng này lo cả hai việc.
 */
export const UPDATE_FOCUS_THROTTLE_MS = 5 * 60 * 1000;

/**
 * Đã nhắc bản nào trong PHIÊN NÀY. Module-level (không phải state của component) vì
 * `RuntimeStatus` nằm ở header và có thể remount khi đổi layout — để trong component thì
 * mỗi lần remount lại nhắc lại một lần nữa.
 */
const announced = new Set<string>();

/** Chỉ dùng trong test. */
export function _resetUpdateWatch(): void {
  announced.clear();
}

/**
 * "Có nên bật toast lúc này không?" — thuần, không tác dụng phụ, để mọi luật ở trên được
 * kiểm bằng test chứ không bằng cách mở app ngồi đợi 30 phút.
 *
 * @param check kết quả `GET /api/update` mới nhất (undefined = chưa hỏi xong).
 * @param opts.installing đang cài dở ⇒ đã có lớp phủ toàn trang, thêm toast là nhiễu.
 */
export function shouldAnnounceUpdate(
  check: UpdateCheck | undefined,
  opts: { installing?: boolean; seen?: ReadonlySet<string> } = {},
): boolean {
  const seen = opts.seen ?? announced;
  if (opts.installing) return false;
  if (!check?.ok || !check.available) return false;
  const v = check.latestVersion;
  // `available` mà không có số hiệu là dữ liệu tự mâu thuẫn — không nhắc, vì câu thông
  // báo sẽ không nói được gì hơn ngoài "có bản mới", còn chấm tròn thì đã nói rồi.
  if (!v) return false;
  return !seen.has(v);
}

/** Ghi nhận đã nhắc bản này. Gọi NGAY khi bật toast, không đợi người dùng phản hồi. */
export function markUpdateAnnounced(version: string | null | undefined): void {
  if (version) announced.add(version);
}

/**
 * "ĐÃ CÔNG BỐ NHƯNG CHƯA TẢI VỀ ĐƯỢC" — BACKLOG #23.
 *
 * `release.json` nằm trong repo và lên cùng lúc gắn tag, còn file cài đặt chỉ có sau khi
 * CI đóng gói xong (~10-15 phút). Trong cửa sổ đó, agent trả `ok:true` (manifest đọc được,
 * số hiệu bản mới là thật) + `available:false` (chưa tải về được) + reason này. Nhờ
 * `available:false`, `shouldAnnounceUpdate` ở trên đã im lặng đúng — hàm này chỉ để những
 * chỗ CẦN nói ra sự thật (tab Giới thiệu, lớp phủ cập nhật) không phải nói câu "đang dùng
 * bản mới nhất" trong khi ngay phía trên đang hiện một số hiệu cao hơn.
 *
 * `reason` là enum của API; không đọc text lỗi tự do.
 */
export const ARCHIVE_PENDING_REASON = "ARCHIVE_PENDING";

export function isArchivePending(check: UpdateCheck | null | undefined): boolean {
  return check?.reason === ARCHIVE_PENDING_REASON;
}
