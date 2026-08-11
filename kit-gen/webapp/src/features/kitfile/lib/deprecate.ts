/**
 * features/kitfile/lib/deprecate.ts — nhãn cho các màn ĐÃ RỜI ĐƯỜNG CHÍNH.
 *
 * NGUỒN: FLOW-V3 §4 (bảng "màn phải giết / giấu") · BA-V3 §1.4 hàng "Migration route" ·
 *        FE3-PLAN §0-N8 (KHÔNG xoá file, KHÔNG `git rm`; chỉ đánh dấu + đổi lối vào).
 *
 * Ba màn rời đường chính vẫn **chạy được và giữ deep link**; chúng chỉ không còn là nơi
 * user tới đầu tiên. Khi ai đó mở bằng đường dẫn cũ, phải nói thật là đang ở «Nâng cao»
 * và chỉ đường về — thay vì để họ tưởng đây là màn chính rồi lạc.
 *
 * KHÔNG có JSX ở đây: file này chỉ trả DỮ LIỆU. Màn (chủ: nhánh E) tự dựng `InlineBanner`.
 * ⚠️ Đây là chỗ chữ kỹ thuật ĐƯỢC PHÉP xuất hiện (UX-V3 §0-L3: panel «Nâng cao»).
 */

export type DeprecatedScreen = "overview" | "design" | "runs" | "kit-library" | "subfiles";

export interface DeprecatedNotice {
  /** Tiêu đề dải thông báo. */
  title: string;
  /** 1 câu: đây là gì và vì sao vẫn còn. */
  body: string;
  /** Chữ trên nút quay lại đường chính. */
  back: string;
  /** Ghi chú cho lập trình viên đọc trong mã — KHÔNG hiện ra UI. */
  devNote: string;
}

const NOTICES: Readonly<Record<DeprecatedScreen, DeprecatedNotice>> = {
  overview: {
    title: "Đây là màn Nâng cao",
    body: "Bộ kit của bạn giờ mở thẳng vào chỗ làm việc. Màn này vẫn giữ để xem chi tiết kỹ thuật.",
    back: "Về bộ kit",
    // kg-allow-jargon: `devNote` KHÔNG hiện ra UI (xem khai báo interface) — nó là chú thích
    // đường dẫn mã cho lập trình viên, đúng ngoại lệ §0-L3.
    devNote: "features/project/** — rời đường chính ở FE-3 (FLOW-V3 §4). Không xoá: deep link cũ còn dùng.",
  },
  design: {
    title: "Bản thiết kế · Nâng cao",
    body: "Đây là nơi xem và sửa chi tiết từng tấm, từng món. Sửa ở đây sẽ không hiện ngược lại trong form.",
    back: "Về bộ kit",
    devNote: "features/design/** — trở thành «Nâng cao», mở từ W3 (FE3-PLAN §3-E1).",
  },
  runs: {
    title: "Lịch sử các lần vẽ · Nâng cao",
    body: "Danh sách đầy đủ các lần máy vẽ, kèm nhật ký. Lần đang chạy vẫn hiện ở màn chính.",
    back: "Về bộ kit",
    devNote: "features/runs/RunsScreen — W2 là màn chính; màn này còn cho deep link /runs/:id.",
  },
  "kit-library": {
    title: "Thư viện · Nâng cao",
    body: "Bản đầy đủ có bộ lọc và bảng đối chiếu. Ảnh thành phẩm đã hiện sẵn ở màn chính.",
    back: "Về bộ kit",
    devNote: "features/kit/** — phần lớn đã thành W3; tab ma trận/xuất còn ở đây.",
  },
  subfiles: {
    title: "Cách sắp xếp cũ",
    body: "Giờ mỗi file là một bộ kit riêng, không còn file con bên trong. Nội dung cũ vẫn mở được.",
    back: "Về danh sách bộ kit",
    devNote: "features/docs/components/subfiles/** — IA mới bỏ file-trong-project (BA-V3 §4-#6).",
  },
};

/** Dữ liệu để màn dựng dải thông báo. Mã lạ ⇒ trả `null`, màn KHÔNG vỡ. */
export function deprecatedScreenNotice(screen: DeprecatedScreen | string): DeprecatedNotice | null {
  return Object.hasOwn(NOTICES, screen) ? NOTICES[screen as DeprecatedScreen] : null;
}

/** Chú thích JSDoc chuẩn để dán vào đầu file rời đường chính — một câu chữ cho cả đợt. */
export function deprecatedTag(screen: DeprecatedScreen): string {
  const n = NOTICES[screen];
  return `@deprecated FE-3 (FLOW-V3 §4 / FE3-PLAN §3-E1): ${n.devNote} Không xoá trong đợt này.`;
}

/** Danh sách màn đã rời đường chính — menu «⋯ Nâng cao» đọc từ đây, không tự liệt kê. */
export const DEPRECATED_SCREENS = Object.keys(NOTICES) as DeprecatedScreen[];
