/**
 * features/docs/lib/catalog.ts — NỘI DUNG TRANG TRỢ GIÚP MÃ LỖI (`/docs/errors#…`).
 *
 * VÌ SAO CẦN FILE NÀY khi đã có `lib/api/errors.ts` của R0:
 * hai thứ khác nhiệm vụ, cố ý không gộp.
 *   · `ERROR_TABLE` (R0) = copy NGẮN hiện tại chỗ lỗi: 1 tiêu đề + 1 câu + nút. Nó phải
 *     ngắn vì nằm trong toast/banner/inline.
 *   · file này = trang GIẢI THÍCH: vì sao xảy ra, làm gì để hết, và (nếu có) lệnh copy.
 *     Nó là đích thật của `error.docs` trong envelope §6.1.
 *
 * LUẬT:
 *  1. KHÔNG chép lại `title`/`explain` — lấy trực tiếp từ `ERROR_TABLE` qua `presentError`
 *     ở tầng component. Chép là cách chắc chắn để hai chỗ nói hai giọng (bài học U5 §7.3).
 *  2. Mỗi mục phải trả lời được ĐÚNG hai câu: "vì sao tôi gặp cái này?" và "tôi làm gì?".
 *     Không có mục nào chỉ nhắc lại tên mã bằng tiếng Việt.
 *  3. KHÔNG thuật ngữ nội bộ ngoài danh sách §1.3 (cấm `contract`, `job`, `skel`, `matte`,
 *     `chroma key`, `NDJSON`, `If-Match`… trong thân bài).
 *  4. KHÔNG chuỗi bí mật, KHÔNG đường dẫn tuyệt đối. Lệnh chỉ dùng nhãn `~/…`.
 *
 * PHỦ ĐỦ BAO NHIÊU: mọi mã mà agent thật có thể trả về. Đã liệt kê bằng
 *   grep -rhoE 'fail\("[A-Z_]+"' agent    (34 mã)
 * cộng các mã tầng bảo mật/HTTP trong `agent/lib/security.mjs` + `server.mjs`
 *   (ORIGIN_NOT_ALLOWED, BAD_HOST, CLIENT_HEADER_REQUIRED, RATE_LIMITED,
 *    METHOD_NOT_ALLOWED, INTERNAL…)
 * và các mã do CHÍNH CLIENT sinh khi chưa gọi được agent (AGENT_NOT_RUNNING…).
 * Test `__tests__/docs.test.ts` khoá điều kiện này lại: mọi khoá của `ERROR_TABLE`
 * đều phải có mục ở đây, nếu không thì test đỏ.
 */
import { ADD_WORKSPACE_CMD, RUN_CMD, RUN_CMD_REPO } from "@/components/layout";
import { knownCodes } from "@/lib/api";

/** Nhóm để mục lục đọc được, thay vì một danh sách 40 mã lộn xộn. */
export const DOC_GROUPS = [
  "Kết nối với công cụ local",
  "Thư mục làm việc",
  "Môi trường & tạo ảnh AI",
  "Project",
  "Bản thiết kế",
  "Lượt sinh ảnh",
  "File & ảnh tham khảo",
  "Thùng rác & xác nhận",
  "Khác",
] as const;
export type DocGroup = (typeof DOC_GROUPS)[number];

export interface DocEntry {
  /** Mã trong envelope §6.1 — cũng là khoá tra `ERROR_TABLE`. */
  code: string;
  group: DocGroup;
  /** Vì sao lỗi này xảy ra — 1–3 câu, tiếng Việt thường. */
  why: string;
  /** Các bước xử lý, theo thứ tự nên làm. */
  fix: string[];
  /** Lệnh Terminal kèm theo (nếu có). Nhãn `~/…`, KHÔNG path tuyệt đối. */
  commands?: { label: string; cmd: string }[];
  /** Mã liên quan — giúp user đang lạc tìm đúng mục. */
  related?: string[];
  /** true ⇒ mã này do GIAO DIỆN tự sinh khi chưa gọi được agent, không phải agent trả. */
  clientSide?: boolean;
}

const CMD_RUN = { label: "Chạy công cụ local", cmd: RUN_CMD };
const CMD_RUN_REPO = { label: "Chạy từ bản mã nguồn", cmd: RUN_CMD_REPO };
const CMD_ADD_WS = { label: "Mở một thư mục làm việc khác", cmd: ADD_WORKSPACE_CMD };

export const DOC_ENTRIES: DocEntry[] = [
  /* ── Kết nối ─────────────────────────────────────────────────────────── */
  {
    code: "AGENT_NOT_RUNNING",
    group: "Kết nối với công cụ local",
    clientSide: true,
    why:
      "Trang này chạy trong trình duyệt nên không tự đọc được ổ đĩa. Mọi project nằm trên máy bạn " +
      "và được đọc bởi một chương trình nhỏ chạy ở máy — chương trình đó hiện chưa chạy.",
    fix: [
      "Mở Terminal và chạy lệnh dưới đây; cứ để cửa sổ đó mở trong lúc làm việc.",
      "Quay lại trang này — nó tự phát hiện, không cần tải lại.",
      "Nếu vẫn không thấy: kiểm tra cửa sổ Terminal có báo lỗi cổng đang bị chiếm không.",
    ],
    commands: [CMD_RUN, CMD_RUN_REPO],
    related: ["AGENT_BLOCKED_BY_BROWSER", "ORIGIN_NOT_ALLOWED"],
  },
  {
    code: "AGENT_BLOCKED_BY_BROWSER",
    group: "Kết nối với công cụ local",
    clientSide: true,
    why:
      "Công cụ local đang chạy — điều này đã được xác nhận bằng một cửa sổ kiểm tra riêng. " +
      "Nhưng trình duyệt không cho một trang https gọi vào máy cá nhân của bạn.",
    fix: [
      "Mở bản chạy ngay tại máy: giao diện y hệt, đủ mọi tính năng, và không bị chặn.",
      "Hoặc dùng trình duyệt khác — chính sách này khác nhau giữa Safari, Chrome và Firefox.",
    ],
    related: ["AGENT_NOT_RUNNING", "ORIGIN_NOT_ALLOWED"],
  },
  {
    code: "AGENT_UNREACHABLE_AMBIGUOUS",
    group: "Kết nối với công cụ local",
    clientSide: true,
    why:
      "Trang không gọi được vào máy bạn, và ở tình huống này trình duyệt không nói rõ vì sao: " +
      "có thể công cụ local chưa chạy, cũng có thể trình duyệt đang chặn. Chúng tôi không đoán bừa.",
    fix: [
      "Bấm [Kiểm tra giúp tôi] ở dải thông báo — nó mở một cửa sổ dò để biết chính xác.",
      "Nếu kết quả là chưa chạy: chạy lệnh dưới đây.",
    ],
    commands: [CMD_RUN],
    related: ["AGENT_NOT_RUNNING", "AGENT_BLOCKED_BY_BROWSER"],
  },
  {
    code: "AGENT_STARTING",
    group: "Kết nối với công cụ local",
    why: "Công cụ local vừa được bật và đang mở thư mục làm việc. Việc này mất vài giây.",
    fix: ["Chờ 2–3 giây rồi bấm Kiểm tra lại."],
  },
  {
    code: "AGENT_PROTOCOL_OLD",
    group: "Kết nối với công cụ local",
    why:
      "Giao diện đang mới hơn công cụ local trên máy bạn. Hai bên nói khác phiên bản nên " +
      "giao diện chuyển sang chế độ chỉ xem, thay vì gửi những yêu cầu mà công cụ cũ không hiểu.",
    fix: [
      "Cập nhật công cụ local bằng lệnh mà chính nó gợi ý (hiện ở dải thông báo).",
      "Tắt cửa sổ Terminal cũ, chạy lại, rồi bấm Kiểm tra lại.",
    ],
    related: ["AGENT_PROTOCOL_NEW"],
  },
  {
    code: "AGENT_PROTOCOL_NEW",
    group: "Kết nối với công cụ local",
    why: "Công cụ local mới hơn giao diện. Trình duyệt của bạn đang giữ một bản giao diện cũ trong bộ đệm.",
    fix: ["Tải lại trang (giữ Shift khi bấm nút tải lại để bỏ bộ đệm)."],
    related: ["AGENT_PROTOCOL_OLD"],
  },
  {
    code: "ORIGIN_NOT_ALLOWED",
    group: "Kết nối với công cụ local",
    why:
      "Công cụ local ĐANG CHẠY và đã trả lời — nhưng nó từ chối vì địa chỉ của trang này không nằm " +
      "trong danh sách cho phép của nó. Đây không phải lỗi trình duyệt.",
    fix: [
      "Cách chắc chắn nhất: mở bản chạy tại máy (địa chỉ đó luôn được cho phép).",
      "Hoặc chạy lại công cụ local có khai địa chỉ trang này trong danh sách cho phép — xem tài liệu triển khai.",
    ],
    related: ["BAD_HOST", "CLIENT_HEADER_REQUIRED"],
  },
  {
    code: "BAD_HOST",
    group: "Kết nối với công cụ local",
    why:
      "Công cụ local chỉ nhận đúng tên máy nội bộ kèm đúng cổng của nó. Đây là một lớp chống " +
      "kiểu tấn công đổi tên miền trỏ về máy bạn, nên nó cố tình khắt khe.",
    fix: ["Mở bản chạy tại máy thay vì gọi qua tên miền khác."],
    related: ["ORIGIN_NOT_ALLOWED"],
  },
  {
    code: "CLIENT_HEADER_REQUIRED",
    group: "Kết nối với công cụ local",
    why:
      "Công cụ local yêu cầu mọi yêu cầu phải mang một dấu hiệu nhận biết do giao diện gắn vào. " +
      "Yêu cầu vừa rồi thiếu dấu hiệu đó — thường vì trang được mở bằng một cách không được hỗ trợ.",
    fix: ["Mở lại app từ trang chủ, hoặc dùng bản chạy tại máy.", "Nếu bạn đang tự dựng bản dev: bật proxy như hướng dẫn trong tài liệu triển khai."],
    related: ["ORIGIN_NOT_ALLOWED"],
  },
  /* Bốn mục dưới đây là BỐN NGÁCH của cùng một sự cố "thao tác không xong", tách ra ở
     FE-2 #6. Chúng cố ý nói rõ *khúc nào của hành trình* hỏng, vì cách xử lý khác hẳn nhau.
     Nhắc lại luật 1 của file này: KHÔNG chép `title`/`explain` từ `ERROR_TABLE` — phần
     dưới chỉ trả lời "vì sao" và "làm gì". */
  {
    code: "AGENT_INTERNAL",
    group: "Kết nối với công cụ local",
    why:
      "Yêu cầu của bạn đã tới được công cụ local, nhưng chính nó gặp sự cố giữa chừng nên " +
      "việc không chạy xong. Vì đã bắt đầu làm, có thể một phần việc đã xảy ra dở dang.",
    fix: [
      "Thử lại một lần — phần lớn sự cố loại này là tạm thời.",
      "Trước khi thử lại lần nữa, ngó màn hình xem việc đó đã xảy ra một phần chưa, để không làm đôi.",
      "Vẫn lỗi: mở panel Chi tiết cho lập trình viên, copy nội dung, và xem cửa sổ Terminal đang chạy công cụ local.",
    ],
    related: ["AGENT_BAD_RESPONSE", "REQUEST_NOT_SENT", "STATE_CONFLICT"],
  },
  {
    code: "AGENT_BAD_RESPONSE",
    group: "Kết nối với công cụ local",
    why:
      "Công cụ local có trả lời, nhưng nội dung trả về không đúng dạng mà bản giao diện này " +
      "hiểu được. Gần như luôn là do hai bên lệch phiên bản, chứ không phải dữ liệu của bạn hỏng.",
    fix: [
      "Tải lại dữ liệu của màn hình — nếu chỉ một lần lỗi vặt thì hết ngay.",
      "Lặp lại: cập nhật công cụ local lên bản mới rồi mở lại trang. Thử lại nhiều lần không giúp gì.",
      "Dữ liệu trên máy bạn KHÔNG bị đụng tới trong ca này.",
    ],
    related: ["AGENT_PROTOCOL_OLD", "AGENT_PROTOCOL_NEW", "AGENT_INTERNAL"],
  },
  {
    code: "REQUEST_NOT_SENT",
    group: "Kết nối với công cụ local",
    clientSide: true,
    why:
      "Yêu cầu chưa rời khỏi trình duyệt: giao diện đã dừng nó lại, hoặc gửi đi mà không nhận " +
      "được một hồi đáp nào. Nghĩa là chưa có gì được thực hiện trên máy bạn.",
    fix: [
      "Thử lại — vì chưa có gì xảy ra nên thử lại không thể làm đôi việc.",
      "Nếu lặp lại nhiều lần: kiểm tra công cụ local còn chạy không (dải thông báo trên đầu trang).",
    ],
    related: ["AGENT_NOT_RUNNING", "AGENT_UNREACHABLE_AMBIGUOUS"],
  },
  {
    code: "STATE_CONFLICT",
    group: "Kết nối với công cụ local",
    why:
      "Thứ bạn vừa thao tác đã bị đổi trước đó bởi một tab khác, một cửa sổ khác, hoặc bởi " +
      "chính bạn sửa file bên ngoài app. Công cụ local từ chối để không ghi đè mất thay đổi kia.",
    fix: [
      "Tải lại dữ liệu để thấy bản mới nhất, xem lại rồi làm lại thao tác.",
      "Bấm [Thử lại] ngay mà không tải lại sẽ hỏng đúng như vậy lần nữa.",
    ],
    related: ["CONTRACT_CONFLICT", "IF_MATCH_REQUIRED"],
  },

  /* ── Thư mục làm việc ────────────────────────────────────────────────── */
  {
    code: "WORKSPACE_CHANGED",
    group: "Thư mục làm việc",
    why:
      "Công cụ local đang mở một thư mục làm việc khác với thư mục mà trình duyệt này ghi nhớ lần trước. " +
      "Hai thư mục có hai bộ project khác nhau.",
    fix: ["Xác nhận dùng thư mục hiện tại — danh sách project sẽ được tải lại từ đầu."],
    related: ["WORKSPACE_UNKNOWN"],
  },
  {
    code: "WORKSPACE_UNKNOWN",
    group: "Thư mục làm việc",
    why: "Thư mục làm việc bạn chọn không còn trong danh sách mà công cụ local biết — có thể đã đổi tên hoặc tháo ổ đĩa.",
    fix: ["Bấm Kiểm tra lại để lấy danh sách mới.", "Muốn dùng thư mục khác: chạy lệnh dưới đây rồi Kiểm tra lại."],
    commands: [CMD_ADD_WS],
  },
  {
    code: "WORKSPACE_UNWRITABLE",
    group: "Thư mục làm việc",
    why:
      "Công cụ local đọc được thư mục nhưng không ghi được vào đó. Thường do quyền thư mục, " +
      "do ổ đĩa gắn ở chế độ chỉ đọc, hoặc do đường dẫn nằm trong vùng mà hệ điều hành bảo vệ.",
    fix: [
      "Kiểm tra quyền của thư mục đang dùng (hiện ở tab Công cụ local).",
      "Hoặc mở một thư mục làm việc khác bằng lệnh dưới đây.",
    ],
    commands: [CMD_ADD_WS],
    related: ["DISK_FULL"],
  },
  {
    code: "DISK_FULL",
    group: "Thư mục làm việc",
    why: "Ổ đĩa không còn đủ chỗ cho thao tác này. Ảnh sinh ra và ảnh đã cắt chiếm khá nhiều dung lượng.",
    fix: [
      "Dọn dữ liệu tái tạo được của project (ảnh đã cắt, khung xương, ảnh cũ) ở Cài đặt project.",
      "Xoá vĩnh viễn những project trong Thùng rác mà bạn chắc chắn không cần.",
    ],
    related: ["WORKSPACE_UNWRITABLE"],
  },

  /* ── Môi trường & tạo ảnh ────────────────────────────────────────────── */
  {
    code: "CODEX_MISSING",
    group: "Môi trường & tạo ảnh AI",
    why: "Máy bạn chưa có công cụ dòng lệnh dùng để gọi AI. Không có nó thì không sinh được ảnh mới.",
    fix: [
      "Copy lệnh cài ở tab Môi trường, chạy trong Terminal.",
      "Chạy xong bấm Kiểm tra lại.",
      "Phần soạn bản thiết kế và cắt ảnh vẫn dùng được bình thường trong lúc chờ.",
    ],
    related: ["IMAGEGEN_UNAVAILABLE", "PY_DEPS_MISSING"],
  },
  {
    code: "PY_DEPS_MISSING",
    group: "Môi trường & tạo ảnh AI",
    why:
      "Việc cắt ảnh thành từng file trong suốt do một script Python làm, và script đó cần vài thư viện. " +
      "Hiện còn thiếu ít nhất một thư viện.",
    fix: [
      "Copy lệnh cài ở tab Môi trường (nó tạo môi trường Python riêng, không đụng Python hệ thống).",
      "Chạy xong bấm Kiểm tra lại — dòng thiếu sẽ chuyển thành dấu ✓.",
    ],
    related: ["CODEX_MISSING"],
  },
  {
    code: "IMAGEGEN_UNAVAILABLE",
    group: "Môi trường & tạo ảnh AI",
    why:
      "Công cụ local chạy tốt, nhưng phần tạo ảnh chưa dùng được. Lý do cụ thể được ghi ngay tại thẻ " +
      "Tạo ảnh AI ở tab Môi trường (chưa cài công cụ · chưa đăng nhập · tài khoản chưa bật tính năng · " +
      "hết lượt · kiểm tra quá lâu · chưa thấy dấu hiệu đăng nhập).",
    fix: [
      "Mở Cài đặt → Môi trường, đọc lý do ở thẻ Tạo ảnh AI.",
      "Nếu là chuyện đăng nhập: dùng cách dự phòng dùng một cấu hình riêng chỉ để tạo ảnh — hai lệnh có ở ngay thẻ đó.",
      "Chạy xong bấm Kiểm tra lại.",
    ],
    related: ["CODEX_MISSING", "QUOTA_SUSPECTED"],
  },
  {
    code: "QUOTA_SUSPECTED",
    group: "Môi trường & tạo ảnh AI",
    why:
      "Các lượt sinh ảnh bị từ chối theo kiểu thường thấy khi tài khoản đã chạm giới hạn. " +
      "Lưu ý: tạo ảnh tiêu giới hạn nhanh hơn 3–5 lần so với một lượt hỏi thường.",
    fix: [
      "Giảm số lượt chạy song song (Cài đặt → Ưu tiên) rồi chạy lại các lượt lỗi.",
      "Hoặc chờ giới hạn của tài khoản được đặt lại, rồi chạy lại đúng những lượt lỗi (không cần chạy lại cả bộ).",
    ],
    related: ["IMAGEGEN_UNAVAILABLE"],
  },

  /* ── Project ─────────────────────────────────────────────────────────── */
  {
    code: "PROJECT_NOT_FOUND",
    group: "Project",
    why: "Không có project nào với địa chỉ này trong thư mục làm việc đang mở. Có thể nó đã bị xoá, hoặc bạn đang mở một thư mục làm việc khác.",
    fix: ["Về danh sách project để chọn lại.", "Xem Thùng rác — project đã xoá còn ở đó 30 ngày.", "Kiểm tra thư mục làm việc đang dùng ở tab Công cụ local."],
    related: ["PROJECT_IN_TRASH", "WORKSPACE_CHANGED"],
  },
  {
    code: "PROJECT_IN_TRASH",
    group: "Project",
    why: "Project này đang nằm trong Thùng rác nên không mở để sửa được.",
    fix: ["Vào Cài đặt → Thùng rác và bấm Phục hồi.", "Sau khi phục hồi, mở lại link cũ là được."],
    related: ["TRASH_NOT_FOUND"],
  },
  {
    code: "PROJECT_BROKEN",
    group: "Project",
    why: "File mô tả project trên đĩa bị sai định dạng — thường do sửa tay hoặc do một lần lưu bị ngắt giữa dòng.",
    fix: [
      "Mở thư mục project để xem file được nêu tên trong phần chi tiết.",
      "Hoặc phục hồi từ lịch sử bản thiết kế (công cụ local giữ 50 bản gần nhất).",
    ],
    related: ["CONTRACT_BROKEN"],
  },
  {
    code: "PROJECT_ID_TAKEN",
    group: "Project",
    why:
      "Tên thư mục sinh ra từ tên project đã có project khác dùng. Mỗi project là một thư mục riêng " +
      "nên tên thư mục không được trùng.",
    fix: ["Dùng tên gợi ý mà giao diện đề xuất.", "Hoặc đổi tên project cho khác đi."],
    related: ["INVALID_SLUG"],
  },
  {
    code: "INVALID_NAME",
    group: "Project",
    why: "Tên project đang để trống hoặc chỉ có khoảng trắng.",
    fix: ["Nhập tên có ít nhất 1 ký tự. Dấu tiếng Việt dùng được bình thường."],
  },
  {
    code: "INVALID_SLUG",
    group: "Project",
    why: "Tên thư mục chỉ nhận chữ thường không dấu, số và gạch nối, dài 3–48 ký tự.",
    fix: ["Dùng gợi ý tự sinh, hoặc tự sửa cho khớp quy tắc trên."],
    related: ["PROJECT_ID_TAKEN"],
  },
  {
    code: "IMPORT_INVALID",
    group: "Project",
    why:
      "File bạn chọn để nhập không đọc được, hoặc thiếu phần bắt buộc. Điểm quan trọng: " +
      "KHÔNG có project nào bị tạo nửa vời — thao tác dừng trước khi ghi bất cứ thứ gì.",
    fix: ["Xem bảng đối chiếu ở bước 2 của trình nhập để biết chỗ hỏng.", "Chọn file khác, hoặc tải báo cáo về để sửa file gốc."],
  },

  /* ── Bản thiết kế ────────────────────────────────────────────────────── */
  {
    code: "CONTRACT_CONFLICT",
    group: "Bản thiết kế",
    why:
      "Bản thiết kế trên đĩa đã được lưu sau lần bạn mở nó — thường vì bạn đang mở app ở hai tab, " +
      "hoặc vừa sửa file bằng công cụ khác. Giao diện không ghi đè im lặng lên thay đổi của người khác.",
    fix: [
      "Bấm So sánh để xem đúng chỗ khác nhau giữa bản của bạn và bản trên đĩa.",
      "Chọn một trong ba: giữ bản của bạn, lấy bản trên đĩa, hoặc lưu bản của bạn thành bản sao.",
    ],
    related: ["IF_MATCH_REQUIRED"],
  },
  {
    code: "CONTRACT_INVALID",
    group: "Bản thiết kế",
    why: "Bản thiết kế có lỗi khiến việc sinh ảnh chắc chắn thất bại (ví dụ trùng mã sheet, ô vượt khỏi lưới, thiếu mô tả).",
    fix: ["Bấm vào từng lỗi ở thanh kiểm tra để nhảy tới đúng chỗ sai.", "Sửa xong thì thanh kiểm tra chuyển xanh và nút Lưu mở lại."],
  },
  {
    code: "CONTRACT_BROKEN",
    group: "Bản thiết kế",
    why: "File bản thiết kế trên đĩa sai định dạng nên không đọc được.",
    fix: ["Mở Lịch sử bản thiết kế và phục hồi bản gần nhất còn tốt.", "Hoặc mở thư mục project để tự sửa file."],
    related: ["PROJECT_BROKEN"],
  },
  {
    code: "IF_MATCH_REQUIRED",
    group: "Bản thiết kế",
    why:
      "Mỗi lần lưu, giao diện phải nói rõ nó đang sửa dựa trên bản nào — đó là cách duy nhất để " +
      "không ghi đè lên thay đổi của tab khác. Lần lưu vừa rồi thiếu thông tin đó.",
    fix: ["Tải lại bản thiết kế rồi lưu lại. Nội dung đang sửa của bạn vẫn còn trong bản nháp tự lưu."],
    related: ["CONTRACT_CONFLICT"],
  },

  /* ── Lượt sinh ảnh ───────────────────────────────────────────────────── */
  {
    code: "RUN_CONFLICT",
    group: "Lượt sinh ảnh",
    why: "Mỗi project chỉ chạy một lượt tại một thời điểm, để hai lượt không cùng ghi vào một file ảnh.",
    fix: ["Xem lượt đang chạy — có thể nó gần xong.", "Hoặc dừng lượt đó rồi bắt đầu lượt của bạn."],
    related: ["RUN_ACTIVE"],
  },
  {
    code: "RUN_ACTIVE",
    group: "Lượt sinh ảnh",
    why: "Thao tác bạn vừa bấm sẽ đổi file mà lượt đang chạy đang dùng, nên bị chặn cho tới khi lượt đó xong.",
    fix: ["Chờ lượt chạy kết thúc, hoặc dừng nó rồi làm lại."],
    related: ["RUN_CONFLICT"],
  },
  {
    code: "RUN_FINISHED",
    group: "Lượt sinh ảnh",
    why: "Bạn bấm Dừng nhưng lượt chạy đã kết thúc trước đó vài giây.",
    fix: ["Tải lại trạng thái để xem kết quả cuối cùng."],
  },
  {
    code: "RUN_NOT_FOUND",
    group: "Lượt sinh ảnh",
    why: "Không tìm thấy lượt chạy này. Bản ghi các lượt chạy cũ bị dọn theo hạn lưu.",
    fix: ["Về danh sách lượt chạy để xem những lượt còn giữ."],
    related: ["LOG_NOT_FOUND"],
  },
  {
    code: "UNKNOWN_JOB",
    group: "Lượt sinh ảnh",
    why:
      "Bạn chọn một số lượt để chạy, nhưng bản thiết kế đã đổi từ lúc màn hình được mở nên những lượt đó " +
      "không còn tồn tại.",
    fix: ["Tải lại rồi chọn lại. Danh sách sau khi tải lại là danh sách đúng."],
    related: ["UNKNOWN_VARIANT"],
  },
  {
    code: "UNKNOWN_VARIANT",
    group: "Lượt sinh ảnh",
    why: "Phong cách được yêu cầu không còn trong bản thiết kế — có thể vừa bị đổi tên hoặc xoá.",
    fix: ["Tải lại màn hình rồi chọn phong cách từ danh sách mới."],
    related: ["UNKNOWN_JOB"],
  },
  {
    code: "CURSOR_GONE",
    group: "Lượt sinh ảnh",
    why:
      "Giao diện đang đọc nhật ký tiếp từ chỗ nó dừng, nhưng phần đó đã bị dọn để nhật ký không phình vô hạn.",
    fix: ["Không cần làm gì: giao diện tự tải lại trạng thái lượt chạy từ đầu."],
    related: ["LOG_NOT_FOUND"],
  },
  {
    code: "LOG_NOT_FOUND",
    group: "Lượt sinh ảnh",
    why: "Nhật ký của lượt này đã bị dọn theo hạn lưu (chỉ 20 lượt gần nhất được giữ đầy đủ).",
    fix: ["Chạy lại lượt đó nếu bạn cần xem nhật ký.", "Ảnh đã sinh ra trước đó vẫn còn, không bị ảnh hưởng."],
    related: ["RUN_NOT_FOUND"],
  },

  /* ── File & ảnh tham khảo ────────────────────────────────────────────── */
  {
    code: "REF_IN_USE",
    group: "File & ảnh tham khảo",
    why: "Ảnh tham khảo này đang được một nhân vật hoặc một sheet dùng. Xoá đi thì những chỗ đó thiếu ảnh.",
    fix: ["Bấm Xem chỗ dùng để kiểm tra danh sách.", "Nếu vẫn muốn xoá: dùng Vẫn xoá — những chỗ dùng nó sẽ cần chọn ảnh khác."],
  },
  {
    code: "REF_NOT_FOUND",
    group: "File & ảnh tham khảo",
    why: "Ảnh tham khảo này không còn trong project — có thể đã bị xoá ở nơi khác, hoặc file bị đổi tên ngoài app.",
    fix: ["Tải lại danh sách ảnh tham khảo.", "Tải lên lại ảnh nếu bạn vẫn cần nó."],
  },
  {
    code: "TOO_LARGE",
    group: "File & ảnh tham khảo",
    why: "File vượt hạn mức: ảnh tham khảo tối đa 20 MB, file nén để nhập tối đa 200 MB.",
    fix: ["Chọn file nhỏ hơn, hoặc giảm kích thước ảnh trước khi tải lên."],
    related: ["BAD_TYPE"],
  },
  {
    code: "BAD_TYPE",
    group: "File & ảnh tham khảo",
    why:
      "Định dạng file không dùng được. Ảnh chỉ nhận PNG, JPG hoặc WebP — và được kiểm bằng nội dung file " +
      "chứ không chỉ bằng phần mở rộng, nên đổi tên file không giúp được.",
    fix: ["Xuất lại ảnh sang PNG rồi tải lên."],
    related: ["TOO_LARGE"],
  },
  {
    code: "PATH_ESCAPE",
    group: "File & ảnh tham khảo",
    why:
      "Đường dẫn được yêu cầu nằm ngoài thư mục project. Công cụ local chỉ phục vụ file bên trong project, " +
      "đây là chặn có chủ đích.",
    fix: ["Tải lại màn hình — link bạn vừa bấm có thể đã cũ."],
  },
  {
    code: "KIT_NOT_CUT",
    group: "File & ảnh tham khảo",
    why: "Chưa có file nào được cắt cho phong cách này, nên chưa có gì để xem trong thư viện.",
    fix: ["Sinh ảnh cho các sheet còn thiếu, rồi cắt.", "Nếu đã có ảnh sinh ra: chỉ cần bấm Cắt."],
  },
  {
    code: "NOT_SUPPORTED",
    group: "File & ảnh tham khảo",
    why: "Hệ điều hành của bạn không hỗ trợ việc mở thư mục từ giao diện.",
    fix: ["Mở thư mục làm việc bằng trình quản lý file như bình thường."],
  },

  /* ── Thùng rác & xác nhận ────────────────────────────────────────────── */
  {
    code: "TRASH_NOT_FOUND",
    group: "Thùng rác & xác nhận",
    why: "Mục này không còn trong Thùng rác — có thể đã được phục hồi ở tab khác, hoặc đã quá 30 ngày.",
    fix: ["Tải lại danh sách Thùng rác."],
  },
  {
    code: "CONFIRM_REQUIRED",
    group: "Thùng rác & xác nhận",
    why:
      "Xoá vĩnh viễn là thao tác không có đường về, nên nó cần một mã 4 số được IN RA cửa sổ Terminal " +
      "đang chạy công cụ local. Mã không bao giờ đi qua trang web, nên chỉ người ngồi trước máy mới xoá được.",
    fix: [
      "Bấm Gửi lại mã, rồi xem cửa sổ Terminal.",
      "Gõ mã vào ô xác nhận trong vòng 60 giây. Mã dùng một lần.",
    ],
    related: ["CONFIRM_INVALID", "CONFIRM_LOCKED"],
  },
  {
    code: "CONFIRM_INVALID",
    group: "Thùng rác & xác nhận",
    why: "Mã vừa gõ không đúng, hoặc mã cũ đã hết hạn 60 giây.",
    fix: ["Xem lại đúng dòng mã mới nhất trong Terminal.", "Sai 3 lần thì bị khoá 60 giây — hãy gõ cẩn thận."],
    related: ["CONFIRM_REQUIRED", "CONFIRM_LOCKED"],
  },
  {
    code: "CONFIRM_LOCKED",
    group: "Thùng rác & xác nhận",
    why: "Đã gõ sai quá nhiều lần nên thao tác bị khoá tạm thời. Đây là chặn chống dò mã.",
    fix: ["Chờ khoảng 60 giây, bấm Gửi lại mã rồi thử lại."],
    related: ["CONFIRM_REQUIRED"],
  },

  /* ── Khác ────────────────────────────────────────────────────────────── */
  {
    code: "RATE_LIMITED",
    group: "Khác",
    why: "Bạn gửi quá nhiều yêu cầu trong thời gian ngắn nên công cụ local tạm hoãn để giữ máy nhẹ.",
    fix: ["Không cần làm gì: giao diện tự thử lại sau vài giây."],
  },
  {
    code: "BAD_REQUEST",
    group: "Khác",
    why: "Công cụ local nhận được dữ liệu không đúng dạng nó mong đợi. Đây gần như luôn là lỗi của giao diện, không phải của bạn.",
    fix: ["Tải lại trang rồi thử lại.", "Nếu vẫn lỗi: copy phần Chi tiết cho lập trình viên và gửi cho người phát triển."],
  },
  {
    code: "METHOD_NOT_ALLOWED",
    group: "Khác",
    why: "Yêu cầu gửi tới đúng địa chỉ nhưng sai cách gọi. Cũng là lỗi phía giao diện.",
    fix: ["Tải lại trang rồi thử lại."],
    related: ["BAD_REQUEST"],
  },
  {
    code: "NOT_FOUND",
    group: "Khác",
    why: "Thứ bạn cần không còn ở địa chỉ đó — có thể đã bị xoá hoặc đổi tên bên ngoài app.",
    fix: ["Tải lại dữ liệu của màn hình.", "Về danh sách project nếu vẫn không thấy."],
  },
];

/** Tra một mục theo mã (chấp nhận cả `contract-conflict` hoặc `CONTRACT_CONFLICT`). */
export function docEntry(code: string | null | undefined): DocEntry | null {
  if (typeof code !== "string" || code.trim() === "") return null;
  const key = code.trim().toUpperCase().replace(/-/g, "_");
  return DOC_ENTRIES.find((e) => e.code === key) ?? null;
}

/** Nhóm → danh sách mục, giữ đúng thứ tự `DOC_GROUPS`. Nhóm rỗng bị bỏ. */
export function docEntriesByGroup(): { group: DocGroup; items: DocEntry[] }[] {
  return DOC_GROUPS.map((group) => ({ group, items: DOC_ENTRIES.filter((e) => e.group === group) })).filter(
    (g) => g.items.length > 0,
  );
}

/**
 * Mã có trong bảng copy của R0 nhưng CHƯA có mục giải thích ở đây.
 * Test dùng hàm này để bắt lỗi "R0 thêm mã mới mà trang trợ giúp không theo".
 */
export function missingDocEntries(): string[] {
  const have = new Set(DOC_ENTRIES.map((e) => e.code));
  return knownCodes().filter((c) => !have.has(c));
}

/** Tìm kiếm không dấu, không phân biệt hoa thường — dùng cho ô tìm ở trang trợ giúp. */
export function searchDocs(query: string): DocEntry[] {
  const q = fold(query);
  if (q === "") return DOC_ENTRIES;
  return DOC_ENTRIES.filter((e) =>
    fold([e.code, e.group, e.why, ...e.fix, ...(e.related ?? [])].join(" ")).includes(q),
  );
}

function fold(s: unknown): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}
