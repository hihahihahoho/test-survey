/**
 * features/kitfile/lib/copy.ts — TỪ ĐIỂN COPY DÙNG CHUNG cho cả đợt FE-3.
 *
 * NGUỒN DUY NHẤT: UX-V3 §5.1 (nút) · §5.2 (tiêu đề màn) · §5.3 (empty-state) · §5.4 (từ cấm)
 *                 · §5.5 (ba câu chống nói dối) · §1.3/§3.2/§3.3/§4.1 (copy từng màn)
 *                 · BA-V3 §6 (bảng khái niệm bị giấu ↔ chữ thay thế).
 *
 * VÌ SAO FILE NÀY TỒN TẠI (FE3-PLAN §6, rủi ro "cao" đầu bảng): bốn nhánh H/W/R/K viết màn song song.
 * Không có một chỗ chứa chữ thì sẽ có bốn bảng copy khác nhau và bốn cách gọi tên cùng một thứ —
 * đúng lỗi "copy generic" của FE-1 §6.
 *
 * BA LUẬT DÙNG FILE NÀY:
 *  1. **Màn KHÔNG tự viết chuỗi trên nút/tiêu đề/empty.** Import từ đây. Thiếu chữ ⇒ thêm vào đây
 *     (chủ: nhánh S) hoặc ghi `NEEDS-fe3-<nhánh>.md`, KHÔNG chế tại chỗ.
 *  2. **Ba câu §5.5 là HẰNG SỐ, không phải template** (FE3-PLAN §3-S1). Xem `TRUTH` bên dưới —
 *     có test so từng ký tự.
 *  3. **Không chữ kỹ thuật.** Danh sách cấm ở `BANNED_WORDS`; chỉ «Nâng cao» và `<details>`
 *     «Chi tiết cho lập trình viên» được phép.
 */

/* ═════════════════ §5.5 — BA CÂU CHỐNG NÓI DỐI (nguyên văn) ═════════════════
 *
 * ⚠️ MÂU THUẪN CÓ THẬT GIỮA HAI TÀI LIỆU — nói ra thay vì lặng lẽ chọn một bên:
 *   · UX-V3 §5.5 + FE3-PLAN §0-N5 bắt dán **nguyên văn**, Q1 sẽ so **từng ký tự**.
 *   · UX-V3 §10.2 lại nói "con số trong wireframe là ví dụ, đừng hardcode" — mà câu 1 chứa
 *     «16 món» và câu 3 chứa «15–25 lượt hỏi».
 * CÁCH XỬ LÝ: giữ NGUYÊN VĂN ba hằng số (để Q1 so được, và để ca 16 món/15–25 lượt dùng thẳng),
 * đồng thời cấp hai hàm dựng câu cho số THẬT lúc chạy. Phần chữ cố định của hàm khớp
 * từng ký tự với hằng số — có test canh. Màn nào biết số thật thì PHẢI dùng hàm.
 */
export const TRUTH = {
  /** §5.5-1 — dán ở panel sửa món (W3), hiện thường trực, không giấu trong tooltip. */
  WHOLE_SHEET_ONLY:
    "Máy vẽ cả tấm một lần, không vẽ lẻ từng món. Sửa món này thì phải vẽ lại cả tấm 16 món.",
  /** §5.5-2 — dán ở chỗ đáng lẽ có thanh so sánh 2 đời ảnh (BA-V3 §2.5: `.history/raw` rỗng ruột). */
  NO_OLD_VERSION: "Chưa có bản cũ để so — từ lần vẽ sau máy mới giữ bản cũ.",
  /** §5.5-3 — dán ở W1 trang 4 và mọi chỗ báo giá. Cấm bỏ chữ «khoảng» và «ước lượng». */
  ESTIMATE_RANGE: "Khoảng 15–25 lượt hỏi (ước lượng, có thể lệch).",
} as const;

/** Câu 1 với số món THẬT của tấm. Phần chữ cố định khớp `TRUTH.WHOLE_SHEET_ONLY` từng ký tự. */
export function wholeSheetOnly(componentCount: number): string {
  const n = Number.isFinite(componentCount) && componentCount > 0 ? Math.floor(componentCount) : 16;
  return `Máy vẽ cả tấm một lần, không vẽ lẻ từng món. Sửa món này thì phải vẽ lại cả tấm ${n} món.`;
}

/** Câu 3 với khoảng lượt THẬT (`estimate` của `#32`). Dấu gạch là EN DASH «–», không phải «-». */
export function estimateRange(min: number, max: number): string {
  const lo = Number.isFinite(min) && min > 0 ? Math.floor(min) : 15;
  // `max < min` là dữ liệu hỏng: kẹp về `lo` («Khoảng 9–9») chứ KHÔNG rơi về 25 —
  // rơi về mặc định sẽ bịa ra một khoảng giá cao hơn số thật. Có test canh ca này.
  const hi = Number.isFinite(max) && max > 0 ? Math.max(Math.floor(max), lo) : Math.max(25, lo);
  return `Khoảng ${lo}–${hi} lượt hỏi (ước lượng, có thể lệch).`;
}

/* ═════════════════ §5.1 — NÚT (dùng đúng chữ này, không biến thể) ═════════════════
 *
 * P-SWEEP·11 — EMOJI ĐÃ RA KHỎI NHÃN NÚT (⚡ ✨ ⧉ 📦 ⋯). Hai lý do, cả hai đo được:
 *  · **Trùng lặp thị giác.** Chỗ dùng thật đã có icon lucide đứng ngay trước chữ —
 *    `ResultActions` render `<Copy/>` rồi mới tới "⧉ Copy sang Figma", tức HAI cái
 *    hình cho một hành động, một cái nét 1.5px đơn sắc và một cái nhiều màu nét dày.
 *  · **Screen reader đọc tên emoji.** Chuỗi này còn đi vào `aria-label`; ở đó "⧉"
 *    được đọc thành tên ký tự Unicode, chen vào giữa câu.
 * Hình vẫn còn ở mọi chỗ nó từng có — nay là icon lucide do component truyền vào.
 */
export const BTN = {
  CREATE_KIT: "Tạo bộ kit mới",
  CREATE_FIRST_KIT: "Tạo bộ kit đầu tiên",
  PICK_WORKFLOW: "Bắt đầu điền form",
  PICK_CANVAS: "Mở bàn làm việc",
  START_GEN: "Bắt đầu vẽ",
  GEN_ON_CANVAS: "Nhờ máy vẽ",
  /** Nút trong popover hộp GEN. */
  GEN_CONFIRM: "Vẽ",
  STOP: "Dừng lại",
  STOP_CONFIRM: "Dừng vẽ",
  DOWNLOAD_KIT: "Tải bộ kit về máy",
  COPY_FIGMA: "Copy sang Figma",
  PACK: "Đóng gói",
  PACK_CONFIRM: "Đóng thành bộ kit",
  DUPLICATE: "Tạo bộ kit từ bộ này",
  DELETE: "Xoá",
  DELETE_CONFIRM: "Cho vào thùng rác",
  RESTORE: "Khôi phục",
  UNDO: "Hoàn tác",
  ADVANCED: "Nâng cao",
  REOPEN_FORM: "Mở lại form",
  NEXT: "Tiếp theo",
  BACK: "Quay lại",
  SKIP: "Bỏ qua",
  PASTE_BRIEF: "Dán brief",
  RETRY: "Thử lại",
  CUT_NOW: "Tách nền ngay",
  SEE_ALL: "Xem tất cả",
  CLEAR_SEARCH: "Xoá tìm kiếm",
  OPEN: "Mở",
  RENAME: "Đổi tên",
  DOWNLOAD_ZIP: "Tải về máy (.zip)",
  REVEAL: "Mở thư mục trên máy",
  TRASH: "Thùng rác",
  KEEP_DRAFT: "Giữ nháp",
  DROP_DRAFT: "Bỏ",
  CANCEL: "Huỷ",
  EXIT: "Thoát",
} as const;

/** «Vẽ lại cả tấm (N món) · ~1 lượt» — §5.1 + §3.3. KHÔNG BAO GIỜ là "Sinh lại ô này". */
export function btnRedrawSheet(componentCount: number): string {
  const n = Number.isFinite(componentCount) && componentCount > 0 ? Math.floor(componentCount) : 0;
  return `Vẽ lại cả tấm (${n} món) · ~1 lượt`;
}

/** «Vẽ lại toàn bộ · ~N lượt» — §5.1. */
export function btnRedrawAll(jobCount: number): string {
  const n = Number.isFinite(jobCount) && jobCount > 0 ? Math.floor(jobCount) : 0;
  return `Vẽ lại toàn bộ · ~${n} lượt`;
}

/* ═════════════════ §5.2 — TIÊU ĐỀ MÀN + serif italic nhấn ĐÚNG MỘT TỪ ═════════════════
 * Công thức FLORA: `lead` chữ thường sans, `accent` bọc `<em>` serif italic (`SERIF` của flora.ts).
 * Màn tự ghép, module này chỉ chốt CHỮ NÀO được nhấn — để 7 màn không nhấn 7 kiểu.
 */
export interface SplitTitle {
  lead: string;
  accent: string;
}

export const TITLE: Record<"H" | "N" | "W2" | "C1_EMPTY", SplitTitle> = {
  /** «Bộ kit *của bạn*» */
  /* W2B-5 · LUẬT PLAYFAIR (`flora.ts` cạnh const SERIF): phần nhấn tối đa MỘT từ.
     TRƯỚC: nhấn "của bạn" — hai từ, và là cụm SỞ HỮU: mắt dừng lại ở chỗ không có
     thông tin. Câu chữ người dùng đọc KHÔNG ĐỔI ("Bộ kit của bạn"), chỉ ranh giới
     `<em>` dịch sang phải một từ. Repo đã có test khoá đúng luật này cho H1 anh em
     (`projects/__tests__/visual-debt-h1.test.tsx` — "nhấn đúng MỘT từ"); nay H1 đang
     CHẠY THẬT trên Home cũng theo cùng luật đó. */
  H: { lead: "Dự án của", accent: "bạn" },
  /** «Bạn muốn làm *kiểu* nào?» — accent nằm GIỮA, xem `TITLE_N_TAIL`. */
  N: { lead: "Bạn muốn làm", accent: "kiểu" },
  /** «Máy đang *vẽ*» */
  W2: { lead: "Máy đang", accent: "vẽ" },
  /** «Bàn còn *trống*» */
  C1_EMPTY: { lead: "Bàn còn", accent: "trống" },
};

/** Phần đuôi sau chữ được nhấn của màn N (§5.2 nhấn chữ giữa câu). */
export const TITLE_N_TAIL = "nào?";

/** Tiêu đề dạng chuỗi phẳng — cho `document.title`, `aria-label`, và test. */
export const TITLE_FLAT = {
  H: "Dự án của bạn",
  N: "Bạn muốn làm kiểu nào?",
  W2: "Máy đang vẽ",
  C2: "Chọn những thứ muốn đưa vào bộ kit",
  /** W1 — bốn trang, §3.1. */
  W1: [
    "Bộ kit này cho việc gì?",
    "Phong cách trông như thế nào?",
    "Bộ kit cần những gì?",
    "Xem lại rồi bắt đầu nhé",
  ] as const,
} as const;

/** W3 và C1 lấy TÊN BỘ KIT làm tiêu đề (§5.2) — không có chuỗi cố định, cố ý. */
export const SUBTITLE = {
  H: "Mỗi dự án lưu yêu cầu, bản thiết kế và hình ảnh đã tạo.",
  N: "Đổi kiểu sau cũng được.",
} as const;

/* ═════════════════ MÀN N — hai thẻ hình thái (§2, FLOW-V3 §0.3) ═════════════════
 * kg-allow-jargon: câu dưới trích chữ CŨ để nói rõ nó bị thay bằng gì — chú thích cho lập trình viên.
 * Thay hẳn `MODE_COPY` của `features/projects/lib/create-mode.ts` (chữ cũ dùng "Quy trình chuẩn"
 * và "free-style" — §5.4 cấm cả hai). File cũ KHÔNG bị xoá (FE3-PLAN §0-N8).
 */
export interface ModeCardCopy {
  title: string;
  body: string;
  /**
   * "Hợp khi: …" — P-SWEEP·8 KHÔNG còn render trên thẻ chọn hình thái (ảnh 06): thẻ
   * đã có một câu mô tả đầy đủ ngay trên nó, và câu này chỉ diễn giải lại câu đó bằng
   * chữ khác. Giữ hằng số vì nó là chữ của UX-V3 §2 và có cổng quét từ cấm đi qua.
   */
  fit: string;
  cta: string;
  /** Nhãn nhỏ phía trên thẻ Home (§1.3). Hình đi kèm là icon lucide, xem `KitCard`. */
  cardLabel: string;
}

export const MODE_CARD: Readonly<Record<"workflow" | "canvas", ModeCardCopy>> = {
  workflow: {
    title: "Điền form, máy làm",
    body: "Trả lời vài câu về phong cách và số lượng. Máy vẽ cả bộ, bạn sửa lại sau.",
    fit: "Hợp khi: đã có brief",
    cta: BTN.PICK_WORKFLOW,
    cardLabel: "Điền form",
  },
  canvas: {
    title: "Tự tay xếp trên bàn",
    body: "Bàn trống, bạn tự gọi máy vẽ từng thứ rồi xếp lại theo ý mình.",
    fit: "Hợp khi: còn đang mò ý",
    cta: BTN.PICK_CANVAS,
    cardLabel: "Bàn làm việc",
  },
};

/* ═════════════════ §5.3 — EMPTY-STATE (tiêu đề · thân · nút) ═════════════════ */
export interface EmptyCopy {
  title: string;
  body: string;
  /** `null` = màn này CỐ Ý không có nút riêng (C1: nút nằm ở thanh nổi). */
  action: string | null;
}

export const EMPTY: Readonly<Record<
  "home" | "w3NotDrawn" | "w3NotCut" | "w3FilterEmpty" | "c1" | "c2" | "trash" | "library",
  EmptyCopy
>> = {
  home: {
    title: "Chưa có bộ kit nào",
    body: "Bắt đầu bằng một bộ kit. Bạn điền form cho máy làm, hoặc tự xếp trên bàn làm việc.",
    action: BTN.CREATE_FIRST_KIT,
  },
  w3NotDrawn: {
    title: "Bộ kit này chưa vẽ gì",
    body: "Bạn đã trả lời form rồi, chỉ còn bấm nút cho máy chạy.",
    action: BTN.START_GEN,
  },
  w3NotCut: {
    title: "Chưa món nào được tách nền",
    body: "Ảnh đã vẽ xong nhưng chưa cắt rời từng món.",
    action: BTN.CUT_NOW,
  },
  w3FilterEmpty: { title: "Không có món nào ở đây", body: "Thử bỏ bớt bộ lọc.", action: BTN.SEE_ALL },
  c1: {
    title: "Bàn còn trống",
    body: "Bấm Nhờ máy vẽ ở thanh dưới để bắt đầu.",
    action: null,
  },
  c2: { title: "Chưa chọn gì", body: "Tick vào thứ bạn muốn đưa vào bộ kit.", action: null },
  trash: { title: "Thùng rác trống", body: "Bộ kit bị xoá sẽ nằm ở đây 30 ngày.", action: null },
  library: {
    title: "Không tìm thấy món nào",
    body: 'Thử từ khoá khác, ví dụ "nút", "khung", "huy hiệu".',
    action: BTN.CLEAR_SEARCH,
  },
};

/** Dòng gợi ý thứ ba của thẻ empty canvas — ẩn khi khung cao < 520px (UX-V3 §7.3). */
export const C1_EMPTY_HINT = "hoặc kéo ảnh tham khảo thả vào bàn";

/* ═════════════════ CÂU DÙNG LẠI NHIỀU MÀN ═════════════════ */
export const MSG = {
  /** Ca AGENT CHƯA CHẠY — khối dùng chung của §6, đặt DƯỚI header, không overlay chặn màn. */
  AGENT_OFF_TITLE: "Công cụ trên máy chưa chạy",
  AGENT_OFF_BODY: "Mở Terminal và chạy lệnh này, rồi bấm Thử lại.",
  AGENT_OFF_CMD: "npm run agent",
  AGENT_OFF_CACHED: "Danh sách đang xem là bản lưu lần trước.",

  /** Xoá — §1.4. FE KHÔNG tự gọi huỷ lượt vẽ (bài học C-01); `#11` tự lo. */
  DELETE_BODY: "Bộ kit và toàn bộ ảnh đã vẽ sẽ vào thùng rác. Tự dọn sau 30 ngày.",
  DELETE_WHILE_RUNNING: "Bộ này đang vẽ dở. Xoá sẽ dừng luôn việc đang vẽ.",
  DELETED_TOAST: "Đã cho vào thùng rác",
  UNDO_FAILED:
    "Không hoàn tác được — đã có bộ kit khác trùng chỗ. Bộ cũ vẫn nằm trong thùng rác, vào đó khôi phục với tên khác.",
  TRASH_NOTE: "Xoá vào đây sẽ tự dọn sau 30 ngày.",
  DUPLICATED_TOAST: "Đã chép sang bộ mới: bản thiết kế và ảnh mẫu. Ảnh đã vẽ thì không chép.",
  DOWNLOAD_BLOCKED_BY_RUN: "Đang vẽ dở nên chưa tải được. Chờ vẽ xong hoặc bấm Dừng.",

  /** W2 — hai pha, §3.2. Cấm hiện «Hoàn thành» khi mới xong pha 1. */
  PHASE_DRAW: "Bước 1/2 · Vẽ",
  PHASE_CUT: "Bước 2/2 · Đang tách nền…",
  PHASE_CUT_BODY: "Vẽ xong rồi, máy đang cắt từng món ra khỏi nền.",
  QUEUEING: "Đang xếp hàng…",
  STREAM_LOST: "Mất kết nối với công cụ trên máy — vẫn đang theo dõi bằng cách hỏi lại mỗi 2 giây.",
  AGENT_STOPPED_MIDRUN: "Công cụ trên máy đã dừng. Ảnh đã vẽ xong vẫn còn.",
  STOP_CONFIRM_BODY: "Những tấm đã vẽ xong vẫn giữ. Tấm đang vẽ dở sẽ bỏ.",
  DONE_TOAST: "Vẽ xong bộ kit",

  /** W3 — §3.3. */
  CUTTING_NOW: "Vẽ xong rồi, đang tách nền…",
  STALE_GROUP: "Bạn vừa sửa mô tả, ảnh đang là bản cũ.",
  REOPEN_FORM_TIP:
    "Mở lại form sẽ dùng câu trả lời cũ của bạn. Những chỗ bạn sửa tay trong Nâng cao sẽ không hiện trong form.",

  /** C1 — §4.1. */
  DRAFT_LOCAL: "Bàn làm việc đang lưu trong trình duyệt máy này. Ảnh đã vẽ thì nằm trong thư mục bộ kit.",
  DRAFT_BADGE: "bản nháp trên máy này",
  SAVE_IDLE: "chưa có thay đổi",
  SAVE_BUSY: "đang lưu…",
  SAVE_DONE: "đã lưu trên máy",
  COPY_OK: "Đã copy — dán vào Figma bằng ⌘V",
  COPY_FAIL: "Trình duyệt không cho copy. Bạn tải ảnh về rồi kéo vào Figma nhé.",
  /** Nhãn BẮT BUỘC trên mọi object do hộp GEN mock sinh ra (FE3-PLAN §4). */
  GEN_MOCK_BADGE: "bản xem trước — chưa gọi máy vẽ",
  GEN_GROUP_NOTE:
    "Máy vẽ cả nhóm trong một lần. Chọn 1 món hay 9 món cũng tốn ~1 lượt — chọn nhiều một lượt sẽ lợi hơn.",
  GEN_NEED_CHAR_REF:
    "Cần một ảnh nhân vật trước. Kéo ảnh vào bàn rồi đánh dấu «đây là nhân vật».",

  /** C2 — §4.2. FE tuyệt đối không tự huỷ lượt vẽ (C-01). */
  PACK_WHILE_RUNNING:
    "Có 1 tấm đang vẽ. Tấm đó vẫn chạy tiếp; sửa lúc này sẽ khiến kết quả bị đánh dấu «cần vẽ lại».",
  PACK_NOTE_LOCKED: "Ghi chú chỉ để trên bàn, không vào bộ kit.",

  /** W1 — §3.1. */
  BRIEF_DIALOG: "Dán nguyên văn brief của khách vào đây, máy đọc và điền hộ những chỗ đoán được.",
  BRIEF_LOW_CONFIDENCE: "Trong brief chưa rõ chỗ này — bạn chọn giúp.",
  STYLE_PHRASE_NOTE:
    "Đây là bản dịch tự động từ các thanh trượt ở trên. Sửa tay được, sửa xong máy không đổi lại.",
  LEAVE_FORM: "Giữ lại bản nháp này?",
  NO_COMPONENT_PICKED: "Chưa chọn món nào — bộ kit sẽ chỉ có ảnh nền.",

  /** Nhãn panel kỹ thuật — CHỖ DUY NHẤT được phép chứa mã lỗi/chuỗi kỹ thuật. */
  DEV_DETAILS: "Chi tiết cho lập trình viên",
} as const;

/** «Đã điền hộ N chỗ. M chỗ máy không chắc đã để trống — bạn xem lại các ô có dấu ⚠.» (§3.1) */
export function briefFilled(filled: number, unsure: number): string {
  return `Đã điền hộ ${filled} chỗ. ${unsure} chỗ máy không chắc đã để trống — bạn xem lại các ô có dấu ⚠.`;
}

/* ═════════════════ §5.4 — TỪ CẤM ═════════════════
 * Chỉ được xuất hiện trong «Nâng cao» (`features/design/**`) và khối `<details>` §MSG.DEV_DETAILS.
 * Dùng cho test canh của S1 (`banned-words.test.ts`) — xem báo cáo S1 §4 để biết phạm vi thật sự đo được.
 */
export const BANNED_WORDS: readonly string[] = [
  "contract", "variant", "sheet", "job", "run", "slug", "project", "doc", "sub-file",
  "workflow", "canvas", "frame", "template", "quota", "stale", "element",
  "grid", "cols", "rows", "skeleton", "shape", "chroma-key", "workspace", "mode",
  // kg-allow-jargon: ba cụm dưới đây là CHÍNH DANH SÁCH CẤM, không phải chữ hiện ra UI.
  // Bộ quét đọc mảng này rồi tự bắt chính nó — miễn ở đây, không nới lỏng cổng.
  "quy trình chuẩn", "free-style", "tối ưu hoá quy trình",
] as const;
